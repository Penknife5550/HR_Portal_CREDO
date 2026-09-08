/**
 * Tests fuer src/lib/formular-zahlen.ts
 *
 * Diese Tests halten das Verhalten fest, das die gemeldete Stoerung beseitigt:
 * Ein geleertes Zahlenfeld lieferte mit `{ valueAsNumber: true }` NaN, Zod
 * lehnte NaN ab, `handleSubmit` rief `onSubmit` nie auf — und weil unter den
 * Feldern kein Fehltext stand, passierte beim Klick auf "Weiter" sichtbar
 * nichts.
 *
 * Zwei Gruppen von Zusicherungen sind deshalb besonders wichtig und sollten
 * beim Aufraeumen nicht "vereinfacht" werden:
 *
 *   1. NIE NaN. Jede Ausgabe ist entweder eine endliche Zahl oder null. Der
 *      letzte Test in dieser Datei prueft das ueber alle Proben hinweg — wer
 *      `valueAsNumber` zurueckholt oder eine Abkuerzung einbaut, faellt dort
 *      auf.
 *   2. 0 bleibt 0. Eine 0 ist eine Angabe (0 Monate Probezeit, 0 Prozent), kein
 *      leeres Feld. Ein Helfer, der 0 zu null macht, speichert still falsche
 *      Daten — das waere schlimmer als die Blockade, die wir beheben.
 */

import { zahlOderNull, zahlenFeld } from "@/lib/formular-zahlen";

describe("zahlOderNull", () => {
  describe("leere Eingaben werden null (der Kern der Stoerung)", () => {
    it("leerer String wird null statt NaN", () => {
      // Genau dieser Fall: Zahl eintippen, wieder loeschen. `<input
      // type="number">` liefert dann "" als value, `valueAsNumber` lieferte NaN.
      expect(zahlOderNull("")).toBeNull();
    });

    it("null und undefined werden null", () => {
      expect(zahlOderNull(null)).toBeNull();
      expect(zahlOderNull(undefined)).toBeNull();
    });

    it("reiner Leerraum wird null", () => {
      expect(zahlOderNull("   ")).toBeNull();
      expect(zahlOderNull("\t")).toBeNull();
      expect(zahlOderNull("\n  ")).toBeNull();
    });

    it("unbrauchbarer Text wird null", () => {
      expect(zahlOderNull("abc")).toBeNull();
      expect(zahlOderNull("keine Angabe")).toBeNull();
      expect(zahlOderNull("12px")).toBeNull();
      expect(zahlOderNull("-")).toBeNull();
    });
  });

  describe("0 ist eine Angabe, keine Luecke", () => {
    it("'0' wird 0 und NICHT null", () => {
      expect(zahlOderNull("0")).toBe(0);
    });

    it("die Zahl 0 bleibt 0", () => {
      // Schuetzt gegen den Bestandsfehler `(data.feld as number) || null` in
      // handgebauten defaultValues: `0 || null` ist null, ein gespeicherter
      // Wert von 0 verschwaende also beim naechsten Laden des Formulars.
      expect(zahlOderNull(0)).toBe(0);
    });

    it("'0' in allen Schreibweisen bleibt 0", () => {
      expect(zahlOderNull("0.0")).toBe(0);
      expect(zahlOderNull("0,0")).toBe(0);
      expect(zahlOderNull(" 0 ")).toBe(0);
    });
  });

  describe("gueltige Zahlen kommen unveraendert durch", () => {
    it("ganze Zahl als String", () => {
      expect(zahlOderNull("50")).toBe(50);
      expect(zahlOderNull("30")).toBe(30);
      expect(zahlOderNull("100")).toBe(100);
    });

    it("bereits eine Zahl bleibt, was sie ist", () => {
      // Kommt aus defaultValues, aus reset(...) mit Serverdaten und aus
      // Feldern, die frueher mit valueAsNumber registriert waren.
      expect(zahlOderNull(42)).toBe(42);
      expect(zahlOderNull(0.5)).toBe(0.5);
      expect(zahlOderNull(-3)).toBe(-3);
    });

    it("Vorzeichen", () => {
      expect(zahlOderNull("-2")).toBe(-2);
      expect(zahlOderNull("+3")).toBe(3);
    });

    it("Leerzeichen aussen stoeren nicht", () => {
      expect(zahlOderNull(" 50 ")).toBe(50);
      expect(zahlOderNull("\t7\n")).toBe(7);
    });
  });

  describe("deutsches Dezimalkomma", () => {
    it("Punkt und Komma liefern denselben Wert", () => {
      // Ein Feld mit step={0.5} oder step={0.01} (Wochenstunden, EUR-Betraege)
      // laedt foermlich dazu ein, ein Komma zu tippen. Ob der Browser es selbst
      // normalisiert, haengt vom Gebietsschema ab — der Helfer nimmt beides an,
      // damit das Ergebnis nicht vom Browser des Nutzers abhaengt.
      expect(zahlOderNull("0.5")).toBe(0.5);
      expect(zahlOderNull("0,5")).toBe(0.5);
    });

    it("auch bei groesseren Betraegen", () => {
      expect(zahlOderNull("3500,50")).toBe(3500.5);
      expect(zahlOderNull("19,75")).toBe(19.75);
      expect(zahlOderNull(",5")).toBe(0.5);
    });

    it("Tausendertrennung wird bewusst NICHT gelesen", () => {
      // "1.234,56" waere zwar eindeutig, "1.500" allein aber nicht (1,5 oder
      // 1500?). Statt einer Regel, die nur die volle Schreibweise kennt und
      // genau dort inkonsistent waere, gilt durchgaengig: ein Trennzeichen,
      // und das ist das Dezimaltrennzeichen. `<input type="number">` liefert
      // ohnehin nie eine Gruppierung.
      expect(zahlOderNull("1.234,56")).toBeNull();
      expect(zahlOderNull("1,234,56")).toBeNull();
      expect(zahlOderNull("1.5.5")).toBeNull();
    });
  });

  describe("Exponentialschreibweise wird angenommen", () => {
    it("'1e5' wird 100000", () => {
      // Bewusste Entscheidung: "1e5" ist laut HTML-Spezifikation eine gueltige
      // Eingabe fuer <input type="number">, und `valueAsNumber` haette hier
      // ebenfalls 100000 geliefert. Dieser Helfer ERSETZT valueAsNumber und
      // darf nicht strenger werden als die Plattform fuer Eingaben, die die
      // Plattform gueltig nennt — sonst tauschen wir eine stille Blockade gegen
      // eine andere. Unsinnige Groessenordnungen faengt das .max(...) der
      // Zod-Schemas ab, und zwar mit einer sichtbaren Meldung.
      expect(zahlOderNull("1e5")).toBe(100000);
      expect(zahlOderNull("2.5E-3")).toBe(0.0025);
    });
  });

  describe("Sonderformen, die Number() sonst durchliesse", () => {
    it("NaN wird geheilt statt weitergereicht", () => {
      // Der Fall, um den es ueberhaupt geht: Ein NaN aus einem Feld, das noch
      // mit valueAsNumber registriert ist, oder aus alten defaultValues, wird
      // hier zu null — statt die Validierung wortlos scheitern zu lassen.
      expect(zahlOderNull(Number.NaN)).toBeNull();
      expect(zahlOderNull("NaN")).toBeNull();
    });

    it("Infinity wird null", () => {
      // Der gefaehrliche Fall: Infinity ist typeof "number" und kein NaN,
      // kommt also durch z.number() hindurch. Bei einem Feld ohne Obergrenze
      // (z.B. taxAllowance) liefe es bis zu Prisma und faellt erst beim
      // Schreiben in die Float-Spalte um.
      expect(zahlOderNull(Number.POSITIVE_INFINITY)).toBeNull();
      expect(zahlOderNull(Number.NEGATIVE_INFINITY)).toBeNull();
      expect(zahlOderNull("Infinity")).toBeNull();
      expect(zahlOderNull("-Infinity")).toBeNull();
    });

    it("Hex- und andere Zahlenliterale werden null", () => {
      // `Number("0x10")` waere 16 — eine Zahl, die niemand eingegeben hat.
      expect(zahlOderNull("0x10")).toBeNull();
      expect(zahlOderNull("0b101")).toBeNull();
      expect(zahlOderNull("0o17")).toBeNull();
    });

    it("Werte, die weder Zahl noch String sind, werden null", () => {
      // Bewusst nicht ueber Number(): `Number(true)` waere 1 und `Number([])`
      // waere 0 — frei erfundene Werte, und 0 ist in diesen Formularen eine
      // echte Aussage.
      expect(zahlOderNull(true)).toBeNull();
      expect(zahlOderNull(false)).toBeNull();
      expect(zahlOderNull([])).toBeNull();
      expect(zahlOderNull([5])).toBeNull();
      expect(zahlOderNull({})).toBeNull();
    });
  });

  describe("die Zusicherung, auf die es ankommt", () => {
    it("gibt fuer KEINE Eingabe jemals NaN zurueck", () => {
      // Das ist der eigentliche Schutz dieser Datei. Wer `valueAsNumber`
      // zurueckholt oder die Pruefung auf Number.isFinite entfernt, faellt
      // hier auf — und nicht erst im Sekretariat.
      const proben: unknown[] = [
        "", "   ", "abc", "12px", "-", "NaN", "Infinity", "-Infinity",
        "0x10", "1.5.5", "1.234,56", "1 2", null, undefined, true, false,
        [], [5], {}, Number.NaN, Number.POSITIVE_INFINITY,
        "0", "0,0", "50", " 50 ", "0.5", "0,5", "1e5", "-2", "+3", 0, 42, -3,
      ];
      for (const probe of proben) {
        const ergebnis = zahlOderNull(probe);
        expect(Number.isNaN(ergebnis)).toBe(false);
        expect(ergebnis === null || Number.isFinite(ergebnis)).toBe(true);
      }
    });
  });
});

