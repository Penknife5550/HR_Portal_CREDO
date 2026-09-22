/**
 * API: /api/offboarding/:id/checklist/:itemId
 *
 * PATCH – Checklisten-Item aktualisieren
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { triggerWebhooks } from "@/lib/webhooks";
import { offboardingMailFelder } from "@/lib/offboarding-mail";
import { DEPARTMENT_LABELS } from "@/lib/constants";

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

    // Webhook triggern wenn Item als erledigt markiert wurde.
    //
    // Dieselbe Vorlage wie beim Abhaken ueber den Magic Link der Abteilung
    // (/api/offboarding-tasks/[token]/[itemId]) — der Payload hier sah aber
    // ganz anders aus: keine Abteilung, keine Einrichtung, die Aufgabe nur als
    // `taskTitle`. In der Mail blieben Name, Aufgabe und Abteilung leer.
    // Jetzt kommen dieselben Felder wie dort; `taskId`, `taskTitle`,
    // `taskCategory` und `completedById` bleiben fuer Webhook-Empfaenger.
    //
    // Abteilung: Im Portal kann auch eine Aufgabe ohne Abteilung (oder eine
    // der Personalabteilung) abgehakt werden. Statt eines leeren Feldes nennt
    // die Mail dann ausdruecklich "keine Abteilung zugeordnet".
    if (isCompleted === true) {
      const offboarding = await prisma.offboardingProcess.findUnique({
        where: { id },
        select: {
          id: true,
          displayId: true,
          employeeFirstName: true,
          employeeLastName: true,
          lastWorkingDay: true,
          organizationId: true,
          organization: { select: { name: true, mandantNumber: true } },
        },
      });

      if (offboarding) {
        const offeneAufgaben = await prisma.offboardingChecklistItem.count({
          where: { offboardingId: id, isCompleted: false },
        });
        const abteilungKey = updated.assigneeDepartment;
        const abteilungName = abteilungKey
          ? DEPARTMENT_LABELS[abteilungKey] ?? abteilungKey
          : "Keine Abteilung zugeordnet";

        await triggerWebhooks("offboarding-task-completed", {
          ...offboardingMailFelder(offboarding),
          departmentKey: abteilungKey ?? "",
          departmentName: abteilungName,
          abteilung: abteilungName,
          itemId,
          itemTitle: updated.title,
          aufgabe: updated.title,
          offene_aufgaben: offeneAufgaben,
          taskId: itemId,
          taskTitle: updated.title,
          taskCategory: updated.category,
          completedById: session.userId,
        });
      }
    }

    // Department-Link Status aktualisieren (wenn Item einer Abteilung zugewiesen ist)
    const dept = updated.assigneeDepartment;
    if (dept) {
      const deptItems = await prisma.offboardingChecklistItem.findMany({
        where: { offboardingId: id, assigneeDepartment: dept },
        select: { isCompleted: true },
      });
      const deptAllComplete = deptItems.every((i) => i.isCompleted);

      await prisma.offboardingDepartmentLink.updateMany({
        where: { offboardingId: id, departmentKey: dept },
        data: {
          allTasksComplete: deptAllComplete,
          completedAt: deptAllComplete ? new Date() : null,
        },
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
