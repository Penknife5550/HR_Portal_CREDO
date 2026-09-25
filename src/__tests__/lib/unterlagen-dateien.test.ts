/**
 * Tests: Unterlagen nachfordern — Dateien auf der Platte (src/lib/unterlagen-dateien.ts)
 *
 * Die Regel dieser Datei ist „Wurzeln je Operation, nie uploads als Ganzes"
 * (Feinplanung 4.1): Eine Datei der Nachforderung wird nur unter
 * uploads/unterlagen/<nachforderungId> gelesen und geloescht, eine
 * Vorgangskopie nur unter uploads/<vorgangId>. Dazu die Uebernahme per
 * Hardlink mit Pruefsumme (4.4), die Ruecknahme (4.5) und die Waisensuche des
 * Laufs.
 *
 * Gearbeitet wird in einem eigenen Verzeichnis unter os.tmpdir(); das
 * Arbeitsverzeichnis (`process.cwd()`) zeigt fuer die Dauer der Tests dorthin.
 */

/** Laesst den naechsten fs.link-Aufruf mit diesem Code scheitern (EXDEV: anderes Volume). */
let mockLinkFehler: string | null = null;
/** Je fs.link-Aufruf eine Aufgabe VOR dem echten Link — z. B. „ein Entfernen raeumt den leeren Ordner ab". */
let mockVorLink: Array<() => Promise<unknown>> = [];
jest.mock("fs/promises", () => {
  const echt = jest.requireActual("fs/promises");
  return {
    ...echt,
    link: async (...args: [string, string]) => {
      const vorher = mockVorLink.shift();
      if (vorher) await vorher();
      if (mockLinkFehler) {
        const code = mockLinkFehler;
        mockLinkFehler = null;
        return Promise.reject(Object.assign(new Error(code), { code }));
      }
      return echt.link(...args);
    },
  };
});

import { createHash } from "crypto";
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import {
  entwuerfeLoeschen,
  entwurfSpeichern,
  nachforderungsDateiLesen,
  nachforderungsDateiLoeschen,
  nachforderungsPfad,
  nachforderungsWaisen,
  UnterlagenDateiFehler,
  verknuepfenInVorgang,
  vorgangsKopieLoeschen,
  vorgangsPfad,
  vorgangsWaisen,
  verwaisteNachforderungsOrdner,
  zurueckVerknuepfen,
} from "@/lib/unterlagen-dateien";
import { ENDUNG_FUER_DATEITYP } from "@/lib/file-upload";

const NF = "0b6c1f7e-2a3d-4c5b-9e8f-7a6b5c4d3e2f";
const NF2 = "1c7d2e8f-3b4e-4d6c-8f9a-8b7c6d5e4f3a";
const VORGANG = "3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b";
const DATEI = "5d8e3f9a-4c5f-4e7d-9a0b-9c8d7e6f5a4b";
const DATEI2 = "6e9f4a0b-5d6a-4f8e-8b1c-0d9e8f7a6b5c";
const INHALT = Buffer.from("%PDF-1.7\n1 0 obj\n%%EOF\n");
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

let basis: string;
let cwd: jest.SpyInstance;

beforeEach(async () => {
  basis = await mkdtemp(path.join(os.tmpdir(), "p4-dateien-"));
  cwd = jest.spyOn(process, "cwd").mockReturnValue(basis);
});

afterEach(async () => {
  mockVorLink = [];
  cwd.mockRestore();
  jest.restoreAllMocks();
  await rm(basis, { recursive: true, force: true });
});

const abs = (relativ: string) => path.join(basis, ...relativ.split("/"));

async function ablegen(relativ: string, inhalt: Buffer = INHALT): Promise<void> {
  await mkdir(path.dirname(abs(relativ)), { recursive: true });
  await writeFile(abs(relativ), inhalt);
}

async function gibtEs(relativ: string): Promise<boolean> {
  return stat(abs(relativ)).then(
    () => true,
    () => false,
  );
}

