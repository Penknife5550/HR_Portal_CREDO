/**
 * Tests fuer src/lib/elternzeit-fristen.ts
 *
 * Reine Funktionen — kein Prisma-Mocking noetig.
 * Fokus: Severity-Schwellen, alle Frist-Template-Branches.
 */

import {
  berechneSeverity,
  verbleibendeTage,
  berechneFristTemplates,
  gehoertZuBeamtenWorkflow,
} from "@/lib/elternzeit-fristen";
import { addDays, addWeeks, subDays } from "@/lib/elternzeit-helpers";
import type {
  ElternzeitProzess,
  ElternzeitAbschnitt,
} from "@prisma/client";

// Hilfsfunktion: Datum aus offset relativ zu "heute" bauen
function inDays(days: number, base = new Date("2026-04-09T12:00:00Z")): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

const HEUTE = new Date("2026-04-09T12:00:00Z");

describe("berechneSeverity", () => {
  it("> 14 Tage → INFO", () => {
    expect(berechneSeverity(inDays(20), HEUTE)).toBe("INFO");
    expect(berechneSeverity(inDays(15), HEUTE)).toBe("INFO");
  });
  it("8-14 Tage → WARNING", () => {
    expect(berechneSeverity(inDays(14), HEUTE)).toBe("WARNING");
    expect(berechneSeverity(inDays(8), HEUTE)).toBe("WARNING");
  });
  it("0-7 Tage → URGENT", () => {
    expect(berechneSeverity(inDays(7), HEUTE)).toBe("URGENT");
    expect(berechneSeverity(inDays(1), HEUTE)).toBe("URGENT");
    expect(berechneSeverity(inDays(0), HEUTE)).toBe("URGENT");
  });
  it("vor heute → OVERDUE", () => {
    expect(berechneSeverity(new Date(HEUTE.getTime() - 1), HEUTE)).toBe(
      "OVERDUE",
    );
    expect(berechneSeverity(inDays(-30), HEUTE)).toBe("OVERDUE");
  });
});

describe("verbleibendeTage", () => {
  it("liefert positive Anzahl bei zukuenftigem Datum", () => {
    expect(verbleibendeTage(inDays(5), HEUTE)).toBe(5);
  });
  it("liefert 0 wenn faellig heute (gleicher Zeitpunkt)", () => {
    expect(verbleibendeTage(HEUTE, HEUTE)).toBe(0);
  });
  it("liefert negativ bei ueberfaelligem Datum", () => {
    expect(verbleibendeTage(inDays(-3), HEUTE)).toBe(-3);
  });
});

describe("gehoertZuBeamtenWorkflow", () => {
  it("BEAMTER + PLANSTELLENINHABER true", () => {
    expect(gehoertZuBeamtenWorkflow("BEAMTER")).toBe(true);
    expect(gehoertZuBeamtenWorkflow("PLANSTELLENINHABER")).toBe(true);
  });
  it("TARIF_TV_L false", () => {
    expect(gehoertZuBeamtenWorkflow("TARIF_TV_L")).toBe(false);
  });
});

// =============================================
// berechneFristTemplates — alle 8 Branches
// =============================================

