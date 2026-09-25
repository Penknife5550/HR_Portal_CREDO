/**
 * Tests: Unterlagen nachfordern — Baustein ONBOARDING (src/lib/unterlagen-onboarding.ts)
 *
 * Die Onboarding-Regeln, die der modulneutrale Dienst ueber die Schnittstelle
 * abfragt: verfuegbar (Nachweise abgegeben UND nicht EXPIRED), Sperre des
 * Vorgangs (status not EXPIRED), Adressvorschlaege (Vorgang zuerst, die
 * Personalakte nur als zweiter Vorschlag), Auswahl (offene Nachweise
 * vorgeschlagen, SONSTIGES nie, sensibel/Schriftform/Ablaufdatum aus den
 * Listen) und die Abbildung der geladenen Zeile — auch der schon geladenen
 * Zeile der Vorgangsansicht (`onboardingVorgangAusAnsicht`).
 */

jest.mock("@/lib/db", () => ({
  prisma: jest.requireActual("../hilfen/unterlagen-fake-db").fakePrisma,
}));

import { fakePrisma, udb, udbLeeren, type Zeile } from "../hilfen/unterlagen-fake-db";
import {
  ONBOARDING_KATALOG,
  ONBOARDING_NICHT_VERFUEGBAR,
  onboardingBaustein,
  onboardingUnterlagenVorgang,
  onboardingVorgangAusAnsicht,
  type OnboardingUnterlagenQuelle,
} from "@/lib/unterlagen-onboarding";
import { NACHFORDERUNG_HINWEISE, SELECTABLE_DOCUMENT_TYPES } from "@/lib/required-documents";
import type { Prisma } from "@prisma/client";

const ID = "3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b";

function zeile(teil: Zeile = {}): Zeile {
  return {
    id: ID,
    displayId: "2026-GYM-014",
    organizationId: "org-1",
    status: "SUBMITTED",
    email: " anna.privat@example.org ",
    firstName: "Anna (HR)",
    lastName: "Beispiel (HR)",
    submittedAt: new Date("2026-09-10T10:00:00.000Z"),
    questionnaireType: "STANDARD",
    organization: { name: "FES Minden", type: "GYMNASIUM" },
    employee: null,
    personalData: {
      firstName: "Anna",
      lastName: "Beispiel",
      isComplete: true,
      birthDate: new Date("1990-05-01T00:00:00.000Z"),
      rvEntscheidung: null,
      aufenthaltstitelErforderlich: true,
      healthInsuranceType: "privat",
      severelyDisabled: false,
      children: [{ id: "kind-1" }],
    },
    documents: [{ type: "PKV_NACHWEIS" }],
    ...teil,
  };
}

const abbilden = (z: Zeile, required: string[] = ["GEBURTSURKUNDE_EIGEN", "GEBURTSURKUNDE_KIND"]) =>
  onboardingUnterlagenVorgang(z as unknown as OnboardingUnterlagenQuelle, required);

beforeEach(() => {
  udbLeeren();
});

describe("onboardingUnterlagenVorgang", () => {
  it("bildet Vorgang, Pflichten und vorhandene Arten ab — Name aus dem Fragebogen, Adresse getrimmt", () => {
    const v = abbilden(zeile());
    expect(v).toMatchObject({
      modul: "ONBOARDING",
      id: ID,
      einrichtung: "FES Minden",
      vorname: "Anna",
      nachname: "Beispiel",
      email: "anna.privat@example.org",
      eingestellt: false,
      organisationstyp: "GYMNASIUM",
      personalakteEmail: null,
      vorhandeneTypen: ["PKV_NACHWEIS"],
      severelyDisabled: false,
    });
    expect(v.pflicht).toMatchObject({
      required: ["GEBURTSURKUNDE_EIGEN", "GEBURTSURKUNDE_KIND"],
      hasChildren: true,
      masernschutzPflichtig: true,
      aufenthaltstitelErforderlich: true,
      healthInsuranceType: "privat",
    });
  });

  it("ohne Namen im Fragebogen der Name am Vorgang, nie die Adresse", () => {
    const v = abbilden(zeile({ personalData: null }));
    expect(v).toMatchObject({ vorname: "Anna (HR)", nachname: "Beispiel (HR)" });
    const leer = abbilden(zeile({ personalData: null, firstName: null, lastName: " " }));
    expect(leer).toMatchObject({ vorname: null, nachname: null });
  });

  it("EXPIRED heisst eingestellt", () => {
    expect(abbilden(zeile({ status: "EXPIRED" })).eingestellt).toBe(true);
  });

  it("ohne Kinder keine Geburtsurkunde der Kinder als Pflicht", () => {
    const ohne = abbilden(zeile({ personalData: { ...(zeile().personalData as Zeile), children: [] } }));
    expect(ohne.pflicht.hasChildren).toBe(false);
  });
});

