/**
 * Tests: Ausstattung & Zugaenge – die reinen Katalogregeln (src/lib/ausstattung.ts)
 *
 * Feinplan S2: Filter nach Arbeitsort, Einrichtungsart, Ausblendung,
 * Personengruppe und Vorgangsart; Stelle ohne Adresse fehlt, HR nie; „nur HR“
 * bei Entgeltbezug; keine Positionen fuer MITARBEITER/VORGESETZTER (Regel 11);
 * Vorauswahl als Teilmenge; Angaben nur aus dem Katalog; Adresslücken;
 * aehnliche Vorlagenpunkte; Aufgabentitel mit Option; die Formularsicht ohne
 * interne Felder; die Vorschlaege.
 *
 * Ohne Datenbank und ohne Uhr. Die Schema-Kommentare haelt
 * ausstattung-schema.test.ts, die Zod-Schemas ausstattung-validierung.test.ts.
 */

import fs from "fs";
import path from "path";
import { DEPARTMENT_LABELS } from "@/lib/constants";
import type { AbteilungsKonfig } from "@/lib/abteilungsaufgaben";
import {
  AEHNLICH_MIN_ZEICHEN,
  ANGABE_SCHLUESSEL,
  ANGABEN_KATALOG,
  ART_NAMEN,
  AUSSTATTUNG_ARTEN,
  GRENZEN,
  HINWEIS_ORDER_BASIS,
  KATALOG_FELDER,
  MELDUNGEN,
  NICHT_ERLAUBTE_STELLEN,
  ORDER_BASIS,
  REIHENFOLGE_MAX,
  VORSCHLAEGE,
  adressLuecken,
  aehnlicheVorlagenpunkte,
  arbeitsortSpeicherwert,
  arbeitsortSperrGrund,
  aufgabenTitel,
  faelligText,
  formularGruppen,
  freigabeWarnungen,
  istAngabeSchluessel,
  istAusstattungsArt,
  istNichtErlaubteStelle,
  katalogAenderungen,
  katalogHinweise,
  katalogStellen,
  katalogWerte,
  katalogZeilen,
  nachStelleSortiert,
  positionGiltAm,
  positionPruefen,
  positionenFuer,
  vorschlaegeMeldung,
  vorschlaegeVorschau,
  type KatalogEinrichtung,
  type KatalogEintrag,
  type KatalogKontext,
  type KatalogPosition,
  type KatalogUebersicht,
  type KatalogVorlagenpunkt,
} from "@/lib/ausstattung";

// =============================================
// Testdaten
// =============================================

const GYM = "org-gymnasium";
const GS = "org-grundschule";
const KITA = "org-kita";

function position(teil: Partial<KatalogPosition> = {}): KatalogPosition {
  return {
    id: "pos-1",
    departmentKey: "IT",
    organizationId: null,
    einrichtungsarten: [],
    art: "JA_NEIN",
    angabeSchluessel: null,
    bezeichnung: "Dienst-iPad (Lernmittel)",
    hinweisFuehrungskraft: null,
    hinweisStelle: null,
    optionen: [],
    vorausgewaehlt: false,
    vorausgewaehlteOptionen: [],
    bemerkungAnbieten: true,
    bemerkungPlatzhalter: null,
    aufgabeTitel: null,
    defaultDueDays: -5,
    personengruppen: [],
    sichtbarFuer: [],
    entgeltrelevant: false,
    isActive: true,
    orderIndex: 0,
    ...teil,
  };
}

function auswahl(teil: Partial<KatalogPosition> = {}): KatalogPosition {
  return position({
    id: "pos-schluessel",
    departmentKey: "FACILITY",
    art: "AUSWAHL",
    bezeichnung: "Schlüssel",
    optionen: ["Haupteingang", "Lehrerzimmer", "Fachraum Chemie"],
    aufgabeTitel: "Schlüssel ausgeben",
    ...teil,
  });
}

function angabe(teil: Partial<KatalogPosition> = {}): KatalogPosition {
  return position({
    id: "pos-faecher",
    departmentKey: "FACILITY",
    art: "ANGABE",
    angabeSchluessel: "UNTERRICHTSFAECHER",
    bezeichnung: "Unterrichtsfächer",
    bemerkungAnbieten: false,
    defaultDueDays: null,
    ...teil,
  });
}

function kontext(teil: Partial<KatalogKontext> = {}): KatalogKontext {
  return {
    arbeitsortId: GYM,
    einrichtungsart: "GYMNASIUM",
    questionnaireType: "STANDARD",
    processType: "EINSTELLUNG",
    ausblendungen: [],
    adresseVorhanden: () => true,
    ...teil,
  };
}

function konfig(teil: Partial<AbteilungsKonfig>): AbteilungsKonfig {
  return {
    departmentKey: "IT",
    departmentName: "IT-Support FES",
    email: "it@example.org",
    organizationId: null,
    isActive: true,
    ...teil,
  };
}

const ids = (liste: ReadonlyArray<{ id: string }>) => liste.map((p) => p.id);

// =============================================
// Kleine Hilfen
// =============================================

describe("Typpruefungen", () => {
  it("istAusstattungsArt kennt genau die drei Arten", () => {
    expect(istAusstattungsArt("JA_NEIN")).toBe(true);
    expect(istAusstattungsArt("AUSWAHL")).toBe(true);
    expect(istAusstattungsArt("ANGABE")).toBe(true);
    expect(istAusstattungsArt("FREI")).toBe(false);
    expect(istAusstattungsArt(null)).toBe(false);
  });

  it("istAngabeSchluessel kennt nur die feste Liste (E-A13)", () => {
    for (const s of ANGABE_SCHLUESSEL) expect(istAngabeSchluessel(s)).toBe(true);
    expect(istAngabeSchluessel("RELIGION")).toBe(false);
    expect(istAngabeSchluessel("")).toBe(false);
    expect(istAngabeSchluessel(undefined)).toBe(false);
  });

  it("istNichtErlaubteStelle: MITARBEITER und VORGESETZTER, nicht HR", () => {
    for (const s of NICHT_ERLAUBTE_STELLEN) expect(istNichtErlaubteStelle(s)).toBe(true);
    expect(istNichtErlaubteStelle("HR")).toBe(false);
    expect(istNichtErlaubteStelle("IT")).toBe(false);
    expect(istNichtErlaubteStelle(null)).toBe(false);
  });
});

// =============================================
// positionPruefen
// =============================================

