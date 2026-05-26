/**
 * Mutterschutz-Workflow — deklarative State-Maschine
 *
 * Analog zu elternzeit-workflow.ts. Definiert den Mutterschutz-Prozess
 * von der Schwangerschaftsmeldung bis zum Abschluss als geordnete Schritte.
 *
 * Pfad-Variante: BAD ist nur für KITA bzw. einrichtungstyp-abhaengige
 * Faelle relevant. Wenn `badErforderlich = false`, ueberspringt der
 * naechste-Schritt-Helper die BAD-Schritte und geht direkt nach AKTIV.
 */

export type MutterschutzStatus =
  | "GEMELDET"
  | "BAD_BEAUFTRAGT"
  | "BAD_ABGESCHLOSSEN"
  | "AKTIV"
  | "BEENDET";

export type MutterschutzWorkflowStep = {
  id: MutterschutzStatus;
  label: string;
  beschreibung: string;
  /** true = Schritt nur, wenn BAD erforderlich */
  optional?: boolean;
};

export const MUTTERSCHUTZ_STEPS: MutterschutzWorkflowStep[] = [
  {
    id: "GEMELDET",
    label: "Schwangerschaft gemeldet",
    beschreibung:
      "Die Schwangerschaftsmeldung wurde im Portal erfasst. Mutterschutzfristen sind berechnet.",
  },
  {
    id: "BAD_BEAUFTRAGT",
    label: "BAD beauftragt",
    beschreibung:
      "Der Betriebsaerztliche Dienst (BAD) wurde beauftragt — relevant für Kita / Einrichtungen mit Kinderkontakt.",
    optional: true,
  },
  {
    id: "BAD_ABGESCHLOSSEN",
    label: "BAD abgeschlossen",
    beschreibung:
      "Die BAD-Untersuchung ist abgeschlossen. Ergebnis und ggf. Beschaeftigungsverbot sind dokumentiert.",
    optional: true,
  },
  {
    id: "AKTIV",
    label: "Mutterschutz laeuft",
    beschreibung:
      "Die Schutzfrist hat begonnen. Mitarbeiterin ist im Mutterschutz.",
  },
  {
    id: "BEENDET",
    label: "Mutterschutz beendet",
    beschreibung:
      "Die Schutzfrist ist abgelaufen. Der Vorgang ist abgeschlossen.",
  },
];

/**
 * Filtert die Schritte abhaengig davon, ob BAD erforderlich ist.
 * Wenn nicht, werden BAD_BEAUFTRAGT / BAD_ABGESCHLOSSEN ausgeblendet.
 */
export function getRelevantSteps(badErforderlich: boolean): MutterschutzWorkflowStep[] {
  if (badErforderlich) return MUTTERSCHUTZ_STEPS;
  return MUTTERSCHUTZ_STEPS.filter((s) => !s.optional);
}

export function getStepIndex(
  status: MutterschutzStatus,
  badErforderlich: boolean,
): number {
  const steps = getRelevantSteps(badErforderlich);
  return steps.findIndex((s) => s.id === status);
}

export function isErsterSchritt(status: MutterschutzStatus): boolean {
  return MUTTERSCHUTZ_STEPS[0]?.id === status;
}

export function isLetzterSchritt(status: MutterschutzStatus): boolean {
  return MUTTERSCHUTZ_STEPS[MUTTERSCHUTZ_STEPS.length - 1]?.id === status;
}

export type MutterschutzNaechsterSchrittAction =
  | "BAD_BEAUFTRAGEN"
  | "BAD_ABSCHLIESSEN"
  | "AKTIVIEREN"
  | "BEENDEN"
  | "WARTEN_AUF_BEGINN"
  | "ABGESCHLOSSEN";

export type MutterschutzNaechsterSchritt = {
  titel: string;
  beschreibung: string;
  action: MutterschutzNaechsterSchrittAction;
  actionLabel?: string;
  hrAktion: boolean;
};

