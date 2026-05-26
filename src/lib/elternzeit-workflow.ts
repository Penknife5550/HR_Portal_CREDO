/**
 * Elternzeit-Workflow — deklarative State-Maschine
 *
 * Definiert den vollstaendigen Prozess als geordnete Schritte und liefert:
 *  - STEPS: Reihenfolge aller Schritte vom Anlegen bis zum Abschluss
 *  - getStepIndex(status): Position des aktuellen Status in STEPS
 *  - getNaechsterSchritt(data): naechster faelliger Schritt + zugehoerige HR-Aktion
 *  - isErsterSchritt / isLetzterSchritt: Helfer für den Stepper-UI
 *
 * Ziel: Ein Dritter sieht im UI sofort, wo der Vorgang gerade steht,
 * was getan wurde und was als naechstes passieren muss.
 */

export type ElternzeitStatus =
  | "ANGELEGT"
  | "ANTRAG_VORL_VERSANDT"
  | "ANTRAG_VORL_EINGEREICHT"
  | "VORLAEUFIG_GENEHMIGT"
  | "VORLAEUFIG_ABGELEHNT"
  | "ANTRAG_ENDG_VERSANDT"
  | "ANTRAG_ENDG_EINGEREICHT"
  | "GENEHMIGT"
  | "AKTIV"
  | "UNTERBROCHEN"
  | "RUECKKEHR_GEPLANT"
  | "BEENDET"
  | "ABGELEHNT";

export type WorkflowStep = {
  /** Status-Wert, dem der Schritt entspricht */
  id: ElternzeitStatus;
  /** Kurzlabel für den Stepper */
  label: string;
  /** Ausfuehrlichere Beschreibung für Tooltip / Banner */
  beschreibung: string;
  /** Phase (1-4) — für Gruppenfarben im Stepper */
  phase: 1 | 2 | 3 | 4;
};

/**
 * Hauptpfad — der "happy path" durch den Prozess.
 * Nebenpfade (Ablehnungen, Unterbrechung) sind hier bewusst NICHT
 * Teil der Sequenz, sondern werden im UI separat als Endzustand markiert.
 */
export const ELTERNZEIT_STEPS: WorkflowStep[] = [
  {
    id: "ANGELEGT",
    label: "Vorgang angelegt",
    beschreibung: "HR hat den Elternzeit-Vorgang im Portal angelegt.",
    phase: 1,
  },
  {
    id: "ANTRAG_VORL_VERSANDT",
    label: "Vorl. Magic-Link versandt",
    beschreibung:
      "Magic-Link für den vorläufigen Antrag wurde an den Mitarbeiter verschickt.",
    phase: 1,
  },
  {
    id: "ANTRAG_VORL_EINGEREICHT",
    label: "Vorl. Antrag eingegangen",
    beschreibung:
      "Mitarbeiter hat den vorläufigen Antrag (Formular 1) abgesendet.",
    phase: 1,
  },
  {
    id: "VORLAEUFIG_GENEHMIGT",
    label: "Vorläufig genehmigt",
    beschreibung:
      "HR hat den vorläufigen Antrag genehmigt. Briefe an BR Detmold / VBL koennen erstellt werden.",
    phase: 2,
  },
  {
    id: "ANTRAG_ENDG_VERSANDT",
    label: "Endg. Magic-Link versandt",
    beschreibung:
      "Nach Geburt: Magic-Link für den endgültigen Antrag inkl. Geburtsurkunde wurde versendet.",
    phase: 2,
  },
  {
    id: "ANTRAG_ENDG_EINGEREICHT",
    label: "Endg. Antrag eingegangen",
    beschreibung:
      "Mitarbeiter hat den endgültigen Antrag inkl. Geburtsurkunde eingereicht.",
    phase: 2,
  },
  {
    id: "GENEHMIGT",
    label: "Endg. genehmigt",
    beschreibung:
      "HR hat den endgültigen Antrag genehmigt. Endgültige Genehmigung als PDF verfuegbar.",
    phase: 2,
  },
  {
    id: "AKTIV",
    label: "Elternzeit laeuft",
    beschreibung: "Die Elternzeit hat begonnen und laeuft aktiv.",
    phase: 3,
  },
  {
    id: "RUECKKEHR_GEPLANT",
    label: "Rueckkehr geplant",
    beschreibung:
      "Rueckkehr aus Elternzeit ist mit dem Mitarbeiter abgestimmt.",
    phase: 4,
  },
  {
    id: "BEENDET",
    label: "Abgeschlossen",
    beschreibung: "Der Vorgang ist vollstaendig abgeschlossen.",
    phase: 4,
  },
];

