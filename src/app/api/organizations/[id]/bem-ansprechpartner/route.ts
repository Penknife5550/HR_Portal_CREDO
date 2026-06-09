/**
 * API: /api/organizations/[id]/bem-ansprechpartner
 *
 * GET  – Ansprechpartner:innen eines Mandanten auflisten.
 * POST – Neue:n Ansprechpartner:in anlegen.
 *
 * Berechtigung: SUPER_ADMIN / HR_LEITUNG (Mandanten-Konfiguration).
 * Diese Personen sind im BEM-Einwilligungs-Formular auswaehlbar.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ADMIN_ROLES } from "@/lib/permissions";
import { bemAnsprechpartnerSchema } from "@/lib/validations/bem";

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

    const org = await prisma.organization.findUnique({
      where: { id },
      select: { id: true, name: true, mandantNumber: true },
    });
    if (!org) {
      return NextResponse.json({ error: "Mandant nicht gefunden" }, { status: 404 });
    }

    const ansprechpartner = await prisma.bemAnsprechpartner.findMany({
      where: { organizationId: id },
      orderBy: [{ isActive: "desc" }, { orderIndex: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({ data: { organization: org, ansprechpartner } });
  } catch (error) {
    console.error("[API] bem-ansprechpartner GET fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

export async function POST(
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

    const org = await prisma.organization.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!org) {
      return NextResponse.json({ error: "Mandant nicht gefunden" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = bemAnsprechpartnerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    const count = await prisma.bemAnsprechpartner.count({
      where: { organizationId: id },
    });
    const created = await prisma.bemAnsprechpartner.create({
      data: {
        organizationId: id,
        name: parsed.data.name,
        email: parsed.data.email,
        funktion: parsed.data.funktion ?? null,
        orderIndex: count,
      },
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("[API] bem-ansprechpartner POST fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
