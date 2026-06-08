/**
 * Zod-Validierungsschemas fuer das BEM-Modul.
 *
 * Verwendet von:
 * - /api/bem            (POST: Fall anlegen)
 * - /api/bem/[id]/status (POST: Status-Uebergang)
 */

import { z } from "zod";

export const createBemSchema = z.object({
  employeeFirstName: z.string().trim().min(1, "Vorname ist erforderlich").max(100),
  employeeLastName: z.string().trim().min(1, "Nachname ist erforderlich").max(100),
  employeeEmail: z
    .string()
    .trim()
    .email("Ungueltige E-Mail-Adresse")
    .optional()
    .or(z.literal("")),
  employeePersonalNr: z.string().trim().max(50).optional().nullable(),
  employeeId: z.string().uuid("Ungueltige Mitarbeiter-ID").optional().nullable(),
  organizationId: z.string().uuid("Ungueltige Mandanten-ID"),
  eingangsweg: z.enum(["DIGITAL", "PAPIER"]).default("DIGITAL"),
  anlassFehlzeitenAb: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungueltiges Datum"))
    .optional()
    .nullable(),
});

// Status-Uebergang. Die erlaubten Uebergaenge selbst werden serverseitig
// gegen bem-workflow.ts geprueft (race-frei via updateMany).
export const bemStatusSchema = z.object({
  zielStatus: z.enum([
    "EINLADUNG_VERSENDET",
    "EINWILLIGUNG_ERTEILT",
    "EINWILLIGUNG_ABGELEHNT",
    "ERSTGESPRAECH",
    "MASSNAHMEN_LAUFEN",
    "ABGESCHLOSSEN",
    "ABGEBROCHEN",
    "AUFBEWAHRUNG",
    "GELOESCHT",
  ]),
  beendigungsgrund: z.string().trim().max(2000).optional().nullable(),
});

// =============================================
// Gespraeche (Erst/Folge/Gedaechtnis)
// =============================================
const checklistItemSchema = z.object({
  titel: z.string().trim().min(1).max(300),
  erledigt: z.boolean(),
});

const teilnehmerSchema = z.object({
  name: z.string().trim().min(1).max(150),
  rolle: z.string().trim().max(150).optional().nullable(),
});

const dateLike = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungueltiges Datum"));

export const createGespraechSchema = z.object({
  typ: z.enum(["ERSTGESPRAECH", "FOLGEGESPRAECH", "GEDAECHTNISPROTOKOLL"]),
  datum: dateLike.optional().nullable(),
  ort: z.string().trim().max(200).optional().nullable(),
  teilnehmer: z.array(teilnehmerSchema).max(30).optional().nullable(),
  notizen: z.string().max(20000).optional().nullable(),
  checkliste: z.array(checklistItemSchema).max(50).optional().nullable(),
  naechsterTermin: dateLike.optional().nullable(),
});

// Update: alle Felder optional (typ kann nicht geaendert werden).
export const updateGespraechSchema = z.object({
  datum: dateLike.optional().nullable(),
  ort: z.string().trim().max(200).optional().nullable(),
  teilnehmer: z.array(teilnehmerSchema).max(30).optional().nullable(),
  notizen: z.string().max(20000).optional().nullable(),
  checkliste: z.array(checklistItemSchema).max(50).optional().nullable(),
  naechsterTermin: dateLike.optional().nullable(),
});

// =============================================
// Massnahmen (technisch / organisatorisch / personenbezogen)
// =============================================
export const createMassnahmeSchema = z.object({
  kategorie: z.enum(["TECHNISCH", "ORGANISATORISCH", "PERSONENBEZOGEN"]),
  beschreibung: z.string().trim().min(1, "Beschreibung ist erforderlich").max(5000),
  zustaendig: z.string().trim().max(200).optional().nullable(),
  frist: dateLike.optional().nullable(),
  evaluationAm: dateLike.optional().nullable(),
});

export const updateMassnahmeSchema = z.object({
  kategorie: z
    .enum(["TECHNISCH", "ORGANISATORISCH", "PERSONENBEZOGEN"])
    .optional(),
  beschreibung: z.string().trim().min(1).max(5000).optional(),
  zustaendig: z.string().trim().max(200).optional().nullable(),
  frist: dateLike.optional().nullable(),
  status: z.enum(["OFFEN", "LAEUFT", "UMGESETZT", "VERWORFEN"]).optional(),
  evaluationAm: dateLike.optional().nullable(),
});

// =============================================
// Einladung & Einwilligung (E4)
// =============================================
export const einladungSchema = z.object({
  // Phase 1 versendet nur DATENSCHUTZ/DURCHFUEHRUNG. BR/SBV-Einwilligungen
  // (im Prisma-Enum BemEinwilligungArt vorhanden) folgen in Phase 2 (E9) mit
  // eigenem Beteiligungs-Flow — bewusst hier NICHT zugelassen.
  art: z.enum(["DATENSCHUTZ", "DURCHFUEHRUNG"]).default("DATENSCHUTZ"),
  email: z.string().trim().email("Ungueltige E-Mail-Adresse").optional(),
  nachricht: z.string().trim().max(3000).optional(),
  gueltigkeitstage: z.number().int().min(1).max(90).optional(),
});

// Oeffentliches Einwilligungs-Formular (Magic-Link).
export const einwilligungPublicSchema = z.object({
  entscheidung: z.enum(["ERTEILT", "ABGELEHNT"]),
  name: z.string().trim().min(2, "Bitte Namen angeben").max(150),
});

// =============================================
// Dokument aus BEM-Vorlage erzeugen (E5)
// =============================================
export const dokumentGenerierenSchema = z.object({
  templateId: z.string().uuid("Ungueltige Vorlagen-ID"),
  typ: z.enum([
    "EINLADUNG",
    "DATENSCHUTZVEREINBARUNG",
    "ERSTGESPRAECH_PROTOKOLL",
    "FOLGEGESPRAECH_PROTOKOLL",
    "GEDAECHTNISPROTOKOLL",
    "MASSNAHMENPLAN",
    "ABSCHLUSSERKLAERUNG",
    "ABBRUCHERKLAERUNG",
    "BEENDIGUNGSERKLAERUNG",
    "SONSTIGES",
  ]),
  format: z.enum(["docx", "pdf"]).default("docx"),
  values: z.record(z.string(), z.string()).optional(),
});

export type CreateBemInput = z.infer<typeof createBemSchema>;
export type BemStatusInput = z.infer<typeof bemStatusSchema>;
export type EinladungInput = z.infer<typeof einladungSchema>;
export type EinwilligungPublicInput = z.infer<typeof einwilligungPublicSchema>;
export type DokumentGenerierenInput = z.infer<typeof dokumentGenerierenSchema>;
export type CreateGespraechInput = z.infer<typeof createGespraechSchema>;
export type UpdateGespraechInput = z.infer<typeof updateGespraechSchema>;
export type CreateMassnahmeInput = z.infer<typeof createMassnahmeSchema>;
export type UpdateMassnahmeInput = z.infer<typeof updateMassnahmeSchema>;