/** Endzustaende ausserhalb der Hauptsequenz (werden im Stepper als "Abbruch" markiert) */
export const ELTERNZEIT_ABBRUCH_STATES: ElternzeitStatus[] = [
  "VORLAEUFIG_ABGELEHNT",
  "ABGELEHNT",
];

/** Sonderzustand: Vorgang ist vorruebergehend pausiert */
export const ELTERNZEIT_PAUSE_STATES: ElternzeitStatus[] = ["UNTERBROCHEN"];

/**
 * Liefert den Index des aktuellen Status in der Hauptsequenz.
 * Gibt -1 zurück, wenn der Status ein Abbruch- oder Pausenzustand ist.
 */
export function getStepIndex(status: ElternzeitStatus): number {
  return ELTERNZEIT_STEPS.findIndex((s) => s.id === status);
}

export function isErsterSchritt(status: ElternzeitStatus): boolean {
  return ELTERNZEIT_STEPS[0]?.id === status;
}

export function isLetzterSchritt(status: ElternzeitStatus): boolean {
  return ELTERNZEIT_STEPS[ELTERNZEIT_STEPS.length - 1]?.id === status;
}

/**
 * Action-Typen für den "Naechster Schritt"-Banner.
 * Das UI mappt diese auf konkrete Buttons / Modal-Aufrufe.
 */
export type ElternzeitNaechsterSchrittAction =
  | "MAGIC_LINK_VORL"
  | "GENEHMIGEN_VORL"
  | "MAGIC_LINK_ENDG"
  | "GENEHMIGEN_ENDG"
  | "RUECKKEHR_PLANEN"
  | "BEENDEN"
  | "WARTEN_AUF_MITARBEITER"
  | "WARTEN_AUF_GEBURT"
  | "ABGESCHLOSSEN"
  | "ABGEBROCHEN"
  | "PAUSIERT";

export type NaechsterSchritt = {
  /** Kurzer Titel für den Banner */
  titel: string;
  /** Detail-Beschreibung */
  beschreibung: string;
  /** Action-Identifier — das UI entscheidet, ob daraus ein Button wird */
  action: ElternzeitNaechsterSchrittAction;
  /** Beschriftung für den Action-Button (falls anwendbar) */
  actionLabel?: string;
  /** Ist der naechste Schritt eine HR-Aktion (true) oder warten wir auf den Mitarbeiter (false)? */
  hrAktion: boolean;
};

/**
 * Liefert den naechsten faelligen Schritt für den aktuellen Vorgang.
 * Verwendet ausschliesslich den Status — Daten-Felder sind aktuell nicht
 * noetig, koennen aber spaeter ergaenzt werden (z.B. für Rueckkehr-Logik).
 */
