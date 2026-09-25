/**
 * Tests: Ablauf-Ampel fuer befristete Nachweise (src/lib/dokument-fristen.ts).
 *
 * Geprueft wird vor allem das, was in einer Fristenrechnung teuer ist und beim
 * Lesen richtig aussieht:
 * - Der Ablauftag selbst gilt noch (0 Tage ist NICHT abgelaufen).
 * - Ein reines Datum steht auf Mitternacht UTC; westlich von Greenwich kippt
 *   der Tag, wenn jemand die Ortszeit liest.
 * - Der heutige Tag kommt aus Europe/Berlin, nicht aus UTC (der Container
 *   laeuft in UTC, zwischen Mitternacht und 2 Uhr waere es der Vortag).
 * - Schaltjahre.
 * - Kein Datum heisst KEINE Stufe — nicht "abgelaufen".
 */

import {
  ABLAUF_ERINNERUNG_INTERVALL_TAGE,
  ABLAUF_KATEGORIE_META,
  ABLAUF_SCHWELLEN_TAGE,
  FRISTPFLICHTIGE_DOKUMENTTYPEN,
  ablaufAmpel,
  ablaufKalendertag,
  dringendeNachweisLagen,
  getAblaufKategorie,
  istAbgelaufen,
  istFristpflichtig,
  kalendertagAlsDatum,
  nachweisLagen,
  tageBisAblauf,
  type AblaufKategorie,
} from "@/lib/dokument-fristen";
import { tageSpaeter } from "@/lib/minijob-fristen";

/** Referenzzeitpunkt: 08.09.2026, 09:00 UTC — in Berlin derselbe Kalendertag. */
const JETZT = new Date("2026-09-08T09:00:00.000Z");
const HEUTE = "2026-09-08";

/** Ein Ablaufdatum, das n Tage nach dem Referenztag liegt (n darf negativ sein). */
const ablaufIn = (n: number): Date => kalendertagAlsDatum(tageSpaeter(HEUTE, n));

const ALLE_KATEGORIEN: AblaufKategorie[] = [
  "ABGELAUFEN",
  "KRITISCH",
  "WARNUNG",
  "BEOBACHTEN",
  "AUSSERHALB",
];

describe("Ablauf-Ampel: Tage bis zum Ablauf", () => {
  it("zaehlt Kalendertage, negativ nach dem Ablauf", () => {
    expect(tageBisAblauf(ablaufIn(0), JETZT)).toBe(0);
    expect(tageBisAblauf(ablaufIn(1), JETZT)).toBe(1);
    expect(tageBisAblauf(ablaufIn(90), JETZT)).toBe(90);
    expect(tageBisAblauf(ablaufIn(-1), JETZT)).toBe(-1);
    expect(tageBisAblauf(ablaufIn(-30), JETZT)).toBe(-30);
  });

  it("liefert ohne Ablaufdatum null — und nicht 0", () => {
    expect(tageBisAblauf(null, JETZT)).toBeNull();
    expect(tageBisAblauf(undefined, JETZT)).toBeNull();
    expect(tageBisAblauf("", JETZT)).toBeNull();
  });

  it("nimmt auch die Zeichenketten entgegen, die durch JSON gelaufen sind", () => {
    expect(tageBisAblauf("2026-09-09", JETZT)).toBe(1);
    expect(tageBisAblauf("2026-09-09T00:00:00.000Z", JETZT)).toBe(1);
  });

  it("gibt bei unlesbaren Werten null zurueck, statt zu werfen", () => {
    // Ein kaputter Wert in einem Dokument darf weder die Liste noch den Cron
    // anhalten.
    expect(tageBisAblauf("morgen", JETZT)).toBeNull();
    expect(tageBisAblauf("2026-02-30", JETZT)).toBeNull();
    expect(tageBisAblauf(new Date("Unsinn"), JETZT)).toBeNull();
  });
});

