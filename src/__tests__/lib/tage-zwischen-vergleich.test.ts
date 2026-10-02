/**
 * VORUEBERGEHEND: Vergleich der bisherigen `tageZwischen`-Schleife mit der
 * direkten Rechnung, bevor die Schleife entfernt wird.
 *
 * Laeuft bewusst MINUTEN: Die alte Fassung kostet unter Jest rund 10 ms je
 * Aufruf, und genau die wird hier zehntausendfach gebraucht. Diese Datei wird
 * mit der alten Fassung zusammen wieder entfernt; was bleibt, sind feste
 * Erwartungswerte in `minijob-fristen.test.ts`.
 */

import { tageImMonat, tageZwischen, tageZwischenAlt } from "@/lib/minijob-fristen";

const MINUTEN = 60_000;
const BEZUG = "2026-10-02";

const zz = (n: number, stellen: number) => String(n).padStart(stellen, "0");
const tag = (j: number, m: number, d: number) => `${zz(j, 4)}-${zz(m, 2)}-${zz(d, 2)}`;

/** Alle Paare, bei denen alt und neu auseinanderliegen — erwartet: keines. */
function abweichungen(paare: Array<[string, string]>): string[] {
  const liste: string[] = [];
  for (const [a, b] of paare) {
    const alt = tageZwischenAlt(a, b);
    const neu = tageZwischen(a, b);
    if (alt !== neu) liste.push(`${a} -> ${b}: alt ${alt}, neu ${neu}`);
  }
  return liste;
}

function alleTage(vonJahr: number, bisJahr: number): string[] {
  const tage: string[] = [];
  for (let j = vonJahr; j <= bisJahr; j++) {
    for (let m = 1; m <= 12; m++) {
      for (let d = 1; d <= tageImMonat(j, m); d++) tage.push(tag(j, m, d));
    }
  }
  return tage;
}

/** Fester Zufall (LCG), damit ein Fehlschlag wiederholbar ist. */
function zufall(saat: number): (bis: number) => number {
  let s = saat >>> 0;
  return (bis) => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s % bis;
  };
}

describe("tageZwischen: direkte Rechnung gegen die bisherige Schleife", () => {
  // Jahrzehnt fuer Jahrzehnt, damit ein Fehlschlag den Zeitraum nennt.
  const jahrzehnte: Array<[number, number]> = [];
  for (let j = 1990; j <= 2100; j += 10) jahrzehnte.push([j, Math.min(j + 9, 2100)]);

  it.each(jahrzehnte)(
    "jeder Tag von %i bis %i gegen den Bezugstag, in beide Richtungen gleich",
    (von, bis) => {
      const tage = alleTage(von, bis);
      // Vorwaerts jeder Tag; rueckwaerts (Vorzeichen) jeder siebte.
      const paare: Array<[string, string]> = tage.map((t) => [BEZUG, t]);
      tage.forEach((t, i) => {
        if (i % 7 === 0) paare.push([t, BEZUG]);
      });
      expect(abweichungen(paare)).toEqual([]);
    },
    20 * MINUTEN
  );

  it("umfasst den ganzen Zeitraum (40.542 Tage)", () => {
    expect(alleTage(1990, 2100)).toHaveLength(40_542);
  });

  it(
    "Stichprobe von 3.000 Paaren zwischen 1900 und 2199",
    () => {
      const w = zufall(20261002);
      const einTag = () => {
        const j = 1900 + w(300);
        const m = 1 + w(12);
        return tag(j, m, 1 + w(tageImMonat(j, m)));
      };
      const paare: Array<[string, string]> = [];
      for (let i = 0; i < 3000; i++) paare.push([einTag(), einTag()]);
      expect(abweichungen(paare)).toEqual([]);
    },
    20 * MINUTEN
  );

  it(
    "Schaltjahrgrenzen: 28.02. bis 01.03. in jedem Jahr von 1890 bis 2110",
    () => {
      const paare: Array<[string, string]> = [];
      for (let j = 1890; j <= 2110; j++) {
        paare.push([tag(j, 2, 28), tag(j, 3, 1)]);
        paare.push([tag(j, 12, 31), tag(j + 1, 1, 1)]);
        paare.push([tag(j, 1, 1), tag(j + 1, 1, 1)]);
      }
      expect(abweichungen(paare)).toEqual([]);
    },
    20 * MINUTEN
  );

  it(
    "auch fuer Zeichenketten, die das Muster annimmt, die aber kein Kalendertag sind",
    () => {
      // Monat 00 und 13–99, Tag 00 und 32–99: Die Schleife rechnete damit
      // einfach weiter (Ueberlauf ins Folgejahr bzw. in den Folgemonat). Kein
      // Aufrufer soll hier ein anderes Ergebnis bekommen als bisher.
      const jahre = [0, 1, 3, 4, 99, 100, 399, 400, 1582, 1899, 1900, 2000, 2026, 2100, 9999];
      const paare: Array<[string, string]> = [];
      for (const j of jahre) {
        for (let m = 0; m <= 99; m++) {
          for (const d of [0, 1, 31, 99]) paare.push([BEZUG, tag(j, m, d)]);
        }
      }
      expect(abweichungen(paare)).toEqual([]);
    },
    30 * MINUTEN
  );

  it("wirft bei allem, was nicht dem Muster entspricht, wie bisher", () => {
    for (const unsinn of ["", "morgen", "2026-1-1", "02.10.2026", "2026-10-02T00:00:00Z", "-001-01-01"]) {
      expect(() => tageZwischenAlt(BEZUG, unsinn)).toThrow("Kein gültiges Datum");
      expect(() => tageZwischen(BEZUG, unsinn)).toThrow("Kein gültiges Datum");
      expect(() => tageZwischen(unsinn, BEZUG)).toThrow("Kein gültiges Datum");
    }
  });
});
