/**
 * Datei-Upload-Helper (Phase 2)
 *
 * Magic-Bytes-Validierung, sichere Dateinamen, Pfad-Traversal-Schutz.
 * Wird sowohl von HR-API (mit Auth) als auch Public-Endpoints (Magic Link)
 * genutzt.
 */

import path from "path";
import { mkdir, writeFile, readFile, unlink, rmdir, realpath } from "fs/promises";
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

// =============================================
// Paket 4 „Unterlagen nachfordern": Werkzeuge fuer oeffentliche Uploads
// (Feinplanung docs/module/onboarding/paket4-feinplanung.md, Abschnitt 4)
// =============================================

/**
 * Die Typen, die eine oeffentliche Upload-Seite annimmt — ermittelt aus den
 * Bytes, nie aus `file.type` oder der Endung.
 */
export type ErkannterDateityp = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";

/** Die Endung, die eine Datei dieses Typs auf der Platte und im Anzeigenamen traegt. */
export const ENDUNG_FUER_DATEITYP: Readonly<Record<ErkannterDateityp, string>> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

/**
 * Ist ein GESPEICHERTER Typ (`mimeType` aus der Datenbank) einer der aus den
 * Bytes erkannten? Der eine Typwaechter fuer alle Stellen, die danach
 * entscheiden — Endung auf der Platte, `inline` oder Download, Endung des
 * Download-Namens. Er folgt `ENDUNG_FUER_DATEITYP`: Ein neuer erkannter Typ
 * braucht keine zweite Liste.
 *
 * Eigener Schluessel (`hasOwnProperty`), nicht `in`: Das faende auch geerbte
 * wie `toString` — und ein Typ „toString" aus einer manipulierten Zeile gaelte
 * sonst als erkannt.
 */
export function istErkannterDateityp(mimeType: unknown): mimeType is ErkannterDateityp {
  return typeof mimeType === "string" && Object.prototype.hasOwnProperty.call(ENDUNG_FUER_DATEITYP, mimeType);
}

export type DateitypErgebnis =
  | { ok: true; mimeType: ErkannterDateityp; endung: string }
  /** `%PDF-` am Anfang, aber kein `%%EOF` am Ende: abgebrochen gespeichert oder gescannt. */
  | { ok: false; status: 400; grund: "PDF_UNVOLLSTAENDIG" }
  | { ok: false; status: 415; grund: "TYP_NICHT_ERLAUBT" };

const PDF_ANFANG = Buffer.from("%PDF-", "latin1");
const PDF_ENDE = Buffer.from("%%EOF", "latin1");
/** Wie weit vom Dateiende `%%EOF` stehen darf (PDF 1.7, Anhang H.3 Nr. 3). */
const PDF_ENDE_BEREICH = 1024;
const PNG_SIGNATUR = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function beginntMit(buffer: Buffer, bytes: readonly number[], ab = 0): boolean {
  if (buffer.length < ab + bytes.length) return false;
  return bytes.every((b, i) => buffer[ab + i] === b);
}

/**
 * Der Typ einer hochgeladenen Datei, allein aus ihren Bytes.
 *
 * `validateUpload` taugt dafuer nicht: Es entscheidet zuerst nach `file.type`,
 * und den setzt der Browser aus der Endung — oder ein Angreifer von Hand. Die
 * Fragebogen-Route ist ebenfalls keine Vorlage, sie laesst DOC/DOCX zu. Hier
 * zaehlt deshalb nur, was in der Datei steht:
 *
 * - **PDF:** `%PDF-` ab Byte 0 UND `%%EOF` in den letzten 1024 Bytes. Fehlt das
 *   Ende, ist die Datei fast immer abgeschnitten (Scan-App abgebrochen, Upload
 *   vom Handy unterbrochen) — dann 400 mit Handlungsanweisung statt 415, denn
 *   die Person hat den richtigen Typ gewaehlt und muss nur neu speichern.
 * - **JPEG:** `FF D8 FF`. **PNG:** die volle 8-Byte-Signatur, nicht nur die
 *   ersten vier Bytes wie `validateMagicBytes`.
 * - **WebP:** `RIFF` UND `WEBP` ab Byte 8. `RIFF` allein traegt auch AVI und
 *   WAV (derselbe Fehler, den `validateMagicBytes` schon einmal hatte).
 *
 * Alles andere ergibt 415. Eine leere Datei ebenso — die Route prueft sie
 * vorher selbst und antwortet dort mit 400.
 */