describe("Ablauf-Ampel: Stufen", () => {
  it("haelt den Ablauftag selbst noch fuer gueltig", () => {
    // Der wichtigste Grenzfall des Moduls: Am Ablauftag darf gearbeitet
    // werden, am Tag danach nicht.
    expect(getAblaufKategorie(ablaufIn(0), JETZT)).toBe("KRITISCH");
    expect(istAbgelaufen(ablaufIn(0), JETZT)).toBe(false);
    expect(getAblaufKategorie(ablaufIn(-1), JETZT)).toBe("ABGELAUFEN");
    expect(istAbgelaufen(ablaufIn(-1), JETZT)).toBe(true);
  });

  it("staffelt nach 14 / 42 / 90 Tagen — an den Grenzen geprueft", () => {
    expect(getAblaufKategorie(ablaufIn(0), JETZT)).toBe("KRITISCH");
    expect(getAblaufKategorie(ablaufIn(14), JETZT)).toBe("KRITISCH");
    expect(getAblaufKategorie(ablaufIn(15), JETZT)).toBe("WARNUNG");
    expect(getAblaufKategorie(ablaufIn(42), JETZT)).toBe("WARNUNG");
    expect(getAblaufKategorie(ablaufIn(43), JETZT)).toBe("BEOBACHTEN");
    expect(getAblaufKategorie(ablaufIn(90), JETZT)).toBe("BEOBACHTEN");
    expect(getAblaufKategorie(ablaufIn(91), JETZT)).toBe("AUSSERHALB");
    expect(getAblaufKategorie(ablaufIn(400), JETZT)).toBe("AUSSERHALB");
  });

  it("kennt ohne Ablaufdatum KEINE Stufe", () => {
    // Ein Dokument ohne Frist ist nicht abgelaufen — es hat einfach keine.
    expect(getAblaufKategorie(null, JETZT)).toBeNull();
    expect(getAblaufKategorie(undefined, JETZT)).toBeNull();
    expect(istAbgelaufen(null, JETZT)).toBe(false);
  });

  it("haelt die Schwellen mit den Stufen zusammen", () => {
    expect(getAblaufKategorie(ablaufIn(ABLAUF_SCHWELLEN_TAGE.KRITISCH), JETZT)).toBe("KRITISCH");
    expect(getAblaufKategorie(ablaufIn(ABLAUF_SCHWELLEN_TAGE.WARNUNG), JETZT)).toBe("WARNUNG");
    expect(getAblaufKategorie(ablaufIn(ABLAUF_SCHWELLEN_TAGE.BEOBACHTEN), JETZT)).toBe(
      "BEOBACHTEN"
    );
  });
});

