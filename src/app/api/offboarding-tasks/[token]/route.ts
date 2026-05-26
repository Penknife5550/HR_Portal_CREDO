/**
 * API: /api/offboarding-tasks/[token]
 *
 * GET - Aufgaben für eine Abteilung laden (via Magic Link)
 *
 * OEFFENTLICH - kein Auth erforderlich!
 * Zugang ausschliesslich über gueltigen Magic-Link-Token.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { tokenRateLimiter, getClientIp } from "@/lib/rate-limit";

// =============================================
// GET /api/offboarding-tasks/[token]
// =============================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    // Rate Limiting gegen Token-Enumeration
    const clientIp = getClientIp(_request);
    const rlCheck = tokenRateLimiter.check(clientIp);
    if (!rlCheck.allowed) {
      return NextResponse.json(
        { error: "Zu viele Anfragen. Bitte warten Sie." },
        { status: 429 }
      );
    }

    const { token } = await params;

    // Token validieren
    const link = await prisma.offboardingDepartmentLink.findUnique({
      where: { token },
    });

    if (!link) {
      return NextResponse.json({ error: "Ungültiger Link" }, { status: 404 });
    }

    if (link.expiresAt < new Date()) {
      return NextResponse.json({ error: "Link ist abgelaufen" }, { status: 410 });
    }

    // Tracking: firstOpenedAt, lastOpenedAt, openCount
    const now = new Date();
    await prisma.offboardingDepartmentLink.update({
      where: { id: link.id },
      data: {
        firstOpenedAt: link.firstOpenedAt ?? now,
        lastOpenedAt: now,
        openCount: { increment: 1 },
      },
    });

    // Offboarding-Basisdaten laden (keine sensiblen Daten!)
    const offboarding = await prisma.offboardingProcess.findUnique({
      where: { id: link.offboardingId },
      select: {
        id: true,
        displayId: true,
        employeeFirstName: true,
        employeeLastName: true,
        lastWorkingDay: true,
        status: true,
        organization: {
          select: {
            name: true,
            shortName: true,
          },
        },
      },
    });

    if (!offboarding) {
      return NextResponse.json({ error: "Offboarding-Vorgang nicht gefunden" }, { status: 404 });
    }

    // Checklist-Items dieser Abteilung laden
    const items = await prisma.offboardingChecklistItem.findMany({
      where: {
        offboardingId: link.offboardingId,
        assigneeDepartment: link.departmentKey,
      },
      orderBy: [{ category: "asc" }, { orderIndex: "asc" }],
      select: {
        id: true,
        title: true,
        category: true,
        orderIndex: true,
        description: true,
        isCompleted: true,
        completedAt: true,
        dueDate: true,
        notes: true,
      },
    });

    // Gesamtfortschritt berechnen
    const allItems = await prisma.offboardingChecklistItem.findMany({
      where: { offboardingId: link.offboardingId },
      select: { isCompleted: true },
    });

    const totalItems = allItems.length;
    const completedItems = allItems.filter((i) => i.isCompleted).length;
    const departmentCompleted = items.filter((i) => i.isCompleted).length;

    return NextResponse.json({
      data: {
        department: {
          key: link.departmentKey,
          name: link.departmentName,
          allTasksComplete: link.allTasksComplete,
        },
        offboarding: {
          displayId: offboarding.displayId,
          employeeName: `${offboarding.employeeFirstName} ${offboarding.employeeLastName}`,
          organizationName: offboarding.organization.name,
          lastWorkingDay: offboarding.lastWorkingDay,
          status: offboarding.status,
        },
        items,
        progress: {
          department: {
            total: items.length,
            completed: departmentCompleted,
            percentage: items.length > 0 ? Math.round((departmentCompleted / items.length) * 100) : 100,
          },
          overall: {
            total: totalItems,
            completed: completedItems,
            percentage: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 100,
          },
        },
      },
    });
  } catch (error) {
    console.error("[API] Offboarding-Tasks laden fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
