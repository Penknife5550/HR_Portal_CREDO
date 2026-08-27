/**
 * Tests fuer die BA-Betriebsnummer (AP 8).
 *
 * Die Nummer steht im Arbeitgeberteil beider Antragsanlagen. Faellt sie falsch
 * oder leer aus, ist der Antrag als Nachweis in den Entgeltunterlagen wertlos.
 * Geprueft wird deshalb beides: dass Gueltiges durchkommt — auch die aelteren
 * Nummern ohne gueltige Pruefziffer — und dass Ungueltiges haengen bleibt.
 */

import {
  BETRIEBSNUMMER_FORMAT_FEHLER,
  BETRIEBSNUMMER_LAENGE,
  betriebsnummerFehltText,
  formatiereBetriebsnummer,
  istGueltigeBetriebsnummer,
  normalisiereBetriebsnummer,
  pruefeBetriebsnummerEingabe,
} from "@/lib/betriebsnummer";

describe("Format", () => {
  it("akzeptiert genau acht Ziffern", () => {
    expect(istGueltigeBetriebsnummer("12345678")).toBe(true);
    expect(BETRIEBSNUMMER_LAENGE).toBe(8);
  });

  it("akzeptiert fuehrende Nullen", () => {
    // Deshalb String und nicht Int: 01234567 waere als Zahl 1234567.
    expect(istGueltigeBetriebsnummer("01234567")).toBe(true);
    expect(istGueltigeBetriebsnummer("00000001")).toBe(true);
  });

  it("weist zu kurze und zu lange Nummern ab", () => {
    expect(istGueltigeBetriebsnummer("1234567")).toBe(false);
    expect(istGueltigeBetriebsnummer("123456789")).toBe(false);
    expect(istGueltigeBetriebsnummer("")).toBe(false);
  });

  it("weist Buchstaben ab", () => {
    expect(istGueltigeBetriebsnummer("1234567A")).toBe(false);
    expect(istGueltigeBetriebsnummer("ABCDEFGH")).toBe(false);
  });

  it("rechnet keine Pruefziffer nach", () => {
    // Absicht: Die Pruefziffer gilt erst fuer neuere Vergaben. Wuerde sie
    // erzwungen, fiele die echte Nummer eines langjaehrigen Schultraegers durch
    // und blockierte genau die Antragserzeugung, die geschuetzt werden soll.
    expect(istGueltigeBetriebsnummer("11111111")).toBe(true);
    expect(istGueltigeBetriebsnummer("99999999")).toBe(true);
  });
});

describe("Normalisierung", () => {
  it("entfernt die ueblichen Trennzeichen", () => {
    expect(normalisiereBetriebsnummer("1234 5678")).toBe("12345678");
    expect(normalisiereBetriebsnummer("1234-5678")).toBe("12345678");
    expect(normalisiereBetriebsnummer("1234.5678")).toBe("12345678");
    expect(normalisiereBetriebsnummer("12/34/5678")).toBe("12345678");
  });

  it("laesst eine saubere Nummer unveraendert", () => {
    expect(normalisiereBetriebsnummer("12345678")).toBe("12345678");
  });
});

describe("Eingabepruefung", () => {
  it("speichert normalisiert, nicht wie getippt", () => {
    // Sonst greift `if (!betriebsnummer)` zwar, aber das Leerzeichen landet im
    // Kaestchenfeld des amtlichen Vordrucks.
    const r = pruefeBetriebsnummerEingabe(" 1234 5678 ");
    expect(r).toEqual({ ok: true, wert: "12345678" });
  });

  it("macht aus leer ein null, nie einen Leerstring", () => {
    for (const leer of ["", "   ", null, undefined]) {
      expect(pruefeBetriebsnummerEingabe(leer)).toEqual({ ok: true, wert: null });
    }
  });

  it("meldet ein falsches Format mit Klartext", () => {
    const r = pruefeBetriebsnummerEingabe("123");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehler).toBe(BETRIEBSNUMMER_FORMAT_FEHLER);
  });

  it("weist Nicht-Zeichenketten ab", () => {
    expect(pruefeBetriebsnummerEingabe(12345678).ok).toBe(false);
  });
});

describe("Meldungen", () => {
  it("nennt im Sperrtext den Mandanten und den Weg zur Korrektur", () => {
    const text = betriebsnummerFehltText("Gymnasium Minden");
    expect(text).toContain("Gymnasium Minden");
    expect(text).toContain("Mandanten");
    // Kein Paragrafenzitat: Diesen Text liest HR, nicht ein Jurist.
    expect(text).not.toMatch(/§|SGB/);
  });

  it("zeigt eine fehlende Nummer als Gedankenstrich", () => {
    expect(formatiereBetriebsnummer(null)).toBe("—");
    expect(formatiereBetriebsnummer("")).toBe("—");
    expect(formatiereBetriebsnummer("12345678")).toBe("12345678");
  });
});
