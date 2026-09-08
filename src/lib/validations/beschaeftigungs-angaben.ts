/**
 * Validierung der drei Tabellen aus Abschnitt 4 der Minijob-Checkliste.
 *
 * Alle drei liegen im selben Modell (`BeschaeftigungsAngabe`), unterscheiden
 * sich aber darin, welche Felder gefuellt sein muessen. Die Trennung passiert
 * hier ueber eine unterschiedene Vereinigung auf `kategorie` — so meldet Zod
 * gleich den richtigen Satz Fehler, statt ein Feld pauschal optional zu machen
 * und die Pruefung ins UI zu verlagern.
 *
 * Was das amtliche Muster verlangt:
 *
 * | Kategorie | Pflicht | Freiwillig |
 * |---|---|---|
 * | 4a WEITERE | Beschaeftigungsbeginn, Art | Arbeitgeber, Adresse |
 * | 4b VORBESCHAEFTIGUNG | Beginn und Ende, Entgelt ueber Grenze, Arbeitstage | Arbeitgeber bzw. Arbeitsagentur, Adresse |
 * | 4c AUSLAND | Beginn | Ende, Arbeitgeber bzw. Taetigkeitsort, Adresse |
 *
 * "Angabe freiwillig" steht so in der Fussnote des Musters — deshalb sind
 * Arbeitgeber und Adresse ueberall optional, obwohl sie fachlich nuetzlich sind.
 */

import { z } from "zod";

/**
 * Datum als `YYYY-MM-DD`, wie es ein `<input type="date">` liefert.
 *
 * Eine Fabrik statt einer gemeinsamen Konstante, weil der Feldname in die
 * Meldung gehoert: Der Aufrufer (`step6-employment.tsx`, `onSubmit`) sammelt
 * die Meldungen einer Zeile ein, entdoppelt sie und schreibt sie als EINEN
 * Satz in die rote Box. Eine Vorbeschaeftigung ohne Beginn und ohne Ende
 * erzeugt aber zweimal dieselbe Meldung — daraus wurde nach dem Entdoppeln ein
 * einziges "Bitte ein gültiges Datum angeben.", und die Person durfte raten,
 * welches der beiden Felder gemeint war.
 *
 * Ein leeres Feld faellt bewusst in dieselbe Meldung wie ein unsinniges Datum:
 * Zwei getrennte Pruefungen (`.min(1)` plus `.regex`) wuerden bei einem leeren
 * Feld beide anschlagen, und in der Box staenden zwei Saetze fuer ein Feld.
 */
const datum = (bezeichnung: string) =>
  z
    .string({
      required_error: `Bitte geben Sie ${bezeichnung} an.`,
      invalid_type_error: `Bitte geben Sie ${bezeichnung} an.`,
    })
    .trim()
    .regex(
      /^\d{4}-\d{2}-\d{2}$/,
      `Bitte geben Sie ${bezeichnung} als gültiges Datum an.`
    );

const arbeitgeberFelder = {
  // Angabe freiwillig (Fussnote des amtlichen Musters) — aber wenn etwas
  // dasteht, muss es in die Spalte passen.
  arbeitgeberName: z
    .string()
    .trim()
    .max(200, "Der Arbeitgeber darf höchstens 200 Zeichen lang sein.")
    .nullish(),
  arbeitgeberAdresse: z
    .string()
    .trim()
    .max(300, "Die Adresse darf höchstens 300 Zeichen lang sein.")
    .nullish(),
};

/**
 * Jedes Pflichtfeld braucht seine eigene deutsche Meldung.
 *
 * Die Oberflaeche legt eine leere Zeile an, sobald jemand die Grundfrage mit Ja
 * beantwortet. Wer sie stehen laesst und auf "Weiter" drueckt, las in der roten
 * Box bisher nur "Required" — Zods englische Vorgabe, ohne jeden Hinweis,
 * welches Feld gemeint ist. Bei mehreren leeren Feldern derselben Zeile stand
 * das Wort obendrein nur einmal da, weil der Aufrufer gleiche Meldungen
 * entdoppelt.
 */
