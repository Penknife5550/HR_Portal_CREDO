/**
 * Validierung: HR-Aktionen an einem Onboarding-Vorgang
 *
 *   - supervisorLinkSchema   POST  /api/onboarding/[id]/supervisor-link
 *   - statusAenderungSchema  PATCH /api/onboarding/[id]
 */

import { z } from "zod";
import { ONBOARDING_STATUS } from "@/lib/onboarding-spuren";

/** RFC 5321: Eine Adresse ist hoechstens 254 Zeichen lang. */
const MAX_EMAIL_LAENGE = 254;

/**
 * Vorgesetzten-Link erzeugen.
 *
 * Frueher pruefte die Route nur „Feld vorhanden" — jede Zeichenkette landete
 * als `supervisorEmail` in der Datenbank und als Empfaenger im Mailversand. Ein
 * Tippfehler fiel erst auf, wenn die Mail nicht ankam.
 */
export const supervisorLinkSchema = z.object({
  supervisorEmail: z
    .string({
      required_error: "Bitte geben Sie die E-Mail-Adresse der Führungskraft an.",
      invalid_type_error: "Bitte geben Sie die E-Mail-Adresse der Führungskraft an.",
    })
    .trim()
    .min(1, "Bitte geben Sie die E-Mail-Adresse der Führungskraft an.")
    .max(MAX_EMAIL_LAENGE, "Die E-Mail-Adresse ist zu lang.")
    .email("Bitte geben Sie eine gültige E-Mail-Adresse der Führungskraft an."),
});

export type SupervisorLinkInput = z.infer<typeof supervisorLinkSchema>;

/**
 * Statusaenderung durch HR.
 *
 * Das Schema laesst alle acht Enum-Werte durch; welche davon HR tatsaechlich
 * setzen darf (nur REVIEWED, COMPLETED, EXPIRED) und aus welchem Stand, prueft
 * die Route — dort gibt es fuer die abgeleiteten Status eine eigene,
 * erklaerende Meldung statt „ungültig".
 */
export const statusAenderungSchema = z.object({
  status: z.enum(ONBOARDING_STATUS, {
    errorMap: () => ({ message: "Ungültiger Status-Wert" }),
  }),
});

export type StatusAenderungInput = z.infer<typeof statusAenderungSchema>;
