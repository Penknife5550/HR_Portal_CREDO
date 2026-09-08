/**
 * Zod-Validierungsschemas für den Personalfragebogen
 *
 * 10 Steps, angelehnt an Haufe HI13214732:
 * 1. Persönliche Angaben
 * 2. Adresse & Kontakt
 * 3. Bankverbindung
 * 4. Sozialversicherung
 * 5. Steuer
 * 6. Weitere Beschaeftigung
 * 7. Kinder
 * 8. Bildung & Beruf
 * 9. Masernschutz
 * 10. Zusammenfassung + DSGVO
 */

import { z } from "zod";
import { validateIBAN } from "@/lib/utils/iban-validator";
import { FieldConfigHelper } from "@/lib/field-definitions";

/**
 * Text-Feld, dessen Pflicht die Vorlage bestimmt — mit optionaler Laengengrenze.
 *
 * Die Grenze gilt IMMER, unabhaengig von der Pflicht. Der Server begrenzt diese
 * Felder ohnehin (`fragebogenFieldsSchema` in api/fragebogen/[token]/route.ts);
 * fehlt die Grenze hier, laesst der Schritt die zu lange Eingabe durch, der
 * Auto-Save antwortet mit 400 — und die Person liest ein "Validierungsfehler"
 * ueber dem Formular, ohne dass irgendein Feld rot wird. Die Grenze gehoert
 * deshalb an BEIDE Enden.
 */
function reqStr(
  fc: FieldConfigHelper,
  name: string,
  msg: string,
  grenze?: { max: number; msg: string }
) {
  const basis = grenze ? z.string().max(grenze.max, grenze.msg) : z.string();
  return fc.isRequired(name) ? basis.min(1, msg) : basis;
}

/**
 * Zahlen-Feld, dessen Pflicht die Vorlage bestimmt.
 *
 * Der Ausgabetyp bleibt in BEIDEN Zweigen `number | null`. Ein
 * `.nullable()` wegzulassen waere naheliegend, aendert aber den abgeleiteten
 * Typ des Schemas — und die Masken tippen ihr Formular an `StepNData` aus dem
 * statischen Schema. Die Pflicht sitzt deshalb in einer Verfeinerung, nicht im
 * Typ: Sie liefert bei `null` den deutschen Satz statt Zods "Expected number,
 * received null".
 */
function reqZahl(fc: FieldConfigHelper, name: string, msg: string) {
  const basis = z
    .number({ invalid_type_error: "Bitte eine Zahl eingeben." })
    .min(0, "Der Betrag kann nicht negativ sein.")
    .nullable();
  return fc.isRequired(name)
    ? basis.refine((wert) => wert !== null, { message: msg })
    : basis;
}

/**
 * Was „keine Angabe" im Formular alles bedeuten kann.
 *
 * Ein <select> mit leerer Vorauswahl liefert `""`. Eine Radiogruppe, in der
 * keine Option angehakt ist, liefert in react-hook-form dagegen `null`. Zod
 * kennt fuer „nicht gesetzt" nur `undefined` — und daran haengen zwei echte
 * Blockaden:
 *
 * - Bei einem PFLICHT-Enum greift `required_error` ausschliesslich bei
 *   `undefined`. Bei `null` faellt Zod auf seine englische Standardmeldung
 *   zurueck („Expected 'hauptarbeitgeber' | ... received null") — mitten im
 *   deutschen Fragebogen.
 * - Bei einem FREIWILLIGEN Enum scheiterte `null` an `z.enum().optional()`.
 *   Der Schritt blockierte also an einem Feld, das gar nicht ausgefuellt
 *   werden muss, und eine Radiogruppe liess sich nie wieder leeren.
 *
 * Deshalb sitzt diese Umschreibung ueber BEIDEN Zweigen, nicht nur ueber dem
 * freiwilligen.
 */
const leerZuUndefined = (wert: unknown) =>
  wert === "" || wert === null ? undefined : wert;

