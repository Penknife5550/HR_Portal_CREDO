/**
 * Tests fuer die Grenzen und die Auswahlmeldungen der Einstellungsmodalitaeten
 * (src/lib/validations/supervisor-data.ts).
 *
 * Zwei Fehlerbilder stehen dahinter, beide aus dem Alltag der vorgesetzten
 * Person:
 *
 * 1. Eine Grenze kannte nur der Server. Wer eine ganze Stellenausschreibung in
 *    das Feld "Stellenbeschreibung (wird in Arbeitsvertrag uebernommen!)"
 *    kopierte, kam durch das Formular — und das Speichern antwortete mit einem
 *    blanken "Validierungsfehler". Kein rotes Feld, kein Hinweis, welcher
 *    Absatz zu lang ist.
 * 2. Ein Auswahlfeld meldete englisch. Der Vorgabewert ist `undefined`, das
 *    `<select>` sendet aber `""` — `required_error` greift nur im ersten Fall,
 *    und im zweiten stand "Invalid enum value. Expected 'TV_L' | ... received
 *    ''" unter dem Feld.
 */

import fs from "fs";
import path from "path";
import { z } from "zod";
import {
  supStep1Schema,
  supStep2Schema,
  supStep3Schema,
  supStep4Schema,
} from "@/lib/validations/supervisor-data";

// =============================================
// Gueltige Ausgangsdaten je Schritt
// =============================================
const BASIS: Record<number, Record<string, unknown>> = {
  1: {
    betriebsstaette: "Kingsleyallee 6",
    stellenbeschreibung: "Sozialpaedagogische Familienhilfe",
    vertragsbeginn: "2026-09-01",
    befristet: false,
    befristungsart: "",
    vertragsende: "",
    befristungZweck: "",
    vertragsendeVoraussichtlich: "",
    befristungSachgrund: "",
  },
  2: {
    vollzeit: true,
    wochenstunden: null,
    tageProWoche: null,
    hauptarbeitgeberId: "org-1",
    hauptarbeitgeberStunden: null,
    nebenarbeitgeberId: "",
    nebenarbeitgeberStunden: null,
    svPflichtig: true,
    minijob: false,
    ehrenamt: false,
  },
  3: {
    verguetungsmodell: "TV_L",
    entgeltgruppe: "",
    stufe: "",
    festgehalt: null,
    stundenlohn: null,
    bemerkungVerguetung: "",
    jahressonderzahlung: true,
    sonderzahlungProzent: null,
    sachbezuege: false,
    sachbezuegeBetrag: null,
    zulage: false,
    zulageBetrag: null,
  },
  4: {
    kostenstelle: "",
    kostenstelleAnteil: null,
    // Die Zeilen der Kostenstellen-Aufteilung stehen bewusst NICHT in
    // `supStep4Schema` — sie werden neben react-hook-form gehalten und mit
    // `kostenstellenListeSchema` geprueft (eigene Suite). Hier steht nur das
    // Bemerkungsfeld, das die Maske ueber das Formular sendet.
    kostenstellenBemerkung: "",
    probezeit: true,
    probezeitMonate: 6,
    urlaubstageProJahr: 30,
    masernschutzErforderlich: false,
    masernschutzVorArbeitsbeginn: false,
    zeiterfassung: true,
    zusatzvereinbarungen: "",
  },
};

const SCHEMAS: Record<number, z.ZodTypeAny> = {
  1: supStep1Schema,
  2: supStep2Schema,
  3: supStep3Schema,
  4: supStep4Schema,
};

/** Meldungen, die genau zu diesem einen Feld gehoeren. */
function meldungen(schritt: number, feld: string, wert: unknown): string[] {
  const ergebnis = SCHEMAS[schritt].safeParse({ ...BASIS[schritt], [feld]: wert });
  if (ergebnis.success) return [];
  return ergebnis.error.issues
    .filter((i) => i.path.join(".") === feld)
    .map((i) => i.message);
}

/**
 * Zods Rohmeldungen sind englisch. Statt jeden Wortlaut einzeln festzuklopfen —
 * das wuerde jede Umformulierung zum Testfehler machen — pruefen wir, dass
 * keine davon durchkommt.
 */
const ENGLISCHE_ROHMELDUNGEN =
  /String must contain|Number must be|Invalid enum value|Expected \w+, received|^Required$|Invalid input/;

function istDeutsch(meldung: string): boolean {
  return meldung.length > 0 && !ENGLISCHE_ROHMELDUNGEN.test(meldung);
}

// =============================================
// Die Grenzen, die auch der Server kennt
// =============================================
/**
 * Quelle der Wahrheit ist `modalitaetenFieldsSchema` in der Route. Die Tabelle
 * hier wird weiter unten gegen diese Datei gehalten — sie darf also nicht von
 * Hand veralten, ohne dass ein Test rot wird.
 */
