/**
 * API: /api/offboarding-tasks/[token]/[itemId]
 *
 * PATCH - Aufgabe abhaken (via Magic Link)
 *
 * OEFFENTLICH - kein Auth erforderlich!
 * Zugang ausschliesslich ueber gueltigen Magic-Link-Token.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { triggerWebhooks } from "@/lib/webhooks";
import { tokenRateLimiter, getClientIp } from "@/lib/rate-limit";

// =============================================
// PATCH /api/offboarding-tasks/[token]/[itemId]
// =============================================
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; itemId: string }> }
) {
  try {
    // Rate Limiting gegen Abuse
    const clientIp = getClientIp(request);
    const rlCheck = tokenRateLimiter.check(clientIp);
    if (!rlCheck.allowed) {
      return NextResponse.json(
        { error: "Zu viele Anfragen. Bitte warten Sie." },
        { status: 429 }
      );
    }

    const { token, itemId } = await params;

    // Token validieren
    const link = await prisma.offboardingDepartmentLink.findUnique({
      where: { token },
    });

    if (!link) {
      return NextResponse.json({ error: "Ungueltiger Link" }, { status: 404 });
    }

    if (link.expiresAt < new Date()) {
      return NextResponse.json({ error: "Link ist abgelaufen" }, { status: 410 });
    }

    // Item laden und pruefen
    const item = await prisma.offboardingChecklistItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      return NextResponse.json({ error: "Aufgabe nicht gefunden" }, { status: 404 });
    }

    // Sicherheitspruefung: Item gehoert zu diesem Offboarding UND hat das richtige assigneeDepartment
    if (item.offboardingId !== link.offboardingId) {
      return NextResponse.json({ error: "Aufgabe gehoert nicht zu diesem Offboarding" }, { status: 403 });
    }

    if (item.assigneeDepartment !== link.departmentKey) {
      return NextResponse.json({ error: "Aufgabe gehoert nicht zu dieser Abteilung" }, { status: 403 });
    }

    const body = await request.json();
    const { isCompleted, notes } = body;

    if (typeof isCompleted !== "boolean") {
      return NextResponse.json({ error: "isCompleted (Boolean) ist ein Pflichtfeld" }, { status: 400 });
    }

    // Item aktualisieren
    const updatedItem = await prisma.offboardingChecklistItem.update({
      where: { id: itemId },
      data: {
        isCompleted,
        completedAt: isCompleted ? new Date() : null,
        ...(notes !== undefined && { notes }),
      },
    });

    // Offboarding-Daten fuer Webhook laden
    const offboarding = await prisma.offboardingProcess.findUnique({
      where: { id: link.offboardingId },
      include: { organization: true },
    });

    // Webhook "offboarding-task-completed" triggern
    if (isCompleted && offboarding) {
      await triggerWebhooks("offboarding-task-completed", {
        offboardingId: link.offboardingId,
        displayId: offboarding.displayId,
        departmentKey: link.departmentKey,
        departmentName: link.departmentName,
        itemId: updatedItem.id,
        itemTitle: updatedItem.title,
        employeeName: `${offboarding.employeeFirstName} ${offboarding.employeeLastName}`,
        organizationName: offboarding.organization.name,
      });
    }

    // Pruefen ob ALLE Items dieser Abteilung erledigt sind
    const departmentItems = await prisma.offboardingChecklistItem.findMany({
      where: {
        offboardingId: link.offboardingId,
        assigneeDepartment: link.departmentKey,
      },
      select: { isCompleted: true },
    });

    const allComplete = departmentItems.every((i) => i.isCompleted);

    // Department-Link-Status aktualisieren
    const updatedLink = await prisma.offboardingDepartmentLink.update({
      where: { id: link.id },
      data: {
        allTasksComplete: allComplete,
        completedAt: allComplete ? new Date() : null,
      },
    });

    // Webhook "offboarding-department-completed" triggern wenn alle erledigt
    if (allComplete && offboarding) {
      await triggerWebhooks("offboarding-department-completed", {
        offboardingId: link.offboardingId,
        displayId: offboarding.displayId,
        departmentKey: link.departmentKey,
        departmentName: link.departmentName,
        email: link.email,
        employeeName: `${offboarding.employeeFirstName} ${offboarding.employeeLastName}`,
        organizationName: offboarding.organization.name,
        completedAt: updatedLink.completedAt?.toISOString(),
      });
    }

    // Fortschritt berechnen
    const departmentTotal = departmentItems.length;
    const departmentCompleted = departmentItems.filter((i) => i.isCompleted).length;
    // Da wir gerade ein Item aktualisiert haben, muessen wir den neuen Wert beruecksichtigen
    const adjustedCompleted = isCompleted
      ? departmentCompleted
      : departmentCompleted;

    return NextResponse.json({
      data: {
        item: updatedItem,
        departmentComplete: allComplete,
        progress: {
          total: departmentTotal,
          completed: adjustedCompleted,
          percentage: departmentTotal > 0 ? Math.round((adjustedCompleted / departmentTotal) * 100) : 100,
        },
      },
    });
  } catch (error) {
    console.error("[API] Offboarding-Task aktualisieren fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
