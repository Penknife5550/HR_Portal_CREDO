/**
 * Tests: Download eines Onboarding-Dokuments
 * (GET /api/onboarding/[id]/documents/[docId]) — gehaertet mit Paket 4
 *
 * ============================================================================
 * WARUM (Feinplanung 6.2)
 * ============================================================================
 *
 * Die Route pruefte nur die Sitzung: keine Rolle, keinen Mandanten, kein
 * `no-store`, kein Protokoll. `getSession()` nimmt auch den n8n-Schluessel an
 * (Rolle SERVICE). Mit Paket 4 landen hier angenommene Nachweise nach Art. 9
 * und 10 DSGVO — Masernschutz, SB-Ausweis, Fuehrungszeugnis, Aufenthaltsstatus.
 *
 * ============================================================================
 * WORAUF DIE ZUSICHERUNGEN ZIELEN
 * ============================================================================
 *
 *  1. Nur Portal-Rollen; SERVICE bekommt 403.
 *  2. Mandant ueber canAccessProcess. Fremder Mandant, unbekannter Vorgang,
 *     unbekanntes Dokument und Dokument eines anderen Vorgangs: jeweils 404
 *     mit demselben Text — ein eigener Code verriete, dass es sie gibt.
 *  3. `no-store`: Personalunterlagen gehoeren in keinen Cache.
 *  4. Die ENDUNG des Download-Namens kommt aus dem gespeicherten Typ: Eine
 *     JPEG/HTA-Polyglot-Datei, die der Fragebogen als `x.hta` abgelegt hat,
 *     geht als `x.jpg` hinaus.
 *  5. Oeffnen eines sensiblen Nachweises steht im Protokoll
 *     (DOKUMENT_GEOEFFNET) — ohne Dateinamen; andere Arten nicht.
 *  6. Gelesen wird nur unter uploads/<onboardingId>.
 *
 * Die Dateien liegen echt in einem Verzeichnis unter os.tmpdir(); das
 * Arbeitsverzeichnis zeigt fuer die Dauer der Tests dorthin.
 */

const mockGetSession = jest.fn();
const mockCanAccessProcess = jest.fn();

const mockPrisma = {
  onboardingProcess: { findUnique: jest.fn() },
  document: { findFirst: jest.fn() },
  auditLog: { create: jest.fn() },
};

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/permissions", () => ({
  ...jest.requireActual("@/lib/permissions"),
  canAccessProcess: (...args: unknown[]) => mockCanAccessProcess(...args),
}));

import { GET } from "@/app/api/onboarding/[id]/documents/[docId]/route";
import { NextRequest } from "next/server";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { DOCX_MIME, ENDUNG_FUER_DATEITYP, istErkannterDateityp } from "@/lib/file-upload";

const VORGANG = "3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b";
const ANDERER = "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d";
const INHALT = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

const HR_SESSION = {
  userId: "hr-1",
  email: "hr@credo-gruppe.de",
  role: "HR_SACHBEARBEITER",
  firstName: "H",
  lastName: "R",
};

const DOKUMENT = {
  id: "d1",
  type: "PKV_NACHWEIS",
  fileName: "pkv.pdf",
  filePath: `uploads/${VORGANG}/pkv.pdf`,
  mimeType: "application/pdf",
};

let basis: string;
let cwd: jest.SpyInstance;

async function ablegen(relativ: string, inhalt: Buffer = INHALT): Promise<void> {
  const ziel = path.join(basis, ...relativ.split("/"));
  await mkdir(path.dirname(ziel), { recursive: true });
  await writeFile(ziel, inhalt);
}

