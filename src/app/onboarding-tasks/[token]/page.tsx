"use client";

/**
 * Onboarding-Aufgaben – Magic-Link-Seite einer Abteilung (ohne Anmeldung)
 *
 * Duenne Huelle um dieselbe Komponente, die das Offboarding seit Paket 1b
 * nutzt (src/components/abteilungsaufgaben/aufgaben-seite.tsx). Hier stehen
 * nur die Onboarding-Begriffe; alles andere — Laden, Abhaken, Kommentar,
 * Fehlerseite, Fusszeile — ist geteilt.
 *
 * `kategorieLabel` fehlt mit Absicht: Onboarding-Kategorien sind schon
 * Klartext aus der Vorlage („Vor dem ersten Tag"), keine Phasen-Schluessel.
 */

import { useParams } from "next/navigation";
import { AufgabenSeite } from "@/components/abteilungsaufgaben/aufgaben-seite";

/** Countdown zum Vertragsbeginn — nach dem Dienstbeginn ohne rotes „überfällig". */
function countdownDienstbeginn(tage: number): string {
  if (tage > 1) return `Noch ${tage} Tage`;
  if (tage === 1) return "Morgen beginnt der Dienst";
  if (tage === 0) return "Heute ist der erste Arbeitstag";
  const seit = Math.abs(tage);
  return `Seit ${seit} ${seit === 1 ? "Tag" : "Tagen"} im Dienst`;
}

export default function OnboardingTasksPage() {
  const params = useParams();
  const token = String(params.token ?? "");

  return (
    <AufgabenSeite
      apiBasis="/api/onboarding-tasks"
      token={token}
      modulTitel="Onboarding"
      personLabel="Neue Mitarbeiterin / neuer Mitarbeiter"
      bezugsdatumLabel="Vertragsbeginn"
      countdownText={countdownDienstbeginn}
      countdownLabel="Bis zum Dienstbeginn"
    />
  );
}
