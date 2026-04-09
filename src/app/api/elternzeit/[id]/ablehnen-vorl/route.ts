/**
 * API: /api/elternzeit/[id]/ablehnen-vorl
 *
 * POST – Vorlaeufigen Antrag ablehnen mit Begruendung.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { HR_EDIT_ROLES, canAccessProcess } from "@/lib/permissions";
import { triggerWebhooks } from "@/lib/webhooks";
import { syncElternzeitFristen } from "@/lib/elternzeit-fristen";

const ablehnenSchema = z.object({
  ablehnungGrund: z.string().min(10).max(2000),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!HR_EDIT_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = ablehnenSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    const ez = await prisma.elternzeitProzess.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        displayId: true,
        organizationId: true,
        employeeEmail: true,
      },
    });
    if (!ez) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    // IDOR-Schutz: Mandant-Scope pruefen
    if (!(await canAccessProcess(session, ez.organizationId))) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (ez.status !== "ANTRAG_VORL_EINGEREICHT") {
      return NextResponse.json(
        { error: "Ablehnung nur nach Antragseingang moeglich" },
        { status: 409 },
      );
    }

    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      null;

    const updated = await prisma.elternzeitProzess.update({
      where: { id },
      data: {
        status: "VORLAEUFIG_ABGELEHNT",
        ablehnungAm: new Date(),
        ablehnungGrund: parsed.data.ablehnungGrund,
      },
    });

    await prisma.auditLog.create({
      data: {
        elternzeitId: id,
        userId: session.userId,
        processType: "ELTERNZEIT",
        action: "VORL_ABGELEHNT",
        details: { grund: parsed.data.ablehnungGrund },
        ipAddress,
      },
    });

    await syncElternzeitFristen(id).catch((err) =>
      console.error(
        `[syncElternzeitFristen] Fehler nach ablehnen-vorl ${id}:`,
        err instanceof Error ? err.message : err,
      ),
    );

    triggerWebhooks("elternzeit-vorl-abgelehnt", {
      elternzeitId: id,
      displayId: ez.displayId,
      employeeEmail: ez.employeeEmail,
      ablehnungsgrund: parsed.data.ablehnungGrund,
    }).catch((err) =>
      console.error(
        "[elternzeit-vorl-abgelehnt] Webhook-Fehler:",
        err instanceof Error ? err.message : err,
      ),
    );

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("[API] ablehnen-vorl POST fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
