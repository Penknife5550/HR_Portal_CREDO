/**
 * Zod-Validierungsschemas fuer die Einstellungsmodalitaeten (Vorgesetzter)
 *
 * 5 Abschnitte basierend auf dem Einstellungsmodalitaeten-Formular:
 * 1. Stelle & Vertrag
 * 2. Arbeitszeit & Arbeitgeber
 * 3. Verguetung
 * 4. Zusaetzliche Angaben
 * 5. Zusammenfassung
 */

import { z } from "zod";

// =============================================
// Step 1: Stelle & Vertrag
// =============================================
export const supStep1Schema = z.object({
  betriebsstaette: z.string().min(1, "Betriebsstaette ist erforderlich."),
  stellenbeschreibung: z.string().min(1, "Stellenbeschreibung ist erforderlich."),
  vertragsbeginn: z.string().min(1, "Vertragsbeginn ist erforderlich."),
  befristet: z.boolean(),
  vertragsende: z.string(),
  befristungSachgrund: z.string(),
});

export type SupStep1Data = z.infer<typeof supStep1Schema>;

// =============================================
// Step 2: Arbeitszeit & Arbeitgeber-Zuordnung
// =============================================
export const supStep2Schema = z.object({
  vollzeit: z.boolean(),
  wochenstunden: z.number().min(0).nullable(),
  tageProWoche: z.number().min(1).max(7).nullable(),
  hauptarbeitgeberId: z.string().min(1, "Hauptarbeitgeber ist erforderlich."),
  hauptarbeitgeberStunden: z.number().min(0).nullable(),
  nebenarbeitgeberId: z.string(),
  nebenarbeitgeberStunden: z.number().min(0).nullable(),
  svPflichtig: z.boolean(),
  minijob: z.boolean(),
  ehrenamt: z.boolean(),
});

export type SupStep2Data = z.infer<typeof supStep2Schema>;

// =============================================
// Step 3: Verguetung
// =============================================
export const supStep3Schema = z.object({
  verguetungsmodell: z.enum(["TV_L", "TV_L_S", "HAUSTARIF", "SONSTIGES"], {
    required_error: "Bitte waehlen Sie ein Verguetungsmodell.",
  }),
  entgeltgruppe: z.string(),
  stufe: z.string(),
  festgehalt: z.number().min(0).nullable(),
  stundenlohn: z.number().min(0).nullable(),
  bemerkungVerguetung: z.string(),
  jahressonderzahlung: z.boolean(),
  sonderzahlungProzent: z.number().min(0).max(100).nullable(),
  sachbezuege: z.boolean(),
  sachbezuegeBetrag: z.number().min(0).nullable(),
  zulage: z.boolean(),
  zulageBetrag: z.number().min(0).nullable(),
});

export type SupStep3Data = z.infer<typeof supStep3Schema>;

// =============================================
// Step 4: Zusaetzliche Angaben
// =============================================
export const supStep4Schema = z.object({
  kostenstelle: z.string(),
  kostenstelleAnteil: z.number().min(0).max(100).nullable(),
  probezeit: z.boolean(),
  probezeitMonate: z.number().min(0).max(12).nullable(),
  urlaubstageProJahr: z.number().min(0).max(50).nullable(),
  masernschutzErforderlich: z.boolean(),
  masernschutzVorArbeitsbeginn: z.boolean(),
  zeiterfassung: z.boolean(),
  zusatzvereinbarungen: z.string(),
});

export type SupStep4Data = z.infer<typeof supStep4Schema>;

// =============================================
// Step-Konfiguration
// =============================================
export const SUP_STEP_CONFIG = [
  {
    number: 1,
    title: "Stelle & Vertrag",
    description: "Betriebsstaette, Stellenbeschreibung, Vertragsdaten",
  },
  {
    number: 2,
    title: "Arbeitszeit & Arbeitgeber",
    description: "Umfang, Haupt-/Nebenarbeitgeber, Vertragsart",
  },
  {
    number: 3,
    title: "Verguetung",
    description: "Entgeltgruppe, Zulagen, Sonderzahlungen",
  },
  {
    number: 4,
    title: "Zusaetzliche Angaben",
    description: "Kostenstelle, Probezeit, Urlaub, Masernschutz",
  },
  {
    number: 5,
    title: "Zusammenfassung",
    description: "Pruefen und Absenden",
  },
] as const;
