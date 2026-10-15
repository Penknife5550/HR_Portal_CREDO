/**
 * Tests: Dokument aus Vorlage erzeugen (POST /api/brief-vorlagen/[id]/generate)
 * – die beiden Aenderungen aus A4, S33 (G19):
 *
 *  1. Ein Handwert ersetzt nie eine Liste. Was der Resolver als Array liefert
 *     (`ausgaben_je_stelle` fuer das Uebergabeprotokoll), bleibt, und fuer
 *     Listenschluessel und innere Namen nimmt die Route gar keinen Handwert an
 *     (`handwerteOhneListen`). Gewoehnliche Handwerte ueberschreiben wie bisher.
 *  2. Die Vorlagendatei kommt NUR aus uploads/brief-vorlagen und
 *     public/system-dokumente (`leseVorlagenDatei`, CLAUDE.md Dokumentenpaket
 *     Regel 4). Vorher las die Route `dateipfad` aus der Datenbank ungeprueft —
 *     eine manipulierte Zeile haette jede Datei des Servers geliefert.
 *
 * Die Erzeugung selbst (`generateFromTemplate`) ist ersetzt; gelesen wird die
 * echte System-Vorlage unter public/system-dokumente/.
 */

const mockGetSession = jest.fn();
const mockResolver = jest.fn();
const mockGenerate = jest.fn();

const mockPrisma = {
  documentTemplate: { findUnique: jest.fn() },
  organization: { findUnique: jest.fn() },
  generatedDocument: { create: jest.fn() },
  auditLog: { create: jest.fn() },
  userOrgAssignment: { findUnique: jest.fn() },
};

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/doc-template-resolvers", () => ({
  getResolver: () => mockResolver,
}));
jest.mock("@/lib/doc-generation", () => ({
  generateFromTemplate: (...args: unknown[]) => mockGenerate(...args),
}));
jest.mock("@/lib/file-upload", () => ({
  ...jest.requireActual("@/lib/file-upload"),
  saveUploadedFile: jest.fn().mockResolvedValue("uploads/brief-vorlagen-generiert/x/datei.docx"),
}));

import { NextRequest } from "next/server";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { POST } from "@/app/api/brief-vorlagen/[id]/generate/route";

const HR = { userId: "hr-1", email: "hr@credo-gruppe.de", role: "HR_SACHBEARBEITER", firstName: "H", lastName: "R" };
const VORLAGE_ID = "8d0f2c1e-6a3b-4c5d-9e7f-0a1b2c3d4e5f";
const ASSET = path.join(process.cwd(), "public", "system-dokumente", "uebergabeprotokoll-ausstattung.docx");

const LISTE = [
  {
    ausgabe_stelle: "IT-Abteilung",
    gegenstaende: [{ ausgabe_gegenstand: "Dienst-iPad", ausgabe_kennung: "FES-IPAD-0412", ausgabe_uebergeben_am: "28.01.2027" }],
  },
];

function vorlage(teil: Record<string, unknown> = {}) {
  return {
    id: VORLAGE_ID,
    name: "Übergabeprotokoll Ausstattung",
    modul: "ONBOARDING",
    dateipfad: ASSET,
    organizationId: null,
    isActive: true,
    platzhalter: ["ausgaben_je_stelle", "ausgabe_kennung", "vorname"],
    ...teil,
  };
}