describe("positionPruefen", () => {
  it("gueltige Positionen jeder Art", () => {
    expect(positionPruefen(position())).toBeNull();
    expect(positionPruefen(auswahl({ vorausgewaehlteOptionen: ["Haupteingang"] }))).toBeNull();
    expect(positionPruefen(angabe({ sichtbarFuer: ["IT"] }))).toBeNull();
    expect(positionPruefen(position({ departmentKey: "HR", bezeichnung: "Jobticket", entgeltrelevant: true }))).toBeNull();
    expect(positionPruefen(position({ departmentKey: "EMPFANG_2", organizationId: GYM }))).toBeNull();
  });

  it.each(NICHT_ERLAUBTE_STELLEN)("Stelle %s ergibt einen Fehler (Regel 11)", (stelle) => {
    expect(positionPruefen(position({ departmentKey: stelle }))).toBe(MELDUNGEN.STELLE_NICHT_ERLAUBT);
    expect(positionPruefen(auswahl({ departmentKey: stelle }))).toBe(MELDUNGEN.STELLE_NICHT_ERLAUBT);
    expect(positionPruefen(angabe({ departmentKey: stelle }))).toBe(MELDUNGEN.STELLE_NICHT_ERLAUBT);
  });

  it("Stelle fehlt oder hat nicht die Form eines Schluessels", () => {
    expect(positionPruefen(position({ departmentKey: "" }))).toBe(MELDUNGEN.STELLE_FEHLT);
    expect(positionPruefen(position({ departmentKey: "   " }))).toBe(MELDUNGEN.STELLE_FEHLT);
    expect(positionPruefen(position({ departmentKey: "it" }))).toBe(MELDUNGEN.STELLE_UNGUELTIG);
    expect(positionPruefen(position({ departmentKey: "Hausmeister" }))).toBe(MELDUNGEN.STELLE_UNGUELTIG);
  });

  it("entgeltrelevant nur mit Stelle HR (E-A24, F10)", () => {
    expect(positionPruefen(position({ departmentKey: "IT", entgeltrelevant: true }))).toBe(MELDUNGEN.ENTGELT_NUR_HR);
    expect(positionPruefen(position({ departmentKey: "VERWALTUNG", entgeltrelevant: true }))).toBe(
      MELDUNGEN.ENTGELT_NUR_HR,
    );
    expect(positionPruefen(position({ departmentKey: "HR", entgeltrelevant: true }))).toBeNull();
    expect(positionPruefen(position({ departmentKey: "HR", entgeltrelevant: false }))).toBeNull();
  });

  it("unbekannte Art, fehlende oder zu lange Bezeichnung", () => {
    expect(positionPruefen(position({ art: "FREI" }))).toBe(MELDUNGEN.ART_UNBEKANNT);
    expect(positionPruefen(position({ bezeichnung: "  " }))).toBe(MELDUNGEN.BEZEICHNUNG_FEHLT);
    expect(positionPruefen(position({ bezeichnung: "x".repeat(GRENZEN.bezeichnung) }))).toBeNull();
    expect(positionPruefen(position({ bezeichnung: "x".repeat(GRENZEN.bezeichnung + 1) }))).toBe(
      MELDUNGEN.BEZEICHNUNG_ZU_LANG,
    );
  });

  describe("Auswahl", () => {
    it("braucht 1 bis 40 Optionen", () => {
      expect(positionPruefen(auswahl({ optionen: [] }))).toBe(MELDUNGEN.OPTIONEN_FEHLEN);
      const viele = Array.from({ length: GRENZEN.optionen }, (_, i) => `Raum ${i + 1}`);
      expect(positionPruefen(auswahl({ optionen: viele }))).toBeNull();
      expect(positionPruefen(auswahl({ optionen: [...viele, "Raum 41"] }))).toBe(MELDUNGEN.OPTIONEN_ZU_VIELE);
    });

    it("Optionen sind getrimmt, nicht leer, hoechstens 80 Zeichen und eindeutig (ohne Gross/Klein)", () => {
      expect(positionPruefen(auswahl({ optionen: ["Haupteingang", ""] }))).toBe(MELDUNGEN.OPTION_LEER);
      expect(positionPruefen(auswahl({ optionen: [" Haupteingang"] }))).toBe(MELDUNGEN.OPTION_LEER);
      expect(positionPruefen(auswahl({ optionen: ["x".repeat(GRENZEN.option)] }))).toBeNull();
      expect(positionPruefen(auswahl({ optionen: ["x".repeat(GRENZEN.option + 1)] }))).toBe(MELDUNGEN.OPTION_ZU_LANG);
      expect(positionPruefen(auswahl({ optionen: ["Haupteingang", "haupteingang"] }))).toBe(MELDUNGEN.OPTION_DOPPELT);
    });

    it("die Vorauswahl ist eine Teilmenge der Optionen (F8)", () => {
      expect(positionPruefen(auswahl({ vorausgewaehlteOptionen: ["Haupteingang", "Lehrerzimmer"] }))).toBeNull();
      expect(positionPruefen(auswahl({ vorausgewaehlteOptionen: ["Sporthalle"] }))).toBe(
        MELDUNGEN.VORAUSWAHL_NICHT_IN_OPTIONEN,
      );
      // genau, nicht ohne Gross/Klein: die Wahl der Fuehrungskraft vergleicht exakt
      expect(positionPruefen(auswahl({ vorausgewaehlteOptionen: ["haupteingang"] }))).toBe(
        MELDUNGEN.VORAUSWAHL_NICHT_IN_OPTIONEN,
      );
    });

    it("Optionen gibt es nur bei Auswahl, `vorausgewaehlt` nur bei Ja/Nein", () => {
      expect(positionPruefen(position({ optionen: ["A"] }))).toBe(MELDUNGEN.OPTIONEN_NUR_AUSWAHL);
      expect(positionPruefen(position({ vorausgewaehlteOptionen: ["A"] }))).toBe(MELDUNGEN.OPTIONEN_NUR_AUSWAHL);
      expect(positionPruefen(position({ vorausgewaehlt: true }))).toBeNull();
      expect(positionPruefen(auswahl({ vorausgewaehlt: true }))).toBe(MELDUNGEN.VORAUSWAHL_NUR_JA_NEIN);
      expect(positionPruefen(angabe({ vorausgewaehlt: true }))).toBe(MELDUNGEN.VORAUSWAHL_NUR_JA_NEIN);
    });
  });

  describe("Angabe nur aus dem Katalog (E-A13)", () => {
    it.each(ANGABE_SCHLUESSEL)("%s mit dem Label aus ANGABEN_KATALOG ist gueltig", (schluessel) => {
      expect(
        positionPruefen(angabe({ angabeSchluessel: schluessel, bezeichnung: ANGABEN_KATALOG[schluessel].label })),
      ).toBeNull();
    });

    it("ein Schluessel ausserhalb der Liste oder keiner ergibt einen Fehler", () => {
      expect(positionPruefen(angabe({ angabeSchluessel: "RELIGION", bezeichnung: "Religion" }))).toBe(
        MELDUNGEN.ANGABE_UNBEKANNT,
      );
      expect(positionPruefen(angabe({ angabeSchluessel: null }))).toBe(MELDUNGEN.ANGABE_UNBEKANNT);
    });

    it("die Bezeichnung ist das Label der Liste", () => {
      expect(positionPruefen(angabe({ bezeichnung: "Welche Fächer?" }))).toBe(MELDUNGEN.ANGABE_BEZEICHNUNG);
    });

    it("eine Angabe wird keine Aufgabe: ohne Faelligkeit, Aufgabentitel und Bemerkungsfeld", () => {
      expect(positionPruefen(angabe({ defaultDueDays: -3 }))).toBe(MELDUNGEN.ANGABE_OHNE_AUFGABE);
      expect(positionPruefen(angabe({ defaultDueDays: 0 }))).toBe(MELDUNGEN.ANGABE_OHNE_AUFGABE);
      expect(positionPruefen(angabe({ aufgabeTitel: "Fächer notieren" }))).toBe(MELDUNGEN.ANGABE_OHNE_AUFGABE);
      expect(positionPruefen(angabe({ bemerkungAnbieten: true }))).toBe(MELDUNGEN.ANGABE_OHNE_BEMERKUNG);
      expect(positionPruefen(angabe({ bemerkungPlatzhalter: "z. B. …" }))).toBe(MELDUNGEN.ANGABE_OHNE_BEMERKUNG);
    });

    it("ein Angabe-Schluessel gehoert nur zur Art Angabe", () => {
      expect(positionPruefen(position({ angabeSchluessel: "DURCHWAHL" }))).toBe(
        MELDUNGEN.ANGABE_SCHLUESSEL_NUR_ANGABE,
      );
    });
  });

  describe("Sichtbar fuer", () => {
    it("nur bei einer Angabe", () => {
      expect(positionPruefen(position({ sichtbarFuer: ["FACILITY"] }))).toBe(MELDUNGEN.SICHTBAR_NUR_ANGABE);
      expect(positionPruefen(auswahl({ sichtbarFuer: ["IT"] }))).toBe(MELDUNGEN.SICHTBAR_NUR_ANGABE);
    });

    it.each(["HR", "MITARBEITER", "VORGESETZTER", "it", ""])("„%s“ ist keine Link-Stelle", (stelle) => {
      expect(positionPruefen(angabe({ sichtbarFuer: [stelle] }))).toBe(MELDUNGEN.SICHTBAR_UNGUELTIG);
    });

    it("ohne die eigene Stelle, ohne Doppelte; eigene Schluessel sind erlaubt", () => {
      expect(positionPruefen(angabe({ sichtbarFuer: ["FACILITY"] }))).toBe(MELDUNGEN.SICHTBAR_EIGENE_STELLE);
      expect(positionPruefen(angabe({ sichtbarFuer: ["IT", "IT"] }))).toBe(MELDUNGEN.SICHTBAR_DOPPELT);
      expect(positionPruefen(angabe({ sichtbarFuer: ["IT", "EMPFANG"] }))).toBeNull();
    });
  });

  describe("Gilt fuer", () => {
    it("Einrichtungsarten nur bei zentralen Positionen", () => {
      expect(positionPruefen(position({ einrichtungsarten: ["KITA"] }))).toBeNull();
      expect(positionPruefen(position({ organizationId: GYM, einrichtungsarten: ["GYMNASIUM"] }))).toBe(
        MELDUNGEN.EINRICHTUNGSARTEN_NUR_ZENTRAL,
      );
    });

    it("nur bekannte Einrichtungsarten und Personengruppen (auch keine Prototyp-Schluessel)", () => {
      expect(positionPruefen(position({ einrichtungsarten: ["SCHLOSS"] }))).toBe(MELDUNGEN.EINRICHTUNGSART_UNBEKANNT);
      expect(positionPruefen(position({ einrichtungsarten: ["constructor"] }))).toBe(
        MELDUNGEN.EINRICHTUNGSART_UNBEKANNT,
      );
      expect(positionPruefen(position({ personengruppen: ["STANDARD", "BEAMTE"] }))).toBeNull();
      expect(positionPruefen(position({ personengruppen: ["LEHRKRAFT"] }))).toBe(MELDUNGEN.PERSONENGRUPPE_UNBEKANNT);
      expect(positionPruefen(position({ personengruppen: ["toString"] }))).toBe(MELDUNGEN.PERSONENGRUPPE_UNBEKANNT);
    });
  });

  it("Faelligkeit: ganze Zahl von −365 bis 365 oder keine", () => {
    for (const tage of [null, -365, -5, 0, 365]) {
      expect(positionPruefen(position({ defaultDueDays: tage }))).toBeNull();
    }
    for (const tage of [-366, 366, 1.5, Number.NaN]) {
      expect(positionPruefen(position({ defaultDueDays: tage }))).toBe(MELDUNGEN.FAELLIG_UNGUELTIG);
    }
  });

  it("Laengen der Hinweise, des Platzhalters und des Aufgabentitels", () => {
    const zuLang = (n: number) => "x".repeat(n + 1);
    expect(positionPruefen(position({ hinweisFuehrungskraft: zuLang(GRENZEN.hinweisFuehrungskraft) }))).toBe(
      MELDUNGEN.HINWEIS_FUEHRUNGSKRAFT_ZU_LANG,
    );
    expect(positionPruefen(position({ hinweisStelle: zuLang(GRENZEN.hinweisStelle) }))).toBe(
      MELDUNGEN.HINWEIS_STELLE_ZU_LANG,
    );
    expect(positionPruefen(position({ bemerkungPlatzhalter: zuLang(GRENZEN.bemerkungPlatzhalter) }))).toBe(
      MELDUNGEN.PLATZHALTER_ZU_LANG,
    );
    expect(positionPruefen(position({ aufgabeTitel: zuLang(GRENZEN.aufgabeTitel) }))).toBe(
      MELDUNGEN.AUFGABENTITEL_ZU_LANG,
    );
    expect(
      positionPruefen(
        position({
          hinweisFuehrungskraft: "x".repeat(GRENZEN.hinweisFuehrungskraft),
          hinweisStelle: "x".repeat(GRENZEN.hinweisStelle),
          bemerkungPlatzhalter: "x".repeat(GRENZEN.bemerkungPlatzhalter),
          aufgabeTitel: "x".repeat(GRENZEN.aufgabeTitel),
        }),
      ),
    ).toBeNull();
  });
});

// =============================================
// positionGiltAm
// =============================================

describe("positionGiltAm", () => {
  const amGym = { arbeitsortId: GYM, einrichtungsart: "GYMNASIUM" };

  it("eine Position der Einrichtung gilt nur an ihrem Arbeitsort", () => {
    expect(positionGiltAm(position({ organizationId: GYM }), amGym, [])).toBe(true);
    expect(positionGiltAm(position({ organizationId: GS }), amGym, [])).toBe(false);
    expect(positionGiltAm(position({ organizationId: GS }), { arbeitsortId: GS, einrichtungsart: "GRUNDSCHULE" }, [])).toBe(
      true,
    );
  });

  it("eine zentrale Position gilt ueberall, wo die Einrichtungsart passt (leer = alle)", () => {
    expect(positionGiltAm(position(), amGym, [])).toBe(true);
    expect(positionGiltAm(position({ einrichtungsarten: ["KITA"] }), amGym, [])).toBe(false);
    expect(positionGiltAm(position({ einrichtungsarten: ["KITA", "GYMNASIUM"] }), amGym, [])).toBe(true);
    expect(positionGiltAm(position({ einrichtungsarten: ["KITA"] }), { arbeitsortId: KITA, einrichtungsart: "KITA" }, [])).toBe(
      true,
    );
    // Art unbekannt: nur Positionen ohne Einschraenkung
    expect(positionGiltAm(position({ einrichtungsarten: ["KITA"] }), { arbeitsortId: KITA, einrichtungsart: null }, [])).toBe(
      false,
    );
    expect(positionGiltAm(position(), { arbeitsortId: KITA, einrichtungsart: null }, [])).toBe(true);
  });

  it("die Ausblendung des Arbeitsorts nimmt eine zentrale Position weg, fremde Ausblendungen nicht", () => {
    const p = position({ id: "pos-ipad" });
    expect(positionGiltAm(p, amGym, [{ positionId: "pos-ipad", organizationId: GYM }])).toBe(false);
    expect(positionGiltAm(p, amGym, [{ positionId: "pos-ipad", organizationId: KITA }])).toBe(true);
    expect(positionGiltAm(p, amGym, [{ positionId: "pos-anderes", organizationId: GYM }])).toBe(true);
  });
});

