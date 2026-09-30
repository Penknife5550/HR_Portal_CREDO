/**
 * API: POST /api/cron/dokument-ablauf
 *
 * Handaufruf des Laufs „Ablauf befristeter Nachweise“ (Bearer CRON_SECRET). Im Normalbetrieb
 * startet ihn der Zeitplaner des Portals (Einstellungen → Automatische Läufe).
 * Die Regeln stehen in src/lib/laeufe/dokument-ablauf.ts; die Route geht durch
 * `laufUeberRoute` — derselbe Anspruch, dasselbe Protokoll wie der Zeitplaner.
 * Antwort wie bisher; 409, solange der Lauf gerade arbeitet.
 */

import { NextRequest, NextResponse } from "next/server";
import { NICHT_KONFIGURIERT, cronAnmeldungPruefen } from "@/lib/laeufe/cron-anmeldung";
import { laufUeberRoute } from "@/lib/zeitplaner/ausfuehren";
import { dokumentAblaufLauf } from "@/lib/laeufe/dokument-ablauf";

export async function POST(request: NextRequest) {
  const abgewiesen = cronAnmeldungPruefen(request, { fehlerText: NICHT_KONFIGURIERT });
  if (abgewiesen) return abgewiesen;

  const ergebnis = await laufUeberRoute("dokument-ablauf", {}, dokumentAblaufLauf);
  return NextResponse.json(ergebnis.body, { status: ergebnis.status, headers: { "Cache-Control": "no-store" } });
}
