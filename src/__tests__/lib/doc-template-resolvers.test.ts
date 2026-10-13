/**
 * Tests: Platzhalter-Katalog + Onboarding-Resolver (src/lib/doc-template-resolvers.ts)
 *
 * - Katalog: Onboarding erbt allgemeine + ergaenzt spezifische Platzhalter, Keys eindeutig.
 * - Resolver: fuellt Felder aus Personal-/Vorgesetzten-Daten; sensible Felder werden nur
 *   aufgeloest + gemeldet, wenn die Vorlage sie nutzt (placeholders-Gating).
 * - {ausstattung_liste} (Ausstattung & Zugaenge, S20/E-A25): eine Zeile je
 *   gewaehlter Position, ohne Bemerkung, Angabe, Hinweis und Gestrichenes.
 * - Listen-Platzhalter (A4, S33, Feinplan 1.9): Der Katalog kennt Listen,
 *   {ausgaben_je_stelle}/{ausgaben_liste}/{ausgaben_anzahl} im Onboarding –
 *   ohne Bemerkung, mit Mandantenpruefung, jedes innere Feld gesetzt.
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
    departmentConfig: { findMany: jest.fn() },
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
import {
  eingabePlatzhalter,
  handwerteOhneListen,
  istListenPlatzhalter,
  listenNamen,
  sensiblePlatzhalter,
  vorlagenListen,
} from "@/lib/placeholder-catalog";

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

  it("nimmt den Namen am Vorgang, solange der Fragebogen noch keinen hat (Vorbelegung im Dialog „Neuer Vorgang“)", async () => {
    mockFindOnboarding.mockResolvedValue({
      displayId: "2026-GYM-014",
      email: "anna.privat@example.org",
      firstName: "Anna",
      lastName: null,
      organizationId: "org1",
      personalData: { firstName: null, lastName: null },
      supervisorData: null,
    });

    const { data } = await getResolver("ONBOARDING")(ctx());
    expect(data.vorname).toBe("Anna");
    expect(data.name).toBe("Anna");
    expect(data.nachname).toBeUndefined();
  });

  // Ausstattung & Zugaenge (Paket A3, S20, E-A25): {ausstattung_liste} fuer ein
  // Schreiben „Was Sie am ersten Tag erhalten“ — ohne Bemerkungen.
  describe("{ausstattung_liste} (E-A25)", () => {
    const vorgang = (ausstattung: unknown) => ({
      displayId: "2026-GYM-020",
      email: "anna.privat@example.org",
      firstName: "Anna",
      lastName: "Beispiel",
      organizationId: "org1",
      personalData: null,
      supervisorData: null,
      ausstattung,
    });

    it("steht im Onboarding-Katalog, ist nicht sensibel und sagt „ohne Bemerkungen“", () => {
      const def = getPlaceholderCatalog("ONBOARDING").find((p) => p.key === "ausstattung_liste");
      expect(def).toBeDefined();
      expect(def?.sensitive).toBeFalsy();
      expect(def?.label).toContain("ohne Bemerkungen");
      // Nur im Onboarding — die anderen Module kennen keine Ausstattung.
      expect(getPlaceholderCatalog("OFFBOARDING").some((p) => p.key === "ausstattung_liste")).toBe(false);
    });

    it("eine Zeile je gewaehlter Position, Auswahl mit Optionen — ohne Bemerkung, Angabe, Gestrichenes", async () => {
      mockFindOnboarding.mockResolvedValue(
        vorgang([
          {
            departmentKey: "IT", art: "AUSWAHL", bezeichnung: "Zugänge", auswahl: ["Dienst-E-Mail", "WebUntis"],
            reihenfolge: 2, gestrichenAm: null,
            // Kaeme eine Bemerkung doch mit, stuende sie trotzdem nicht im Brief.
            bemerkung: "Bitte erst nach der Verpflichtung",
          },
          { departmentKey: "IT", art: "JA_NEIN", bezeichnung: "Dienst-iPad (Lernmittel)", auswahl: [], reihenfolge: 1, gestrichenAm: null },
          { departmentKey: "FACILITY", art: "JA_NEIN", bezeichnung: "Spind", auswahl: [], reihenfolge: 0, gestrichenAm: new Date("2027-01-10T10:00:00Z") },
          { departmentKey: "IT", art: "ANGABE", bezeichnung: "Gewünschte Durchwahl", auswahl: [], reihenfolge: 3, gestrichenAm: null, angabe: "214" },
        ]),
      );

      const { data, sensitiveFields } = await getResolver("ONBOARDING")(ctx());
      expect(data.ausstattung_liste).toBe("Dienst-iPad (Lernmittel)\nZugänge: Dienst-E-Mail, WebUntis");
      expect(String(data.ausstattung_liste)).not.toMatch(/Verpflichtung|214|Spind/);
      expect(sensitiveFields).toEqual([]);
    });

    it("liest nur Titel und Auswahl — Bemerkung, Angabe und Hinweise fragt die Abfrage gar nicht ab", async () => {
      mockFindOnboarding.mockResolvedValue(vorgang([]));
      await getResolver("ONBOARDING")(ctx());
      const auswahl = mockFindOnboarding.mock.calls[0][0].select;
      expect(auswahl.ausstattung).toEqual({
        where: { gestrichenAm: null, art: { in: ["JA_NEIN", "AUSWAHL"] } },
        select: { departmentKey: true, art: true, bezeichnung: true, auswahl: true, reihenfolge: true, gestrichenAm: true },
      });
      expect(auswahl.stellenHinweise).toBeUndefined();
    });

    it("nichts gewaehlt (oder Vorgang vor dem Paket): kein Wert, wie bei jedem leeren Feld", async () => {
      mockFindOnboarding.mockResolvedValue(vorgang([]));
      expect((await getResolver("ONBOARDING")(ctx())).data.ausstattung_liste).toBeUndefined();
      mockFindOnboarding.mockResolvedValue(vorgang(undefined));
      expect((await getResolver("ONBOARDING")(ctx())).data.ausstattung_liste).toBeUndefined();
    });

    it("fremder Mandant: keine Liste (wie alle Vorgangsdaten)", async () => {
      mockCanAccessProcess.mockResolvedValueOnce(false);
      mockFindOnboarding.mockResolvedValue(
        vorgang([{ departmentKey: "IT", art: "JA_NEIN", bezeichnung: "Dienst-iPad", auswahl: [], reihenfolge: 0, gestrichenAm: null }]),
      );
      expect((await getResolver("ONBOARDING")(ctx())).data.ausstattung_liste).toBeUndefined();
    });
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

// =============================================
// Vertragsverlaengerung: {betriebsstaette}
//
// Das Formular der Fuehrungskraft speichert die Betriebsstaette als Auswahl
// (`betriebsstaetteOrgId`); der Freitext `betriebsstaette` bleibt dabei leer und
// traegt nur Altbestand. Bis 10/2026 las der Resolver nur den Freitext — der
// Platzhalter blieb in jedem neuen Schreiben "___".
// =============================================
describe("Vertragsverlaengerung: Betriebsstaette", () => {
  const ORG_ID = "7c1e2d3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
  /** Nur die Abfrage nach dem Namen der Betriebsstaette, nicht die des Briefkopfs. */
  const NAMENSABFRAGE = { where: { id: ORG_ID }, select: { name: true } };

  const vorgang = (renewalData: Record<string, unknown> | null, organizationId = "org1") => ({
    displayId: "VE-2026-GYM-001",
    employeeFirstName: "Lena",
    employeeLastName: "Bergmann",
    employeePersonalNr: null,
    contractEndDate: new Date("2026-12-31T00:00:00.000Z"),
    organizationId,
    currentPosition: null,
    currentEntgeltgruppe: null,
    currentStufe: null,
    currentWochenstunden: null,
    dokubitDaten: null,
    renewalData,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCanAccessProcess.mockResolvedValue(true);
    mockFindUser.mockResolvedValue(null);
    // Briefkopf (Mandant des Vorgangs) und Betriebsstaette sind verschiedene
    // Mandanten — so faellt auf, wenn der falsche Name im Platzhalter landet.
    mockFindOrg.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === ORG_ID
        ? { name: "Gesamtschule Minden" }
        : {
            name: "Gymnasium",
            shortName: "GYM",
            mandantNumber: "712",
            dsgvoVerantwortlicheName: null,
            dsgvoVerantwortlicheStrasse: null,
            dsgvoVerantwortlichePlz: null,
            dsgvoVerantwortlicheOrt: null,
          },
    );
  });

  it("gewählte Betriebsstätte: Name dieses Mandanten, nicht der des Vorgangs", async () => {
    mockFindContractEnd.mockResolvedValue(
      vorgang({ betriebsstaetteOrgId: ORG_ID, betriebsstaette: null }),
    );

    const { data } = await getResolver("VERTRAGSVERLAENGERUNG")(ctx({ refId: "ce1" }));

    expect(mockFindOrg).toHaveBeenCalledWith(NAMENSABFRAGE);
    expect(data.betriebsstaette).toBe("Gesamtschule Minden");
    expect(data.mandant).toBe("Gymnasium");
    // Exakter Assert auf das select: Der Mock liefert renewalData unabhaengig
    // davon — ein vergessenes `betriebsstaetteOrgId: true` fiele sonst nicht auf.
    expect(mockFindContractEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          renewalData: {
            select: expect.objectContaining({ betriebsstaette: true, betriebsstaetteOrgId: true }),
          },
        }),
      }),
    );
  });

  it("Auswahl und Freitext gesetzt: die Auswahl gewinnt", async () => {
    mockFindContractEnd.mockResolvedValue(
      vorgang({ betriebsstaetteOrgId: ORG_ID, betriebsstaette: "Minden, alter Standort" }),
    );

    const { data } = await getResolver("VERTRAGSVERLAENGERUNG")(ctx({ refId: "ce1" }));

    expect(data.betriebsstaette).toBe("Gesamtschule Minden");
  });

  it.each([null, ""])(
    "ohne Auswahl (%p): Freitext aus dem Altbestand, keine Abfrage",
    async (betriebsstaetteOrgId) => {
      mockFindContractEnd.mockResolvedValue(
        vorgang({ betriebsstaetteOrgId, betriebsstaette: "Minden, Hauptstandort" }),
      );

      const { data } = await getResolver("VERTRAGSVERLAENGERUNG")(ctx({ refId: "ce1" }));

      expect(data.betriebsstaette).toBe("Minden, Hauptstandort");
      expect(mockFindOrg).not.toHaveBeenCalledWith(
        expect.objectContaining({ select: { name: true } }),
      );
    },
  );

  it("Betriebsstätte inzwischen gelöscht: Freitext, sonst bleibt der Platzhalter ungesetzt (\"___\")", async () => {
    mockFindOrg.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === ORG_ID ? null : { name: "Gymnasium", mandantNumber: "712" },
    );

    mockFindContractEnd.mockResolvedValue(
      vorgang({ betriebsstaetteOrgId: ORG_ID, betriebsstaette: "Minden, Hauptstandort" }),
    );
    const mitFreitext = await getResolver("VERTRAGSVERLAENGERUNG")(ctx({ refId: "ce1" }));
    expect(mitFreitext.data.betriebsstaette).toBe("Minden, Hauptstandort");

    mockFindContractEnd.mockResolvedValue(
      vorgang({ betriebsstaetteOrgId: ORG_ID, betriebsstaette: null }),
    );
    const ohne = await getResolver("VERTRAGSVERLAENGERUNG")(ctx({ refId: "ce1" }));
    expect("betriebsstaette" in ohne.data).toBe(false);
  });

  it("ohne Vertragsdaten: weder Abfrage noch Platzhalter", async () => {
    mockFindContractEnd.mockResolvedValue(vorgang(null));

    const { data } = await getResolver("VERTRAGSVERLAENGERUNG")(ctx({ refId: "ce1" }));

    expect("betriebsstaette" in data).toBe(false);
    expect(mockFindOrg).not.toHaveBeenCalledWith(NAMENSABFRAGE);
  });

  it("fremder Mandant: die Betriebsstätte wird gar nicht erst nachgeschlagen", async () => {
    mockFindContractEnd.mockResolvedValue(
      vorgang({ betriebsstaetteOrgId: ORG_ID, betriebsstaette: null }, "fremde-org"),
    );
    mockCanAccessProcess.mockResolvedValue(false);

    const { data } = await getResolver("VERTRAGSVERLAENGERUNG")(ctx({ refId: "ce1" }));

    expect(mockCanAccessProcess).toHaveBeenCalledWith(session, "fremde-org");
    expect(data.betriebsstaette).toBeUndefined();
    expect(mockFindOrg).not.toHaveBeenCalledWith(NAMENSABFRAGE);
  });
});

