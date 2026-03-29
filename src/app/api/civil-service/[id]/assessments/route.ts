/**
 * API: /api/civil-service/[id]/assessments
 *
 * POST - Beurteilung erstellen (SL zur Bewertung auffordern)
 * GET  - Alle Beurteilungen fuer diesen Prozess auflisten
 *
 * Auth erforderlich (HR_LEITUNG, SUPER_ADMIN)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { randomUUID } from "crypto";

const ALLOWED_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];

type RouteContext = { params: Promise<{ id: string }> };

// =============================================
// Default Beurteilungs-Template (eingefroren als Snapshot)
// =============================================
const DEFAULT_BEURTEILUNG_TEMPLATE = {
  categories: [
    {
      id: "fachliche-kompetenz",
      name: "Fachliche Kompetenz",
      weight: 1,
      orderIndex: 0,
      criteria: [
        { id: "fachwissen", name: "Fachwissen", description: "Fundierte Kenntnisse im Fachgebiet", weight: 1, orderIndex: 0 },
        { id: "didaktik", name: "Didaktik", description: "Methodisch-didaktische Kompetenz im Unterricht", weight: 1, orderIndex: 1 },
        { id: "fortbildung", name: "Fortbildung", description: "Bereitschaft zur fachlichen Weiterentwicklung", weight: 1, orderIndex: 2 },
      ],
    },
    {
      id: "paedagogische-kompetenz",
      name: "Paedagogische Kompetenz",
      weight: 1,
      orderIndex: 1,
      criteria: [
        { id: "unterricht", name: "Unterricht", description: "Qualitaet der Unterrichtsgestaltung", weight: 1, orderIndex: 0 },
        { id: "differenzierung", name: "Differenzierung", description: "Individualisierung und Differenzierung im Unterricht", weight: 1, orderIndex: 1 },
        { id: "classroom-management", name: "Classroom Management", description: "Klassenfuehrung und Unterrichtsorganisation", weight: 1, orderIndex: 2 },
      ],
    },
    {
      id: "arbeitsverhalten",
      name: "Arbeitsverhalten",
      weight: 1,
      orderIndex: 2,
      criteria: [
        { id: "motivation", name: "Motivation", description: "Engagement und Einsatzbereitschaft", weight: 1, orderIndex: 0 },
        { id: "zuverlaessigkeit", name: "Zuverlaessigkeit", description: "Termingerechte und gewissenhafte Erledigung von Aufgaben", weight: 1, orderIndex: 1 },
        { id: "belastbarkeit", name: "Belastbarkeit", description: "Umgang mit Arbeitsbelastung und Stresssituationen", weight: 1, orderIndex: 2 },
      ],
    },
    {
      id: "sozialverhalten",
      name: "Sozialverhalten",
      weight: 1,
      orderIndex: 3,
      criteria: [
        { id: "vorgesetzte", name: "Vorgesetzte", description: "Zusammenarbeit mit Vorgesetzten", weight: 1, orderIndex: 0 },
        { id: "kollegen", name: "Kollegen", description: "Zusammenarbeit im Kollegium", weight: 1, orderIndex: 1 },
        { id: "schueler", name: "Schueler", description: "Umgang mit Schuelern", weight: 1, orderIndex: 2 },
        { id: "eltern", name: "Eltern", description: "Elternkommunikation und -zusammenarbeit", weight: 1, orderIndex: 3 },
      ],
    },
    {
      id: "christliches-profil",
      name: "Christliches Profil",
      weight: 1,
      orderIndex: 4,
      criteria: [
        { id: "andachten", name: "Andachten", description: "Vorbereitung und Durchfuehrung von Andachten", weight: 1, orderIndex: 0 },
        { id: "biblische-integration", name: "Biblische Integration", description: "Integration biblischer Inhalte in den Unterricht", weight: 1, orderIndex: 1 },
        { id: "gemeindeleben", name: "Gemeindeleben", description: "Aktive Teilnahme am Gemeindeleben", weight: 1, orderIndex: 2 },
        { id: "fes-grundsaetze", name: "FES-Grundsaetze", description: "Identifikation mit und Umsetzung der FES-Grundsaetze", weight: 1, orderIndex: 3 },
      ],
    },
  ],
};

// =============================================
// POST /api/civil-service/[id]/assessments
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

    // Prozess pruefen
    const process = await prisma.civilServiceProcess.findUnique({
      where: { id },
      select: { id: true, status: true, employeeFirstName: true, employeeLastName: true },
    });

    if (!process) {
      return NextResponse.json({ error: "Prozess nicht gefunden" }, { status: 404 });
    }

    // Body parsen
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Ungueltiger Request-Body" }, { status: 400 });
    }

    const { assessmentNumber, assessmentType, recipientEmail, recipientName } = body;

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

    // Token generieren
    const token = randomUUID();
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 90);

    // Template-Snapshot: Bei BEURTEILUNG die Standardvorlage, bei REFERENZ null
    const templateSnapshot = assessmentType === "BEURTEILUNG"
      ? DEFAULT_BEURTEILUNG_TEMPLATE
      : null;

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
        templateSnapshot: templateSnapshot ?? undefined,
        sentAt: new Date(),
      },
    });

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
