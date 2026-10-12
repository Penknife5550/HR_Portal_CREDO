/**
 * Tests: Validierung des Katalogs „Ausstattung & Zugänge“
 * (src/lib/validations/ausstattung.ts, Feinplan 1.4 und S2)
 *
 * Zod prueft die Form; die Felder gegeneinander prueft positionPruefen
 * (ausstattung.test.ts). Kernfall von S2: Die Stufe-2-Felder
 * (ausgabeKennung, rueckgabeKategorie, beiAustritt) und vorschlagSchluessel
 * kommen im geparsten Ergebnis nie an — weder beim Anlegen noch beim Aendern.
 */

import {
  GRENZEN,
  KATALOG_FELDER,
  MELDUNGEN,
  REIHENFOLGE_MAX,
  VORSCHLAEGE,
  positionPruefen,
  type PositionEntwurf,
} from "@/lib/ausstattung";
import {
  ID_MAX,
  arbeitsortSchema,
  ausblendungSchema,
  freitextNormalisieren,
  katalogPositionAenderungSchema,
  katalogPositionSchema,
} from "@/lib/validations/ausstattung";
import { onboardingAnlegenSchema } from "@/lib/validations/onboarding";

function fehler(ergebnis: { success: boolean; error?: { errors: { message: string }[] } }): string | undefined {
  return ergebnis.success ? undefined : ergebnis.error?.errors[0]?.message;
}

const MINIMAL = { departmentKey: "IT", art: "JA_NEIN", bezeichnung: "Dienst-iPad (Lernmittel)" };

const STUFE2_UND_VORSCHLAG = {
  ausgabeKennung: "Inventarnummer",
  rueckgabeKategorie: "IT_GERAET",
  beiAustritt: "RUECKGABE",
  vorschlagSchluessel: "IT_IPAD",
};

// =============================================
// Anlegen (POST)
// =============================================

