/**
 * API: POST /api/mutterschutz/[id]/bad-beauftragen
 *
 * Wechselt den Status auf BAD_BEAUFTRAGT und setzt badBeauftragtAm.
 * Vor-Checks (Auth, Rolle, IDOR, State-Race) uebernimmt mutterschutzTransition().
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { mutterschutzTransition } from "@/lib/mutterschutz-transitions";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const { id } = await params;
    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      null;

    const result = await mutterschutzTransition({
      prozessId: id,
      zielStatus: "BAD_BEAUFTRAGT",
      extraData: { badBeauftragtAm: new Date() },
      webhookEvent: "mutterschutz-bad-beauftragt",
      auditAction: "MUTTERSCHUTZ_BAD_BEAUFTRAGT",
      session,
      ipAddress,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ data: result.data });
  } catch (error) {
    console.error("[API] mutterschutz/bad-beauftragen fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
