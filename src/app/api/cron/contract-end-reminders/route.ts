/**
 * API: POST /api/cron/contract-end-reminders
 *
 * Handaufruf des Laufs „Vertragsende-Erinnerungen“ (Bearer CRON_SECRET). Im Normalbetrieb
 * startet ihn der Zeitplaner des Portals (Einstellungen → Automatische Läufe).
 * Die Regeln stehen in src/lib/laeufe/vertragsende-erinnerungen.ts; die Route geht durch
 * `laufUeberRoute` — derselbe Anspruch, dasselbe Protokoll wie der Zeitplaner.
 * Antwort wie bisher; 409, solange der Lauf gerade arbeitet.
 */

import { NextRequest, NextResponse } from "next/server";
import { NICHT_KONFIGURIERT, cronAnmeldungPruefen } from "@/lib/laeufe/cron-anmeldung";
import { laufUeberRoute } from "@/lib/zeitplaner/ausfuehren";
import { vertragsendeErinnerungenLauf } from "@/lib/laeufe/vertragsende-erinnerungen";

export async function POST(request: NextRequest) {
  const abgewiesen = cronAnmeldungPruefen(request, { fehlerText: NICHT_KONFIGURIERT });
  if (abgewiesen) return abgewiesen;

  const ergebnis = await laufUeberRoute("contract-end-reminders", {}, vertragsendeErinnerungenLauf);
  return NextResponse.json(ergebnis.body, { status: ergebnis.status, headers: { "Cache-Control": "no-store" } });
}
