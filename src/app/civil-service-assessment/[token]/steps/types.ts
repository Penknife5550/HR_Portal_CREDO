/**
 * Gemeinsame Types für die Multi-Step-Form-Komponenten der
 * Beurteilungs-Magic-Link-Seite.
 */

import type { AssessmentData } from "../page";

/**
 * Edit-State, der durch alle Steps geteilt wird.
 * Spiegelt die im Backend speicherbaren Workflow-Felder wider.
 */
export interface BeurteilungFormState {
  // Step 1
  scheduledDate: string; // ISO oder ""
  fach: string;
  klasse: string;
  vertrauenslehrkraft: string;
  unbiasedConfirmed: boolean;

  // Step 2
  ratings: Record<string, number>;

  // Step 3
  meetsRequirementsManual: boolean | null;
  overallReasoning: string;

  // Step 4
  postReviewAt: string;
  postReviewNotes: string;
  beurteilungsgespraechAt: string;
  beurteilungsgespraechNotes: string;
}

/**
 * Gemeinsame Props, die jeder Step-Component bekommt.
 */
export interface StepProps {
  initialData: AssessmentData;
  formState: BeurteilungFormState;
  setFormState: (
    updater: (prev: BeurteilungFormState) => BeurteilungFormState,
  ) => void;
  /** Wird vom Hauptformular nach jeder Aenderung aufgerufen. */
  onChange: () => void;
}

/**
 * Erzeugt einen Initial-FormState aus den vom Server gelieferten Daten.
 */
export function buildInitialFormState(
  data: AssessmentData,
): BeurteilungFormState {
  return {
    scheduledDate: data.scheduledDate
      ? new Date(data.scheduledDate).toISOString().slice(0, 16)
      : "",
    fach: data.fach ?? "",
    klasse: data.klasse ?? "",
    vertrauenslehrkraft: data.vertrauenslehrkraft ?? "",
    unbiasedConfirmed: data.unbiasedConfirmed ?? false,

    ratings: (data.ratingsData as Record<string, number>) ?? {},

    meetsRequirementsManual: data.meetsRequirementsManual,
    overallReasoning: data.overallReasoning ?? "",

    postReviewAt: data.postReviewAt
      ? new Date(data.postReviewAt).toISOString().slice(0, 16)
      : "",
    postReviewNotes: data.postReviewNotes ?? "",
    beurteilungsgespraechAt: data.beurteilungsgespraechAt
      ? new Date(data.beurteilungsgespraechAt).toISOString().slice(0, 16)
      : "",
    beurteilungsgespraechNotes: data.beurteilungsgespraechNotes ?? "",
  };
}
