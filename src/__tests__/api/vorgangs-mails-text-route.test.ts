/**
 * GET /api/vorgaenge/[modul]/[id]/mails/[mailId]/text — Text einer Mail im
 * Reiter „E-Mails“. Rolle, Mandant, und die Zeile muss zu GENAU diesem Vorgang
 * gehoeren.
 */

const mockGetSession = jest.fn();
const mockCanAccess = jest.fn();
const mockPrisma = {
  onboardingProcess: { findUnique: jest.fn() },
  offboardingProcess: { findUnique: jest.fn() },
  civilServiceProcess: { findUnique: jest.fn() },
  contractEndProcess: { findUnique: jest.fn() },
  elternzeitProzess: { findUnique: jest.fn() },
  mutterschutzProzess: { findUnique: jest.fn() },
  emailLog: { findFirst: jest.fn() },
};

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/permissions", () => ({
  ...jest.requireActual("@/lib/permissions"),
  canAccessProcess: (...args: unknown[]) => mockCanAccess(...args),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/vorgaenge/[modul]/[id]/mails/[mailId]/text/route";

const ID = "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const MAIL = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const HR = { userId: "u1", email: "hr@example.org", role: "HR_SACHBEARBEITER", firstName: "H", lastName: "R" };

function aufruf(modul: string, id = ID, mailId = MAIL) {
  return GET(new NextRequest(`http://localhost/api/vorgaenge/${modul}/${id}/mails/${mailId}/text`), {
    params: Promise.resolve({ modul, id, mailId }),
  });
}

const ZEILE = {
  createdAt: new Date("2026-10-14T07:12:00Z"),
  event: "onboarding-created",
  status: "SENT",
  subject: "Willkommen",
  recipient: "anna@beispiel.invalid",
  cc: null,
  bcc: null,
  text: { bodyHtml: "<p>Hallo Anna</p><a href=\"#\">Fragebogen</a>", gekuerzt: false },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue(HR);
  mockCanAccess.mockResolvedValue(true);
  for (const m of Object.values(mockPrisma)) {
    if ("findUnique" in m) m.findUnique.mockResolvedValue({ organizationId: "org-1" });
  }
  mockPrisma.emailLog.findFirst.mockResolvedValue(ZEILE);
});

it("ohne Anmeldung 401, mit Einrichtungsleitung 403", async () => {
  mockGetSession.mockResolvedValue(null);
  expect((await aufruf("onboarding")).status).toBe(401);
  mockGetSession.mockResolvedValue({ ...HR, role: "EINRICHTUNGSLEITUNG" });
  expect((await aufruf("onboarding")).status).toBe(403);
});

it("unbekanntes Modul und BEM = 404", async () => {
  expect((await aufruf("bem")).status).toBe(404);
  expect((await aufruf("gibt-es-nicht")).status).toBe(404);
  expect(mockPrisma.emailLog.findFirst).not.toHaveBeenCalled();
});

it("unbekannter Vorgang und fremder Mandant = 404 mit demselben Text, ohne die Zeile zu lesen", async () => {
  mockPrisma.onboardingProcess.findUnique.mockResolvedValue(null);
  const unbekannt = await aufruf("onboarding");

  mockPrisma.onboardingProcess.findUnique.mockResolvedValue({ organizationId: "org-fremd" });
  mockCanAccess.mockResolvedValue(false);
  const fremd = await aufruf("onboarding");

  expect(unbekannt.status).toBe(404);
  expect(fremd.status).toBe(404);
  expect(await unbekannt.json()).toEqual(await fremd.json());
  expect(mockPrisma.emailLog.findFirst).not.toHaveBeenCalled();
});

it("fragt die Zeile NUR zusammen mit Vorgang, Id und Test-Ausschluss ab", async () => {
  const res = await aufruf("offboarding");
  expect(res.status).toBe(200);
  expect(mockPrisma.emailLog.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: MAIL, vorgangTyp: "OFFBOARDING", vorgangId: ID, isTest: false },
    }),
  );
});

