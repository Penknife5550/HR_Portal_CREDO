/**
 * Zod-Validierungsschemas fuer die Vorlagenbibliothek (E0).
 *
 * Verwendet von:
 * - /api/brief-vorlagen (POST Upload-Metadaten, validiert manuell aus FormData)
 * - /api/brief-vorlagen/[id] (PATCH)
 * - /api/brief-vorlagen/[id]/generate (POST)
 */

import { z } from "zod";
import { MODULE_VALUES } from "@/lib/placeholder-catalog";

const modulSchema = z
  .string()
  .trim()
  .refine((v) => MODULE_VALUES.includes(v), {
    message: "Unbekanntes Modul",
  });

// Metadaten beim Upload (Datei kommt separat als multipart-Feld)
export const createTemplateMetaSchema = z.object({
  name: z.string().trim().min(1, "Name ist erforderlich").max(200),
  description: z.string().trim().max(1000).optional().nullable(),
  modul: modulSchema.default("ALLGEMEIN"),
  organizationId: z
    .string()
    .uuid("Ungueltige Mandanten-ID")
    .optional()
    .nullable(),
});

export const updateTemplateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  modul: modulSchema.optional(),
  organizationId: z.string().uuid("Ungueltige Mandanten-ID").optional().nullable(),
  isActive: z.boolean().optional(),
});

export const generateSchema = z
  .object({
    format: z.enum(["docx", "pdf", "mail"]),
    organizationId: z
      .string()
      .uuid("Ungueltige Mandanten-ID")
      .optional()
      .nullable(),
    refId: z.string().trim().max(200).optional().nullable(),
    values: z.record(z.string(), z.string()).optional(),
    withDeckblatt: z.boolean().optional(),
    email: z
      .object({
        to: z.string().email("Ungueltige E-Mail-Adresse"),
        subject: z.string().trim().max(300).optional(),
        message: z.string().trim().max(5000).optional(),
      })
      .optional(),
  })
  .refine((d) => d.format !== "mail" || !!d.email?.to, {
    message: "Empfaenger-E-Mail ist erforderlich",
    path: ["email", "to"],
  });

export type CreateTemplateMetaInput = z.infer<typeof createTemplateMetaSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
export type GenerateInput = z.infer<typeof generateSchema>;
