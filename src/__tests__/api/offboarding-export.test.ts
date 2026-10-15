/**
 * GET /api/offboarding/export — die Spalte „Rückgaben“ im CSV-Export.
 *
 * Seit A4 (S30, G16) heisst ein Gegenstand dort „erledigt“, sobald er einen
 * Zustand hat – „zurück“, „beschädigt zurück“, „fehlt“, „verbleibt“ oder
 * „entfällt“ – bzw. als Altbestand `isReturned` traegt (`rueckgabeOffen`).
 * Vorher zaehlte nur „zurückgegeben“, und ein Austritt mit einem fehlenden
 * Schluessel stand fuer immer bei „1/2“. Spaltenkopf und -position bleiben.
 */

const mockGetSession = jest.fn();
const mockPrisma = {
  offboardingProcess: { findMany: jest.fn() },
};

jest.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/offboarding/export/route";

const HR = { userId: "u-hr", email: "hr@example.org", role: "HR_SACHBEARBEITER", firstName: "H", lastName: "R" };

function vorgang(returnItems: Array<{ isReturned: boolean; zustand: string | null }>) {
  return {
    displayId: "OFF-2027-GYM-001",
    employeeFirstName: "Anna",
    employeeLastName: "Schmidt",
    employeeEmail: "a.schmidt@example.org",
    employeePrivateEmail: null,
    employeePersonalNr: null,
    organization: { name: "FES Gymnasium", mandantNumber: "737" },
    exitType: "KUENDIGUNG_ARBEITNEHMER",
    lastWorkingDay: new Date("2027-07-31T00:00:00.000Z"),
    status: "HANDOVER_PHASE",
    createdAt: new Date("2027-06-01T08:00:00.000Z"),
    updatedAt: new Date("2027-07-01T08:00:00.000Z"),
    checklistItems: [],
    returnItems,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue(HR);
});

describe("CSV-Export: Spalte „Rückgaben“ (A4, G16)", () => {
  it("zählt jeden Zustand und den Altbestand als erledigt – nur ohne Zustand ist offen", async () => {
    mockPrisma.offboardingProcess.findMany.mockResolvedValue([
      vorgang([
        { isReturned: false, zustand: null },
        { isReturned: false, zustand: "FEHLT" },
        { isReturned: true, zustand: null },
        { isReturned: false, zustand: "ENTFAELLT" },
      ]),
    ]);
    const res = await GET(new NextRequest("http://localhost/api/offboarding/export"));
    expect(res.status).toBe(200);
    const [kopf, zeile] = (await res.text()).replace(/^﻿/, "").split("\n");
    const spalten = kopf.split(";");
    expect(spalten[spalten.length - 1]).toBe("Rückgaben");
    expect(zeile.split(";")[spalten.length - 1]).toBe("3/4");
    expect(mockPrisma.offboardingProcess.findMany.mock.calls[0][0].include.returnItems).toEqual({
      select: { isReturned: true, zustand: true },
    });
  });
});
