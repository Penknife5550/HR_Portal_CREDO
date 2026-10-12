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
 * Feinplan S8: die Momentaufnahme, die Herkunft der Bemerkung
 * (bemerkungQuelleNach), die Pruefung der Wahl der Fuehrungskraft gegen den
 * Ausschnitt (wahlPruefen) und ihre Sicht im Formular (fuehrungskraftSicht) —
 * beide aus demselben Angebot.
 *
 * Feinplan S9: der Formularschritt — Startzustand mit Vorauswahl
 * (formularStartStand), Body des PUT (formularEingabe, Gegenprobe gegen
 * wahlPruefen), Kurzform der Zusammenfassung (formularKurzform) und der Stand
 * nach dem Speichern (sichtNachSpeichern, Gegenprobe gegen die Sicht, die der
 * Server danach liefern wuerde).
 *
 * Feinplan S10: HR liest mit — die Kurzform der HR-Mail (ausstattungKurz),
 * die Herkunftstexte (bemerkungLabel, hinweisLabel), die Gruppen fuer Karte
 * und PDF (ausstattungsGruppen) und die Uebersicht samt Zustandsregel als
 * Matrix (ausstattungsZustand, ausstattungsUebersichtBauen).
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
  AENDERUNGEN_NACH_ABGABE_HINWEIS,
  AUSSTATTUNG_ENDSTATUS,
  ANGABE_SCHLUESSEL,
  ANGABEN_KATALOG,
  ART_NAMEN,
  AUSSTATTUNG_ARTEN,
  AUSSTATTUNG_QUELLEN,
  BEMERKUNG_HINWEIS,
  BEMERKUNG_QUELLEN,
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
  ausstattungKurz,
  ausstattungsGruppen,
  ausstattungsUebersichtBauen,
  ausstattungsZustand,
  bemerkungLabel,
  bemerkungQuelleNach,
  hinweisLabel,
  namenAufzaehlen,
  faelligText,
  formularEingabe,
  formularGruppen,
  formularHinweis,
  formularKurzform,
  formularPositionStand,
  formularStartStand,
  freigabeWarnungen,
  fuehrungskraftSicht,
  KURZFORM_HINWEIS,
  sichtNachSpeichern,
  istAngabeSchluessel,
  istAusstattungsArt,
  istNichtErlaubteStelle,
  katalogAenderungen,
  katalogHinweise,
  katalogStellen,
  katalogWerte,
  katalogZeilen,
  momentaufnahme,
  nachStelleSortiert,
  positionGiltAm,
  positionPruefen,
  positionenFuer,
  vorschlaegeMeldung,
  vorschlaegeVorschau,
  wahlPruefen,
  type BestehendeFuehrungskraftWahl,
  type BestehendeWahl,
  type FormularStand,
  type FuehrungskraftSicht,
  type KatalogEinrichtung,
  type KatalogEintrag,
  type KatalogKontext,
  type KatalogPosition,
  type KatalogUebersicht,
  type KatalogVorlagenpunkt,
  type UebersichtHinweisDaten,
  type UebersichtVorgangStand,
  type UebersichtZeileDaten,
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
// Formular der Fuehrungskraft (S8)
// =============================================

/** Eine eigene, schon gespeicherte Zeile der Fuehrungskraft zu einer Position. */
function eigene(p: KatalogPosition, wahl: Partial<BestehendeWahl> = {}): BestehendeWahl {
  return { ...momentaufnahme(p), auswahl: [], angabe: null, bemerkung: null, ...wahl };
}

const NICHTS: BestehendeFuehrungskraftWahl = { zeilen: [], hinweise: [] };

describe("momentaufnahme", () => {
  it("kopiert die Felder der Position; Aufgabentitel als Grundtitel (Standard „… bereitstellen“)", () => {
    const p = position({ id: "ipad", orderIndex: 30, hinweisStelle: "Mit MDM-Profil ausgeben." });
    expect(momentaufnahme(p)).toEqual({
      positionId: "ipad",
      departmentKey: "IT",
      art: "JA_NEIN",
      angabeSchluessel: null,
      bezeichnung: "Dienst-iPad (Lernmittel)",
      aufgabeTitel: "Dienst-iPad (Lernmittel) bereitstellen",
      hinweisStelle: "Mit MDM-Profil ausgeben.",
      relativeDueDays: -5,
      sichtbarFuer: [],
      ausgabeKennung: null,
      rueckgabeKategorie: null,
      beiAustritt: null,
      reihenfolge: 30,
    });
  });

  it("Auswahl: eigener Aufgabentitel ohne Option — die Option haengt erst die Aufgabe an", () => {
    expect(momentaufnahme(auswahl()).aufgabeTitel).toBe("Schlüssel ausgeben");
    expect(aufgabenTitel(momentaufnahme(auswahl()), "Haupteingang")).toBe("Schlüssel ausgeben: Haupteingang");
  });

  it("Angabe: kein Aufgabentitel, keine Faelligkeit; „Sichtbar für“ bleibt", () => {
    const m = momentaufnahme(angabe({ sichtbarFuer: ["IT"], defaultDueDays: null }));
    expect(m).toMatchObject({ art: "ANGABE", angabeSchluessel: "UNTERRICHTSFAECHER", aufgabeTitel: "", relativeDueDays: null, sichtbarFuer: ["IT"] });
  });

  it("ein leerer Hinweis fuer die Stelle wird null; die Stufe-2-Felder kommen wie sie sind", () => {
    const m = momentaufnahme(position({ hinweisStelle: "   ", ausgabeKennung: "INV-1" }));
    expect(m.hinweisStelle).toBeNull();
    expect(m.ausgabeKennung).toBe("INV-1");
  });

  it("die Listen sind Kopien (keine geteilte Referenz mit dem Katalog)", () => {
    const p = angabe({ sichtbarFuer: ["IT"] });
    const m = momentaufnahme(p);
    m.sichtbarFuer.push("DSB");
    expect(p.sichtbarFuer).toEqual(["IT"]);
  });
});

describe("bemerkungQuelleNach (Regel 8)", () => {
  it("die Fuehrungskraft schreibt: immer FUEHRUNGSKRAFT", () => {
    for (const alt of [null, undefined, ...BEMERKUNG_QUELLEN]) {
      expect(bemerkungQuelleNach(alt, "FUEHRUNGSKRAFT")).toBe("FUEHRUNGSKRAFT");
    }
  });

  it("HR aendert einen Text der Fuehrungskraft: BEIDE", () => {
    expect(bemerkungQuelleNach("FUEHRUNGSKRAFT", "HR")).toBe("BEIDE");
  });

  it("HR aendert einen schon ergaenzten Text der Fuehrungskraft: bleibt BEIDE", () => {
    expect(bemerkungQuelleNach("BEIDE", "HR")).toBe("BEIDE");
  });

  it("HR schreibt einen neuen Text: HR", () => {
    expect(bemerkungQuelleNach(null, "HR")).toBe("HR");
    expect(bemerkungQuelleNach(undefined, "HR")).toBe("HR");
  });

  it("HR aendert seinen eigenen Text: bleibt HR", () => {
    expect(bemerkungQuelleNach("HR", "HR")).toBe("HR");
  });

  it("liefert nur Werte aus BEMERKUNG_QUELLEN", () => {
    for (const alt of [null, ...BEMERKUNG_QUELLEN]) {
      for (const schreiber of AUSSTATTUNG_QUELLEN) {
        expect(BEMERKUNG_QUELLEN).toContain(bemerkungQuelleNach(alt, schreiber));
      }
    }
  });
});

