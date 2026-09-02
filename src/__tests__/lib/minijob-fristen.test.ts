/**
 * Tests fuer die Fristen- und Wirkungsberechnung (AP 12).
 *
 * Diese Zahlen haben unmittelbare Beitragsfolgen: Ein um einen Monat falsches
 * Wirkungsdatum bedeutet, dass fuer diesen Monat der Arbeitnehmeranteil von
 * 3,6 % faellig war oder eben nicht — und in der Betriebspruefung nach
 * § 28p SGB IV nachgefordert wird.
 *
 * Die Rechenwege stammen aus der Gegenpruefung vom 27.08.2026 (drei unabhaengige
 * Blickwinkel je Regel); die Fundstellen stehen am jeweiligen Test.
 */

import {
  berlinerKalendertag,
  ersterTagDesMonats,
  naechsterWerktag,
  wochentagVon,
  formatiere,
  fristampel,
  heuteInBerlin,
  istKalendertag,
  meldefristEnde,
  monateSpaeter,
  naechsterAbrechnungstermin,
  tageImMonat,
  tageSpaeter,
  tageZwischen,
  widerspruchsfristEnde,
  wirkungAufhebung,
  wirkungBefreiung,
  wirkungBefreiungVerspaetet,
  wirkungDerBefreiung,
} from "@/lib/minijob-fristen";

