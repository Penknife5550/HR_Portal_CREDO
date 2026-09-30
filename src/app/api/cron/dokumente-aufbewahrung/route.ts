/**
 * API: POST /api/cron/dokumente-aufbewahrung[?dryRun=1]
 *
 * Handaufruf des Laufs „Aufbewahrung erzeugter Dokumente“ (Bearer CRON_SECRET). Im Normalbetrieb
 * startet ihn der Zeitplaner des Portals (Einstellungen → Automatische Läufe).
 * Die Regeln stehen in src/lib/laeufe/dokumente-aufbewahrung.ts; die Route geht durch
 * `laufUeberRoute` — derselbe Anspruch, dasselbe Protokoll wie der Zeitplaner.
 * Antwort wie bisher; 409, solange der Lauf gerade arbeitet.
 * `?dryRun=1`: Probelauf — planen und zaehlen, nichts senden oder loeschen.
 */

import { NextRequest, NextResponse } from "next/server";
import { KONFIGURATIONSFEHLER, cronAnmeldungPruefen } from "@/lib/laeufe/cron-anmeldung";
import { laufUeberRoute } from "@/lib/zeitplaner/ausfuehren";
import { dokumenteAufbewahrungLauf } from "@/lib/laeufe/dokumente-aufbewahrung";

export async function POST(request: NextRequest) {
  const abgewiesen = cronAnmeldungPruefen(request, {
    mindestLaenge: 24,
    fehlerText: KONFIGURATIONSFEHLER,
    logPraefix: "cron/dokumente-aufbewahrung",
  });
  if (abgewiesen) return abgewiesen;

  const ergebnis = await laufUeberRoute("dokumente-aufbewahrung", { dryRun: request.nextUrl.searchParams.get("dryRun") === "1" }, dokumenteAufbewahrungLauf);
  return NextResponse.json(ergebnis.body, { status: ergebnis.status, headers: { "Cache-Control": "no-store" } });
}