describe("wahlPruefen (Regel 4)", () => {
  const IPAD = position({ id: "ipad", orderIndex: 10, hinweisStelle: "Mit MDM-Profil ausgeben." });
  const SCHLUESSEL = auswahl({ id: "schluessel", orderIndex: 20 });
  const FAECHER = angabe({ id: "faecher", sichtbarFuer: ["IT"] });
  const DURCHWAHL = position({
    id: "durchwahl",
    art: "ANGABE",
    angabeSchluessel: "DURCHWAHL",
    bezeichnung: "Gewünschte Durchwahl",
    bemerkungAnbieten: false,
    defaultDueDays: null,
  });
  const AUSSCHNITT = [IPAD, SCHLUESSEL, FAECHER, DURCHWAHL];

  function fehler(ergebnis: ReturnType<typeof wahlPruefen>): string | null {
    return ergebnis.ok ? null : ergebnis.fehler;
  }
  function zeilen(ergebnis: ReturnType<typeof wahlPruefen>) {
    if (!ergebnis.ok) throw new Error(`Unerwartet abgewiesen: ${ergebnis.fehler}`);
    return ergebnis.zeilen;
  }

  it("nimmt eine gueltige Wahl an und liefert die Momentaufnahme aus dem Katalog", () => {
    const ergebnis = wahlPruefen(
      {
        ausstattung: [
          { positionId: "ipad", gewaehlt: true, bemerkung: "  Mit Stift  " },
          { positionId: "schluessel", auswahl: ["Lehrerzimmer", "Haupteingang"] },
          { positionId: "faecher", angabe: " Chemie, Sport " },
        ],
      },
      AUSSCHNITT,
      NICHTS,
    );
    expect(zeilen(ergebnis)).toEqual([
      { ...momentaufnahme(IPAD), positionId: "ipad", auswahl: [], angabe: null, bemerkung: "Mit Stift" },
      // Optionen in der Reihenfolge des Katalogs, nicht der Klicks.
      { ...momentaufnahme(SCHLUESSEL), positionId: "schluessel", auswahl: ["Haupteingang", "Lehrerzimmer"], angabe: null, bemerkung: null },
      { ...momentaufnahme(FAECHER), positionId: "faecher", auswahl: [], angabe: "Chemie, Sport", bemerkung: null },
    ]);
    // Der Hinweis fuer die Stelle kommt mit (Momentaufnahme), nie aus dem Formular.
    expect(zeilen(ergebnis)?.[0].hinweisStelle).toBe("Mit MDM-Profil ausgeben.");
  });

  it("ein fehlendes Feld heisst „nichts ersetzen“, ein leeres Array „keine mehr“", () => {
    const ohne = wahlPruefen({}, AUSSCHNITT, NICHTS);
    expect(ohne).toEqual({ ok: true, zeilen: undefined, hinweise: undefined });
    const leer = wahlPruefen({ ausstattung: [], hinweise: [] }, AUSSCHNITT, NICHTS);
    expect(leer).toEqual({ ok: true, zeilen: [], hinweise: [] });
  });

  it("eine Position ausserhalb des Ausschnitts ist ein Fehler", () => {
    expect(fehler(wahlPruefen({ ausstattung: [{ positionId: "fremd", gewaehlt: true }] }, AUSSCHNITT, NICHTS))).toBe(
      MELDUNGEN.WAHL_POSITION_UNBEKANNT,
    );
  });

  it("Position ausserhalb des Ausschnitts, aber in der eigenen Momentaufnahme: erlaubt — Momentaufnahme aus der Zeile", () => {
    // Die Verwaltung hat „Altes iPad“ inzwischen ausgeschaltet.
    const alt = position({ id: "altes-ipad", bezeichnung: "Altes iPad", hinweisStelle: "Aus dem Lager", orderIndex: 5 });
    const bestehend = { zeilen: [eigene(alt, { bemerkung: "Bitte mit Huelle" })], hinweise: [] };
    const ergebnis = wahlPruefen({ ausstattung: [{ positionId: "altes-ipad", gewaehlt: true }] }, AUSSCHNITT, bestehend);
    expect(zeilen(ergebnis)).toEqual([
      { ...momentaufnahme(alt), positionId: "altes-ipad", auswahl: [], angabe: null, bemerkung: null },
    ]);
    // Bemerkung weiter moeglich (das Formular zeigt das Feld — es ist eine gespeichert).
    expect(
      fehler(wahlPruefen({ ausstattung: [{ positionId: "altes-ipad", gewaehlt: true, bemerkung: "x" }] }, AUSSCHNITT, bestehend)),
    ).toBeNull();
  });

  it("Position ausserhalb des Ausschnitts ohne gespeicherte Bemerkung: kein neues Bemerkungsfeld (S8)", () => {
    // Der Katalog bot „Parkplatz“ ohne Bemerkung an; die Verwaltung hat ihn
    // inzwischen ausgeschaltet. Ein Freitextfeld, das sie nie wollte, entsteht
    // dadurch nicht (Datensparsamkeit) — auch nicht, wenn der Katalog das Feld
    // fuer die Position frueher anbot.
    for (const bemerkungAnbieten of [false, true]) {
      const parkplatz = position({ id: "parkplatz", departmentKey: "FACILITY", bezeichnung: "Parkplatz", bemerkungAnbieten });
      const bestehend = { zeilen: [eigene(parkplatz)], hinweise: [] };
      expect(
        fehler(wahlPruefen({ ausstattung: [{ positionId: "parkplatz", gewaehlt: true, bemerkung: "Nr. 7" }] }, AUSSCHNITT, bestehend)),
      ).toBe(MELDUNGEN.WAHL_OHNE_BEMERKUNG);
      expect(fehler(wahlPruefen({ ausstattung: [{ positionId: "parkplatz", gewaehlt: true }] }, AUSSCHNITT, bestehend))).toBeNull();
    }
  });

  describe("eine schon gewaehlte Position, die der Katalog seitdem geaendert hat", () => {
    // Gespeichert als Auswahl bei der IT; heute fuehrt der Katalog dieselbe
    // Position (gleiche ID) anders.
    const ALT = auswahl({ id: "zugaenge", departmentKey: "IT", bezeichnung: "Zugänge", optionen: ["Dienst-E-Mail", "WebUntis"] });
    const bestehend = { zeilen: [eigene(ALT, { auswahl: ["Dienst-E-Mail", "WebUntis"], bemerkung: "als Lehrkraft" })], hinweise: [] };
    const FAELLE: [string, KatalogPosition][] = [
      ["Art", position({ id: "zugaenge", departmentKey: "IT", bezeichnung: "Zugänge" })],
      ["Stelle", { ...ALT, departmentKey: "VERWALTUNG" }],
      ["Bezeichnung", { ...ALT, bezeichnung: "Zugänge (Schule)" }],
    ];

    it.each(FAELLE)("%s geaendert: die gespeicherte Wahl bleibt gueltig — mit der gespeicherten Momentaufnahme", (_, jetzt) => {
      const ergebnis = wahlPruefen(
        { ausstattung: [{ positionId: "zugaenge", auswahl: ["WebUntis", "Dienst-E-Mail"], bemerkung: "als Lehrkraft" }] },
        [jetzt],
        bestehend,
      );
      expect(zeilen(ergebnis)).toEqual([
        { ...momentaufnahme(ALT), positionId: "zugaenge", auswahl: ["Dienst-E-Mail", "WebUntis"], angabe: null, bemerkung: "als Lehrkraft" },
      ]);
    });

    it.each(FAELLE)("%s geaendert: auch eine neue Wahl gilt der gespeicherten Form, nicht der neuen", (art, jetzt) => {
      // Eine Position je Vorgang: Solange die eigene Zeile besteht, ist die
      // neue Form nicht zugleich waehlbar.
      const neueForm = jetzt.art === "JA_NEIN" ? { gewaehlt: true as const } : { auswahl: ["Dienst-E-Mail"] };
      const ergebnis = wahlPruefen({ ausstattung: [{ positionId: "zugaenge", ...neueForm }] }, [jetzt], bestehend);
      if (art === "Art") expect(fehler(ergebnis)).toBe(MELDUNGEN.WAHL_PASST_NICHT);
      else expect(zeilen(ergebnis)?.[0]).toMatchObject({ departmentKey: "IT", bezeichnung: "Zugänge" });
    });

    it("ohne eigene Wahl gilt der Katalog wie immer", () => {
      const jetzt = position({ id: "zugaenge", departmentKey: "IT", bezeichnung: "Zugänge" });
      expect(zeilen(wahlPruefen({ ausstattung: [{ positionId: "zugaenge", gewaehlt: true }] }, [jetzt], NICHTS))).toEqual([
        { ...momentaufnahme(jetzt), positionId: "zugaenge", auswahl: [], angabe: null, bemerkung: null },
      ]);
    });

    it("unsichtbare Aenderungen (Hinweis fuer die Stelle, Faelligkeit, Aufgabentitel, Optionen) frischt jedes Speichern auf", () => {
      const jetzt = {
        ...ALT,
        hinweisStelle: "Erst nach Verpflichtung freischalten.",
        defaultDueDays: -10,
        aufgabeTitel: "Zugang einrichten",
        optionen: ["Dienst-E-Mail", "WebUntis", "Schulportal"],
      };
      const ergebnis = wahlPruefen({ ausstattung: [{ positionId: "zugaenge", auswahl: ["WebUntis"] }] }, [jetzt], bestehend);
      expect(zeilen(ergebnis)?.[0]).toMatchObject({
        hinweisStelle: "Erst nach Verpflichtung freischalten.",
        relativeDueDays: -10,
        aufgabeTitel: "Zugang einrichten",
      });
    });
  });

  it("eine von HR gestrichene eigene Zeile oeffnet nichts", () => {
    const alt = position({ id: "altes-ipad" });
    const bestehend = { zeilen: [eigene(alt, { gestrichenAm: new Date("2027-01-10T10:00:00Z") })], hinweise: [] };
    expect(fehler(wahlPruefen({ ausstattung: [{ positionId: "altes-ipad", gewaehlt: true }] }, [], bestehend))).toBe(
      MELDUNGEN.WAHL_POSITION_UNBEKANNT,
    );
  });

  it("eine fremde Option ist ein Fehler", () => {
    expect(
      fehler(wahlPruefen({ ausstattung: [{ positionId: "schluessel", auswahl: ["Tresor"] }] }, AUSSCHNITT, NICHTS)),
    ).toBe(MELDUNGEN.WAHL_OPTION_UNBEKANNT);
  });

  it("eine Option aus der eigenen Wahl einer inzwischen geaenderten Position bleibt erlaubt", () => {
    // Gespeichert war „Musikraum“; die Verwaltung hat die Option inzwischen gestrichen.
    const bestehend = { zeilen: [eigene(SCHLUESSEL, { auswahl: ["Musikraum", "Haupteingang"] })], hinweise: [] };
    const ergebnis = wahlPruefen(
      { ausstattung: [{ positionId: "schluessel", auswahl: ["Musikraum", "Lehrerzimmer"] }] },
      AUSSCHNITT,
      bestehend,
    );
    // Katalogoptionen zuerst, die alte dahinter.
    expect(zeilen(ergebnis)?.[0].auswahl).toEqual(["Lehrerzimmer", "Musikraum"]);
    // Ohne eigene Wahl waere dieselbe Option fremd.
    expect(
      fehler(wahlPruefen({ ausstattung: [{ positionId: "schluessel", auswahl: ["Musikraum"] }] }, AUSSCHNITT, NICHTS)),
    ).toBe(MELDUNGEN.WAHL_OPTION_UNBEKANNT);
  });

  it("dieselbe Position zweimal ist ein Fehler", () => {
    expect(
      fehler(
        wahlPruefen(
          { ausstattung: [{ positionId: "ipad", gewaehlt: true }, { positionId: "ipad", gewaehlt: true }] },
          AUSSCHNITT,
          NICHTS,
        ),
      ),
    ).toBe(MELDUNGEN.WAHL_POSITION_DOPPELT);
  });

  it("Ja/Nein nur mit gewaehlt: true, ohne Optionen und ohne Angabe", () => {
    expect(fehler(wahlPruefen({ ausstattung: [{ positionId: "ipad" }] }, AUSSCHNITT, NICHTS))).toBe(
      MELDUNGEN.WAHL_NICHT_GEWAEHLT,
    );
    expect(
      fehler(wahlPruefen({ ausstattung: [{ positionId: "ipad", gewaehlt: true, auswahl: ["Haupteingang"] }] }, AUSSCHNITT, NICHTS)),
    ).toBe(MELDUNGEN.WAHL_PASST_NICHT);
    expect(
      fehler(wahlPruefen({ ausstattung: [{ positionId: "ipad", gewaehlt: true, angabe: "x" }] }, AUSSCHNITT, NICHTS)),
    ).toBe(MELDUNGEN.WAHL_PASST_NICHT);
  });

  it("Auswahl nur mit mindestens einer Option; Doppelte fallen weg; kein gewaehlt", () => {
    expect(fehler(wahlPruefen({ ausstattung: [{ positionId: "schluessel", auswahl: [] }] }, AUSSCHNITT, NICHTS))).toBe(
      MELDUNGEN.WAHL_NICHT_GEWAEHLT,
    );
    expect(
      fehler(wahlPruefen({ ausstattung: [{ positionId: "schluessel", gewaehlt: true, auswahl: ["Haupteingang"] }] }, AUSSCHNITT, NICHTS)),
    ).toBe(MELDUNGEN.WAHL_PASST_NICHT);
    const doppelt = wahlPruefen(
      { ausstattung: [{ positionId: "schluessel", auswahl: ["Haupteingang", "Haupteingang"] }] },
      AUSSCHNITT,
      NICHTS,
    );
    expect(zeilen(doppelt)?.[0].auswahl).toEqual(["Haupteingang"]);
  });

  it("Angabe nur mit Text, hoechstens so lang wie ihr Eintrag in ANGABEN_KATALOG, ohne Bemerkung", () => {
    expect(fehler(wahlPruefen({ ausstattung: [{ positionId: "faecher" }] }, AUSSCHNITT, NICHTS))).toBe(
      MELDUNGEN.WAHL_ANGABE_FEHLT,
    );
    expect(fehler(wahlPruefen({ ausstattung: [{ positionId: "faecher", angabe: "   " }] }, AUSSCHNITT, NICHTS))).toBe(
      MELDUNGEN.WAHL_ANGABE_FEHLT,
    );
    const max = ANGABEN_KATALOG.DURCHWAHL.max;
    expect(
      fehler(wahlPruefen({ ausstattung: [{ positionId: "durchwahl", angabe: "1".repeat(max) }] }, AUSSCHNITT, NICHTS)),
    ).toBeNull();
    expect(
      fehler(wahlPruefen({ ausstattung: [{ positionId: "durchwahl", angabe: "1".repeat(max + 1) }] }, AUSSCHNITT, NICHTS)),
    ).toBe(`Die Angabe „Gewünschte Durchwahl“ darf höchstens ${max} Zeichen lang sein.`);
    expect(
      fehler(wahlPruefen({ ausstattung: [{ positionId: "faecher", angabe: "Chemie", bemerkung: "x" }] }, AUSSCHNITT, NICHTS)),
    ).toBe(MELDUNGEN.WAHL_OHNE_BEMERKUNG);
    expect(
      fehler(wahlPruefen({ ausstattung: [{ positionId: "faecher", gewaehlt: true, angabe: "Chemie" }] }, AUSSCHNITT, NICHTS)),
    ).toBe(MELDUNGEN.WAHL_PASST_NICHT);
  });

  it("eine Bemerkung nur, wo das Formular ein Feld zeigt — oder schon eine gespeichert ist", () => {
    const ohneFeld = position({ id: "spind", departmentKey: "FACILITY", bezeichnung: "Spind", bemerkungAnbieten: false });
    expect(
      fehler(wahlPruefen({ ausstattung: [{ positionId: "spind", gewaehlt: true, bemerkung: "Nr. 12" }] }, [ohneFeld], NICHTS)),
    ).toBe(MELDUNGEN.WAHL_OHNE_BEMERKUNG);
    // Eine leere Bemerkung ist keine.
    expect(
      fehler(wahlPruefen({ ausstattung: [{ positionId: "spind", gewaehlt: true, bemerkung: "  " }] }, [ohneFeld], NICHTS)),
    ).toBeNull();
    // Gespeichert, bevor die Verwaltung das Feld abschaltete: bleibt aenderbar.
    const bestehend = { zeilen: [eigene(ohneFeld, { bemerkung: "Nr. 12" })], hinweise: [] };
    expect(
      fehler(wahlPruefen({ ausstattung: [{ positionId: "spind", gewaehlt: true, bemerkung: "Nr. 14" }] }, [ohneFeld], bestehend)),
    ).toBeNull();
  });

  it("Hinweise nur fuer Stellen des Angebots, je Stelle einer; ein leerer Text wird keine Zeile", () => {
    const ok = wahlPruefen(
      { hinweise: [{ departmentKey: "IT", hinweis: " Monitor bitte hoehenverstellbar " }, { departmentKey: "FACILITY", hinweis: "" }] },
      AUSSCHNITT,
      NICHTS,
    );
    expect(ok).toEqual({ ok: true, zeilen: undefined, hinweise: [{ departmentKey: "IT", text: "Monitor bitte hoehenverstellbar" }] });

    // Fuer eine fremde Stelle (hier: ohne Position im Ausschnitt), auch leer.
    expect(fehler(wahlPruefen({ hinweise: [{ departmentKey: "DSB", hinweis: "x" }] }, AUSSCHNITT, NICHTS))).toBe(
      MELDUNGEN.HINWEIS_STELLE_UNBEKANNT,
    );
    expect(fehler(wahlPruefen({ hinweise: [{ departmentKey: "DSB", hinweis: "" }] }, AUSSCHNITT, NICHTS))).toBe(
      MELDUNGEN.HINWEIS_STELLE_UNBEKANNT,
    );
    // Nie an die Fuehrungskraft oder die Person selbst (Regel 11).
    for (const key of NICHT_ERLAUBTE_STELLEN) {
      expect(fehler(wahlPruefen({ hinweise: [{ departmentKey: key, hinweis: "x" }] }, AUSSCHNITT, NICHTS))).toBe(
        MELDUNGEN.HINWEIS_STELLE_UNBEKANNT,
      );
    }
    expect(
      fehler(
        wahlPruefen(
          { hinweise: [{ departmentKey: "IT", hinweis: "a" }, { departmentKey: "IT", hinweis: "b" }] },
          AUSSCHNITT,
          NICHTS,
        ),
      ),
    ).toBe(MELDUNGEN.HINWEIS_DOPPELT);
  });

  it("ein Hinweis an eine Stelle, deren Positionen der Katalog nicht mehr anbietet, bleibt aenderbar", () => {
    const bestehend = { zeilen: [], hinweise: [{ departmentKey: "DSB", text: "Verpflichtung vor dem ersten Tag" }] };
    expect(fehler(wahlPruefen({ hinweise: [{ departmentKey: "DSB", hinweis: "" }] }, AUSSCHNITT, bestehend))).toBeNull();
  });

  it("Hinweise an HR gibt es, wenn HR Positionen im Ausschnitt hat", () => {
    const jobticket = position({ id: "jobticket", departmentKey: "HR", bezeichnung: "Jobticket", entgeltrelevant: true });
    expect(fehler(wahlPruefen({ hinweise: [{ departmentKey: "HR", hinweis: "Ab Februar" }] }, [jobticket], NICHTS))).toBeNull();
    expect(fehler(wahlPruefen({ hinweise: [{ departmentKey: "HR", hinweis: "Ab Februar" }] }, AUSSCHNITT, NICHTS))).toBe(
      MELDUNGEN.HINWEIS_STELLE_UNBEKANNT,
    );
  });
});