describe("Kalenderarithmetik", () => {
  it("kennt die Monatslängen samt Schaltjahr", () => {
    expect(tageImMonat(2026, 2)).toBe(28);
    expect(tageImMonat(2028, 2)).toBe(29); // durch 4 teilbar
    expect(tageImMonat(2000, 2)).toBe(29); // durch 400 teilbar
    expect(tageImMonat(1900, 2)).toBe(28); // durch 100, nicht durch 400
    expect(tageImMonat(2026, 4)).toBe(30);
  });

  it("rechnet in Monaten, nicht in Tagen", () => {
    // Der Fehler, vor dem die Prüfung ausdrücklich gewarnt hat:
    // 31.01. + 30 Tage wäre der 02.03. — richtig ist der 28./29.02.
    expect(monateSpaeter("2026-01-31", 1)).toBe("2026-02-28");
    expect(monateSpaeter("2028-01-31", 1)).toBe("2028-02-29");
    expect(monateSpaeter("2026-03-31", 1)).toBe("2026-04-30");
  });

  it("trägt den Jahreswechsel", () => {
    expect(monateSpaeter("2026-11-15", 2)).toBe("2027-01-15");
    expect(monateSpaeter("2026-12-01", 1)).toBe("2027-01-01");
    expect(monateSpaeter("2027-01-15", -2)).toBe("2026-11-15");
  });

  it("findet den Monatsersten", () => {
    expect(ersterTagDesMonats("2026-08-27")).toBe("2026-08-01");
    expect(ersterTagDesMonats("2026-01-01")).toBe("2026-01-01");
  });

  it("zählt Tage über Monats- und Jahresgrenzen", () => {
    expect(tageSpaeter("2026-08-27", 42)).toBe("2026-10-08");
    expect(tageSpaeter("2026-12-25", 10)).toBe("2027-01-04");
    expect(tageSpaeter("2028-02-28", 1)).toBe("2028-02-29"); // Schaltjahr
    expect(tageSpaeter("2026-02-28", 1)).toBe("2026-03-01");
    expect(tageSpaeter("2027-01-04", -10)).toBe("2026-12-25");
  });

  it("misst den Abstand zwischen zwei Tagen", () => {
    expect(tageZwischen("2026-08-27", "2026-10-08")).toBe(42);
    expect(tageZwischen("2026-08-27", "2026-08-27")).toBe(0);
    expect(tageZwischen("2026-10-08", "2026-08-27")).toBe(-42);
    expect(tageZwischen("2026-12-31", "2027-01-01")).toBe(1);
    // Schaltjahr: 2028 hat 366 Tage.
    expect(tageZwischen("2028-01-01", "2029-01-01")).toBe(366);
    expect(tageZwischen("2026-01-01", "2027-01-01")).toBe(365);
  });

  it("erkennt gültige und ungültige Datumsangaben", () => {
    expect(istKalendertag("2026-02-28")).toBe(true);
    expect(istKalendertag("2026-02-30")).toBe(false);
    expect(istKalendertag("2026-13-01")).toBe(false);
    expect(istKalendertag("27.08.2026")).toBe(false);
    expect(istKalendertag(null)).toBe(false);
  });

  it("zeigt Datumsangaben deutsch an", () => {
    expect(formatiere("2026-08-27")).toBe("27.08.2026");
    expect(formatiere(null)).toBe("—");
    expect(formatiere("Unsinn")).toBe("—");
  });

  it("rechnet gespeicherte Zeitstempel über Berlin um", () => {
    // Das ist die Systemgrenze, an der der Zeitzonenfehler zurückkam: Ein
    // `DateTime` aus der Datenbank (etwa `rvEntscheidungAm`, gesetzt beim
    // Absenden des Fragebogens) trägt eine Uhrzeit. `toISOString().slice(0,10)`
    // liefert dafür den UTC-Tag — beim Absenden am Monatsersten kurz nach
    // Mitternacht also den Vormonat. Da alle Regeln auf dem Kalendermonat
    // aufsetzen, kostet das einen vollen Monat, nicht einen Tag.
    const absendungMESZ = new Date("2026-08-31T22:30:00Z"); // = 01.09. 00:30 Berlin
    expect(absendungMESZ.toISOString().slice(0, 10)).toBe("2026-08-31");
    expect(berlinerKalendertag(absendungMESZ)).toBe("2026-09-01");

    // Und die Folge für die Aufhebung: ein Monat Unterschied.
    expect(wirkungAufhebung("2026-08-31").datum).toBe("2026-09-01");
    expect(wirkungAufhebung(berlinerKalendertag(absendungMESZ)).datum).toBe(
      "2026-10-01"
    );
  });

  it("rechnet auch in der Winterzeit richtig um", () => {
    // MEZ: das Fenster ist 23:00–23:59 UTC des Vortags.
    expect(berlinerKalendertag(new Date("2026-11-30T23:30:00Z"))).toBe(
      "2026-12-01"
    );
    expect(berlinerKalendertag(new Date("2026-11-30T22:30:00Z"))).toBe(
      "2026-11-30"
    );
  });

  it("nimmt für „heute“ den Berliner Kalendertag, nicht UTC", () => {
    // 01.09. um 00:30 MESZ ist in UTC noch der 31.08. Da beide Wirkungsformeln
    // auf dem MONAT aufsetzen, verschöbe dieser Fehler das Ergebnis um einen
    // vollen Monat — und damit die Beitragspflicht.
    const kurzNachMitternachtBerlin = new Date("2026-08-31T22:30:00Z");
    expect(kurzNachMitternachtBerlin.toISOString().slice(0, 10)).toBe("2026-08-31");
    expect(heuteInBerlin(kurzNachMitternachtBerlin)).toBe("2026-09-01");
  });
});

describe("Wirkung der Befreiung — Regelfall", () => {
  it("nimmt den Ersten des Eingangsmonats", () => {
    const r = wirkungBefreiung("2026-08-27", "2026-01-01");
    expect(r.datum).toBe("2026-08-01");
    expect(r.begruendung).toContain("Erster Tag des Monats");
  });

  it("nimmt den Beschäftigungsbeginn, wenn er später liegt", () => {
    // „frühestens ab Beschäftigungsbeginn" (Merkblatt, Seite 7).
    const r = wirkungBefreiung("2026-08-10", "2026-09-01");
    expect(r.datum).toBe("2026-09-01");
    expect(r.begruendung).toContain("Beschäftigungsbeginn");
  });

  it("liefert auch einen Nicht-Monatsersten", () => {
    // Genau deshalb lässt der Vordruck auf Seite 8 beide Tagesstellen frei,
    // während Seite 9 die „01" fest eindruckt.
    const r = wirkungBefreiung("2026-08-10", "2026-08-15");
    expect(r.datum).toBe("2026-08-15");
  });

  it("weist auf den Vorbehalt der fristgerechten Meldung hin", () => {
    // Das „grundsätzlich" im amtlichen Satz ist kein Füllwort.
    const r = wirkungBefreiung("2026-08-27", "2026-01-01");
    expect(r.hinweise.join(" ")).toContain("fristgerecht");
    expect(r.hinweise.join(" ")).toContain("widerspricht");
  });

  it("rechnet nicht ohne Eingangsdatum oder Beschäftigungsbeginn", () => {
    expect(wirkungBefreiung(null, "2026-01-01").datum).toBeNull();
    expect(wirkungBefreiung("2026-08-27", null).datum).toBeNull();
  });
});

