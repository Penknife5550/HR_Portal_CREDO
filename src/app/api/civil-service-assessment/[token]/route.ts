/**
 * API: /api/civil-service-assessment/[token]
 *
 * GET - Beurteilungsformular laden (via Magic Link)
 * PUT - Bewertungen speichern (Zwischenspeichern)
 *
 * OEFFENTLICH - kein Auth erforderlich!
 * Zugang ausschliesslich ueber gueltigen Magic-Link-Token.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { tokenRateLimiter, getClientIp } from "@/lib/rate-limit";

// =============================================
// Typen fuer Template-Snapshot
// =============================================

interface SnapshotCriterion {
  id: string;
  weight: number;
}

interface SnapshotCategory {
  id: string;
  name: string;
  weight: number;
  criteria: SnapshotCriterion[];
}

interface TemplateSnapshot {
  categories: SnapshotCategory[];
}

/**
 * Gesamtnote berechnen (gewichteter Durchschnitt ueber Kategorien)
 */
function calculateOverallGrade(
  snapshot: TemplateSnapshot,
  ratingsMap: Record<string, number>
): { overallGrade: number; categoryAverages: Record<string, number> } | null {
  let totalCategoryWeight = 0;
  let weightedCategorySum = 0;
  const categoryAverages: Record<string, number> = {};

  for (const category of snapshot.categories) {
    let totalCriterionWeight = 0;
    let weightedCriterionSum = 0;

    for (const criterion of category.criteria) {
      const grade = ratingsMap[criterion.id];
      if (grade === undefined) continue;
      totalCriterionWeight += criterion.weight;
      weightedCriterionSum += criterion.weight * grade;
    }

    if (totalCriterionWeight === 0) continue;

    const categoryAvg = weightedCriterionSum / totalCriterionWeight;
    categoryAverages[category.id] = Math.round(categoryAvg * 100) / 100;
    totalCategoryWeight += category.weight;
    weightedCategorySum += category.weight * categoryAvg;
  }

  if (totalCategoryWeight === 0) return null;

  const overallGrade = Math.round((weightedCategorySum / totalCategoryWeight) * 100) / 100;
  return { overallGrade, categoryAverages };
}

/**
 * Pruefe ob Anforderungen erfuellt sind:
 * - Gesamtschnitt < 3.0
 * - Kein Bereich > 3.0
 * - Mind. 1 Bereich < 2.0
 */
function checkMeetsRequirements(
  overallGrade: number,
  categoryAverages: Record<string, number>
): boolean {
  if (overallGrade >= 3.0) return false;

  const averages = Object.values(categoryAverages);
  if (averages.some((avg) => avg > 3.0)) return false;
  if (!averages.some((avg) => avg < 2.0)) return false;

  return true;
}