describe("fuehrungskraftSicht", () => {
  const IPAD = position({ id: "ipad", orderIndex: 10, hinweisStelle: "Mit MDM-Profil ausgeben." });
  const SCHLUESSEL = auswahl({ id: "schluessel", orderIndex: 20, vorausgewaehlteOptionen: ["Haupteingang"] });
  const FAECHER = angabe({ id: "faecher", sichtbarFuer: ["IT"] });
  const POSITIONEN = [IPAD, SCHLUESSEL, FAECHER];
  const NAMEN = { IT: "IT-Support FES", FACILITY: "Hausmeister" };

  function sicht(bestehend: BestehendeFuehrungskraftWahl = NICHTS, positionen: KatalogPosition[] = POSITIONEN, gespeichert = false) {
    return fuehrungskraftSicht({ positionen, stellenNamen: NAMEN, bestehend, ausstattungGespeichert: gespeichert });
  }

  it("ohne eigene Wahl: die Gruppen des Ausschnitts, Vorauswahl anwenden, die beiden Hinweistexte", () => {
    expect(sicht()).toEqual({
      gruppen: formularGruppen(POSITIONEN, NAMEN),
      wahl: [],
      hinweise: [],
      vorausgewaehltAnwenden: true,
      bemerkungHinweis: BEMERKUNG_HINWEIS,
      aenderungenHinweis: AENDERUNGEN_NACH_ABGABE_HINWEIS,
    });
    expect(AENDERUNGEN_NACH_ABGABE_HINWEIS).toContain("Personalabteilung");
  });

  it("die Vorauswahl gilt nur, solange der Schritt nie gespeichert wurde (F9)", () => {
    expect(sicht(NICHTS, POSITIONEN, true).vorausgewaehltAnwenden).toBe(false);
    // Auch „alles abgewaehlt“ ist gespeichert: keine Wahl, trotzdem keine Vorauswahl.
    expect(sicht(NICHTS, POSITIONEN, true).wahl).toEqual([]);
  });

  it("die eigene Wahl in der Form des PUT, je Art", () => {
    const bestehend = {
      zeilen: [
        eigene(IPAD, { bemerkung: "Mit Stift" }),
        eigene(SCHLUESSEL, { auswahl: ["Lehrerzimmer"] }),
        eigene(FAECHER, { angabe: "Chemie, Sport" }),
      ],
      hinweise: [{ departmentKey: "IT", text: "Monitor bitte hoehenverstellbar" }],
    };
    const s = sicht(bestehend);
    expect(s.wahl).toEqual([
      { positionId: "ipad", gewaehlt: true, bemerkung: "Mit Stift" },
      { positionId: "schluessel", auswahl: ["Lehrerzimmer"] },
      { positionId: "faecher", angabe: "Chemie, Sport" },
    ]);
    expect(s.hinweise).toEqual([{ departmentKey: "IT", hinweis: "Monitor bitte hoehenverstellbar" }]);
    // Hin und zurueck: Was die Sicht liefert, nimmt die Pruefung an.
    const zurueck = wahlPruefen({ ausstattung: s.wahl, hinweise: s.hinweise }, POSITIONEN, bestehend);
    expect(zurueck.ok).toBe(true);
  });

  it("ohne interne Felder: kein Hinweis fuer die Stelle, keine Faelligkeit, kein Aufgabentitel", () => {
    const bestehend = { zeilen: [eigene(IPAD, { hinweisStelle: "Geheimer Lagerort" })], hinweise: [] };
    const text = JSON.stringify(sicht(bestehend));
    expect(text).not.toContain("Mit MDM-Profil");
    expect(text).not.toContain("Geheimer Lagerort");
    expect(text).not.toContain("hinweisStelle");
    expect(text).not.toContain("relativeDueDays");
    expect(text).not.toContain("defaultDueDays");
    expect(text).not.toContain("aufgabeTitel");
  });

  it("eine eigene Wahl, die der Katalog nicht mehr anbietet, steht mit „nicht mehr im Katalog“ in ihrer Gruppe", () => {
    const alt = position({ id: "altes-ipad", bezeichnung: "Altes iPad", orderIndex: 5, hinweisStelle: "intern" });
    const s = sicht({ zeilen: [eigene(alt)], hinweise: [] });
    const it = s.gruppen.find((g) => g.departmentKey === "IT");
    expect(it?.positionen.map((p) => p.id)).toEqual(["ipad", "altes-ipad"]);
    expect(it?.positionen[1]).toEqual({
      id: "altes-ipad",
      departmentKey: "IT",
      art: "JA_NEIN",
      bezeichnung: "Altes iPad",
      hinweisFuehrungskraft: null,
      optionen: [],
      vorausgewaehlt: false,
      vorausgewaehlteOptionen: [],
      // Ohne gespeicherte Bemerkung kein Feld: Der Ausschnitt fuehrt die
      // Position nicht mehr, also bietet ihn niemand an (S8, Datensparsamkeit).
      bemerkungAnbieten: false,
      bemerkungPlatzhalter: null,
      angabe: null,
      nichtMehrImKatalog: true,
    });
    expect(s.wahl).toEqual([{ positionId: "altes-ipad", gewaehlt: true }]);
  });

  it("nicht mehr im Katalog, aber mit gespeicherter Bemerkung: das Feld steht — nur wegen ihr", () => {
    const alt = position({ id: "altes-ipad", bezeichnung: "Altes iPad", bemerkungAnbieten: false, bemerkungPlatzhalter: "z. B. Farbe" });
    const s = sicht({ zeilen: [eigene(alt, { bemerkung: "Mit Huelle" })], hinweise: [] });
    const p = s.gruppen.flatMap((g) => g.positionen).find((x) => x.id === "altes-ipad");
    expect(p).toMatchObject({ bemerkungAnbieten: true, bemerkungNurGespeichert: true, bemerkungPlatzhalter: null });
    expect(s.wahl).toEqual([{ positionId: "altes-ipad", gewaehlt: true, bemerkung: "Mit Huelle" }]);
  });

  it("eine Stelle ohne Position im Ausschnitt bekommt eine eigene Gruppe (Name am Arbeitsort, sonst Label)", () => {
    const dsb = position({ id: "schulung", departmentKey: "DSB", bezeichnung: "Datenschutz-Schulung" });
    const s = sicht({ zeilen: [eigene(dsb)], hinweise: [{ departmentKey: "VERWALTUNG", text: "Fach bitte unten" }] });
    expect(s.gruppen.map((g) => g.departmentKey)).toEqual(["IT", "VERWALTUNG", "FACILITY", "DSB"]);
    const verwaltung = s.gruppen.find((g) => g.departmentKey === "VERWALTUNG");
    // Nur ein Hinweis, keine Position — sonst waere er nicht mehr zu sehen und nicht zu loeschen.
    expect(verwaltung).toEqual({ departmentKey: "VERWALTUNG", stelleName: DEPARTMENT_LABELS.VERWALTUNG, positionen: [] });
    expect(s.hinweise).toEqual([{ departmentKey: "VERWALTUNG", hinweis: "Fach bitte unten" }]);
  });

  it("eine Option der eigenen Wahl, die der Katalog nicht mehr kennt, steht hinter den uebrigen", () => {
    const s = sicht({ zeilen: [eigene(SCHLUESSEL, { auswahl: ["Musikraum", "Haupteingang"] })], hinweise: [] });
    const schluessel = s.gruppen.flatMap((g) => g.positionen).find((p) => p.id === "schluessel");
    expect(schluessel?.optionen).toEqual(["Haupteingang", "Lehrerzimmer", "Fachraum Chemie", "Musikraum"]);
    expect(schluessel?.vorausgewaehlteOptionen).toEqual(["Haupteingang"]);
    expect(s.wahl).toEqual([{ positionId: "schluessel", auswahl: ["Musikraum", "Haupteingang"] }]);
  });

  it("eine gespeicherte Bemerkung bleibt sichtbar, auch wenn die Position kein Feld mehr anbietet", () => {
    const spind = position({ id: "spind", departmentKey: "FACILITY", bezeichnung: "Spind", bemerkungAnbieten: false });
    const ohne = sicht(NICHTS, [spind]).gruppen[0].positionen[0];
    expect(ohne.bemerkungAnbieten).toBe(false);
    const mit = sicht({ zeilen: [eigene(spind, { bemerkung: "Nr. 12" })], hinweise: [] }, [spind]);
    expect(mit.gruppen[0].positionen[0].bemerkungAnbieten).toBe(true);
    expect(mit.wahl).toEqual([{ positionId: "spind", gewaehlt: true, bemerkung: "Nr. 12" }]);
  });

  describe("hat der Katalog eine gewaehlte Position seit dem Speichern geaendert", () => {
    // Gespeichert: „Zugänge“ als Auswahl bei der IT, zwei Optionen, mit Bemerkung.
    const ALT = auswahl({
      id: "zugaenge",
      departmentKey: "IT",
      bezeichnung: "Zugänge",
      optionen: ["Dienst-E-Mail", "WebUntis"],
      orderIndex: 30,
    });
    const bestehend = {
      zeilen: [eigene(ALT, { auswahl: ["Dienst-E-Mail", "WebUntis"], bemerkung: "als Lehrkraft" })],
      hinweise: [],
    };
    /** Wie der Katalog die Position heute fuehrt. */
    const FAELLE: [string, KatalogPosition][] = [
      ["Art (Auswahl → Ja/Nein)", position({ id: "zugaenge", departmentKey: "IT", bezeichnung: "Zugänge", orderIndex: 30 })],
      ["Stelle (IT → Verwaltung)", { ...ALT, departmentKey: "VERWALTUNG" }],
      ["Bezeichnung", { ...ALT, bezeichnung: "Zugänge (Schule)" }],
    ];
    const gespeichert = {
      id: "zugaenge",
      departmentKey: "IT",
      art: "AUSWAHL",
      bezeichnung: "Zugänge",
      optionen: ["Dienst-E-Mail", "WebUntis"],
      nichtMehrImKatalog: true,
      imKatalogGeaendert: true,
      optionenNichtMehrImKatalog: ["Dienst-E-Mail", "WebUntis"],
    };

    it.each(FAELLE)("%s: steht in der gespeicherten Form, markiert, unter der gespeicherten Stelle", (_, jetzt) => {
      const s = sicht(bestehend, [IPAD, jetzt]);
      const alle = s.gruppen.flatMap((g) => g.positionen);
      // Genau einmal — die neue Form fehlt, solange die eigene Zeile besteht.
      expect(alle.filter((p) => p.id === "zugaenge")).toHaveLength(1);
      expect(s.gruppen.find((g) => g.departmentKey === "IT")?.positionen.map((p) => p.id)).toEqual(["ipad", "zugaenge"]);
      expect(alle.find((p) => p.id === "zugaenge")).toMatchObject(gespeichert);
      expect(s.wahl).toEqual([{ positionId: "zugaenge", auswahl: ["Dienst-E-Mail", "WebUntis"], bemerkung: "als Lehrkraft" }]);
    });

    it.each(FAELLE)(
      "%s: Zusammenfassung und gespeicherte Zeilen stimmen ueberein — auch ohne erneutes Speichern",
      (_, jetzt) => {
        // Die Fuehrungskraft oeffnet den Link wieder und landet direkt in der
        // Zusammenfassung. Sie zeigt die gespeicherte Zeile — Stelle,
        // Bezeichnung, Art mit zwei Optionen, eine Bemerkung —, also genau,
        // was abgegeben wird und was HR in Karte und PDF sieht.
        const s = sicht(bestehend, [IPAD, jetzt], true);
        expect(s.gruppen.map((g) => g.departmentKey)).toEqual(["IT"]);
        expect(formularKurzform(s)).toEqual({
          stellen: [{ departmentKey: "IT", stelleName: "IT-Support FES", text: "Zugänge (2)" }],
          bemerkungen: 1,
        });
        // Ein „Weiter“ mit dem Startzustand speichert dieselbe Momentaufnahme wieder.
        const pruefung = wahlPruefen(formularEingabe(s, formularStartStand(s)), [IPAD, jetzt], bestehend);
        expect(pruefung).toEqual({ ok: true, zeilen: [bestehend.zeilen[0]], hinweise: [] });
      },
    );

    it("eine Bemerkung bietet die gespeicherte Form an, wo der Katalog es fuer die Position tut — samt Platzhalter", () => {
      const ohneBemerkung = { zeilen: [eigene(ALT, { auswahl: ["WebUntis"] })], hinweise: [] };
      const mitFeld = { ...ALT, bezeichnung: "Zugänge (Schule)", bemerkungPlatzhalter: "z. B. Rolle" };
      const p1 = sicht(ohneBemerkung, [mitFeld]).gruppen[0].positionen[0];
      expect(p1).toMatchObject({ bemerkungAnbieten: true, bemerkungPlatzhalter: "z. B. Rolle" });
      expect(p1).not.toHaveProperty("bemerkungNurGespeichert");

      const ohneFeld = { ...mitFeld, bemerkungAnbieten: false };
      expect(sicht(ohneBemerkung, [ohneFeld]).gruppen[0].positionen[0]).toMatchObject({
        bemerkungAnbieten: false,
        bemerkungPlatzhalter: null,
      });
      expect(
        wahlPruefen({ ausstattung: [{ positionId: "zugaenge", auswahl: ["WebUntis"], bemerkung: "x" }] }, [ohneFeld], ohneBemerkung),
      ).toEqual({ ok: false, fehler: MELDUNGEN.WAHL_OHNE_BEMERKUNG });
      // Mit gespeicherter Bemerkung bleibt das Feld, bis sie geleert ist.
      expect(sicht(bestehend, [ohneFeld]).gruppen[0].positionen[0]).toMatchObject({
        bemerkungAnbieten: true,
        bemerkungNurGespeichert: true,
      });
    });

    it("abgewaehlt und gespeichert: faellt aus der Sicht — die neue Form liefert erst der naechste GET", () => {
      const [, jetzt] = FAELLE[0];
      const vorher = sicht(bestehend, [IPAD, jetzt], true);
      const stand = formularStartStand(vorher);
      stand.positionen.zugaenge = { ...stand.positionen.zugaenge, auswahl: [] };
      const body = formularEingabe(vorher, stand);
      expect(body.ausstattung).toEqual([]);

      const nachher = sichtNachSpeichern(vorher, body);
      expect(nachher.gruppen.flatMap((g) => g.positionen).map((p) => p.id)).toEqual(["ipad"]);
      expect(formularKurzform(nachher)).toEqual({ stellen: [], bemerkungen: 0 });
      // Ohne eigene Zeile bietet der Server danach die neue Form an.
      const danach = sicht(NICHTS, [IPAD, jetzt], true).gruppen.flatMap((g) => g.positionen);
      expect(danach.find((p) => p.id === "zugaenge")).toMatchObject({ art: "JA_NEIN" });
      expect(danach.find((p) => p.id === "zugaenge")).not.toHaveProperty("nichtMehrImKatalog");
    });
  });

  it("von HR gestrichene eigene Zeilen und leere Hinweise erscheinen nicht", () => {
    const s = sicht({
      zeilen: [eigene(IPAD, { gestrichenAm: "2027-01-10T10:00:00.000Z" })],
      hinweise: [{ departmentKey: "DSB", text: "" }],
    });
    expect(s.wahl).toEqual([]);
    expect(s.hinweise).toEqual([]);
    expect(s.gruppen.map((g) => g.departmentKey)).toEqual(["IT", "FACILITY"]);
  });

  it("markiert, was nur aus der eigenen Wahl stammt: Optionen und ein nur gespeichertes Bemerkungsfeld", () => {
    const spind = position({ id: "spind", departmentKey: "FACILITY", bezeichnung: "Spind", bemerkungAnbieten: false });
    const beamer = auswahl({ id: "beamer", departmentKey: "IT", bezeichnung: "Beamer", optionen: ["Raum 1", "Raum 2"] });
    const s = sicht(
      {
        zeilen: [
          eigene(SCHLUESSEL, { auswahl: ["Musikraum", "Haupteingang"] }),
          eigene(spind, { bemerkung: "Nr. 12" }),
          eigene(beamer, { auswahl: ["Raum 2"] }),
        ],
        hinweise: [],
      },
      [...POSITIONEN, spind],
    );
    const alle = s.gruppen.flatMap((g) => g.positionen);
    expect(alle.find((p) => p.id === "schluessel")?.optionenNichtMehrImKatalog).toEqual(["Musikraum"]);
    expect(alle.find((p) => p.id === "spind")?.bemerkungNurGespeichert).toBe(true);
    // Ganz aus dem Katalog gefallen: alle Optionen stammen aus der eigenen Wahl.
    expect(alle.find((p) => p.id === "beamer")).toMatchObject({
      nichtMehrImKatalog: true,
      optionen: ["Raum 2"],
      optionenNichtMehrImKatalog: ["Raum 2"],
      // Ohne gespeicherte Bemerkung kein Feld.
      bemerkungAnbieten: false,
    });
    // Ganz aus dem Katalog gefallen ist nicht „geändert“.
    expect(alle.find((p) => p.id === "beamer")).not.toHaveProperty("imKatalogGeaendert");
    // Was der Katalog anbietet, traegt keine Marke.
    expect(alle.find((p) => p.id === "ipad")).not.toHaveProperty("optionenNichtMehrImKatalog");
    expect(alle.find((p) => p.id === "ipad")).not.toHaveProperty("bemerkungNurGespeichert");
  });
});

