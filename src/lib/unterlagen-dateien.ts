/**
 * CREDO HR-Portal – Unterlagen nachfordern: Dateien auf der Platte (Paket 4, nur Server)
 *
 * Alles, was eine Datei der Nachforderung anfasst, geht durch diese Datei —
 * mit EINER Regel (Feinplanung docs/module/onboarding/paket4-feinplanung.md,
 * Abschnitt 4.1): **Wurzeln je Operation, nie `uploads` als Ganzes.** Unter
 * `uploads` liegen auch die BEM-Anlagen (`uploads/bem/…`, Gesundheitsdaten mit
 * eigenem Schluessel); eine Schranke „irgendwo unter uploads" liesse einen
 * manipulierten Pfad aus der Datenbank dort hinein.
 *
 *   Lesen und Loeschen einer Paket-4-Datei   nur unter uploads/unterlagen/<nachforderungId>
 *   Ziel der Uebernahme, Loeschen der Kopie  nur unter uploads/<vorgangId>
 *
 * Die Pfade in der Datenbank sind RELATIV und tragen "/" als Trenner
 * (`uploads/unterlagen/<nf>/<dateiId>.pdf`), wie `Document.filePath` der
 * Fragebogen-Uploads. Der Speichername ist `<dateiId>.<ext>`: `dateiId` ist
 * `randomUUID()` und zugleich der Primaerschluessel der Zeile — so ist jede
 * Datei ohne Zeile als Waise erkennbar (4.5). Die Endung kommt aus dem
 * ERKANNTEN Typ, kein Teil des Originalnamens gelangt in den Pfad (4.2).
 *
 * Die Datei existiert immer an mindestens einer Stelle, auf die eine Zeile
 * zeigt (4.4): Uebernahme und Ruecknahme VERKNUEPFEN zuerst (Hardlink, sonst
 * Kopie), die Transaktion schaltet um, erst danach loescht der Aufrufer die
 * Quelle. Scheitert die Transaktion, loescht er das Ziel. Was dazwischen
 * liegen bleibt, findet der taegliche Lauf als Waise.
 *
 * Wer ruft was:
 *   Zurueckziehen, „Entfällt" (Schritt 4/6)     → entwuerfeLoeschen
 *   Hochladen, Entfernen (Schritt 5)            → entwurfSpeichern, nachforderungsDateiLoeschen
 *   Datei oeffnen, Annehmen (Schritt 6)         → nachforderungsDateiLesen, verknuepfenInVorgang
 *   Annahme zuruecknehmen (Schritt 6)           → zurueckVerknuepfen, vorgangsKopieLoeschen
 *   Taeglicher Lauf (Schritt 7)                 → nachforderungsWaisen, vorgangsWaisen,
 *                                                 verwaisteNachforderungsOrdner
 */

import { constants as fsKonstanten } from "fs";
import { copyFile, link, readdir, readFile, stat, unlink, writeFile } from "fs/promises";
import path from "path";
import {
  dateiLoeschen,
  deleteUploadedDirIfEmpty,
  ENDUNG_FUER_DATEITYP,
  pfadInWurzeln,
  sha256Hex,
  zielVerzeichnisPruefen,
  type ErkannterDateityp,
  type LoeschErgebnis,
} from "@/lib/file-upload";

/** Unterordner unter `uploads/` fuer alles, was (noch) bei einer Nachforderung liegt. */
export const UNTERLAGEN_ORDNER = "unterlagen";

/**
 * Die Form jeder ID, die hier zum Datei- oder Verzeichnisnamen wird
 * (`randomUUID()`, Prisma `uuid()`) — dieselbe wie `UUID_MUSTER` in
 * file-upload.ts (dort nicht exportiert).
 */
const UUID_TEIL = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_MUSTER = new RegExp(`^${UUID_TEIL}$`);

/**
 * `<uuid>.<ext>` — der Speichername einer Paket-4-Datei. Die Endungen kommen
 * aus `ENDUNG_FUER_DATEITYP`: Ein neuer Dateityp braucht hier keine zweite Liste.
 */