describe("Pfade", () => {
  it("relativ, mit / und Endung aus dem Typ", () => {
    expect(nachforderungsPfad(NF, DATEI, "application/pdf")).toBe(`uploads/unterlagen/${NF}/${DATEI}.pdf`);
    expect(nachforderungsPfad(NF, DATEI, "image/jpeg")).toBe(`uploads/unterlagen/${NF}/${DATEI}.jpg`);
    expect(vorgangsPfad(VORGANG, DATEI, "image/webp")).toBe(`uploads/${VORGANG}/${DATEI}.webp`);
  });

  it("nur UUIDs werden zu Pfadteilen, nur erkannte Typen zu Endungen", () => {
    expect(() => nachforderungsPfad("../bem", DATEI, "application/pdf")).toThrow();
    expect(() => nachforderungsPfad(NF, "x/../../y", "application/pdf")).toThrow();
    expect(() => vorgangsPfad(VORGANG.toUpperCase(), DATEI, "application/pdf")).toThrow();
    expect(() => nachforderungsPfad(NF, DATEI, "text/html")).toThrow();
  });
});

describe("Entwuerfe", () => {
  it("entwurfSpeichern schreibt unter die Wurzel der Nachforderung und ueberschreibt nie", async () => {
    const relativ = await entwurfSpeichern(INHALT, { nachforderungId: NF, dateiId: DATEI, mimeType: "application/pdf" });
    expect(relativ).toBe(`uploads/unterlagen/${NF}/${DATEI}.pdf`);
    expect(await readFile(abs(relativ))).toEqual(INHALT);
    await expect(
      entwurfSpeichern(Buffer.from("anders"), { nachforderungId: NF, dateiId: DATEI, mimeType: "application/pdf" }),
    ).rejects.toThrow();
    expect(await readFile(abs(relativ))).toEqual(INHALT);
  });

  it("Lesen und Loeschen nur unter der EIGENEN Nachforderung", async () => {
    const fremd = `uploads/unterlagen/${NF2}/${DATEI}.pdf`;
    const bem = `uploads/bem/${DATEI}.pdf`;
    await ablegen(fremd);
    await ablegen(bem);
    await expect(nachforderungsDateiLesen(fremd, NF)).rejects.toThrow();
    expect(await nachforderungsDateiLoeschen(fremd, NF)).toBe("fehler");
    expect(await nachforderungsDateiLoeschen(bem, NF)).toBe("fehler");
    expect(await nachforderungsDateiLoeschen(`uploads/unterlagen/${NF}/../${NF2}/${DATEI}.pdf`, NF)).toBe("fehler");
    expect(await gibtEs(fremd)).toBe(true);
    expect(await gibtEs(bem)).toBe(true);
  });

  it("Loeschen sagt ehrlich, wie es ausging: geloescht, fehlte", async () => {
    const relativ = `uploads/unterlagen/${NF}/${DATEI}.pdf`;
    await ablegen(relativ);
    expect(await nachforderungsDateiLesen(relativ, NF)).toEqual(INHALT);
    expect(await nachforderungsDateiLoeschen(relativ, NF)).toBe("geloescht");
    expect(await nachforderungsDateiLoeschen(relativ, NF)).toBe("fehlte");
  });

  it("entwuerfeLoeschen: Bilanz, leerer Ordner geht mit, ein Ordner mit eingereichten Dateien bleibt", async () => {
    const a = `uploads/unterlagen/${NF}/${DATEI}.pdf`;
    const b = `uploads/unterlagen/${NF}/${DATEI2}.jpg`;
    await ablegen(a);
    await ablegen(b);
    expect(await entwuerfeLoeschen(NF, [a, null, `uploads/unterlagen/${NF}/fehlt.pdf`])).toEqual({
      geloescht: 1,
      fehlte: 1,
      fehler: 0,
    });
    expect(await gibtEs(b)).toBe(true);

    expect(await entwuerfeLoeschen(NF, [b])).toEqual({ geloescht: 1, fehlte: 0, fehler: 0 });
    expect(await gibtEs(`uploads/unterlagen/${NF}`)).toBe(false);
  });
});

