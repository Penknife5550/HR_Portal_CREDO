/**
 * Zod-Validierungsschemas für die Einstellungsmodalitaeten (Vorgesetzter)
 *
 * 5 Abschnitte basierend auf dem Einstellungsmodalitaeten-Formular:
 * 1. Stelle & Vertrag
 * 2. Arbeitszeit & Arbeitgeber
 * 3. Vergütung
 * 4. Zusaetzliche Angaben
 * 5. Zusammenfassung
 */

import { z } from "zod";

// =============================================
// Gemeinsame Bausteine
// =============================================
/**
 * Pflichtmeldung fuer ein Auswahlfeld, die in BEIDEN Faellen greift, die ein
 * `<select>` erzeugen kann: gar kein Wert (`undefined` — so steht das Feld da,
 * solange niemand es angefasst hat) und der Eintrag "Bitte waehlen..." (`""`,
 * sobald es einmal beruehrt wurde).
 *
 * `required_error` deckt nur den ersten Fall ab. Im zweiten stand bisher Zods
 * englische Rohmeldung unter dem Feld — "Invalid enum value. Expected 'TV_L' |
 * 'TV_L_S' | ... received ''" —, also ausgerechnet in dem Fall, den die
 * Oberflaeche selbst herbeifuehrt.
 */
const auswahlPflicht = (satz: string) => ({ errorMap: () => ({ message: satz }) });

// ZU DEN LAENGEN- UND ZAHLENGRENZEN IN ALLEN VIER SCHRITTEN:
// Sie spiegeln `modalitaetenFieldsSchema` in
// `src/app/api/modalitaeten/[token]/route.ts`. Kennt nur der Server die Grenze,
// antwortet er auf das Speichern mit einem blanken "Validierungsfehler" — ohne
// rotes Feld, ohne Hinweis, welcher Absatz zu lang ist. Beide Seiten muessen
// darum denselben Wert tragen; weicht der Server ab, gilt sein Wert.
// `supervisor-grenzen.test.ts` haelt die Paare gegeneinander und wird rot,
// sobald eine Seite allein wandert.
//
// Ein Teil der Felder haengt an einem `<select>` mit kurzen festen Werten
// (Sachgrund, Entgeltgruppe, Stufe, Arbeitgeber-IDs). Dort ist die Grenze von
// Hand nicht erreichbar — sie steht trotzdem hier, damit das Paar nicht
// auseinanderlaeuft, wenn aus einem der Felder spaeter ein Textfeld wird.

// =============================================
// Step 1: Stelle & Vertrag
// =============================================
/**
 * Art der Befristung:
 * - KALENDER: kalendermaessig befristet, festes Enddatum (§ 3 Abs. 1 S. 2 Alt. 1 TzBfG)
 * - ZWECK:    Zweckbefristung, Ende mit Zweckerreichung (§ 3 Abs. 1 S. 2 Alt. 2 TzBfG),
 *             z.B. projektbezogen bis zum Auslaufen einer Kostenzusage – ohne festes Datum
 */
export const BEFRISTUNGSARTEN = ["KALENDER", "ZWECK"] as const;

