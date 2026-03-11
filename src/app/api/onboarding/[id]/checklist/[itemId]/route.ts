/**
 * API: /api/onboarding/:id/checklist/:itemId
 *
 * PATCH – Checklist-Item updaten (isCompleted, notes, dueDate, assignee)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// =============================================
// PATCH /api/onboarding/:id/checklist/:itemId
// =============================================
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    // Auth-Check
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    const { id, itemId } = await params;
    const body = await request.json();

    // Pruefen ob Onboarding existiert
    const onboarding = await prisma.onboardingProcess.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!onboarding) {
      return NextResponse.json(
        { error: "Vorgang nicht gefunden" },
        { status: 404 }
      );
    }

    // Pruefen ob ChecklistItem existiert und zum Onboarding gehoert
    const existingItem = await prisma.checklistItem.findFirst({
      where: { id: itemId, onboardingId: id },
    });
    if (!existingItem) {
      return NextResponse.json(
        { error: "Checklist-Item nicht gefunden" },
        { status: 404 }
      );
    }

    // Update-Daten zusammenbauen
    const updateData: Record<string, unknown> = {};

    if (typeof body.isCompleted === "boolean") {
      updateData.isCompleted = body.isCompleted;
      if (body.isCompleted) {
        updateData.completedAt = new Date();
        updateData.completedById = session.userId;
      } else {
        updateData.completedAt = null;
        updateData.completedById = null;
      }
    }

    if (typeof body.notes === "string") {
      updateData.notes = body.notes;
    }

    if (body.dueDate !== undefined) {
      updateData.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    }

    if (typeof body.assignee === "string") {
      updateData.assignee = body.assignee;
    }

    const updated = await prisma.checklistItem.update({
      where: { id: itemId },
      data: updateData,
      include: {
        completedBy: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    // Audit-Log
    await prisma.auditLog.create({
      data: {
        onboardingId: id,
        userId: session.userId,
        action: "CHECKLIST_ITEM_UPDATED",
        details: {
          itemId,
          title: existingItem.title,
          changes: body,
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Fehler beim Aktualisieren des Checklist-Items:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