// =============================================
// Formularschritt der Fuehrungskraft (S9)
// =============================================

describe("Formularschritt: Startzustand, Body, Kurzform, Stand nach dem Speichern", () => {
  const IPAD = position({ id: "ipad", orderIndex: 10, vorausgewaehlt: true, bemerkungPlatzhalter: "z. B. Stift" });
  const LAPTOP = position({ id: "laptop", orderIndex: 20, bezeichnung: "Dienst-Laptop/PC" });
  const ZUGAENGE = auswahl({
    id: "zugaenge",
    departmentKey: "IT",
    bezeichnung: "Zugänge",
    optionen: ["Dienst-E-Mail", "Schulportal", "WebUntis"],
    vorausgewaehlteOptionen: ["Dienst-E-Mail"],
    orderIndex: 30,
  });
  const SCHLUESSEL = auswahl({ id: "schluessel", orderIndex: 10 });
  const FAECHER = angabe({ id: "faecher", orderIndex: 20, sichtbarFuer: ["IT"] });
  const POSITIONEN = [IPAD, LAPTOP, ZUGAENGE, SCHLUESSEL, FAECHER];
  const NAMEN = { IT: "IT-Support FES", FACILITY: "Hausmeister" };

  function sicht(bestehend: BestehendeFuehrungskraftWahl = NICHTS, positionen: KatalogPosition[] = POSITIONEN, gespeichert = false) {
    return fuehrungskraftSicht({ positionen, stellenNamen: NAMEN, bestehend, ausstattungGespeichert: gespeichert });
  }

  /** Die Sicht, die der Server nach dem Speichern dieses Bodys liefern wuerde (Pruefung, Ersetzen, F9). */
  function sichtDesServers(
    vorher: BestehendeFuehrungskraftWahl,
    body: ReturnType<typeof formularEingabe>,
    positionen: KatalogPosition[] = POSITIONEN,
  ): FuehrungskraftSicht {
    const pruefung = wahlPruefen(body, positionen, vorher);
    if (!pruefung.ok) throw new Error(pruefung.fehler);
    const nachher: BestehendeFuehrungskraftWahl = {
      zeilen: (pruefung.zeilen ?? []).map((z) => ({ ...z, gestrichenAm: null })),
      hinweise: pruefung.hinweise ?? [],
    };
    return sicht(nachher, positionen, true);
  }

  // ---- formularStartStand ----

  it("Startzustand ohne gespeicherten Schritt: die Vorauswahl des Katalogs gilt (F9)", () => {
    const stand = formularStartStand(sicht());
    expect(formularPositionStand(stand, "ipad").gewaehlt).toBe(true);
    expect(formularPositionStand(stand, "laptop").gewaehlt).toBe(false);
    expect(formularPositionStand(stand, "zugaenge").auswahl).toEqual(["Dienst-E-Mail"]);
    expect(formularPositionStand(stand, "schluessel").auswahl).toEqual([]);
    expect(formularPositionStand(stand, "faecher").angabe).toBe("");
  });

  it("Startzustand nach dem Speichern: keine Vorauswahl mehr — „alles abgewählt“ bleibt abgewählt", () => {
    const stand = formularStartStand(sicht(NICHTS, POSITIONEN, true));
    expect(formularPositionStand(stand, "ipad").gewaehlt).toBe(false);
    expect(formularPositionStand(stand, "zugaenge").auswahl).toEqual([]);
  });

  it("Startzustand aus der eigenen Wahl, je Art, samt Bemerkung und Hinweis", () => {
    const bestehend = {
      zeilen: [
        eigene(LAPTOP, { bemerkung: "mit Dockingstation" }),
        eigene(ZUGAENGE, { auswahl: ["WebUntis"] }),
        eigene(FAECHER, { angabe: "Chemie, Sport" }),
      ],
      hinweise: [{ departmentKey: "FACILITY", text: "Fach im Erdgeschoss" }],
    };
    const stand = formularStartStand(sicht(bestehend, POSITIONEN, true));
    expect(formularPositionStand(stand, "laptop")).toEqual({
      gewaehlt: true,
      auswahl: [],
      angabe: "",
      bemerkung: "mit Dockingstation",
    });
    expect(formularPositionStand(stand, "zugaenge").auswahl).toEqual(["WebUntis"]);
    expect(formularPositionStand(stand, "faecher").angabe).toBe("Chemie, Sport");
    expect(formularPositionStand(stand, "ipad").gewaehlt).toBe(false);
    expect(formularHinweis(stand, "FACILITY")).toBe("Fach im Erdgeschoss");
    expect(formularHinweis(stand, "IT")).toBe("");
  });

  it("eine unbekannte Position gilt als nicht gewaehlt (auch Schluessel aus dem Prototyp)", () => {
    const stand: FormularStand = { positionen: {}, hinweise: {} };
    expect(formularPositionStand(stand, "constructor")).toEqual({ gewaehlt: false, auswahl: [], angabe: "", bemerkung: "" });
    expect(formularHinweis(stand, "constructor")).toBe("");
  });

  // ---- formularEingabe ----

  it("nichts gewaehlt: trotzdem beide Listen (R3 — „Weiter“ leert den gespeicherten Stand)", () => {
    expect(formularEingabe(sicht(NICHTS, POSITIONEN, true), { positionen: {}, hinweise: {} })).toEqual({
      ausstattung: [],
      hinweise: [],
    });
  });

  it("der Body je Art: nur Gewaehltes, Optionen in Katalogreihenfolge, Angabe getrimmt, Hinweise nur nicht leer", () => {
    const s = sicht();
    const stand: FormularStand = {
      positionen: {
        ipad: { gewaehlt: true, auswahl: [], angabe: "", bemerkung: "  Mit Stift\nund Hülle " },
        // Abgewaehlt, aber mit Bemerkung im Feld: wird nicht gesendet.
        laptop: { gewaehlt: false, auswahl: [], angabe: "", bemerkung: "mit Dockingstation" },
        zugaenge: { gewaehlt: false, auswahl: ["WebUntis", "Dienst-E-Mail", "Gibt es nicht"], angabe: "", bemerkung: "" },
        // Keine Option mehr gewaehlt: Die Position faellt ganz weg, die Bemerkung mit.
        schluessel: { gewaehlt: false, auswahl: [], angabe: "", bemerkung: "Sammlung erst nach Unterweisung" },
        faecher: { gewaehlt: false, auswahl: [], angabe: "  Chemie, Sport ", bemerkung: "Bemerkung zur Angabe" },
      },
      hinweise: { IT: "  Monitor bitte höhenverstellbar  ", FACILITY: "   " },
    };
    expect(formularEingabe(s, stand)).toEqual({
      ausstattung: [
        { positionId: "ipad", gewaehlt: true, bemerkung: "Mit Stift\nund Hülle" },
        { positionId: "zugaenge", auswahl: ["Dienst-E-Mail", "WebUntis"] },
        { positionId: "faecher", angabe: "Chemie, Sport" },
      ],
      hinweise: [{ departmentKey: "IT", hinweis: "Monitor bitte höhenverstellbar" }],
    });
  });

  it("keine Bemerkung, wo das Formular kein Feld zeigt", () => {
    const ohneFeld = position({ id: "spind", departmentKey: "FACILITY", bezeichnung: "Spind", bemerkungAnbieten: false });
    const s = sicht(NICHTS, [ohneFeld]);
    const body = formularEingabe(s, {
      positionen: { spind: { gewaehlt: true, auswahl: [], angabe: "", bemerkung: "Nr. 12" } },
      hinweise: {},
    });
    expect(body.ausstattung).toEqual([{ positionId: "spind", gewaehlt: true }]);
  });

  it("Gegenprobe: Was das Formular aus dem Startzustand sendet, nimmt der Server an — auch Altes aus der eigenen Wahl", () => {
    const alt = position({ id: "altes-ipad", bezeichnung: "Altes iPad", orderIndex: 5 });
    const bestehend = {
      zeilen: [
        eigene(alt, { bemerkung: "Ersatzgerät" }),
        eigene(SCHLUESSEL, { auswahl: ["Musikraum", "Haupteingang"], bemerkung: "Sammlung erst später" }),
        eigene(FAECHER, { angabe: "Chemie" }),
      ],
      hinweise: [{ departmentKey: "DSB", text: "Verpflichtung vor dem ersten Tag" }],
    };
    const s = sicht(bestehend, POSITIONEN, true);
    const body = formularEingabe(s, formularStartStand(s));
    expect(body.ausstattung.map((w) => w.positionId)).toEqual(["altes-ipad", "schluessel", "faecher"]);
    expect(body.hinweise).toEqual([{ departmentKey: "DSB", hinweis: "Verpflichtung vor dem ersten Tag" }]);
    expect(wahlPruefen(body, POSITIONEN, bestehend).ok).toBe(true);
    // Und mit der Vorauswahl eines nie gespeicherten Schritts ebenso.
    const frisch = sicht();
    expect(wahlPruefen(formularEingabe(frisch, formularStartStand(frisch)), POSITIONEN, NICHTS).ok).toBe(true);
  });

  // ---- formularKurzform ----

  it("Kurzform je Stelle (Mockup 6.2): Bezeichnung, Auswahl gezaehlt, Angabe mit Text, Hinweis, Bemerkungen gezaehlt", () => {
    const bestehend = {
      zeilen: [
        eigene(IPAD, { bemerkung: "Mit Stift" }),
        eigene(ZUGAENGE, { auswahl: ["Dienst-E-Mail", "Schulportal", "WebUntis"], bemerkung: "WebUntis als Lehrkraft" }),
        eigene(SCHLUESSEL, { auswahl: ["Haupteingang", "Lehrerzimmer"] }),
        eigene(FAECHER, { angabe: "Chemie, Sport" }),
      ],
      hinweise: [{ departmentKey: "IT", text: "Monitor bitte höhenverstellbar" }],
    };
    expect(formularKurzform(sicht(bestehend, POSITIONEN, true))).toEqual({
      stellen: [
        {
          departmentKey: "IT",
          stelleName: "IT-Support FES",
          text: `Dienst-iPad (Lernmittel) · Zugänge (3) · ${KURZFORM_HINWEIS}`,
        },
        { departmentKey: "FACILITY", stelleName: "Hausmeister", text: "Schlüssel (2) · Unterrichtsfächer: Chemie, Sport" },
      ],
      bemerkungen: 2,
    });
  });

  it("Kurzform ohne Wahl: keine Stelle, keine Bemerkung — auch nicht aus einer Vorauswahl, die nie gespeichert wurde", () => {
    expect(formularKurzform(sicht())).toEqual({ stellen: [], bemerkungen: 0 });
  });

  it("Kurzform: eine Stelle nur mit Hinweis steht mit „Weitere Hinweise“ da", () => {
    const s = sicht({ zeilen: [], hinweise: [{ departmentKey: "DSB", text: "Bitte vorab schulen" }] }, POSITIONEN, true);
    expect(formularKurzform(s).stellen).toEqual([
      { departmentKey: "DSB", stelleName: DEPARTMENT_LABELS.DSB, text: KURZFORM_HINWEIS },
    ]);
  });

  // ---- sichtNachSpeichern ----

  it("nach dem Speichern: Wahl und Hinweise sind der Body, die Vorauswahl gilt nicht mehr", () => {
    const vorher = sicht();
    const body = formularEingabe(vorher, formularStartStand(vorher));
    const nachher = sichtNachSpeichern(vorher, body);
    expect(nachher.wahl).toEqual(body.ausstattung);
    expect(nachher.hinweise).toEqual(body.hinweise);
    expect(nachher.vorausgewaehltAnwenden).toBe(false);
    // Was vorher vorausgewaehlt war, steht jetzt als eigene Wahl da.
    expect(formularPositionStand(formularStartStand(nachher), "ipad").gewaehlt).toBe(true);
    expect(nachher).toEqual(sichtDesServers(NICHTS, body));
  });

  it("Gegenprobe: entfernt genau, was der Server danach nicht mehr anbietet", () => {
    const alt = position({ id: "altes-ipad", bezeichnung: "Altes iPad", orderIndex: 5 });
    const beamer = auswahl({ id: "beamer", departmentKey: "IT", bezeichnung: "Beamer", optionen: ["Raum 1", "Raum 2"], orderIndex: 6 });
    const spind = position({ id: "spind", departmentKey: "FACILITY", bezeichnung: "Spind", bemerkungAnbieten: false, orderIndex: 30 });
    const positionen = [...POSITIONEN, spind];
    const vorherBestehend: BestehendeFuehrungskraftWahl = {
      zeilen: [
        eigene(alt),
        eigene(beamer, { auswahl: ["Raum 1", "Raum 2"] }),
        eigene(SCHLUESSEL, { auswahl: ["Haupteingang", "Musikraum", "Sporthalle"] }),
        eigene(spind, { bemerkung: "Nr. 12" }),
      ],
      hinweise: [{ departmentKey: "DSB", text: "Verpflichtung vor dem ersten Tag" }],
    };
    const vorher = sicht(vorherBestehend, positionen, true);
    const stand = formularStartStand(vorher);
    // Die Fuehrungskraft waehlt das alte iPad ab, behaelt vom Beamer nur Raum 2,
    // waehlt den Musikraum ab, leert die Bemerkung am Spind und den Hinweis an den DSB.
    stand.positionen["altes-ipad"] = { ...stand.positionen["altes-ipad"], gewaehlt: false };
    stand.positionen.beamer = { ...stand.positionen.beamer, auswahl: ["Raum 2"] };
    stand.positionen.schluessel = { ...stand.positionen.schluessel, auswahl: ["Haupteingang", "Sporthalle"] };
    stand.positionen.spind = { ...stand.positionen.spind, bemerkung: "" };
    stand.hinweise.DSB = "";
    const body = formularEingabe(vorher, stand);

    const nachher = sichtNachSpeichern(vorher, body);
    const alle = nachher.gruppen.flatMap((g) => g.positionen);
    expect(alle.map((p) => p.id)).not.toContain("altes-ipad");
    expect(alle.find((p) => p.id === "beamer")).toMatchObject({ optionen: ["Raum 2"], optionenNichtMehrImKatalog: ["Raum 2"] });
    expect(alle.find((p) => p.id === "schluessel")).toMatchObject({
      optionen: ["Haupteingang", "Lehrerzimmer", "Fachraum Chemie", "Sporthalle"],
      optionenNichtMehrImKatalog: ["Sporthalle"],
    });
    expect(alle.find((p) => p.id === "spind")?.bemerkungAnbieten).toBe(false);
    expect(alle.find((p) => p.id === "spind")).not.toHaveProperty("bemerkungNurGespeichert");
    expect(nachher.gruppen.map((g) => g.departmentKey)).toEqual(["IT", "FACILITY"]);
    // Und alles zusammen ist genau die Sicht, die der Server danach liefert.
    expect(nachher).toEqual(sichtDesServers(vorherBestehend, body, positionen));
  });

  it("was weiter gewaehlt ist, bleibt samt Marke stehen", () => {
    const spind = position({ id: "spind", departmentKey: "FACILITY", bezeichnung: "Spind", bemerkungAnbieten: false });
    const vorherBestehend = { zeilen: [eigene(spind, { bemerkung: "Nr. 12" })], hinweise: [] };
    const vorher = sicht(vorherBestehend, [spind], true);
    const body = formularEingabe(vorher, formularStartStand(vorher));
    const nachher = sichtNachSpeichern(vorher, body);
    expect(nachher.gruppen[0].positionen[0]).toMatchObject({ bemerkungAnbieten: true, bemerkungNurGespeichert: true });
    expect(nachher).toEqual(sichtDesServers(vorherBestehend, body, [spind]));
  });

  it("ohne Felder in der Eingabe bleibt die Sicht, wie sie ist", () => {
    const vorher = sicht();
    expect(sichtNachSpeichern(vorher, {})).toBe(vorher);
  });
});