export function getNaechsterSchritt(
  status: MutterschutzStatus,
  badErforderlich: boolean,
): MutterschutzNaechsterSchritt {
  switch (status) {
    case "GEMELDET":
      if (badErforderlich) {
        return {
          titel: "BAD beauftragen",
          beschreibung:
            "Beauftrage den Betriebsaerztlichen Dienst zur Gefaehrdungsbeurteilung. Sende dazu den BAD-Aufforderungsbrief.",
          action: "BAD_BEAUFTRAGEN",
          actionLabel: "BAD beauftragen",
          hrAktion: true,
        };
      }
      return {
        titel: "Mutterschutz aktivieren",
        beschreibung:
          "Kein BAD erforderlich. Mit Erreichen der Schutzfrist kann der Vorgang aktiviert werden.",
        action: "AKTIVIEREN",
        actionLabel: "Aktivieren",
        hrAktion: true,
      };
    case "BAD_BEAUFTRAGT":
      return {
        titel: "BAD-Untersuchung abschliessen",
        beschreibung:
          "Sobald die BAD-Untersuchung erfolgt ist, dokumentiere das Ergebnis (ggf. Beschaeftigungsverbot).",
        action: "BAD_ABSCHLIESSEN",
        actionLabel: "BAD abschliessen",
        hrAktion: true,
      };
    case "BAD_ABGESCHLOSSEN":
      return {
        titel: "Mutterschutz aktivieren",
        beschreibung:
          "BAD ist abgeschlossen. Mit Erreichen der Schutzfrist kann der Vorgang aktiviert werden.",
        action: "AKTIVIEREN",
        actionLabel: "Aktivieren",
        hrAktion: true,
      };
    case "AKTIV":
      return {
        titel: "Vorgang nach Schutzfrist beenden",
        beschreibung:
          "Die Mitarbeiterin ist im Mutterschutz. Mit Ende der Schutzfrist (8 Wochen / 12 bei Frueh- oder Mehrlingsgeburt) kann der Vorgang beendet werden.",
        action: "BEENDEN",
        actionLabel: "Beenden",
        hrAktion: true,
      };
    case "BEENDET":
      return {
        titel: "Vorgang abgeschlossen",
        beschreibung:
          "Der Mutterschutz-Vorgang ist vollstaendig abgeschlossen. Keine weiteren Schritte erforderlich.",
        action: "ABGESCHLOSSEN",
        hrAktion: false,
      };
    default:
      return {
        titel: "Unbekannter Status",
        beschreibung: `Unbekannter Status: ${status}`,
        action: "WARTEN_AUF_BEGINN",
        hrAktion: false,
      };
  }
}

/**
 * Liefert die zulaessigen Vorgaenger-Status für einen Ziel-Status.
 * Umkehrung von `erlaubteFolgestatus` — wird im atomaren updateMany-WHERE
 * der Transition-Routes verwendet, damit der Statuswechsel race-frei ist.
 */
export function getErlaubteVorgaenger(
  zielStatus: MutterschutzStatus,
  badErforderlich: boolean,
): MutterschutzStatus[] {
  const alleStatus: MutterschutzStatus[] = [
    "GEMELDET",
    "BAD_BEAUFTRAGT",
    "BAD_ABGESCHLOSSEN",
    "AKTIV",
    "BEENDET",
  ];
  return alleStatus.filter((vorgaenger) =>
    erlaubteFolgestatus(vorgaenger, badErforderlich).includes(zielStatus),
  );
}

/**
 * Liefert die zulaessigen Folgestatus für einen gegebenen Status.
 * Wird in den Status-Transition-API-Routes zur Validierung verwendet.
 */
export function erlaubteFolgestatus(
  status: MutterschutzStatus,
  badErforderlich: boolean,
): MutterschutzStatus[] {
  switch (status) {
    case "GEMELDET":
      return badErforderlich ? ["BAD_BEAUFTRAGT", "AKTIV"] : ["AKTIV"];
    case "BAD_BEAUFTRAGT":
      return ["BAD_ABGESCHLOSSEN"];
    case "BAD_ABGESCHLOSSEN":
      return ["AKTIV"];
    case "AKTIV":
      return ["BEENDET"];
    case "BEENDET":
      return [];
    default:
      return [];
  }
}