describe("Fallentscheidung Regelfall / Verspätung", () => {
  it("nimmt den Regelfall, solange keine Meldung erfasst ist", () => {
    const r = wirkungDerBefreiung({
      eingangBeimArbeitgeber: "2026-08-05",
      beschaeftigungsbeginn: "2026-01-01",
      meldungBeiMinijobzentrale: null,
      meldefrist: "2026-08-25",
    });
    expect(r.verspaetet).toBe(false);
    expect(r.datum).toBe("2026-08-01");
  });

  it("nimmt den Regelfall bei fristgerechter Meldung", () => {
    const r = wirkungDerBefreiung({
      eingangBeimArbeitgeber: "2026-08-05",
      beschaeftigungsbeginn: "2026-01-01",
      meldungBeiMinijobzentrale: "2026-08-20",
      meldefrist: "2026-08-25",
    });
    expect(r.verspaetet).toBe(false);
    expect(r.datum).toBe("2026-08-01");
  });

  it("schiebt bei versäumter Frist nach hinten", () => {
    // Der eigentliche Punkt: Die Entscheidung trifft der Rechenkern, nicht die
    // Oberfläche. Vorher hätte ein Aufrufer, der schlicht wirkungBefreiung()
    // nimmt, den 01.03. gedruckt — obwohl die Meldung erst am 20.04. rausging.
    const r = wirkungDerBefreiung({
      eingangBeimArbeitgeber: "2026-03-05",
      beschaeftigungsbeginn: "2026-01-01",
      meldungBeiMinijobzentrale: "2026-04-20",
      meldefrist: "2026-03-25",
    });
    expect(r.verspaetet).toBe(true);
    expect(r.datum).toBe("2026-06-01");
  });
});

describe("Wirkung der Befreiung — Meldefrist versäumt", () => {
  it("bleibt auch im Verspätungsfall nicht vor dem Beschäftigungsbeginn", () => {
    // Im Onboarding der Regelfall: Der Antrag geht lange vor dem ersten
    // Arbeitstag ein. Das „frühestens ab Beschäftigungsbeginn" steht im selben
    // Absatz und wird durch das „Anderenfalls … erst" nicht aufgehoben — „erst"
    // schiebt nach hinten, es setzt nicht neu.
    const r = wirkungBefreiungVerspaetet("2026-07-25", "2026-10-01");
    expect(r.datum).toBe("2026-10-01");
    expect(r.begruendung).toContain("Beschäftigungsbeginn");
  });

  it("meldet, wenn der Beschäftigungsbeginn zur Prüfung fehlt", () => {
    const r = wirkungBefreiungVerspaetet("2026-07-25", null);
    expect(r.datum).toBe("2026-09-01");
    expect(r.hinweise.join(" ")).toContain("Untergrenze");
  });

  it("beginnt am Ersten des übernächsten Monats", () => {
    // „nach Ablauf des Kalendermonats, der dem Kalendermonat des Eingangs der
    // Meldung folgt": Eingangsmonat M -> M+1 -> Wirkung am 01. von M+2.
    expect(wirkungBefreiungVerspaetet("2026-03-10").datum).toBe("2026-05-01");
    expect(wirkungBefreiungVerspaetet("2026-11-15").datum).toBe("2027-01-01");
    expect(wirkungBefreiungVerspaetet("2027-02-22").datum).toBe("2027-04-01");
  });

  it("ist vom Tag im Monat unabhängig", () => {
    expect(wirkungBefreiungVerspaetet("2026-03-01").datum).toBe("2026-05-01");
    expect(wirkungBefreiungVerspaetet("2026-03-31").datum).toBe("2026-05-01");
  });

  it("benennt die Beitragsfolge", () => {
    const r = wirkungBefreiungVerspaetet("2026-03-10");
    expect(r.hinweise.join(" ")).toContain("Rentenversicherungspflicht");
  });
});

