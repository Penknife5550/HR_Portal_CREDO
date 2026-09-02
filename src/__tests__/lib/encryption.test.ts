/**
 * Tests fuer src/lib/encryption.ts
 * AES-256-GCM Verschluesselung / Entschluesselung
 */

// Encryption Key fuer Tests setzen (64 Hex-Zeichen = 32 Bytes)
process.env.ENCRYPTION_KEY =
  "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";

import {
  encrypt,
  decrypt,
  isEncryptionConfigured,
  EntschluesselungFehlgeschlagen,
} from "@/lib/encryption";

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

/**
 * Verhalten bei falschem Schluessel.
 *
 * Frueher gab decrypt() in diesem Fall still das Chiffrat zurueck, als waere es
 * Klartext. Das ist die gefaehrlichste der moeglichen Antworten: Die
 * Zeichenkette landet in PDF-Export, E-Mail und Akte, und wer das Formular
 * danach speichert, verschluesselt den Buchstabensalat erneut -- der
 * urspruengliche Wert ist dann endgueltig weg, auch wenn der richtige
 * Schluessel spaeter wieder auftaucht.
 */
describe("decrypt — falscher Schluessel scheitert laut", () => {
  const ANDERER_KEY =
    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("wirft, statt das Chiffrat als Klartext auszugeben", () => {
    const chiffrat = encrypt("DE89370400440532013000");
    expect(() => decrypt(chiffrat, ANDERER_KEY)).toThrow(
      EntschluesselungFehlgeschlagen
    );
  });

  it("gibt unter keinen Umstaenden den Umschlag zurueck", () => {
    // Der eigentliche Regressionstest: frueher war genau das das Ergebnis.
    const chiffrat = encrypt("12 345678 A 901");
    let ergebnis: string | null = null;
    try {
      ergebnis = decrypt(chiffrat, ANDERER_KEY);
    } catch {
      ergebnis = null;
    }
    expect(ergebnis).toBeNull();
  });

  it("wirft auch, wenn der Auth-Tag manipuliert wurde", () => {
    // GCM erkennt Veraenderungen am Chiffrat. Genau dafuer ist der Tag da.
    const [iv, , daten] = encrypt("Steuer-ID 12345678901").split(":");
    const falscherTag = Buffer.alloc(16, 7).toString("base64");
    expect(() => decrypt(`${iv}:${falscherTag}:${daten}`)).toThrow(
      EntschluesselungFehlgeschlagen
    );
  });

  it("nennt im Fehlertext die zu pruefenden Schluessel", () => {
    const chiffrat = encrypt("test");
    expect(() => decrypt(chiffrat, ANDERER_KEY)).toThrow(/ENCRYPTION_KEY/);
  });

  it("schreibt den betroffenen Wert nicht ins Log", () => {
    // Der Wert ist personenbezogen — er gehoert nicht in die Container-Logs.
    const geheim = "DE89370400440532013000";
    const chiffrat = encrypt(geheim);
    try {
      decrypt(chiffrat, ANDERER_KEY);
    } catch {
      /* erwartet */
    }
    const ausgaben = (console.error as jest.Mock).mock.calls.flat().join(" ");
    expect(ausgaben).not.toContain(geheim);
    expect(ausgaben).not.toContain(chiffrat);
  });
});

describe("decrypt — Altdaten bleiben Altdaten", () => {
  it("laesst Werte durch, die nur zufaellig Doppelpunkte enthalten", () => {
    // Drei Teile, aber keine gueltigen IV-/Tag-Laengen: kein Umschlag.
    for (const wert of ["a:b:c", "Notiz: wichtig: sehr", "12:34:56"]) {
      expect(decrypt(wert)).toBe(wert);
    }
  });

  it("wirft nicht bei einem Umschlag mit leerem Chiffrat-Teil", () => {
    const iv = Buffer.alloc(16, 1).toString("base64");
    const tag = Buffer.alloc(16, 2).toString("base64");
    expect(decrypt(`${iv}:${tag}:`)).toBe(`${iv}:${tag}:`);
  });
});

describe("Schluesselpruefung", () => {
  it("lehnt einen Schluessel mit Nicht-Hex-Zeichen ab", () => {
    // Buffer.from(..., "hex") hoert beim ersten ungueltigen Zeichen auf und
    // liefert einen zu kurzen Puffer. Ohne Formatpruefung kaeme ein Tippfehler
    // durch den Start und scheiterte erst beim ersten Speichern.
    const mitTippfehler = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5dZ";
    expect(mitTippfehler).toHaveLength(64);
    expect(() => encrypt("x", mitTippfehler)).toThrow(/64 Hex-Zeichen/);
  });

  it("lehnt einen zu kurzen und einen zu langen Schluessel ab", () => {
    expect(() => encrypt("x", "abcd")).toThrow(/64 Hex-Zeichen/);
    expect(() => encrypt("x", "a".repeat(128))).toThrow(/64 Hex-Zeichen/);
  });
});
