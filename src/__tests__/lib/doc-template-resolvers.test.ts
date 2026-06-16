/**
 * Tests: Platzhalter-Katalog + Onboarding-Resolver (src/lib/doc-template-resolvers.ts)
 *
 * - Katalog: Onboarding erbt allgemeine + ergaenzt spezifische Platzhalter, Keys eindeutig.
 * - Resolver: fuellt Felder aus Personal-/Vorgesetzten-Daten; sensible Felder werden nur
 *   aufgeloest + gemeldet, wenn die Vorlage sie nutzt (placeholders-Gating).
 */

jest.mock("@/lib/db", () => ({
  prisma: {
    onboardingProcess: { findUnique: jest.fn() },
    organization: { findUnique: jest.fn() },
  },
}));

import { prisma } from "@/lib/db";
import {
  PLACEHOLDER_CATALOG,
  ALLGEMEIN_PLACEHOLDERS,
  getPlaceholderCatalog,
  getResolver,
  type ResolverContext,
} from "@/lib/doc-template-resolvers";

const mockFindOnboarding = prisma.onboardingProcess.findUnique as jest.Mock;
const mockFindOrg = prisma.organization.findUnique as jest.Mock;

const session = {
  userId: "u1",
  email: "a@b.de",
  role: "HR_LEITUNG",
  firstName: "A",
  lastName: "B",
};

function ctx(extra?: Partial<ResolverContext>): ResolverContext {
  return { organizationId: "org1", refId: "onb1", session, ...extra };
}

describe("Platzhalter-Katalog", () => {
  it("Onboarding erbt allgemeine + ergaenzt spezifische Platzhalter", () => {
    const onb = getPlaceholderCatalog("ONBOARDING");
    expect(onb.length).toBeGreaterThan(ALLGEMEIN_PLACEHOLDERS.length);
    const keys = onb.map((p) => p.key);
    expect(keys).toContain("vorname");
    expect(keys).toContain("eintrittsdatum");
    expect(keys).toContain("mandant"); // allgemein vererbt
  });

  it("hat je Modul eindeutige Platzhalter-Keys", () => {
    for (const [modul, defs] of Object.entries(PLACEHOLDER_CATALOG)) {
      const keys = defs.map((d) => d.key);
      expect({ modul, unique: new Set(keys).size }).toEqual({
        modul,
        unique: keys.length,
      });
    }
  });

  it("faellt bei unbekanntem Modul auf ALLGEMEIN zurueck", () => {
    expect(getPlaceholderCatalog("GIBTESNICHT")).toBe(ALLGEMEIN_PLACEHOLDERS);
  });
});

describe("Onboarding-Resolver", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindOrg.mockResolvedValue({
      name: "Gymnasium",
      shortName: "GYM",
      mandantNumber: "712",
      dsgvoVerantwortlicheName: null,
      dsgvoVerantwortlicheStrasse: null,
      dsgvoVerantwortlichePlz: null,
      dsgvoVerantwortlicheOrt: null,
    });
  });

  it("fuellt nicht-sensible Felder aus Personal-/Vorgesetzten-Daten", async () => {
    mockFindOnboarding.mockResolvedValue({
      displayId: "2026-GYM-001",
      email: "max@example.org",
      firstName: "Max",
      lastName: "Mustermann",
      organizationId: "org1",
      personalData: {
        firstName: "Max",
        lastName: "Mustermann",
        city: "Minden",
        zipCode: "32425",
        iban: "DE111",
        socialSecurityNumber: null,
        taxId: null,
      },
      supervisorData: {
        vertragsbeginn: new Date("2026-09-01T00:00:00.000Z"),
        entgeltgruppe: "E11",
        wochenstunden: 39,
      },
    });

    const { data, sensitiveFields } = await getResolver("ONBOARDING")(ctx());
    expect(data.vorname).toBe("Max");
    expect(data.name).toBe("Max Mustermann");
    expect(data.plz_ort).toBe("32425 Minden");
    expect(data.eintrittsdatum).toBe("01.09.2026");
    expect(data.entgeltgruppe).toBe("E11");
    expect(data.wochenstunden).toBe("39");
    expect(data.mandant).toBe("Gymnasium");
    // Ohne placeholders-Liste werden sensible Felder aufgeloest.
    expect(data.iban).toBe("DE111");
    expect(sensitiveFields).toContain("iban");
  });

  it("loest sensible Felder NICHT auf, wenn die Vorlage sie nicht nutzt", async () => {
    mockFindOnboarding.mockResolvedValue({
      displayId: "2026-GYM-001",
      email: "max@example.org",
      firstName: "Max",
      lastName: "M",
      organizationId: "org1",
      personalData: { iban: "DE111", taxId: "TX1", socialSecurityNumber: "SV1" },
      supervisorData: null,
    });

    const { data, sensitiveFields } = await getResolver("ONBOARDING")(
      ctx({ placeholders: ["vorname", "name"] }),
    );
    expect(data.iban).toBeUndefined();
    expect(data.steuer_id).toBeUndefined();
    expect(sensitiveFields).toEqual([]);
  });

  it("loest ein angefordertes sensibles Feld auf + meldet es im Audit", async () => {
    mockFindOnboarding.mockResolvedValue({
      displayId: "x",
      email: "m@example.org",
      firstName: "Max",
      lastName: "M",
      organizationId: "org1",
      personalData: { iban: "DE999", taxId: null, socialSecurityNumber: null },
      supervisorData: null,
    });

    const { data, sensitiveFields } = await getResolver("ONBOARDING")(
      ctx({ placeholders: ["iban"] }),
    );
    expect(data.iban).toBe("DE999");
    expect(sensitiveFields).toEqual(["iban"]);
  });
});
