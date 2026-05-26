/**
 * API: Mandanten-Konfiguration "Verantwortliche Stelle" (DSGVO)
 *
 * GET   /api/organizations/[id]/dsgvo-config → Config laden
 * PATCH /api/organizations/[id]/dsgvo-config → Config speichern (SUPER_ADMIN, HR_LEITUNG)
 *
 * Pro Mandant konfigurierbar; faellt im Fragebogen/Brief auf den globalen
 * Default zurueck (siehe src/lib/dsgvo.ts), wenn leer.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ADMIN_ROLES } from "@/lib/permissions";
import { z } from "zod";

const configSchema = z.object({
  dsgvoVerantwortlicheName: z.string().trim().max(200).nullable().optional(),
  dsgvoVerantwortlicheStrasse: z.string().trim().max(200).nullable().optional(),
  dsgvoVerantwortlichePlz: z.string().trim().max(10).nullable().optional(),
  dsgvoVerantwortlicheOrt: z.string().trim().max(150).nullable().optional(),
});

const SELECT_FIELDS = {
  id: true,
  mandantNumber: true,
  name: true,
  shortName: true,
  type: true,
  dsgvoVerantwortlicheName: true,
  dsgvoVerantwortlicheStrasse: true,
  dsgvoVerantwortlichePlz: true,
  dsgvoVerantwortlicheOrt: true,
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
    console.error("[API] dsgvo-config GET fehlgeschlagen:", error);
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
        { error: "Validierungsfehler", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    // Leere Strings → null
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value === undefined) continue;
      updateData[key] = typeof value === "string" && value.trim() === "" ? null : value;
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

    await prisma.auditLog
      .create({
        data: {
          userId: session.userId,
          action: "ORGANIZATION_DSGVO_CONFIG_UPDATED",
          processType: "ORGANIZATION",
          details: { organizationId: id, fields: Object.keys(updateData) },
          ipAddress,
        },
      })
      .catch(() => {
        // AuditLog-Fehler nicht weiterwerfen — Config-Speicherung ist kritischer
      });

    return NextResponse.json({ data: organization });
  } catch (error) {
    console.error("[API] dsgvo-config PATCH fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
