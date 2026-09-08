/**
 * Leere Auswahlfelder im Personalfragebogen.
 *
 * Anlass (aus dem Betrieb gemeldet): Beschaeftigte kamen in den Formularen
 * nicht weiter. Eine Radiogruppe, in der keine Option angehakt ist, liefert in
 * react-hook-form `null` — nicht `undefined` und nicht `""`. Zod kennt fuer
 * „nicht gesetzt" aber nur `undefined`. Daraus folgten zwei Blockaden:
 *
 * - PFLICHT-Enum: `required_error` greift bei `null` nicht. Statt „Bitte
 *   waehlen Sie eine Option." las die Person die englische Standardmeldung
 *   („Expected 'hauptarbeitgeber' | ... received null").
 * - FREIWILLIGES Enum: `null` scheiterte an `z.enum().optional()`. Der Schritt
 *   blockierte an einem Feld, das gar nicht ausgefuellt werden muss — und eine
 *   einmal angehakte Radiogruppe liess sich nie wieder leeren.
 *
 * Beide Zweige laufen jetzt durch dieselbe Umschreibung (`leerZuUndefined` in
 * validations/personal-data.ts). Dieser Test haelt das fest.
 */

import {
  createStep1Schema,
  createStep6Schema,
} from "@/lib/validations/personal-data";
import { FieldConfigHelper, type FieldConfig } from "@/lib/field-definitions";

/** Schritt 6 mit den Registry-Vorgaben — dort ist employerType Pflicht. */
const schritt6 = createStep6Schema(new FieldConfigHelper(6));

const SCHRITT6_BASIS = {
  beschaeftigungsStatus: "SCHUELER",
  beschaeftigungsStatusSonstige: "",
  alsArbeitsuchendGemeldet: false,
  agenturFuerArbeit: "",
  mitLeistungsbezug: null,
  hasOtherEmployment: false,
  summeUeberGeringfuegigkeitsgrenze: null,
  vorbeschaeftigungenVorhanden: false,
  auslandsbeschaeftigungVorhanden: false,
  employerType: "hauptarbeitgeber",
};

/** Schritt 1 mit freiwilligem Familienstand. */
const felderSchritt1: FieldConfig[] = [
  {
    name: "maritalStatus",
    visible: true,
    required: false,
    label: "Familienstand",
  },
];
const schritt1Freiwillig = createStep1Schema(
  new FieldConfigHelper(1, felderSchritt1)
);

const SCHRITT1_BASIS = {
  salutation: "Herr",
  title: "",
  firstName: "Max",
  lastName: "Mustermann",
  birthName: "",
  birthDate: "1990-01-01",
  birthPlace: "Minden",
  birthCountry: "Deutschland",
  nationality: "deutsch",
  maritalStatus: "ledig",
  severelyDisabled: false,
  aufenthaltstitelErforderlich: false,
  disabilityDegree: null,
};

/** Die Meldungen zu einem Feld — leer, wenn das Feld nicht beanstandet wurde. */
function meldungenZu(
  ergebnis: { success: boolean; error?: { issues: { path: (string | number)[]; message: string }[] } },
  feld: string
): string[] {
  if (ergebnis.success || !ergebnis.error) return [];
  return ergebnis.error.issues
    .filter((i) => i.path.join(".") === feld)
    .map((i) => i.message);
}

describe("Pflicht-Auswahlfeld ohne angehakte Option", () => {
  it("meldet auf Deutsch statt mit der englischen Zod-Vorgabe (null)", () => {
    const ergebnis = schritt6.safeParse({
      ...SCHRITT6_BASIS,
      employerType: null,
    });

    expect(ergebnis.success).toBe(false);
    expect(meldungenZu(ergebnis, "employerType")).toEqual([
      "Bitte waehlen Sie eine Option.",
    ]);
  });

  it("meldet auch bei leerer Auswahl aus einem <select> auf Deutsch", () => {
    const ergebnis = schritt6.safeParse({
      ...SCHRITT6_BASIS,
      employerType: "",
    });

    expect(ergebnis.success).toBe(false);
    expect(meldungenZu(ergebnis, "employerType")).toEqual([
      "Bitte waehlen Sie eine Option.",
    ]);
  });

  it("nennt auch bei der Anrede den deutschen Satz", () => {
    // Die Anrede ist im Formular eine Radiogruppe und im Schema fest
    // verdrahtet — sie lief bisher an reqEnum vorbei.
    const ergebnis = schritt1Freiwillig.safeParse({
      ...SCHRITT1_BASIS,
      salutation: null,
    });

    expect(ergebnis.success).toBe(false);
    expect(meldungenZu(ergebnis, "salutation")).toEqual([
      "Bitte waehlen Sie eine Anrede.",
    ]);
  });

  it("laesst eine gueltige Auswahl unveraendert durch", () => {
    const ergebnis = schritt6.safeParse({
      ...SCHRITT6_BASIS,
      employerType: "nebenarbeitgeber",
    });

    expect(ergebnis.success).toBe(true);
    if (ergebnis.success) {
      expect(ergebnis.data.employerType).toBe("nebenarbeitgeber");
    }
  });
});

describe("Freiwilliges Auswahlfeld ohne angehakte Option", () => {
  it("blockiert den Schritt nicht (null)", () => {
    const ergebnis = schritt1Freiwillig.safeParse({
      ...SCHRITT1_BASIS,
      maritalStatus: null,
    });

    expect(ergebnis.success).toBe(true);
    if (ergebnis.success) {
      expect(ergebnis.data.maritalStatus).toBeUndefined();
    }
  });

  it("blockiert den Schritt auch bei leerer Auswahl nicht (\"\")", () => {
    const ergebnis = schritt1Freiwillig.safeParse({
      ...SCHRITT1_BASIS,
      maritalStatus: "",
    });

    expect(ergebnis.success).toBe(true);
    if (ergebnis.success) {
      expect(ergebnis.data.maritalStatus).toBeUndefined();
    }
  });

  it("weist einen erfundenen Wert weiterhin ab", () => {
    // Die Umschreibung darf nur „leer" bedeuten, nicht „alles erlaubt".
    const ergebnis = schritt1Freiwillig.safeParse({
      ...SCHRITT1_BASIS,
      maritalStatus: "verpartnert",
    });

    expect(ergebnis.success).toBe(false);
    expect(meldungenZu(ergebnis, "maritalStatus").length).toBeGreaterThan(0);
  });
});
