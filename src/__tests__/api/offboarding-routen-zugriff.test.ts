/**
 * Rolle und Mandant an den Unterrouten von /api/offboarding/:id —
 * Notizen, Dokumente, Exit-Interview, Zeugnis-Bewertung (Befund 12.10.2026).
 *
 * Bis 10/2026 pruefte keine dieser acht Routen mehr als die Anmeldung: Der
 * n8n-Schluessel (`getSession` liefert SERVICE bei passendem X-API-Key) konnte
 * Notizen anlegen, Dokumente hoch- und herunterladen und Exit-Interview-Links
 * versenden; mandantenbeschraenkte Rollen hielt nur das Mandanten-Gate der
 * Middleware auf. Hier:
 *
 *   - Rollen: Notizen und Dokumente lesen PORTAL_ROLES, Notizen anlegen
 *     PORTAL_ROLES (die Fuehrungskraft darf Notizen), Dokumente hochladen,
 *     Exit-Interview und Zeugnis-Bewertung HR_EDIT_ROLES (vertrauliche
 *     Befragung, Magic Links in der Antwort), HR-Review ADMIN_ROLES.
 *   - Mandant: unbekannt und fremd = dieselbe 404 mit demselben Text, ohne
 *     dass ein Kind-Objekt gelesen oder etwas geschrieben wird.
 *   - Kind-Objekte gebunden an den Vorgang: fremd = dieselbe 404 wie unbekannt.
 *   - Kernaktionen samt AuditLog im selben Commit, ohne Freitext und ohne
 *     Adresse der Person.
 */

const mockGetSession = jest.fn();
const mockTriggerWebhooks = jest.fn();
const mockFreigegeben = jest.fn();
const mockCanAccessProcess = jest.fn();
const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();
const mockUnlink = jest.fn();
const mockRealpath = jest.fn();

