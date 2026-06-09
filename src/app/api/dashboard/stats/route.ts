/**
 * API: /api/dashboard/stats
 *
 * GET – Aggregierte Dashboard-Statistiken für Charts und KPIs
 *
 * Liefert:
 * - Status-Verteilung (Tortendiagramm)
 * - Monatlicher Trend der letzten 6 Monate (Balkendiagramm)
 * - Durchschnittliche Bearbeitungsdauer
 * - Ueberfaellige Vorgaenge (>7 Tage offen)
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

const OVERDUE_DAYS = 7;
const CRITICAL_DAYS = 14;
const TREND_MONTHS = 6;

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }
    // Externe BEM-Beauftragte (E7) duerfen KEINE Nicht-BEM-Daten sehen
    // (Defense-in-Depth zum zentralen Middleware-API-Guard).
    if (session.role === "BEM_BEAUFTRAGTER") {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    // 1. Status-Verteilung
    const statusGroups = await prisma.onboardingProcess.groupBy({
      by: ["status"],
      _count: { id: true },
    });

    const statusDistribution = statusGroups.map((g) => ({
      status: g.status,
      count: g._count.id,
    }));

    // 2. Monatlicher Trend (letzte 6 Monate)
    const now = new Date();
    const sixMonthsAgo = new Date(
      now.getFullYear(),
      now.getMonth() - TREND_MONTHS + 1,
      1
    );

    const allProcesses = await prisma.onboardingProcess.findMany({
      where: { createdAt: { gte: sixMonthsAgo } },
      select: { createdAt: true, completedAt: true },
    });

    const MONTH_NAMES = ["Jan", "Feb", "Mrz", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
    const monthlyTrend: { month: string; created: number; completed: number }[] = [];
    for (let i = 0; i < TREND_MONTHS; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - TREND_MONTHS + 1 + i, 1);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const monthLabel = `${MONTH_NAMES[date.getMonth()]} ${String(date.getFullYear()).slice(-2)}`;

      const created = allProcesses.filter((p) => {
        const d = new Date(p.createdAt);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` === monthKey;
      }).length;

      const completed = allProcesses.filter((p) => {
        if (!p.completedAt) return false;
        const d = new Date(p.completedAt);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` === monthKey;
      }).length;

      monthlyTrend.push({ month: monthLabel, created, completed });
    }

    // 3. Durchschnittliche Bearbeitungsdauer (invitedAt → completedAt)
    const completedProcesses = await prisma.onboardingProcess.findMany({
      where: {
        status: "COMPLETED",
        completedAt: { not: null },
      },
      select: { invitedAt: true, completedAt: true },
    });

    let averageDurationDays = 0;
    if (completedProcesses.length > 0) {
      const totalMs = completedProcesses.reduce((sum, p) => {
        return sum + (new Date(p.completedAt!).getTime() - new Date(p.invitedAt).getTime());
      }, 0);
      averageDurationDays = Math.round((totalMs / completedProcesses.length / 86400000) * 10) / 10;
    }

    // 4. Ueberfaellige Vorgaenge
    const overdueThreshold = new Date(now.getTime() - OVERDUE_DAYS * 86400000);
    const criticalThreshold = new Date(now.getTime() - CRITICAL_DAYS * 86400000);

    const overdueProcesses = await prisma.onboardingProcess.findMany({
      where: {
        status: { in: ["INVITED", "IN_PROGRESS", "SUBMITTED", "SUPERVISOR_PENDING", "SUPERVISOR_SUBMITTED"] },
        invitedAt: { lt: overdueThreshold },
      },
      select: {
        id: true,
        displayId: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        invitedAt: true,
        organization: { select: { name: true, mandantNumber: true } },
      },
      orderBy: { invitedAt: "asc" },
    });

    const overdueItems = overdueProcesses.map((p) => {
      const daysOpen = Math.floor(
        (now.getTime() - new Date(p.invitedAt).getTime()) / 86400000
      );
      return {
        id: p.id,
        displayId: p.displayId,
        email: p.email,
        name: p.firstName && p.lastName ? `${p.firstName} ${p.lastName}` : p.email,
        status: p.status,
        organization: p.organization.name,
        daysOpen,
        critical: new Date(p.invitedAt) < criticalThreshold,
      };
    });

    // =============================================
    // 5. Offboarding-Statistiken
    // =============================================
    const offboardingStatusGroups = await prisma.offboardingProcess.groupBy({
      by: ["status"],
      _count: { id: true },
    });

    const byStatus: Record<string, number> = {
      INITIATED: 0,
      NOTICE_PERIOD: 0,
      HANDOVER_PHASE: 0,
      FINAL_SETTLEMENT: 0,
      COMPLETED: 0,
      CANCELLED: 0,
    };
    let offboardingTotal = 0;
    for (const g of offboardingStatusGroups) {
      byStatus[g.status] = g._count.id;
      offboardingTotal += g._count.id;
    }

    // Ueberfaellige Checklisten-Items (dueDate < now, nicht erledigt)
    const overdueChecklistCount = await prisma.offboardingChecklistItem.count({
      where: {
        isCompleted: false,
        dueDate: { lt: now },
        offboarding: {
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
      },
    });

    // Kuerzlich abgeschlossene Offboardings (letzte 30 Tage)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const recentCompletedCount = await prisma.offboardingProcess.count({
      where: {
        status: "COMPLETED",
        completedAt: { gte: thirtyDaysAgo },
      },
    });

    return NextResponse.json({
      statusDistribution,
      monthlyTrend,
      averageDuration: {
        days: averageDurationDays,
        processCount: completedProcesses.length,
      },
      overdue: {
        count: overdueItems.length,
        criticalCount: overdueItems.filter((i) => i.critical).length,
        items: overdueItems,
      },
      offboardingStats: {
        total: offboardingTotal,
        byStatus,
        overdueCount: overdueChecklistCount,
        recentCompleted: recentCompletedCount,
      },
    });
  } catch (error) {
    console.error("Fehler beim Laden der Dashboard-Statistiken:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