const weitereSchema = z.object({
  kategorie: z.literal("WEITERE"),
  beginn: datum("den Beschäftigungsbeginn"),
  art: z.enum(
    [
      "GERINGFUEGIG_MIT_EIGENANTEIL",
      "GERINGFUEGIG_OHNE_EIGENANTEIL",
      "MEHR_ALS_GERINGFUEGIG",
    ],
    // Deckt beides ab: das unberuehrte Feld (`undefined`) und den leeren
    // Eintrag "Bitte waehlen..." — `required_error` allein nur das erste.
    { errorMap: () => ({ message: "Bitte wählen Sie die Art der Beschäftigung." }) }
  ),
  ...arbeitgeberFelder,
});

const vorbeschaeftigungSchema = z.object({
  kategorie: z.literal("VORBESCHAEFTIGUNG"),
  beginn: datum("den Beginn der Vorbeschäftigung"),
  ende: datum("das Ende der Vorbeschäftigung"),
  // Nur das Merkmal, kein Betrag — siehe Kommentar am Modell.
  entgeltUeberGrenze: z.boolean({
    required_error:
      "Bitte geben Sie an, ob das Entgelt über der Geringfügigkeitsgrenze lag.",
    invalid_type_error:
      "Bitte geben Sie an, ob das Entgelt über der Geringfügigkeitsgrenze lag.",
  }),
  // Zaehlt fuer die Drei-Monats-/70-Tage-Grenze der Berufsmaessigkeit.
  // `invalid_type_error` faengt auch die Nicht-Zahl ab: Das Eingabefeld liefert
  // Text, und `Number("acht")` ist NaN — fuer Zod ein Typfehler, kein
  // Bereichsfehler.
  arbeitstage: z
    .number({
      required_error: "Bitte geben Sie die Zahl der Arbeitstage an.",
      invalid_type_error: "Bitte geben Sie die Arbeitstage als Zahl an.",
    })
    .int("Bitte volle Arbeitstage angeben.")
    .min(0, "Die Arbeitstage können nicht negativ sein.")
    .max(366, "Mehr als 366 Arbeitstage hat ein Jahr nicht."),
  // Die Zeile kann eine Meldung bei der Arbeitsagentur statt einer
  // Beschaeftigung beschreiben. Beides zaehlt, muss aber unterscheidbar sein.
  beiArbeitsagentur: z
    .boolean({
      invalid_type_error:
        "Bitte geben Sie an, ob es sich um eine Meldung bei der Agentur für Arbeit handelt.",
    })
    .default(false),
  ...arbeitgeberFelder,
});

const auslandSchema = z.object({
  kategorie: z.literal("AUSLAND"),
  beginn: datum("den Beginn der Tätigkeit im Ausland"),
  // Eine laufende Taetigkeit hat noch kein Ende.
  ende: datum("das Ende der Tätigkeit im Ausland").nullish(),
  ...arbeitgeberFelder,
});

/**
 * Die Datumspruefung sitzt bewusst **auf** der Vereinigung, nicht in den
 * einzelnen Mitgliedern: `z.discriminatedUnion` verlangt reine Objekte. Ein
 * `.refine()` am Mitglied macht daraus ZodEffects, das Unterscheidungsmerkmal
 * geht verloren und `kategorie` kommt als `unknown` heraus.
 */
export const beschaeftigungsAngabeSchema = z
  .discriminatedUnion(
    "kategorie",
    [weitereSchema, vorbeschaeftigungSchema, auslandSchema],
    // Die Vereinigung meldet nur zwei eigene Fehler, und beide entstehen nicht
    // am Formular, sondern an einem manipulierten oder veralteten Aufruf. Ohne
    // diese Zuordnung stuenden sie als "Invalid discriminator value. Expected
    // 'WEITERE' | ..." in einer sonst deutschen Fehlerbox. `ctx.defaultError`
    // bleibt fuer alles andere stehen — die Meldungen der Mitglieder haengen an
    // deren eigenen Schemas und bleiben davon unberuehrt.
    {
      errorMap: (issue, ctx) => {
        if (issue.code === z.ZodIssueCode.invalid_union_discriminator) {
          return { message: "Unbekannte Art des Eintrags." };
        }
        if (issue.code === z.ZodIssueCode.invalid_type) {
          return { message: "Der Eintrag ist unvollständig." };
        }
        return { message: ctx.defaultError };
      },
    }
  )
  .superRefine((angabe, ctx) => {
    if (angabe.kategorie === "WEITERE") return;
    if (angabe.ende && angabe.ende < angabe.beginn) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ende"],
        message: "Das Ende darf nicht vor dem Beginn liegen.",
      });
    }
  });