describe("katalogPositionSchema", () => {
  it("fuellt fehlende Felder mit ihrem Leerwert; das Ergebnis ist ein PositionEntwurf", () => {
    const geparst = katalogPositionSchema.parse({ ...MINIMAL, bezeichnung: "  Dienst-iPad (Lernmittel)  " });
    expect(geparst).toEqual({
      departmentKey: "IT",
      organizationId: null,
      einrichtungsarten: [],
      art: "JA_NEIN",
      angabeSchluessel: null,
      bezeichnung: "Dienst-iPad (Lernmittel)",
      hinweisFuehrungskraft: null,
      hinweisStelle: null,
      optionen: [],
      vorausgewaehlt: false,
      vorausgewaehlteOptionen: [],
      bemerkungAnbieten: true,
      bemerkungPlatzhalter: null,
      aufgabeTitel: null,
      defaultDueDays: null,
      personengruppen: [],
      sichtbarFuer: [],
      entgeltrelevant: false,
      orderIndex: 0,
    });
    // Typpruefung: das geparste Ergebnis passt ohne Umweg in positionPruefen
    const entwurf: PositionEntwurf = geparst;
    expect(positionPruefen(entwurf)).toBeNull();
  });

  it("A4-Felder und vorschlagSchluessel im Body kommen nicht im geparsten Ergebnis an", () => {
    const geparst = katalogPositionSchema.parse({ ...MINIMAL, ...STUFE2_UND_VORSCHLAG });
    for (const feld of Object.keys(STUFE2_UND_VORSCHLAG)) expect(geparst).not.toHaveProperty(feld);
  });

  it("isActive wird beim Anlegen ignoriert (neue Positionen sind aus, Regel 1)", () => {
    const geparst = katalogPositionSchema.parse({ ...MINIMAL, isActive: true });
    expect(geparst).not.toHaveProperty("isActive");
  });

  it("bemerkungAnbieten: Standard ja, bei einer Angabe nein; ein gesetzter Wert bleibt", () => {
    const angabe = { departmentKey: "FACILITY", art: "ANGABE", angabeSchluessel: "UNTERRICHTSFAECHER", bezeichnung: "Unterrichtsfächer" };
    expect(katalogPositionSchema.parse(angabe).bemerkungAnbieten).toBe(false);
    expect(positionPruefen(katalogPositionSchema.parse(angabe))).toBeNull();
    expect(katalogPositionSchema.parse({ ...angabe, bemerkungAnbieten: true }).bemerkungAnbieten).toBe(true);
    expect(katalogPositionSchema.parse({ ...MINIMAL, bemerkungAnbieten: false }).bemerkungAnbieten).toBe(false);
  });

  it("leere Texte werden null, Freitexte auf \\n normalisiert und getrimmt (vor der Laengenpruefung)", () => {
    const geparst = katalogPositionSchema.parse({
      ...MINIMAL,
      organizationId: "",
      angabeSchluessel: "",
      hinweisFuehrungskraft: "   ",
      hinweisStelle: "  Zeile 1\r\nZeile 2\rZeile 3  ",
      bemerkungPlatzhalter: "",
      aufgabeTitel: null,
      defaultDueDays: "",
    });
    expect(geparst).toMatchObject({
      organizationId: null,
      angabeSchluessel: null,
      hinweisFuehrungskraft: null,
      hinweisStelle: "Zeile 1\nZeile 2\nZeile 3",
      bemerkungPlatzhalter: null,
      aufgabeTitel: null,
      defaultDueDays: null,
    });
    // 500 Zeichen mit \n gezaehlt sind erlaubt, auch wenn der Browser \r\n schickt
    const halb = GRENZEN.hinweisStelle / 2;
    const roh = `${"x".repeat(halb - 1)}\r\n${"x".repeat(halb)}`; // 501 Zeichen roh, 500 normalisiert
    expect(roh.length).toBe(GRENZEN.hinweisStelle + 1);
    expect(katalogPositionSchema.parse({ ...MINIMAL, hinweisStelle: roh }).hinweisStelle).toHaveLength(
      GRENZEN.hinweisStelle,
    );
    expect(fehler(katalogPositionSchema.safeParse({ ...MINIMAL, hinweisStelle: "x".repeat(GRENZEN.hinweisStelle + 1) }))).toBe(
      MELDUNGEN.HINWEIS_STELLE_ZU_LANG,
    );
  });

  it("einzeilige Texte: keine spitzen Klammern, kein Zeilenumbruch, kein Steuerzeichen", () => {
    expect(fehler(katalogPositionSchema.safeParse({ ...MINIMAL, bezeichnung: "<b>iPad</b>" }))).toBe(MELDUNGEN.OHNE_KLAMMERN);
    expect(fehler(katalogPositionSchema.safeParse({ ...MINIMAL, bezeichnung: "iPad\nmit Stift" }))).toBe(
      MELDUNGEN.OHNE_KLAMMERN,
    );
    expect(fehler(katalogPositionSchema.safeParse({ ...MINIMAL, aufgabeTitel: "Titel\u0007" }))).toBe(MELDUNGEN.OHNE_KLAMMERN);
    expect(
      fehler(katalogPositionSchema.safeParse({ ...MINIMAL, art: "AUSWAHL", optionen: ["Haupteingang", "Raum <1>"] })),
    ).toBe(MELDUNGEN.OHNE_KLAMMERN);
    expect(fehler(katalogPositionSchema.safeParse({ ...MINIMAL, bemerkungPlatzhalter: "z. B.\tStift" }))).toBe(
      MELDUNGEN.OHNE_KLAMMERN,
    );
  });

  it("mehrzeilige Hinweise: Zeilenumbruch und Tabulator ja, andere Steuerzeichen nein, spitze Klammern ja", () => {
    expect(katalogPositionSchema.parse({ ...MINIMAL, hinweisStelle: "a\n\tb <c>" }).hinweisStelle).toBe("a\n\tb <c>");
    expect(fehler(katalogPositionSchema.safeParse({ ...MINIMAL, hinweisStelle: "a\u0000b" }))).toBe(MELDUNGEN.STEUERZEICHEN);
    expect(fehler(katalogPositionSchema.safeParse({ ...MINIMAL, hinweisFuehrungskraft: "a\u001bb" }))).toBe(
      MELDUNGEN.STEUERZEICHEN,
    );
  });

  it("Pflichtfelder und Laengen", () => {
    expect(fehler(katalogPositionSchema.safeParse({ ...MINIMAL, bezeichnung: "   " }))).toBe(MELDUNGEN.BEZEICHNUNG_FEHLT);
    expect(fehler(katalogPositionSchema.safeParse({ departmentKey: "IT", art: "JA_NEIN" }))).toBe(MELDUNGEN.BEZEICHNUNG_FEHLT);
    expect(
      fehler(katalogPositionSchema.safeParse({ ...MINIMAL, bezeichnung: "x".repeat(GRENZEN.bezeichnung + 1) })),
    ).toBe(MELDUNGEN.BEZEICHNUNG_ZU_LANG);
    expect(
      fehler(katalogPositionSchema.safeParse({ ...MINIMAL, art: "AUSWAHL", optionen: ["x".repeat(GRENZEN.option + 1)] })),
    ).toBe(MELDUNGEN.OPTION_ZU_LANG);
    expect(fehler(katalogPositionSchema.safeParse({ ...MINIMAL, art: "AUSWAHL", optionen: ["  "] }))).toBe(
      MELDUNGEN.OPTION_LEER,
    );
    const viele = Array.from({ length: GRENZEN.optionen + 1 }, (_, i) => `Raum ${i}`);
    expect(fehler(katalogPositionSchema.safeParse({ ...MINIMAL, art: "AUSWAHL", optionen: viele }))).toBe(
      MELDUNGEN.OPTIONEN_ZU_VIELE,
    );
    expect(
      fehler(
        katalogPositionSchema.safeParse({
          ...MINIMAL,
          bemerkungPlatzhalter: "x".repeat(GRENZEN.bemerkungPlatzhalter + 1),
        }),
      ),
    ).toBe(MELDUNGEN.PLATZHALTER_ZU_LANG);
    expect(
      fehler(katalogPositionSchema.safeParse({ ...MINIMAL, aufgabeTitel: "x".repeat(GRENZEN.aufgabeTitel + 1) })),
    ).toBe(MELDUNGEN.AUFGABENTITEL_ZU_LANG);
    expect(
      fehler(
        katalogPositionSchema.safeParse({
          ...MINIMAL,
          hinweisFuehrungskraft: "x".repeat(GRENZEN.hinweisFuehrungskraft + 1),
        }),
      ),
    ).toBe(MELDUNGEN.HINWEIS_FUEHRUNGSKRAFT_ZU_LANG);
  });

  it("Optionen werden getrimmt", () => {
    const geparst = katalogPositionSchema.parse({
      ...MINIMAL,
      art: "AUSWAHL",
      optionen: [" Haupteingang ", "Lehrerzimmer"],
      vorausgewaehlteOptionen: [" Haupteingang"],
    });
    expect(geparst.optionen).toEqual(["Haupteingang", "Lehrerzimmer"]);
    expect(geparst.vorausgewaehlteOptionen).toEqual(["Haupteingang"]);
    expect(positionPruefen(geparst)).toBeNull();
  });

  it("Wertlisten nur aus den Konstanten", () => {
    expect(fehler(katalogPositionSchema.safeParse({ ...MINIMAL, art: "FREI" }))).toBe(MELDUNGEN.ART_UNBEKANNT);
    expect(fehler(katalogPositionSchema.safeParse({ departmentKey: "IT", bezeichnung: "x" }))).toBe(MELDUNGEN.ART_UNBEKANNT);
    expect(fehler(katalogPositionSchema.safeParse({ ...MINIMAL, einrichtungsarten: ["SCHLOSS"] }))).toBe(
      MELDUNGEN.EINRICHTUNGSART_UNBEKANNT,
    );
    expect(fehler(katalogPositionSchema.safeParse({ ...MINIMAL, personengruppen: ["LEHRKRAFT"] }))).toBe(
      MELDUNGEN.PERSONENGRUPPE_UNBEKANNT,
    );
    expect(
      fehler(katalogPositionSchema.safeParse({ ...MINIMAL, art: "ANGABE", angabeSchluessel: "RELIGION", bezeichnung: "Religion" })),
    ).toBe(MELDUNGEN.ANGABE_UNBEKANNT);
  });

  it("die Stelle hat die Form eines Abteilungsschluessels (schluesselFeld); erlaubt ist sie erst nach positionPruefen", () => {
    expect(katalogPositionSchema.parse({ ...MINIMAL, departmentKey: " FACILITY " }).departmentKey).toBe("FACILITY");
    expect(fehler(katalogPositionSchema.safeParse({ ...MINIMAL, departmentKey: "it" }))).toMatch(/Großbuchstaben/);
    expect(fehler(katalogPositionSchema.safeParse({ ...MINIMAL, departmentKey: "" }))).toBe("Bitte einen Schlüssel angeben.");
    const vorgesetzter = katalogPositionSchema.parse({ ...MINIMAL, departmentKey: "VORGESETZTER" });
    expect(positionPruefen(vorgesetzter)).toBe(MELDUNGEN.STELLE_NICHT_ERLAUBT);
    expect(fehler(katalogPositionSchema.safeParse({ ...MINIMAL, art: "ANGABE", sichtbarFuer: ["it"] }))).toMatch(
      /Großbuchstaben/,
    );
  });

  it("Doppelte in Einrichtungsarten, Personengruppen, „Sichtbar für“ und Vorauswahl fallen weg", () => {
    const geparst = katalogPositionSchema.parse({
      ...MINIMAL,
      einrichtungsarten: ["KITA", "KITA", "GRUNDSCHULE"],
      personengruppen: ["BEAMTE", "STANDARD", "BEAMTE"],
    });
    expect(geparst.einrichtungsarten).toEqual(["KITA", "GRUNDSCHULE"]);
    expect(geparst.personengruppen).toEqual(["BEAMTE", "STANDARD"]);
    const angabe = katalogPositionSchema.parse({
      departmentKey: "FACILITY",
      art: "ANGABE",
      angabeSchluessel: "UNTERRICHTSFAECHER",
      bezeichnung: "Unterrichtsfächer",
      sichtbarFuer: ["IT", "IT"],
    });
    expect(angabe.sichtbarFuer).toEqual(["IT"]);
    const auswahl = katalogPositionSchema.parse({
      ...MINIMAL,
      art: "AUSWAHL",
      optionen: ["A", "B"],
      vorausgewaehlteOptionen: ["A", "A"],
    });
    expect(auswahl.vorausgewaehlteOptionen).toEqual(["A"]);
  });

  it("Faelligkeit und Reihenfolge: ganze Zahlen in ihren Grenzen", () => {
    expect(katalogPositionSchema.parse({ ...MINIMAL, defaultDueDays: -365 }).defaultDueDays).toBe(-365);
    for (const tage of [366, -366, 1.5, "abc"]) {
      expect(fehler(katalogPositionSchema.safeParse({ ...MINIMAL, defaultDueDays: tage }))).toBe(MELDUNGEN.FAELLIG_UNGUELTIG);
    }
    expect(katalogPositionSchema.parse({ ...MINIMAL, orderIndex: REIHENFOLGE_MAX }).orderIndex).toBe(REIHENFOLGE_MAX);
    for (const r of [REIHENFOLGE_MAX + 1, -1, 2.5]) {
      expect(fehler(katalogPositionSchema.safeParse({ ...MINIMAL, orderIndex: r }))).toBe(MELDUNGEN.REIHENFOLGE_UNGUELTIG);
    }
  });

  it("kein Objekt: deutsche Meldung", () => {
    for (const body of [undefined, null, [], 5, "x"]) {
      expect(fehler(katalogPositionSchema.safeParse(body))).toBe("Ungültige Eingabe");
    }
  });

  it("falscher Typ: deutsche Meldung statt 500", () => {
    expect(fehler(katalogPositionSchema.safeParse({ ...MINIMAL, optionen: "Haupteingang" }))).toBe("Ungültige Eingabe");
    expect(fehler(katalogPositionSchema.safeParse({ ...MINIMAL, entgeltrelevant: "ja" }))).toBe("Ungültige Eingabe");
    expect(fehler(katalogPositionSchema.safeParse({ ...MINIMAL, hinweisStelle: 7 }))).toBe("Ungültige Eingabe");
  });

  it("die Vorschlaege bestehen das Schema und bleiben dabei unveraendert (ausser Schluessel und Pflegehinweis)", () => {
    for (const v of VORSCHLAEGE) {
      const geparst = katalogPositionSchema.parse(v);
      // Der Pflegehinweis ist kein Katalogfeld (nur Vorschau „Vorschläge übernehmen“) und faellt weg.
      const { vorschlagSchluessel, pflegeHinweis: _pflege, ...ohneSchluessel } = v;
      expect({ vorschlagSchluessel, ...geparst }).toEqual({ vorschlagSchluessel, ...ohneSchluessel });
      expect(positionPruefen(geparst)).toBeNull();
    }
  });

  it("organizationId: Form einer ID — Steuerzeichen, spitze Klammern und ueberlange Werte sind 400, keine 500", () => {
    for (const organizationId of ["\u0000", "org\u0000", "org-<1>", "x".repeat(ID_MAX + 1)]) {
      expect(fehler(katalogPositionSchema.safeParse({ ...MINIMAL, organizationId }))).toBe(MELDUNGEN.EINRICHTUNG_UNGUELTIG);
    }
    // Bewusst ohne UUID-Pruefung: Ob es die Einrichtung gibt, prueft der Dienst.
    expect(katalogPositionSchema.parse({ ...MINIMAL, organizationId: " org-2 " }).organizationId).toBe("org-2");
    expect(katalogPositionSchema.parse({ ...MINIMAL, organizationId: "x".repeat(ID_MAX) }).organizationId).toHaveLength(
      ID_MAX,
    );
    expect(fehler(katalogPositionAenderungSchema.safeParse({ organizationId: "\u0000" }))).toBe(
      MELDUNGEN.EINRICHTUNG_UNGUELTIG,
    );
  });
});

