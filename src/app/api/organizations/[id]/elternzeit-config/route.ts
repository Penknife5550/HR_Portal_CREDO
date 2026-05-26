/**
 * API: Mandanten-Konfiguration für Elternzeit & Mutterschutz (Phase 2)
 *
 * GET   /api/organizations/[id]/elternzeit-config → Config laden
 * PATCH /api/organizations/[id]/elternzeit-config → Config speichern (SUPER_ADMIN, HR_LEITUNG)
 *
 * Konfiguriert pro Mandant: Geschaeftsfuehrung (Briefunterschrift),
 * Standard-Einrichtungsleiter, BR Detmold-Kontakt, Token-Validity.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ADMIN_ROLES } from "@/lib/permissions";
import { z } from "zod";

const configSchema = z.object({
  ezGfFirstName: z.string().trim().max(100).nullable().optional(),
  ezGfLastName: z.string().trim().max(100).nullable().optional(),
  ezGfTitle: z.string().trim().max(100).nullable().optional(),
  ezSignaturePath: z.string().trim().max(500).nullable().optional(),
  ezDefaultLeiterFirstName: z.string().trim().max(100).nullable().optional(),
  ezDefaultLeiterLastName: z.string().trim().max(100).nullable().optional(),
  ezDefaultLeiterEmail: z.string().trim().email().max(200).nullable().optional(),
  ezBrDetmoldName: z.string().trim().max(150).nullable().optional(),
  ezBrDetmoldEmail: z.string().trim().email().max(200).nullable().optional(),
  ezBrDetmoldPhone: z.string().trim().max(50).nullable().optional(),
  ezBrDetmoldAktenPrefix: z.string().trim().max(50).nullable().optional(),
  ezTokenValidityDays: z.number().int().min(1).max(180).optional(),
});

const SELECT_FIELDS = {
  id: true,
  mandantNumber: true,
  name: true,
  shortName: true,
  type: true,
  ezGfFirstName: true,
  ezGfLastName: true,
  ezGfTitle: true,
  ezSignaturePath: true,
  ezDefaultLeiterFirstName: true,
  ezDefaultLeiterLastName: true,
  ezDefaultLeiterEmail: true,
  ezBrDetmoldName: true,
  ezBrDetmoldEmail: true,
  ezBrDetmoldPhone: true,
  ezBrDetmoldAktenPrefix: true,
  ezTokenValidityDays: true,
} as const;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!ADMIN_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id } = await params;
    const organization = await prisma.organization.findUnique({
      where: { id },
      select: SELECT_FIELDS,
    });

    if (!organization) {
      return NextResponse.json({ error: "Mandant nicht gefunden" }, { status: 404 });
    }

    return NextResponse.json({ data: organization });
  } catch (error) {
    console.error("[API] elternzeit-config GET fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!ADMIN_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id } = await params;
    const existing = await prisma.organization.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Mandant nicht gefunden" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Ungueltiger Request-Body" }, { status: 400 });
    }

    const parsed = configSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validierungsfehler",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    // Leere Strings → null umwandeln
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value === undefined) continue;
      if (typeof value === "string" && value.trim() === "") {
        updateData[key] = null;
      } else {
        updateData[key] = value;
      }
    }

    const organization = await prisma.organization.update({
      where: { id },
      data: updateData,
      select: SELECT_FIELDS,
    });

    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      null;

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: "ORGANIZATION_ELTERNZEIT_CONFIG_UPDATED",
        processType: "ORGANIZATION",
        details: { organizationId: id, fields: Object.keys(updateData) },
        ipAddress,
      },
    }).catch(() => {
      // AuditLog-Fehler nicht weiterwerfen — Config-Speicherung ist kritischer
    });

    return NextResponse.json({ data: organization });
  } catch (error) {
    console.error("[API] elternzeit-config PATCH fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