export type BeschaeftigungsAngabeEingabe = z.infer<
  typeof beschaeftigungsAngabeSchema
>;

/**
 * Die Zeilen **einer** Kategorie, so wie ein Schritt sie sendet.
 *
 * Obergrenze 20: Die Papiervorlage hat zwei Zeilen; zwanzig ist grosszuegig und
 * verhindert zugleich, dass ein manipulierter Aufruf beliebig viele Zeilen
 * anlegt.
 */
export const beschaeftigungsAngabenListeSchema = z
  .array(beschaeftigungsAngabeSchema)
  .max(20, "Es sind höchstens 20 Einträge möglich.");

/** Kategorien, die es gibt — auch fuer Schleifen im Speicherpfad. */
export const BESCHAEFTIGUNGS_KATEGORIEN = [
  "WEITERE",
  "VORBESCHAEFTIGUNG",
  "AUSLAND",
] as const;

export type BeschaeftigungsKategorieWert =
  (typeof BESCHAEFTIGUNGS_KATEGORIEN)[number];

/** Lesbare Bezeichnung je Kategorie, fuer Oberflaeche und PDF. */
export const KATEGORIE_LABELS: Record<BeschaeftigungsKategorieWert, string> = {
  WEITERE: "Weitere Beschäftigung bei einem anderen Arbeitgeber",
  VORBESCHAEFTIGUNG: "Vorbeschäftigung im laufenden Kalenderjahr",
  AUSLAND: "Beschäftigung oder selbstständige Tätigkeit im Ausland",
};

/** Lesbare Bezeichnung der Art, wie im amtlichen Muster formuliert. */
export const ART_LABELS: Record<string, string> = {
  GERINGFUEGIG_MIT_EIGENANTEIL:
    "geringfügig entlohnt – mit Eigenanteil zur Rentenversicherung",
  GERINGFUEGIG_OHNE_EIGENANTEIL:
    "geringfügig entlohnt – ohne Eigenanteil zur Rentenversicherung",
  MEHR_ALS_GERINGFUEGIG: "mehr als geringfügig entlohnt",
};

/**
 * Bringt eine gepruefte Eingabe in die Form, die Prisma erwartet.
 *
 * Felder, die zu einer Kategorie nicht gehoeren, werden ausdruecklich auf
 * `null` gesetzt statt weggelassen: Beim Ersetzen einer Zeile darf kein Wert
 * aus einer frueheren Kategorie stehen bleiben.
 */
export function zuDatensatz(
  angabe: BeschaeftigungsAngabeEingabe,
  personalDataId: string,
  orderIndex: number
) {
  const basis = {
    personalDataId,
    orderIndex,
    kategorie: angabe.kategorie,
    beginn: new Date(angabe.beginn),
    arbeitgeberName: angabe.arbeitgeberName?.trim() || null,
    arbeitgeberAdresse: angabe.arbeitgeberAdresse?.trim() || null,
  };

  if (angabe.kategorie === "WEITERE") {
    return {
      ...basis,
      ende: null,
      art: angabe.art,
      entgeltUeberGrenze: null,
      arbeitstage: null,
      beiArbeitsagentur: false,
    };
  }

  if (angabe.kategorie === "VORBESCHAEFTIGUNG") {
    return {
      ...basis,
      ende: new Date(angabe.ende),
      art: null,
      entgeltUeberGrenze: angabe.entgeltUeberGrenze,
      arbeitstage: angabe.arbeitstage,
      beiArbeitsagentur: angabe.beiArbeitsagentur,
    };
  }

  return {
    ...basis,
    ende: angabe.ende ? new Date(angabe.ende) : null,
    art: null,
    entgeltUeberGrenze: null,
    arbeitstage: null,
    beiArbeitsagentur: false,
  };
}