// =============================================
// Aendern (PATCH)
// =============================================

describe("katalogPositionAenderungSchema", () => {
  it("A4-Felder und vorschlagSchluessel im Body kommen nicht im geparsten Ergebnis an", () => {
    expect(katalogPositionAenderungSchema.parse({ bezeichnung: "Neu", ...STUFE2_UND_VORSCHLAG })).toEqual({
      bezeichnung: "Neu",
    });
  });

  it("nur A4-Felder oder vorschlagSchluessel zaehlen nicht als Aenderung", () => {
    expect(fehler(katalogPositionAenderungSchema.safeParse(STUFE2_UND_VORSCHLAG))).toBe(MELDUNGEN.MINDESTENS_EIN_FELD);
    expect(fehler(katalogPositionAenderungSchema.safeParse({}))).toBe(MELDUNGEN.MINDESTENS_EIN_FELD);
  });

  it("isActive schaltet ein und aus; Standardwerte werden NICHT ergaenzt", () => {
    expect(katalogPositionAenderungSchema.parse({ isActive: true })).toEqual({ isActive: true });
    expect(katalogPositionAenderungSchema.parse({ isActive: false })).toEqual({ isActive: false });
    expect(fehler(katalogPositionAenderungSchema.safeParse({ isActive: "ja" }))).toBe("Ungültige Eingabe");
  });

  it("Leerwerte leeren ein freiwilliges Feld", () => {
    expect(
      katalogPositionAenderungSchema.parse({
        hinweisStelle: "",
        defaultDueDays: null,
        organizationId: null,
        optionen: null,
        aufgabeTitel: "  ",
      }),
    ).toEqual({ hinweisStelle: null, defaultDueDays: null, organizationId: null, optionen: [], aufgabeTitel: null });
  });

  it("dieselben Regeln je Feld wie beim Anlegen", () => {
    expect(fehler(katalogPositionAenderungSchema.safeParse({ bezeichnung: "" }))).toBe(MELDUNGEN.BEZEICHNUNG_FEHLT);
    expect(fehler(katalogPositionAenderungSchema.safeParse({ art: "FREI" }))).toBe(MELDUNGEN.ART_UNBEKANNT);
    expect(fehler(katalogPositionAenderungSchema.safeParse({ defaultDueDays: 400 }))).toBe(MELDUNGEN.FAELLIG_UNGUELTIG);
    expect(katalogPositionAenderungSchema.parse({ bezeichnung: " Schlüssel " })).toEqual({ bezeichnung: "Schlüssel" });
  });

  it("kein Objekt: deutsche Meldung", () => {
    expect(fehler(katalogPositionAenderungSchema.safeParse(undefined))).toBe("Ungültige Eingabe");
    expect(fehler(katalogPositionAenderungSchema.safeParse([]))).toBe("Ungültige Eingabe");
  });

  it("stand (updatedAt beim Oeffnen des Dialogs) geht durch, zaehlt aber nicht als Aenderung", () => {
    const stand = "2026-10-12T08:00:00.000Z";
    expect(katalogPositionAenderungSchema.parse({ bezeichnung: "Neu", stand })).toEqual({ bezeichnung: "Neu", stand });
    expect(fehler(katalogPositionAenderungSchema.safeParse({ stand }))).toBe(MELDUNGEN.MINDESTENS_EIN_FELD);
  });

  it("stand muss ein ISO-Zeitstempel sein", () => {
    for (const stand of ["gestern", 1760256000000, "2026-10-12"]) {
      expect(fehler(katalogPositionAenderungSchema.safeParse({ isActive: true, stand }))).toBe(MELDUNGEN.STAND_UNGUELTIG);
    }
  });
});

