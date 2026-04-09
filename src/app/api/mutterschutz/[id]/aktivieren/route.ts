/**
 * API: POST /api/mutterschutz/[id]/aktivieren
 *
 * Wechselt den Status auf AKTIV (Schutzfrist beginnt).
 * Erlaubte Vorgaenger laut Workflow: GEMELDET (wenn !badErforderlich)
 * oder BAD_ABGESCHLOSSEN.
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
      zielStatus: "AKTIV",
      webhookEvent: "mutterschutz-aktiviert",
      auditAction: "MUTTERSCHUTZ_AKTIVIERT",
      session,
      ipAddress,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ data: result.data });
  } catch (error) {
    console.error("[API] mutterschutz/aktivieren fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
