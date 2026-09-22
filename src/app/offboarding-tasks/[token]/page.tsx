"use client";

/**
 * Offboarding-Aufgaben – Magic-Link-Seite einer Abteilung (ohne Anmeldung)
 *
 * Duenne Huelle um die gemeinsame Aufgabenseite
 * (src/components/abteilungsaufgaben/aufgaben-seite.tsx), die Paket 5 fuer
 * das Onboarding wiederverwendet. Hier stehen nur die Offboarding-Begriffe.
 *
 * Die URL /offboarding-tasks/<token> bleibt stabil: Sie steckt in bereits
 * verschickten Mails (abteilungsAufgabenLink in src/lib/offboarding-mail.ts).
 */

import { useParams } from "next/navigation";
import { AufgabenSeite } from "@/components/abteilungsaufgaben/aufgaben-seite";
import { CHECKLIST_PHASE_LABELS } from "@/app/(portal)/dashboard/offboarding/[id]/helpers";

/** Countdown zum letzten Arbeitstag — bewusst ohne rotes „überfällig". */
function countdownLetzterArbeitstag(tage: number): string {
  if (tage > 1) return `Noch ${tage} Tage bis zum letzten Arbeitstag`;
  if (tage === 1) return "Morgen ist der letzte Arbeitstag";
  if (tage === 0) return "Heute ist der letzte Arbeitstag";
  const vor = Math.abs(tage);
  return `Letzter Arbeitstag war vor ${vor} ${vor === 1 ? "Tag" : "Tagen"}`;
}

/** Phasen wie im Portal (dort mit Umlauten), sonst der Rohwert. */
function phasenLabel(kategorie: string): string {
  return CHECKLIST_PHASE_LABELS[kategorie] || kategorie;
}

export default function OffboardingTasksPage() {
  const params = useParams();
  const token = String(params.token ?? "");

  return (
    <AufgabenSeite
      apiBasis="/api/offboarding-tasks"
      token={token}
      modulTitel="Offboarding"
      personLabel="Mitarbeiterin / Mitarbeiter"
      bezugsdatumLabel="Letzter Arbeitstag"
      countdownText={countdownLetzterArbeitstag}
      kategorieLabel={phasenLabel}
    />
  );
}
