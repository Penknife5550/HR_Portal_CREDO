/**
 * GET /api/civil-service — die Status-Zaehler der Kacheln.
 *
 * Seit dem 16.10.2026 zaehlen sie mit dem Filter der Liste (sonst nannten
 * sie Zahlen aus Einrichtungen, die der Abfrage nicht zustehen), aber ohne
 * den Status: Die Kacheln SIND der Statusfilter. Mit ihm fielen nach einem
 * Klick auf eine Kachel alle anderen auf 0.
 */

const mockGetSession = jest.fn();
const mockOrgFilter = jest.fn();
const mockPrisma = {
  civilServiceProcess: { findMany: jest.fn(), count: jest.fn(), groupBy: jest.fn() },
};

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/webhooks", () => ({ triggerWebhooks: jest.fn() }));
jest.mock("@/lib/permissions", () => ({
  ...jest.requireActual("@/lib/permissions"),
  orgFilter: mockOrgFilter,
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/civil-service/route";

const HR = { userId: "hr1", email: "hr@credo-gruppe.de", role: "HR_SACHBEARBEITER", firstName: "H", lastName: "S" };
const ORG_FILTER = { organizationId: { in: ["org-1"] } };

async function liste(query: string) {
  const res = await GET(new NextRequest(`http://localhost:3000/api/civil-service${query}`));
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue(HR);
  mockOrgFilter.mockResolvedValue(ORG_FILTER);
  mockPrisma.civilServiceProcess.findMany.mockResolvedValue([]);
  mockPrisma.civilServiceProcess.count.mockResolvedValue(0);
  mockPrisma.civilServiceProcess.groupBy.mockResolvedValue([
    { status: "IN_PROGRESS", _count: { status: 3 } },
    { status: "COMPLETED", _count: { status: 2 } },
  ]);
});

it("mit gewaehltem Status: die Liste filtert danach, die Zaehler nicht", async () => {
  const { status, body } = await liste("?status=IN_PROGRESS&search=Lehr");
  expect(status).toBe(200);

  const listenWhere = mockPrisma.civilServiceProcess.findMany.mock.calls[0][0].where;
  expect(listenWhere).toMatchObject({ ...ORG_FILTER, status: "IN_PROGRESS" });
  expect(mockPrisma.civilServiceProcess.count.mock.calls[0][0].where).toEqual(listenWhere);

  const zaehlerWhere = mockPrisma.civilServiceProcess.groupBy.mock.calls[0][0].where;
  expect(zaehlerWhere).not.toHaveProperty("status");
  const { status: _status, ...listeOhneStatus } = listenWhere;
  expect(zaehlerWhere).toEqual(listeOhneStatus);

  expect(body.statusCounts).toEqual({ IN_PROGRESS: 3, COMPLETED: 2 });
});

it("die Zaehler behalten Mandant, Einrichtung, Zeitraum und Suche", async () => {
  await liste("?organizationId=org-1&from=2026-01-01&to=2026-12-31&search=Lehr");
  const zaehlerWhere = mockPrisma.civilServiceProcess.groupBy.mock.calls[0][0].where;
  expect(zaehlerWhere).toMatchObject({ organizationId: "org-1" });
  expect(zaehlerWhere.createdAt).toEqual({ gte: expect.any(Date), lte: expect.any(Date) });
  expect(zaehlerWhere.OR).toHaveLength(4);
});

it("ohne eigene Einrichtung bleibt der Mandantenfilter an den Zaehlern", async () => {
  await liste("?status=COMPLETED");
  expect(mockPrisma.civilServiceProcess.groupBy.mock.calls[0][0].where).toEqual(ORG_FILTER);
});
