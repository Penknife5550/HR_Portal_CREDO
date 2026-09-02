/**
 * Tests: Regeln fuer erzeugte Dokumente (src/lib/erzeugte-dokumente.ts)
 *
 * Bewusst ohne Server-Bezug — die Datei darf keinen Prisma-Import haben, damit
 * die Client-Komponente im Dokumente-Hub sie einbinden kann.
 */

import {
  AUFBEWAHRUNG_MONATE,
  UNTERSTUETZTE_MODULE,
  istModulUnterstuetzt,
  aufbewahrungsGrenze,
} from "@/lib/erzeugte-dokumente";

describe("Unterstuetzte Module", () => {
  it("umfasst Onboarding und Vertragsverlaengerung", () => {
    expect(istModulUnterstuetzt("ONBOARDING")).toBe(true);
    expect(istModulUnterstuetzt("VERTRAGSVERLAENGERUNG")).toBe(true);
  });

  it("schliesst BEM aus (versiegelte Akte)", () => {
    expect(istModulUnterstuetzt("BEM")).toBe(false);
    expect(UNTERSTUETZTE_MODULE).not.toContain("BEM");
  });

  it("unterstuetzt die Module mit Vorgangs-Aufloesung", () => {
    // Ein Modul gehoert hierher, sobald VORGANG_MANDANT in
    // erzeugte-dokumente-vorgang.ts den Mandanten seines Vorgangs aufloesen
    // kann — sonst laesst sich die Berechtigung nicht pruefen.
    for (const modul of ["ONBOARDING", "VERTRAGSVERLAENGERUNG", "OFFBOARDING", "VERBEAMTUNG"]) {
      expect({ modul, unterstuetzt: istModulUnterstuetzt(modul) }).toEqual({
        modul,
        unterstuetzt: true,
      });
    }
  });

  it("schliesst Module ohne Vorgangs-Aufloesung weiterhin aus", () => {
    for (const modul of ["ALLGEMEIN", "MUTTERSCHUTZ", "ELTERNZEIT"]) {
      expect({ modul, unterstuetzt: istModulUnterstuetzt(modul) }).toEqual({
        modul,
        unterstuetzt: false,
      });
    }
  });

  it("ist gross-/kleinschreibungsempfindlich (die Aufrufer normalisieren)", () => {
    expect(istModulUnterstuetzt("onboarding")).toBe(false);
  });
});

describe("Aufbewahrungsgrenze", () => {
  it("liegt zwoelf Monate zurueck", () => {
    expect(AUFBEWAHRUNG_MONATE).toBe(12);
    const grenze = aufbewahrungsGrenze(new Date("2026-07-23T10:00:00.000Z"));
    expect(grenze.toISOString().slice(0, 10)).toBe("2025-07-23");
  });

  it("rechnet kalendarisch, nicht in 365 Tagen", () => {
    // 2024 ist ein Schaltjahr — eine Tagesrechnung laege hier daneben.
    const grenze = aufbewahrungsGrenze(new Date("2025-03-01T12:00:00.000Z"));
    expect(grenze.toISOString().slice(0, 10)).toBe("2024-03-01");
  });

  it("veraendert das uebergebene Datum nicht", () => {
    const jetzt = new Date("2026-07-23T10:00:00.000Z");
    aufbewahrungsGrenze(jetzt);
    expect(jetzt.toISOString()).toBe("2026-07-23T10:00:00.000Z");
  });

  it("ein heute erzeugtes Dokument liegt nicht vor der Grenze", () => {
    const jetzt = new Date("2026-07-23T10:00:00.000Z");
    expect(jetzt.getTime()).toBeGreaterThan(aufbewahrungsGrenze(jetzt).getTime());
  });

  it("ein 13 Monate altes Dokument liegt vor der Grenze", () => {
    const jetzt = new Date("2026-07-23T10:00:00.000Z");
    const alt = new Date("2025-06-23T10:00:00.000Z");
    expect(alt.getTime()).toBeLessThan(aufbewahrungsGrenze(jetzt).getTime());
  });
});
