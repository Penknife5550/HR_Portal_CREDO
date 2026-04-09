/**
 * API: /api/elternzeit/[id]/genehmigen-vorl
 *
 * POST – Vorlaeufige Genehmigung durch HR.
 *        In Phase 1: HR genehmigt selbst (Phase 2 → Einrichtungsleiter via Magic Link).
 *        Setzt Status auf VORLAEUFIG_GENEHMIGT.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { HR_EDIT_ROLES, canAccessProcess } from "@/lib/permissions";
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
    // IDOR-Schutz: Mandant-Scope pruefen
    if (!(await canAccessProcess(session, ez.organizationId))) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (ez.status !== "ANTRAG_VORL_EINGEREICHT") {
      return NextResponse.json(
        {
          error:
            "Genehmigung nur moeglich wenn der vorlaeufige Antrag eingereicht wurde",
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
        status: "VORLAEUFIG_GENEHMIGT",
        genehmigungAm: new Date(),
        genehmigungVon: `${session.firstName} ${session.lastName}`,
      },
    });

    await prisma.auditLog.create({
      data: {
        elternzeitId: id,
        userId: session.userId,
        processType: "ELTERNZEIT",
        action: "VORL_GENEHMIGT",
        details: { genehmigungVon: `${session.firstName} ${session.lastName}` },
        ipAddress,
      },
    });

    await syncElternzeitFristen(id).catch((err) =>
      console.error(
        `[syncElternzeitFristen] Fehler nach genehmigen-vorl ${id}:`,
        err instanceof Error ? err.message : err,
      ),
    );

    triggerWebhooks("elternzeit-vorl-genehmigt", {
      elternzeitId: id,
      displayId: ez.displayId,
      employeeEmail: ez.employeeEmail,
      employeeName: `${ez.employeeFirstName} ${ez.employeeLastName}`,
      genehmigtVon: `${session.firstName} ${session.lastName}`,
    }).catch((err) =>
      console.error(
        "[elternzeit-vorl-genehmigt] Webhook-Fehler:",
        err instanceof Error ? err.message : err,
      ),
    );

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("[API] genehmigen-vorl POST fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