function erzeugen(body: Record<string, unknown>) {
  return POST(
    new NextRequest(`http://localhost/api/brief-vorlagen/${VORLAGE_ID}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: VORLAGE_ID }) },
  );
}

let fremd: string;

beforeEach(async () => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue(HR);
  mockPrisma.documentTemplate.findUnique.mockResolvedValue(vorlage());
  mockPrisma.organization.findUnique.mockResolvedValue({ id: "org-1", name: "Grundschule", mandantNumber: "771" });
  mockPrisma.generatedDocument.create.mockResolvedValue({ id: "gen-1" });
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockResolver.mockResolvedValue({
    data: { vorname: "Erika", nachname: "Beispiel", ausgaben_je_stelle: LISTE, ausgaben_anzahl: "1" },
    sensitiveFields: [],
  });
  mockGenerate.mockResolvedValue({ docx: Buffer.from("PK-docx"), missing: [] });
  fremd = await mkdtemp(path.join(os.tmpdir(), "s33-generate-"));
});

afterEach(async () => {
  await rm(fremd, { recursive: true, force: true });
});

describe("Handwerte und Listen", () => {
  it("ein Handwert fuer eine Liste oder einen inneren Namen wird ignoriert, gewoehnliche Handwerte ueberschreiben", async () => {
    const res = await erzeugen({
      format: "docx",
      refId: "onb-1",
      values: {
        ausgaben_je_stelle: "von Hand",
        ausgabe_kennung: "HAND-1",
        gegenstaende: "x",
        vorname: "Erika-Maria",
        ort: "Minden",
      },
    });
    expect(res.status).toBe(200);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    const [, daten] = mockGenerate.mock.calls[0];
    expect(daten.ausgaben_je_stelle).toBe(LISTE);
    expect(daten).not.toHaveProperty("ausgabe_kennung");
    expect(daten).not.toHaveProperty("gegenstaende");
    expect(daten.vorname).toBe("Erika-Maria");
    expect(daten.ort).toBe("Minden");
    expect(daten.ausgaben_anzahl).toBe("1");
  });

  it("auch ohne Vorgang (Resolver liefert keine Liste) nimmt ein Listenname keinen Handwert an", async () => {
    mockResolver.mockResolvedValue({ data: { datum: "13.10.2026" }, sensitiveFields: [] });
    await erzeugen({ format: "docx", values: { ausgaben_je_stelle: "von Hand", rueckgabe_zustand: "zurück" } });
    const [, daten] = mockGenerate.mock.calls[0];
    expect(daten).toEqual({ datum: "13.10.2026" });
  });

  it("reicht die Platzhalter der Vorlage an den Resolver (sensible Felder nur auf Anforderung)", async () => {
    await erzeugen({ format: "docx", refId: "onb-1" });
    expect(mockResolver).toHaveBeenCalledWith(
      expect.objectContaining({ refId: "onb-1", placeholders: ["ausgaben_je_stelle", "ausgabe_kennung", "vorname"] }),
    );
  });
});

describe("Vorlagendatei nur aus den Wurzeln", () => {
  it("liest die System-Vorlage unter public/system-dokumente/", async () => {
    const res = await erzeugen({ format: "docx", refId: "onb-1" });
    expect(res.status).toBe(200);
    const [quelle] = mockGenerate.mock.calls[0];
    expect(Buffer.compare(quelle, await readFile(ASSET))).toBe(0);
  });

  it("ein Pfad ausserhalb der Wurzeln wird abgewiesen – ohne die Datei zu lesen oder etwas zu erzeugen", async () => {
    const datei = path.join(fremd, "geheim.docx");
    await writeFile(datei, Buffer.from("PK geheim"));
    mockPrisma.documentTemplate.findUnique.mockResolvedValue(vorlage({ dateipfad: datei }));

    const res = await erzeugen({ format: "docx", refId: "onb-1" });

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Vorlagendatei nicht gefunden (Speicher)");
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockResolver).not.toHaveBeenCalled();
    expect(mockPrisma.generatedDocument.create).not.toHaveBeenCalled();
  });

  it("ein Weg nach oben aus der Wurzel heraus wird ebenso abgewiesen", async () => {
    const ausbruch = path.join(process.cwd(), "public", "system-dokumente", "..", "..", "package.json");
    mockPrisma.documentTemplate.findUnique.mockResolvedValue(vorlage({ dateipfad: ausbruch }));
    const res = await erzeugen({ format: "docx" });
    expect(res.status).toBe(500);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("eine fehlende Datei unter der Wurzel bekommt dieselbe Antwort", async () => {
    mockPrisma.documentTemplate.findUnique.mockResolvedValue(
      vorlage({ dateipfad: path.join(process.cwd(), "public", "system-dokumente", "gibt-es-nicht.docx") }),
    );
    const res = await erzeugen({ format: "docx" });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Vorlagendatei nicht gefunden (Speicher)");
  });
});
