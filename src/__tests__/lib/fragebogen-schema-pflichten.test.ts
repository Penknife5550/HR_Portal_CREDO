/**
 * Pflichten, Laengengrenzen und deutsche Meldungen der Fragebogen-Schemata.
 *
 * Drei Befunde aus der Durchsicht der Formulare, alle drei ohne Absturz und
 * deshalb lange unbemerkt:
 *
 * 1. **Englische Meldung bei leerer Auswahl.** `required_error` greift nur bei
 *    `undefined`. Ein `<select>` mit leerer Vorauswahl sendet aber `""` — und
 *    darauf antwortete Zod mit „Invalid enum value. Expected ..., received ''".
 *    Das stand woertlich unter dem Pflichtfeld in „Bildung & Beruf".
 * 2. **Pflichtkennzeichen ohne Wirkung.** Die Masken zeichnen ihre Sternchen
 *    aus der Vorlagen-Konfiguration, mehrere Schemata prueften aber fest
 *    verdrahtet. Ein auf Pflicht gestelltes Feld lief leer durch; ein aus der
 *    Pflicht genommenes blockierte weiter — ohne Stern, den man haette deuten
 *    koennen.
 * 3. **Laengengrenzen nur auf dem Server.** Eine zu lange Eingabe kam durch den
 *    Schritt, der Auto-Save antwortete mit 400, und ueber dem Formular stand
 *    „Validierungsfehler", ohne dass ein Feld rot wurde.
 */

import {
  createStep2Schema,
  createStep3Schema,
  createStep4Schema,
  createStep5Schema,
  createStep8Schema,
  step2Schema,
} from "@/lib/validations/personal-data";
import { FieldConfigHelper, type FieldConfig } from "@/lib/field-definitions";

/**
 * Eine Vorlagen-Konfiguration, die NUR die genannten Felder abweichend setzt.
 *
 * Alles Uebrige faellt im FieldConfigHelper auf die Registry-Vorgaben zurueck —
 * genau wie bei einer Vorlage, die dieses Feld zuletzt nicht kannte.
 */
function konfig(
  schritt: number,
  abweichungen: Record<string, boolean>
): FieldConfigHelper {
  const felder: FieldConfig[] = Object.entries(abweichungen).map(
    ([name, required]) => ({ name, visible: true, required, label: name })
  );
  return new FieldConfigHelper(schritt, felder);
}

/** Die Meldungen zu einem Feld — leer, wenn das Feld nicht beanstandet wurde. */
function meldungenZu(
  ergebnis: {
    success: boolean;
    error?: { issues: { path: (string | number)[]; message: string }[] };
  },
  feld: string
): string[] {
  if (ergebnis.success || !ergebnis.error) return [];
  return ergebnis.error.issues
    .filter((i) => i.path.join(".") === feld)
    .map((i) => i.message);
}

const SCHRITT2_BASIS = {
  street: "Musterstrasse",
  houseNumber: "12a",
  zipCode: "32423",
  city: "Minden",
  country: "Deutschland",
  phone: "",
  mobile: "",
  emailPrivate: "",
};

const SCHRITT3_BASIS = {
  iban: "DE89 3704 0044 0532 0130 00",
  bic: "",
  bankName: "",
  accountHolder: "",
};

const SCHRITT4_BASIS = {
  socialSecurityNumber: "",
  healthInsuranceName: "AOK",
  healthInsuranceType: "gesetzlich",
  parentStatus: false,
  minijobRvBefreiung: false,
};

const SCHRITT5_BASIS = {
  taxId: "12345678901",
  taxClass: "I",
  taxAllowance: null,
  childAllowance: null,
  religion: "keine",
};

const SCHRITT8_BASIS = {
  highestSchoolDegree: "abitur_fachabitur",
  highestProfessionalDegree: "bachelor",
};

