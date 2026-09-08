/**
 * Aufteilung des Gehalts auf mehrere Kostenstellen — Pruefregeln und
 * Datenmigration.
 *
 * Der Kern dieser Datei ist die Rundung. „Die Summe muss 100 ergeben" klingt
 * nach einer Zeile Code, und genau die Zeile waere falsch: 33,33 + 33,33 +
 * 33,34 ist als Gleitkommazahl 100.00000000000001. Eine Pruefung auf
 * Gleitkomma-Gleichheit wiese also ausgerechnet die einzig richtige
 * Drittel-Aufteilung ab, und die Person am Bildschirm koennte den Vorgang nicht
 * mehr absenden — ohne zu verstehen, warum.
 *
 * Die Gegenprobe steht ebenfalls hier: Eine Toleranz („plus/minus 0,01 ist in
 * Ordnung") wuerde 33,33 dreimal durchlassen. Dann haetten 0,01 Prozent des
 * Gehalts keine Kostenstelle — unsichtbar, und deshalb schlimmer als eine
 * abgewiesene Eingabe.
 */

import {
  MAX_KOSTENSTELLEN_ZEILEN,
  MAX_KOSTENSTELLE_LAENGE,
  VOLLE_HUNDERT_HUNDERTSTEL,
  hatZuVieleNachkommastellen,
  hundertstel,
  kostenstellenListeSchema,
  kostenstellenZeileSchema,
  prozentText,
  summeHundertstel,
  summenFehler,
  zuDatensatz,
  type KostenstellenZeileEingabe,
} from "@/lib/validations/kostenstellen";

// seed-check.js laeuft im Container als reines JS ohne Datenbank. Dank des
// `require.main === module`-Guards laesst sich die Datei hier laden, ohne dass
// der Entrypoint startet — so wird die Migrationsregel echt geprueft statt per
// Textsuche im Quelltext.
const seedCheck = require("../../../prisma/seed-check.js");

type Altbestand = {
  id: string;
  kostenstelle: string | null;
  kostenstelleAnteil: number | null;
};

const planeKostenstellenZeilen: (datensaetze: Altbestand[]) => {
  zeilen: { supervisorDataId: string; orderIndex: number; bezeichnung: string; anteil: number }[];
  leer: number;
  ohneAnteil: number;
  nichtHundert: number;
} = seedCheck.planeKostenstellenZeilen;

/** Kurzform fuer eine Zeile. */
function zeile(bezeichnung: string, anteil: number) {
  return { bezeichnung, anteil };
}

function meldungen(eingabe: unknown): string[] {
  const ergebnis = kostenstellenListeSchema.safeParse(eingabe);
  return ergebnis.success ? [] : ergebnis.error.issues.map((i) => i.message);
}

function pfade(eingabe: unknown): string[] {
  const ergebnis = kostenstellenListeSchema.safeParse(eingabe);
  return ergebnis.success ? [] : ergebnis.error.issues.map((i) => i.path.join("."));
}

function istGueltig(eingabe: unknown): boolean {
  return kostenstellenListeSchema.safeParse(eingabe).success;
}

