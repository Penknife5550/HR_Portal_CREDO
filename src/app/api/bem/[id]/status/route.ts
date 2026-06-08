/**
 * API: POST /api/bem/[id]/status — Status-Uebergang eines BEM-Falls.
 *
 * Zugriff & Atomaritaet liegen in bemTransition() (canAccessBemContent,
 * race-freies updateMany, AuditLog in $transaction). Diese Route validiert
 * nur den Body und reicht durch.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { bemStatusSchema } from "@/lib/validations/bem";
import { bemTransition } from "@/lib/bem-transitions";
import type { BemStatus } from "@/lib/bem-workflow";

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
    const { id } = await context.params;

    const body = await request.json().catch(() => null);
    const parsed = bemStatusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    const result = await bemTransition({
      bemFallId: id,
      zielStatus: parsed.data.zielStatus as BemStatus,
      beendigungsgrund: parsed.data.beendigungsgrund ?? null,
      session,
      ipAddress: clientIp(request),
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ data: result.data });
  } catch (error) {
    console.error("[API] BEM status POST fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