// =============================================
// Ausblendung
// =============================================

describe("ausblendungSchema", () => {
  const ORG = "0b8a7c5e-1d2f-4a3b-9c8d-7e6f5a4b3c2d";

  it("nimmt Einrichtung und Schalter, wirft Unbekanntes weg", () => {
    expect(ausblendungSchema.parse({ organizationId: ` ${ORG} `, ausgeblendet: true, positionId: "x" })).toEqual({
      organizationId: ORG,
      ausgeblendet: true,
    });
    expect(ausblendungSchema.parse({ organizationId: ORG, ausgeblendet: false })).toEqual({
      organizationId: ORG,
      ausgeblendet: false,
    });
  });

  it("Einrichtung als UUID, Schalter als Wahrheitswert", () => {
    expect(fehler(ausblendungSchema.safeParse({ organizationId: "org-2", ausgeblendet: true }))).toBe(
      MELDUNGEN.EINRICHTUNG_UNGUELTIG,
    );
    expect(fehler(ausblendungSchema.safeParse({ ausgeblendet: true }))).toBe(MELDUNGEN.EINRICHTUNG_UNGUELTIG);
    expect(fehler(ausblendungSchema.safeParse({ organizationId: ORG }))).toBe(MELDUNGEN.AUSGEBLENDET_FEHLT);
    expect(fehler(ausblendungSchema.safeParse({ organizationId: ORG, ausgeblendet: "ja" }))).toBe(
      MELDUNGEN.AUSGEBLENDET_FEHLT,
    );
    expect(fehler(ausblendungSchema.safeParse(undefined))).toBe("Ungültige Eingabe");
  });
});

