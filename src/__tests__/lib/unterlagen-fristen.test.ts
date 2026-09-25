/**
 * Tests: Unterlagen nachfordern — der taegliche Lauf als reine Regeln
 * (src/lib/unterlagen-fristen.ts, Feinplanung Abschnitt 9 und 4.5, Z2)
 *
 * Die Beispielgeschichte der Feinplanung (8.4) mit echten Wochentagen:
 * angefordert Mo 14.09.2026, Frist Fr 25.09.2026, Linkende Fr 09.10.2026.
 * Alles ist rein — `heute` und `jetzt` kommen herein, keine Uhr, keine
 * Datenbank. Was der Lauf daraus MACHT (Sperren, Merker, Mails, Loeschen),
 * prueft src/__tests__/api/unterlagen-fristen-cron.test.ts.
 */

import {
  aufraeumKandidaten,
  entwurfFaelligBisFrist,
  entwurfVorhanden,
  erinnerungFaellig,
  erinnerungsAnlass,
  fristMeldungFaellig,
  laufPlanen,
  personenMailNachholen,
  vollstaendigMeldungFaellig,
  type LaufDatei,
  type LaufLink,
  type LaufStand,
} from "@/lib/unterlagen-fristen";
import * as regeln from "@/lib/unterlagen";
import { entwurfLoeschenAb, laufWaechter } from "@/lib/unterlagen";
import { tageSpaeter } from "@/lib/kalendertag";

const FRIST = "2026-09-25";
const datum = (tag: string) => new Date(`${tag}T00:00:00.000Z`);
/** 10:00 Uhr in Berlin an einem Kalendertag (Sommerzeit: 08:00 UTC). */
const um10 = (tag: string) => new Date(`${tag}T08:00:00.000Z`);
const tag = (n: number) => tageSpaeter(FRIST, n);
const STUNDE = 3_600_000;

let zaehler = 0;
const id = (praefix: string) => `${praefix}-${++zaehler}`;

function link(teil: Partial<LaufLink> = {}): LaufLink {
  return {
    id: id("l"),
    anlass: "ANFORDERUNG",
    mailStatus: "SENT",
    gesendetAm: um10("2026-09-14"),
    createdAt: um10("2026-09-14"),
    nachholVersuche: 0,
    positionId: null,
    entwertetAm: null,
    entwertetGrund: null,
    ...teil,
  };
}

function datei(teil: Partial<LaufDatei> = {}): LaufDatei {
  return {
    id: id("d"),
    positionId: "p-1",
    status: "ENTWURF",
    loeschenAb: null,
    dateiGeloeschtAm: null,
    hochgeladenAm: um10("2026-09-15"),
    ...teil,
  };
}

function stand(teil: Partial<LaufStand> = {}): LaufStand {
  return {
    id: "nf-1",
    status: "LAUFEND",
    frist: datum(FRIST),
    erinnertFuerFrist: null,
    erinnertStufe: null,
    fristGemeldetFuer: null,
    vollstaendigSeit: null,
    vollstaendigGemeldetAm: null,
    positionen: [{ id: "p-1", status: "ANGEFORDERT", angefordertAm: um10("2026-09-14") }],
    dateien: [],
    links: [link()],
    ...teil,
  };
}

// =============================================
// Schritt 3: Erinnerung (erinnerungFaellig, re-exportiert)
// =============================================

