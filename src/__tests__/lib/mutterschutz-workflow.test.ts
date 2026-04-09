/**
 * Tests fuer src/lib/mutterschutz-workflow.ts
 *
 * Pure Functions — kein Mocking noetig.
 * Fokus: State-Machine-Korrektheit (sicherheitskritisch), insbesondere
 * `erlaubteFolgestatus` und `getErlaubteVorgaenger` (Race-Schutz im
 * atomaren updateMany der Transition-Routes).
 */

import {
  erlaubteFolgestatus,
  getErlaubteVorgaenger,
  getRelevantSteps,
  getStepIndex,
  getNaechsterSchritt,
  isErsterSchritt,
  isLetzterSchritt,
  MUTTERSCHUTZ_STEPS,
  type MutterschutzStatus,
} from "@/lib/mutterschutz-workflow";

describe("erlaubteFolgestatus — State-Machine", () => {
  // BAD-erforderlich Pfad (Kita)
  describe("badErforderlich = true", () => {
    it("GEMELDET kann zu BAD_BEAUFTRAGT oder AKTIV", () => {
      expect(erlaubteFolgestatus("GEMELDET", true).sort()).toEqual(
        ["AKTIV", "BAD_BEAUFTRAGT"].sort(),
      );
    });
    it("BAD_BEAUFTRAGT kann nur zu BAD_ABGESCHLOSSEN", () => {
      expect(erlaubteFolgestatus("BAD_BEAUFTRAGT", true)).toEqual([
        "BAD_ABGESCHLOSSEN",
      ]);
    });
    it("BAD_ABGESCHLOSSEN kann nur zu AKTIV", () => {
      expect(erlaubteFolgestatus("BAD_ABGESCHLOSSEN", true)).toEqual(["AKTIV"]);
    });
    it("AKTIV kann nur zu BEENDET", () => {
      expect(erlaubteFolgestatus("AKTIV", true)).toEqual(["BEENDET"]);
    });
    it("BEENDET ist Endzustand", () => {
      expect(erlaubteFolgestatus("BEENDET", true)).toEqual([]);
    });
  });

  // BAD-nicht-erforderlich Pfad (Schule, Verwaltung)
  describe("badErforderlich = false", () => {
    it("GEMELDET kann nur zu AKTIV (KEIN BAD_BEAUFTRAGT)", () => {
      expect(erlaubteFolgestatus("GEMELDET", false)).toEqual(["AKTIV"]);
    });
    it("BAD_BEAUFTRAGT bleibt erlaubt → BAD_ABGESCHLOSSEN (Bestandsdaten)", () => {
      expect(erlaubteFolgestatus("BAD_BEAUFTRAGT", false)).toEqual([
        "BAD_ABGESCHLOSSEN",
      ]);
    });
    it("BAD_ABGESCHLOSSEN → AKTIV (Bestandsdaten)", () => {
      expect(erlaubteFolgestatus("BAD_ABGESCHLOSSEN", false)).toEqual(["AKTIV"]);
    });
    it("AKTIV → BEENDET", () => {
      expect(erlaubteFolgestatus("AKTIV", false)).toEqual(["BEENDET"]);
    });
    it("BEENDET ist Endzustand", () => {
      expect(erlaubteFolgestatus("BEENDET", false)).toEqual([]);
    });
  });

  it("unbekannter Status liefert leeres Array (defensiv)", () => {
    expect(
      erlaubteFolgestatus("FOO" as MutterschutzStatus, true),
    ).toEqual([]);
  });
});

describe("getErlaubteVorgaenger — Umkehr der State-Machine", () => {
  // Diese Funktion wird im atomaren updateMany.where verwendet,
  // daher ist Korrektheit hier sicherheitskritisch.
  describe("badErforderlich = true", () => {
    it("BAD_BEAUFTRAGT erreichbar nur aus GEMELDET", () => {
      expect(getErlaubteVorgaenger("BAD_BEAUFTRAGT", true)).toEqual([
        "GEMELDET",
      ]);
    });
    it("BAD_ABGESCHLOSSEN erreichbar nur aus BAD_BEAUFTRAGT", () => {
      expect(getErlaubteVorgaenger("BAD_ABGESCHLOSSEN", true)).toEqual([
        "BAD_BEAUFTRAGT",
      ]);
    });
    it("AKTIV erreichbar aus GEMELDET oder BAD_ABGESCHLOSSEN", () => {
      expect(getErlaubteVorgaenger("AKTIV", true).sort()).toEqual(
        ["BAD_ABGESCHLOSSEN", "GEMELDET"].sort(),
      );
    });
    it("BEENDET erreichbar nur aus AKTIV", () => {
      expect(getErlaubteVorgaenger("BEENDET", true)).toEqual(["AKTIV"]);
    });
    it("GEMELDET ist Startzustand — keine Vorgaenger", () => {
      expect(getErlaubteVorgaenger("GEMELDET", true)).toEqual([]);
    });
  });

  describe("badErforderlich = false", () => {
    it("AKTIV erreichbar aus GEMELDET oder BAD_ABGESCHLOSSEN", () => {
      // Bestandsdaten-Kompatibilitaet: ein BAD_ABGESCHLOSSEN-Datensatz mit
      // jetzt badErforderlich=false darf trotzdem nach AKTIV
      expect(getErlaubteVorgaenger("AKTIV", false).sort()).toEqual(
        ["BAD_ABGESCHLOSSEN", "GEMELDET"].sort(),
      );
    });
    it("BAD_BEAUFTRAGT NICHT erreichbar (kein Pfad ohne BAD)", () => {
      expect(getErlaubteVorgaenger("BAD_BEAUFTRAGT", false)).toEqual([]);
    });
  });
});