describe("Datum in deutscher Zeit (der Container laeuft in UTC)", () => {
  // Der Testlauf rechnet wie der Container in UTC (jest.config.ts, geprueft in
  // format.test.ts). Die alte Fassung (toLocaleDateString und getFullYear
  // ohne Zeitzone) lieferte hier den Vortag bzw. das alte Jahr.
  /** Stellt nur die Uhr; Mikrotasks der gemockten Abfragen laufen weiter. */
  const uhrStellen = (iso: string) =>
    jest.useFakeTimers({
      now: new Date(iso),
      doNotFake: ["nextTick", "setImmediate", "queueMicrotask"],
    });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCanAccessProcess.mockResolvedValue(true);
    mockFindOrg.mockResolvedValue(null);
    mockFindUser.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("{datum}: ein Brief kurz nach Mitternacht traegt den neuen Tag, nicht den Vortag", async () => {
    // 22:30 UTC ist in der Sommerzeit 00:30 Uhr am 09.10.
    uhrStellen("2026-10-08T22:30:00.000Z");

    const { data } = await getResolver("ALLGEMEIN")({ session });

    expect(data.datum).toBe("09.10.2026");
    expect(data.jahr).toBe("2026");
  });

  it("{jahr} folgt demselben Kalendertag — in der ersten Stunde des Jahres das neue", async () => {
    // Winterzeit: 23:30 UTC am 31.12. ist 00:30 Uhr am 01.01.
    uhrStellen("2026-12-31T23:30:00.000Z");

    const { data } = await getResolver("ALLGEMEIN")({ session });

    expect(data.datum).toBe("01.01.2027");
    expect(data.jahr).toBe("2027");
  });

  it("Datumsfelder eines Vorgangs nehmen den Berliner Kalendertag", async () => {
    // Ein Zeitpunkt kurz nach Mitternacht deutscher Zeit (hier 00:30 Uhr am
    // 01.09.) fiel mit der Serverzeit auf den 31.08.
    mockFindOnboarding.mockResolvedValue({
      displayId: "2026-GYM-002",
      email: "max@example.org",
      firstName: "Max",
      lastName: "Mustermann",
      organizationId: "org1",
      personalData: { firstName: "Max", lastName: "Mustermann" },
      supervisorData: { vertragsbeginn: new Date("2026-08-31T22:30:00.000Z") },
    });

    const { data } = await getResolver("ONBOARDING")(ctx({ placeholders: ["eintrittsdatum"] }));

    expect(data.eintrittsdatum).toBe("01.09.2026");
  });
});