describe("Ablauf-Ampel: Zeitzonen", () => {
  it("liest ein reines Datum als UTC-Tag, unabhaengig von der Zeitzone des Servers", () => {
    // Prisma liefert eine @db.Date-Spalte als Mitternacht UTC. Wer daraus mit
    // getFullYear()/getMonth()/getDate() einen Tag baut, liest die Ortszeit —
    // westlich von Greenwich ist das der Vortag. Der TZ-Wechsel macht den
    // Fehler hier reproduzierbar; auf einem Rechner oestlich von Greenwich
    // haelt die Zusicherung ohnehin.
    const alt = process.env.TZ;
    try {
      process.env.TZ = "America/Los_Angeles";
      expect(ablaufKalendertag(new Date("2027-03-01T00:00:00.000Z"))).toBe("2027-03-01");
      expect(tageBisAblauf(new Date("2026-09-09T00:00:00.000Z"), JETZT)).toBe(1);
    } finally {
      process.env.TZ = alt;
    }
  });

  it("bestimmt den heutigen Tag in Europe/Berlin, nicht in UTC (Sommerzeit)", () => {
    // 08.09.2026, 22:30 UTC ist in Berlin (MESZ, UTC+2) bereits der 09.09.
    const kurzNachMitternachtInBerlin = new Date("2026-09-08T22:30:00.000Z");
    expect(tageBisAblauf("2026-09-09", kurzNachMitternachtInBerlin)).toBe(0);
    expect(getAblaufKategorie("2026-09-09", kurzNachMitternachtInBerlin)).toBe("KRITISCH");
    // ... und der Vortag ist damit abgelaufen.
    expect(tageBisAblauf("2026-09-08", kurzNachMitternachtInBerlin)).toBe(-1);
    expect(istAbgelaufen("2026-09-08", kurzNachMitternachtInBerlin)).toBe(true);
  });

  it("bestimmt den heutigen Tag auch in der Winterzeit in Europe/Berlin", () => {
    // 15.01.2026, 23:30 UTC ist in Berlin (MEZ, UTC+1) bereits der 16.01.
    const winter = new Date("2026-01-15T23:30:00.000Z");
    expect(tageBisAblauf("2026-01-16", winter)).toBe(0);
    expect(tageBisAblauf("2026-01-17", winter)).toBe(1);
  });

  it("schreibt einen Kalendertag als Mitternacht UTC zurueck", () => {
    // Der Spiegelfehler beim Speichern: new Date(2027, 2, 1) stuende auf
    // Mitternacht Ortszeit und landete oestlich von Greenwich als 28.02. in
    // der date-Spalte.
    const wert = kalendertagAlsDatum("2027-03-01");
    expect(wert.toISOString()).toBe("2027-03-01T00:00:00.000Z");
    expect(ablaufKalendertag(wert)).toBe("2027-03-01");
    expect(() => kalendertagAlsDatum("2027-02-30")).toThrow();
  });
});

describe("Ablauf-Ampel: Schaltjahre", () => {
  it("zaehlt den 29. Februar mit", () => {
    const imSchaltjahr = new Date("2028-02-27T12:00:00.000Z");
    expect(tageBisAblauf("2028-03-01", imSchaltjahr)).toBe(3);

    const ohneSchaltjahr = new Date("2027-02-27T12:00:00.000Z");
    expect(tageBisAblauf("2027-03-01", ohneSchaltjahr)).toBe(2);
  });

  it("kommt mit einem Ablauf am 29. Februar zurecht", () => {
    const vortag = new Date("2028-02-28T12:00:00.000Z");
    expect(tageBisAblauf("2028-02-29", vortag)).toBe(1);
    expect(getAblaufKategorie("2028-02-29", vortag)).toBe("KRITISCH");
    expect(istAbgelaufen("2028-02-29", new Date("2028-03-01T12:00:00.000Z"))).toBe(true);
  });

  it("rechnet ueber den Jahreswechsel", () => {
    expect(tageBisAblauf("2027-01-01", new Date("2026-12-31T12:00:00.000Z"))).toBe(1);
    expect(tageBisAblauf("2026-12-31", new Date("2027-01-01T12:00:00.000Z"))).toBe(-1);
  });
});

describe("Ablauf-Ampel: Text fuer die Oberflaeche", () => {
  it("sagt am Ablauftag, dass der Nachweis heute noch gilt", () => {
    const ampel = ablaufAmpel(ablaufIn(0), JETZT);
    expect(ampel.kategorie).toBe("KRITISCH");
    expect(ampel.tage).toBe(0);
    expect(ampel.text).toBe("Läuft heute ab (08.09.2026)");
  });

  it("zaehlt nach dem Ablauf die Tage — im Singular wie im Plural", () => {
    expect(ablaufAmpel(ablaufIn(-1), JETZT).text).toBe("Abgelaufen seit 1 Tag (07.09.2026)");
    expect(ablaufAmpel(ablaufIn(-5), JETZT).text).toBe("Abgelaufen seit 5 Tagen (03.09.2026)");
    expect(ablaufAmpel(ablaufIn(1), JETZT).text).toBe("Läuft in 1 Tag ab (09.09.2026)");
    expect(ablaufAmpel(ablaufIn(30), JETZT).text).toBe("Läuft in 30 Tagen ab (08.10.2026)");
  });

  it("bleibt ohne Ablaufdatum sprachlos statt alarmierend", () => {
    const ampel = ablaufAmpel(null, JETZT);
    expect(ampel.kategorie).toBeNull();
    expect(ampel.tage).toBeNull();
    expect(ampel.text).toBe("Keine Frist erfasst");
  });
});

