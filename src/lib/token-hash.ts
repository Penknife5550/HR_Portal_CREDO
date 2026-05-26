/**
 * Token-Hashing für Magic-Links
 *
 * Magic-Link-Tokens sind UUIDs (122 Bit Entropie) — kein Brute-Force-Risiko.
 * Wir speichern aber nur den SHA-256-Hash in der DB. Damit:
 *  - kann ein DB-Leak nicht direkt zur Token-Uebernahme genutzt werden
 *  - verlieren wir nichts an Funktionalitaet (Lookup über Hash-Index ist O(1))
 *  - bleibt der Klartext-Token nur in der Magic-URL und beim Empfaenger
 *
 * Kein Slow-Hash (bcrypt/argon2) noetig, da der Suchraum durch die Entropie
 * der UUID bereits ausreichend gross ist.
 */

import { createHash } from "crypto";

/**
 * Hashes a token using SHA-256 and returns it as a lowercase hex string.
 * Idempotent — derselbe Token liefert denselben Hash.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
