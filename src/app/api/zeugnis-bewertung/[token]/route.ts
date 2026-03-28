/**
 * API: /api/zeugnis-bewertung/[token]
 *
 * GET - Bewertungsformular laden (via Magic Link)
 * PUT - Bewertungen speichern (Zwischenspeichern moeglich)
 *
 * OEFFENTLICH - kein Auth erforderlich!
 * Zugang ausschliesslich ueber gueltigen Magic-Link-Token.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { tokenRateLimiter, getClientIp } from "@/lib/rate-limit";
import { saveZeugnisRatingsSchema } from "@/lib/validations/zeugnis";

// Typ fuer den Template-Snapshot
interface SnapshotCriterion {
  id: string;
  weight: number;
}

interface SnapshotCategory {
  id: string;
  weight: number;
  criteria: SnapshotCriterion[];
}

interface TemplateSnapshot {
  categories: SnapshotCategory[];
}

/**
 * Gesamtnote berechnen (gewichteter Durchschnitt)
 */
function calculateOverallGrade(
  snapshot: TemplateSnapshot,
  ratingsMap: Map<string, number>
): { overallGrade: number; overallGradeRounded: number } | null {
  let totalCategoryWeight = 0;
  let weightedCategorySum = 0;

  for (const category of snapshot.categories) {
    let totalCriterionWeight = 0;
    let weightedCriterionSum = 0;

    for (const criterion of category.criteria) {
      const grade = ratingsMap.get(criterion.id);
      if (grade === undefined) continue;

      totalCriterionWeight += criterion.weight;
      weightedCriterionSum += criterion.weight * grade;
    }

    if (totalCriterionWeight === 0) continue;

    const categoryScore = weightedCriterionSum / totalCriterionWeight;
    totalCategoryWeight += category.weight;
    weightedCategorySum += category.weight * categoryScore;
  }

  if (totalCategoryWeight === 0) return null;

  const overallGrade = weightedCategorySum / totalCategoryWeight;
  return {
    overallGrade: Math.round(overallGrade * 100) / 100,
    overallGradeRounded: Math.round(overallGrade),
  };
}

// =============================================
// GET /api/zeugnis-bewertung/[token]
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
    const bewertung = await prisma.zeugnisBewertung.findUnique({
      where: { token },
      include: {
        ratings: true,
        offboarding: {
          select: {
            id: true,
            displayId: true,
            employeeFirstName: true,
            employeeLastName: true,
            lastWorkingDay: true,
            organization: {
              select: {
                name: true,
                shortName: true,
              },
            },
          },
        },
      },
    });

    if (!bewertung) {
      return NextResponse.json({ error: "Ungueltiger Link" }, { status: 404 });
    }

    if (bewertung.tokenExpiresAt < new Date()) {
      return NextResponse.json({ error: "Link ist abgelaufen" }, { status: 410 });
    }

    if (!["INVITED", "IN_PROGRESS"].includes(bewertung.status)) {
      return NextResponse.json(
        { error: "Diese Bewertung kann nicht mehr bearbeitet werden" },
        { status: 410 }
      );
    }

    // Tracking aktualisieren
    const now = new Date();
    const statusUpdate = bewertung.status === "INVITED" ? "IN_PROGRESS" : bewertung.status;

    await prisma.zeugnisBewertung.update({
      where: { id: bewertung.id },
      data: {
        firstOpenedAt: bewertung.firstOpenedAt ?? now,
        lastOpenedAt: now,
        openCount: { increment: 1 },
        status: statusUpdate,
      },
    });

    return NextResponse.json({
      data: {
        id: bewertung.id,
        status: statusUpdate,
        supervisorName: bewertung.supervisorName,
        jobGroup: bewertung.jobGroup,
        templateSnapshot: bewertung.templateSnapshot,
        ratings: bewertung.ratings.map((r) => ({
          id: r.id,
          snapshotCriterionId: r.snapshotCriterionId,
          snapshotCategoryId: r.snapshotCategoryId,
          grade: r.grade,
          comment: r.comment,
        })),
        overallGrade: bewertung.overallGrade,
        overallGradeRounded: bewertung.overallGradeRounded,
        employee: {
          name: `${bewertung.offboarding.employeeFirstName} ${bewertung.offboarding.employeeLastName}`,
          organizationName: bewertung.offboarding.organization.name,
          lastWorkingDay: bewertung.offboarding.lastWorkingDay,
        },
      },
    });
  } catch (error) {
    console.error("[API] Zeugnis-Bewertung Token-Zugriff fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// =============================================
// PUT /api/zeugnis-bewertung/[token]
// =============================================
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    // Rate Limiting
    const clientIp = getClientIp(request);
    const rlCheck = tokenRateLimiter.check(clientIp);
    if (!rlCheck.allowed) {
      return NextResponse.json(
        { error: "Zu viele Anfragen. Bitte warten Sie." },
        { status: 429 }
      );
    }

    const { token } = await params;

    // Token validieren
    const bewertung = await prisma.zeugnisBewertung.findUnique({
      where: { token },
    });

    if (!bewertung) {
      return NextResponse.json({ error: "Ungueltiger Link" }, { status: 404 });
    }

    if (bewertung.tokenExpiresAt < new Date()) {
      return NextResponse.json({ error: "Link ist abgelaufen" }, { status: 410 });
    }

    if (!["INVITED", "IN_PROGRESS"].includes(bewertung.status)) {
      return NextResponse.json(
        { error: "Diese Bewertung kann nicht mehr bearbeitet werden" },
        { status: 410 }
      );
    }

    // Body validieren
    const body = await request.json().catch(() => null);
    const parsed = saveZeugnisRatingsSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const { ratings } = parsed.data;

    // Ratings upserten
    for (const r of ratings) {
      await prisma.zeugnisBewertungRating.upsert({
        where: {
          zeugnisBewertungId_snapshotCriterionId: {
            zeugnisBewertungId: bewertung.id,
            snapshotCriterionId: r.snapshotCriterionId,
          },
        },
        create: {
          zeugnisBewertungId: bewertung.id,
          snapshotCriterionId: r.snapshotCriterionId,
          snapshotCategoryId: r.snapshotCategoryId,
          grade: r.grade,
          comment: r.comment || null,
        },
        update: {
          grade: r.grade,
          comment: r.comment || null,
          snapshotCategoryId: r.snapshotCategoryId,
        },
      });
    }

    // Status auf IN_PROGRESS setzen falls noch INVITED
    if (bewertung.status === "INVITED") {
      await prisma.zeugnisBewertung.update({
        where: { id: bewertung.id },
        data: { status: "IN_PROGRESS" },
      });
    }

    // Gesamtnote neu berechnen
    const allRatings = await prisma.zeugnisBewertungRating.findMany({
      where: { zeugnisBewertungId: bewertung.id },
    });

    const ratingsMap = new Map(
      allRatings.map((r) => [r.snapshotCriterionId, r.grade])
    );

    const gradeResult = calculateOverallGrade(
      bewertung.templateSnapshot as unknown as TemplateSnapshot,
      ratingsMap
    );

    // Note aktualisieren
    await prisma.zeugnisBewertung.update({
      where: { id: bewertung.id },
      data: {
        overallGrade: gradeResult?.overallGrade ?? null,
        overallGradeRounded: gradeResult?.overallGradeRounded ?? null,
      },
    });

    return NextResponse.json({
      data: {
        success: true,
        overallGrade: gradeResult?.overallGrade ?? null,
        overallGradeRounded: gradeResult?.overallGradeRounded ?? null,
      },
    });
  } catch (error) {
    console.error("[API] Zeugnis-Bewertung Ratings speichern fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
