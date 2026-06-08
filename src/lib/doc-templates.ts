/**
 * Render-Lib fuer die zentrale Vorlagenbibliothek (E0).
 *
 * Word-Vorlagen (.docx) mit Platzhaltern werden via docxtemplater befuellt.
 * - Platzhalter:        {vorname}, {nachname}, ...
 * - Wenn/Dann (angular): {#hatKinder}...{/hatKinder}, {kinderAnzahl > 1 ? "..." : "..."}
 * - Fehlende Platzhalter werden NICHT als Fehler behandelt, sondern durch "___"
 *   ersetzt und in `missing` zurueckgemeldet (Warnung statt Blockade).
 *
 * Tag-Extraktion nutzt die unterstuetzte getFullText()-API (kein lodash-abhaengiges
 * inspect-module).
 */

import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
// Angular-Expression-Parser fuer Wenn/Dann-Bedingungen (peer: angular-expressions).
import expressionParser from "docxtemplater/expressions.js";

const DOCX_ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04"

/** Prueft, ob ein Buffer ein ZIP/OOXML (.docx) ist (Magic Bytes). */
export function isDocxBuffer(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  return DOCX_ZIP_MAGIC.every((b, i) => buffer[i] === b);
}

/** Fehler beim Verarbeiten einer Vorlage (Syntaxfehler in den Platzhaltern). */
export class TemplateError extends Error {
  readonly details: string[];
  constructor(message: string, details: string[] = []) {
    super(message);
    this.name = "TemplateError";
    this.details = details;
  }
}

// Haeufige docxtemplater-Fehler-IDs auf deutsche Texte mappen (UI ist deutsch).
const ERROR_ID_DE: Record<string, string> = {
  unclosed_tag: "Ein Platzhalter wurde nicht geschlossen (fehlende „}“).",
  unopened_tag: "Ein schliessendes „}“ ohne zugehoerigen Platzhalter.",
  unclosed_loop: "Eine Wenn/Dann- oder Schleifen-Sektion wurde nicht geschlossen.",
  unopened_loop: "Eine schliessende Sektion ohne zugehoerige oeffnende Sektion.",
  duplicate_close_tag: "Eine Sektion wurde doppelt geschlossen.",
  duplicate_open_tag: "Eine Sektion wurde doppelt geoeffnet.",
  raw_tag_outerxml_invalid: "Ungueltiger Raw-XML-Platzhalter.",
  scope_parser_execution_failed:
    "Ein Platzhalter-Ausdruck konnte nicht ausgewertet werden.",
};

// docxtemplater wirft bei Renderfehlern einen Multi-Error; daraus lesbare
// deutsche Meldungen extrahieren (Fallback: englische Original-Erklaerung).
function extractTemplateErrors(error: unknown): string[] {
  const err = error as { properties?: { errors?: unknown[] }; message?: string };
  const inner = err?.properties?.errors;
  if (Array.isArray(inner) && inner.length > 0) {
    return inner.map((e) => {
      const ee = e as {
        properties?: { explanation?: string; id?: string; xtag?: string };
        message?: string;
      };
      const id = ee?.properties?.id;
      const xtag = ee?.properties?.xtag;
      const ctx = xtag ? ` (bei „${xtag}“)` : "";
      if (id && ERROR_ID_DE[id]) return ERROR_ID_DE[id] + ctx;
      return (
        ee?.properties?.explanation ||
        ee?.message ||
        "Unbekannter Platzhalter-Fehler"
      );
    });
  }
  return [err?.message || "Unbekannter Fehler beim Verarbeiten der Vorlage"];
}

const RESERVED_TOKENS = new Set([
  "true",
  "false",
  "null",
  "undefined",
  "this",
]);

/**
 * Extrahiert die Platzhalter-Namen aus einer .docx-Vorlage.
 * Deckt Haupt-Dokument sowie Kopf-/Fusszeilen ab (alle "templated files").
 * Liefert eine sortierte, deduplizierte Liste einfacher Variablennamen.
 *
 * @throws TemplateError wenn die Vorlage nicht geladen werden kann.
 */
