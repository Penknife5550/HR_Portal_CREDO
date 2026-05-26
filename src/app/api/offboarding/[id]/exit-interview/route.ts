/**
 * API: /api/offboarding/[id]/exit-interview
 *
 * POST - Exit-Interview für ein Offboarding erstellen
 * GET  - Exit-Interview eines Offboardings abrufen
 *
 * Berechtigung: Authentifizierter Benutzer
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import crypto from "crypto";

const EXIT_INTERVIEW_DELAY_DAYS = 7;
const EXIT_INTERVIEW_TOKEN_VALIDITY_DAYS = 30;

// =============================================
// POST /api/offboarding/[id]/exit-interview
// =============================================
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const { id } = await params;

    // Offboarding laden
    const offboarding = await prisma.offboardingProcess.findUnique({
      where: { id },
      select: {
        id: true,
        employeePrivateEmail: true,
        employeeFirstName: true,
        employeeLastName: true,
        lastWorkingDay: true,
      },
    });

    if (!offboarding) {
      return NextResponse.json({ error: "Offboarding-Vorgang nicht gefunden" }, { status: 404 });
    }

    if (!offboarding.employeePrivateEmail) {
      return NextResponse.json(
        { error: "Keine private E-Mail-Adresse des Mitarbeiters hinterlegt. Bitte zuerst die private E-Mail im Offboarding erfassen." },
        { status: 400 }
      );
    }

    // Pruefen ob bereits ein Exit-Interview existiert
    const existing = await prisma.exitInterview.findUnique({
      where: { offboardingId: id },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Es existiert bereits ein Exit-Interview für dieses Offboarding" },
        { status: 409 }
      );
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
        { error: "Kein aktives Standard-Template für Exit-Interviews gefunden" },
        { status: 404 }
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

    // Exit-Interview erstellen
    const exitInterview = await prisma.exitInterview.create({
      data: {
        offboardingId: id,
        token,
        tokenExpiresAt,
        sendAfterDate,
        recipientEmail: offboarding.employeePrivateEmail,
        status: "SCHEDULED",
        templateSnapshot,
        employeeRole: null,
      },
    });

    // AuditLog schreiben
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        offboardingId: id,
        processType: "OFFBOARDING",
        action: "EXIT_INTERVIEW_CREATED",
        details: {
          exitInterviewId: exitInterview.id,
          templateName: template.name,
          templateVersion: template.version,
          recipientEmail: offboarding.employeePrivateEmail,
          sendAfterDate: sendAfterDate.toISOString(),
        },
      },
    });

    return NextResponse.json({ data: exitInterview }, { status: 201 });
  } catch (error) {
    console.error("[API] Exit-Interview erstellen fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// =============================================
// GET /api/offboarding/[id]/exit-interview
// =============================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const { id } = await params;

    // Pruefen ob Offboarding existiert
    const offboarding = await prisma.offboardingProcess.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!offboarding) {
      return NextResponse.json({ error: "Offboarding-Vorgang nicht gefunden" }, { status: 404 });
    }

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
  } catch (error) {
    console.error("[API] Exit-Interview laden fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