describe("Uebernahme und Ruecknahme", () => {
  const quelle = `uploads/unterlagen/${NF}/${DATEI}.pdf`;

  it("verknuepfenInVorgang: Hardlink in den Vorgangsordner, Quelle bleibt", async () => {
    await ablegen(quelle);
    const r = await verknuepfenInVorgang({
      speicherPfad: quelle,
      nachforderungId: NF,
      vorgangId: VORGANG,
      dateiId: DATEI,
      mimeType: "application/pdf",
      sha256: sha(INHALT),
    });
    expect(r).toEqual({ zielPfad: `uploads/${VORGANG}/${DATEI}.pdf`, neu: true });
    expect(await readFile(abs(r.zielPfad))).toEqual(INHALT);
    expect(await gibtEs(quelle)).toBe(true);
    expect((await stat(abs(quelle))).nlink).toBe(2);
  });

  it("Pruefsumme weicht ab → DATEI_VERAENDERT, kein Ziel", async () => {
    await ablegen(quelle);
    await expect(
      verknuepfenInVorgang({
        speicherPfad: quelle,
        nachforderungId: NF,
        vorgangId: VORGANG,
        dateiId: DATEI,
        mimeType: "application/pdf",
        sha256: "f".repeat(64),
      }),
    ).rejects.toMatchObject({ code: "DATEI_VERAENDERT" });
    expect(await gibtEs(`uploads/${VORGANG}/${DATEI}.pdf`)).toBe(false);
  });

  it("Quelle fehlt → DATEI_FEHLT; Quelle einer anderen Nachforderung → wirft", async () => {
    const opts = { nachforderungId: NF, vorgangId: VORGANG, dateiId: DATEI, mimeType: "application/pdf", sha256: sha(INHALT) };
    const fehlt = verknuepfenInVorgang({ ...opts, speicherPfad: quelle });
    await expect(fehlt).rejects.toBeInstanceOf(UnterlagenDateiFehler);
    await expect(verknuepfenInVorgang({ ...opts, speicherPfad: quelle })).rejects.toMatchObject({ code: "DATEI_FEHLT" });

    const fremd = `uploads/unterlagen/${NF2}/${DATEI}.pdf`;
    await ablegen(fremd);
    await expect(verknuepfenInVorgang({ ...opts, speicherPfad: fremd })).rejects.toThrow("ausserhalb");
  });

  it("wiederholter Versuch: Ziel mit gleichem Inhalt zaehlt (neu: false), mit anderem → DATEI_VERAENDERT", async () => {
    await ablegen(quelle);
    const opts = {
      speicherPfad: quelle,
      nachforderungId: NF,
      vorgangId: VORGANG,
      dateiId: DATEI,
      mimeType: "application/pdf",
      sha256: sha(INHALT),
    };
    await verknuepfenInVorgang(opts);
    expect(await verknuepfenInVorgang(opts)).toEqual({ zielPfad: `uploads/${VORGANG}/${DATEI}.pdf`, neu: false });

    await rm(abs(`uploads/${VORGANG}/${DATEI}.pdf`));
    await ablegen(`uploads/${VORGANG}/${DATEI}.pdf`, Buffer.from("fremder Inhalt"));
    await expect(verknuepfenInVorgang(opts)).rejects.toMatchObject({ code: "DATEI_VERAENDERT" });
    expect(await readFile(abs(`uploads/${VORGANG}/${DATEI}.pdf`), "utf8")).toBe("fremder Inhalt");
  });

  it("ohne Hardlink (EXDEV) wird kopiert und die Kopie geprueft", async () => {
    await ablegen(quelle);
    mockLinkFehler = "EXDEV";
    const r = await verknuepfenInVorgang({
      speicherPfad: quelle,
      nachforderungId: NF,
      vorgangId: VORGANG,
      dateiId: DATEI,
      mimeType: "application/pdf",
      sha256: sha(INHALT),
    });
    expect(r.neu).toBe(true);
    expect(await readFile(abs(r.zielPfad))).toEqual(INHALT);
    expect((await stat(abs(quelle))).nlink).toBe(1);
  });

  it("zurueckVerknuepfen: aus dem Vorgangsordner zurueck zur Nachforderung; Kopie loeschen nur dort", async () => {
    const kopie = `uploads/${VORGANG}/${DATEI}.pdf`;
    await ablegen(kopie);
    const r = await zurueckVerknuepfen({
      dokumentPfad: kopie,
      vorgangId: VORGANG,
      nachforderungId: NF,
      dateiId: DATEI,
      mimeType: "application/pdf",
      sha256: sha(INHALT),
    });
    expect(r).toEqual({ speicherPfad: quelle, neu: true });
    expect(await readFile(abs(quelle))).toEqual(INHALT);

    expect(await vorgangsKopieLoeschen(quelle, VORGANG)).toBe("fehler");
    expect(await vorgangsKopieLoeschen(kopie, VORGANG)).toBe("geloescht");
    expect(await gibtEs(quelle)).toBe(true);
  });

  it("zurueckVerknuepfen: raeumt ein gleichzeitiges „Entfernen“ den Ordner ab, legt ein neuer Versuch ihn wieder an", async () => {
    // Zwischen zielVerzeichnisPruefen (mkdir) und link: rmdir des leeren
    // Ordners der Nachforderung (entwuerfeLoeschen nach dem Commit) — frueher 500.
    const kopie = `uploads/${VORGANG}/${DATEI}.pdf`;
    await ablegen(kopie);
    mockVorLink = [() => rm(abs(`uploads/unterlagen/${NF}`), { recursive: true, force: true })];
    const r = await zurueckVerknuepfen({
      dokumentPfad: kopie,
      vorgangId: VORGANG,
      nachforderungId: NF,
      dateiId: DATEI,
      mimeType: "application/pdf",
      sha256: sha(INHALT),
    });
    expect(r).toEqual({ speicherPfad: quelle, neu: true });
    expect(await readFile(abs(quelle))).toEqual(INHALT);
    expect(mockVorLink).toEqual([]);
  });

  it("verknuepfenInVorgang: verschwindet die QUELLE vor dem Link → DATEI_FEHLT (409), kein weiterer Versuch", async () => {
    await ablegen(quelle);
    mockVorLink = [() => rm(abs(quelle))];
    await expect(
      verknuepfenInVorgang({
        speicherPfad: quelle,
        nachforderungId: NF,
        vorgangId: VORGANG,
        dateiId: DATEI,
        mimeType: "application/pdf",
        sha256: sha(INHALT),
      }),
    ).rejects.toMatchObject({ code: "DATEI_FEHLT" });
    expect(await gibtEs(`uploads/${VORGANG}/${DATEI}.pdf`)).toBe(false);
  });

  it("zurueckVerknuepfen: veraenderte Vorgangskopie → DATEI_VERAENDERT", async () => {
    await ablegen(`uploads/${VORGANG}/${DATEI}.pdf`, Buffer.from("geaendert"));
    await expect(
      zurueckVerknuepfen({
        dokumentPfad: `uploads/${VORGANG}/${DATEI}.pdf`,
        vorgangId: VORGANG,
        nachforderungId: NF,
        dateiId: DATEI,
        mimeType: "application/pdf",
        sha256: sha(INHALT),
      }),
    ).rejects.toMatchObject({ code: "DATEI_VERAENDERT" });
  });
});