export function erkenneDateityp(buffer: Buffer): DateitypErgebnis {
  if (buffer.length >= PDF_ANFANG.length && buffer.subarray(0, PDF_ANFANG.length).equals(PDF_ANFANG)) {
    const ende = buffer.subarray(Math.max(0, buffer.length - PDF_ENDE_BEREICH));
    if (!ende.includes(PDF_ENDE)) {
      return { ok: false, status: 400, grund: "PDF_UNVOLLSTAENDIG" };
    }
    return { ok: true, mimeType: "application/pdf", endung: ".pdf" };
  }
  if (beginntMit(buffer, [0xff, 0xd8, 0xff])) {
    return { ok: true, mimeType: "image/jpeg", endung: ".jpg" };
  }
  if (beginntMit(buffer, PNG_SIGNATUR)) {
    return { ok: true, mimeType: "image/png", endung: ".png" };
  }
  if (beginntMit(buffer, WEBP_RIFF) && beginntMit(buffer, WEBP_WEBP, 8)) {
    return { ok: true, mimeType: "image/webp", endung: ".webp" };
  }
  return { ok: false, status: 415, grund: "TYP_NICHT_ERLAUBT" };
}

/** Ein Hinweis fuer HR zu einem PDF — nie ein Grund, die Datei abzulehnen. */
export type PdfMerkmal = "VERSCHLUESSELT" | "AKTIVE_INHALTE";

/**
 * PDF-Namen, die ausfuehrbare oder nachladende Inhalte ankuendigen.
 *
 * `EmbeddedFiles` (der Namensbaum) steht zusaetzlich zu `EmbeddedFile` (der
 * Typ des Dateistroms) hier: Der `/Type`-Eintrag eines eingebetteten Stroms ist
 * nach der Norm optional, der Namensbaum nicht. Beides macht die Meldung nur
 * haeufiger, nie seltener — und nur in diese Richtung darf sie irren.
 */
const AKTIVE_PDF_NAMEN: ReadonlySet<string> = new Set([
  "JavaScript",
  "JS",
  "Launch",
  "EmbeddedFile",
  "EmbeddedFiles",
  "OpenAction",
  "AA",
  "XFA",
]);

/**
 * Ein PDF-Name: `/` und danach alles bis zum naechsten Trenn- oder Leerzeichen
 * (PDF 1.7, 7.2.2 und 7.3.5). `#xx` gehoert zum Namen und wird erst danach
 * aufgeloest — `/J#53` IST `/JS`, und genau so verstecken Schadpakete ihre
 * Namen vor einer schlichten Textsuche.
 *
 * Leerzeichen sind laut Tabelle 1 NUL, HT, LF, FF, CR und SP. JavaScripts `\s`
 * kennt NUL nicht, deshalb steht `\0` eigens in der Klasse — sonst laese die
 * Suche `/JavaScript<NUL>` als anderen Namen, ein PDF-Leser aber als
 * `/JavaScript`. Dass `\s` zusaetzlich VT und NBSP als Trenner nimmt, bleibt:
 * Das irrt nur in Richtung „haeufiger melden".
 */