// =============================================
// positionenFuer
// =============================================

describe("positionenFuer", () => {
  const katalog = [
    position({ id: "it-zentral" }),
    position({ id: "it-gym", organizationId: GYM, bezeichnung: "Dienst-Laptop" }),
    position({ id: "it-gs", organizationId: GS, bezeichnung: "Tablet Grundschule" }),
    position({ id: "it-kita", einrichtungsarten: ["KITA"], bezeichnung: "Kita-Tablet" }),
    position({ id: "it-beamte", personengruppen: ["BEAMTE"], bezeichnung: "Zugang Beamtenportal" }),
    position({ id: "it-aus", isActive: false, bezeichnung: "Ausgeschaltet" }),
  ];

  it("filtert nach Arbeitsort, Einrichtungsart, Personengruppe und Aktiv-Schalter", () => {
    expect(ids(positionenFuer(katalog, kontext()))).toEqual(["it-zentral", "it-gym"]);
  });

  it("der Arbeitsort entscheidet, nicht die Einrichtung des Vorgangs (E-A10)", () => {
    // Vorgang des Foerdervereins, Arbeitsort Grundschule: der Aufrufer gibt den wirksamen Arbeitsort
    expect(ids(positionenFuer(katalog, kontext({ arbeitsortId: GS, einrichtungsart: "GRUNDSCHULE" })))).toEqual([
      "it-zentral",
      "it-gs",
    ]);
    expect(ids(positionenFuer(katalog, kontext({ arbeitsortId: KITA, einrichtungsart: "KITA" })))).toEqual([
      "it-zentral",
      "it-kita",
    ]);
  });

  it("eine am Arbeitsort ausgeblendete zentrale Position fehlt", () => {
    const ctx = kontext({ ausblendungen: [{ positionId: "it-zentral", organizationId: GYM }] });
    expect(ids(positionenFuer(katalog, ctx))).toEqual(["it-gym"]);
  });

  it("Personengruppe: leer = alle, sonst nur passende Vorgaenge", () => {
    expect(ids(positionenFuer(katalog, kontext({ questionnaireType: "BEAMTE" })))).toEqual([
      "it-zentral",
      "it-gym",
      "it-beamte",
    ]);
    expect(ids(positionenFuer(katalog, kontext({ questionnaireType: "EHRENAMT" })))).toEqual(["it-zentral", "it-gym"]);
  });

  it.each(["VERBEAMTUNG", "VERTRAGSAENDERUNG", "KUENDIGUNG"])("Vorgangsart %s: keine Positionen", (processType) => {
    expect(positionenFuer(katalog, kontext({ processType }))).toEqual([]);
  });

  it("eine Stelle ohne Adresse am Arbeitsort fehlt, HR nie (und wird nicht gefragt)", () => {
    const adresseVorhanden = jest.fn((key: string) => key === "IT");
    const liste = [
      position({ id: "it" }),
      position({ id: "facility", departmentKey: "FACILITY", bezeichnung: "Spind" }),
      position({ id: "hr", departmentKey: "HR", bezeichnung: "Jobticket", entgeltrelevant: true }),
    ];
    expect(ids(positionenFuer(liste, kontext({ adresseVorhanden })))).toEqual(["it", "hr"]);
    expect(adresseVorhanden).not.toHaveBeenCalledWith("HR");
    expect(adresseVorhanden).toHaveBeenCalledWith("FACILITY");

    // Gar keine Adresse: HR bleibt
    expect(ids(positionenFuer(liste, kontext({ adresseVorhanden: () => false })))).toEqual(["hr"]);
  });

  it("was nie gelten darf, faellt auch aus der Datenbank heraus weg", () => {
    const liste = [
      position({ id: "fk", departmentKey: "VORGESETZTER" }),
      position({ id: "ma", departmentKey: "MITARBEITER" }),
      position({ id: "frei", art: "FREI" }),
      angabe({ id: "religion", angabeSchluessel: "RELIGION", bezeichnung: "Religion" }),
      angabe({ id: "faecher" }),
    ];
    expect(ids(positionenFuer(liste, kontext()))).toEqual(["faecher"]);
  });

  it("sortiert nach Stelle (feste Link-Stellen, eigene alphabetisch, HR zuletzt), dann orderIndex, dann Bezeichnung", () => {
    const liste = [
      position({ id: "hr", departmentKey: "HR", bezeichnung: "Jobticket" }),
      position({ id: "empfang", departmentKey: "EMPFANG", bezeichnung: "Namensschild" }),
      position({ id: "facility", departmentKey: "FACILITY", bezeichnung: "Spind" }),
      position({ id: "archiv", departmentKey: "ARCHIV", bezeichnung: "Archivzugang" }),
      position({ id: "it-b", orderIndex: 2, bezeichnung: "B" }),
      position({ id: "it-z", orderIndex: 1, bezeichnung: "Z" }),
      position({ id: "it-a", orderIndex: 2, bezeichnung: "A" }),
      position({ id: "verwaltung", departmentKey: "VERWALTUNG", bezeichnung: "Kopierkarte" }),
    ];
    expect(ids(positionenFuer(liste, kontext()))).toEqual([
      "it-z",
      "it-a",
      "it-b",
      "verwaltung",
      "facility",
      "archiv",
      "empfang",
      "hr",
    ]);
  });

  it("liefert dieselben Objekte zurueck (generisch, z. B. mit Ausblendungen)", () => {
    const p = { ...position({ id: "x" }), ausblendungen: [] as { organizationId: string }[] };
    const [ergebnis] = positionenFuer([p], kontext());
    expect(ergebnis).toBe(p);
  });
});

// =============================================
// formularGruppen
// =============================================

describe("formularGruppen", () => {
  const intern = {
    hinweisStelle: "Erst nach Verpflichtung auf Vertraulichkeit freischalten.",
    ausgabeKennung: "Inventarnummer",
    rueckgabeKategorie: "IT",
    beiAustritt: "RUECKGABE",
    entgeltrelevant: false,
    vorschlagSchluessel: "IT_ZUGAENGE",
  };
  const positionen = [
    position({ id: "ipad", hinweisFuehrungskraft: "Für Lehrkräfte mit eigenem Unterricht.", bemerkungPlatzhalter: "z. B. Stift", ...intern }),
    position({
      id: "zugaenge",
      art: "AUSWAHL",
      bezeichnung: "Zugänge",
      optionen: ["Dienst-E-Mail", "WebUntis"],
      vorausgewaehlteOptionen: ["Dienst-E-Mail"],
      ...intern,
    }),
    angabe({ id: "faecher", sichtbarFuer: ["IT", "EMPFANG"], ...intern }),
    position({ id: "kopierkarte", departmentKey: "VERWALTUNG", bezeichnung: "Kopierkarte", bemerkungAnbieten: false, bemerkungPlatzhalter: "z. B. Farbe" }),
  ];
  const namen = { IT: "IT-Support FES", FACILITY: "Gebäudewirtschaft" };

  it("gruppiert nach Stelle in der Reihenfolge der Eingabe; Name aus den Einstellungen, sonst das Label", () => {
    const gruppen = formularGruppen(positionen, namen);
    expect(gruppen.map((g) => [g.departmentKey, g.stelleName, g.positionen.map((p) => p.id)])).toEqual([
      ["IT", "IT-Support FES", ["ipad", "zugaenge"]],
      ["FACILITY", "Gebäudewirtschaft", ["faecher"]],
      ["VERWALTUNG", DEPARTMENT_LABELS.VERWALTUNG, ["kopierkarte"]],
    ]);
  });

  it("entfernt hinweisStelle, ausgabeKennung, entgeltrelevant, vorschlagSchluessel und die uebrigen internen Felder (Regel 7)", () => {
    const gruppen = formularGruppen(positionen, namen);
    for (const p of gruppen.flatMap((g) => g.positionen)) {
      for (const feld of [
        "hinweisStelle",
        "ausgabeKennung",
        "entgeltrelevant",
        "vorschlagSchluessel",
        "rueckgabeKategorie",
        "beiAustritt",
        "aufgabeTitel",
        "defaultDueDays",
        "einrichtungsarten",
        "personengruppen",
        "organizationId",
        "isActive",
      ]) {
        expect(p).not.toHaveProperty(feld);
      }
    }
    const json = JSON.stringify(gruppen);
    expect(json).not.toContain(intern.hinweisStelle);
    expect(json).not.toContain(intern.ausgabeKennung);
    expect(json).not.toContain(intern.vorschlagSchluessel);
  });

  it("zeigt, was das Formular braucht, je Art", () => {
    const [itGruppe, facility, verwaltung] = formularGruppen(positionen, namen);
    expect(itGruppe.positionen[0]).toEqual({
      id: "ipad",
      departmentKey: "IT",
      art: "JA_NEIN",
      bezeichnung: "Dienst-iPad (Lernmittel)",
      hinweisFuehrungskraft: "Für Lehrkräfte mit eigenem Unterricht.",
      optionen: [],
      vorausgewaehlt: false,
      vorausgewaehlteOptionen: [],
      bemerkungAnbieten: true,
      bemerkungPlatzhalter: "z. B. Stift",
      angabe: null,
    });
    expect(itGruppe.positionen[1]).toMatchObject({
      art: "AUSWAHL",
      optionen: ["Dienst-E-Mail", "WebUntis"],
      vorausgewaehlteOptionen: ["Dienst-E-Mail"],
      angabe: null,
    });
    expect(facility.positionen[0]).toMatchObject({
      art: "ANGABE",
      bezeichnung: "Unterrichtsfächer",
      bemerkungAnbieten: false,
      bemerkungPlatzhalter: null,
      angabe: {
        platzhalter: ANGABEN_KATALOG.UNTERRICHTSFAECHER.platzhalter,
        hilfe: ANGABEN_KATALOG.UNTERRICHTSFAECHER.hilfe,
        max: ANGABEN_KATALOG.UNTERRICHTSFAECHER.max,
        sichtbarFuer: [
          { departmentKey: "IT", stelleName: "IT-Support FES" },
          { departmentKey: "EMPFANG", stelleName: "EMPFANG" },
        ],
      },
    });
    // Ohne Bemerkungsfeld kein Platzhalter
    expect(verwaltung.positionen[0]).toMatchObject({ bemerkungAnbieten: false, bemerkungPlatzhalter: null });
  });

  it("Felder, die nicht zur Art passen, kommen leer (auch wenn sie in der Datenbank stuenden)", () => {
    const [gruppe] = formularGruppen(
      [
        position({ id: "a", optionen: ["X"], vorausgewaehlteOptionen: ["X"] }),
        auswahl({ id: "b", departmentKey: "IT", vorausgewaehlt: true, vorausgewaehlteOptionen: ["Haupteingang", "Weg"] }),
      ],
      {},
    );
    expect(gruppe.positionen[0]).toMatchObject({ optionen: [], vorausgewaehlteOptionen: [] });
    expect(gruppe.positionen[1]).toMatchObject({ vorausgewaehlt: false, vorausgewaehlteOptionen: ["Haupteingang"] });
  });

  it("keine Positionen, keine Gruppen", () => {
    expect(formularGruppen([], namen)).toEqual([]);
  });
});

