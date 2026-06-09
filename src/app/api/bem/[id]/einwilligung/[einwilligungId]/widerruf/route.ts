/**
 * API: POST /api/bem/[id]/einwilligung/[einwilligungId]/widerruf
 *
 * Setzt eine erteilte Einwilligung auf WIDERRUFEN (Widerruf jederzeit moeglich,
 * § 167 SGB IX / DSGVO). Versiegelte Akte: Zugriff via canAccessBemContent.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessBemContent } from "@/lib/permissions";
import { logBemAudit, BEM_AUDIT_ACTIONS } from "@/lib/bem-audit";

function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; einwilligungId: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    const { id, einwilligungId } = await context.params;
    if (!(await canAccessBemContent(session, id))) {
      return NextResponse.json({ error: "Fall nicht gefunden" }, { status: 404 });
    }

    const e = await prisma.bemEinwilligung.findFirst({
      where: { id: einwilligungId, bemFallId: id },
      select: { id: true },
    });
    if (!e) {
      return NextResponse.json(
        { error: "Einwilligung nicht gefunden" },
        { status: 404 },
      );
    }

    const upd = await prisma.bemEinwilligung.updateMany({
      where: { id: einwilligungId, status: "ERTEILT" },
      data: { status: "WIDERRUFEN", widerrufAm: new Date() },
    });
    if (upd.count === 0) {
      return NextResponse.json(
        { error: "Nur erteilte Einwilligungen können widerrufen werden." },
        { status: 409 },
      );
    }

    await logBemAudit({
      bemFallId: id,
      userId: session.userId,
      action: BEM_AUDIT_ACTIONS.EINWILLIGUNG_WIDERRUFEN,
      details: { einwilligungId },
      ipAddress: clientIp(request),
    });

    return NextResponse.json({ data: { id: einwilligungId, status: "WIDERRUFEN" } });
  } catch (error) {
    console.error("[API] BEM Einwilligung Widerruf fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