describe("zahlenFeld", () => {
  it("stellt setValueAs bereit — der Ersatz fuer valueAsNumber in register()", () => {
    expect(typeof zahlenFeld.setValueAs).toBe("function");
  });

  it("enthaelt KEIN valueAsNumber", () => {
    // react-hook-form bevorzugt valueAsNumber und ignoriert setValueAs dann
    // stillschweigend. Staende hier beides, waere der ganze Helfer wirkungslos —
    // ohne dass irgendetwas fehlschlaegt.
    expect("valueAsNumber" in zahlenFeld).toBe(false);
    expect("valueAsDate" in zahlenFeld).toBe(false);
  });

  it("verhaelt sich wie zahlOderNull", () => {
    expect(zahlenFeld.setValueAs("")).toBeNull();
    expect(zahlenFeld.setValueAs("0")).toBe(0);
    expect(zahlenFeld.setValueAs("0,5")).toBe(0.5);
    expect(zahlenFeld.setValueAs("50")).toBe(50);
    expect(zahlenFeld.setValueAs("abc")).toBeNull();
  });

  it("laesst sich mit weiteren register-Optionen mischen", () => {
    // Der vorgesehene Aufruf an den Feldern, die zusaetzlich Pflicht sind:
    // register("wochenstunden", { ...zahlenFeld, required: true })
    const optionen = { ...zahlenFeld, required: true };
    expect(optionen.required).toBe(true);
    expect(optionen.setValueAs("")).toBeNull();
  });
});
