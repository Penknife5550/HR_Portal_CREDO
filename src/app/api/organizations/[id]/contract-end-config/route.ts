/**
 * API: Mandanten-Konfiguration fuer das Vertragsdaten-Formular (Vertragsende).
 *
 * GET   /api/organizations/[id]/contract-end-config → aufgeloeste Feld-Config laden
 * PATCH /api/organizations/[id]/contract-end-config → Feld-Config speichern
 *
 * Pro Mandant konfigurierbar: welche Felder im oeffentlichen Vertragsdaten-
 * Formular sichtbar/Pflicht sind und welches Label sie tragen. Speicherung als
 * JSON in `Organization.contractEndFieldConfig`. Zugang: SUPER_ADMIN, HR_LEITUNG.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ADMIN_ROLES } from "@/lib/permissions";
import {
  CONTRACT_END_FIELD_REGISTRY,
  resolveContractEndFieldConfig,
} from "@/lib/contract-end-fields";

const KNOWN_FIELD_NAMES = new Set(CONTRACT_END_FIELD_REGISTRY.map((d) => d.name));

const fieldConfigSchema = z.object({
  fields: z
    .array(
      z.object({
        name: z.string().max(50),
        visible: z.boolean(),
        required: z.boolean(),
        label: z.string().trim().max(100),
      }),
    )
    .max(100),
});

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
      select: { id: true, name: true, mandantNumber: true, contractEndFieldConfig: true },
    });
    if (!organization) {
      return NextResponse.json({ error: "Mandant nicht gefunden" }, { status: 404 });
    }

    return NextResponse.json({
      data: {
        id: organization.id,
        name: organization.name,
        mandantNumber: organization.mandantNumber,
        fields: resolveContractEndFieldConfig(organization.contractEndFieldConfig),
      },
    });
  } catch (error) {
    console.error("[API] contract-end-config GET fehlgeschlagen:", error);
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
    const parsed = fieldConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    // Nur bekannte Felder speichern (Schutz gegen Mass-Assignment/Muell-Eintraege).
    const clean = parsed.data.fields.filter((f) => KNOWN_FIELD_NAMES.has(f.name));

    const organization = await prisma.organization.update({
      where: { id },
      data: { contractEndFieldConfig: clean },
      select: { id: true, name: true, mandantNumber: true, contractEndFieldConfig: true },
    });

    const ipAddress =
      request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;

    await prisma.auditLog
      .create({
        data: {
          userId: session.userId,
          action: "ORGANIZATION_CONTRACT_END_CONFIG_UPDATED",
          processType: "ORGANIZATION",
          details: { organizationId: id, fieldCount: clean.length },
          ipAddress,
        },
      })
      .catch(() => {
        // AuditLog-Fehler nicht weiterwerfen — Config-Speicherung ist kritischer
      });

    return NextResponse.json({
      data: {
        id: organization.id,
        name: organization.name,
        mandantNumber: organization.mandantNumber,
        fields: resolveContractEndFieldConfig(organization.contractEndFieldConfig),
      },
    });
  } catch (error) {
    console.error("[API] contract-end-config PATCH fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
