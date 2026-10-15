/**
 * Tests: Hochgeladenes Uebergabeprotokoll entfernen
 * (DELETE /api/onboarding/[id]/documents/[docId]) — Ausstattung & Zugaenge,
 * Stufe 2, Feinplan A4, G19, Review A4d.
 *
 * WARUM
 *
 * HR laedt das unterschriebene Uebergabeprotokoll ueber
 * `POST /api/onboarding/[id]/documents` hoch. Ohne Loeschweg blieb eine
 * Fehlablage — etwa das Protokoll einer anderen Person mit Name, Unterschrift
 * und Kennungen — in der Akte: Der DELETE der Fragebogen-Route nimmt den Typ
 * bewusst aus, und der Lauf „Aufbewahrung“ loescht erst mit der letzten
 * Ausgabe des Vorgangs (Art. 5 Abs. 1 lit. d, Art. 17 DSGVO).
 *
 * WORAUF DIE ZUSICHERUNGEN ZIELEN
 *
 *  1. Nur HR_EDIT_ROLES (401/403); Mandant per canAccessProcess — unbekannt und
 *     fremd ergeben dieselbe 404, ohne eine Datei anzufassen.
 *  2. Nur `UEBERGABEPROTOKOLL`: Die Bedingung steht in der Abfrage selbst; ein
 *     Nachweis der Person (oder ein Dokument eines anderen Vorgangs) ist fuer
 *     diesen Weg unbekannt — 404, Datei und Zeile bleiben.
 *  3. Datei zuerst (nur unter uploads/<onboardingId>), dann Zeile + AuditLog
 *     `DOCUMENT_DELETED` in EINER Transaktion — im Protokoll nur ID, Typ und
 *     Ergebnis an der Datei, nie der Dateiname.
 *  4. Fehlt die Datei schon: Zeile trotzdem weg („fehlte“). Liegt der Pfad
 *     ausserhalb des Vorgangsordners: 500, Zeile bleibt, keine Datei ausserhalb
 *     wird angefasst.
 *  5. Ein gleichzeitiger zweiter Aufruf, der die Zeile nicht mehr findet: 404,
 *     kein zweiter Protokolleintrag.
 *  6. Unabhaengig vom Status des Vorgangs (keine Statusabfrage).
 *
 * Die Dateien liegen echt in einem Verzeichnis unter os.tmpdir(); das
 * Arbeitsverzeichnis zeigt fuer die Dauer der Tests dorthin (Muster
 * onboarding-dokument-download.test.ts).
 */

const mockGetSession = jest.fn();
const mockCanAccessProcess = jest.fn();

const mockPrisma = {
  onboardingProcess: { findUnique: jest.fn() },
  document: { findFirst: jest.fn(), deleteMany: jest.fn() },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(),
};

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/permissions", () => ({
  ...jest.requireActual("@/lib/permissions"),
  canAccessProcess: (...args: unknown[]) => mockCanAccessProcess(...args),
}));

import { DELETE } from "@/app/api/onboarding/[id]/documents/[docId]/route";
import { NextRequest } from "next/server";
import { access, mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { PROTOKOLL_UPLOAD_MELDUNGEN } from "@/lib/ausgaben";

const VORGANG = "3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b";
const ANDERER = "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d";
const DOK_ID = "7b6a5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c5d";

const HR_SESSION = {
  userId: "hr-1",
  email: "hr@credo-gruppe.de",
  role: "HR_SACHBEARBEITER",
  firstName: "H",
  lastName: "R",
};

const DOKUMENT = { id: DOK_ID, filePath: `uploads/${VORGANG}/${DOK_ID}.pdf` };

let basis: string;
let cwd: jest.SpyInstance;

async function ablegen(relativ: string): Promise<string> {
  const ziel = path.join(basis, ...relativ.split("/"));
  await mkdir(path.dirname(ziel), { recursive: true });
  await writeFile(ziel, Buffer.from("%PDF-1.4\n%%EOF\n", "latin1"));
  return ziel;
}

async function gibtEs(datei: string): Promise<boolean> {
  try {
    await access(datei);
    return true;
  } catch {
    return false;
  }
}

function entfernen(id = VORGANG, docId = DOK_ID) {
  return DELETE(new NextRequest(`http://localhost/api/onboarding/${id}/documents/${docId}`, { method: "DELETE" }), {
    params: Promise.resolve({ id, docId }),
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  basis = await mkdtemp(path.join(os.tmpdir(), "a4-protokoll-entfernen-"));
  cwd = jest.spyOn(process, "cwd").mockReturnValue(basis);
  mockGetSession.mockResolvedValue(HR_SESSION);
  mockCanAccessProcess.mockResolvedValue(true);
  mockPrisma.onboardingProcess.findUnique.mockResolvedValue({ id: VORGANG, organizationId: "org-1" });
  mockPrisma.document.findFirst.mockResolvedValue({ ...DOKUMENT });
  mockPrisma.document.deleteMany.mockResolvedValue({ count: 1 });
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma));
});

afterEach(async () => {
  cwd.mockRestore();
  await rm(basis, { recursive: true, force: true });
});

// =============================================
// 1. Wer darf
// =============================================