// =============================================
// HR liest mit (S10): Kurzform, Herkunft, Gruppen, Uebersicht
// =============================================

function zeileDaten(teil: Partial<UebersichtZeileDaten> = {}): UebersichtZeileDaten {
  return {
    id: "z-ipad",
    positionId: "pos-1",
    departmentKey: "IT",
    art: "JA_NEIN",
    angabeSchluessel: null,
    bezeichnung: "Dienst-iPad (Lernmittel)",
    sichtbarFuer: [],
    reihenfolge: 0,
    auswahl: [],
    angabe: null,
    bemerkung: null,
    bemerkungQuelle: null,
    quelle: "FUEHRUNGSKRAFT",
    erfasstVonId: null,
    gestrichenAm: null,
    createdAt: new Date("2027-01-14T09:00:00.000Z"),
    ...teil,
  };
}

function hinweisDaten(teil: Partial<UebersichtHinweisDaten> = {}): UebersichtHinweisDaten {
  return {
    departmentKey: "IT",
    text: "Bitte vor dem ersten Schultag einrichten.",
    quelle: "FUEHRUNGSKRAFT",
    checklistItemId: null,
    gesehenAm: null,
    ...teil,
  };
}

describe("ausstattungKurz (HR-Mail supervisor-completed)", () => {
  const schluessel = (key: string, art = "JA_NEIN") => ({ art, departmentKey: key });

  it("„6 Positionen für 3 Stellen“ — eine je Position, nicht je Option", () => {
    expect(
      ausstattungKurz(
        [
          schluessel("IT"),
          schluessel("IT", "AUSWAHL"),
          schluessel("IT"),
          schluessel("FACILITY", "AUSWAHL"),
          schluessel("FACILITY"),
          schluessel("VERWALTUNG"),
        ],
        [],
      ),
    ).toBe("6 Positionen für 3 Stellen");
  });

  it("Einzahl", () => {
    expect(ausstattungKurz([schluessel("IT")], [])).toBe("1 Position für 1 Stelle");
  });

  it("die Stellen kommen auch aus den Hinweisen", () => {
    expect(ausstattungKurz([schluessel("IT"), schluessel("IT")], [{ departmentKey: "FACILITY", text: "Raum 2" }])).toBe(
      "2 Positionen für 2 Stellen",
    );
  });

  it("nur Hinweise", () => {
    expect(ausstattungKurz([], [{ departmentKey: "IT", text: "Bitte früh einrichten" }])).toBe("Hinweis an 1 Stelle");
    expect(
      ausstattungKurz([], [
        { departmentKey: "IT", text: "a" },
        { departmentKey: "FACILITY", text: "b" },
      ]),
    ).toBe("Hinweise an 2 Stellen");
  });

  it("Angaben zaehlen nicht — weder als Position noch als Stelle", () => {
    expect(ausstattungKurz([schluessel("FACILITY", "ANGABE")], [])).toBe("");
    expect(ausstattungKurz([schluessel("IT"), schluessel("FACILITY", "ANGABE")], [])).toBe("1 Position für 1 Stelle");
  });

  it("gestrichene Zeilen und leere Hinweise zaehlen nicht", () => {
    expect(
      ausstattungKurz(
        [{ ...schluessel("IT"), gestrichenAm: new Date() }],
        [
          { departmentKey: "FACILITY", text: "   " },
          { departmentKey: "VERWALTUNG", text: "" },
        ],
      ),
    ).toBe("");
  });

  it("leer → \"\"", () => {
    expect(ausstattungKurz([], [])).toBe("");
  });

  it("traegt nie einen Bemerkungs- oder Hinweistext", () => {
    const kurz = ausstattungKurz(
      [{ art: "JA_NEIN", departmentKey: "IT", bemerkung: "Mit Stift und Hülle" } as never],
      [{ departmentKey: "IT", text: "Geheimer Hinweis" }],
    );
    expect(kurz).not.toMatch(/Stift|Geheim/);
  });
});

