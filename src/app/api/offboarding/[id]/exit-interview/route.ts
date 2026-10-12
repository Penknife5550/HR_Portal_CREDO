/**
 * API: /api/offboarding/[id]/exit-interview
 *
 * POST - Exit-Interview für ein Offboarding erstellen
 * GET  - Exit-Interview eines Offboardings abrufen
 *
 * Berechtigung: HR_EDIT_ROLES in beiden Methoden. Das Exit-Interview ist eine
 * vertrauliche Befragung — die Antworten betreffen oft genau die
 * Fuehrungskraft, und die Antwort traegt den Token des Magic Links, mit dem
 * sich der Fragebogen im Namen der Person ausfuellen liesse. Deshalb weder
 * PORTAL_ROLES (Fuehrungskraft, Einrichtungsleitung) noch der n8n-Schluessel
 * (SERVICE).
 *
 * Mandant per canAccessProcess: unbekannt und fremd = dieselbe 404. Im
 * AuditLog steht keine Adresse der Person — die steht in der Zeile selbst.
 */

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import crypto from "crypto";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { HR_EDIT_ROLES } from "@/lib/permissions";
import { nichtGefunden, offboardingZugaenglich } from "@/lib/offboarding-zugriff";

const LOG_LABEL = "Offboarding/Exit-Interview";

const EXIT_INTERVIEW_DELAY_DAYS = 7;
const EXIT_INTERVIEW_TOKEN_VALIDITY_DAYS = 30;

const SCHON_VORHANDEN = "Für diesen Vorgang gibt es bereits ein Exit-Interview.";

// =============================================
// POST /api/offboarding/[id]/exit-interview
// =============================================
export const POST = apiHandler(
  { roles: HR_EDIT_ROLES, logLabel: LOG_LABEL },
  async ({ params, session }) => {
    const id = params.id;
    if (!(await offboardingZugaenglich(session!, id))) return nichtGefunden();

    const offboarding = await prisma.offboardingProcess.findUnique({
      where: { id },
      select: {
        id: true,
        employeePrivateEmail: true,
        lastWorkingDay: true,
      },
    });
    if (!offboarding) return nichtGefunden();

    if (!offboarding.employeePrivateEmail) {
      return NextResponse.json(
        { error: "Keine private E-Mail-Adresse hinterlegt. Bitte zuerst die private E-Mail im Tab Übersicht erfassen." },
        { status: 409 }
      );
    }

    // Pruefen ob bereits ein Exit-Interview existiert
    const existing = await prisma.exitInterview.findUnique({
      where: { offboardingId: id },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ error: SCHON_VORHANDEN }, { status: 409 });
    }

    // Standard-Template laden (isDefault=true, isActive=true)
    const template = await prisma.exitInterviewTemplate.findFirst({
      where: { isDefault: true, isActive: true },
      include: {
        categories: {
          orderBy: { orderIndex: "asc" },
          include: {
            questions: {
              orderBy: { orderIndex: "asc" },
            },
          },
        },
      },
    });

    if (!template) {
      return NextResponse.json(
        { error: "Es gibt keine aktive Standardvorlage für Exit-Interviews (Vorlagen → Exit-Interview)." },
        { status: 409 }
      );
    }

    // Snapshot erstellen (deep copy als JSON)
    const templateSnapshot = {
      templateId: template.id,
      name: template.name,
      description: template.description,
      version: template.version,
      introText: template.introText,
      dsgvoText: template.dsgvoText,
      categories: template.categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        description: cat.description,
        orderIndex: cat.orderIndex,
        questions: cat.questions.map((q) => ({
          id: q.id,
          questionText: q.questionText,
          questionType: q.questionType,
          isRequired: q.isRequired,
          orderIndex: q.orderIndex,
          options: q.options,
          roleFilter: q.roleFilter,
        })),
      })),
    };

    // Token und Daten berechnen
    const token = crypto.randomUUID();
    const lastWorkingDay = new Date(offboarding.lastWorkingDay);
    const sendAfterDate = new Date(lastWorkingDay.getTime() + EXIT_INTERVIEW_DELAY_DAYS * 24 * 60 * 60 * 1000);
    const tokenExpiresAt = new Date(sendAfterDate.getTime() + EXIT_INTERVIEW_TOKEN_VALIDITY_DAYS * 24 * 60 * 60 * 1000);

    // Exit-Interview und Protokoll in EINER Transaktion. Zwei gleichzeitige
    // Klicks scheitern am Unique-Index auf offboardingId (P2002) → 409.
    let exitInterview;
    try {
      exitInterview = await prisma.$transaction(async (tx) => {
        const neu = await tx.exitInterview.create({
          data: {
            offboardingId: id,
            token,
            tokenExpiresAt,
            sendAfterDate,
            recipientEmail: offboarding.employeePrivateEmail!,
            status: "SCHEDULED",
            templateSnapshot,
            employeeRole: null,
          },
        });
        await tx.auditLog.create({
          data: {
            userId: session!.userId,
            offboardingId: id,
            processType: "OFFBOARDING",
            action: "EXIT_INTERVIEW_CREATED",
            details: {
              exitInterviewId: neu.id,
              templateName: template.name,
              templateVersion: template.version,
              sendAfterDate: sendAfterDate.toISOString(),
            },
          },
        });
        return neu;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return NextResponse.json({ error: SCHON_VORHANDEN }, { status: 409 });
      }
      throw e;
    }

    return NextResponse.json({ data: exitInterview }, { status: 201 });
  }
);

// =============================================
// GET /api/offboarding/[id]/exit-interview
// =============================================
export const GET = apiHandler(
  { roles: HR_EDIT_ROLES, logLabel: LOG_LABEL },
  async ({ params, session }) => {
    const id = params.id;
    if (!(await offboardingZugaenglich(session!, id))) return nichtGefunden();

    const exitInterview = await prisma.exitInterview.findUnique({
      where: { offboardingId: id },
      include: {
        responses: true,
        _count: {
          select: { responses: true },
        },
      },
    });

    if (!exitInterview) {
      return NextResponse.json({ data: null });
    }

    return NextResponse.json({
      data: {
        ...exitInterview,
        responsesCount: exitInterview._count.responses,
      },
    });
  }
);