describe("Wirkung der Aufhebung", () => {
  it("wirkt immer zum Monatsersten des Folgemonats", () => {
    expect(wirkungAufhebung("2026-08-27").datum).toBe("2026-09-01");
    expect(wirkungAufhebung("2026-08-01").datum).toBe("2026-09-01");
    expect(wirkungAufhebung("2026-12-31").datum).toBe("2027-01-01");
  });

  it("wirkt nie rückwirkend", () => {
    const antrag = "2026-08-27";
    expect(wirkungAufhebung(antrag).datum! > antrag).toBe(true);
  });

  it("bildet keine Analogie zur Befreiung", () => {
    // Für die Aufhebung nennt der amtliche Text KEIN „frühestens ab
    // Beschäftigungsbeginn". Ein max() dagegen wäre hinzuerfundenes Recht —
    // das Datum bleibt, der Fall wird HR nur vorgelegt.
    const r = wirkungAufhebung("2026-08-27", "2026-11-01");
    expect(r.datum).toBe("2026-09-01");
    expect(r.hinweise.join(" ")).toContain("vor dem Beschäftigungsbeginn");
  });

  it("schweigt, wenn der Beschäftigungsbeginn unproblematisch ist", () => {
    const r = wirkungAufhebung("2026-08-27", "2026-01-01");
    expect(r.hinweise.join(" ")).not.toContain("vor dem Beschäftigungsbeginn");
  });

  it("weist die Mehrdeutigkeit des Anknüpfungspunkts aus", () => {
    // Der amtliche Text sagt „Antragstellung", der Vordruck erfasst den
    // Eingang. Solange beide im selben Monat liegen, ist das folgenlos.
    expect(wirkungAufhebung("2026-08-27").hinweise.join(" ")).toContain(
      "Antragstellung"
    );
  });

  it("nennt die Genehmigungsfiktion", () => {
    expect(wirkungAufhebung("2026-08-27").hinweise.join(" ")).toContain(
      "widerspricht"
    );
  });
});

describe("Meldefrist des Arbeitgebers", () => {
  it("nimmt die sechs Wochen, wenn kein Abrechnungstermin bekannt ist", () => {
    const r = meldefristEnde("2026-08-27", null);
    expect(r.datum).toBe("2026-10-08"); // 27.08. + 42 Tage
    expect(r.quelle).toBe("SECHS_WOCHEN");
    expect(r.unvollstaendig).toBe(true);
    expect(r.hinweise.join(" ")).toContain("früher enden");
  });

  it("nimmt die Entgeltabrechnung, wenn sie früher liegt", () => {
    // Der Kern: „bis zur nächsten Entgeltabrechnung, spätestens innerhalb von
    // 6 Wochen" — maßgeblich ist der FRÜHERE der beiden Termine.
    const r = meldefristEnde("2026-08-05", 25);
    expect(r.datum).toBe("2026-08-25");
    expect(r.quelle).toBe("ENTGELTABRECHNUNG");
    expect(r.unvollstaendig).toBe(false);
  });

  it("kappt auf sechs Wochen, wenn die Abrechnung später liegt", () => {
    // Eingang kurz nach dem Abrechnungslauf: Die nächste Abrechnung liegt fast
    // einen Monat entfernt, aber nicht weiter als sechs Wochen — dann bindet
    // sie. Liegt sie weiter, bindet die Obergrenze.
    const r = meldefristEnde("2026-08-26", 25);
    expect(r.datum).toBe("2026-09-25");
    expect(r.quelle).toBe("ENTGELTABRECHNUNG");
  });

  it("erkennt den gefährlichen Fall: Eingang zu Monatsbeginn", () => {
    // Eine Ampel, die nur sechs Wochen zählt, stünde hier noch lange auf Grün,
    // während die echte Frist schon in wenigen Tagen abläuft.
    const nurSechsWochen = meldefristEnde("2026-08-01", null);
    const mitAbrechnung = meldefristEnde("2026-08-01", 5);
    expect(nurSechsWochen.datum).toBe("2026-09-12");
    expect(mitAbrechnung.datum).toBe("2026-08-05");
    expect(mitAbrechnung.datum! < nurSechsWochen.datum!).toBe(true);
  });

  it("meldet den Antragseingang vor Beschäftigungsbeginn, ohne die Regel zu ändern", () => {
    // Im Onboarding der Regelfall: Der Fragebogen wird vor dem ersten Arbeitstag
    // ausgefüllt. Der Wortlaut knüpft an den Eingang — hier nichts erfinden.
    const r = meldefristEnde("2026-11-10", null, "2027-02-01");
    expect(r.datum).toBe("2026-12-22");
    expect(r.hinweise.join(" ")).toContain("vor dem Beschäftigungsbeginn");
  });

  it("meldet sich als unvollständig, wenn der Abrechnungstag unbrauchbar ist", () => {
    // Das Feld hat kein DB-Constraint. Ein Tippfehler (32 statt 3) fiel vorher
    // durch: Die Funktion warnte zwar im Hinweistext, meldete aber
    // `unvollstaendig: false` — eine Maske, die ihr Warn-Badge an das Flag
    // hängt, hätte die Warnung genau dann unterdrückt, wenn sie nötig war.
    for (const unbrauchbar of [0, -3, 32, 45, 1.5, NaN]) {
      const r = meldefristEnde("2026-08-01", unbrauchbar);
      expect(r.unvollstaendig).toBe(true);
      expect(r.quelle).toBe("SECHS_WOCHEN");
      expect(r.hinweise.join(" ")).toContain("Entgeltabrechnung");
    }
  });

  it("erzeugt aus einem krummen Abrechnungstag kein kaputtes Datum", () => {
    // 5.7 kam vorher durch die Bereichsprüfung und ergab "2026-08-5.7".
    const r = meldefristEnde("2026-08-01", 5.7);
    expect(r.datum).toBe("2026-09-12");
    expect(istKalendertag(r.datum!)).toBe(true);
  });

  it("läuft ohne Eingangsdatum gar nicht", () => {
    const r = meldefristEnde(null, 25);
    expect(r.datum).toBeNull();
    expect(r.quelle).toBeNull();
  });
});

