/**
 * Datei-Upload-Helper (Phase 2)
 *
 * Magic-Bytes-Validierung, sichere Dateinamen, Pfad-Traversal-Schutz.
 * Wird sowohl von HR-API (mit Auth) als auch Public-Endpoints (Magic Link)
 * genutzt.
 */

import path from "path";
import { mkdir, writeFile, readFile, unlink, rmdir } from "fs/promises";
import { randomUUID, createHash } from "crypto";

export const ALLOWED_UPLOAD_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB

const MAGIC_BYTES: Record<string, number[][]> = {
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]], // %PDF
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47]],
  // image/webp wird unten separat geprueft (RIFF-Header allein matcht
  // sonst auch AVI/WAV — wir muessen zusaetzlich die WEBP-Signatur an
  // Offset 8 verifizieren).
};

const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46]; // "RIFF" an Offset 0
const WEBP_WEBP = [0x57, 0x45, 0x42, 0x50]; // "WEBP" an Offset 8

export function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === "image/webp") {
    if (buffer.length < 12) return false;
    return (
      WEBP_RIFF.every((byte, i) => buffer[i] === byte) &&
      WEBP_WEBP.every((byte, i) => buffer[i + 8] === byte)
    );
  }
  const signatures = MAGIC_BYTES[mimeType];
  if (!signatures) return false;
  return signatures.some((sig) =>
    sig.every((byte, index) => buffer[index] === byte),
  );
}

/**
 * Erzeugt einen sicheren Dateinamen mit Timestamp-Prefix + UUID-Suffix.
 * Verhindert Pfad-Traversal, beschraenkt auf Alphanumerik / Punkte / Bindestriche
 * und macht Kollisionen bei gleichzeitigen Uploads praktisch unmoeglich.
 */
export function sanitizeFilename(originalName: string): string {
  const cleaned = originalName.replace(/[^a-zA-Z0-9.-]/g, "_").slice(0, 100);
  const timestamp = Date.now();
  const suffix = randomUUID().slice(0, 8);
  return `${timestamp}-${suffix}-${cleaned}`;
}

/**
 * Auf ASCII reduzierter Dateiname fuer den Content-Disposition-Header.
 *
 * Der Header vertraegt nach RFC 6266 im `filename`-Parameter kein Zeichen
 * ausserhalb von ISO-8859-1; Browser reagieren auf Umlaute unterschiedlich bis
 * gar nicht — mal verstuemmeln sie den Namen, mal bricht der Download ab.
 *
 * Steht bewusst direkt unter sanitizeFilename(), damit der Unterschied der
 * beiden im Code nebeneinander sichtbar ist: Das hier ist KEIN Speichername.
 * Es kommt kein Zeitstempel und keine UUID davor, weil der Name im
 * Download-Dialog des Empfaengers lesbar bleiben soll; Kollisionsschutz braucht
 * er nicht, denn er landet nirgends auf der Platte.
 *
 * Aufeinanderfolgende Unterstriche werden NICHT zusammengefasst. Das
 * unterscheidet die Funktion von den beiden `slugify`/`slug`-Fassungen in den
 * Vorlagen-Routen, die genau das tun und deshalb bewusst nicht mit dieser hier
 * zusammengelegt wurden — sie erzeugen bei Anfuehrungszeichen einen anderen
 * Dateinamen.
 */
export function asciiFilename(name: string): string {
  return name.replace(/[^\w\-.]/g, "_");
}

/**
 * SHA-256 ueber die Bytes einer Datei, als Hex — der Nachweis, dass genau diese
 * Bytes abgelegt bzw. versendet wurden.
 *
 * Kodierung (hex, Kleinbuchstaben) ist Teil des Vertrags und darf sich nicht
 * aendern: Die Hashes stehen als Nachweis in der Datenbank (BEM-Papier-
 * einwilligung, Dokumentenpaket-Versand). Wuerde hier auf base64 oder
 * Grossbuchstaben umgestellt, passten Bestandsdaten nicht mehr zu neuen, ohne
 * dass irgendetwas fehlschlaegt.
 *
 * Bewusst NUR fuer Buffer. Die beiden anderen Hash-Stellen im Projekt
 * (token-hash.ts, fragebogen-pruefsumme.ts) hashen eine kanonische Zeichenkette
 * mit expliziter utf8-Kodierung — dort ist die Kodierung die eigentliche
 * Entscheidung und gehoert an ihre jeweilige Stelle, nicht hierher.
 */
export function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Speichert eine Datei im uploads-Verzeichnis. Erstellt das Zielverzeichnis
 * automatisch. Liefert den vollstaendigen Dateipfad zurück.
 *
 * @param subdir Unterverzeichnis unter `uploads/` (z.B. "elternzeit/<id>")
 */
export async function saveUploadedFile(
  buffer: Buffer,
  subdir: string,
  filename: string,
): Promise<string> {
  // Pfad-Traversal-Schutz: subdir und filename duerfen keine ".." enthalten
  if (subdir.includes("..") || filename.includes("..") || filename.includes("/")) {
    throw new Error("Ungueltiger Datei- oder Verzeichnispfad");
  }

  const uploadsRoot = path.join(process.cwd(), "uploads");
  const targetDir = path.join(uploadsRoot, subdir);
  const targetPath = path.join(targetDir, filename);

  // Sicherstellen, dass targetPath unterhalb uploadsRoot liegt
  const resolved = path.resolve(targetPath);
  const resolvedRoot = path.resolve(uploadsRoot);
  if (!resolved.startsWith(resolvedRoot + path.sep)) {
    throw new Error("Pfad ausserhalb des erlaubten Bereichs");
  }

  await mkdir(targetDir, { recursive: true });
  await writeFile(targetPath, buffer);
  return targetPath;
}

