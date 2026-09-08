/**
 * Die Lese-Regel der Kostenstellen-Aufteilung.
 *
 * Der Befund, den diese Suite absichert: Vorgangsansicht, LOGA-CSV und
 * Personalakte-PDF lasen bis zur Durchsicht 09/2026 die Alt-Spalte
 * `SupervisorData.kostenstelle`, die die Maske seit
 * KOSTENSTELLEN_AUFTEILUNG_V1 nicht mehr befuellt. Die beiden Faelle, die das
 * unbrauchbar machen, stehen hier als Zusicherung:
 *
 *  1. NEUER Vorgang — Alt-Spalte NULL, zwei gepflegte Zeilen. Wer die
 *     Alt-Spalte liest, gibt nichts aus.
 *  2. GEAENDERTER Bestandsvorgang — Alt-Spalte steht auf "4711", die
 *     Aufteilung laengst auf 5000/6000. Wer die Alt-Spalte liest, gibt "4711"
 *     aus: eine stille Falschbuchung, weil die Anzeige gefuellt ist statt leer.
 *
 * Der Rueckfall auf die Alt-Spalte bleibt fuer genau einen Fall erlaubt — es
 * gibt noch keine Zeile, weil die Datenmigration auf diesem Server noch nicht
 * gelaufen ist.
 */

import {
  anteilText,
  aufteilungText,
  kostenstellenAnzeige,
  summeText,
  type KostenstellenQuelle,
} from "@/lib/kostenstellen-anzeige";

function quelle(teil: Partial<KostenstellenQuelle>): KostenstellenQuelle {
  return {
    kostenstelle: null,
    kostenstelleAnteil: null,
    kostenstellenBemerkung: null,
    kostenstellen: [],
    ...teil,
  };
}

describe("Die gepflegte Aufteilung schlaegt die Alt-Spalte", () => {
  it("gibt bei einem neuen Vorgang die Zeilen aus (Alt-Spalte ist NULL)", () => {
    const anzeige = kostenstellenAnzeige(
      quelle({
        kostenstellen: [
          { bezeichnung: "5000", anteil: 60 },
          { bezeichnung: "6000", anteil: 40 },
        ],
      })
    );

    expect(anzeige.zeilen).toEqual([
      { bezeichnung: "5000", anteil: 60 },
      { bezeichnung: "6000", anteil: 40 },
    ]);
    expect(anzeige.ausBestand).toBe(false);
    expect(anzeige.summeStimmt).toBe(true);
  });

  it("ignoriert die eingefrorene Alt-Spalte, sobald Zeilen da sind", () => {
    // Der gefaehrlichste Fall: Der Bestandsvorgang trug "4711", die
    // vorgesetzte Person hat laengst auf 5000/6000 umgestellt. "4711" darf
    // nirgends mehr auftauchen.
    const anzeige = kostenstellenAnzeige(
      quelle({
        kostenstelle: "4711",
        kostenstelleAnteil: 100,
        kostenstellen: [
          { bezeichnung: "5000", anteil: 60 },
          { bezeichnung: "6000", anteil: 40 },
        ],
      })
    );

    expect(anzeige.zeilen.map((z) => z.bezeichnung)).toEqual(["5000", "6000"]);
    expect(aufteilungText(anzeige.zeilen)).not.toContain("4711");
  });

  it("behandelt eine Zeile mit leerer Bezeichnung wie keine Zeile", () => {
    // Sonst stuende in der CSV-Spalte "Kostenstelle" ein Leerstring, obwohl im
    // Bestand noch ein Wert liegt.
    const anzeige = kostenstellenAnzeige(
      quelle({
        kostenstelle: "4711",
        kostenstellen: [{ bezeichnung: "   ", anteil: 100 }],
      })
    );

    expect(anzeige.zeilen).toEqual([{ bezeichnung: "4711", anteil: 100 }]);
    expect(anzeige.ausBestand).toBe(true);
  });
});