describe("Nächster Abrechnungstermin", () => {
  it("nimmt den laufenden Monat, wenn der Termin noch bevorsteht", () => {
    expect(naechsterAbrechnungstermin("2026-08-05", 25)).toBe("2026-08-25");
  });

  it("springt in den Folgemonat, wenn er vorbei ist", () => {
    expect(naechsterAbrechnungstermin("2026-08-25", 25)).toBe("2026-09-25");
    expect(naechsterAbrechnungstermin("2026-08-26", 25)).toBe("2026-09-25");
  });

  it("kappt einen Termin, den es im Zielmonat nicht gibt", () => {
    // Abrechnung „am 31." in einem Februar.
    expect(naechsterAbrechnungstermin("2026-02-01", 31)).toBe("2026-02-28");
    expect(naechsterAbrechnungstermin("2028-02-01", 31)).toBe("2028-02-29");
    expect(naechsterAbrechnungstermin("2026-04-01", 31)).toBe("2026-04-30");
  });

  it("trägt den Jahreswechsel", () => {
    expect(naechsterAbrechnungstermin("2026-12-20", 15)).toBe("2027-01-15");
  });
});

describe("Widerspruchsfrist der Einzugsstelle", () => {
  it("endet einen Monat nach Eingang der Meldung", () => {
    expect(widerspruchsfristEnde("2026-08-10").datum).toBe("2026-09-10");
  });

  it("rechnet den Wochentag ohne Date-Objekt korrekt aus", () => {
    // Gegen die Kalenderrechnung von Hand geprüft.
    expect(wochentagVon("2026-08-31")).toBe(1); // Montag
    expect(wochentagVon("2026-02-28")).toBe(6); // Samstag
    expect(wochentagVon("2026-03-02")).toBe(1); // Montag
    expect(wochentagVon("2028-02-29")).toBe(2); // Dienstag
    expect(wochentagVon("2026-09-12")).toBe(6); // Samstag
    expect(wochentagVon("2026-09-13")).toBe(0); // Sonntag
    // Auch weit weg vom Bezugspunkt, in beide Richtungen.
    expect(wochentagVon("2020-01-01")).toBe(3); // Mittwoch
    expect(wochentagVon("2030-12-25")).toBe(3); // Mittwoch
  });

  it("schiebt Sonnabend und Sonntag auf den Montag", () => {
    expect(naechsterWerktag("2026-02-28")).toBe("2026-03-02"); // Sa
    expect(naechsterWerktag("2026-03-01")).toBe("2026-03-02"); // So
    expect(naechsterWerktag("2026-03-02")).toBe("2026-03-02"); // Mo bleibt
    expect(naechsterWerktag("2026-03-06")).toBe("2026-03-06"); // Fr bleibt
  });

  it("kappt auf den letzten Tag, wenn der Tag im Folgemonat fehlt", () => {
    // § 188 Abs. 2 BGB: Eingang am 31.01. -> Monatsende 28./29.02.
    // 2028 ist der 29.02. ein Dienstag, das Ergebnis bleibt stehen.
    expect(widerspruchsfristEnde("2028-01-31").datum).toBe("2028-02-29");
  });

  it("schiebt ein Fristende am Wochenende auf den nächsten Werktag", () => {
    // § 26 Abs. 3 SGB X. Beim Widerspruch wirkt das in die sichere Richtung:
    // Ein zu früh angezeigtes Ende hieße, eine Genehmigungsfiktion anzunehmen,
    // die noch gar nicht eingetreten ist.
    // 31.01.2026 + 1 Monat = Sa 28.02.2026 -> Mo 02.03.2026
    const r = widerspruchsfristEnde("2026-01-31");
    expect(r.datum).toBe("2026-03-02");
    expect(r.hinweise.join(" ")).toContain("Wochenende");

    // 12.08.2026 + 1 Monat = Sa 12.09.2026 -> Mo 14.09.2026
    expect(widerspruchsfristEnde("2026-08-12").datum).toBe("2026-09-14");
  });

  it("lässt ein Fristende an einem Werktag stehen", () => {
    // 10.08.2026 + 1 Monat = Do 10.09.2026
    const r = widerspruchsfristEnde("2026-08-10");
    expect(r.datum).toBe("2026-09-10");
    expect(r.hinweise.join(" ")).not.toContain("Wochenende");
  });

  it("weist die fehlenden Feiertage aus", () => {
    // Sie hängen am Ort der Einzugsstelle, den das Portal nicht kennt.
    expect(widerspruchsfristEnde("2026-08-10").hinweise.join(" ")).toContain(
      "Feiertage"
    );
  });

  it("läuft nicht, solange die Meldung nicht erfasst ist", () => {
    // Dieses Datum entsteht im DEUEV-Verfahren, außerhalb des Portals. Es darf
    // nicht aus dem Antragseingang geschätzt werden.
    const r = widerspruchsfristEnde(null);
    expect(r.datum).toBeNull();
    expect(r.begruendung).toContain("Lohnbuchhaltung");
  });
});