// =============================================
// Listen-Platzhalter (A4, S33, Feinplan 1.9)
// =============================================
describe("Listen im Platzhalter-Katalog (S33)", () => {
  const alleDefs = Object.values(PLACEHOLDER_CATALOG).flat();
  const listen = alleDefs.filter((d) => d.liste);

  it("Onboarding kennt {ausgaben_je_stelle} als Liste samt {ausgaben_liste} und {ausgaben_anzahl} (Gruppe „Ausgaben“)", () => {
    const onb = getPlaceholderCatalog("ONBOARDING");
    const liste = onb.find((d) => d.key === "ausgaben_je_stelle");
    expect(liste?.group).toBe("Ausgaben");
    expect(listenNamen(liste!)).toEqual([
      "ausgaben_je_stelle",
      "ausgabe_stelle",
      "gegenstaende",
      "ausgabe_gegenstand",
      "ausgabe_kennung",
      "ausgabe_uebergeben_am",
    ]);
    for (const key of ["ausgaben_liste", "ausgaben_anzahl"]) {
      const def = onb.find((d) => d.key === key);
      expect({ key, group: def?.group, liste: def?.liste }).toEqual({ key, group: "Ausgaben", liste: undefined });
    }
  });

  it("Offboarding kennt {rueckgaben_je_stelle} (Gruppe „Rückgaben“), aber keine ausgaben_*", () => {
    const off = getPlaceholderCatalog("OFFBOARDING");
    const liste = off.find((d) => d.key === "rueckgaben_je_stelle");
    expect(liste?.group).toBe("Rückgaben");
    expect(listenNamen(liste!)).toEqual([
      "rueckgaben_je_stelle",
      "rueckgabe_stelle",
      "gegenstaende",
      "rueckgabe_gegenstand",
      "rueckgabe_kennung",
      "rueckgabe_zustand",
      "rueckgabe_am",
    ]);
    // Die bisherigen Rueckgabe-Platzhalter stehen in derselben Gruppe.
    for (const key of ["rueckgaben_liste", "rueckgaben_offen_liste", "rueckgaben_offen_anzahl"]) {
      expect(off.find((d) => d.key === key)?.group).toBe("Rückgaben");
    }
    expect(off.filter((d) => d.key.startsWith("ausgabe")).map((d) => d.key)).toEqual([]);
    expect(getPlaceholderCatalog("ONBOARDING").some((d) => d.key === "rueckgaben_je_stelle")).toBe(false);
  });

  it("innere Felder tragen ein Praefix, und kein innerer Name ist zugleich ein gewoehnlicher Platzhalter", () => {
    const einfach = new Set(alleDefs.filter((d) => !d.liste).map((d) => d.key));
    expect(listen.map((d) => d.key).sort()).toEqual(["ausgaben_je_stelle", "rueckgaben_je_stelle"]);
    for (const d of listen) {
      const praefix = d.key === "ausgaben_je_stelle" ? "ausgabe_" : "rueckgabe_";
      const felder = [...d.liste!.felder, ...(d.liste!.unterliste?.felder ?? [])].map((f) => f.name);
      for (const name of felder) expect({ name, praefix: name.startsWith(praefix) }).toEqual({ name, praefix: true });
      // Fehlte ein inneres Feld, griffe der Parser auf einen gleichnamigen Wert der
      // Person zurueck – also darf es keinen gleichnamigen Platzhalter geben.
      for (const name of listenNamen(d).slice(1)) {
        expect({ name, kollision: einfach.has(name) }).toEqual({ name, kollision: false });
      }
    }
  });

  it("kein Listenname ist sensibel", () => {
    const namen = listen.flatMap((d) => listenNamen(d));
    expect(namen.length).toBeGreaterThan(10);
    expect(sensiblePlatzhalter(namen)).toEqual([]);
    for (const d of listen) expect(d.sensitive).toBeFalsy();
  });

  it("istListenPlatzhalter: Listen und innere Namen, unabhaengig von Schreibweise und Klammern", () => {
    for (const name of ["ausgaben_je_stelle", "ausgabe_kennung", "gegenstaende", "{RUECKGABE_ZUSTAND}", "rueckgaben_je_stelle"]) {
      expect({ name, liste: istListenPlatzhalter(name) }).toEqual({ name, liste: true });
    }
    for (const name of ["vorname", "ausgaben_liste", "ausgaben_anzahl", "rueckgaben_liste", "ausstattung_liste"]) {
      expect({ name, liste: istListenPlatzhalter(name) }).toEqual({ name, liste: false });
    }
  });

  it("eingabePlatzhalter: der Editor zeigt fuer innere Namen bekannter Listen kein Eingabefeld", () => {
    expect(
      eingabePlatzhalter([
        "ausgabe_gegenstand",
        "ausgabe_kennung",
        "ausgabe_stelle",
        "ausgaben_je_stelle",
        "eintrittsdatum",
        "gegenstaende",
        "vorname",
      ]),
    ).toEqual(["eintrittsdatum", "vorname"]);
  });

  it("vorlagenListen nennt die genutzten Listen (nur Schluessel, je Liste einmal)", () => {
    const genutzt = vorlagenListen(["ausgaben_je_stelle", "ausgabe_kennung", "vorname"], "ONBOARDING");
    expect(genutzt.map((d) => d.key)).toEqual(["ausgaben_je_stelle"]);
    // Eine ALLGEMEIN-Vorlage mit der Liste eines anderen Moduls zeigt sie trotzdem.
    expect(vorlagenListen(["rueckgaben_je_stelle"], "ALLGEMEIN").map((d) => d.key)).toEqual(["rueckgaben_je_stelle"]);
    expect(vorlagenListen(["vorname"], "ONBOARDING")).toEqual([]);
  });

  it("handwerteOhneListen: ein Handwert ersetzt nie eine Liste – weder ein Array des Resolvers noch einen Listennamen", () => {
    const aufgeloest = { ausgaben_je_stelle: [{ ausgabe_stelle: "IT", gegenstaende: [] }], vorname: "Max", eigene_liste: ["a"] };
    expect(
      handwerteOhneListen(
        { ausgaben_je_stelle: "Hand", ausgabe_kennung: "X-1", gegenstaende: "y", eigene_liste: "z", vorname: "Moritz", ort: "Minden" },
        aufgeloest,
      ),
    ).toEqual({ vorname: "Moritz", ort: "Minden" });
    expect(handwerteOhneListen(undefined, aufgeloest)).toEqual({});
  });
});

