/**
 * API: /api/checklisten
 *
 * GET  – Alle Checklisten-Vorlagen auflisten (inkl. Items-Count, questionnaireType)
 * POST – Neue Vorlage erstellen (nur SUPER_ADMIN / HR_LEITUNG)
 *
 * Paket 5: Der Rumpf des POST laeuft jetzt durch `checklistenVorlageSchema`
 * (Zustaendigkeit als Schluessel, Hinweis hoechstens 500 Zeichen). Die
 * Antwortform bleibt bewusst der nackte Datensatz mit 201 — anders als GET und
 * PUT, die `{ data }` liefern; der Editor liest beide Formen.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { istOffboardingVorlagenName } from "@/lib/abteilungsaufgaben";
import {
  checklistenFehlerMeldung,
  checklistenVorlageSchema,
} from "@/lib/validations/abteilungsaufgaben";

// =============================================
// GET /api/checklisten – Alle Vorlagen auflisten
// =============================================
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    const templates = await prisma.checklistTemplate.findMany({
      include: {
        items: {
          orderBy: { orderIndex: "asc" },
        },
        _count: {
          select: { items: true, onboardings: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: templates });
  } catch (error) {
    console.error("Fehler beim Laden der Checklisten-Vorlagen:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// POST /api/checklisten – Neue Vorlage erstellen
// =============================================
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    // Rollencheck: Nur SUPER_ADMIN und HR_LEITUNG
    if (session.role !== "SUPER_ADMIN" && session.role !== "HR_LEITUNG") {
      return NextResponse.json(
        { error: "Keine Berechtigung. Nur SUPER_ADMIN und HR_LEITUNG duerfen Checklisten erstellen." },
        { status: 403 }
      );
    }

    const roh = await request.json().catch(() => undefined);
    const geprueft = checklistenVorlageSchema.safeParse(roh);
    if (!geprueft.success) {
      return NextResponse.json(
        { error: checklistenFehlerMeldung(geprueft.error) },
        { status: 400 }
      );
    }
    const daten = geprueft.data;

    // Wie beim PUT: Eine „Offboarding: …"-Vorlage darf keinen Fragebogentyp
    // tragen, sonst zieht POST /api/onboarding sie als Onboarding-Checkliste.
    const questionnaireType = istOffboardingVorlagenName(daten.name)
      ? null
      : daten.questionnaireType ?? null;

    // Vorlage + Punkte in einer Transaktion erstellen. Ein mitgeschicktes
    // `items[].id` wird uebergangen — eine neue Vorlage bekommt neue Punkte.
    const template = await prisma.checklistTemplate.create({
      data: {
        name: daten.name,
        description: daten.description ?? null,
        questionnaireType,
        ...(daten.isActive !== undefined && { isActive: daten.isActive }),
        items: {
          create: daten.items.map((punkt, index) => ({
            title: punkt.title,
            category: punkt.category,
            orderIndex: punkt.orderIndex ?? index,
            defaultDueDays: punkt.defaultDueDays ?? null,
            defaultAssignee: punkt.defaultAssignee ?? null,
            description: punkt.description ?? null,
          })),
        },
      },
      include: {
        items: {
          orderBy: { orderIndex: "asc" },
        },
        _count: {
          select: { items: true, onboardings: true },
        },
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error("Fehler beim Erstellen der Checklisten-Vorlage:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