export const supStep1Schema = z
  .object({
    betriebsstaette: z
      .string()
      .min(1, "Betriebsstaette ist erforderlich.")
      .max(500, "Bitte maximal 500 Zeichen."),
    // 2000 Zeichen: Die Beschriftung lautet "wird in Arbeitsvertrag
    // uebernommen!" — das ist die Einladung, eine ganze Stellenausschreibung
    // hineinzukopieren. Ohne diese Grenze faellt das erst dem Server auf.
    stellenbeschreibung: z
      .string()
      .min(1, "Stellenbeschreibung ist erforderlich.")
      .max(2000, "Bitte maximal 2000 Zeichen."),
    vertragsbeginn: z.string().min(1, "Vertragsbeginn ist erforderlich."),
    befristet: z.boolean(),
    // Die leere Auswahl gehoert in die Liste statt hinter ein
    // `.or(z.literal(""))`: Scheitert eine Vereinigung, meldet Zod
    // `invalid_union` mit "Invalid input", und die errorMap der Mitglieder
    // kommt gar nicht erst zum Zug. Ob die leere Auswahl reicht, entscheidet
    // weiterhin das superRefine weiter unten — nur befristet ist sie ein
    // Fehler.
    befristungsart: z.enum(
      [...BEFRISTUNGSARTEN, ""] as const,
      auswahlPflicht("Bitte wählen Sie die Art der Befristung.")
    ),
    vertragsende: z.string(),
    befristungZweck: z.string().max(500, "Bitte maximal 500 Zeichen."),
    vertragsendeVoraussichtlich: z.string(),
    befristungSachgrund: z.string().max(500, "Bitte maximal 500 Zeichen."),
  })
  .superRefine((v, ctx) => {
    if (!v.befristet) return;

    if (!v.befristungsart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["befristungsart"],
        message: "Bitte wählen Sie die Art der Befristung.",
      });
      return;
    }

    // Kalendermaessige Befristung: festes Enddatum ist Pflicht
    if (v.befristungsart === "KALENDER" && !v.vertragsende) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["vertragsende"],
        message:
          "Bitte geben Sie das Vertragsende an – oder wählen Sie die Zweckbefristung, wenn kein Datum feststeht.",
      });
    }

    // Zweckbefristung: Beschreibung des Zwecks ist Pflicht (ersetzt das fehlende Datum)
    if (v.befristungsart === "ZWECK" && v.befristungZweck.trim().length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["befristungZweck"],
        message: "Bitte beschreiben Sie, wodurch der Vertrag endet (z.B. Ende der Kostenzusage).",
      });
    }
  });

export type SupStep1Data = z.infer<typeof supStep1Schema>;

// =============================================
// Step 2: Arbeitszeit & Arbeitgeber-Zuordnung
// =============================================
export const supStep2Schema = z.object({
  vollzeit: z.boolean(),
  wochenstunden: z.number({ invalid_type_error: "Bitte eine Zahl eingeben." })
    .min(0, "Die Wochenstunden koennen nicht negativ sein.")
    .max(60, "Mehr als 60 Wochenstunden sind nicht moeglich - bitte pruefen.")
    .nullable(),
  // .int(): Die Spalte ist Int? — ohne diese Regel kaemen 2,5 Tage durch die
  // Pruefung und scheiterten erst bei Prisma, also als Serverfehler ohne
  // brauchbare Meldung fuer die vorgesetzte Person.
  tageProWoche: z.number({ invalid_type_error: "Bitte eine Zahl eingeben." })
    .int("Bitte volle Tage angeben.")
    .min(1, "Mindestens ein Tag pro Woche.")
    .max(7, "Mehr als sieben Tage hat die Woche nicht.")
    .nullable(),
  hauptarbeitgeberId: z
    .string()
    .min(1, "Hauptarbeitgeber ist erforderlich.")
    .max(200, "Bitte maximal 200 Zeichen."),
  hauptarbeitgeberStunden: z.number({ invalid_type_error: "Bitte eine Zahl eingeben." })
    .min(0, "Die Stunden koennen nicht negativ sein.")
    .max(60, "Mehr als 60 Wochenstunden sind nicht moeglich - bitte pruefen.")
    .nullable(),
  nebenarbeitgeberId: z.string().max(200, "Bitte maximal 200 Zeichen."),
  // Dieselbe Obergrenze wie beim Hauptarbeitgeber: Der Server kennt sie
  // laengst, hier fehlte sie als einziges der drei Stundenfelder.
  nebenarbeitgeberStunden: z.number({ invalid_type_error: "Bitte eine Zahl eingeben." })
    .min(0, "Die Stunden koennen nicht negativ sein.")
    .max(60, "Mehr als 60 Wochenstunden sind nicht moeglich - bitte pruefen.")
    .nullable(),
  svPflichtig: z.boolean(),
  minijob: z.boolean(),
  ehrenamt: z.boolean(),
});

export type SupStep2Data = z.infer<typeof supStep2Schema>;

