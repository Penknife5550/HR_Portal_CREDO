/**
 * Tests fuer den serverseitigen Mandantenfilter von GET /api/brief-vorlagen.
 *
 * Der Parameter ?organizationId= grenzt die Vorlagen eines Vorgangs auf
 * gruppenweite plus die des eigenen Traegers ein. Kritisch ist dabei, dass er
 * den bestehenden Rollen-Scope ERGAENZT und nicht ueberschreibt — sonst saehe
 * eine eingeschraenkte Rolle ploetzlich fremde Mandanten.
 */

const mockGetSession = jest.fn();
const mockGetAllowedOrgIds = jest.fn();
const mockCanAccessOrg = jest.fn();
const mockPrisma = {
  documentTemplate: { findMany: jest.fn() },
};

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/permissions", () => ({
  ADMIN_ROLES: ["SUPER_ADMIN", "HR_LEITUNG"],
  HR_EDIT_ROLES: ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER"],
  getAllowedOrgIds: mockGetAllowedOrgIds,
  canAccessOrg: mockCanAccessOrg,
}));

import { GET } from "@/app/api/brief-vorlagen/route";
import { NextRequest } from "next/server";

const HR = {
  userId: "hr1",
  email: "hr@credo-gruppe.de",
  role: "HR_LEITUNG",
  firstName: "H",
  lastName: "L",
};

function get(query: string) {
  return new NextRequest(`http://localhost:3000/api/brief-vorlagen${query}`);
}

/** Die tatsaechlich an Prisma uebergebene WHERE-Klausel. */
function where(): Record<string, unknown> {
  return mockPrisma.documentTemplate.findMany.mock.calls[0][0].where;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue(HR);
  mockPrisma.documentTemplate.findMany.mockResolvedValue([]);
  mockGetAllowedOrgIds.mockResolvedValue(null); // globale Rolle
  mockCanAccessOrg.mockResolvedValue(true);
});

describe("ohne organizationId bleibt das Verhalten unveraendert", () => {
  it("filtert nur nach isActive und Modul", async () => {
    await GET(get("?modul=ONBOARDING"), { params: Promise.resolve({}) });
    expect(where()).toEqual({ isActive: true, modul: "ONBOARDING" });
  });

  it("setzt fuer eingeschraenkte Rollen den Scope als AND-Bedingung", async () => {
    mockGetAllowedOrgIds.mockResolvedValue(["org-a"]);
    await GET(get("?modul=ONBOARDING"), { params: Promise.resolve({}) });
    expect(where().AND).toEqual([
      { OR: [{ organizationId: null }, { organizationId: { in: ["org-a"] } }] },
    ]);
  });
});

describe("mit organizationId", () => {
  it("liefert gruppenweite Vorlagen UND die des Traegers", async () => {
    await GET(get("?modul=ONBOARDING&organizationId=org-kita"), {
      params: Promise.resolve({}),
    });
    expect(where().AND).toEqual([
      { OR: [{ organizationId: null }, { organizationId: "org-kita" }] },
    ]);
  });

  it("ERGAENZT den Rollen-Scope, statt ihn zu ueberschreiben", async () => {
    // Der eigentliche Sicherheitstest: beide Bedingungen muessen nebeneinander
    // stehen. Wuerden beide auf where.OR schreiben, bliebe nur die letzte uebrig.
    mockGetAllowedOrgIds.mockResolvedValue(["org-kita", "org-gym"]);
    await GET(get("?organizationId=org-kita"), { params: Promise.resolve({}) });

    const bedingungen = where().AND as Record<string, unknown>[];
    expect(bedingungen).toHaveLength(2);
    expect(bedingungen[0]).toEqual({
      OR: [{ organizationId: null }, { organizationId: { in: ["org-kita", "org-gym"] } }],
    });
    expect(bedingungen[1]).toEqual({
      OR: [{ organizationId: null }, { organizationId: "org-kita" }],
    });
    expect("OR" in where()).toBe(false);
  });

  it("weist einen Mandanten ohne Berechtigung mit 403 ab", async () => {
    mockCanAccessOrg.mockResolvedValue(false);
    const res = await GET(get("?organizationId=org-fremd"), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(403);
    expect(mockPrisma.documentTemplate.findMany).not.toHaveBeenCalled();
  });

  it("prueft die Berechtigung gegen den uebergebenen Mandanten", async () => {
    await GET(get("?organizationId=org-kita"), { params: Promise.resolve({}) });
    expect(mockCanAccessOrg).toHaveBeenCalledWith(HR, "org-kita");
  });
});
