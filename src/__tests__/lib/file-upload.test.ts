/**
 * Tests fuer src/lib/file-upload.ts
 *
 * Fokus: Magic-Bytes-Validierung (insb. WebP-Bug), sanitizeFilename,
 * asciiFilename, sha256Hex, saveUploadedFile Path-Traversal-Schutz.
 *
 * Dazu (Paket 4, Feinplanung Abschnitt 4 und 13) die Werkzeuge fuer die
 * oeffentliche Upload-Seite: Typ allein aus den Bytes, PDF-Merkmale,
 * Anzeigename, die Pfadschranken und das Loeschen mit drei Ergebnissen, der
 * begrenzt gelesene Body. Die Pfadtests laufen gegen ein echtes
 * Verzeichnis unter os.tmpdir() — Symlinks und Junctions laesst sich nur dort
 * glaubhaft belegen, dass realpath sie aufloest.
 */

import {
  validateMagicBytes,
  validateUpload,
  sanitizeFilename,
  asciiFilename,
  sha256Hex,
  saveUploadedFile,
  erkenneDateityp,
  pdfMerkmale,
  anzeigeNameBereinigen,
  ANZEIGENAME_MAX_ZEICHEN,
  pfadInWurzeln,
  zielVerzeichnisPruefen,
  dateiLoeschen,
  contentLengthZuGross,
  leseBodyBegrenzt,
} from "@/lib/file-upload";
import { createHash } from "crypto";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "fs/promises";
import os from "os";
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

describe("asciiFilename", () => {
  it("entfernt jedes Zeichen ausserhalb von ASCII, Endung bleibt", () => {
    // Der Content-Disposition-Header vertraegt kein Zeichen ausserhalb von
    // ISO-8859-1 — bleibt hier eines stehen, verstuemmeln Browser den Namen
    // oder brechen den Download ab.
    const result = asciiFilename(
      "Vertragsverlängerung für Lehrkräfte.docx",
    );
    expect(result).toMatch(/^[\x00-\x7F]*$/);
    expect(result.endsWith(".docx")).toBe(true);
  });

  it("macht Leerzeichen und Slashes zu Unterstrichen", () => {
    expect(asciiFilename("a b/c")).toBe("a_b_c");
  });

  it("fasst aufeinanderfolgende Unterstriche NICHT zusammen", () => {
    // Die Abgrenzung gegen slugify (brief-vorlagen/[id]/generate) und slug
    // (bem/dokumente/generieren), die genau das tun. Wer diese Erwartung
    // reissen sieht, hat die drei Funktionen zusammengelegt, obwohl sie bei
    // Anfuehrungszeichen verschiedene Dateinamen erzeugen.
    expect(asciiFilename('x "y"')).toBe("x__y_");
  });

  it("laesst Buchstaben, Ziffern, Bindestrich, Punkt und Unterstrich stehen", () => {
    expect(asciiFilename("Anlage-2_final.v3.pdf")).toBe("Anlage-2_final.v3.pdf");
  });
});

