/**
 * Tests: Unterschriebenes Uebergabeprotokoll hochladen
 * (POST /api/onboarding/[id]/documents) — Ausstattung & Zugaenge, Stufe 2,
 * Feinplan A4, S34, G19.
 *
 * WORAUF DIE ZUSICHERUNGEN ZIELEN
 *
 *  1. Nur HR_EDIT_ROLES (403); Mandant per canAccessProcess — unbekannt und
 *     fremd ergeben dieselbe 404 mit demselben Text, ohne ein Byte zu schreiben.
 *  2. Groesse: `Content-Length` ueber der Grenze ergibt 413, OHNE den Body zu
 *     lesen (`formData` nie aufgerufen, `bodyUsed` falsch, keine Datenbank);
 *     ohne Kopf wird mitgezaehlt (413 statt kaputtem Formular); eine Datei
 *     ueber 9 MB ergibt 413, genau 9 MB sind erlaubt.
 *  3. Nur `type = UEBERGABEPROTOKOLL` (sonst 400), genau eine nicht leere Datei.
 *  4. Typ allein aus den Bytes (415 bzw. 400 fuer ein abgeschnittenes PDF), nie
 *     aus `file.type` oder der Endung; der Anzeigename traegt die Endung des
 *     erkannten Typs.
 *  5. Ablage `uploads/<onboardingId>/<dokumentId>.<ext>` — der Name der Person
 *     steht nie im Pfad. Dokument (APPROVED, reviewedAt/-ById) und
 *     `DOCUMENT_UPLOADED` in EINER Transaktion, ohne Dateinamen im Protokoll;
 *     scheitert die Transaktion, ist die Datei wieder weg.
 *  6. Reihenfolge 403 → 413 → 400 → 404 → 415 (Feinplan 1.6).
 *
 * Die Dateien liegen echt in einem Verzeichnis unter os.tmpdir(); das
 * Arbeitsverzeichnis zeigt fuer die Dauer der Tests dorthin (Muster
 * onboarding-dokument-download.test.ts).
 */

const mockGetSession = jest.fn();
const mockCanAccessProcess = jest.fn();

const mockPrisma = {
  onboardingProcess: { findUnique: jest.fn() },
  document: { create: jest.fn() },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(),
};

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/permissions", () => ({
  ...jest.requireActual("@/lib/permissions"),
  canAccessProcess: (...args: unknown[]) => mockCanAccessProcess(...args),
}));

import { POST } from "@/app/api/onboarding/[id]/documents/route";
import { NextRequest } from "next/server";
import { mkdtemp, readdir, readFile, rm } from "fs/promises";
import os from "os";
import path from "path";
import {
  PROTOKOLL_MAX_ANFRAGE_BYTES,
  PROTOKOLL_MAX_BYTES,
  PROTOKOLL_UPLOAD_MELDUNGEN,
} from "@/lib/ausgaben";

const VORGANG = "3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const HR_SESSION = {
  userId: "hr-1",
  email: "hr@credo-gruppe.de",
  role: "HR_SACHBEARBEITER",
  firstName: "H",
  lastName: "R",
};

/** Ein vollstaendiges PDF: `%PDF-` am Anfang, `%%EOF` am Ende. */
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n", "latin1");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

let basis: string;
let cwd: jest.SpyInstance;

function datei(inhalt: Buffer | Uint8Array, name = "Übergabeprotokoll Müller.pdf", typ = "application/pdf"): File {
  return new File([new Uint8Array(inhalt)], name, { type: typ });
}

function formular(opts: { dateien?: File[]; type?: string | null } = {}): FormData {
  const f = new FormData();
  for (const d of opts.dateien ?? [datei(PDF)]) f.append("datei", d);
  const typ = opts.type === undefined ? "UEBERGABEPROTOKOLL" : opts.type;
  if (typ !== null) f.set("type", typ);
  return f;
}