/**
 * Ein und derselbe deutsche Satz fuer JEDEN Fehlercode des Auswahlfeldes.
 *
 * `required_error` deckt allein `undefined` ab. Fuer alles andere bleibt Zods
 * englischer Standardtext stehen — und der ist hier der Regelfall, nicht die
 * Ausnahme: Ein `<select>` mit leerer Vorauswahl sendet `""`, und dafuer wirft
 * Zod `invalid_enum_value`. Unter dem Pflichtfeld in „Bildung & Beruf" stand so
 * woertlich „Invalid enum value. Expected 'ohne_schulabschluss' | ..., received
 * ''" — mitten im deutschen Fragebogen.
 *
 * Die `errorMap` greift unabhaengig vom Code und deckt damit `""`, `null`,
 * `undefined` und einen erfundenen Wert gleichermassen ab. Der `preprocess`
 * darueber bleibt trotzdem noetig: Er unterscheidet „leer" von „falsch" und
 * laesst ein FREIWILLIGES Feld leer passieren, statt es abzuweisen.
 */
function enumMeldung(msg: string): z.ZodErrorMap {
  return () => ({ message: msg });
}

/** Pflicht-Enum mit deutscher Meldung — auch wenn nichts angehakt ist. */
function pflichtEnum<T extends [string, ...string[]]>(values: T, msg: string) {
  return z.preprocess(
    leerZuUndefined,
    z.enum(values, { errorMap: enumMeldung(msg) })
  );
}

// Helper: Enum-Feld das nur required ist wenn FieldConfig es verlangt
function reqEnum<T extends [string, ...string[]]>(
  fc: FieldConfigHelper,
  name: string,
  values: T,
  msg: string
) {
  return fc.isRequired(name)
    ? pflichtEnum(values, msg)
    : z.preprocess(
        leerZuUndefined,
        // Auch der freiwillige Zweig braucht die Meldung: Leer ist hier
        // erlaubt, ein Wert ausserhalb der Liste aber nicht — und dafuer stuende
        // sonst wieder der englische Satz unter dem Feld.
        z.enum(values, { errorMap: enumMeldung(msg) }).optional()
      );
}

// =============================================
// Step 1: Persönliche Angaben
// =============================================
export const step1Schema = z.object({
  // Radiogruppe: ohne angehakte Option liefert das Formular null, nicht
  // undefined — siehe pflichtEnum.
  salutation: pflichtEnum(["Herr", "Frau"], "Bitte waehlen Sie eine Anrede."),
  title: z.string(),
  firstName: z.string().min(1, "Vorname ist erforderlich.").max(100),
  lastName: z.string().min(1, "Nachname ist erforderlich.").max(100),
  birthName: z.string(),
  birthDate: z.string().min(1, "Geburtsdatum ist erforderlich."),
  birthPlace: z.string().min(1, "Geburtsort ist erforderlich."),
  birthCountry: z.string(),
  nationality: z.string(),
  maritalStatus: pflichtEnum(
    ["ledig", "verheiratet", "geschieden", "verwitwet", "getrennt_lebend", "eingetragene_partnerschaft"],
    "Bitte waehlen Sie den Familienstand."
  ),
  severelyDisabled: z.boolean(),
  disabilityDegree: z.number({ invalid_type_error: "Bitte eine Zahl eingeben." })
      .int("Bitte einen vollen Grad angeben.")
      .min(0, "Der Grad kann nicht negativ sein.")
      .max(100, "Der Grad betraegt hoechstens 100.")
      .nullable(),
});

export type Step1Data = z.infer<typeof step1Schema>;

