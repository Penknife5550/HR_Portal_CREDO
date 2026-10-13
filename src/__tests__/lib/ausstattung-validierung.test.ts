/**
 * Tests: Validierung des Katalogs „Ausstattung & Zugänge“
 * (src/lib/validations/ausstattung.ts, Feinplan 1.4 und S2)
 *
 * Zod prueft die Form; die Felder gegeneinander prueft positionPruefen
 * (ausstattung.test.ts). Kernfall von S2: vorschlagSchluessel kommt im
 * geparsten Ergebnis nie an — weder beim Anlegen noch beim Aendern. Seit S23
 * (A4, G8) sind die Felder „Beim Austritt“ (beiAustritt, rueckgabeKategorie,
 * ausgabeKennung) pflegbar: Form aus den Wertlisten, leer = null; die Regel
 * gegeneinander (`ausgabeFelderPruefen`) gilt auch fuer die freie Position der
 * Karte.
 *
 * Dazu (S8) die Form des Schritts „Ausstattung & Zugänge“ im Modalitaeten-PUT
 * (`modalitaetenAusstattungSchema`); ob Position und Option zum Vorgang
 * gehoeren, prueft wahlPruefen (ausstattung.test.ts), die Grenzen gegen GRENZEN
 * haelt supervisor-grenzen.test.ts.
 *
 * Seit S15 die Aktionen der HR-Karte (`ausstattungAktionSchema`): sechs
 * Aktionen, Regel 11 an jeder Stelle, genau eins von positionId und frei,
 * Datum mit Rueckprobe, unbekannte Felder fallen weg. Was der Dienst daraus
 * macht, steht in ausstattung-dienst.test.ts.
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
import { RUECKGABE_KATEGORIEN } from "@/lib/constants";
import {
  ID_MAX,
  arbeitsortSchema,
  ausblendungSchema,
  ausstattungAktionSchema,
  freitextNormalisieren,
  katalogPositionAenderungSchema,
  katalogPositionSchema,
  modalitaetenAusstattungSchema,
} from "@/lib/validations/ausstattung";
import { onboardingAnlegenSchema } from "@/lib/validations/onboarding";

function fehler(ergebnis: { success: boolean; error?: { errors: { message: string }[] } }): string | undefined {
  return ergebnis.success ? undefined : ergebnis.error?.errors[0]?.message;
}

const MINIMAL = { departmentKey: "IT", art: "JA_NEIN", bezeichnung: "Dienst-iPad (Lernmittel)" };

/** Die A4-Felder „Beim Austritt“ (seit S23 pflegbar, G8) — gueltige Werte. */
const A4 = {
  ausgabeKennung: "Inventarnummer",
  rueckgabeKategorie: "IT_HARDWARE",
  beiAustritt: "RUECKGABE",
};
const STUFE2_UND_VORSCHLAG = { ...A4, vorschlagSchluessel: "IT_IPAD" };

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
      beiAustritt: null,
      rueckgabeKategorie: null,
      ausgabeKennung: null,
      orderIndex: 0,
    });
    // Typpruefung: das geparste Ergebnis passt ohne Umweg in positionPruefen
    const entwurf: PositionEntwurf = geparst;
    expect(positionPruefen(entwurf)).toBeNull();
  });

  it("vorschlagSchluessel im Body kommt nicht im geparsten Ergebnis an; die A4-Felder kommen an (S23)", () => {
    const geparst = katalogPositionSchema.parse({ ...MINIMAL, ...STUFE2_UND_VORSCHLAG });
    expect(geparst).not.toHaveProperty("vorschlagSchluessel");
    expect(geparst).toMatchObject(A4);
    expect(positionPruefen(geparst)).toBeNull();
  });

  it("A4-Felder: Werte nur aus den Wertlisten, leer = null, Kennung einzeilig und hoechstens 40 Zeichen", () => {
    for (const beiAustritt of ["RUECKGABE", "SPERREN", "NICHTS"]) {
      expect(katalogPositionSchema.parse({ ...MINIMAL, beiAustritt }).beiAustritt).toBe(beiAustritt);
    }
    for (const kategorie of RUECKGABE_KATEGORIEN) {
      expect(katalogPositionSchema.parse({ ...MINIMAL, rueckgabeKategorie: kategorie }).rueckgabeKategorie).toBe(kategorie);
    }
    expect(fehler(katalogPositionSchema.safeParse({ ...MINIMAL, beiAustritt: "BEHALTEN" }))).toBe(
      MELDUNGEN.BEI_AUSTRITT_UNBEKANNT,
    );
    // Der alte Testwert „IT_GERAET“ ist keine ReturnCategory.
    expect(fehler(katalogPositionSchema.safeParse({ ...MINIMAL, rueckgabeKategorie: "IT_GERAET" }))).toBe(
      MELDUNGEN.RUECKGABEKATEGORIE_UNBEKANNT,
    );
    expect(katalogPositionSchema.parse({ ...MINIMAL, beiAustritt: "", rueckgabeKategorie: "  ", ausgabeKennung: " " })).toMatchObject({
      beiAustritt: null,
      rueckgabeKategorie: null,
      ausgabeKennung: null,
    });
    expect(katalogPositionSchema.parse({ ...MINIMAL, ausgabeKennung: "  Inventarnummer " }).ausgabeKennung).toBe("Inventarnummer");
    expect(
      katalogPositionSchema.parse({ ...MINIMAL, ausgabeKennung: "x".repeat(GRENZEN.ausgabeKennung) }).ausgabeKennung,
    ).toHaveLength(GRENZEN.ausgabeKennung);
    expect(fehler(katalogPositionSchema.safeParse({ ...MINIMAL, ausgabeKennung: "x".repeat(GRENZEN.ausgabeKennung + 1) }))).toBe(
      MELDUNGEN.KENNUNG_LABEL_ZU_LANG,
    );
    for (const ausgabeKennung of ["<b>Nr</b>", "Nr\nzwei", "Nr\u0000"]) {
      expect(fehler(katalogPositionSchema.safeParse({ ...MINIMAL, ausgabeKennung }))).toBe(MELDUNGEN.OHNE_KLAMMERN);
    }
    expect(fehler(katalogPositionSchema.safeParse({ ...MINIMAL, beiAustritt: 3 }))).toBe(MELDUNGEN.BEI_AUSTRITT_UNBEKANNT);
  });

  it("A4-Felder gegeneinander prueft positionPruefen, nicht Zod", () => {
    const ohneKategorie = katalogPositionSchema.parse({ ...MINIMAL, beiAustritt: "RUECKGABE" });
    expect(positionPruefen(ohneKategorie)).toBe(MELDUNGEN.RUECKGABEKATEGORIE_FEHLT);
    const kennungBeiNichts = katalogPositionSchema.parse({ ...MINIMAL, beiAustritt: "NICHTS", ausgabeKennung: "Nr." });
    expect(positionPruefen(kennungBeiNichts)).toBe(MELDUNGEN.KENNUNG_NUR_AUSGABE);
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
      // Die Vorschlaege tragen keine A4-Werte (G27) — geparst stehen sie leer da.
      const ohneA4 = { beiAustritt: null, rueckgabeKategorie: null, ausgabeKennung: null };
      expect({ vorschlagSchluessel, ...geparst }).toEqual({ vorschlagSchluessel, ...ohneA4, ...ohneSchluessel });
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
  it("vorschlagSchluessel im Body kommt nicht im geparsten Ergebnis an; die A4-Felder kommen an (S23)", () => {
    expect(katalogPositionAenderungSchema.parse({ bezeichnung: "Neu", ...STUFE2_UND_VORSCHLAG })).toEqual({
      bezeichnung: "Neu",
      ...A4,
    });
  });

  it("ein A4-Feld allein zaehlt als Aenderung, vorschlagSchluessel allein nicht; leer heisst null", () => {
    expect(katalogPositionAenderungSchema.parse({ beiAustritt: "SPERREN" })).toEqual({ beiAustritt: "SPERREN" });
    expect(katalogPositionAenderungSchema.parse({ beiAustritt: "", ausgabeKennung: null })).toEqual({
      beiAustritt: null,
      ausgabeKennung: null,
    });
    expect(fehler(katalogPositionAenderungSchema.safeParse({ vorschlagSchluessel: "IT_IPAD" }))).toBe(
      MELDUNGEN.MINDESTENS_EIN_FELD,
    );
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

  it("die A4-Felder stehen darin (S23, G8), vorschlagSchluessel nicht", () => {
    for (const feld of Object.keys(A4)) expect(KATALOG_FELDER as readonly string[]).toContain(feld);
    expect(KATALOG_FELDER as readonly string[]).not.toContain("vorschlagSchluessel");
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

// =============================================
// Formular der Fuehrungskraft (S8)
// =============================================

describe("modalitaetenAusstattungSchema (PUT /api/modalitaeten/[token])", () => {
  const ID = "11111111-1111-4111-8111-111111111111";

  it("beide Felder freiwillig; unbekannte Felder fallen weg, auch in den Eintraegen", () => {
    expect(modalitaetenAusstattungSchema.parse({})).toEqual({});
    expect(
      modalitaetenAusstattungSchema.parse({
        ausstattung: [{ positionId: ID, gewaehlt: true, quelle: "HR", hinweisStelle: "x" }],
        hinweise: [{ departmentKey: "IT", hinweis: "a", quelle: "HR" }],
        fremd: 1,
      }),
    ).toEqual({ ausstattung: [{ positionId: ID, gewaehlt: true }], hinweise: [{ departmentKey: "IT", hinweis: "a" }] });
  });

  it("Freitexte werden vor der Laengenpruefung auf \\n normalisiert und getrimmt", () => {
    const geparst = modalitaetenAusstattungSchema.parse({
      ausstattung: [{ positionId: ID, gewaehlt: true, bemerkung: "  Mit Stift\r\nund Hülle  " }],
      hinweise: [{ departmentKey: " IT ", hinweis: "Zeile 1\r\nZeile 2" }],
    });
    expect(geparst.ausstattung?.[0].bemerkung).toBe("Mit Stift\nund Hülle");
    expect(geparst.hinweise?.[0]).toEqual({ departmentKey: "IT", hinweis: "Zeile 1\nZeile 2" });
    // \r\n zaehlt als ein Zeichen: genau die Grenze mit Zeilenumbruechen geht,
    // obwohl der Rohtext laenger ist; ein Zeichen mehr nicht.
    const umbrueche = Math.floor((GRENZEN.bemerkung - 1) / 2);
    const genau = "x" + "\r\nx".repeat(umbrueche) + "x".repeat(GRENZEN.bemerkung - 1 - 2 * umbrueche);
    expect(genau.replace(/\r\n/g, "\n")).toHaveLength(GRENZEN.bemerkung);
    expect(genau.length).toBeGreaterThan(GRENZEN.bemerkung);
    const bemerkung = (text: string) => ({ ausstattung: [{ positionId: ID, gewaehlt: true, bemerkung: text }] });
    expect(modalitaetenAusstattungSchema.safeParse(bemerkung(genau)).success).toBe(true);
    expect(fehler(modalitaetenAusstattungSchema.safeParse(bemerkung(`${genau}x`)))).toBe(MELDUNGEN.BEMERKUNG_ZU_LANG);
  });

  it("Steuerzeichen: in Bemerkung und Hinweis nur \\n und \\t; die Angabe ist einzeilig", () => {
    expect(fehler(modalitaetenAusstattungSchema.safeParse({ ausstattung: [{ positionId: ID, bemerkung: "a\u0000b" }] }))).toBe(
      MELDUNGEN.STEUERZEICHEN,
    );
    expect(fehler(modalitaetenAusstattungSchema.safeParse({ hinweise: [{ departmentKey: "IT", hinweis: "a\u0007b" }] }))).toBe(
      MELDUNGEN.STEUERZEICHEN,
    );
    expect(fehler(modalitaetenAusstattungSchema.safeParse({ ausstattung: [{ positionId: ID, angabe: "Chemie\nSport" }] }))).toBe(
      MELDUNGEN.ANGABE_EINZEILIG,
    );
    expect(modalitaetenAusstattungSchema.safeParse({ ausstattung: [{ positionId: ID, angabe: "Raum <2.14>" }] }).success).toBe(true);
  });

  it("positionId muss eine UUID sein; gewaehlt nur true", () => {
    expect(fehler(modalitaetenAusstattungSchema.safeParse({ ausstattung: [{ positionId: "pos-1", gewaehlt: true }] }))).toBe(
      MELDUNGEN.WAHL_POSITION_UNGUELTIG,
    );
    expect(fehler(modalitaetenAusstattungSchema.safeParse({ ausstattung: [{ gewaehlt: true }] }))).toBe(
      MELDUNGEN.WAHL_POSITION_UNGUELTIG,
    );
    expect(fehler(modalitaetenAusstattungSchema.safeParse({ ausstattung: [{ positionId: ID, gewaehlt: false }] }))).toBe(
      MELDUNGEN.WAHL_GEWAEHLT_UNGUELTIG,
    );
  });

  it("Stelle eines Hinweises hat die Form eines Abteilungsschluessels; ob sie erlaubt ist, prueft wahlPruefen", () => {
    expect(modalitaetenAusstattungSchema.safeParse({ hinweise: [{ departmentKey: "it-support", hinweis: "a" }] }).success).toBe(false);
    expect(modalitaetenAusstattungSchema.safeParse({ hinweise: [{ departmentKey: "MITARBEITER", hinweis: "a" }] }).success).toBe(true);
  });

  it("falscher Typ: deutsche Meldung statt 500", () => {
    expect(modalitaetenAusstattungSchema.safeParse({ ausstattung: "alles" }).success).toBe(false);
    expect(modalitaetenAusstattungSchema.safeParse({ ausstattung: [7] }).success).toBe(false);
    expect(fehler(modalitaetenAusstattungSchema.safeParse({ ausstattung: [{ positionId: ID, auswahl: "Haupteingang" }] }))).toBe(
      "Ungültige Eingabe",
    );
  });
});

describe("ausstattungAktionSchema (HR-Karte, S15)", () => {
  it("die sechs Aktionen; unbekannte → „Unbekannte Aktion.“, kein Objekt → „Ungültige Eingabe“", () => {
    for (const body of [
      { aktion: "hinzufuegen", positionId: "pos-1" },
      { aktion: "hinzufuegen", frei: { departmentKey: "IT", bezeichnung: "Tablet" } },
      { aktion: "aendern", ausstattungId: "z-1", bemerkung: "" },
      { aktion: "streichen", ausstattungId: "z-1" },
      { aktion: "hinweis-aendern", departmentKey: "IT", hinweis: "" },
      { aktion: "hinweis-gesehen", departmentKey: "IT" },
      { aktion: "hinweis-uebernehmen", departmentKey: "IT", positionId: "pos-1" },
    ]) {
      expect(`${body.aktion}: ${ausstattungAktionSchema.safeParse(body).success}`).toBe(`${body.aktion}: true`);
    }
    expect(fehler(ausstattungAktionSchema.safeParse({ aktion: "loeschen" }))).toBe("Unbekannte Aktion.");
    expect(fehler(ausstattungAktionSchema.safeParse(undefined))).toBe("Ungültige Eingabe");
    expect(fehler(ausstattungAktionSchema.safeParse([]))).toBe("Ungültige Eingabe");
  });

  it("Regel 11: nie MITARBEITER oder VORGESETZTER — frei, Stellenwechsel, Hinweis", () => {
    for (const key of ["MITARBEITER", "VORGESETZTER"]) {
      for (const body of [
        { aktion: "hinzufuegen", frei: { departmentKey: key, bezeichnung: "Tablet" } },
        { aktion: "aendern", ausstattungId: "z-1", departmentKey: key },
        { aktion: "hinweis-aendern", departmentKey: key, hinweis: "x" },
        { aktion: "hinweis-gesehen", departmentKey: key },
      ]) {
        expect(fehler(ausstattungAktionSchema.safeParse(body))).toBe(MELDUNGEN.STELLE_NICHT_ERLAUBT);
      }
    }
    // HR ist erlaubt (Aufgabe im Portal).
    expect(ausstattungAktionSchema.safeParse({ aktion: "hinzufuegen", frei: { departmentKey: "HR", bezeichnung: "Jobticket" } }).success).toBe(true);
  });

  it("genau eins von positionId und frei; ein Hinweis braucht Text oder Fälligkeit; Ändern ein Feld", () => {
    expect(fehler(ausstattungAktionSchema.safeParse({ aktion: "hinzufuegen" }))).toBe(MELDUNGEN.KARTE_POSITION_ODER_FREI);
    expect(
      fehler(
        ausstattungAktionSchema.safeParse({ aktion: "hinzufuegen", positionId: "p", frei: { departmentKey: "IT", bezeichnung: "x" } }),
      ),
    ).toBe(MELDUNGEN.KARTE_POSITION_ODER_FREI);
    expect(fehler(ausstattungAktionSchema.safeParse({ aktion: "hinweis-uebernehmen", departmentKey: "IT" }))).toBe(
      MELDUNGEN.KARTE_POSITION_ODER_FREI,
    );
    expect(fehler(ausstattungAktionSchema.safeParse({ aktion: "hinweis-aendern", departmentKey: "IT" }))).toBe(
      MELDUNGEN.KARTE_HINWEIS_ODER_FAELLIG,
    );
    expect(fehler(ausstattungAktionSchema.safeParse({ aktion: "aendern", ausstattungId: "z-1" }))).toBe(
      MELDUNGEN.MINDESTENS_EIN_FELD,
    );
  });

  it("freie Position (A4): optional „Beim Austritt“ und Rückgabekategorie, gegeneinander geprüft; keine Kennungsbeschriftung", () => {
    const frei = (teil: Record<string, unknown>) =>
      ausstattungAktionSchema.safeParse({ aktion: "hinzufuegen", frei: { departmentKey: "IT", bezeichnung: "Tablet", ...teil } });
    const ok = frei({ beiAustritt: "RUECKGABE", rueckgabeKategorie: "IT_HARDWARE", ausgabeKennung: "Inventarnummer" });
    expect(ok.success && ok.data.aktion === "hinzufuegen" && ok.data.frei).toEqual({
      departmentKey: "IT",
      bezeichnung: "Tablet",
      beiAustritt: "RUECKGABE",
      rueckgabeKategorie: "IT_HARDWARE",
    });
    expect(frei({ beiAustritt: "SPERREN" }).success).toBe(true);
    expect(frei({ beiAustritt: "" }).success).toBe(true);
    expect(fehler(frei({ beiAustritt: "RUECKGABE" }))).toBe(MELDUNGEN.RUECKGABEKATEGORIE_FEHLT);
    expect(fehler(frei({ beiAustritt: "SPERREN", rueckgabeKategorie: "SCHLUESSEL" }))).toBe(
      MELDUNGEN.RUECKGABEKATEGORIE_NUR_RUECKGABE,
    );
    expect(fehler(frei({ beiAustritt: "ABGEBEN" }))).toBe(MELDUNGEN.BEI_AUSTRITT_UNBEKANNT);
    // Ohne die Felder wie bisher.
    const ohne = frei({});
    expect(ohne.success && ohne.data.aktion === "hinzufuegen" && ohne.data.frei).toEqual({
      departmentKey: "IT",
      bezeichnung: "Tablet",
    });
  });

  it("freie Position: Bezeichnung einzeilig, höchstens GRENZEN.freieBezeichnung; Fälligkeit ±365", () => {
    const frei = (teil: Record<string, unknown>) =>
      ausstattungAktionSchema.safeParse({ aktion: "hinzufuegen", frei: { departmentKey: "IT", bezeichnung: "Tablet", ...teil } });
    expect(frei({ bezeichnung: "x".repeat(GRENZEN.freieBezeichnung) }).success).toBe(true);
    expect(fehler(frei({ bezeichnung: "x".repeat(GRENZEN.freieBezeichnung + 1) }))).toBe(MELDUNGEN.KARTE_FREI_ZU_LANG);
    expect(fehler(frei({ bezeichnung: "Zeile 1\nZeile 2" }))).toBe(MELDUNGEN.OHNE_KLAMMERN);
    expect(fehler(frei({ relativeDueDays: 400 }))).toBe(MELDUNGEN.FAELLIG_UNGUELTIG);
    expect(frei({ relativeDueDays: -7 }).success).toBe(true);
  });

  it("Fälligkeit: JJJJ-MM-TT mit Rückprobe, \"\" und null = ohne Fälligkeit", () => {
    const hinweis = (dueDate: unknown) => ausstattungAktionSchema.safeParse({ aktion: "hinweis-aendern", departmentKey: "IT", dueDate });
    expect(fehler(hinweis("2026-02-30"))).toBe(MELDUNGEN.KARTE_DATUM_UNGUELTIG);
    expect(fehler(hinweis("30.09.2026"))).toBe(MELDUNGEN.KARTE_DATUM_UNGUELTIG);
    const ok = hinweis("2026-09-30");
    expect(ok.success && ok.data.aktion === "hinweis-aendern" && ok.data.dueDate).toBe("2026-09-30");
    const leer = hinweis("");
    expect(leer.success && leer.data.aktion === "hinweis-aendern" && leer.data.dueDate).toBeNull();
  });

  it("Freitexte normalisiert und begrenzt; unbekannte Felder fallen weg", () => {
    const r = ausstattungAktionSchema.safeParse({
      aktion: "aendern",
      ausstattungId: "z-1",
      bemerkung: "  Mit Stift\r\nund Hülle ",
      gestrichenAm: "2026-01-01",
      quelle: "FUEHRUNGSKRAFT",
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data).toEqual({ aktion: "aendern", ausstattungId: "z-1", bemerkung: "Mit Stift\nund Hülle" });
    expect(
      fehler(ausstattungAktionSchema.safeParse({ aktion: "aendern", ausstattungId: "z-1", bemerkung: "x".repeat(GRENZEN.bemerkung + 1) })),
    ).toBe(MELDUNGEN.BEMERKUNG_ZU_LANG);
    expect(
      fehler(ausstattungAktionSchema.safeParse({ aktion: "hinweis-aendern", departmentKey: "IT", hinweis: "x".repeat(GRENZEN.hinweis + 1) })),
    ).toBe(MELDUNGEN.HINWEIS_ZU_LANG);
  });
});
