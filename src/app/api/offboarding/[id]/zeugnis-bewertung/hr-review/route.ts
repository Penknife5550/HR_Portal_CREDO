/**
 * API: /api/offboarding/[id]/zeugnis-bewertung/hr-review
 *
 * PUT - HR prueft und passt die Zeugnis-Bewertung an
 *
 * Berechtigung: SUPER_ADMIN, HR_LEITUNG
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

const ALLOWED_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];

// Typ für den Template-Snapshot
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
 * Gesamtnote berechnen (gewichteter Durchschnitt):
 * Pro Kategorie: categoryScore = sum(criterion.weight * effectiveGrade) / sum(criterion.weight)
 * Gesamt: overallGrade = sum(category.weight * categoryScore) / sum(category.weight)
 */
function calculateOverallGrade(
  snapshot: TemplateSnapshot,
  ratingsMap: Map<string, { grade: number; hrOverrideGrade: number | null }>
): { overallGrade: number; overallGradeRounded: number } | null {
  let totalCategoryWeight = 0;
  let weightedCategorySum = 0;

  for (const category of snapshot.categories) {
    let totalCriterionWeight = 0;
    let weightedCriterionSum = 0;

    for (const criterion of category.criteria) {
      const rating = ratingsMap.get(criterion.id);
      if (!rating) continue;

      const effectiveGrade = rating.hrOverrideGrade ?? rating.grade;
      totalCriterionWeight += criterion.weight;
      weightedCriterionSum += criterion.weight * effectiveGrade;
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
// PUT /api/offboarding/[id]/zeugnis-bewertung/hr-review
// =============================================
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    if (!ALLOWED_ROLES.includes(session.role)) {
      return NextResponse.json(
        { error: "Keine Berechtigung. Nur SUPER_ADMIN und HR_LEITUNG duerfen HR-Reviews durchfuehren." },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Body validieren
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Ungültiger Request-Body" }, { status: 400 });
    }

    const { ratings, hrNotes, finalize } = body;

    // Bewertung laden
    const bewertung = await prisma.zeugnisBewertung.findUnique({
      where: { offboardingId: id },
      include: { ratings: true },
    });

    if (!bewertung) {
      return NextResponse.json({ error: "Keine Zeugnis-Bewertung für dieses Offboarding gefunden" }, { status: 404 });
    }

    if (bewertung.status === "FINALIZED") {
      return NextResponse.json({ error: "Diese Bewertung wurde bereits finalisiert" }, { status: 409 });
    }

    // HR-Override Ratings aktualisieren
    if (ratings && Array.isArray(ratings)) {
      for (const r of ratings) {
        if (!r.snapshotCriterionId) continue;

        // Pruefen ob Rating existiert
        const existingRating = bewertung.ratings.find(
          (er) => er.snapshotCriterionId === r.snapshotCriterionId
        );

        if (!existingRating) {
          return NextResponse.json(
            { error: `Kein Rating für Kriterium "${r.snapshotCriterionId}" gefunden` },
            { status: 404 }
          );
        }

        if (r.hrOverrideGrade !== undefined && r.hrOverrideGrade !== null) {
          if (r.hrOverrideGrade < 1 || r.hrOverrideGrade > 6) {
            return NextResponse.json(
              { error: "hrOverrideGrade muss zwischen 1 und 6 liegen" },
              { status: 400 }
            );
          }
        }

        await prisma.zeugnisBewertungRating.update({
          where: { id: existingRating.id },
          data: {
            hrOverrideGrade: r.hrOverrideGrade ?? null,
            hrOverrideReason: r.hrOverrideReason ?? null,
          },
        });
      }
    }

    // Alle Ratings neu laden für Neuberechnung
    const updatedRatings = await prisma.zeugnisBewertungRating.findMany({
      where: { zeugnisBewertungId: bewertung.id },
    });

    const ratingsMap = new Map(
      updatedRatings.map((r) => [
        r.snapshotCriterionId,
        { grade: r.grade, hrOverrideGrade: r.hrOverrideGrade },
      ])
    );

    const gradeResult = calculateOverallGrade(
      bewertung.templateSnapshot as unknown as TemplateSnapshot,
      ratingsMap
    );

    // Update-Daten zusammenstellen
    const updateData: Record<string, unknown> = {
      hrReviewedAt: new Date(),
      hrReviewedById: session.userId,
      overallGrade: gradeResult?.overallGrade ?? null,
      overallGradeRounded: gradeResult?.overallGradeRounded ?? null,
    };

    if (hrNotes !== undefined) {
      updateData.hrNotes = hrNotes;
    }

    if (!finalize) {
      updateData.status = "HR_REVIEW";
    }

    if (finalize) {
      updateData.status = "FINALIZED";
      updateData.finalizedAt = new Date();
      updateData.finalizedById = session.userId;
    }

    const updated = await prisma.zeugnisBewertung.update({
      where: { id: bewertung.id },
      data: updateData,
      include: {
        ratings: true,
        hrReviewedBy: { select: { id: true, firstName: true, lastName: true } },
        finalizedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // AuditLog schreiben
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        offboardingId: id,
        processType: "OFFBOARDING",
        action: finalize ? "ZEUGNIS_BEWERTUNG_FINALIZED" : "ZEUGNIS_BEWERTUNG_HR_REVIEWED",
        details: {
          zeugnisBewertungId: bewertung.id,
          overallGrade: gradeResult?.overallGrade,
          overallGradeRounded: gradeResult?.overallGradeRounded,
          finalized: !!finalize,
        },
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("[API] Zeugnis-Bewertung HR-Review fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
