/**
 * Tests: Lauf „Aufbewahrung erzeugter Dokumente“ (src/lib/laeufe/dokumente-aufbewahrung.ts)
 * — der Block der Ausstattung (Paket A3, S20, E-A22).
 *
 * Geprueft wird nur die Verdrahtung: eigene Frist von sechs Monaten
 * (`freitextGrenze`, nicht die zwoelf Monate der Dokumente), eigener `try`
 * (ein Fehler dort laesst Dokumente und individuelle E-Mails unberuehrt),
 * Probelauf und scharf, Antwortfeld `ausstattung` — und dass der Bericht des
 * Zeitplaners die echte Antwort ohne „Antwort unvollständig“ liest. Das Leeren
 * selbst steht in ausstattung-lauf.test.ts.
 *
 * Seit A4 (S35, E-A37) der Block der Ausgaben: eigener `try`, Probelauf und
 * scharf, Antwortfeld `ausgaben`, Bericht. Das Loeschen selbst steht in
 * ausgaben-lauf.test.ts.
 */

const mockPrisma = {
  generatedDocument: { findMany: jest.fn(), delete: jest.fn() },
};
const mockMailsAufraeumen = jest.fn();
const mockFreitexteLeeren = jest.fn();
const mockAusgabenLoeschen = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/file-upload", () => ({
  deleteUploadedFile: jest.fn().mockResolvedValue(true),
  deleteUploadedDirIfEmpty: jest.fn().mockResolvedValue(true),
}));
jest.mock("@/lib/individuelle-mail-dienst", () => ({
  individuelleMailsAufraeumen: (...a: unknown[]) => mockMailsAufraeumen(...a),
}));
jest.mock("@/lib/ausstattung-lauf", () => ({
  ausstattungFreitexteLeeren: (...a: unknown[]) => mockFreitexteLeeren(...a),
  leeresFreitexteErgebnis: () => ({ vorgaenge: 0, geleert: 0, hinweiseGeleert: 0, fehler: 0 }),
}));
jest.mock("@/lib/ausgaben-lauf", () => ({
  ausgabenLoeschen: (...a: unknown[]) => mockAusgabenLoeschen(...a),
  leeresAusgabenErgebnis: () => ({
    aufbewahrungMonate: 6,
    verjaehrungJahre: 3,
    geloescht: 0,
    rueckgabenGeleert: 0,
    protokolleGeloescht: 0,
    erzeugteProtokolleGeloescht: 0,
    ohneFristAelterDreiJahre: 0,
    fehler: 0,
  }),
}));

import { dokumenteAufbewahrungLauf } from "@/lib/laeufe/dokumente-aufbewahrung";
import { freitextGrenze } from "@/lib/ausstattung";
import { aufbewahrungsGrenze } from "@/lib/erzeugte-dokumente";
import { laufAuswerten } from "@/lib/zeitplaner/bericht";

const JETZT = new Date("2027-09-15T01:15:00.000Z");
type Koerper = Record<string, unknown>;

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.generatedDocument.findMany.mockResolvedValue([{ id: "d1", pfadDocx: "a/b.docx", pfadPdf: null }]);
  mockPrisma.generatedDocument.delete.mockResolvedValue({});
  mockMailsAufraeumen.mockResolvedValue({ mails: 1, dateienGeloescht: 2, fehler: 0 });
  mockFreitexteLeeren.mockResolvedValue({ vorgaenge: 2, geleert: 3, hinweiseGeleert: 1, fehler: 0 });
  mockAusgabenLoeschen.mockImplementation(async ({ dryRun }: { dryRun?: boolean }) =>
    dryRun ? { ...AUSGABEN_KOPF, wuerdeLoeschen: 5, ohneFristAelterDreiJahre: 2 } : { ...AUSGABEN_SCHARF },
  );
});

/** Antwortteile des Ausgaben-Blocks (Form wie ausgaben-lauf.ts). */
const AUSGABEN_KOPF = { aufbewahrungMonate: 6, verjaehrungJahre: 3 };
const AUSGABEN_SCHARF = {
  ...AUSGABEN_KOPF,
  geloescht: 4,
  rueckgabenGeleert: 3,
  protokolleGeloescht: 1,
  erzeugteProtokolleGeloescht: 2,
  ohneFristAelterDreiJahre: 2,
  fehler: 0,
};

