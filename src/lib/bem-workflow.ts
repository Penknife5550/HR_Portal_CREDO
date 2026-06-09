/**
 * BEM-Workflow — deklarative State-Maschine (§ 167 Abs. 2 SGB IX)
 *
 * Analog zu mutterschutz-workflow.ts / elternzeit-workflow.ts. Definiert den
 * BEM-Prozess von der Fall-Anlage bis zum Abschluss als geordnete Schritte.
 *
 * Off-Path-Status (EINWILLIGUNG_ABGELEHNT, ABGEBROCHEN) sind nicht Teil des
 * linearen Steppers, aber gueltige Ziele. AUFBEWAHRUNG/GELOESCHT sind die
 * Nachlauf-Phasen (Fristen/Crypto-Shredding, E6).
 */

export type BemStatus =
  | "ANGELEGT"
  | "EINLADUNG_VERSENDET"
  | "EINWILLIGUNG_ERTEILT"
  | "EINWILLIGUNG_ABGELEHNT"
  | "ERSTGESPRAECH"
  | "MASSNAHMEN_LAUFEN"
  | "ABGESCHLOSSEN"
  | "ABGEBROCHEN"
  | "AUFBEWAHRUNG"
  | "GELOESCHT";

export type BemWorkflowStep = {
  id: BemStatus;
  label: string;
  beschreibung: string;
};

/** Linearer Haupt-Pfad fuer den Stepper (Off-Path-Status ausgenommen). */
export const BEM_STEPS: BemWorkflowStep[] = [
  {
    id: "ANGELEGT",
    label: "Fall angelegt",
    beschreibung:
      "Der BEM-Fall wurde angelegt. Naechster Schritt ist die Einladung der/des Beschaeftigten zum BEM-Gespraech.",
  },
  {
    id: "EINLADUNG_VERSENDET",
    label: "Einladung versendet",
    beschreibung:
      "Die Einladung samt Datenschutzinformation wurde versendet (digital oder per Brief). Es wird auf die Einwilligung gewartet.",
  },
  {
    id: "EINWILLIGUNG_ERTEILT",
    label: "Einwilligung erteilt",
    beschreibung:
      "Die/der Beschaeftigte hat der Durchfuehrung des BEM zugestimmt. Das Erstgespraech kann terminiert werden.",
  },
  {
    id: "ERSTGESPRAECH",
    label: "Erstgespraech",
    beschreibung:
      "Das Erstgespraech findet statt bzw. wurde gefuehrt. Gespraechsinhalte werden dokumentiert.",
  },
  {
    id: "MASSNAHMEN_LAUFEN",
    label: "Massnahmen laufen",
    beschreibung:
      "Vereinbarte Massnahmen werden umgesetzt und ihre Wirkung evaluiert.",
  },
  {
    id: "ABGESCHLOSSEN",
    label: "Abgeschlossen",
    beschreibung:
      "Das BEM-Verfahren ist regulaer abgeschlossen. Die Akte geht in die Aufbewahrung.",
  },
];

/** Status, die nicht im linearen Stepper liegen. */
export const BEM_OFF_PATH: BemStatus[] = [
  "EINWILLIGUNG_ABGELEHNT",
  "ABGEBROCHEN",
  "AUFBEWAHRUNG",
  "GELOESCHT",
];

export function getStepIndex(status: BemStatus): number {
  return BEM_STEPS.findIndex((s) => s.id === status);
}

export function isOffPath(status: BemStatus): boolean {
  return BEM_OFF_PATH.includes(status);
}

export function statusLabel(status: BemStatus): string {
  const step = BEM_STEPS.find((s) => s.id === status);
  if (step) return step.label;
  const offLabels: Record<string, string> = {
    EINWILLIGUNG_ABGELEHNT: "Einwilligung abgelehnt",
    ABGEBROCHEN: "Abgebrochen",
    AUFBEWAHRUNG: "Aufbewahrung",
    GELOESCHT: "Geloescht",
  };
  return offLabels[status] ?? status;
}

export type BemNaechsterSchrittAction =
  | "EINLADUNG_VERSENDEN"
  | "EINWILLIGUNG_ERFASSEN"
  | "ERSTGESPRAECH_FUEHREN"
  | "MASSNAHMEN_STARTEN"
  | "ABSCHLIESSEN"
  | "WARTEN"
  | "ABGESCHLOSSEN";

export type BemNaechsterSchritt = {
  titel: string;
  beschreibung: string;
  action: BemNaechsterSchrittAction;
  actionLabel?: string;
  hrAktion: boolean;
};

