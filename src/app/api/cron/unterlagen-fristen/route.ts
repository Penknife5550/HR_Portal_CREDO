/**
 * API: POST /api/cron/unterlagen-fristen[?dryRun=1]
 *
 * Handaufruf des Laufs „Unterlagen-Fristen“ (Bearer CRON_SECRET). Im Normalbetrieb
 * startet ihn der Zeitplaner des Portals (Einstellungen → Automatische Läufe).
 * Die Regeln stehen in src/lib/unterlagen-lauf.ts; die Route geht durch
 * `laufUeberRoute` — derselbe Anspruch, dasselbe Protokoll wie der Zeitplaner.
 * Antwort wie bisher; 409, solange der Lauf gerade arbeitet.
 * `?dryRun=1`: Probelauf — planen und zaehlen, nichts senden oder loeschen.
 */

import { NextRequest, NextResponse } from "next/server";
import { KONFIGURATIONSFEHLER, cronAnmeldungPruefen } from "@/lib/laeufe/cron-anmeldung";
import { laufUeberRoute } from "@/lib/zeitplaner/ausfuehren";
import { unterlagenFristenLauf } from "@/lib/unterlagen-lauf";

export async function POST(request: NextRequest) {
  const abgewiesen = cronAnmeldungPruefen(request, {
    mindestLaenge: 24,
    fehlerText: KONFIGURATIONSFEHLER,
    logPraefix: "cron/unterlagen-fristen",
  });
  if (abgewiesen) return abgewiesen;

  const ergebnis = await laufUeberRoute("unterlagen-fristen", { dryRun: request.nextUrl.searchParams.get("dryRun") === "1" }, unterlagenFristenLauf);
  return NextResponse.json(ergebnis.body, { status: ergebnis.status, headers: { "Cache-Control": "no-store" } });
}