describe("erinnerungFaellig — dieselbe Funktion wie im Lauf-Waechter", () => {
  it("ist die Funktion aus unterlagen.ts, nicht nachgebaut", () => {
    expect(erinnerungFaellig).toBe(regeln.erinnerungFaellig);
  });

  it("Vorab-Fenster: Frist −8 nichts, −7 und −1 VORAB, am Fristtag FRISTTAG", () => {
    const s = stand();
    expect(erinnerungFaellig(s, tag(-8))).toBeNull();
    expect(erinnerungFaellig(s, tag(-7))).toBe("VORAB");
    expect(erinnerungFaellig(s, tag(-1))).toBe("VORAB");
    expect(erinnerungFaellig(s, FRIST)).toBe("FRISTTAG");
  });

  it("Aufforderung erst im Fenster (Frist − 5) → keine Vorab-Mail, am Fristtag trotzdem", () => {
    const s = stand({ links: [link({ gesendetAm: um10(tag(-5)), createdAt: um10(tag(-5)) })] });
    expect(erinnerungFaellig(s, tag(-3))).toBeNull();
    expect(erinnerungFaellig(s, FRIST)).toBe("FRISTTAG");
  });

  it("fuer diese Frist schon vorab erinnert → keine zweite Vorab-Mail, der Fristtag kommt", () => {
    const s = stand({ erinnertFuerFrist: datum(FRIST), erinnertStufe: "VORAB" });
    expect(erinnerungFaellig(s, tag(-6))).toBeNull();
    expect(erinnerungFaellig(s, FRIST)).toBe("FRISTTAG");
  });

  it("Fristtag: nur einmal, und nicht, wenn heute schon eine Mail an die Person ging", () => {
    expect(erinnerungFaellig(stand({ erinnertFuerFrist: datum(FRIST), erinnertStufe: "FRISTTAG" }), FRIST)).toBeNull();
    const heuteGesendet = stand({ links: [link(), link({ anlass: "ERNEUT", gesendetAm: um10(FRIST), createdAt: um10(FRIST) })] });
    expect(erinnerungFaellig(heuteGesendet, FRIST)).toBeNull();
  });

  it("ein verpasster Fristtag wird nicht nachgeholt", () => {
    expect(erinnerungFaellig(stand(), tag(1))).toBeNull();
  });

  it("eine neue Frist startet ueber erinnertFuerFrist einen neuen Zyklus", () => {
    const neu = "2026-10-09";
    const s = stand({ frist: datum(neu), erinnertFuerFrist: datum(FRIST), erinnertStufe: "FRISTTAG" });
    expect(erinnerungFaellig(s, tageSpaeter(neu, -7))).toBe("VORAB");
    expect(erinnerungFaellig(s, neu)).toBe("FRISTTAG");
  });

  it("ohne zugestellte Mail und wenn alles uebermittelt ist → keine Erinnerung", () => {
    expect(erinnerungFaellig(stand({ links: [link({ mailStatus: "FAILED", gesendetAm: null })] }), tag(-3))).toBeNull();
    const alles = stand({ positionen: [{ id: "p-1", status: "EINGEREICHT" }] });
    expect(erinnerungFaellig(alles, tag(-3))).toBeNull();
    expect(erinnerungFaellig(alles, FRIST)).toBeNull();
  });

  it("Anlass des Links je Stufe", () => {
    expect(erinnerungsAnlass("VORAB")).toBe("ERINNERUNG_VORAB");
    expect(erinnerungsAnlass("FRISTTAG")).toBe("ERINNERUNG_FRISTTAG");
  });
});

// =============================================
// Schritt 1 und 4: HR-Meldungen
// =============================================

describe("fristMeldungFaellig — „Frist verstrichen“ an HR", () => {
  it("erst am Tag nach der Frist, einmal je Fristwert", () => {
    expect(fristMeldungFaellig(stand(), FRIST)).toBe(false);
    expect(fristMeldungFaellig(stand(), tag(1))).toBe(true);
    expect(fristMeldungFaellig(stand({ fristGemeldetFuer: datum(FRIST) }), tag(5))).toBe(false);
  });

  it("nach einer Verlaengerung und erneutem Verstreichen noch einmal", () => {
    const neu = "2026-10-02";
    const s = stand({ frist: datum(neu), fristGemeldetFuer: datum(FRIST) });
    expect(fristMeldungFaellig(s, neu)).toBe(false);
    expect(fristMeldungFaellig(s, tageSpaeter(neu, 1))).toBe(true);
  });

  it("ist nur noch die Pruefung durch HR offen, geht keine Mail", () => {
    expect(fristMeldungFaellig(stand({ positionen: [{ id: "p-1", status: "EINGEREICHT" }] }), tag(3))).toBe(false);
  });

  it("wurde nie etwas zugestellt, geht sie trotzdem (dann mit nie_zugestellt)", () => {
    expect(fristMeldungFaellig(stand({ links: [link({ mailStatus: "FAILED", gesendetAm: null })] }), tag(1))).toBe(true);
  });

  it("nur bei LAUFEND", () => {
    expect(fristMeldungFaellig(stand({ status: "ERLEDIGT" }), tag(1))).toBe(false);
  });
});

