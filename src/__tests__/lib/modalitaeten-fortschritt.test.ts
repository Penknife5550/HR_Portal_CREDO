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
  SUP_SCHRITT_AUSSTATTUNG,
  SUP_STEP_CONFIG,
  supSchritte,
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

// =============================================
// Paket A2: Schrittliste mit Merker `mitAusstattung`
// =============================================

describe("supSchritte", () => {
  it("Grundliste: fuenf Schritte mit festen Schluesseln, unveraendert", () => {
    expect(SUP_STEP_CONFIG).toHaveLength(5);
    expect(SUP_STEP_CONFIG.map((s) => s.key)).toEqual([
      "stelle",
      "arbeitszeit",
      "verguetung",
      "zusatz",
      "zusammenfassung",
    ]);
    // `number` bleibt fuer Bestandsleser stehen.
    expect(SUP_STEP_CONFIG.map((s) => s.number)).toEqual([1, 2, 3, 4, 5]);
  });

  it("ohne Merker (false, null, undefined): genau die Grundliste", () => {
    for (const merker of [false, null, undefined]) {
      expect(supSchritte(merker)).toBe(SUP_STEP_CONFIG);
    }
    expect(supSchritte()).toBe(SUP_STEP_CONFIG);
  });

  it("mit Merker: Ausstattung an Index 4, Zusammenfassung an Index 5", () => {
    const schritte = supSchritte(true);
    expect(schritte).toHaveLength(6);
    expect(schritte.map((s) => s.key)).toEqual([
      "stelle",
      "arbeitszeit",
      "verguetung",
      "zusatz",
      "ausstattung",
      "zusammenfassung",
    ]);
    expect(schritte[4]).toBe(SUP_SCHRITT_AUSSTATTUNG);
    expect(schritte[5]).toBe(SUP_STEP_CONFIG[4]);
    // Die ersten vier sind dieselben Eintraege wie in der Grundliste.
    for (let i = 0; i < 4; i++) expect(schritte[i]).toBe(SUP_STEP_CONFIG[i]);
  });

  it("der neue Schritt: Titel und Untertitel wie im Feinplan", () => {
    expect(SUP_SCHRITT_AUSSTATTUNG).toEqual({
      key: "ausstattung",
      title: "Ausstattung & Zugänge",
      description: "Was zum Arbeitsbeginn bereitstehen soll",
    });
  });

  it("Schluessel sind in beiden Listen eindeutig", () => {
    for (const merker of [true, false]) {
      const keys = supSchritte(merker).map((s) => s.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("die Grundliste wird durch den Aufruf mit Merker nicht veraendert", () => {
    supSchritte(true);
    expect(SUP_STEP_CONFIG).toHaveLength(5);
    expect(SUP_STEP_CONFIG[4].key).toBe("zusammenfassung");
  });
});

describe("modalitaetenFortschritt mit Merker", () => {
  it("currentStep 4 mit Merker: „Schritt 5 von 6 · Ausstattung & Zugänge“", () => {
    const f = modalitaetenFortschritt({ currentStep: 4, mitAusstattung: true });
    expect(f).toEqual({
      position: 5,
      total: 6,
      titel: "Ausstattung & Zugänge",
      begonnen: true,
    });
    expect(formatModalitaetenFortschritt(f)).toBe("Schritt 5 von 6 · Ausstattung & Zugänge");
  });

  it("currentStep 5 mit Merker: die Zusammenfassung ist Schritt 6", () => {
    expect(
      formatModalitaetenFortschritt(modalitaetenFortschritt({ currentStep: 5, mitAusstattung: true })),
    ).toBe("Schritt 6 von 6 · Zusammenfassung");
  });

  it("Kappung bei 6: ein Wert jenseits der Strecke bleibt bei der Zusammenfassung", () => {
    const f = modalitaetenFortschritt({ currentStep: 9, mitAusstattung: true });
    expect(f.position).toBe(6);
    expect(f.total).toBe(6);
    expect(formatModalitaetenFortschritt(f)).toBe("Schritt 6 von 6 · Zusammenfassung");
  });

  it("die ersten Schritte heissen mit Merker gleich, nur die Gesamtzahl ist 6", () => {
    expect(
      formatModalitaetenFortschritt(modalitaetenFortschritt({ currentStep: 1, mitAusstattung: true })),
    ).toBe("Schritt 2 von 6 · Arbeitszeit & Arbeitgeber");
    expect(
      formatModalitaetenFortschritt(modalitaetenFortschritt({ currentStep: 3, mitAusstattung: true })),
    ).toBe("Schritt 4 von 6 · Zusätzliche Angaben");
  });

  it("noch nicht begonnen bleibt auch mit Merker „noch nicht begonnen“", () => {
    const f = modalitaetenFortschritt({ currentStep: 0, mitAusstattung: true });
    expect(f.begonnen).toBe(false);
    expect(f.total).toBe(6);
    expect(formatModalitaetenFortschritt(f)).toBe("noch nicht begonnen");
  });

  it("`null` gilt als 5 — Bestand vor der Migration sieht aus wie bisher", () => {
    const f = modalitaetenFortschritt({ currentStep: 4, mitAusstattung: null });
    expect(f.total).toBe(5);
    expect(formatModalitaetenFortschritt(f)).toBe("Schritt 5 von 5 · Zusammenfassung");
    // Kappung bleibt bei 5.
    expect(modalitaetenFortschritt({ currentStep: 9, mitAusstattung: null }).position).toBe(5);
  });

  it("`false` und ein fehlender Merker: fuenf Schritte wie bisher", () => {
    for (const sd of [
      { currentStep: 4, mitAusstattung: false },
      { currentStep: 4, mitAusstattung: undefined },
      { currentStep: 4 },
    ]) {
      const f = modalitaetenFortschritt(sd);
      expect(f.total).toBe(5);
      expect(formatModalitaetenFortschritt(f)).toBe("Schritt 5 von 5 · Zusammenfassung");
    }
  });
});