// =============================================
// adressLuecken
// =============================================

describe("adressLuecken", () => {
  const einrichtungen: KatalogEinrichtung[] = [
    { id: GYM, name: "Gymnasium Minden", type: "GYMNASIUM", isActive: true },
    { id: GS, name: "Grundschule Minden", type: "GRUNDSCHULE", isActive: true },
    { id: KITA, name: "Kita Minden", type: "KITA", isActive: false },
  ];
  const konfigs = [
    konfig({ departmentKey: "IT", organizationId: null }),
    konfig({ departmentKey: "FACILITY", departmentName: "Hausmeister Gymnasium", email: "hm@example.org", organizationId: GYM }),
    konfig({ departmentKey: "VERWALTUNG", departmentName: "Sekretariat", organizationId: null, isActive: false }),
  ];
  const luecken = (positionen: Parameters<typeof adressLuecken>[0]) =>
    adressLuecken(positionen, einrichtungen, konfigs).map((l) => [l.positionId, l.organizationId, l.grund]);

  it("Position × aktive Einrichtung, an der sie gilt, ohne aktive Adresse der Stelle", () => {
    expect(
      luecken([
        position({ id: "it" }),
        position({ id: "spind", departmentKey: "FACILITY", bezeichnung: "Spind" }),
        position({ id: "kopierkarte", departmentKey: "VERWALTUNG", bezeichnung: "Kopierkarte" }),
      ]),
    ).toEqual([
      ["spind", GS, "KEINE_ADRESSE"],
      ["kopierkarte", GYM, "ABTEILUNG_INAKTIV"],
      ["kopierkarte", GS, "ABTEILUNG_INAKTIV"],
    ]);
  });

  it("HR braucht keine Adresse; ausgeschaltete Positionen und inaktive Einrichtungen warnen nicht", () => {
    expect(
      luecken([
        position({ id: "hr", departmentKey: "HR", bezeichnung: "Jobticket" }),
        position({ id: "aus", departmentKey: "FACILITY", isActive: false }),
      ]),
    ).toEqual([]);
  });

  it("nur wo die Position gilt: Einrichtungsart, Ausblendung, eigene Einrichtung", () => {
    expect(
      luecken([
        position({ id: "nur-gym", departmentKey: "FACILITY", einrichtungsarten: ["GYMNASIUM"] }),
        { ...position({ id: "ausgeblendet", departmentKey: "FACILITY" }), ausblendungen: [{ organizationId: GS }] },
        position({ id: "eigene-gs", departmentKey: "FACILITY", organizationId: GS }),
      ]),
    ).toEqual([["eigene-gs", GS, "KEINE_ADRESSE"]]);
  });

  it("der Eintrag der Einrichtung zaehlt vor dem zentralen; der Satz nennt Einrichtung, Stelle und Position", () => {
    const [luecke] = adressLuecken(
      [position({ id: "spind", departmentKey: "FACILITY", bezeichnung: "Spind" })],
      einrichtungen,
      konfigs,
    );
    expect(luecke).toEqual({
      positionId: "spind",
      bezeichnung: "Spind",
      departmentKey: "FACILITY",
      stelleName: DEPARTMENT_LABELS.FACILITY,
      organizationId: GS,
      einrichtung: "Grundschule Minden",
      grund: "KEINE_ADRESSE",
      text: `Grundschule Minden: keine aktive Adresse für ${DEPARTMENT_LABELS.FACILITY} – „Spind“ fehlt dort im Formular.`,
    });
    const [inaktiv] = adressLuecken([position({ id: "k", departmentKey: "VERWALTUNG", bezeichnung: "Kopierkarte" })], einrichtungen, konfigs);
    expect(inaktiv.text).toBe("Gymnasium Minden: Sekretariat ist deaktiviert – „Kopierkarte“ fehlt dort im Formular.");
  });

  it("eine Einrichtung ohne Angabe zu isActive zaehlt als aktiv", () => {
    expect(
      adressLuecken(
        [position({ id: "spind", departmentKey: "FACILITY" })],
        [{ id: GS, name: "Grundschule Minden", type: "GRUNDSCHULE" }],
        konfigs,
      ).map((l) => l.organizationId),
    ).toEqual([GS]);
  });
});

// =============================================
// aehnlicheVorlagenpunkte
// =============================================

describe("aehnlicheVorlagenpunkte", () => {
  function punkt(title: string, defaultAssignee: string | null, teil: Partial<KatalogVorlagenpunkt> = {}): KatalogVorlagenpunkt {
    return { templateId: "vorlage-1", templateName: "Onboarding Standard", defaultAssignee, title, ...teil };
  }

  it("findet einen Vorlagenpunkt derselben Stelle mit einem Wort aus der Bezeichnung (ohne Gross/Klein)", () => {
    const treffer = aehnlicheVorlagenpunkte(
      [auswahl({ id: "schluessel" })],
      [punkt("SCHLÜSSEL bereitlegen", "FACILITY", { id: "punkt-1" })],
    );
    expect(treffer).toEqual([
      {
        positionId: "schluessel",
        bezeichnung: "Schlüssel",
        departmentKey: "FACILITY",
        templateId: "vorlage-1",
        templateName: "Onboarding Standard",
        punktId: "punkt-1",
        punktTitel: "SCHLÜSSEL bereitlegen",
        wort: "schlüssel",
        text: "Vorlage „Onboarding Standard“: „SCHLÜSSEL bereitlegen“ klingt nach „Schlüssel“. Bitte den Vorlagenpunkt streichen oder umformulieren, sonst bekommt die Stelle zwei Aufgaben.",
      },
    ]);
  });

  it("auch ueber eine Option; ein zusammengesetztes Wort zaehlt (vorn oder hinten)", () => {
    const zugaenge = position({ id: "zugaenge", art: "AUSWAHL", bezeichnung: "Zugänge", optionen: ["WebUntis", "Schulportal"] });
    expect(aehnlicheVorlagenpunkte([zugaenge], [punkt("WebUntis-Konto anlegen", "IT")]).map((t) => t.wort)).toEqual([
      "webuntis",
    ]);
    expect(aehnlicheVorlagenpunkte([zugaenge], [punkt("Schulportalzugang anlegen", "IT")]).map((t) => t.wort)).toEqual([
      "schulportal",
    ]);
    const fach = position({ id: "fach", departmentKey: "VERWALTUNG", bezeichnung: "Fach im Lehrerzimmer" });
    expect(aehnlicheVorlagenpunkte([fach], [punkt("Postfach und Namensschild vorbereiten", "VERWALTUNG")]).map((t) => t.wort)).toEqual(
      ["fach"],
    );
    expect(aehnlicheVorlagenpunkte([auswahl()], [punkt("Generalschlüssel ausgeben", "FACILITY")]).map((t) => t.wort)).toEqual([
      "schlüssel",
    ]);
  });

  it("gebeugte Formen zaehlen wie das Wort", () => {
    expect(aehnlicheVorlagenpunkte([auswahl()], [punkt("Ausgabe des Schlüssels", "FACILITY")]).map((t) => t.wort)).toEqual([
      "schlüssel",
    ]);
    const spind = position({ id: "spind", departmentKey: "FACILITY", bezeichnung: "Spind" });
    expect(aehnlicheVorlagenpunkte([spind], [punkt("Spinde zuweisen", "FACILITY")])).toHaveLength(1);
  });

  it("Wort fuer Wort, nicht als Teilzeichenkette: Ableitungen und kurze Reste zaehlen nicht", () => {
    const laptop = position({ id: "laptop", bezeichnung: "Dienst-Laptop/PC" });
    const telefon = position({ id: "telefon", bezeichnung: "Telefon mit Durchwahl" });
    // „dienst“ steckt in „dienstliche“ und „Dienstag“, ist aber kein Ding derselben Art.
    expect(aehnlicheVorlagenpunkte([laptop], [punkt("Dienstliche Mails einrichten", "IT")])).toEqual([]);
    expect(aehnlicheVorlagenpunkte([laptop], [punkt("Rückruf am Dienstag", "IT")])).toEqual([]);
    expect(aehnlicheVorlagenpunkte([telefon], [punkt("Telefonisch begrüßen", "IT")])).toEqual([]);
    expect(aehnlicheVorlagenpunkte([telefon], [punkt("Mit der Leitung telefonieren", "IT")])).toEqual([]);
    expect(aehnlicheVorlagenpunkte([auswahl()], [punkt("Daten entschlüsseln", "FACILITY")])).toEqual([]);
  });

  it("die Seed-Vorlage „Benutzerkonto und dienstliche E-Mail-Adresse anlegen“ klingt nicht nach Laptop oder iPad, wohl aber nach den Zugängen", () => {
    const seed = punkt("Benutzerkonto und dienstliche E-Mail-Adresse anlegen", "IT", { id: "seed-it-1" });
    const vorschlag = (schluessel: string): KatalogPosition => {
      const v = VORSCHLAEGE.find((x) => x.vorschlagSchluessel === schluessel);
      if (!v) throw new Error(`Vorschlag ${schluessel} fehlt`);
      return { ...v, id: schluessel, isActive: true };
    };
    expect(aehnlicheVorlagenpunkte([vorschlag("IT_LAPTOP"), vorschlag("IT_IPAD")], [seed])).toEqual([]);
    // „Dienst-E-Mail“ (Option der Zugänge) und „E-Mail-Adresse“ meinen dasselbe.
    expect(aehnlicheVorlagenpunkte([vorschlag("IT_ZUGAENGE")], [seed]).map((t) => [t.positionId, t.wort])).toEqual([
      ["IT_ZUGAENGE", "mail"],
    ]);
  });

  it("nur dieselbe Stelle; Freitext oder keine Zustaendigkeit zaehlt nicht", () => {
    const p = auswahl({ id: "schluessel" });
    expect(aehnlicheVorlagenpunkte([p], [punkt("Schlüssel bereitlegen", "VERWALTUNG")])).toEqual([]);
    expect(aehnlicheVorlagenpunkte([p], [punkt("Schlüssel bereitlegen", null)])).toEqual([]);
    expect(aehnlicheVorlagenpunkte([p], [punkt("Schlüssel bereitlegen", "Hausmeister")])).toEqual([]);
    expect(aehnlicheVorlagenpunkte([p], [punkt("Schlüssel bereitlegen", " FACILITY ")])).toHaveLength(1);
  });

  it(`Woerter unter ${AEHNLICH_MIN_ZEICHEN} Zeichen zaehlen nicht`, () => {
    const telefon = position({ id: "telefon", bezeichnung: "Telefon mit Durchwahl" });
    expect(aehnlicheVorlagenpunkte([telefon], [punkt("Gespräch mit der Leitung", "IT")])).toEqual([]);
    const laptop = position({ id: "laptop", bezeichnung: "Dienst-Laptop/PC" });
    expect(aehnlicheVorlagenpunkte([laptop], [punkt("PC-Arbeitsplatz einrichten", "IT")])).toEqual([]);
    expect(aehnlicheVorlagenpunkte([laptop], [punkt("Laptop vorbereiten", "IT")]).map((t) => t.wort)).toEqual(["laptop"]);
  });

  it("je Position und Vorlagenpunkt ein Treffer, auch bei mehreren passenden Woertern; ueber mehrere Vorlagen je einer", () => {
    const ipad = position({ id: "ipad", bezeichnung: "Dienst-iPad (Lernmittel)" });
    const treffer = aehnlicheVorlagenpunkte(
      [ipad],
      [
        punkt("Dienst-iPad als Lernmittel ausgeben", "IT"),
        punkt("iPad einrichten", "IT", { templateId: "vorlage-2", templateName: "Onboarding Kita" }),
      ],
    );
    expect(treffer.map((t) => [t.templateId, t.wort])).toEqual([
      ["vorlage-1", "dienst"],
      ["vorlage-2", "ipad"],
    ]);
  });

  it("Angaben werden keine Aufgabe und bleiben aussen vor", () => {
    expect(aehnlicheVorlagenpunkte([angabe()], [punkt("Unterrichtsfächer erfragen", "FACILITY")])).toEqual([]);
  });
});