// =============================================
// Step 2: Adresse & Kontakt
// =============================================
export const step2Schema = z.object({
  street: z.string().min(1, "Strasse ist erforderlich."),
  houseNumber: z
    .string()
    .min(1, "Hausnummer ist erforderlich.")
    .max(20, "Die Hausnummer darf hoechstens 20 Zeichen lang sein."),
  zipCode: z
    .string()
    .min(4, "PLZ muss mindestens 4 Zeichen lang sein.")
    .max(10, "Die PLZ darf hoechstens 10 Zeichen lang sein."),
  city: z.string().min(1, "Ort ist erforderlich."),
  country: z.string(),
  phone: z.string().max(50, "Die Telefonnummer darf hoechstens 50 Zeichen lang sein."),
  mobile: z.string().max(50, "Die Mobilnummer darf hoechstens 50 Zeichen lang sein."),
  emailPrivate: z
    .string()
    .refine(
      (val) => val === "" || z.string().email().safeParse(val).success,
      { message: "Bitte geben Sie eine gültige E-Mail-Adresse ein." }
    ),
});

export type Step2Data = z.infer<typeof step2Schema>;

// =============================================
// Step 3: Bankverbindung
// =============================================
export const step3Schema = z.object({
  iban: z
    .string()
    .min(1, "IBAN ist erforderlich.")
    .refine(
      (val) => {
        if (!val) return true; // min(1) handles the required check
        return validateIBAN(val);
      },
      { message: "Bitte geben Sie eine gültige IBAN ein." }
    ),
  bic: z.string().max(11, "Die BIC darf hoechstens 11 Zeichen lang sein."),
  bankName: z.string(),
  accountHolder: z.string(),
});

export type Step3Data = z.infer<typeof step3Schema>;

// =============================================
// Step 4: Sozialversicherung
// =============================================
export const step4Schema = z.object({
  socialSecurityNumber: z
    .string()
    .max(20, "Die Sozialversicherungsnummer darf hoechstens 20 Zeichen lang sein."),
  healthInsuranceName: z.string().min(1, "Krankenkasse ist erforderlich."),
  healthInsuranceType: pflichtEnum(
    ["gesetzlich", "privat"],
    "Bitte waehlen Sie die Versicherungsart."
  ),
  parentStatus: z.boolean(),
  minijobRvBefreiung: z.boolean(),
});

export type Step4Data = z.infer<typeof step4Schema>;

// =============================================
// Step 5: Steuer
// =============================================
export const step5Schema = z.object({
  taxId: z
    .string()
    .min(1, "Steuer-ID ist erforderlich.")
    .regex(/^\d{10,11}$/, "Steuer-ID muss 10 oder 11 Ziffern enthalten."),
  taxClass: pflichtEnum(
    ["I", "II", "III", "IV", "V", "VI"],
    "Bitte waehlen Sie die Steuerklasse."
  ),
  taxAllowance: z.number().min(0).nullable(),
  childAllowance: z.number().min(0).nullable(),
  religion: pflichtEnum(
    ["ev", "rk", "ak", "lt", "rf", "fr", "fg", "keine", "sonstige"],
    "Bitte waehlen Sie die Religionszugehörigkeit."
  ),
});

export type Step5Data = z.infer<typeof step5Schema>;

// =============================================
// Step 6: Weitere Beschaeftigung
// =============================================
export const step6Schema = z.object({
  beschaeftigungsStatus: z.string(),
  beschaeftigungsStatusSonstige: z.string().optional(),
  alsArbeitsuchendGemeldet: z.boolean(),
  agenturFuerArbeit: z.string().optional(),
  mitLeistungsbezug: z.boolean().nullable().optional(),
  hasOtherEmployment: z.boolean(),
  summeUeberGeringfuegigkeitsgrenze: z.boolean().nullable().optional(),
  vorbeschaeftigungenVorhanden: z.boolean(),
  auslandsbeschaeftigungVorhanden: z.boolean(),
  employerType: pflichtEnum(
    ["hauptarbeitgeber", "nebenarbeitgeber", "nein"],
    "Bitte waehlen Sie eine Option."
  ),
});

export type Step6Data = z.infer<typeof step6Schema>;

// =============================================
// Step 7: Kinder
// =============================================
export const childSchema = z.object({
  firstName: z.string().min(1, "Vorname des Kindes ist erforderlich."),
  lastName: z.string(),
  birthDate: z.string().min(1, "Geburtsdatum des Kindes ist erforderlich."),
  taxAllowance: z.boolean(),
});

