/**
 * API: /api/offboarding/[id]/zeugnis-bewertung
 *
 * POST - Zeugnis-Bewertung für ein Offboarding erstellen (Magic Link generieren)
 * GET  - Zeugnis-Bewertung eines Offboardings abrufen
 *
 * Berechtigung: HR_EDIT_ROLES in beiden Methoden. Die Antwort traegt den Token
 * des Bewertungslinks — wer ihn hat, kann im Namen der Fuehrungskraft Noten
 * abgeben. Deshalb weder PORTAL_ROLES noch der n8n-Schluessel (SERVICE).
 * Mandant per canAccessProcess: unbekannt und fremd = dieselbe 404.
 *
 * Die hier eingetragene Adresse ist zugleich eine Quelle der Fuehrungskraft
 * fuer die Abteilungsaufgaben (`fuehrungskraftErmitteln`, Quelle „ZEUGNIS"):
 * Ohne eigene Adresse am Vorgang bekommt sie die Aufgaben mit der
 * Zustaendigkeit „Führungskraft" per Link. Eine frei eingetippte Adresse muss
 * deshalb wie im Tab Übersicht in einer freigegebenen Domain liegen
 * (`fuehrungskraftAdresseFreigegeben`), sonst 409 — vor jedem Schreiben.
 */

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import type { z } from "zod";
import crypto from "crypto";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { MELDUNGEN } from "@/lib/abteilungsaufgaben";
import { fuehrungskraftAdresseFreigegeben } from "@/lib/abteilungsaufgaben-dienst";
import { HR_EDIT_ROLES } from "@/lib/permissions";
import { nichtGefunden, offboardingZugaenglich } from "@/lib/offboarding-zugriff";
import { createZeugnisBewertungSchema } from "@/lib/validations/zeugnis";

const LOG_LABEL = "Offboarding/Zeugnis-Bewertung";

const ZEUGNIS_TOKEN_VALIDITY_DAYS = 90;

const SCHON_VORHANDEN = "Für diesen Vorgang gibt es bereits eine Zeugnis-Bewertung.";

// =============================================
// GET /api/offboarding/[id]/zeugnis-bewertung
// =============================================
export const GET = apiHandler(
  { roles: HR_EDIT_ROLES, logLabel: LOG_LABEL },
  async ({ params, session }) => {
    if (!(await offboardingZugaenglich(session!, params.id))) return nichtGefunden();

    const bewertung = await prisma.zeugnisBewertung.findUnique({
      where: { offboardingId: params.id },
      include: {
        ratings: true,
        hrReviewedBy: { select: { id: true, firstName: true, lastName: true } },
        finalizedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!bewertung) {
      return nichtGefunden("Für diesen Vorgang gibt es noch keine Zeugnis-Bewertung.");
    }

    return NextResponse.json({ data: bewertung });
  }
);

// =============================================
// POST /api/offboarding/[id]/zeugnis-bewertung
// =============================================
export const POST = apiHandler<z.infer<typeof createZeugnisBewertungSchema>>(
  { roles: HR_EDIT_ROLES, bodySchema: createZeugnisBewertungSchema, logLabel: LOG_LABEL },
  async ({ params, session, body }) => {
    const id = params.id;
    if (!(await offboardingZugaenglich(session!, id))) return nichtGefunden();

    const supervisorEmail = body.supervisorEmail.trim();
    const { jobGroup } = body;

    const offboarding = await prisma.offboardingProcess.findUnique({
      where: { id },
      select: {
        supervisorEmail: true,
        contractEnd: { select: { supervisorEmail: true } },
      },
    });
    if (!offboarding) return nichtGefunden();

    // Pruefen ob bereits eine Bewertung existiert
    const existing = await prisma.zeugnisBewertung.findUnique({
      where: { offboardingId: id },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ error: SCHON_VORHANDEN }, { status: 409 });
    }

    // Freigabeliste wie im Tab Übersicht (Kopfkommentar). Bekannte Adressen
    // (Fuehrungskraft am Vorgang, Vertragsende) sind immer erlaubt.
    const freigegeben = await fuehrungskraftAdresseFreigegeben(supervisorEmail, [
      offboarding.supervisorEmail,
      offboarding.contractEnd?.supervisorEmail,
    ]);
    if (!freigegeben) {
      return NextResponse.json({ error: MELDUNGEN.FUEHRUNGSKRAFT_NICHT_FREIGEGEBEN }, { status: 409 });
    }

    // Template für die jobGroup laden
    const template = await prisma.zeugnisBewertungTemplate.findFirst({
      where: {
        jobGroup,
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
        { error: "Für diese Berufsgruppe gibt es keine aktive Vorlage (Vorlagen → Zeugnis-Bewertung)." },
        { status: 409 }
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

    // Bewertung und Protokoll in EINER Transaktion. Zwei gleichzeitige Klicks
    // scheitern am Unique-Index auf offboardingId (P2002) → 409.
    let bewertung;
    try {
      bewertung = await prisma.$transaction(async (tx) => {
        const neu = await tx.zeugnisBewertung.create({
          data: {
            offboardingId: id,
            supervisorEmail,
            supervisorName: body.supervisorName?.trim() || null,
            jobGroup,
            templateSnapshot,
            token,
            tokenExpiresAt,
            status: "INVITED",
            sentAt: new Date(),
          },
        });
        await tx.auditLog.create({
          data: {
            userId: session!.userId,
            offboardingId: id,
            processType: "OFFBOARDING",
            action: "ZEUGNIS_BEWERTUNG_CREATED",
            details: {
              zeugnisBewertungId: neu.id,
              jobGroup,
              supervisorEmail,
              templateId: template.id,
              templateName: template.name,
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

    return NextResponse.json({ data: bewertung }, { status: 201 });
  }
);