describe("dokumenteAufbewahrungLauf — Freitexte der Ausstattung (E-A22)", () => {
  it("scharf: eigene Frist von sechs Monaten (Berliner Tag), Antwortfeld `ausstattung`", async () => {
    const r = await dokumenteAufbewahrungLauf({ jetzt: JETZT });
    expect(r.status).toBe(200);
    expect(mockFreitexteLeeren).toHaveBeenCalledWith({ grenze: freitextGrenze(JETZT), dryRun: false, jetzt: JETZT });
    // nicht die zwoelf Monate der Dokumente
    expect(freitextGrenze(JETZT).getTime()).not.toBe(aufbewahrungsGrenze(JETZT).getTime());
    expect((r.body as Koerper).ausstattung).toEqual({
      aufbewahrungMonate: 6,
      grenze: freitextGrenze(JETZT).toISOString(),
      geleert: 3,
      hinweiseGeleert: 1,
      fehler: 0,
    });
    expect((r.body as Koerper).geloescht).toBe(1);
  });

  it("ein Fehler im Ausstattungsblock laesst Dokumente und E-Mails unberuehrt — gezaehlt, geloggt nur die Kennung", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    mockFreitexteLeeren.mockRejectedValue(
      Object.assign(new Error("Verbindung zu anna.privat@example.org verloren"), { code: "P1001" }),
    );
    const r = await dokumenteAufbewahrungLauf({ jetzt: JETZT });
    const body = r.body as Koerper;
    expect(r.status).toBe(200);
    expect(body.geloescht).toBe(1);
    expect(body.individuelleMails).toEqual({ geleert: 1, dateienGeloescht: 2, fehler: 0 });
    expect(body.ausstattung).toMatchObject({ geleert: 0, hinweiseGeleert: 0, fehler: 1 });
    expect(JSON.stringify(log.mock.calls)).toContain("P1001");
    expect(JSON.stringify(log.mock.calls)).not.toContain("anna.privat");
    // Der Bericht meldet es als Befund.
    expect(laufAuswerten("dokumente-aufbewahrung", r.status, r.body, false).ergebnis).toBe("PROBLEME");
    log.mockRestore();
  });

  it("Probelauf: zaehlt nur — `wuerdeLeeren` = Zeilen + Hinweise", async () => {
    const r = await dokumenteAufbewahrungLauf({ jetzt: JETZT, dryRun: true });
    expect(mockFreitexteLeeren).toHaveBeenCalledWith({ grenze: freitextGrenze(JETZT), dryRun: true });
    expect(mockPrisma.generatedDocument.delete).not.toHaveBeenCalled();
    expect((r.body as Koerper).ausstattung).toEqual({
      aufbewahrungMonate: 6,
      grenze: freitextGrenze(JETZT).toISOString(),
      wuerdeLeeren: 4,
    });
  });

  it("der Bericht liest die echte Antwort vollstaendig — scharf wie im Probelauf", async () => {
    const scharf = await dokumenteAufbewahrungLauf({ jetzt: JETZT });
    const a = laufAuswerten("dokumente-aufbewahrung", scharf.status, scharf.body, false);
    expect(a.ergebnis).toBe("OK");
    expect(a.zaehler).toContainEqual(["Geleert: Ausstattung – Positionen / Hinweise", "3 / 1"]);

    const probe = await dokumenteAufbewahrungLauf({ jetzt: JETZT, dryRun: true });
    const p = laufAuswerten("dokumente-aufbewahrung", probe.status, probe.body, true);
    expect(p.ergebnis).toBe("OK");
    expect(p.zaehler).toContainEqual(["Würde leeren (Ausstattung: Bemerkungen, Angaben, Hinweise)", 4]);
  });
});