describe("Rueckfall auf den Bestand", () => {
  it("nimmt die Alt-Spalte, solange keine Zeile existiert", () => {
    const anzeige = kostenstellenAnzeige(
      quelle({ kostenstelle: " 4711 ", kostenstelleAnteil: null })
    );

    // Fehlt der Anteil, traegt die eine Kostenstelle alles — dieselbe Regel
    // wie in der Datenmigration und im Modalitaeten-Formular.
    expect(anzeige.zeilen).toEqual([{ bezeichnung: "4711", anteil: 100 }]);
    expect(anzeige.ausBestand).toBe(true);
    expect(anzeige.summeStimmt).toBe(true);
  });

  it("uebernimmt einen hinterlegten Alt-Anteil unveraendert", () => {
    // Auch wenn er nicht 100 ergibt: Die Zahl stammt von einem Menschen. Die
    // Luecke wird sichtbar (summeStimmt === false) statt geglaettet.
    const anzeige = kostenstellenAnzeige(
      quelle({ kostenstelle: "4711", kostenstelleAnteil: 60 })
    );

    expect(anzeige.zeilen).toEqual([{ bezeichnung: "4711", anteil: 60 }]);
    expect(anzeige.summeStimmt).toBe(false);
    expect(summeText(anzeige.summe)).toBe("60,00 %");
  });

  it("liefert nichts, wenn weder Zeile noch Alt-Spalte gefuellt sind", () => {
    expect(kostenstellenAnzeige(quelle({})).zeilen).toEqual([]);
    expect(kostenstellenAnzeige(null).zeilen).toEqual([]);
    // Ohne Zeilen gibt es nichts aufzuteilen — das ist kein Fehler.
    expect(kostenstellenAnzeige(null).summeStimmt).toBe(true);
  });
});

describe("Summe und Text", () => {
  it("rechnet die Summe in ganzen Hundertsteln", () => {
    // 5 + 63,01 + 31,99 ergibt als Gleitkommazahl 99.99999999999999 — eine
    // Summenpruefung mit `+` wiese diese korrekte Aufteilung ab.
    const anzeige = kostenstellenAnzeige(
      quelle({
        kostenstellen: [
          { bezeichnung: "A", anteil: 5 },
          { bezeichnung: "B", anteil: 63.01 },
          { bezeichnung: "C", anteil: 31.99 },
        ],
      })
    );

    expect(anzeige.summe).toBe(10_000);
    expect(anzeige.summeStimmt).toBe(true);
    expect(summeText(anzeige.summe)).toBe("100,00 %");
  });

  it("meldet eine Aufteilung, die nicht 100 Prozent ergibt", () => {
    const anzeige = kostenstellenAnzeige(
      quelle({
        kostenstellen: [
          { bezeichnung: "A", anteil: 60 },
          { bezeichnung: "B", anteil: 30 },
        ],
      })
    );

    expect(anzeige.summeStimmt).toBe(false);
    expect(summeText(anzeige.summe)).toBe("90,00 %");
  });

  it("schreibt Prozentwerte mit deutschem Komma und zwei Stellen", () => {
    expect(anteilText(60)).toBe("60,00 %");
    expect(anteilText(33.33)).toBe("33,33 %");
    expect(anteilText(0.5)).toBe("0,50 %");
  });

  it("trennt die Zellen-Fassung mit senkrechtem Strich, nicht mit Semikolon", () => {
    // Das Semikolon trennt in der CSV die Spalten; ein Import, der von Hand
    // mit split(";") arbeitet, zerlegte die Zeile sonst falsch.
    const text = aufteilungText([
      { bezeichnung: "5000", anteil: 60 },
      { bezeichnung: "6000", anteil: 40 },
    ]);

    expect(text).toBe("5000: 60,00 % | 6000: 40,00 %");
    expect(text).not.toContain(";");
  });

  it("gibt die Bemerkung getrimmt zurueck, leere Bemerkung als null", () => {
    expect(
      kostenstellenAnzeige(quelle({ kostenstellenBemerkung: "  Beschluss  " }))
        .bemerkung
    ).toBe("Beschluss");
    expect(
      kostenstellenAnzeige(quelle({ kostenstellenBemerkung: "   " })).bemerkung
    ).toBeNull();
  });
});
