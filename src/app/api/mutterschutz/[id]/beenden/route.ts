/**
 * API: POST /api/mutterschutz/[id]/beenden
 *
 * Wechselt den Status auf BEENDET. Optional: Body { tatsGeburt?: string }
 * Wenn tatsGeburt mitgegeben wird, wird sie gesetzt — mutterschutzEnde
 * sollte ueber das normale PATCH-Update aktualisiert werden.
 */

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
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

    const body = await request.json().catch(() => ({}));
    const extraData: Omit<Prisma.MutterschutzProzessUpdateInput, "status"> = {};
    if (typeof body.tatsGeburt === "string") {
      extraData.tatsGeburt = new Date(body.tatsGeburt);
    }

    const result = await mutterschutzTransition({
      prozessId: id,
      zielStatus: "BEENDET",
      extraData,
      webhookEvent: "mutterschutz-beendet",
      auditAction: "MUTTERSCHUTZ_BEENDET",
      session,
      ipAddress,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ data: result.data });
  } catch (error) {
    console.error("[API] mutterschutz/beenden fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
