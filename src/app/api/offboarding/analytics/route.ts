/**
 * API: /api/offboarding/analytics
 *
 * GET – Umfassende Analytics für Offboarding-Prozesse
 *
 * Auth: Session-Cookie (alle HR-Rollen) ODER X-API-Key (n8n/Power BI)
 * Query-Parameter: from, to, organizationId
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// =============================================
// Hilfsfunktionen
// =============================================

/** Differenz in Tagen zwischen zwei Dates */
function diffDays(a: Date, b: Date): number {
  return Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
}

/** Monat als "YYYY-MM" String */
function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Letzte 12 Monate als Array von "YYYY-MM" Strings (aeltester zuerst) */
function getLast12Months(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(toMonthKey(d));
  }
  return months;
}

// Typ für die templateSnapshot-Struktur im ExitInterview
interface SnapshotCategory {
  id: string;
  name: string;
  questions: Array<{
    id: string;
    questionType: string;
    questionText: string;
  }>;
}

// =============================================
// GET /api/offboarding/analytics
// =============================================
export async function GET(request: NextRequest) {
  try {
    // --- Auth ---
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    // --- Query-Parameter ---
    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const organizationId = searchParams.get("organizationId");

    // Basis-Filter aufbauen
    const where: Record<string, unknown> = {};
    if (organizationId) {
      where.organizationId = organizationId;
    }
    if (fromParam || toParam) {
      const createdAtFilter: Record<string, Date> = {};
      if (fromParam) createdAtFilter.gte = new Date(fromParam);
      if (toParam) {
        const toDate = new Date(toParam);
        toDate.setHours(23, 59, 59, 999);
        createdAtFilter.lte = toDate;
      }
      where.createdAt = createdAtFilter;
    }

    // =============================================
    // 1. Uebersicht (Overview)
    // =============================================
    const [
      totalProcesses,
      statusCounts,
      completedProcesses,
      overdueProcesses,
    ] = await Promise.all([
      prisma.offboardingProcess.count({ where }),

      prisma.offboardingProcess.groupBy({
        by: ["status"],
        where,
        _count: { status: true },
      }),

      prisma.offboardingProcess.findMany({
        where: { ...where, status: "COMPLETED", completedAt: { not: null } },
        select: { createdAt: true, completedAt: true },
      }),

      prisma.offboardingProcess.count({
        where: {
          ...where,
          lastWorkingDay: { lt: new Date() },
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
      }),
    ]);

    const statusMap: Record<string, number> = {};
    for (const sc of statusCounts) {
      statusMap[sc.status] = sc._count.status;
    }

    // Durchschnittliche Dauer berechnen
    let avgDurationDays: number | null = null;
    if (completedProcesses.length > 0) {
      const totalDays = completedProcesses.reduce((sum, p) => {
        return sum + diffDays(p.createdAt, p.completedAt!);
      }, 0);
      avgDurationDays = Math.round((totalDays / completedProcesses.length) * 10) / 10;
    }

    const overview = {
      totalProcesses,
      completedProcesses: statusMap["COMPLETED"] || 0,
      activeProcesses:
        (statusMap["INITIATED"] || 0) +
        (statusMap["NOTICE_PERIOD"] || 0) +
        (statusMap["HANDOVER_PHASE"] || 0) +
        (statusMap["FINAL_SETTLEMENT"] || 0),
      cancelledProcesses: statusMap["CANCELLED"] || 0,
      avgDurationDays,
      overdueCount: overdueProcesses,
    };

    // =============================================
    // 2. Austrittsgruende (Exit Type Distribution)
    // =============================================
    const exitTypeCounts = await prisma.offboardingProcess.groupBy({
      by: ["exitType"],
      where,
      _count: { exitType: true },
    });

    const exitTypeDistribution = exitTypeCounts
      .map((et) => ({
        exitType: et.exitType,
        count: et._count.exitType,
        percentage:
          totalProcesses > 0
            ? Math.round((et._count.exitType / totalProcesses) * 1000) / 10
            : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // =============================================
    // 3. Monatlicher Trend (letzte 12 Monate)
    // =============================================
    const months = getLast12Months();
    const twelveMonthsAgo = new Date(
      new Date().getFullYear(),
      new Date().getMonth() - 11,
      1
    );

    const trendWhere: Record<string, unknown> = {};
    if (organizationId) trendWhere.organizationId = organizationId;

    const [createdInRange, completedInRange] = await Promise.all([
      prisma.offboardingProcess.findMany({
        where: {
          ...trendWhere,
          createdAt: { gte: twelveMonthsAgo },
        },
        select: { createdAt: true },
      }),
      prisma.offboardingProcess.findMany({
        where: {
          ...trendWhere,
          completedAt: { gte: twelveMonthsAgo, not: null },
          status: "COMPLETED",
        },
        select: { completedAt: true },
      }),
    ]);

    const createdByMonth: Record<string, number> = {};
    const completedByMonth: Record<string, number> = {};
    for (const m of months) {
      createdByMonth[m] = 0;
      completedByMonth[m] = 0;
    }
    for (const p of createdInRange) {
      const key = toMonthKey(p.createdAt);
      if (key in createdByMonth) createdByMonth[key]++;
    }
    for (const p of completedInRange) {
      if (p.completedAt) {
        const key = toMonthKey(p.completedAt);
        if (key in completedByMonth) completedByMonth[key]++;
      }
    }

    const monthlyTrend = months.map((month) => ({
      month,
      created: createdByMonth[month] || 0,
      completed: completedByMonth[month] || 0,
    }));

    // =============================================
    // 4. Pro Einrichtung (By Organization)
    // =============================================
    const orgGrouped = await prisma.offboardingProcess.groupBy({
      by: ["organizationId", "status"],
      where,
      _count: { id: true },
    });

    // Alle betroffenen Org-IDs sammeln und Namen laden
    const orgIds = Array.from(new Set(orgGrouped.map((g) => g.organizationId)));
    const orgs = await prisma.organization.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, name: true },
    });
    const orgNameMap = new Map(orgs.map((o) => [o.id, o.name]));

    const orgStatsMap = new Map<
      string,
      { total: number; completed: number; active: number }
    >();

    const ACTIVE_STATUSES = new Set([
      "INITIATED",
      "NOTICE_PERIOD",
      "HANDOVER_PHASE",
      "FINAL_SETTLEMENT",
    ]);

    for (const row of orgGrouped) {
      const existing = orgStatsMap.get(row.organizationId) || {
        total: 0,
        completed: 0,
        active: 0,
      };
      existing.total += row._count.id;
      if (row.status === "COMPLETED") existing.completed += row._count.id;
      if (ACTIVE_STATUSES.has(row.status)) existing.active += row._count.id;
      orgStatsMap.set(row.organizationId, existing);
    }

    const byOrganization = Array.from(orgStatsMap.entries())
      .map(([orgId, stats]) => ({
        organizationId: orgId,
        organizationName: orgNameMap.get(orgId) || "Unbekannt",
        ...stats,
      }))
      .sort((a, b) => b.total - a.total);

    // =============================================
    // 5. Exit-Interview Statistiken
    // =============================================
    const interviewWhere: Record<string, unknown> = {};
    if (organizationId || fromParam || toParam) {
      interviewWhere.offboarding = where;
    }

    const [interviewCounts, submittedInterviews] = await Promise.all([
      prisma.exitInterview.groupBy({
        by: ["status"],
        where: interviewWhere,
        _count: { status: true },
      }),
      prisma.exitInterview.findMany({
        where: { ...interviewWhere, status: "SUBMITTED" },
        select: {
          id: true,
          templateSnapshot: true,
          responses: {
            select: {
              snapshotQuestionId: true,
              ratingValue: true,
            },
          },
        },
      }),
    ]);

    const interviewStatusMap: Record<string, number> = {};
    let interviewTotal = 0;
    for (const ic of interviewCounts) {
      interviewStatusMap[ic.status] = ic._count.status;
      interviewTotal += ic._count.status;
    }

    const sentStatuses = ["INVITED", "IN_PROGRESS", "SUBMITTED", "EXPIRED"];
    const interviewSent = sentStatuses.reduce(
      (sum, s) => sum + (interviewStatusMap[s] || 0),
      0
    );
    const interviewCompleted = interviewStatusMap["SUBMITTED"] || 0;
    const interviewCompletionRate =
      interviewSent > 0
        ? Math.round((interviewCompleted / interviewSent) * 1000) / 10
        : 0;

    // Bewertungen aggregieren: Alle RATING_5_STAR und ENPS Antworten
    // aus den templateSnapshots die Frage-Typen und Kategorie-Namen extrahieren
    const questionCategoryMap = new Map<string, string>(); // questionId -> categoryName
    const questionTypeMap = new Map<string, string>(); // questionId -> questionType
    const allRatings: number[] = [];
    const allEnps: number[] = [];
    const categoryRatings = new Map<string, number[]>(); // categoryName -> ratings[]

    for (const interview of submittedInterviews) {
      // Template-Snapshot parsen
      const snapshot = interview.templateSnapshot as {
        categories?: SnapshotCategory[];
      };
      if (snapshot?.categories) {
        for (const cat of snapshot.categories) {
          for (const q of cat.questions || []) {
            questionCategoryMap.set(q.id, cat.name);
            questionTypeMap.set(q.id, q.questionType);
          }
        }
      }

      // Responses verarbeiten
      for (const response of interview.responses) {
        if (response.ratingValue == null) continue;
        const qType = questionTypeMap.get(response.snapshotQuestionId);
        const catName = questionCategoryMap.get(response.snapshotQuestionId);

        if (qType === "RATING_5_STAR") {
          allRatings.push(response.ratingValue);
          if (catName) {
            const existing = categoryRatings.get(catName) || [];
            existing.push(response.ratingValue);
            categoryRatings.set(catName, existing);
          }
        } else if (qType === "ENPS") {
          allEnps.push(response.ratingValue);
        }
      }
    }

    const avgOverallRating =
      allRatings.length > 0
        ? Math.round((allRatings.reduce((a, b) => a + b, 0) / allRatings.length) * 100) / 100
        : null;

    const avgEnps =
      allEnps.length > 0
        ? Math.round((allEnps.reduce((a, b) => a + b, 0) / allEnps.length) * 100) / 100
        : null;

    // Kategorie-Durchschnitte (Rule of 5: nur >= 5 Antworten)
    const categoryAverages = Array.from(categoryRatings.entries())
      .filter(([, ratings]) => ratings.length >= 5)
      .map(([categoryName, ratings]) => ({
        categoryName,
        avgRating:
          Math.round(
            (ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100
          ) / 100,
        responseCount: ratings.length,
      }))
      .sort((a, b) => b.avgRating - a.avgRating);

    const exitInterviews = {
      total: interviewTotal,
      sent: interviewSent,
      completed: interviewCompleted,
      completionRate: interviewCompletionRate,
      avgOverallRating,
      avgEnps,
      categoryAverages,
    };

    // =============================================
    // 6. Zeugnis-Bewertungen
    // =============================================
    const zeugnisWhere: Record<string, unknown> = {};
    if (organizationId || fromParam || toParam) {
      zeugnisWhere.offboarding = where;
    }

    const [zeugnisStatusCounts, zeugnisGrades] = await Promise.all([
      prisma.zeugnisBewertung.groupBy({
        by: ["status"],
        where: zeugnisWhere,
        _count: { status: true },
      }),
      prisma.zeugnisBewertung.findMany({
        where: {
          ...zeugnisWhere,
          overallGrade: { not: null },
          status: { in: ["SUBMITTED", "HR_REVIEW", "FINALIZED"] },
        },
        select: { overallGrade: true },
      }),
    ]);

    let zeugnisTotal = 0;
    const zeugnisStatusMap: Record<string, number> = {};
    for (const zs of zeugnisStatusCounts) {
      zeugnisStatusMap[zs.status] = zs._count.status;
      zeugnisTotal += zs._count.status;
    }

    const avgOverallGrade =
      zeugnisGrades.length > 0
        ? Math.round(
            (zeugnisGrades.reduce((sum, z) => sum + (z.overallGrade ?? 0), 0) /
              zeugnisGrades.length) *
              100
          ) / 100
        : null;

    const zeugnisBewertungen = {
      total: zeugnisTotal,
      submitted:
        (zeugnisStatusMap["SUBMITTED"] || 0) +
        (zeugnisStatusMap["HR_REVIEW"] || 0),
      finalized: zeugnisStatusMap["FINALIZED"] || 0,
      avgOverallGrade,
    };

    // =============================================
    // 7. Abteilungs-Performance
    // =============================================
    const deptWhere: Record<string, unknown> = {};
    if (organizationId || fromParam || toParam) {
      deptWhere.offboarding = where;
    }

    const departmentLinks = await prisma.offboardingDepartmentLink.findMany({
      where: deptWhere,
      select: {
        departmentKey: true,
        departmentName: true,
        sentAt: true,
        completedAt: true,
        allTasksComplete: true,
      },
    });

    const deptMap = new Map<
      string,
      {
        departmentName: string;
        totalAssigned: number;
        completedOnTime: number;
        responseDays: number[];
      }
    >();

    for (const link of departmentLinks) {
      const existing = deptMap.get(link.departmentKey) || {
        departmentName: link.departmentName,
        totalAssigned: 0,
        completedOnTime: 0,
        responseDays: [],
      };

      existing.totalAssigned++;

      if (link.allTasksComplete && link.completedAt && link.sentAt) {
        existing.completedOnTime++;
        existing.responseDays.push(diffDays(link.sentAt, link.completedAt));
      }

      deptMap.set(link.departmentKey, existing);
    }

    const departmentPerformance = Array.from(deptMap.entries())
      .map(([departmentKey, stats]) => ({
        departmentKey,
        departmentName: stats.departmentName,
        totalAssigned: stats.totalAssigned,
        completedOnTime: stats.completedOnTime,
        avgResponseDays:
          stats.responseDays.length > 0
            ? Math.round(
                (stats.responseDays.reduce((a, b) => a + b, 0) /
                  stats.responseDays.length) *
                  10
              ) / 10
            : null,
      }))
      .sort((a, b) => b.totalAssigned - a.totalAssigned);

    // =============================================
    // Response
    // =============================================
    return NextResponse.json({
      data: {
        overview,
        exitTypeDistribution,
        monthlyTrend,
        byOrganization,
        exitInterviews,
        zeugnisBewertungen,
        departmentPerformance,
      },
    });
  } catch (error) {
    console.error("Fehler beim Laden der Offboarding-Analytics:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
