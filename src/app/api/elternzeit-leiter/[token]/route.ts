/**
 * API: /api/elternzeit-leiter/[token]
 *
 * GET  – Public: Token validieren + Vorgangsdaten zur Anzeige laden.
 * POST – Public: Genehmigung oder Ablehnung der Einrichtungsleitung absenden.
 *        Single-Use Schutz via leiterTokenEndgUsedAt.
 *
 * KEINE Authentifizierung — Magic-Link-basiert.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { triggerWebhooks } from "@/lib/webhooks";
import { hashToken } from "@/lib/token-hash";

const submitSchema = z.object({
  entscheidung: z.enum(["GENEHMIGT", "ABGELEHNT"]),
  ablehnungGrund: z.string().max(2000).optional().nullable(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const tokenHash = hashToken(token);

    const ez = await prisma.elternzeitProzess.findUnique({
      where: { leiterTokenEndg: tokenHash },
      include: {
        organization: { select: { name: true } },
        abschnitte: { orderBy: { abschnittNr: "asc" } },
      },
    });

    if (!ez) {
      return NextResponse.json(
        { error: "Token ungültig oder abgelaufen" },
        { status: 404 },
      );
    }
    if (ez.leiterTokenEndgExpiry && new Date() > ez.leiterTokenEndgExpiry) {
      return NextResponse.json({ error: "Token ist abgelaufen" }, { status: 403 });
    }
    if (ez.leiterTokenEndgUsedAt) {
      return NextResponse.json(
        { error: "Diese Genehmigung wurde bereits abgegeben" },
        { status: 410 },
      );
    }

    return NextResponse.json({
      data: {
        elternzeitId: ez.id,
        displayId: ez.displayId,
        employeeName: `${ez.employeeFirstName} ${ez.employeeLastName}`,
        organizationName: ez.organization.name,
        kindNummer: ez.kindNummer,
        geschlecht: ez.geschlecht,
        einrichtungsleiterName: ez.einrichtungsleiterName,
        abschnitte: ez.abschnitte.map((a) => ({
          abschnittNr: a.abschnittNr,
          von: a.von.toISOString().slice(0, 10),
          bis: a.bis.toISOString().slice(0, 10),
          uebertragung3bis8: a.uebertragung3bis8,
          teilzeit: a.teilzeit,
          teilzeitStunden: a.teilzeitStunden ? Number(a.teilzeitStunden) : null,
        })),
      },
    });
  } catch (error) {
    console.error("[API] elternzeit-leiter GET fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const tokenHash = hashToken(token);
    const ez = await prisma.elternzeitProzess.findUnique({
      where: { leiterTokenEndg: tokenHash },
    });
    if (!ez) {
      return NextResponse.json({ error: "Token ungültig" }, { status: 404 });
    }
    if (ez.leiterTokenEndgExpiry && new Date() > ez.leiterTokenEndgExpiry) {
      return NextResponse.json({ error: "Token abgelaufen" }, { status: 403 });
    }
    if (ez.leiterTokenEndgUsedAt) {
      return NextResponse.json(
        { error: "Genehmigung wurde bereits abgegeben" },
        { status: 410 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    if (parsed.data.entscheidung === "ABGELEHNT" && !parsed.data.ablehnungGrund) {
      return NextResponse.json(
        { error: "Ablehnungsgrund erforderlich" },
        { status: 400 },
      );
    }

    // Atomarer Single-Use-Schutz: updateMany mit count===1 verhindert Race
    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      null;

    const txResult = await prisma.$transaction(async (tx) => {
      const result = await tx.elternzeitProzess.updateMany({
        where: {
          id: ez.id,
          leiterTokenEndg: tokenHash,
          leiterTokenEndgUsedAt: null,
          // Defense in depth: Expiry im atomaren Update pruefen
          leiterTokenEndgExpiry: { gt: new Date() },
        },
        data: {
          leiterTokenEndgUsedAt: new Date(),
          leiterGenehmigungAm:
            parsed.data.entscheidung === "GENEHMIGT" ? new Date() : null,
          leiterAblehnungGrund:
            parsed.data.entscheidung === "ABGELEHNT"
              ? parsed.data.ablehnungGrund || null
              : null,
        },
      });

      if (result.count === 0) return { status: "ALREADY_USED" as const };

      await tx.auditLog.create({
        data: {
          elternzeitId: ez.id,
          processType: "ELTERNZEIT",
          // Public-Magic-Link-Entscheidung des Einrichtungsleiters
          action:
            parsed.data.entscheidung === "GENEHMIGT"
              ? "LEITER_GENEHMIGT_VIA_MAGIC_LINK"
              : "LEITER_ABGELEHNT_VIA_MAGIC_LINK",
          details: {
            ablehnungGrund: parsed.data.ablehnungGrund || null,
            tokenHash,
          },
          ipAddress,
        },
      });

      return { status: "OK" as const };
    });

    if (txResult.status === "ALREADY_USED") {
      return NextResponse.json(
        { error: "Genehmigung wurde bereits abgegeben" },
        { status: 410 },
      );
    }

    triggerWebhooks(
      parsed.data.entscheidung === "GENEHMIGT"
        ? "elternzeit-leiter-genehmigt"
        : "elternzeit-leiter-abgelehnt",
      {
        elternzeitId: ez.id,
        displayId: ez.displayId,
        employeeName: `${ez.employeeFirstName} ${ez.employeeLastName}`,
        leiterName: ez.einrichtungsleiterName,
        ablehnungGrund: parsed.data.ablehnungGrund || null,
      },
    ).catch((err) =>
      console.error(
        "[elternzeit-leiter] Webhook-Fehler:",
        err instanceof Error ? err.message : err,
      ),
    );

    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    console.error("[API] elternzeit-leiter POST fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
