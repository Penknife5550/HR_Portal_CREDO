/**
 * API: /api/onboarding
 *
 * POST – Neuen Onboarding-Vorgang anlegen (fuer n8n oder Dashboard)
 * GET  – Alle Vorgaenge auflisten (fuer Dashboard)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateToken, getTokenExpiryDate, getSession } from "@/lib/auth";

// =============================================
// POST /api/onboarding – Neuen Vorgang anlegen
// =============================================
export async function POST(request: NextRequest) {
  try {
    // Auth-Check: Nur authentifizierte HR-Benutzer duerfen Vorgaenge anlegen
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    const body = await request.json();

    const { email, organizationId, questionnaireType } = body;
    const invitedById = session.userId;

    // Validierung
    if (!email || !organizationId) {
      return NextResponse.json(
        { error: "email und organizationId sind Pflichtfelder" },
        { status: 400 }
      );
    }

    // Pruefen ob Organisation existiert (inkl. shortName fuer displayId)
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
    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear + 1, 0, 1);

    const countThisYear = await prisma.onboardingProcess.count({
      where: {
        createdAt: {
          gte: yearStart,
          lt: yearEnd,
        },
      },
    });
    const sequentialNumber = countThisYear + 1;
    const shortName = org.shortName || org.mandantNumber;
    const displayId = `${currentYear}-${shortName}-${sequentialNumber
      .toString()
      .padStart(3, "0")}`;

    // Onboarding-Vorgang anlegen
    const onboarding = await prisma.onboardingProcess.create({
      data: {
        email,
        organizationId,
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
      // ChecklistItems aus den TemplateItems erstellen
      for (const templateItem of checklistTemplate.items) {
        // dueDate berechnen: Wenn supervisorData.vertragsbeginn bekannt, sonst null
        // Beim Erstellen des Onboardings ist vertragsbeginn noch nicht bekannt → null
        await prisma.checklistItem.create({
          data: {
            onboardingId: onboarding.id,
            templateItemId: templateItem.id,
            title: templateItem.title,
            category: templateItem.category,
            orderIndex: templateItem.orderIndex,
            dueDate: null, // Wird spaeter berechnet wenn vertragsbeginn bekannt
            assignee: templateItem.defaultAssignee,
          },
        });
      }

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

    return NextResponse.json(
      {
        id: onboarding.id,
        displayId: onboarding.displayId,
        email: onboarding.email,
        token: onboarding.token,
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
    // Auth-Check: Nur authentifizierte HR-Benutzer duerfen Vorgaenge sehen
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const organizationId = searchParams.get("organizationId");
    const rawLimit = parseInt(searchParams.get("limit") || "50");
    const rawOffset = parseInt(searchParams.get("offset") || "0");
    // Validierung: NaN/negative Werte abfangen, Maximum begrenzen
    const limit = Math.min(Math.max(isNaN(rawLimit) ? 50 : rawLimit, 1), 200);
    const offset = Math.max(isNaN(rawOffset) ? 0 : rawOffset, 0);

    // Filter zusammenbauen
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (organizationId) where.organizationId = organizationId;

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
        },
        orderBy: { createdAt: "desc" },
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