function anfrage(form: FormData, id = VORGANG, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost:3000/api/onboarding/${id}/documents`, {
    method: "POST",
    body: form,
    headers,
  });
}

function hochladen(req: NextRequest, id = VORGANG) {
  return POST(req, { params: Promise.resolve({ id }) });
}

/** Alle Dateien unter uploads/ (relativ zum Arbeitsverzeichnis, mit „/"), rekursiv. */
async function abgelegt(verzeichnis = path.join(basis, "uploads")): Promise<string[]> {
  let eintraege;
  try {
    eintraege = await readdir(verzeichnis, { withFileTypes: true });
  } catch {
    return [];
  }
  const dateien: string[] = [];
  for (const e of eintraege) {
    const voll = path.join(verzeichnis, e.name);
    if (e.isDirectory()) dateien.push(...(await abgelegt(voll)));
    else if (e.isFile()) dateien.push(path.relative(basis, voll).split(path.sep).join("/"));
  }
  return dateien;
}

function angelegt(): Record<string, unknown> {
  expect(mockPrisma.document.create).toHaveBeenCalledTimes(1);
  return mockPrisma.document.create.mock.calls[0][0].data;
}

beforeEach(async () => {
  jest.clearAllMocks();
  basis = await mkdtemp(path.join(os.tmpdir(), "a4-protokoll-"));
  cwd = jest.spyOn(process, "cwd").mockReturnValue(basis);
  mockGetSession.mockResolvedValue(HR_SESSION);
  mockCanAccessProcess.mockResolvedValue(true);
  mockPrisma.onboardingProcess.findUnique.mockResolvedValue({ id: VORGANG, organizationId: "org-1" });
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma));
  mockPrisma.document.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
    id: data.id,
    fileName: data.fileName,
    fileSize: data.fileSize,
    type: data.type,
    status: data.status,
    uploadedAt: new Date("2026-10-13T08:00:00Z"),
  }));
  mockPrisma.auditLog.create.mockResolvedValue({});
});

afterEach(async () => {
  cwd.mockRestore();
  await rm(basis, { recursive: true, force: true });
});

// =============================================
// Erfolg: Ablage, Zeile, Protokoll
// =============================================

describe("Hochladen des unterschriebenen Uebergabeprotokolls", () => {
  it("legt Datei und Dokument an und antwortet 201", async () => {
    const res = await hochladen(anfrage(formular()));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toMatchObject({
      type: "UEBERGABEPROTOKOLL",
      status: "APPROVED",
      fileName: "Übergabeprotokoll Müller.pdf",
      fileSize: PDF.length,
      meldung: PROTOKOLL_UPLOAD_MELDUNGEN.ERFOLG,
    });

    const daten = angelegt();
    expect(daten).toMatchObject({
      onboardingId: VORGANG,
      type: "UEBERGABEPROTOKOLL",
      fileName: "Übergabeprotokoll Müller.pdf",
      fileSize: PDF.length,
      mimeType: "application/pdf",
      status: "APPROVED",
      reviewedById: "hr-1",
    });
    expect(daten.reviewedAt).toBeInstanceOf(Date);
    expect(json.id).toBe(daten.id);
  });

  it("legt unter uploads/<onboardingId>/<dokumentId>.pdf ab — ohne den Namen der Person im Pfad", async () => {
    await hochladen(anfrage(formular()));
    const daten = angelegt();
    expect(daten.filePath).toMatch(new RegExp(`^uploads/${VORGANG}/${UUID}\\.pdf$`));
    expect(daten.filePath).toBe(`uploads/${VORGANG}/${daten.id}.pdf`);
    expect(String(daten.filePath)).not.toMatch(/M(ü|ue)ller|bergabe/);

    // Genau diese Datei liegt auf der Platte, mit genau diesen Bytes.
    expect(await abgelegt()).toEqual([daten.filePath]);
    expect(await readFile(path.join(basis, String(daten.filePath)))).toEqual(PDF);
  });

  it("schreibt Dokument und Protokoll in EINER Transaktion, das Protokoll ohne Dateinamen", async () => {
    await hochladen(anfrage(formular()));
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    const eintrag = mockPrisma.auditLog.create.mock.calls[0][0].data;
    expect(eintrag).toEqual({
      onboardingId: VORGANG,
      userId: "hr-1",
      processType: "ONBOARDING",
      action: "DOCUMENT_UPLOADED",
      details: {
        documentId: angelegt().id,
        dokumentTyp: "UEBERGABEPROTOKOLL",
        groesse: PDF.length,
        mimeType: "application/pdf",
      },
    });
    expect(JSON.stringify(eintrag)).not.toMatch(/ller|bergabeprotokoll Mü/);
    // Zeile vor Protokoll — beides in derselben Transaktion.
    expect(mockPrisma.document.create.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrisma.auditLog.create.mock.invocationCallOrder[0],
    );
  });

  it("nimmt den Typ aus den Bytes, nicht aus Endung oder file.type", async () => {
    // PNG-Bytes, als „scan.hta" mit angeblichem PDF-Typ geschickt.
    const res = await hochladen(anfrage(formular({ dateien: [datei(PNG, "scan.hta", "application/pdf")] })));
    expect(res.status).toBe(201);
    const daten = angelegt();
    expect(daten.mimeType).toBe("image/png");
    expect(daten.fileName).toBe("scan.png");
    expect(daten.filePath).toMatch(new RegExp(`^uploads/${VORGANG}/${UUID}\\.png$`));
  });

  it("erlaubt genau 9 MB", async () => {
    const gross = Buffer.alloc(PROTOKOLL_MAX_BYTES, 0x20);
    PDF.copy(gross, 0, 0, 9);
    gross.write("%%EOF\n", PROTOKOLL_MAX_BYTES - 6, "latin1");
    const res = await hochladen(anfrage(formular({ dateien: [datei(gross)] })));
    expect(res.status).toBe(201);
    expect(angelegt().fileSize).toBe(PROTOKOLL_MAX_BYTES);
  });

  it("entfernt die Datei wieder, wenn die Transaktion scheitert", async () => {
    mockPrisma.$transaction.mockRejectedValue(new Error("DB weg"));
    const fehler = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const res = await hochladen(anfrage(formular()));
      expect(res.status).toBe(500);
    } finally {
      fehler.mockRestore();
    }
    expect(await abgelegt()).toEqual([]);
  });
});

// =============================================
// Rolle und Mandant
// =============================================

describe("Rolle und Mandant", () => {
  it.each(["EINRICHTUNGSLEITUNG", "VORGESETZTER", "SERVICE"])("%s bekommt 403 und schreibt nichts", async (rolle) => {
    mockGetSession.mockResolvedValue({ ...HR_SESSION, role: rolle });
    const res = await hochladen(anfrage(formular()));
    expect(res.status).toBe(403);
    expect(mockPrisma.onboardingProcess.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.document.create).not.toHaveBeenCalled();
    expect(await abgelegt()).toEqual([]);
  });

  it("ohne Sitzung 401", async () => {
    mockGetSession.mockResolvedValue(null);
    expect((await hochladen(anfrage(formular()))).status).toBe(401);
  });

  it("unbekannter Vorgang und fremder Mandant: dieselbe 404 mit demselben Text, nichts geschrieben", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(null);
    const unbekannt = await hochladen(anfrage(formular()));

    mockPrisma.onboardingProcess.findUnique.mockResolvedValue({ id: VORGANG, organizationId: "org-2" });
    mockCanAccessProcess.mockResolvedValue(false);
    const fremd = await hochladen(anfrage(formular()));

    expect(unbekannt.status).toBe(404);
    expect(fremd.status).toBe(404);
    expect(await unbekannt.json()).toEqual(await fremd.json());
    expect(mockPrisma.document.create).not.toHaveBeenCalled();
    expect(await abgelegt()).toEqual([]);
  });

  it("eine ID ohne UUID-Form ist unbekannt — ohne Datenbank und ohne Verzeichnis", async () => {
    const res = await hochladen(anfrage(formular(), "../bem"), "../bem");
    expect(res.status).toBe(404);
    expect(mockPrisma.onboardingProcess.findUnique).not.toHaveBeenCalled();
    expect(await abgelegt()).toEqual([]);
  });
});

// =============================================
// Groesse: vor dem Lesen, gezaehlt, je Datei
// =============================================

describe("Groesse", () => {
  it("Content-Length ueber der Grenze: 413, ohne den Body zu lesen", async () => {
    const req = anfrage(formular(), VORGANG, { "content-length": String(PROTOKOLL_MAX_ANFRAGE_BYTES + 1) });
    const formData = jest.spyOn(req, "formData");
    const arrayBuffer = jest.spyOn(req, "arrayBuffer");
    const res = await hochladen(req);
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe(PROTOKOLL_UPLOAD_MELDUNGEN.ZU_GROSS);
    expect(formData).not.toHaveBeenCalled();
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(req.bodyUsed).toBe(false);
    expect(mockPrisma.onboardingProcess.findUnique).not.toHaveBeenCalled();
    expect(await abgelegt()).toEqual([]);
  });

  it("ohne Content-Length wird mitgezaehlt: 413 statt kaputtem Formular", async () => {
    const riesig = datei(Buffer.alloc(PROTOKOLL_MAX_ANFRAGE_BYTES + 1, 0x20));
    const req = anfrage(formular({ dateien: [riesig] }));
    req.headers.delete("content-length");
    const res = await hochladen(req);
    expect(res.status).toBe(413);
    expect(mockPrisma.onboardingProcess.findUnique).not.toHaveBeenCalled();
  });

  it("eine Datei ueber 9 MB: 413, auch wenn die Anfrage selbst unter der Grenze bleibt", async () => {
    const res = await hochladen(anfrage(formular({ dateien: [datei(Buffer.alloc(PROTOKOLL_MAX_BYTES + 1, 0x20))] })));
    expect(res.status).toBe(413);
    expect(mockPrisma.document.create).not.toHaveBeenCalled();
    expect(await abgelegt()).toEqual([]);
  });

  it("413 kommt vor der Pruefung des Vorgangs", async () => {
    mockCanAccessProcess.mockResolvedValue(false);
    const req = anfrage(formular(), VORGANG, { "content-length": String(PROTOKOLL_MAX_ANFRAGE_BYTES + 1) });
    expect((await hochladen(req)).status).toBe(413);
    expect(mockCanAccessProcess).not.toHaveBeenCalled();
  });
});

// =============================================
// Formular und Art
// =============================================

describe("Formular und Art", () => {
  it.each([
    ["SONSTIGES", "SONSTIGES"],
    ["RUECKGABEPROTOKOLL", "RUECKGABEPROTOKOLL"],
    ["Kleinschreibung", "uebergabeprotokoll"],
    ["fehlt", null],
  ])("anderer type (%s): 400, nichts geschrieben", async (_name, type) => {
    const res = await hochladen(anfrage(formular({ type })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(PROTOKOLL_UPLOAD_MELDUNGEN.FALSCHE_ART);
    expect(mockPrisma.document.create).not.toHaveBeenCalled();
    expect(await abgelegt()).toEqual([]);
  });

  it("ohne Datei, mit zwei Dateien oder mit einer leeren Datei: 400", async () => {
    for (const dateien of [[], [datei(PDF), datei(PDF)], [datei(Buffer.alloc(0))]]) {
      const res = await hochladen(anfrage(formular({ dateien })));
      expect(res.status).toBe(400);
    }
    expect(mockPrisma.document.create).not.toHaveBeenCalled();
  });

  it("ein Text statt einer Datei im Feld datei: 400", async () => {
    const f = new FormData();
    f.set("datei", "keine Datei");
    f.set("type", "UEBERGABEPROTOKOLL");
    expect((await hochladen(anfrage(f))).status).toBe(400);
  });

  it("400 kommt vor 404", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(null);
    expect((await hochladen(anfrage(formular({ type: "SONSTIGES" })))).status).toBe(400);
    expect(mockPrisma.onboardingProcess.findUnique).not.toHaveBeenCalled();
  });
});

// =============================================
// Typ aus den Bytes
// =============================================

describe("Typ aus den Bytes", () => {
  it("falscher Typ: 415, nichts geschrieben", async () => {
    const res = await hochladen(anfrage(formular({ dateien: [datei(Buffer.from("Hallo Welt"), "protokoll.pdf")] })));
    expect(res.status).toBe(415);
    expect((await res.json()).error).toBe(PROTOKOLL_UPLOAD_MELDUNGEN.TYP_NICHT_ERLAUBT);
    expect(mockPrisma.document.create).not.toHaveBeenCalled();
    expect(await abgelegt()).toEqual([]);
  });

  it("ein abgeschnittenes PDF: 400 mit Handlungsanweisung", async () => {
    const res = await hochladen(anfrage(formular({ dateien: [datei(Buffer.from("%PDF-1.4\nabgebrochen"))] })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(PROTOKOLL_UPLOAD_MELDUNGEN.PDF_UNVOLLSTAENDIG);
    expect(await abgelegt()).toEqual([]);
  });

  it("404 kommt vor 415", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(null);
    const res = await hochladen(anfrage(formular({ dateien: [datei(Buffer.from("Hallo Welt"))] })));
    expect(res.status).toBe(404);
  });
});
