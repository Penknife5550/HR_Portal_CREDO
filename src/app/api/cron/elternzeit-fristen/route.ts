/**
 * API: POST /api/cron/elternzeit-fristen
 *
 * Handaufruf des Laufs „Elternzeit-Fristen“ (Bearer CRON_SECRET). Im Normalbetrieb
 * startet ihn der Zeitplaner des Portals (Einstellungen → Automatische Läufe).
 * Die Regeln stehen in src/lib/laeufe/elternzeit-fristen.ts; die Route geht durch
 * `laufUeberRoute` — derselbe Anspruch, dasselbe Protokoll wie der Zeitplaner.
 * Antwort wie bisher; 409, solange der Lauf gerade arbeitet.
 */

import { NextRequest, NextResponse } from "next/server";
import { KONFIGURATIONSFEHLER, cronAnmeldungPruefen } from "@/lib/laeufe/cron-anmeldung";
import { laufUeberRoute } from "@/lib/zeitplaner/ausfuehren";
import { elternzeitFristenLauf } from "@/lib/laeufe/elternzeit-fristen";

export async function POST(request: NextRequest) {
  const abgewiesen = cronAnmeldungPruefen(request, {
    mindestLaenge: 24,
    fehlerText: KONFIGURATIONSFEHLER,
    logPraefix: "cron/elternzeit-fristen",
  });
  if (abgewiesen) return abgewiesen;

  const ergebnis = await laufUeberRoute("elternzeit-fristen", {}, elternzeitFristenLauf);
  return NextResponse.json(ergebnis.body, { status: ergebnis.status, headers: { "Cache-Control": "no-store" } });
}