describe("bemerkungLabel und hinweisLabel (Regel 8)", () => {
  it("drei Herkuenfte", () => {
    expect(bemerkungLabel("FUEHRUNGSKRAFT")).toBe("Bemerkung der Führungskraft");
    expect(bemerkungLabel("HR")).toBe("Bemerkung der Personalabteilung");
    expect(bemerkungLabel("BEIDE")).toBe("Bemerkung der Führungskraft, ergänzt durch die Personalabteilung");
    expect(hinweisLabel("FUEHRUNGSKRAFT")).toBe("Hinweis der Führungskraft");
    expect(hinweisLabel("HR")).toBe("Hinweis der Personalabteilung");
    expect(hinweisLabel("BEIDE")).toBe("Hinweis der Führungskraft, ergänzt durch die Personalabteilung");
  });

  it("ohne bekannte Herkunft die der Fuehrungskraft", () => {
    expect(bemerkungLabel(null)).toBe("Bemerkung der Führungskraft");
    expect(hinweisLabel(undefined)).toBe("Hinweis der Führungskraft");
  });

  it("jede Herkunft aus BEMERKUNG_QUELLEN hat einen eigenen Text", () => {
    expect(new Set(BEMERKUNG_QUELLEN.map(bemerkungLabel)).size).toBe(BEMERKUNG_QUELLEN.length);
  });
});

