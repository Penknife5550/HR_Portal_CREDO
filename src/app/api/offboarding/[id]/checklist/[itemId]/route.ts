/**
 * API: /api/offboarding/:id/checklist/:itemId
 *
 * PATCH – Checklisten-Item aktualisieren
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { triggerWebhooks } from "@/lib/webhooks";

// =============================================
// PATCH /api/offboarding/:id/checklist/:itemId
// =============================================
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    const { id, itemId } = await params;
    const body = await request.json();
    const { isCompleted, notes, assigneeDepartment } = body;

    // Pruefen ob das Item existiert und zum Offboarding gehoert
    const existing = await prisma.offboardingChecklistItem.findUnique({
      where: { id: itemId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Checklisten-Item nicht gefunden" },
        { status: 404 }
      );
    }

    if (existing.offboardingId !== id) {
      return NextResponse.json(
        { error: "Item gehoert nicht zu diesem Offboarding" },
        { status: 403 }
      );
    }

    // Update-Daten zusammenbauen
    const updateData: Record<string, unknown> = {};

    if (typeof isCompleted === "boolean") {
      updateData.isCompleted = isCompleted;
      if (isCompleted) {
        updateData.completedAt = new Date();
        updateData.completedById = session.userId;
      } else {
        updateData.completedAt = null;
        updateData.completedById = null;
      }
    }

    if (notes !== undefined) {
      updateData.notes = notes;
    }

    if (assigneeDepartment !== undefined) {
      updateData.assigneeDepartment = assigneeDepartment;
    }

    const updated = await prisma.offboardingChecklistItem.update({
      where: { id: itemId },
      data: updateData,
    });

    // Webhook triggern wenn Item als erledigt markiert wurde
    if (isCompleted === true) {
      const offboarding = await prisma.offboardingProcess.findUnique({
        where: { id },
        select: {
          displayId: true,
          employeeFirstName: true,
          employeeLastName: true,
          organizationId: true,
        },
      });

      await triggerWebhooks("offboarding-task-completed" as never, {
        offboardingId: id,
        displayId: offboarding?.displayId,
        employeeName: `${offboarding?.employeeFirstName} ${offboarding?.employeeLastName}`,
        taskId: itemId,
        taskTitle: updated.title,
        taskCategory: updated.category,
        completedById: session.userId,
      });
    }

    // Pruefen ob alle Items erledigt sind
    const totalItems = await prisma.offboardingChecklistItem.count({
      where: { offboardingId: id },
    });

    const completedItems = await prisma.offboardingChecklistItem.count({
      where: { offboardingId: id, isCompleted: true },
    });

    const allCompleted = totalItems > 0 && totalItems === completedItems;

    return NextResponse.json({
      item: updated,
      progress: {
        total: totalItems,
        completed: completedItems,
        allCompleted,
      },
    });
  } catch (error) {
    console.error("Fehler beim Aktualisieren des Checklisten-Items:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
