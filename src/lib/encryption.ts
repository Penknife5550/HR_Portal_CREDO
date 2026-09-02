/**
 * CREDO HR-Portal – Verschluesselung sensibler Personaldaten
 *
 * AES-256-GCM Verschluesselung für:
 * - IBAN (Bankverbindung)
 * - Sozialversicherungsnummer
 * - Steuer-Identifikationsnummer
 *
 * DSGVO Art. 32: Angemessene technische Maßnahmen zum Schutz
 * personenbezogener Daten (Application-Level Encryption).
 *
 * Schluesselgenerierung: openssl rand -hex 32
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// Lazy-Init: Key wird erst beim ersten Aufruf validiert.
// Cache pro Hex-Schluessel, damit mehrere Schluessel (z.B. BEM) nebeneinander
// funktionieren, ohne bei jedem Aufruf neu zu parsen.
const _keyCache = new Map<string, Buffer>();

/**
 * Validiert einen 64-stelligen Hex-Schluessel und gibt ihn als Buffer zurueck
 * (gecached). Wirft, wenn das Format nicht stimmt.
 */
function parseKey(keyHex: string, envName: string): Buffer {
  const cached = _keyCache.get(keyHex);
  if (cached) return cached;

  // Genau 64 Hex-Zeichen — nicht nur "mindestens 64 Zeichen".
  //
  // Buffer.from(wert, "hex") ist nachsichtig: Es hoert beim ersten
  // Nicht-Hex-Zeichen auf und liefert einen zu kurzen Puffer. Ein Schluessel
  // mit einem Tippfehler an Stelle 10 kam damit durch die Startpruefung und
  // scheiterte erst bei der ersten Verschluesselung — also mitten in einem
  // Vorgang, wenn jemand seine Bankverbindung speichert, statt beim Hochfahren.
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex ?? "")) {
    throw new Error(
      `FATAL: ${envName} muss aus genau 64 Hex-Zeichen bestehen (32 Bytes). ` +
      "Generieren Sie einen mit: openssl rand -hex 32"
    );
  }
  const buf = Buffer.from(keyHex, "hex");
  if (buf.length !== 32) {
    throw new Error(
      `FATAL: ${envName} ergibt ${buf.length} statt 32 Bytes.`
    );
  }
  _keyCache.set(keyHex, buf);
  return buf;
}

function getEncryptionKey(): Buffer {
  return parseKey(process.env.ENCRYPTION_KEY ?? "", "ENCRYPTION_KEY");
}

/**
 * Loest den zu verwendenden Schluessel auf:
 * - explizit uebergebener Hex-Key (z.B. BEM_ENCRYPTION_KEY) hat Vorrang,
 * - sonst der globale ENCRYPTION_KEY.
 */
function resolveKey(keyHex?: string): Buffer {
  if (keyHex) return parseKey(keyHex, "BEM_ENCRYPTION_KEY");
  return getEncryptionKey();
}

/**
 * Verschluesselt einen Klartext-String mit AES-256-GCM.
 * Gibt einen String im Format "iv:authTag:ciphertext" (Base64) zurück.
 */