describe("namenAufzaehlen", () => {
  it("„A“, „A und B“, „A, B und C“", () => {
    expect(namenAufzaehlen([])).toBe("");
    expect(namenAufzaehlen(["IT"])).toBe("IT");
    expect(namenAufzaehlen(["IT", "Facility"])).toBe("IT und Facility");
    expect(namenAufzaehlen(["IT", "Facility", "Verwaltung"])).toBe("IT, Facility und Verwaltung");
  });
});

describe("ausstattungsGruppen (Karte und PDF)", () => {
  const namen: Record<string, string> = {
    IT: "IT-Abteilung",
    FACILITY: "Facility Management",
    VERWALTUNG: "Verwaltung / Sekretariat",
    HR: "Personalabteilung",
  };
  const stelleName = (key: string) => namen[key] ?? key;

  it("Stellen in der Reihenfolge der Abteilungskarte, HR dahinter; Zeilen nach reihenfolge, dann Bezeichnung", () => {
    const gruppen = ausstattungsGruppen({
      zeilen: [
        zeileDaten({ id: "hr", departmentKey: "HR", bezeichnung: "Jobticket" }),
        zeileDaten({ id: "fac", departmentKey: "FACILITY", bezeichnung: "Transponder" }),
        zeileDaten({ id: "it-b", bezeichnung: "Telefon", reihenfolge: 2 }),
        zeileDaten({ id: "it-a2", bezeichnung: "Zugänge", reihenfolge: 1 }),
        zeileDaten({ id: "it-a1", bezeichnung: "Dienst-Laptop", reihenfolge: 1 }),
      ],
      hinweise: [hinweisDaten({ departmentKey: "VERWALTUNG" })],
      stelleName,
    });
    expect(gruppen.map((g) => g.departmentKey)).toEqual(["IT", "VERWALTUNG", "FACILITY", "HR"]);
    expect(gruppen[0].zeilen.map((z) => z.id)).toEqual(["it-a1", "it-a2", "it-b"]);
    expect(gruppen.map((g) => g.stelleName)).toEqual([
      "IT-Abteilung",
      "Verwaltung / Sekretariat",
      "Facility Management",
      "Personalabteilung",
    ]);
  });

  it("Bemerkung mit Beschriftung nach Herkunft; die Zeile traegt ihre Quelle", () => {
    const [it] = ausstattungsGruppen({
      zeilen: [
        zeileDaten({ id: "fk", bemerkung: "  Mit Stift und Hülle  ", bemerkungQuelle: "FUEHRUNGSKRAFT" }),
        zeileDaten({ id: "beide", positionId: "pos-2", bemerkung: "Apparat reicht", bemerkungQuelle: "BEIDE" }),
        zeileDaten({ id: "ohne", positionId: "pos-3", bemerkung: "   " }),
      ],
      hinweise: [],
      stelleName,
    });
    expect(it.zeilen[0].bemerkung).toEqual({ text: "Mit Stift und Hülle", label: "Bemerkung der Führungskraft" });
    expect(it.zeilen[1].bemerkung?.label).toBe("Bemerkung der Führungskraft, ergänzt durch die Personalabteilung");
    expect(it.zeilen[2].bemerkung).toBeNull();
    expect(it.zeilen.every((z) => z.quelle === "FUEHRUNGSKRAFT" && z.erfasst === null)).toBe(true);
  });

  it("Auswahl mit den gewaehlten Optionen; Ja/Nein und Angabe ohne", () => {
    const [it] = ausstattungsGruppen({
      zeilen: [
        zeileDaten({ id: "zug", art: "AUSWAHL", bezeichnung: "Zugänge", auswahl: ["Dienst-E-Mail", "WebUntis"] }),
        zeileDaten({ id: "ipad", positionId: "pos-2" }),
      ],
      hinweise: [],
      stelleName,
    });
    expect(it.zeilen.find((z) => z.id === "zug")?.auswahl).toEqual(["Dienst-E-Mail", "WebUntis"]);
    expect(it.zeilen.find((z) => z.id === "ipad")?.auswahl).toEqual([]);
  });

  it("Angabe: Label aus dem Katalog, Wert, sichtbar fuer die eigene Stelle zuerst — nie eine Bemerkung", () => {
    const [fac] = ausstattungsGruppen({
      zeilen: [
        zeileDaten({
          id: "faecher",
          departmentKey: "FACILITY",
          art: "ANGABE",
          angabeSchluessel: "UNTERRICHTSFAECHER",
          bezeichnung: "Unterrichtsfächer",
          angabe: "Chemie, Sport",
          sichtbarFuer: ["IT"],
          bemerkung: "darf nicht erscheinen",
        }),
      ],
      hinweise: [],
      stelleName,
    });
    expect(fac.zeilen[0].angabe).toEqual({
      label: "Unterrichtsfächer",
      wert: "Chemie, Sport",
      sichtbarFuer: ["Facility Management", "IT-Abteilung"],
    });
    expect(fac.zeilen[0].bemerkung).toBeNull();
  });

  it("geleerte Angabe: Zeile bleibt, ohne Wert", () => {
    const [fac] = ausstattungsGruppen({
      zeilen: [zeileDaten({ departmentKey: "FACILITY", art: "ANGABE", angabeSchluessel: "DURCHWAHL", angabe: null })],
      hinweise: [],
      stelleName,
    });
    expect(fac.zeilen).toHaveLength(1);
    expect(fac.zeilen[0].angabe).toBeNull();
  });

  it("Hinweis: nur nicht leer, mit Herkunft und „gesehen“; ein Hinweis allein ergibt eine Gruppe", () => {
    const gruppen = ausstattungsGruppen({
      zeilen: [],
      hinweise: [
        hinweisDaten({ departmentKey: "IT", quelle: "BEIDE", gesehenAm: new Date(), checklistItemId: "i-9" }),
        hinweisDaten({ departmentKey: "FACILITY", text: "  " }),
      ],
      stelleName,
    });
    expect(gruppen).toHaveLength(1);
    expect(gruppen[0].zeilen).toEqual([]);
    expect(gruppen[0].hinweis).toMatchObject({
      text: "Bitte vor dem ersten Schultag einrichten.",
      quelleLabel: "Hinweis der Führungskraft, ergänzt durch die Personalabteilung",
      gesehen: true,
      checklistItemId: "i-9",
    });
  });

  it("von HR ergaenzt: „ergänzt von HR (A. Peters), <Berliner Tag>“", () => {
    const [it] = ausstattungsGruppen({
      zeilen: [
        zeileDaten({
          quelle: "HR",
          erfasstVonId: "u-1",
          // 23:30 UTC am 19.01. ist in Berlin schon der 20.01.
          createdAt: new Date("2027-01-19T23:30:00.000Z"),
        }),
        zeileDaten({ id: "z2", positionId: "pos-2", quelle: "HR", erfasstVonId: "u-weg", createdAt: "2027-01-19T08:00:00.000Z" }),
      ],
      hinweise: [],
      stelleName,
      erfasser: { "u-1": { firstName: "Anna", lastName: "Peters" } },
    });
    expect(it.zeilen[0].quelle).toBe("HR");
    expect(it.zeilen[0].erfasst).toBe("ergänzt von HR (A. Peters), 20.01.2027");
    expect(it.zeilen[1].erfasst).toBe("ergänzt von HR, 19.01.2027");
  });

  it("gestrichen und „nicht mehr im Katalog“ — Letzteres nur, wenn der Katalog bekannt ist", () => {
    const zeilen = [
      zeileDaten({ id: "weg", positionId: "pos-aus", gestrichenAm: "2027-01-20T10:00:00.000Z" }),
      zeileDaten({ id: "da", positionId: "pos-1" }),
      zeileDaten({ id: "frei", positionId: null, quelle: "HR" }),
    ];
    const ohneKatalog = ausstattungsGruppen({ zeilen, hinweise: [], stelleName })[0].zeilen;
    expect(ohneKatalog.map((z) => z.nichtMehrImKatalog)).toEqual([false, false, false]);

    const mitKatalog = ausstattungsGruppen({ zeilen, hinweise: [], stelleName, imKatalog: new Set(["pos-1"]) })[0].zeilen;
    expect(Object.fromEntries(mitKatalog.map((z) => [z.id, [z.gestrichen, z.nichtMehrImKatalog]]))).toEqual({
      weg: [true, true],
      da: [false, false],
      frei: [false, false],
    });
  });

  it("erste Fassung: ohne Aufgaben, ohne Aktionen, ohne Vorlaufwarnung", () => {
    const [it] = ausstattungsGruppen({ zeilen: [zeileDaten()], hinweise: [hinweisDaten()], stelleName });
    expect(it.zeilen[0]).toMatchObject({
      aufgaben: [],
      aktionen: { aendern: false, streichen: false, sperrGrund: null },
      vorlaufWarnung: null,
    });
    expect(it.hinweis).toMatchObject({ status: null, faelligAm: null, eilt: false, aktionen: { aendern: false, sperrGrund: null } });
  });

  it("nie eine Gruppe fuer MITARBEITER oder VORGESETZTER (Regel 11)", () => {
    const gruppen = ausstattungsGruppen({
      zeilen: NICHT_ERLAUBTE_STELLEN.map((key, i) => zeileDaten({ id: `z${i}`, positionId: `p${i}`, departmentKey: key })),
      hinweise: NICHT_ERLAUBTE_STELLEN.map((key) => hinweisDaten({ departmentKey: key })),
      stelleName,
    });
    expect(gruppen).toEqual([]);
  });
});

