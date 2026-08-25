/**
 * Zentrale Definition der Fragebogen-Schritte.
 *
 * Vorher lagen vier Wahrheiten nebeneinander: STEP_CONFIG (Anzeige, 9 Eintraege),
 * FIELD_REGISTRY (Felder, 10 Eintraege), getStepTitle() (Titel, 10 Eintraege) und
 * ein fest verdrahtetes Komponenten-Array im Renderer (9 Eintraege). Sobald ein
 * Schritt fehlte, liefen die Nummern auseinander — deshalb hat die Vorlagen-
 * Konfiguration im Fragebogen nie gewirkt und die Vorlagen-Vorschau ab Schritt 7
 * die falsche Maske gezeigt.
 *
 * Ab hier gilt:
 *  - Die **Reihenfolge dieses Arrays** ist die Anzeigereihenfolge.
 *  - `step` ist die **stabile Registry-Nummer** — so wie sie in
 *    FormTemplate.stepsConfig, in FIELD_REGISTRY und in PersonalData.currentStep
 *    steht. Sie darf sich nie aendern, auch wenn ein Schritt umzieht.
 *
 * Neue Schritte werden an ihrer Anzeigeposition einsortiert und bekommen die
 * naechste freie Registry-Nummer. Beispiel Rentenversicherung (AP 7): Nummer 11,
 * einsortiert *vor* der Zusammenfassung.
 */

/** Komponenten-Schluessel der Schritte mit eigener Maske. */
export type FragebogenStepKey =
  | "personal"
  | "address"
  | "bank"
  | "social"
  | "tax"
  | "employment"
  | "education"
  | "masern"
  | "summary";

export interface FragebogenStep {
  /** Stabile Registry-Nummer. Schluessel in stepsConfig und FIELD_REGISTRY. */
  step: number;
  /**
   * Komponenten-Schluessel, oder `null` fuer einen **virtuellen Schritt**:
   * im Vorlagen-Editor konfigurierbar, im Fragebogen aber ohne eigene Maske,
   * weil er innerhalb eines anderen Schritts erfasst wird.
   */
  key: FragebogenStepKey | null;
  title: string;
  description: string;
  icon: string;
  /** Kann im Vorlagen-Editor nicht abgeschaltet werden. */
  mandatory?: boolean;
  /** Nur bei virtuellen Schritten: wo die Felder tatsaechlich erfasst werden. */
  renderedWithin?: number;
}

/**
 * Alle Schritte in Anzeigereihenfolge.
 *
 * Schritt 7 (Kinder) ist virtuell: Die Kinder-Angaben werden inline im Schritt
 * Sozialversicherung erfasst. Der Eintrag existiert trotzdem, damit die Felder
 * im Vorlagen-Editor konfigurierbar bleiben.
 */
export const FRAGEBOGEN_STEPS: readonly FragebogenStep[] = [
  {
    step: 1,
    key: "personal",
    title: "Persönliche Angaben",
    description: "Name, Geburtsdatum, Familienstand",
    icon: "user",
    mandatory: true,
  },
  {
    step: 2,
    key: "address",
    title: "Adresse & Kontakt",
    description: "Wohnanschrift, Telefon, E-Mail",
    icon: "home",
  },
  {
    step: 3,
    key: "bank",
    title: "Bankverbindung",
    description: "IBAN, BIC, Kontoinhaber",
    icon: "credit-card",
  },
  {
    step: 4,
    key: "social",
    title: "Sozialversicherung",
    description: "SV-Nummer, Krankenkasse",
    icon: "shield",
  },
  {
    step: 5,
    key: "tax",
    title: "Steuer",
    description: "Steuer-ID, Steuerklasse, Kirchensteuer",
    icon: "file-text",
  },
  {
    step: 6,
    key: "employment",
    title: "Weitere Beschäftigung",
    description: "Angaben zu weiteren Arbeitgebern",
    icon: "briefcase",
  },
  {
    step: 7,
    key: null,
    title: "Kinder",
    description: "Wird in der Sozialversicherung miterfasst",
    icon: "users",
    renderedWithin: 4,
  },
  {
    step: 8,
    key: "education",
    title: "Bildung & Beruf",
    description: "Schulabschluss, Berufsausbildung",
    icon: "graduation-cap",
  },
  {
    step: 9,
    key: "masern",
    title: "Masernschutz",
    description: "Impfnachweis für Gemeinschaftseinrichtungen",
    icon: "heart",
  },
  {
    step: 10,
    key: "summary",
    title: "Zusammenfassung",
    description: "Pruefen und Absenden",
    icon: "check-circle",
    mandatory: true,
  },
];

/** Registry-Nummern, die im Vorlagen-Editor nicht abschaltbar sind. */
export const MANDATORY_STEP_NUMBERS: readonly number[] = FRAGEBOGEN_STEPS.filter(
  (s) => s.mandatory
).map((s) => s.step);

/** Hoechste vergebene Registry-Nummer — Obergrenze fuer die API-Validierung. */
export const MAX_STEP_NUMBER: number = FRAGEBOGEN_STEPS.reduce(
  (max, s) => (s.step > max ? s.step : max),
  0
);

/**
 * Registry-Nummer der Zusammenfassung. Wird beim Absenden gesetzt und markiert
 * einen abgeschlossenen Fragebogen.
 */
export const SUMMARY_STEP_NUMBER: number =
  FRAGEBOGEN_STEPS.find((s) => s.key === "summary")?.step ?? MAX_STEP_NUMBER;

/** Registry-Nummer -> Schritt. */
export function getStep(stepNumber: number): FragebogenStep | undefined {
  return FRAGEBOGEN_STEPS.find((s) => s.step === stepNumber);
}