describe("onboardingVorgangAusAnsicht (Zeile der Vorgangsansicht, kein zweites Laden)", () => {
  /** So liefert GET /api/onboarding/[id] die Zeile: ohne `employee`, mit `employeeId` und allen Spalten. */
  function ansicht(teil: Zeile = {}): OnboardingUnterlagenQuelle & { employeeId: string | null } {
    return {
      ...zeile(),
      employee: undefined,
      employeeId: "akte-1",
      personalData: { ...(zeile().personalData as Zeile), iban: "verschluesselt", children: [{ id: "k" }] },
      documents: [{ type: "PKV_NACHWEIS", fileName: "pkv.pdf" }],
      ...teil,
    } as unknown as OnboardingUnterlagenQuelle & { employeeId: string | null };
  }

  it("mit Bearbeitungsrecht: die Adresse der Personalakte wird nachgeladen — Vorgang und Vorlage nicht", async () => {
    udb.personalakten = [{ id: "akte-1", email: "a.beispiel@credo-gruppe.de" }];
    const v = await onboardingVorgangAusAnsicht(ansicht(), ["SV_AUSWEIS"], true);
    expect(v.personalakteEmail).toBe("a.beispiel@credo-gruppe.de");
    expect(v.pflicht.required).toEqual(["SV_AUSWEIS"]);
    expect(v.vorhandeneTypen).toEqual(["PKV_NACHWEIS"]);
    expect(udb.aufrufe).toEqual(["employee.findUnique"]);
    // Nichts aus der Zeile, was die Nachforderung nicht braucht.
    expect(JSON.stringify(v)).not.toContain("verschluesselt");
    expect(JSON.stringify(v)).not.toContain("pkv.pdf");
  });

  it("ohne Bearbeitungsrecht oder ohne verknuepfte Akte: keine Abfrage, kein zweiter Vorschlag", async () => {
    udb.personalakten = [{ id: "akte-1", email: "a.beispiel@credo-gruppe.de" }];
    const leser = await onboardingVorgangAusAnsicht(ansicht(), [], false);
    const ohneAkte = await onboardingVorgangAusAnsicht(ansicht({ employeeId: null }), [], true);
    expect(leser.personalakteEmail).toBeNull();
    expect(ohneAkte.personalakteEmail).toBeNull();
    expect(udb.aufrufe).toEqual([]);
    expect(onboardingBaustein.empfaengerVorschlaege(leser)).toHaveLength(1);
  });
});

describe("verfuegbar", () => {
  it("nach der Abgabe ja, auch bei REVIEWED/COMPLETED ohne Zeitstempel", () => {
    expect(onboardingBaustein.verfuegbar(abbilden(zeile()))).toEqual({ ok: true });
    const bestand = zeile({ status: "COMPLETED", submittedAt: null, personalData: null });
    expect(onboardingBaustein.verfuegbar(abbilden(bestand))).toEqual({ ok: true });
  });

  it("vor der Abgabe nein, mit Grund im Klartext", () => {
    const offen = zeile({
      status: "SUPERVISOR_SUBMITTED",
      submittedAt: null,
      personalData: { ...(zeile().personalData as Zeile), isComplete: false },
    });
    expect(onboardingBaustein.verfuegbar(abbilden(offen))).toEqual({
      ok: false,
      grund: ONBOARDING_NICHT_VERFUEGBAR.FRAGEBOGEN_OFFEN,
    });
  });

  it("EXPIRED nein — obwohl die Nachweise abgegeben sind", () => {
    expect(onboardingBaustein.verfuegbar(abbilden(zeile({ status: "EXPIRED" })))).toEqual({
      ok: false,
      grund: ONBOARDING_NICHT_VERFUEGBAR.VORGANG_EINGESTELLT,
    });
  });
});

describe("empfaengerVorschlaege", () => {
  it("Adresse des Vorgangs zuerst, Personalakte als zweiter Vorschlag nur bei Abweichung", () => {
    expect(onboardingBaustein.empfaengerVorschlaege(abbilden(zeile()))).toEqual([
      { adresse: "anna.privat@example.org", quelle: "VORGANG" },
    ]);
    const gleich = abbilden(zeile({ employee: { email: "Anna.Privat@Example.org" } }));
    expect(onboardingBaustein.empfaengerVorschlaege(gleich)).toHaveLength(1);
    const akte = abbilden(zeile({ employee: { email: "a.beispiel@credo-gruppe.de" } }));
    expect(onboardingBaustein.empfaengerVorschlaege(akte)).toEqual([
      { adresse: "anna.privat@example.org", quelle: "VORGANG" },
      { adresse: "a.beispiel@credo-gruppe.de", quelle: "PERSONALAKTE" },
    ]);
  });
});

