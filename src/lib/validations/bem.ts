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

export type CreateBemInput = z.infer<typeof createBemSchema>;
export type BemStatusInput = z.infer<typeof bemStatusSchema>;
export type CreateGespraechInput = z.infer<typeof createGespraechSchema>;
export type UpdateGespraechInput = z.infer<typeof updateGespraechSchema>;
export type CreateMassnahmeInput = z.infer<typeof createMassnahmeSchema>;
export type UpdateMassnahmeInput = z.infer<typeof updateMassnahmeSchema>;