const mockPrisma = {
  offboardingProcess: { findUnique: jest.fn() },
  userOrgAssignment: { findUnique: jest.fn() },
  offboardingNote: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  offboardingDocument: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
  exitInterview: { findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  exitInterviewTemplate: { findFirst: jest.fn() },
  zeugnisBewertung: { findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  zeugnisBewertungTemplate: { findFirst: jest.fn() },
  zeugnisBewertungRating: { update: jest.fn() },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(),
};

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/webhooks", () => ({ triggerWebhooks: (...a: unknown[]) => mockTriggerWebhooks(...a) }));
jest.mock("@/lib/url", () => ({ getBaseUrl: () => "https://hr.example.org" }));
jest.mock("@/lib/abteilungsaufgaben-dienst", () => ({
  fuehrungskraftAdresseFreigegeben: (...a: unknown[]) => mockFreigegeben(...a),
}));
// canAccessProcess bleibt die echte Funktion; einzelne Tests erzwingen
// „fremder Mandant" fuer Rollen, die in Wirklichkeit alle Mandanten sehen.
jest.mock("@/lib/permissions", () => {
  const echt = jest.requireActual("@/lib/permissions");
  return { ...echt, canAccessProcess: (...a: unknown[]) => mockCanAccessProcess(...a) };
});
jest.mock("fs/promises", () => ({
  readFile: (...a: unknown[]) => mockReadFile(...a),
  writeFile: (...a: unknown[]) => mockWriteFile(...a),
  unlink: (...a: unknown[]) => mockUnlink(...a),
  realpath: (...a: unknown[]) => mockRealpath(...a),
  mkdir: jest.fn().mockResolvedValue(undefined),
  rmdir: jest.fn().mockResolvedValue(undefined),
}));

import path from "path";
import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { MELDUNGEN } from "@/lib/abteilungsaufgaben";
import { ADMIN_ROLES, HR_EDIT_ROLES, PORTAL_ROLES } from "@/lib/permissions";
import * as notizen from "@/app/api/offboarding/[id]/notes/route";
import * as notiz from "@/app/api/offboarding/[id]/notes/[noteId]/route";
import * as dokumente from "@/app/api/offboarding/[id]/documents/route";
import * as dokument from "@/app/api/offboarding/[id]/documents/[docId]/route";
import * as exitInterview from "@/app/api/offboarding/[id]/exit-interview/route";
import * as exitSenden from "@/app/api/offboarding/[id]/exit-interview/send/route";
import * as zeugnis from "@/app/api/offboarding/[id]/zeugnis-bewertung/route";
import * as hrReview from "@/app/api/offboarding/[id]/zeugnis-bewertung/hr-review/route";

const { canAccessProcess: echtesCanAccessProcess } = jest.requireActual("@/lib/permissions");

const ID = "0f1e2d3c-4b5a-4968-8776-655443322110";
const NOTE_ID = "1a2b3c4d-5e6f-4a5b-8c7d-0e1f2a3b4c5d";
const DOC_ID = "9a8b7c6d-5e4f-4321-8fed-cba987654321";
const ADMIN = { userId: "u-hr", email: "hr@example.org", role: "SUPER_ADMIN", firstName: "H", lastName: "R" };
const BASIS = `http://localhost/api/offboarding/${ID}`;
const UPLOAD_ORDNER = path.join(process.cwd(), "uploads", "offboarding", ID);

const VORGANG = {
  id: ID,
  organizationId: "org-1",
  employeePrivateEmail: "privat@example.org",
  lastWorkingDay: new Date("2026-10-31T00:00:00Z"),
  supervisorEmail: "fk@einrichtung.example.org",
  contractEnd: { supervisorEmail: "alt@einrichtung.example.org" },
};
const NOTIZ = {
  id: NOTE_ID,
  offboardingId: ID,
  content: "Gespräch am Freitag",
  createdById: ADMIN.userId,
  createdAt: new Date("2026-10-01T08:00:00Z"),
  updatedAt: new Date("2026-10-01T08:00:00Z"),
  createdBy: { firstName: "H", lastName: "R" },
};
const DOKUMENT = {
  id: DOC_ID,
  fileName: "Kündigung Müller.pdf",
  filePath: `uploads/offboarding/${ID}/1700000000000-abcdef12-K_ndigung_M_ller.pdf`,
  mimeType: "application/pdf",
};
const EI_VORLAGE = {
  id: "eit-1",
  name: "Standard",
  description: null,
  version: 1,
  introText: null,
  dsgvoText: null,
  categories: [],
};
const EXIT_INTERVIEW = {
  id: "ei-1",
  offboardingId: ID,
  token: "tok-ei",
  tokenExpiresAt: new Date("2099-01-01T00:00:00Z"),
  recipientEmail: "privat@example.org",
  status: "SCHEDULED",
  offboarding: {
    displayId: "OFF-2026-GYM-001",
    employeeFirstName: "Max",
    employeeLastName: "Muster",
    organization: { name: "FES Minden" },
  },
};
const ZB_VORLAGE = {
  id: "zbt-1",
  name: "Lehrkraft",
  version: 1,
  jobGroup: "LEHRKRAFT",
  categories: [],
  formulierungen: [],
};
const BEWERTUNG = {
  id: "zb-1",
  offboardingId: ID,
  status: "SUBMITTED",
  templateSnapshot: {
    categories: [{ id: "cat-1", weight: 1, criteria: [{ id: "k-1", weight: 1 }, { id: "k-2", weight: 1 }] }],
  },
  ratings: [
    { id: "r-1", snapshotCriterionId: "k-1", grade: 2, hrOverrideGrade: null },
    { id: "r-2", snapshotCriterionId: "k-2", grade: 3, hrOverrideGrade: null },
  ],
};

// ---------------------------------------------
// Aufrufe
// ---------------------------------------------

function json(method: string, url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
const ctx = (extra: Record<string, string> = {}) => ({ params: Promise.resolve({ id: ID, ...extra }) });

function pdfUpload(name = "Kündigung Müller.pdf"): NextRequest {
  const bytes = new TextEncoder().encode("%PDF-1.4\n%%EOF\n");
  const formData = new FormData();
  formData.append("file", new File([bytes], name, { type: "application/pdf" }));
  formData.append("type", "KUENDIGUNGSSCHREIBEN");
  return new NextRequest(`${BASIS}/documents`, { method: "POST", body: formData });
}

const notizenLesen = () => notizen.GET(new NextRequest(`${BASIS}/notes`), ctx());
const notizAnlegen = (body: unknown = { content: "  Gespräch am Freitag  " }) =>
  notizen.POST(json("POST", `${BASIS}/notes`, body), ctx());
const notizAendern = (body: unknown = { content: "Gespräch verschoben" }) =>
  notiz.PATCH(json("PATCH", `${BASIS}/notes/${NOTE_ID}`, body), ctx({ noteId: NOTE_ID }));
const notizLoeschen = () =>
  notiz.DELETE(new NextRequest(`${BASIS}/notes/${NOTE_ID}`, { method: "DELETE" }), ctx({ noteId: NOTE_ID }));
const dokumenteLesen = () => dokumente.GET(new NextRequest(`${BASIS}/documents`), ctx());
const dokumentHochladen = (name?: string) => dokumente.POST(pdfUpload(name), ctx());
const dokumentLaden = () =>
  dokument.GET(new NextRequest(`${BASIS}/documents/${DOC_ID}`), ctx({ docId: DOC_ID }));
const exitLesen = () => exitInterview.GET(new NextRequest(`${BASIS}/exit-interview`), ctx());
const exitAnlegen = () => exitInterview.POST(new NextRequest(`${BASIS}/exit-interview`, { method: "POST" }), ctx());
const exitSendenAufruf = () =>
  exitSenden.POST(new NextRequest(`${BASIS}/exit-interview/send`, { method: "POST" }), ctx());
const zeugnisLesen = () => zeugnis.GET(new NextRequest(`${BASIS}/zeugnis-bewertung`), ctx());
const zeugnisAnlegen = (body: unknown = { supervisorEmail: "neu@einrichtung.example.org", jobGroup: "LEHRKRAFT" }) =>
  zeugnis.POST(json("POST", `${BASIS}/zeugnis-bewertung`, body), ctx());
const hrPruefen = (body: unknown = { ratings: [{ snapshotCriterionId: "k-2", hrOverrideGrade: 1 }], finalize: true }) =>
  hrReview.PUT(json("PUT", `${BASIS}/zeugnis-bewertung/hr-review`, body), ctx());

/** Jeder Endpunkt mit der Rollengruppe, die ihn aufrufen darf. */
const ENDPUNKTE: [string, () => Promise<Response>, readonly string[]][] = [
  ["GET notes", notizenLesen, PORTAL_ROLES],
  ["POST notes", () => notizAnlegen(), PORTAL_ROLES],
  ["PATCH notes/:noteId", () => notizAendern(), PORTAL_ROLES],
  ["DELETE notes/:noteId", notizLoeschen, PORTAL_ROLES],
  ["GET documents", dokumenteLesen, PORTAL_ROLES],
  ["POST documents", () => dokumentHochladen(), HR_EDIT_ROLES],
  ["GET documents/:docId", dokumentLaden, PORTAL_ROLES],
  ["GET exit-interview", exitLesen, HR_EDIT_ROLES],
  ["POST exit-interview", exitAnlegen, HR_EDIT_ROLES],
  ["POST exit-interview/send", exitSendenAufruf, HR_EDIT_ROLES],
  ["GET zeugnis-bewertung", zeugnisLesen, HR_EDIT_ROLES],
  ["POST zeugnis-bewertung", () => zeugnisAnlegen(), HR_EDIT_ROLES],
  ["PUT zeugnis-bewertung/hr-review", () => hrPruefen(), ADMIN_ROLES],
];

/** Was ein abgewiesener Aufruf NICHT anfassen darf. */
function nichtsGeschrieben() {
  for (const m of [
    mockPrisma.offboardingNote.create,
    mockPrisma.offboardingNote.updateMany,
    mockPrisma.offboardingNote.deleteMany,
    mockPrisma.offboardingDocument.create,
    mockPrisma.exitInterview.create,
    mockPrisma.exitInterview.updateMany,
    mockPrisma.zeugnisBewertung.create,
    mockPrisma.zeugnisBewertung.updateMany,
    mockPrisma.zeugnisBewertungRating.update,
    mockPrisma.auditLog.create,
    mockWriteFile,
    mockTriggerWebhooks,
  ]) {
    expect(m).not.toHaveBeenCalled();
  }
}

/** Was ein abgewiesener Aufruf auch nicht LESEN darf (kein Kind-Objekt, keine Datei). */
function nichtsGelesen() {
  for (const m of [
    mockPrisma.offboardingNote.findMany,
    mockPrisma.offboardingNote.findFirst,
    mockPrisma.offboardingDocument.findMany,
    mockPrisma.offboardingDocument.findFirst,
    mockPrisma.exitInterview.findUnique,
    mockPrisma.zeugnisBewertung.findUnique,
    mockReadFile,
  ]) {
    expect(m).not.toHaveBeenCalled();
  }
}

function standardMocks() {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue(ADMIN);
  mockCanAccessProcess.mockImplementation((...a: unknown[]) => echtesCanAccessProcess(...a));
  mockPrisma.offboardingProcess.findUnique.mockResolvedValue(VORGANG);
  // Zuordnung vorhanden: Die mandantenbeschraenkten Rollen sehen org-1.
  mockPrisma.userOrgAssignment.findUnique.mockResolvedValue({ userId: ADMIN.userId, organizationId: "org-1" });

  mockPrisma.offboardingNote.findMany.mockResolvedValue([NOTIZ]);
  mockPrisma.offboardingNote.findFirst.mockResolvedValue(NOTIZ);
  mockPrisma.offboardingNote.findUnique.mockResolvedValue(NOTIZ);
  mockPrisma.offboardingNote.create.mockImplementation(async ({ data }) => ({ ...NOTIZ, ...data }));
  mockPrisma.offboardingNote.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.offboardingNote.deleteMany.mockResolvedValue({ count: 1 });

  mockPrisma.offboardingDocument.findMany.mockResolvedValue([]);
  mockPrisma.offboardingDocument.findFirst.mockResolvedValue(DOKUMENT);
  mockPrisma.offboardingDocument.create.mockImplementation(async ({ data }) => ({
    id: DOC_ID,
    uploadedAt: new Date("2026-10-12T08:00:00Z"),
    ...data,
  }));

  mockPrisma.exitInterview.findUnique.mockResolvedValue(null);
  mockPrisma.exitInterview.create.mockImplementation(async ({ data }) => ({ id: "ei-1", ...data }));
  mockPrisma.exitInterview.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.exitInterviewTemplate.findFirst.mockResolvedValue(EI_VORLAGE);

  mockPrisma.zeugnisBewertung.findUnique.mockResolvedValue(null);
  mockPrisma.zeugnisBewertung.create.mockImplementation(async ({ data }) => ({ id: "zb-1", ...data }));
  mockPrisma.zeugnisBewertung.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.zeugnisBewertungTemplate.findFirst.mockResolvedValue(ZB_VORLAGE);
  mockPrisma.zeugnisBewertungRating.update.mockResolvedValue({});

  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma));

  mockTriggerWebhooks.mockResolvedValue({ status: "SENT" });
  mockFreigegeben.mockResolvedValue(true);

  mockReadFile.mockResolvedValue(Buffer.from("%PDF-1.4\n%%EOF\n"));
  mockWriteFile.mockResolvedValue(undefined);
  mockUnlink.mockResolvedValue(undefined);
  // Ohne Platte: jeder Pfad ist schon aufgeloest.
  mockRealpath.mockImplementation(async (p: string) => p);
}

beforeEach(standardMocks);

/** Die Details des einen AuditLog-Eintrags. */
function protokoll(): { action: string; details: Record<string, unknown> } {
  expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
  return mockPrisma.auditLog.create.mock.calls[0][0].data;
}

// =============================================
// Rollen
// =============================================

describe("Rollen", () => {
  it("ohne Anmeldung 401 an jedem Endpunkt, nichts gelesen oder geschrieben", async () => {
    for (const [name, aufruf] of ENDPUNKTE) {
      standardMocks();
      mockGetSession.mockResolvedValue(null);
      const res = await aufruf();
      expect({ name, status: res.status }).toEqual({ name, status: 401 });
      nichtsGelesen();
      nichtsGeschrieben();
    }
  });

  it.each(["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER", "EINRICHTUNGSLEITUNG", "VORGESETZTER", "SERVICE", "BEM_BEAUFTRAGTER"])(
    "Rolle %s: nur die Endpunkte ihrer Rollengruppe, sonst 403 ohne Lesen und Schreiben",
    async (role) => {
      for (const [name, aufruf, erlaubt] of ENDPUNKTE) {
        standardMocks();
        mockGetSession.mockResolvedValue({ ...ADMIN, role });
        const res = await aufruf();
        if (erlaubt.includes(role)) {
          expect({ name, status: res.status }).not.toEqual({ name, status: 403 });
          expect(res.status).not.toBe(401);
        } else {
          expect({ name, status: res.status }).toEqual({ name, status: 403 });
          expect(await res.json()).toEqual({ error: "Keine Berechtigung" });
          nichtsGelesen();
          nichtsGeschrieben();
        }
      }
    }
  );

  it("der n8n-Schlüssel (SERVICE) kommt an keinen der Endpunkte", () => {
    for (const [, , erlaubt] of ENDPUNKTE) expect(erlaubt).not.toContain("SERVICE");
  });

  it("die Fuehrungskraft darf Notizen lesen und anlegen, Dokumente lesen — mehr nicht", async () => {
    mockGetSession.mockResolvedValue({ ...ADMIN, role: "VORGESETZTER" });
    expect((await notizenLesen()).status).toBe(200);
    expect((await notizAnlegen()).status).toBe(201);
    expect((await dokumentLaden()).status).toBe(200);
  });
});

// =============================================
// Mandant
// =============================================

describe("Mandant", () => {
  it("fremder Mandant = dieselbe 404 wie ein unbekannter Vorgang, an jedem Endpunkt", async () => {
    for (const [name, aufruf] of ENDPUNKTE) {
      standardMocks();
      mockCanAccessProcess.mockResolvedValue(false);
      const fremd = await aufruf();
      expect({ name, status: fremd.status }).toEqual({ name, status: 404 });
      expect(await fremd.json()).toEqual({ error: "Vorgang nicht gefunden" });
      expect(mockCanAccessProcess).toHaveBeenCalledWith(expect.objectContaining({ userId: ADMIN.userId }), "org-1");
      nichtsGelesen();
      nichtsGeschrieben();

      standardMocks();
      mockPrisma.offboardingProcess.findUnique.mockResolvedValue(null);
      const unbekannt = await aufruf();
      expect({ name, status: unbekannt.status }).toEqual({ name, status: 404 });
      expect(await unbekannt.json()).toEqual({ error: "Vorgang nicht gefunden" });
      nichtsGeschrieben();
    }
  });

  it("Einrichtungsleitung ohne Zuordnung zum Mandanten: 404 (echte Pruefung)", async () => {
    mockGetSession.mockResolvedValue({ ...ADMIN, role: "EINRICHTUNGSLEITUNG" });
    mockPrisma.userOrgAssignment.findUnique.mockResolvedValue(null);
    for (const aufruf of [notizenLesen, () => notizAnlegen(), dokumenteLesen, dokumentLaden]) {
      const res = await aufruf();
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Vorgang nicht gefunden" });
    }
    nichtsGelesen();
    nichtsGeschrieben();
  });
});

// =============================================
// Notizen
// =============================================

describe("Notizen", () => {
  it("anlegen: getrimmt, Protokoll im selben Commit — nur die Laenge, nie der Text", async () => {
    const res = await notizAnlegen();
    expect(res.status).toBe(201);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.offboardingNote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { offboardingId: ID, content: "Gespräch am Freitag", createdById: ADMIN.userId },
      })
    );
    const eintrag = protokoll();
    expect(eintrag.action).toBe("NOTE_CREATED");
    expect(eintrag.details).toEqual({ noteId: NOTE_ID, laenge: "Gespräch am Freitag".length });
    expect(JSON.stringify(eintrag)).not.toContain("Gespräch");
  });

  it.each([{ content: "   " }, {}, { content: 42 }])("anlegen: leere Notiz %j = 400 mit Meldung", async (body) => {
    const res = await notizAnlegen(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Die Notiz darf nicht leer sein." });
    nichtsGeschrieben();
  });

  it("bearbeiten: Notiz gebunden an den Vorgang, Schreiben bedingt auf Urheber, Protokoll ohne Text", async () => {
    const res = await notizAendern();
    expect(res.status).toBe(200);
    expect(mockPrisma.offboardingNote.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: NOTE_ID, offboardingId: ID } })
    );
    expect(mockPrisma.offboardingNote.updateMany).toHaveBeenCalledWith({
      where: { id: NOTE_ID, offboardingId: ID, createdById: ADMIN.userId },
      data: { content: "Gespräch verschoben" },
    });
    const eintrag = protokoll();
    expect(eintrag.action).toBe("NOTE_UPDATED");
    expect(JSON.stringify(eintrag)).not.toMatch(/Gespräch/);
  });

  it("Notiz aus einem anderen Vorgang = dieselbe 404 wie eine unbekannte", async () => {
    mockPrisma.offboardingNote.findFirst.mockResolvedValue(null);
    for (const res of [await notizAendern(), await notizLoeschen()]) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Notiz nicht gefunden" });
    }
    nichtsGeschrieben();
  });

  it("fremde Notiz im eigenen Vorgang: 403, nichts geschrieben", async () => {
    mockPrisma.offboardingNote.findFirst.mockResolvedValue({ ...NOTIZ, createdById: "u-andere" });
    expect((await notizAendern()).status).toBe(403);
    expect((await notizLoeschen()).status).toBe(403);
    nichtsGeschrieben();
  });

  it("loeschen: bedingt auf Vorgang und Urheber; inzwischen geloescht = 404 ohne Protokoll", async () => {
    const res = await notizLoeschen();
    expect(res.status).toBe(200);
    expect(mockPrisma.offboardingNote.deleteMany).toHaveBeenCalledWith({
      where: { id: NOTE_ID, offboardingId: ID, createdById: ADMIN.userId },
    });
    expect(protokoll().details).toEqual({ noteId: NOTE_ID, laenge: NOTIZ.content.length });

    standardMocks();
    mockPrisma.offboardingNote.deleteMany.mockResolvedValue({ count: 0 });
    expect((await notizLoeschen()).status).toBe(404);
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });
});