export const step7Schema = z.object({
  children: z.array(childSchema),
});

export type Step7Data = z.infer<typeof step7Schema>;
export type ChildData = z.infer<typeof childSchema>;

// =============================================
// Step 8: Bildung & Beruf
// =============================================
export const step8Schema = z.object({
  highestSchoolDegree: pflichtEnum(
    [
      "ohne_schulabschluss",
      "hauptschulabschluss",
      "mittlere_reife",
      "abitur_fachabitur",
      "sonstiges",
    ],
    "Bitte waehlen Sie den hoechsten Schulabschluss."
  ),
  highestProfessionalDegree: pflichtEnum(
    [
      "ohne_berufsausbildung",
      "anerkannte_berufsausbildung",
      "meister_techniker_fachschule",
      "bachelor",
      "diplom_magister_master_staatsexamen",
      "promotion",
    ],
    "Bitte waehlen Sie die hoechste Berufsausbildung."
  ),
});

export type Step8Data = z.infer<typeof step8Schema>;

// =============================================
// Step 9: Masernschutz
// =============================================
export const step9Schema = z.object({
  bornAfter1971: z.boolean(),
  masernschutzProvided: z.boolean(),
});

export type Step9Data = z.infer<typeof step9Schema>;

// =============================================
// Step 10: Zusammenfassung + DSGVO (kein eigenes Schema, nur Bestaetigung)
// =============================================
export const step10Schema = z.object({
  dsgvoAccepted: z.literal(true, {
    errorMap: () => ({
      message:
        "Sie müssen der Datenschutzerklärung zustimmen, um den Fragebogen abzuschicken.",
    }),
  }),
});

export type Step10Data = z.infer<typeof step10Schema>;

// =============================================
// Dynamische Schema-Factories (FieldConfig-aware)
// Verwenden FieldConfigHelper um Pflichtfelder dynamisch zu steuern
// =============================================

export function createStep1Schema(fc: FieldConfigHelper) {
  return z.object({
    // Radiogruppe (siehe step1-personal.tsx): ohne angehakte Option kommt hier
    // null an. Ohne pflichtEnum stuende im Formular die englische
    // Zod-Standardmeldung statt des deutschen Satzes.
    salutation: pflichtEnum(["Herr", "Frau"], "Bitte waehlen Sie eine Anrede."),
    title: z.string(),
    firstName: z.string().min(1, "Vorname ist erforderlich.").max(100),
    lastName: z.string().min(1, "Nachname ist erforderlich.").max(100),
    birthName: z.string(),
    birthDate: z.string().min(1, "Geburtsdatum ist erforderlich."),
    birthPlace: reqStr(fc, "birthPlace", "Geburtsort ist erforderlich."),
    birthCountry: z.string(),
    nationality: z.string(),
    maritalStatus: reqEnum(
      fc, "maritalStatus",
      ["ledig", "verheiratet", "geschieden", "verwitwet", "getrennt_lebend", "eingetragene_partnerschaft"],
      "Bitte waehlen Sie den Familienstand."
    ),
    severelyDisabled: z.boolean(),
    disabilityDegree: z.number({ invalid_type_error: "Bitte eine Zahl eingeben." })
      .int("Bitte einen vollen Grad angeben.")
      .min(0, "Der Grad kann nicht negativ sein.")
      .max(100, "Der Grad betraegt hoechstens 100.")
      .nullable(),
  });
}

/**
 * Schritt 2 — Adresse und Kontakt.
 *
 * Schritt 2 war der einzige Schritt ohne Fabrik und prueft deshalb gegen das
 * feste `step2Schema`. Die Maske zeichnet ihre Sternchen aber aus `fc` —
 * beides lief auseinander, und zwar in beide Richtungen. Stellte HR die private
 * E-Mail auf Pflicht, zeigte das Formular den Stern und liess das Feld
 * trotzdem leer durch; nahm HR umgekehrt den Ort aus der Pflicht, verlangte der
 * Schritt weiter „Ort ist erforderlich." — ohne Stern, den man haette deuten
 * koennen.
 */