// =============================================
// Positivliste der Einstellungsrouten (S3)
// =============================================

describe("KATALOG_FELDER", () => {
  it("deckt sich mit den Feldern des Anlege-Schemas plus isActive (was Zod liefert, schreibt der Dienst)", () => {
    const geparst = katalogPositionSchema.parse(MINIMAL);
    expect([...Object.keys(geparst), "isActive"].sort()).toEqual([...KATALOG_FELDER].sort());
  });

  it("jedes Feld des Aenderungs-Schemas steht in der Liste — ausser `stand`, der keine Spalte ist", () => {
    const { stand, ...alle } = katalogPositionAenderungSchema.parse({
      ...katalogPositionSchema.parse(MINIMAL),
      isActive: true,
      stand: "2026-10-12T08:00:00.000Z",
    });
    expect(stand).toBe("2026-10-12T08:00:00.000Z");
    expect(KATALOG_FELDER as readonly string[]).not.toContain("stand");
    for (const feld of Object.keys(alle)) expect(KATALOG_FELDER).toContain(feld);
    expect(Object.keys(alle).sort()).toEqual([...KATALOG_FELDER].sort());
  });

  it("A4-Felder und vorschlagSchluessel stehen nicht darin", () => {
    for (const feld of Object.keys(STUFE2_UND_VORSCHLAG)) {
      expect(KATALOG_FELDER as readonly string[]).not.toContain(feld);
    }
  });
});

