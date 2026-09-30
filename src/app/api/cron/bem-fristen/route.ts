/**
 * API: POST /api/cron/bem-fristen
 *
 * Handaufruf des Laufs „BEM-Fristen“ (Bearer CRON_SECRET). Im Normalbetrieb
 * startet ihn der Zeitplaner des Portals (Einstellungen → Automatische Läufe).
 * Die Regeln stehen in src/lib/laeufe/bem-fristen.ts; die Route geht durch
 * `laufUeberRoute` — derselbe Anspruch, dasselbe Protokoll wie der Zeitplaner.
 * Antwort wie bisher; 409, solange der Lauf gerade arbeitet.
 */

import { NextRequest, NextResponse } from "next/server";
import { KONFIGURATIONSFEHLER, cronAnmeldungPruefen } from "@/lib/laeufe/cron-anmeldung";
import { laufUeberRoute } from "@/lib/zeitplaner/ausfuehren";
import { bemFristenLauf } from "@/lib/laeufe/bem-fristen";

export async function POST(request: NextRequest) {
  const abgewiesen = cronAnmeldungPruefen(request, {
    mindestLaenge: 24,
    fehlerText: KONFIGURATIONSFEHLER,
    logPraefix: "cron/bem-fristen",
  });
  if (abgewiesen) return abgewiesen;

  const ergebnis = await laufUeberRoute("bem-fristen", {}, bemFristenLauf);
  return NextResponse.json(ergebnis.body, { status: ergebnis.status, headers: { "Cache-Control": "no-store" } });
}