const TEXT_GRENZEN = [
  { schritt: 1, feld: "betriebsstaette", max: 500 },
  { schritt: 1, feld: "stellenbeschreibung", max: 2000 },
  { schritt: 1, feld: "befristungZweck", max: 500 },
  { schritt: 1, feld: "befristungSachgrund", max: 500 },
  { schritt: 2, feld: "hauptarbeitgeberId", max: 200 },
  { schritt: 2, feld: "nebenarbeitgeberId", max: 200 },
  { schritt: 3, feld: "entgeltgruppe", max: 50 },
  { schritt: 3, feld: "stufe", max: 50 },
  { schritt: 3, feld: "bemerkungVerguetung", max: 2000 },
  { schritt: 4, feld: "kostenstelle", max: 100 },
  { schritt: 4, feld: "kostenstellenBemerkung", max: 2000 },
  { schritt: 4, feld: "zusatzvereinbarungen", max: 5000 },
] as const;

const ZAHL_GRENZEN = [
  { schritt: 2, feld: "wochenstunden", min: 0, max: 60 },
  { schritt: 2, feld: "tageProWoche", min: 1, max: 7 },
  { schritt: 2, feld: "hauptarbeitgeberStunden", min: 0, max: 60 },
  { schritt: 2, feld: "nebenarbeitgeberStunden", min: 0, max: 60 },
  { schritt: 3, feld: "festgehalt", min: 0, max: undefined },
  { schritt: 3, feld: "stundenlohn", min: 0, max: undefined },
  { schritt: 3, feld: "sonderzahlungProzent", min: 0, max: 100 },
  { schritt: 3, feld: "sachbezuegeBetrag", min: 0, max: undefined },
  { schritt: 3, feld: "zulageBetrag", min: 0, max: undefined },
  { schritt: 4, feld: "kostenstelleAnteil", min: 0, max: 100 },
  { schritt: 4, feld: "probezeitMonate", min: 0, max: 12 },
  { schritt: 4, feld: "urlaubstageProJahr", min: 0, max: 50 },
] as const;

describe("Ausgangsdaten", () => {
  it("sind in allen vier Schritten gueltig", () => {
    for (const schritt of [1, 2, 3, 4]) {
      const ergebnis = SCHEMAS[schritt].safeParse(BASIS[schritt]);
      expect(ergebnis.success).toBe(true);
    }
  });
});

describe("Laengengrenzen greifen schon im Formular", () => {
  it.each(TEXT_GRENZEN)("$feld nimmt genau $max Zeichen", ({ schritt, feld, max }) => {
    expect(meldungen(schritt, feld, "x".repeat(max))).toEqual([]);
  });

  it.each(TEXT_GRENZEN)("$feld weist $max + 1 Zeichen deutsch ab", ({ schritt, feld, max }) => {
    const gemeldet = meldungen(schritt, feld, "x".repeat(max + 1));
    // Am Feld, nicht irgendwo im Formular: Nur dann faerbt die Oberflaeche das
    // richtige Eingabefeld rot.
    expect(gemeldet.length).toBeGreaterThan(0);
    for (const m of gemeldet) expect(istDeutsch(m)).toBe(true);
  });
});

describe("Zahlengrenzen greifen schon im Formular", () => {
  it.each(ZAHL_GRENZEN)("$feld nimmt den Kleinstwert $min", ({ schritt, feld, min }) => {
    expect(meldungen(schritt, feld, min)).toEqual([]);
  });

  it.each(ZAHL_GRENZEN)("$feld weist $min - 1 deutsch ab", ({ schritt, feld, min }) => {
    const gemeldet = meldungen(schritt, feld, min - 1);
    expect(gemeldet.length).toBeGreaterThan(0);
    for (const m of gemeldet) expect(istDeutsch(m)).toBe(true);
  });

  it.each(ZAHL_GRENZEN.filter((g) => g.max !== undefined))(
    "$feld weist $max + 1 deutsch ab",
    ({ schritt, feld, max }) => {
      const gemeldet = meldungen(schritt, feld, (max as number) + 1);
      expect(gemeldet.length).toBeGreaterThan(0);
      for (const m of gemeldet) expect(istDeutsch(m)).toBe(true);
    }
  );

  it.each(ZAHL_GRENZEN)("$feld meldet ein geleertes Feld deutsch", ({ schritt, feld }) => {
    // Ein geleertes Zahlenfeld liefert NaN (siehe src/lib/formular-zahlen.ts).
    // Fuer Zod ist das ein Typfehler — ohne eigene Meldung stuende dort
    // "Expected number, received nan".
    for (const m of meldungen(schritt, feld, Number.NaN)) {
      expect(istDeutsch(m)).toBe(true);
    }
  });
});