describe("vollstaendigMeldungFaellig", () => {
  it("Merker gesetzt, noch nicht gemeldet, LAUFEND", () => {
    expect(vollstaendigMeldungFaellig(stand({ vollstaendigSeit: um10(tag(-2)) }))).toBe(true);
    expect(vollstaendigMeldungFaellig(stand({ vollstaendigSeit: um10(tag(-2)), vollstaendigGemeldetAm: um10(tag(-2)) }))).toBe(false);
    expect(vollstaendigMeldungFaellig(stand())).toBe(false);
    expect(vollstaendigMeldungFaellig(stand({ status: "ERLEDIGT", vollstaendigSeit: um10(tag(-2)) }))).toBe(false);
  });
});

// =============================================
// Schritt 2: Nachholen
// =============================================

describe("personenMailNachholen", () => {
  const jetzt = um10(tag(-3));
  const heute = tag(-3);

  it("FAILED-Aufforderung → neuer Versuch mit gleichem Anlass", () => {
    const alt = link({ mailStatus: "FAILED", gesendetAm: null });
    expect(personenMailNachholen(stand({ links: [alt] }), heute, jetzt)).toEqual({
      art: "NACHHOLEN",
      linkId: alt.id,
      anlass: "ANFORDERUNG",
      positionId: null,
      versuch: 1,
      abgebrochen: false,
      neuePositionen: [],
      fruehereSperren: false,
    });
  });

  it("„frühere Links sperren“ einer gescheiterten Mail geht auf den neuen Versuch ueber", () => {
    const erneut = link({ anlass: "ERNEUT", mailStatus: "FAILED", gesendetAm: null, fruehereSperren: true, createdAt: um10(tag(-4)) });
    expect(personenMailNachholen(stand({ links: [link(), erneut] }), heute, jetzt)).toMatchObject({
      anlass: "ERNEUT",
      linkId: erneut.id,
      fruehereSperren: true,
    });
    // Ohne Angabe (Links vor dieser Spalte) kein Wunsch.
    const ohne = link({ anlass: "ERNEUT", mailStatus: "FAILED", gesendetAm: null, createdAt: um10(tag(-4)) });
    expect(personenMailNachholen(stand({ links: [link(), ohne] }), heute, jetzt)?.fruehereSperren).toBe(false);
  });

  it("AUSSTEHEND erst nach mehr als einer Stunde (Absturz zwischen Link und Versand)", () => {
    const frisch = link({ mailStatus: "AUSSTEHEND", gesendetAm: null, createdAt: new Date(jetzt.getTime() - 59 * 60_000) });
    expect(personenMailNachholen(stand({ links: [frisch] }), heute, jetzt)).toBeNull();
    const alt = link({ mailStatus: "AUSSTEHEND", gesendetAm: null, createdAt: new Date(jetzt.getTime() - 61 * 60_000) });
    expect(personenMailNachholen(stand({ links: [alt] }), heute, jetzt)).toMatchObject({ linkId: alt.id, abgebrochen: true });
  });

  it("hoechstens drei Versuche; SKIPPED nie", () => {
    const zweiter = link({ mailStatus: "FAILED", gesendetAm: null, nachholVersuche: 2 });
    expect(personenMailNachholen(stand({ links: [zweiter] }), heute, jetzt)).toMatchObject({ versuch: 3 });
    const dritter = link({ mailStatus: "FAILED", gesendetAm: null, nachholVersuche: 3 });
    expect(personenMailNachholen(stand({ links: [dritter] }), heute, jetzt)).toBeNull();
    expect(personenMailNachholen(stand({ links: [link({ mailStatus: "SKIPPED", gesendetAm: null })] }), heute, jetzt)).toBeNull();
  });

  it("nur die JUENGSTE Mail zaehlt — kam danach eine an, ist nichts nachzuholen", () => {
    const failed = link({ mailStatus: "FAILED", gesendetAm: null, createdAt: um10(tag(-9)) });
    const spaeter = link({ anlass: "ERNEUT", createdAt: um10(tag(-8)), gesendetAm: um10(tag(-8)) });
    expect(personenMailNachholen(stand({ links: [failed, spaeter] }), heute, jetzt)).toBeNull();
  });

  it("Erinnerungen holt der Merker nach, nicht das Nachholen", () => {
    const erinnerung = link({ anlass: "ERINNERUNG_VORAB", mailStatus: "FAILED", gesendetAm: null, createdAt: um10(tag(-7)) });
    expect(personenMailNachholen(stand({ links: [link(), erinnerung] }), heute, jetzt)).toBeNull();
  });

  it("nach der Frist bis einschliesslich Linkende (Frist + 14), danach nicht mehr", () => {
    const s = stand({ links: [link({ mailStatus: "FAILED", gesendetAm: null })] });
    expect(personenMailNachholen(s, tag(14), um10(tag(14)))).toMatchObject({ anlass: "ANFORDERUNG" });
    expect(personenMailNachholen(s, tag(15), um10(tag(15)))).toBeNull();
  });

  it("die Person muss noch etwas zu tun haben — bei der Zurueckweisung genau diese Position", () => {
    const zurueck = link({ anlass: "ZURUECKWEISUNG", positionId: "p-2", mailStatus: "FAILED", gesendetAm: null });
    const positionen = [
      { id: "p-1", status: "EINGEREICHT" },
      { id: "p-2", status: "ZURUECKGEWIESEN" },
    ];
    expect(personenMailNachholen(stand({ positionen, links: [zurueck] }), heute, jetzt)).toMatchObject({
      anlass: "ZURUECKWEISUNG",
      positionId: "p-2",
    });
    const wiederEingereicht = [positionen[0], { id: "p-2", status: "EINGEREICHT" }];
    expect(personenMailNachholen(stand({ positionen: wiederEingereicht, links: [zurueck] }), heute, jetzt)).toBeNull();

    const aufforderung = link({ mailStatus: "FAILED", gesendetAm: null });
    expect(
      personenMailNachholen(stand({ positionen: [{ id: "p-1", status: "EINGEREICHT" }], links: [aufforderung] }), heute, jetzt),
    ).toBeNull();
  });

  it("Ergaenzung: die Positionen dieser Ergaenzung tragen „(neu)“", () => {
    const seit = um10(tag(-6));
    const ergaenzung = link({ anlass: "ERGAENZUNG", mailStatus: "FAILED", gesendetAm: null, createdAt: seit });
    const positionen = [
      { id: "p-1", status: "ANGEFORDERT", angefordertAm: um10("2026-09-14") },
      { id: "p-2", status: "ANGEFORDERT", angefordertAm: seit },
      { id: "p-3", status: "EINGEREICHT", angefordertAm: seit },
    ];
    expect(personenMailNachholen(stand({ positionen, links: [link(), ergaenzung] }), heute, jetzt)?.neuePositionen).toEqual([
      "p-2",
    ]);
  });

  it("Ergaenzung, zweiter und dritter Nachholversuch: dieselben Positionen tragen weiter „(neu)“", () => {
    // HR ergaenzt (FAILED), der Lauf holt an zwei Tagen nach — beide FAILED.
    // Die juengste Mail ist dann der Link des Laufs; Bezug bleibt der von HR.
    const seit = um10(tag(-6));
    const ergaenzung = link({ anlass: "ERGAENZUNG", mailStatus: "FAILED", gesendetAm: null, createdAt: seit });
    const versuch1 = link({ anlass: "ERGAENZUNG", mailStatus: "FAILED", gesendetAm: null, createdAt: um10(tag(-5)), nachholVersuche: 1 });
    const versuch2 = link({ anlass: "ERGAENZUNG", mailStatus: "FAILED", gesendetAm: null, createdAt: um10(tag(-4)), nachholVersuche: 2 });
    const positionen = [
      { id: "p-1", status: "ANGEFORDERT", angefordertAm: um10("2026-09-14") },
      { id: "p-2", status: "ANGEFORDERT", angefordertAm: seit },
    ];
    const zweiter = personenMailNachholen(stand({ positionen, links: [link(), ergaenzung, versuch1] }), heute, jetzt);
    expect(zweiter).toMatchObject({ versuch: 2, neuePositionen: ["p-2"] });
    const dritter = personenMailNachholen(stand({ positionen, links: [link(), ergaenzung, versuch1, versuch2] }), heute, jetzt);
    expect(dritter).toMatchObject({ versuch: 3, neuePositionen: ["p-2"] });
    // Eine zweite Ergaenzung beginnt eine eigene Kette — nur IHRE Positionen sind neu.
    const spaeter = um10(tag(-3));
    const zweiteErgaenzung = link({ anlass: "ERGAENZUNG", mailStatus: "FAILED", gesendetAm: null, createdAt: spaeter });
    const mitZweiter = [...positionen, { id: "p-3", status: "ANGEFORDERT", angefordertAm: spaeter }];
    expect(
      personenMailNachholen(stand({ positionen: mitZweiter, links: [link(), ergaenzung, versuch1, zweiteErgaenzung] }), heute, jetzt)
        ?.neuePositionen,
    ).toEqual(["p-3"]);
  });
});

