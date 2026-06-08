/**
 * Tests fuer die BEM-State-Maschine (bem-workflow.ts).
 * Reine Logik, keine DB — sichert die erlaubten Statusuebergaenge ab.
 */

import {
  erlaubteFolgestatus,
  getErlaubteVorgaenger,
  getNaechsterSchritt,
  getStepIndex,
  isOffPath,
  statusLabel,
  BEM_STEPS,
  type BemStatus,
} from "@/lib/bem-workflow";

describe("bem-workflow — erlaubteFolgestatus", () => {
  it("ANGELEGT fuehrt zu EINLADUNG_VERSENDET oder ABGEBROCHEN", () => {
    expect(erlaubteFolgestatus("ANGELEGT")).toEqual([
      "EINLADUNG_VERSENDET",
      "ABGEBROCHEN",
    ]);
  });

  it("EINLADUNG_VERSENDET erlaubt Einwilligung erteilt/abgelehnt/Abbruch", () => {
    expect(erlaubteFolgestatus("EINLADUNG_VERSENDET")).toEqual([
      "EINWILLIGUNG_ERTEILT",
      "EINWILLIGUNG_ABGELEHNT",
      "ABGEBROCHEN",
    ]);
  });

  it("GELOESCHT ist terminal", () => {
    expect(erlaubteFolgestatus("GELOESCHT")).toEqual([]);
  });
});

describe("bem-workflow — getErlaubteVorgaenger (Umkehrung)", () => {
  it("ist konsistent mit erlaubteFolgestatus", () => {
    const alle: BemStatus[] = [
      "ANGELEGT",
      "EINLADUNG_VERSENDET",
      "EINWILLIGUNG_ERTEILT",
      "EINWILLIGUNG_ABGELEHNT",
      "ERSTGESPRAECH",
      "MASSNAHMEN_LAUFEN",
      "ABGESCHLOSSEN",
      "ABGEBROCHEN",
      "AUFBEWAHRUNG",
      "GELOESCHT",
    ];
    for (const ziel of alle) {
      for (const vorg of getErlaubteVorgaenger(ziel)) {
        expect(erlaubteFolgestatus(vorg)).toContain(ziel);
      }
    }
  });

  it("EINWILLIGUNG_ERTEILT ist nur von EINLADUNG_VERSENDET erreichbar", () => {
    expect(getErlaubteVorgaenger("EINWILLIGUNG_ERTEILT")).toEqual([
      "EINLADUNG_VERSENDET",
    ]);
  });
});

describe("bem-workflow — Stepper-Helfer", () => {
  it("getStepIndex liefert Position im Haupt-Pfad", () => {
    expect(getStepIndex("ANGELEGT")).toBe(0);
    expect(getStepIndex("ABGESCHLOSSEN")).toBe(BEM_STEPS.length - 1);
  });

  it("Off-Path-Status sind nicht im Stepper", () => {
    expect(isOffPath("ABGEBROCHEN")).toBe(true);
    expect(isOffPath("EINWILLIGUNG_ABGELEHNT")).toBe(true);
    expect(isOffPath("ANGELEGT")).toBe(false);
    expect(getStepIndex("ABGEBROCHEN")).toBe(-1);
  });

  it("statusLabel liefert deutsche Labels auch fuer Off-Path", () => {
    expect(statusLabel("ANGELEGT")).toBe("Fall angelegt");
    expect(statusLabel("ABGEBROCHEN")).toBe("Abgebrochen");
  });
});

describe("bem-workflow — getNaechsterSchritt", () => {
  it("schlaegt fuer ANGELEGT die Einladung vor (HR-Aktion)", () => {
    const n = getNaechsterSchritt("ANGELEGT");
    expect(n.action).toBe("EINLADUNG_VERSENDEN");
    expect(n.hrAktion).toBe(true);
  });

  it("markiert abgeschlossene/terminale Faelle ohne HR-Aktion", () => {
    expect(getNaechsterSchritt("ABGESCHLOSSEN").hrAktion).toBe(false);
    expect(getNaechsterSchritt("ABGEBROCHEN").hrAktion).toBe(false);
  });
});