export function encrypt(plaintext: string, keyHex?: string): string {
  if (!plaintext) return plaintext;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, resolveKey(keyHex), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (alles Base64)
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

/**
 * Fehler beim Entschluesseln eines Werts, der unser Format hat.
 *
 * Eigene Klasse, damit ein Aufrufer, der es wirklich abfangen will, ihn von
 * einem beliebigen anderen Fehler unterscheiden kann.
 */
export class EntschluesselungFehlgeschlagen extends Error {
  constructor(ursache?: unknown) {
    super(
      "Ein verschluesselter Wert liess sich nicht entschluesseln. " +
        "Das deutet auf einen falschen oder gewechselten Schluessel hin " +
        "(ENCRYPTION_KEY bzw. BEM_ENCRYPTION_KEY) oder auf beschaedigte Daten. " +
        "Ursache: " +
        (ursache instanceof Error ? ursache.message : String(ursache)),
    );
    this.name = "EntschluesselungFehlgeschlagen";
  }
}

/**
 * Traegt dieser Wert unseren Umschlag "iv:authTag:ciphertext"?
 *
 * Das ist die Trennlinie zwischen den beiden Faellen, die frueher vermengt
 * waren: unverschluesselte Altdaten einerseits, ein kaputter Schluessel
 * andererseits. Geprueft werden genau drei Teile und die festen Laengen von IV
 * und Auth-Tag — ein Klartextwert trifft das praktisch nie, die betroffenen
 * Felder (IBAN, Sozialversicherungsnummer, Steuer-ID) enthalten ohnehin keine
 * Doppelpunkte.
 */
function istUmschlag(text: string): boolean {
  const teile = text.split(":");
  if (teile.length !== 3) return false;
  if (teile[2].length === 0) return false;
  try {
    return (
      Buffer.from(teile[0], "base64").length === IV_LENGTH &&
      Buffer.from(teile[1], "base64").length === AUTH_TAG_LENGTH
    );
  } catch {
    return false;
  }
}

/**
 * Entschluesselt einen Wert im Format "iv:authTag:ciphertext".
 *
 * Werte ohne diesen Umschlag gelten als unverschluesselte Altdaten und werden
 * unveraendert zurueckgegeben — dieses Verhalten bleibt.
 *
 * **Was sich geaendert hat:** Scheitert die Entschluesselung eines Werts, der
 * den Umschlag TRAEGT, wirft die Funktion. Frueher gab sie in diesem Fall
 * still das Chiffrat zurueck, als waere es Klartext. Das ist die
 * gefaehrlichste Antwort, die hier moeglich ist:
 *
 * - Der GCM-Auth-Tag ist die Echtheitspruefung. Sein Fehlschlag bedeutet
 *   falscher Schluessel oder veraenderte Daten — nie "das war schon immer
 *   Klartext".
 * - Die Zeichenkette `iv:authTag:ciphertext` waere in PDF-Export, E-Mail und
 *   Akte gelandet, sichtbar als Buchstabensalat im Feld "IBAN".
 * - Schlimmer: Speichert jemand das Formular danach, wird der Buchstabensalat
 *   erneut verschluesselt. Der urspruengliche Wert ist dann endgueltig weg,
 *   auch wenn der richtige Schluessel spaeter wieder auftaucht.
 *
 * Ein falscher Schluessel betrifft immer alle Datensaetze auf einmal, nie
 * einen einzelnen. Laut zu scheitern macht daraus einen Betriebsfehler, den
 * jemand bemerkt und behebt, statt eines stillen Datenverlusts.
 */
export function decrypt(encryptedText: string, keyHex?: string): string {
  if (!encryptedText) return encryptedText;

  // Unverschluesselte Altdaten: unveraendert durchreichen.
  if (!istUmschlag(encryptedText)) return encryptedText;

  const [ivB64, tagB64, dataB64] = encryptedText.split(":");
  try {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      resolveKey(keyHex),
      Buffer.from(ivB64, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return (
      decipher.update(Buffer.from(dataB64, "base64")).toString("utf8") +
      decipher.final("utf8")
    );
  } catch (fehler) {
    // Bewusst ohne den Wert selbst im Log — er ist personenbezogen.
    console.error(
      "[encryption] Entschluesselung fehlgeschlagen. Schluessel pruefen (ENCRYPTION_KEY / BEM_ENCRYPTION_KEY).",
    );
    throw new EntschluesselungFehlgeschlagen(fehler);
  }
}

/**
 * Prüft ob der ENCRYPTION_KEY konfiguriert ist.
 * Nützlich für Startup-Checks.
 */
export function isEncryptionConfigured(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

// =============================================
// BEM — separater Schluessel (BEM_ENCRYPTION_KEY)
// Gesundheitsbezogene BEM-Freitexte (Gespraechsnotizen, Massnahmen) werden mit
// einem eigenen Schluessel ver-/entschluesselt, damit eine Rotation unabhaengig
// von der Personalakte moeglich ist (DSGVO Art. 32 / besonders sensible Daten).
// =============================================

export function getBemKeyHex(): string {
  const key = process.env.BEM_ENCRYPTION_KEY;
  if (!key || key.length < 64) {
    throw new Error(
      "FATAL: BEM_ENCRYPTION_KEY muss als 64-stelliger Hex-String (32 Bytes) konfiguriert sein. " +
      "Generieren Sie einen mit: openssl rand -hex 32"
    );
  }
  return key;
}

/** Verschluesselt einen BEM-Freitext mit dem BEM_ENCRYPTION_KEY. */
export function encryptBem(plaintext: string): string {
  return encrypt(plaintext, getBemKeyHex());
}

/** Entschluesselt einen BEM-Freitext mit dem BEM_ENCRYPTION_KEY. */
export function decryptBem(encryptedText: string): string {
  return decrypt(encryptedText, getBemKeyHex());
}

/** Prueft ob der BEM_ENCRYPTION_KEY konfiguriert ist (Startup-Check). */
export function isBemEncryptionConfigured(): boolean {
  try {
    getBemKeyHex();
    return true;
  } catch {
    return false;
  }
}
