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
    // B3: MAV-Beteiligung ("NICHT_ERFORDERLICH" | "AUSSTEHEND" | "ANGEHOERT" | "ZUGESTIMMT" | "WIDERSPRUCH")
    mavStatus: z.string().max(40).optional(),
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
    betriebsstaetteOrgId: z.string().uuid("Ungültige Betriebsstätte").optional().or(z.literal("")),
    probezeit: z.boolean().optional(),
    probezeitMonate: z.number().int().min(0).max(12).optional(),
    urlaubstageProJahr: z.number().int().min(0).max(60).optional(),
    zusatzvereinbarungen: z.string().max(2000).optional(),
  })
  .strip();

/**
 * Rueckmeldung der Fuehrungskraft im oeffentlichen Formular (Strang A, neuer
 * Prozess): SIE entscheidet ueber die Uebernahme. Bei Ablehnung ist eine kurze
 * Begruendung Pflicht. Die Vertragsdaten (bei Uebernahme) kommen zusaetzlich
 * ueber renewalDataSchema im selben Request.
 */
export const supervisorDecisionSchema = z
  .object({
    decision: z.enum(["UEBERNAHME", "KEINE_UEBERNAHME"]),
    declineReason: z.string().max(1000).optional(),
  })
  .refine(
    (d) => d.decision !== "KEINE_UEBERNAHME" || Boolean(d.declineReason && d.declineReason.trim()),
    {
      message: "Bitte geben Sie eine kurze Begründung für die Nicht-Übernahme an.",
      path: ["declineReason"],
    },
  );

/**
 * Meldung von n8n (liest DokuBit). Feldnamen bewusst nah an den DokuBit-Spalten
 * gehalten, damit n8n moeglichst 1:1 durchreichen kann.
 *
 * Zusatzfelder (Phase 2, #10): aktueller Vertrag (Vorausfuellen des
 * Vorgesetzten-Formulars), Befristungshistorie (Basis der §14-Warnung B2) und
 * alle Mandanten-Zuordnungen der Person (Mehrfach-Erkennung). Alles optional —
 * n8n liefert, was DokuBit hergibt. `.strip()` verwirft Unbekanntes.
 */
export const contractEndWebhookSchema = z
  .object({
    personalNr: z.string().max(50).optional(), // DokuBit MANR
    vorname: z.string().min(1).max(100), // MAVONAME
    nachname: z.string().min(1).max(100), // MANANAME
    email: z.string().email("Ungültige E-Mail-Adresse").optional().or(z.literal("")), // MAEMAIL
    mandantNummer: z.string().min(1).max(20), // MANDANTENNUMMER -> Organization.mandantNumber
    vertragsende: z.string().regex(DATE_YMD, "vertragsende im Format YYYY-MM-DD erforderlich"), // VERTRAGSENDE
    vertragsbeginn: z.string().regex(DATE_YMD).optional().or(z.literal("")), // VERTRAGSBEGINN
    // Aktueller (auslaufender) Vertrag — Vorausfuellen (#5)
    aktuellePosition: z.string().max(200).optional().or(z.literal("")),
    aktuelleEntgeltgruppe: z.string().max(20).optional().or(z.literal("")),
    aktuelleStufe: z.string().max(20).optional().or(z.literal("")),
    aktuelleWochenstunden: z.number().min(0).max(60).optional(),
    // Befristungshistorie — §14-TzBfG-Warnung (B2)
    befristungsart: z.enum(["SACHGRUNDLOS", "MIT_SACHGRUND"]).optional(),
    bisherigeBefristungMonate: z.number().int().min(0).max(600).optional(),
    bisherigeVerlaengerungen: z.number().int().min(0).max(50).optional(),
    // Alle Mandanten-Zuordnungen der Person (personal_mandanten) — Mehrfach-Erkennung
    personalMandanten: z.array(z.string().min(1).max(20)).max(50).optional(),
  })
  .strip();

export type CreateContractEndInput = z.infer<typeof createContractEndSchema>;
export type RenewalDataInput = z.infer<typeof renewalDataSchema>;
export type SupervisorDecisionInput = z.infer<typeof supervisorDecisionSchema>;
export type ContractEndWebhookInput = z.infer<typeof contractEndWebhookSchema>;