describe("Ampel", () => {
  const heute = "2026-08-27";

  it("meldet eine erledigte Frist als erledigt", () => {
    const a = fristampel("2026-09-10", "2026-08-20", heute);
    expect(a.ampel).toBe("ERLEDIGT");
    expect(a.text).toContain("20.08.2026");
  });

  it("meldet offen, solange keine Frist berechenbar ist", () => {
    expect(fristampel(null, null, heute).ampel).toBe("OFFEN");
  });

  it("warnt früh genug für einen Abrechnungslauf", () => {
    // Zehn Tage Vorlauf: Die Meldung läuft über die Lohnbuchhaltung, nicht über
    // einen Klick.
    expect(fristampel("2026-09-06", null, heute).ampel).toBe("BALD");
    expect(fristampel("2026-09-07", null, heute).ampel).toBe("LAEUFT");
  });

  it("meldet den letzten Tag", () => {
    const a = fristampel(heute, null, heute);
    expect(a.ampel).toBe("BALD");
    expect(a.text).toContain("heute");
  });

  it("meldet Überfälligkeit mit Tagen", () => {
    const a = fristampel("2026-08-20", null, heute);
    expect(a.ampel).toBe("UEBERFAELLIG");
    expect(a.tage).toBe(-7);
    expect(a.text).toContain("7 Tagen");
  });
});
