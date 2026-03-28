/**
 * API: /api/civil-service/:id/board-decision
 *
 * POST – Beiratsentscheidung erfassen
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { createBoardDecisionSchema } from "@/lib/validations/civil-service";

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

    // Vorgang pruefen
    const process = await prisma.civilServiceProcess.findUnique({
      where: { id },
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

      // Status-Aenderung basierend auf Ergebnis
      let newStatus: string | null = null;

      if (result === "POSITIVE") {
        if (decisionType === "PROBE") {
          newStatus = "ADMINISTRATION";
        } else {
          // LIFETIME → COMPLETED
          newStatus = "COMPLETED";
        }
      } else if (result === "NEGATIVE") {
        newStatus = "REJECTED";
      } else if (result === "POSTPONED") {
        newStatus = "BOARD_POSTPONED";
      }

      if (newStatus) {
        const updateData: Record<string, unknown> = { status: newStatus };
        if (newStatus === "COMPLETED") {
          updateData.completedAt = new Date();
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

    return NextResponse.json(boardDecision, { status: 201 });
  } catch (error) {
    console.error("Fehler beim Erfassen der Beiratsentscheidung:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