export function createStep2Schema(fc: FieldConfigHelper) {
  return z.object({
    street: reqStr(fc, "street", "Strasse ist erforderlich."),
    houseNumber: reqStr(fc, "houseNumber", "Hausnummer ist erforderlich.", {
      max: 20,
      msg: "Die Hausnummer darf hoechstens 20 Zeichen lang sein.",
    }),
    // Die Untergrenze ist keine Pflicht, sondern eine Formregel: Eine
    // dreistellige PLZ gibt es nicht. Wer das Feld freiwillig laesst, darf es
    // leer lassen — aber nicht halb ausfuellen.
    zipCode: fc.isRequired("zipCode")
      ? z
          .string()
          .min(4, "PLZ muss mindestens 4 Zeichen lang sein.")
          .max(10, "Die PLZ darf hoechstens 10 Zeichen lang sein.")
      : z
          .string()
          .max(10, "Die PLZ darf hoechstens 10 Zeichen lang sein.")
          .refine((wert) => wert === "" || wert.length >= 4, {
            message: "PLZ muss mindestens 4 Zeichen lang sein.",
          }),
    city: reqStr(fc, "city", "Ort ist erforderlich."),
    country: reqStr(fc, "country", "Land ist erforderlich."),
    phone: reqStr(fc, "phone", "Telefonnummer ist erforderlich.", {
      max: 50,
      msg: "Die Telefonnummer darf hoechstens 50 Zeichen lang sein.",
    }),
    mobile: reqStr(fc, "mobile", "Mobilnummer ist erforderlich.", {
      max: 50,
      msg: "Die Mobilnummer darf hoechstens 50 Zeichen lang sein.",
    }),
    // Die Adressform wird immer geprueft, die Pflicht nur auf Ansage. Beim
    // Pflichtfeld greift `min(1)` fuer das leere Feld; die Verfeinerung laesst
    // "" bewusst durch, damit nicht zwei Meldungen gleichzeitig erscheinen.
    emailPrivate: reqStr(
      fc,
      "emailPrivate",
      "Private E-Mail-Adresse ist erforderlich."
    ).refine(
      (val) => val === "" || z.string().email().safeParse(val).success,
      { message: "Bitte geben Sie eine gültige E-Mail-Adresse ein." }
    ),
  });
}

export function createStep3Schema(fc: FieldConfigHelper) {
  const ibanRequired = fc.isRequired("iban");
  return z.object({
    iban: ibanRequired
      ? z.string().min(1, "IBAN ist erforderlich.").refine(
          (val) => { if (!val) return true; return validateIBAN(val); },
          { message: "Bitte geben Sie eine gültige IBAN ein." }
        )
      : z.string().refine(
          (val) => { if (!val || val.trim() === "") return true; return validateIBAN(val); },
          { message: "Bitte geben Sie eine gültige IBAN ein." }
        ),
    bic: reqStr(fc, "bic", "BIC ist erforderlich.", {
      max: 11,
      msg: "Die BIC darf hoechstens 11 Zeichen lang sein.",
    }),
    bankName: reqStr(fc, "bankName", "Bank ist erforderlich."),
    accountHolder: reqStr(fc, "accountHolder", "Kontoinhaber ist erforderlich."),
  });
}

export function createStep4Schema(fc: FieldConfigHelper) {
  return z.object({
    socialSecurityNumber: reqStr(
      fc,
      "socialSecurityNumber",
      "Sozialversicherungsnummer ist erforderlich.",
      {
        max: 20,
        msg: "Die Sozialversicherungsnummer darf hoechstens 20 Zeichen lang sein.",
      }
    ),
    healthInsuranceName: reqStr(fc, "healthInsuranceName", "Krankenkasse ist erforderlich."),
    healthInsuranceType: reqEnum(
      fc, "healthInsuranceType",
      ["gesetzlich", "privat"],
      "Bitte waehlen Sie die Versicherungsart."
    ),
    parentStatus: z.boolean(),
    minijobRvBefreiung: z.boolean(),
  });
}

