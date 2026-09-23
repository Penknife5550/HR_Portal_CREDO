/**
 * `modalitaetenFortschritt` — der Off-by-one der HR-Ansicht.
 *
 * `SupervisorData.currentStep` ist ein 0-BASIERTER INDEX (Schema-Default 0 =
 * „nie gespeichert"). Die Formularseite der Fuehrungskraft rechnet fuer ihre
 * Anzeige `currentStep + 1`, die HR-Ansicht tat das bis 09/2026 nicht: Sie
 * zeigte „Schritt 1 von 5" bzw. „Schritt 0 von 5", waehrend die Fuehrungskraft
 * „Schritt 2 / 5" sah. Diese Suite haelt die Umrechnung fest.
 */
import {
  formatModalitaetenFortschritt,
  modalitaetenFortschritt,
  SUP_STEP_CONFIG,
} from "@/lib/validations/supervisor-data";

describe("modalitaetenFortschritt", () => {
  it("currentStep 0 (Schema-Default): noch nicht begonnen", () => {
    const f = modalitaetenFortschritt({ currentStep: 0 });
    expect(f.begonnen).toBe(false);
    expect(f.position).toBe(1);
    expect(f.total).toBe(SUP_STEP_CONFIG.length);
    expect(formatModalitaetenFortschritt(f)).toBe("noch nicht begonnen");
  });

  it("currentStep 1: dieselbe Zahl, die die Fuehrungskraft sieht", () => {
    const f = modalitaetenFortschritt({ currentStep: 1 });
    expect(f.begonnen).toBe(true);
    expect(formatModalitaetenFortschritt(f)).toBe("Schritt 2 von 5 · Arbeitszeit & Arbeitgeber");
  });

  it("currentStep 4: letzter Schritt", () => {
    expect(formatModalitaetenFortschritt(modalitaetenFortschritt({ currentStep: 4 }))).toBe(
      "Schritt 5 von 5 · Zusammenfassung",
    );
  });

  it("Bestandswert jenseits der Strecke wird gekappt, nicht hochgezaehlt", () => {
    const f = modalitaetenFortschritt({ currentStep: 9 });
    expect(f.position).toBe(5);
    expect(formatModalitaetenFortschritt(f)).toBe("Schritt 5 von 5 · Zusammenfassung");
  });

  it("null, undefined und fehlender Datensatz: noch nicht begonnen", () => {
    for (const eingabe of [
      null,
      undefined,
      { currentStep: null },
      {},
      { currentStep: -3 },
    ]) {
      const f = modalitaetenFortschritt(eingabe);
      expect(f.begonnen).toBe(false);
      expect(formatModalitaetenFortschritt(f)).toBe("noch nicht begonnen");
    }
  });

  it("`total` folgt SUP_STEP_CONFIG, ist also keine feste 5 im Text", () => {
    expect(modalitaetenFortschritt({ currentStep: 2 }).total).toBe(SUP_STEP_CONFIG.length);
    expect(modalitaetenFortschritt({ currentStep: 2 }).titel).toBe(SUP_STEP_CONFIG[2].title);
  });
});
