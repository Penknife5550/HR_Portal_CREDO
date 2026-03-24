/**
 * Zod-Validierungsschemas fuer den Personalfragebogen
 *
 * 10 Steps, angelehnt an Haufe HI13214732:
 * 1. Persoenliche Angaben
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

// Helper: String-Feld das nur required ist wenn FieldConfig es verlangt
function reqStr(fc: FieldConfigHelper, name: string, msg: string) {
  return fc.isRequired(name) ? z.string().min(1, msg) : z.string();
}

// Helper: Enum-Feld das nur required ist wenn FieldConfig es verlangt
// Bei optionalen Enums: leerer String "" (aus <select>) wird zu undefined konvertiert
function reqEnum<T extends [string, ...string[]]>(
  fc: FieldConfigHelper,
  name: string,
  values: T,
  msg: string
) {
  return fc.isRequired(name)
    ? z.enum(values, { required_error: msg })
    : z.preprocess(
        (val) => (val === "" ? undefined : val),
        z.enum(values).optional()
      );
}

// =============================================
// Step 1: Persoenliche Angaben
// =============================================
export const step1Schema = z.object({
  salutation: z.enum(["Herr", "Frau"], {
    required_error: "Bitte waehlen Sie eine Anrede.",
  }),
  title: z.string(),
  firstName: z.string().min(1, "Vorname ist erforderlich.").max(100),
  lastName: z.string().min(1, "Nachname ist erforderlich.").max(100),
  birthName: z.string(),
  birthDate: z.string().min(1, "Geburtsdatum ist erforderlich."),
  birthPlace: z.string().min(1, "Geburtsort ist erforderlich."),
  birthCountry: z.string(),
  nationality: z.string(),
  maritalStatus: z.enum(
    ["ledig", "verheiratet", "geschieden", "verwitwet", "getrennt_lebend", "eingetragene_partnerschaft"],
    { required_error: "Bitte waehlen Sie den Familienstand." }
  ),
  severelyDisabled: z.boolean(),
  disabilityDegree: z.number().min(0).max(100).nullable(),
});

export type Step1Data = z.infer<typeof step1Schema>;

// =============================================
// Step 2: Adresse & Kontakt
// =============================================
export const step2Schema = z.object({
  street: z.string().min(1, "Strasse ist erforderlich."),
  houseNumber: z.string().min(1, "Hausnummer ist erforderlich."),
  zipCode: z
    .string()
    .min(4, "PLZ muss mindestens 4 Zeichen lang sein.")
    .max(10),
  city: z.string().min(1, "Ort ist erforderlich."),
  country: z.string(),
  phone: z.string(),
  mobile: z.string(),
  emailPrivate: z
    .string()
    .refine(
      (val) => val === "" || z.string().email().safeParse(val).success,
      { message: "Bitte geben Sie eine gueltige E-Mail-Adresse ein." }
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
      { message: "Bitte geben Sie eine gueltige IBAN ein." }
    ),
  bic: z.string(),
  bankName: z.string(),
  accountHolder: z.string(),
});

export type Step3Data = z.infer<typeof step3Schema>;

// =============================================
// Step 4: Sozialversicherung
// =============================================
export const step4Schema = z.object({
  socialSecurityNumber: z.string(),
  healthInsuranceName: z.string().min(1, "Krankenkasse ist erforderlich."),
  healthInsuranceType: z.enum(["gesetzlich", "privat"], {
    required_error: "Bitte waehlen Sie die Versicherungsart.",
  }),
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
  taxClass: z.enum(["I", "II", "III", "IV", "V", "VI"], {
    required_error: "Bitte waehlen Sie die Steuerklasse.",
  }),
  taxAllowance: z.number().min(0).nullable(),
  childAllowance: z.number().min(0).nullable(),
  religion: z.enum(
    ["ev", "rk", "ak", "lt", "rf", "fr", "fg", "keine", "sonstige"],
    { required_error: "Bitte waehlen Sie die Religionszugehoerigkeit." }
  ),
});

export type Step5Data = z.infer<typeof step5Schema>;

// =============================================
// Step 6: Weitere Beschaeftigung
// =============================================
export const step6Schema = z.object({
  hasOtherEmployment: z.boolean(),
  otherEmployerName: z.string(),
  otherWeeklyHours: z.number().min(0).max(60).nullable(),
  employerType: z.enum(["hauptarbeitgeber", "nebenarbeitgeber", "nein"], {
    required_error: "Bitte waehlen Sie eine Option.",
  }),
  hasMinijob: z.boolean(),
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
  highestSchoolDegree: z.enum([
    "ohne_schulabschluss",
    "hauptschulabschluss",
    "mittlere_reife",
    "abitur_fachabitur",
    "sonstiges",
  ], { required_error: "Bitte waehlen Sie den hoechsten Schulabschluss." }),
  highestProfessionalDegree: z.enum([
    "ohne_berufsausbildung",
    "anerkannte_berufsausbildung",
    "meister_techniker_fachschule",
    "bachelor",
    "diplom_magister_master_staatsexamen",
    "promotion",
  ], { required_error: "Bitte waehlen Sie die hoechste Berufsausbildung." }),
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
        "Sie muessen der Datenschutzerklaerung zustimmen, um den Fragebogen abzuschicken.",
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
    salutation: z.enum(["Herr", "Frau"], {
      required_error: "Bitte waehlen Sie eine Anrede.",
    }),
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
    disabilityDegree: z.number().min(0).max(100).nullable(),
  });
}

export function createStep3Schema(fc: FieldConfigHelper) {
  const ibanRequired = fc.isRequired("iban");
  return z.object({
    iban: ibanRequired
      ? z.string().min(1, "IBAN ist erforderlich.").refine(
          (val) => { if (!val) return true; return validateIBAN(val); },
          { message: "Bitte geben Sie eine gueltige IBAN ein." }
        )
      : z.string().refine(
          (val) => { if (!val || val.trim() === "") return true; return validateIBAN(val); },
          { message: "Bitte geben Sie eine gueltige IBAN ein." }
        ),
    bic: z.string(),
    bankName: z.string(),
    accountHolder: z.string(),
  });
}

export function createStep4Schema(fc: FieldConfigHelper) {
  return z.object({
    socialSecurityNumber: z.string(),
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
    taxAllowance: z.number().min(0).nullable(),
    childAllowance: z.number().min(0).nullable(),
    religion: reqEnum(
      fc, "religion",
      ["ev", "rk", "ak", "lt", "rf", "fr", "fg", "keine", "sonstige"],
      "Bitte waehlen Sie die Religionszugehoerigkeit."
    ),
  });
}

export function createStep6Schema(fc: FieldConfigHelper) {
  return z.object({
    hasOtherEmployment: z.boolean(),
    otherEmployerName: z.string(),
    otherWeeklyHours: z.number().min(0).max(60).nullable(),
    employerType: reqEnum(
      fc, "employerType",
      ["hauptarbeitgeber", "nebenarbeitgeber", "nein"],
      "Bitte waehlen Sie eine Option."
    ),
    hasMinijob: z.boolean(),
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

// =============================================
// Step-Konfiguration
// =============================================
export const STEP_CONFIG = [
  {
    number: 1,
    title: "Persoenliche Angaben",
    description: "Name, Geburtsdatum, Familienstand",
    icon: "user",
  },
  {
    number: 2,
    title: "Adresse & Kontakt",
    description: "Wohnanschrift, Telefon, E-Mail",
    icon: "home",
  },
  {
    number: 3,
    title: "Bankverbindung",
    description: "IBAN, BIC, Kontoinhaber",
    icon: "credit-card",
  },
  {
    number: 4,
    title: "Sozialversicherung",
    description: "SV-Nummer, Krankenkasse",
    icon: "shield",
  },
  {
    number: 5,
    title: "Steuer",
    description: "Steuer-ID, Steuerklasse, Kirchensteuer",
    icon: "file-text",
  },
  {
    number: 6,
    title: "Weitere Beschaeftigung",
    description: "Angaben zu weiteren Arbeitgebern",
    icon: "briefcase",
  },
  {
    number: 7,
    title: "Kinder",
    description: "Angaben zu Kindern (optional)",
    icon: "users",
  },
  {
    number: 8,
    title: "Bildung & Beruf",
    description: "Schulabschluss, Berufsausbildung",
    icon: "graduation-cap",
  },
  {
    number: 9,
    title: "Masernschutz",
    description: "Impfnachweis fuer Gemeinschaftseinrichtungen",
    icon: "heart",
  },
  {
    number: 10,
    title: "Zusammenfassung",
    description: "Pruefen und Absenden",
    icon: "check-circle",
  },
] as const;
