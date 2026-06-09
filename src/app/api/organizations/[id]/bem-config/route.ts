/**
 * API: /api/organizations/[id]/bem-config — BEM-Mandanten-Konfiguration (E10)
 *
 * GET/PATCH der Gremien-Flags (Betriebsrat / SBV vorhanden), die den
 * Auto-Versand der BR-/SBV-Einwilligungs-Links steuern. Nur SUPER_ADMIN /
 * HR_LEITUNG (ADMIN_ROLES).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ADMIN_ROLES } from "@/lib/permissions";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    if (!ADMIN_ROLES.includes(session.role))
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });

    const { id } = await params;
    const org = await prisma.organization.findUnique({
      where: { id },
      select: { id: true, name: true, hatBetriebsrat: true, hatSchwerbehindertenvertretung: true },
    });
    if (!org) return NextResponse.json({ error: "Mandant nicht gefunden" }, { status: 404 });
    return NextResponse.json({ data: org });
  } catch (error) {
    console.error("[API] BEM-Config GET fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    if (!ADMIN_ROLES.includes(session.role))
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });

    const { id } = await params;
    const existing = await prisma.organization.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Mandant nicht gefunden" }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const data: { hatBetriebsrat?: boolean; hatSchwerbehindertenvertretung?: boolean } = {};
    if (body.hatBetriebsrat !== undefined) data.hatBetriebsrat = Boolean(body.hatBetriebsrat);
    if (body.hatSchwerbehindertenvertretung !== undefined)
      data.hatSchwerbehindertenvertretung = Boolean(body.hatSchwerbehindertenvertretung);
    if (Object.keys(data).length === 0)
      return NextResponse.json({ error: "Kein aktualisierbares Feld" }, { status: 400 });

    const org = await prisma.organization.update({
      where: { id },
      data,
      select: { id: true, hatBetriebsrat: true, hatSchwerbehindertenvertretung: true },
    });
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        processType: "BEM",
        action: "BEM_MANDANT_CONFIG_GEAENDERT",
        details: { organizationId: id, ...data },
      },
    });
    return NextResponse.json({ data: org });
  } catch (error) {
    console.error("[API] BEM-Config PATCH fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
