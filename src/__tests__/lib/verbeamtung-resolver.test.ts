/**
 * Tests: VERBEAMTUNG-Resolver (src/lib/doc-template-resolvers.ts)
 *
 * Schwerpunkte: die untypisierten Json-Felder, die zum Teil aus einem
 * OEFFENTLICHEN Antragsformular stammen und deshalb nie blind uebernommen
 * werden duerfen — und die schutzwuerdigen Angaben, die zwar unverschluesselt
 * sind, aber ins Protokoll gehoeren.
 */

jest.mock("@/lib/db", () => ({
  prisma: {
    civilServiceProcess: { findUnique: jest.fn() },
    organization: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    userOrgAssignment: { findUnique: jest.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { getResolver, type ResolverContext } from "@/lib/doc-template-resolvers";

const findCs = prisma.civilServiceProcess.findUnique as jest.Mock;
const findOrg = prisma.organization.findUnique as jest.Mock;
const findUser = prisma.user.findUnique as jest.Mock;
const findZuweisung = prisma.userOrgAssignment.findUnique as jest.Mock;

const session = {
  userId: "u1", email: "hr@credo.de", role: "HR_LEITUNG",
  firstName: "Hanna", lastName: "Roth",
};

function ctx(extra?: Partial<ResolverContext>): ResolverContext {
  return { organizationId: "orgX", refId: "cs1", session, ...extra };
}

function vorgang(overrides: Record<string, unknown> = {}) {
  return {
    displayId: "PSI-2026-GYM-004",
    organizationId: "org-gym",
    employeeFirstName: "Jonas",
    employeeLastName: "Weber",
    employeeEmail: "j.weber@fes-minden.de",
    employeePersonalNr: "100987",
    type: "PROBE",
    status: "ASSESSMENT_PENDING",
    targetStartDate: new Date("2026-08-01T00:00:00.000Z"),
    probationStartDate: new Date("2026-08-01T00:00:00.000Z"),
    probationEndDate: new Date("2029-07-31T00:00:00.000Z"),
    completedAt: null,
    besoldungsgruppe: null,
    erfahrungsstufe: null,
    applicationSubmittedAt: new Date("2026-05-12T00:00:00.000Z"),
    prerequisites: {
      subjectCombination: "Mathematik / Physik",
      workloadPercent: 75,
      activeCommunityMembershipDetail: "Ev. Freikirchliche Gemeinde Minden",
      vebsSeminarCompletedDate: "2025-11-14",
    },
    applicationData: { employeeStatement: "Ich erklaere hiermit ..." },
    stakeholders: {
      schulleitung: { name: "Dr. Anke Bauer", email: "leitung@fes-minden.de" },
      amtsarzt: { email: "amtsarzt@kreis-minden.de" },
      beirat: { email: "beirat@credo-gruppe.de" },
    },
    employee: null,
    organization: {
      ezBrDetmoldName: null, ezBrDetmoldEmail: null, ezBrDetmoldPhone: null,
      ezBrDetmoldAktenPrefix: null, ezGfFirstName: null, ezGfLastName: null,
      ezGfTitle: null,
    },
    assessments: [],
    boardDecisions: [],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  findOrg.mockResolvedValue({
    name: "Gymnasium", shortName: "GYM", mandantNumber: "737",
    dsgvoVerantwortlicheName: null, dsgvoVerantwortlicheStrasse: null,
    dsgvoVerantwortlichePlz: null, dsgvoVerantwortlicheOrt: null,
  });
  findUser.mockResolvedValue({
    firstName: "Hanna", lastName: "Roth", email: "hr@credo.de", phone: null,
  });
  findCs.mockResolvedValue(vorgang());
});

async function loese(extra?: Partial<ResolverContext>) {
  return getResolver("VERBEAMTUNG")(ctx(extra));
}

describe("Verbeamtungs-Resolver — Grundfelder", () => {
  it("fuellt Person, Vorgang und Fristen", async () => {
    const { data } = await loese();
    expect(data).toMatchObject({
      vorgangsnummer: "PSI-2026-GYM-004",
      vorname: "Jonas",
      nachname: "Weber",
      name: "Jonas Weber",
      personalnummer: "100987",
      geplanter_beginn: "01.08.2026",
      probezeit_ende: "31.07.2029",
      antrag_eingereicht_am: "12.05.2026",
    });
  });

  it("uebersetzt Verbeamtungsart und Status", async () => {
    const { data } = await loese();
    expect(data.verbeamtungsart).toBe("Beamtenverhaeltnis auf Probe");
    expect(data.vorgang_status).toBe("Beurteilung ausstehend");
  });

  it("laesst ungepflegte Felder ungesetzt", async () => {
    // besoldungsgruppe und erfahrungsstufe pflegt heute keine Oberflaeche;
    // sie bleiben leer und rendern als "___" statt still zu verschwinden.
    const { data } = await loese();
    expect(data.besoldungsgruppe).toBeUndefined();
    expect(data.erfahrungsstufe).toBeUndefined();
  });

  it("laesst die BR- und GF-Platzhalter leer, solange der Mandant sie nicht pflegt", async () => {
    const { data } = await loese();
    for (const key of ["br_kontakt", "br_email", "br_telefon", "gf_name", "gf_funktion"]) {
      expect(data[key]).toBeUndefined();
    }
  });
});

describe("Verbeamtungs-Resolver — Json aus dem oeffentlichen Formular", () => {
  it("liest die bekannten Schluessel mit Typpruefung", async () => {
    const { data } = await loese();
    expect(data.faecher).toBe("Mathematik / Physik");
    expect(data.stellenumfang_prozent).toBe("75");
    expect(data.vebs_seminar_am).toBe("14.11.2025");
  });

  it("uebernimmt Werte falschen Typs nicht", async () => {
    // Das Antragsformular ist oeffentlich ueber einen Magic Link erreichbar und
    // reicht den Rumpf praktisch ungeprueft durch.
    findCs.mockResolvedValue(
      vorgang({
        prerequisites: {
          subjectCombination: { boese: "objekt" },
          workloadPercent: "75",
          vebsSeminarCompletedDate: 12345,
        },
      })
    );
    const { data } = await loese();
    expect(data.faecher).toBeUndefined();
    expect(data.stellenumfang_prozent).toBeUndefined();
    expect(data.vebs_seminar_am).toBeUndefined();
  });

  it("stolpert nicht ueber fehlende oder unsinnige Json-Felder", async () => {
    findCs.mockResolvedValue(
      vorgang({ prerequisites: null, applicationData: "kein objekt", stakeholders: [] })
    );
    const { data } = await loese();
    expect(data.vorname).toBe("Jonas");
    expect(data.faecher).toBeUndefined();
    expect(data.schulleitung_name).toBeUndefined();
  });

  it("liest verschachtelte Beteiligte", async () => {
    const { data } = await loese();
    expect(data.schulleitung_name).toBe("Dr. Anke Bauer");
    expect(data.amtsarzt_email).toBe("amtsarzt@kreis-minden.de");
  });
});

describe("Verbeamtungs-Resolver — schutzwuerdige Angaben", () => {
  it("meldet sie ans Protokoll, obwohl nichts verschluesselt ist", async () => {
    const { data, sensitiveFields } = await loese();
    expect(data.gemeinde).toBe("Ev. Freikirchliche Gemeinde Minden");
    expect(data.antrag_erklaerung).toBe("Ich erklaere hiermit ...");
    expect(sensitiveFields).toEqual(expect.arrayContaining(["gemeinde", "antrag_erklaerung"]));
  });

  it("setzt sie nicht, wenn die Vorlage sie nicht nutzt", async () => {
    const { data, sensitiveFields } = await loese({ placeholders: ["vorname", "nachname"] });
    expect(data.gemeinde).toBeUndefined();
    expect(data.antrag_erklaerung).toBeUndefined();
    expect(sensitiveFields).toEqual([]);
  });
});

describe("Verbeamtungs-Resolver — Beurteilungen und Beirat", () => {
  const beurteilungen = [
    { assessmentType: "BEURTEILUNG", assessmentNumber: 1, submittedAt: new Date("2027-03-01T00:00:00.000Z"), meetsRequirements: false, meetsRequirementsManual: true },
    { assessmentType: "BEURTEILUNG", assessmentNumber: 2, submittedAt: new Date("2028-03-01T00:00:00.000Z"), meetsRequirements: null, meetsRequirementsManual: false },
    { assessmentType: "REFERENZ", assessmentNumber: 1, submittedAt: new Date("2026-06-01T00:00:00.000Z"), meetsRequirements: null, meetsRequirementsManual: null },
  ];

  it("nimmt das manuelle Gesamturteil, nicht den Legacy-Wert", async () => {
    // meetsRequirementsManual ist das Gesamturteil nach BRL Nr. 7.5.
    findCs.mockResolvedValue(vorgang({ assessments: beurteilungen }));
    const { data } = await loese();
    expect(data.beurteilung_1_ergebnis).toBe("Anforderungen erfuellt");
    expect(data.beurteilung_2_ergebnis).toBe("Anforderungen nicht erfuellt");
    expect(data.beurteilung_1_am).toBe("01.03.2027");
    expect(data.referenz_1_am).toBe("01.06.2026");
  });

  it("laesst eine fehlende dritte Beurteilung einfach weg", async () => {
    findCs.mockResolvedValue(vorgang({ assessments: beurteilungen }));
    const { data } = await loese();
    expect(data.beurteilung_3_am).toBeUndefined();
    expect(data.beurteilung_3_ergebnis).toBeUndefined();
  });

  it("nimmt die Beiratsentscheidung, die zur Art des Vorgangs passt", async () => {
    findCs.mockResolvedValue(
      vorgang({
        type: "PROBE",
        boardDecisions: [
          { decisionType: "LIFETIME", result: "NEGATIVE", decisionDate: new Date("2029-01-10T00:00:00.000Z") },
          { decisionType: "PROBE", result: "POSITIVE", decisionDate: new Date("2026-06-20T00:00:00.000Z") },
        ],
      })
    );
    const { data } = await loese();
    expect(data.beirat_entscheidung).toBe("Zustimmung");
    expect(data.beirat_entscheidung_am).toBe("20.06.2026");
    expect(data.beirat_entscheidung_art).toBe("Beamtenverhaeltnis auf Probe");
  });
});

describe("Verbeamtungs-Resolver — Mandant und Fehlerfaelle", () => {
  it("nimmt den Mandanten DES VORGANGS", async () => {
    await loese({ organizationId: "ein-ganz-anderer-mandant" });
    expect(findOrg).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "org-gym" } })
    );
  });

  it("liefert einer fremden Einrichtungsleitung nur die allgemeinen Platzhalter", async () => {
    findZuweisung.mockResolvedValue(null);
    const { data } = await getResolver("VERBEAMTUNG")(
      ctx({ session: { ...session, userId: "u2", role: "EINRICHTUNGSLEITUNG" } })
    );
    expect(data.vorname).toBeUndefined();
    expect(data.datum).toBeDefined();
  });

  it("gibt ohne Vorgang nur die allgemeinen Platzhalter zurueck", async () => {
    findCs.mockResolvedValue(null);
    const { data } = await loese();
    expect(data.vorname).toBeUndefined();
    expect(data.datum).toBeDefined();
  });
});