export function extractPlaceholders(docxBuffer: Buffer): string[] {
  let doc: Docxtemplater;
  try {
    const zip = new PizZip(docxBuffer);
    doc = new Docxtemplater(zip, {
      parser: expressionParser,
      paragraphLoop: true,
      linebreaks: true,
    });
  } catch (error) {
    throw new TemplateError(
      "Vorlage konnte nicht gelesen werden. Ist es eine gueltige .docx-Datei?",
      extractTemplateErrors(error),
    );
  }

  // Text aller templated-Dateien einsammeln (Body + Kopf-/Fusszeilen).
  // getTemplatedFiles ist nicht in den .d.ts deklariert -> getypter Zugriff.
  const dx = doc as unknown as {
    getTemplatedFiles(): string[];
    getFullText(path?: string): string;
  };
  let fullText = "";
  let files: string[] = [];
  try {
    files = dx.getTemplatedFiles();
  } catch {
    files = [];
  }
  for (const file of files) {
    try {
      fullText += "\n" + dx.getFullText(file);
    } catch {
      // Nicht-Text-Teil — ueberspringen
    }
  }
  // Fallback: zumindest das Hauptdokument
  if (!fullText.trim()) {
    try {
      fullText = dx.getFullText();
    } catch {
      fullText = "";
    }
  }

  return parsePlaceholderNames(fullText);
}

/** Parst Platzhalter-Namen aus dem (gemergten) Vorlagentext. */
export function parsePlaceholderNames(text: string): string[] {
  const names = new Set<string>();
  const tagRegex = /\{([^{}]+)\}/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(text)) !== null) {
    let content = match[1].trim();
    if (!content) continue;
    // Schliessende Tags ueberspringen: {/}, {/hatKinder}
    if (content.startsWith("/")) continue;
    // Strukturelle Praefixe entfernen: # (Section), ^ (Invert), @ (RawXml), > (Partial)
    content = content.replace(/^[#^@>]/, "").trim();
    if (!content) continue;

    if (/^[a-zA-Z_][\w.]*$/.test(content)) {
      // Einfacher Variablenname (ggf. mit Punkt-Notation)
      names.add(content.split(".")[0]);
    } else {
      // Ausdruck (Wenn/Dann) — zuerst String-Literale entfernen, damit Woerter
      // aus Anrede-Texten (z.B. {g == "m" ? "Sehr geehrter Herr" : "..."})
      // nicht faelschlich als Platzhalter erkannt werden.
      const expr = content.replace(
        /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g,
        " ",
      );
      const idRegex = /[a-zA-Z_][\w]*/g;
      let id: RegExpExecArray | null;
      while ((id = idRegex.exec(expr)) !== null) {
        const token = id[0];
        if (!RESERVED_TOKENS.has(token)) names.add(token);
      }
    }
  }

  return [...names].sort((a, b) => a.localeCompare(b, "de"));
}

export interface RenderResult {
  buffer: Buffer;
  /**
   * Einfache Platzhalter, fuer die kein Wert vorlag (durch "___" ersetzt).
   * Hinweis: Bezeichner INNERHALB von Wenn/Dann-Ausdruecken
   * ({#cond}, {a > b ? ...}) erscheinen hier NICHT — fehlende Bedingungen
   * werten regulaer zu "falsy" aus (Standard-docxtemplater-Semantik).
   */
  missing: string[];
}

/**
 * Befuellt eine .docx-Vorlage mit Daten und liefert das gerenderte .docx-Buffer.
 * Fehlende Platzhalter werden durch "___" ersetzt und in `missing` gemeldet
 * (kein Abbruch). Echte Syntaxfehler in der Vorlage werfen TemplateError.
 */
export function renderDocx(
  docxBuffer: Buffer,
  data: Record<string, unknown>,
): RenderResult {
  const missing = new Set<string>();

  let doc: Docxtemplater;
  try {
    const zip = new PizZip(docxBuffer);
    doc = new Docxtemplater(zip, {
      parser: expressionParser,
      paragraphLoop: true,
      linebreaks: true,
      nullGetter(part: { value?: string; module?: string }) {
        // Einfache Platzhalter -> "___" + merken. Sections/RawXml -> leer.
        if (!part.module) {
          if (part.value) missing.add(part.value);
          return "___";
        }
        return "";
      },
    });
  } catch (error) {
    throw new TemplateError(
      "Vorlage konnte nicht gelesen werden. Ist es eine gueltige .docx-Datei?",
      extractTemplateErrors(error),
    );
  }

  try {
    doc.render(data);
  } catch (error) {
    throw new TemplateError(
      "Vorlage enthaelt fehlerhafte Platzhalter und konnte nicht erzeugt werden.",
      extractTemplateErrors(error),
    );
  }

  const buffer = doc.getZip().generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  }) as Buffer;

  return { buffer, missing: [...missing].sort((a, b) => a.localeCompare(b, "de")) };
}
