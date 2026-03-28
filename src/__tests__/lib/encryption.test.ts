/**
 * Tests fuer src/lib/encryption.ts
 * AES-256-GCM Verschluesselung / Entschluesselung
 */

// Encryption Key fuer Tests setzen (64 Hex-Zeichen = 32 Bytes)
process.env.ENCRYPTION_KEY =
  "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";

import { encrypt, decrypt, isEncryptionConfigured } from "@/lib/encryption";

describe("Verschluesselungsmodul (encryption.ts)", () => {
  describe("encrypt + decrypt", () => {
    it("sollte einen verschluesselten Wert korrekt entschluesseln", () => {
      const original = "DE89370400440532013000"; // IBAN
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(original);
    });

    it("sollte verschiedene Klartext-Werte korrekt verarbeiten", () => {
      const testValues = [
        "12 345678 A 123",       // Sozialversicherungsnummer
        "12345678901",           // Steuer-ID
        "Einfacher Text mit Umlauten: äöü",
        "",                      // Leerstring
      ];

      for (const val of testValues) {
        if (!val) {
          // Leere Werte werden durchgereicht
          expect(encrypt(val)).toBe(val);
          expect(decrypt(val)).toBe(val);
        } else {
          const enc = encrypt(val);
          expect(decrypt(enc)).toBe(val);
        }
      }
    });

    it("sollte einen verschluesselten Wert erzeugen, der sich vom Original unterscheidet", () => {
      const original = "DE89370400440532013000";
      const encrypted = encrypt(original);
      expect(encrypted).not.toBe(original);
    });

    it("sollte das Format iv:authTag:ciphertext verwenden", () => {
      const encrypted = encrypt("Testdaten");
      const parts = encrypted.split(":");
      expect(parts).toHaveLength(3);
      // Alle Teile sollten Base64 sein (nicht leer)
      for (const part of parts) {
        expect(part.length).toBeGreaterThan(0);
      }
    });

    it("sollte bei jedem Aufruf einen anderen Ciphertext erzeugen (zufaelliger IV)", () => {
      const original = "Gleicher Klartext";
      const enc1 = encrypt(original);
      const enc2 = encrypt(original);
      expect(enc1).not.toBe(enc2);
      // Beide muessen aber korrekt entschluesselt werden
      expect(decrypt(enc1)).toBe(original);
      expect(decrypt(enc2)).toBe(original);
    });
  });

  describe("Abwaertskompatibilitaet (Legacy-Daten)", () => {
    it("sollte unverschluesselte Werte ohne Doppelpunkt unveraendert zurueckgeben", () => {
      const legacy = "DE89370400440532013000";
      expect(decrypt(legacy)).toBe(legacy);
    });

    it("sollte Werte mit falschem Format unveraendert zurueckgeben", () => {
      const invalid = "abc:def"; // Nur 2 Teile statt 3
      expect(decrypt(invalid)).toBe(invalid);
    });

    it("sollte leere Werte durchreichen", () => {
      expect(decrypt("")).toBe("");
      expect(encrypt("")).toBe("");
    });
  });

  describe("isEncryptionConfigured", () => {
    it("sollte true zurueckgeben wenn ENCRYPTION_KEY gesetzt ist", () => {
      expect(isEncryptionConfigured()).toBe(true);
    });
  });
});
