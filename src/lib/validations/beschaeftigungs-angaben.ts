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

/** Datum als `YYYY-MM-DD`, wie es ein `<input type="date">` liefert. */
const datum = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Bitte ein gültiges Datum angeben.");

const arbeitgeberFelder = {
  // Angabe freiwillig (Fussnote des amtlichen Musters).
  arbeitgeberName: z.string().trim().max(200).nullish(),
  arbeitgeberAdresse: z.string().trim().max(300).nullish(),
};

const weitereSchema = z.object({
  kategorie: z.literal("WEITERE"),
  beginn: datum,
  art: z.enum([
    "GERINGFUEGIG_MIT_EIGENANTEIL",
    "GERINGFUEGIG_OHNE_EIGENANTEIL",
    "MEHR_ALS_GERINGFUEGIG",
  ]),
  ...arbeitgeberFelder,
});

const vorbeschaeftigungSchema = z.object({
  kategorie: z.literal("VORBESCHAEFTIGUNG"),
  beginn: datum,
  ende: datum,
  // Nur das Merkmal, kein Betrag — siehe Kommentar am Modell.
  entgeltUeberGrenze: z.boolean(),
  // Zaehlt fuer die Drei-Monats-/70-Tage-Grenze der Berufsmaessigkeit.
  arbeitstage: z.number().int().min(0).max(366),
  // Die Zeile kann eine Meldung bei der Arbeitsagentur statt einer
  // Beschaeftigung beschreiben. Beides zaehlt, muss aber unterscheidbar sein.
  beiArbeitsagentur: z.boolean().default(false),
  ...arbeitgeberFelder,
});

const auslandSchema = z.object({
  kategorie: z.literal("AUSLAND"),
  beginn: datum,
  // Eine laufende Taetigkeit hat noch kein Ende.
  ende: datum.nullish(),
  ...arbeitgeberFelder,
});

/**
 * Die Datumspruefung sitzt bewusst **auf** der Vereinigung, nicht in den
 * einzelnen Mitgliedern: `z.discriminatedUnion` verlangt reine Objekte. Ein
 * `.refine()` am Mitglied macht daraus ZodEffects, das Unterscheidungsmerkmal
 * geht verloren und `kategorie` kommt als `unknown` heraus.
 */
export const beschaeftigungsAngabeSchema = z
  .discriminatedUnion("kategorie", [
    weitereSchema,
    vorbeschaeftigungSchema,
    auslandSchema,
  ])
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
