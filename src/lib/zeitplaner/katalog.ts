/**
 * Zeitplaner — Katalog der automatischen Laeufe.
 *
 * Rein und client-sicher: Die Einstellungsseite liest Namen, Beschreibungen
 * und Faehigkeiten von hier; welche Funktion ein Lauf ausfuehrt, steht
 * serverseitig in `ausfuehren.ts` (AUSFUEHRER). Ein Test haelt beide gleich.
 *
 * Reihenfolge = Anzeige-Reihenfolge und ungefaehr die Tageszeit.
 */

export type LaufSchluessel =
  | "wartung"
  | "bem-aufbewahrung"
  | "dokumente-aufbewahrung"
  | "unterlagen-fristen"
  | "dokument-ablauf"
  | "reminders"
  | "offboarding-reminders"
  | "civil-service-deadlines"
  | "contract-end-reminders"
  | "elternzeit-fristen"
  | "bem-fristen";

export type LaufAusloeser = "ZEITPLAN" | "HAND" | "ROUTE";

export interface LaufDefinition {
  schluessel: LaufSchluessel;
  name: string;
  /** Ein Satz: was der Lauf tut. */
  beschreibung: string;
  /** Vorschlag beim ersten Anlegen ("HH:MM", deutsche Zeit). */
  standardUhrzeit: string;
  /** Kann der Lauf planen, ohne zu senden/loeschen/speichern (`dryRun`)? */
  kannProbelauf: boolean;
  /** Loescht der Lauf endgueltig? Dann ist der erste Lauf nach dem Einschalten ein Probelauf. */
  loescht: boolean;
  /** Mail-Vorlagen (Events), die der Lauf verschicken kann. */
  vorlagen: string[];
  /** Duenne Cron-Route fuer den Handaufruf (Bearer CRON_SECRET), falls vorhanden. */
  route: string | null;
}

