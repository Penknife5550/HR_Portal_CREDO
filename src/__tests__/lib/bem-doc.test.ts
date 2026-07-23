/**
 * Tests: BEM-Platzhalter-Resolver (src/lib/bem-doc.ts)
 *
 * Schwerpunkt ist die Verdrahtung der {sachbearbeiter_*}-Platzhalter ueber den
 * geschuetzten BEM-Weg — und die Zusicherung, dass der Resolver weiterhin KEINE
 * gesundheitsbezogenen Freitexte ausliefert (Aktentrennung, § 167 SGB IX).
 */

jest.mock("@/lib/db", () => ({
  prisma: {
    bemFall: { findUnique: jest.fn() },
    organization: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { resolveBemPlaceholders } from "@/lib/bem-doc";

const mockFindFall = prisma.bemFall.findUnique as jest.Mock;
const mockFindOrg = prisma.organization.findUnique as jest.Mock;
const mockFindUser = prisma.user.findUnique as jest.Mock;

const FALL = {
  displayId: "BEM-2026-GYM-001",
  organizationId: "org1",
  employeeFirstName: "Max",
  employeeLastName: "Mustermann",
  employeeEmail: "max@example.org",
  employeePersonalNr: "4711",
  anlassFehlzeitenAb: new Date("2026-01-15T00:00:00.000Z"),
  einladungAm: null,
  datenschutzAm: null,
  erstgespraechAm: null,
  organization: { name: "Gymnasium", mandantNumber: "712" },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFindFall.mockResolvedValue(FALL);
  mockFindOrg.mockResolvedValue({
    name: "Gymnasium",
    shortName: "GYM",
    mandantNumber: "712",
    dsgvoVerantwortlicheName: null,
    dsgvoVerantwortlicheStrasse: null,
    dsgvoVerantwortlichePlz: null,
    dsgvoVerantwortlicheOrt: null,
  });
  mockFindUser.mockResolvedValue({
    firstName: "Erika",
    lastName: "Beauftragte",
    email: "erika@credo-gruppe.de",
    phone: "0571 / 8879-120",
  });
});

describe("resolveBemPlaceholders", () => {
  it("fuellt die Sachbearbeiter-Platzhalter, wenn eine Benutzer-ID uebergeben wird", async () => {
    const res = await resolveBemPlaceholders("fall1", "u1");
    expect(res).not.toBeNull();
    expect(mockFindUser).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { firstName: true, lastName: true, email: true, phone: true },
    });
    expect(res!.data.sachbearbeiter_name).toBe("Erika Beauftragte");
    expect(res!.data.sachbearbeiter_email).toBe("erika@credo-gruppe.de");
    expect(res!.data.sachbearbeiter_telefon).toBe("0571 / 8879-120");
  });

  it("fragt ohne Benutzer-ID den Benutzer gar nicht ab", async () => {
    const res = await resolveBemPlaceholders("fall1");
    expect(mockFindUser).not.toHaveBeenCalled();
    expect("sachbearbeiter_name" in res!.data).toBe(false);
  });

  it("laesst die Falldaten unberuehrt", async () => {
    const res = await resolveBemPlaceholders("fall1", "u1");
    expect(res!.data.fall_nummer).toBe("BEM-2026-GYM-001");
    expect(res!.data.name).toBe("Max Mustermann");
    expect(res!.data.email).toBe("max@example.org");
    expect(res!.data.fehlzeiten_ab).toBe("15.01.2026");
    expect(res!.empfaenger).toBe("Max Mustermann");
    expect(res!.mandantNumber).toBe("712");
  });

  it("liefert weiterhin KEINE gesundheitsbezogenen Freitexte (Aktentrennung)", async () => {
    const res = await resolveBemPlaceholders("fall1", "u1");
    const keys = Object.keys(res!.data);
    for (const verboten of ["diagnose", "anlass", "massnahmen", "gespraechsnotiz", "freitext"]) {
      expect({ verboten, vorhanden: keys.includes(verboten) }).toEqual({
        verboten,
        vorhanden: false,
      });
    }
  });

  it("gibt null zurueck, wenn der Fall nicht existiert", async () => {
    mockFindFall.mockResolvedValue(null);
    expect(await resolveBemPlaceholders("gibtesnicht", "u1")).toBeNull();
  });
});