// =============================================
// Rundung — der Kern
// =============================================
describe("Summenregel – in ganzen Hundertsteln, ohne Toleranz", () => {
  it("nimmt 33,33 + 33,33 + 33,34 an (die einzig richtige Drittelung)", () => {
    expect(istGueltig([zeile("4711", 33.33), zeile("4712", 33.33), zeile("4713", 33.34)])).toBe(true);
  });

  it("nimmt Aufteilungen an, die eine Gleitkomma-Pruefung abweisen wuerde", () => {
    // Der eigentliche Grund fuer die Rechnung in Hundertsteln. Diese beiden
    // Aufteilungen sind exakt richtig, ihre Gleitkomma-Summe ist es nicht:
    expect(5 + 63.01 + 31.99).toBe(99.99999999999999);
    expect(0.01 + 71.79 + 28.2).toBe(100.00000000000001);

    expect(istGueltig([zeile("A", 5), zeile("B", 63.01), zeile("C", 31.99)])).toBe(true);
    expect(istGueltig([zeile("A", 0.01), zeile("B", 71.79), zeile("C", 28.2)])).toBe(true);
  });

  it("laesst sich vom Schulbuch-Beispiel nicht in die Irre fuehren", () => {
    // Haeufig zitiert, hier aber schlicht falsch: 33,33 + 33,33 + 33,34 ist in
    // JavaScript EXAKT 100. Wer die Rundungsregel daraufhin fuer ueberfluessig
    // haelt, hat die falsche Stichprobe gezogen — siehe den Fall darueber.
    expect(33.33 + 33.33 + 33.34).toBe(100);
  });

  it("weist 33,33 dreimal ab — keine Toleranz", () => {
    const fehler = meldungen([zeile("4711", 33.33), zeile("4712", 33.33), zeile("4713", 33.33)]);
    expect(fehler).toEqual([
      "Die Anteile ergeben zusammen 99,99 %. Es fehlen 0,01 % auf 100 %.",
    ]);
  });

  it("nennt bei Ueberschreitung den Ueberhang", () => {
    expect(meldungen([zeile("4711", 60), zeile("4712", 50)])).toEqual([
      "Die Anteile ergeben zusammen 110,00 %. Das sind 10,00 % zu viel.",
    ]);
  });

  it("stoert sich nicht an einer unglatten Zwischensumme", () => {
    // 0.1 + 0.2 ist 0.30000000000000004 — der Klassiker. Weil jede Zeile
    // EINZELN auf Hundertstel gerundet wird, entsteht der Fehler gar nicht
    // erst: 10 + 20 + 9970 = 10000.
    expect(0.1 + 0.2).toBe(0.30000000000000004);
    expect(istGueltig([zeile("A", 0.1), zeile("B", 0.2), zeile("C", 99.7)])).toBe(true);
  });

  it("nimmt eine einzelne Kostenstelle mit 100 an", () => {
    expect(istGueltig([zeile("4711", 100)])).toBe(true);
  });

  it("weist eine einzelne Kostenstelle mit 60 ab", () => {
    expect(meldungen([zeile("4711", 60)])).toEqual([
      "Die Anteile ergeben zusammen 60,00 %. Es fehlen 40,00 % auf 100 %.",
    ]);
  });

  it("haengt die Summenmeldung an die Liste, nicht an eine Zeile", () => {
    // Der leere Pfad wird in der Fehlerbox zu `kostenstellen` und damit zur
    // Beschriftung "Kostenstellen-Aufteilung". Haenge sie jemand an Zeile 0,
    // stuende die Meldung unter einer beliebigen Zeile.
    expect(pfade([zeile("4711", 60)])).toEqual([""]);
  });

  it("laesst die leere Liste zu — null Zeilen bleiben erlaubt", () => {
    expect(istGueltig([])).toBe(true);
    expect(summenFehler([])).toBeNull();
  });
});

describe("Nachkommastellen", () => {
  it("weist drei Nachkommastellen ab", () => {
    const fehler = meldungen([zeile("4711", 33.335), zeile("4712", 66.665)]);
    expect(fehler).toContain("Bitte höchstens zwei Nachkommastellen angeben.");
  });

  it("meldet die betroffene Zeile, nicht die Liste", () => {
    expect(pfade([zeile("4711", 50), zeile("4712", 50.005)])).toEqual(["1.anteil"]);
  });

  it("unterdrueckt die Summenmeldung, solange eine Zeile zu genau ist", () => {
    // Zuerst die Zeile in Ordnung bringen; eine zusaetzliche Summenmeldung
    // waere nur Rauschen, weil sich die Summe damit ohnehin aendert.
    const fehler = meldungen([zeile("4711", 0.005)]);
    expect(fehler).toEqual(["Bitte höchstens zwei Nachkommastellen angeben."]);
  });

  it("haelt 0,07 fuer sauber, obwohl 0,07 * 100 nicht glatt ist", () => {
    // Genau der Fall, an dem `Number.isInteger(anteil * 100)` scheitern wuerde.
    expect(0.07 * 100).toBe(7.000000000000001);
    expect(hatZuVieleNachkommastellen(0.07)).toBe(false);
    expect(hatZuVieleNachkommastellen(33.33)).toBe(false);
    expect(hatZuVieleNachkommastellen(99.99)).toBe(false);
    expect(hatZuVieleNachkommastellen(0)).toBe(false);
    expect(hatZuVieleNachkommastellen(100)).toBe(false);
    expect(hatZuVieleNachkommastellen(33.335)).toBe(true);
    expect(hatZuVieleNachkommastellen(1.005)).toBe(true);
  });
});

