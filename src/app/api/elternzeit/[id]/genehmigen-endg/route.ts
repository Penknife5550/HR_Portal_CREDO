/**
 * API: /api/elternzeit/[id]/genehmigen-endg
 *
 * POST – Endgueltige Genehmigung durch HR.
 *        Voraussetzung: ANTRAG_ENDG_EINGEREICHT (= Mitarbeiter hat
 *        Geburtsurkunde + endgueltige Daten via Magic Link Token 2 abgesendet).
 *        Setzt Status auf GENEHMIGT.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { HR_EDIT_ROLES, canAccessProcess } from "@/lib/permissions";
import { genehmigenEndgSchema } from "@/lib/validations/elternzeit";
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
    const body = await request.json().catch(() => ({}));
    const parsed = genehmigenEndgSchema.safeParse(body);
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
            "Endgueltige Genehmigung nur moeglich, wenn der endgueltige Antrag eingereicht wurde",
        },
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
        status: "GENEHMIGT",
        genehmigungAm: new Date(),
        genehmigungVon: parsed.data.genehmigungVon,
      },
    });

    await prisma.auditLog.create({
      data: {
        elternzeitId: id,
        userId: session.userId,
        processType: "ELTERNZEIT",
        action: "ENDG_GENEHMIGT",
        details: { genehmigungVon: parsed.data.genehmigungVon },
        ipAddress,
      },
    });

    await syncElternzeitFristen(id).catch((err) =>
      console.error(
        `[syncElternzeitFristen] Fehler nach genehmigen-endg ${id}:`,
        err instanceof Error ? err.message : err,
      ),
    );

    triggerWebhooks("elternzeit-endg-genehmigt", {
      elternzeitId: id,
      displayId: ez.displayId,
      employeeEmail: ez.employeeEmail,
      employeeName: `${ez.employeeFirstName} ${ez.employeeLastName}`,
      genehmigtVon: parsed.data.genehmigungVon,
    }).catch((err) =>
      console.error(
        "[elternzeit-endg-genehmigt] Webhook-Fehler:",
        err instanceof Error ? err.message : err,
      ),
    );

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("[API] genehmigen-endg POST fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