// =============================================
// aufgabenTitel
// =============================================

describe("aufgabenTitel", () => {
  it("Standard „<Bezeichnung> bereitstellen“, sonst der Aufgabentitel", () => {
    expect(aufgabenTitel(position(), "")).toBe("Dienst-iPad (Lernmittel) bereitstellen");
    expect(aufgabenTitel(position({ aufgabeTitel: "Dienst-iPad einrichten und übergeben" }), "")).toBe(
      "Dienst-iPad einrichten und übergeben",
    );
    expect(aufgabenTitel(position({ aufgabeTitel: "   " }), "")).toBe("Dienst-iPad (Lernmittel) bereitstellen");
  });

  it("bei Auswahl mit „: <Option>“ dahinter (E-A12)", () => {
    expect(aufgabenTitel(auswahl(), "Haupteingang")).toBe("Schlüssel ausgeben: Haupteingang");
    expect(aufgabenTitel(auswahl({ aufgabeTitel: null }), "Fachraum Chemie")).toBe(
      "Schlüssel bereitstellen: Fachraum Chemie",
    );
    expect(aufgabenTitel(auswahl(), "")).toBe("Schlüssel ausgeben");
  });

  it("Ja/Nein nimmt keine Option an", () => {
    expect(aufgabenTitel(position(), "Haupteingang")).toBe("Dienst-iPad (Lernmittel) bereitstellen");
  });
});

// =============================================
// VORSCHLAEGE
// =============================================

describe("VORSCHLAEGE", () => {
  it("alle bestehen positionPruefen", () => {
    for (const v of VORSCHLAEGE) {
      expect(`${v.vorschlagSchluessel}: ${positionPruefen(v)}`).toBe(`${v.vorschlagSchluessel}: null`);
    }
  });

  it("haben eindeutige, feste Schluessel und eine eindeutige Reihenfolge innerhalb der Grenze", () => {
    const schluessel = VORSCHLAEGE.map((v) => v.vorschlagSchluessel);
    expect(new Set(schluessel).size).toBe(schluessel.length);
    for (const s of schluessel) expect(s).toMatch(/^[A-Z][A-Z0-9_]+$/);
    const reihenfolge = VORSCHLAEGE.map((v) => v.orderIndex);
    expect(new Set(reihenfolge).size).toBe(reihenfolge.length);
    for (const r of reihenfolge) {
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(REIHENFOLGE_MAX);
    }
  });

  it("sind zentral, ohne Entgeltbezug, ohne Faelligkeit und ohne Einschraenkung", () => {
    for (const v of VORSCHLAEGE) {
      expect(v).toMatchObject({
        organizationId: null,
        einrichtungsarten: [],
        personengruppen: [],
        entgeltrelevant: false,
        defaultDueDays: null,
      });
    }
  });

  it("enthalten den Anfangsbestand aus dem Plan samt BYOD (E-A39)", () => {
    const je = (stelle: string) =>
      VORSCHLAEGE.filter((v) => v.departmentKey === stelle).map((v) => [v.art, v.bezeichnung]);
    expect(je("IT")).toEqual([
      ["JA_NEIN", "Dienst-Laptop/PC"],
      ["JA_NEIN", "Dienst-iPad (Lernmittel)"],
      ["JA_NEIN", "Telefon mit Durchwahl"],
      ["JA_NEIN", "Private Endgeräte (BYOD) freischalten"],
      ["AUSWAHL", "Zugänge"],
      ["ANGABE", "Gewünschte Durchwahl"],
    ]);
    expect(je("FACILITY")).toEqual([
      ["JA_NEIN", "Transponder/Chip"],
      ["JA_NEIN", "Parkplatz"],
      ["JA_NEIN", "Spind"],
      ["AUSWAHL", "Schlüssel"],
      ["ANGABE", "Unterrichtsfächer"],
    ]);
    expect(je("VERWALTUNG")).toEqual([
      ["JA_NEIN", "Fach im Lehrerzimmer"],
      ["JA_NEIN", "Kopierkarte"],
      ["JA_NEIN", "Türschild"],
      ["JA_NEIN", "Dienstausweis"],
    ]);
    expect(VORSCHLAEGE).toHaveLength(15);
  });

  it("Zugänge, Schlüssel und Unterrichtsfächer wie im Feinplan", () => {
    const zugaenge = VORSCHLAEGE.find((v) => v.vorschlagSchluessel === "IT_ZUGAENGE");
    expect(zugaenge).toMatchObject({
      optionen: ["Dienst-E-Mail", "Schulportal", "WebUntis", "Schulverwaltung", "Drucker-PIN"],
      vorausgewaehlteOptionen: ["Dienst-E-Mail"],
      aufgabeTitel: "Zugang einrichten",
      hinweisStelle: "Erst nach Verpflichtung auf Vertraulichkeit freischalten.",
    });
    const schluessel = VORSCHLAEGE.find((v) => v.vorschlagSchluessel === "FACILITY_SCHLUESSEL");
    expect(schluessel).toMatchObject({
      optionen: ["Haupteingang", "Lehrerzimmer"],
      aufgabeTitel: "Schlüssel ausgeben",
      // Steht im Formular unter der Position — an die Führungskraft gerichtet, mit Bemerkungsfeld dazu.
      hinweisFuehrungskraft: "Weitere Räume bitte in der Bemerkung nennen.",
      bemerkungAnbieten: true,
      // Die Pflegeanweisung an die Verwaltung steht nur in der Vorschau von „Vorschläge übernehmen“.
      pflegeHinweis: "Räume einer Einrichtung bitte als eigene Position dieser Einrichtung anlegen.",
    });
    const faecher = VORSCHLAEGE.find((v) => v.vorschlagSchluessel === "FACILITY_UNTERRICHTSFAECHER");
    expect(faecher).toMatchObject({ angabeSchluessel: "UNTERRICHTSFAECHER", sichtbarFuer: ["IT"], bemerkungAnbieten: false });
    expect(VORSCHLAEGE.find((v) => v.vorschlagSchluessel === "IT_DURCHWAHL")).toMatchObject({
      angabeSchluessel: "DURCHWAHL",
    });
  });

  it("ergeben sinnvolle Aufgabentitel (kein „freischalten bereitstellen“)", () => {
    const titel = VORSCHLAEGE.filter((v) => v.art === "JA_NEIN").map((v) => aufgabenTitel(v, ""));
    expect(titel).toContain("Private Endgeräte (BYOD) freischalten");
    for (const t of titel) expect(t).not.toMatch(/freischalten bereitstellen/);
  });

  it("teilen keine Liste miteinander", () => {
    const listen = VORSCHLAEGE.flatMap((v) => [v.optionen, v.vorausgewaehlteOptionen, v.sichtbarFuer]);
    expect(new Set(listen).size).toBe(listen.length);
  });

  it("der Hinweis für die Führungskraft ist keine Pflegeanweisung; der Pflegehinweis kommt nie ins Formular", () => {
    for (const v of VORSCHLAEGE) {
      expect(v.hinweisFuehrungskraft ?? "").not.toMatch(/pflegen|Position/);
    }
    const schluessel = VORSCHLAEGE.find((v) => v.vorschlagSchluessel === "FACILITY_SCHLUESSEL")!;
    const [gruppe] = formularGruppen([{ ...schluessel, id: "s", isActive: true }], {});
    expect(gruppe.positionen[0]).not.toHaveProperty("pflegeHinweis");
    expect(gruppe.positionen[0].hinweisFuehrungskraft).toBe("Weitere Räume bitte in der Bemerkung nennen.");
    expect(katalogWerte({ ...schluessel, isActive: false })).not.toHaveProperty("pflegeHinweis");
  });
});

// =============================================
// Katalogseite (S3): Reihenfolge, Felder, Aenderungen, Stellen, Freigabe
// =============================================

describe("nachStelleSortiert", () => {
  it("Stelle wie die Abteilungskarte (feste, eigene alphabetisch, HR dahinter), dann orderIndex, dann Bezeichnung", () => {
    const sortiert = nachStelleSortiert([
      position({ id: "hr", departmentKey: "HR", bezeichnung: "Jobticket" }),
      position({ id: "werk", departmentKey: "WERKSTATT", bezeichnung: "Werkbank" }),
      position({ id: "fac-b", departmentKey: "FACILITY", bezeichnung: "Spind", orderIndex: 5 }),
      position({ id: "fac-a", departmentKey: "FACILITY", bezeichnung: "Parkplatz", orderIndex: 5 }),
      position({ id: "fac-0", departmentKey: "FACILITY", bezeichnung: "Zentrale", orderIndex: 0 }),
      position({ id: "it", departmentKey: "IT" }),
    ]);
    expect(ids(sortiert)).toEqual(["it", "fac-0", "fac-a", "fac-b", "werk", "hr"]);
  });

  it("aendert die Eingabe nicht", () => {
    const liste = [position({ id: "b", orderIndex: 2 }), position({ id: "a", orderIndex: 1 })];
    nachStelleSortiert(liste);
    expect(ids(liste)).toEqual(["b", "a"]);
  });
});

