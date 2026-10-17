/**
 * Tests: Zod-Schema des Stammabgleichs aus DokuBit
 * (src/lib/validations/personalstamm.ts, Self-Service S0)
 *
 * Ohne Datenbank — geprueft wird, wie eine Zeile aus n8n/MS SQL normalisiert
 * wird: Zahl oder Text bei Mandant, Abrechnungskreis, MANR und Stunden,
 * fuehrende Nullen, echte Kalendertage, der Pflichtschluessel `vertragsende`,
 * die Adresse als Personenschluessel, keine Steuerzeichen, keine einzelnen
 * UTF-16-Surrogate und die feste Spaltenliste (`.strip()`).
 */

import { personalstammEintragSchema, schluesselAusRohzeile } from "@/lib/validations/personalstamm";

function zeile(ueber: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    mandantNummer: "742",
    abrechnungskreis: "01",
    personalNr: "1001",
    vorname: "Anna",
    nachname: "Beispiel",
    email: "anna.beispiel@fes-minden.de",
    teilzeitstunden: 20,
    vertragsbeginn: "2024-08-01",
    vertragsende: null,
    ...ueber,
  };
}

function parse(ueber: Record<string, unknown> = {}) {
  return personalstammEintragSchema.safeParse(zeile(ueber));
}

/** Pfad des ersten Fehlers — so meldet ihn der Abgleich (`feld`). */
function fehlerPfad(ueber: Record<string, unknown>): string {
  const r = parse(ueber);
  if (r.success) throw new Error("Zeile haette scheitern muessen");
  return r.error.issues[0].path.join(".");
}

describe("Zahl oder Text", () => {
  it("nimmt Mandant, Abrechnungskreis und MANR als Zahl und liefert Text", () => {
    const r = parse({ mandantNummer: 742, abrechnungskreis: 1, personalNr: 1001 });
    expect(r.success && r.data).toMatchObject({ mandantNummer: "742", abrechnungskreis: "1", personalNr: "1001" });
  });

  it("trimmt Abrechnungskreis und MANR", () => {
    const r = parse({ abrechnungskreis: " 01 ", personalNr: " 1001 " });
    expect(r.success && r.data).toMatchObject({ abrechnungskreis: "01", personalNr: "1001" });
  });

  it.each([
    [25.5, 25.5],
    ["25,5", 25.5],
    ["25.5", 25.5],
    [" 20 ", 20],
    [0, 0],
  ])("Stunden %p ergeben %p", (eingabe, erwartet) => {
    const r = parse({ teilzeitstunden: eingabe });
    expect(r.success && r.data.teilzeitstunden).toBe(erwartet);
  });

  it.each([null, undefined, ""])("Stunden %p ergeben null", (eingabe) => {
    const r = parse({ teilzeitstunden: eingabe });
    expect(r.success).toBe(true);
    expect(r.success && r.data.teilzeitstunden).toBeNull();
  });

  it("fehlende Stunden ergeben null", () => {
    const roh = zeile();
    delete roh.teilzeitstunden;
    const r = personalstammEintragSchema.safeParse(roh);
    expect(r.success && r.data.teilzeitstunden).toBeNull();
  });

  it.each(["abc", "25,5h", 81, -1, "-1"])("Stunden %p scheitern", (eingabe) => {
    expect(fehlerPfad({ teilzeitstunden: eingabe })).toBe("teilzeitstunden");
  });

  it("leere MANR oder leerer Abrechnungskreis scheitern", () => {
    expect(fehlerPfad({ personalNr: "  " })).toBe("personalNr");
    expect(fehlerPfad({ abrechnungskreis: "" })).toBe("abrechnungskreis");
  });

  it("Laengengrenzen: MANR 20, Abrechnungskreis 50 Zeichen", () => {
    expect(parse({ personalNr: "1".repeat(20), abrechnungskreis: "A".repeat(50) }).success).toBe(true);
    expect(fehlerPfad({ personalNr: "1".repeat(21) })).toBe("personalNr");
    expect(fehlerPfad({ abrechnungskreis: "A".repeat(51) })).toBe("abrechnungskreis");
  });
});

describe("Mandantennummer", () => {
  it.each([
    ["0742", "742"],
    [" 0742 ", "742"],
    [742, "742"],
    ["742", "742"],
  ])("%p ergibt %p", (eingabe, erwartet) => {
    const r = parse({ mandantNummer: eingabe });
    expect(r.success && r.data.mandantNummer).toBe(erwartet);
  });

  it.each(["abc", "", "0", "1234567", "74 2"])("%p scheitert", (eingabe) => {
    expect(fehlerPfad({ mandantNummer: eingabe })).toBe("mandantNummer");
  });
});

describe("Datumsangaben", () => {
  it("2026-02-31 ist kein Kalendertag", () => {
    expect(fehlerPfad({ vertragsbeginn: "2026-02-31" })).toBe("vertragsbeginn");
    expect(fehlerPfad({ vertragsende: "2026-02-31" })).toBe("vertragsende");
  });

  it("ISO-Zeitstempel ergeben den Kalendertag der ersten 10 Zeichen", () => {
    const r = parse({ vertragsbeginn: "2026-07-31T00:00:00.000Z", vertragsende: "2026-12-31T00:00:00" });
    expect(r.success && r.data).toMatchObject({ vertragsbeginn: "2026-07-31", vertragsende: "2026-12-31" });
  });

  it("vertragsbeginn ist Pflicht", () => {
    const roh = zeile();
    delete roh.vertragsbeginn;
    expect(personalstammEintragSchema.safeParse(roh).success).toBe(false);
  });

  it("fehlender Schluessel vertragsende scheitert, null ist erlaubt", () => {
    const roh = zeile();
    delete roh.vertragsende;
    const r = personalstammEintragSchema.safeParse(roh);
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues[0].path.join(".")).toBe("vertragsende");

    const unbefristet = parse({ vertragsende: null });
    expect(unbefristet.success && unbefristet.data.vertragsende).toBeNull();
  });

  it("leeres vertragsende ist kein „unbefristet“", () => {
    expect(fehlerPfad({ vertragsende: "" })).toBe("vertragsende");
  });
});