// =============================================
// Befund 1: deutsche Meldung bei jedem Fehlercode
// =============================================
describe("Auswahlfelder melden auf Deutsch", () => {
  const schritt8 = createStep8Schema(new FieldConfigHelper(8));

  it.each([
    ["leere Auswahl aus dem <select>", ""],
    ["nicht angehakte Radiogruppe", null],
    ["gar kein Wert", undefined],
  ])("nennt bei %s den deutschen Satz", (_fall, wert) => {
    const ergebnis = schritt8.safeParse({
      ...SCHRITT8_BASIS,
      highestSchoolDegree: wert,
    });

    expect(ergebnis.success).toBe(false);
    expect(meldungenZu(ergebnis, "highestSchoolDegree")).toEqual([
      "Bitte waehlen Sie den hoechsten Schulabschluss.",
    ]);
  });

  it("nennt auch bei einem Wert ausserhalb der Liste den deutschen Satz", () => {
    // Frueher: "Invalid enum value. Expected 'ohne_schulabschluss' | ...".
    const ergebnis = schritt8.safeParse({
      ...SCHRITT8_BASIS,
      highestProfessionalDegree: "habilitation",
    });

    expect(ergebnis.success).toBe(false);
    expect(meldungenZu(ergebnis, "highestProfessionalDegree")).toEqual([
      "Bitte waehlen Sie die hoechste Berufsausbildung.",
    ]);
  });

  it("meldet auch im freiwilligen Feld deutsch, laesst es aber leer durch", () => {
    const freiwillig = createStep8Schema(
      konfig(8, { highestSchoolDegree: false })
    );

    expect(
      freiwillig.safeParse({ ...SCHRITT8_BASIS, highestSchoolDegree: "" })
        .success
    ).toBe(true);

    const ergebnis = freiwillig.safeParse({
      ...SCHRITT8_BASIS,
      highestSchoolDegree: "grundschule",
    });
    expect(ergebnis.success).toBe(false);
    expect(meldungenZu(ergebnis, "highestSchoolDegree")).toEqual([
      "Bitte waehlen Sie den hoechsten Schulabschluss.",
    ]);
  });

  it("bleibt frei von englischen Zod-Vorgabetexten", () => {
    const ergebnis = createStep8Schema(new FieldConfigHelper(8)).safeParse({
      highestSchoolDegree: "",
      highestProfessionalDegree: null,
    });

    expect(ergebnis.success).toBe(false);
    for (const issue of ergebnis.error!.issues) {
      expect(issue.message).not.toMatch(/Invalid|Expected|Required/);
    }
  });
});