describe("sha256Hex", () => {
  it("liefert den bekannten Vektor fuer den leeren Buffer", () => {
    expect(sha256Hex(Buffer.from(""))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("liefert 64 Zeichen Kleinbuchstaben-Hex", () => {
    // Kodierung ist Teil des Vertrags: Die Hashes stehen als Nachweis in der
    // Datenbank (BEM-Papiereinwilligung, Dokumentenpaket-Versand). Ein Wechsel
    // auf base64 oder Grossbuchstaben wuerde Bestandsdaten von neuen trennen,
    // ohne dass irgendetwas fehlschlaegt.
    const hash = sha256Hex(Buffer.from("beliebiger Inhalt"));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ist deterministisch und bitgleich zum direkten createHash", () => {
    // Der Beleg, dass die umgestellten Nachweis-Hashes weiterhin exakt das
    // liefern, was die Bestandsdaten enthalten.
    const buffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    const direkt = createHash("sha256").update(buffer).digest("hex");
    expect(sha256Hex(buffer)).toBe(direkt);
    expect(sha256Hex(buffer)).toBe(sha256Hex(Buffer.from(buffer)));
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

// =============================================
// Paket 4: Typ aus den Bytes
// =============================================

const PDF_KOPF = "%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
const PDF_FUSS = "trailer\n<< /Root 1 0 R >>\nstartxref\n0\n%%EOF\n";
const pdf = (mitte = "") => Buffer.from(PDF_KOPF + mitte + PDF_FUSS, "latin1");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const WEBP = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
]);

describe("erkenneDateityp", () => {
  it("erkennt PDF, JPEG, PNG und WebP mit Endung", () => {
    expect(erkenneDateityp(pdf())).toEqual({ ok: true, mimeType: "application/pdf", endung: ".pdf" });
    expect(erkenneDateityp(JPEG)).toEqual({ ok: true, mimeType: "image/jpeg", endung: ".jpg" });
    expect(erkenneDateityp(PNG)).toEqual({ ok: true, mimeType: "image/png", endung: ".png" });
    expect(erkenneDateityp(WEBP)).toEqual({ ok: true, mimeType: "image/webp", endung: ".webp" });
  });

  it("file.type zaehlt nicht: ein JPEG, das sich als PDF ausgibt, bleibt ein JPEG", async () => {
    // validateUpload glaubt file.type und prueft nur, ob die Bytes dazu passen
    // — die Luecke, derentwegen es diese Funktion gibt.
    const falsch = new File([JPEG], "x.pdf", { type: "application/pdf" });
    const bytes = Buffer.from(await falsch.arrayBuffer());
    expect(erkenneDateityp(bytes)).toMatchObject({ ok: true, mimeType: "image/jpeg", endung: ".jpg" });

    // Umgekehrt: Text mit erlaubtem file.type ist trotzdem kein Upload.
    const text = new File(["<html><script>alert(1)</script>"], "x.png", { type: "image/png" });
    const textBytes = Buffer.from(await text.arrayBuffer());
    expect(erkenneDateityp(textBytes)).toEqual({ ok: false, status: 415, grund: "TYP_NICHT_ERLAUBT" });
    expect((await validateUpload(text)).ok).toBe(false);
  });

  it("WebP nicht nur ueber RIFF: AVI und WAV sind kein Bild", () => {
    const avi = Buffer.from(WEBP);
    avi.write("AVI ", 8, "latin1");
    const wav = Buffer.from(WEBP);
    wav.write("WAVE", 8, "latin1");
    expect(erkenneDateityp(avi)).toMatchObject({ ok: false, status: 415 });
    expect(erkenneDateityp(wav)).toMatchObject({ ok: false, status: 415 });
    expect(erkenneDateityp(Buffer.from("RIFF", "latin1"))).toMatchObject({ ok: false, status: 415 });
  });

  it("PNG nur mit der vollen 8-Byte-Signatur", () => {
    const halb = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00]);
    expect(erkenneDateityp(halb)).toMatchObject({ ok: false, status: 415 });
  });

  it("PDF ohne %%EOF ist unvollstaendig (400), nicht der falsche Typ (415)", () => {
    const abgeschnitten = Buffer.from(PDF_KOPF + "stream\n" + "x".repeat(500), "latin1");
    expect(erkenneDateityp(abgeschnitten)).toEqual({
      ok: false,
      status: 400,
      grund: "PDF_UNVOLLSTAENDIG",
    });
  });

  it("%%EOF zaehlt nur in den letzten 1024 Bytes", () => {
    const frueh = Buffer.from(PDF_KOPF + "%%EOF\n" + "x".repeat(2000), "latin1");
    expect(erkenneDateityp(frueh)).toMatchObject({ ok: false, status: 400 });
    const knapp = Buffer.from(PDF_KOPF + "x".repeat(2000) + "%%EOF" + "\n".repeat(1019), "latin1");
    expect(erkenneDateityp(knapp)).toMatchObject({ ok: true, mimeType: "application/pdf" });
  });

  it("alles andere ist 415 — auch leer, DOCX und das nackte %PDF ohne Bindestrich", () => {
    expect(erkenneDateityp(Buffer.alloc(0))).toMatchObject({ ok: false, status: 415 });
    expect(erkenneDateityp(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14]))).toMatchObject({ ok: false, status: 415 });
    expect(erkenneDateityp(Buffer.from("%PDF1.7 ... %%EOF", "latin1"))).toMatchObject({ ok: false, status: 415 });
  });
});

describe("pdfMerkmale", () => {
  it("meldet nichts bei einem schlichten PDF", () => {
    expect(pdfMerkmale(pdf())).toEqual([]);
  });

  it("/Encrypt heisst kennwortgeschuetzt", () => {
    expect(pdfMerkmale(pdf("<< /Encrypt 5 0 R >>\n"))).toEqual(["VERSCHLUESSELT"]);
  });

  it.each(["JavaScript", "JS", "Launch", "EmbeddedFile", "OpenAction", "AA", "XFA"])(
    "/%s heisst aktive Inhalte",
    (name) => {
      expect(pdfMerkmale(pdf(`<< /${name} 7 0 R >>\n`))).toEqual(["AKTIVE_INHALTE"]);
    },
  );

  it("loest #xx-Maskierungen auf, bevor verglichen wird", () => {
    // /J#61vaScript = /JavaScript, /J#53 = /JS, /#45ncrypt = /Encrypt
    expect(pdfMerkmale(pdf("<< /S /J#61vaScript >>\n"))).toEqual(["AKTIVE_INHALTE"]);
    expect(pdfMerkmale(pdf("<< /J#53 (app.alert(1)) >>\n"))).toEqual(["AKTIVE_INHALTE"]);
    expect(pdfMerkmale(pdf("<< /#45ncrypt 5 0 R >>\n"))).toEqual(["VERSCHLUESSELT"]);
    expect(pdfMerkmale(pdf("<< /#4F#70#65#6E#41#63#74#69#6F#6E 3 0 R >>\n"))).toEqual(["AKTIVE_INHALTE"]);
  });

  it("NUL beendet einen Namen wie jedes andere PDF-Leerzeichen (7.2.2, Tabelle 1)", () => {
    // JavaScripts \s kennt NUL nicht; ohne eigene Regel hiesse der Name
    // „JavaScript\0" und der Hinweis fiele still aus.
    expect(pdfMerkmale(pdf("<< /S /JavaScript\u0000>>\n"))).toEqual(["AKTIVE_INHALTE"]);
    expect(pdfMerkmale(pdf("<< /JS\u0000(app.alert(1)) >>\n"))).toEqual(["AKTIVE_INHALTE"]);
    expect(pdfMerkmale(pdf("<< /OpenAction\u00003 0 R >>\n"))).toEqual(["AKTIVE_INHALTE"]);
    expect(pdfMerkmale(pdf("trailer << /Encrypt\u00005 0 R >>\n"))).toEqual(["VERSCHLUESSELT"]);
    // Ganze Namen bleiben ganze Namen: /JSMincho<NUL> ist weiterhin kein /JS.
    expect(pdfMerkmale(pdf("<< /BaseFont /JSMincho\u0000>>\n"))).toEqual([]);
  });

  it("vergleicht ganze Namen: ein Schriftname wie /JSMincho ist kein /JS", () => {
    expect(pdfMerkmale(pdf("<< /BaseFont /JSMincho /Name /AAA >>\n"))).toEqual([]);
  });

  it("liefert beide Merker in fester Reihenfolge", () => {
    expect(pdfMerkmale(pdf("<< /OpenAction 3 0 R >>\n<< /Encrypt 5 0 R >>\n"))).toEqual([
      "VERSCHLUESSELT",
      "AKTIVE_INHALTE",
    ]);
  });
});

// =============================================
// Paket 4: Anzeigename
// =============================================

describe("anzeigeNameBereinigen", () => {
  it("die Endung kommt aus dem erkannten Typ, nie aus dem Original", () => {
    expect(anzeigeNameBereinigen("x.hta", "image/jpeg")).toBe("x.jpg");
    expect(anzeigeNameBereinigen("x.pdf.html", "application/pdf")).toBe("x.pdf");
    expect(anzeigeNameBereinigen("x.", "application/pdf")).toBe("x.pdf");
    expect(anzeigeNameBereinigen("Scan.PDF", "application/pdf")).toBe("Scan.pdf");
    expect(anzeigeNameBereinigen("Foto.jpeg", "image/jpeg")).toBe("Foto.jpg");
    expect(anzeigeNameBereinigen("Foto.jpeg.exe", "image/jpeg")).toBe("Foto.jpg");
    expect(anzeigeNameBereinigen("Karte", "image/png")).toBe("Karte.png");
    expect(anzeigeNameBereinigen("Bild.png", "image/webp")).toBe("Bild.webp");
  });

  it("ein leerer Name wird „Datei“ plus Endung", () => {
    expect(anzeigeNameBereinigen("", "image/png")).toBe("Datei.png");
    expect(anzeigeNameBereinigen(".pdf", "application/pdf")).toBe("Datei.pdf");
    expect(anzeigeNameBereinigen("   ", "application/pdf")).toBe("Datei.pdf");
    expect(anzeigeNameBereinigen("\u202E\u0000", "image/jpeg")).toBe("Datei.jpg");
  });

  it("entfernt Bidi-Zeichen: „rechnung<RLO>fdp.exe“ sieht nicht mehr wie ein PDF aus", () => {
    const name = anzeigeNameBereinigen("rechnung\u202Efdp.exe", "application/pdf");
    expect(name).toBe("rechnungfdp.pdf");
    for (const bidi of ["\u200E", "\u200F", "\u202A", "\u202B", "\u202C", "\u202D", "\u2066", "\u2067", "\u2068", "\u2069", "\u061C"]) {
      expect(anzeigeNameBereinigen(`a${bidi}b.pdf`, "application/pdf")).toBe("ab.pdf");
    }
  });

  it("der Quelltext nennt die Bidi-Zeichen nur als Escape, nie woertlich", async () => {
    // Woertlich im Quelltext waeren sie unsichtbar und verschoeben die Anzeige
    // des Codes selbst („Trojan Source") — ausgerechnet in der Liste, die genau
    // davor schuetzen soll.
    const quelltext = await readFile(path.join(process.cwd(), "src", "lib", "file-upload.ts"), "utf8");
    expect(quelltext).not.toMatch(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/);
  });

  it("entfernt Steuerzeichen", () => {
    expect(anzeigeNameBereinigen("a\u0000b\u001Fc\u007Fd\u0085e.pdf", "application/pdf")).toBe("abcde.pdf");
    expect(anzeigeNameBereinigen("zeile\r\nzwei.pdf", "application/pdf")).toBe("zeilezwei.pdf");
  });

  it("nimmt nur den Basisnamen, unter Windows wie unter Linux", () => {
    expect(anzeigeNameBereinigen("../../etc/passwd", "image/jpeg")).toBe("passwd.jpg");
    expect(anzeigeNameBereinigen("C:\\Users\\x\\Scan.pdf", "application/pdf")).toBe("Scan.pdf");
  });

  it("normalisiert nach NFC und laesst Umlaute stehen", () => {
    const zerlegt = "Mu\u0308ller Zeugnis.pdf";
    expect(anzeigeNameBereinigen(zerlegt, "application/pdf")).toBe("M\u00fcller Zeugnis.pdf");
    expect(anzeigeNameBereinigen("Führungszeugnis Köln.pdf", "application/pdf")).toBe(
      "Führungszeugnis Köln.pdf",
    );
  });

  it("kuerzt auf 150 Zeichen samt Endung, ohne ein Zeichen zu zerteilen", () => {
    const lang = anzeigeNameBereinigen("a".repeat(300) + ".pdf", "application/pdf");
    expect(lang).toHaveLength(ANZEIGENAME_MAX_ZEICHEN);
    expect(lang.endsWith(".pdf")).toBe(true);

    const emoji = anzeigeNameBereinigen("\u{1F600}".repeat(200) + ".png", "image/png");
    expect(Array.from(emoji)).toHaveLength(ANZEIGENAME_MAX_ZEICHEN);
    expect(emoji.endsWith(".png")).toBe(true);
    // Kein halbes Surrogatpaar: encodeURIComponent wirft bei einem.
    expect(() => encodeURIComponent(emoji)).not.toThrow();
  });
});

// =============================================
// Paket 4: Pfadschranken und Loeschen (echtes Dateisystem)
// =============================================

describe("Pfadschranken", () => {
  let basis: string;
  let wurzel: string;
  let draussen: string;

  beforeAll(async () => {
    basis = await mkdtemp(path.join(os.tmpdir(), "p4-pfade-"));
    wurzel = path.join(basis, "uploads", "unterlagen");
    draussen = path.join(basis, "draussen");
    await mkdir(wurzel, { recursive: true });
    await mkdir(draussen, { recursive: true });
    await writeFile(path.join(draussen, "geheim.txt"), "geheim");
    // Eine Junction (Windows) bzw. ein Symlink (Linux) UNTERHALB der Wurzel,
    // der nach draussen zeigt. "junction" braucht unter Windows keine Rechte
    // und wird unter Linux ignoriert.
    await symlink(draussen, path.join(wurzel, "verweis"), "junction");
  });

  afterAll(async () => {
    await rm(basis, { recursive: true, force: true });
  });

  describe("pfadInWurzeln", () => {
    it("gibt den aufgeloesten Pfad einer Datei unterhalb der Wurzel zurueck", async () => {
      const datei = path.join(wurzel, "a.pdf");
      await writeFile(datei, "x");
      await expect(pfadInWurzeln(datei, [wurzel])).resolves.toBe(await realpath(datei));
    });

    it("weist ../ ab", async () => {
      const hinaus = path.join(wurzel, "..", "..", "draussen", "geheim.txt");
      await expect(pfadInWurzeln(hinaus, [wurzel])).rejects.toThrow("ausserhalb");
    });

    it("weist einen Symlink unterhalb der Wurzel ab, der nach draussen zeigt", async () => {
      const ueberLink = path.join(wurzel, "verweis", "geheim.txt");
      await expect(pfadInWurzeln(ueberLink, [wurzel])).rejects.toThrow("ausserhalb");
    });

    it("weist einen Geschwisterordner mit gleichem Praefix ab (startsWith-Falle)", async () => {
      const geschwister = path.join(basis, "uploads", "unterlagen-alt");
      await mkdir(geschwister, { recursive: true });
      await writeFile(path.join(geschwister, "b.pdf"), "x");
      await expect(pfadInWurzeln(path.join(geschwister, "b.pdf"), [wurzel])).rejects.toThrow(
        "ausserhalb",
      );
    });

    it("wirft ENOENT fuer eine fehlende Datei und ueberspringt fehlende Wurzeln", async () => {
      await expect(pfadInWurzeln(path.join(wurzel, "fehlt.pdf"), [wurzel])).rejects.toMatchObject({
        code: "ENOENT",
      });
      const datei = path.join(wurzel, "c.pdf");
      await writeFile(datei, "x");
      await expect(
        pfadInWurzeln(datei, [path.join(basis, "gibt-es-nicht"), wurzel]),
      ).resolves.toBe(await realpath(datei));
    });
  });

  describe("zielVerzeichnisPruefen", () => {
    const ID = "0f8c2d5e-1a2b-4c3d-8e9f-0123456789ab";

    it("legt <wurzel>/<id> an und gibt den aufgeloesten Pfad zurueck", async () => {
      const neueWurzel = path.join(basis, "ziel-neu");
      const ergebnis = await zielVerzeichnisPruefen(neueWurzel, ID);
      expect(ergebnis).toBe(path.join(await realpath(neueWurzel), ID));
      expect((await stat(ergebnis)).isDirectory()).toBe(true);
      // Ein zweiter Aufruf fuer dasselbe Verzeichnis ist in Ordnung.
      await expect(zielVerzeichnisPruefen(neueWurzel, ID)).resolves.toBe(ergebnis);
    });

    it.each(["../draussen", "..", "abc", ID.toUpperCase(), `${ID}/x`, ""])(
      "verlangt die UUID-Form der id und legt sonst nichts an (%s)",
      async (id) => {
        const leer = path.join(basis, `ziel-ungueltig-${Math.random().toString(36).slice(2)}`);
        await expect(zielVerzeichnisPruefen(leer, id)).rejects.toThrow("Ungueltige Verzeichnis-ID");
        await expect(stat(leer)).rejects.toMatchObject({ code: "ENOENT" });
      },
    );

    it("merkt, wenn an der Stelle schon ein Verweis nach draussen liegt", async () => {
      const w = path.join(basis, "ziel-verweis");
      await mkdir(w, { recursive: true });
      await symlink(draussen, path.join(w, ID), "junction");
      await expect(zielVerzeichnisPruefen(w, ID)).rejects.toThrow("ausserhalb");
    });
  });

  describe("dateiLoeschen", () => {
    it("geloescht: die Datei war da und ist weg", async () => {
      const datei = path.join(wurzel, "weg.pdf");
      await writeFile(datei, "x");
      await expect(dateiLoeschen(datei, [wurzel])).resolves.toBe("geloescht");
      await expect(stat(datei)).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("fehlte: die Datei (oder ihr Ordner) gibt es nicht", async () => {
      await expect(dateiLoeschen(path.join(wurzel, "nie-da.pdf"), [wurzel])).resolves.toBe("fehlte");
      await expect(
        dateiLoeschen(path.join(wurzel, "ordner-fehlt", "x.pdf"), [wurzel]),
      ).resolves.toBe("fehlte");
    });

    it("fehler: Loeschen scheitert, obwohl etwas da ist (hier ein Verzeichnis)", async () => {
      const ordner = path.join(wurzel, "ein-ordner");
      await mkdir(ordner, { recursive: true });
      await expect(dateiLoeschen(ordner, [wurzel])).resolves.toBe("fehler");
      expect((await stat(ordner)).isDirectory()).toBe(true);
    });

    it("fehler: ein Pfad ausserhalb der Wurzeln wird nicht angefasst", async () => {
      const fremd = path.join(draussen, "geheim.txt");
      await expect(dateiLoeschen(fremd, [wurzel])).resolves.toBe("fehler");
      await expect(dateiLoeschen(path.join(wurzel, "..", "..", "draussen", "geheim.txt"), [wurzel])).resolves.toBe(
        "fehler",
      );
      // Auch nicht, wenn es ihn gar nicht gibt — „fehlte" hiesse „erledigt".
      await expect(dateiLoeschen(path.join(draussen, "nie-da.txt"), [wurzel])).resolves.toBe("fehler");
      expect((await stat(fremd)).isFile()).toBe(true);
    });

    it("fehler: ein Verweis im Pfad nach draussen loescht nichts", async () => {
      await expect(
        dateiLoeschen(path.join(wurzel, "verweis", "geheim.txt"), [wurzel]),
      ).resolves.toBe("fehler");
      expect((await stat(path.join(draussen, "geheim.txt"))).isFile()).toBe(true);
    });

    it("fehler: die Wurzel selbst ist keine Datei", async () => {
      await expect(dateiLoeschen(wurzel, [wurzel])).resolves.toBe("fehler");
      expect((await readdir(wurzel)).length).toBeGreaterThan(0);
    });
  });
});

// =============================================
// Paket 4: Body begrenzt lesen
// =============================================

/**
 * Ein Datenstrom aus den gegebenen Stuecken; merkt sich, wie viele Stuecke
 * angefordert wurden und ob abgebrochen wurde. `highWaterMark: 0`, damit der
 * Strom nichts auf Vorrat zieht — sonst zaehlte schon das Anlegen als Lesen.
 */
function strom(stuecke: Uint8Array[]) {
  const zustand = { abgebrochen: false, gelesen: 0 };
  let i = 0;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (i < stuecke.length) {
          zustand.gelesen += 1;
          controller.enqueue(stuecke[i++]);
        } else {
          controller.close();
        }
      },
      cancel() {
        zustand.abgebrochen = true;
      },
    },
    { highWaterMark: 0 },
  );
  return { body, zustand };
}