describe("auswahl", () => {
  it("offene Nachweise zuerst und vorgeschlagen, dann der Katalog — nie SONSTIGES, jede Art einmal", () => {
    const auswahl = onboardingBaustein.auswahl(abbilden(zeile()));
    // PKV liegt schon vor → nicht vorgeschlagen.
    expect(auswahl.filter((a) => a.vorgeschlagen).map((a) => a.typ)).toEqual([
      "MASERNSCHUTZ",
      "AUFENTHALTSTITEL",
      "ARBEITSERLAUBNIS",
    ]);
    expect(auswahl.map((a) => a.typ).sort()).toEqual([...ONBOARDING_KATALOG].sort());
    expect(ONBOARDING_KATALOG).not.toContain("SONSTIGES");
    expect(ONBOARDING_KATALOG).toHaveLength(SELECTABLE_DOCUMENT_TYPES.length - 1);
  });

  it("sensibel, erlaubt, Schriftform, Ablaufdatum und Hinweis je Art", () => {
    const auswahl = new Map(onboardingBaustein.auswahl(abbilden(zeile())).map((a) => [a.typ, a]));
    expect(auswahl.get("AUFENTHALTSTITEL")).toMatchObject({
      label: "Aufenthaltstitel",
      sensibel: true,
      erlaubt: true,
      fristpflichtig: true,
      hinweis: NACHFORDERUNG_HINWEISE.AUFENTHALTSTITEL,
    });
    expect(auswahl.get("FUEHRUNGSZEUGNIS")).toMatchObject({ sensibel: true, erlaubt: false });
    expect(auswahl.get("FUEHRUNGSZEUGNIS")!.grund).toBeTruthy();
    expect(auswahl.get("SB_AUSWEIS")).toMatchObject({ sensibel: true, erlaubt: false });
    expect(auswahl.get("ARBEITSVERTRAG")).toMatchObject({ originalErforderlich: true, sensibel: false, erlaubt: true });
    expect(auswahl.get("SV_AUSWEIS")).toMatchObject({ originalErforderlich: false, fristpflichtig: false, hinweis: null });
  });
});

describe("Laden und Sperren", () => {
  it("vorgangLaden: eigenes select, Pflichtliste der AKTUELLEN Vorlage bzw. der Rueckfall", async () => {
    udb.vorgaenge = [zeile()];
    const ohneVorlage = await onboardingBaustein.vorgangLaden(ID);
    expect(ohneVorlage!.pflicht.required).toEqual(["GEBURTSURKUNDE_EIGEN", "GEBURTSURKUNDE_KIND"]);

    udb.formularVorlagen = [{ questionnaireType: "STANDARD", requiredDocuments: ["SV_AUSWEIS"] }];
    const mitVorlage = await onboardingBaustein.vorgangLaden(ID);
    expect(mitVorlage!.pflicht.required).toEqual(["SV_AUSWEIS"]);
    expect(await onboardingBaustein.vorgangLaden("00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("vorgangSperren: nur, wenn der Vorgang nicht EXPIRED ist", async () => {
    udb.vorgaenge = [zeile()];
    const tx = fakePrisma as unknown as Prisma.TransactionClient;
    expect(await onboardingBaustein.vorgangSperren(tx, ID)).toBe(true);
    udb.vorgaenge[0].status = "EXPIRED";
    expect(await onboardingBaustein.vorgangSperren(tx, ID)).toBe(false);
  });

  it("Bereich, Kopf, Protokoll und Pfade", () => {
    expect(onboardingBaustein.bereichWhere(ID)).toEqual({ modul: "ONBOARDING", onboardingId: ID });
    expect(onboardingBaustein.kopfDaten(ID)).toEqual({ modul: "ONBOARDING", onboardingId: ID });
    expect(onboardingBaustein.vorgangIdAus({ onboardingId: ID })).toBe(ID);
    expect(onboardingBaustein.vorgangIdAus({ onboardingId: null })).toBeNull();
    expect(onboardingBaustein.audit(ID)).toEqual({ processType: "ONBOARDING", fk: { onboardingId: ID } });
    expect(onboardingBaustein.portalPfad(ID)).toBe(`/dashboard/${ID}`);
    expect(onboardingBaustein.apiBasis(ID)).toBe(`/api/onboarding/${ID}/unterlagen`);
    expect(onboardingBaustein.mitDetails(abbilden(zeile()))).toBe(true);
  });
});
