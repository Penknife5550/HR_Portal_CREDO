/**
 * API: /api/offboarding-tasks/[token]/[itemId]
 *
 * PATCH - Aufgabe abhaken, wieder oeffnen und/oder kommentieren (ueber den Link)
 *
 * OEFFENTLICH - kein Auth erforderlich!
 * Zugang ausschliesslich ueber einen gueltigen Token.
 *
 * Request: { isCompleted?: boolean, comment?: string | null }
 *          (comment null/fehlend = unveraendert, "" = loeschen)
 *
 * Duenne Huelle um oeffentlicheAufgabeAendern
 * (src/lib/abteilungsaufgaben-uebergaenge.ts). Dort: Tokenpruefung,
 * Vorgangsstatus (410 abgebrochen, 409 abgeschlossen), Ablauf, die zweite
 * Bremse je Link (60/min), zod, Zugehoerigkeit der Aufgabe, gesperrte
 * Transaktion, Protokoll und die Mails — genau einmal je echtem Wechsel.
 * Die interne HR-Notiz (`notes`) nimmt das Schema gar nicht erst an.
 */

import { NextRequest, NextResponse } from "next/server";
import { tokenRateLimiter, getClientIp } from "@/lib/rate-limit";
import { oeffentlicheAufgabeAendern } from "@/lib/abteilungsaufgaben-uebergaenge";
import { MELDUNGEN } from "@/lib/abteilungsaufgaben";

// =============================================
// PATCH /api/offboarding-tasks/[token]/[itemId]
// =============================================
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; itemId: string }> }
) {
  try {
    // Bremse je IP — VOR dem Token-Lookup, unveraendert gemeinsam mit allen
    // Token-Routen. Die zweite Bremse je Link sitzt im Dienst (nach der
    // Tokenpruefung, Schluessel = Link-ID).
    if (!tokenRateLimiter.check(getClientIp(request)).allowed) {
      return NextResponse.json({ error: MELDUNGEN.ZU_VIELE_ANFRAGEN }, { status: 429 });
    }

    const { token, itemId } = await params;
    // Kaputter oder leerer Body → undefined; das Schema antwortet dann mit
    // 400 "Ungültige Eingabe" (frueher 500).
    const roh = await request.json().catch(() => undefined);
    const antwort = await oeffentlicheAufgabeAendern(token, itemId, roh);
    return NextResponse.json(antwort.body, { status: antwort.status });
  } catch (error) {
    console.error("[API] Offboarding-Task aktualisieren fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
