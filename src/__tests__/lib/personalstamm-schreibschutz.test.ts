/**
 * Schreibschutz (src/lib/personalstamm/schreibschutz.ts): die reinen Regeln
 * und ein Waechter, dass die gesperrten Vertragsfelder dem folgen, was der
 * Abgleich schreibt.
 */

import { readFileSync } from "fs";
import { join } from "path";
import {
  VERWALTETE_VERTRAGSFELDER,
  gesperrteFelder,
  personVerwaltet,
  vertragVerwaltet,
} from "@/lib/personalstamm/schreibschutz";

describe("Regeln", () => {
  it("verwaltet ist nur die Quelle DOKUBIT", () => {
    expect(personVerwaltet({ importSource: "DOKUBIT" })).toBe(true);
    expect(personVerwaltet({ importSource: null })).toBe(false);
    expect(personVerwaltet({ importSource: "MANUELL" })).toBe(false);
    expect(personVerwaltet({ importSource: "dokubit" })).toBe(false);
  });

  it("ein Vertrag aus DokuBit hat Abrechnungskreis UND MANR", () => {
    expect(vertragVerwaltet({ abrechnungskreis: "AK", personalNumber: "1" })).toBe(true);
    expect(vertragVerwaltet({ abrechnungskreis: null, personalNumber: "1" })).toBe(false);
    expect(vertragVerwaltet({ abrechnungskreis: "AK", personalNumber: null })).toBe(false);
  });

  it("gesperrt ist ein Feld, sobald es im Body steht — auch mit null", () => {
    expect(gesperrteFelder({ email: null, firstName: "A", isActive: undefined }, ["email", "isActive"])).toEqual(["email"]);
    expect(gesperrteFelder({}, ["email"])).toEqual([]);
  });
});

describe("Waechter: gesperrt ist, was der Abgleich an einem Vertrag schreibt", () => {
  const quelle = readFileSync(join(process.cwd(), "src/lib/personalstamm/abgleich.ts"), "utf-8");

  function abschnitt(start: string): string {
    const von = quelle.indexOf(start);
    expect(von).toBeGreaterThan(-1);
    return quelle.slice(von, quelle.indexOf("\n}\n", von));
  }

  // Den Schluessel und die Person nimmt die PATCH-Route gar nicht an.
  const NICHT_IM_SCHEMA = ["employeeId", "abrechnungskreis", "personalNumber"];

  it("vertragAnlegen", () => {
    const daten = abschnitt("async function vertragAnlegen").match(/data: \{([\s\S]*?)\n\s*\},/);
    expect(daten).not.toBeNull();
    const felder = [...daten![1].matchAll(/^\s*(\w+)[,:]/gm)].map((m) => m[1]).filter((f) => !NICHT_IM_SCHEMA.includes(f));
    expect(felder.sort()).toEqual([...VERWALTETE_VERTRAGSFELDER].sort());
  });

  it("vertragsAenderung", () => {
    const felder = [...abschnitt("function vertragsAenderung").matchAll(/aenderung\.(\w+)\s*=/g)].map((m) => m[1]);
    expect(felder.length).toBeGreaterThan(0);
    for (const feld of felder) expect(VERWALTETE_VERTRAGSFELDER).toContain(feld);
  });
});
