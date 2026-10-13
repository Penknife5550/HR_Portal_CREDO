/**
 * API: /api/onboarding-tasks/[token]/[itemId]/ausgaben/[ausgabeId]
 * (Ausstattung & Zugaenge, Stufe 2 – A4, Feinplan G6)
 *
 * DELETE - einen irrtuemlichen EIGENEN Vermerk entfernen (ueber den Link der
 *          Stelle). Nur Vermerke, die die Stelle selbst ueber den Link
 *          angelegt hat, die noch ausgegeben sind und an keinen Austritt
 *          gebunden sind — sonst 409; das Weitere regelt die Personalabteilung.
 *
 * OEFFENTLICH - kein Auth erforderlich!
 * Zugang ausschliesslich ueber einen gueltigen Token.
 *
 * Duenne Huelle um oeffentlicheAusgabeEntfernen
 * (src/lib/abteilungsaufgaben-uebergaenge.ts): dieselben Pruefungen wie beim
 * Vermerken, dazu Sperre und frischer Stand der Ausgabe (G24, G28), bedingtes
 * Loeschen ueber den einzigen Schreiber und das Protokoll. Keine Mail.
 * Antwort 200 { data: { ausgabe } }.
 */

import { NextRequest, NextResponse } from "next/server";
import { tokenRateLimiter, getClientIp } from "@/lib/rate-limit";
import { oeffentlicheAusgabeEntfernen } from "@/lib/abteilungsaufgaben-uebergaenge";
import { MELDUNGEN } from "@/lib/abteilungsaufgaben";

// =============================================
// DELETE /api/onboarding-tasks/[token]/[itemId]/ausgaben/[ausgabeId]
// =============================================
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; itemId: string; ausgabeId: string }> }
) {
  try {
    // Bremse je IP — VOR dem Token-Lookup, gemeinsam mit allen Token-Routen.
    if (!tokenRateLimiter.check(getClientIp(request)).allowed) {
      return NextResponse.json({ error: MELDUNGEN.ZU_VIELE_ANFRAGEN }, { status: 429 });
    }

    const { token, itemId, ausgabeId } = await params;
    const antwort = await oeffentlicheAusgabeEntfernen(token, itemId, ausgabeId);
    return NextResponse.json(antwort.body, { status: antwort.status });
  } catch (error) {
    console.error("[API] Übergabevermerk entfernen (Link) fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
