/**
 * API: /api/zeugnis-bewertung/[token]/submit
 *
 * POST - Vorgesetzter reicht die Bewertung final ein
 *
 * OEFFENTLICH - kein Auth erforderlich!
 * Zugang ausschliesslich über gueltigen Magic-Link-Token.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { tokenRateLimiter, getClientIp } from "@/lib/rate-limit";

// Typ für den Template-Snapshot
interface SnapshotCriterion {
  id: string;
}

interface SnapshotCategory {
  criteria: SnapshotCriterion[];
}

interface TemplateSnapshot {
  categories: SnapshotCategory[];
}

// =============================================
// POST /api/zeugnis-bewertung/[token]/submit
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
    const bewertung = await prisma.zeugnisBewertung.findUnique({
      where: { token },
      include: { ratings: true },
    });

    if (!bewertung) {
      return NextResponse.json({ error: "Ungültiger Link" }, { status: 404 });
    }

    if (bewertung.tokenExpiresAt < new Date()) {
      return NextResponse.json({ error: "Link ist abgelaufen" }, { status: 410 });
    }

    if (!["INVITED", "IN_PROGRESS"].includes(bewertung.status)) {
      return NextResponse.json(
        { error: "Diese Bewertung wurde bereits eingereicht" },
        { status: 410 }
      );
    }

    // Pruefen ob alle Kriterien bewertet wurden
    const snapshot = bewertung.templateSnapshot as unknown as TemplateSnapshot;
    const allCriterionIds = new Set<string>();
    for (const category of snapshot.categories) {
      for (const criterion of category.criteria) {
        allCriterionIds.add(criterion.id);
      }
    }

    const ratedCriterionIds = new Set(
      bewertung.ratings.map((r) => r.snapshotCriterionId)
    );

    const missingCriteria = [...allCriterionIds].filter(
      (id) => !ratedCriterionIds.has(id)
    );

    if (missingCriteria.length > 0) {
      return NextResponse.json(
        {
          error: `Es fehlen noch Bewertungen für ${missingCriteria.length} Kriterium(en). Bitte bewerten Sie alle Kriterien vor dem Einreichen.`,
          missingCriterionIds: missingCriteria,
        },
        { status: 400 }
      );
    }

    // Status auf SUBMITTED setzen
    await prisma.zeugnisBewertung.update({
      where: { id: bewertung.id },
      data: {
        status: "SUBMITTED",
        supervisorSubmittedAt: new Date(),
      },
    });

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("[API] Zeugnis-Bewertung einreichen fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
