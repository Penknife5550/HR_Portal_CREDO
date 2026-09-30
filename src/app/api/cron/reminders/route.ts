/**
 * API: POST /api/cron/reminders
 *
 * Handaufruf des Laufs „Onboarding-Erinnerungen“ (Bearer CRON_SECRET). Im Normalbetrieb
 * startet ihn der Zeitplaner des Portals (Einstellungen → Automatische Läufe).
 * Die Regeln stehen in src/lib/laeufe/onboarding-erinnerungen.ts; die Route geht durch
 * `laufUeberRoute` — derselbe Anspruch, dasselbe Protokoll wie der Zeitplaner.
 * Antwort wie bisher; 409, solange der Lauf gerade arbeitet.
 */

import { NextRequest, NextResponse } from "next/server";
import { NICHT_KONFIGURIERT, cronAnmeldungPruefen } from "@/lib/laeufe/cron-anmeldung";
import { laufUeberRoute } from "@/lib/zeitplaner/ausfuehren";
import { onboardingErinnerungenLauf } from "@/lib/laeufe/onboarding-erinnerungen";

export async function POST(request: NextRequest) {
  const abgewiesen = cronAnmeldungPruefen(request, { fehlerText: NICHT_KONFIGURIERT });
  if (abgewiesen) return abgewiesen;

  const ergebnis = await laufUeberRoute("reminders", {}, onboardingErinnerungenLauf);
  return NextResponse.json(ergebnis.body, { status: ergebnis.status, headers: { "Cache-Control": "no-store" } });
}