// =============================================
// Zeilen
// =============================================
describe("Zeilen – Bezeichnung und Anteil", () => {
  it("verlangt eine Bezeichnung", () => {
    expect(meldungen([zeile("", 100)])).toEqual(["Bitte die Kostenstelle angeben."]);
    expect(meldungen([zeile("   ", 100)])).toEqual(["Bitte die Kostenstelle angeben."]);
  });

  it("meldet bei zwei Leerzeilen nur das fehlende Feld, keine Doppelung", () => {
    // Frisch angelegte Leerzeilen sind der Regelfall in der Maske. Wer dort
    // zusaetzlich "ist bereits in Zeile 1 eingetragen" und eine Summenmeldung
    // liest, sucht den Fehler an der falschen Stelle.
    const fehler = meldungen([zeile("", 50), zeile("", 50)]);
    expect(fehler).toEqual([
      "Bitte die Kostenstelle angeben.",
      "Bitte die Kostenstelle angeben.",
    ]);
  });

  it("begrenzt die Bezeichnung auf 100 Zeichen", () => {
    expect(istGueltig([zeile("x".repeat(MAX_KOSTENSTELLE_LAENGE), 100)])).toBe(true);
    expect(meldungen([zeile("x".repeat(MAX_KOSTENSTELLE_LAENGE + 1), 100)])).toContain(
      "Bitte höchstens 100 Zeichen."
    );
  });

  it("trimmt die Bezeichnung", () => {
    const ergebnis = kostenstellenListeSchema.parse([zeile("  4711  ", 100)]);
    expect(ergebnis[0].bezeichnung).toBe("4711");
  });

  it("verlangt einen Prozentsatz und meldet deutsch", () => {
    // `zahlOderNull` macht aus einem geleerten Zahlenfeld null — nicht NaN,
    // nicht "". Genau dieser Wert muss hier ankommen.
    expect(meldungen([{ bezeichnung: "4711", anteil: null }])).toEqual([
      "Bitte einen Prozentsatz eingeben.",
    ]);
    expect(meldungen([{ bezeichnung: "4711" }])).toEqual([
      "Bitte einen Prozentsatz eingeben.",
    ]);
  });

  it("weist negative Anteile und Anteile ueber 100 ab", () => {
    expect(meldungen([zeile("4711", -1), zeile("4712", 101)])).toEqual([
      "Der Anteil kann nicht negativ sein.",
      "Der Anteil kann höchstens 100 Prozent betragen.",
    ]);
  });

  it("haengt bei kaputter Zeile keine Summenmeldung an", () => {
    // Zod bricht die Liste ab, sobald eine Zeile im Typ scheitert — das
    // `superRefine` laeuft dann gar nicht erst. Wer das aendert, bekommt neben
    // "Bitte einen Prozentsatz eingeben." auch noch eine Summenmeldung.
    expect(meldungen([{ bezeichnung: "4711", anteil: null }])).toHaveLength(1);
  });
});

describe("Doppelte Kostenstellen", () => {
  it("weist dieselbe Bezeichnung zweimal ab", () => {
    expect(meldungen([zeile("4711", 50), zeile("4711", 50)])).toEqual([
      "Die Kostenstelle „4711“ ist bereits in Zeile 1 eingetragen.",
    ]);
  });

  it("vergleicht ohne Ruecksicht auf Gross-/Kleinschreibung und Leerraum", () => {
    expect(istGueltig([zeile("Verwaltung", 50), zeile("  verwaltung ", 50)])).toBe(false);
  });

  it("meldet die spaetere Zeile, nicht die erste", () => {
    expect(pfade([zeile("4711", 50), zeile("4711", 50)])).toEqual(["1.bezeichnung"]);
  });

  it("laesst verschiedene Kostenstellen zu", () => {
    expect(istGueltig([zeile("4711", 50), zeile("4712", 50)])).toBe(true);
  });
});

