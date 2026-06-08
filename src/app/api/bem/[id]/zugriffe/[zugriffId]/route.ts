/**
 * API: DELETE /api/bem/[id]/zugriffe/[zugriffId] — Freigabe widerrufen.
 *
 * Gated durch canManageBemAccess. Setzt revokedAt (keine harte Loeschung —
 * der Freigabe-/Entzug-Verlauf bleibt fuer das Protokoll erhalten).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManageBemAccess } from "@/lib/permissions";
import { logBemAudit, BEM_AUDIT_ACTIONS } from "@/lib/bem-audit";

function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; zugriffId: string }> },
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
    const { id, zugriffId } = await context.params;

    const zugriff = await prisma.bemZugriff.findFirst({
      where: { id: zugriffId, bemFallId: id },
      select: { id: true, userId: true, revokedAt: true },
    });
    if (!zugriff) {
      return NextResponse.json({ error: "Freigabe nicht gefunden" }, { status: 404 });
    }
    if (zugriff.revokedAt) {
      return NextResponse.json(
        { error: "Freigabe wurde bereits widerrufen." },
        { status: 409 },
      );
    }

    await prisma.bemZugriff.update({
      where: { id: zugriffId },
      data: { revokedAt: new Date() },
    });

    await logBemAudit({
      bemFallId: id,
      userId: session.userId,
      action: BEM_AUDIT_ACTIONS.ZUGRIFF_ENTZOGEN,
      details: { entzogenFuer: zugriff.userId },
      ipAddress: clientIp(request),
    });

    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    console.error("[API] BEM Zugriff DELETE fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
