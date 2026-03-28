/**
 * API: /api/civil-service/:id/checklist/:itemId
 *
 * PATCH – Checklisten-Item togglen (erledigt/offen)
 *
 * Gatekeeper-Logik: Wenn ein Gatekeeper-Item abgehakt wird und alle
 * Gatekeeper der Phase nun erledigt sind, wird die Phase auf COMPLETED gesetzt.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// =============================================
// PATCH /api/civil-service/:id/checklist/:itemId
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

    // Body parsen und validieren
    let body: { isCompleted?: boolean; notes?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Ungültiger Request-Body" },
        { status: 400 }
      );
    }

    if (typeof body.isCompleted !== "boolean") {
      return NextResponse.json(
        { error: "Feld 'isCompleted' (boolean) ist erforderlich." },
        { status: 400 }
      );
    }

    // Item laden und prüfen
    const item = await prisma.civilServiceChecklistItem.findFirst({
      where: {
        id: itemId,
        processId: id,
      },
    });

    if (!item) {
      return NextResponse.json(
        { error: "Checklisten-Item nicht gefunden" },
        { status: 404 }
      );
    }

    const now = new Date();

    // Item aktualisieren
    const updatedItem = await prisma.civilServiceChecklistItem.update({
      where: { id: itemId },
      data: {
        isCompleted: body.isCompleted,
        completedAt: body.isCompleted ? now : null,
        completedById: body.isCompleted ? session.userId : null,
        notes: body.notes !== undefined ? body.notes : item.notes,
        isOverdue: body.isCompleted ? false : item.isOverdue,
      },
    });

    // Gatekeeper-Logik: Phase automatisch auf COMPLETED setzen
    let phaseAdvanced = false;
    if (body.isCompleted && item.isGatekeeper) {
      // Alle Gatekeeper-Items dieser Phase laden
      const gatekeeperItems = await prisma.civilServiceChecklistItem.findMany({
        where: {
          processId: id,
          phase: item.phase,
          isGatekeeper: true,
        },
        select: { id: true, isCompleted: true },
      });

      const allGatekeepersComplete = gatekeeperItems.every((g) => g.isCompleted);

      if (allGatekeepersComplete) {
        await prisma.civilServicePhase.updateMany({
          where: {
            processId: id,
            phaseKey: item.phase,
            status: { not: "COMPLETED" },
          },
          data: {
            status: "COMPLETED",
            completedAt: now,
          },
        });
        phaseAdvanced = true;
      }
    }

    // Phase-Fortschritt berechnen
    const phaseItems = await prisma.civilServiceChecklistItem.findMany({
      where: {
        processId: id,
        phase: item.phase,
      },
      select: { id: true, isCompleted: true },
    });

    const totalItems = phaseItems.length;
    const completedItems = phaseItems.filter((i) => i.isCompleted).length;

    // Audit-Log
    await prisma.auditLog.create({
      data: {
        userId: session.userId !== "n8n-service" ? session.userId : undefined,
        civilServiceId: id,
        processType: "CIVIL_SERVICE",
        action: body.isCompleted
          ? "CHECKLIST_ITEM_COMPLETED"
          : "CHECKLIST_ITEM_REOPENED",
        details: {
          itemId,
          step: item.step,
          phase: item.phase,
          title: item.title,
          notes: body.notes || undefined,
          phaseAdvanced,
          phaseProgress: `${completedItems}/${totalItems}`,
        },
      },
    });

    return NextResponse.json({
      item: updatedItem,
      phaseProgress: {
        phase: item.phase,
        total: totalItems,
        completed: completedItems,
        percentage: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0,
        phaseAdvanced,
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