describe("Adresse", () => {
  it("wird getrimmt und kleingeschrieben", () => {
    const r = parse({ email: "  Anna.Beispiel@FES-Minden.de " });
    expect(r.success && r.data.email).toBe("anna.beispiel@fes-minden.de");
  });

  it.each([null, undefined, "", "   "])("%p ergibt null", (eingabe) => {
    const r = parse({ email: eingabe });
    expect(r.success).toBe(true);
    expect(r.success && r.data.email).toBeNull();
  });

  it("eine ungueltige Adresse laesst die ganze Zeile scheitern", () => {
    expect(fehlerPfad({ email: "anna.beispiel" })).toBe("email");
    expect(fehlerPfad({ email: "anna@" })).toBe("email");
  });
});

describe("Namen", () => {
  it("werden getrimmt und sind Pflicht", () => {
    const r = parse({ vorname: " Anna ", nachname: " Beispiel " });
    expect(r.success && r.data).toMatchObject({ vorname: "Anna", nachname: "Beispiel" });
    expect(fehlerPfad({ vorname: "  " })).toBe("vorname");
    expect(fehlerPfad({ nachname: undefined })).toBe("nachname");
  });

  it("hoechstens 100 Zeichen", () => {
    expect(parse({ vorname: "A".repeat(100), nachname: "B".repeat(100) }).success).toBe(true);
    expect(fehlerPfad({ vorname: "A".repeat(101) })).toBe("vorname");
    expect(fehlerPfad({ nachname: "B".repeat(101) })).toBe("nachname");
  });
});

describe("Steuerzeichen (U+0000–U+001F)", () => {
  it.each([
    ["personalNr", "10\u000001"],
    ["personalNr", "\u00002002"],
    ["abrechnungskreis", "0\u00001"],
    ["vorname", "An\u0000na"],
    ["nachname", "Bei\u001Fspiel"],
    ["nachname", "Bei\nspiel"],
  ])("in %s sind ein Formatfehler (%j)", (feld, wert) => {
    expect(fehlerPfad({ [feld]: wert })).toBe(feld);
  });

  it("am Rand werden Leerraum-Steuerzeichen weggetrimmt", () => {
    const r = parse({ personalNr: "1001\t", vorname: "\nAnna " });
    expect(r.success && r.data).toMatchObject({ personalNr: "1001", vorname: "Anna" });
  });
});

describe("Einzelne UTF-16-Surrogate (Prisma lehnt sie ab)", () => {
  it.each([
    ["personalNr", "10\uD80001"],
    ["abrechnungskreis", "0\uDC001"],
    ["vorname", "Anna\uD83D"],
    ["nachname", "\uDE00Beispiel"],
  ])("in %s sind ein Formatfehler (%j)", (feld, wert) => {
    expect(fehlerPfad({ [feld]: wert })).toBe(feld);
  });

  it("ein vollstaendiges Paar (etwa ein Emoji) ist erlaubt", () => {
    const r = parse({ nachname: "Beispiel \uD83D\uDE00" });
    expect(r.success && r.data.nachname).toBe("Beispiel \uD83D\uDE00");
  });
});

describe(".strip()", () => {
  it("verwirft unbekannte Felder (feste Spaltenliste, auch EVTLLDA)", () => {
    const r = parse({ evtlLda: "2026-01-01", MASTATUS: "A", geburtsdatum: "1980-01-01" });
    expect(r.success).toBe(true);
    expect(r.success && Object.keys(r.data).sort()).toEqual(
      [
        "abrechnungskreis",
        "email",
        "mandantNummer",
        "nachname",
        "personalNr",
        "teilzeitstunden",
        "vertragsbeginn",
        "vertragsende",
        "vorname",
      ].sort(),
    );
  });
});

describe("schluesselAusRohzeile", () => {
  it("liefert mandant|ak|manr normalisiert, auch wenn der Rest der Zeile kaputt ist", () => {
    expect(schluesselAusRohzeile(zeile({ mandantNummer: "0742", personalNr: 1001, vertragsbeginn: "kaputt" }))).toBe(
      "742|01|1001",
    );
  });

  it("entfernt Steuerzeichen — der Schluessel einer kaputten Zeile geht ins Protokoll (jsonb)", () => {
    expect(schluesselAusRohzeile(zeile({ personalNr: "10\u000001", abrechnungskreis: "\u001F01" }))).toBe("742|01|1001");
    expect(schluesselAusRohzeile(zeile({ personalNr: "\u0000" }))).toBeNull();
  });

  it("entfernt einzelne Surrogate — sonst scheiterte der Lauf-Eintrag an Prisma", () => {
    expect(schluesselAusRohzeile(zeile({ personalNr: "10\uD80001", abrechnungskreis: "0\uDC001" }))).toBe("742|01|1001");
  });

  it("liefert null, wenn ein Teil nicht lesbar ist", () => {
    expect(schluesselAusRohzeile(zeile({ personalNr: undefined }))).toBeNull();
    expect(schluesselAusRohzeile(zeile({ mandantNummer: "abc" }))).toBeNull();
    expect(schluesselAusRohzeile(zeile({ abrechnungskreis: { x: 1 } }))).toBeNull();
    expect(schluesselAusRohzeile("keine Zeile")).toBeNull();
    expect(schluesselAusRohzeile(null)).toBeNull();
  });
});
