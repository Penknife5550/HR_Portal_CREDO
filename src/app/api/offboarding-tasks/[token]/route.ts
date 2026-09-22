/**
 * API: /api/offboarding-tasks/[token]
 *
 * GET - Aufgaben EINER Abteilung laden (ueber ihren Link)
 *
 * OEFFENTLICH - kein Auth erforderlich!
 * Zugang ausschliesslich ueber einen gueltigen Token.
 *
 * Duenne Huelle um oeffentlicheAufgabenLaden
 * (src/lib/abteilungsaufgaben-uebergaenge.ts). Dort stehen Tokenpruefung,
 * Vorgangsstatus (abgebrochen → 410, abgeschlossen → readOnly), Ablauf (410),
 * Oeffnungszaehler und der Datenzuschnitt: nur die eigenen Aufgaben, ohne
 * interne HR-Notiz, ohne Beschreibung, ohne Fortschritt anderer Abteilungen.
 */

import { NextRequest, NextResponse } from "next/server";
import { tokenRateLimiter, getClientIp } from "@/lib/rate-limit";
import { oeffentlicheAufgabenLaden } from "@/lib/abteilungsaufgaben-uebergaenge";
import { MELDUNGEN } from "@/lib/abteilungsaufgaben";

// =============================================
// GET /api/offboarding-tasks/[token]
// =============================================
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    // Bremse je IP gegen das Durchprobieren von Tokens — VOR dem Lookup und
    // gemeinsam mit allen anderen Token-Routen (ein Zaehler je IP).
    if (!tokenRateLimiter.check(getClientIp(request)).allowed) {
      return NextResponse.json({ error: MELDUNGEN.ZU_VIELE_ANFRAGEN }, { status: 429 });
    }

    const { token } = await params;
    const antwort = await oeffentlicheAufgabenLaden(token);
    return NextResponse.json(antwort.body, { status: antwort.status });
  } catch (error) {
    console.error("[API] Offboarding-Tasks laden fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