describe("dokumenteAufbewahrungLauf — Ausgaben nach Ablauf der Frist (E-A37, S35)", () => {
  it("scharf: eigener Block mit `jetzt`, Antwortfeld `ausgaben` unveraendert durchgereicht", async () => {
    const r = await dokumenteAufbewahrungLauf({ jetzt: JETZT });
    expect(r.status).toBe(200);
    expect(mockAusgabenLoeschen).toHaveBeenCalledWith({ jetzt: JETZT, dryRun: false });
    expect((r.body as Koerper).ausgaben).toEqual(AUSGABEN_SCHARF);
  });

  it("ein Fehler im Ausgaben-Block laesst Dokumente, E-Mails und Ausstattung unberuehrt — gezaehlt, geloggt nur die Kennung", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    mockAusgabenLoeschen.mockRejectedValue(
      Object.assign(new Error("Kennung FES-IPAD-0412 von anna.privat@example.org"), { code: "P2034" }),
    );
    const r = await dokumenteAufbewahrungLauf({ jetzt: JETZT });
    const body = r.body as Koerper;
    expect(r.status).toBe(200);
    expect(body.geloescht).toBe(1);
    expect(body.individuelleMails).toEqual({ geleert: 1, dateienGeloescht: 2, fehler: 0 });
    expect(body.ausstattung).toMatchObject({ geleert: 3, hinweiseGeleert: 1, fehler: 0 });
    expect(body.ausgaben).toMatchObject({ geloescht: 0, fehler: 1 });
    const text = JSON.stringify(log.mock.calls);
    expect(text).toContain("P2034");
    expect(text).not.toContain("anna.privat");
    expect(text).not.toContain("FES-IPAD-0412");
    expect(laufAuswerten("dokumente-aufbewahrung", r.status, r.body, false).ergebnis).toBe("PROBLEME");
    log.mockRestore();
  });

  it("ein Fehler in einem anderen Block laesst die Ausgaben unberuehrt", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    mockFreitexteLeeren.mockRejectedValue(new Error("weg"));
    const r = await dokumenteAufbewahrungLauf({ jetzt: JETZT });
    expect(mockAusgabenLoeschen).toHaveBeenCalledWith({ jetzt: JETZT, dryRun: false });
    expect((r.body as Koerper).ausgaben).toEqual(AUSGABEN_SCHARF);
    log.mockRestore();
  });

  it("Probelauf: nur zaehlen — `wuerdeLoeschen` und der Zaehler ohne Frist", async () => {
    const r = await dokumenteAufbewahrungLauf({ jetzt: JETZT, dryRun: true });
    expect(mockAusgabenLoeschen).toHaveBeenCalledWith({ jetzt: JETZT, dryRun: true });
    expect(mockAusgabenLoeschen).not.toHaveBeenCalledWith(expect.objectContaining({ dryRun: false }));
    expect((r.body as Koerper).ausgaben).toEqual({ ...AUSGABEN_KOPF, wuerdeLoeschen: 5, ohneFristAelterDreiJahre: 2 });
  });

  it("der Bericht liest die echte Antwort samt Ausgaben — „ohne Frist“ ist nur eine Zahl, kein Befund", async () => {
    const scharf = await dokumenteAufbewahrungLauf({ jetzt: JETZT });
    const a = laufAuswerten("dokumente-aufbewahrung", scharf.status, scharf.body, false);
    expect(a.ergebnis).toBe("OK");
    expect(a.zaehler).toContainEqual(["Gelöscht: Ausgaben / Rückgaben geleert", "4 / 3"]);
    expect(a.zaehler).toContainEqual(["Gelöscht: Übergabe- und Rückgabeprotokolle – hochgeladen / erzeugt", "1 / 2"]);
    expect(a.zaehler).toContainEqual(["Ausgaben ohne Löschfrist, älter als drei Jahre", 2]);
    expect(a.zaehler.at(-1)).toEqual(["Fehler", 0, false]);

    const probe = await dokumenteAufbewahrungLauf({ jetzt: JETZT, dryRun: true });
    const p = laufAuswerten("dokumente-aufbewahrung", probe.status, probe.body, true);
    expect(p.ergebnis).toBe("OK");
    expect(p.zaehler).toContainEqual(["Würde löschen (Ausgaben nach Ablauf der Frist)", 5]);
    expect(p.zaehler).toContainEqual(["Ausgaben ohne Löschfrist, älter als drei Jahre", 2]);
  });
});