describe("Waisen", () => {
  const JETZT = new Date("2026-09-21T08:00:00.000Z");
  const ALT = new Date(JETZT.getTime() - 25 * 3_600_000);
  const FRISCH = new Date(JETZT.getTime() - 3_600_000);
  const TAG = 24 * 3_600_000;

  it("nachforderungsWaisen: ohne Zeile und aelter als 24 h — bekannte und frische bleiben", async () => {
    const bekannt = `uploads/unterlagen/${NF}/${DATEI}.pdf`;
    const waise = `uploads/unterlagen/${NF}/${DATEI2}.pdf`;
    const frisch = `uploads/unterlagen/${NF}/7f0a5b1c-6e7b-4a9f-9c2d-1e0f9a8b7c6d.pdf`;
    for (const d of [bekannt, waise, frisch]) await ablegen(d);
    for (const d of [bekannt, waise]) await utimes(abs(d), ALT, ALT);
    await utimes(abs(frisch), FRISCH, FRISCH);
    expect(
      await nachforderungsWaisen({ nachforderungId: NF, bekanntePfade: new Set([bekannt]), jetzt: JETZT, minAlterMs: TAG }),
    ).toEqual([waise]);
    expect(
      await nachforderungsWaisen({ nachforderungId: NF2, bekanntePfade: new Set(), jetzt: JETZT, minAlterMs: TAG }),
    ).toEqual([]);
  });

  it("vorgangsWaisen: nur Dateien dieser Nachforderung ohne Document — Fragebogen-Uploads bleiben", async () => {
    const angenommen = `uploads/${VORGANG}/${DATEI}.pdf`;
    const abgebrochen = `uploads/${VORGANG}/${DATEI2}.jpg`;
    const fragebogen = `uploads/${VORGANG}/1726000000000-pass.pdf`;
    for (const d of [angenommen, abgebrochen, fragebogen]) await ablegen(d);
    expect(
      await vorgangsWaisen({
        vorgangId: VORGANG,
        dateiIds: new Set([DATEI, DATEI2]),
        dokumentPfade: new Set([angenommen, fragebogen]),
      }),
    ).toEqual([abgebrochen]);
  });

  it("vorgangsWaisen erkennt den Speichernamen mit JEDER Endung aus ENDUNG_FUER_DATEITYP — sonst nichts", async () => {
    const endungen = Object.values(ENDUNG_FUER_DATEITYP);
    expect(endungen.length).toBeGreaterThan(0);
    const treffer = endungen.map((endung) => `uploads/${VORGANG}/${DATEI}${endung}`);
    // Fremde, doppelte und verlaengerte Endung, fehlender Punkt: kein Speichername von Paket 4.
    const fremd = [`${DATEI}.docx`, `${DATEI}.pdf.html`, `${DATEI}.pdfx`, `${DATEI}xpdf`].map((n) => `uploads/${VORGANG}/${n}`);
    for (const d of [...treffer, ...fremd]) await ablegen(d);
    expect(
      await vorgangsWaisen({ vorgangId: VORGANG, dateiIds: new Set([DATEI]), dokumentPfade: new Set() }),
    ).toEqual([...treffer].sort());
  });

  it("verwaisteNachforderungsOrdner: Ordner ohne Zeile und aelter als 24 h", async () => {
    await ablegen(`uploads/unterlagen/${NF}/${DATEI}.pdf`);
    await ablegen(`uploads/unterlagen/${NF2}/${DATEI}.pdf`);
    await mkdir(abs("uploads/unterlagen/kein-uuid"), { recursive: true });
    await utimes(abs(`uploads/unterlagen/${NF}`), ALT, ALT);
    await utimes(abs(`uploads/unterlagen/${NF2}`), ALT, ALT);
    await utimes(abs("uploads/unterlagen/kein-uuid"), ALT, ALT);
    expect(await verwaisteNachforderungsOrdner({ bekannteIds: new Set([NF]), jetzt: JETZT, minAlterMs: TAG })).toEqual([
      NF2,
    ]);
  });
});
