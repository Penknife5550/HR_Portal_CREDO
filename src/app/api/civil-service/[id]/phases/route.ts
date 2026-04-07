/**
 * API: /api/civil-service/:id/phases
 *
 * GET   – Alle Phasen eines Verbeamtungsvorgangs abrufen
 * PATCH – Einzelne Phase aktualisieren
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { updatePhaseSchema } from "@/lib/validations/civil-service";
import { triggerWebhooks } from "@/lib/webhooks";
import { formatEmployeeName } from "@/lib/format";
import { CivilServicePhaseStatus } from "@prisma/client";

// =============================================
// GET /api/civil-service/:id/phases
// =============================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    const { id } = await params;

    // Vorgang pruefen
    const process = await prisma.civilServiceProcess.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!process) {
      return NextResponse.json(
        { error: "Vorgang nicht gefunden" },
        { status: 404 }
      );
    }

    const phases = await prisma.civilServicePhase.findMany({
      where: { processId: id },
      orderBy: { orderIndex: "asc" },
    });

    return NextResponse.json(phases);
  } catch (error) {
    console.error("Fehler beim Laden der Phasen:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// PATCH /api/civil-service/:id/phases – Phase aktualisieren
// =============================================
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    // Rollencheck: nur HR-Rollen
    const hrRoles = ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER"];
    if (!hrRoles.includes(session.role)) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = updatePhaseSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const { phaseKey, status, blockedReason } = parsed.data;

    // Vorgang pruefen (mit Feldern fuer Webhook-Payload)
    const process = await prisma.civilServiceProcess.findUnique({
      where: { id },
      select: {
        id: true,
        displayId: true,
        employeeFirstName: true,
        employeeLastName: true,
        organization: { select: { name: true, mandantNumber: true } },
      },
    });
    if (!process) {
      return NextResponse.json(
        { error: "Vorgang nicht gefunden" },
        { status: 404 }
      );
    }

    // Phase finden
    const phase = await prisma.civilServicePhase.findUnique({
      where: { processId_phaseKey: { processId: id, phaseKey } },
    });
    if (!phase) {
      return NextResponse.json(
        { error: `Phase "${phaseKey}" nicht gefunden` },
        { status: 404 }
      );
    }

    // Idempotenz: war die Phase bereits abgeschlossen?
    // Wenn ja, NICHT ueberschreiben + KEINEN Webhook nochmal feuern.
    const wasAlreadyCompleted =
      phase.status === CivilServicePhaseStatus.COMPLETED;

    // Update-Daten
    const updateData: Record<string, unknown> = { status };
    if (status === CivilServicePhaseStatus.IN_PROGRESS && !phase.startedAt) {
      updateData.startedAt = new Date();
    }
    // completedAt nur setzen wenn es noch NICHT gesetzt war (Idempotenz)
    if (status === CivilServicePhaseStatus.COMPLETED && !phase.completedAt) {
      updateData.completedAt = new Date();
    }
    if (status === CivilServicePhaseStatus.BLOCKED) {
      updateData.blockedReason = blockedReason || null;
    } else {
      updateData.blockedReason = null;
    }

    const updated = await prisma.civilServicePhase.update({
      where: { id: phase.id },
      data: updateData,
    });

    // Audit-Log
    await prisma.auditLog.create({
      data: {
        civilServiceId: id,
        userId: session.userId,
        processType: "CIVIL_SERVICE",
        action: "PHASE_UPDATED",
        details: {
          phaseKey,
          statusFrom: phase.status,
          statusTo: status,
          blockedReason: blockedReason || null,
        } as Record<string, string | null>,
      },
    });

    // Webhook nur bei Phasen-Abschluss UND nur beim **ersten** Abschluss
    // (Idempotenz: ein wiederholtes PATCH mit COMPLETED feuert nicht erneut).
    // Fire-and-forget: triggerWebhooks wirft nie, blockiert Response nicht.
    if (
      status === CivilServicePhaseStatus.COMPLETED &&
      !wasAlreadyCompleted &&
      updated.completedAt
    ) {
      triggerWebhooks("psi-phase-completed", {
        civilServiceId: id,
        displayId: process.displayId,
        employeeName: formatEmployeeName(process),
        organization: process.organization.name,
        mandantNumber: process.organization.mandantNumber,
        phaseKey: phase.phaseKey,
        phaseName: phase.phaseName,
        completedAt: updated.completedAt.toISOString(),
      }).catch((err) =>
        console.error("[psi-phase-completed] Webhook-Fehler:", err instanceof Error ? err.message : err)
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Fehler beim Aktualisieren der Phase:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