const SPEICHERNAME_MUSTER = new RegExp(
  `^(${UUID_TEIL})(${Object.values(ENDUNG_FUER_DATEITYP)
    .map((endung) => endung.replace(/[.]/g, "\\."))
    .join("|")})$`,
);

/** Warum eine Uebernahme oder Ruecknahme abbricht — der Dienst antwortet darauf mit 409. */
export type UnterlagenDateiFehlerCode = "DATEI_FEHLT" | "DATEI_VERAENDERT";

export class UnterlagenDateiFehler extends Error {
  constructor(public readonly code: UnterlagenDateiFehlerCode) {
    super(code);
    this.name = "UnterlagenDateiFehler";
  }
}

function idPruefen(id: string, was: string): void {
  if (!UUID_MUSTER.test(id)) throw new Error(`Ungueltige ${was}`);
}

function fehlerCode(fehler: unknown): string | undefined {
  return typeof fehler === "object" && fehler !== null && "code" in fehler
    ? String((fehler as { code: unknown }).code)
    : undefined;
}

/** `uploads/` im Arbeitsverzeichnis — bei jedem Aufruf neu, damit Tests `process.cwd()` umlenken koennen. */
function uploadsWurzel(): string {
  return path.join(process.cwd(), "uploads");
}

/** Die Endung (".pdf") zu einem gespeicherten Typ. Ein unbekannter Typ ist ein Fehler, keine Rueckfall-Endung. */
function endungFuer(mimeType: string): string {
  const endung = (ENDUNG_FUER_DATEITYP as Record<string, string | undefined>)[mimeType];
  if (!endung) throw new Error("Unbekannter Dateityp");
  return endung;
}

// =============================================
// Wurzeln und Pfade
// =============================================

/** Wurzel EINER Nachforderung: `uploads/unterlagen/<nachforderungId>` (absolut). */
export function nachforderungsWurzel(nachforderungId: string): string {
  idPruefen(nachforderungId, "Nachforderungs-ID");
  return path.join(uploadsWurzel(), UNTERLAGEN_ORDNER, nachforderungId);
}

/** Wurzel des Vorgangsordners: `uploads/<vorgangId>` (absolut), dieselbe Form wie die Fragebogen-Uploads. */
export function vorgangsWurzel(vorgangId: string): string {
  idPruefen(vorgangId, "Vorgangs-ID");
  return path.join(uploadsWurzel(), vorgangId);
}

/** Relativer Speicherpfad einer Datei bei der Nachforderung: `uploads/unterlagen/<nf>/<dateiId>.<ext>`. */
export function nachforderungsPfad(nachforderungId: string, dateiId: string, mimeType: string): string {
  idPruefen(nachforderungId, "Nachforderungs-ID");
  idPruefen(dateiId, "Datei-ID");
  return ["uploads", UNTERLAGEN_ORDNER, nachforderungId, `${dateiId}${endungFuer(mimeType)}`].join("/");
}

/** Relativer Pfad der uebernommenen Datei im Vorgangsordner: `uploads/<vorgangId>/<dateiId>.<ext>`. */
export function vorgangsPfad(vorgangId: string, dateiId: string, mimeType: string): string {
  idPruefen(vorgangId, "Vorgangs-ID");
  idPruefen(dateiId, "Datei-ID");
  return ["uploads", vorgangId, `${dateiId}${endungFuer(mimeType)}`].join("/");
}

/** Ein gespeicherter (relativer) Pfad als absoluter Pfad im Arbeitsverzeichnis. */
export function absoluterPfad(gespeichert: string): string {
  return path.resolve(process.cwd(), gespeichert);
}

// =============================================
// Entwuerfe (Hochladen, Entfernen, Zurueckziehen, „Entfällt")
// =============================================

/**
 * Schreibt einen Entwurf nach `uploads/unterlagen/<nf>/<dateiId>.<ext>` und
 * liefert den relativen Pfad. Das Verzeichnis prueft `zielVerzeichnisPruefen`
 * (UUID-Form, kein umgelenkter Ordner); `wx` weigert sich, eine vorhandene
 * Datei zu ueberschreiben — eine `dateiId` gibt es nur einmal.
 *
 * Reihenfolge beim Hochladen (4.3 Nr. 11): erst die Datei, dann die
 * Transaktion; scheitert diese, loescht der Aufrufer die Datei wieder.
 */