describe("katalogWerte", () => {
  it("nimmt genau die Felder der Positivliste, ohne ID, Stufe-2-Felder und vorschlagSchluessel", () => {
    const zeile = {
      ...auswahl(),
      vorschlagSchluessel: "FACILITY_SCHLUESSEL",
      ausgabeKennung: "Schlüsselnummer",
      rueckgabeKategorie: "SCHLUESSEL",
      beiAustritt: "RUECKGABE",
      createdAt: new Date("2026-10-01T08:00:00Z"),
    };
    const werte = katalogWerte(zeile);
    expect(Object.keys(werte).sort()).toEqual([...KATALOG_FELDER].sort());
    expect(werte).toMatchObject({ departmentKey: "FACILITY", art: "AUSWAHL", isActive: true, orderIndex: 0 });
  });

  it("kopiert die Listen (keine geteilte Liste mit der Zeile)", () => {
    const zeile = auswahl();
    const werte = katalogWerte(zeile);
    expect(werte.optionen).toEqual(zeile.optionen);
    expect(werte.optionen).not.toBe(zeile.optionen);
    expect(werte.personengruppen).not.toBe(zeile.personengruppen);
  });
});

describe("katalogAenderungen", () => {
  const bisher = auswahl({ personengruppen: ["STANDARD", "BEAMTE"], defaultDueDays: -3 });

  it("nur Felder, die sich wirklich aendern, mit von/nach", () => {
    const { daten, aenderungen } = katalogAenderungen(bisher, {
      bezeichnung: "Schlüssel",
      optionen: ["Haupteingang", "Lehrerzimmer", "Fachraum Chemie", "Sporthalle"],
      defaultDueDays: -5,
      isActive: false,
    });
    expect(daten).toEqual({
      optionen: ["Haupteingang", "Lehrerzimmer", "Fachraum Chemie", "Sporthalle"],
      defaultDueDays: -5,
      isActive: false,
    });
    expect(aenderungen).toEqual({
      optionen: {
        von: ["Haupteingang", "Lehrerzimmer", "Fachraum Chemie"],
        nach: ["Haupteingang", "Lehrerzimmer", "Fachraum Chemie", "Sporthalle"],
      },
      defaultDueDays: { von: -3, nach: -5 },
      isActive: { von: true, nach: false },
    });
  });

  it("ohne echte Aenderung leer: gleiche Werte, gleiche Listen, undefined = unveraendert", () => {
    expect(
      katalogAenderungen(bisher, {
        bezeichnung: "Schlüssel",
        optionen: ["Haupteingang", "Lehrerzimmer", "Fachraum Chemie"],
        personengruppen: ["STANDARD", "BEAMTE"],
        hinweisStelle: null,
        aufgabeTitel: undefined,
      }),
    ).toEqual({ daten: {}, aenderungen: {} });
  });

  it("Leeren zaehlt als Aenderung (Text → null, Liste → leer)", () => {
    const { aenderungen } = katalogAenderungen(
      { ...bisher, hinweisStelle: "Erst nach Unterweisung." },
      { hinweisStelle: null, personengruppen: [] },
    );
    expect(aenderungen).toEqual({
      hinweisStelle: { von: "Erst nach Unterweisung.", nach: null },
      personengruppen: { von: ["STANDARD", "BEAMTE"], nach: [] },
    });
  });

  it("eine andere Reihenfolge der Optionen ist eine Aenderung (so erscheinen sie im Formular)", () => {
    const { daten } = katalogAenderungen(bisher, { optionen: ["Lehrerzimmer", "Haupteingang", "Fachraum Chemie"] });
    expect(daten).toEqual({ optionen: ["Lehrerzimmer", "Haupteingang", "Fachraum Chemie"] });
  });

  it("Felder ausserhalb der Positivliste werden uebergangen", () => {
    const aenderung = { vorschlagSchluessel: "X", ausgabeKennung: "Inventarnummer", id: "fremd" } as unknown as Parameters<
      typeof katalogAenderungen
    >[1];
    expect(katalogAenderungen(bisher, aenderung)).toEqual({ daten: {}, aenderungen: {} });
  });
});

describe("katalogStellen", () => {
  it("feste Link-Stellen, eigene Schluessel aus den Einstellungen und aus Positionen, HR zuletzt; nie MITARBEITER/VORGESETZTER", () => {
    const stellen = katalogStellen(
      [
        konfig({ departmentKey: "IT", departmentName: "IT-Support FES" }),
        konfig({ departmentKey: "WERKSTATT", departmentName: "Werkstatt GYM", organizationId: GYM }),
        konfig({ departmentKey: "VORGESETZTER", departmentName: "Vorgesetzter" }),
        konfig({ departmentKey: "MITARBEITER", departmentName: "Mitarbeiter" }),
        konfig({ departmentKey: "Freitext", departmentName: "Freitext" }),
      ],
      [position({ departmentKey: "KANTINE" }), position({ departmentKey: "VORGESETZTER" })],
    );
    expect(stellen.map((s) => s.key)).toEqual([
      "IT",
      "VERWALTUNG",
      "FACILITY",
      "BUCHHALTUNG",
      "DSB",
      "KANTINE",
      "WERKSTATT",
      "HR",
    ]);
  });

  it("Name: zentraler Eintrag vor dem einer Einrichtung, sonst das Label; HR immer mit Label", () => {
    const namen = Object.fromEntries(
      katalogStellen(
        [
          konfig({ departmentKey: "FACILITY", departmentName: "Hausmeister GYM", organizationId: GYM }),
          konfig({ departmentKey: "FACILITY", departmentName: "Gebäudewirtschaft", organizationId: null }),
          konfig({ departmentKey: "WERKSTATT", departmentName: "Werkstatt B", organizationId: GS }),
          konfig({ departmentKey: "WERKSTATT", departmentName: "Werkstatt A", organizationId: GYM }),
          konfig({ departmentKey: "HR", departmentName: "Altzeile HR" }),
        ],
        [],
      ).map((s) => [s.key, s.name]),
    );
    expect(namen.FACILITY).toBe("Gebäudewirtschaft");
    expect(namen.WERKSTATT).toBe("Werkstatt A");
    expect(namen.DSB).toBe(DEPARTMENT_LABELS.DSB);
    expect(namen.HR).toBe(DEPARTMENT_LABELS.HR);
  });
});

describe("freigabeWarnungen", () => {
  const einrichtungen: KatalogEinrichtung[] = [
    { id: GYM, name: "Gymnasium Minden", type: "GYMNASIUM", isActive: true },
    { id: KITA, name: "Kita Minden", type: "KITA", isActive: false },
  ];
  const nurCredo = (email: string) => email.toLowerCase().endsWith("@credo.de");
  const konfigs = [
    konfig({ departmentKey: "IT", departmentName: "IT-Support FES", email: "it@extern.de" }),
    konfig({ departmentKey: "IT", departmentName: "IT Gymnasium", email: "it-gym@credo.de", organizationId: GYM }),
    konfig({ departmentKey: "FACILITY", departmentName: "Hausmeister GYM", email: " hm@extern.de ", organizationId: GYM }),
    konfig({ departmentKey: "FACILITY", departmentName: "Hausmeister Kita", email: "hm-kita@extern.de", organizationId: KITA }),
    konfig({ departmentKey: "VERWALTUNG", departmentName: "Sekretariat", email: "sek@extern.de", isActive: false }),
    konfig({ departmentKey: "DSB", departmentName: "Datenschutz", email: "dsb@extern.de" }),
  ];

  it("aktive Eintraege der Stellen des Katalogs, deren Adresse nicht freigegeben ist", () => {
    const warnungen = freigabeWarnungen(
      [
        position({ departmentKey: "FACILITY" }),
        position({ departmentKey: "IT", isActive: false }),
        position({ departmentKey: "VERWALTUNG" }),
        position({ departmentKey: "HR" }),
      ],
      konfigs,
      einrichtungen,
      nurCredo,
    );
    // IT zentral ja (auch ausgeschaltete Positionen zaehlen), IT GYM freigegeben, FACILITY GYM ja,
    // FACILITY Kita (inaktive Einrichtung) nein, VERWALTUNG inaktiv nein, DSB ohne Position nein.
    expect(warnungen.map((w) => [w.departmentKey, w.organizationId, w.email])).toEqual([
      ["IT", null, "it@extern.de"],
      ["FACILITY", GYM, "hm@extern.de"],
    ]);
    expect(warnungen[0]).toEqual({
      departmentKey: "IT",
      stelleName: "IT-Support FES",
      email: "it@extern.de",
      organizationId: null,
      einrichtung: null,
      text: "IT-Support FES (zentral): Die Adresse it@extern.de steht nicht auf der Freigabeliste. Aufgaben gehen trotzdem dorthin – bitte Adresse oder Freigabeliste prüfen.",
    });
    expect(warnungen[1].text).toMatch(/^Hausmeister GYM \(Gymnasium Minden\): Die Adresse hm@extern\.de /);
  });

  it("alles freigegeben (leere Liste) → keine Warnung; ohne Positionen → keine Warnung", () => {
    expect(freigabeWarnungen([position({ departmentKey: "IT" })], konfigs, einrichtungen, () => true)).toEqual([]);
    expect(freigabeWarnungen([], konfigs, einrichtungen, () => false)).toEqual([]);
  });

  it("die Fuehrungskraft hat keinen Eintrag, ein Altzeilen-Eintrag VORGESETZTER warnt nie", () => {
    expect(
      freigabeWarnungen(
        [position({ departmentKey: "VORGESETZTER" })],
        [konfig({ departmentKey: "VORGESETZTER", email: "chef@extern.de" })],
        einrichtungen,
        () => false,
      ),
    ).toEqual([]);
  });
});

describe("vorschlaegeMeldung", () => {
  it("nennt Anzahl, Zustand und was schon da war", () => {
    expect(vorschlaegeMeldung(15, 0)).toBe(
      "15 Vorschläge übernommen – ausgeschaltet. Bitte prüfen, Fälligkeiten eintragen und einschalten, was passt.",
    );
    expect(vorschlaegeMeldung(1, 14)).toBe(
      "1 Vorschlag übernommen – ausgeschaltet. Bitte prüfen, Fälligkeiten eintragen und einschalten, was passt. 14 standen schon im Katalog.",
    );
    expect(vorschlaegeMeldung(2, 1)).toMatch(/ 1 stand schon im Katalog\.$/);
    expect(vorschlaegeMeldung(0, 15)).toBe(MELDUNGEN.VORSCHLAEGE_ALLE_VORHANDEN);
  });
});

// =============================================
// Katalogseite: Zeilen, Filter, Hinweise (S4)
// =============================================

