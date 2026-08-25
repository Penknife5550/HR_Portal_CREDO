/**
 * Tests fuer die zentrale Schritt-Definition des Personalfragebogens
 * (src/lib/fragebogen-steps.ts), AP 1 — Renderer entkoppeln.
 *
 * Der Kern: Die Vorlagen-Konfiguration muss sich tatsaechlich auf die Strecke
 * auswirken, und die gespeicherte Schrittnummer muss stabil bleiben, wenn sich
 * die Vorlage aendert. Beides war vorher nicht der Fall.
 */

import {
  FRAGEBOGEN_STEPS,
  MANDATORY_STEP_NUMBERS,
  MAX_STEP_NUMBER,
  SUMMARY_STEP_NUMBER,
  LEGACY_DISPLAY_ORDER,
  getActiveSteps,
  getStep,
  getStepTitle,
  indexOfStep,
  legacyIndexToStepNumber,
  resolveResumeStep,
} from "@/lib/fragebogen-steps";
import { FIELD_REGISTRY, generateFullStepsConfig } from "@/lib/field-definitions";
import { readFileSync } from "fs";
import { join } from "path";

/** Vorlagen-Konfiguration bauen: alles an, ausser den genannten Schritten. */
function configExcept(disabled: number[]) {
  return FRAGEBOGEN_STEPS.map((s) => ({
    step: s.step,
    title: s.title,
    enabled: !disabled.includes(s.step),
  }));
}

