/**
 * Tests: Individuelle E-Mail — reine Regeln (src/lib/individuelle-mail.ts)
 */
import {
  INDIVIDUELLE_MAIL_AUDIT,
  INDIVIDUELLE_MAIL_AUDIT_LABELS,
  MAX_ANHAENGE,
  MAX_ANHAENGE_BYTES,
  MAX_ANFRAGE_BYTES,
  MAX_BETREFF_ZEICHEN,
  MAX_NACHRICHT_ZEICHEN,
  MELDUNGEN,
  anhangZahlText,
  dateiVorpruefen,
  endungErlaubt,
  istIndividuelleMailModul,
  kurzstand,
  pruefsummeKurz,
  sendenGesperrtGrund,
  statusFuerMailFehler,
  type IndividuelleMailVerlaufZeile,
} from "@/lib/individuelle-mail";

const gut = {
  empfaenger: "anna@example.org",
  empfaengerErlaubt: true,
  betreff: "Ihr Vertrag",
  nachricht: "Guten Tag",
  dateien: [] as { size: number; fehler: string | null }[],
};

describe("Grenzen", () => {
  it("9 MB Anhaenge, 10 Dateien, Anfrage knapp darueber und unter den 10 MiB der Middleware", () => {
    expect(MAX_ANHAENGE).toBe(10);
    expect(MAX_ANHAENGE_BYTES).toBe(9 * 1024 * 1024);
    expect(MAX_ANFRAGE_BYTES).toBeGreaterThan(MAX_ANHAENGE_BYTES);
    expect(MAX_ANFRAGE_BYTES).toBeLessThan(10 * 1024 * 1024);
  });

  it("Module: die vier des Dokumentenpakets, nicht Elternzeit, Mutterschutz, BEM", () => {
    for (const m of ["ONBOARDING", "OFFBOARDING", "VERBEAMTUNG", "VERTRAGSVERLAENGERUNG"]) {
      expect(istIndividuelleMailModul(m)).toBe(true);
    }
    for (const m of ["ELTERNZEIT", "MUTTERSCHUTZ", "BEM", "", null, 1]) {
      expect(istIndividuelleMailModul(m)).toBe(false);
    }
  });
});

describe("Vorpruefung im Dialog", () => {
  it("Endungen: PDF und Bilder ja, Word nein — unabhaengig von der Schreibweise", () => {
    expect(endungErlaubt("Vertrag.PDF")).toBe(true);
    expect(endungErlaubt("foto.jpeg")).toBe(true);
    expect(endungErlaubt("x.webp")).toBe(true);
    expect(endungErlaubt("Fahrtkosten.docx")).toBe(false);
    expect(endungErlaubt("pdf")).toBe(false);
  });

  it("dateiVorpruefen: leer und falscher Typ mit Text, sonst null", () => {
    expect(dateiVorpruefen({ name: "a.pdf", size: 0 })).toBe(MELDUNGEN.leer);
    expect(dateiVorpruefen({ name: "a.docx", size: 10 })).toBe(MELDUNGEN.typNichtErlaubt);
    expect(dateiVorpruefen({ name: "a.pdf", size: 10 })).toBeNull();
  });

  it("sendenGesperrtGrund: alles da → null", () => {
    expect(sendenGesperrtGrund(gut)).toBeNull();
  });

  it.each([
    [{ empfaenger: "keine-adresse" }, MELDUNGEN.adresseUngueltig],
    [{ empfaengerErlaubt: false }, MELDUNGEN.adresseNichtFreigegeben],
    [{ betreff: "  " }, MELDUNGEN.betreffFehlt],
    [{ betreff: "x".repeat(MAX_BETREFF_ZEICHEN + 1) }, MELDUNGEN.betreffZuLang],
    [{ nachricht: "" }, MELDUNGEN.nachrichtFehlt],
    [{ nachricht: "x".repeat(MAX_NACHRICHT_ZEICHEN + 1) }, MELDUNGEN.nachrichtZuLang],
    [{ dateien: Array.from({ length: 11 }, () => ({ size: 1, fehler: null })) }, MELDUNGEN.zuVieleAnhaenge],
    [{ dateien: [{ size: 5, fehler: MELDUNGEN.typNichtErlaubt }] }, MELDUNGEN.typNichtErlaubt],
    [{ dateien: [{ size: MAX_ANHAENGE_BYTES, fehler: null }, { size: 1, fehler: null }] }, MELDUNGEN.zuGross],
  ])("sperrt bei %o", (aenderung, grund) => {
    expect(sendenGesperrtGrund({ ...gut, ...aenderung })).toBe(grund);
  });

  it("genau an der Grenze ist erlaubt", () => {
    expect(sendenGesperrtGrund({ ...gut, dateien: [{ size: MAX_ANHAENGE_BYTES, fehler: null }] })).toBeNull();
  });
});

describe("Statuscodes", () => {
  it.each([
    ["VORGANG_NICHT_GEFUNDEN", 404],
    ["EINGABE_UNGUELTIG", 400],
    ["DATEI_UNGUELTIG", 400],
    ["DATEITYP", 415],
    ["ZU_GROSS", 413],
    ["EMPFAENGER_NICHT_ERLAUBT", 409],
    ["VERSAND_LAEUFT", 409],
    ["VORLAGE_AUS", 409],
    ["VERSAND", 502],
  ] as const)("%s → %i", (fehler, status) => {
    expect(statusFuerMailFehler(fehler)).toBe(status);
  });
});

describe("Anzeige", () => {
  const zeile = (extra: Partial<IndividuelleMailVerlaufZeile> = {}): IndividuelleMailVerlaufZeile => ({
    id: "m1",
    gesendetAm: "2026-09-21T12:05:00.000Z",
    empfaenger: "anna@example.org",
    empfaengerAbweichend: false,
    betreff: "Ihr unterschriebener Arbeitsvertrag",
    gesendetVon: "Erika Muster",
    anhaenge: [
      { id: "a1", dateiname: "a.pdf", groesse: 1, sha256: "x", verfuegbar: true },
      { id: "a2", dateiname: "b.png", groesse: 1, sha256: "y", verfuegbar: true },
    ],
    inhaltGeloescht: false,
    ...extra,
  });

  it("Kurzstand ohne Verlauf", () => {
    expect(kurzstand([])).toBe("Noch keine individuelle E-Mail versendet");
  });

  it("Kurzstand nennt deutsche Zeit, Adresse, Betreff und Anhaenge", () => {
    expect(kurzstand([zeile()])).toBe(
      "Zuletzt am 21.09.2026, 14:05 an anna@example.org – „Ihr unterschriebener Arbeitsvertrag“ · 2 Anhänge",
    );
    expect(kurzstand([zeile({ anhaenge: [] }), zeile()])).toContain("ohne Anhang (insgesamt 2)");
  });

  it("Anhangzahl und gekuerzte Pruefsumme", () => {
    expect(anhangZahlText(1)).toBe("1 Anhang");
    expect(anhangZahlText(3)).toBe("3 Anhänge");
    expect(pruefsummeKurz("a3f9000000000000c21e")).toBe("a3f9…c21e");
  });

  it("jede Protokoll-Aktion hat eine Beschriftung", () => {
    for (const code of Object.values(INDIVIDUELLE_MAIL_AUDIT)) {
      expect(INDIVIDUELLE_MAIL_AUDIT_LABELS[code]).toBeTruthy();
    }
  });
});
