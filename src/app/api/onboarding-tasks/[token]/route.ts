/**
 * API: /api/onboarding-tasks/[token]
 *
 * GET - Onboarding-Aufgaben EINER Abteilung laden (ueber ihren Link)
 *
 * OEFFENTLICH - kein Auth erforderlich!
 * Zugang ausschliesslich ueber einen gueltigen Token.
 *
 * Duenne Huelle um oeffentlicheOnboardingAufgabenLaden
 * (src/lib/abteilungsaufgaben-uebergaenge.ts). Dort stehen Tokenpruefung (ein
 * Offboarding-Token ist hier "Ungültiger Link"), Vorgangsstatus (EXPIRED → 410
 * „Dieser Vorgang ist nicht mehr aktiv …", COMPLETED → readOnly), Ablauf (410),
 * Oeffnungszaehler und der Datenzuschnitt: Name, Einrichtung, Vorgangsnummer,
 * Vertragsbeginn, die eigenen Aufgaben mit dem Hinweis aus der Vorlage und die
 * Zusatzfelder, die dem Schluessel erlaubt sind (`zusatz`). NIE die interne
 * HR-Notiz, die private Adresse der Person, Fragebogen-Angaben oder den
 * Fortschritt anderer Abteilungen.
 */

import { NextRequest, NextResponse } from "next/server";
import { tokenRateLimiter, getClientIp } from "@/lib/rate-limit";
import { oeffentlicheOnboardingAufgabenLaden } from "@/lib/abteilungsaufgaben-uebergaenge";
import { MELDUNGEN } from "@/lib/abteilungsaufgaben";

// =============================================
// GET /api/onboarding-tasks/[token]
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
    const antwort = await oeffentlicheOnboardingAufgabenLaden(token);
    return NextResponse.json(antwort.body, { status: antwort.status });
  } catch (error) {
    console.error("[API] Onboarding-Tasks laden fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