function makeEz(
  overrides: Partial<ElternzeitProzess> = {},
  abschnitte: Partial<ElternzeitAbschnitt>[] = [],
): ElternzeitProzess & { abschnitte: ElternzeitAbschnitt[] } {
  const base: ElternzeitProzess = {
    id: "test-id",
    displayId: "EZ-2026-001",
    organizationId: "org-1",
    employeeFirstName: "Anna",
    employeeLastName: "Test",
    employeeEmail: "anna@test.de",
    geburtsdatum: null,
    personalnummer: null,
    personalgruppe: "TARIF_TV_L",
    department: null,
    location: null,
    funktion: null,
    elternteil: "MUTTER",
    kindName: null,
    kindGeburtsdatum: null,
    geburtsurkunde: false,
    status: "ANGELEGT",
    antragVorlAm: null,
    antragTokenVorl: null,
    antragTokenVorlExpiry: null,
    antragTokenVorlUsedAt: null,
    antragTokenEndg: null,
    antragTokenEndgExpiry: null,
    antragTokenEndgUsedAt: null,
    leiterTokenEndg: null,
    leiterTokenEndgExpiry: null,
    leiterTokenEndgUsedAt: null,
    leiterGenehmigungAm: null,
    leiterAblehnungGrund: null,
    genehmigungVorlAm: null,
    genehmigungEndgAm: null,
    ablehnungVorlAm: null,
    ablehnungVorlGrund: null,
    ablehnungEndgAm: null,
    ablehnungEndgGrund: null,
    brSchreibenVersandtAm: null,
    brAktenzeichen: null,
    brGenehmigungEingegAm: null,
    notizen: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  } as unknown as ElternzeitProzess;

  const abs: ElternzeitAbschnitt[] = abschnitte.map((a, i) => ({
    id: `abs-${i}`,
    elternzeitId: "test-id",
    abschnittNr: i + 1,
    von: a.von ?? new Date("2026-06-01"),
    bis: a.bis ?? new Date("2027-06-01"),
    uebertragung3bis8: a.uebertragung3bis8 ?? false,
    teilzeit: a.teilzeit ?? false,
    teilzeitStunden: a.teilzeitStunden ?? null,
    agZustimmung: a.agZustimmung ?? null,
    ferienSperrfristWarnung: a.ferienSperrfristWarnung ?? false,
    ferienBegruendung: a.ferienBegruendung ?? null,
    createdAt: a.createdAt ?? new Date("2026-01-01"),
  })) as ElternzeitAbschnitt[];

  return { ...base, abschnitte: abs };
}

