/**
 * API: /api/offboarding/[id]/zeugnis-bewertung/hr-review
 *
 * PUT - HR prueft und passt die Zeugnis-Bewertung an
 *
 * Berechtigung: ADMIN_ROLES (SUPER_ADMIN, HR_LEITUNG) — unveraendert. Mandant
 * per canAccessProcess: unbekannt und fremd = dieselbe 404.
 *
 * Geprueft wird erst, wenn die Fuehrungskraft eingereicht hat (SUBMITTED oder
 * HR_REVIEW): Der Bewertungslink nimmt nur INVITED/IN_PROGRESS an — ein
 * HR-Review davor haette ihn still beendet. Der ganze Body wird VOR dem ersten
 * Schreiben geprueft (frueher brach die Schleife nach halb geschriebenen
 * Noten mit 404 ab), Noten, Bewertung und AuditLog gehen in EINER Transaktion,
 * bedingt auf den gelesenen Status — zwei gleichzeitige Finalisierungen
 * schreiben nicht zweimal.
 */

import { NextResponse } from "next/server";
import type { z } from "zod";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { ADMIN_ROLES } from "@/lib/permissions";
import { nichtGefunden, offboardingZugaenglich } from "@/lib/offboarding-zugriff";
import { zeugnisHrReviewSchema } from "@/lib/validations/zeugnis";

/** Erst nach der Einreichung durch die Fuehrungskraft pruefbar. */
const PRUEFBARE_STATUS = ["SUBMITTED", "HR_REVIEW"] as const;

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
export const PUT = apiHandler<z.infer<typeof zeugnisHrReviewSchema>>(
  { roles: ADMIN_ROLES, bodySchema: zeugnisHrReviewSchema, logLabel: "Offboarding/Zeugnis-HR-Review" },
  async ({ params, session, body }) => {
    const id = params.id;
    if (!(await offboardingZugaenglich(session!, id))) return nichtGefunden();

    const { ratings, hrNotes, finalize } = body;

    // Bewertung laden
    const bewertung = await prisma.zeugnisBewertung.findUnique({
      where: { offboardingId: id },
      include: { ratings: true },
    });
    if (!bewertung) {
      return nichtGefunden("Für diesen Vorgang gibt es noch keine Zeugnis-Bewertung.");
    }

    if (bewertung.status === "FINALIZED") {
      return NextResponse.json({ error: "Diese Bewertung ist bereits abgeschlossen." }, { status: 409 });
    }
    if (!(PRUEFBARE_STATUS as readonly string[]).includes(bewertung.status)) {
      return NextResponse.json(
        { error: "Die Führungskraft hat die Bewertung noch nicht eingereicht." },
        { status: 409 }
      );
    }

    // Erst alles pruefen, dann schreiben: Jede Note muss zu einem Kriterium
    // DIESER Bewertung gehoeren.
    const aenderungen: { ratingId: string; hrOverrideGrade: number | null; hrOverrideReason: string | null }[] = [];
    for (const r of ratings ?? []) {
      const vorhanden = bewertung.ratings.find((er) => er.snapshotCriterionId === r.snapshotCriterionId);
      if (!vorhanden) {
        return NextResponse.json(
          { error: "Mindestens eine Note gehört zu keinem Kriterium dieser Bewertung." },
          { status: 400 }
        );
      }
      aenderungen.push({
        ratingId: vorhanden.id,
        hrOverrideGrade: r.hrOverrideGrade ?? null,
        hrOverrideReason: r.hrOverrideReason ?? null,
      });
    }

    // Gesamtnote aus dem kuenftigen Stand
    const ratingsMap = new Map(
      bewertung.ratings.map((r) => {
        const neu = aenderungen.find((a) => a.ratingId === r.id);
        return [
          r.snapshotCriterionId,
          { grade: r.grade, hrOverrideGrade: neu ? neu.hrOverrideGrade : r.hrOverrideGrade },
        ];
      })
    );
    const gradeResult = calculateOverallGrade(
      bewertung.templateSnapshot as unknown as TemplateSnapshot,
      ratingsMap
    );

    const jetzt = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      // Bedingt auf den gelesenen Status: Eine gleichzeitige Finalisierung
      // gewinnt, diese schreibt dann nichts.
      const { count } = await tx.zeugnisBewertung.updateMany({
        where: { id: bewertung.id, status: bewertung.status },
        data: {
          hrReviewedAt: jetzt,
          hrReviewedById: session!.userId,
          overallGrade: gradeResult?.overallGrade ?? null,
          overallGradeRounded: gradeResult?.overallGradeRounded ?? null,
          ...(hrNotes !== undefined ? { hrNotes } : {}),
          ...(finalize
            ? { status: "FINALIZED" as const, finalizedAt: jetzt, finalizedById: session!.userId }
            : { status: "HR_REVIEW" as const }),
        },
      });
      if (count === 0) return null;

      for (const a of aenderungen) {
        await tx.zeugnisBewertungRating.update({
          where: { id: a.ratingId },
          data: { hrOverrideGrade: a.hrOverrideGrade, hrOverrideReason: a.hrOverrideReason },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: session!.userId,
          offboardingId: id,
          processType: "OFFBOARDING",
          action: finalize ? "ZEUGNIS_BEWERTUNG_FINALIZED" : "ZEUGNIS_BEWERTUNG_HR_REVIEWED",
          details: {
            zeugnisBewertungId: bewertung.id,
            overallGrade: gradeResult?.overallGrade ?? null,
            overallGradeRounded: gradeResult?.overallGradeRounded ?? null,
            geaenderteNoten: aenderungen.length,
            finalized: !!finalize,
          },
        },
      });

      return tx.zeugnisBewertung.findUnique({
        where: { id: bewertung.id },
        include: {
          ratings: true,
          hrReviewedBy: { select: { id: true, firstName: true, lastName: true } },
          finalizedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      });
    });

    if (!updated) {
      return NextResponse.json(
        { error: "Die Bewertung wurde inzwischen geändert. Bitte die Seite neu laden." },
        { status: 409 }
      );
    }
    return NextResponse.json({ data: updated });
  }
);