describe("Onboarding-Resolver: {ausgaben_je_stelle}, {ausgaben_liste}, {ausgaben_anzahl} (S33)", () => {
  const mockKonfigs = prisma.departmentConfig.findMany as jest.Mock;
  const ausgabe = (teil: Record<string, unknown>) => ({
    departmentKey: "IT",
    bezeichnung: "Dienst-iPad (Lernmittel)",
    kennung: "FES-IPAD-0412",
    uebergebenAm: new Date("2027-01-28T00:00:00.000Z"),
    zustand: "AUSGEGEBEN",
    beiAustritt: "RUECKGABE",
    ...teil,
  });
  const vorgang = (ausgaben: unknown) => ({
    displayId: "2027-GS-007",
    email: "erika.privat@example.org",
    firstName: "Erika",
    lastName: "Beispiel",
    organizationId: "org-foerderverein",
    arbeitsortId: "org-grundschule",
    personalData: null,
    supervisorData: null,
    ausgaben,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCanAccessProcess.mockResolvedValue(true);
    mockFindOrg.mockResolvedValue({
      name: "Förderverein", shortName: "FV", mandantNumber: "780",
      dsgvoVerantwortlicheName: null, dsgvoVerantwortlicheStrasse: null,
      dsgvoVerantwortlichePlz: null, dsgvoVerantwortlicheOrt: null,
    });
    mockFindUser.mockResolvedValue(null);
    mockKonfigs.mockResolvedValue([
      { departmentKey: "FACILITY", departmentName: "Hausmeister Grundschule", email: "hm@gs.example", organizationId: "org-grundschule", isActive: true },
      { departmentKey: "FACILITY", departmentName: "Hausmeister Förderverein", email: "hm@fv.example", organizationId: "org-foerderverein", isActive: true },
    ]);
  });

  it("Liste je Stelle, Zeilen und Anzahl – Stellennamen an der Empfaenger-Einrichtung (Arbeitsort)", async () => {
    mockFindOnboarding.mockResolvedValue(
      vorgang([
        ausgabe({}),
        ausgabe({
          departmentKey: "FACILITY",
          bezeichnung: "Schlüssel: Haupteingang",
          kennung: "GS-114",
          zustand: "VERBLEIBT",
          uebergebenAm: new Date("2027-01-30T00:00:00.000Z"),
        }),
      ]),
    );
    const { data, sensitiveFields } = await getResolver("ONBOARDING")(ctx());
    expect(data.ausgaben_je_stelle).toEqual([
      {
        ausgabe_stelle: "IT-Abteilung",
        gegenstaende: [{ ausgabe_gegenstand: "Dienst-iPad (Lernmittel)", ausgabe_kennung: "FES-IPAD-0412", ausgabe_uebergeben_am: "28.01.2027" }],
      },
      {
        ausgabe_stelle: "Hausmeister Grundschule",
        gegenstaende: [{ ausgabe_gegenstand: "Schlüssel: Haupteingang", ausgabe_kennung: "GS-114", ausgabe_uebergeben_am: "30.01.2027" }],
      },
    ]);
    expect(data.ausgaben_liste).toBe(
      "Dienst-iPad (Lernmittel) · FES-IPAD-0412 · übergeben 28.01.2027\nSchlüssel: Haupteingang · GS-114 · übergeben 30.01.2027",
    );
    expect(data.ausgaben_anzahl).toBe("2");
    expect(sensitiveFields).toEqual([]);
    expect(mockKonfigs).toHaveBeenCalledWith({
      where: { departmentKey: { in: ["IT", "FACILITY"] } },
      select: { departmentKey: true, departmentName: true, email: true, organizationId: true, isActive: true },
    });
    // Nur Namen der Stellen, nie Adressen.
    expect(JSON.stringify(data.ausgaben_je_stelle)).not.toMatch(/@/);
  });

  it("liest nur aktive Ausgaben und nur die Felder der Protokollzeile – nie Kommentare oder das HR-Konto", async () => {
    mockFindOnboarding.mockResolvedValue(vorgang([]));
    await getResolver("ONBOARDING")(ctx());
    const auswahl = mockFindOnboarding.mock.calls[0][0].select;
    expect(auswahl.arbeitsortId).toBe(true);
    expect(auswahl.ausgaben).toEqual({
      where: { zustand: { in: ["AUSGEGEBEN", "VERBLEIBT"] } },
      select: { departmentKey: true, bezeichnung: true, kennung: true, uebergebenAm: true, zustand: true, beiAustritt: true },
      orderBy: [{ uebergebenAm: "asc" }, { createdAt: "asc" }],
    });
  });

  it("Listen ohne Bemerkung: kaeme ein Kommentar doch mit, stuende er nirgends", async () => {
    mockFindOnboarding.mockResolvedValue(
      vorgang([ausgabe({ abteilungKommentar: "mit Huelle uebergeben", erfasstVonId: "hr-9", bemerkung: "geheim" })]),
    );
    const { data } = await getResolver("ONBOARDING")(ctx());
    const text = JSON.stringify([data.ausgaben_je_stelle, data.ausgaben_liste]);
    expect(text).not.toMatch(/Huelle|hr-9|geheim/);
  });

  it("jedes innere Feld ist gesetzt – auch ohne Kennung (\"\" statt fehlend)", async () => {
    mockFindOnboarding.mockResolvedValue(vorgang([ausgabe({ kennung: null })]));
    const { data } = await getResolver("ONBOARDING")(ctx());
    const [stelle] = data.ausgaben_je_stelle as Array<{ ausgabe_stelle: string; gegenstaende: Record<string, unknown>[] }>;
    expect(typeof stelle.ausgabe_stelle).toBe("string");
    expect(stelle.gegenstaende[0]).toEqual({
      ausgabe_gegenstand: "Dienst-iPad (Lernmittel)",
      ausgabe_kennung: "",
      ausgabe_uebergeben_am: "28.01.2027",
    });
  });

  it("ohne Ausgabe: leere Liste (Leersatz der Vorlage), Anzahl \"0\", keine Zeilen, keine Abfrage der Stellen", async () => {
    mockFindOnboarding.mockResolvedValue(vorgang([]));
    const { data } = await getResolver("ONBOARDING")(ctx());
    expect(data.ausgaben_je_stelle).toEqual([]);
    expect(data.ausgaben_anzahl).toBe("0");
    expect(data.ausgaben_liste).toBeUndefined();
    expect(mockKonfigs).not.toHaveBeenCalled();
    // Vorgang ohne das Feld (Mock eines Altbestands): dasselbe.
    mockFindOnboarding.mockResolvedValue(vorgang(undefined));
    expect((await getResolver("ONBOARDING")(ctx())).data.ausgaben_je_stelle).toEqual([]);
  });

  it("fremder Mandant: keine Liste, keine Zeilen, keine Anzahl (wie alle Vorgangsdaten)", async () => {
    mockCanAccessProcess.mockResolvedValue(false);
    mockFindOnboarding.mockResolvedValue(vorgang([ausgabe({})]));
    const { data } = await getResolver("ONBOARDING")(ctx());
    expect(data.ausgaben_je_stelle).toBeUndefined();
    expect(data.ausgaben_liste).toBeUndefined();
    expect(data.ausgaben_anzahl).toBeUndefined();
    expect(mockKonfigs).not.toHaveBeenCalled();
  });

  it("ohne refId: keine Liste", async () => {
    const { data } = await getResolver("ONBOARDING")(ctx({ refId: null }));
    expect(data.ausgaben_je_stelle).toBeUndefined();
  });
});