describe("berechneFristTemplates", () => {
  it("kein Abschnitt → keine ANTRAGSFRIST_VORL", () => {
    const ez = makeEz();
    const t = berechneFristTemplates(ez);
    expect(t.find((x) => x.fristTyp === "ANTRAGSFRIST_VORL")).toBeUndefined();
  });

  it("Abschnitt + antragVorlAm gesetzt → keine ANTRAGSFRIST_VORL", () => {
    const ez = makeEz(
      { antragVorlAm: new Date("2026-04-01") },
      [{ von: new Date("2026-06-01"), bis: new Date("2027-06-01") }],
    );
    const t = berechneFristTemplates(ez);
    expect(t.find((x) => x.fristTyp === "ANTRAGSFRIST_VORL")).toBeUndefined();
  });

  it("Abschnitt ohne antragVorlAm → ANTRAGSFRIST_VORL 49 Tage vor von", () => {
    const von = new Date("2026-06-01");
    const ez = makeEz({}, [{ von, bis: new Date("2027-06-01") }]);
    const frist = berechneFristTemplates(ez).find(
      (x) => x.fristTyp === "ANTRAGSFRIST_VORL",
    );
    expect(frist).toBeDefined();
    expect(frist!.faelligAm.getTime()).toBe(subDays(von, 49).getTime());
  });

  it("Token vorhanden + benutzt → kein TOKEN_VORL_EXPIRY", () => {
    const ez = makeEz({
      antragTokenVorl: "abc",
      antragTokenVorlExpiry: new Date("2026-05-01"),
      antragTokenVorlUsedAt: new Date("2026-04-15"),
    });
    expect(
      berechneFristTemplates(ez).find((x) => x.fristTyp === "TOKEN_VORL_EXPIRY"),
    ).toBeUndefined();
  });

  it("Token vorhanden + offen → TOKEN_VORL_EXPIRY", () => {
    const ez = makeEz({
      antragTokenVorl: "abc",
      antragTokenVorlExpiry: new Date("2026-05-01"),
      antragTokenVorlUsedAt: null,
    });
    expect(
      berechneFristTemplates(ez).find((x) => x.fristTyp === "TOKEN_VORL_EXPIRY"),
    ).toBeDefined();
  });

  it("BEAMTER + brSchreibenVersandtAm → BR_GENEHMIGUNG faelligAm = +8 Wochen", () => {
    const versandt = new Date("2026-03-01");
    const ez = makeEz({
      personalgruppe: "BEAMTER",
      brSchreibenVersandtAm: versandt,
    });
    const frist = berechneFristTemplates(ez).find(
      (x) => x.fristTyp === "BR_GENEHMIGUNG",
    );
    expect(frist).toBeDefined();
    expect(frist!.faelligAm.getTime()).toBe(addWeeks(versandt, 8).getTime());
  });

  it("BEAMTER + brGenehmigungEingegAm → keine BR_GENEHMIGUNG", () => {
    const ez = makeEz({
      personalgruppe: "BEAMTER",
      brSchreibenVersandtAm: new Date("2026-03-01"),
      brGenehmigungEingegAm: new Date("2026-04-01"),
    });
    expect(
      berechneFristTemplates(ez).find((x) => x.fristTyp === "BR_GENEHMIGUNG"),
    ).toBeUndefined();
  });

  it("TARIF_TV_L → keine BR_GENEHMIGUNG, keine BEIHILFE_AENDERUNG", () => {
    const ez = makeEz(
      {
        personalgruppe: "TARIF_TV_L",
        brSchreibenVersandtAm: new Date("2026-03-01"),
      },
      [{ von: new Date("2026-06-01"), bis: new Date("2027-06-01") }],
    );
    const t = berechneFristTemplates(ez);
    expect(t.find((x) => x.fristTyp === "BR_GENEHMIGUNG")).toBeUndefined();
    expect(t.find((x) => x.fristTyp === "BEIHILFE_AENDERUNG")).toBeUndefined();
  });

  it("kindGeburtsdatum + nicht hochgeladen → GEBURTSURKUNDE_NACHREICHUNG", () => {
    const geb = new Date("2026-05-01");
    const ez = makeEz({ kindGeburtsdatum: geb, geburtsurkunde: false });
    const f = berechneFristTemplates(ez).find(
      (x) => x.fristTyp === "GEBURTSURKUNDE_NACHREICHUNG",
    );
    expect(f).toBeDefined();
    expect(f!.faelligAm.getTime()).toBe(addWeeks(geb, 4).getTime());
  });

  it("Geburtsurkunde bereits hochgeladen → keine GEBURTSURKUNDE_NACHREICHUNG", () => {
    const ez = makeEz({
      kindGeburtsdatum: new Date("2026-05-01"),
      geburtsurkunde: true,
    });
    expect(
      berechneFristTemplates(ez).find(
        (x) => x.fristTyp === "GEBURTSURKUNDE_NACHREICHUNG",
      ),
    ).toBeUndefined();
  });

  it("Mehrere Abschnitte: ersterAbschnitt = frueheste von, letzterAbschnitt = spaeteste bis", () => {
    const ez = makeEz({}, [
      { von: new Date("2026-12-01"), bis: new Date("2027-06-01") },
      { von: new Date("2026-06-01"), bis: new Date("2026-11-30") },
      { von: new Date("2027-08-01"), bis: new Date("2028-06-01") },
    ]);
    const t = berechneFristTemplates(ez);
    const antrag = t.find((x) => x.fristTyp === "ANTRAGSFRIST_VORL");
    const rueck = t.find((x) => x.fristTyp === "RUECKKEHR_GESPRAECH");
    // erster Abschnitt von = 2026-06-01 → ANTRAGSFRIST_VORL = -49 Tage
    expect(antrag!.faelligAm.getTime()).toBe(
      subDays(new Date("2026-06-01"), 49).getTime(),
    );
    // letzter Abschnitt bis = 2028-06-01 → RUECKKEHR_GESPRAECH = -42 Tage
    expect(rueck!.faelligAm.getTime()).toBe(
      subDays(new Date("2028-06-01"), 42).getTime(),
    );
  });

  it("Teilzeit ohne agZustimmung → TEILZEIT_ANTRAG_PRUEFUNG", () => {
    const ez = makeEz({}, [
      {
        von: new Date("2026-06-01"),
        bis: new Date("2027-06-01"),
        teilzeit: true,
        agZustimmung: null,
      },
    ]);
    expect(
      berechneFristTemplates(ez).find(
        (x) => x.fristTyp === "TEILZEIT_ANTRAG_PRUEFUNG",
      ),
    ).toBeDefined();
  });

  it("Teilzeit mit agZustimmung true → keine TEILZEIT_ANTRAG_PRUEFUNG", () => {
    const ez = makeEz({}, [
      {
        von: new Date("2026-06-01"),
        bis: new Date("2027-06-01"),
        teilzeit: true,
        agZustimmung: true,
      },
    ]);
    expect(
      berechneFristTemplates(ez).find(
        (x) => x.fristTyp === "TEILZEIT_ANTRAG_PRUEFUNG",
      ),
    ).toBeUndefined();
  });
});