// =============================================
// Client und Server duerfen nicht auseinanderlaufen
// =============================================
describe("Die Grenzen stimmen mit dem Server ueberein", () => {
  const ROUTE = path.join(
    process.cwd(),
    "src",
    "app",
    "api",
    "modalitaeten",
    "[token]",
    "route.ts"
  );
  const quelle = fs.readFileSync(ROUTE, "utf-8");

  /** Die `.min()`/`.max()`-Angaben einer Feldzeile des Server-Schemas. */
  function serverGrenze(feld: string, art: "string" | "number") {
    const treffer = quelle.match(
      new RegExp(`^\\s*${feld}:\\s*z\\.${art}\\(\\)(.*)$`, "m")
    );
    if (!treffer) return null;
    const max = treffer[1].match(/\.max\((\d+)\)/);
    const min = treffer[1].match(/\.min\((\d+)\)/);
    return {
      max: max ? Number(max[1]) : undefined,
      min: min ? Number(min[1]) : undefined,
    };
  }

  it.each(TEXT_GRENZEN)("$feld: derselbe Hoechstwert wie in der Route", ({ feld, max }) => {
    const server = serverGrenze(feld, "string");
    // Kein Treffer heisst nicht "keine Grenze", sondern "die Route sieht anders
    // aus als erwartet" — dann muss jemand hinsehen, statt dass der Test still
    // durchwinkt.
    expect(server).not.toBeNull();
    expect(server!.max).toBe(max);
  });

  it.each(ZAHL_GRENZEN)("$feld: dieselben Zahlengrenzen wie in der Route", ({ feld, min, max }) => {
    const server = serverGrenze(feld, "number");
    expect(server).not.toBeNull();
    expect(server!.min).toBe(min);
    expect(server!.max).toBe(max);
  });
});

// =============================================
// Auswahlfelder melden deutsch
// =============================================
describe("verguetungsmodell", () => {
  it("meldet die leere Auswahl deutsch", () => {
    // Das ist der Fall, den die Oberflaeche selbst herbeifuehrt: Das
    // `<select>` traegt einen Eintrag "Bitte waehlen..." mit dem Wert "".
    expect(meldungen(3, "verguetungsmodell", "")).toEqual([
      "Bitte wählen Sie ein Vergütungsmodell.",
    ]);
  });

  it("meldet das unberuehrte Feld mit demselben Satz", () => {
    // Der Vorgabewert des Formulars ist `undefined`.
    expect(meldungen(3, "verguetungsmodell", undefined)).toEqual([
      "Bitte wählen Sie ein Vergütungsmodell.",
    ]);
  });

  it("meldet auch einen unbekannten Wert deutsch", () => {
    for (const m of meldungen(3, "verguetungsmodell", "TV_OED")) {
      expect(istDeutsch(m)).toBe(true);
    }
  });

  it("nimmt die vier vorgesehenen Modelle", () => {
    for (const modell of ["TV_L", "TV_L_S", "HAUSTARIF", "SONSTIGES"]) {
      expect(meldungen(3, "verguetungsmodell", modell)).toEqual([]);
    }
  });
});

describe("befristungsart", () => {
  it("laesst die leere Auswahl bei unbefristetem Vertrag stehen", () => {
    // Ein unbefristeter Vertrag hat keine Art — "" ist hier kein Fehler.
    expect(meldungen(1, "befristungsart", "")).toEqual([]);
  });

  it("meldet einen unbekannten Wert deutsch statt 'Invalid input'", () => {
    // Frueher stand hier eine Vereinigung (`z.enum(...).or(z.literal(""))`).
    // Scheitert die, meldet Zod `invalid_union` mit "Invalid input" — die
    // Meldungen der Mitglieder kommen gar nicht erst zum Zug.
    const gemeldet = meldungen(1, "befristungsart", "HALBJAHR");
    expect(gemeldet.length).toBeGreaterThan(0);
    for (const m of gemeldet) expect(istDeutsch(m)).toBe(true);
  });

  it("meldet ein fehlendes Feld deutsch", () => {
    const gemeldet = meldungen(1, "befristungsart", undefined);
    expect(gemeldet.length).toBeGreaterThan(0);
    for (const m of gemeldet) expect(istDeutsch(m)).toBe(true);
  });

  it("nimmt beide Arten des TzBfG", () => {
    for (const art of ["KALENDER", "ZWECK"]) {
      // Bei `befristet: false` genuegt die Art allein — die Folgefelder
      // pruefet das superRefine nur im befristeten Fall.
      expect(meldungen(1, "befristungsart", art)).toEqual([]);
    }
  });
});