// =============================================
// Schritt 5: Aufraeumen (4.5)
// =============================================

describe("aufraeumKandidaten — Tabelle 4.5", () => {
  const jetzt = um10(tag(10));

  it("zurueckgewiesen und verworfen ab `loeschenAb`, nach Faelligkeit — nie eingereicht oder angenommen", () => {
    const spaeter = datei({ status: "VERWORFEN", loeschenAb: new Date(jetzt.getTime() - STUNDE) });
    const frueher = datei({ status: "ZURUECKGEWIESEN", loeschenAb: new Date(jetzt.getTime() - 5 * STUNDE) });
    const nochNicht = datei({ status: "ZURUECKGEWIESEN", loeschenAb: new Date(jetzt.getTime() + STUNDE) });
    const schonWeg = datei({ status: "ZURUECKGEWIESEN", loeschenAb: frueher.loeschenAb, dateiGeloeschtAm: jetzt });
    const eingereicht = datei({ status: "EINGEREICHT", loeschenAb: frueher.loeschenAb });
    const angenommen = datei({ status: "ANGENOMMEN", loeschenAb: frueher.loeschenAb });
    const k = aufraeumKandidaten(
      { frist: datum(FRIST), dateien: [spaeter, nochNicht, frueher, schonWeg, eingereicht, angenommen] },
      tag(10),
      jetzt,
    );
    expect(k).toEqual({ dateien: [frueher.id, spaeter.id], entwuerfe: [] });
  });

  it("Entwuerfe 30 Tage nach dem Linkende (Frist + 44), aus der AKTUELLEN Frist gerechnet", () => {
    const entwurf = datei();
    const s = { frist: datum(FRIST), dateien: [entwurf] };
    expect(aufraeumKandidaten(s, tag(43), um10(tag(43))).entwuerfe).toEqual([]);
    expect(aufraeumKandidaten(s, tag(44), um10(tag(44))).entwuerfe).toEqual([entwurf.id]);
    // Eine verlaengerte Frist rettet die Entwuerfe.
    expect(aufraeumKandidaten({ ...s, frist: datum(tag(20)) }, tag(44), um10(tag(44))).entwuerfe).toEqual([]);
  });

  it("die Grenze der Abfrage ist dieselbe Rechnung wie `entwurfLoeschenAb`", () => {
    for (const heute of ["2026-09-26", "2026-10-25", "2026-10-26", "2027-03-01"]) {
      expect(entwurfLoeschenAb(entwurfFaelligBisFrist(heute))).toBe(heute);
    }
  });

  it("der Lauf loescht, bevor der Lauf-Waechter eine Loeschung anmahnt", () => {
    const entwurf = datei();
    const waechterStand = {
      ...stand({ status: "ERLEDIGT" }),
      vorgangEingestellt: false,
      links: [],
      positionen: [{ status: "ENTFAELLT", dateien: [{ status: "ENTWURF", loeschenAb: null, dateiGeloeschtAm: null }] }],
    };
    // Am Faelligkeitstag loescht der Lauf; der Waechter schweigt noch einen Tag darueber hinaus.
    expect(aufraeumKandidaten({ frist: datum(FRIST), dateien: [entwurf] }, tag(44), um10(tag(44))).entwuerfe).toHaveLength(1);
    expect(laufWaechter(waechterStand, tag(44))).toBeNull();
    expect(laufWaechter(waechterStand, tag(45))).toBeNull();
    expect(laufWaechter(waechterStand, tag(46))?.loeschungSeit).toBe(tag(44));
  });
});

