/**
 * Tests fuer das invertierte BEM-Zugriffsmodell ("versiegelte Akte").
 *
 * Kernaussage (§ 167 SGB IX): NIEMAND sieht BEM-Inhalte ohne aktive
 * BemZugriff-Freigabe — auch globale Rollen (SUPER_ADMIN/HR_LEITUNG) NICHT.
 * Globale Rollen duerfen Freigaben nur *verwalten*.
 */

const mockPrisma = {
  bemZugriff: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
};

jest.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

import {
  bemFilter,
  canAccessBemContent,
  canManageBemAccess,
  canCreateBemFall,
  type SessionPayload,
} from "@/lib/permissions";

function session(role: string, userId = "user-1"): SessionPayload {
  return {
    userId,
    email: `${userId}@credo.de`,
    role,
    firstName: "Test",
    lastName: "User",
  };
}

const FALL_ID = "bem-fall-1";

describe("BEM-Zugriffsmodell — canAccessBemContent (kein globaler Bypass)", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER"])(
    "verweigert Inhalte fuer %s OHNE BemZugriff",
    async (role) => {
      mockPrisma.bemZugriff.findFirst.mockResolvedValue(null);
      const result = await canAccessBemContent(session(role), FALL_ID);
      expect(result).toBe(false);
    }
  );

  it.each(["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER", "EINRICHTUNGSLEITUNG"])(
    "erlaubt Inhalte fuer %s MIT aktiver BemZugriff-Freigabe",
    async (role) => {
      mockPrisma.bemZugriff.findFirst.mockResolvedValue({ id: "z1" });
      const result = await canAccessBemContent(session(role), FALL_ID);
      expect(result).toBe(true);
    }
  );

  it("fragt nur aktive (nicht widerrufene) Freigaben ab", async () => {
    mockPrisma.bemZugriff.findFirst.mockResolvedValue(null);
    await canAccessBemContent(session("HR_LEITUNG"), FALL_ID);
    expect(mockPrisma.bemZugriff.findFirst).toHaveBeenCalledWith({
      where: { bemFallId: FALL_ID, userId: "user-1", revokedAt: null },
      select: { id: true },
    });
  });
});

describe("BEM-Zugriffsmodell — bemFilter", () => {
  beforeEach(() => jest.clearAllMocks());

  it("liefert nur freigegebene Fall-IDs (auch fuer globale Rollen)", async () => {
    mockPrisma.bemZugriff.findMany.mockResolvedValue([
      { bemFallId: "f1" },
      { bemFallId: "f2" },
    ]);
    const filter = await bemFilter(session("SUPER_ADMIN"));
    expect(filter).toEqual({ id: { in: ["f1", "f2"] } });
  });

  it("liefert leere Liste (= kein Zugriff) wenn keine Freigabe besteht", async () => {
    mockPrisma.bemZugriff.findMany.mockResolvedValue([]);
    const filter = await bemFilter(session("HR_LEITUNG"));
    expect(filter).toEqual({ id: { in: [] } });
  });
});

describe("BEM-Zugriffsmodell — canManageBemAccess (Verwalten != Lesen)", () => {
  it.each([
    ["SUPER_ADMIN", true],
    ["HR_LEITUNG", true],
    ["HR_SACHBEARBEITER", false],
    ["EINRICHTUNGSLEITUNG", false],
    ["VORGESETZTER", false],
  ])("%s -> %s", (role, expected) => {
    expect(canManageBemAccess(session(role))).toBe(expected);
  });
});

describe("BEM-Zugriffsmodell — canCreateBemFall", () => {
  beforeEach(() => jest.clearAllMocks());

  it("erlaubt SUPER_ADMIN ohne DB-Abfrage", async () => {
    const result = await canCreateBemFall(session("SUPER_ADMIN"));
    expect(result).toBe(true);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("erlaubt gekennzeichnete BEM-Beauftragte (isBemBeauftragte=true)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ isBemBeauftragte: true });
    const result = await canCreateBemFall(session("HR_SACHBEARBEITER"));
    expect(result).toBe(true);
  });

  it("verweigert normale HR-Rollen ohne Kennzeichnung", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ isBemBeauftragte: false });
    const result = await canCreateBemFall(session("HR_LEITUNG"));
    expect(result).toBe(false);
  });
});