describe("Obergrenze der Zeilen", () => {
  it("nimmt genau MAX_KOSTENSTELLEN_ZEILEN Zeilen an", () => {
    const zeilen = Array.from({ length: MAX_KOSTENSTELLEN_ZEILEN }, (_, i) =>
      zeile("KST-" + i, 100 / MAX_KOSTENSTELLEN_ZEILEN)
    );
    expect(istGueltig(zeilen)).toBe(true);
  });

  it("weist eine Zeile mehr ab — und nennt dann nur diesen einen Grund", () => {
    const zeilen = Array.from({ length: MAX_KOSTENSTELLEN_ZEILEN + 1 }, (_, i) =>
      zeile("KST-" + i, 1)
    );
    // Die Summe stimmt hier absichtlich auch nicht. Trotzdem darf nur die
    // Obergrenze gemeldet werden: Zuerst sind Zeilen zu entfernen.
    expect(meldungen(zeilen)).toEqual(["Es sind höchstens 20 Kostenstellen möglich."]);
  });

  it("nennt die Obergrenze im Meldungstext — sie darf nicht auseinanderlaufen", () => {
    const zeilen = Array.from({ length: MAX_KOSTENSTELLEN_ZEILEN + 1 }, () => zeile("x", 1));
    expect(meldungen(zeilen)[0]).toContain(String(MAX_KOSTENSTELLEN_ZEILEN));
  });
});

// =============================================
// Reine Rechenfunktionen
// =============================================
describe("Hundertstel-Rechnung", () => {
  it("rechnet in ganzen Hundertsteln", () => {
    expect(hundertstel(33.33)).toBe(3333);
    expect(hundertstel(33.34)).toBe(3334);
    expect(hundertstel(100)).toBe(10000);
    expect(hundertstel(0)).toBe(0);
  });

  it("summiert punktgenau", () => {
    expect(summeHundertstel([zeile("a", 33.33), zeile("b", 33.33), zeile("c", 33.34)])).toBe(
      VOLLE_HUNDERT_HUNDERTSTEL
    );
    expect(summeHundertstel([])).toBe(0);
  });

  it("schreibt Hundertstel deutsch", () => {
    expect(prozentText(10000)).toBe("100,00");
    expect(prozentText(9999)).toBe("99,99");
    expect(prozentText(1)).toBe("0,01");
    expect(prozentText(0)).toBe("0,00");
    expect(prozentText(1050)).toBe("10,50");
    expect(prozentText(-1)).toBe("-0,01");
  });
});

describe("zuDatensatz", () => {
  it("baut die Prisma-Form mit Reihenfolge", () => {
    const gueltig: KostenstellenZeileEingabe = kostenstellenZeileSchema.parse(
      zeile(" 4711 ", 60)
    );
    expect(zuDatensatz(gueltig, "sd-1", 2)).toEqual({
      supervisorDataId: "sd-1",
      orderIndex: 2,
      bezeichnung: "4711",
      anteil: 60,
    });
  });
});

// =============================================
// Deutsche Meldungen
// =============================================
describe("Alle Meldungen sind deutsch", () => {
  it("laesst keine Zod-Standardmeldung durchschlagen", () => {
    const faelle: unknown[] = [
      [zeile("", 100)],
      [{ bezeichnung: "4711", anteil: null }],
      [{ bezeichnung: 42, anteil: 100 }],
      [zeile("4711", -1)],
      [zeile("4711", 101)],
      [zeile("4711", 33.335)],
      [zeile("4711", 50), zeile("4711", 50)],
      [zeile("4711", 60)],
      [zeile("x".repeat(101), 100)],
      Array.from({ length: MAX_KOSTENSTELLEN_ZEILEN + 1 }, (_, i) => zeile("K" + i, 1)),
    ];

    for (const fall of faelle) {
      const texte = meldungen(fall);
      expect(texte.length).toBeGreaterThan(0);
      for (const text of texte) {
        expect(text).not.toMatch(
          /Expected|Required|Invalid|must contain|Array must|Number must|String must/
        );
        expect(text).toMatch(/[.]$/);
      }
    }
  });
});