const PDF_NAME_MUSTER = /\/((?:[^\s\0/[\]<>(){}%#]|#[0-9A-Fa-f]{2})+)/g;

/**
 * Was HR ueber ein hochgeladenes PDF wissen sollte, bevor es geoeffnet wird.
 *
 * - `/Encrypt` → „kennwortgeschützt" (`VERSCHLUESSELT`),
 * - `/JavaScript`, `/JS`, `/Launch`, `/EmbeddedFile`, `/OpenAction`, `/AA`,
 *   `/XFA` → „aktive Inhalte gefunden" (`AKTIVE_INHALTE`).
 *
 * **Nur positive Aussagen.** Namen in komprimierten Objektstroemen findet diese
 * Suche nicht — eine leere Liste heisst also „nichts gefunden", NIE „keine
 * aktiven Inhalte". Die Oberflaeche formuliert deshalb nur den Fund, nie seine
 * Abwesenheit. Die Datei wird dadurch auch nicht abgelehnt: Viele Formulare der
 * Behoerden tragen `/AA` oder `/OpenAction` voellig harmlos.
 *
 * Verglichen wird der GANZE, aufgeloeste Name, nicht ein Praefix — sonst
 * meldete schon ein Schriftname wie `/JSMincho` aktive Inhalte.
 */
export function pdfMerkmale(buffer: Buffer): PdfMerkmal[] {
  // latin1 bildet jedes Byte auf genau ein Zeichen ab — anders als utf8, das
  // ungueltige Folgen zu U+FFFD zusammenzieht und dabei Namen zerreissen kann.
  const text = buffer.toString("latin1");
  let verschluesselt = false;
  let aktiv = false;
  for (const treffer of text.matchAll(PDF_NAME_MUSTER)) {
    const name = treffer[1].replace(/#([0-9A-Fa-f]{2})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
    if (name === "Encrypt") verschluesselt = true;
    else if (AKTIVE_PDF_NAMEN.has(name)) aktiv = true;
    if (verschluesselt && aktiv) break;
  }
  const merkmale: PdfMerkmal[] = [];
  if (verschluesselt) merkmale.push("VERSCHLUESSELT");
  if (aktiv) merkmale.push("AKTIVE_INHALTE");
  return merkmale;
}

/** Hoechstlaenge eines Anzeigenamens in Zeichen (Codepunkten), Endung eingeschlossen. */
export const ANZEIGENAME_MAX_ZEICHEN = 150;

/**
 * Zeichen, die in einem Anzeigenamen nichts verloren haben: Steuerzeichen (C0
 * samt DEL, dazu C1) und die Bidi-Steuerzeichen, mit denen sich ein Name wie
 * „rechnung<U+202E>fdp.exe" als „rechnungexe.pdf" darstellen laesst (U+061C,
 * U+200E/F, U+202A–202E, U+2066–2069).
 */
const UNERLAUBTE_NAMENSZEICHEN =
  /[\u0000-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

/** Endungen, die fuer den erkannten Typ schon stimmen und nicht doppelt angehaengt werden. */
const GLEICHWERTIGE_ENDUNGEN: Readonly<Record<ErkannterDateityp, readonly string[]>> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

/**
 * Der Name, unter dem HR eine hochgeladene Datei sieht — und unter dem sie
 * nach der Annahme als `Document.fileName` wieder herauskommt.
 *
 * Er landet NUR in der Datenbank, nie im Pfad (dort steht `<dateiId>.<ext>`).
 * Gefaehrlich ist er trotzdem: Die Download-Route liefert `fileName` als
 * `attachment` aus. Eine JPEG/HTA-Polyglot-Datei namens `x.hta` laege sonst
 * mit `.hta` auf dem Windows-Rechner von HR, und ein Doppelklick fuehrte sie
 * aus. Deshalb:
 *
 * 1. NFC-Normalform, nur der Basisname (ohne `/`- und `\`-Pfadanteile).
 * 2. Ohne Steuer- und Bidi-Zeichen (`UNERLAUBTE_NAMENSZEICHEN`).
 * 3. **Die Endung ist immer die des erkannten Typs.** Die letzte Endung des
 *    Originals faellt weg; endet der Rest schon auf die richtige Endung, wird
 *    sie nicht doppelt angehaengt: `x.hta` (JPEG) → `x.jpg`,
 *    `x.pdf.html` (PDF) → `x.pdf`, `x.` → `x.pdf`.
 * 4. Leer → „Datei" plus Endung. Hoechstens 150 Zeichen samt Endung; gekuerzt
 *    wird der Stamm, nie die Endung.
 */
export function anzeigeNameBereinigen(name: string, erkannterTyp: ErkannterDateityp): string {
  const endung = ENDUNG_FUER_DATEITYP[erkannterTyp];
  const basis = (name ?? "").normalize("NFC").split(/[/\\]/).pop() ?? "";
  let stamm = basis.replace(UNERLAUBTE_NAMENSZEICHEN, "").trim();

  // Die letzte Endung des Originals faellt weg (auch ein nackter Punkt am Ende).
  const punkt = stamm.lastIndexOf(".");
  if (punkt >= 0) stamm = stamm.slice(0, punkt);

  // Endet der Rest schon auf eine passende Endung („x.pdf.html"), bleibt nur
  // der Stamm davor stehen — die einheitliche Endung kommt gleich wieder dran.
  const klein = stamm.toLowerCase();
  const passend = GLEICHWERTIGE_ENDUNGEN[erkannterTyp].find((e) => klein.endsWith(e));
  if (passend) stamm = stamm.slice(0, stamm.length - passend.length);

  // Windows verwirft Punkte und Leerzeichen am Namensende still; sie stuenden
  // hier also nur vor der Endung im Weg.
  stamm = stamm.replace(/[.\s]+$/, "").trim();

  const zeichen = Array.from(stamm);
  const platz = ANZEIGENAME_MAX_ZEICHEN - endung.length;
  if (zeichen.length > platz) {
    stamm = zeichen.slice(0, platz).join("").replace(/[.\s]+$/, "");
  }
  return `${stamm || "Datei"}${endung}`;
}

/** Liegt `ziel` unterhalb von `wurzel` oder ist es die Wurzel selbst? */
function liegtIn(wurzel: string, ziel: string): boolean {
  const rel = path.relative(wurzel, ziel);
  return rel === "" || (rel.split(path.sep)[0] !== ".." && !path.isAbsolute(rel));
}

/**
 * Loest einen Pfad auf und gibt ihn nur zurueck, wenn er WIRKLICH unterhalb
 * einer der uebergebenen Wurzeln liegt.
 *
 * Zwei Dinge, die ein Vergleich per path.resolve + startsWith nicht leistet:
 *
 * 1. **Symlinks.** path.resolve normalisiert Zeichenketten, sonst nichts. Ein
 *    Link, der brav unterhalb der Wurzel liegt und auf /etc oder in die
 *    BEM-Anlagen zeigt, besteht jede Praefix-Pruefung — geprueft wird der
 *    Link, gelesen wird sein Ziel. Erst realpath macht daraus dasselbe.
 *    Aufgeloest werden muessen BEIDE Seiten: auch die Wurzel kann ein Link
 *    oder ein Bind-Mount sein (das uploads-Volume ist genau das), und dann
 *    passte sonst nichts mehr zusammen.
 *
 * 2. **Der Vergleich selbst.** startsWith kennt weder Pfadgrenzen noch die
 *    Gross-/Kleinschreibung — entwickelt wird auf Windows, gelaufen wird im
 *    Linux-Container. path.relative kennt beides: liegt das Ziel ausserhalb,
 *    ist das erste Segment "..", auf einem anderen Laufwerk ist das Ergebnis
 *    absolut. Verglichen wird das erste SEGMENT und nicht der Praefix "..",
 *    sonst wiese ein Geschwisterordner namens "..alt" faelschlich ab.
 *
 * Eine Wurzel, die es auf dieser Maschine gar nicht gibt, wird uebersprungen
 * statt zu werfen: Ob public/system-dokumente existiert, darf nicht darueber
 * entscheiden, ob eine hochgeladene Vorlage lesbar ist.
 *
 * Weil realpath auch bei einer fehlenden Datei wirft (ENOENT), beantwortet
 * diese Funktion zwei Fragen auf einmal — "liegt der Pfad im erlaubten
 * Bereich" und "gibt es die Datei ueberhaupt". Die Vorpruefung des
 * Dokumentenpakets nutzt genau das, ohne ein einziges Byte zu lesen. Fuer ein
 * ZIEL, das es noch nicht gibt, ist `zielVerzeichnisPruefen` da.
 *
 * Wurzeln je Operation, nie `uploads` als Ganzes: Darunter liegen auch die
 * BEM-Anlagen (`uploads/bem/...`, Gesundheitsdaten mit eigenem Schluessel).
 *
 * Umgezogen aus `dokumentenpaket.ts`, weil Paket 4 dieselbe Schranke braucht;
 * das Verhalten ist unveraendert.
 */
export async function pfadInWurzeln(dateipfad: string, wurzeln: readonly string[]): Promise<string> {
  const ziel = await realpath(path.resolve(dateipfad));
  for (const wurzel of wurzeln) {
    let aufgeloest: string;
    try {
      aufgeloest = await realpath(path.resolve(wurzel));
    } catch {
      continue;
    }
    if (liegtIn(aufgeloest, ziel)) return ziel;
  }
  throw new Error("Pfad ausserhalb der erlaubten Verzeichnisse");
}

/**
 * Eine UUID in Kleinbuchstaben (`randomUUID()`, Prisma `uuid()`), ohne Anker —
 * als Baustein fuer zusammengesetzte Muster wie `<uuid>.<ext>`
 * (unterlagen-dateien.ts). Die Version wird bewusst nicht geprueft: Hier geht
 * es nur darum, dass eine ID weder `..` noch einen Trenner tragen kann.
 */
export const UUID_TEIL = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** Die Form jeder ID, die zum Datei- oder Verzeichnisnamen wird (`randomUUID()`, Prisma `uuid()`). */
export const UUID_MUSTER = new RegExp(`^${UUID_TEIL}$`);

/**
 * Legt `<wurzel>/<id>` an und gibt den aufgeloesten Pfad zurueck — aber nur,
 * wenn das Verzeichnis danach WIRKLICH genau dort liegt.
 *
 * Das Gegenstueck zu `pfadInWurzeln` fuer Ziele: realpath wirft bei einer
 * Datei, die es noch nicht gibt, also wird das Verzeichnis geprueft, in das
 * sie gleich geschrieben wird.
 *
 * - Die `id` muss UUID-Form haben (Kleinbuchstaben). So kann sie weder `..`
 *   noch einen Trenner enthalten.
 * - `mkdir` legt an, was fehlt (auch die Wurzel selbst).
 * - Danach muss `realpath(<wurzel>/<id>)` gleich `realpath(<wurzel>)` plus
 *   `<id>` sein. Liegt an der Stelle schon ein Symlink oder eine Junction auf
 *   ein anderes Verzeichnis, schlaegt `mkdir` NICHT fehl (es gibt dort ja ein
 *   Verzeichnis) — erst dieser Vergleich merkt, dass es das falsche ist.
 *
 * Die `startsWith`-Pruefung ohne Trenner aus der Fragebogen-Route wird bewusst
 * nicht uebernommen: Sie liesse `uploads-alt/...` als `uploads/...` durch.
 *
 * Wirft bei jeder Abweichung; die Aufrufer brechen dann ab, bevor ein Byte
 * geschrieben ist.
 */
export async function zielVerzeichnisPruefen(wurzel: string, id: string): Promise<string> {
  if (!UUID_MUSTER.test(id)) {
    throw new Error("Ungueltige Verzeichnis-ID");
  }
  const verzeichnis = path.join(path.resolve(wurzel), id);
  await mkdir(verzeichnis, { recursive: true });
  const [echtesVerzeichnis, echteWurzel] = await Promise.all([
    realpath(verzeichnis),
    realpath(path.resolve(wurzel)),
  ]);
  if (echtesVerzeichnis !== path.join(echteWurzel, id)) {
    throw new Error("Zielverzeichnis ausserhalb der Wurzel");
  }
  return echtesVerzeichnis;
}

/** Ergebnis eines Loeschversuchs — drei Ausgaenge, nicht zwei. */
export type LoeschErgebnis = "geloescht" | "fehlte" | "fehler";

/** Der `code` eines Dateisystemfehlers (ENOENT, EEXIST, EXDEV …), sonst undefined. */
export function fehlerCode(fehler: unknown): string | undefined {
  return typeof fehler === "object" && fehler !== null && "code" in fehler
    ? String((fehler as { code: unknown }).code)
    : undefined;
}

/**
 * Loescht eine Datei unterhalb einer der Wurzeln und sagt ehrlich, wie es
 * ausging.
 *
 * `deleteUploadedFile` liefert bei „gab es nicht" (ENOENT) und bei jedem
 * anderen Fehler gleichermassen `false`. Wer danach eine Zeile als „geloescht"
 * markiert, luegt im zweiten Fall: Die Datei liegt noch da, und niemand
 * versucht es je wieder. Deshalb hier drei Ergebnisse:
 *
 * - `geloescht`: Die Datei war da und ist weg.
 * - `fehlte`: Es gibt sie nicht (mehr). Fuer einen Loeschlauf genauso gut wie
 *   `geloescht`; der Merker darf gesetzt werden.
 * - `fehler`: Sie liegt womoeglich noch da (Rechte, gesperrt, Pfad ausserhalb
 *   der Wurzeln). Kein Merker, der naechste Lauf versucht es erneut.
 *
 * Geprueft wird zweimal: zuerst der Pfad als Zeichenkette (ein Pfad ausserhalb
 * ist `fehler`, auch wenn es ihn gar nicht gibt), dann das VERZEICHNIS ueber
 * realpath. Geloescht wird der Eintrag in diesem aufgeloesten Verzeichnis,
 * ohne dem letzten Pfadteil zu folgen: Liegt dort ein Symlink, verschwindet
 * der Link und nicht die Datei, auf die er zeigt; zeigt dagegen ein
 * Zwischenverzeichnis nach draussen, wird gar nichts geloescht.
 *
 * Wirft nie.
 */
export async function dateiLoeschen(pfad: string, wurzeln: readonly string[]): Promise<LoeschErgebnis> {
  const ziel = path.resolve(pfad);
  // Echt UNTERHALB einer Wurzel — die Wurzel selbst ist keine Datei.
  const innerhalb = wurzeln.some((w) => {
    const wurzel = path.resolve(w);
    return ziel !== wurzel && liegtIn(wurzel, ziel);
  });
  if (!innerhalb) return "fehler";

  let verzeichnis: string;
  try {
    verzeichnis = await pfadInWurzeln(path.dirname(ziel), wurzeln);
  } catch (fehler) {
    return fehlerCode(fehler) === "ENOENT" ? "fehlte" : "fehler";
  }

  try {
    await unlink(path.join(verzeichnis, path.basename(ziel)));
    return "geloescht";
  } catch (fehler) {
    return fehlerCode(fehler) === "ENOENT" ? "fehlte" : "fehler";
  }
}

export type BodyErgebnis =
  /**
   * `Buffer<ArrayBuffer>` und nicht nur `Buffer`: Nur so nimmt ihn
   * `new Response(buffer, …)` ohne Umweg an (`BodyInit` verlangt einen
   * ArrayBuffer, keinen SharedArrayBuffer).
   */
  | { ok: true; buffer: Buffer<ArrayBuffer> }
  /** Ueber der Grenze, laut `Content-Length` oder gezaehlt. Die Route antwortet 413. */
  | { ok: false; status: 413; grund: "ZU_GROSS" }
  /** Der Datenstrom brach ab (Verbindung weg). Die Route antwortet 400. */
  | { ok: false; status: 400; grund: "ABGEBROCHEN" };

/**
 * Sagt der `Content-Length`-Kopf schon, dass der Body zu gross ist?
 *
 * Eigener Schritt, weil die Route ihn VOR der Suche nach dem Link stellt
 * (Feinplanung 4.3 Nr. 4): Eine zu grosse Anfrage soll die Datenbank gar nicht
 * erst beschaeftigen. `leseBodyBegrenzt` fragt ihn trotzdem noch einmal.
 *
 * Fehlt der Kopf oder ist er unlesbar, gilt „nicht zu gross". Ob er ueber
 * Caddy und HTTP/2 vom Handy ueberhaupt ankommt, ist nicht belegt; ein 411
 * wiese deshalb echte Uploads ab, und die gezaehlte Grenze greift ohnehin.
 */
export function contentLengthZuGross(
  request: { headers: Pick<Headers, "get"> },
  maxBytes: number,
): boolean {
  const roh = request.headers.get("content-length")?.trim();
  if (!roh || !/^\d+$/.test(roh)) return false;
  return Number(roh) > maxBytes;
}

/**
 * Liest den Body einer Anfrage, aber nie mehr als `maxBytes`.
 *
 * Warum das noetig ist: Fuer `/api/unterlagen/*` laeuft die Middleware nicht
 * (sie klonte sonst den Body und schriebe die URL samt Token ins Log). Nur mit
 * Middleware schneidet Next.js bei 10 MiB ab — ohne sie setzt es fuer
 * Route-Handler GAR keine Grenze, und ein `request.formData()` laese jede
 * Groesse in den Speicher. Die Grenze liegt deshalb hier:
 *
 * 1. `Content-Length` ueber der Grenze → sofort `ZU_GROSS`, ohne ein Byte zu
 *    lesen.
 * 2. Sonst wird der Strom gelesen und mitgezaehlt. Wer den Kopf weglaesst oder
 *    zu klein angibt, wird beim ersten Stueck ueber der Grenze gestoppt; der
 *    Strom wird dann abgebrochen (`cancel`), nicht zu Ende gelesen.
 * 3. Genau `maxBytes` Bytes sind erlaubt.
 *
 * Erst mit dem Ergebnis baut die Route
 * `new Response(buffer, { headers: { "content-type": … } }).formData()`.
 */
export async function leseBodyBegrenzt(
  request: { headers: Pick<Headers, "get">; body: ReadableStream<Uint8Array> | null },
  maxBytes: number,
): Promise<BodyErgebnis> {
  if (contentLengthZuGross(request, maxBytes)) {
    return { ok: false, status: 413, grund: "ZU_GROSS" };
  }
  if (!request.body) return { ok: true, buffer: Buffer.alloc(0) };

  const leser = request.body.getReader();
  const teile: Uint8Array[] = [];
  let gelesen = 0;
  try {
    for (;;) {
      const { done, value } = await leser.read();
      if (done) break;
      gelesen += value.byteLength;
      if (gelesen > maxBytes) {
        await leser.cancel().catch(() => undefined);
        return { ok: false, status: 413, grund: "ZU_GROSS" };
      }
      teile.push(value);
    }
  } catch {
    return { ok: false, status: 400, grund: "ABGEBROCHEN" };
  } finally {
    leser.releaseLock();
  }
  return { ok: true, buffer: Buffer.concat(teile, gelesen) };
}
