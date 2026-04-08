/**
 * Tests fuer src/lib/file-upload.ts
 *
 * Fokus: Magic-Bytes-Validierung (insb. WebP-Bug), sanitizeFilename,
 * saveUploadedFile Path-Traversal-Schutz.
 */

import {
  validateMagicBytes,
  sanitizeFilename,
  saveUploadedFile,
} from "@/lib/file-upload";
import { rm } from "fs/promises";
import path from "path";

describe("validateMagicBytes", () => {
  it("PDF mit %PDF Header → ok", () => {
    const buf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    expect(validateMagicBytes(buf, "application/pdf")).toBe(true);
  });

  it("JPEG FF D8 FF → ok", () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(validateMagicBytes(buf, "image/jpeg")).toBe(true);
  });

  it("PNG 89 50 4E 47 → ok", () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    expect(validateMagicBytes(buf, "image/png")).toBe(true);
  });

  it("WebP mit RIFF + WEBP → ok", () => {
    // RIFF (4) + size (4) + WEBP (4)
    const buf = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00, // size
      0x57, 0x45, 0x42, 0x50, // WEBP
    ]);
    expect(validateMagicBytes(buf, "image/webp")).toBe(true);
  });

  it("WebP nur RIFF (AVI/WAV-Header) → false", () => {
    // RIFF + size + AVI (statt WEBP) — deckt den behobenen Bug
    const aviLike = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00, // size
      0x41, 0x56, 0x49, 0x20, // "AVI " — NICHT WebP
    ]);
    expect(validateMagicBytes(aviLike, "image/webp")).toBe(false);

    const wavLike = Buffer.from([
      0x52, 0x49, 0x46, 0x46,
      0x00, 0x00, 0x00, 0x00,
      0x57, 0x41, 0x56, 0x45, // "WAVE"
    ]);
    expect(validateMagicBytes(wavLike, "image/webp")).toBe(false);
  });

  it("Leerer Buffer → false", () => {
    expect(validateMagicBytes(Buffer.alloc(0), "application/pdf")).toBe(false);
    expect(validateMagicBytes(Buffer.alloc(0), "image/webp")).toBe(false);
  });

  it("Buffer kuerzer als Signatur → false", () => {
    expect(validateMagicBytes(Buffer.from([0x25, 0x50]), "application/pdf")).toBe(
      false,
    );
    expect(validateMagicBytes(Buffer.from([0x52, 0x49, 0x46]), "image/webp")).toBe(
      false,
    );
  });

  it("unbekannter MIME → false", () => {
    expect(
      validateMagicBytes(Buffer.from([0x00]), "application/octet-stream"),
    ).toBe(false);
  });

  it("PDF-Header in JPEG-MIME → false (Mismatch)", () => {
    const pdfBuf = Buffer.from([0x25, 0x50, 0x44, 0x46]);
    expect(validateMagicBytes(pdfBuf, "image/jpeg")).toBe(false);
  });
});

describe("sanitizeFilename", () => {
  it("ersetzt Sonderzeichen durch Unterstrich", () => {
    const result = sanitizeFilename("foo bar.pdf");
    expect(result).toMatch(/^\d+-[0-9a-f]{8}-foo_bar\.pdf$/);
  });

  it("entfernt Slashes (Path-Traversal-Zeichen)", () => {
    // Punkte sind erlaubt — die Path-Traversal-Pruefung erfolgt in
    // saveUploadedFile (siehe separate Tests). Hier nur sicherstellen,
    // dass mindestens Slashes weg sind.
    const result = sanitizeFilename("../etc/passwd");
    expect(result).not.toContain("/");
  });

  it("trimmt auf 100 Zeichen", () => {
    const long = "a".repeat(200) + ".pdf";
    const result = sanitizeFilename(long);
    // Anteil des Originalnamens darf max 100 sein
    const parts = result.split("-");
    const cleanedPart = parts.slice(2).join("-");
    expect(cleanedPart.length).toBeLessThanOrEqual(100);
  });

  it("Unicode wird zu Unterstrich", () => {
    const result = sanitizeFilename("muenchen-aeoeue.pdf");
    expect(result).toMatch(/muenchen-aeoeue\.pdf$/);
    const result2 = sanitizeFilename("\u00FCmlaut.pdf");
    expect(result2).toContain("_mlaut.pdf");
  });

  it("Timestamp + UUID-Suffix vorhanden", () => {
    const r1 = sanitizeFilename("test.pdf");
    const r2 = sanitizeFilename("test.pdf");
    // Suffix verhindert Kollision
    expect(r1).not.toBe(r2);
  });
});

describe("saveUploadedFile Path-Traversal-Schutz", () => {
  const TEST_SUBDIR = "elternzeit/test-saveupload";

  afterAll(async () => {
    const testDir = path.join(process.cwd(), "uploads", "elternzeit/test-saveupload");
    await rm(testDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it("subdir mit '..' → throws", async () => {
    await expect(
      saveUploadedFile(Buffer.from("x"), "../etc", "a.txt"),
    ).rejects.toThrow();
  });

  it("filename mit '..' → throws", async () => {
    await expect(
      saveUploadedFile(Buffer.from("x"), TEST_SUBDIR, "../passwd"),
    ).rejects.toThrow();
  });

  it("filename mit Slash → throws", async () => {
    await expect(
      saveUploadedFile(Buffer.from("x"), TEST_SUBDIR, "a/b.pdf"),
    ).rejects.toThrow();
  });

  it("gueltiger Pfad → speichert Datei", async () => {
    const fp = await saveUploadedFile(
      Buffer.from("hello"),
      TEST_SUBDIR,
      "valid.txt",
    );
    expect(fp).toContain("uploads");
    expect(fp).toContain("valid.txt");
  });
});
