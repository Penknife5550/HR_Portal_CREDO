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

  if (!keyHex || keyHex.length < 64) {
    throw new Error(
      `FATAL: ${envName} muss als 64-stelliger Hex-String (32 Bytes) konfiguriert sein. ` +
      "Generieren Sie einen mit: openssl rand -hex 32"
    );
  }
  const buf = Buffer.from(keyHex, "hex");
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
 * Entschluesselt einen verschluesselten String (Format: "iv:authTag:ciphertext").
 * Gibt den Klartext zurück.
 */
export function decrypt(encryptedText: string, keyHex?: string): string {
  if (!encryptedText) return encryptedText;

  // Unverschluesselte Altdaten erkennen (kein Base64-Format)
  if (!encryptedText.includes(":")) {
    return encryptedText; // Legacy-Klartext zurueckgeben
  }

  const parts = encryptedText.split(":");
  if (parts.length !== 3) {
    // Koennte ein unverschluesselter Wert sein (z.B. IBAN)
    return encryptedText;
  }

  try {
    const iv = Buffer.from(parts[0], "base64");
    const authTag = Buffer.from(parts[1], "base64");
    const encrypted = Buffer.from(parts[2], "base64");

    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
      return encryptedText; // Kein gueltiges verschluesseltes Format
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, resolveKey(keyHex), iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
  } catch {
    // Wenn Entschluesselung fehlschlaegt, Legacy-Klartext zurueckgeben
    console.warn("Entschluesselung fehlgeschlagen — moeglicherweise Altdaten im Klartext");
    return encryptedText;
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

function getBemKeyHex(): string {
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
