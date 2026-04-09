/**
 * API: /api/elternzeit/[id]/br-tracking
 *
 * PATCH – BR Detmold-Tracking-Felder updaten:
 *         brSchreibenVersandtAm, brAktenzeichen, brGenehmigungEingegAm.
 *         Loest Fristen-Sync aus (z.B. BR_GENEHMIGUNG-Frist starten/erledigen).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { HR_EDIT_ROLES, canAccessProcess } from "@/lib/permissions";
import { syncElternzeitFristen } from "@/lib/elternzeit-fristen";
import { triggerWebhooks } from "@/lib/webhooks";

const trackingSchema = z
  .object({
    brSchreibenVersandtAm: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}/, "Datum YYYY-MM-DD")
      .nullable()
      .optional(),
    brAktenzeichen: z.string().max(100).nullable().optional(),
    brGenehmigungEingegAm: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}/, "Datum YYYY-MM-DD")
      .nullable()
      .optional(),
  })
  .refine((d) => Object.keys(d).length > 0, "Mindestens ein Feld erforderlich");

export async function PATCH(
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

    // IDOR-Schutz: Mandant-Scope pruefen
    const existing = await prisma.elternzeitProzess.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (!(await canAccessProcess(session, existing.organizationId))) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = trackingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.brSchreibenVersandtAm !== undefined) {
      data.brSchreibenVersandtAm = parsed.data.brSchreibenVersandtAm
        ? new Date(parsed.data.brSchreibenVersandtAm)
        : null;
    }
    if (parsed.data.brAktenzeichen !== undefined) {
      data.brAktenzeichen = parsed.data.brAktenzeichen?.trim() || null;
    }
    if (parsed.data.brGenehmigungEingegAm !== undefined) {
      data.brGenehmigungEingegAm = parsed.data.brGenehmigungEingegAm
        ? new Date(parsed.data.brGenehmigungEingegAm)
        : null;
    }

    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      null;

    const updated = await prisma.elternzeitProzess.update({
      where: { id },
      data,
    });

    await prisma.auditLog.create({
      data: {
        elternzeitId: id,
        userId: session.userId,
        processType: "ELTERNZEIT",
        action: "BR_TRACKING_UPDATED",
        details: { fields: Object.keys(data) },
        ipAddress,
      },
    });

    await syncElternzeitFristen(id).catch((err) =>
      console.error(
        `[syncElternzeitFristen] Fehler nach br-tracking ${id}:`,
        err instanceof Error ? err.message : err,
      ),
    );

    if (parsed.data.brGenehmigungEingegAm) {
      triggerWebhooks("elternzeit-br-genehmigung-eingegangen", {
        elternzeitId: id,
        displayId: updated.displayId,
        eingegangenAm: parsed.data.brGenehmigungEingegAm,
        aktenzeichen: parsed.data.brAktenzeichen ?? updated.brAktenzeichen,
      }).catch((err) =>
        console.error(
          "[elternzeit-br-genehmigung-eingegangen] Webhook-Fehler:",
          err instanceof Error ? err.message : err,
        ),
      );
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("[API] br-tracking PATCH fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