export function getNaechsterSchritt(status: BemStatus): BemNaechsterSchritt {
  switch (status) {
    case "ANGELEGT":
      return {
        titel: "Einladung versenden",
        beschreibung:
          "Lade die/den Beschaeftigte:n zum BEM-Gespraech ein und informiere ueber den Datenschutz (digital per Magic-Link oder als Brief).",
        action: "EINLADUNG_VERSENDEN",
        actionLabel: "Einladung versenden",
        hrAktion: true,
      };
    case "EINLADUNG_VERSENDET":
      return {
        titel: "Einwilligung erfassen",
        beschreibung:
          "Sobald die/der Beschaeftigte geantwortet hat, erfasse die Einwilligung (erteilt oder abgelehnt). Das BEM ist freiwillig.",
        action: "EINWILLIGUNG_ERFASSEN",
        actionLabel: "Einwilligung erfassen",
        hrAktion: true,
      };
    case "EINWILLIGUNG_ERTEILT":
      return {
        titel: "Erstgespraech fuehren",
        beschreibung:
          "Terminiere und fuehre das Erstgespraech. Dokumentiere die Inhalte vertraulich in der BEM-Akte.",
        action: "ERSTGESPRAECH_FUEHREN",
        actionLabel: "Erstgespraech starten",
        hrAktion: true,
      };
    case "ERSTGESPRAECH":
      return {
        titel: "Massnahmen vereinbaren",
        beschreibung:
          "Vereinbare konkrete Massnahmen (technisch / organisatorisch / personenbezogen) und starte deren Umsetzung.",
        action: "MASSNAHMEN_STARTEN",
        actionLabel: "Massnahmen starten",
        hrAktion: true,
      };
    case "MASSNAHMEN_LAUFEN":
      return {
        titel: "Verfahren abschliessen",
        beschreibung:
          "Wenn die Massnahmen umgesetzt und evaluiert sind, schliesse das BEM-Verfahren ab.",
        action: "ABSCHLIESSEN",
        actionLabel: "Abschliessen",
        hrAktion: true,
      };
    case "ABGESCHLOSSEN":
    case "AUFBEWAHRUNG":
    case "GELOESCHT":
      return {
        titel: "Verfahren abgeschlossen",
        beschreibung:
          "Das BEM-Verfahren ist abgeschlossen. Die Akte unterliegt der Aufbewahrungsfrist und wird danach automatisch geloescht.",
        action: "ABGESCHLOSSEN",
        hrAktion: false,
      };
    case "EINWILLIGUNG_ABGELEHNT":
      return {
        titel: "BEM abgelehnt",
        beschreibung:
          "Die/der Beschaeftigte hat das BEM abgelehnt. Das Verfahren wird abgebrochen; die Ablehnung ist dokumentiert (Kuendigungsschutz-Nachweis).",
        action: "WARTEN",
        hrAktion: false,
      };
    case "ABGEBROCHEN":
      return {
        titel: "Verfahren abgebrochen",
        beschreibung:
          "Das BEM-Verfahren wurde abgebrochen. Die Akte geht in die Aufbewahrung.",
        action: "WARTEN",
        hrAktion: false,
      };
    default:
      return {
        titel: "Unbekannter Status",
        beschreibung: `Unbekannter Status: ${status}`,
        action: "WARTEN",
        hrAktion: false,
      };
  }
}

/**
 * Zulaessige Folgestatus fuer einen gegebenen Status. Wird in der
 * Status-Transition-Route zur Validierung verwendet.
 */
export function erlaubteFolgestatus(status: BemStatus): BemStatus[] {
  switch (status) {
    case "ANGELEGT":
      return ["EINLADUNG_VERSENDET", "ABGEBROCHEN"];
    case "EINLADUNG_VERSENDET":
      return ["EINWILLIGUNG_ERTEILT", "EINWILLIGUNG_ABGELEHNT", "ABGEBROCHEN"];
    case "EINWILLIGUNG_ERTEILT":
      return ["ERSTGESPRAECH", "ABGEBROCHEN"];
    case "EINWILLIGUNG_ABGELEHNT":
      // Abbruch ODER erneutes Anbieten des BEM (BEM darf erneut angeboten werden).
      return ["ABGEBROCHEN", "ANGELEGT"];
    case "ERSTGESPRAECH":
      return ["MASSNAHMEN_LAUFEN", "ABGESCHLOSSEN", "ABGEBROCHEN"];
    case "MASSNAHMEN_LAUFEN":
      return ["ABGESCHLOSSEN", "ABGEBROCHEN"];
    case "ABGESCHLOSSEN":
      // Aufbewahrung ODER Wieder-Oeffnen (versehentlich/zu frueh abgeschlossen).
      return ["AUFBEWAHRUNG", "MASSNAHMEN_LAUFEN"];
    case "ABGEBROCHEN":
      // Aufbewahrung ODER erneutes Anbieten (Wieder-Einladen).
      return ["AUFBEWAHRUNG", "ANGELEGT"];
    case "AUFBEWAHRUNG":
      return ["GELOESCHT"];
    case "GELOESCHT":
      return [];
    default:
      return [];
  }
}

/**
 * Umkehrung von erlaubteFolgestatus — liefert die zulaessigen Vorgaenger fuer
 * einen Ziel-Status. Wird im atomaren updateMany-WHERE der Transition-Route
 * verwendet, damit der Statuswechsel race-frei ist.
 */
export function getErlaubteVorgaenger(zielStatus: BemStatus): BemStatus[] {
  const alle: BemStatus[] = [
    "ANGELEGT",
    "EINLADUNG_VERSENDET",
    "EINWILLIGUNG_ERTEILT",
    "EINWILLIGUNG_ABGELEHNT",
    "ERSTGESPRAECH",
    "MASSNAHMEN_LAUFEN",
    "ABGESCHLOSSEN",
    "ABGEBROCHEN",
    "AUFBEWAHRUNG",
    "GELOESCHT",
  ];
  return alle.filter((v) => erlaubteFolgestatus(v).includes(zielStatus));
}