it("eine Mail, die zu einem anderen Vorgang gehoert (oder keinen Text hat), ist 404", async () => {
  mockPrisma.emailLog.findFirst.mockResolvedValue(null);
  const res = await aufruf("onboarding");
  expect(res.status).toBe(404);
  expect((await res.json()).error).toBe("E-Mail nicht gefunden");

  mockPrisma.emailLog.findFirst.mockResolvedValue({ ...ZEILE, text: null });
  expect((await aufruf("onboarding")).status).toBe(404);
});

it("liefert Kopf, Ansicht und Text — ohne Cache", async () => {
  const res = await aufruf("onboarding");
  expect(res.headers.get("Cache-Control")).toBe("no-store");
  const json = await res.json();
  expect(json.kopf).toEqual(
    expect.objectContaining({
      betreff: "Willkommen",
      empfaenger: "anna@beispiel.invalid",
      ereignisName: expect.any(String),
      statusText: "versendet",
    }),
  );
  expect(json.text).toBe("Hallo Anna\n\nFragebogen");
  expect(json.html).toContain("Content-Security-Policy");
  expect(json.html).toContain("Hallo Anna");
  expect(json.gekuerzt).toBe(false);
  expect(json.hinweis).toBeNull();
  expect(json.linkHinweis).toMatch(/Platzhalter/);
});

it("eine nicht zugestellte Mail traegt den Hinweis dazu", async () => {
  mockPrisma.emailLog.findFirst.mockResolvedValue({ ...ZEILE, status: "FAILED" });
  const json = await (await aufruf("onboarding")).json();
  expect(json.hinweis).toMatch(/nicht zugestellt/);
});

it("gibt auch bei alten Skripten im gespeicherten HTML nichts Aktives aus", async () => {
  mockPrisma.emailLog.findFirst.mockResolvedValue({
    ...ZEILE,
    text: { bodyHtml: '<p onclick="x()">A</p><script>alert(1)</script><a href="https://boese.example">B</a>', gekuerzt: false },
  });
  const json = await (await aufruf("onboarding")).json();
  expect(json.html).not.toMatch(/<script|onclick|href=/i);
});

it.each(["__proto__", "constructor", "toString", "valueOf", "hasOwnProperty"])(
  "der Modulname %s ist kein Modul: 404, ohne den Vorgang oder das Protokoll anzufassen",
  async (modul) => {
    const res = await aufruf(modul);
    expect(res.status).toBe(404);
    for (const m of Object.values(mockPrisma)) {
      if ("findUnique" in m) expect(m.findUnique).not.toHaveBeenCalled();
    }
    expect(mockPrisma.emailLog.findFirst).not.toHaveBeenCalled();
  },
);

it("liefert keinen Hinweis auf ersetzte Links, wenn im Text nichts ersetzt wurde", async () => {
  mockPrisma.emailLog.findFirst.mockResolvedValue({
    ...ZEILE,
    text: { bodyHtml: '<p>Bitte pruefen: <a href="https://hr.fes-credo.de/vorgaenge/onboarding/abc">Vorgang</a></p>', gekuerzt: false },
  });
  const json = await (await aufruf("onboarding")).json();
  expect(json.linkHinweis).toBeNull();
  // die Adresse des behaltenen Links steht in Ansicht und Text
  expect(json.text).toBe("Bitte pruefen: Vorgang (https://hr.fes-credo.de/vorgaenge/onboarding/abc)");
  expect(json.html).toContain("(https://hr.fes-credo.de/vorgaenge/onboarding/abc)");
});

it("meldet den Hinweis, wenn ein Link ersetzt wurde", async () => {
  mockPrisma.emailLog.findFirst.mockResolvedValue({
    ...ZEILE,
    text: { bodyHtml: '<a href="#">Fragebogen</a> [Persönlicher Link – aus Sicherheitsgründen nicht gespeichert]', gekuerzt: false },
  });
  const json = await (await aufruf("onboarding")).json();
  expect(json.linkHinweis).toMatch(/Platzhalter/);
});