describe("ausstattungsZustand und ausstattungsUebersichtBauen (Zustandsregel 1.6)", () => {
  const KATALOG = [
    position({ id: "pos-1" }),
    position({ id: "pos-2", bezeichnung: "Telefon mit Durchwahl" }),
    auswahl(),
  ];

  function vorgang(opts: {
    eingereicht: boolean;
    mitAusstattung: boolean | null;
    status: string;
  }): UebersichtVorgangStand {
    return {
      status: opts.status,
      supervisorSubmittedAt: opts.eingereicht ? new Date("2027-01-14T09:30:00.000Z") : null,
      supervisorData: { isComplete: opts.eingereicht, mitAusstattung: opts.mitAusstattung },
    };
  }

  function bauen(v: UebersichtVorgangStand, darfBearbeiten: boolean, teil: { zeilen?: UebersichtZeileDaten[] } = {}) {
    return ausstattungsUebersichtBauen({
      vorgang: v,
      darfBearbeiten,
      zeilen: teil.zeilen ?? [zeileDaten({ positionId: "pos-1" })],
      hinweise: [],
      arbeitsortId: GYM,
      konfigs: [konfig({})],
      katalog: KATALOG,
    });
  }

  // Erwartung nach Feinplan 1.6, Zeile fuer Zeile
  function erwartet(eingereicht: boolean, mit: boolean | null, status: string, hr: boolean) {
    if ((AUSSTATTUNG_ENDSTATUS as readonly string[]).includes(status)) {
      return { zustand: "NUR_LESEN", satz: MELDUNGEN.UEBERSICHT_ABGESCHLOSSEN };
    }
    if (!hr) return { zustand: "NUR_LESEN", satz: null };
    if (!eingereicht) {
      return {
        zustand: "ENTWURF",
        satz: mit === true ? MELDUNGEN.UEBERSICHT_ENTWURF_MIT_SCHRITT : MELDUNGEN.UEBERSICHT_ENTWURF_OHNE_SCHRITT,
      };
    }
    return { zustand: "BEARBEITBAR", satz: null };
  }

  const FAELLE: [boolean, boolean | null, string, boolean][] = [];
  for (const eingereicht of [true, false]) {
    for (const mit of [true, false, null]) {
      for (const status of ["laufend", "COMPLETED", "EXPIRED"]) {
        for (const hr of [true, false]) FAELLE.push([eingereicht, mit, status, hr]);
      }
    }
  }

  it.each(FAELLE)("eingereicht %s · mitAusstattung %s · Status %s · HR %s", (eingereicht, mit, statusArt, hr) => {
    const status = statusArt === "laufend" ? (eingereicht ? "SUPERVISOR_SUBMITTED" : "IN_PROGRESS") : statusArt;
    const v = vorgang({ eingereicht, mitAusstattung: mit, status });
    const soll = erwartet(eingereicht, mit, status, hr);

    expect(ausstattungsZustand(v, hr)).toEqual(soll);
    const u = bauen(v, hr);
    expect({ zustand: u.zustand, satz: u.satz }).toEqual(soll);
    // `hinzufuegbar` nur bei BEARBEITBAR — dann der Katalog ohne die gewaehlte pos-1
    expect(u.hinzufuegbar.map((h) => h.positionId)).toEqual(
      soll.zustand === "BEARBEITBAR" ? ["pos-2", "pos-schluessel"] : [],
    );
    expect(u.darfBearbeiten).toBe(hr);
    expect(u.mitAusstattung).toBe(mit === true);
  });

  it("BEARBEITBAR nach der Abgabe auch ohne Merker (Bestand, Migration setzt false)", () => {
    for (const mit of [false, null]) {
      expect(bauen(vorgang({ eingereicht: true, mitAusstattung: mit, status: "SUPERVISOR_SUBMITTED" }), true).zustand).toBe(
        "BEARBEITBAR",
      );
    }
  });

  it("REVIEWED laeuft noch; der Altfall `isComplete` ohne Zeitstempel zaehlt als eingereicht", () => {
    expect(ausstattungsZustand(vorgang({ eingereicht: true, mitAusstattung: true, status: "REVIEWED" }), true).zustand).toBe(
      "BEARBEITBAR",
    );
    const altfall: UebersichtVorgangStand = {
      status: "SUPERVISOR_SUBMITTED",
      supervisorSubmittedAt: null,
      supervisorData: { isComplete: true, mitAusstattung: false },
    };
    expect(ausstattungsZustand(altfall, true).zustand).toBe("BEARBEITBAR");
  });

  it("hinzufuegbar: eine gestrichene Position laesst sich wieder ergaenzen; Optionen nur bei Auswahl", () => {
    const u = bauen(vorgang({ eingereicht: true, mitAusstattung: true, status: "SUPERVISOR_SUBMITTED" }), true, {
      zeilen: [
        zeileDaten({ positionId: "pos-1", gestrichenAm: new Date() }),
        zeileDaten({ id: "z2", positionId: "pos-2" }),
      ],
    });
    expect(u.hinzufuegbar).toEqual([
      { positionId: "pos-1", bezeichnung: "Dienst-iPad (Lernmittel)", art: "JA_NEIN", departmentKey: "IT", optionen: [] },
      {
        positionId: "pos-schluessel",
        bezeichnung: "Schlüssel",
        art: "AUSWAHL",
        departmentKey: "FACILITY",
        optionen: ["Haupteingang", "Lehrerzimmer", "Fachraum Chemie"],
      },
    ]);
  });

  it("ohne geladenen Katalog: nichts hinzufuegbar, keine Zeile „nicht mehr im Katalog“", () => {
    const u = ausstattungsUebersichtBauen({
      vorgang: vorgang({ eingereicht: true, mitAusstattung: true, status: "SUPERVISOR_SUBMITTED" }),
      darfBearbeiten: true,
      zeilen: [zeileDaten({ positionId: "pos-weg" })],
      hinweise: [],
      arbeitsortId: GYM,
      konfigs: [],
      katalog: null,
    });
    expect(u.hinzufuegbar).toEqual([]);
    expect(u.gruppen[0].zeilen[0].nichtMehrImKatalog).toBe(false);
  });

  it("Stellen-Name und Adresse am Arbeitsort: Eintrag der Einrichtung vor dem zentralen, HR braucht keine Adresse", () => {
    const u = ausstattungsUebersichtBauen({
      vorgang: vorgang({ eingereicht: true, mitAusstattung: true, status: "SUPERVISOR_SUBMITTED" }),
      darfBearbeiten: true,
      zeilen: [
        zeileDaten({ id: "it" }),
        zeileDaten({ id: "fac", positionId: "pos-f", departmentKey: "FACILITY" }),
        zeileDaten({ id: "hr", positionId: "pos-h", departmentKey: "HR", bezeichnung: "Jobticket" }),
      ],
      hinweise: [],
      arbeitsortId: GS,
      konfigs: [
        konfig({ departmentName: "IT zentral" }),
        konfig({ departmentName: "IT der Grundschule", organizationId: GS }),
        konfig({ departmentKey: "FACILITY", departmentName: "Hausmeister Gymnasium", organizationId: GYM }),
      ],
      katalog: [],
    });
    expect(u.gruppen.map((g) => [g.departmentKey, g.stelleName, g.adresseFehlt])).toEqual([
      ["IT", "IT der Grundschule", false],
      ["FACILITY", DEPARTMENT_LABELS.FACILITY, true],
      ["HR", DEPARTMENT_LABELS.HR, false],
    ]);
  });

  it("Einleitung mit Berliner Datum der Abgabe — nur, wenn etwas von der Fuehrungskraft stammt", () => {
    const eingereicht = vorgang({ eingereicht: true, mitAusstattung: true, status: "SUPERVISOR_SUBMITTED" });
    expect(bauen(eingereicht, true).einleitung).toBe(
      "Angefordert von der Führungskraft mit den Einstellungsmodalitäten (14.01.2027).",
    );
    expect(bauen(eingereicht, true).angefordertAm).toBe("2027-01-14T09:30:00.000Z");
    expect(bauen(eingereicht, true, { zeilen: [zeileDaten({ quelle: "HR" })] }).einleitung).toBeNull();
    expect(bauen(vorgang({ eingereicht: false, mitAusstattung: true, status: "IN_PROGRESS" }), true).einleitung).toBeNull();
  });

  it("Satz fuer eine leere Karte", () => {
    const leer = (v: UebersichtVorgangStand, hr = true) => bauen(v, hr, { zeilen: [] }).leer;
    expect(leer(vorgang({ eingereicht: false, mitAusstattung: true, status: "IN_PROGRESS" }))).toBe(
      MELDUNGEN.UEBERSICHT_NOCH_NICHTS,
    );
    expect(leer(vorgang({ eingereicht: false, mitAusstattung: false, status: "IN_PROGRESS" }))).toBeNull();
    expect(leer(vorgang({ eingereicht: true, mitAusstattung: true, status: "SUPERVISOR_SUBMITTED" }))).toBe(
      MELDUNGEN.UEBERSICHT_NICHTS_ANGEFORDERT,
    );
    expect(leer(vorgang({ eingereicht: true, mitAusstattung: false, status: "SUPERVISOR_SUBMITTED" }))).toBe(
      MELDUNGEN.UEBERSICHT_LEER,
    );
    expect(leer(vorgang({ eingereicht: true, mitAusstattung: true, status: "COMPLETED" }))).toBe(
      MELDUNGEN.UEBERSICHT_NICHTS_ANGEFORDERT,
    );
    // mit Gruppen kein Leersatz
    expect(bauen(vorgang({ eingereicht: true, mitAusstattung: true, status: "SUPERVISOR_SUBMITTED" }), true).leer).toBeNull();
  });

  it("die Uebersicht ist reines JSON (geht ueber die Detailroute hinaus)", () => {
    const u = bauen(vorgang({ eingereicht: true, mitAusstattung: true, status: "SUPERVISOR_SUBMITTED" }), true, {
      zeilen: [zeileDaten({ bemerkung: "Mit Stift", quelle: "HR", erfasstVonId: "u-1" })],
    });
    expect(JSON.parse(JSON.stringify(u))).toEqual(u);
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
    // Seit S10 auch onboarding-spuren (eingereicht?) und format (Datum in
    // deutscher Zeit) — beide selbst ohne jeden Import, also ebenso rein.
    expect(importe.sort()).toEqual([
      "@/lib/abteilungsaufgaben",
      "@/lib/constants",
      "@/lib/format",
      "@/lib/onboarding-spuren",
    ]);
    for (const datei of ["src/lib/format.ts", "src/lib/onboarding-spuren.ts"]) {
      expect(`${datei}: ${quelle(datei).match(/^import\s/m)?.[0] ?? "ohne Importe"}`).toBe(`${datei}: ohne Importe`);
    }
  });

  it("abteilungsaufgaben.ts importiert ausstattung.ts nicht (kein Kreis)", () => {
    expect(quelle("src/lib/abteilungsaufgaben.ts")).not.toMatch(/from\s+"@\/lib\/ausstattung"/);
  });
});
