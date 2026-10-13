/**
 * API: /api/onboarding-tasks/[token]/[itemId]/ausgaben
 * (Ausstattung & Zugaenge, Stufe 2 – A4, Feinplan G6)
 *
 * POST - „Übergabe vermerken“: Die Stelle haelt ueber ihren Link fest, welche
 *        Stuecke sie zu einer Ausstattungsaufgabe ausgegeben bzw. eingerichtet
 *        hat — getrennt vom Abhaken.
 *
 * OEFFENTLICH - kein Auth erforderlich!
 * Zugang ausschliesslich ueber einen gueltigen Token.
 *
 * Request: { stuecke: [{ kennung?: string | null, uebergebenAm?: "YYYY-MM-DD" }] }
 *          (1 bis 10 Stueck; ohne Datum gilt heute)
 *
 * Duenne Huelle um oeffentlicheAusgabeVermerken
 * (src/lib/abteilungsaufgaben-uebergaenge.ts). Dort: Tokenpruefung (ein
 * Offboarding-Token ist hier "Ungültiger Link"), Vorgangsstatus (410 nicht mehr
 * aktiv, 409 abgeschlossen), Ablauf, die zweite Bremse je Link (60/min), zod,
 * Zugehoerigkeit der Aufgabe zu dieser Stelle, gesperrte Transaktion,
 * Grenzen, das Schreiben ueber den einzigen Schreiber der Tabelle und das
 * Protokoll (ohne Kennung). Keine Mail. Antwort 201 { data: { ausgabe } }.
 */

import { NextRequest, NextResponse } from "next/server";
import { tokenRateLimiter, getClientIp } from "@/lib/rate-limit";
import { oeffentlicheAusgabeVermerken } from "@/lib/abteilungsaufgaben-uebergaenge";
import { MELDUNGEN } from "@/lib/abteilungsaufgaben";

// =============================================
// POST /api/onboarding-tasks/[token]/[itemId]/ausgaben
// =============================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; itemId: string }> }
) {
  try {
    // Bremse je IP — VOR dem Token-Lookup, gemeinsam mit allen Token-Routen.
    // Die zweite Bremse je Link sitzt im Dienst (nach der Tokenpruefung).
    if (!tokenRateLimiter.check(getClientIp(request)).allowed) {
      return NextResponse.json({ error: MELDUNGEN.ZU_VIELE_ANFRAGEN }, { status: 429 });
    }

    const { token, itemId } = await params;
    // Kaputter oder leerer Body → undefined; das Schema antwortet dann mit 400.
    const roh = await request.json().catch(() => undefined);
    const antwort = await oeffentlicheAusgabeVermerken(token, itemId, roh);
    return NextResponse.json(antwort.body, { status: antwort.status });
  } catch (error) {
    console.error("[API] Übergabe vermerken (Link) fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
