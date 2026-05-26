/**
 * API: /api/civil-service/:id/board-decision
 *
 * POST – Beiratsentscheidung erfassen
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { createBoardDecisionSchema } from "@/lib/validations/civil-service";
import { triggerWebhooks } from "@/lib/webhooks";
import { formatEmployeeName } from "@/lib/format";
import { CivilServiceStatus, type Prisma } from "@prisma/client";

// =============================================
// POST /api/civil-service/:id/board-decision
// =============================================
export async function POST(
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
    const parsed = createBoardDecisionSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const { decisionType, result, decisionDate, notes } = parsed.data;

    // Vorgang pruefen (nur die für Status-Check + Webhook-Payload benoetigten Felder)
    const process = await prisma.civilServiceProcess.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        displayId: true,
        employeeEmail: true,
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

    // Validierung: Vorgang muss in passendem Status sein
    if (decisionType === "PROBE" && process.status !== "BOARD_PENDING") {
      return NextResponse.json(
        {
          error:
            "Beiratsentscheidung (Probe) nur im Status 'BOARD_PENDING' moeglich",
        },
        { status: 400 }
      );
    }
    if (decisionType === "LIFETIME" && process.status !== "LIFETIME_PENDING") {
      return NextResponse.json(
        {
          error:
            "Beiratsentscheidung (Lebenszeit) nur im Status 'LIFETIME_PENDING' moeglich",
        },
        { status: 400 }
      );
    }

    // Status-Aenderung und completedAt VOR der Transaktion ableiten —
    // beide haengen nicht von DB-State ab, also keine Race-Condition.
    let newStatus: CivilServiceStatus | null = null;
    if (result === "POSITIVE") {
      newStatus =
        decisionType === "PROBE"
          ? CivilServiceStatus.ADMINISTRATION
          : CivilServiceStatus.COMPLETED;
    } else if (result === "NEGATIVE") {
      newStatus = CivilServiceStatus.REJECTED;
    } else if (result === "POSTPONED") {
      newStatus = CivilServiceStatus.BOARD_POSTPONED;
    }
    const isLifetimeCompleted = newStatus === CivilServiceStatus.COMPLETED;
    const completedAt = isLifetimeCompleted ? new Date() : null;

    // Transaktion: Entscheidung + Status-Aenderung
    const boardDecision = await prisma.$transaction(async (tx) => {
      // Beiratsentscheidung anlegen
      const decision = await tx.civilServiceBoardDecision.create({
        data: {
          processId: id,
          decisionType,
          result,
          decisionDate: new Date(decisionDate),
          notes: notes || null,
        },
      });

      if (newStatus) {
        const updateData: Prisma.CivilServiceProcessUpdateInput = {
          status: newStatus,
        };
        if (completedAt) {
          updateData.completedAt = completedAt;
        }
        await tx.civilServiceProcess.update({
          where: { id },
          data: updateData,
        });
      }

      // Audit-Log
      await tx.auditLog.create({
        data: {
          civilServiceId: id,
          userId: session.userId,
          processType: "CIVIL_SERVICE",
          action: "BOARD_DECISION_RECORDED",
          details: {
            decisionType,
            result,
            decisionDate,
            notes: notes || null,
            statusFrom: process.status,
            statusTo: newStatus,
          } as Record<string, string | null>,
        },
      });

      return decision;
    });

    // Webhook fire-and-forget — nur bei finaler LIFETIME-Verbeamtung.
    // triggerWebhooks wirft nie, blockiert Response nicht.
    if (isLifetimeCompleted && completedAt) {
      triggerWebhooks("psi-completed", {
        civilServiceId: id,
        displayId: process.displayId,
        employeeEmail: process.employeeEmail,
        employeeName: formatEmployeeName(process),
        organization: process.organization.name,
        mandantNumber: process.organization.mandantNumber,
        decisionType,
        decisionDate,
        completedAt: completedAt.toISOString(),
      }).catch((err) =>
        console.error("[psi-completed] Webhook-Fehler:", err instanceof Error ? err.message : err)
      );
    }

    return NextResponse.json(boardDecision, { status: 201 });
  } catch (error) {
    console.error("Fehler beim Erfassen der Beiratsentscheidung:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
