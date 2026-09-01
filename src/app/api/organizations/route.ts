/**
 * API: Einrichtungen / Mandanten
 *
 * GET  /api/organizations → Alle Einrichtungen auflisten (inkl. isActive + Anzahl Vorgaenge)
 * POST /api/organizations → Neuen Mandanten anlegen (nur SUPER_ADMIN)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ADMIN_ROLES } from "@/lib/permissions";
import {
  ABRECHNUNGSTAG_FORMAT_FEHLER,
  BETRIEBSNUMMER_FORMAT_FEHLER,
  pruefeAbrechnungstagEingabe,
  pruefeBetriebsnummerEingabe,
} from "@/lib/betriebsnummer";

// Gueltige OrganizationType-Werte (aus Prisma Schema)
const VALID_ORG_TYPES = [
  "GYMNASIUM", "GESAMTSCHULE", "GRUNDSCHULE", "BERUFSKOLLEG",
  "KITA", "VERWALTUNG", "GMBH", "VEREIN",
];

export async function GET() {
  try {
    // Auth-Check: Nur authentifizierte Benutzer
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }
    // Externe BEM-Beauftragte (E7) sehen keine Mandantenliste/Vorgangs-Zaehler
    // (sie legen keine Faelle an). Defense-in-Depth zum Middleware-API-Guard.
    if (session.role === "BEM_BEAUFTRAGTER") {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    // Betriebsnummer und Abrechnungstermin sind Arbeitgeber-Stammdaten: Die
    // eine steht auf amtlichen Antraegen an die Minijob-Zentrale, der andere
    // steuert eine beitragsrechtliche Frist. Sie gehen nur an die Rollen, die
    // sie auch pflegen duerfen — eine Einrichtungsleitung braucht die Nummern
    // der uebrigen fuenfzehn Traeger nicht. Der Fragebogen gibt sie ohnehin
    // nicht heraus, dort geht nur ein Ja/Nein raus.
    const darfStammdatenSehen = ADMIN_ROLES.includes(session.role);

    const organizations = await prisma.organization.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        mandantNumber: true,
        betriebsnummer: darfStammdatenSehen,
        entgeltabrechnungTag: darfStammdatenSehen,
        name: true,
        shortName: true,
        type: true,
        isActive: true,
        createdAt: true,
        _count: {
          select: { onboardings: true },
        },
      },
    });

    return NextResponse.json({ data: organizations });
  } catch (error) {
    console.error("Fehler beim Laden der Einrichtungen:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Auth-Check: Nur SUPER_ADMIN
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }
    if (session.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { mandantNumber, name, shortName, type } = body;

    // Validierung
    if (!mandantNumber || typeof mandantNumber !== "string" || !mandantNumber.trim()) {
      return NextResponse.json(
        { error: "Mandantennummer ist erforderlich" },
        { status: 400 }
      );
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Name ist erforderlich" },
        { status: 400 }
      );
    }
    if (!type) {
      return NextResponse.json(
        { error: "Typ ist erforderlich" },
        { status: 400 }
      );
    }
    if (!VALID_ORG_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Ungueltiger Organisationstyp. Erlaubt: ${VALID_ORG_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    // Betriebsnummer ist optional — sie wird oft erst spaeter nachgetragen.
    // Ist sie angegeben, muss sie stimmen: acht Ziffern, normalisiert gespeichert.
    const betriebsnummer = pruefeBetriebsnummerEingabe(body.betriebsnummer);
    if (!betriebsnummer.ok) {
      return NextResponse.json(
        { error: BETRIEBSNUMMER_FORMAT_FEHLER },
        { status: 400 }
      );
    }

    const abrechnungstag = pruefeAbrechnungstagEingabe(body.entgeltabrechnungTag);
    if (!abrechnungstag.ok) {
      return NextResponse.json(
        { error: ABRECHNUNGSTAG_FORMAT_FEHLER },
        { status: 400 }
      );
    }

    // Pruefen ob Mandantennummer bereits existiert
    const existing = await prisma.organization.findUnique({
      where: { mandantNumber: mandantNumber.trim() },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Diese Mandantennummer existiert bereits" },
        { status: 409 }
      );
    }

    const organization = await prisma.organization.create({
      data: {
        mandantNumber: mandantNumber.trim(),
        betriebsnummer: betriebsnummer.wert,
        entgeltabrechnungTag: abrechnungstag.wert,
        name: name.trim(),
        shortName: shortName?.trim() || null,
        type,
      },
    });

    return NextResponse.json({ data: organization }, { status: 201 });
  } catch (error) {
    console.error("Fehler beim Anlegen der Einrichtung:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
