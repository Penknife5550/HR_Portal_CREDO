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
 */

const mockPrisma = {
  generatedDocument: { findMany: jest.fn(), delete: jest.fn() },
};
const mockMailsAufraeumen = jest.fn();
const mockFreitexteLeeren = jest.fn();

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
});

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