export async function entwurfSpeichern(
  buffer: Buffer,
  opts: { nachforderungId: string; dateiId: string; mimeType: ErkannterDateityp },
): Promise<string> {
  const relativ = nachforderungsPfad(opts.nachforderungId, opts.dateiId, opts.mimeType);
  const verzeichnis = await zielVerzeichnisPruefen(path.join(uploadsWurzel(), UNTERLAGEN_ORDNER), opts.nachforderungId);
  await writeFile(path.join(verzeichnis, path.posix.basename(relativ)), buffer, { flag: "wx" });
  return relativ;
}

/** Liest eine Datei der Nachforderung — nur unter ihrer eigenen Wurzel (wirft sonst oder bei ENOENT). */
export async function nachforderungsDateiLesen(speicherPfad: string, nachforderungId: string): Promise<Buffer> {
  const echt = await pfadInWurzeln(absoluterPfad(speicherPfad), [nachforderungsWurzel(nachforderungId)]);
  return readFile(echt);
}

/** Loescht eine Datei der Nachforderung — nur unter ihrer eigenen Wurzel. Drei Ergebnisse, wirft nie. */
export async function nachforderungsDateiLoeschen(
  speicherPfad: string,
  nachforderungId: string,
): Promise<LoeschErgebnis> {
  let wurzel: string;
  try {
    wurzel = nachforderungsWurzel(nachforderungId);
  } catch {
    return "fehler";
  }
  return dateiLoeschen(absoluterPfad(speicherPfad), [wurzel]);
}

export interface LoeschBilanz {
  geloescht: number;
  fehlte: number;
  fehler: number;
}

/**
 * Loescht die Dateien verworfener Entwuerfe NACH dem Commit, der ihre Zeilen
 * entfernt hat (Zurueckziehen, „Entfällt", EP-2/EP-9). Entwuerfe hat HR nie
 * gesehen, und sie werden auch nicht mehr sichtbar.
 *
 * Wirft nie. Was mit `fehler` liegen bleibt, hat keine Zeile mehr und faellt
 * dem taeglichen Lauf als Waise zu (4.5). Ist der Ordner danach leer, geht er
 * mit — liegen dort noch eingereichte Dateien, bleibt er.
 */
export async function entwuerfeLoeschen(
  nachforderungId: string,
  speicherPfade: ReadonlyArray<string | null>,
): Promise<LoeschBilanz> {
  const bilanz: LoeschBilanz = { geloescht: 0, fehlte: 0, fehler: 0 };
  for (const pfad of speicherPfade) {
    if (!pfad) continue;
    bilanz[await nachforderungsDateiLoeschen(pfad, nachforderungId)] += 1;
  }
  try {
    await deleteUploadedDirIfEmpty(nachforderungsWurzel(nachforderungId));
  } catch {
    // Ungueltige ID: dann gab es auch nichts zu loeschen.
  }
  return bilanz;
}

// =============================================
// Uebernahme und Ruecknahme (Schritt 6, Abschnitt 4.4 und 4.5)
// =============================================

async function hashVon(datei: string): Promise<string> {
  return sha256Hex(await readFile(datei));
}

/**
 * Legt `ziel` als Hardlink auf `quelle` an; auf einem anderen Volume oder ohne
 * Recht auf Hardlinks (EXDEV/EPERM) als Kopie. Gibt es das Ziel schon (ein
 * wiederholter Versuch nach einem Absturz), zaehlt es nur, wenn sein Inhalt
 * denselben SHA-256 hat — sonst DATEI_VERAENDERT, und nichts wird ueberschrieben.
 *
 * @returns true, wenn das Ziel neu angelegt wurde (nur dann darf der Aufrufer
 *   es bei einem Abbruch wieder loeschen)
 */