function laden(id = VORGANG, docId = "d1") {
  return GET(new NextRequest(`http://localhost/api/onboarding/${id}/documents/${docId}`), {
    params: Promise.resolve({ id, docId }),
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  basis = await mkdtemp(path.join(os.tmpdir(), "p4-download-"));
  cwd = jest.spyOn(process, "cwd").mockReturnValue(basis);
  mockGetSession.mockResolvedValue(HR_SESSION);
  mockCanAccessProcess.mockResolvedValue(true);
  mockPrisma.onboardingProcess.findUnique.mockResolvedValue({ id: VORGANG, organizationId: "org-1" });
  mockPrisma.document.findFirst.mockResolvedValue({ ...DOKUMENT });
  mockPrisma.auditLog.create.mockResolvedValue({});
  await ablegen(DOKUMENT.filePath);
});

afterEach(async () => {
  cwd.mockRestore();
  await rm(basis, { recursive: true, force: true });
});

// =============================================
// 1./2. Wer darf, und wo die Grenze liegt
// =============================================

describe("Zugriff", () => {
  test("ohne Sitzung 401", async () => {
    mockGetSession.mockResolvedValue(null);
    expect((await laden()).status).toBe(401);
  });

  test("der n8n-Schluessel (SERVICE) bekommt 403 — nichts gelesen", async () => {
    mockGetSession.mockResolvedValue({ ...HR_SESSION, userId: "n8n", role: "SERVICE" });
    const antwort = await laden();
    expect(antwort.status).toBe(403);
    expect(await antwort.json()).toEqual({ error: "Keine Berechtigung" });
    expect(mockPrisma.document.findFirst).not.toHaveBeenCalled();
  });

  test("BEM-Beauftragte gehoeren nicht zu den Portal-Rollen → 403", async () => {
    mockGetSession.mockResolvedValue({ ...HR_SESSION, role: "BEM_BEAUFTRAGTER" });
    expect((await laden()).status).toBe(403);
  });

  test("eine Portal-Rolle ohne Bearbeitungsrecht (Fuehrungskraft) darf im eigenen Mandanten herunterladen", async () => {
    mockGetSession.mockResolvedValue({ ...HR_SESSION, role: "VORGESETZTER" });
    expect((await laden()).status).toBe(200);
    expect(mockCanAccessProcess).toHaveBeenCalledWith(expect.objectContaining({ role: "VORGESETZTER" }), "org-1");
  });

  test("fremder Mandant → 404 mit demselben Text wie ein unbekannter Vorgang, nicht 403", async () => {
    mockCanAccessProcess.mockResolvedValue(false);
    const fremd = await laden();
    expect(fremd.status).toBe(404);
    const text = await fremd.json();
    expect(text).toEqual({ error: "Vorgang nicht gefunden" });
    expect(mockPrisma.document.findFirst).not.toHaveBeenCalled();

    mockCanAccessProcess.mockResolvedValue(true);
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(null);
    const unbekannt = await laden();
    expect(unbekannt.status).toBe(404);
    expect(await unbekannt.json()).toEqual(text);
  });

  test("Dokument eines anderen Vorgangs → 404 wie ein unbekanntes (frueher 403 mit eigenem Text)", async () => {
    mockPrisma.document.findFirst.mockResolvedValue(null);
    const antwort = await laden();
    expect(antwort.status).toBe(404);
    expect(await antwort.json()).toEqual({ error: "Dokument nicht gefunden" });
    // Die Bindung steckt in der Abfrage selbst, nicht in einem Vergleich danach.
    expect(mockPrisma.document.findFirst.mock.calls[0][0].where).toEqual({ id: "d1", onboardingId: VORGANG });
  });

  test("gelesen wird nur unter uploads/<onboardingId> — ein Pfad in einem anderen Vorgang ist ungueltig", async () => {
    const stumm = jest.spyOn(console, "error").mockImplementation(() => {});
    await ablegen(`uploads/${ANDERER}/fremd.pdf`);
    mockPrisma.document.findFirst.mockResolvedValue({ ...DOKUMENT, filePath: `uploads/${ANDERER}/fremd.pdf` });
    expect((await laden()).status).toBe(400);

    mockPrisma.document.findFirst.mockResolvedValue({ ...DOKUMENT, filePath: `uploads/${VORGANG}/../${ANDERER}/fremd.pdf` });
    expect((await laden()).status).toBe(400);
    // Im Log nur die Dokument-ID, kein Pfad.
    expect(JSON.stringify(stumm.mock.calls)).not.toContain(ANDERER);
    stumm.mockRestore();
  });

  test("fehlt die Datei auf der Platte → 404, ohne Pfad im Log", async () => {
    const stumm = jest.spyOn(console, "error").mockImplementation(() => {});
    mockPrisma.document.findFirst.mockResolvedValue({ ...DOKUMENT, filePath: `uploads/${VORGANG}/weg.pdf` });
    const antwort = await laden();
    expect(antwort.status).toBe(404);
    expect(JSON.stringify(stumm.mock.calls)).not.toContain("weg.pdf");
    stumm.mockRestore();
  });
});

// =============================================
// 3./4. Kopfzeilen und Download-Name
// =============================================

describe("Kopfzeilen", () => {
  test("no-store, nosniff, attachment — und die Bytes der Datei", async () => {
    const antwort = await laden();
    expect(antwort.status).toBe(200);
    expect(antwort.headers.get("Cache-Control")).toBe("no-store");
    expect(antwort.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(antwort.headers.get("Content-Type")).toBe("application/pdf");
    expect(antwort.headers.get("Content-Disposition")).toBe('attachment; filename="pkv.pdf"');
    expect(Buffer.from(await antwort.arrayBuffer())).toEqual(INHALT);
  });

  test.each([
    ["x.hta mit JPEG-Bytes → x.jpg", "x.hta", "image/jpeg", "x.jpg"],
    ["x.pdf.html mit PDF → x.pdf (keine doppelte Endung)", "x.pdf.html", "application/pdf", "x.pdf"],
    ["Scan.PDF → Scan.pdf", "Scan.PDF", "application/pdf", "Scan.pdf"],
    ["ohne Endung → mit Endung", "Ausweis", "image/png", "Ausweis.png"],
    ["WebP", "foto.webp", "image/webp", "foto.webp"],
    ["Word (Fragebogen)", "vertrag.doc", "application/msword", "vertrag.doc"],
    ["Word neu (Fragebogen)", "vertrag.exe", DOCX_MIME, "vertrag.docx"],
    // Fuer die erkannten Typen dieselbe Regel wie beim Anzeigenamen (anzeigeNameBereinigen).
    ["leerer Stamm", ".hta", "image/jpeg", "Datei.jpg"],
    ["gleichwertige Endung .jpeg nicht doppelt", "scan.jpeg.hta", "image/jpeg", "scan.jpg"],
    ["Bidi-Zeichen fallen weg", "rechnung‮fdp.hta", "application/pdf", "rechnungfdp.pdf"],
    ["leerer Stamm bei Word", ".exe", DOCX_MIME, "Datei.docx"],
    ["Umlaute und Leerzeichen laufen ueber asciiFilename", "Führungszeugnis Müller.pdf", "application/pdf", "F_hrungszeugnis_M_ller.pdf"],
  ])("%s", async (_fall, fileName, mimeType, erwartet) => {
    mockPrisma.document.findFirst.mockResolvedValue({ ...DOKUMENT, fileName, mimeType });
    const antwort = await laden();
    expect(antwort.headers.get("Content-Disposition")).toBe(`attachment; filename="${erwartet}"`);
    expect(antwort.headers.get("Content-Type")).toBe(mimeType);
  });

  test("ein unbekannter Typ geht als application/octet-stream mit „.bin“ hinaus — nie mit einer ausfuehrbaren Endung", async () => {
    mockPrisma.document.findFirst.mockResolvedValue({ ...DOKUMENT, fileName: "evil.exe.hta", mimeType: "text/html" });
    const antwort = await laden();
    expect(antwort.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(antwort.headers.get("Content-Disposition")).toBe('attachment; filename="evil.exe.bin"');
  });

  test.each(["toString", "constructor", "__proto__", "hasOwnProperty"])(
    "ein geerbter Name wie „%s“ gilt nie als erkannter Typ (Typwaechter istErkannterDateityp)",
    async (mimeType) => {
      mockPrisma.document.findFirst.mockResolvedValue({ ...DOKUMENT, fileName: "x.hta", mimeType });
      const antwort = await laden();
      expect(antwort.status).toBe(200);
      expect(antwort.headers.get("Content-Type")).toBe("application/octet-stream");
      expect(antwort.headers.get("Content-Disposition")).toBe('attachment; filename="x.bin"');
    },
  );
});

describe("istErkannterDateityp — der gemeinsame Typwaechter", () => {
  test("genau die aus den Bytes erkannten Typen", () => {
    for (const typ of Object.keys(ENDUNG_FUER_DATEITYP)) expect(istErkannterDateityp(typ)).toBe(true);
    for (const typ of ["application/msword", DOCX_MIME, "text/html", "toString", "", null, undefined, 42]) {
      expect(istErkannterDateityp(typ)).toBe(false);
    }
  });
});

// =============================================
// 5. Protokoll bei sensiblen Nachweisen
// =============================================

describe("DOKUMENT_GEOEFFNET", () => {
  test.each(["AUFENTHALTSTITEL", "ARBEITSERLAUBNIS", "MASERNSCHUTZ", "SB_AUSWEIS", "FUEHRUNGSZEUGNIS"])(
    "%s: Protokoll mit Nutzer, Vorgang und Art — ohne Dateinamen",
    async (type) => {
      mockPrisma.document.findFirst.mockResolvedValue({ ...DOKUMENT, type, fileName: "Titel Anna Beispiel.pdf" });
      expect((await laden()).status).toBe(200);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
      const eintrag = mockPrisma.auditLog.create.mock.calls[0][0].data;
      expect(eintrag).toEqual({
        userId: "hr-1",
        onboardingId: VORGANG,
        processType: "ONBOARDING",
        action: "DOKUMENT_GEOEFFNET",
        details: { documentId: "d1", dokumentTyp: type },
      });
      expect(JSON.stringify(eintrag)).not.toContain("Anna");
    },
  );

  test.each(["PKV_NACHWEIS", "GEBURTSURKUNDE_EIGEN", "SONSTIGES"])("%s: kein Protokolleintrag", async (type) => {
    mockPrisma.document.findFirst.mockResolvedValue({ ...DOKUMENT, type });
    expect((await laden()).status).toBe(200);
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  test("ohne Protokolleintrag keine Datei: scheitert er, antwortet die Route 500", async () => {
    const stumm = jest.spyOn(console, "error").mockImplementation(() => {});
    mockPrisma.document.findFirst.mockResolvedValue({ ...DOKUMENT, type: "FUEHRUNGSZEUGNIS" });
    mockPrisma.auditLog.create.mockRejectedValue(new Error("weg"));
    expect((await laden()).status).toBe(500);
    stumm.mockRestore();
  });

  test("kein Protokoll, wenn gar nichts ausgeliefert wird (404)", async () => {
    mockPrisma.document.findFirst.mockResolvedValue(null);
    await laden();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });
});