export function getNaechsterSchritt(
  status: ElternzeitStatus,
): NaechsterSchritt {
  switch (status) {
    case "ANGELEGT":
      return {
        titel: "Magic-Link für vorläufigen Antrag versenden",
        beschreibung:
          "Erzeuge den Magic-Link und sende ihn an den Mitarbeiter, damit er den vorläufigen Antrag (Formular 1) ausfüllen kann.",
        action: "MAGIC_LINK_VORL",
        actionLabel: "Magic-Link senden",
        hrAktion: true,
      };
    case "ANTRAG_VORL_VERSANDT":
      return {
        titel: "Warten auf den Mitarbeiter",
        beschreibung:
          "Der Mitarbeiter hat den Magic-Link erhalten. Sobald der vorläufige Antrag abgesendet wurde, kann HR ihn pruefen und genehmigen.",
        action: "WARTEN_AUF_MITARBEITER",
        hrAktion: false,
      };
    case "ANTRAG_VORL_EINGEREICHT":
      return {
        titel: "Vorläufigen Antrag pruefen und genehmigen",
        beschreibung:
          "Der Mitarbeiter hat den Antrag eingereicht. Pruefe die Angaben und genehmige (oder lehne ab).",
        action: "GENEHMIGEN_VORL",
        actionLabel: "Vorläufig genehmigen",
        hrAktion: true,
      };
    case "VORLAEUFIG_GENEHMIGT":
      return {
        titel: "Auf Geburt warten — danach endg. Magic-Link senden",
        beschreibung:
          "Der vorläufige Antrag ist genehmigt. Sobald die Geburt erfolgt ist, kann der Magic-Link für den endgültigen Antrag (mit Geburtsurkunde) versendet werden.",
        action: "MAGIC_LINK_ENDG",
        actionLabel: "Endg. Magic-Link senden",
        hrAktion: true,
      };
    case "ANTRAG_ENDG_VERSANDT":
      return {
        titel: "Warten auf endg. Antrag + Geburtsurkunde",
        beschreibung:
          "Der Mitarbeiter hat den Magic-Link für den endgültigen Antrag erhalten. Sobald Antrag + Geburtsurkunde eingereicht sind, kann HR endgültig genehmigen.",
        action: "WARTEN_AUF_MITARBEITER",
        hrAktion: false,
      };
    case "ANTRAG_ENDG_EINGEREICHT":
      return {
        titel: "Endgültigen Antrag genehmigen",
        beschreibung:
          "Der endgültige Antrag inkl. Geburtsurkunde liegt vor. Pruefe und genehmige endgültig.",
        action: "GENEHMIGEN_ENDG",
        actionLabel: "Endgültig genehmigen",
        hrAktion: true,
      };
    case "GENEHMIGT":
      return {
        titel: "Warten auf Beginn der Elternzeit",
        beschreibung:
          "Der Vorgang ist endgültig genehmigt. Mit Erreichen des EZ-Beginns wechselt der Status automatisch auf 'Aktiv'.",
        action: "WARTEN_AUF_MITARBEITER",
        hrAktion: false,
      };
    case "AKTIV":
      return {
        titel: "Rueckkehr planen",
        beschreibung:
          "Die Elternzeit laeuft. Spaetestens 6 Wochen vor Ende sollte die Rueckkehr mit dem Mitarbeiter abgestimmt werden.",
        action: "RUECKKEHR_PLANEN",
        actionLabel: "Rueckkehr planen",
        hrAktion: true,
      };
    case "RUECKKEHR_GEPLANT":
      return {
        titel: "Vorgang abschliessen",
        beschreibung:
          "Die Rueckkehr ist abgestimmt. Sobald der Mitarbeiter zurück ist, kann der Vorgang beendet werden.",
        action: "BEENDEN",
        actionLabel: "Abschliessen",
        hrAktion: true,
      };
    case "UNTERBROCHEN":
      return {
        titel: "Vorgang ist pausiert",
        beschreibung:
          "Die Elternzeit wurde unterbrochen. Es ist aktuell keine Aktion erforderlich.",
        action: "PAUSIERT",
        hrAktion: false,
      };
    case "BEENDET":
      return {
        titel: "Vorgang abgeschlossen",
        beschreibung:
          "Der Elternzeit-Vorgang ist vollstaendig abgeschlossen. Keine weiteren Schritte erforderlich.",
        action: "ABGESCHLOSSEN",
        hrAktion: false,
      };
    case "VORLAEUFIG_ABGELEHNT":
    case "ABGELEHNT":
      return {
        titel: "Vorgang abgelehnt",
        beschreibung:
          "Der Antrag wurde abgelehnt. Der Vorgang ist beendet.",
        action: "ABGEBROCHEN",
        hrAktion: false,
      };
    default:
      return {
        titel: "Unbekannter Status",
        beschreibung: `Unbekannter Status: ${status}`,
        action: "WARTEN_AUF_MITARBEITER",
        hrAktion: false,
      };
  }
}