// =============================================
// Hilfe
// =============================================

describe("freitextNormalisieren", () => {
  it("\\r\\n und \\r werden \\n, aussen getrimmt, innen unveraendert", () => {
    expect(freitextNormalisieren("  a\r\nb\rc  \n")).toBe("a\nb\nc");
    expect(freitextNormalisieren("a  b")).toBe("a  b");
  });
});

// =============================================
// Arbeitsort am Vorgang (S5, E-A10)
// =============================================

describe("arbeitsortSchema (PATCH /api/onboarding/[id]/arbeitsort)", () => {
  it("nimmt eine ID getrimmt an — bewusst ohne UUID-Pruefung (unbekannt ist ein 404, keine Formatfrage)", () => {
    expect(arbeitsortSchema.parse({ arbeitsortId: "  org-2 " })).toEqual({ arbeitsortId: "org-2" });
  });

  it("null und ein leerer Text heissen „wie Einrichtung“", () => {
    expect(arbeitsortSchema.parse({ arbeitsortId: null })).toEqual({ arbeitsortId: null });
    expect(arbeitsortSchema.parse({ arbeitsortId: "   " })).toEqual({ arbeitsortId: null });
  });

  it("verlangt das Feld — ein leerer Body setzt den Arbeitsort nicht still zurueck", () => {
    expect(fehler(arbeitsortSchema.safeParse({}))).toBe(MELDUNGEN.ARBEITSORT_UNGUELTIG);
  });

  it.each<[string, unknown]>([
    ["Zahl", { arbeitsortId: 42 }],
    ["Objekt", { arbeitsortId: { id: "org-2" } }],
    ["Liste", { arbeitsortId: ["org-2"] }],
  ])("weist einen falschen Typ ab: %s", (_fall, body) => {
    expect(fehler(arbeitsortSchema.safeParse(body))).toBe(MELDUNGEN.ARBEITSORT_UNGUELTIG);
  });

  it("weist einen Body ab, der kein Objekt ist", () => {
    expect(arbeitsortSchema.safeParse(undefined).success).toBe(false);
    expect(arbeitsortSchema.safeParse("org-2").success).toBe(false);
  });

  it("verwirft unbekannte Felder", () => {
    expect(arbeitsortSchema.parse({ arbeitsortId: "org-2", organizationId: "org-x" })).toEqual({
      arbeitsortId: "org-2",
    });
  });

  it.each<[string, string]>([
    ["NUL-Zeichen (Postgres 22021 → sonst 500)", "\u0000"],
    ["NUL in der ID", "org\u00002"],
    ["anderes Steuerzeichen", "org\u001b2"],
    ["spitze Klammern", "<org-2>"],
    ["ueberlang", "x".repeat(ID_MAX + 1)],
  ])("weist die Form ab: %s → 400 statt 500", (_fall, arbeitsortId) => {
    expect(fehler(arbeitsortSchema.safeParse({ arbeitsortId }))).toBe(MELDUNGEN.ARBEITSORT_UNGUELTIG);
  });
});