// =============================================
// Einmalige Datenmigration KOSTENSTELLEN_AUFTEILUNG_V1
// =============================================
describe("Migration – Altbestand in die Aufteilung ueberfuehren", () => {
  it("haelt dieselbe Laengengrenze wie die Pruefdatei", () => {
    expect(seedCheck.KOSTENSTELLE_MAX_LAENGE).toBe(MAX_KOSTENSTELLE_LAENGE);
  });

  it("traegt den vereinbarten Merkernamen", () => {
    expect(seedCheck.KOSTENSTELLEN_MARKER).toBe("KOSTENSTELLEN_AUFTEILUNG_V1");
  });

  it("setzt eine Kostenstelle OHNE Anteil auf 100", () => {
    const { zeilen, ohneAnteil, nichtHundert } = planeKostenstellenZeilen([
      { id: "sd-1", kostenstelle: "4711", kostenstelleAnteil: null },
    ]);
    expect(zeilen).toEqual([
      { supervisorDataId: "sd-1", orderIndex: 0, bezeichnung: "4711", anteil: 100 },
    ]);
    expect(ohneAnteil).toBe(1);
    expect(nichtHundert).toBe(0);
  });

  it("uebernimmt einen hinterlegten Anteil UNVERAENDERT, auch wenn er nicht 100 ist", () => {
    // Die Zahl stammt von einem Menschen. Sie stillschweigend auf 100 zu heben
    // waere eine gefaelschte Buchungsanweisung — die Luecke wird stattdessen
    // gezaehlt und in der Maske sichtbar.
    const { zeilen, ohneAnteil, nichtHundert } = planeKostenstellenZeilen([
      { id: "sd-1", kostenstelle: "4711", kostenstelleAnteil: 60 },
    ]);
    expect(zeilen[0].anteil).toBe(60);
    expect(ohneAnteil).toBe(0);
    expect(nichtHundert).toBe(1);
  });

  it("behaelt auch eine eingetragene 0 bei", () => {
    // Ein GELEERTES Zahlenfeld wird zu null (src/lib/formular-zahlen.ts).
    // Eine gespeicherte 0 hat also jemand getippt und gemeint.
    const { zeilen, ohneAnteil, nichtHundert } = planeKostenstellenZeilen([
      { id: "sd-1", kostenstelle: "4711", kostenstelleAnteil: 0 },
    ]);
    expect(zeilen[0].anteil).toBe(0);
    expect(ohneAnteil).toBe(0);
    expect(nichtHundert).toBe(1);
  });

  it("zaehlt einen vorhandenen Anteil von 100 als in Ordnung", () => {
    const { ohneAnteil, nichtHundert } = planeKostenstellenZeilen([
      { id: "sd-1", kostenstelle: "4711", kostenstelleAnteil: 100 },
    ]);
    expect(ohneAnteil).toBe(0);
    expect(nichtHundert).toBe(0);
  });

  it("ueberspringt leere und nur aus Leerraum bestehende Bezeichnungen", () => {
    const { zeilen, leer } = planeKostenstellenZeilen([
      { id: "sd-1", kostenstelle: "   ", kostenstelleAnteil: 100 },
      { id: "sd-2", kostenstelle: "", kostenstelleAnteil: null },
      { id: "sd-3", kostenstelle: null, kostenstelleAnteil: 100 },
      { id: "sd-4", kostenstelle: "4711", kostenstelleAnteil: 100 },
    ]);
    expect(zeilen.map((z) => z.supervisorDataId)).toEqual(["sd-4"]);
    expect(leer).toBe(3);
  });

  it("trimmt und kuerzt die Bezeichnung auf die Spaltenlaenge", () => {
    const { zeilen } = planeKostenstellenZeilen([
      { id: "sd-1", kostenstelle: "  4711  ", kostenstelleAnteil: 100 },
      { id: "sd-2", kostenstelle: "x".repeat(150), kostenstelleAnteil: 100 },
    ]);
    expect(zeilen[0].bezeichnung).toBe("4711");
    expect(zeilen[1].bezeichnung).toHaveLength(MAX_KOSTENSTELLE_LAENGE);
  });

  it("legt jede Zeile als erste Zeile ihres Vorgangs an", () => {
    const { zeilen } = planeKostenstellenZeilen([
      { id: "sd-1", kostenstelle: "4711", kostenstelleAnteil: 100 },
      { id: "sd-2", kostenstelle: "4712", kostenstelleAnteil: null },
    ]);
    expect(zeilen.every((z) => z.orderIndex === 0)).toBe(true);
  });

  it("erzeugt aus dem Regelfall eine Aufteilung, die die neue Pruefung besteht", () => {
    // Die eigentliche Zusage der Migration: Wer eine gepflegte Kostenstelle
    // hatte, kann den Vorgang danach ohne Nacharbeit absenden.
    const { zeilen } = planeKostenstellenZeilen([
      { id: "sd-1", kostenstelle: "4711", kostenstelleAnteil: null },
      { id: "sd-2", kostenstelle: "4712", kostenstelleAnteil: 100 },
    ]);
    for (const z of zeilen) {
      expect(istGueltig([{ bezeichnung: z.bezeichnung, anteil: z.anteil }])).toBe(true);
    }
  });
});
