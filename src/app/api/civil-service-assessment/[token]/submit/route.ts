/**
 * API: /api/civil-service-assessment/[token]/submit
 *
 * POST - Schulleitung reicht die Beurteilung final ein
 *
 * OEFFENTLICH - kein Auth erforderlich!
 * Zugang ausschliesslich über gueltigen Magic-Link-Token.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { tokenRateLimiter, getClientIp } from "@/lib/rate-limit";
import { triggerWebhooks } from "@/lib/webhooks";
import { formatEmployeeName } from "@/lib/format";
import { autoCheckAssessmentChecklistItems } from "@/lib/civil-service-phases";

// Typen für den Template-Snapshot
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

    // Token validieren — inkl. Process+Organization für Webhook
    const assessment = await prisma.civilServiceAssessment.findUnique({
      where: { token },
      include: {
        process: {
          select: {
            id: true,
            displayId: true,
            employeeFirstName: true,
            employeeLastName: true,
            organization: { select: { name: true, mandantNumber: true } },
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
            error: `Es fehlen noch Bewertungen für ${missingCriteria.length} Kriterium(en). Bitte bewerten Sie alle Kriterien vor dem Einreichen.`,
            missingCriterionIds: missingCriteria,
          },
          { status: 400 }
        );
      }

      // BRL Nr. 4.10 — Befangenheitserklaerung muss vorliegen
      if (!assessment.unbiasedConfirmed) {
        return NextResponse.json(
          {
            error:
              "Bitte bestaetigen Sie in Schritt 1, dass keine Befangenheit vorliegt (BRL Nr. 4.10).",
          },
          { status: 400 },
        );
      }

      // BRL Nr. 7.5 — Manuelles Gesamturteil mit Pflichtbegruendung
      if (assessment.meetsRequirementsManual === null) {
        return NextResponse.json(
          {
            error:
              "Bitte treffen Sie in Schritt 3 ein manuelles Gesamturteil. Das Gesamturteil ist KEIN arithmetisches Mittel (BRL Nr. 7.5).",
          },
          { status: 400 },
        );
      }

      const reasoning = assessment.overallReasoning?.trim() ?? "";
      if (reasoning.length < 200) {
        return NextResponse.json(
          {
            error: `Die Begruendung des Gesamturteils ist zu kurz (${reasoning.length}/200 Zeichen). Bitte ergaenzen Sie die Begruendung in Schritt 3.`,
          },
          { status: 400 },
        );
      }

      // BRL Nr. 10.1 — Beurteilungsgespraech zwingend vor Abfassung
      if (!assessment.beurteilungsgespraechAt) {
        return NextResponse.json(
          {
            error:
              "Bitte dokumentieren Sie in Schritt 4 das Beurteilungsgespraech mit der Lehrkraft (BRL Nr. 10.1).",
          },
          { status: 400 },
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

    // Status auf submitted setzen — atomar gegen Race-Conditions:
    // updateMany mit submittedAt: null garantiert, dass nur EIN paralleler
    // Request den Submit ausloest. Bei count === 0 kam ein anderer Request
    // dazwischen.
    const submittedAt = new Date();
    const updateResult = await prisma.civilServiceAssessment.updateMany({
      where: { id: assessment.id, submittedAt: null },
      data: { submittedAt },
    });
    if (updateResult.count === 0) {
      return NextResponse.json(
        { error: "Diese Beurteilung wurde bereits eingereicht" },
        { status: 410 },
      );
    }

    // =============================================
    // Auto-Sync mit Checkliste (Phase 5 Bug-Fix)
    // Hakt die zur Beurteilung gehoerigen Checklisten-Items automatisch ab
    // und triggert die Phasen-Neuberechnung. Idempotent — wenn HR die Items
    // bereits manuell abgehakt hat, passiert hier nichts mehr.
    // =============================================
    const autoCheck = await autoCheckAssessmentChecklistItems({
      processId: assessment.process.id,
      assessmentNumber: assessment.assessmentNumber,
      assessmentType: assessment.assessmentType as "BEURTEILUNG" | "REFERENZ",
    }).catch((err) => {
      console.error(
        "[ASSESSMENT_SUBMITTED] Auto-Checklist-Sync-Fehler:",
        err instanceof Error ? err.message : err,
      );
      return { checkedItems: 0, phaseStatus: null, phaseKey: null };
    });

    // =============================================
    // Audit-Log + Webhook (oeffentliche Route, kein Session-User)
    // =============================================
    await prisma.auditLog
      .create({
        data: {
          userId: null, // oeffentliche Route, SL ist nicht eingeloggt
          civilServiceId: assessment.process.id,
          processType: "CIVIL_SERVICE",
          action: "ASSESSMENT_SUBMITTED",
          ipAddress: clientIp,
          details: {
            assessmentId: assessment.id,
            assessmentNumber: assessment.assessmentNumber,
            assessmentType: assessment.assessmentType,
            recipientEmail: assessment.recipientEmail,
            submittedAt: submittedAt.toISOString(),
            meetsRequirementsManual: assessment.meetsRequirementsManual,
            overallGrade: assessment.overallGrade,
            autoCheckedItems: autoCheck.checkedItems,
            autoCheckedPhase: autoCheck.phaseKey,
            autoCheckedPhaseStatus: autoCheck.phaseStatus,
          },
        },
      })
      .catch((err) =>
        console.error(
          "[ASSESSMENT_SUBMITTED] Audit-Log-Fehler:",
          err instanceof Error ? err.message : err,
        ),
      );

    // Webhook fire-and-forget
    triggerWebhooks("psi-assessment-completed", {
      civilServiceId: assessment.process.id,
      assessmentId: assessment.id,
      displayId: assessment.process.displayId,
      employeeName: formatEmployeeName(assessment.process),
      organization: assessment.process.organization.name,
      mandantNumber: assessment.process.organization.mandantNumber,
      assessmentNumber: assessment.assessmentNumber,
      assessmentType: assessment.assessmentType,
      recipientEmail: assessment.recipientEmail,
      recipientName: assessment.recipientName,
      submittedAt: submittedAt.toISOString(),
      meetsRequirementsManual: assessment.meetsRequirementsManual,
      overallGrade: assessment.overallGrade,
    }).catch((err) =>
      console.error(
        "[psi-assessment-completed] Webhook-Fehler:",
        err instanceof Error ? err.message : err,
      ),
    );

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("[API] Civil-Service Assessment einreichen fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