describe("onboardingAnlegenSchema: arbeitsortId (S5)", () => {
  const BASIS = { email: "anna.privat@example.org", organizationId: "org-1" };

  it("ist optional; leer oder null heisst „nicht angegeben“", () => {
    expect(onboardingAnlegenSchema.parse(BASIS).arbeitsortId).toBeUndefined();
    expect(onboardingAnlegenSchema.parse({ ...BASIS, arbeitsortId: "  " }).arbeitsortId).toBeUndefined();
    expect(onboardingAnlegenSchema.parse({ ...BASIS, arbeitsortId: null }).arbeitsortId).toBeUndefined();
  });

  it("nimmt eine ID getrimmt an, ohne UUID-Pruefung", () => {
    expect(onboardingAnlegenSchema.parse({ ...BASIS, arbeitsortId: " org-2 " }).arbeitsortId).toBe("org-2");
  });

  it("weist einen falschen Typ mit derselben Meldung ab wie der PATCH", () => {
    expect(fehler(onboardingAnlegenSchema.safeParse({ ...BASIS, arbeitsortId: 7 }))).toBe(
      MELDUNGEN.ARBEITSORT_UNGUELTIG,
    );
  });

  it("dieselbe Form wie der PATCH: NUL-Zeichen und ueberlange IDs sind 400", () => {
    for (const arbeitsortId of ["\u0000", "x".repeat(ID_MAX + 1)]) {
      expect(fehler(onboardingAnlegenSchema.safeParse({ ...BASIS, arbeitsortId }))).toBe(
        MELDUNGEN.ARBEITSORT_UNGUELTIG,
      );
    }
  });
});