export const LAEUFE: readonly LaufDefinition[] = [
  {
    schluessel: "wartung",
    name: "Wartung",
    beschreibung:
      "Löscht Einträge des Versandprotokolls und Protokolle der automatischen Läufe, die älter als 90 Tage sind.",
    standardUhrzeit: "03:30",
    kannProbelauf: true,
    loescht: true,
    vorlagen: [],
    route: null,
  },
  {
    schluessel: "bem-aufbewahrung",
    name: "BEM-Aufbewahrung",
    beschreibung:
      "Löscht BEM-Fälle, deren Aufbewahrungsfrist abgelaufen ist, samt Gesprächen, Maßnahmen, Einwilligungen und Dateien (die Hülle und das Protokoll bleiben).",
    standardUhrzeit: "03:00",
    kannProbelauf: true,
    loescht: true,
    vorlagen: [],
    route: "/api/cron/bem-aufbewahrung",
  },
  {
    schluessel: "dokumente-aufbewahrung",
    name: "Aufbewahrung erzeugter Dokumente",
    beschreibung:
      "Löscht erzeugte Dokumente (Briefe aus Vorlagen), die älter als 12 Monate sind — die führende Ablage ist das DMS.",
    standardUhrzeit: "03:15",
    kannProbelauf: true,
    loescht: true,
    vorlagen: [],
    route: "/api/cron/dokumente-aufbewahrung",
  },
  {
    schluessel: "unterlagen-fristen",
    name: "Unterlagen-Fristen",
    beschreibung:
      "Erinnert Personen an angeforderte Unterlagen (7 Tage vorher, am Fristtag), meldet HR verstrichene Fristen, holt gescheiterte Mails nach und löscht zurückgewiesene Dateien nach 30 Tagen.",
    standardUhrzeit: "07:00",
    kannProbelauf: true,
    loescht: true,
    vorlagen: ["unterlagen-erinnerung", "unterlagen-angefordert", "unterlagen-frist-verstrichen", "unterlagen-vollstaendig"],
    route: "/api/cron/unterlagen-fristen",
  },
  {
    schluessel: "dokument-ablauf",
    name: "Ablauf befristeter Nachweise",
    beschreibung: "Warnt HR, bevor Aufenthaltstitel und Arbeitserlaubnisse ablaufen, und meldet abgelaufene.",
    standardUhrzeit: "07:30",
    kannProbelauf: false,
    loescht: false,
    vorlagen: ["dokument-ablauf-warnung", "dokument-abgelaufen"],
    route: "/api/cron/dokument-ablauf",
  },
  {
    schluessel: "reminders",
    name: "Onboarding-Erinnerungen",
    beschreibung:
      "Erinnert an offene Personalfragebögen und Einstellungsmodalitäten (wöchentlich) und an offene Aufgaben der Abteilungen im Onboarding.",
    standardUhrzeit: "08:00",
    kannProbelauf: false,
    loescht: false,
    vorlagen: ["employee-reminder", "supervisor-reminder", "onboarding-department-reminder"],
    route: "/api/cron/reminders",
  },
  {
    schluessel: "offboarding-reminders",
    name: "Offboarding-Erinnerungen",
    beschreibung: "Erinnert Abteilungen und Führungskräfte an offene Aufgaben im Offboarding (Stufen Info, Warnung, Eskalation).",
    standardUhrzeit: "08:00",
    kannProbelauf: false,
    loescht: false,
    vorlagen: ["offboarding-reminder"],
    route: "/api/cron/offboarding-reminders",
  },
  {
    schluessel: "civil-service-deadlines",
    name: "Verbeamtungs-Fristen",
    beschreibung:
      "Prüft die Fristen der Verbeamtung (Amtsarzt, Unterrichtsbesuche, RV-Befreiung, BR-Genehmigung) und warnt HR.",
    standardUhrzeit: "08:15",
    kannProbelauf: false,
    loescht: false,
    vorlagen: ["psi-deadline-warning"],
    route: "/api/cron/civil-service-deadlines",
  },
  {
    schluessel: "contract-end-reminders",
    name: "Vertragsende-Erinnerungen",
    beschreibung:
      "Erinnert Führungskräfte an offene Übernahme-Anfragen, eskaliert an HR und meldet montags unbearbeitete Vorgänge.",
    standardUhrzeit: "08:15",
    kannProbelauf: false,
    loescht: false,
    vorlagen: ["contract-end-supervisor-reminder", "contract-end-eskalation", "contract-end-unbearbeitet"],
    route: "/api/cron/contract-end-reminders",
  },
  {
    schluessel: "elternzeit-fristen",
    name: "Elternzeit-Fristen",
    beschreibung: "Aktualisiert die Fristen der Elternzeit-Vorgänge und meldet HR, wenn eine Frist eine Stufe höher rutscht.",
    standardUhrzeit: "08:30",
    kannProbelauf: false,
    loescht: false,
    vorlagen: ["elternzeit-frist-eskaliert"],
    route: "/api/cron/elternzeit-fristen",
  },
  {
    schluessel: "bem-fristen",
    name: "BEM-Fristen",
    beschreibung:
      "Aktualisiert die Fristen der BEM-Fälle und erinnert die im Fall freigegebenen Beauftragten, wenn eine Frist eine Stufe höher rutscht.",
    standardUhrzeit: "08:30",
    kannProbelauf: false,
    loescht: false,
    vorlagen: ["bem-frist-erinnerung"],
    route: "/api/cron/bem-fristen",
  },
];

const nachSchluessel = new Map(LAEUFE.map((l) => [l.schluessel, l]));

export function laufDefinition(schluessel: string): LaufDefinition | undefined {
  return nachSchluessel.get(schluessel as LaufSchluessel);
}

export function istLaufSchluessel(wert: unknown): wert is LaufSchluessel {
  return typeof wert === "string" && nachSchluessel.has(wert as LaufSchluessel);
}

export const AUSLOESER_TEXTE: Record<LaufAusloeser, string> = {
  ZEITPLAN: "Zeitplan",
  HAND: "von Hand",
  ROUTE: "Cron-Route",
};

/** Ergebnis eines Laufs im Protokoll. */
export type LaufErgebnisArt = "LAEUFT" | "OK" | "PROBLEME" | "FEHLER";

export const ERGEBNIS_TEXTE: Record<LaufErgebnisArt, string> = {
  LAEUFT: "läuft",
  OK: "ohne Befund",
  PROBLEME: "bitte prüfen",
  FEHLER: "fehlgeschlagen",
};

/** Sperre gilt als verwaist, wenn ein Lauf so lange ohne Ende steht. */
export const SPERRE_VERWAIST_MS = 2 * 60 * 60 * 1000;

/** Protokolle und Versandprotokoll werden nach so vielen Tagen geloescht. */
export const PROTOKOLL_AUFBEWAHRUNG_TAGE = 90;

/** Ein aktiver Lauf ohne Protokoll seit so vielen Stunden gilt als ausgefallen. */
export const WAECHTER_STUNDEN = 26;
