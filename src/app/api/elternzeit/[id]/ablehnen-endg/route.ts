/**
 * API: /api/elternzeit/[id]/ablehnen-endg
 *
 * POST – Endgueltige Ablehnung durch HR.
 *        Voraussetzung: ANTRAG_ENDG_EINGEREICHT.
 *        Setzt Status auf ABGELEHNT (Endzustand).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { HR_EDIT_ROLES, canAccessProcess } from "@/lib/permissions";
import { ablehnenEndgSchema } from "@/lib/validations/elternzeit";
import { triggerWebhooks } from "@/lib/webhooks";
import { syncElternzeitFristen } from "@/lib/elternzeit-fristen";

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
    const parsed = ablehnenEndgSchema.safeParse(body);
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
        displayId: true,
        status: true,
        organizationId: true,
        employeeEmail: true,
        employeeFirstName: true,
        employeeLastName: true,
      },
    });

    if (!ez) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (!(await canAccessProcess(session, ez.organizationId))) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (ez.status !== "ANTRAG_ENDG_EINGEREICHT") {
      return NextResponse.json(
        {
          error:
            "Endgueltige Ablehnung nur moeglich, wenn der endgueltige Antrag eingereicht wurde",
        },
        { status: 409 },
      );
    }

    const updated = await prisma.elternzeitProzess.update({
      where: { id },
      data: {
        status: "ABGELEHNT",
        ablehnungAm: new Date(),
        ablehnungGrund: parsed.data.ablehnungGrund,
      },
    });

    await prisma.auditLog.create({
      data: {
        elternzeitId: id,
        userId: session.userId,
        processType: "ELTERNZEIT",
        action: "ENDG_ABGELEHNT",
        details: { ablehnungGrund: parsed.data.ablehnungGrund },
      },
    });

    await syncElternzeitFristen(id);

    triggerWebhooks("elternzeit-endg-abgelehnt", {
      elternzeitId: id,
      displayId: ez.displayId,
      employeeEmail: ez.employeeEmail,
      employeeName: `${ez.employeeFirstName} ${ez.employeeLastName}`,
      ablehnungGrund: parsed.data.ablehnungGrund,
    }).catch((err) =>
      console.error(
        "[elternzeit-endg-abgelehnt] Webhook-Fehler:",
        err instanceof Error ? err.message : err,
      ),
    );

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("[API] ablehnen-endg POST fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
