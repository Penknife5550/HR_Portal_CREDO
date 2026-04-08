/**
 * Datei-Upload-Helper (Phase 2)
 *
 * Magic-Bytes-Validierung, sichere Dateinamen, Pfad-Traversal-Schutz.
 * Wird sowohl von HR-API (mit Auth) als auch Public-Endpoints (Magic Link)
 * genutzt.
 */

import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { randomUUID } from "crypto";

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
 * Speichert eine Datei im uploads-Verzeichnis. Erstellt das Zielverzeichnis
 * automatisch. Liefert den vollstaendigen Dateipfad zurueck.
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
