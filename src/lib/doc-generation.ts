/**
 * Orchestriert die Dokument-Erzeugung der Vorlagenbibliothek (E0):
 * Vorlage befuellen (docx) -> optional PDF (Gotenberg) -> optional DMS-Deckblatt.
 *
 * Liefert reine Buffer zurueck. Persistenz (Disk/DB) und HTTP-Antwort liegen
 * beim Aufrufer (API-Route). Modul-Integrationen (z.B. BEM in E5) nutzen
 * denselben Helfer.
 */

import { renderDocx } from "@/lib/doc-templates";
import { convertDocxToPdf, mergePdfs } from "@/lib/gotenberg";
import { buildDeckblattPdf, type DeckblattMeta } from "@/lib/pdf-deckblatt";

export interface GenerateOptions {
  /** PDF zusaetzlich erzeugen (Gotenberg). */
  wantPdf: boolean;
  /** DMS-Deckblatt vor den PDF-Inhalt setzen. */
  withDeckblatt?: boolean;
  deckblatt?: DeckblattMeta;
  /** Dateiname-Hinweis fuer Gotenberg (Endung .docx). */
  filename?: string;
}

export interface GenerateOutput {
  docx: Buffer;
  pdf?: Buffer;
  /** Nicht befuellte Platzhalter (durch "___" ersetzt). */
  missing: string[];
  /** Gesetzt, wenn die PDF-Erzeugung fehlschlug (Word bleibt nutzbar). */
  pdfError?: string;
}

/**
 * Befuellt die Vorlage und erzeugt Word (immer) sowie optional PDF.
 * Die PDF-Erzeugung ist best-effort: schlaegt Gotenberg fehl, wird `pdfError`
 * gesetzt und nur das Word-Dokument zurueckgegeben (kein Throw).
 */
export async function generateFromTemplate(
  templateBuffer: Buffer,
  data: Record<string, unknown>,
  opts: GenerateOptions,
): Promise<GenerateOutput> {
  const { buffer: docx, missing } = renderDocx(templateBuffer, data);
  const out: GenerateOutput = { docx, missing };

  if (opts.wantPdf) {
    try {
      const contentPdf = await convertDocxToPdf(
        docx,
        opts.filename || "dokument.docx",
      );
      if (opts.withDeckblatt && opts.deckblatt) {
        const cover = await buildDeckblattPdf(opts.deckblatt);
        out.pdf = await mergePdfs([cover, contentPdf]);
      } else {
        out.pdf = contentPdf;
      }
    } catch (error) {
      out.pdfError =
        error instanceof Error ? error.message : "PDF-Erzeugung fehlgeschlagen";
    }
  }

  return out;
}
