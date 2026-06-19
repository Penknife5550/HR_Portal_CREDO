import { z } from "zod";

/**
 * Validierungen fuer das Modul Vertragsende.
 * - createContractEndSchema: manuelle Anlage in der HR-UI
 * - updateContractEndSchema: Status-/Feld-Updates durch HR
 * - renewalDataSchema: vom Vorgesetzten ausgefuellte Vertragsdaten (Strang A)
 * - contractEndWebhookSchema: Meldung von n8n (DokuBit, Phase 2)
 */

const DATE_YMD = /^\d{4}-\d{2}-\d{2}/;

export const createContractEndSchema = z.object({
  employeeFirstName: z.string().min(1, "Vorname ist erforderlich").max(100),
  employeeLastName: z.string().min(1, "Nachname ist erforderlich").max(100),
  employeeEmail: z.string().email("Ungültige E-Mail-Adresse"),
  organizationId: z.string().uuid("Ungültige Einrichtungs-ID"),
  contractEndDate: z.string().regex(DATE_YMD, "Vertragsende im Format YYYY-MM-DD erforderlich"),
  contractStartDate: z.string().regex(DATE_YMD, "Datum im Format YYYY-MM-DD erforderlich").optional().or(z.literal("")),
  employeePersonalNr: z.string().max(50).optional(),
});

export const updateContractEndSchema = z
  .object({
    status: z.string().optional(),
    decision: z.string().optional(),
    supervisorEmail: z.string().email("Ungültige E-Mail-Adresse").optional().or(z.literal("")),
    contractEndDate: z.string().regex(DATE_YMD).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, "Mindestens ein Feld erforderlich");

/**
 * Vertragsdaten, die der Vorgesetzte im oeffentlichen Formular ausfuellt
 * (Strang A). `.strip()` entfernt unbekannte Felder (Mass-Assignment-Schutz).
 */
export const renewalDataSchema = z
  .object({
    vertragsbeginn: z.string().optional(),
    befristet: z.boolean().optional(),
    vertragsende: z.string().optional(),
    befristungSachgrund: z.string().max(500).optional(),
    vollzeit: z.boolean().optional(),
    wochenstunden: z.number().min(0).max(60).optional(),
    tageProWoche: z.number().int().min(0).max(7).optional(),
    verguetungsmodell: z.string().max(50).optional(),
    entgeltgruppe: z.string().max(20).optional(),
    stufe: z.string().max(20).optional(),
    stellenbeschreibung: z.string().max(2000).optional(),
    betriebsstaette: z.string().max(200).optional(),
    probezeit: z.boolean().optional(),
    probezeitMonate: z.number().int().min(0).max(12).optional(),
    urlaubstageProJahr: z.number().int().min(0).max(60).optional(),
    zusatzvereinbarungen: z.string().max(2000).optional(),
  })
  .strip();

/**
 * Meldung von n8n (liest DokuBit). Feldnamen bewusst nah an den DokuBit-Spalten
 * gehalten, damit n8n moeglichst 1:1 durchreichen kann.
 */
export const contractEndWebhookSchema = z.object({
  personalNr: z.string().max(50).optional(), // DokuBit MANR
  vorname: z.string().min(1).max(100), // MAVONAME
  nachname: z.string().min(1).max(100), // MANANAME
  email: z.string().email("Ungültige E-Mail-Adresse").optional().or(z.literal("")), // MAEMAIL
  mandantNummer: z.string().min(1).max(20), // MANDANTENNUMMER -> Organization.mandantNumber
  vertragsende: z.string().regex(DATE_YMD, "vertragsende im Format YYYY-MM-DD erforderlich"), // VERTRAGSENDE
  vertragsbeginn: z.string().regex(DATE_YMD).optional().or(z.literal("")), // VERTRAGSBEGINN
});

export type CreateContractEndInput = z.infer<typeof createContractEndSchema>;
export type RenewalDataInput = z.infer<typeof renewalDataSchema>;
export type ContractEndWebhookInput = z.infer<typeof contractEndWebhookSchema>;