// =============================================
// GET /api/civil-service-assessment/[token]
// =============================================
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    // Rate Limiting gegen Token-Enumeration
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
    const assessment = await prisma.civilServiceAssessment.findUnique({
      where: { token },
      include: {
        process: {
          select: {
            id: true,
            displayId: true,
            employeeFirstName: true,
            employeeLastName: true,
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

    if (!assessment) {
      return NextResponse.json({ error: "Ungueltiger Link" }, { status: 404 });
    }

    if (assessment.tokenExpiresAt < new Date()) {
      return NextResponse.json({ error: "Link ist abgelaufen" }, { status: 410 });
    }

    if (assessment.submittedAt) {
      return NextResponse.json(
        { error: "Diese Beurteilung wurde bereits eingereicht" },
        { status: 410 }
      );
    }

    // Tracking aktualisieren
    const now = new Date();
    await prisma.civilServiceAssessment.update({
      where: { id: assessment.id },
      data: {
        firstOpenedAt: assessment.firstOpenedAt ?? now,
        lastOpenedAt: now,
        openCount: { increment: 1 },
      },
    });

    return NextResponse.json({
      data: {
        id: assessment.id,
        assessmentNumber: assessment.assessmentNumber,
        assessmentType: assessment.assessmentType,
        recipientName: assessment.recipientName,
        recipientEmail: assessment.recipientEmail,
        templateSnapshot: assessment.templateSnapshot,
        scaleType: assessment.scaleType,
        ratingsData: assessment.ratingsData,
        referenceData: assessment.referenceData,
        gemeindeReferenz: assessment.gemeindeReferenz,
        overallGrade: assessment.overallGrade,
        meetsRequirements: assessment.meetsRequirements,
        meetsRequirementsManual: assessment.meetsRequirementsManual,
        overallReasoning: assessment.overallReasoning,
        // Workflow-Felder Phase 3
        scheduledDate: assessment.scheduledDate,
        announcedAt: assessment.announcedAt,
        fach: assessment.fach,
        klasse: assessment.klasse,
        vertrauenslehrkraft: assessment.vertrauenslehrkraft,
        unbiasedConfirmed: assessment.unbiasedConfirmed,
        unbiasedConfirmedAt: assessment.unbiasedConfirmedAt,
        postReviewAt: assessment.postReviewAt,
        postReviewNotes: assessment.postReviewNotes,
        beurteilungsgespraechAt: assessment.beurteilungsgespraechAt,
        beurteilungsgespraechNotes: assessment.beurteilungsgespraechNotes,
        verifyToken: assessment.verifyToken,
        employee: {
          name: `${assessment.process.employeeFirstName} ${assessment.process.employeeLastName}`,
          organizationName: assessment.process.organization.name,
        },
      },
    });
  } catch (error) {
    console.error("[API] Civil-Service Assessment Token-Zugriff fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// =============================================
// PUT /api/civil-service-assessment/[token]
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
    const assessment = await prisma.civilServiceAssessment.findUnique({
      where: { token },
    });

    if (!assessment) {
      return NextResponse.json({ error: "Ungueltiger Link" }, { status: 404 });
    }

    if (assessment.tokenExpiresAt < new Date()) {
      return NextResponse.json({ error: "Link ist abgelaufen" }, { status: 410 });
    }

    if (assessment.submittedAt) {
      return NextResponse.json(
        { error: "Diese Beurteilung wurde bereits eingereicht" },
        { status: 410 }
      );
    }

    // Body parsen
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Ungueltiger Request-Body" }, { status: 400 });
    }

    const {
      ratingsData,
      referenceData,
      gemeindeReferenz,
      // Workflow-Felder Phase 3
      scheduledDate,
      fach,
      klasse,
      vertrauenslehrkraft,
      unbiasedConfirmed,
      postReviewAt,
      postReviewNotes,
      beurteilungsgespraechAt,
      beurteilungsgespraechNotes,
      meetsRequirementsManual,
      overallReasoning,
    } = body;

    // Daten je nach Typ validieren und speichern
    const updateData: Record<string, unknown> = {};

    // Skala dynamisch ermitteln (BRL_1_5 → 5, sonst 6)
    const maxGrade = assessment.scaleType === "BRL_1_5" ? 5 : 6;

    if (assessment.assessmentType === "BEURTEILUNG") {
      // Noten validieren
      if (ratingsData && typeof ratingsData === "object") {
        for (const [key, value] of Object.entries(ratingsData)) {
          if (
            typeof value !== "number" ||
            value < 1 ||
            value > maxGrade ||
            !Number.isInteger(value)
          ) {
            return NextResponse.json(
              {
                error: `Ungueltige Note fuer ${key}: Wert muss zwischen 1 und ${maxGrade} liegen`,
              },
              { status: 400 },
            );
          }
        }

        updateData.ratingsData = ratingsData;

        // Gesamtschnitt berechnen — NUR Visualisierung, KEIN Gesamturteil!
        // BRL Nr. 7.5: Das Gesamturteil ist KEIN arithmetisches Mittel.
        const snapshot = assessment.templateSnapshot as unknown as TemplateSnapshot;
        if (snapshot) {
          const gradeResult = calculateOverallGrade(
            snapshot,
            ratingsData as Record<string, number>,
          );
          if (gradeResult) {
            updateData.overallGrade = gradeResult.overallGrade;
            // meetsRequirements nur als Legacy-Feld, nicht mehr als Entscheidung
            updateData.meetsRequirements = checkMeetsRequirements(
              gradeResult.overallGrade,
              gradeResult.categoryAverages,
            );
          }
        }
      }

      // Workflow-Felder
      if (scheduledDate !== undefined) {
        updateData.scheduledDate =
          scheduledDate === null ? null : new Date(scheduledDate);
      }
      if (fach !== undefined) updateData.fach = fach || null;
      if (klasse !== undefined) updateData.klasse = klasse || null;
      if (vertrauenslehrkraft !== undefined) {
        updateData.vertrauenslehrkraft = vertrauenslehrkraft || null;
      }
      if (unbiasedConfirmed !== undefined) {
        updateData.unbiasedConfirmed = Boolean(unbiasedConfirmed);
        if (unbiasedConfirmed) {
          updateData.unbiasedConfirmedAt = new Date();
        } else {
          updateData.unbiasedConfirmedAt = null;
        }
      }
      if (postReviewAt !== undefined) {
        updateData.postReviewAt =
          postReviewAt === null ? null : new Date(postReviewAt);
      }
      if (postReviewNotes !== undefined) {
        updateData.postReviewNotes = postReviewNotes || null;
      }
      if (beurteilungsgespraechAt !== undefined) {
        updateData.beurteilungsgespraechAt =
          beurteilungsgespraechAt === null
            ? null
            : new Date(beurteilungsgespraechAt);
      }
      if (beurteilungsgespraechNotes !== undefined) {
        updateData.beurteilungsgespraechNotes = beurteilungsgespraechNotes || null;
      }
      if (meetsRequirementsManual !== undefined) {
        updateData.meetsRequirementsManual =
          meetsRequirementsManual === null
            ? null
            : Boolean(meetsRequirementsManual);
      }
      if (overallReasoning !== undefined) {
        updateData.overallReasoning = overallReasoning || null;
      }
    } else if (assessment.assessmentType === "REFERENZ") {
      // Referenz-Daten speichern
      if (referenceData && typeof referenceData === "object") {
        updateData.referenceData = referenceData;
      }
      if (typeof gemeindeReferenz === "string") {
        updateData.gemeindeReferenz = gemeindeReferenz;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "Keine Daten zum Speichern" }, { status: 400 });
    }

    // Update
    const updated = await prisma.civilServiceAssessment.update({
      where: { id: assessment.id },
      data: updateData,
    });

    return NextResponse.json({
      data: {
        success: true,
        overallGrade: updated.overallGrade,
        meetsRequirements: updated.meetsRequirements,
        meetsRequirementsManual: updated.meetsRequirementsManual,
      },
    });
  } catch (error) {
    console.error("[API] Civil-Service Assessment speichern fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