describe("entwurfVorhanden — Merker der Erinnerung", () => {
  it("nur Entwuerfe zu wartenden Positionen", () => {
    expect(entwurfVorhanden(stand({ dateien: [datei()] }))).toBe(true);
    expect(entwurfVorhanden(stand({ dateien: [datei({ status: "EINGEREICHT" })] }))).toBe(false);
    expect(
      entwurfVorhanden(stand({ positionen: [{ id: "p-1", status: "EINGEREICHT" }], dateien: [datei()] })),
    ).toBe(false);
  });

  it("nach einem Adresswechsel nur die eigenen (spaeter hochgeladenen) Entwuerfe", () => {
    const wechsel = um10(tag(-6));
    const alt = link({ entwertetAm: wechsel, entwertetGrund: "ADRESSE" });
    expect(entwurfVorhanden(stand({ links: [alt], dateien: [datei({ hochgeladenAm: um10(tag(-8)) })] }))).toBe(false);
    expect(entwurfVorhanden(stand({ links: [alt], dateien: [datei({ hochgeladenAm: um10(tag(-5)) })] }))).toBe(true);
    // „frühere Links sperren" ist kein Adresswechsel.
    const gesperrt = link({ entwertetAm: wechsel, entwertetGrund: "GESPERRT" });
    expect(entwurfVorhanden(stand({ links: [gesperrt], dateien: [datei({ hochgeladenAm: um10(tag(-8)) })] }))).toBe(true);
  });
});