describe("Konsistenz-Check: erlaubteFolgestatus ↔ getErlaubteVorgaenger", () => {
  // Wenn X → Y in erlaubteFolgestatus, muss X auch in getErlaubteVorgaenger(Y).
  // Schliesst Asymmetrie-Bugs zwischen den beiden Funktionen aus.
  const alleStatus: MutterschutzStatus[] = [
    "GEMELDET",
    "BAD_BEAUFTRAGT",
    "BAD_ABGESCHLOSSEN",
    "AKTIV",
    "BEENDET",
  ];

  for (const bad of [true, false]) {
    for (const von of alleStatus) {
      for (const nach of erlaubteFolgestatus(von, bad)) {
        it(`bad=${bad}: ${von} → ${nach} muss in getErlaubteVorgaenger(${nach}) auftauchen`, () => {
          expect(getErlaubteVorgaenger(nach, bad)).toContain(von);
        });
      }
    }
  }
});

describe("getRelevantSteps", () => {
  it("badErforderlich=true liefert alle 5 Schritte", () => {
    expect(getRelevantSteps(true).map((s) => s.id)).toEqual([
      "GEMELDET",
      "BAD_BEAUFTRAGT",
      "BAD_ABGESCHLOSSEN",
      "AKTIV",
      "BEENDET",
    ]);
  });
  it("badErforderlich=false ueberspringt BAD-Schritte", () => {
    expect(getRelevantSteps(false).map((s) => s.id)).toEqual([
      "GEMELDET",
      "AKTIV",
      "BEENDET",
    ]);
  });
});

describe("getStepIndex", () => {
  it("findet Index in BAD-Pfad", () => {
    expect(getStepIndex("BAD_ABGESCHLOSSEN", true)).toBe(2);
  });
  it("findet Index im verkuerzten Pfad", () => {
    expect(getStepIndex("AKTIV", false)).toBe(1);
  });
  it("liefert -1 fuer nicht-relevanten Schritt", () => {
    expect(getStepIndex("BAD_BEAUFTRAGT", false)).toBe(-1);
  });
});

describe("isErsterSchritt / isLetzterSchritt", () => {
  it("GEMELDET ist erster Schritt", () => {
    expect(isErsterSchritt("GEMELDET")).toBe(true);
    expect(isErsterSchritt("AKTIV")).toBe(false);
  });
  it("BEENDET ist letzter Schritt", () => {
    expect(isLetzterSchritt("BEENDET")).toBe(true);
    expect(isLetzterSchritt("AKTIV")).toBe(false);
  });
});

describe("getNaechsterSchritt", () => {
  it("GEMELDET + bad → action BAD_BEAUFTRAGEN", () => {
    expect(getNaechsterSchritt("GEMELDET", true).action).toBe("BAD_BEAUFTRAGEN");
  });
  it("GEMELDET ohne bad → action AKTIVIEREN", () => {
    expect(getNaechsterSchritt("GEMELDET", false).action).toBe("AKTIVIEREN");
  });
  it("BAD_BEAUFTRAGT → action BAD_ABSCHLIESSEN", () => {
    expect(getNaechsterSchritt("BAD_BEAUFTRAGT", true).action).toBe(
      "BAD_ABSCHLIESSEN",
    );
  });
  it("AKTIV → action BEENDEN", () => {
    expect(getNaechsterSchritt("AKTIV", true).action).toBe("BEENDEN");
  });
  it("BEENDET → action ABGESCHLOSSEN, keine HR-Aktion", () => {
    const r = getNaechsterSchritt("BEENDET", true);
    expect(r.action).toBe("ABGESCHLOSSEN");
    expect(r.hrAktion).toBe(false);
  });
  it("unbekannter Status crasht nicht", () => {
    const r = getNaechsterSchritt("FOO" as MutterschutzStatus, true);
    expect(r.titel).toBe("Unbekannter Status");
    expect(r.hrAktion).toBe(false);
  });
});

describe("MUTTERSCHUTZ_STEPS Konstante", () => {
  it("hat die erwartete Reihenfolge", () => {
    expect(MUTTERSCHUTZ_STEPS.map((s) => s.id)).toEqual([
      "GEMELDET",
      "BAD_BEAUFTRAGT",
      "BAD_ABGESCHLOSSEN",
      "AKTIV",
      "BEENDET",
    ]);
  });
  it("BAD-Schritte sind als optional markiert", () => {
    expect(
      MUTTERSCHUTZ_STEPS.find((s) => s.id === "BAD_BEAUFTRAGT")?.optional,
    ).toBe(true);
    expect(
      MUTTERSCHUTZ_STEPS.find((s) => s.id === "BAD_ABGESCHLOSSEN")?.optional,
    ).toBe(true);
  });
  it("Nicht-BAD-Schritte sind NICHT optional", () => {
    expect(
      MUTTERSCHUTZ_STEPS.find((s) => s.id === "GEMELDET")?.optional,
    ).toBeFalsy();
    expect(
      MUTTERSCHUTZ_STEPS.find((s) => s.id === "AKTIV")?.optional,
    ).toBeFalsy();
    expect(
      MUTTERSCHUTZ_STEPS.find((s) => s.id === "BEENDET")?.optional,
    ).toBeFalsy();
  });
});
