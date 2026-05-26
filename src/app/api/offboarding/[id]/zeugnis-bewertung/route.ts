/**
 * API: /api/offboarding/[id]/zeugnis-bewertung
 *
 * POST - Zeugnis-Bewertung für ein Offboarding erstellen (Magic Link generieren)
 * GET  - Zeugnis-Bewertung eines Offboardings abrufen
 *
 * Berechtigung: Authentifizierter Benutzer
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { createZeugnisBewertungSchema } from "@/lib/validations/zeugnis";
import crypto from "crypto";

const ZEUGNIS_TOKEN_VALIDITY_DAYS = 90;
const VALID_JOB_GROUPS = ["LEHRKRAFT", "ERZIEHER", "VERWALTUNG", "SCHULLEITUNG", "SONSTIGES"] as const;
type JobGroup = (typeof VALID_JOB_GROUPS)[number];

// =============================================
// GET /api/offboarding/[id]/zeugnis-bewertung
// =============================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const { id } = await params;

    const bewertung = await prisma.zeugnisBewertung.findUnique({
      where: { offboardingId: id },
      include: {
        ratings: true,
        hrReviewedBy: { select: { id: true, firstName: true, lastName: true } },
        finalizedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!bewertung) {
      return NextResponse.json({ error: "Keine Zeugnis-Bewertung für dieses Offboarding gefunden" }, { status: 404 });
    }

    return NextResponse.json({ data: bewertung });
  } catch (error) {
    console.error("[API] Zeugnis-Bewertung laden fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// =============================================
// POST /api/offboarding/[id]/zeugnis-bewertung
// =============================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const { id } = await params;

    // Body validieren
    const body = await request.json().catch(() => null);
    const parsed = createZeugnisBewertungSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const { supervisorEmail, supervisorName, jobGroup } = parsed.data;

    // Offboarding pruefen
    const offboarding = await prisma.offboardingProcess.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!offboarding) {
      return NextResponse.json({ error: "Offboarding-Vorgang nicht gefunden" }, { status: 404 });
    }

    // Pruefen ob bereits eine Bewertung existiert
    const existing = await prisma.zeugnisBewertung.findUnique({
      where: { offboardingId: id },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Fuer dieses Offboarding existiert bereits eine Zeugnis-Bewertung" },
        { status: 409 }
      );
    }

    // Template für die jobGroup laden
    const template = await prisma.zeugnisBewertungTemplate.findFirst({
      where: {
        jobGroup: jobGroup as JobGroup,
        isActive: true,
      },
      include: {
        categories: {
          orderBy: { orderIndex: "asc" },
          include: {
            criteria: {
              orderBy: { orderIndex: "asc" },
            },
          },
        },
        formulierungen: true,
      },
    });

    if (!template) {
      return NextResponse.json(
        { error: `Kein aktives Template für die Berufsgruppe "${jobGroup}" gefunden` },
        { status: 404 }
      );
    }

    // Template-Snapshot erstellen (Kategorien + Kriterien + Formulierungen als JSON)
    const templateSnapshot = {
      templateId: template.id,
      templateName: template.name,
      version: template.version,
      jobGroup: template.jobGroup,
      categories: template.categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        description: cat.description,
        weight: cat.weight,
        orderIndex: cat.orderIndex,
        criteria: cat.criteria.map((crit) => ({
          id: crit.id,
          name: crit.name,
          description: crit.description,
          weight: crit.weight,
          orderIndex: crit.orderIndex,
        })),
      })),
      formulierungen: template.formulierungen.map((f) => ({
        id: f.id,
        criterionKey: f.criterionKey,
        grade: f.grade,
        formulation: f.formulation,
      })),
    };

    // Token generieren
    const token = crypto.randomUUID();
    const tokenExpiresAt = new Date(Date.now() + ZEUGNIS_TOKEN_VALIDITY_DAYS * 24 * 60 * 60 * 1000);

    // ZeugnisBewertung erstellen
    const bewertung = await prisma.zeugnisBewertung.create({
      data: {
        offboardingId: id,
        supervisorEmail: supervisorEmail.trim(),
        supervisorName: supervisorName?.trim() || null,
        jobGroup: jobGroup as JobGroup,
        templateSnapshot,
        token,
        tokenExpiresAt,
        status: "INVITED",
        sentAt: new Date(),
      },
    });

    // AuditLog schreiben
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        offboardingId: id,
        processType: "OFFBOARDING",
        action: "ZEUGNIS_BEWERTUNG_CREATED",
        details: {
          zeugnisBewertungId: bewertung.id,
          jobGroup,
          supervisorEmail: supervisorEmail.trim(),
          templateId: template.id,
          templateName: template.name,
        },
      },
    });

    return NextResponse.json({ data: bewertung }, { status: 201 });
  } catch (error) {
    console.error("[API] Zeugnis-Bewertung erstellen fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