function anfrage(body: ReadableStream<Uint8Array> | null, contentLength?: string) {
  const headers = new Headers();
  if (contentLength !== undefined) headers.set("content-length", contentLength);
  return { headers, body };
}

describe("contentLengthZuGross", () => {
  it("nur ein lesbarer Wert ueber der Grenze zaehlt", () => {
    expect(contentLengthZuGross(anfrage(null, "11"), 10)).toBe(true);
    expect(contentLengthZuGross(anfrage(null, "10"), 10)).toBe(false);
    expect(contentLengthZuGross(anfrage(null), 10)).toBe(false);
    expect(contentLengthZuGross(anfrage(null, "viel"), 10)).toBe(false);
    expect(contentLengthZuGross(anfrage(null, "-5"), 10)).toBe(false);
  });
});

describe("leseBodyBegrenzt", () => {
  const GRENZE = 10;

  it("Content-Length ueber der Grenze: sofort 413, ohne ein Byte zu lesen", async () => {
    const { body, zustand } = strom([new Uint8Array(5)]);
    const getReader = jest.spyOn(body, "getReader");
    await expect(leseBodyBegrenzt(anfrage(body, "10485761"), GRENZE)).resolves.toEqual({
      ok: false,
      status: 413,
      grund: "ZU_GROSS",
    });
    expect(getReader).not.toHaveBeenCalled();
    expect(zustand.gelesen).toBe(0);
  });

  it("ohne Content-Length wird gezaehlt und ueber der Grenze abgebrochen", async () => {
    const { body, zustand } = strom([new Uint8Array(6), new Uint8Array(5), new Uint8Array(100)]);
    await expect(leseBodyBegrenzt(anfrage(body), GRENZE)).resolves.toEqual({
      ok: false,
      status: 413,
      grund: "ZU_GROSS",
    });
    expect(zustand.abgebrochen).toBe(true);
    // Das dritte Stueck wurde nie angefordert.
    expect(zustand.gelesen).toBe(2);
  });

  it("ein zu klein angegebenes Content-Length hilft nicht", async () => {
    const { body } = strom([new Uint8Array(8), new Uint8Array(8)]);
    await expect(leseBodyBegrenzt(anfrage(body, "3"), GRENZE)).resolves.toMatchObject({
      ok: false,
      status: 413,
    });
  });

  it("genau an der Grenze ist erlaubt, ein Byte mehr nicht", async () => {
    const genau = strom([Uint8Array.from([1, 2, 3, 4]), Uint8Array.from([5, 6, 7, 8, 9, 10])]);
    const ergebnis = await leseBodyBegrenzt(anfrage(genau.body, "10"), GRENZE);
    expect(ergebnis).toEqual({ ok: true, buffer: Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) });

    const drueber = strom([new Uint8Array(4), new Uint8Array(7)]);
    await expect(leseBodyBegrenzt(anfrage(drueber.body), GRENZE)).resolves.toMatchObject({
      ok: false,
      status: 413,
    });
  });

  it("ohne Body: leerer Buffer", async () => {
    await expect(leseBodyBegrenzt(anfrage(null), GRENZE)).resolves.toEqual({
      ok: true,
      buffer: Buffer.alloc(0),
    });
  });

  it("bricht die Verbindung ab, gibt es 400 statt einer Ausnahme", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(2));
        controller.error(new Error("Verbindung weg"));
      },
    });
    await expect(leseBodyBegrenzt(anfrage(body), GRENZE)).resolves.toEqual({
      ok: false,
      status: 400,
      grund: "ABGEBROCHEN",
    });
  });

  it("der gelesene Buffer ergibt mit dem Content-Type der Anfrage wieder das Formular", async () => {
    // Der Weg der Upload-Route: erst begrenzt lesen, dann
    // new Response(buffer, { headers }).formData().
    const form = new FormData();
    form.append("datei", new File([JPEG], "karte.jpg", { type: "image/jpeg" }));
    const request = new Request("http://localhost/api/unterlagen/x", { method: "POST", body: form });
    const ergebnis = await leseBodyBegrenzt(request, 10_485_760);
    expect(ergebnis.ok).toBe(true);
    if (!ergebnis.ok) return;

    const gelesen = await new Response(ergebnis.buffer, {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
    const datei = gelesen.get("datei");
    expect(datei).toBeInstanceOf(File);
    expect(Buffer.from(await (datei as File).arrayBuffer())).toEqual(JPEG);
  });
});
