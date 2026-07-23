/**
 * Tests: Filterlogik der Vorlagenliste (src/lib/brief-vorlagen-filter.ts)
 *
 * Deckt die vier Auswahlarten des Geltungs-Filters, die UND-Verknuepfung mit dem
 * Modul-Filter und die Randfaelle ab (unbekannte Mandanten-ID, leere Liste).
 */

import {
  filterVorlagen,
  istFilterAktiv,
  GELTUNG_ALLE,
  GELTUNG_GLOBAL,
  GELTUNG_MANDANT,
  MODUL_ALLE,
  type FilterbareVorlage,
} from "@/lib/brief-vorlagen-filter";

const GYM = "org-gym";
const KITA = "org-kita";

const vorlagen: (FilterbareVorlage & { name: string })[] = [
  { name: "Befragung Vorstrafen", modul: "ONBOARDING", organizationId: null },
  { name: "Aufforderung FZ", modul: "ONBOARDING", organizationId: null },
  { name: "Antrag FZ KiTa", modul: "ONBOARDING", organizationId: KITA },
  { name: "Arbeitsvertrag Erzieher", modul: "ONBOARDING", organizationId: KITA },
  { name: "Aufforderung FZ Lehrer", modul: "ONBOARDING", organizationId: GYM },
  { name: "AV Nachtrag", modul: "VERTRAGSVERLAENGERUNG", organizationId: GYM },
  { name: "Datenschutz", modul: "BEM", organizationId: null },
];

const namen = (liste: { name: string }[]) => liste.map((v) => v.name);

describe("istFilterAktiv", () => {
  it("ist ohne Auswahl inaktiv", () => {
    expect(istFilterAktiv({ modul: MODUL_ALLE, geltung: GELTUNG_ALLE })).toBe(false);
  });

  it("ist aktiv, sobald das Modul gesetzt ist", () => {
    expect(istFilterAktiv({ modul: "ONBOARDING", geltung: GELTUNG_ALLE })).toBe(true);
  });

  it("ist aktiv, sobald die Geltung gesetzt ist", () => {
    expect(istFilterAktiv({ modul: MODUL_ALLE, geltung: GELTUNG_GLOBAL })).toBe(true);
    expect(istFilterAktiv({ modul: MODUL_ALLE, geltung: KITA })).toBe(true);
  });
});

describe("filterVorlagen — Modul", () => {
  it("liefert ohne Filter alles in unveraenderter Reihenfolge", () => {
    const res = filterVorlagen(vorlagen, { modul: MODUL_ALLE, geltung: GELTUNG_ALLE });
    expect(namen(res)).toEqual(namen(vorlagen));
  });

  it("grenzt auf ein Modul ein", () => {
    const res = filterVorlagen(vorlagen, { modul: "BEM", geltung: GELTUNG_ALLE });
    expect(namen(res)).toEqual(["Datenschutz"]);
  });

  it("liefert leer, wenn kein Eintrag zum Modul passt", () => {
    const res = filterVorlagen(vorlagen, { modul: "ELTERNZEIT", geltung: GELTUNG_ALLE });
    expect(res).toEqual([]);
  });
});

describe("filterVorlagen — Geltung", () => {
  it("Nur globale liefert ausschliesslich Vorlagen ohne Mandant", () => {
    const res = filterVorlagen(vorlagen, { modul: MODUL_ALLE, geltung: GELTUNG_GLOBAL });
    expect(namen(res)).toEqual(["Befragung Vorstrafen", "Aufforderung FZ", "Datenschutz"]);
    expect(res.every((v) => v.organizationId === null)).toBe(true);
  });

  it("Nur mandantenspezifische liefert ausschliesslich Vorlagen MIT Mandant", () => {
    const res = filterVorlagen(vorlagen, { modul: MODUL_ALLE, geltung: GELTUNG_MANDANT });
    expect(res.every((v) => v.organizationId !== null)).toBe(true);
    expect(res).toHaveLength(4);
  });

  it("global und mandantenspezifisch sind zusammen die Gesamtmenge", () => {
    const global = filterVorlagen(vorlagen, { modul: MODUL_ALLE, geltung: GELTUNG_GLOBAL });
    const mandant = filterVorlagen(vorlagen, { modul: MODUL_ALLE, geltung: GELTUNG_MANDANT });
    expect(global.length + mandant.length).toBe(vorlagen.length);
  });

  it("eine konkrete Mandanten-ID liefert nur dessen Vorlagen", () => {
    const res = filterVorlagen(vorlagen, { modul: MODUL_ALLE, geltung: KITA });
    expect(namen(res)).toEqual(["Antrag FZ KiTa", "Arbeitsvertrag Erzieher"]);
  });

  it("eine unbekannte Mandanten-ID liefert leer statt alles", () => {
    const res = filterVorlagen(vorlagen, { modul: MODUL_ALLE, geltung: "org-geloescht" });
    expect(res).toEqual([]);
  });
});

describe("filterVorlagen — Kombination", () => {
  it("verknuepft Modul und Geltung mit UND, nicht mit ODER", () => {
    const res = filterVorlagen(vorlagen, { modul: "ONBOARDING", geltung: GYM });
    expect(namen(res)).toEqual(["Aufforderung FZ Lehrer"]);
    // Bei ODER waeren auch die anderen Onboarding- bzw. GYM-Vorlagen dabei.
    expect(res).toHaveLength(1);
  });

  it("liefert leer, wenn Modul und Geltung sich gegenseitig ausschliessen", () => {
    const res = filterVorlagen(vorlagen, { modul: "BEM", geltung: GELTUNG_MANDANT });
    expect(res).toEqual([]);
  });

  it("kommt mit einer leeren Liste zurecht", () => {
    expect(filterVorlagen([], { modul: "ONBOARDING", geltung: GELTUNG_GLOBAL })).toEqual([]);
  });

  it("veraendert die Eingabeliste nicht", () => {
    const kopie = [...vorlagen];
    filterVorlagen(vorlagen, { modul: "ONBOARDING", geltung: KITA });
    expect(vorlagen).toEqual(kopie);
  });
});