describe("Katalogseite (S4)", () => {
  const E_GYM: KatalogEinrichtung = { id: GYM, name: "Gymnasium Minden", type: "GYMNASIUM", isActive: true };
  const E_GS: KatalogEinrichtung = { id: GS, name: "Grundschule Haddenhausen", type: "GRUNDSCHULE", isActive: true };
  const E_KITA: KatalogEinrichtung = { id: KITA, name: "Kita Espelkamp", type: "KITA", isActive: true };
  const EINRICHTUNGEN = [E_GYM, E_GS, E_KITA];

  function eintrag(
    p: KatalogPosition,
    teil: { ausblendungen?: string[]; verwendung?: number } = {},
  ): KatalogEintrag {
    return {
      ...p,
      ausblendungen: (teil.ausblendungen ?? []).map((organizationId) => ({ organizationId })),
      verwendung: teil.verwendung ?? 0,
    };
  }

  const IPAD = eintrag(
    position({
      id: "p-ipad",
      personengruppen: ["STANDARD", "BEAMTE"],
      bemerkungPlatzhalter: "Stift, Hülle, Apps",
    }),
  );
  const ZUGAENGE = eintrag(
    position({
      id: "p-zugaenge",
      art: "AUSWAHL",
      bezeichnung: "Zugänge",
      optionen: ["Dienst-E-Mail", "Schulportal", "WebUntis", "Schulverwaltung", "Drucker-PIN"],
      vorausgewaehlteOptionen: ["Dienst-E-Mail"],
      aufgabeTitel: "Zugang einrichten",
      einrichtungsarten: ["GYMNASIUM", "GESAMTSCHULE"],
      defaultDueDays: -7,
      orderIndex: 10,
    }),
  );
  const KITA_TABLET = eintrag(
    position({
      id: "p-kita-tablet",
      bezeichnung: "Kita-Tablet",
      einrichtungsarten: ["KITA"],
      isActive: false,
      defaultDueDays: 3,
      orderIndex: 20,
    }),
    { verwendung: 2 },
  );
  const KOPIERKARTE = eintrag(
    position({ id: "p-kopier", departmentKey: "VERWALTUNG", bezeichnung: "Kopierkarte", defaultDueDays: 0 }),
    { ausblendungen: [GYM] },
  );
  const SCHLUESSEL = eintrag(
    auswahl({ id: "p-schluessel", organizationId: GYM, optionen: ["Haupteingang", "Lehrerzimmer"], defaultDueDays: -3 }),
  );
  const FAECHER = eintrag(
    angabe({ id: "p-faecher", sichtbarFuer: ["IT"], personengruppen: ["STANDARD", "BEAMTE"] }),
  );
  const GARDEROBE = eintrag(
    position({
      id: "p-garderobe",
      departmentKey: "FACILITY",
      bezeichnung: "Garderobe",
      organizationId: GS,
      bemerkungAnbieten: false,
      defaultDueDays: null,
    }),
  );
  const POSITIONEN = nachStelleSortiert([IPAD, ZUGAENGE, KITA_TABLET, KOPIERKARTE, SCHLUESSEL, FAECHER, GARDEROBE]);

  const KONFIGS = [
    konfig({ departmentKey: "IT", departmentName: "IT-Support FES", email: "it@credo.de", organizationId: GYM }),
    konfig({ departmentKey: "VERWALTUNG", departmentName: "Sekretariat", email: "sek@extern.de" }),
    konfig({ departmentKey: "FACILITY", departmentName: "Hausmeister", email: "hm@credo.de" }),
    konfig({ departmentKey: "FACILITY", departmentName: "Hausmeister GS", email: "hm-gs@extern.de", organizationId: GS }),
  ];
  const PUNKTE: KatalogVorlagenpunkt[] = [
    { id: "t1", templateId: "vorlage-1", templateName: "Onboarding Lehrkräfte", defaultAssignee: "FACILITY", title: "Schlüssel bereitlegen" },
  ];
  const STELLEN = [
    { key: "IT", name: "IT-Support FES" },
    { key: "VERWALTUNG", name: "Sekretariat" },
    { key: "FACILITY", name: "Hausmeister" },
    { key: "HR", name: "Personalabteilung" },
  ];

  function daten(positionen: KatalogEintrag[] = POSITIONEN): KatalogUebersicht {
    return {
      positionen,
      einrichtungen: EINRICHTUNGEN,
      stellen: STELLEN,
      warnungen: {
        adressLuecken: adressLuecken(positionen, EINRICHTUNGEN, KONFIGS),
        aehnlicheVorlagenpunkte: aehnlicheVorlagenpunkte(positionen, PUNKTE),
        ausserhalbFreigabe: freigabeWarnungen(positionen, KONFIGS, EINRICHTUNGEN, (e) => e.endsWith("@credo.de")),
      },
    };
  }

  const ALLE = { stelle: "", einrichtungId: "" };
  const zeile = (zeilen: ReturnType<typeof katalogZeilen>, id: string) => {
    const z = zeilen.find((x) => x.id === id);
    if (!z) throw new Error(`Zeile ${id} fehlt`);
    return z;
  };

  describe("faelligText", () => {
    it("Tage relativ zum Vertragsbeginn mit echtem Minuszeichen, ohne Faelligkeit und bei Angaben „—“", () => {
      expect(faelligText(-5)).toBe("−5");
      expect(faelligText(0)).toBe("0");
      expect(faelligText(3)).toBe("+3");
      expect(faelligText(null)).toBe("—");
      expect(faelligText(undefined)).toBe("—");
      expect(faelligText(-5, "ANGABE")).toBe("—");
    });
  });

  it("ART_NAMEN nennt jede Art", () => {
    expect(Object.keys(ART_NAMEN).sort()).toEqual([...AUSSTATTUNG_ARTEN].sort());
    expect(ART_NAMEN.JA_NEIN).toBe("Ja/Nein");
  });

  describe("katalogZeilen", () => {
    it("ohne Filter alle Positionen in der Reihenfolge der Antwort, Spalten fertig", () => {
      const zeilen = katalogZeilen(daten(), ALLE);
      expect(ids(zeilen)).toEqual(ids(POSITIONEN));
      expect(zeile(zeilen, "p-ipad")).toMatchObject({
        bezeichnung: "Dienst-iPad (Lernmittel)",
        artName: "Ja/Nein",
        stelleName: "IT-Support FES",
        zentral: true,
        giltFuer: "Zentral",
        faellig: "−5",
        status: "AKTIV",
        statusText: "Aktiv",
        ausgeblendetHier: null,
      });
      expect(zeile(zeilen, "p-schluessel")).toMatchObject({
        artName: "Auswahl",
        stelleName: "Hausmeister",
        zentral: false,
        giltFuer: "Gymnasium Minden",
        faellig: "−3",
      });
      expect(zeile(zeilen, "p-kita-tablet")).toMatchObject({ status: "AUS", statusText: "Aus", faellig: "+3" });
    });

    it("die kleine Zeile nennt Optionen, Vorauswahl, Aufgabe, Bemerkung, Geltung, Ausblendung und Verwendung", () => {
      const zeilen = katalogZeilen(daten(), ALLE);
      expect(zeile(zeilen, "p-ipad").details).toEqual(['Bemerkung: „Stift, Hülle, Apps“', "nur Angestellte, Beamte"]);
      expect(zeile(zeilen, "p-zugaenge").details).toEqual([
        "5 Optionen: Dienst-E-Mail, Schulportal, WebUntis, Schulverwaltung, Drucker-PIN",
        "„Dienst-E-Mail“ vorausgewählt",
        "Aufgabe: „Zugang einrichten“",
        "nur Gymnasium, Gesamtschule",
      ]);
      expect(zeile(zeilen, "p-faecher")).toMatchObject({
        artName: "Angabe",
        faellig: "—",
        details: ["sehen auch: IT-Support FES", "nur Angestellte, Beamte"],
      });
      expect(zeile(zeilen, "p-kopier").details).toEqual(["ausgeblendet für Gymnasium Minden"]);
      expect(zeile(zeilen, "p-kita-tablet").details).toEqual(["nur Kita", "in 2 Vorgängen gewählt"]);
      expect(zeile(zeilen, "p-garderobe").details).toEqual(["ohne Bemerkung"]);
    });

    it("Filter Stelle zeigt nur deren Positionen", () => {
      expect(ids(katalogZeilen(daten(), { stelle: "FACILITY", einrichtungId: "" })).sort()).toEqual([
        "p-faecher",
        "p-garderobe",
        "p-schluessel",
      ]);
    });

    it("Filter Einrichtung: eigene Positionen und zentrale mit passender Art, ausgeblendete mit „Ausgeblendet hier“", () => {
      const zeilen = katalogZeilen(daten(), { stelle: "", einrichtungId: GYM });
      expect(ids(zeilen).sort()).toEqual(["p-faecher", "p-ipad", "p-kopier", "p-schluessel", "p-zugaenge"]);
      expect(zeile(zeilen, "p-kopier")).toMatchObject({
        status: "AUSGEBLENDET",
        statusText: "Ausgeblendet hier",
        ausgeblendetHier: true,
        details: ["für Gymnasium Minden ausgeblendet"],
      });
      expect(zeile(zeilen, "p-ipad").ausgeblendetHier).toBe(false);
      // Eine Position der Einrichtung kennt kein Ausblenden — sie wird ausgeschaltet.
      expect(zeile(zeilen, "p-schluessel").ausgeblendetHier).toBeNull();
    });

    it("Filter Einrichtung nimmt die Art der Einrichtung: Kita-Position nur bei der Kita", () => {
      expect(ids(katalogZeilen(daten(), { stelle: "", einrichtungId: KITA })).sort()).toEqual([
        "p-faecher",
        "p-ipad",
        "p-kita-tablet",
        "p-kopier",
      ]);
    });

    it("ausgeschaltet und hier ausgeblendet", () => {
      const aus = eintrag({ ...KOPIERKARTE, isActive: false }, { ausblendungen: [GYM] });
      const zeilen = katalogZeilen(daten([aus]), { stelle: "", einrichtungId: GYM });
      expect(zeilen[0]).toMatchObject({ status: "AUSGEBLENDET", statusText: "Aus, hier ausgeblendet", isActive: false });
    });

    it("eine unbekannte Einrichtung filtert nicht", () => {
      expect(ids(katalogZeilen(daten(), { stelle: "", einrichtungId: "org-weg" }))).toEqual(ids(POSITIONEN));
    });

    it("Warnungen je Zeile: Adresslücken (Stelle wie in der Spalte, ab zwei Einrichtungen zusammengefasst) und ähnliche Vorlagenpunkte", () => {
      // Die Luecke selbst kennt am Ort ohne Eintrag nur das Label des Schluessels.
      expect(daten().warnungen.adressLuecken.map((l) => l.stelleName)).toEqual(["IT-Abteilung", "IT-Abteilung"]);
      const ohne = katalogZeilen(daten(), ALLE);
      expect(zeile(ohne, "p-ipad").warnungen).toEqual([
        {
          ton: "rot",
          text: "Fehlt an 2 Einrichtungen im Formular, weil IT-Support FES dort keine aktive Adresse hat: Grundschule Haddenhausen, Kita Espelkamp.",
        },
      ]);
      expect(zeile(ohne, "p-schluessel").warnungen).toEqual([
        { ton: "gelb", text: expect.stringContaining("„Schlüssel bereitlegen“ klingt nach „Schlüssel“") },
      ]);
      expect(zeile(ohne, "p-zugaenge").warnungen).toEqual([]);

      const gs = katalogZeilen(daten(), { stelle: "", einrichtungId: GS });
      expect(zeile(gs, "p-ipad").warnungen).toEqual([
        {
          ton: "rot",
          text: "Fehlt in Grundschule Haddenhausen im Formular: IT-Support FES hat dort keine aktive Adresse.",
        },
      ]);
      expect(zeile(katalogZeilen(daten(), { stelle: "", einrichtungId: GYM }), "p-ipad").warnungen).toEqual([]);
    });
  });

  describe("katalogHinweise", () => {
    it("ohne Filter: Adresslücken je Stelle (rot), dann ähnliche Vorlagenpunkte und Freigabeliste (gelb)", () => {
      const hinweise = katalogHinweise(daten(), ALLE);
      expect(hinweise.map((h) => h.ton)).toEqual(["rot", "gelb", "gelb", "gelb"]);
      expect(hinweise[0].text).toBe(
        "Keine aktive Adresse für IT-Support FES in Grundschule Haddenhausen, Kita Espelkamp: 1 Position fehlt dort im Formular. Bitte unter „Abteilungen“ eine Adresse eintragen oder aktivieren.",
      );
      expect(hinweise[1].text).toBe(
        "1 Punkt einer Checklisten-Vorlage klingt nach einer Position dieses Katalogs – die Stelle bekäme zwei Aufgaben. Die Zeilen nennen Vorlage und Punkt.",
      );
      expect(hinweise[2].text).toContain("Sekretariat (zentral): Die Adresse sek@extern.de steht nicht auf der Freigabeliste.");
      expect(hinweise[3].text).toContain("Hausmeister GS (Grundschule Haddenhausen): Die Adresse hm-gs@extern.de");
    });

    it("zaehlt die Positionen je Stelle", () => {
      const zweites = eintrag(position({ id: "p-laptop", bezeichnung: "Dienst-Laptop/PC" }));
      const hinweise = katalogHinweise(daten([...POSITIONEN, zweites]), ALLE);
      expect(hinweise[0].text).toContain(": 2 Positionen fehlen dort im Formular.");
    });

    it("Filter Stelle: nur deren Lücken, Treffer und Adressen", () => {
      const facility = katalogHinweise(daten(), { stelle: "FACILITY", einrichtungId: "" });
      expect(facility.map((h) => h.ton)).toEqual(["gelb", "gelb"]);
      expect(facility[1].text).toContain("hm-gs@extern.de");
      expect(katalogHinweise(daten(), { stelle: "IT", einrichtungId: "" }).map((h) => h.ton)).toEqual(["rot"]);
    });

    it("Filter Einrichtung: Lücken nur dort, Adressen zentral und der Einrichtung", () => {
      const gym = katalogHinweise(daten(), { stelle: "", einrichtungId: GYM });
      expect(gym.map((h) => h.ton)).toEqual(["gelb", "gelb"]);
      expect(gym[1].text).toContain("sek@extern.de");
      const gs = katalogHinweise(daten(), { stelle: "", einrichtungId: GS });
      expect(gs[0]).toEqual({
        ton: "rot",
        text: "Keine aktive Adresse für IT-Support FES in Grundschule Haddenhausen: 1 Position fehlt dort im Formular. Bitte unter „Abteilungen“ eine Adresse eintragen oder aktivieren.",
      });
      // Der Treffer gehoert zu einer Position des Gymnasiums und steht deshalb bei der Grundschule nicht.
      expect(gs.some((h) => h.text.includes("Checklisten-Vorlage"))).toBe(false);
    });

    it("leerer Katalog: keine Hinweise", () => {
      expect(katalogHinweise(daten([]), ALLE)).toEqual([]);
    });
  });

  describe("vorschlaegeVorschau", () => {
    it("alle Vorschläge nach Stelle, Namen aus den Einstellungen, sonst das Label", () => {
      const { gruppen, fehlen } = vorschlaegeVorschau([], [{ key: "IT", name: "IT-Support FES" }]);
      expect(fehlen).toBe(VORSCHLAEGE.length);
      expect(gruppen.map((g) => g.departmentKey)).toEqual(["IT", "FACILITY", "VERWALTUNG"]);
      expect(gruppen.map((g) => g.stelleName)).toEqual([
        "IT-Support FES",
        DEPARTMENT_LABELS.FACILITY,
        DEPARTMENT_LABELS.VERWALTUNG,
      ]);
      expect(gruppen.flatMap((g) => g.eintraege).map((e) => e.vorschlagSchluessel)).toEqual(
        VORSCHLAEGE.map((v) => v.vorschlagSchluessel),
      );
      expect(gruppen[0].eintraege.find((e) => e.vorschlagSchluessel === "IT_ZUGAENGE")).toEqual({
        vorschlagSchluessel: "IT_ZUGAENGE",
        bezeichnung: "Zugänge",
        artName: "Auswahl",
        vorhanden: false,
        hinweis: null,
      });
    });

    it("trägt den Pflegehinweis eines Vorschlags (Schlüssel: Räume je Einrichtung) in die Vorschau", () => {
      const { gruppen } = vorschlaegeVorschau([], []);
      const eintraege = gruppen.flatMap((g) => g.eintraege);
      expect(eintraege.find((e) => e.vorschlagSchluessel === "FACILITY_SCHLUESSEL")?.hinweis).toBe(
        "Räume einer Einrichtung bitte als eigene Position dieser Einrichtung anlegen.",
      );
      expect(eintraege.filter((e) => e.hinweis !== null).map((e) => e.vorschlagSchluessel)).toEqual(["FACILITY_SCHLUESSEL"]);
    });

    it("markiert, was schon im Katalog steht (auch geändert), und zählt den Rest", () => {
      const { gruppen, fehlen } = vorschlaegeVorschau(
        [{ vorschlagSchluessel: "IT_IPAD" }, { vorschlagSchluessel: null }, {}],
        [],
      );
      expect(fehlen).toBe(VORSCHLAEGE.length - 1);
      const alle = gruppen.flatMap((g) => g.eintraege);
      expect(alle.filter((e) => e.vorhanden).map((e) => e.vorschlagSchluessel)).toEqual(["IT_IPAD"]);
      expect(
        vorschlaegeVorschau(
          VORSCHLAEGE.map((v) => ({ vorschlagSchluessel: v.vorschlagSchluessel })),
          [],
        ).fehlen,
      ).toBe(0);
    });
  });
});

