/**
 * Tests fuer src/lib/kalendertag.ts — die neutrale Fassade der Kalendertage
 * (Paket 4 „Unterlagen nachfordern", Feinplanung Abschnitt 7 und 13).
 *
 * Belegt werden die Stellen, an denen eine Frist sonst still einen Tag
 * daneben laege: der Wochentag (das Mockup nannte den 26.09.2026 einen
 * Freitag), „Frist + 14" als Linkende, Berliner Mitternacht gegen die UTC des
 * Containers und die Zeitumstellung am 25.10.2026. Dazu, dass die Fassade
 * wirklich durchreicht und nichts nachbaut.
 */

import * as minijobFristen from "@/lib/minijob-fristen";
import * as dokumentFristen from "@/lib/dokument-fristen";
import {
  WOCHENTAGE,
  ablaufKalendertag,
  berlinerKalendertag,
  formatKalendertag,
  formatKalendertagLang,
  heuteInBerlin,
  istKalendertag,
  kalendertagAlsDatum,
  tageSpaeter,
  tageZwischen,
  wochentagVon,
} from "@/lib/kalendertag";

describe("Wochentag", () => {
  it("der 26.09.2026 ist ein Samstag, kein Freitag (Mockup P:1342)", () => {
    expect(wochentagVon("2026-09-26")).toBe(6);
    expect(formatKalendertagLang("2026-09-26")).toBe("Samstag, 26.09.2026");
  });

  it("die Beispielgeschichte der Mails hat echte Wochentage", () => {
    expect(formatKalendertagLang("2026-09-14")).toBe("Montag, 14.09.2026");
    expect(formatKalendertagLang("2026-09-16")).toBe("Mittwoch, 16.09.2026");
    expect(formatKalendertagLang("2026-09-18")).toBe("Freitag, 18.09.2026");
    expect(formatKalendertagLang("2026-09-21")).toBe("Montag, 21.09.2026");
    expect(formatKalendertagLang("2026-09-25")).toBe("Freitag, 25.09.2026");
    expect(formatKalendertagLang("2026-10-09")).toBe("Freitag, 09.10.2026");
  });

  it("deckt alle sieben Tage einer Woche ab, Sonntag bis Samstag", () => {
    const woche = ["2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26"];
    expect(woche.map((t) => formatKalendertagLang(t).split(",")[0])).toEqual([...WOCHENTAGE]);
  });

  it("stimmt ueber Monats-, Jahres- und Schaltjahresgrenzen", () => {
    expect(formatKalendertagLang("2026-12-31")).toBe("Donnerstag, 31.12.2026");
    expect(formatKalendertagLang("2027-01-01")).toBe("Freitag, 01.01.2027");
    expect(formatKalendertagLang("2028-02-29")).toBe("Dienstag, 29.02.2028");
    expect(formatKalendertagLang("2024-02-29")).toBe("Donnerstag, 29.02.2024");
  });

  it("rechnet ohne Intl und ohne toLocaleDateString", () => {
    // Beides haengt an der ICU-Ausstattung der Laufzeit bzw. an der
    // Spracheinstellung im Browser — der Wochentag einer Frist darf das nicht.
    const intl = jest.spyOn(Intl, "DateTimeFormat");
    const lokal = jest.spyOn(Date.prototype, "toLocaleDateString");
    try {
      formatKalendertagLang("2026-09-25");
      expect(intl).not.toHaveBeenCalled();
      expect(lokal).not.toHaveBeenCalled();
    } finally {
      intl.mockRestore();
      lokal.mockRestore();
    }
  });

  it("zeigt fuer einen ungueltigen oder fehlenden Tag „—“ statt eines erfundenen Datums", () => {
    expect(formatKalendertagLang("2026-02-30")).toBe("—");
    expect(formatKalendertagLang("25.09.2026")).toBe("—");
    expect(formatKalendertagLang(null)).toBe("—");
    expect(formatKalendertagLang(undefined)).toBe("—");
  });
});

describe("Frist + 14 (Linkende)", () => {
  it("die Frist Fr 25.09.2026 plus 14 Tage ist Fr 09.10.2026", () => {
    expect(tageSpaeter("2026-09-25", 14)).toBe("2026-10-09");
    expect(tageZwischen("2026-09-25", "2026-10-09")).toBe(14);
  });

  it("ueber den Monats- und den Jahreswechsel", () => {
    expect(tageSpaeter("2026-12-25", 14)).toBe("2027-01-08");
    expect(tageSpaeter("2028-02-20", 14)).toBe("2028-03-05"); // Schaltjahr
    expect(tageSpaeter("2027-02-20", 14)).toBe("2027-03-06");
  });

  it("rueckwaerts: Frist − 7 fuer die Vorab-Erinnerung", () => {
    expect(tageSpaeter("2026-09-25", -7)).toBe("2026-09-18");
    expect(tageSpaeter("2026-10-03", -7)).toBe("2026-09-26");
  });
});