// =============================================
// Step 3: Vergütung
// =============================================
export const supStep3Schema = z.object({
  // Der Vorgabewert ist `undefined`, das Auswahlfeld sendet aber `""` — siehe
  // auswahlPflicht(). `required_error` allein griff nur im ersten Fall.
  verguetungsmodell: z.enum(
    ["TV_L", "TV_L_S", "HAUSTARIF", "SONSTIGES"],
    auswahlPflicht("Bitte wählen Sie ein Vergütungsmodell.")
  ),
  entgeltgruppe: z.string().max(50, "Bitte maximal 50 Zeichen."),
  stufe: z.string().max(50, "Bitte maximal 50 Zeichen."),
  festgehalt: z.number({ invalid_type_error: "Bitte eine Zahl eingeben." })
    .min(0, "Der Betrag kann nicht negativ sein.")
    .nullable(),
  stundenlohn: z.number({ invalid_type_error: "Bitte eine Zahl eingeben." })
    .min(0, "Der Betrag kann nicht negativ sein.")
    .nullable(),
  bemerkungVerguetung: z.string().max(2000, "Bitte maximal 2000 Zeichen."),
  jahressonderzahlung: z.boolean(),
  sonderzahlungProzent: z.number({ invalid_type_error: "Bitte eine Zahl eingeben." })
    .min(0, "Der Anteil kann nicht negativ sein.")
    .max(100, "Der Anteil kann hoechstens 100 Prozent betragen.")
    .nullable(),
  sachbezuege: z.boolean(),
  sachbezuegeBetrag: z.number({ invalid_type_error: "Bitte eine Zahl eingeben." })
    .min(0, "Der Betrag kann nicht negativ sein.")
    .nullable(),
  zulage: z.boolean(),
  zulageBetrag: z.number({ invalid_type_error: "Bitte eine Zahl eingeben." })
    .min(0, "Der Betrag kann nicht negativ sein.")
    .nullable(),
});

export type SupStep3Data = z.infer<typeof supStep3Schema>;

// =============================================
// Step 4: Zusaetzliche Angaben
// =============================================
export const supStep4Schema = z.object({
  kostenstelle: z.string().max(100, "Bitte maximal 100 Zeichen."),
  kostenstelleAnteil: z.number({ invalid_type_error: "Bitte eine Zahl eingeben." })
    .min(0, "Der Anteil kann nicht negativ sein.")
    .max(100, "Der Anteil kann hoechstens 100 Prozent betragen.")
    .nullable(),
  probezeit: z.boolean(),
  // .int(): Spalte ist Int? — 6,5 Monate scheiterten sonst erst bei Prisma.
  probezeitMonate: z.number({ invalid_type_error: "Bitte eine Zahl eingeben." })
    .int("Bitte volle Monate angeben.")
    .min(0, "Die Probezeit kann nicht negativ sein.")
    .max(12, "Die Probezeit betraegt hoechstens zwoelf Monate.")
    .nullable(),
  // .int(): Spalte ist Int? — halbe Urlaubstage scheiterten sonst erst bei Prisma.
  urlaubstageProJahr: z.number({ invalid_type_error: "Bitte eine Zahl eingeben." })
    .int("Bitte volle Tage angeben.")
    .min(0, "Die Urlaubstage koennen nicht negativ sein.")
    .max(50, "Mehr als 50 Urlaubstage sind nicht vorgesehen - bitte pruefen.")
    .nullable(),
  masernschutzErforderlich: z.boolean(),
  masernschutzVorArbeitsbeginn: z.boolean(),
  zeiterfassung: z.boolean(),
  zusatzvereinbarungen: z.string().max(5000, "Bitte maximal 5000 Zeichen."),
});

export type SupStep4Data = z.infer<typeof supStep4Schema>;

// =============================================
// Step-Konfiguration
// =============================================
export const SUP_STEP_CONFIG = [
  {
    number: 1,
    title: "Stelle & Vertrag",
    description: "Betriebsstaette, Stellenbeschreibung, Vertragsdaten",
  },
  {
    number: 2,
    title: "Arbeitszeit & Arbeitgeber",
    description: "Umfang, Haupt-/Nebenarbeitgeber, Vertragsart",
  },
  {
    number: 3,
    title: "Vergütung",
    description: "Entgeltgruppe, Zulagen, Sonderzahlungen",
  },
  {
    number: 4,
    title: "Zusaetzliche Angaben",
    description: "Kostenstelle, Probezeit, Urlaub, Masernschutz",
  },
  {
    number: 5,
    title: "Zusammenfassung",
    description: "Pruefen und Absenden",
  },
] as const;