// =============================================
// Befund 2: Pflichtkennzeichen der Vorlage wirkt
// =============================================
describe("Schritt 2 folgt der Vorlagen-Konfiguration", () => {
  it("verlangt die private E-Mail, sobald die Vorlage sie fordert", () => {
    const pflicht = createStep2Schema(konfig(2, { emailPrivate: true }));

    const ergebnis = pflicht.safeParse(SCHRITT2_BASIS);
    expect(ergebnis.success).toBe(false);
    expect(meldungenZu(ergebnis, "emailPrivate")).toEqual([
      "Private E-Mail-Adresse ist erforderlich.",
    ]);

    expect(
      pflicht.safeParse({ ...SCHRITT2_BASIS, emailPrivate: "max@example.org" })
        .success
    ).toBe(true);
  });

  it("prueft die Adressform auch dann, wenn die E-Mail freiwillig ist", () => {
    const schritt2 = createStep2Schema(new FieldConfigHelper(2));

    expect(schritt2.safeParse(SCHRITT2_BASIS).success).toBe(true);

    const ergebnis = schritt2.safeParse({
      ...SCHRITT2_BASIS,
      emailPrivate: "max(at)example.org",
    });
    expect(ergebnis.success).toBe(false);
    expect(meldungenZu(ergebnis, "emailPrivate")).toEqual([
      "Bitte geben Sie eine gültige E-Mail-Adresse ein.",
    ]);
  });

  it("laesst den Ort leer, wenn die Vorlage ihn freistellt", () => {
    // Vorher verlangte der Schritt "Ort ist erforderlich." — an einem Feld ohne
    // Stern.
    const ohnePflicht = createStep2Schema(konfig(2, { city: false }));

    expect(ohnePflicht.safeParse({ ...SCHRITT2_BASIS, city: "" }).success).toBe(
      true
    );
  });

  it("verlangt Telefon und Mobilnummer nur auf Ansage", () => {
    expect(
      createStep2Schema(new FieldConfigHelper(2)).safeParse(SCHRITT2_BASIS)
        .success
    ).toBe(true);

    const pflicht = createStep2Schema(konfig(2, { phone: true, mobile: true }));
    const ergebnis = pflicht.safeParse(SCHRITT2_BASIS);
    expect(ergebnis.success).toBe(false);
    expect(meldungenZu(ergebnis, "phone")).toEqual([
      "Telefonnummer ist erforderlich.",
    ]);
    expect(meldungenZu(ergebnis, "mobile")).toEqual([
      "Mobilnummer ist erforderlich.",
    ]);
  });

  it("laesst eine freigestellte PLZ leer, aber nicht halb ausgefuellt", () => {
    const ohnePflicht = createStep2Schema(konfig(2, { zipCode: false }));

    expect(
      ohnePflicht.safeParse({ ...SCHRITT2_BASIS, zipCode: "" }).success
    ).toBe(true);

    const ergebnis = ohnePflicht.safeParse({
      ...SCHRITT2_BASIS,
      zipCode: "324",
    });
    expect(ergebnis.success).toBe(false);
    expect(meldungenZu(ergebnis, "zipCode")).toEqual([
      "PLZ muss mindestens 4 Zeichen lang sein.",
    ]);
  });

  it("beschreibt dieselben Felder wie das statische Schema", () => {
    // Die Masken tippen ihr Formular weiterhin an `Step2Data` aus dem
    // statischen Schema. Laufen die beiden Feldlisten auseinander, faellt das
    // erst beim Uebersetzen der Maske auf.
    expect(
      Object.keys(createStep2Schema(new FieldConfigHelper(2)).shape).sort()
    ).toEqual(Object.keys(step2Schema.shape).sort());
  });
});

describe("Schritt 3, 4 und 5 folgen der Vorlagen-Konfiguration", () => {
  it("verlangt BIC, Bank und Kontoinhaber, sobald die Vorlage sie fordert", () => {
    const pflicht = createStep3Schema(
      konfig(3, { bic: true, bankName: true, accountHolder: true })
    );

    const ergebnis = pflicht.safeParse(SCHRITT3_BASIS);
    expect(ergebnis.success).toBe(false);
    expect(meldungenZu(ergebnis, "bic")).toEqual(["BIC ist erforderlich."]);
    expect(meldungenZu(ergebnis, "bankName")).toEqual([
      "Bank ist erforderlich.",
    ]);
    expect(meldungenZu(ergebnis, "accountHolder")).toEqual([
      "Kontoinhaber ist erforderlich.",
    ]);

    // Gegenprobe: Ohne Pflicht bleiben dieselben Felder leer erlaubt.
    expect(
      createStep3Schema(new FieldConfigHelper(3)).safeParse(SCHRITT3_BASIS)
        .success
    ).toBe(true);
  });

  it("verlangt die SV-Nummer, sobald die Vorlage sie fordert", () => {
    const pflicht = createStep4Schema(konfig(4, { socialSecurityNumber: true }));

    const ergebnis = pflicht.safeParse(SCHRITT4_BASIS);
    expect(ergebnis.success).toBe(false);
    expect(meldungenZu(ergebnis, "socialSecurityNumber")).toEqual([
      "Sozialversicherungsnummer ist erforderlich.",
    ]);

    expect(
      createStep4Schema(new FieldConfigHelper(4)).safeParse(SCHRITT4_BASIS)
        .success
    ).toBe(true);
  });

  it("verlangt die Freibetraege, sobald die Vorlage sie fordert", () => {
    const pflicht = createStep5Schema(
      konfig(5, { taxAllowance: true, childAllowance: true })
    );

    // Ein geleertes Zahlenfeld sendet null (siehe formular-zahlen.ts) — genau
    // dafuer stand hier frueher "Expected number, received null".
    const ergebnis = pflicht.safeParse(SCHRITT5_BASIS);
    expect(ergebnis.success).toBe(false);
    expect(meldungenZu(ergebnis, "taxAllowance")).toEqual([
      "Bitte geben Sie den jaehrlichen Freibetrag an.",
    ]);
    expect(meldungenZu(ergebnis, "childAllowance")).toEqual([
      "Bitte geben Sie den Kinderfreibetrag an.",
    ]);

    expect(
      pflicht.safeParse({
        ...SCHRITT5_BASIS,
        taxAllowance: 0,
        childAllowance: 1.5,
      }).success
    ).toBe(true);
  });

  it("laesst die Freibetraege ohne Pflicht leer und behaelt den Typ", () => {
    const ergebnis = createStep5Schema(new FieldConfigHelper(5)).safeParse(
      SCHRITT5_BASIS
    );

    expect(ergebnis.success).toBe(true);
    if (ergebnis.success) {
      // null muss null bleiben: Der Auto-Save leert das Feld nur, wenn er
      // wirklich null bekommt.
      expect(ergebnis.data.taxAllowance).toBeNull();
      expect(ergebnis.data.childAllowance).toBeNull();
    }
  });
});