describe("Berliner Mitternacht gegen UTC", () => {
  it("00:30 Uhr MESZ ist in Berlin schon der naechste Tag, in UTC noch nicht", () => {
    const zeitpunkt = new Date("2026-09-25T22:30:00.000Z"); // 26.09. 00:30 MESZ
    expect(zeitpunkt.toISOString().slice(0, 10)).toBe("2026-09-25");
    expect(heuteInBerlin(zeitpunkt)).toBe("2026-09-26");
    expect(berlinerKalendertag(zeitpunkt)).toBe("2026-09-26");
  });

  it("23:59 Uhr MESZ ist noch derselbe Tag", () => {
    expect(heuteInBerlin(new Date("2026-09-25T21:59:59.000Z"))).toBe("2026-09-25");
  });

  it("im Winter liegt die Grenze eine Stunde spaeter (MEZ, UTC+1)", () => {
    expect(heuteInBerlin(new Date("2026-12-31T22:59:59.000Z"))).toBe("2026-12-31");
    expect(heuteInBerlin(new Date("2026-12-31T23:00:00.000Z"))).toBe("2027-01-01");
  });

  it("eine @db.Date-Spalte (Mitternacht UTC) bleibt ihr eigener Tag, hin und zurueck", () => {
    const spalte = kalendertagAlsDatum("2026-09-25");
    expect(spalte.toISOString()).toBe("2026-09-25T00:00:00.000Z");
    expect(ablaufKalendertag(spalte)).toBe("2026-09-25");
    // Aus JSON kommt dieselbe Spalte als ISO-Zeichenkette.
    expect(ablaufKalendertag(JSON.parse(JSON.stringify(spalte)))).toBe("2026-09-25");
    expect(ablaufKalendertag("2026-09-25")).toBe("2026-09-25");
    expect(ablaufKalendertag(null)).toBeNull();
  });
});

describe("Zeitumstellung am 25.10.2026", () => {
  it("der 25.10. hat 25 Stunden — der Berliner Tag wechselt trotzdem um Mitternacht", () => {
    expect(heuteInBerlin(new Date("2026-10-24T21:59:59.000Z"))).toBe("2026-10-24"); // 23:59 MESZ
    expect(heuteInBerlin(new Date("2026-10-24T22:00:00.000Z"))).toBe("2026-10-25"); // 00:00 MESZ
    expect(heuteInBerlin(new Date("2026-10-25T22:59:59.000Z"))).toBe("2026-10-25"); // 23:59 MEZ
    expect(heuteInBerlin(new Date("2026-10-25T23:00:00.000Z"))).toBe("2026-10-26"); // 00:00 MEZ
  });

  it("Kalendertage zaehlen ueber die Umstellung hinweg ohne Versatz", () => {
    expect(tageSpaeter("2026-10-20", 14)).toBe("2026-11-03");
    expect(tageZwischen("2026-10-24", "2026-10-26")).toBe(2);
    expect(wochentagVon("2026-10-25")).toBe(0);
    expect(formatKalendertagLang("2026-10-26")).toBe("Montag, 26.10.2026");
    // Zum Vergleich die Rechnung, die diese Fassade vermeidet: Zwischen den
    // Berliner Mitternaechten des 24. und des 26.10. liegen 49 Stunden, nicht
    // 48. Wer in Millisekunden rechnet und durch 24 Stunden teilt, bekommt
    // keinen ganzen Tag heraus.
    const mitternacht24 = Date.parse("2026-10-23T22:00:00.000Z"); // 24.10. 00:00 MESZ
    const mitternacht26 = Date.parse("2026-10-25T23:00:00.000Z"); // 26.10. 00:00 MEZ
    expect((mitternacht26 - mitternacht24) / 3_600_000).toBe(49);
    expect(heuteInBerlin(new Date(mitternacht24))).toBe("2026-10-24");
    expect(heuteInBerlin(new Date(mitternacht26))).toBe("2026-10-26");
  });

  it("auch die Umstellung im Maerz (29.03.2026, 23 Stunden)", () => {
    expect(heuteInBerlin(new Date("2026-03-28T22:59:59.000Z"))).toBe("2026-03-28"); // 23:59 MEZ
    expect(heuteInBerlin(new Date("2026-03-28T23:00:00.000Z"))).toBe("2026-03-29"); // 00:00 MEZ
    expect(heuteInBerlin(new Date("2026-03-29T21:59:59.000Z"))).toBe("2026-03-29"); // 23:59 MESZ
    expect(heuteInBerlin(new Date("2026-03-29T22:00:00.000Z"))).toBe("2026-03-30"); // 00:00 MESZ
    expect(tageSpaeter("2026-03-28", 2)).toBe("2026-03-30");
  });
});

describe("TT.MM.JJJJ", () => {
  it("formatiert einen Kalendertag wie minijob-fristen", () => {
    expect(formatKalendertag("2026-09-25")).toBe("25.09.2026");
    expect(formatKalendertag("2027-01-01")).toBe("01.01.2027");
    expect(formatKalendertag(null)).toBe("—");
    expect(formatKalendertag("2026-13-01")).toBe("—");
  });
});

describe("Die Fassade reicht durch und baut nichts nach", () => {
  it("dieselben Funktionen wie in minijob-fristen.ts und dokument-fristen.ts", () => {
    expect(heuteInBerlin).toBe(minijobFristen.heuteInBerlin);
    expect(berlinerKalendertag).toBe(minijobFristen.berlinerKalendertag);
    expect(tageSpaeter).toBe(minijobFristen.tageSpaeter);
    expect(wochentagVon).toBe(minijobFristen.wochentagVon);
    expect(istKalendertag).toBe(minijobFristen.istKalendertag);
    expect(tageZwischen).toBe(minijobFristen.tageZwischen);
    expect(ablaufKalendertag).toBe(dokumentFristen.ablaufKalendertag);
    expect(kalendertagAlsDatum).toBe(dokumentFristen.kalendertagAlsDatum);
  });

  it("istKalendertag lehnt unmoegliche Tage ab", () => {
    expect(istKalendertag("2026-09-25")).toBe(true);
    expect(istKalendertag("2026-02-29")).toBe(false);
    expect(istKalendertag("2028-02-29")).toBe(true);
    expect(istKalendertag("2026-9-25")).toBe(false);
    expect(istKalendertag(20260925)).toBe(false);
  });
});
