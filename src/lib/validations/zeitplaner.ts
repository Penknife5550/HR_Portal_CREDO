/**
 * Zod-Schemas fuer Einstellungen → Automatische Läufe (src/lib/zeitplaner/).
 */

import { z } from "zod";

export const laufEinstellungSchema = z
  .object({
    aktiv: z.boolean().optional(),
    uhrzeit: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Bitte eine Uhrzeit im Format HH:MM angeben (z. B. 08:00).")
      .optional(),
    nurWerktags: z.boolean().optional(),
    probelauf: z.boolean().optional(),
    berichtBeiErfolg: z.boolean().optional(),
  })
  .strict()
  .refine((w) => Object.keys(w).length > 0, { message: "Keine Änderung angegeben." });

export type LaufEinstellungInput = z.infer<typeof laufEinstellungSchema>;

export const laufStartenSchema = z.object({ probelauf: z.boolean().default(false) }).strict();

export type LaufStartenInput = z.infer<typeof laufStartenSchema>;
