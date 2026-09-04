/**
 * Zod-Schemas fuer den Pool der Starterpaket-Dokumente (Upload und Pflege).
 *
 * Die Markierung je Mandant liegt seit Baustein 3/4 in
 * validations/dokumentenpaket.ts — sie kennt gemischte Listen aus PDFs und
 * Brief-Vorlagen je Modul.
 */
import { z } from "zod";

/** Metadaten beim Upload eines Pool-Dokuments (Multipart-Felder). */
export const createStarterpaketDokumentMetaSchema = z.object({
  name: z.string().trim().min(1, "Name erforderlich").max(200),
  beschreibung: z.string().trim().max(500).optional(),
  // leer / fehlend = GLOBAL (gruppenweit); gesetzt = mandantenspezifisch
  organizationId: z.string().uuid("Ungueltige Mandanten-ID").optional(),
});
export type CreateStarterpaketDokumentMeta = z.infer<
  typeof createStarterpaketDokumentMetaSchema
>;

/** Aenderung eines Pool-Dokuments (Name/Beschreibung/aktiv). */
export const updateStarterpaketDokumentSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  beschreibung: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});
export type UpdateStarterpaketDokument = z.infer<
  typeof updateStarterpaketDokumentSchema
>;