export function createStep5Schema(fc: FieldConfigHelper) {
  const taxIdRequired = fc.isRequired("taxId");
  return z.object({
    taxId: taxIdRequired
      ? z.string().min(1, "Steuer-ID ist erforderlich.").regex(/^\d{10,11}$/, "Steuer-ID muss 10 oder 11 Ziffern enthalten.")
      : z.string().refine(
          (val) => !val || val.trim() === "" || /^\d{10,11}$/.test(val),
          { message: "Steuer-ID muss 10 oder 11 Ziffern enthalten." }
        ),
    taxClass: reqEnum(
      fc, "taxClass",
      ["I", "II", "III", "IV", "V", "VI"],
      "Bitte waehlen Sie die Steuerklasse."
    ),
    taxAllowance: reqZahl(
      fc,
      "taxAllowance",
      "Bitte geben Sie den jaehrlichen Freibetrag an."
    ),
    childAllowance: reqZahl(
      fc,
      "childAllowance",
      "Bitte geben Sie den Kinderfreibetrag an."
    ),
    religion: reqEnum(
      fc, "religion",
      ["ev", "rk", "ak", "lt", "rf", "fr", "fg", "keine", "sonstige"],
      "Bitte waehlen Sie die Religionszugehörigkeit."
    ),
  });
}

/**
 * Schritt 6 — Weitere Beschaeftigungen und Status.
 *
 * Deckt Abschnitt 2 (Status, Meldung bei der Agentur fuer Arbeit) und die
 * Grundfragen zu Abschnitt 4 der Minijob-Checkliste ab. Die Tabellenzeilen
 * selbst werden getrennt geprueft — siehe validations/beschaeftigungs-angaben.ts.
 *
 * Die alten Felder `otherEmployerName`, `otherWeeklyHours` und `hasMinijob`
 * werden hier nicht mehr abgefragt: Sie gehen in der Tabelle 4a auf. In der
 * Datenbank bleiben sie, damit Altvorgaenge lesbar bleiben.
 */
