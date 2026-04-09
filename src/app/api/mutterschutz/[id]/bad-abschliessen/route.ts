/**
 * API: POST /api/mutterschutz/[id]/bad-abschliessen
 *
 * Wechselt den Status auf BAD_ABGESCHLOSSEN und setzt badAbgeschlossenAm.
 * Optional: Body { badErgebnis?: string, beschaeftigungsverbot?: boolean }
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
    const extraData: Omit<Prisma.MutterschutzProzessUpdateInput, "status"> = {
      badAbgeschlossenAm: new Date(),
    };
    if (typeof body.badErgebnis === "string") {
      extraData.badErgebnis = body.badErgebnis;
    }
    if (typeof body.beschaeftigungsverbot === "boolean") {
      extraData.beschaeftigungsverbot = body.beschaeftigungsverbot;
    }

    const result = await mutterschutzTransition({
      prozessId: id,
      zielStatus: "BAD_ABGESCHLOSSEN",
      extraData,
      webhookEvent: "mutterschutz-bad-abgeschlossen",
      auditAction: "MUTTERSCHUTZ_BAD_ABGESCHLOSSEN",
      session,
      ipAddress,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ data: result.data });
  } catch (error) {
    console.error("[API] mutterschutz/bad-abschliessen fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