async function verknuepfen(quelle: string, ziel: string, sha256: string): Promise<boolean> {
  try {
    await link(quelle, ziel);
    return true;
  } catch (fehler) {
    const code = fehlerCode(fehler);
    if (code === "EEXIST") {
      if ((await hashVon(ziel)) !== sha256) throw new UnterlagenDateiFehler("DATEI_VERAENDERT");
      return false;
    }
    if (code !== "EXDEV" && code !== "EPERM") throw fehler;
  }
  await copyFile(quelle, ziel, fsKonstanten.COPYFILE_EXCL);
  if ((await hashVon(ziel)) !== sha256) {
    await unlink(ziel).catch(() => undefined);
    throw new UnterlagenDateiFehler("DATEI_VERAENDERT");
  }
  return true;
}

async function quelleLesen(quellPfad: string, wurzel: string): Promise<{ echt: string; sha256: string }> {
  let echt: string;
  try {
    echt = await pfadInWurzeln(absoluterPfad(quellPfad), [wurzel]);
  } catch (fehler) {
    if (fehlerCode(fehler) === "ENOENT") throw new UnterlagenDateiFehler("DATEI_FEHLT");
    throw fehler;
  }
  return { echt, sha256: await hashVon(echt) };
}

/**
 * Annehmen, Schritt 1 (4.4): die Datei der Nachforderung in den Vorgangsordner
 * verknuepfen — AUSSERHALB der Transaktion. Prueft vorher den SHA-256 gegen
 * die Zeile (DATEI_VERAENDERT) und liest nur unter der Wurzel der
 * Nachforderung; das Ziel liegt nur unter `uploads/<vorgangId>`.
 *
 * @returns der relative Zielpfad (`Document.filePath`) und ob das Ziel neu ist
 */
export async function verknuepfenInVorgang(opts: {
  speicherPfad: string;
  nachforderungId: string;
  vorgangId: string;
  dateiId: string;
  mimeType: string;
  sha256: string;
}): Promise<{ zielPfad: string; neu: boolean }> {
  const zielPfad = vorgangsPfad(opts.vorgangId, opts.dateiId, opts.mimeType);
  const quelle = await quelleLesen(opts.speicherPfad, nachforderungsWurzel(opts.nachforderungId));
  if (quelle.sha256 !== opts.sha256) throw new UnterlagenDateiFehler("DATEI_VERAENDERT");
  const verzeichnis = await zielVerzeichnisPruefen(uploadsWurzel(), opts.vorgangId);
  const neu = await verknuepfen(quelle.echt, path.join(verzeichnis, path.posix.basename(zielPfad)), opts.sha256);
  return { zielPfad, neu };
}

/**
 * „Annahme zurücknehmen", Schritt 1 (4.5): die Vorgangskopie zurueck nach
 * `uploads/unterlagen/<nf>/` verknuepfen. Die Quelle liegt nur unter
 * `uploads/<vorgangId>`; ihr Inhalt muss noch der angenommene sein.
 *
 * @returns der relative Pfad bei der Nachforderung (`speicherPfad`) und ob er neu ist
 */
export async function zurueckVerknuepfen(opts: {
  dokumentPfad: string;
  vorgangId: string;
  nachforderungId: string;
  dateiId: string;
  mimeType: string;
  sha256: string;
}): Promise<{ speicherPfad: string; neu: boolean }> {
  const speicherPfad = nachforderungsPfad(opts.nachforderungId, opts.dateiId, opts.mimeType);
  const quelle = await quelleLesen(opts.dokumentPfad, vorgangsWurzel(opts.vorgangId));
  if (quelle.sha256 !== opts.sha256) throw new UnterlagenDateiFehler("DATEI_VERAENDERT");
  const verzeichnis = await zielVerzeichnisPruefen(path.join(uploadsWurzel(), UNTERLAGEN_ORDNER), opts.nachforderungId);
  const neu = await verknuepfen(quelle.echt, path.join(verzeichnis, path.posix.basename(speicherPfad)), opts.sha256);
  return { speicherPfad, neu };
}

/** Loescht die Kopie im Vorgangsordner — nur unter `uploads/<vorgangId>`. Wirft nie. */
export async function vorgangsKopieLoeschen(relativ: string, vorgangId: string): Promise<LoeschErgebnis> {
  let wurzel: string;
  try {
    wurzel = vorgangsWurzel(vorgangId);
  } catch {
    return "fehler";
  }
  return dateiLoeschen(absoluterPfad(relativ), [wurzel]);
}

