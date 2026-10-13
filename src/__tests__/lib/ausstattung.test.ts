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
 * Feinplan S12: Aufgaben je Option (sollAufgaben, hinweisSollAufgabe,
 * fehlendeAusstattungsAufgaben), Faelligkeit beim Anlegen mit „Eilt“
 * (ausstattungsFaelligkeit — Berliner Kalendertag, Sommerzeitwechsel), die
 * Anhebung beim Versand (anzuhebendeAufgaben, F22) und die Vorlauf-Warnung.
 *
 * Feinplan S13: Angaben und Hinweis fuer die Mail an die Stelle (angabenFuer:
 * eigene und freigegebene, ohne gestrichene, leere und geleerte;
 * angabenMailFelder: Klartext roh, HTML maskiert). bemerkungLabel (drei
 * Quellen) steht schon seit S10 unten bei den Herkunftstexten.
 *
 * Feinplan S14: der Fortschritt ohne entfallene Aufgaben (checklistFortschritt,
 * F2 — auch „nur Entfallene“) und die Zeile im Dialog „Abteilungen
 * informieren“ (ausstattungVorschauSatz).
 *
 * Feinplan S15: die HR-Karte — Regel 9 als Matrix (aenderungPruefen: je
 * Aufgabenstand × Aenderung; hinweisAenderungPruefen), die Eintraege der
 * Aenderungsliste (aenderungsEintraege: nur informierte Stellen, nur
 * Inhaltsfelder, Stellenwechsel, keine reine Faelligkeit), ihre Staende
 * (zeilenAenderungsStand, hinweisAenderungsStand), aufgabenStatus,
 * waehlbareStellen und die Uebersicht mit Aufgabenstand, Aktionen,
 * Vorlauf-Warnung und Hinweis-Aufgabe.
 *
 * Feinplan S16: die Anzeige im Portal — der Stand einer Aufgabe als Text
 * (aufgabenStandText), je Option eine Zeile mit eigenem Stand (optionsZeilen)
 * und die Bemerkung je Aufgabe fuer den Zusatz am Checklistenpunkt
 * (bemerkungJeAufgabe, nur aus der Uebersicht von HR).
 *
 * Feinplan S18: die Sammelmail an HR (E-A18) — der letzte Werktag vor
 * Dienstbeginn (letzterWerktagVor: Mo–Fr, Feiertage zaehlen als Werktag), das
 * Fenster bis einschliesslich Dienstbeginn in Berliner Kalendertagen
 * (sammelmailFaellig, auch ueber beide Zeitumstellungen) und die Liste
 * „Titel – Stelle“ (sammelmailListenFelder).
 *
 * Feinplan S19: die Rueckfrage beim Abschluss (E-A19) — die offenen
 * Ausstattungs- und Hinweis-Aufgaben als „Titel – Stelle“
 * (abschlussOffeneAufgaben, stelleAmArbeitsort) und die Meldung der 409
 * (abschlussOffenMeldung).
 *
 * Feinplan S20: die Loeschfrist der Freitexte (freitextGrenze — 6 Monate,
 * Monatsende 31.08. → 28./29.02., Berliner Zeit, Zeitumstellung) und der
 * Brief-Platzhalter {ausstattung_liste} (ausstattungListe — ohne Bemerkungen,
 * Angaben und Gestrichenes, Reihenfolge wie im Formular).
 *
 * Feinplan A4, S23: die Katalogfelder „Beim Austritt“ — ausgabeFelderPruefen
 * als Matrix (auch ueber positionPruefen), beiAustrittText, die Unterzeile der
 * Katalogseite, die Positivliste samt Protokoll (katalogWerte,
 * katalogAenderungen) und die Momentaufnahme mit den A4-Werten.
 *
 * Ohne Datenbank und ohne Uhr. Die Schema-Kommentare haelt
 * ausstattung-schema.test.ts, die Zod-Schemas ausstattung-validierung.test.ts.
 */