// =============================================
// Befund 3: Laengengrenzen des Servers spiegeln
// =============================================
describe("Laengengrenzen greifen schon im Formular", () => {
  it("begrenzt die Hausnummer auf 20 Zeichen", () => {
    const ergebnis = createStep2Schema(new FieldConfigHelper(2)).safeParse({
      ...SCHRITT2_BASIS,
      houseNumber: "1".repeat(21),
    });

    expect(ergebnis.success).toBe(false);
    expect(meldungenZu(ergebnis, "houseNumber")).toEqual([
      "Die Hausnummer darf hoechstens 20 Zeichen lang sein.",
    ]);
  });

  it("begrenzt Telefon und Mobilnummer auf 50 Zeichen", () => {
    const ergebnis = createStep2Schema(new FieldConfigHelper(2)).safeParse({
      ...SCHRITT2_BASIS,
      phone: "0".repeat(51),
      mobile: "0".repeat(51),
    });

    expect(ergebnis.success).toBe(false);
    expect(meldungenZu(ergebnis, "phone")).toEqual([
      "Die Telefonnummer darf hoechstens 50 Zeichen lang sein.",
    ]);
    expect(meldungenZu(ergebnis, "mobile")).toEqual([
      "Die Mobilnummer darf hoechstens 50 Zeichen lang sein.",
    ]);
  });

  it("begrenzt die BIC auf 11 Zeichen", () => {
    const ergebnis = createStep3Schema(new FieldConfigHelper(3)).safeParse({
      ...SCHRITT3_BASIS,
      bic: "WELADED1MIN0",
    });

    expect(ergebnis.success).toBe(false);
    expect(meldungenZu(ergebnis, "bic")).toEqual([
      "Die BIC darf hoechstens 11 Zeichen lang sein.",
    ]);
  });

  it("begrenzt die SV-Nummer auf 20 Zeichen", () => {
    const ergebnis = createStep4Schema(new FieldConfigHelper(4)).safeParse({
      ...SCHRITT4_BASIS,
      socialSecurityNumber: "6".repeat(21),
    });

    expect(ergebnis.success).toBe(false);
    expect(meldungenZu(ergebnis, "socialSecurityNumber")).toEqual([
      "Die Sozialversicherungsnummer darf hoechstens 20 Zeichen lang sein.",
    ]);
  });

  it("greift auch dort, wo das Feld zugleich Pflicht ist", () => {
    // Die Grenze haengt nicht an der Pflicht — sonst waere sie fuer jede
    // Vorlage, die das Feld freistellt, wirkungslos.
    const pflicht = createStep4Schema(konfig(4, { socialSecurityNumber: true }));
    const ergebnis = pflicht.safeParse({
      ...SCHRITT4_BASIS,
      socialSecurityNumber: "6".repeat(21),
    });

    expect(ergebnis.success).toBe(false);
    expect(meldungenZu(ergebnis, "socialSecurityNumber")).toEqual([
      "Die Sozialversicherungsnummer darf hoechstens 20 Zeichen lang sein.",
    ]);
  });
});
