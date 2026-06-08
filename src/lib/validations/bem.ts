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

export type CreateBemInput = z.infer<typeof createBemSchema>;
export type BemStatusInput = z.infer<typeof bemStatusSchema>;
