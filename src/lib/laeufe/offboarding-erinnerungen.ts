/**
 * Lauf „Offboarding-Erinnerungen“ — Erinnerungen an die Abteilungen und
 * Fuehrungskraefte eines Offboardings. Die Regeln stehen in
 * src/lib/abteilungsaufgaben-dienst.ts (`erinnerungenSenden`); hier nur die
 * Antwortform, dieselbe wie vorher in der Route /api/cron/offboarding-reminders.
 */

import { erinnerungenSenden } from "@/lib/abteilungsaufgaben-dienst";
import { fehlerKennung } from "@/lib/fehler-kennung";
import { LAUF_FEHLER_BODY, type LaufErgebnis, type LaufOptionen } from "@/lib/laeufe/lauf-ergebnis";

export async function offboardingErinnerungenLauf(opts: LaufOptionen = {}): Promise<LaufErgebnis> {
  const now = opts.jetzt ?? new Date();
  try {
    const ergebnis = await erinnerungenSenden(now);
    return {
      status: 200,
      body: {
        success: true,
        timestamp: now.toISOString(),
        remindersProcessed: ergebnis.remindersProcessed,
        errors: ergebnis.errors,
        details: ergebnis.details,
        uebersprungen: ergebnis.uebersprungen,
      },
    };
  } catch (error) {
    console.error("[Offboarding-Reminders] Schwerer Fehler:", fehlerKennung(error));
    return { status: 500, body: LAUF_FEHLER_BODY };
  }
}
