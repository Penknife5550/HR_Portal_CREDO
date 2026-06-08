/**
 * API: POST /api/bem/[id]/zugriffe — Freigabe (BemZugriff) erteilen.
 *
 * "Versiegelte Akte"-Verwaltung: gated durch canManageBemAccess
 * (SUPER_ADMIN/HR_LEITUNG). WICHTIG — Freigaben *verwalten* != Inhalte *lesen*:
 * diese Route liest KEINE Fall-Inhalte. Erteilt/reaktiviert eine Freigabe fuer
 * eine:n Portal-Nutzer:in und auditiert das (ZUGRIFF_GEWAEHRT).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManageBemAccess } from "@/lib/permissions";
import { logBemAudit, BEM_AUDIT_ACTIONS } from "@/lib/bem-audit";
import { bemZugriffSchema } from "@/lib/validations/bem";

function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!canManageBemAccess(session)) {
      return NextResponse.json(
        { error: "Keine Berechtigung zur Freigabe-Verwaltung" },
        { status: 403 },
      );
    }
    const { id } = await context.params;

    const fall = await prisma.bemFall.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!fall) {
      return NextResponse.json({ error: "Fall nicht gefunden" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = bemZugriffSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }
    const { userId, rolle } = parsed.data;

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true },
    });
    if (!target || !target.isActive) {
      return NextResponse.json(
        { error: "Benutzer nicht gefunden oder inaktiv" },
        { status: 404 },
      );
    }

    // Reaktivieren, falls eine (auch widerrufene) Freigabe existiert — sonst neu.
    const existing = await prisma.bemZugriff.findFirst({
      where: { bemFallId: id, userId },
      orderBy: { grantedAt: "desc" },
      select: { id: true, revokedAt: true },
    });

    if (existing && existing.revokedAt === null) {
      return NextResponse.json(
        { error: "Diese Person ist bereits freigegeben." },
        { status: 409 },
      );
    }

    const now = new Date();
    if (existing) {
      await prisma.bemZugriff.update({
        where: { id: existing.id },
        data: { revokedAt: null, rolle, grantedById: session.userId, grantedAt: now },
      });
    } else {
      await prisma.bemZugriff.create({
        data: { bemFallId: id, userId, rolle, grantedById: session.userId },
      });
    }

    await logBemAudit({
      bemFallId: id,
      userId: session.userId,
      action: BEM_AUDIT_ACTIONS.ZUGRIFF_GEWAEHRT,
      details: { freigegebenFuer: userId, rolle },
      ipAddress: clientIp(request),
    });

    return NextResponse.json({ data: { ok: true } }, { status: 201 });
  } catch (error) {
    console.error("[API] BEM Zugriff POST fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