// =============================================
// Die Planung
// =============================================

describe("laufPlanen", () => {
  const kontext = (heute: string, vorgangEingestellt = false) => ({ heute, jetzt: um10(heute), vorgangEingestellt });

  it("hoechstens EINE Mail an die Person: das Nachholen geht der Erinnerung vor", () => {
    const s = stand({ links: [link({ mailStatus: "FAILED", gesendetAm: null, createdAt: um10(tag(-20)) })] });
    // Ohne zugestellte Mail gaebe es ohnehin keine Erinnerung — mit einer frueheren schon:
    const mitFrueherer = stand({
      links: [
        link({ createdAt: um10(tag(-20)), gesendetAm: um10(tag(-20)) }),
        link({ anlass: "FRISTAENDERUNG", mailStatus: "FAILED", gesendetAm: null, createdAt: um10(tag(-10)) }),
      ],
    });
    expect(erinnerungFaellig(mitFrueherer, tag(-3))).toBe("VORAB");
    expect(laufPlanen(mitFrueherer, kontext(tag(-3))).personenMail).toMatchObject({ art: "NACHHOLEN", anlass: "FRISTAENDERUNG" });
    expect(laufPlanen(s, kontext(tag(-3))).personenMail).toMatchObject({ art: "NACHHOLEN" });
  });

  it("Erinnerung samt Merker `entwurf_vorhanden`, dazu die HR-Meldungen", () => {
    const s = stand({ dateien: [datei()], vollstaendigSeit: null });
    expect(laufPlanen(s, kontext(tag(-3)))).toEqual({
      zurueckziehen: false,
      vollstaendigMelden: false,
      personenMail: { art: "ERINNERUNG", stufe: "VORAB", entwurfVorhanden: true },
      fristMelden: false,
      aufraeumen: { dateien: [], entwuerfe: [] },
    });
    expect(laufPlanen(stand(), kontext(tag(2)))).toMatchObject({ personenMail: null, fristMelden: true });
  });

  it("alles uebermittelt → keine Mail an die Person und keine „Frist verstrichen“, aber „vollständig“", () => {
    const s = stand({ positionen: [{ id: "p-1", status: "EINGEREICHT" }], vollstaendigSeit: um10(tag(-4)) });
    for (const heute of [tag(-3), FRIST, tag(2)]) {
      expect(laufPlanen(s, kontext(heute))).toMatchObject({ personenMail: null, fristMelden: false, vollstaendigMelden: true });
    }
  });

  it("Z2: LAUFEND bei eingestelltem Vorgang → zurueckziehen, keine Mail; Entwuerfe loescht das Zurueckziehen", () => {
    const faellig = datei({ status: "ZURUECKGEWIESEN", loeschenAb: um10(tag(40)) });
    const s = stand({
      vollstaendigSeit: um10(tag(-4)),
      links: [link({ mailStatus: "FAILED", gesendetAm: null })],
      dateien: [datei(), faellig],
    });
    expect(laufPlanen(s, kontext(tag(45), true))).toEqual({
      zurueckziehen: true,
      vollstaendigMelden: false,
      personenMail: null,
      fristMelden: false,
      aufraeumen: { dateien: [faellig.id], entwuerfe: [] },
    });
  });

  it("erledigt oder zurueckgezogen: nur aufraeumen — auch bei eingestelltem Vorgang kein Zurueckziehen", () => {
    const entwurf = datei();
    for (const status of ["ERLEDIGT", "ZURUECKGEZOGEN"]) {
      for (const eingestellt of [false, true]) {
        expect(laufPlanen(stand({ status, dateien: [entwurf] }), kontext(tag(44), eingestellt))).toEqual({
          zurueckziehen: false,
          vollstaendigMelden: false,
          personenMail: null,
          fristMelden: false,
          aufraeumen: { dateien: [], entwuerfe: [entwurf.id] },
        });
      }
    }
  });
});
