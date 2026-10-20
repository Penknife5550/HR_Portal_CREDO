/**
 * Vertragsende: was in welchem Status geht — die Statuslisten der HR-Routen.
 *
 * Rein und client-sicher (aus Prisma nur ein Typ). Die Tabellen standen bis zum
 * Pilot des UX-Umbaus in den Routen selbst; sie liegen hier, damit die Routen
 * und der Test des Prozess-Adapters (`src/lib/prozess/vertragsende.ts`)
 * DIESELBEN Tabellen lesen — eine Kopie im Test liefe auseinander. Inhalt
 * unveraendert (Entscheidung P-F7 und Durchsicht vom 02.10.2026,
 * docs/module/ux-ui/pilot-feinplan.md).
 *
 * Was hier NICHT steht, prueft jede Route weiter selbst: Rolle und Mandant, ob
 * schon ein Offboarding verknuepft ist (`/nicht-uebernehmen`), ob der Link der
 * Fuehrungskraft existiert und noch gilt (`/reminder`).
 */
import type { ContractEndStatus } from "@prisma/client";

/**
 * HR-PATCH (`/api/contract-end/[id]`): gueltige Status-Uebergaenge. Die
 * Entscheidungen selbst laufen ueber die eigenen Routen `/supervisor-link`
 * (Strang A) und `/nicht-uebernehmen` (Strang B).
 */
export const CONTRACT_END_UEBERGAENGE: Record<string, string[]> = {
  ANGELEGT: ["ANFRAGE_VORGESETZTER", "ENTSCHEIDUNG_KEINE_UEBERNAHME", "STORNIERT"],
  ANFRAGE_VORGESETZTER: [
    "RUECKMELDUNG_UEBERNAHME",
    "RUECKMELDUNG_KEINE_UEBERNAHME",
    "ENTSCHEIDUNG_KEINE_UEBERNAHME",
    "STORNIERT",
  ],
  RUECKMELDUNG_UEBERNAHME: ["VERTRAG_ERSTELLT", "VERTRAG_UNTERSCHRIEBEN", "ABGESCHLOSSEN", "STORNIERT"],
  RUECKMELDUNG_KEINE_UEBERNAHME: ["ENTSCHEIDUNG_KEINE_UEBERNAHME", "STORNIERT"],
  ENTSCHEIDUNG_UEBERNAHME: ["VERTRAG_ERSTELLT", "ENTSCHEIDUNG_KEINE_UEBERNAHME", "STORNIERT"],
  VERTRAG_ERSTELLT: ["VERTRAG_UNTERSCHRIEBEN", "ABGESCHLOSSEN", "STORNIERT"],
  VERTRAG_UNTERSCHRIEBEN: ["ABGESCHLOSSEN", "STORNIERT"],
  ENTSCHEIDUNG_KEINE_UEBERNAHME: ["ABGESCHLOSSEN", "STORNIERT"],
  ABGESCHLOSSEN: [],
  STORNIERT: [],
};

/**
 * `/nicht-uebernehmen` (Strang B): Aus diesen Status darf HR das Offboarding
 * anlegen — direkt (ANGELEGT, ANFRAGE_VORGESETZTER) oder als Bestaetigung der
 * Ablehnung durch die Fuehrungskraft (RUECKMELDUNG_KEINE_UEBERNAHME).
 * ENTSCHEIDUNG_UEBERNAHME = Alt-Bestandsdaten. Die Route prueft die Liste im
 * bedingten `updateMany` (Schutz gegen Doppelklick).
 */
export const CONTRACT_END_OFFBOARDING_AUS: readonly ContractEndStatus[] = [
  "ANGELEGT",
  "ANFRAGE_VORGESETZTER",
  "ENTSCHEIDUNG_UEBERNAHME",
  "RUECKMELDUNG_KEINE_UEBERNAHME",
];

/**
 * `/supervisor-link` (Strang A): In diesen Status ist keine (neue) Anfrage an
 * die Fuehrungskraft mehr moeglich (400). Die ersten beiden seit 10/2026: Die
 * Fuehrungskraft hat schon geantwortet — eine neue Anfrage loeschte still
 * Entscheidung, Begruendung und Vorstand-Vermerk, und nach „Ja" bliebe das
 * Formular trotzdem gesperrt (`renewalData.isComplete`).
 */
export const CONTRACT_END_ANFRAGE_GESPERRT: readonly ContractEndStatus[] = [
  "RUECKMELDUNG_UEBERNAHME",
  "RUECKMELDUNG_KEINE_UEBERNAHME",
  "ENTSCHEIDUNG_KEINE_UEBERNAHME",
  "VERTRAG_ERSTELLT",
  "VERTRAG_UNTERSCHRIEBEN",
  "ABGESCHLOSSEN",
  "STORNIERT",
];

/**
 * `/reminder`: Erinnern ergibt nur Sinn, solange die Anfrage offen ist (sonst
 * 409). ENTSCHEIDUNG_UEBERNAHME = Alt-Bestandsdaten des frueheren Ablaufs.
 *
 * Dasselbe Statuspaar steht noch einmal im Formular der Fuehrungskraft
 * (`api/vertrag-formular/[token]/route.ts`) und im Erinnerungslauf
 * (`laeufe/vertragsende-erinnerungen.ts`) — beide lesen diese Liste noch nicht.
 */
export const CONTRACT_END_ANFRAGE_OFFEN: readonly ContractEndStatus[] = [
  "ANFRAGE_VORGESETZTER",
  "ENTSCHEIDUNG_UEBERNAHME",
];
