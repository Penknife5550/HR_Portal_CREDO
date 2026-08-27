/**
 * API: Einzelner Mandant
 *
 * GET   /api/organizations/[id] → Mandant laden
 * PATCH /api/organizations/[id] → Mandant bearbeiten (nur SUPER_ADMIN)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  BETRIEBSNUMMER_FORMAT_FEHLER,
  pruefeBetriebsnummerEingabe,
} from "@/lib/betriebsnummer";

// Gueltige OrganizationType-Werte (aus Prisma Schema)
const VALID_ORG_TYPES = [
  "GYMNASIUM", "GESAMTSCHULE", "GRUNDSCHULE", "BERUFSKOLLEG",
  "KITA", "VERWALTUNG", "GMBH", "VEREIN",
];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    const { id } = await params;

    const organization = await prisma.organization.findUnique({
      where: { id },
      select: {
        id: true,
        mandantNumber: true,
        betriebsnummer: true,
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

    if (!organization) {
      return NextResponse.json(
        { error: "Mandant nicht gefunden" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: organization });
  } catch (error) {
    console.error("Fehler beim Laden des Mandanten:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const body = await request.json();

    // Pruefen ob Mandant existiert
    const existing = await prisma.organization.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Mandant nicht gefunden" },
        { status: 404 }
      );
    }

    // Nur erlaubte Felder aktualisieren (mandantNumber ist readonly)
    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) {
        return NextResponse.json(
          { error: "Name darf nicht leer sein" },
          { status: 400 }
        );
      }
      updateData.name = body.name.trim();
    }

    if (body.shortName !== undefined) {
      updateData.shortName = body.shortName?.trim() || null;
    }

    if (body.type !== undefined) {
      if (!VALID_ORG_TYPES.includes(body.type)) {
        return NextResponse.json(
          { error: `Ungueltiger Organisationstyp. Erlaubt: ${VALID_ORG_TYPES.join(", ")}` },
          { status: 400 }
        );
      }
      updateData.type = body.type;
    }

    if (body.isActive !== undefined) {
      updateData.isActive = Boolean(body.isActive);
    }

    // Anders als die Mandantennummer bleibt die Betriebsnummer aenderbar — sie
    // wird nachgetragen, sobald der BA-Bescheid vorliegt.
    let neueBetriebsnummer: string | null | undefined;
    if (body.betriebsnummer !== undefined) {
      const geprueft = pruefeBetriebsnummerEingabe(body.betriebsnummer);
      if (!geprueft.ok) {
        return NextResponse.json(
          { error: BETRIEBSNUMMER_FORMAT_FEHLER },
          { status: 400 }
        );
      }
      neueBetriebsnummer = geprueft.wert;
      updateData.betriebsnummer = geprueft.wert;
    }

    const vorher =
      neueBetriebsnummer !== undefined
        ? await prisma.organization.findUnique({
            where: { id },
            select: { betriebsnummer: true },
          })
        : null;

    const organization = await prisma.organization.update({
      where: { id },
      data: updateData,
    });

    // Die Betriebsnummer landet auf amtlichen Antraegen, die in die
    // Entgeltunterlagen gehen. Eine Aenderung muss nachvollziehbar sein — diese
    // Route hat bisher ueberhaupt kein AuditLog geschrieben.
    if (vorher && vorher.betriebsnummer !== neueBetriebsnummer) {
      await prisma.auditLog
        .create({
          data: {
            userId: session.userId,
            action: "ORGANIZATION_BETRIEBSNUMMER_UPDATED",
            processType: "ORGANIZATION",
            details: {
              organizationId: id,
              alt: vorher.betriebsnummer,
              neu: neueBetriebsnummer ?? null,
            },
            ipAddress:
              request.headers.get("x-forwarded-for") ||
              request.headers.get("x-real-ip") ||
              null,
          },
        })
        .catch(() => {
          // Nicht weiterwerfen: Die Aenderung selbst ist wichtiger als ihr Protokoll.
        });
    }

    return NextResponse.json({ data: organization });
  } catch (error) {
    console.error("Fehler beim Aktualisieren des Mandanten:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
