/**
 * Zod-Validierungsschemas für Beurteilungs-Vorlagen und -Workflow.
 *
 * Verwendet von:
 * - /api/beurteilung-templates (POST/PUT) — Phase 2
 * - /api/civil-service-assessment/[token] (PATCH Auto-Save) — Phase 3
 * - /api/civil-service-assessment/[token]/submit (POST) — Phase 3
 * - /api/civil-service/[id]/assessments (POST Anforderung) — Phase 4
 */

import { z } from "zod";

// =============================================
// Skala
// =============================================
export const beurteilungScaleTypeSchema = z.enum(["BRL_1_5", "SCHULNOTEN_1_6"]);

export type BeurteilungScaleType = z.infer<typeof beurteilungScaleTypeSchema>;

/**
 * Labels für die Skala. Mindestens 5 Einträge bei BRL_1_5, 6 bei SCHULNOTEN_1_6.
 * Speicherung als JSON in BeurteilungTemplate.scaleLabels.
 */
export const scaleLabelsSchema = z
  .record(z.string(), z.string().min(1).max(200))
  .refine((labels) => Object.keys(labels).length >= 5, {
    message: "Mindestens 5 Skalen-Stufen erforderlich",
  });

// =============================================
// Vorlage anlegen / aktualisieren
// =============================================
const criterionSchema = z.object({
  id: z.string().optional(), // bei Update vorhandener Kriterien
  name: z.string().min(1, "Kriteriumsname ist erforderlich").max(200),
  description: z.string().max(1000).optional().nullable(),
  weight: z.number().positive().max(10).optional(),
  orderIndex: z.number().int().min(0).optional(),
});

const categorySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Kategoriename ist erforderlich").max(200),
  description: z.string().max(1000).optional().nullable(),
  weight: z.number().positive().max(10).optional(),
  orderIndex: z.number().int().min(0).optional(),
  isMandatory: z.boolean().optional(),
  legalReference: z.string().max(200).optional().nullable(),
  criteria: z
    .array(criterionSchema)
    .min(1, "Mindestens ein Kriterium pro Kategorie")
    .max(50),
});

export const createBeurteilungTemplateSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich").max(200),
  description: z.string().max(2000).optional().nullable(),
  scaleType: beurteilungScaleTypeSchema,
  scaleLabels: scaleLabelsSchema,
  organizationId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  categories: z
    .array(categorySchema)
    .min(1, "Mindestens eine Kategorie")
    .max(20),
});

export type CreateBeurteilungTemplateInput = z.infer<
  typeof createBeurteilungTemplateSchema
>;

export const updateBeurteilungTemplateSchema = createBeurteilungTemplateSchema;

// =============================================
// Beurteilung anfordern (HR → SL) — Phase 4
// =============================================
export const requestAssessmentSchema = z.object({
  assessmentNumber: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  assessmentType: z.enum(["BEURTEILUNG", "REFERENZ"]),
  recipientEmail: z.string().email("Ungültige E-Mail-Adresse"),
  recipientName: z.string().max(200).optional().nullable(),
  scheduledDate: z.string().datetime().optional().nullable(),
  fach: z.string().max(100).optional().nullable(),
  klasse: z.string().max(100).optional().nullable(),
  templateId: z.string().uuid().optional().nullable(),
  /** Override für die 14-Tage-Ankündigungsfrist (BRL Nr. 8.3). */
  acknowledgeShortNotice: z.boolean().optional(),
});

export type RequestAssessmentInput = z.infer<typeof requestAssessmentSchema>;

// =============================================
// Auto-Save (SL Multi-Step Form) — Phase 3
// Alle Felder optional, da pro Step gespeichert wird.
// =============================================
export const autosaveAssessmentSchema = z.object({
  // Bewertung
  ratingsData: z.record(z.string(), z.number().int().min(1).max(6)).optional(),
  overallGrade: z.number().min(1).max(6).optional().nullable(),

  // Referenz (für REFERENZ-Typ)
  referenceData: z.record(z.string(), z.string()).optional(),
  gemeindeReferenz: z.string().max(2000).optional().nullable(),

  // Workflow Step 1 — Vorbereitung
  scheduledDate: z.string().datetime().optional().nullable(),
  fach: z.string().max(100).optional().nullable(),
  klasse: z.string().max(100).optional().nullable(),
  vertrauenslehrkraft: z.string().max(200).optional().nullable(),
  unbiasedConfirmed: z.boolean().optional(),

  // Workflow Step 3 — Gesamturteil
  meetsRequirementsManual: z.boolean().optional().nullable(),
  overallReasoning: z.string().max(5000).optional().nullable(),

  // Workflow Step 4 — Nachbesprechung & Beurteilungsgespräch
  postReviewAt: z.string().datetime().optional().nullable(),
  postReviewNotes: z.string().max(5000).optional().nullable(),
  beurteilungsgespraechAt: z.string().datetime().optional().nullable(),
  beurteilungsgespraechNotes: z.string().max(5000).optional().nullable(),
});

export type AutosaveAssessmentInput = z.infer<typeof autosaveAssessmentSchema>;

// =============================================
// Submit (SL Multi-Step Form) — Phase 3
// Strenge Vollständigkeitsprüfung, BRL-konform.
// Wird in submit/route.ts auf den DB-Stand angewendet, nicht auf Body.
// =============================================
export const MIN_OVERALL_REASONING_LENGTH = 200;

// =============================================
// Bekanntgabe + Gegenäußerung (Lehrkraft) — Phase 5
// =============================================
export const acknowledgeAssessmentSchema = z.object({
  rebuttalText: z.string().max(10_000).optional().nullable(),
  acknowledged: z.literal(true),
});

export type AcknowledgeAssessmentInput = z.infer<
  typeof acknowledgeAssessmentSchema
>;