// =============================================
// Waisen (taeglicher Lauf, Schritt 7, Abschnitt 4.5)
// =============================================

async function eintraege(verzeichnis: string) {
  try {
    return await readdir(verzeichnis, { withFileTypes: true });
  } catch (fehler) {
    if (fehlerCode(fehler) === "ENOENT") return [];
    throw fehler;
  }
}

async function aelterAls(datei: string, grenze: number): Promise<boolean> {
  try {
    return (await stat(datei)).mtimeMs < grenze;
  } catch {
    return false;
  }
}

/**
 * Dateien unter `uploads/unterlagen/<nf>/`, auf die keine Zeile zeigt
 * (`bekanntePfade` = alle `speicherPfad` der Nachforderung) und die aelter als
 * `minAlterMs` sind. Die Frist schuetzt einen Upload, dessen Transaktion gerade
 * laeuft — oeffentliche Routen nehmen keine Prozesssperre.
 */
export async function nachforderungsWaisen(opts: {
  nachforderungId: string;
  bekanntePfade: ReadonlySet<string>;
  jetzt: Date;
  minAlterMs: number;
}): Promise<string[]> {
  const wurzel = nachforderungsWurzel(opts.nachforderungId);
  const grenze = opts.jetzt.getTime() - opts.minAlterMs;
  const waisen: string[] = [];
  for (const e of await eintraege(wurzel)) {
    if (!e.isFile()) continue;
    const relativ = ["uploads", UNTERLAGEN_ORDNER, opts.nachforderungId, e.name].join("/");
    if (opts.bekanntePfade.has(relativ)) continue;
    if (await aelterAls(path.join(wurzel, e.name), grenze)) waisen.push(relativ);
  }
  return waisen.sort();
}

/**
 * Dateien `<dateiId>.<ext>` im Vorgangsordner, deren `dateiId` zu einer Datei
 * dieser Nachforderung gehoert und auf die kein `Document.filePath` zeigt —
 * eine abgebrochene Uebernahme oder Ruecknahme. Ohne Altersgrenze: Alle
 * Schreiber dort sind HR-Aktionen unter derselben Sperre wie der Lauf. Fremde
 * Dateien (Fragebogen-Uploads) haben keine `dateiId` der Nachforderung und
 * bleiben unberuehrt.
 */
export async function vorgangsWaisen(opts: {
  vorgangId: string;
  dateiIds: ReadonlySet<string>;
  dokumentPfade: ReadonlySet<string>;
}): Promise<string[]> {
  const waisen: string[] = [];
  for (const e of await eintraege(vorgangsWurzel(opts.vorgangId))) {
    if (!e.isFile()) continue;
    const treffer = SPEICHERNAME_MUSTER.exec(e.name);
    if (!treffer || !opts.dateiIds.has(treffer[1])) continue;
    const relativ = ["uploads", opts.vorgangId, e.name].join("/");
    if (!opts.dokumentPfade.has(relativ)) waisen.push(relativ);
  }
  return waisen.sort();
}

/**
 * Ordner unter `uploads/unterlagen/` ohne Nachforderungszeile (nach einer
 * Loeschung von Hand ueber Cascade), aelter als `minAlterMs`. Liefert die IDs;
 * geloescht wird ueber `nachforderungsWaisen` mit leerer Liste bekannter Pfade.
 */
export async function verwaisteNachforderungsOrdner(opts: {
  bekannteIds: ReadonlySet<string>;
  jetzt: Date;
  minAlterMs: number;
}): Promise<string[]> {
  const wurzel = path.join(uploadsWurzel(), UNTERLAGEN_ORDNER);
  const grenze = opts.jetzt.getTime() - opts.minAlterMs;
  const ids: string[] = [];
  for (const e of await eintraege(wurzel)) {
    if (!e.isDirectory() || !UUID_MUSTER.test(e.name) || opts.bekannteIds.has(e.name)) continue;
    if (await aelterAls(path.join(wurzel, e.name), grenze)) ids.push(e.name);
  }
  return ids.sort();
}
