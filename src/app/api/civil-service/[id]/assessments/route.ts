/**
 * API: /api/civil-service/[id]/assessments
 *
 * POST - Beurteilung erstellen (SL zur Bewertung auffordern)
 * GET  - Alle Beurteilungen für diesen Prozess auflisten
 *
 * Auth erforderlich (HR_LEITUNG, SUPER_ADMIN)
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { randomUUID } from "crypto";
import { BRL_DEFAULT_TEMPLATE, BRL_SCALE_LABELS } from "@/lib/beurteilung-defaults";
import { triggerWebhooks } from "@/lib/webhooks";
import { formatEmployeeName } from "@/lib/format";
import { getBaseUrl } from "@/lib/url";

const ALLOWED_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];

/** BRL Nr. 8.3 — Mindest-Ankündigungsfrist in Tagen */
const MIN_NOTICE_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type RouteContext = { params: Promise<{ id: string }> };

// =============================================
// POST /api/civil-service/[id]/assessments
// Snapshot-Quelle: BeurteilungTemplate (DB) → Mandanten-Default → Globaler Default
//                  → Hardcoded BRL_DEFAULT_TEMPLATE aus beurteilung-defaults.ts (Fallback)
// =============================================
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!ALLOWED_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id } = await context.params;

    // Prozess pruefen — inkl. Organization-Daten für Webhook + Mandanten-Default
    const process = await prisma.civilServiceProcess.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        displayId: true,
        employeeFirstName: true,
        employeeLastName: true,
        organizationId: true,
        organization: { select: { name: true, mandantNumber: true } },
      },
    });

    if (!process) {
      return NextResponse.json({ error: "Prozess nicht gefunden" }, { status: 404 });
    }

    // Body parsen
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Ungueltiger Request-Body" }, { status: 400 });
    }

    const {
      assessmentNumber,
      assessmentType,
      recipientEmail,
      recipientName,
      templateId,
      scheduledDate,
      fach,
      klasse,
      acknowledgeShortNotice,
    } = body;

    // Validierung
    if (![1, 2, 3].includes(assessmentNumber)) {
      return NextResponse.json({ error: "assessmentNumber muss 1, 2 oder 3 sein" }, { status: 400 });
    }

    if (!["BEURTEILUNG", "REFERENZ"].includes(assessmentType)) {
      return NextResponse.json({ error: "assessmentType muss BEURTEILUNG oder REFERENZ sein" }, { status: 400 });
    }

    if (!recipientEmail || typeof recipientEmail !== "string") {
      return NextResponse.json({ error: "recipientEmail ist erforderlich" }, { status: 400 });
    }

    // BRL Nr. 8.3 — 14-Tage-Frist pruefen (nur für BEURTEILUNG mit Termin)
    let scheduledDateParsed: Date | null = null;
    if (scheduledDate && typeof scheduledDate === "string") {
      const parsed = new Date(scheduledDate);
      if (!Number.isNaN(parsed.getTime())) scheduledDateParsed = parsed;
    }

    if (
      assessmentType === "BEURTEILUNG" &&
      scheduledDateParsed &&
      !acknowledgeShortNotice
    ) {
      const daysUntil = Math.floor(
        (scheduledDateParsed.getTime() - Date.now()) / MS_PER_DAY,
      );
      if (daysUntil < MIN_NOTICE_DAYS) {
        return NextResponse.json(
          {
            error: `Termin liegt nur ${daysUntil} Tage in der Zukunft. BRL Nr. 8.3 fordert mindestens ${MIN_NOTICE_DAYS} Tage Ankuendigungsfrist. Bitte mit "acknowledgeShortNotice: true" bestaetigen, falls Sie die Frist bewusst unterschreiten.`,
            shortNotice: true,
            daysUntil,
            minDays: MIN_NOTICE_DAYS,
          },
          { status: 400 },
        );
      }
    }

    // Pruefen ob bereits vorhanden
    const existing = await prisma.civilServiceAssessment.findUnique({
      where: {
        processId_assessmentNumber_assessmentType: {
          processId: id,
          assessmentNumber,
          assessmentType,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Beurteilung Nr. ${assessmentNumber} (${assessmentType}) existiert bereits` },
        { status: 409 }
      );
    }

    // =============================================
    // Template-Snapshot für BEURTEILUNG
    // Aufloesungs-Reihenfolge:
    //   1. body.templateId (explizit gewaehlt)
    //   2. Mandanten-Default (organizationId == process.organizationId, isDefault: true)
    //   3. Globaler Default (organizationId: null, isDefault: true)
    //   4. Fallback: BRL_DEFAULT_TEMPLATE aus beurteilung-defaults.ts
    // =============================================
    let chosenTemplateId: string | null = null;
    let chosenScaleType: string = "BRL_1_5";
    let templateSnapshot: Prisma.InputJsonValue | null = null;

    if (assessmentType === "BEURTEILUNG") {
      let dbTemplate = null;

      if (templateId && typeof templateId === "string") {
        dbTemplate = await prisma.beurteilungTemplate.findFirst({
          where: { id: templateId, isActive: true },
          include: {
            categories: {
              orderBy: { orderIndex: "asc" },
              include: { criteria: { orderBy: { orderIndex: "asc" } } },
            },
          },
        });
        if (!dbTemplate) {
          return NextResponse.json(
            { error: "Gewaehlte Vorlage nicht gefunden oder deaktiviert" },
            { status: 400 }
          );
        }
      }

      // Mandanten-Default
      if (!dbTemplate) {
        dbTemplate = await prisma.beurteilungTemplate.findFirst({
          where: {
            organizationId: process.organizationId,
            isDefault: true,
            isActive: true,
          },
          include: {
            categories: {
              orderBy: { orderIndex: "asc" },
              include: { criteria: { orderBy: { orderIndex: "asc" } } },
            },
          },
        });
      }

      // Globaler Default
      if (!dbTemplate) {
        dbTemplate = await prisma.beurteilungTemplate.findFirst({
          where: { organizationId: null, isDefault: true, isActive: true },
          include: {
            categories: {
              orderBy: { orderIndex: "asc" },
              include: { criteria: { orderBy: { orderIndex: "asc" } } },
            },
          },
        });
      }

      if (dbTemplate) {
        chosenTemplateId = dbTemplate.id;
        chosenScaleType = dbTemplate.scaleType;
        templateSnapshot = {
          templateId: dbTemplate.id,
          name: dbTemplate.name,
          version: dbTemplate.version,
          scaleType: dbTemplate.scaleType,
          scaleLabels: dbTemplate.scaleLabels,
          categories: dbTemplate.categories.map((cat) => ({
            id: cat.id,
            name: cat.name,
            description: cat.description,
            weight: cat.weight,
            orderIndex: cat.orderIndex,
            isMandatory: cat.isMandatory,
            legalReference: cat.legalReference,
            criteria: cat.criteria.map((crit) => ({
              id: crit.id,
              name: crit.name,
              description: crit.description,
              weight: crit.weight,
              orderIndex: crit.orderIndex,
            })),
          })),
        };
      } else {
        // Fallback auf hardcoded BRL-Default
        templateSnapshot = {
          templateId: null,
          name: BRL_DEFAULT_TEMPLATE.name,
          version: 0,
          scaleType: BRL_DEFAULT_TEMPLATE.scaleType,
          scaleLabels: BRL_SCALE_LABELS,
          categories: BRL_DEFAULT_TEMPLATE.categories.map((cat, ci) => ({
            id: `fallback-cat-${ci}`,
            name: cat.name,
            description: cat.description ?? null,
            weight: cat.weight ?? 1.0,
            orderIndex: cat.orderIndex,
            isMandatory: cat.isMandatory ?? false,
            legalReference: cat.legalReference ?? null,
            criteria: cat.criteria.map((crit, cri) => ({
              id: `fallback-crit-${ci}-${cri}`,
              name: crit.name,
              description: crit.description ?? null,
              weight: crit.weight ?? 1.0,
              orderIndex: crit.orderIndex,
            })),
          })),
        };
      }
    }

    // Token generieren
    const token = randomUUID();
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 90);

    // Verify-Token (Phase 6 — Audit-Page)
    const verifyToken = randomUUID();

    // Assessment erstellen
    const assessment = await prisma.civilServiceAssessment.create({
      data: {
        processId: id,
        assessmentNumber,
        assessmentType,
        token,
        tokenExpiresAt,
        recipientEmail: recipientEmail.trim().toLowerCase(),
        recipientName: recipientName?.trim() || null,
        templateId: chosenTemplateId,
        scaleType: assessmentType === "BEURTEILUNG" ? chosenScaleType : null,
        templateSnapshot: templateSnapshot ?? undefined,
        scheduledDate: scheduledDateParsed,
        fach: fach?.trim() || null,
        klasse: klasse?.trim() || null,
        announcedAt: new Date(),
        verifyToken,
        sentAt: new Date(),
      },
    });

    // =============================================
    // Audit-Log + Webhook (fire-and-forget)
    // =============================================
    const magicLink = `${getBaseUrl()}/civil-service-assessment/${assessment.token}`;

    // Audit-Log (HR-Aktion, mit User)
    await prisma.auditLog
      .create({
        data: {
          userId: session.userId,
          civilServiceId: id,
          processType: "CIVIL_SERVICE",
          action: "ASSESSMENT_REQUESTED",
          details: {
            assessmentId: assessment.id,
            assessmentNumber: assessment.assessmentNumber,
            assessmentType: assessment.assessmentType,
            recipientEmail: assessment.recipientEmail,
            recipientName: assessment.recipientName,
            templateId: assessment.templateId,
            scheduledDate: assessment.scheduledDate?.toISOString() ?? null,
            fach: assessment.fach,
            klasse: assessment.klasse,
            shortNoticeOverride: Boolean(acknowledgeShortNotice),
          },
        },
      })
      .catch((err) =>
        console.error(
          "[ASSESSMENT_REQUESTED] Audit-Log-Fehler:",
          err instanceof Error ? err.message : err,
        ),
      );

    // Webhook fire-and-forget
    triggerWebhooks("psi-assessment-requested", {
      civilServiceId: id,
      assessmentId: assessment.id,
      displayId: process.displayId,
      employeeName: formatEmployeeName(process),
      organization: process.organization.name,
      mandantNumber: process.organization.mandantNumber,
      assessmentNumber: assessment.assessmentNumber,
      assessmentType: assessment.assessmentType,
      recipientEmail: assessment.recipientEmail,
      recipientName: assessment.recipientName,
      magicLink,
      tokenExpiresAt: assessment.tokenExpiresAt.toISOString(),
      scheduledDate: assessment.scheduledDate?.toISOString() ?? null,
      fach: assessment.fach,
      klasse: assessment.klasse,
    }).catch((err) =>
      console.error(
        "[psi-assessment-requested] Webhook-Fehler:",
        err instanceof Error ? err.message : err,
      ),
    );

    return NextResponse.json({
      data: {
        id: assessment.id,
        token: assessment.token,
        assessmentNumber: assessment.assessmentNumber,
        assessmentType: assessment.assessmentType,
        recipientEmail: assessment.recipientEmail,
        recipientName: assessment.recipientName,
        tokenExpiresAt: assessment.tokenExpiresAt,
        createdAt: assessment.createdAt,
        templateId: assessment.templateId,
        scaleType: assessment.scaleType,
        scheduledDate: assessment.scheduledDate,
        verifyToken: assessment.verifyToken,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("[API] Civil-Service Assessment erstellen fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// =============================================
// GET /api/civil-service/[id]/assessments
// =============================================
export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!ALLOWED_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id } = await context.params;

    const assessments = await prisma.civilServiceAssessment.findMany({
      where: { processId: id },
      orderBy: [
        { assessmentNumber: "asc" },
        { assessmentType: "asc" },
      ],
      select: {
        id: true,
        assessmentNumber: true,
        assessmentType: true,
        recipientEmail: true,
        recipientName: true,
        token: true,
        tokenExpiresAt: true,
        sentAt: true,
        firstOpenedAt: true,
        lastOpenedAt: true,
        openCount: true,
        submittedAt: true,
        overallGrade: true,
        meetsRequirements: true,
        lastReminderAt: true,
        reminderCount: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ data: assessments });
  } catch (error) {
    console.error("[API] Civil-Service Assessments auflisten fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
