/**
 * Tests fuer die Wahrheitsversicherung (AP 2).
 *
 * Zwei Dinge sollen diese Tests festhalten:
 *
 * 1. Der Wortlaut ist versioniert und **unveraenderlich**. Wer eine bestehende
 *    Fassung anpasst, aendert rueckwirkend, was bereits bestaetigte Vorgaenge
 *    ausweisen — genau das soll die Versionierung verhindern.
 * 2. Die Pruefsumme bezieht sich stabil auf die Angaben und reagiert auf jede
 *    inhaltliche Aenderung.
 */

import {
  AKTUELLE_ERKLAERUNG,
  ERKLAERUNGS_FASSUNGEN,
  erklaerungAlsText,
  getErklaerung,
  istBekannteErklaerung,
} from "@/lib/erklaerung-arbeitnehmer";
import {
  berechnePruefsumme,
  kanonischeAngaben,
  pruefsummeKurz,
} from "@/lib/fragebogen-pruefsumme";

describe("Erklaerungs-Fassungen", () => {
  it("vergibt jede Version genau einmal", () => {
    const versionen = ERKLAERUNGS_FASSUNGEN.map((f) => f.version);
    expect(new Set(versionen).size).toBe(versionen.length);
  });

  it("nimmt als aktuelle Fassung die letzte der Liste", () => {
    expect(AKTUELLE_ERKLAERUNG).toBe(
      ERKLAERUNGS_FASSUNGEN[ERKLAERUNGS_FASSUNGEN.length - 1]
    );
  });

  it("haelt die Fassungen chronologisch", () => {
    const daten = ERKLAERUNGS_FASSUNGEN.map((f) => f.gueltigAb);
    expect([...daten].sort()).toEqual(daten);
  });

  it("belehrt ueber die Ordnungswidrigkeit nach SGB IV", () => {
    // Die Erlaeuterungen der Minijob-Checkliste verlangen diesen Hinweis
    // ausdruecklich; er fehlte in der bisherigen Oberflaeche.
    const text = erklaerungAlsText(AKTUELLE_ERKLAERUNG);
    expect(text).toContain("§ 28o");
    expect(text).toContain("§ 111 Abs. 1 Nr. 4 SGB IV");
    expect(text).toContain("Ordnungswidrigkeit");
  });

  it("versichert die Wahrheit und verpflichtet zur Mitteilung", () => {
    const text = erklaerungAlsText(AKTUELLE_ERKLAERUNG);
    expect(text).toContain("der Wahrheit entsprechen");
    expect(text).toContain("unverzüglich mitzuteilen");
  });

  it("nennt zu jeder Fassung Titel, Bestaetigung und Unterschriftshinweis", () => {
    for (const f of ERKLAERUNGS_FASSUNGEN) {
      expect(f.titel.length).toBeGreaterThan(0);
      expect(f.bestaetigung.length).toBeGreaterThan(0);
      expect(f.unterschriftsersatz.length).toBeGreaterThan(0);
      expect(f.abschnitte.length).toBeGreaterThan(0);
    }
  });

  it("findet eine Fassung ueber ihre Version", () => {
    expect(getErklaerung(AKTUELLE_ERKLAERUNG.version)).toBe(AKTUELLE_ERKLAERUNG);
    expect(istBekannteErklaerung(AKTUELLE_ERKLAERUNG.version)).toBe(true);
  });

  it("meldet unbekannte Versionen als unbekannt", () => {
    for (const wert of ["gibt-es-nicht", "", null, undefined]) {
      expect(getErklaerung(wert)).toBeUndefined();
      expect(istBekannteErklaerung(wert)).toBe(false);
    }
  });

  it("gibt Aufzaehlungen im Fliesstext wieder", () => {
    const mitPunkten = AKTUELLE_ERKLAERUNG.abschnitte.find((a) => a.punkte);
    expect(mitPunkten).toBeDefined();
    const text = erklaerungAlsText(AKTUELLE_ERKLAERUNG);
    for (const punkt of mitPunkten!.punkte!) {
      expect(text).toContain(punkt);
    }
  });
});

