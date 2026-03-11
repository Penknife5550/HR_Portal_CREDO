/**
 * API: Einrichtungen / Mandanten
 *
 * GET  /api/organizations → Alle Einrichtungen auflisten (inkl. isActive + Anzahl Vorgaenge)
 * POST /api/organizations → Neuen Mandanten anlegen (nur SUPER_ADMIN)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

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

    const organizations = await prisma.organization.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        mandantNumber: true,
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
