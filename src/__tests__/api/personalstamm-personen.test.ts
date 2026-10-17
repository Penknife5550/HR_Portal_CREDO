/**
 * GET /api/personalstamm/personen — die Liste der Ansicht „Personen"
 * (Self-Service S0).
 *
 * Zugriff nur fuer die drei HR-Rollen (authHandler, ohne SERVICE), die
 * schlanke Leseform (keine privaten Felder, keine LOGA-Nummer), die Suche
 * ueber die MANR der Vertraege statt der LOGA-Nummer, der Filter und
 * `bestandLeer` fuer den Leerzustand.
 */

const mockGetSession = jest.fn();
const mockPrisma = {
  employee: { count: jest.fn(), findMany: jest.fn() },
};

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/personalstamm/personen/route";

const HR = { userId: "hr1", email: "hr@credo-gruppe.de", role: "HR_SACHBEARBEITER", firstName: "H", lastName: "S" };

async function aufrufen(query = "") {
  const res = await GET(new NextRequest(`http://localhost:3000/api/personalstamm/personen${query}`), {
    params: Promise.resolve({}),
  });
  return { status: res.status, body: await res.json() };
}

function findManyArgs() {
  return mockPrisma.employee.findMany.mock.calls[0][0];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue(HR);
  mockPrisma.employee.findMany.mockResolvedValue([{ id: "p1" }]);
  mockPrisma.employee.count.mockResolvedValue(1);
});

describe("Zugriff", () => {
  it("401 ohne Sitzung, ohne die Datenbank zu fragen", async () => {
    mockGetSession.mockResolvedValue(null);
    const { status } = await aufrufen();
    expect(status).toBe(401);
    expect(mockPrisma.employee.findMany).not.toHaveBeenCalled();
  });

  it.each(["SERVICE", "EINRICHTUNGSLEITUNG", "VORGESETZTER", "BEM_BEAUFTRAGTER"])("403 fuer %s", async (role) => {
    mockGetSession.mockResolvedValue({ ...HR, role });
    const { status } = await aufrufen();
    expect(status).toBe(403);
    expect(mockPrisma.employee.findMany).not.toHaveBeenCalled();
  });

  it.each(["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER"])("200 fuer %s", async (role) => {
    mockGetSession.mockResolvedValue({ ...HR, role });
    const { status, body } = await aufrufen();
    expect(status).toBe(200);
    expect(body).toEqual({ data: [{ id: "p1" }], total: 1, page: 1, limit: 25, bestandLeer: false });
  });
});

describe("Leseform", () => {
  it("liest nur die angezeigten Felder — nichts Privates, keine LOGA-Nummer", async () => {
    await aufrufen();
    const args = findManyArgs();
    expect(args).not.toHaveProperty("include");
    expect(Object.keys(args.select).sort()).toEqual(
      ["email", "employments", "firstName", "id", "importSource", "isActive", "lastName", "lastSyncAt"].sort(),
    );
    expect(Object.keys(args.select.employments.select).sort()).toEqual(
      ["abrechnungskreis", "endDate", "id", "isActive", "mandantNumber", "organization", "personalNumber"].sort(),
    );
  });

  it("Suche ueber Name, Adresse und MANR der Vertraege — nicht ueber die LOGA-Nummer der Person", async () => {
    await aufrufen("?search=%202001%20");
    expect(findManyArgs().where.OR).toEqual([
      { firstName: { contains: "2001", mode: "insensitive" } },
      { lastName: { contains: "2001", mode: "insensitive" } },
      { email: { contains: "2001", mode: "insensitive" } },
      { employments: { some: { personalNumber: { contains: "2001", mode: "insensitive" } } } },
    ]);
  });

  it.each([
    ["", { isActive: true }],
    ["?isActive=true", { isActive: true }],
    ["?isActive=false", { isActive: false }],
    ["?isActive=all", {}],
  ])("Filter %s", async (query, where) => {
    await aufrufen(query);
    expect(findManyArgs().where).toEqual(where);
    expect(mockPrisma.employee.count.mock.calls[0][0]).toEqual({ where });
  });

  it("Blaettern: skip und take aus page und limit, limit hoechstens 100", async () => {
    await aufrufen("?page=3&limit=500");
    expect(findManyArgs()).toMatchObject({ skip: 200, take: 100 });
  });
});

describe("bestandLeer", () => {
  it("true nur, wenn es ueberhaupt keine Person gibt", async () => {
    mockPrisma.employee.findMany.mockResolvedValue([]);
    mockPrisma.employee.count.mockResolvedValue(0);
    const { body } = await aufrufen("?search=xyz");
    expect(body).toMatchObject({ total: 0, bestandLeer: true });
    expect(mockPrisma.employee.count).toHaveBeenLastCalledWith();
  });

  it("false, wenn nur Suche oder Filter nichts finden", async () => {
    mockPrisma.employee.findMany.mockResolvedValue([]);
    mockPrisma.employee.count.mockResolvedValueOnce(0).mockResolvedValueOnce(12);
    const { body } = await aufrufen("?isActive=false");
    expect(body).toMatchObject({ total: 0, bestandLeer: false });
  });
});