export function createStep6Schema(fc: FieldConfigHelper) {
  return z
    .object({
      // Die Bloecke aus Abschnitt 4 der Minijob-Checkliste sind an die Vorlage
      // gebunden. Ohne diese Gates verlangte Schritt 6 sie von JEDEM
      // Fragebogentyp — auch von TV-L-Angestellten und Beamten, die die Fragen
      // gar nicht angezeigt bekommen und den Schritt dann nicht verlassen
      // koennen.
      // Nur die Statusfrage braucht ein Sichtbarkeits-Gate. Sie ist die
      // einzige Pflichtangabe dieses Schritts, die sich nicht von selbst
      // erfuellt: `.min(1)` scheitert am leeren Vorgabewert, und wo der Block
      // ausgeblendet ist, kann ihn niemand fuellen — Schritt 6 waere fuer
      // TV-L-, Beamten- und Erzieher-Fragebogen unpassierbar.
      //
      // Beide Zweige liefern `string`. Ein `.optional()` oder `.default()`
      // waere hier falsch: Es machte den Eingabetyp optional, und die Maske
      // arbeitet mit konkreten Werten aus `defaultValues`.
      beschaeftigungsStatus: fc.isVisible("beschaeftigungsStatus")
        ? z.string().min(1, "Bitte waehlen Sie aus, was auf Sie zutrifft.")
        : z.string(),
      beschaeftigungsStatusSonstige: z.string().max(200).optional(),

      // Die vier Ja/Nein-Fragen brauchen keines: `z.boolean()` ist mit `false`
      // erfuellt, und `defaultValues` setzt sie immer. Ausgeblendet bleiben sie
      // schlicht auf "nein" stehen.
      alsArbeitsuchendGemeldet: z.boolean(),
      agenturFuerArbeit: z.string().max(200).optional(),
      mitLeistungsbezug: z.boolean().nullable().optional(),

      hasOtherEmployment: z.boolean(),
      summeUeberGeringfuegigkeitsgrenze: z.boolean().nullable().optional(),
      vorbeschaeftigungenVorhanden: z.boolean(),
      auslandsbeschaeftigungVorhanden: z.boolean(),

      employerType: reqEnum(
        fc, "employerType",
        ["hauptarbeitgeber", "nebenarbeitgeber", "nein"],
        "Bitte waehlen Sie eine Option."
      ),
    })
    .superRefine((werte, ctx) => {
      // "Sonstige" ohne Erlaeuterung ist keine Angabe.
      if (
        werte.beschaeftigungsStatus === "SONSTIGE" &&
        !werte.beschaeftigungsStatusSonstige?.trim()
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["beschaeftigungsStatusSonstige"],
          message: "Bitte beschreiben Sie kurz, was auf Sie zutrifft.",
        });
      }

      // Wer gemeldet ist, muss sagen wo — sonst laesst sich die
      // Berufsmaessigkeit spaeter nicht pruefen.
      if (werte.alsArbeitsuchendGemeldet) {
        if (!werte.agenturFuerArbeit?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["agenturFuerArbeit"],
            message: "Bitte geben Sie an, bei welcher Agentur Sie gemeldet sind.",
          });
        }
        if (werte.mitLeistungsbezug === null || werte.mitLeistungsbezug === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["mitLeistungsbezug"],
            message: "Bitte geben Sie an, ob Sie Leistungen beziehen.",
          });
        }
      }

      // Additionsfrage — nur wenn keine Hauptbeschaeftigung vorliegt und es
      // ueberhaupt etwas zu addieren gibt. Genau so steht die Bedingung im
      // amtlichen Muster ("Wenn keine mehr als geringfuegig entlohnte
      // (Haupt-)Beschaeftigung vorliegt ...").
      //
      // Das Sichtbarkeits-Gate ist hier nicht optional: Ohne es griffe die
      // Bedingung auch dort, wo die Statusfrage ausgeblendet ist. Dann bliebe
      // beschaeftigungsStatus leer, hatHauptbeschaeftigung waere false — und
      // ein TV-L-Fragebogen verlangte eine Antwort auf eine Frage, die er
      // nicht anzeigt.
      const hatHauptbeschaeftigung =
        werte.beschaeftigungsStatus === "ARBEITNEHMER_HAUPTBESCHAEFTIGUNG";
      if (
        fc.isVisible("summeUeberGeringfuegigkeitsgrenze") &&
        werte.hasOtherEmployment &&
        !hatHauptbeschaeftigung &&
        (werte.summeUeberGeringfuegigkeitsgrenze === null ||
          werte.summeUeberGeringfuegigkeitsgrenze === undefined)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["summeUeberGeringfuegigkeitsgrenze"],
          message: "Bitte beantworten Sie diese Frage.",
        });
      }
    });
}

export function createStep8Schema(fc: FieldConfigHelper) {
  return z.object({
    highestSchoolDegree: reqEnum(
      fc, "highestSchoolDegree",
      ["ohne_schulabschluss", "hauptschulabschluss", "mittlere_reife", "abitur_fachabitur", "sonstiges"],
      "Bitte waehlen Sie den hoechsten Schulabschluss."
    ),
    highestProfessionalDegree: reqEnum(
      fc, "highestProfessionalDegree",
      ["ohne_berufsausbildung", "anerkannte_berufsausbildung", "meister_techniker_fachschule", "bachelor", "diplom_magister_master_staatsexamen", "promotion"],
      "Bitte waehlen Sie die hoechste Berufsausbildung."
    ),
  });
}

// Die Schritt-Definition (Nummer, Titel, Reihenfolge, Maske) liegt zentral in
// `@/lib/fragebogen-steps`. Das frueher hier gepflegte STEP_CONFIG war eine
// vierte, abweichende Kopie derselben Liste und ist entfallen.