// =============================================
// Arbeitsort am Vorgang (S5, E-A10)
// =============================================

describe("arbeitsortSpeicherwert", () => {
  it("gleich der Einrichtung heisst „wie Einrichtung“ und wird null", () => {
    expect(arbeitsortSpeicherwert(GYM, GYM)).toBeNull();
    expect(arbeitsortSpeicherwert(GYM, ` ${GYM} `)).toBeNull();
  });

  it("nichts gewaehlt (fehlt, null, leer, Leerzeichen) wird null", () => {
    expect(arbeitsortSpeicherwert(GYM, undefined)).toBeNull();
    expect(arbeitsortSpeicherwert(GYM, null)).toBeNull();
    expect(arbeitsortSpeicherwert(GYM, "")).toBeNull();
    expect(arbeitsortSpeicherwert(GYM, "   ")).toBeNull();
  });

  it("ein abweichender Arbeitsort wird getrimmt gespeichert", () => {
    expect(arbeitsortSpeicherwert(GYM, GS)).toBe(GS);
    expect(arbeitsortSpeicherwert(GYM, `  ${GS}`)).toBe(GS);
  });
});

describe("arbeitsortSperrGrund", () => {
  it("ohne Link und ohne HR-Status laesst sich der Arbeitsort aendern", () => {
    expect(arbeitsortSperrGrund({ linkErzeugt: false, hrStatus: false })).toBeNull();
  });

  it("sperrt, sobald der Modalitaeten-Link erzeugt ist (E-A10)", () => {
    expect(arbeitsortSperrGrund({ linkErzeugt: true, hrStatus: false })).toBe(MELDUNGEN.ARBEITSORT_LINK_ERZEUGT);
  });

  it("sperrt bei einem HR-Status, auch ohne Link — der HR-Status geht als Grund vor", () => {
    expect(arbeitsortSperrGrund({ linkErzeugt: false, hrStatus: true })).toBe(MELDUNGEN.ARBEITSORT_VORGANG_GEPRUEFT);
    expect(arbeitsortSperrGrund({ linkErzeugt: true, hrStatus: true })).toBe(MELDUNGEN.ARBEITSORT_VORGANG_GEPRUEFT);
  });
});

// =============================================
// Grenzen, Meldungen, Reinheit
// =============================================

describe("Grenzen und Meldungen", () => {
  it("REIHENFOLGE_MAX haelt die Ausstattungsaufgaben vor den Hinweis-Aufgaben", () => {
    expect(ORDER_BASIS + REIHENFOLGE_MAX * 100 + GRENZEN.optionen).toBeLessThan(HINWEIS_ORDER_BASIS);
  });

  it("jede Meldung ist ein nicht leerer Satz, die Grenzen stehen darin", () => {
    for (const [schluessel, text] of Object.entries(MELDUNGEN)) {
      expect(`${schluessel}: ${text.trim().length > 0}`).toBe(`${schluessel}: true`);
    }
    expect(MELDUNGEN.BEZEICHNUNG_ZU_LANG).toContain(String(GRENZEN.bezeichnung));
    expect(MELDUNGEN.OPTIONEN_ZU_VIELE).toContain(String(GRENZEN.optionen));
    expect(MELDUNGEN.REIHENFOLGE_UNGUELTIG).toContain(String(REIHENFOLGE_MAX));
    for (const s of ANGABE_SCHLUESSEL) expect(MELDUNGEN.ANGABE_UNBEKANNT).toContain(ANGABEN_KATALOG[s].label);
  });
});

describe("Reinheit der Datei", () => {
  const quelle = (datei: string) => fs.readFileSync(path.join(process.cwd(), datei), "utf8");

  it("ausstattung.ts importiert weder Prisma noch die Datenbank noch Node-Module (client-sicher)", () => {
    const importe = [...quelle("src/lib/ausstattung.ts").matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(importe.sort()).toEqual(["@/lib/abteilungsaufgaben", "@/lib/constants"]);
  });

  it("abteilungsaufgaben.ts importiert ausstattung.ts nicht (kein Kreis)", () => {
    expect(quelle("src/lib/abteilungsaufgaben.ts")).not.toMatch(/from\s+"@\/lib\/ausstattung"/);
  });
});