describe("Ablauf-Ampel: Stammdaten der Stufen", () => {
  it("hat zu jeder Stufe Anzeige und Erinnerungsintervall", () => {
    for (const kategorie of ALLE_KATEGORIEN) {
      expect(ABLAUF_KATEGORIE_META[kategorie]?.label).toBeTruthy();
      expect(ABLAUF_KATEGORIE_META[kategorie]?.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(ABLAUF_KATEGORIE_META[kategorie]?.bg).toMatch(/^#[0-9a-f]{6}$/i);
      expect(kategorie in ABLAUF_ERINNERUNG_INTERVALL_TAGE).toBe(true);
    }
  });

  it("erinnert in abnehmenden Abstaenden und ausserhalb gar nicht", () => {
    const beobachten = ABLAUF_ERINNERUNG_INTERVALL_TAGE.BEOBACHTEN!;
    const warnung = ABLAUF_ERINNERUNG_INTERVALL_TAGE.WARNUNG!;
    const kritisch = ABLAUF_ERINNERUNG_INTERVALL_TAGE.KRITISCH!;
    expect(beobachten).toBeGreaterThan(warnung);
    expect(warnung).toBeGreaterThan(kritisch);
    expect(ABLAUF_ERINNERUNG_INTERVALL_TAGE.ABGELAUFEN).toBe(kritisch);
    expect(ABLAUF_ERINNERUNG_INTERVALL_TAGE.AUSSERHALB).toBeNull();
  });
});

describe("Ablauf-Ampel: fristpflichtige Dokumenttypen", () => {
  it("kennt genau die beiden befristeten Nachweise", () => {
    expect(FRISTPFLICHTIGE_DOKUMENTTYPEN).toEqual(["AUFENTHALTSTITEL", "ARBEITSERLAUBNIS"]);
    expect(istFristpflichtig("AUFENTHALTSTITEL")).toBe(true);
    expect(istFristpflichtig("ARBEITSERLAUBNIS")).toBe(true);
  });

  it("haelt den PKV-Nachweis ausdruecklich fuer unbefristet", () => {
    // Eine private Krankenversicherung laeuft nicht an einem Stichtag ab.
    expect(istFristpflichtig("PKV_NACHWEIS")).toBe(false);
    expect(istFristpflichtig("MASERNSCHUTZ")).toBe(false);
    expect(istFristpflichtig(null)).toBe(false);
    expect(istFristpflichtig(undefined)).toBe(false);
  });
});

// =============================================
// Lage je Nachweisart
// =============================================

/** Ein hochgeladenes Papier, so wie es die Detailseite fuehrt. */
const dok = (type: string, gueltigBis: Date | string | null) => ({ type, gueltigBis });

describe("Lage je Nachweisart", () => {
  it("nimmt je Art das Papier mit dem SPAETESTEN Ablauf", () => {
    // Wer verlaengert, laedt den neuen Titel dazu — der alte bleibt liegen.
    // Zaehlte der aelteste, schriee der Vorgang fuer immer "abgelaufen".
    const lagen = nachweisLagen(
      [
        dok("AUFENTHALTSTITEL", ablaufIn(-30)),
        dok("AUFENTHALTSTITEL", ablaufIn(500)),
      ],
      JETZT
    );
    expect(lagen).toHaveLength(1);
    expect(lagen[0].ampel?.kategorie).toBe("AUSSERHALB");
    expect(dringendeNachweisLagen(
      [dok("AUFENTHALTSTITEL", ablaufIn(-30)), dok("AUFENTHALTSTITEL", ablaufIn(500))],
      JETZT
    )).toHaveLength(0);
  });

  it("laesst ein Papier ohne Datum keines mit Datum verdraengen", () => {
    // Die Rueckseite ohne nachgetragenes Datum beweist nichts — sie darf aber
    // auch die Frist der Vorderseite nicht loeschen.
    const lagen = nachweisLagen(
      [dok("AUFENTHALTSTITEL", ablaufIn(-5)), dok("AUFENTHALTSTITEL", null)],
      JETZT
    );
    expect(lagen[0].ampel?.kategorie).toBe("ABGELAUFEN");
    expect(dringendeNachweisLagen(
      [dok("AUFENTHALTSTITEL", ablaufIn(-5)), dok("AUFENTHALTSTITEL", null)],
      JETZT
    )).toHaveLength(1);
  });

  it("ignoriert Dokumentarten ohne Frist", () => {
    expect(nachweisLagen([dok("MASERNSCHUTZ", null), dok("SONSTIGES", ablaufIn(-1))], JETZT))
      .toHaveLength(0);
  });
});

describe("Lage je Nachweisart: Kennzeichen „unbefristet“ (Paket 4, Z1)", () => {
  /** Ein ausdruecklich unbefristetes Papier, etwa die Niederlassungserlaubnis. */
  const unbefristet = (type: string) => ({ type, gueltigBis: null, unbefristet: true });

  it("verdraengt einen abgelaufenen Titel — die Art ist erledigt", () => {
    // Der wichtigste Fall: Niederlassungserlaubnis nach einem abgelaufenen
    // Titel. Ohne Kennzeichen bliebe der alte Titel massgeblich, der rote
    // Balken stuende weiter.
    const dokumente = [dok("AUFENTHALTSTITEL", ablaufIn(-40)), unbefristet("AUFENTHALTSTITEL")];
    expect(nachweisLagen(dokumente, JETZT)).toEqual([
      { typ: "AUFENTHALTSTITEL", ampel: null, unbefristet: true },
    ]);
    expect(dringendeNachweisLagen(dokumente, JETZT)).toEqual([]);
  });

  it("verdraengt auch ein kritisches und ein noch gueltiges Datum, gleich in welcher Reihenfolge", () => {
    for (const dokumente of [
      [unbefristet("AUFENTHALTSTITEL"), dok("AUFENTHALTSTITEL", ablaufIn(3))],
      [dok("AUFENTHALTSTITEL", ablaufIn(3)), unbefristet("AUFENTHALTSTITEL")],
      [dok("AUFENTHALTSTITEL", ablaufIn(500)), unbefristet("AUFENTHALTSTITEL"), dok("AUFENTHALTSTITEL", null)],
    ]) {
      expect(nachweisLagen(dokumente, JETZT)).toEqual([
        { typ: "AUFENTHALTSTITEL", ampel: null, unbefristet: true },
      ]);
      expect(dringendeNachweisLagen(dokumente, JETZT)).toEqual([]);
    }
  });

  it("wirkt nur auf die eigene Art: der abgelaufene Titel der ANDEREN Art bleibt im Balken", () => {
    const dokumente = [unbefristet("ARBEITSERLAUBNIS"), dok("AUFENTHALTSTITEL", ablaufIn(-2))];
    const lagen = nachweisLagen(dokumente, JETZT);
    expect(lagen.map((l) => [l.typ, l.unbefristet ?? false])).toEqual([
      ["ARBEITSERLAUBNIS", true],
      ["AUFENTHALTSTITEL", false],
    ]);
    expect(dringendeNachweisLagen(dokumente, JETZT).map((l) => l.typ)).toEqual(["AUFENTHALTSTITEL"]);
  });

  it("ohne Kennzeichen bleibt alles wie bisher — auch `unbefristet: false` und `null`", () => {
    // Die Lage traegt das Feld dann gar nicht: Bestehende Zusicherungen mit
    // `toEqual({ typ, ampel })` bleiben gueltig.
    expect(nachweisLagen([{ ...dok("AUFENTHALTSTITEL", null), unbefristet: false }], JETZT)).toEqual([
      { typ: "AUFENTHALTSTITEL", ampel: null },
    ]);
    const lagen = nachweisLagen(
      [
        { ...dok("AUFENTHALTSTITEL", ablaufIn(-5)), unbefristet: false },
        { ...dok("AUFENTHALTSTITEL", null), unbefristet: null },
      ],
      JETZT
    );
    expect(lagen).toHaveLength(1);
    expect(lagen[0].ampel?.kategorie).toBe("ABGELAUFEN");
    expect("unbefristet" in lagen[0]).toBe(false);
    expect(dringendeNachweisLagen([{ ...dok("ARBEITSERLAUBNIS", ablaufIn(10)), unbefristet: false }], JETZT))
      .toHaveLength(1);
  });

  it("ignoriert das Kennzeichen an einer Art ohne Frist", () => {
    expect(nachweisLagen([unbefristet("MASERNSCHUTZ")], JETZT)).toEqual([]);
  });
});

describe("Vorgangsweiter Warnbalken: was ihn rechtfertigt", () => {
  it("meldet abgelaufen und kritisch", () => {
    expect(
      dringendeNachweisLagen([dok("AUFENTHALTSTITEL", ablaufIn(-1))], JETZT).map(
        (l) => l.ampel?.kategorie
      )
    ).toEqual(["ABGELAUFEN"]);
    expect(
      dringendeNachweisLagen([dok("ARBEITSERLAUBNIS", ablaufIn(14))], JETZT).map(
        (l) => l.ampel?.kategorie
      )
    ).toEqual(["KRITISCH"]);
  });

  it("schweigt bei WARNUNG und BEOBACHTEN — ein Balken ueber Monate ist Tapete", () => {
    expect(dringendeNachweisLagen([dok("AUFENTHALTSTITEL", ablaufIn(30))], JETZT)).toEqual([]);
    expect(dringendeNachweisLagen([dok("AUFENTHALTSTITEL", ablaufIn(80))], JETZT)).toEqual([]);
    expect(dringendeNachweisLagen([dok("AUFENTHALTSTITEL", ablaufIn(400))], JETZT)).toEqual([]);
  });

  it("schweigt bei einem Nachweis OHNE Ablaufdatum", () => {
    // Die Niederlassungserlaubnis hat keine Frist; ein Datum wird beim
    // Hochladen deshalb nicht erzwungen. Stuende dieser Fall im Balken, truege
    // der Vorgang dieser Person auf JEDEM Reiter dauerhaft einen gelben Kasten,
    // den niemand abstellen kann — und mit ihm verlernte man auch den echten.
    // Die Auskunft geht nicht verloren: Sie steht an der Dokumentenzeile.
    expect(nachweisLagen([dok("AUFENTHALTSTITEL", null)], JETZT)).toEqual([
      { typ: "AUFENTHALTSTITEL", ampel: null },
    ]);
    expect(dringendeNachweisLagen([dok("AUFENTHALTSTITEL", null)], JETZT)).toEqual([]);
    expect(dringendeNachweisLagen([dok("AUFENTHALTSTITEL", "")], JETZT)).toEqual([]);
    expect(dringendeNachweisLagen([dok("AUFENTHALTSTITEL", "unlesbar")], JETZT)).toEqual([]);
  });

  it("meldet den abgelaufenen Titel auch neben einem fristlosen Nachweis anderer Art", () => {
    // Gegenprobe: Die Ruhigstellung des fristlosen Falls darf den echten
    // Alarm nicht mitnehmen.
    const lagen = dringendeNachweisLagen(
      [dok("ARBEITSERLAUBNIS", null), dok("AUFENTHALTSTITEL", ablaufIn(-2))],
      JETZT
    );
    expect(lagen.map((l) => l.typ)).toEqual(["AUFENTHALTSTITEL"]);
    expect(lagen[0].ampel?.text).toBe("Abgelaufen seit 2 Tagen (06.09.2026)");
  });
});