/**
 * Liest eine zuvor gespeicherte Datei — aber NUR, wenn ihr Pfad unterhalb des
 * uploads-Verzeichnisses liegt (Defense-in-Depth gegen Pfad-Injection ueber eine
 * manipulierte DB-Referenz). Wirft sonst.
 */
export async function readUploadedFile(absPath: string): Promise<Buffer> {
  const uploadsRoot = path.resolve(path.join(process.cwd(), "uploads"));
  const resolved = path.resolve(absPath);
  if (resolved !== uploadsRoot && !resolved.startsWith(uploadsRoot + path.sep)) {
    throw new Error("Pfad ausserhalb des erlaubten Bereichs");
  }
  return readFile(resolved);
}

/**
 * Loescht eine gespeicherte Datei (best-effort) — nur innerhalb des uploads-
 * Verzeichnisses. Gibt true zurueck, wenn geloescht; false bei ungueltigem Pfad
 * oder Fehler (wirft nicht). Fuer das BEM-Aufbewahrungs-/Loesch-Cron.
 */
export async function deleteUploadedFile(absPath: string): Promise<boolean> {
  try {
    const uploadsRoot = path.resolve(path.join(process.cwd(), "uploads"));
    const resolved = path.resolve(absPath);
    if (resolved !== uploadsRoot && !resolved.startsWith(uploadsRoot + path.sep)) {
      return false;
    }
    await unlink(resolved);
    return true;
  } catch {
    return false;
  }
}

/**
 * Entfernt ein Verzeichnis unterhalb von uploads/, wenn es leer ist
 * (best-effort, wirft nicht). Erzeugte Dokumente liegen je Erzeugung in einem
 * eigenen Unterverzeichnis — ohne diesen Schritt blieben nach dem
 * Aufbewahrungslauf tausende leere Ordner zurueck.
 */
export async function deleteUploadedDirIfEmpty(absDir: string): Promise<boolean> {
  try {
    const uploadsRoot = path.resolve(path.join(process.cwd(), "uploads"));
    const resolved = path.resolve(absDir);
    // Nur ECHTE Unterverzeichnisse — niemals uploads/ selbst.
    if (!resolved.startsWith(uploadsRoot + path.sep)) return false;
    await rmdir(resolved);
    return true;
  } catch {
    return false; // nicht leer oder nicht vorhanden — beides unkritisch
  }
}

/**
 * Validiert eine hochgeladene Datei vollstaendig:
 * - MIME-Type erlaubt
 * - Groesse innerhalb Limits
 * - Magic Bytes stimmen mit MIME ueberein
 *
 * @returns Buffer wenn valid, sonst Fehler-Objekt mit HTTP-Status
 */
export async function validateUpload(
  file: File,
): Promise<
  | { ok: true; buffer: Buffer }
  | { ok: false; status: number; error: string }
> {
  if (!ALLOWED_UPLOAD_MIME.includes(file.type as (typeof ALLOWED_UPLOAD_MIME)[number])) {
    return {
      ok: false,
      status: 415,
      error: `Dateityp ${file.type} nicht erlaubt. Erlaubt: PDF, JPEG, PNG, WebP`,
    };
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    return {
      ok: false,
      status: 413,
      error: `Datei zu gross (max ${MAX_UPLOAD_SIZE / (1024 * 1024)} MB)`,
    };
  }
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (!validateMagicBytes(buffer, file.type)) {
    return {
      ok: false,
      status: 400,
      error: "Datei-Inhalt entspricht nicht dem angegebenen Dateityp",
    };
  }
  return { ok: true, buffer };
}

// =============================================
// Word-Vorlagen (.docx) — eigener Validierungspfad
// (separat von ALLOWED_UPLOAD_MIME, das nur PDF/Bilder erlaubt)
// =============================================
export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const MAX_DOCX_SIZE = 15 * 1024 * 1024; // 15 MB

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04" — .docx ist ein ZIP

/**
 * Validiert eine hochgeladene Word-Vorlage (.docx).
 * - Endung .docx
 * - Groesse innerhalb Limits
 * - ZIP/OOXML-Magic-Bytes (Browser melden den MIME oft unzuverlaessig, daher
 *   pruefen wir Endung + Magic Bytes statt nur file.type).
 */
export async function validateDocxUpload(
  file: File,
): Promise<
  | { ok: true; buffer: Buffer }
  | { ok: false; status: number; error: string }
> {
  if (!file.name.toLowerCase().endsWith(".docx")) {
    return {
      ok: false,
      status: 415,
      error: "Nur Word-Dateien (.docx) sind als Vorlage erlaubt.",
    };
  }
  if (file.size > MAX_DOCX_SIZE) {
    return {
      ok: false,
      status: 413,
      error: `Datei zu gross (max ${MAX_DOCX_SIZE / (1024 * 1024)} MB)`,
    };
  }
  if (file.size === 0) {
    return { ok: false, status: 400, error: "Die Datei ist leer." };
  }
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length < 4 || !ZIP_MAGIC.every((b, i) => buffer[i] === b)) {
    return {
      ok: false,
      status: 400,
      error: "Datei ist keine gueltige .docx-Datei (ungueltiges Format).",
    };
  }
  return { ok: true, buffer };
}