/** Titel einer Registry-Nummer, mit Fallback fuer unbekannte Nummern. */
export function getStepTitle(stepNumber: number): string {
  return getStep(stepNumber)?.title ?? `Schritt ${stepNumber}`;
}

/** Minimale Form der Vorlagen-Konfiguration, die hier gebraucht wird. */
interface StepEnabledConfig {
  step: number;
  enabled: boolean;
}

/**
 * Die Schritte, die ein Mitarbeiter mit dieser Vorlagen-Konfiguration
 * tatsaechlich durchlaeuft — in Anzeigereihenfolge.
 *
 * Es fallen raus: virtuelle Schritte (ohne eigene Maske) und alles, was die
 * Vorlage abschaltet. Pflichtschritte bleiben immer drin, auch wenn eine
 * Konfiguration sie faelschlich deaktiviert — sonst gaebe es einen Fragebogen
 * ohne Absende-Schritt.
 *
 * Ohne Konfiguration (neue Vorlage, fehlende Daten) gelten alle Schritte als aktiv.
 */
export function getActiveSteps(
  stepsConfig?: StepEnabledConfig[] | null
): FragebogenStep[] {
  const renderable = FRAGEBOGEN_STEPS.filter((s) => s.key !== null);
  if (!stepsConfig || stepsConfig.length === 0) return renderable;

  const enabledByStep = new Map(stepsConfig.map((s) => [s.step, s.enabled]));

  return renderable.filter((s) => {
    if (s.mandatory) return true;
    // Unbekannt in der Konfiguration = nicht abgeschaltet.
    return enabledByStep.get(s.step) ?? true;
  });
}

/**
 * Anzeigeposition (0-basiert) einer Registry-Nummer innerhalb der aktiven
 * Strecke. `-1`, wenn der Schritt in dieser Vorlage nicht vorkommt.
 */
export function indexOfStep(
  activeSteps: readonly FragebogenStep[],
  stepNumber: number
): number {
  return activeSteps.findIndex((s) => s.step === stepNumber);
}

/**
 * Registry-Nummer, bei der ein Vorgang wieder einsteigt.
 *
 * Faellt auf den ersten aktiven Schritt zurueck, wenn der gespeicherte Schritt
 * in dieser Vorlage nicht (mehr) vorkommt — etwa weil die Konfiguration
 * geaendert wurde, waehrend der Vorgang lief.
 */
export function resolveResumeStep(
  activeSteps: readonly FragebogenStep[],
  savedStepNumber: number | null | undefined
): number {
  if (activeSteps.length === 0) return 0;
  if (typeof savedStepNumber !== "number") return 0;
  const index = indexOfStep(activeSteps, savedStepNumber);
  return index >= 0 ? index : 0;
}

// =============================================
// Anzeige des Bearbeitungsstands in der HR-Ansicht
// =============================================

/**
 * Wie weit ist der Fragebogen? Als Text fuer die HR-Ansicht.
 *
 * Bewusst **ohne** "Schritt X von Y": Wie viele Schritte ein Vorgang hat,
 * haengt an seiner Vorlage — ein Minijobber durchlaeuft eine andere Strecke als
 * eine TV-L-Angestellte. Die HR-Listen kennen die Vorlage nicht, deshalb waere
 * jede Zahl dort geraten. Der Titel des zuletzt erreichten Schritts ist
 * ehrlicher und fuer HR ohnehin aussagekraeftiger.
 */
export function describeCurrentStep(
  stepNumber: number | null | undefined
): string {
  if (typeof stepNumber !== "number" || stepNumber <= 0) return "noch nicht begonnen";
  return getStepTitle(stepNumber);
}

/**
 * Grober Fortschritt in Prozent fuer Balken und Ringe.
 *
 * Gemessen an allen Schritten mit eigener Maske, nicht an der Strecke der
 * konkreten Vorlage. Fuer eine verkuerzte Vorlage ist der Wert deshalb
 * konservativ — er zeigt nie mehr an, als tatsaechlich erledigt ist.
 */
export function progressPercent(
  stepNumber: number | null | undefined
): number {
  if (typeof stepNumber !== "number" || stepNumber <= 0) return 0;
  const renderable = FRAGEBOGEN_STEPS.filter((s) => s.key !== null);
  const index = renderable.findIndex((s) => s.step === stepNumber);
  if (index < 0) return 0;
  return Math.round(((index + 1) / renderable.length) * 100);
}

// =============================================
// Migration der Alt-Daten
// =============================================

/**
 * Anzeigereihenfolge, die der alte Renderer fest verdrahtet hatte.
 *
 * `PersonalData.currentStep` enthielt bis zur Entkopplung die **0-basierte
 * Anzeigeposition** in genau dieser Liste — nicht die Registry-Nummer. Weil der
 * Renderer die Vorlagen-Konfiguration ignoriert hat, galt sie fuer *alle*
 * Vorlagen gleichermassen; die Abbildung ist deshalb eindeutig.
 */
export const LEGACY_DISPLAY_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 8, 9, 10];

/**
 * Alte 0-basierte Anzeigeposition -> Registry-Nummer.
 *
 * Werte ausserhalb der Liste (z.B. die 10, die beim Absenden gesetzt wurde)
 * werden auf die Zusammenfassung abgebildet: Der Fragebogen war dann fertig.
 */
export function legacyIndexToStepNumber(legacyIndex: number): number {
  const mapped = LEGACY_DISPLAY_ORDER[legacyIndex];
  if (mapped !== undefined) return mapped;
  return LEGACY_DISPLAY_ORDER[LEGACY_DISPLAY_ORDER.length - 1];
}
