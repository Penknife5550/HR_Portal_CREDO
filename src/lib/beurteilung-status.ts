/**
 * Workflow-Status für eine dienstliche Beurteilung.
 *
 * Wird aus den vorhandenen DB-Feldern abgeleitet (kein eigenes Status-Feld),
 * sodass es immer mit der Datenrealität übereinstimmt. Verwendet von:
 * - Multi-Step-Form (Sticky Header)
 * - HR-Dashboard tab-assessments
 * - Public Verify-Page (Phase 6)
 * - PDF-Export (Phase 6)
 */

export type BeurteilungStatus =
  | "REQUESTED" // Angefordert, noch nicht von SL geöffnet
  | "PREPARED" // Vorbereitung Step 1 erledigt (Befangenheit)
  | "OBSERVED" // Beobachtungen Step 2 begonnen
  | "RATED" // Alle Kriterien bewertet, Gesamturteil vergeben
  | "REVIEWED" // Beurteilungsgespräch dokumentiert
  | "SUBMITTED" // Final eingereicht durch SL
  | "RELEASED" // Zur Bekanntgabe an Lehrkraft freigegeben
  | "ACKNOWLEDGED" // Lehrkraft hat zur Kenntnis genommen
  | "COMPLETED"; // In Personalakte aufgenommen

export interface BeurteilungStatusInput {
  // Vorbereitung
  unbiasedConfirmed: boolean | null;
  unbiasedConfirmedAt?: Date | string | null;

  // Bewertung
  ratingsData?: Record<string, number> | null;

  // Gesamturteil
  meetsRequirementsManual?: boolean | null;
  overallReasoning?: string | null;

  // Gespräch
  beurteilungsgespraechAt?: Date | string | null;

  // Submit
  submittedAt?: Date | string | null;

  // Bekanntgabe
  releasedToEmployeeAt?: Date | string | null;
  acknowledgedByEmployeeAt?: Date | string | null;

  // Archivierung (Schritt 9 — In Personalakte aufgenommen)
  archivedAt?: Date | string | null;

  // Snapshot — für die Berechnung "alle Kriterien bewertet?"
  templateSnapshot?: {
    categories?: Array<{
      criteria?: Array<{ id: string }>;
    }>;
  } | null;
}

export interface StatusStep {
  key: BeurteilungStatus;
  label: string;
  shortLabel: string;
}

export const ALL_STATUS_STEPS: StatusStep[] = [
  { key: "REQUESTED", label: "Angefordert", shortLabel: "Anf." },
  { key: "PREPARED", label: "Vorbereitet", shortLabel: "Vorb." },
  { key: "OBSERVED", label: "Beobachtet", shortLabel: "Beob." },
  { key: "RATED", label: "Bewertet", shortLabel: "Bew." },
  { key: "REVIEWED", label: "Gespräch", shortLabel: "Gespr." },
  { key: "SUBMITTED", label: "Eingereicht", shortLabel: "Eing." },
  { key: "RELEASED", label: "Bekanntgegeben", shortLabel: "Bek." },
  { key: "ACKNOWLEDGED", label: "Quittiert", shortLabel: "Quitt." },
  { key: "COMPLETED", label: "Abgeschlossen", shortLabel: "Abg." },
];

const STATUS_ORDER = ALL_STATUS_STEPS.map((s) => s.key);

/**
 * Leitet den aktuellen Status aus den vorhandenen Feldern ab.
 */
export function deriveBeurteilungStatus(
  input: BeurteilungStatusInput,
): BeurteilungStatus {
  // Archivierung (in Personalakte) hat hoechste Prioritaet
  if (input.archivedAt) return "COMPLETED";

  // Bekanntgabe / Quittierung
  if (input.acknowledgedByEmployeeAt) return "ACKNOWLEDGED";
  if (input.releasedToEmployeeAt) return "RELEASED";

  // Submit
  if (input.submittedAt) return "SUBMITTED";

  // Beurteilungsgespräch dokumentiert?
  if (input.beurteilungsgespraechAt) return "REVIEWED";

  // Gesamturteil + Begründung gegeben?
  const reasoning = input.overallReasoning?.trim() ?? "";
  if (
    input.meetsRequirementsManual !== null &&
    input.meetsRequirementsManual !== undefined &&
    reasoning.length >= 50
  ) {
    return "RATED";
  }

  // Mindestens eine Bewertung gemacht?
  const ratingsCount = input.ratingsData
    ? Object.keys(input.ratingsData).length
    : 0;

  if (ratingsCount > 0) {
    // Alle Kriterien bewertet?
    const totalCriteria =
      input.templateSnapshot?.categories?.reduce(
        (sum, cat) => sum + (cat.criteria?.length ?? 0),
        0,
      ) ?? 0;
    if (totalCriteria > 0 && ratingsCount >= totalCriteria) {
      return "RATED";
    }
    return "OBSERVED";
  }

  // Befangenheit bestätigt → Vorbereitung erledigt
  if (input.unbiasedConfirmed) return "PREPARED";

  return "REQUESTED";
}

/**
 * Index des aktuellen Status (für Stepper-Visualisierung).
 */
export function statusIndex(status: BeurteilungStatus): number {
  return STATUS_ORDER.indexOf(status);
}

/**
 * Alle bisherigen Schritte als "completed" markieren,
 * den aktuellen als "current", die zukünftigen als "pending".
 */
export type StepState = "completed" | "current" | "pending";

export function getStepStates(
  current: BeurteilungStatus,
): Array<StatusStep & { state: StepState }> {
  const currentIdx = statusIndex(current);
  return ALL_STATUS_STEPS.map((step, idx) => {
    let state: StepState;
    if (idx < currentIdx) state = "completed";
    else if (idx === currentIdx) state = "current";
    else state = "pending";
    return { ...step, state };
  });
}
