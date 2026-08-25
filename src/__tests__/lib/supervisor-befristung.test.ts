/**
 * Tests fuer die Befristungs-Logik in Schritt 1 der Einstellungsmodalitaeten
 * (src/lib/validations/supervisor-data.ts).
 */

import { supStep1Schema } from "@/lib/validations/supervisor-data";
import { getBefristungSachgrundLabel, getBefristungsartLabel } from "@/lib/constants";

const BASIS = {
  betriebsstaette: "Kingsleyallee 6",
  stellenbeschreibung: "Sozialpaedagogische Familienhilfe",
  vertragsbeginn: "2026-09-01",
  befristet: false,
  befristungsart: "" as "" | "KALENDER" | "ZWECK",
  vertragsende: "",
  befristungZweck: "",
  vertragsendeVoraussichtlich: "",
  befristungSachgrund: "",
};

function fehlerPfade(input: Record<string, unknown>): string[] {
  const result = supStep1Schema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.path.join("."));
}

describe("supStep1Schema – Befristung", () => {
  it("akzeptiert einen unbefristeten Vertrag ohne Enddatum", () => {
    expect(fehlerPfade(BASIS)).toEqual([]);
  });

  it("verlangt die Art der Befristung, sobald befristet angehakt ist", () => {
    expect(fehlerPfade({ ...BASIS, befristet: true })).toEqual(["befristungsart"]);
  });

  it("verlangt bei kalendermaessiger Befristung ein Vertragsende", () => {
    expect(fehlerPfade({ ...BASIS, befristet: true, befristungsart: "KALENDER" })).toEqual([
      "vertragsende",
    ]);
  });

  it("akzeptiert eine kalendermaessige Befristung mit Enddatum", () => {
    expect(
      fehlerPfade({
        ...BASIS,
        befristet: true,
        befristungsart: "KALENDER",
        vertragsende: "2027-08-31",
      })
    ).toEqual([]);
  });

  it("akzeptiert eine Zweckbefristung OHNE Enddatum, wenn der Zweck beschrieben ist", () => {
    expect(
      fehlerPfade({
        ...BASIS,
        befristet: true,
        befristungsart: "ZWECK",
        befristungZweck: "Ende der Kostenzusage des Jugendamtes",
        befristungSachgrund: "projektbezogen",
      })
    ).toEqual([]);
  });

  it("verlangt bei Zweckbefristung eine Beschreibung statt eines Datums", () => {
    expect(
      fehlerPfade({ ...BASIS, befristet: true, befristungsart: "ZWECK", befristungZweck: "  " })
    ).toEqual(["befristungZweck"]);
  });

  it("prueft Pflichtfelder der Stelle unabhaengig von der Befristung", () => {
    expect(fehlerPfade({ ...BASIS, betriebsstaette: "", vertragsbeginn: "" })).toEqual([
      "betriebsstaette",
      "vertragsbeginn",
    ]);
  });
});

describe("Befristungs-Labels", () => {
  it("uebersetzt Art und Sachgrund fuer Portal, PDF und Vorlagen", () => {
    expect(getBefristungsartLabel("ZWECK")).toBe("Zweckbefristung (Ende bei Zweckerreichung)");
    expect(getBefristungsartLabel(null)).toBeNull();
    expect(getBefristungSachgrundLabel("projektbezogen")).toBe("Projektbezogen");
    expect(getBefristungSachgrundLabel("")).toBe("Ohne Sachgrund");
    expect(getBefristungSachgrundLabel("unbekannt")).toBe("unbekannt");
  });
});