// =============================================
// Dokumente
// =============================================

describe("Dokumente", () => {
  it("hochladen: Datei im Vorgangsordner, Zeile und Protokoll in EINER Transaktion, ohne Dateinamen", async () => {
    const res = await dokumentHochladen();
    expect(res.status).toBe(201);

    const [ziel] = mockWriteFile.mock.calls[0];
    expect(String(ziel).startsWith(UPLOAD_ORDNER + path.sep)).toBe(true);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.offboardingDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        offboardingId: ID,
        type: "KUENDIGUNGSSCHREIBEN",
        fileName: "Kündigung Müller.pdf",
        mimeType: "application/pdf",
        uploadedById: ADMIN.userId,
      }),
    });
    const eintrag = protokoll();
    expect(eintrag.action).toBe("DOCUMENT_UPLOADED");
    expect(eintrag.details).toEqual({
      documentId: DOC_ID,
      dokumentTyp: "KUENDIGUNGSSCHREIBEN",
      groesse: expect.any(Number),
      mimeType: "application/pdf",
    });
    expect(JSON.stringify(eintrag)).not.toMatch(/Müller|ndigung_M/);
  });

  it("hochladen: scheitert die Transaktion, wird die Datei wieder entfernt", async () => {
    mockPrisma.$transaction.mockRejectedValue(new Error("DB weg"));
    const res = await dokumentHochladen();
    expect(res.status).toBe(500);
    expect(mockUnlink).toHaveBeenCalledWith(mockWriteFile.mock.calls[0][0]);
  });

  it("herunterladen: gebunden an den Vorgang, no-store, nosniff, Endung aus dem Typ", async () => {
    mockPrisma.offboardingDocument.findFirst.mockResolvedValue({ ...DOKUMENT, fileName: "Kündigung.hta" });
    const res = await dokumentLaden();
    expect(res.status).toBe(200);
    expect(mockPrisma.offboardingDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: DOC_ID, offboardingId: ID } })
    );
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="K_ndigung.pdf"');
  });

  it("herunterladen: unbekannter Typ geht als application/octet-stream mit .bin hinaus", async () => {
    mockPrisma.offboardingDocument.findFirst.mockResolvedValue({ ...DOKUMENT, fileName: "x.html", mimeType: "text/html" });
    const res = await dokumentLaden();
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="x.bin"');
  });

  it("Dokument aus einem anderen Vorgang = dieselbe 404 wie ein unbekanntes", async () => {
    mockPrisma.offboardingDocument.findFirst.mockResolvedValue(null);
    const res = await dokumentLaden();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Dokument nicht gefunden" });
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it.each([
    "uploads/bem/fall-1/attest.pdf",
    "uploads/offboarding/anderer-vorgang/x.pdf",
    `uploads/offboarding/${ID}/../../bem/attest.pdf`,
  ])("herunterladen: Pfad %s ausserhalb des Vorgangsordners = 400, nichts gelesen", async (filePath) => {
    mockPrisma.offboardingDocument.findFirst.mockResolvedValue({ ...DOKUMENT, filePath });
    const res = await dokumentLaden();
    expect(res.status).toBe(400);
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("herunterladen: fehlende Datei = 404", async () => {
    mockRealpath.mockImplementation(async (p: string) => {
      if (p.endsWith(".pdf")) throw Object.assign(new Error("weg"), { code: "ENOENT" });
      return p;
    });
    const res = await dokumentLaden();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Datei nicht gefunden auf dem Server" });
  });

  it("die Liste liefert keinen Speicherpfad", async () => {
    await dokumenteLesen();
    const { select } = mockPrisma.offboardingDocument.findMany.mock.calls[0][0];
    expect(select.filePath).toBeUndefined();
  });
});

// =============================================
// Exit-Interview
// =============================================

describe("Exit-Interview", () => {
  it("anlegen: an die private Adresse, Protokoll im selben Commit ohne Adresse", async () => {
    const res = await exitAnlegen();
    expect(res.status).toBe(201);
    expect(mockPrisma.exitInterview.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ offboardingId: ID, recipientEmail: "privat@example.org", status: "SCHEDULED" }),
    });
    const eintrag = protokoll();
    expect(eintrag.action).toBe("EXIT_INTERVIEW_CREATED");
    expect(JSON.stringify(eintrag)).not.toContain("@");
  });

  it("anlegen ohne private Adresse oder doppelt = 409, nichts geschrieben", async () => {
    mockPrisma.offboardingProcess.findUnique.mockResolvedValue({ ...VORGANG, employeePrivateEmail: null });
    expect((await exitAnlegen()).status).toBe(409);

    standardMocks();
    mockPrisma.exitInterview.findUnique.mockResolvedValue({ id: "ei-1" });
    expect((await exitAnlegen()).status).toBe(409);
    nichtsGeschrieben();
  });

  it("anlegen: zwei gleichzeitige Klicks (P2002) = 409 statt 500", async () => {
    mockPrisma.exitInterview.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("doppelt", { code: "P2002", clientVersion: "6" })
    );
    const res = await exitAnlegen();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Für diesen Vorgang gibt es bereits ein Exit-Interview." });
  });

  it("senden: erst die Mail, dann SCHEDULED → INVITED und Protokoll ohne Adresse", async () => {
    mockPrisma.exitInterview.findUnique.mockResolvedValue(EXIT_INTERVIEW);
    const res = await exitSendenAufruf();
    expect(res.status).toBe(200);
    expect(mockTriggerWebhooks).toHaveBeenCalledWith(
      "exit-interview-invited",
      expect.objectContaining({ magicLink: "https://hr.example.org/exit-interview/tok-ei" })
    );
    expect(mockPrisma.exitInterview.updateMany).toHaveBeenCalledWith({
      where: { id: "ei-1", status: { in: ["SCHEDULED", "INVITED", "IN_PROGRESS"] } },
      data: { status: "INVITED", sentAt: expect.any(Date) },
    });
    const eintrag = protokoll();
    expect(eintrag.action).toBe("EXIT_INTERVIEW_INVITED");
    expect(eintrag.details).toEqual({ exitInterviewId: "ei-1", forceSent: true, mailStatus: "SENT" });
  });

  it("senden: ein begonnenes Interview (IN_PROGRESS) behaelt seinen Status", async () => {
    mockPrisma.exitInterview.findUnique.mockResolvedValue({ ...EXIT_INTERVIEW, status: "IN_PROGRESS" });
    expect((await exitSendenAufruf()).status).toBe(200);
    expect(mockPrisma.exitInterview.updateMany.mock.calls[0][0].data).toEqual({ sentAt: expect.any(Date) });
  });

  it("senden: Mail gescheitert = 502, Status und Protokoll unveraendert", async () => {
    mockPrisma.exitInterview.findUnique.mockResolvedValue(EXIT_INTERVIEW);
    mockTriggerWebhooks.mockResolvedValue({ status: "FAILED", detail: "SMTP" });
    expect((await exitSendenAufruf()).status).toBe(502);
    expect(mockPrisma.exitInterview.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([
    ["abgeschlossen", { status: "SUBMITTED" }],
    ["abgelaufen", { status: "EXPIRED" }],
    ["Link abgelaufen", { tokenExpiresAt: new Date("2020-01-01T00:00:00Z") }],
  ])("senden: %s = 409 ohne Mail", async (_fall, abweichung) => {
    mockPrisma.exitInterview.findUnique.mockResolvedValue({ ...EXIT_INTERVIEW, ...abweichung });
    expect((await exitSendenAufruf()).status).toBe(409);
    nichtsGeschrieben();
  });

  it("senden: inzwischen abgeschlossen (bedingtes Update trifft nichts) = 409 ohne Protokoll", async () => {
    mockPrisma.exitInterview.findUnique.mockResolvedValue(EXIT_INTERVIEW);
    mockPrisma.exitInterview.updateMany.mockResolvedValue({ count: 0 });
    expect((await exitSendenAufruf()).status).toBe(409);
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });
});

// =============================================
// Zeugnis-Bewertung
// =============================================

describe("Zeugnis-Bewertung", () => {
  it("anlegen: frei eingetippte Adresse ausserhalb der Freigabeliste = 409, nichts angelegt", async () => {
    mockFreigegeben.mockResolvedValue(false);
    const res = await zeugnisAnlegen();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: MELDUNGEN.FUEHRUNGSKRAFT_NICHT_FREIGEGEBEN });
    expect(mockFreigegeben).toHaveBeenCalledWith("neu@einrichtung.example.org", [
      "fk@einrichtung.example.org",
      "alt@einrichtung.example.org",
    ]);
    nichtsGeschrieben();
  });

  it("anlegen: Bewertung und Protokoll in EINER Transaktion", async () => {
    const res = await zeugnisAnlegen();
    expect(res.status).toBe(201);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.zeugnisBewertung.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ offboardingId: ID, supervisorEmail: "neu@einrichtung.example.org", status: "INVITED" }),
    });
    expect(protokoll().action).toBe("ZEUGNIS_BEWERTUNG_CREATED");
  });

  it("lesen ohne Bewertung = 404 mit eigenem Text", async () => {
    const res = await zeugnisLesen();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Für diesen Vorgang gibt es noch keine Zeugnis-Bewertung." });
  });

  it("HR-Review vor der Einreichung = 409 — der Bewertungslink bleibt offen", async () => {
    mockPrisma.zeugnisBewertung.findUnique.mockResolvedValue({ ...BEWERTUNG, status: "INVITED" });
    const res = await hrPruefen();
    expect(res.status).toBe(409);
    nichtsGeschrieben();
  });

  it("HR-Review: unbekanntes Kriterium = 400, bevor irgendetwas geschrieben ist", async () => {
    mockPrisma.zeugnisBewertung.findUnique.mockResolvedValue(BEWERTUNG);
    const res = await hrPruefen({
      ratings: [
        { snapshotCriterionId: "k-1", hrOverrideGrade: 1 },
        { snapshotCriterionId: "fremd", hrOverrideGrade: 1 },
      ],
    });
    expect(res.status).toBe(400);
    nichtsGeschrieben();
  });

  it("HR-Review: Note ausserhalb 1–6 = 400", async () => {
    mockPrisma.zeugnisBewertung.findUnique.mockResolvedValue(BEWERTUNG);
    const res = await hrPruefen({ ratings: [{ snapshotCriterionId: "k-1", hrOverrideGrade: 7 }] });
    expect(res.status).toBe(400);
    nichtsGeschrieben();
  });

  it("HR-Review: finalisieren bedingt auf den gelesenen Status, Noten und Protokoll im selben Commit", async () => {
    mockPrisma.zeugnisBewertung.findUnique.mockResolvedValue(BEWERTUNG);
    const res = await hrPruefen();
    expect(res.status).toBe(200);
    const aufruf = mockPrisma.zeugnisBewertung.updateMany.mock.calls[0][0];
    expect(aufruf.where).toEqual({ id: "zb-1", status: "SUBMITTED" });
    // k-1 = 2, k-2 von 3 auf 1 → Schnitt 1,5
    expect(aufruf.data).toEqual(
      expect.objectContaining({ status: "FINALIZED", overallGrade: 1.5, finalizedById: ADMIN.userId })
    );
    expect(mockPrisma.zeugnisBewertungRating.update).toHaveBeenCalledWith({
      where: { id: "r-2" },
      data: { hrOverrideGrade: 1, hrOverrideReason: null },
    });
    expect(protokoll().action).toBe("ZEUGNIS_BEWERTUNG_FINALIZED");
  });

  it("HR-Review: gleichzeitig schon finalisiert = 409, keine Note geschrieben", async () => {
    mockPrisma.zeugnisBewertung.findUnique.mockResolvedValue(BEWERTUNG);
    mockPrisma.zeugnisBewertung.updateMany.mockResolvedValue({ count: 0 });
    expect((await hrPruefen()).status).toBe(409);
    expect(mockPrisma.zeugnisBewertungRating.update).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });
});
