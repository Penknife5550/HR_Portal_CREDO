/**
 * API: /api/onboarding
 *
 * POST – Neuen Onboarding-Vorgang anlegen (für n8n oder Dashboard)
 * GET  – Alle Vorgaenge auflisten (für Dashboard)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateToken, getTokenExpiryDate, getSession } from "@/lib/auth";
import { triggerN8nWebhook } from "@/lib/n8n";
import { orgFilter, PORTAL_ROLES, PROCESS_CREATE_ROLES } from "@/lib/permissions";

// =============================================
// POST /api/onboarding – Neuen Vorgang anlegen
// =============================================
export async function POST(request: NextRequest) {
  try {
    // Auth + Rollen-Check
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }
    if (!PROCESS_CREATE_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const body = await request.json();

    const { email, organizationId, questionnaireType, processType } = body;
    const invitedById = session.userId;

    // Validierung
    if (!email || !organizationId) {
      return NextResponse.json(
        { error: "email und organizationId sind Pflichtfelder" },
        { status: 400 }
      );
    }

    // Pruefen ob Organisation existiert (inkl. shortName für displayId)
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org) {
      return NextResponse.json(
        { error: "Organisation nicht gefunden" },
        { status: 404 }
      );
    }

    // Token generieren
    const token = generateToken();
    const tokenExpiresAt = getTokenExpiryDate();

    // Vorgangs-ID generieren: {Jahr}-{Org-Kuerzel}-{laufende Nummer}
    // Retry-Logik gegen Race-Condition bei gleichzeitigen Requests
    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear + 1, 0, 1);
    const shortName = org.shortName || org.mandantNumber;

    let displayId = "";
    let sequentialNumber = 0;
    for (let attempt = 0; attempt < 5; attempt++) {
      const countThisYear = await prisma.onboardingProcess.count({
        where: { createdAt: { gte: yearStart, lt: yearEnd } },
      });
      sequentialNumber = countThisYear + 1 + attempt;
      displayId = `${currentYear}-${shortName}-${sequentialNumber
        .toString()
        .padStart(3, "0")}`;
      const exists = await prisma.onboardingProcess.findUnique({
        where: { displayId },
        select: { id: true },
      });
      if (!exists) break;
    }

    // Onboarding-Vorgang anlegen
    // ProcessType validieren
    const VALID_PROCESS_TYPES = ["EINSTELLUNG", "VERBEAMTUNG", "VERTRAGSAENDERUNG", "KUENDIGUNG"];
    const resolvedProcessType = processType && VALID_PROCESS_TYPES.includes(processType)
      ? processType
      : "EINSTELLUNG";

    const onboarding = await prisma.onboardingProcess.create({
      data: {
        email,
        organizationId,
        processType: resolvedProcessType,
        questionnaireType: questionnaireType || "STANDARD",
        token,
        tokenExpiresAt,
        invitedById: invitedById || null,
        status: "INVITED",
        displayId,
        sequentialNumber,
      },
      include: {
        organization: true,
      },
    });

    // PersonalData-Datensatz anlegen (leer, wird vom MA gefuellt)
    await prisma.personalData.create({
      data: {
        onboardingId: onboarding.id,
      },
    });

    // Fragebogen-Versionierung: Template-Snapshot zum Zeitpunkt der Erstellung speichern
    const effectiveTypeForTemplate = questionnaireType || "STANDARD";
    const formTemplate = await prisma.formTemplate.findUnique({
      where: { questionnaireType: effectiveTypeForTemplate },
    });
    if (formTemplate) {
      await prisma.onboardingProcess.update({
        where: { id: onboarding.id },
        data: {
          formTemplateVersion: formTemplate.version ?? 1,
          formTemplateSnapshot: formTemplate.stepsConfig as object,
        },
      });
    }

    // Checkliste zuweisen: Suche aktive ChecklistTemplate passend zum questionnaireType
    const effectiveType = questionnaireType || "STANDARD";
    const checklistTemplate = await prisma.checklistTemplate.findFirst({
      where: {
        questionnaireType: effectiveType,
        isActive: true,
      },
      include: {
        items: {
          orderBy: { orderIndex: "asc" },
        },
      },
    });

    if (checklistTemplate && checklistTemplate.items.length > 0) {
      // ChecklistItems aus den TemplateItems erstellen (Batch-Insert)
      await prisma.checklistItem.createMany({
        data: checklistTemplate.items.map((templateItem) => ({
          onboardingId: onboarding.id,
          templateItemId: templateItem.id,
          title: templateItem.title,
          category: templateItem.category,
          orderIndex: templateItem.orderIndex,
          dueDate: null,
          assignee: templateItem.defaultAssignee,
        })),
      });

      // checklistTemplateId auf dem OnboardingProcess setzen
      await prisma.onboardingProcess.update({
        where: { id: onboarding.id },
        data: { checklistTemplateId: checklistTemplate.id },
      });
    }

    // Audit-Log
    await prisma.auditLog.create({
      data: {
        onboardingId: onboarding.id,
        userId: invitedById || null,
        action: "ONBOARDING_CREATED",
        details: {
          email,
          organization: org.name,
          questionnaireType: questionnaireType || "STANDARD",
        },
      },
    });

    // Link zusammenbauen
    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const fragebogenLink = `${appUrl}/fragebogen/${token}`;

    // n8n Webhook: Onboarding erstellt (damit n8n die Magic-Link-E-Mail senden kann)
    await triggerN8nWebhook("onboarding-created", {
      onboardingId: onboarding.id,
      displayId: onboarding.displayId,
      email: onboarding.email,
      fragebogenLink,
      organization: org.name,
      mandantNumber: org.mandantNumber,
      tokenExpiresAt: onboarding.tokenExpiresAt.toISOString(),
    });

    return NextResponse.json(
      {
        id: onboarding.id,
        displayId: onboarding.displayId,
        email: onboarding.email,
        fragebogenLink,
        organization: {
          id: org.id,
          name: org.name,
          mandantNumber: org.mandantNumber,
        },
        status: onboarding.status,
        tokenExpiresAt: onboarding.tokenExpiresAt,
        createdAt: onboarding.createdAt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Fehler beim Anlegen des Onboarding-Vorgangs:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// GET /api/onboarding – Alle Vorgaenge auflisten
// =============================================
export async function GET(request: NextRequest) {
  try {
    // Auth + Rollen-Check
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }
    if (!PORTAL_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const organizationId = searchParams.get("organizationId");
    const search = searchParams.get("search")?.trim();
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";
    const rawLimit = parseInt(searchParams.get("limit") || "50");
    const rawOffset = parseInt(searchParams.get("offset") || "0");
    // Validierung: NaN/negative Werte abfangen, Maximum begrenzen
    const limit = Math.min(Math.max(isNaN(rawLimit) ? 50 : rawLimit, 1), 200);
    const offset = Math.max(isNaN(rawOffset) ? 0 : rawOffset, 0);

    // Filter zusammenbauen (inkl. Org-Einschraenkung)
    const where: Record<string, unknown> = {
      ...(await orgFilter(session)),
    };
    // "OPEN" ist kein echter Status, sondern die Gruppe der offenen Vorgaenge.
    if (status === "OPEN") {
      where.status = {
        in: ["INVITED", "IN_PROGRESS", "SUBMITTED", "SUPERVISOR_PENDING", "SUPERVISOR_SUBMITTED"],
      };
    } else if (status) {
      where.status = status;
    }
    if (organizationId) where.organizationId = organizationId;
    if (search) {
      where.OR = [
        { displayId: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { personalData: { firstName: { contains: search, mode: "insensitive" } } },
        { personalData: { lastName: { contains: search, mode: "insensitive" } } },
      ];
    }

    // Sortierung validieren
    const VALID_SORT_FIELDS: Record<string, string> = {
      createdAt: "createdAt",
      displayId: "displayId",
      email: "email",
      status: "status",
      invitedAt: "invitedAt",
    };
    const resolvedSort = VALID_SORT_FIELDS[sortBy] || "createdAt";

    const [onboardings, total] = await Promise.all([
      prisma.onboardingProcess.findMany({
        where,
        include: {
          organization: {
            select: { name: true, mandantNumber: true, type: true },
          },
          personalData: {
            select: {
              firstName: true,
              lastName: true,
              isComplete: true,
              currentStep: true,
            },
          },
          supervisorData: {
            select: { isComplete: true, currentStep: true },
          },
          _count: {
            select: { notes: true },
          },
        },
        orderBy: { [resolvedSort]: sortOrder },
        take: limit,
        skip: offset,
      }),
      prisma.onboardingProcess.count({ where }),
    ]);

    return NextResponse.json({
      data: onboardings,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Fehler beim Laden der Onboarding-Vorgaenge:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