describe("Pruefsumme ueber die Angaben", () => {
  const angaben = {
    firstName: "Lena",
    lastName: "Bergmann",
    birthDate: new Date("2008-03-14T00:00:00.000Z"),
    iban: "DE02120300000000202051",
    taxId: "12345678901",
    hasOtherEmployment: true,
  };

  it("liefert denselben Wert fuer denselben Stand", () => {
    expect(berechnePruefsumme(angaben)).toBe(berechnePruefsumme({ ...angaben }));
  });

  it("haengt nicht an der Reihenfolge der Schluessel", () => {
    const andersHerum = {
      hasOtherEmployment: angaben.hasOtherEmployment,
      taxId: angaben.taxId,
      iban: angaben.iban,
      birthDate: angaben.birthDate,
      lastName: angaben.lastName,
      firstName: angaben.firstName,
    };
    expect(berechnePruefsumme(andersHerum)).toBe(berechnePruefsumme(angaben));
  });

  it("aendert sich, sobald sich eine Angabe aendert", () => {
    const geaendert = { ...angaben, lastName: "Bergman" };
    expect(berechnePruefsumme(geaendert)).not.toBe(berechnePruefsumme(angaben));
  });

  it("unterscheidet fehlende von leeren Angaben nicht", () => {
    // null und undefined sind derselbe Sachverhalt: keine Angabe.
    const mitNull = { ...angaben, birthName: null };
    const mitUndefined = { ...angaben, birthName: undefined };
    expect(berechnePruefsumme(mitNull)).toBe(berechnePruefsumme(mitUndefined));
  });

  it("laesst Meta-Felder ausser Betracht", () => {
    // Ein weiterer Zwischenspeicher-Schritt oder ein neuer Zeitstempel darf die
    // Pruefsumme nicht verletzen — bestaetigt wurden die Angaben, nicht der
    // Bearbeitungsstand.
    const mitMeta = {
      ...angaben,
      id: "abc",
      onboardingId: "def",
      currentStep: 8,
      isComplete: true,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-08-25"),
      dsgvoAccepted: true,
      dsgvoAcceptedAt: new Date("2026-08-25"),
    };
    expect(berechnePruefsumme(mitMeta)).toBe(berechnePruefsumme(angaben));
  });

  it("schliesst die Nachweise der Erklaerung selbst aus", () => {
    // Sonst haenge die Pruefsumme von ihrem eigenen Ergebnis ab.
    const mitNachweis = {
      ...angaben,
      erklaerungAccepted: true,
      erklaerungAcceptedAt: new Date("2026-08-25T14:32:00.000Z"),
      erklaerungOrt: "Minden",
      erklaerungIp: "192.0.2.1",
      erklaerungUserAgent: "Mozilla/5.0",
      erklaerungVersion: "2026-08-25",
      erklaerungPruefsumme: "egal",
    };
    expect(berechnePruefsumme(mitNachweis)).toBe(berechnePruefsumme(angaben));
  });

  it("bezieht Kinder ein, unabhaengig von ihrer Reihenfolge", () => {
    const kinder = [
      { firstName: "Anna", lastName: "Bergmann", birthDate: "2020-05-01", taxAllowance: true },
      { firstName: "Ben", lastName: "Bergmann", birthDate: "2018-02-11", taxAllowance: false },
    ];
    const mitKindern = berechnePruefsumme(angaben, kinder);
    expect(mitKindern).not.toBe(berechnePruefsumme(angaben));
    expect(berechnePruefsumme(angaben, [...kinder].reverse())).toBe(mitKindern);
  });

  it("erkennt eine Aenderung an einem Kind", () => {
    const kinder = [
      { firstName: "Anna", lastName: "Bergmann", birthDate: "2020-05-01", taxAllowance: true },
    ];
    const geaendert = [{ ...kinder[0], taxAllowance: false }];
    expect(berechnePruefsumme(angaben, geaendert)).not.toBe(
      berechnePruefsumme(angaben, kinder)
    );
  });

  it("behandelt Datum und ISO-Zeichenkette gleich", () => {
    // Die Datenbank liefert Date, ein spaeterer Nachrechen-Pfad womoeglich die
    // ISO-Form. Beides muss dieselbe Pruefsumme ergeben.
    const alsText = { ...angaben, birthDate: "2008-03-14T00:00:00.000Z" };
    expect(berechnePruefsumme(alsText)).toBe(berechnePruefsumme(angaben));
  });

  it("liefert einen 64 Zeichen langen Hex-Wert", () => {
    expect(berechnePruefsumme(angaben)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("stellt die Angaben als sortiertes JSON dar", () => {
    const kanonisch = kanonischeAngaben({ b: 2, a: 1 });
    expect(kanonisch).toBe('{"angaben":{"a":1,"b":2},"kinder":[]}');
  });
});

describe("Der Arbeitgeberteil zaehlt nicht zu den versicherten Angaben", () => {
  const angaben = {
    firstName: "Maria",
    lastName: "Voth",
    rvEntscheidung: "BEFREIUNG_BEANTRAGT",
  };

  it("laesst die Pruefsumme unveraendert, wenn HR die Fristen nachtraegt", () => {
    // Der eigentliche Punkt: Die Wahrheitsversicherung deckt ab, was der
    // Beschaeftigte erklaert hat. Eingangsdatum, Wirkungsdatum und Meldedatum
    // traegt HR spaeter nach — stuenden sie in der Pruefsumme, waere sie mit
    // dem ersten Eintrag ungueltig und liesse sich nie wieder nachrechnen.
    // Genau dafuer gibt es sie aber.
    const nachHrEingabe = {
      ...angaben,
      rvAntragEingangAm: "2026-08-10",
      rvWirkungAb: "2026-08-01",
      rvMeldungAm: "2026-08-20",
      rvBearbeitetVonId: "user-1",
      rvBearbeitetAm: "2026-08-20T09:00:00.000Z",
    };
    expect(berechnePruefsumme(nachHrEingabe)).toBe(berechnePruefsumme(angaben));
  });

  it("erfasst die Entscheidung des Beschaeftigten dagegen sehr wohl", () => {
    // Gegenprobe: Was er selbst erklaert hat, muss die Pruefsumme abdecken.
    const andereEntscheidung = { ...angaben, rvEntscheidung: "KEINE_BEFREIUNG" };
    expect(berechnePruefsumme(andereEntscheidung)).not.toBe(
      berechnePruefsumme(angaben)
    );
  });
});

describe("pruefsummeKurz", () => {
  it("kuerzt lange Pruefsummen fuer die Anzeige", () => {
    const voll = "a".repeat(8) + "b".repeat(48) + "c".repeat(8);
    expect(pruefsummeKurz(voll)).toBe("aaaaaaaa…cccccccc");
  });

  it("laesst kurze Werte und Leerwerte unveraendert", () => {
    expect(pruefsummeKurz("kurz")).toBe("kurz");
    expect(pruefsummeKurz(null)).toBe("—");
    expect(pruefsummeKurz(undefined)).toBe("—");
  });
});
