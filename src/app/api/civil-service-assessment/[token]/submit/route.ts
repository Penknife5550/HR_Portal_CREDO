/**
 * API: /api/civil-service-assessment/[token]/submit
 *
 * POST - Schulleitung reicht die Beurteilung final ein
 *
 * OEFFENTLICH - kein Auth erforderlich!
 * Zugang ausschliesslich ueber gueltigen Magic-Link-Token.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { tokenRateLimiter, getClientIp } from "@/lib/rate-limit";

// Typen fuer den Template-Snapshot
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

// =============================================
// POST /api/civil-service-assessment/[token]/submit
// =============================================
export async function POST(
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

    // Je nach Typ unterschiedliche Vollstaendigkeit pruefen
    if (assessment.assessmentType === "BEURTEILUNG") {
      // Pruefen ob alle Kriterien bewertet wurden
      const snapshot = assessment.templateSnapshot as unknown as TemplateSnapshot | null;
      if (!snapshot) {
        return NextResponse.json(
          { error: "Kein Bewertungstemplate vorhanden" },
          { status: 400 }
        );
      }

      const ratingsData = (assessment.ratingsData as Record<string, number>) || {};
      const allCriterionIds: string[] = [];
      for (const category of snapshot.categories) {
        for (const criterion of category.criteria) {
          allCriterionIds.push(criterion.id);
        }
      }

      const missingCriteria = allCriterionIds.filter((id) => ratingsData[id] === undefined);
      if (missingCriteria.length > 0) {
        return NextResponse.json(
          {
            error: `Es fehlen noch Bewertungen fuer ${missingCriteria.length} Kriterium(en). Bitte bewerten Sie alle Kriterien vor dem Einreichen.`,
            missingCriterionIds: missingCriteria,
          },
          { status: 400 }
        );
      }
    } else if (assessment.assessmentType === "REFERENZ") {
      // Pruefen ob Referenz-Daten und Gemeinde-Referenz vorhanden
      const referenceData = assessment.referenceData as Record<string, string> | null;
      if (!referenceData || Object.keys(referenceData).length === 0) {
        return NextResponse.json(
          { error: "Bitte beantworten Sie alle Pruefpunkte vor dem Einreichen." },
          { status: 400 }
        );
      }

      if (!assessment.gemeindeReferenz || assessment.gemeindeReferenz.trim().length === 0) {
        return NextResponse.json(
          { error: "Bitte geben Sie die Gemeinde-Referenz an." },
          { status: 400 }
        );
      }
    }

    // Status auf submitted setzen
    await prisma.civilServiceAssessment.update({
      where: { id: assessment.id },
      data: {
        submittedAt: new Date(),
      },
    });

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("[API] Civil-Service Assessment einreichen fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