import fs from "fs";
import path from "path";
import { DEPARTMENT_LABELS, RETURN_CATEGORY_LABELS, RUECKGABE_KATEGORIEN } from "@/lib/constants";
import { WAECHTER_TAGE as WAECHTER_TAGE_ABTEILUNGEN, type AbteilungsKonfig } from "@/lib/abteilungsaufgaben";
import {
  FREITEXT_AUFBEWAHRUNG_MONATE,
  ausstattungListe,
  freitextGrenze,
  type BriefListenZeile,
  ABSCHLUSS_AUSSTATTUNG_OFFEN,
  abschlussOffeneAufgaben,
  abschlussOffenMeldung,
  stelleAmArbeitsort,
  LEERER_NACHTRAG,
  nachtragListe,
  nachtragMailFelder,
  neuGemeldeteTitel,
  WAECHTER_TAGE,
  aenderungPruefen,
  aenderungsEintraege,
  aenderungsGrundText,
  aufgabenStatus,
  aufgabenStandText,
  bemerkungJeAufgabe,
  optionsZeilen,
  type AusstattungsZeile,
  hinweisAenderungPruefen,
  hinweisAenderungsStand,
  waehlbareStellen,
  zeilenAenderungsStand,
  type AenderungsStand,
  type AufgabenStatus,
  type UebersichtAufgabeDaten,
  type UebersichtVerknuepfung,
  AEHNLICH_MIN_ZEICHEN,
  AENDERUNGEN_NACH_ABGABE_HINWEIS,
  AUSSTATTUNG_ENDSTATUS,
  ANGABE_SCHLUESSEL,
  ANGABEN_KATALOG,
  ART_NAMEN,
  AUSSTATTUNG_ARTEN,
  BEI_AUSTRITT,
  BEI_AUSTRITT_NAMEN,
  RUECKGABE_KATEGORIE_AUSWAHL,
  ausgabeFelderPruefen,
  beiAustrittText,
  istBeiAustritt,
  AUSSTATTUNG_QUELLEN,
  BEMERKUNG_HINWEIS,
  BEMERKUNG_QUELLEN,
  GRENZEN,
  HINWEIS_ANGABE_LABEL,
  HINWEIS_AUFGABE_BESCHREIBUNG,
  HINWEIS_AUFGABE_TITEL,
  HINWEIS_FAELLIG_TAGE,
  HINWEIS_ORDER_BASIS,
  KATALOG_FELDER,
  KEINE_ANGABEN,
  MELDUNGEN,
  NICHT_ERLAUBTE_STELLEN,
  ORDER_BASIS,
  REIHENFOLGE_MAX,
  VORSCHLAEGE,
  adressLuecken,
  aehnlicheVorlagenpunkte,
  angabenFuer,
  angabenMailFelder,
  arbeitsortSpeicherwert,
  arbeitsortSperrGrund,
  anzuhebendeAufgaben,
  aufgabenTitel,
  ausstattungKurz,
  ausstattungVorschauSatz,
  checklistFortschritt,
  AUSSTATTUNG_KATEGORIE,
  ausstattungsFaelligkeit,
  ausstattungsGruppen,
  ausstattungsUebersichtBauen,
  ausstattungsZustand,
  bemerkungLabel,
  bemerkungQuelleNach,
  fehlendeAusstattungsAufgaben,
  hinweisLabel,
  hinweisSollAufgabe,
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
  sollAufgaben,
  SAMMELMAIL_EVENT,
  letzterWerktagVor,
  sammelmailFaellig,
  sammelmailListenFelder,
  vorlaufWarnung,
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
  type AusstattungsStand,
  type SollAufgabenZeile,
  type AngabenHinweis,
  type AngabenZeile,
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

  describe("Beim Austritt (A4, G8)", () => {
    const rueckgabe = { beiAustritt: "RUECKGABE", rueckgabeKategorie: "IT_HARDWARE", ausgabeKennung: "Inventarnummer" };

    it("gueltig: leer, NICHTS, SPERREN mit und ohne Kennung, RUECKGABE mit Kategorie und Kennung", () => {
      expect(positionPruefen(position())).toBeNull();
      expect(positionPruefen(position({ beiAustritt: "NICHTS" }))).toBeNull();
      expect(positionPruefen(position({ beiAustritt: "SPERREN" }))).toBeNull();
      expect(positionPruefen(auswahl({ beiAustritt: "SPERREN", ausgabeKennung: "Benutzername" }))).toBeNull();
      expect(positionPruefen(position(rueckgabe))).toBeNull();
      expect(positionPruefen(auswahl({ ...rueckgabe, rueckgabeKategorie: "SCHLUESSEL", ausgabeKennung: null }))).toBeNull();
      // Leerzeichen zaehlen als leer.
      expect(positionPruefen(position({ beiAustritt: " ", rueckgabeKategorie: "", ausgabeKennung: "  " }))).toBeNull();
    });

    it.each([
      ["ANGABE mit beiAustritt", angabe({ beiAustritt: "NICHTS" }), MELDUNGEN.AUSTRITT_NICHT_BEI_ANGABE],
      ["ANGABE mit Kategorie", angabe({ rueckgabeKategorie: "IT_HARDWARE" }), MELDUNGEN.AUSTRITT_NICHT_BEI_ANGABE],
      ["ANGABE mit Kennung", angabe({ ausgabeKennung: "Nr." }), MELDUNGEN.AUSTRITT_NICHT_BEI_ANGABE],
      ["unbekannter Wert", position({ beiAustritt: "BEHALTEN" }), MELDUNGEN.BEI_AUSTRITT_UNBEKANNT],
      ["RUECKGABE ohne Kategorie", position({ beiAustritt: "RUECKGABE" }), MELDUNGEN.RUECKGABEKATEGORIE_FEHLT],
      ["RUECKGABE mit alter Testkategorie", position({ ...rueckgabe, rueckgabeKategorie: "IT_GERAET" }), MELDUNGEN.RUECKGABEKATEGORIE_UNBEKANNT],
      ["Kategorie bei SPERREN", position({ beiAustritt: "SPERREN", rueckgabeKategorie: "SCHLUESSEL" }), MELDUNGEN.RUECKGABEKATEGORIE_NUR_RUECKGABE],
      ["Kategorie ohne beiAustritt", position({ rueckgabeKategorie: "SCHLUESSEL" }), MELDUNGEN.RUECKGABEKATEGORIE_NUR_RUECKGABE],
      ["Kennung bei NICHTS", position({ beiAustritt: "NICHTS", ausgabeKennung: "Nr." }), MELDUNGEN.KENNUNG_NUR_AUSGABE],
      ["Kennung ohne beiAustritt", position({ ausgabeKennung: "Nr." }), MELDUNGEN.KENNUNG_NUR_AUSGABE],
      [
        "Kennung zu lang",
        position({ ...rueckgabe, ausgabeKennung: "x".repeat(GRENZEN.ausgabeKennung + 1) }),
        MELDUNGEN.KENNUNG_LABEL_ZU_LANG,
      ],
    ])("%s → Fehler", (_name, p, meldung) => {
      expect(positionPruefen(p)).toBe(meldung);
      expect(ausgabeFelderPruefen(p)).toBe(meldung);
    });

    it("Kennung bis GRENZEN.ausgabeKennung Zeichen; jede ReturnCategory ist eine Kategorie", () => {
      expect(positionPruefen(position({ ...rueckgabe, ausgabeKennung: "x".repeat(GRENZEN.ausgabeKennung) }))).toBeNull();
      for (const kategorie of RUECKGABE_KATEGORIEN) {
        expect(positionPruefen(position({ ...rueckgabe, rueckgabeKategorie: kategorie }))).toBeNull();
      }
    });

    it("eine Angabe ohne A4-Werte bleibt gueltig; die A4-Pruefung kommt nach den Regeln der Art", () => {
      expect(positionPruefen(angabe())).toBeNull();
      // Die Art-Regel meldet sich zuerst — eine kaputte Angabe bleibt eine kaputte Angabe.
      expect(positionPruefen(angabe({ angabeSchluessel: "RELIGION", beiAustritt: "RUECKGABE" }))).toBe(
        MELDUNGEN.ANGABE_UNBEKANNT,
      );
    });

    it("istBeiAustritt und die Namen kennen genau BEI_AUSTRITT", () => {
      for (const w of BEI_AUSTRITT) expect(istBeiAustritt(w)).toBe(true);
      for (const w of ["", null, undefined, "rueckgabe", "toString"]) expect(istBeiAustritt(w)).toBe(false);
      expect(Object.keys(BEI_AUSTRITT_NAMEN).sort()).toEqual([...BEI_AUSTRITT].sort());
    });

    it("RUECKGABE_KATEGORIE_AUSWAHL: jede ReturnCategory mit ihrem Namen, in derselben Reihenfolge", () => {
      expect(RUECKGABE_KATEGORIE_AUSWAHL.map((k) => k.wert)).toEqual([...RUECKGABE_KATEGORIEN]);
      for (const k of RUECKGABE_KATEGORIE_AUSWAHL) expect(k.name).toBe(RETURN_CATEGORY_LABELS[k.wert]);
    });

    it("beiAustrittText: Kurzform fuer Katalogseite und Dialoge, null solange nichts festgelegt ist", () => {
      expect(beiAustrittText({})).toBeNull();
      expect(beiAustrittText({ beiAustritt: null })).toBeNull();
      expect(beiAustrittText({ beiAustritt: "BEHALTEN" })).toBeNull();
      expect(beiAustrittText({ beiAustritt: "NICHTS" })).toBe("nichts");
      expect(beiAustrittText({ beiAustritt: "SPERREN" })).toBe("sperren");
      expect(beiAustrittText({ beiAustritt: "SPERREN", ausgabeKennung: "Benutzername" })).toBe(
        "sperren, Kennung „Benutzername“",
      );
      expect(beiAustrittText(rueckgabe)).toBe("zurückgeben (IT-Hardware), Kennung „Inventarnummer“");
      expect(beiAustrittText({ beiAustritt: "RUECKGABE", rueckgabeKategorie: "SCHLUESSEL" })).toBe(
        "zurückgeben (Schlüssel & Zugangskarten)",
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
    rueckgabeKategorie: "IT_HARDWARE",
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
  it("nimmt genau die Felder der Positivliste — seit S23 mit den A4-Feldern —, ohne ID und vorschlagSchluessel", () => {
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
    expect(werte).toMatchObject({
      departmentKey: "FACILITY",
      art: "AUSWAHL",
      isActive: true,
      orderIndex: 0,
      beiAustritt: "RUECKGABE",
      rueckgabeKategorie: "SCHLUESSEL",
      ausgabeKennung: "Schlüsselnummer",
    });
    expect(werte).not.toHaveProperty("vorschlagSchluessel");
  });

  it("ein fehlendes A4-Feld (Vorschlag, aeltere Testdaten) wird null", () => {
    const werte = katalogWerte(auswahl());
    expect(werte).toMatchObject({ beiAustritt: null, rueckgabeKategorie: null, ausgabeKennung: null });
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
    const aenderung = { vorschlagSchluessel: "X", id: "fremd", createdAt: new Date() } as unknown as Parameters<
      typeof katalogAenderungen
    >[1];
    expect(katalogAenderungen(bisher, aenderung)).toEqual({ daten: {}, aenderungen: {} });
  });

  it("A4-Felder (S23): Aenderung mit von/nach; ein fehlender bisheriger Wert zaehlt als null", () => {
    const { daten, aenderungen } = katalogAenderungen(bisher, {
      beiAustritt: "RUECKGABE",
      rueckgabeKategorie: "SCHLUESSEL",
      ausgabeKennung: null,
    });
    expect(daten).toEqual({ beiAustritt: "RUECKGABE", rueckgabeKategorie: "SCHLUESSEL" });
    expect(aenderungen).toEqual({
      beiAustritt: { von: null, nach: "RUECKGABE" },
      rueckgabeKategorie: { von: null, nach: "SCHLUESSEL" },
    });
    // Zuruecksetzen auf „nicht festgelegt“ ist eine Aenderung.
    const gesetzt = { ...bisher, beiAustritt: "SPERREN", ausgabeKennung: "Benutzername" };
    expect(katalogAenderungen(gesetzt, { beiAustritt: null, ausgabeKennung: null }).aenderungen).toEqual({
      beiAustritt: { von: "SPERREN", nach: null },
      ausgabeKennung: { von: "Benutzername", nach: null },
    });
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

    it("A4 (S23): „beim Austritt: …“ in der kleinen Zeile, nur wenn festgelegt", () => {
      const schluessel = eintrag(
        auswahl({
          id: "p-a4",
          beiAustritt: "RUECKGABE",
          rueckgabeKategorie: "SCHLUESSEL",
          ausgabeKennung: "Schlüsselnummer",
          aufgabeTitel: null,
        }),
      );
      const zugang = eintrag(position({ id: "p-a4-zugang", beiAustritt: "SPERREN", bemerkungAnbieten: false }));
      const zeilen = katalogZeilen(daten([schluessel, zugang, IPAD]), ALLE);
      expect(zeile(zeilen, "p-a4").details).toContain(
        "beim Austritt: zurückgeben (Schlüssel & Zugangskarten), Kennung „Schlüsselnummer“",
      );
      expect(zeile(zeilen, "p-a4-zugang").details).toEqual(["ohne Bemerkung", "beim Austritt: sperren"]);
      expect(zeile(zeilen, "p-ipad").details.join(" ")).not.toContain("beim Austritt");
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

  it("ein leerer Hinweis fuer die Stelle wird null; die A4-Felder kommen wie sie sind (S23)", () => {
    const m = momentaufnahme(
      position({ hinweisStelle: "   ", beiAustritt: "RUECKGABE", rueckgabeKategorie: "IT_HARDWARE", ausgabeKennung: "Inventarnummer" }),
    );
    expect(m.hinweisStelle).toBeNull();
    expect(m).toMatchObject({ beiAustritt: "RUECKGABE", rueckgabeKategorie: "IT_HARDWARE", ausgabeKennung: "Inventarnummer" });
    expect(momentaufnahme(auswahl({ beiAustritt: "SPERREN" }))).toMatchObject({
      beiAustritt: "SPERREN",
      rueckgabeKategorie: null,
      ausgabeKennung: null,
    });
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
// Aufgaben je Option, Faelligkeit, „Eilt“ (S12)
// =============================================

function sollZeile(teil: Partial<SollAufgabenZeile> = {}): SollAufgabenZeile {
  return {
    departmentKey: "IT",
    art: "JA_NEIN",
    bezeichnung: "Dienst-iPad (Lernmittel)",
    aufgabeTitel: "Dienst-iPad (Lernmittel) bereitstellen",
    hinweisStelle: null,
    relativeDueDays: -5,
    reihenfolge: 3,
    auswahl: [],
    gestrichenAm: null,
    ...teil,
  };
}

function schluesselZeile(teil: Partial<SollAufgabenZeile> = {}): SollAufgabenZeile {
  return sollZeile({
    departmentKey: "FACILITY",
    art: "AUSWAHL",
    bezeichnung: "Schlüssel",
    aufgabeTitel: "Schlüssel ausgeben",
    relativeDueDays: -7,
    reihenfolge: 1,
    auswahl: ["Haupteingang", "Lehrerzimmer"],
    ...teil,
  });
}

/** Mitternacht UTC eines Kalendertags — so stehen Faelligkeiten in der Datenbank. */
const tag = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("sollAufgaben (E-A12)", () => {
  it("Ja/Nein: genau eine Aufgabe ohne Option, Titel aus der Momentaufnahme", () => {
    expect(sollAufgaben(sollZeile({ hinweisStelle: "Inventarnummer notieren." }))).toEqual([
      {
        option: "",
        titel: "Dienst-iPad (Lernmittel) bereitstellen",
        orderIndex: ORDER_BASIS + 300,
        relativeDueDays: -5,
        description: "Inventarnummer notieren.",
      },
    ]);
  });

  it("Ja/Nein ohne gespeicherten Titel: „<Bezeichnung> bereitstellen“; ohne Tage bleibt die Frist leer", () => {
    const [a] = sollAufgaben(sollZeile({ aufgabeTitel: "", relativeDueDays: null, hinweisStelle: "  " }));
    expect(a.titel).toBe("Dienst-iPad (Lernmittel) bereitstellen");
    expect(a.relativeDueDays).toBeNull();
    expect(a.description).toBeNull();
  });

  it("Auswahl: je gewaehlter Option eine Aufgabe, Titel mit Option, orderIndex nach ORDER_BASIS", () => {
    expect(sollAufgaben(schluesselZeile())).toEqual([
      {
        option: "Haupteingang",
        titel: "Schlüssel ausgeben: Haupteingang",
        orderIndex: ORDER_BASIS + 100,
        relativeDueDays: -7,
        description: null,
      },
      {
        option: "Lehrerzimmer",
        titel: "Schlüssel ausgeben: Lehrerzimmer",
        orderIndex: ORDER_BASIS + 101,
        relativeDueDays: -7,
        description: null,
      },
    ]);
  });

  it("Auswahl: doppelte und leere Optionen fallen weg (Primaerschluessel ausstattungId/option)", () => {
    const optionen = sollAufgaben(
      schluesselZeile({ auswahl: ["Haupteingang", " Haupteingang ", "", "Lehrerzimmer"] }),
    ).map((a) => a.option);
    expect(optionen).toEqual(["Haupteingang", "Lehrerzimmer"]);
  });

  it("Angabe, gestrichene Zeile, leere Auswahl und nicht erlaubte Stellen: keine Aufgabe", () => {
    expect(sollAufgaben(sollZeile({ art: "ANGABE", aufgabeTitel: "" }))).toEqual([]);
    expect(sollAufgaben(sollZeile({ gestrichenAm: new Date("2026-09-20T10:00:00Z") }))).toEqual([]);
    expect(sollAufgaben(schluesselZeile({ auswahl: [] }))).toEqual([]);
    for (const stelle of NICHT_ERLAUBTE_STELLEN) {
      expect(sollAufgaben(sollZeile({ departmentKey: stelle }))).toEqual([]);
    }
  });

  it("jede Ausstattungsaufgabe steht vor den Hinweis-Aufgaben und vor allen Vorlagenpunkten", () => {
    const [letzte] = sollAufgaben(sollZeile({ reihenfolge: REIHENFOLGE_MAX })).slice(-1);
    expect(letzte.orderIndex).toBeLessThan(HINWEIS_ORDER_BASIS);
    expect(HINWEIS_ORDER_BASIS).toBeLessThan(0);
  });
});

describe("hinweisSollAufgabe (E-A14, F20)", () => {
  it("Titel, ortsneutrale Beschreibung und −7 Tage", () => {
    expect(hinweisSollAufgabe("IT", ["IT"])).toEqual({
      option: "",
      titel: HINWEIS_AUFGABE_TITEL,
      orderIndex: HINWEIS_ORDER_BASIS,
      relativeDueDays: HINWEIS_FAELLIG_TAGE,
      description: HINWEIS_AUFGABE_BESCHREIBUNG,
    });
    expect(HINWEIS_FAELLIG_TAGE).toBe(-7);
  });

  it("orderIndex nach der Reihenfolge der Abteilungskarte, zwischen Ausstattung und Vorlage", () => {
    const stellen = ["FACILITY", "IT", "HR"];
    const it = hinweisSollAufgabe("IT", stellen).orderIndex;
    const facility = hinweisSollAufgabe("FACILITY", stellen).orderIndex;
    expect(it).toBeLessThan(facility);
    expect(facility).toBeLessThan(0);
    expect(it).toBeGreaterThanOrEqual(HINWEIS_ORDER_BASIS);
  });
});

describe("fehlendeAusstattungsAufgaben (Regel 6, F23)", () => {
  function stand(teil: Partial<AusstattungsStand> = {}): AusstattungsStand {
    return {
      zeilen: [
        { id: "aus-ipad", ...sollZeile() },
        { id: "aus-schluessel", ...schluesselZeile() },
      ],
      verknuepfungen: [],
      hinweise: [],
      ...teil,
    };
  }

  it("ohne Verknuepfungen fehlen alle Soll-Aufgaben, mit Herkunft, Stelle und Zeile", () => {
    const fehlend = fehlendeAusstattungsAufgaben(stand());
    expect(fehlend.map((f) => [f.ausstattungId, f.option, f.departmentKey, f.herkunft])).toEqual([
      ["aus-ipad", "", "IT", "AUSSTATTUNG"],
      ["aus-schluessel", "Haupteingang", "FACILITY", "AUSSTATTUNG"],
      ["aus-schluessel", "Lehrerzimmer", "FACILITY", "AUSSTATTUNG"],
    ]);
  });

  it("eine vorhandene Verknuepfung — auch zu einer entfallenen Aufgabe — wird nie ein zweites Mal angelegt", () => {
    const fehlend = fehlendeAusstattungsAufgaben(
      stand({
        verknuepfungen: [
          { ausstattungId: "aus-ipad", option: "" },
          { ausstattungId: "aus-schluessel", option: "Haupteingang" },
        ],
      }),
    );
    expect(fehlend.map((f) => f.titel)).toEqual(["Schlüssel ausgeben: Lehrerzimmer"]);
  });

  it("Hinweise: nur mit Text, ohne Aufgabe, nicht geleert, nie an MITARBEITER/VORGESETZTER — in der Reihenfolge der Karte", () => {
    const fehlend = fehlendeAusstattungsAufgaben(
      stand({
        zeilen: [],
        hinweise: [
          { departmentKey: "FACILITY", text: "Bitte Spind im EG", checklistItemId: null },
          { departmentKey: "IT", text: "Mac statt PC", checklistItemId: null },
          { departmentKey: "VERWALTUNG", text: "schon da", checklistItemId: "i-9" },
          { departmentKey: "DSB", text: "  ", checklistItemId: null },
          { departmentKey: "BUCHHALTUNG", text: "geleert", checklistItemId: null, inhaltGeleertAm: new Date() },
          { departmentKey: "VORGESETZTER", text: "nie", checklistItemId: null },
        ],
      }),
    );
    expect(fehlend.map((f) => [f.departmentKey, f.herkunft, f.ausstattungId, f.titel])).toEqual([
      ["IT", "HINWEIS", null, HINWEIS_AUFGABE_TITEL],
      ["FACILITY", "HINWEIS", null, HINWEIS_AUFGABE_TITEL],
    ]);
    expect(fehlend.every((f) => f.relativeDueDays === HINWEIS_FAELLIG_TAGE)).toBe(true);
  });
});

describe("ausstattungsFaelligkeit (Regel 14)", () => {
  const BEGINN = tag("2026-10-01");

  it("regulaer: Vertragsbeginn + Tage, kein „Eilt“", () => {
    expect(ausstattungsFaelligkeit(BEGINN, -7, new Date("2026-09-20T08:00:00Z"))).toEqual({
      dueDate: tag("2026-09-24"),
      eilt: false,
    });
  });

  it("Frist schon verstrichen: heute und „Eilt“", () => {
    expect(ausstattungsFaelligkeit(BEGINN, -7, new Date("2026-09-25T08:00:00Z"))).toEqual({
      dueDate: tag("2026-09-25"),
      eilt: true,
    });
  });

  it("Frist ist heute: bleibt, kein „Eilt“", () => {
    expect(ausstattungsFaelligkeit(BEGINN, -7, new Date("2026-09-24T15:00:00Z"))).toEqual({
      dueDate: tag("2026-09-24"),
      eilt: false,
    });
  });

  it("Berliner Kalendertag: 23:30 UTC am Vortag ist dort schon der naechste Tag", () => {
    // 24.09. 23:30 UTC = 25.09. 01:30 in Berlin (Sommerzeit)
    expect(ausstattungsFaelligkeit(BEGINN, -7, new Date("2026-09-24T23:30:00Z"))).toEqual({
      dueDate: tag("2026-09-25"),
      eilt: true,
    });
    // Winterzeit: 14.01. 23:30 UTC = 15.01. 00:30 in Berlin
    expect(ausstattungsFaelligkeit(tag("2027-01-20"), -7, new Date("2027-01-14T23:30:00Z"))).toEqual({
      dueDate: tag("2027-01-15"),
      eilt: true,
    });
  });

  it("Sommerzeitwechsel Ende Maerz (28.03.2027) und Ende Oktober (25.10.2026)", () => {
    // Samstag 27.03. 23:30 UTC = Sonntag 28.03. 00:30 (noch Winterzeit, UTC+1)
    expect(ausstattungsFaelligkeit(tag("2027-04-01"), -7, new Date("2027-03-27T23:30:00Z"))).toEqual({
      dueDate: tag("2027-03-28"),
      eilt: true,
    });
    // Sonntag 28.03. 22:30 UTC = Montag 29.03. 00:30 (Sommerzeit, UTC+2)
    expect(ausstattungsFaelligkeit(tag("2027-04-01"), -7, new Date("2027-03-28T22:30:00Z"))).toEqual({
      dueDate: tag("2027-03-29"),
      eilt: true,
    });
    // Samstag 24.10. 22:30 UTC = Sonntag 25.10. 00:30 (noch Sommerzeit)
    expect(ausstattungsFaelligkeit(tag("2026-10-29"), -7, new Date("2026-10-24T22:30:00Z"))).toEqual({
      dueDate: tag("2026-10-25"),
      eilt: true,
    });
    // Sonntag 25.10. 22:30 UTC = Sonntag 25.10. 23:30 (Winterzeit, UTC+1) — noch derselbe Tag
    expect(ausstattungsFaelligkeit(tag("2026-10-29"), -7, new Date("2026-10-25T22:30:00Z"))).toEqual({
      dueDate: tag("2026-10-25"),
      eilt: true,
    });
    // Sonntag 25.10. 23:30 UTC = Montag 26.10. 00:30
    expect(ausstattungsFaelligkeit(tag("2026-10-29"), -7, new Date("2026-10-25T23:30:00Z"))).toEqual({
      dueDate: tag("2026-10-26"),
      eilt: true,
    });
  });

  it("ohne Tage oder ohne Vertragsbeginn: null (keine Faelligkeit, nicht 0)", () => {
    expect(ausstattungsFaelligkeit(BEGINN, null, new Date("2026-09-20T08:00:00Z"))).toBeNull();
    expect(ausstattungsFaelligkeit(null, -7, new Date("2026-09-20T08:00:00Z"))).toBeNull();
  });
});

describe("anzuhebendeAufgaben (F22)", () => {
  const JETZT = new Date("2026-09-25T08:00:00Z");
  type Eingabe = Parameters<typeof anzuhebendeAufgaben>[0][number];
  const aufgabe = (teil: Partial<Eingabe> = {}): Eingabe => ({
    id: "a",
    dueDate: tag("2026-09-24"),
    createdAt: new Date("2026-09-15T10:00:00Z"),
    isCompleted: false,
    entfaelltAm: null,
    ...teil,
  });

  it("noch nie versendet: alle offenen, ueberfaelligen Aufgaben (heute faellig: keine)", () => {
    expect(
      anzuhebendeAufgaben(
        [
          aufgabe({ id: "alt" }),
          aufgabe({ id: "heute", dueDate: tag("2026-09-25") }),
          aufgabe({ id: "spaeter", dueDate: tag("2026-10-01") }),
        ],
        null,
        JETZT,
      ),
    ).toEqual(["alt"]);
  });

  it("schon zugestellt (createdAt vor dem letzten Versand): keine — die Frist bleibt", () => {
    expect(anzuhebendeAufgaben([aufgabe()], new Date("2026-09-16T09:00:00Z"), JETZT)).toEqual([]);
  });

  it("nach dem letzten Versand angelegt: wird angehoben", () => {
    expect(anzuhebendeAufgaben([aufgabe({ id: "neu" })], new Date("2026-09-14T09:00:00Z"), JETZT)).toEqual(["neu"]);
  });

  it("erledigt, entfallen oder ohne Faelligkeit: keine", () => {
    expect(
      anzuhebendeAufgaben(
        [
          aufgabe({ id: "erledigt", isCompleted: true }),
          aufgabe({ id: "entfaellt", isCompleted: true, entfaelltAm: new Date("2026-09-20T10:00:00Z") }),
          aufgabe({ id: "entfaellt-offen", entfaelltAm: new Date("2026-09-20T10:00:00Z") }),
          aufgabe({ id: "ohne", dueDate: null }),
        ],
        null,
        JETZT,
      ),
    ).toEqual([]);
  });

  it("heute im Berliner Kalendertag (23:30 UTC am Vortag)", () => {
    expect(anzuhebendeAufgaben([aufgabe()], null, new Date("2026-09-24T23:30:00Z"))).toEqual(["a"]);
    expect(anzuhebendeAufgaben([aufgabe()], null, new Date("2026-09-24T21:30:00Z"))).toEqual([]);
  });

  it("Zeitstempel als ISO-Text (JSON) werden gleich gelesen", () => {
    expect(
      anzuhebendeAufgaben(
        [aufgabe({ id: "json", dueDate: "2026-09-24T00:00:00.000Z", createdAt: "2026-09-20T10:00:00.000Z" })],
        "2026-09-18T10:00:00.000Z",
        JETZT,
      ),
    ).toEqual(["json"]);
  });

  it("vor dem letzten Versand angelegt, aber mit offenem Eintrag NEU (Stellenwechsel, F23): wird angehoben", () => {
    const VERSAND = new Date("2026-09-16T09:00:00Z");
    const neu = new Set(["Funkgerät bereitstellen"]);
    expect(
      anzuhebendeAufgaben(
        [
          aufgabe({ id: "zugezogen", title: "Funkgerät  bereitstellen " }),
          aufgabe({ id: "zugestellt", title: "Spind bereitstellen" }),
          aufgabe({ id: "ohne-titel" }),
          aufgabe({ id: "noch-nicht-faellig", title: "Funkgerät bereitstellen", dueDate: tag("2026-09-30") }),
          aufgabe({ id: "entfallen", title: "Funkgerät bereitstellen", entfaelltAm: new Date("2026-09-20T10:00:00Z") }),
        ],
        VERSAND,
        JETZT,
        neu,
      ),
    ).toEqual(["zugezogen"]);
    // Ohne Eintrag bleibt es bei „schon zugestellt“.
    expect(anzuhebendeAufgaben([aufgabe({ title: "Funkgerät bereitstellen" })], VERSAND, JETZT)).toEqual([]);
  });
});

describe("neuGemeldeteTitel (F22)", () => {
  const e = (art: string, titel: string, erfasstAm?: string) => ({
    art,
    titel,
    ...(erfasstAm ? { erfasstAm: `2026-09-${erfasstAm}T10:00:00.000Z` } : {}),
  });

  it("nur Titel, deren LETZTER offener Eintrag NEU ist", () => {
    expect(
      neuGemeldeteTitel([
        e("NEU", "Zugezogen"),
        e("ENTFAELLT", "Wieder aufgenommen"),
        e("NEU", "Wieder aufgenommen"),
        e("NEU", "Gleich wieder weg"),
        e("ENTFAELLT", "Gleich wieder weg"),
        e("GEAENDERT", "Nur geaendert"),
      ]),
    ).toEqual(new Set(["Zugezogen", "Wieder aufgenommen"]));
  });

  it("Reihenfolge nach `erfasstAm`, Titel einzeilig wie in nachtragListe, leere fallen weg", () => {
    expect(
      neuGemeldeteTitel([e("NEU", "  Spind \n bereitstellen ", "22"), e("ENTFAELLT", "Spind bereitstellen", "21"), e("NEU", "  ")]),
    ).toEqual(new Set(["Spind bereitstellen"]));
    expect(neuGemeldeteTitel([e("ENTFAELLT", "Spind bereitstellen", "22"), e("NEU", "Spind bereitstellen", "21")])).toEqual(
      new Set(),
    );
    expect(neuGemeldeteTitel([])).toEqual(new Set());
  });
});

describe("vorlaufWarnung (Regel 14)", () => {
  const BEGINN = tag("2026-10-01");

  it("Vorlauf passt: keine Warnung", () => {
    expect(vorlaufWarnung(-14, BEGINN, new Date("2026-09-10T08:00:00Z"))).toBeNull();
    // Frist ist heute: passt noch
    expect(vorlaufWarnung(-14, BEGINN, new Date("2026-09-17T08:00:00Z"))).toBeNull();
  });

  it("Vorlauf passt nicht: Warnung mit festem Wortlaut", () => {
    expect(vorlaufWarnung(-14, BEGINN, new Date("2026-09-18T08:00:00Z"))).toBe(MELDUNGEN.VORLAUF_WARNUNG);
    expect(MELDUNGEN.VORLAUF_WARNUNG).toBe("bis Dienstbeginn voraussichtlich nicht verfügbar – Übergangslösung klären");
  });

  it("ohne Vorlauf (keine Tage, Frist am oder nach dem Beginn) oder ohne Beginn: keine Warnung", () => {
    const spaet = new Date("2026-12-01T08:00:00Z");
    expect(vorlaufWarnung(null, BEGINN, spaet)).toBeNull();
    expect(vorlaufWarnung(0, BEGINN, spaet)).toBeNull();
    expect(vorlaufWarnung(5, BEGINN, spaet)).toBeNull();
    expect(vorlaufWarnung(-14, null, spaet)).toBeNull();
  });
});

// =============================================
// Sammelmail an HR am Werktag vor Dienstbeginn (S18, E-A18)
// =============================================

describe("letzterWerktagVor (E-A18)", () => {
  it("Mo → Fr, Di → Mo, Fr → Do; Sa und So → Fr", () => {
    expect(letzterWerktagVor(tag("2026-10-05"))).toEqual(tag("2026-10-02")); // Montag
    expect(letzterWerktagVor(tag("2026-10-06"))).toEqual(tag("2026-10-05")); // Dienstag
    expect(letzterWerktagVor(tag("2026-10-02"))).toEqual(tag("2026-10-01")); // Freitag
    expect(letzterWerktagVor(tag("2026-10-03"))).toEqual(tag("2026-10-02")); // Samstag
    expect(letzterWerktagVor(tag("2026-10-04"))).toEqual(tag("2026-10-02")); // Sonntag
  });

  it("Feiertage zaehlen als Werktag (keine Feiertagsliste, Feinplan Abschnitt 5)", () => {
    // Neujahr 01.01.2027 und 1. Weihnachtstag 25.12.2026 sind Freitage.
    expect(letzterWerktagVor(tag("2027-01-04"))).toEqual(tag("2027-01-01"));
    expect(letzterWerktagVor(tag("2026-12-28"))).toEqual(tag("2026-12-25"));
  });

  it("Berliner Kalendertag: ein als Berliner Mitternacht gespeicherter Beginn zaehlt als sein Tag", () => {
    // 04.10. 22:00 UTC = Montag 05.10. 00:00 in Berlin (Sommerzeit)
    expect(letzterWerktagVor(new Date("2026-10-04T22:00:00Z"))).toEqual(tag("2026-10-02"));
    // Zeichenkette wie aus JSON
    expect(letzterWerktagVor("2026-10-06")).toEqual(tag("2026-10-05"));
  });

  it("unlesbar: ungueltiges Datum", () => {
    expect(Number.isNaN(letzterWerktagVor("kein Datum").getTime())).toBe(true);
  });
});

describe("sammelmailFaellig (E-A18)", () => {
  it("Dienstbeginn Montag: Freitag bis einschliesslich Montag, nicht Donnerstag, nicht Dienstag", () => {
    const montag = tag("2026-10-05");
    expect(sammelmailFaellig(montag, new Date("2026-10-01T10:00:00Z"))).toBe(false); // Do
    expect(sammelmailFaellig(montag, new Date("2026-10-02T06:00:00Z"))).toBe(true); // Fr
    expect(sammelmailFaellig(montag, new Date("2026-10-03T06:00:00Z"))).toBe(true); // Sa
    expect(sammelmailFaellig(montag, new Date("2026-10-04T06:00:00Z"))).toBe(true); // So
    expect(sammelmailFaellig(montag, new Date("2026-10-05T06:00:00Z"))).toBe(true); // Mo (Dienstbeginn)
    expect(sammelmailFaellig(montag, new Date("2026-10-06T06:00:00Z"))).toBe(false); // Di
  });

  it("Dienstbeginn Mittwoch: nur Dienstag und Mittwoch", () => {
    const mittwoch = tag("2026-10-07");
    expect(sammelmailFaellig(mittwoch, new Date("2026-10-05T06:00:00Z"))).toBe(false);
    expect(sammelmailFaellig(mittwoch, new Date("2026-10-06T06:00:00Z"))).toBe(true);
    expect(sammelmailFaellig(mittwoch, new Date("2026-10-07T06:00:00Z"))).toBe(true);
  });

  it("Feiertag ignoriert: Dienstbeginn Mo 04.01.2027 → schon an Neujahr (Freitag) fällig", () => {
    const beginn = tag("2027-01-04");
    expect(sammelmailFaellig(beginn, new Date("2026-12-31T10:00:00Z"))).toBe(false);
    expect(sammelmailFaellig(beginn, new Date("2027-01-01T10:00:00Z"))).toBe(true);
  });

  it("Sommerzeit Ende Oktober: Dienstbeginn Mo 26.10.2026, Fenster ab Fr 23.10. 00:00 Berliner Zeit", () => {
    const beginn = tag("2026-10-26");
    // Do 22.10. 21:59 UTC = 23:59 in Berlin (UTC+2)
    expect(sammelmailFaellig(beginn, new Date("2026-10-22T21:59:00Z"))).toBe(false);
    // Do 22.10. 22:30 UTC = Fr 23.10. 00:30 in Berlin
    expect(sammelmailFaellig(beginn, new Date("2026-10-22T22:30:00Z"))).toBe(true);
    // So 25.10. 23:30 UTC = Mo 26.10. 00:30 (nach der Umstellung UTC+1)
    expect(sammelmailFaellig(beginn, new Date("2026-10-25T23:30:00Z"))).toBe(true);
    // Mo 26.10. 22:59 UTC = 23:59 in Berlin: noch der Tag des Dienstbeginns
    expect(sammelmailFaellig(beginn, new Date("2026-10-26T22:59:00Z"))).toBe(true);
    // Mo 26.10. 23:00 UTC = Di 27.10. 00:00: vorbei
    expect(sammelmailFaellig(beginn, new Date("2026-10-26T23:00:00Z"))).toBe(false);
  });

  it("Sommerzeit Ende Maerz: Dienstbeginn Mo 30.03.2026, Fenster ab Fr 27.03. 00:00 Berliner Zeit", () => {
    const beginn = tag("2026-03-30");
    // Do 26.03. 22:30 UTC = 23:30 in Berlin (UTC+1)
    expect(sammelmailFaellig(beginn, new Date("2026-03-26T22:30:00Z"))).toBe(false);
    // Do 26.03. 23:30 UTC = Fr 27.03. 00:30
    expect(sammelmailFaellig(beginn, new Date("2026-03-26T23:30:00Z"))).toBe(true);
    // So 29.03. 22:30 UTC = Mo 30.03. 00:30 (nach der Umstellung UTC+2)
    expect(sammelmailFaellig(beginn, new Date("2026-03-29T22:30:00Z"))).toBe(true);
  });

  it("ohne oder mit unlesbarem Vertragsbeginn nie", () => {
    expect(sammelmailFaellig(null, new Date("2026-10-02T06:00:00Z"))).toBe(false);
    expect(sammelmailFaellig(undefined, new Date("2026-10-02T06:00:00Z"))).toBe(false);
    expect(sammelmailFaellig("kein Datum", new Date("2026-10-02T06:00:00Z"))).toBe(false);
  });
});

describe("sammelmailListenFelder (E-A18)", () => {
  const ORT = "org-grundschule";

  it("„Titel – Stelle“ je Zeile; Name am Arbeitsort vor dem zentralen, HR als Personalabteilung", () => {
    const f = sammelmailListenFelder({
      aufgaben: [
        { title: "Dienst-iPad (Lernmittel) bereitstellen", assignee: "IT" },
        { title: "Schlüssel ausgeben: Haupteingang", assignee: "FACILITY" },
        { title: "Jobticket beantragen", assignee: "HR" },
      ],
      arbeitsortId: ORT,
      konfigs: [
        konfig({ departmentKey: "IT", departmentName: "IT-Support FES", organizationId: null }),
        konfig({ departmentKey: "FACILITY", departmentName: "Hausmeister Grundschule", organizationId: ORT }),
        konfig({ departmentKey: "FACILITY", departmentName: "Facility zentral", organizationId: null }),
      ],
    });
    expect(f.anzahl_offen).toBe(3);
    expect(f.offene_liste).toBe(
      "- Dienst-iPad (Lernmittel) bereitstellen – IT-Support FES\n" +
        "- Schlüssel ausgeben: Haupteingang – Hausmeister Grundschule\n" +
        "- Jobticket beantragen – Personalabteilung",
    );
    expect(f.offene_liste_html).toBe(
      '<ul style="margin:0 0 16px;padding-left:20px;color:#374151;font-size:14px;line-height:1.6;">' +
        '<li style="margin:0 0 4px;">Dienst-iPad (Lernmittel) bereitstellen – IT-Support FES</li>' +
        '<li style="margin:0 0 4px;">Schlüssel ausgeben: Haupteingang – Hausmeister Grundschule</li>' +
        '<li style="margin:0 0 4px;">Jobticket beantragen – Personalabteilung</li>' +
        "</ul>",
    );
  });

  it("ohne Eintrag unter Einstellungen → Abteilungen: der bekannte Name, nie der Rohschluessel", () => {
    const f = sammelmailListenFelder({
      aufgaben: [{ title: "Hinweis der Führungskraft beachten", assignee: "FACILITY" }],
      arbeitsortId: ORT,
      konfigs: [],
    });
    expect(f.offene_liste).toBe("- Hinweis der Führungskraft beachten – Facility Management");
  });

  it("HTML maskiert, Klartext roh; ein Titel ist einzeilig", () => {
    const f = sammelmailListenFelder({
      aufgaben: [{ title: "Schrank <b>&</b>\nSchloss", assignee: null }],
      arbeitsortId: ORT,
      konfigs: [],
    });
    expect(f.offene_liste).toBe("- Schrank <b>&</b> Schloss");
    expect(f.offene_liste_html).toContain(">Schrank &lt;b&gt;&amp;&lt;/b&gt; Schloss</li>");
    expect(f.offene_liste_html).not.toContain("<b>");
  });

  it("ohne Aufgabe: 0 und leere Listen", () => {
    expect(sammelmailListenFelder({ aufgaben: [], arbeitsortId: ORT, konfigs: [] })).toEqual({
      anzahl_offen: 0,
      offene_liste: "",
      offene_liste_html: "",
    });
  });

  it("das Ereignis ist die Sammelmail des Katalogs", () => {
    expect(SAMMELMAIL_EVENT).toBe("onboarding-ausstattung-offen");
  });
});

// =============================================
// Abschluss mit offener Ausstattung (S19, E-A19)
// =============================================

describe("stelleAmArbeitsort / abschlussOffeneAufgaben / abschlussOffenMeldung (E-A19)", () => {
  const ORT = "org-grundschule";
  const KONFIGS = [
    konfig({ departmentKey: "IT", departmentName: "IT-Support FES", organizationId: null }),
    konfig({ departmentKey: "FACILITY", departmentName: "Hausmeister Grundschule", organizationId: ORT }),
    konfig({ departmentKey: "FACILITY", departmentName: "Facility zentral", organizationId: null }),
  ];

  it("Stelle wie in Karte und Sammelmail: am Arbeitsort vor zentral, HR als Personalabteilung, sonst das Label", () => {
    expect(stelleAmArbeitsort("FACILITY", ORT, KONFIGS)).toBe("Hausmeister Grundschule");
    expect(stelleAmArbeitsort("FACILITY", "org-andere", KONFIGS)).toBe("Facility zentral");
    expect(stelleAmArbeitsort("HR", ORT, KONFIGS)).toBe("Personalabteilung");
    expect(stelleAmArbeitsort("VERWALTUNG", ORT, [])).toBe(DEPARTMENT_LABELS.VERWALTUNG);
    expect(stelleAmArbeitsort(null, ORT, KONFIGS)).toBe("");
  });

  it("je offene Aufgabe Titel (einzeilig) und Stelle — in der Reihenfolge der Abfrage", () => {
    expect(
      abschlussOffeneAufgaben({
        aufgaben: [
          { title: "Dienst-iPad (Lernmittel) bereitstellen", assignee: "IT" },
          { title: "Hinweis der Führungskraft beachten", assignee: "FACILITY" },
          { title: "Schrank\nSchloss", assignee: null },
        ],
        arbeitsortId: ORT,
        konfigs: KONFIGS,
      }),
    ).toEqual([
      { titel: "Dienst-iPad (Lernmittel) bereitstellen", stelle: "IT-Support FES" },
      { titel: "Hinweis der Führungskraft beachten", stelle: "Hausmeister Grundschule" },
      { titel: "Schrank Schloss", stelle: "" },
    ]);
    expect(abschlussOffeneAufgaben({ aufgaben: [], arbeitsortId: ORT, konfigs: KONFIGS })).toEqual([]);
  });

  it("die Meldung nennt die Zahl und die Folge — Einzahl und Mehrzahl", () => {
    expect(abschlussOffenMeldung(1)).toBe(
      "Aus „Ausstattung & Zugänge“ ist noch 1 Aufgabe offen. Nach dem Abschluss können die Stellen sie nicht mehr abhaken – abschließen nur mit Bestätigung.",
    );
    expect(abschlussOffenMeldung(4)).toContain("sind noch 4 Aufgaben offen.");
    expect(ABSCHLUSS_AUSSTATTUNG_OFFEN).toBe("AUSSTATTUNG_OFFEN");
  });

  it("die Sammelmail nennt die Stellen nach derselben Regel (gemeinsame Hilfe)", () => {
    const f = sammelmailListenFelder({
      aufgaben: [{ title: "Hinweis der Führungskraft beachten", assignee: "FACILITY" }],
      arbeitsortId: ORT,
      konfigs: KONFIGS,
    });
    expect(f.offene_liste).toBe(`- Hinweis der Führungskraft beachten – ${stelleAmArbeitsort("FACILITY", ORT, KONFIGS)}`);
  });
});

// =============================================
// Mail an die Stelle: Angaben und Hinweis (S13, Regel 7)
// =============================================

describe("angabenFuer (Regel 7)", () => {
  function angabe(teil: Partial<AngabenZeile> & Pick<AngabenZeile, "departmentKey">): AngabenZeile {
    return {
      art: "ANGABE",
      angabeSchluessel: "DURCHWAHL",
      bezeichnung: "Gewünschte Durchwahl",
      angabe: "214",
      sichtbarFuer: [],
      reihenfolge: 0,
      gestrichenAm: null,
      inhaltGeleertAm: null,
      ...teil,
    };
  }
  const faecher = angabe({
    departmentKey: "FACILITY",
    angabeSchluessel: "UNTERRICHTSFAECHER",
    bezeichnung: "Unterrichtsfächer",
    angabe: "Chemie, Sport",
    sichtbarFuer: ["IT"],
    reihenfolge: 3,
  });
  const durchwahl = angabe({ departmentKey: "IT", reihenfolge: 4 });
  const raum = angabe({
    departmentKey: "VERWALTUNG",
    angabeSchluessel: "ARBEITSPLATZ_RAUM",
    bezeichnung: "Raum des Arbeitsplatzes",
    angabe: "Lehrerzimmer",
  });

  it("eigene Angabe zuerst, fremde nur mit sichtbarFuer; Label aus ANGABEN_KATALOG", () => {
    expect(angabenFuer("IT", [faecher, durchwahl, raum], [])).toEqual({
      angaben: [
        { label: "Gewünschte Durchwahl", wert: "214" },
        { label: "Unterrichtsfächer", wert: "Chemie, Sport" },
      ],
      hinweis: null,
    });
    // Facility sieht seine eigenen Faecher, aber nicht die Durchwahl der IT.
    expect(angabenFuer("FACILITY", [faecher, durchwahl, raum], []).angaben).toEqual([
      { label: "Unterrichtsfächer", wert: "Chemie, Sport" },
    ]);
    // Eine Stelle ohne eigene oder freigegebene Angabe bekommt nichts.
    expect(angabenFuer("BUCHHALTUNG", [faecher, durchwahl, raum], [])).toEqual({ angaben: [], hinweis: null });
  });

  it("gestrichene, leere und geleerte Angaben fehlen; nur Zeilen der Art ANGABE zaehlen", () => {
    const zeilen = [
      angabe({ departmentKey: "IT", gestrichenAm: new Date("2026-09-20T00:00:00Z") }),
      angabe({ departmentKey: "IT", angabe: "   " }),
      angabe({ departmentKey: "IT", angabe: null }),
      angabe({ departmentKey: "IT", angabe: null, inhaltGeleertAm: new Date("2027-04-01T00:00:00Z") }),
      angabe({ departmentKey: "IT", art: "JA_NEIN", angabe: "Text" }),
    ];
    expect(angabenFuer("IT", zeilen, [])).toEqual({ angaben: [], hinweis: null });
  });

  it("Label faellt ohne Katalogschluessel auf die Bezeichnung der Momentaufnahme zurueck; Werte getrimmt", () => {
    const alt = angabe({ departmentKey: "IT", angabeSchluessel: null, bezeichnung: "Alte Angabe", angabe: "  x  " });
    expect(angabenFuer("IT", [alt], []).angaben).toEqual([{ label: "Alte Angabe", wert: "x" }]);
  });

  it("Hinweis nur der eigenen Stelle; leerer und geleerter Hinweis fehlen", () => {
    const hinweise: AngabenHinweis[] = [
      { departmentKey: "IT", text: "  Bitte Drucker freischalten.  " },
      { departmentKey: "FACILITY", text: "Nur für Facility" },
    ];
    expect(angabenFuer("IT", [], hinweise).hinweis).toBe("Bitte Drucker freischalten.");
    expect(angabenFuer("VERWALTUNG", [], hinweise).hinweis).toBeNull();
    expect(angabenFuer("IT", [], [{ departmentKey: "IT", text: "" }]).hinweis).toBeNull();
    expect(angabenFuer("IT", [], [{ departmentKey: "IT", text: null }]).hinweis).toBeNull();
    expect(
      angabenFuer("IT", [], [{ departmentKey: "IT", text: "x", inhaltGeleertAm: new Date("2027-04-01T00:00:00Z") }]).hinweis,
    ).toBeNull();
  });
});

describe("angabenMailFelder (Regel 7)", () => {
  it("Klartext roh in Zeilen, HTML als maskierte Zeilen des Infokastens", () => {
    const f = angabenMailFelder({
      angaben: [
        { label: "Gewünschte Durchwahl", wert: "214" },
        { label: "Unterrichtsfächer", wert: "Chemie & <b>Sport</b>" },
      ],
      hinweis: "Bitte \"Drucker\" freischalten.\nRaum 2.14",
    });
    expect(f.angaben).toBe(
      [
        "Gewünschte Durchwahl: 214",
        "Unterrichtsfächer: Chemie & <b>Sport</b>",
        `${HINWEIS_ANGABE_LABEL}: Bitte "Drucker" freischalten.`,
        "  Raum 2.14",
      ].join("\n"),
    );
    expect(f.angaben_html).toBe(
      '<tr><td style="padding:0 16px 16px;"><p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Gewünschte Durchwahl</p>' +
        '<p style="margin:0;color:#374151;font-size:14px;">214</p></td></tr>' +
        '<tr><td style="padding:0 16px 16px;"><p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Unterrichtsfächer</p>' +
        '<p style="margin:0;color:#374151;font-size:14px;">Chemie &amp; &lt;b&gt;Sport&lt;/b&gt;</p></td></tr>' +
        '<tr><td style="padding:0 16px 16px;"><p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Hinweis der Führungskraft</p>' +
        '<p style="margin:0;color:#374151;font-size:14px;">Bitte &quot;Drucker&quot; freischalten.<br>Raum 2.14</p></td></tr>',
    );
    expect(f.angaben_html).not.toContain("<b>");
  });

  it("ohne Angaben und Hinweis: beide leer (der Block der Vorlage entfaellt)", () => {
    expect(angabenMailFelder(KEINE_ANGABEN)).toEqual({ angaben: "", angaben_html: "" });
    expect(angabenMailFelder({ angaben: [{ label: "X", wert: "  " }], hinweis: "   " })).toEqual({
      angaben: "",
      angaben_html: "",
    });
  });

  it("nur ein Hinweis: eine Zeile mit der Beschriftung wie der Titel seiner Aufgabe", () => {
    const f = angabenMailFelder({ angaben: [], hinweis: "Bitte Drucker freischalten." });
    expect(f.angaben).toBe("Hinweis der Führungskraft: Bitte Drucker freischalten.");
    expect(HINWEIS_AUFGABE_TITEL.startsWith(HINWEIS_ANGABE_LABEL)).toBe(true);
  });
});

// =============================================
// S14: Fortschritt ohne Entfallene (F2), Zeile im Dialog (Mockup 6.4)
// =============================================

describe("checklistFortschritt (F2)", () => {
  const GESTRICHEN = new Date("2026-09-20T09:00:00.000Z");

  it("ohne Entfallene wie bisher: Zähler, Nenner, Prozent, alle erledigt", () => {
    expect(checklistFortschritt([{ isCompleted: true }, { isCompleted: false }, { isCompleted: true }])).toEqual({
      gesamt: 3,
      erledigt: 2,
      prozent: 67,
      alleErledigt: false,
    });
    expect(checklistFortschritt([{ isCompleted: true }, { isCompleted: true, entfaelltAm: null }])).toEqual({
      gesamt: 2,
      erledigt: 2,
      prozent: 100,
      alleErledigt: true,
    });
  });

  it("entfallene zählen weder im Zähler noch im Nenner (Datenbankzeile mit `entfaelltAm`)", () => {
    // Zwei von sechs gestrichen — „2/4“, nicht „4/6“ und nicht „6/6“.
    const items = [
      { isCompleted: true },
      { isCompleted: true },
      { isCompleted: false },
      { isCompleted: false },
      { isCompleted: true, entfaelltAm: GESTRICHEN },
      { isCompleted: true, entfaelltAm: GESTRICHEN.toISOString() },
    ];
    expect(checklistFortschritt(items)).toEqual({ gesamt: 4, erledigt: 2, prozent: 50, alleErledigt: false });
  });

  it("dasselbe mit dem Kennzeichen `entfaellt` der Link-Seite", () => {
    expect(
      checklistFortschritt([{ isCompleted: true }, { isCompleted: true, entfaellt: true }, { isCompleted: false, entfaellt: false }]),
    ).toEqual({ gesamt: 2, erledigt: 1, prozent: 50, alleErledigt: false });
  });

  it("erledigte plus entfallene, keine offene: alle erledigt", () => {
    expect(checklistFortschritt([{ isCompleted: true }, { isCompleted: true, entfaelltAm: GESTRICHEN }])).toEqual({
      gesamt: 1,
      erledigt: 1,
      prozent: 100,
      alleErledigt: true,
    });
  });

  it("nur Entfallene → gesamt 0, alleErledigt false (nichts „erledigt“); leer ebenso", () => {
    expect(checklistFortschritt([{ isCompleted: true, entfaelltAm: GESTRICHEN }])).toEqual({
      gesamt: 0,
      erledigt: 0,
      prozent: 0,
      alleErledigt: false,
    });
    expect(checklistFortschritt([])).toEqual({ gesamt: 0, erledigt: 0, prozent: 0, alleErledigt: false });
  });
});

describe("ausstattungVorschauSatz (Mockup 6.4)", () => {
  it("„davon N aus „Ausstattung & Zugänge“, M mit Bemerkung“", () => {
    expect(ausstattungVorschauSatz({ ausstattung: 5, mitBemerkung: 2 })).toBe(
      `davon 5 aus „${AUSSTATTUNG_KATEGORIE}“, 2 mit Bemerkung`,
    );
    expect(ausstattungVorschauSatz({ ausstattung: 1, mitBemerkung: 1 })).toBe(
      "davon 1 aus „Ausstattung & Zugänge“, 1 mit Bemerkung",
    );
  });

  it("ohne Bemerkung nur die Zahl, ohne Ausstattungsaufgabe keine Zeile", () => {
    expect(ausstattungVorschauSatz({ ausstattung: 3, mitBemerkung: 0 })).toBe("davon 3 aus „Ausstattung & Zugänge“");
    expect(ausstattungVorschauSatz({ ausstattung: 3 })).toBe("davon 3 aus „Ausstattung & Zugänge“");
    expect(ausstattungVorschauSatz({ ausstattung: 0, mitBemerkung: 0 })).toBeNull();
    expect(ausstattungVorschauSatz({})).toBeNull();
    expect(ausstattungVorschauSatz(null)).toBeNull();
    expect(ausstattungVorschauSatz(undefined)).toBeNull();
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
    // deutscher Zeit), seit S13 email-layout (escapeHtml fuer die Angaben im
    // HTML-Teil der Mail), seit S20 minijob-fristen (Berliner Kalendertag,
    // Monate mit Monatsende) — alle vier selbst ohne jeden Import, also ebenso
    // rein — und vorgangsjahr (Beginn eines Berliner Tages), das nur
    // minijob-fristen importiert. Alles fuer die Loeschfrist (freitextGrenze).
    expect(importe.sort()).toEqual([
      "@/lib/abteilungsaufgaben",
      "@/lib/constants",
      "@/lib/email-layout",
      "@/lib/format",
      "@/lib/minijob-fristen",
      "@/lib/onboarding-spuren",
      "@/lib/vorgangsjahr",
    ]);
    for (const datei of [
      "src/lib/email-layout.ts",
      "src/lib/format.ts",
      "src/lib/onboarding-spuren.ts",
      "src/lib/minijob-fristen.ts",
    ]) {
      expect(`${datei}: ${quelle(datei).match(/^import\s/m)?.[0] ?? "ohne Importe"}`).toBe(`${datei}: ohne Importe`);
    }
    const vorgangsjahrImporte = [...quelle("src/lib/vorgangsjahr.ts").matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(vorgangsjahrImporte).toEqual(["@/lib/minijob-fristen"]);
  });

  it("abteilungsaufgaben.ts importiert ausstattung.ts nicht (kein Kreis)", () => {
    expect(quelle("src/lib/abteilungsaufgaben.ts")).not.toMatch(/from\s+"@\/lib\/ausstattung"/);
  });
});

// =============================================
// HR-Karte (S15): Regel 9, Aenderungsliste, Uebersicht mit Aufgabenstand
// =============================================

describe("aufgabenStatus (F2)", () => {
  it("entfällt vor erledigt — eine entfallene Aufgabe ist zugleich isCompleted", () => {
    expect(aufgabenStatus({ isCompleted: false })).toBe("offen");
    expect(aufgabenStatus({ isCompleted: true, entfaelltAm: null })).toBe("erledigt");
    expect(aufgabenStatus({ isCompleted: true, entfaelltAm: new Date() })).toBe("entfaellt");
    expect(aufgabenStatus({ isCompleted: false, entfaelltAm: "2027-01-20T10:00:00.000Z" })).toBe("entfaellt");
  });
});

describe("aenderungPruefen (Regel 9 als Matrix)", () => {
  type Wunsch = Parameters<typeof aenderungPruefen>[2];
  const AENDERUNGEN: [string, Wunsch][] = [
    ["Option abwählen", { abwaehlen: ["A"] }],
    ["Option hinzufügen", { hinzu: ["C"] }],
    ["Bemerkung", { bemerkung: true }],
    ["Angabe", { angabe: true }],
    ["Stellenwechsel", { stelle: true }],
    ["Streichen", { streichen: true }],
  ];
  const STAENDE: [string, string, { option: string; status: AufgabenStatus }[]][] = [
    ["offen", "AUSWAHL", [{ option: "A", status: "offen" }]],
    ["erledigt", "AUSWAHL", [{ option: "A", status: "erledigt" }]],
    ["entfallen", "AUSWAHL", [{ option: "A", status: "entfaellt" }]],
    ["keine Aufgaben (Angabe)", "ANGABE", []],
  ];
  // Erwartung nach Regel 9: Nur eine ERLEDIGTE Aufgabe sperrt — Streichen,
  // Stellenwechsel, das Abwaehlen ihrer Option und die Bemerkung (keine offene
  // Aufgabe mehr). Hinzufuegen und Angabe gehen immer; entfallene zaehlen nie.
  const GESPERRT: Record<string, string[]> = {
    erledigt: ["Option abwählen", "Bemerkung", "Stellenwechsel", "Streichen"],
  };
  const FAELLE = STAENDE.flatMap(([stand, art, aufgaben]) =>
    AENDERUNGEN.map(([name, wunsch]) => [stand, name, art, aufgaben, wunsch] as const),
  );

  it.each(FAELLE)("%s × %s", (stand, name, art, aufgaben, wunsch) => {
    const soll = (GESPERRT[stand] ?? []).includes(name) ? "AUFGABE_ERLEDIGT" : null;
    expect(aenderungPruefen({ art, gestrichenAm: null }, aufgaben, wunsch)).toBe(soll);
  });

  it("gemischt: eine offene Aufgabe genügt für die Bemerkung; nur die erledigte Option ist gesperrt", () => {
    const aufgaben = [
      { option: "A", status: "erledigt" as const },
      { option: "B", status: "offen" as const },
    ];
    expect(aenderungPruefen({ art: "AUSWAHL" }, aufgaben, { bemerkung: true })).toBeNull();
    expect(aenderungPruefen({ art: "AUSWAHL" }, aufgaben, { abwaehlen: ["B"] })).toBeNull();
    expect(aenderungPruefen({ art: "AUSWAHL" }, aufgaben, { abwaehlen: ["A", "B"] })).toBe("AUFGABE_ERLEDIGT");
    expect(aenderungPruefen({ art: "AUSWAHL" }, aufgaben, { streichen: true })).toBe("AUFGABE_ERLEDIGT");
  });

  it("gestrichene Zeile: jede Änderung GESTRICHEN", () => {
    for (const [, wunsch] of AENDERUNGEN) {
      expect(aenderungPruefen({ art: "JA_NEIN", gestrichenAm: new Date() }, [], wunsch)).toBe("GESTRICHEN");
    }
  });

  it("Fälligkeit nur an einer offenen Aufgabe", () => {
    const aufgaben = [
      { option: "A", status: "offen" as const },
      { option: "B", status: "erledigt" as const },
      { option: "C", status: "entfaellt" as const },
    ];
    expect(aenderungPruefen({ art: "AUSWAHL" }, aufgaben, { faelligkeiten: ["A"] })).toBeNull();
    expect(aenderungPruefen({ art: "AUSWAHL" }, aufgaben, { faelligkeiten: ["B"] })).toBe("AUFGABE_ERLEDIGT");
    expect(aenderungPruefen({ art: "AUSWAHL" }, aufgaben, { faelligkeiten: ["C"] })).toBe("OHNE_OFFENE_AUFGABE");
    expect(aenderungPruefen({ art: "AUSWAHL" }, aufgaben, { faelligkeiten: ["D"] })).toBe("OHNE_OFFENE_AUFGABE");
  });

  it("jeder Grund hat einen Text aus MELDUNGEN", () => {
    expect(aenderungsGrundText("AUFGABE_ERLEDIGT")).toBe(MELDUNGEN.AUFGABE_ERLEDIGT);
    expect(aenderungsGrundText("GESTRICHEN")).toBe(MELDUNGEN.POSITION_GESTRICHEN);
    expect(aenderungsGrundText("OHNE_OFFENE_AUFGABE")).toBe(MELDUNGEN.OHNE_OFFENE_AUFGABE);
  });
});

describe("hinweisAenderungPruefen (Regel 9 für Hinweise, F20)", () => {
  const MIT_TEXT = { text: "Bitte Mac statt PC" };
  it.each([
    ["offen", MIT_TEXT, { status: "offen" as const }, null, null],
    ["erledigt", MIT_TEXT, { status: "erledigt" as const }, "AUFGABE_ERLEDIGT", "AUFGABE_ERLEDIGT"],
    ["entfallen (Text entfernt)", { text: "" }, { status: "entfaellt" as const }, null, "OHNE_OFFENE_AUFGABE"],
    ["kein Hinweis", null, null, null, "OHNE_OFFENE_AUFGABE"],
    ["Hinweis noch ohne Aufgabe", MIT_TEXT, null, null, "OHNE_OFFENE_AUFGABE"],
  ])("%s: Text %s, Fälligkeit %s", (_name, hinweis, aufgabe, text, faellig) => {
    expect(hinweisAenderungPruefen(hinweis, aufgabe, { text: true })).toBe(text);
    expect(hinweisAenderungPruefen(hinweis, aufgabe, { dueDate: true })).toBe(faellig);
  });

  it("ein neuer Hinweis geht immer, auch wenn eine entfallene Aufgabe verknüpft ist (F23)", () => {
    expect(hinweisAenderungPruefen({ text: "  " }, { status: "entfaellt" }, { text: true })).toBeNull();
    expect(hinweisAenderungPruefen(null, null, { text: true })).toBeNull();
  });
});

describe("zeilenAenderungsStand und hinweisAenderungsStand", () => {
  const basis = {
    departmentKey: "FACILITY",
    art: "AUSWAHL",
    bezeichnung: "Schlüssel",
    aufgabeTitel: "Schlüssel ausgeben",
    reihenfolge: 1,
    auswahl: ["Haupteingang", "Lehrerzimmer"],
    bemerkung: "  Erst nach der Unterweisung ",
  };

  it("Auswahl: je Option ein Titel aus der Momentaufnahme, Bemerkung getrimmt", () => {
    expect(zeilenAenderungsStand(basis)).toEqual({
      departmentKey: "FACILITY",
      aufgaben: [
        { option: "Haupteingang", titel: "Schlüssel ausgeben: Haupteingang" },
        { option: "Lehrerzimmer", titel: "Schlüssel ausgeben: Lehrerzimmer" },
      ],
      titel: "Schlüssel",
      bemerkung: "Erst nach der Unterweisung",
    });
  });

  it("gestrichen, leere Angabe und eine nicht erlaubte Stelle sind „nicht da“", () => {
    expect(zeilenAenderungsStand({ ...basis, gestrichenAm: new Date() })).toBeNull();
    expect(zeilenAenderungsStand({ ...basis, art: "ANGABE", auswahl: [], angabe: "  " })).toBeNull();
    expect(zeilenAenderungsStand({ ...basis, departmentKey: "VORGESETZTER" })).toBeNull();
  });

  it("Angabe: Label aus dem Katalog, Stellen unter „sichtbar für“", () => {
    expect(
      zeilenAenderungsStand({
        departmentKey: "FACILITY",
        art: "ANGABE",
        angabeSchluessel: "UNTERRICHTSFAECHER",
        bezeichnung: "Fächer (alt)",
        reihenfolge: 0,
        auswahl: [],
        angabe: " Chemie, Sport ",
        sichtbarFuer: ["IT"],
      }),
    ).toEqual({ departmentKey: "FACILITY", sichtbarFuer: ["IT"], aufgaben: [], titel: "Unterrichtsfächer", angabe: "Chemie, Sport" });
  });

  it("Hinweis: Titel der Hinweis-Aufgabe, leer → null", () => {
    expect(hinweisAenderungsStand("IT", " Bitte Mac ")).toEqual({
      departmentKey: "IT",
      aufgaben: [{ option: "", titel: HINWEIS_AUFGABE_TITEL }],
      titel: HINWEIS_AUFGABE_TITEL,
      hinweis: "Bitte Mac",
    });
    expect(hinweisAenderungsStand("IT", "")).toBeNull();
    expect(hinweisAenderungsStand("IT", null)).toBeNull();
  });
});

describe("aenderungsEintraege (Regel 10)", () => {
  const ALLE = new Set(["IT", "FACILITY", "VERWALTUNG"]);
  const schluessel = (auswahl: string[], teil: Partial<AenderungsStand> = {}): AenderungsStand => ({
    departmentKey: "FACILITY",
    aufgaben: auswahl.map((o) => ({ option: o, titel: `Schlüssel ausgeben: ${o}` })),
    titel: "Schlüssel",
    bemerkung: null,
    ...teil,
  });

  it("neue Position: NEU je Aufgabe — nur für informierte Stellen", () => {
    const nachher = schluessel(["Haupteingang", "Lehrerzimmer"]);
    expect(aenderungsEintraege(null, nachher, ALLE)).toEqual([
      { departmentKey: "FACILITY", art: "NEU", titel: "Schlüssel ausgeben: Haupteingang" },
      { departmentKey: "FACILITY", art: "NEU", titel: "Schlüssel ausgeben: Lehrerzimmer" },
    ]);
    expect(aenderungsEintraege(null, nachher, new Set(["IT"]))).toEqual([]);
  });

  it("gestrichen: ENTFAELLT je Aufgabe", () => {
    expect(aenderungsEintraege(schluessel(["Haupteingang"]), null, ALLE)).toEqual([
      { departmentKey: "FACILITY", art: "ENTFAELLT", titel: "Schlüssel ausgeben: Haupteingang" },
    ]);
  });

  it("Option ab- und angewählt: ENTFAELLT und NEU, die übrigen ohne Eintrag", () => {
    expect(
      aenderungsEintraege(schluessel(["Haupteingang", "Lehrerzimmer"]), schluessel(["Lehrerzimmer", "Sporthalle"]), ALLE),
    ).toEqual([
      { departmentKey: "FACILITY", art: "ENTFAELLT", titel: "Schlüssel ausgeben: Haupteingang" },
      { departmentKey: "FACILITY", art: "NEU", titel: "Schlüssel ausgeben: Sporthalle" },
    ]);
  });

  it("Bemerkung geändert: GEAENDERT je Aufgabe, die bleibt — Leerzeichen allein ändern nichts", () => {
    const vorher = schluessel(["Haupteingang", "Lehrerzimmer"], { bemerkung: "Alt" });
    expect(aenderungsEintraege(vorher, schluessel(["Haupteingang"], { bemerkung: "Neu" }), ALLE)).toEqual([
      { departmentKey: "FACILITY", art: "ENTFAELLT", titel: "Schlüssel ausgeben: Lehrerzimmer" },
      { departmentKey: "FACILITY", art: "GEAENDERT", titel: "Schlüssel ausgeben: Haupteingang" },
    ]);
    expect(aenderungsEintraege(vorher, { ...vorher, bemerkung: "  Alt " }, ALLE)).toEqual([]);
    // Entfernen ist auch eine Aenderung.
    expect(aenderungsEintraege(vorher, { ...vorher, bemerkung: null }, ALLE).map((e) => e.art)).toEqual([
      "GEAENDERT",
      "GEAENDERT",
    ]);
  });

  it("Stellenwechsel: ENTFAELLT für die alte, NEU für die neue Stelle — jeweils nur, wenn informiert", () => {
    const vorher = schluessel(["Haupteingang"]);
    const nachher = schluessel(["Haupteingang"], { departmentKey: "VERWALTUNG" });
    expect(aenderungsEintraege(vorher, nachher, ALLE)).toEqual([
      { departmentKey: "FACILITY", art: "ENTFAELLT", titel: "Schlüssel ausgeben: Haupteingang" },
      { departmentKey: "VERWALTUNG", art: "NEU", titel: "Schlüssel ausgeben: Haupteingang" },
    ]);
    expect(aenderungsEintraege(vorher, nachher, new Set(["FACILITY"]))).toEqual([
      { departmentKey: "FACILITY", art: "ENTFAELLT", titel: "Schlüssel ausgeben: Haupteingang" },
    ]);
  });

  it("nur Inhaltsfelder: eine reine Fälligkeitsänderung ergibt keinen Eintrag", () => {
    const zeile = {
      departmentKey: "IT",
      art: "JA_NEIN",
      bezeichnung: "Dienst-iPad",
      aufgabeTitel: "Dienst-iPad bereitstellen",
      reihenfolge: 0,
      auswahl: [],
      relativeDueDays: -7,
      bemerkung: "Mit Stift",
    };
    expect(
      aenderungsEintraege(zeilenAenderungsStand(zeile), zeilenAenderungsStand({ ...zeile, relativeDueDays: -14 }), ALLE),
    ).toEqual([]);
  });

  it("Angabe: GEAENDERT mit ihrem Label für die eigene Stelle und „sichtbar für“", () => {
    const vorher: AenderungsStand = {
      departmentKey: "FACILITY",
      sichtbarFuer: ["IT"],
      aufgaben: [],
      titel: "Unterrichtsfächer",
      angabe: "Chemie",
    };
    expect(aenderungsEintraege(vorher, { ...vorher, angabe: "Chemie, Sport" }, ALLE)).toEqual([
      { departmentKey: "FACILITY", art: "GEAENDERT", titel: "Unterrichtsfächer" },
      { departmentKey: "IT", art: "GEAENDERT", titel: "Unterrichtsfächer" },
    ]);
    expect(aenderungsEintraege(vorher, null, new Set(["IT"]))).toEqual([
      { departmentKey: "IT", art: "ENTFAELLT", titel: "Unterrichtsfächer" },
    ]);
  });

  it("Hinweis: neu, geändert, entfernt", () => {
    const alt = hinweisAenderungsStand("IT", "Bitte Mac");
    const neu = hinweisAenderungsStand("IT", "Bitte Mac mit Dock");
    expect(aenderungsEintraege(null, alt, ALLE)).toEqual([{ departmentKey: "IT", art: "NEU", titel: HINWEIS_AUFGABE_TITEL }]);
    expect(aenderungsEintraege(alt, neu, ALLE)).toEqual([
      { departmentKey: "IT", art: "GEAENDERT", titel: HINWEIS_AUFGABE_TITEL },
    ]);
    expect(aenderungsEintraege(alt, null, ALLE)).toEqual([
      { departmentKey: "IT", art: "ENTFAELLT", titel: HINWEIS_AUFGABE_TITEL },
    ]);
  });

  it("nie für MITARBEITER oder VORGESETZTER (Regel 11)", () => {
    for (const key of NICHT_ERLAUBTE_STELLEN) {
      expect(aenderungsEintraege(null, schluessel(["A"], { departmentKey: key }), new Set([key]))).toEqual([]);
    }
  });
});

describe("waehlbareStellen", () => {
  it("feste und angelegte Stellen in der Reihenfolge der Karte, HR dahinter — nie MITARBEITER oder VORGESETZTER", () => {
    const konfigs = [
      { departmentKey: "IT" },
      { departmentKey: "HAUSTECHNIK" },
      { departmentKey: "ARCHIV" },
      { departmentKey: "kaputt-klein" },
    ];
    expect(waehlbareStellen(konfigs)).toEqual([
      "IT",
      "VERWALTUNG",
      "FACILITY",
      "BUCHHALTUNG",
      "DSB",
      "ARCHIV",
      "HAUSTECHNIK",
      "HR",
    ]);
  });
});

describe("ausstattungsUebersichtBauen mit Aufgabenstand (S15)", () => {
  const JETZT = new Date("2027-01-25T08:00:00.000Z");
  const BEGINN = new Date("2027-02-01T00:00:00.000Z");
  const tag = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  const vorgang = (status = "SUPERVISOR_SUBMITTED"): UebersichtVorgangStand => ({
    status,
    supervisorSubmittedAt: new Date("2027-01-14T09:30:00.000Z"),
    supervisorData: { isComplete: true, mitAusstattung: true, vertragsbeginn: BEGINN },
  });

  const zeilen: UebersichtZeileDaten[] = [
    zeileDaten({ id: "z-ipad", positionId: "pos-1", relativeDueDays: -14 }),
    zeileDaten({
      id: "z-schl",
      positionId: "pos-schluessel",
      departmentKey: "FACILITY",
      art: "AUSWAHL",
      bezeichnung: "Schlüssel",
      auswahl: ["Haupteingang", "Lehrerzimmer", "Werkraum"],
      relativeDueDays: -3,
    }),
    zeileDaten({ id: "z-tel", positionId: "pos-2", bezeichnung: "Telefon mit Durchwahl", relativeDueDays: -30 }),
    zeileDaten({
      id: "z-weg",
      positionId: "pos-weg",
      bezeichnung: "Parkplatz",
      gestrichenAm: tag("2027-01-20"),
      relativeDueDays: -30,
    }),
  ];
  const aufgaben: UebersichtAufgabeDaten[] = [
    { id: "i-ipad", title: "Dienst-iPad (Lernmittel) bereitstellen", isCompleted: false, dueDate: tag("2027-01-25"), eilt: true },
    {
      id: "i-chemie",
      title: "Schlüssel ausgeben: Fachraum Chemie",
      isCompleted: true,
      completedAt: tag("2027-01-21"),
      entfaelltAm: tag("2027-01-21"),
    },
    { id: "i-lehrer", title: "Schlüssel ausgeben: Lehrerzimmer", isCompleted: false, dueDate: tag("2027-01-29") },
    {
      id: "i-haupt",
      title: "Schlüssel ausgeben: Haupteingang",
      isCompleted: true,
      completedAt: new Date("2027-01-20T09:00:00.000Z"),
      dueDate: tag("2027-01-29"),
    },
    { id: "i-tel", title: "Telefon mit Durchwahl bereitstellen", isCompleted: true, completedAt: tag("2027-01-22") },
    { id: "i-park", title: "Parkplatz bereitstellen", isCompleted: true, entfaelltAm: tag("2027-01-20") },
    { id: "i-hinweis", title: HINWEIS_AUFGABE_TITEL, isCompleted: false, dueDate: tag("2027-01-25"), eilt: true },
  ];
  const verknuepfungen: UebersichtVerknuepfung[] = [
    { ausstattungId: "z-ipad", option: "", checklistItemId: "i-ipad" },
    { ausstattungId: "z-schl", option: "Fachraum Chemie", checklistItemId: "i-chemie" },
    { ausstattungId: "z-schl", option: "Lehrerzimmer", checklistItemId: "i-lehrer" },
    { ausstattungId: "z-schl", option: "Haupteingang", checklistItemId: "i-haupt" },
    { ausstattungId: "z-tel", option: "", checklistItemId: "i-tel" },
    { ausstattungId: "z-weg", option: "", checklistItemId: "i-park" },
  ];

  function bauen(teil: { vorgang?: UebersichtVorgangStand; darfBearbeiten?: boolean; ohneJetzt?: boolean } = {}) {
    return ausstattungsUebersichtBauen({
      vorgang: teil.vorgang ?? vorgang(),
      darfBearbeiten: teil.darfBearbeiten ?? true,
      zeilen,
      hinweise: [hinweisDaten({ checklistItemId: "i-hinweis" })],
      arbeitsortId: GYM,
      konfigs: [konfig({}), konfig({ departmentKey: "FACILITY", departmentName: "Hausmeister" })],
      katalog: [position({ id: "pos-1" }), position({ id: "pos-2", bezeichnung: "Telefon mit Durchwahl" }), auswahl()],
      aufgaben,
      verknuepfungen,
      jetzt: teil.ohneJetzt ? undefined : JETZT,
    });
  }
  function zeile(u: ReturnType<typeof bauen>, id: string) {
    const z = u.gruppen.flatMap((g) => g.zeilen).find((x) => x.id === id);
    if (!z) throw new Error(`Zeile ${id} fehlt`);
    return z;
  }

  it("je Zeile die Aufgaben: gewählte Optionen in ihrer Reihenfolge, entfallene dahinter", () => {
    const schl = zeile(bauen(), "z-schl");
    expect(schl.aufgaben).toEqual([
      {
        option: "Haupteingang",
        checklistItemId: "i-haupt",
        titel: "Schlüssel ausgeben: Haupteingang",
        status: "erledigt",
        faelligAm: "2027-01-29T00:00:00.000Z",
        eilt: false,
        erledigtAm: "2027-01-20T09:00:00.000Z",
      },
      {
        option: "Lehrerzimmer",
        checklistItemId: "i-lehrer",
        titel: "Schlüssel ausgeben: Lehrerzimmer",
        status: "offen",
        faelligAm: "2027-01-29T00:00:00.000Z",
        eilt: false,
        erledigtAm: null,
      },
      {
        option: "Fachraum Chemie",
        checklistItemId: "i-chemie",
        titel: "Schlüssel ausgeben: Fachraum Chemie",
        status: "entfaellt",
        faelligAm: null,
        eilt: false,
        erledigtAm: null,
      },
    ]);
    // Wählbar: der Katalog, dahinter die gewählte Option, die er nicht mehr kennt.
    expect(schl.optionen).toEqual(["Haupteingang", "Lehrerzimmer", "Fachraum Chemie", "Werkraum"]);
  });

  it("Aktionen nach Regel 9 — mit dem Grund, warum etwas gesperrt ist", () => {
    const u = bauen();
    expect(zeile(u, "z-ipad").aktionen).toEqual({ aendern: true, streichen: true, sperrGrund: null });
    // Auswahl mit erledigter Option: ergänzen geht, streichen nicht.
    expect(zeile(u, "z-schl").aktionen).toEqual({ aendern: true, streichen: false, sperrGrund: MELDUNGEN.AUFGABE_ERLEDIGT });
    // Ja/Nein mit erledigter Aufgabe: nichts mehr, bis sie wieder offen ist.
    expect(zeile(u, "z-tel").aktionen).toEqual({ aendern: false, streichen: false, sperrGrund: MELDUNGEN.AUFGABE_ERLEDIGT });
    expect(zeile(u, "z-weg").aktionen).toEqual({ aendern: false, streichen: false, sperrGrund: MELDUNGEN.POSITION_GESTRICHEN });
  });

  it("Vorlauf-Warnung (Regel 14): nur mit offener Aufgabe, nicht gestrichen, nur mit `jetzt`", () => {
    const u = bauen();
    // Vertragsbeginn 01.02., Vorlauf 14 Tage → Frist 18.01. liegt vor heute (25.01.).
    expect(zeile(u, "z-ipad").vorlaufWarnung).toBe(MELDUNGEN.VORLAUF_WARNUNG);
    // Vorlauf 3 Tage → 29.01. liegt noch vor uns.
    expect(zeile(u, "z-schl").vorlaufWarnung).toBeNull();
    // Erledigt bzw. gestrichen: keine Warnung mehr.
    expect(zeile(u, "z-tel").vorlaufWarnung).toBeNull();
    expect(zeile(u, "z-weg").vorlaufWarnung).toBeNull();
    expect(zeile(bauen({ ohneJetzt: true }), "z-ipad").vorlaufWarnung).toBeNull();
  });

  it("Hinweis mit Stand, Fälligkeit, „Eilt“ und Aktion; erledigt → gesperrt", () => {
    const it = bauen().gruppen.find((g) => g.departmentKey === "IT");
    expect(it?.hinweis).toMatchObject({
      checklistItemId: "i-hinweis",
      status: "offen",
      faelligAm: "2027-01-25T00:00:00.000Z",
      eilt: true,
      aktionen: { aendern: true, sperrGrund: null },
    });

    const erledigt = ausstattungsUebersichtBauen({
      vorgang: vorgang(),
      darfBearbeiten: true,
      zeilen: [],
      hinweise: [hinweisDaten({ checklistItemId: "i-h" })],
      arbeitsortId: GYM,
      konfigs: [konfig({})],
      katalog: [],
      aufgaben: [{ id: "i-h", title: HINWEIS_AUFGABE_TITEL, isCompleted: true, completedAt: tag("2027-01-22") }],
      verknuepfungen: [],
      jetzt: JETZT,
    });
    expect(erledigt.gruppen[0].hinweis).toMatchObject({
      status: "erledigt",
      aktionen: { aendern: false, sperrGrund: MELDUNGEN.AUFGABE_ERLEDIGT },
    });
  });

  it("wählbare Stellen nur im Zustand BEARBEITBAR — Name und Adresse am Arbeitsort", () => {
    const u = bauen();
    expect(u.stellen.slice(0, 3)).toEqual([
      { departmentKey: "IT", name: "IT-Support FES", adresseFehlt: false },
      { departmentKey: "VERWALTUNG", name: DEPARTMENT_LABELS.VERWALTUNG, adresseFehlt: true },
      { departmentKey: "FACILITY", name: "Hausmeister", adresseFehlt: false },
    ]);
    expect(u.stellen[u.stellen.length - 1]).toEqual({ departmentKey: "HR", name: DEPARTMENT_LABELS.HR, adresseFehlt: false });
    expect(u.stellen.map((s) => s.departmentKey)).not.toContain("VORGESETZTER");
    expect(u.stellen.map((s) => s.departmentKey)).not.toContain("MITARBEITER");
  });

  it.each([
    ["abgeschlossen", { vorgang: vorgang("COMPLETED") }],
    ["ohne Bearbeitungsrecht", { darfBearbeiten: false }],
  ])("%s: Aufgabenstand sichtbar, aber keine Aktion, keine Warnung, keine Stellen", (_name, teil) => {
    const u = bauen(teil);
    expect(u.zustand).toBe("NUR_LESEN");
    expect(zeile(u, "z-schl").aufgaben).toHaveLength(3);
    for (const z of u.gruppen.flatMap((g) => g.zeilen)) {
      expect(z.aktionen).toEqual({ aendern: false, streichen: false, sperrGrund: null });
      expect(z.vorlaufWarnung).toBeNull();
    }
    expect(u.gruppen.find((g) => g.departmentKey === "IT")?.hinweis?.aktionen).toEqual({ aendern: false, sperrGrund: null });
    expect(u.stellen).toEqual([]);
  });

  it("bleibt reines JSON — und gibt die Tagesangabe der Momentaufnahme nicht heraus", () => {
    const u = bauen();
    expect(JSON.parse(JSON.stringify(u))).toEqual(u);
    expect(JSON.stringify(u)).not.toContain("relativeDueDays");
  });
});

// =============================================
// Karte und Checkliste im Portal (S16; Mockup 6.3)
// =============================================

describe("aufgabenStandText (Mockup 6.3)", () => {
  it.each<[string, Parameters<typeof aufgabenStandText>[0], string]>([
    ["offen mit Fälligkeit", { status: "offen", faelligAm: "2027-01-27T00:00:00.000Z" }, "offen · fällig 27.01.2027"],
    ["offen ohne Fälligkeit", { status: "offen", faelligAm: null }, "offen"],
    ["erledigt mit Datum", { status: "erledigt", faelligAm: null, erledigtAm: "2027-01-20T09:00:00.000Z" }, "erledigt 20.01.2027"],
    ["erledigt ohne Datum", { status: "erledigt", faelligAm: null, erledigtAm: null }, "erledigt"],
    // Entfallen nennt weder Fälligkeit noch Datum — die Aufgabe gibt es für die Stelle nicht mehr.
    ["entfällt", { status: "entfaellt", faelligAm: "2027-01-27T00:00:00.000Z", erledigtAm: "2027-01-20T09:00:00.000Z" }, "entfällt"],
  ])("%s", (_name, aufgabe, erwartet) => {
    expect(aufgabenStandText(aufgabe)).toBe(erwartet);
  });

  it("rechnet in deutscher Zeit: 23:30 UTC am 26.01. ist schon der 27.01.", () => {
    expect(aufgabenStandText({ status: "offen", faelligAm: "2027-01-26T23:30:00.000Z" })).toBe("offen · fällig 27.01.2027");
  });
});

describe("optionsZeilen (je Option eine Zeile mit eigenem Stand, E-A12)", () => {
  function aufgabe(option: string, status: AufgabenStatus) {
    return { option, checklistItemId: `i-${option}`, titel: `Schlüssel ausgeben: ${option}`, status, faelligAm: null, eilt: false, erledigtAm: null };
  }
  const zeile = (teil: Partial<AusstattungsZeile>): Pick<AusstattungsZeile, "art" | "auswahl" | "aufgaben"> => ({
    art: "AUSWAHL",
    auswahl: [],
    aufgaben: [],
    ...teil,
  });

  it("gewählte Optionen in ihrer Reihenfolge, frühere (entfallene) dahinter", () => {
    const z = zeile({
      auswahl: ["Haupteingang", "Lehrerzimmer"],
      aufgaben: [aufgabe("Lehrerzimmer", "offen"), aufgabe("Haupteingang", "erledigt"), aufgabe("Fachraum Chemie", "entfaellt")],
    });
    expect(optionsZeilen(z).map((o) => [o.option, o.aufgabe?.status ?? null])).toEqual([
      ["Haupteingang", "erledigt"],
      ["Lehrerzimmer", "offen"],
      ["Fachraum Chemie", "entfaellt"],
    ]);
  });

  it("eine gewählte Option ohne Aufgabe (noch nicht nachgeholt) steht ohne Stand da", () => {
    expect(optionsZeilen(zeile({ auswahl: ["Haupteingang"] }))).toEqual([{ option: "Haupteingang", aufgabe: null }]);
  });

  it("Ja/Nein und Angabe haben keine Optionszeilen", () => {
    expect(optionsZeilen(zeile({ art: "JA_NEIN", aufgaben: [aufgabe("", "offen")] }))).toEqual([]);
    expect(optionsZeilen(zeile({ art: "ANGABE" }))).toEqual([]);
  });
});

describe("bemerkungJeAufgabe (Zusatz am Checklistenpunkt, Regel 8 und 16)", () => {
  const JETZT = new Date("2027-01-25T08:00:00.000Z");
  function uebersicht() {
    return ausstattungsUebersichtBauen({
      vorgang: {
        status: "SUPERVISOR_SUBMITTED",
        supervisorSubmittedAt: new Date("2027-01-14T09:30:00.000Z"),
        supervisorData: { isComplete: true, mitAusstattung: true },
      },
      darfBearbeiten: true,
      zeilen: [
        zeileDaten({ id: "z-ipad", bemerkung: "Mit Stift und Hülle", bemerkungQuelle: "BEIDE" }),
        zeileDaten({
          id: "z-schl",
          positionId: "pos-schluessel",
          departmentKey: "FACILITY",
          art: "AUSWAHL",
          bezeichnung: "Schlüssel",
          auswahl: ["Haupteingang", "Lehrerzimmer"],
          bemerkung: "Sammlung erst nach der Sicherheitsunterweisung",
          bemerkungQuelle: "FUEHRUNGSKRAFT",
        }),
        zeileDaten({ id: "z-tel", positionId: "pos-2", bezeichnung: "Telefon mit Durchwahl", bemerkung: "   " }),
      ],
      hinweise: [hinweisDaten({ checklistItemId: "i-hinweis" })],
      arbeitsortId: GYM,
      konfigs: [konfig({}), konfig({ departmentKey: "FACILITY", departmentName: "Hausmeister" })],
      katalog: null,
      aufgaben: [
        { id: "i-ipad", title: "Dienst-iPad (Lernmittel) bereitstellen", isCompleted: false },
        { id: "i-haupt", title: "Schlüssel ausgeben: Haupteingang", isCompleted: true },
        { id: "i-lehrer", title: "Schlüssel ausgeben: Lehrerzimmer", isCompleted: false },
        { id: "i-tel", title: "Telefon mit Durchwahl bereitstellen", isCompleted: false },
        { id: "i-hinweis", title: HINWEIS_AUFGABE_TITEL, isCompleted: false },
      ],
      verknuepfungen: [
        { ausstattungId: "z-ipad", option: "", checklistItemId: "i-ipad" },
        { ausstattungId: "z-schl", option: "Haupteingang", checklistItemId: "i-haupt" },
        { ausstattungId: "z-schl", option: "Lehrerzimmer", checklistItemId: "i-lehrer" },
        { ausstattungId: "z-tel", option: "", checklistItemId: "i-tel" },
      ],
      jetzt: JETZT,
    });
  }

  it("jede Aufgabe einer Position trägt ihre Bemerkung samt Beschriftung nach Herkunft", () => {
    expect(bemerkungJeAufgabe(uebersicht())).toEqual({
      "i-ipad": { text: "Mit Stift und Hülle", label: bemerkungLabel("BEIDE") },
      "i-haupt": { text: "Sammlung erst nach der Sicherheitsunterweisung", label: bemerkungLabel("FUEHRUNGSKRAFT") },
      "i-lehrer": { text: "Sammlung erst nach der Sicherheitsunterweisung", label: bemerkungLabel("FUEHRUNGSKRAFT") },
    });
  });

  it("ohne Bemerkung (auch nur Leerzeichen) und für die Hinweis-Aufgabe nichts", () => {
    const b = bemerkungJeAufgabe(uebersicht());
    expect(b["i-tel"]).toBeUndefined();
    expect(b["i-hinweis"]).toBeUndefined();
  });

  it("ohne Übersicht (keine HR-Rolle, Regel 16) ein leeres Objekt", () => {
    expect(bemerkungJeAufgabe(null)).toEqual({});
    expect(bemerkungJeAufgabe(undefined)).toEqual({});
  });
});

// =============================================
// Nachtrag senden (S17; Regel 10, F7)
// =============================================

describe("nachtragListe (Regel 10)", () => {
  const e = (art: string, titel: string, erfasstAm?: string) => ({
    art,
    titel,
    ...(erfasstAm ? { erfasstAm: `2027-01-${erfasstAm}T10:00:00.000Z` } : {}),
  });

  it("je Titel zusammengefasst: NEU+ENTFAELLT faellt weg, NEU+GEAENDERT wird NEU, GEAENDERT+ENTFAELLT wird ENTFAELLT", () => {
    expect(
      nachtragListe([
        e("NEU", "Parkplatz bereitstellen"),
        e("ENTFAELLT", "Parkplatz bereitstellen"),
        e("NEU", "Dienst-Laptop/PC bereitstellen"),
        e("GEAENDERT", "Dienst-Laptop/PC bereitstellen"),
        e("GEAENDERT", "Zugang einrichten: WebUntis"),
        e("ENTFAELLT", "Zugang einrichten: WebUntis"),
      ]),
    ).toEqual({
      neu: ["Dienst-Laptop/PC bereitstellen"],
      geaendert: [],
      entfaellt: ["Zugang einrichten: WebUntis"],
    });
  });

  it("einzelne Eintraege bleiben, wie sie sind; zweimal GEAENDERT ist einmal", () => {
    expect(
      nachtragListe([
        e("NEU", "A"),
        e("GEAENDERT", "B"),
        e("GEAENDERT", "B"),
        e("ENTFAELLT", "C"),
      ]),
    ).toEqual({ neu: ["A"], geaendert: ["B"], entfaellt: ["C"] });
  });

  it("wieder aufgenommen (ENTFAELLT, dann NEU) heisst „Geändert“; NEU→ENTFAELLT→NEU bleibt NEU", () => {
    expect(nachtragListe([e("ENTFAELLT", "Spind bereitstellen"), e("NEU", "Spind bereitstellen")])).toEqual({
      neu: [],
      geaendert: ["Spind bereitstellen"],
      entfaellt: [],
    });
    expect(
      nachtragListe([e("NEU", "Spind bereitstellen"), e("ENTFAELLT", "Spind bereitstellen"), e("NEU", "Spind bereitstellen")]),
    ).toEqual({ neu: ["Spind bereitstellen"], geaendert: [], entfaellt: [] });
  });

  it("sortiert nach `erfasstAm` (bei Gleichstand wie uebergeben), Titel einzeilig, leere fallen weg", () => {
    expect(
      nachtragListe([
        e("ENTFAELLT", "Parkplatz bereitstellen", "21"),
        e("NEU", "Parkplatz bereitstellen", "20"),
        e("NEU", "  Dienst-iPad   bereitstellen ", "22"),
        e("NEU", "   ", "22"),
      ]),
    ).toEqual({ neu: ["Dienst-iPad bereitstellen"], geaendert: [], entfaellt: [] });
  });

  it("ohne Eintraege leer — gleich LEERER_NACHTRAG", () => {
    expect(nachtragListe([])).toEqual(LEERER_NACHTRAG);
    expect(LEERER_NACHTRAG).toEqual({ neu: [], geaendert: [], entfaellt: [] });
  });
});

describe("nachtragMailFelder (Regel 10)", () => {
  it("ohne Aenderung: alle drei Felder leer (der Block {{#nachtrag}} entfaellt)", () => {
    expect(nachtragMailFelder(LEERER_NACHTRAG)).toEqual({ nachtrag: "", nachtrag_liste: "", nachtrag_liste_html: "" });
  });

  it("Merker „ja“, flache Zeilen „Neu/Geändert/Entfällt: …“ in dieser Reihenfolge, HTML maskiert", () => {
    const f = nachtragMailFelder({
      neu: ["Notebook & Zubehör bereitstellen"],
      geaendert: ["Zugang einrichten: <b>WebUntis</b>"],
      entfaellt: ["Spind bereitstellen"],
    });
    expect(f.nachtrag).toBe("ja");
    expect(f.nachtrag_liste).toBe(
      "Neu: Notebook & Zubehör bereitstellen\nGeändert: Zugang einrichten: <b>WebUntis</b>\nEntfällt: Spind bereitstellen",
    );
    expect(f.nachtrag_liste_html).toBe(
      '<ul style="margin:0;padding-left:20px;color:#374151;font-size:14px;line-height:1.6;">' +
        '<li style="margin:0 0 4px;"><strong>Neu:</strong> Notebook &amp; Zubehör bereitstellen</li>' +
        '<li style="margin:0 0 4px;"><strong>Geändert:</strong> Zugang einrichten: &lt;b&gt;WebUntis&lt;/b&gt;</li>' +
        '<li style="margin:0 0 4px;"><strong>Entfällt:</strong> Spind bereitstellen</li>' +
        "</ul>",
    );
  });

  it("keine verschachtelten Marker: weder Bloecke noch Platzhalter in den fertigen Feldern", () => {
    const f = nachtragMailFelder({ neu: ["A"], geaendert: [], entfaellt: ["B"] });
    for (const wert of Object.values(f)) expect(wert).not.toMatch(/\{\{/);
    // Ein Titel mit Klammern bleibt Text (renderTemplate setzt in einem Durchgang ein).
    expect(nachtragMailFelder({ neu: ["{{link}}"], geaendert: [], entfaellt: [] }).nachtrag_liste).toBe("Neu: {{link}}");
  });

  it("WAECHTER_TAGE ist dieselbe Zahl wie in abteilungsaufgaben.ts (Regel 15)", () => {
    expect(WAECHTER_TAGE).toBe(WAECHTER_TAGE_ABTEILUNGEN);
    expect(WAECHTER_TAGE).toBe(7);
  });
});

// =============================================
// S20: Loeschfrist der Freitexte (E-A22) und Brief-Platzhalter (E-A25)
// =============================================

describe("freitextGrenze (E-A22)", () => {
  it("sechs Monate vor dem heutigen Berliner Kalendertag, ab dessen Mitternacht deutscher Zeit", () => {
    expect(FREITEXT_AUFBEWAHRUNG_MONATE).toBe(6);
    // 15.03.2027 → 15.09.2026, Sommerzeit: Mitternacht = 22:00 UTC des Vortags
    expect(freitextGrenze(new Date("2027-03-15T10:00:00Z")).toISOString()).toBe("2026-09-14T22:00:00.000Z");
    // 15.09.2027 → 15.03.2027, Winterzeit: 23:00 UTC des Vortags
    expect(freitextGrenze(new Date("2027-09-15T10:00:00Z")).toISOString()).toBe("2027-03-14T23:00:00.000Z");
  });

  it("Monatsende: 31.08. → 28.02., im Schaltjahr 29.02. (nie in den Maerz hinein)", () => {
    expect(freitextGrenze(new Date("2027-08-31T10:00:00Z")).toISOString()).toBe("2027-02-27T23:00:00.000Z");
    expect(freitextGrenze(new Date("2027-08-30T10:00:00Z")).toISOString()).toBe("2027-02-27T23:00:00.000Z");
    expect(freitextGrenze(new Date("2028-08-31T10:00:00Z")).toISOString()).toBe("2028-02-28T23:00:00.000Z");
    // 31.12. → 30.06. (der Juni hat keinen 31.)
    expect(freitextGrenze(new Date("2026-12-31T10:00:00Z")).toISOString()).toBe("2026-06-29T22:00:00.000Z");
  });

  it("Berliner Zeit, nicht die UTC-Uhr des Containers", () => {
    // 31.08. 23:30 Uhr in Berlin (21:30 UTC) — noch der 31.08.
    expect(freitextGrenze(new Date("2027-08-31T21:30:00Z")).toISOString()).toBe("2027-02-27T23:00:00.000Z");
    // 22:30 UTC = 01.09. 00:30 Uhr in Berlin — schon der 01.09. → 01.03.
    expect(freitextGrenze(new Date("2027-08-31T22:30:00Z")).toISOString()).toBe("2027-02-28T23:00:00.000Z");
  });

  it("ueber den Tag der Zeitumstellung: Mitternacht des 29.03.2026 liegt noch in der Winterzeit", () => {
    expect(freitextGrenze(new Date("2026-09-29T08:00:00Z")).toISOString()).toBe("2026-03-28T23:00:00.000Z");
  });

  it("ein Lauf am selben Tag rechnet dieselbe Grenze — frueh wie spaet", () => {
    const frueh = freitextGrenze(new Date("2027-05-10T03:00:00Z")).getTime();
    const spaet = freitextGrenze(new Date("2027-05-10T21:00:00Z")).getTime();
    expect(spaet).toBe(frueh);
  });
});

describe("ausstattungListe (E-A25, Platzhalter {ausstattung_liste})", () => {
  const zeile = (z: Partial<BriefListenZeile> & Pick<BriefListenZeile, "bezeichnung">): BriefListenZeile => ({
    departmentKey: "IT",
    art: "JA_NEIN",
    auswahl: [],
    reihenfolge: 0,
    gestrichenAm: null,
    ...z,
  });

  it("Ja/Nein als Bezeichnung, Auswahl als „Bezeichnung: Option, Option“, eine Zeile je Position", () => {
    expect(
      ausstattungListe([
        zeile({ bezeichnung: "Dienst-iPad (Lernmittel)", reihenfolge: 1 }),
        zeile({ bezeichnung: "Zugänge", art: "AUSWAHL", auswahl: ["Dienst-E-Mail", "WebUntis"], reihenfolge: 2 }),
      ]),
    ).toBe("Dienst-iPad (Lernmittel)\nZugänge: Dienst-E-Mail, WebUntis");
  });

  it("ohne Angaben, gestrichene Positionen und Auswahl ohne Option", () => {
    expect(
      ausstattungListe([
        zeile({ bezeichnung: "Gewünschte Durchwahl", art: "ANGABE" }),
        zeile({ bezeichnung: "Spind", gestrichenAm: new Date("2027-01-10T10:00:00Z") }),
        zeile({ bezeichnung: "Schlüssel", art: "AUSWAHL", auswahl: [] }),
        zeile({ bezeichnung: "Schlüssel 2", art: "AUSWAHL", auswahl: ["  "] }),
      ]),
    ).toBe("");
  });

  it("nie Bemerkung, Angabe oder Hinweis — auch wenn die Zeile sie mitbraechte", () => {
    const mitFreitext = {
      ...zeile({ bezeichnung: "Dienst-Laptop/PC" }),
      bemerkung: "Bitte mit Dockingstation – Rücken",
      angabe: "Chemie, Religion",
    } as BriefListenZeile;
    const text = ausstattungListe([mitFreitext]);
    expect(text).toBe("Dienst-Laptop/PC");
    expect(text).not.toMatch(/Dockingstation|Religion/);
  });

  it("Reihenfolge wie im Formular: Stelle (IT vor Facility, HR hinten), dann Katalogreihenfolge, dann Bezeichnung", () => {
    expect(
      ausstattungListe([
        zeile({ bezeichnung: "Jobticket", departmentKey: "HR", reihenfolge: 0 }),
        zeile({ bezeichnung: "Parkplatz", departmentKey: "FACILITY", reihenfolge: 0 }),
        zeile({ bezeichnung: "Telefon mit Durchwahl", departmentKey: "IT", reihenfolge: 5 }),
        zeile({ bezeichnung: "Dienst-iPad", departmentKey: "IT", reihenfolge: 1 }),
        zeile({ bezeichnung: "BYOD freischalten", departmentKey: "IT", reihenfolge: 5 }),
      ]).split("\n"),
    ).toEqual(["Dienst-iPad", "BYOD freischalten", "Telefon mit Durchwahl", "Parkplatz", "Jobticket"]);
  });

  it("Zeilenumbrueche im Titel und doppelte Optionen fallen weg (eine Zeile je Position)", () => {
    expect(
      ausstattungListe([
        zeile({ bezeichnung: "Schlüssel\nHaupteingang", art: "AUSWAHL", auswahl: ["Lehrer-\nzimmer", "Lehrer-\nzimmer"] }),
      ]),
    ).toBe("Schlüssel Haupteingang: Lehrer- zimmer");
  });
});