describe("FRAGEBOGEN_STEPS – Konsistenz der Definition", () => {
  it("vergibt jede Registry-Nummer genau einmal", () => {
    const nummern = FRAGEBOGEN_STEPS.map((s) => s.step);
    expect(new Set(nummern).size).toBe(nummern.length);
  });

  it("vergibt jeden Komponenten-Schluessel genau einmal", () => {
    const keys = FRAGEBOGEN_STEPS.map((s) => s.key).filter(
      (k): k is NonNullable<typeof k> => k !== null
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("kennt zu jedem Schritt einen Eintrag in der Feld-Registry", () => {
    for (const step of FRAGEBOGEN_STEPS) {
      expect(FIELD_REGISTRY[step.step]).toBeDefined();
    }
  });

  it("nennt fuer jeden virtuellen Schritt, wo er erfasst wird", () => {
    const virtuell = FRAGEBOGEN_STEPS.filter((s) => s.key === null);
    // Heute genau einer: Kinder, erfasst in der Sozialversicherung.
    expect(virtuell.length).toBeGreaterThan(0);
    for (const s of virtuell) {
      expect(typeof s.renderedWithin).toBe("number");
      expect(getStep(s.renderedWithin as number)).toBeDefined();
    }
  });

  it("haelt Pflichtschritte, Obergrenze und Zusammenfassung synchron", () => {
    expect(MANDATORY_STEP_NUMBERS).toContain(1);
    expect(MANDATORY_STEP_NUMBERS).toContain(SUMMARY_STEP_NUMBER);
    expect(MAX_STEP_NUMBER).toBe(
      Math.max(...FRAGEBOGEN_STEPS.map((s) => s.step))
    );
  });

  it("liefert Titel mit Fallback fuer unbekannte Nummern", () => {
    expect(getStepTitle(1)).toBe("Persönliche Angaben");
    expect(getStepTitle(999)).toBe("Schritt 999");
  });
});

describe("getActiveSteps – die Vorlagen-Konfiguration wirkt", () => {
  it("laesst virtuelle Schritte grundsaetzlich weg", () => {
    const aktiv = getActiveSteps(configExcept([]));
    expect(aktiv.every((s) => s.key !== null)).toBe(true);
    expect(aktiv.map((s) => s.step)).not.toContain(7);
  });

  it("nimmt ohne Konfiguration alle Schritte mit eigener Maske", () => {
    const erwartet = FRAGEBOGEN_STEPS.filter((s) => s.key !== null).length;
    expect(getActiveSteps(null)).toHaveLength(erwartet);
    expect(getActiveSteps(undefined)).toHaveLength(erwartet);
    expect(getActiveSteps([])).toHaveLength(erwartet);
  });

  it("laesst abgeschaltete Schritte weg – das war der eigentliche Fehler", () => {
    const aktiv = getActiveSteps(configExcept([5, 9]));
    const nummern = aktiv.map((s) => s.step);
    expect(nummern).not.toContain(5);
    expect(nummern).not.toContain(9);
    expect(nummern).toContain(6);
  });

  it("behaelt die Anzeigereihenfolge der zentralen Definition bei", () => {
    const nummern = getActiveSteps(configExcept([5])).map((s) => s.step);
    const sortiert = [...nummern].sort((a, b) => a - b);
    expect(nummern).toEqual(sortiert);
  });

  it("behaelt Pflichtschritte, auch wenn eine Konfiguration sie abschaltet", () => {
    // Sonst gaebe es einen Fragebogen ohne Absende-Schritt.
    const aktiv = getActiveSteps(configExcept([1, SUMMARY_STEP_NUMBER]));
    expect(aktiv.map((s) => s.step)).toContain(1);
    expect(aktiv.map((s) => s.step)).toContain(SUMMARY_STEP_NUMBER);
  });

  it("wertet einen in der Konfiguration fehlenden Schritt als aktiv", () => {
    const luecke = configExcept([]).filter((s) => s.step !== 6);
    expect(getActiveSteps(luecke).map((s) => s.step)).toContain(6);
  });

  it("bildet die Minijob-Strecke ab: ohne Masernschutz, mit Bildung & Beruf", () => {
    // Entscheidung 25.08.2026: Bildung & Beruf bleibt an, Masernschutz faellt weg.
    //
    // Heute sind das acht Schritte. Neun werden es erst mit AP 7, wenn die
    // Rentenversicherung als Registry-Schritt 11 vor der Zusammenfassung
    // dazukommt — so wie die Masken-Entwuerfe den Endzustand zeigen.
    const aktiv = getActiveSteps(configExcept([9]));
    expect(aktiv.map((s) => s.step)).toEqual([1, 2, 3, 4, 5, 6, 8, 10]);
    expect(aktiv.map((s) => s.step)).toContain(8); // Bildung & Beruf
    expect(aktiv.map((s) => s.step)).not.toContain(9); // Masernschutz
    // Der Mitarbeiter zaehlt durchgehend, ohne Luecke bei der 7.
    expect(indexOfStep(aktiv, 8) + 1).toBe(7);
    expect(indexOfStep(aktiv, SUMMARY_STEP_NUMBER) + 1).toBe(8);
  });

  it("bildet die Ehrenamt-Strecke ab: nur Person, Adresse, Zusammenfassung", () => {
    const aktiv = getActiveSteps(configExcept([3, 4, 5, 6, 7, 8, 9]));
    expect(aktiv.map((s) => s.step)).toEqual([1, 2, SUMMARY_STEP_NUMBER]);
  });
});

describe("indexOfStep / resolveResumeStep – Wiedereinstieg", () => {
  const aktiv = getActiveSteps(configExcept([9]));

  it("findet die Anzeigeposition zu einer Registry-Nummer", () => {
    expect(indexOfStep(aktiv, 1)).toBe(0);
    expect(indexOfStep(aktiv, 6)).toBe(5);
  });

  it("meldet -1 fuer einen Schritt, den diese Vorlage nicht hat", () => {
    expect(indexOfStep(aktiv, 9)).toBe(-1);
  });

  it("steigt an der gespeicherten Registry-Nummer wieder ein", () => {
    expect(resolveResumeStep(aktiv, 6)).toBe(5);
  });

  it("faellt auf den ersten Schritt zurueck, wenn die Vorlage sich geaendert hat", () => {
    // Masernschutz wurde abgeschaltet, waehrend der Vorgang dort stand.
    expect(resolveResumeStep(aktiv, 9)).toBe(0);
  });

  it("faellt auf den ersten Schritt zurueck, wenn nichts gespeichert ist", () => {
    expect(resolveResumeStep(aktiv, null)).toBe(0);
    expect(resolveResumeStep(aktiv, undefined)).toBe(0);
  });
});

describe("legacyIndexToStepNumber – Migration der Alt-Daten", () => {
  it("bildet die alte Anzeigereihenfolge ab", () => {
    // Alt: 0-basierte Position in [1,2,3,4,5,6,8,9,10].
    expect(legacyIndexToStepNumber(0)).toBe(1);
    expect(legacyIndexToStepNumber(5)).toBe(6);
    // Ab hier lief die alte Zaehlung auseinander – genau das war der Fehler.
    expect(legacyIndexToStepNumber(6)).toBe(8);
    expect(legacyIndexToStepNumber(7)).toBe(9);
    expect(legacyIndexToStepNumber(8)).toBe(10);
  });

  it("bildet die Absende-Markierung auf die Zusammenfassung ab", () => {
    // Beim Absenden wurde frueher pauschal 10 gesetzt.
    expect(legacyIndexToStepNumber(10)).toBe(SUMMARY_STEP_NUMBER);
    expect(legacyIndexToStepNumber(9)).toBe(SUMMARY_STEP_NUMBER);
  });

  it("laesst die alte Reihenfolge den virtuellen Schritt aus", () => {
    // Schritt 7 (Kinder) hatte nie eine eigene Maske.
    expect(LEGACY_DISPLAY_ORDER).not.toContain(7);
    expect(LEGACY_DISPLAY_ORDER).toEqual(
      FRAGEBOGEN_STEPS.filter((s) => s.key !== null).map((s) => s.step)
    );
  });

  it("verschiebt Werte nie nach unten – Voraussetzung der Migration", () => {
    // Die Migration arbeitet Quellwerte absteigend ab. Das ist nur kollisions-
    // frei, solange kein Zielwert kleiner als sein Quellwert ist.
    for (let i = 0; i <= 10; i++) {
      expect(legacyIndexToStepNumber(i)).toBeGreaterThanOrEqual(i);
    }
  });
});

describe("MINIJOB-Vorlagenkorrektur im Entrypoint", () => {
  // prisma/seed-check.js laeuft im Container als reines JS ohne tsx und kann
  // die Feld-Registry deshalb nicht importieren. Die Steuer-Felder sind dort
  // dupliziert — dieser Test faengt ab, dass die Kopien auseinanderlaufen.
  const seedCheck = readFileSync(
    join(process.cwd(), "prisma", "seed-check.js"),
    "utf-8"
  );

  it("kennt jedes Feld des Steuer-Schritts", () => {
    const block = seedCheck.slice(
      seedCheck.indexOf("const MINIJOB_TAX_FIELDS"),
      seedCheck.indexOf("async function ensureMinijobTemplateSteps")
    );
    expect(block.length).toBeGreaterThan(0);
    for (const feld of FIELD_REGISTRY[5]) {
      expect(block).toContain(`name: "${feld.name}"`);
    }
  });

  it("laesst genau die Steuer-ID sichtbar und pflichtig", () => {
    expect(seedCheck).toContain(
      '{ name: "taxId", label: "Steuer-ID", visible: true, required: true }'
    );
  });

  it("dupliziert die alte Anzeigereihenfolge unveraendert", () => {
    expect(seedCheck).toContain(
      "const LEGACY_DISPLAY_ORDER = [" + LEGACY_DISPLAY_ORDER.join(", ") + "]"
    );
  });
});

describe("generateFullStepsConfig – Seed und neue Vorlagen", () => {
  it("erzeugt einen Eintrag je Schritt der zentralen Definition", () => {
    const config = generateFullStepsConfig();
    expect(config.map((c) => c.step)).toEqual(FRAGEBOGEN_STEPS.map((s) => s.step));
    expect(config.map((c) => c.title)).toEqual(FRAGEBOGEN_STEPS.map((s) => s.title));
    expect(config.every((c) => c.enabled)).toBe(true);
  });

  it("liefert zu jedem Schritt die Feld-Defaults mit", () => {
    for (const eintrag of generateFullStepsConfig()) {
      expect(Array.isArray(eintrag.fields)).toBe(true);
      expect(eintrag.fields).toHaveLength(FIELD_REGISTRY[eintrag.step].length);
    }
  });
});
