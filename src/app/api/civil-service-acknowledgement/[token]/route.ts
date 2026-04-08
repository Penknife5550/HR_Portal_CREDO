/**
 * API: /api/civil-service-acknowledgement/[token]
 *
 * GET  — Beurteilung als Read-Only fuer die Lehrkraft laden (oeffentlich, kein Auth)
 * POST — Lehrkraft bestaetigt die Bekanntgabe und gibt optional eine
 *        Gegenaeusserung ab (§ 92 Abs. 1 Satz 6 LBG NRW).
 *
 * OEFFENTLICH — Zugang ueber Magic-Link-Token (employeeAckToken).
 * Rate-Limit auf den Token, damit Token-Enumeration ausgeschlossen ist.
 *
 * Vertraulichkeit: Es werden nur die Beurteilungs-Felder zurueckgegeben,
 * die fuer die Lehrkraft bestimmt sind. Sensible Stamm-Daten wie IBAN,
 * Steuer-ID etc. liegen ohnehin in einer anderen Tabelle.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { tokenRateLimiter, getClientIp } from "@/lib/rate-limit";
import { triggerWebhooks } from "@/lib/webhooks";
import { formatEmployeeName } from "@/lib/format";

type RouteContext = { params: Promise<{ token: string }> };

const MAX_REBUTTAL_LENGTH = 10_000;

// =============================================
// GET /api/civil-service-acknowledgement/[token]
// =============================================
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const clientIp = getClientIp(request);
    const rl = tokenRateLimiter.check(clientIp);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Zu viele Anfragen. Bitte warten Sie." },
        { status: 429 },
      );
    }

    const { token } = await context.params;

    const assessment = await prisma.civilServiceAssessment.findUnique({
      where: { employeeAckToken: token },
      include: {
        process: {
          select: {
            id: true,
            displayId: true,
            employeeFirstName: true,
            employeeLastName: true,
            organization: { select: { name: true } },
          },
        },
      },
    });

    if (!assessment) {
      return NextResponse.json({ error: "Ungueltiger Link" }, { status: 404 });
    }

    if (
      !assessment.employeeAckExpiresAt ||
      assessment.employeeAckExpiresAt < new Date()
    ) {
      return NextResponse.json(
        { error: "Link ist abgelaufen" },
        { status: 410 },
      );
    }

    if (!assessment.submittedAt) {
      return NextResponse.json(
        {
          error:
            "Diese Beurteilung wurde noch nicht von der Schulleitung eingereicht.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      data: {
        id: assessment.id,
        assessmentNumber: assessment.assessmentNumber,
        assessmentType: assessment.assessmentType,
        recipientName: assessment.recipientName,
        recipientEmail: assessment.recipientEmail,

        // Bewertung
        templateSnapshot: assessment.templateSnapshot,
        scaleType: assessment.scaleType,
        ratingsData: assessment.ratingsData,
        referenceData: assessment.referenceData,
        gemeindeReferenz: assessment.gemeindeReferenz,
        overallGrade: assessment.overallGrade,
        meetsRequirementsManual: assessment.meetsRequirementsManual,
        overallReasoning: assessment.overallReasoning,

        // Workflow-Felder (Read-Only fuer LK)
        scheduledDate: assessment.scheduledDate?.toISOString() ?? null,
        announcedAt: assessment.announcedAt?.toISOString() ?? null,
        fach: assessment.fach,
        klasse: assessment.klasse,
        vertrauenslehrkraft: assessment.vertrauenslehrkraft,
        unbiasedConfirmed: assessment.unbiasedConfirmed,
        unbiasedConfirmedAt: assessment.unbiasedConfirmedAt?.toISOString() ?? null,
        postReviewAt: assessment.postReviewAt?.toISOString() ?? null,
        postReviewNotes: assessment.postReviewNotes,
        beurteilungsgespraechAt:
          assessment.beurteilungsgespraechAt?.toISOString() ?? null,
        beurteilungsgespraechNotes: assessment.beurteilungsgespraechNotes,

        submittedAt: assessment.submittedAt.toISOString(),
        releasedToEmployeeAt:
          assessment.releasedToEmployeeAt?.toISOString() ?? null,

        // Quittungs-Status
        acknowledgedByEmployeeAt:
          assessment.acknowledgedByEmployeeAt?.toISOString() ?? null,
        rebuttalText: assessment.rebuttalText,
        rebuttalAt: assessment.rebuttalAt?.toISOString() ?? null,
        archivedAt: assessment.archivedAt?.toISOString() ?? null,

        // Verifikation (Phase 6 Vorbereitung)
        verifyToken: assessment.verifyToken,

        // Mitarbeiter-Stammdaten
        employee: {
          name: formatEmployeeName(assessment.process),
          organizationName: assessment.process.organization.name,
        },
      },
    });
  } catch (error) {
    console.error(
      "[API] Bekanntgabe-Lesen fehlgeschlagen:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 },
    );
  }
}

// =============================================
// POST /api/civil-service-acknowledgement/[token]
// =============================================
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const clientIp = getClientIp(request);
    const rl = tokenRateLimiter.check(clientIp);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Zu viele Anfragen. Bitte warten Sie." },
        { status: 429 },
      );
    }

    const { token } = await context.params;

    const assessment = await prisma.civilServiceAssessment.findUnique({
      where: { employeeAckToken: token },
      include: {
        process: {
          select: {
            id: true,
            displayId: true,
            employeeFirstName: true,
            employeeLastName: true,
            employeeEmail: true,
            organization: { select: { name: true, mandantNumber: true } },
          },
        },
      },
    });

    if (!assessment) {
      return NextResponse.json({ error: "Ungueltiger Link" }, { status: 404 });
    }
    if (
      !assessment.employeeAckExpiresAt ||
      assessment.employeeAckExpiresAt < new Date()
    ) {
      return NextResponse.json(
        { error: "Link ist abgelaufen" },
        { status: 410 },
      );
    }
    if (!assessment.submittedAt) {
      return NextResponse.json(
        {
          error:
            "Diese Beurteilung wurde noch nicht von der Schulleitung eingereicht.",
        },
        { status: 400 },
      );
    }
    if (assessment.acknowledgedByEmployeeAt) {
      return NextResponse.json(
        {
          error:
            "Diese Beurteilung wurde bereits quittiert und kann nicht erneut bestaetigt werden.",
        },
        { status: 410 },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { error: "Ungueltiger Request-Body" },
        { status: 400 },
      );
    }

    const { acknowledged, rebuttalText } = body as {
      acknowledged?: boolean;
      rebuttalText?: string | null;
    };

    if (acknowledged !== true) {
      return NextResponse.json(
        { error: "Bitte bestaetigen Sie die Kenntnisnahme explizit." },
        { status: 400 },
      );
    }

    let cleanedRebuttal: string | null = null;
    if (typeof rebuttalText === "string" && rebuttalText.trim().length > 0) {
      if (rebuttalText.length > MAX_REBUTTAL_LENGTH) {
        return NextResponse.json(
          {
            error: `Gegenaeusserung darf maximal ${MAX_REBUTTAL_LENGTH} Zeichen lang sein.`,
          },
          { status: 400 },
        );
      }
      cleanedRebuttal = rebuttalText.trim();
    }

    const now = new Date();

    // Atomar gegen Doppel-Quittung (Race Condition):
    // updateMany mit acknowledgedByEmployeeAt: null garantiert,
    // dass nur EIN paralleler Request die Quittung schreibt.
    const updateResult = await prisma.civilServiceAssessment.updateMany({
      where: { id: assessment.id, acknowledgedByEmployeeAt: null },
      data: {
        acknowledgedByEmployeeAt: now,
        acknowledgedByEmployeeIp: clientIp,
        rebuttalText: cleanedRebuttal,
        rebuttalAt: cleanedRebuttal ? now : null,
      },
    });
    if (updateResult.count === 0) {
      return NextResponse.json(
        {
          error:
            "Diese Beurteilung wurde bereits quittiert und kann nicht erneut bestaetigt werden.",
        },
        { status: 410 },
      );
    }

    // Audit-Log (oeffentliche Route, kein Session-User)
    await prisma.auditLog
      .create({
        data: {
          userId: null,
          civilServiceId: assessment.process.id,
          processType: "CIVIL_SERVICE",
          action: "ASSESSMENT_ACKNOWLEDGED",
          ipAddress: clientIp,
          details: {
            assessmentId: assessment.id,
            assessmentNumber: assessment.assessmentNumber,
            assessmentType: assessment.assessmentType,
            acknowledgedAt: now.toISOString(),
            hasRebuttal: Boolean(cleanedRebuttal),
            rebuttalLength: cleanedRebuttal?.length ?? 0,
          },
        },
      })
      .catch((err) =>
        console.error(
          "[ASSESSMENT_ACKNOWLEDGED] Audit-Log-Fehler:",
          err instanceof Error ? err.message : err,
        ),
      );

    // Webhook fire-and-forget
    triggerWebhooks("psi-assessment-acknowledged", {
      civilServiceId: assessment.process.id,
      assessmentId: assessment.id,
      displayId: assessment.process.displayId,
      employeeName: formatEmployeeName(assessment.process),
      employeeEmail: assessment.process.employeeEmail,
      organization: assessment.process.organization.name,
      mandantNumber: assessment.process.organization.mandantNumber,
      assessmentNumber: assessment.assessmentNumber,
      assessmentType: assessment.assessmentType,
      acknowledgedAt: now.toISOString(),
      hasRebuttal: Boolean(cleanedRebuttal),
    }).catch((err) =>
      console.error(
        "[psi-assessment-acknowledged] Webhook-Fehler:",
        err instanceof Error ? err.message : err,
      ),
    );

    return NextResponse.json({
      data: {
        success: true,
        acknowledgedAt: now.toISOString(),
        hasRebuttal: Boolean(cleanedRebuttal),
      },
    });
  } catch (error) {
    console.error(
      "[API] Bekanntgabe-Quittung fehlgeschlagen:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 },
    );
  }
}