describe("Berechtigung und Mandant", () => {
  it("ohne Sitzung 401, ohne Bearbeitungsrecht 403 – nichts gelesen, nichts geloescht", async () => {
    const datei = await ablegen(DOKUMENT.filePath);
    mockGetSession.mockResolvedValueOnce(null);
    expect((await entfernen()).status).toBe(401);
    for (const role of ["EINRICHTUNGSLEITUNG", "VORGESETZTER", "SERVICE"]) {
      mockGetSession.mockResolvedValueOnce({ ...HR_SESSION, role });
      expect({ role, status: (await entfernen()).status }).toEqual({ role, status: 403 });
    }
    expect(mockPrisma.onboardingProcess.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.document.deleteMany).not.toHaveBeenCalled();
    expect(await gibtEs(datei)).toBe(true);
  });

  it("unbekannter Vorgang und fremder Mandant: dieselbe 404 mit demselben Text, Datei bleibt", async () => {
    const datei = await ablegen(DOKUMENT.filePath);
    mockPrisma.onboardingProcess.findUnique.mockResolvedValueOnce(null);
    const unbekannt = await entfernen();
    mockCanAccessProcess.mockResolvedValueOnce(false);
    const fremd = await entfernen();
    expect(unbekannt.status).toBe(404);
    expect(fremd.status).toBe(404);
    expect(await unbekannt.json()).toEqual(await fremd.json());
    expect(mockPrisma.document.findFirst).toHaveBeenCalledTimes(0);
    expect(mockPrisma.document.deleteMany).not.toHaveBeenCalled();
    expect(await gibtEs(datei)).toBe(true);
  });
});

// =============================================
// 2. Nur das Uebergabeprotokoll
// =============================================

describe("nur UEBERGABEPROTOKOLL", () => {
  it("die Abfrage verlangt Vorgang UND Typ", async () => {
    await ablegen(DOKUMENT.filePath);
    await entfernen();
    expect(mockPrisma.document.findFirst).toHaveBeenCalledWith({
      where: { id: DOK_ID, onboardingId: VORGANG, type: "UEBERGABEPROTOKOLL" },
      select: { id: true, filePath: true },
    });
    expect(mockPrisma.document.deleteMany).toHaveBeenCalledWith({
      where: { id: DOK_ID, onboardingId: VORGANG, type: "UEBERGABEPROTOKOLL" },
    });
  });

  it("ein anderes Dokument (Nachweis der Person, anderer Vorgang): 404, Datei und Zeile bleiben", async () => {
    const datei = await ablegen(`uploads/${VORGANG}/nachweis.pdf`);
    // Die Abfrage mit Typ-Bedingung findet den Nachweis nicht.
    mockPrisma.document.findFirst.mockResolvedValueOnce(null);
    const res = await entfernen(VORGANG, "nachweis");
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Dokument nicht gefunden");
    expect(mockPrisma.document.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect(await gibtEs(datei)).toBe(true);
  });
});

// =============================================
// 3./4. Datei vor Zeile, Protokoll
// =============================================

describe("Loeschen", () => {
  it("Datei weg, Zeile weg, DOCUMENT_DELETED ohne Dateinamen – 200 mit Meldung", async () => {
    const datei = await ablegen(DOKUMENT.filePath);
    const res = await entfernen();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: DOK_ID, meldung: PROTOKOLL_UPLOAD_MELDUNGEN.ENTFERNT });
    expect(await gibtEs(datei)).toBe(false);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: "hr-1",
        onboardingId: VORGANG,
        processType: "ONBOARDING",
        action: "DOCUMENT_DELETED",
        details: { documentId: DOK_ID, dokumentTyp: "UEBERGABEPROTOKOLL", datei: "geloescht" },
      },
    });
    expect(JSON.stringify(mockPrisma.auditLog.create.mock.calls)).not.toContain(".pdf");
  });

  it("die Datei wird VOR der Zeile geloescht", async () => {
    const datei = await ablegen(DOKUMENT.filePath);
    let dateiBeimZeileLoeschen: boolean | null = null;
    mockPrisma.document.deleteMany.mockImplementationOnce(async () => {
      dateiBeimZeileLoeschen = await gibtEs(datei);
      return { count: 1 };
    });
    await entfernen();
    expect(dateiBeimZeileLoeschen).toBe(false);
  });

  it("fehlt die Datei schon, verschwindet die Zeile trotzdem („fehlte“)", async () => {
    const res = await entfernen();
    expect(res.status).toBe(200);
    expect(mockPrisma.document.deleteMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.details.datei).toBe("fehlte");
  });

  it("Pfad ausserhalb des Vorgangsordners: 500, Zeile bleibt, die fremde Datei auch", async () => {
    const fremd = await ablegen(`uploads/${ANDERER}/fremd.pdf`);
    mockPrisma.document.findFirst.mockResolvedValueOnce({ id: DOK_ID, filePath: `uploads/${ANDERER}/fremd.pdf` });
    const fehler = jest.spyOn(console, "error").mockImplementation(() => {});
    const res = await entfernen();
    fehler.mockRestore();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe(PROTOKOLL_UPLOAD_MELDUNGEN.ENTFERNEN_DATEI_FEHLER);
    expect(mockPrisma.document.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect(await gibtEs(fremd)).toBe(true);
  });
});

// =============================================
// 5./6. Gleichzeitig, Status
// =============================================

describe("Gleichzeitigkeit und Status", () => {
  it("hat ein zweiter Aufruf die Zeile schon geloescht: 404, kein Protokolleintrag", async () => {
    mockPrisma.document.deleteMany.mockResolvedValueOnce({ count: 0 });
    const res = await entfernen();
    expect(res.status).toBe(404);
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("fragt den Status des Vorgangs nicht ab – eine Fehlablage laesst sich immer berichtigen", async () => {
    await entfernen();
    expect(mockPrisma.onboardingProcess.findUnique).toHaveBeenCalledWith({
      where: { id: VORGANG },
      select: { id: true, organizationId: true },
    });
  });
});
