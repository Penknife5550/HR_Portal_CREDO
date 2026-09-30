/**
 * GET /api/vorgaenge/[modul]/[id]/mails — Reiter „E-Mails“ im Vorgang.
 */

const mockGetSession = jest.fn();
const mockPrisma = {
  onboardingProcess: { findUnique: jest.fn() },
  offboardingProcess: { findUnique: jest.fn() },
  civilServiceProcess: { findUnique: jest.fn() },
  contractEndProcess: { findUnique: jest.fn() },
  elternzeitProzess: { findUnique: jest.fn() },
  mutterschutzProzess: { findUnique: jest.fn() },
  emailLog: { findMany: jest.fn() },
};

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/vorgaenge/[modul]/[id]/mails/route";

const ID = "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const HR = { userId: "u1", email: "hr@example.org", role: "HR_SACHBEARBEITER", firstName: "H", lastName: "R" };

function aufruf(modul: string, id = ID) {
  return GET(new NextRequest(`http://localhost/api/vorgaenge/${modul}/${id}/mails`), {
    params: Promise.resolve({ modul, id }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue(HR);
  for (const m of Object.values(mockPrisma)) {
    if ("findUnique" in m) m.findUnique.mockResolvedValue({ organizationId: "org-1" });
  }
  mockPrisma.emailLog.findMany.mockResolvedValue([
    {
      id: "l1",
      createdAt: new Date("2026-09-30T06:00:00Z"),
      event: "employee-reminder",
      status: "FAILED",
      subject: "Erinnerung",
      recipient: "max@example.org",
      cc: null,
      bcc: null,
      detail: "Connection timeout",
    },
  ]);
});

it("ohne Anmeldung 401", async () => {
  mockGetSession.mockResolvedValue(null);
  expect((await aufruf("onboarding")).status).toBe(401);
});

it("nur HR-Rollen (Einrichtungsleitung 403)", async () => {
  mockGetSession.mockResolvedValue({ ...HR, role: "EINRICHTUNGSLEITUNG" });
  expect((await aufruf("onboarding")).status).toBe(403);
});

it("unbekanntes Modul und BEM = 404", async () => {
  expect((await aufruf("bem")).status).toBe(404);
  expect((await aufruf("gibt-es-nicht")).status).toBe(404);
});

it("unbekannter Vorgang = 404", async () => {
  mockPrisma.offboardingProcess.findUnique.mockResolvedValue(null);
  const res = await aufruf("offboarding");
  expect(res.status).toBe(404);
  expect(mockPrisma.emailLog.findMany).not.toHaveBeenCalled();
});

it.each([
  ["onboarding", "ONBOARDING", "onboardingProcess"],
  ["offboarding", "OFFBOARDING", "offboardingProcess"],
  ["civil-service", "CIVIL_SERVICE", "civilServiceProcess"],
  ["contract-end", "CONTRACT_END", "contractEndProcess"],
  ["elternzeit", "ELTERNZEIT", "elternzeitProzess"],
  ["mutterschutz", "MUTTERSCHUTZ", "mutterschutzProzess"],
] as const)("%s: liest den Vorgang aus %s und filtert das Protokoll darauf", async (modul, typ, modell) => {
  const res = await aufruf(modul);
  expect(res.status).toBe(200);
  expect(mockPrisma[modell].findUnique).toHaveBeenCalledWith({ where: { id: ID }, select: { organizationId: true } });
  expect(mockPrisma.emailLog.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { vorgangTyp: typ, vorgangId: ID, isTest: false },
      orderBy: { createdAt: "desc" },
    }),
  );
});

it("liefert fertige Zeilen mit Grund", async () => {
  const json = await (await aufruf("onboarding")).json();
  expect(json.eintraege[0]).toEqual(
    expect.objectContaining({ status: "FAILED", statusText: "fehlgeschlagen", grund: "Connection timeout" }),
  );
  expect(json.hinweis).toMatch(/90 Tagen/);
});
