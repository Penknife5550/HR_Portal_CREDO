/**
 * Tests: Platzhalter-Katalog + Onboarding-Resolver (src/lib/doc-template-resolvers.ts)
 *
 * - Katalog: Onboarding erbt allgemeine + ergaenzt spezifische Platzhalter, Keys eindeutig.
 * - Resolver: fuellt Felder aus Personal-/Vorgesetzten-Daten; sensible Felder werden nur
 *   aufgeloest + gemeldet, wenn die Vorlage sie nutzt (placeholders-Gating).
 */

// canAccessProcess wird ueberschrieben, alles andere aus permissions bleibt echt.
// Standard ist "erlaubt" — die Bestandstests laufen dadurch unveraendert weiter.
const mockCanAccessProcess = jest.fn().mockResolvedValue(true);
jest.mock("@/lib/permissions", () => ({
  ...jest.requireActual("@/lib/permissions"),
  canAccessProcess: (...args: unknown[]) => mockCanAccessProcess(...args),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    onboardingProcess: { findUnique: jest.fn() },
    contractEndProcess: { findUnique: jest.fn() },
    organization: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
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
const mockFindUser = prisma.user.findUnique as jest.Mock;
const mockFindContractEnd = prisma.contractEndProcess.findUnique as jest.Mock;

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
    mockFindUser.mockResolvedValue({
      firstName: "Erika",
      lastName: "Sachbearbeiter",
      email: "erika@credo-gruppe.de",
      phone: "0571 / 1234",
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

describe("Sachbearbeiter-Platzhalter", () => {
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

  it("stehen in jedem Modul-Katalog zur Verfuegung", () => {
    const keys = [
      "sachbearbeiter_name",
      "sachbearbeiter_vorname",
      "sachbearbeiter_nachname",
      "sachbearbeiter_email",
      "sachbearbeiter_telefon",
    ];
    for (const modul of Object.keys(PLACEHOLDER_CATALOG)) {
      const vorhanden = getPlaceholderCatalog(modul).map((p) => p.key);
      for (const key of keys) {
        expect({ modul, key, vorhanden: vorhanden.includes(key) }).toEqual({
          modul,
          key,
          vorhanden: true,
        });
      }
    }
  });

  it("ueberschreiben im Onboarding NICHT die Mitarbeiter-Daten", async () => {
    // Der eigentliche Kollisionstest: {email}/{telefon}/{name} muessen weiterhin
    // die Daten des MITARBEITERS tragen, nicht die des Sachbearbeiters.
    mockFindUser.mockResolvedValue({
      firstName: "Erika",
      lastName: "Sachbearbeiter",
      email: "erika@credo-gruppe.de",
      phone: "0571 / 999",
    });
    mockFindOnboarding.mockResolvedValue({
      displayId: "2026-GYM-001",
      email: "max@example.org",
      firstName: "Max",
      lastName: "Mustermann",
      organizationId: "org1",
      personalData: { firstName: "Max", lastName: "Mustermann", phone: "0571 / 111" },
      supervisorData: null,
    });

    const { data } = await getResolver("ONBOARDING")(ctx());
    expect(data.email).toBe("max@example.org");
    expect(data.telefon).toBe("0571 / 111");
    expect(data.name).toBe("Max Mustermann");
    expect(data.sachbearbeiter_email).toBe("erika@credo-gruppe.de");
    expect(data.sachbearbeiter_telefon).toBe("0571 / 999");
    expect(data.sachbearbeiter_name).toBe("Erika Sachbearbeiter");
  });

  it("werden auch vom ONBOARDING-Resolver gefuellt (Verdrahtung)", async () => {
    mockFindUser.mockResolvedValue({
      firstName: "Erika",
      lastName: "Sachbearbeiter",
      email: "erika@credo-gruppe.de",
      phone: "0571 / 999",
    });
    mockFindOnboarding.mockResolvedValue({
      displayId: "x",
      email: "m@example.org",
      firstName: "Max",
      lastName: "M",
      organizationId: "org1",
      personalData: null,
      supervisorData: null,
    });

    const { data } = await getResolver("ONBOARDING")(ctx());
    expect(data.sachbearbeiter_name).toBe("Erika Sachbearbeiter");
  });

  it("werden auch gefuellt, wenn der Vorgang nicht gefunden wird (Fallback-Zweig)", async () => {
    mockFindUser.mockResolvedValue({
      firstName: "Erika",
      lastName: "Sachbearbeiter",
      email: "erika@credo-gruppe.de",
      phone: null,
    });
    mockFindOnboarding.mockResolvedValue(null);

    const { data } = await getResolver("ONBOARDING")(ctx());
    expect(data.sachbearbeiter_name).toBe("Erika Sachbearbeiter");
  });

  it("werden auch vom VERTRAGSVERLAENGERUNG-Resolver gefuellt (Verdrahtung)", async () => {
    mockFindUser.mockResolvedValue({
      firstName: "Erika",
      lastName: "Sachbearbeiter",
      email: "erika@credo-gruppe.de",
      phone: "0571 / 999",
    });
    mockFindContractEnd.mockResolvedValue({
      displayId: "VE-2026-GYM-001",
      employeeFirstName: "Max",
      employeeLastName: "Mustermann",
      employeePersonalNr: null,
      contractEndDate: new Date("2026-08-31T00:00:00.000Z"),
      organizationId: "org1",
      currentPosition: null,
      currentEntgeltgruppe: null,
      currentStufe: null,
      currentWochenstunden: null,
      dokubitDaten: null,
      renewalData: null,
    });

    const { data } = await getResolver("VERTRAGSVERLAENGERUNG")(ctx({ refId: "ce1" }));
    expect(data.name).toBe("Max Mustermann");
    expect(data.sachbearbeiter_name).toBe("Erika Sachbearbeiter");
    expect(data.sachbearbeiter_telefon).toBe("0571 / 999");
  });

  it("werden aus dem angemeldeten Benutzer gefuellt", async () => {
    mockFindUser.mockResolvedValue({
      firstName: "Erika",
      lastName: "Musterfrau",
      email: "erika@credo-gruppe.de",
      phone: "0571 / 8879-120",
    });

    const { data } = await getResolver("ALLGEMEIN")(ctx());
    // Exakter Assert inkl. select: Der Mock liefert die Felder unabhaengig vom
    // select zurueck — ein vergessenes `phone: true` faellt sonst niemandem auf,
    // waehrend im Betrieb {sachbearbeiter_telefon} dauerhaft "___" bliebe.
    expect(mockFindUser).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { firstName: true, lastName: true, email: true, phone: true },
    });
    expect(data.sachbearbeiter_vorname).toBe("Erika");
    expect(data.sachbearbeiter_nachname).toBe("Musterfrau");
    expect(data.sachbearbeiter_name).toBe("Erika Musterfrau");
    expect(data.sachbearbeiter_email).toBe("erika@credo-gruppe.de");
    expect(data.sachbearbeiter_telefon).toBe("0571 / 8879-120");
  });

  it("setzt eine fehlende Telefonnummer NICHT (Markierung als ___ bleibt erhalten)", async () => {
    mockFindUser.mockResolvedValue({
      firstName: "Erika",
      lastName: "Musterfrau",
      email: "erika@credo-gruppe.de",
      phone: null,
    });

    const { data } = await getResolver("ALLGEMEIN")(ctx());
    expect(data.sachbearbeiter_name).toBe("Erika Musterfrau");
    expect("sachbearbeiter_telefon" in data).toBe(false);
  });

  it("setzt eine leere Telefonnummer NICHT", async () => {
    mockFindUser.mockResolvedValue({
      firstName: "Erika",
      lastName: "Musterfrau",
      email: "erika@credo-gruppe.de",
      phone: "   ",
    });

    const { data } = await getResolver("ALLGEMEIN")(ctx());
    expect("sachbearbeiter_telefon" in data).toBe(false);
  });

  it("bleibt stabil, wenn der Benutzer nicht mehr existiert", async () => {
    mockFindUser.mockResolvedValue(null);

    const { data } = await getResolver("ALLGEMEIN")(ctx());
    expect("sachbearbeiter_name" in data).toBe(false);
    // Die uebrigen allgemeinen Platzhalter bleiben unberuehrt.
    expect(data.mandant).toBe("Gymnasium");
  });

  it("fragt den Benutzer gar nicht ab, wenn keine Session-ID vorliegt", async () => {
    const ohneUser = {
      organizationId: "org1",
      refId: null,
      session: { ...session, userId: "" },
    } as ResolverContext;

    const { data } = await getResolver("ALLGEMEIN")(ohneUser);
    expect(mockFindUser).not.toHaveBeenCalled();
    expect("sachbearbeiter_name" in data).toBe(false);
  });
});

// =============================================
// Mandantenpruefung in Onboarding und Vertragsverlaengerung
//
// Vorgezogen aus Baustein 16 des Dokumentenpaket-Plans: Beide Resolver hatten
// keine Pruefung, weil der Erzeugen-Endpunkt nur die Organisation der VORLAGE
// prueft. Solange alle vergebbaren Rollen global sind, faellt das nicht auf —
// mit der ersten mandantenbeschraenkten Rolle waere es ein Leck.
//
// Der Rueckfall ist bewusst still (nur allgemeine Platzhalter), nicht laut:
// So verhaelt sich bereits der Offboarding-Resolver. Fuer den Paketversand
// heisst das, dass die aufrufende Route zusaetzlich selbst pruefen muss — ein
// leeres Schreiben darf nicht als Erfolg durchgehen.
// =============================================
describe("Mandantenpruefung der Resolver", () => {
  const vorgang = {
    displayId: "2026-GYM-001",
    email: "max@example.org",
    firstName: "Max",
    lastName: "Mustermann",
    organizationId: "fremde-org",
    personalData: { firstName: "Max", lastName: "Mustermann", iban: "DE111" },
    supervisorData: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCanAccessProcess.mockResolvedValue(true);
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
      lastName: "Sachbearbeiter",
      email: "erika@credo-gruppe.de",
      phone: null,
    });
  });

  it("Onboarding: fremder Mandant liefert nur allgemeine Platzhalter", async () => {
    mockFindOnboarding.mockResolvedValue(vorgang);
    mockCanAccessProcess.mockResolvedValue(false);

    const res = await getResolver("ONBOARDING")(ctx({ placeholders: ["vorname", "iban"] }));

    expect(mockCanAccessProcess).toHaveBeenCalledWith(session, "fremde-org");
    expect(res.data.vorname).toBeUndefined();
    expect(res.data.iban).toBeUndefined();
    expect(res.sensitiveFields).toEqual([]);
    // Allgemeines bleibt — das Schreiben traegt Datum und Mandant, sonst nichts.
    expect(res.data.datum).toBeDefined();
  });

  it("Onboarding: eigener Mandant fuellt weiterhin", async () => {
    mockFindOnboarding.mockResolvedValue(vorgang);

    const res = await getResolver("ONBOARDING")(ctx({ placeholders: ["vorname"] }));

    expect(res.data.vorname).toBe("Max");
  });

  it("Vertragsverlaengerung: fremder Mandant liefert nur allgemeine Platzhalter", async () => {
    mockFindContractEnd.mockResolvedValue({
      displayId: "2026-GYM-900",
      employeeFirstName: "Lena",
      employeeLastName: "Bergmann",
      organizationId: "fremde-org",
      contractEndDate: new Date("2026-12-31T00:00:00.000Z"),
      renewalData: null,
    });
    mockCanAccessProcess.mockResolvedValue(false);

    const res = await getResolver("VERTRAGSVERLAENGERUNG")(
      ctx({ refId: "ce1", placeholders: ["vorname"] }),
    );

    expect(mockCanAccessProcess).toHaveBeenCalledWith(session, "fremde-org");
    expect(res.data.vorname).toBeUndefined();
    expect(res.data.datum).toBeDefined();
  });

  it("Vertragsverlaengerung: eigener Mandant fuellt weiterhin", async () => {
    mockFindContractEnd.mockResolvedValue({
      displayId: "2026-GYM-900",
      employeeFirstName: "Lena",
      employeeLastName: "Bergmann",
      organizationId: "org1",
      contractEndDate: new Date("2026-12-31T00:00:00.000Z"),
      renewalData: null,
    });

    const res = await getResolver("VERTRAGSVERLAENGERUNG")(
      ctx({ refId: "ce1", placeholders: ["vorname"] }),
    );

    expect(res.data.vorname).toBe("Lena");
  });
});
