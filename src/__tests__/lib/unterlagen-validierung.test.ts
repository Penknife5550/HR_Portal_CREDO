/**
 * Tests: Validierung „Unterlagen nachfordern" (src/lib/validations/unterlagen.ts)
 *
 * Kern der Pruefung (Feinplanung Abschnitt 6 und 13): Zod je Aktion, und ein
 * kaputtes JSON, ein leerer Body oder eine fehlende Aktion ergeben 400 — NIE
 * eine Standardaktion. Anders als bei den Abteilungsaufgaben gibt es hier
 * keine Aktion, die ein leerer Body ausloesen duerfte.
 */

import { randomUUID } from "crypto";
import type { z } from "zod";
import {
  gueltigBisPatchSchema,
  jsonKoerperPruefen,
  positionEingabeSchema,
  positionsAktionSchema,
  uebermittelnSchema,
  unterlagenAktionSchema,
} from "@/lib/validations/unterlagen";
import { MAX_POSITIONEN, MELDUNGEN, eingabePruefen } from "@/lib/unterlagen";

function fehler(ergebnis: { success: boolean; error?: { errors: { message: string }[] } }): string | undefined {
  return ergebnis.success ? undefined : ergebnis.error?.errors[0]?.message;
}

const ID = randomUUID();
const FRIST = "2026-10-05";

const anfordern = (teil: Record<string, unknown> = {}) => ({
  aktion: "anfordern",
  empfaenger: "anna.beispiel@example.org",
  frist: FRIST,
  positionen: [{ typ: "AUFENTHALTSTITEL" }],
  ...teil,
});

// =============================================
// Body lesen: nie eine Standardaktion
// =============================================

describe("jsonKoerperPruefen — kaputtes JSON ergibt 400, nie eine Standardaktion", () => {
  it.each([
    ["leer", ""],
    ["nur Leerzeichen", "   \n"],
    ["abgeschnitten", '{"aktion":"zurueckzie'],
    ["kein JSON", "aktion=zurueckziehen"],
  ])("%s → 400 „Ungültige Eingabe“", (_name, text) => {
    const schemas: z.ZodTypeAny[] = [unterlagenAktionSchema, positionsAktionSchema, uebermittelnSchema, gueltigBisPatchSchema];
    for (const schema of schemas) {
      expect(jsonKoerperPruefen(text, schema)).toEqual({ ok: false, status: 400, error: MELDUNGEN.UNGUELTIGE_EINGABE });
    }
  });

  it("ein leeres Objekt ist keine Aktion", () => {
    expect(jsonKoerperPruefen("{}", unterlagenAktionSchema)).toEqual({
      ok: false,
      status: 400,
      error: "Unbekannte oder fehlende Aktion.",
    });
    expect(jsonKoerperPruefen("{}", positionsAktionSchema)).toMatchObject({ ok: false, status: 400 });
  });

  it("eine unbekannte Aktion ist keine Aktion — auch nicht die der Abteilungsaufgaben", () => {
    for (const aktion of ["informieren", "loeschen", "ANFORDERN", ""]) {
      expect(jsonKoerperPruefen(JSON.stringify({ aktion }), unterlagenAktionSchema)).toMatchObject({
        ok: false,
        error: "Unbekannte oder fehlende Aktion.",
      });
    }
    // Der Alias der Abteilungsaufgaben gilt hier nicht.
    expect(jsonKoerperPruefen(JSON.stringify({ action: "remind" }), unterlagenAktionSchema)).toMatchObject({
      ok: false,
    });
  });

  it("JSON, das kein Objekt ist, ergibt 400", () => {
    for (const text of ["null", "[]", "42", '"anfordern"', "true"]) {
      expect(jsonKoerperPruefen(text, unterlagenAktionSchema)).toMatchObject({ ok: false, status: 400 });
      expect(jsonKoerperPruefen(text, uebermittelnSchema)).toMatchObject({ ok: false, status: 400 });
    }
  });

  it("ein gültiger Body kommt mit den bereinigten Daten zurück", () => {
    expect(jsonKoerperPruefen(JSON.stringify({ aktion: "zurueckziehen", nachforderungId: ID }), unterlagenAktionSchema)).toEqual({
      ok: true,
      daten: { aktion: "zurueckziehen", nachforderungId: ID },
    });
  });
});

// =============================================
// POST /api/onboarding/[id]/unterlagen
// =============================================

describe("unterlagenAktionSchema: anfordern", () => {
  it("nimmt eine Katalogposition und eine freie Zeile an", () => {
    const daten = unterlagenAktionSchema.parse(
      anfordern({
        empfaenger: "  anna.beispiel@example.org ",
        nachricht: "  Bitte bis Freitag.  ",
        adresseBestaetigt: true,
        positionen: [
          { typ: "AUFENTHALTSTITEL", hinweis: " Vorder- und Rückseite " },
          { typ: null, bezeichnung: " Unterschriebener RV-Antrag ", originalErforderlich: true },
        ],
      }),
    );
    expect(daten).toEqual({
      aktion: "anfordern",
      empfaenger: "anna.beispiel@example.org",
      adresseBestaetigt: true,
      frist: FRIST,
      nachricht: "Bitte bis Freitag.",
      positionen: [
        { art: "KATALOG", typ: "AUFENTHALTSTITEL", hinweis: "Vorder- und Rückseite" },
        { art: "FREI", typ: null, bezeichnung: "Unterschriebener RV-Antrag", originalErforderlich: true },
      ],
    });
  });

  it("leere Nachricht und leerer Hinweis gelten als nicht angegeben", () => {
    const daten = unterlagenAktionSchema.parse(anfordern({ nachricht: "   ", positionen: [{ typ: "MASERNSCHUTZ", hinweis: "" }] }));
    expect(daten).toMatchObject({ positionen: [{ art: "KATALOG", typ: "MASERNSCHUTZ" }] });
    expect("nachricht" in daten && daten.nachricht).toBeFalsy();
  });

  it("SONSTIGES ist als Katalogart abgelehnt (400)", () => {
    expect(fehler(unterlagenAktionSchema.safeParse(anfordern({ positionen: [{ typ: "SONSTIGES" }] })))).toBe(
      MELDUNGEN.SAMMELART,
    );
  });

  it("1 bis 30 Positionen", () => {
    expect(fehler(unterlagenAktionSchema.safeParse(anfordern({ positionen: [] })))).toBe(MELDUNGEN.KEINE_POSITION);
    expect(fehler(unterlagenAktionSchema.safeParse(anfordern({ positionen: undefined })))).toBe(MELDUNGEN.KEINE_POSITION);
    const frei = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ typ: null, bezeichnung: `Unterlage ${i}`, originalErforderlich: false }));
    expect(unterlagenAktionSchema.safeParse(anfordern({ positionen: frei(MAX_POSITIONEN) })).success).toBe(true);
    expect(fehler(unterlagenAktionSchema.safeParse(anfordern({ positionen: frei(MAX_POSITIONEN + 1) })))).toBe(
      MELDUNGEN.ZU_VIELE_POSITIONEN,
    );
  });

  it("freie Zeile: Bezeichnung 1..120 ohne Steuerzeichen, „Original erforderlich“ Pflicht", () => {
    const frei = (teil: Record<string, unknown>) => anfordern({ positionen: [{ typ: null, originalErforderlich: false, ...teil }] });
    expect(fehler(unterlagenAktionSchema.safeParse(frei({ bezeichnung: "   " })))).toBe("Bitte geben Sie eine Bezeichnung an.");
    expect(fehler(unterlagenAktionSchema.safeParse(frei({})))).toBe("Bitte geben Sie eine Bezeichnung an.");
    expect(fehler(unterlagenAktionSchema.safeParse(frei({ bezeichnung: "x".repeat(121) })))).toBe(
      "Die Bezeichnung darf höchstens 120 Zeichen lang sein.",
    );
    expect(fehler(unterlagenAktionSchema.safeParse(frei({ bezeichnung: "Zeile\nzwei" })))).toBe(
      "Der Text enthält unzulässige Steuerzeichen.",
    );
    expect(
      fehler(unterlagenAktionSchema.safeParse(anfordern({ positionen: [{ typ: null, bezeichnung: "Attest" }] }))),
    ).toBe("Bitte geben Sie an, ob das Original erforderlich ist.");
    // Spitze Klammern sind erlaubt — die Mail maskiert sie im HTML-Teil.
    expect(unterlagenAktionSchema.safeParse(frei({ bezeichnung: '<a href="x">Antrag</a>' })).success).toBe(true);
  });

  it("Hinweis höchstens 500, Nachricht höchstens 1000 Zeichen, kein NUL-Zeichen", () => {
    expect(
      fehler(unterlagenAktionSchema.safeParse(anfordern({ positionen: [{ typ: "MASERNSCHUTZ", hinweis: "x".repeat(501) }] }))),
    ).toBe("Der Hinweis darf höchstens 500 Zeichen lang sein.");
    expect(fehler(unterlagenAktionSchema.safeParse(anfordern({ nachricht: "x".repeat(1001) })))).toBe(
      "Die Nachricht darf höchstens 1000 Zeichen lang sein.",
    );
    expect(fehler(unterlagenAktionSchema.safeParse(anfordern({ nachricht: "Hallo\u0000" })))).toBe(
      "Der Text enthält unzulässige Steuerzeichen.",
    );
    // Zeilenumbrueche sind in mehrzeiligen Texten erlaubt.
    expect(unterlagenAktionSchema.safeParse(anfordern({ nachricht: "Zeile 1\r\nZeile 2\tEnde" })).success).toBe(true);
  });

  it("Katalogschlüssel nur in Schlüsselform", () => {
    expect(fehler(unterlagenAktionSchema.safeParse(anfordern({ positionen: [{ typ: "aufenthaltstitel" }] })))).toBe(
      MELDUNGEN.TYP_UNBEKANNT,
    );
    expect(fehler(unterlagenAktionSchema.safeParse(anfordern({ positionen: [{}] })))).toBe(MELDUNGEN.TYP_UNBEKANNT);
    expect(fehler(unterlagenAktionSchema.safeParse(anfordern({ positionen: ["AUFENTHALTSTITEL"] })))).toBe(
      MELDUNGEN.UNGUELTIGE_EINGABE,
    );
  });

  it("Empfänger und Frist sind Pflicht und haben eine Form", () => {
    expect(fehler(unterlagenAktionSchema.safeParse(anfordern({ empfaenger: undefined })))).toBe(
      "Bitte geben Sie eine E-Mail-Adresse an.",
    );
    expect(fehler(unterlagenAktionSchema.safeParse(anfordern({ empfaenger: "keine-adresse" })))).toBe(
      "Bitte geben Sie eine gültige E-Mail-Adresse an.",
    );
    expect(fehler(unterlagenAktionSchema.safeParse(anfordern({ frist: undefined })))).toBe(MELDUNGEN.FRIST_FEHLT);
    expect(fehler(unterlagenAktionSchema.safeParse(anfordern({ frist: "05.10.2026" })))).toBe(MELDUNGEN.FRIST_UNGUELTIG);
    expect(fehler(unterlagenAktionSchema.safeParse(anfordern({ frist: "2026-02-30" })))).toBe(MELDUNGEN.FRIST_UNGUELTIG);
    expect(fehler(unterlagenAktionSchema.safeParse(anfordern({ adresseBestaetigt: "ja" })))).toBe(
      MELDUNGEN.UNGUELTIGE_EINGABE,
    );
  });

  it("eine Katalogposition verliert ein mitgeschicktes „Original erforderlich“ — das entscheidet der Server", () => {
    const daten = unterlagenAktionSchema.parse(
      anfordern({ positionen: [{ typ: "ARBEITSVERTRAG", originalErforderlich: false, bezeichnung: "egal" }] }),
    );
    expect(daten).toMatchObject({ positionen: [{ art: "KATALOG", typ: "ARBEITSVERTRAG" }] });
    expect(daten.aktion === "anfordern" && daten.positionen[0]).not.toHaveProperty("originalErforderlich");
  });
});

describe("unterlagenAktionSchema: die übrigen Aktionen", () => {
  it("ergaenzen: Positionen Pflicht, Frist und Nachricht optional", () => {
    expect(
      unterlagenAktionSchema.parse({ aktion: "ergaenzen", nachforderungId: ID, positionen: [{ typ: "ARBEITSERLAUBNIS" }] }),
    ).toEqual({ aktion: "ergaenzen", nachforderungId: ID, positionen: [{ art: "KATALOG", typ: "ARBEITSERLAUBNIS" }] });
    expect(
      unterlagenAktionSchema.parse({
        aktion: "ergaenzen",
        nachforderungId: ID,
        positionen: [{ typ: "ARBEITSERLAUBNIS" }],
        frist: "",
      }),
    ).not.toHaveProperty("frist", "");
    expect(
      unterlagenAktionSchema.parse({ aktion: "ergaenzen", nachforderungId: ID, positionen: [{ typ: "ARBEITSERLAUBNIS" }], frist: FRIST }),
    ).toMatchObject({ frist: FRIST });
    expect(fehler(unterlagenAktionSchema.safeParse({ aktion: "ergaenzen", nachforderungId: ID }))).toBe(
      MELDUNGEN.KEINE_POSITION,
    );
  });

  it("ergaenzen: mehr als 30 Positionen sind keine Formfrage — der Stand antwortet mit 409 (6.1)", () => {
    const positionen = Array.from({ length: MAX_POSITIONEN + 1 }, (_, i) => ({
      typ: null,
      bezeichnung: `Unterlage ${i}`,
      originalErforderlich: false,
    }));
    const zod = unterlagenAktionSchema.safeParse({ aktion: "ergaenzen", nachforderungId: ID, positionen });
    expect(zod.success).toBe(true);
    if (!zod.success || zod.data.aktion !== "ergaenzen") throw new Error("ergaenzen erwartet");
    // Eine laufende Nachforderung hat immer mindestens eine Position.
    expect(
      eingabePruefen(
        { aktion: "ergaenzen", positionen: zod.data.positionen },
        { heute: "2026-09-21", katalog: [], bestehend: [{ typ: null, status: "ANGEFORDERT" }], bisherigeFrist: "2026-09-25" },
      ),
    ).toMatchObject({ ok: false, status: 409, grund: "ZU_VIELE_POSITIONEN", meldung: MELDUNGEN.ZU_VIELE_POSITIONEN });
  });

  it("frist-aendern: Frist Pflicht", () => {
    expect(unterlagenAktionSchema.parse({ aktion: "frist-aendern", nachforderungId: ID, frist: FRIST })).toEqual({
      aktion: "frist-aendern",
      nachforderungId: ID,
      frist: FRIST,
    });
    expect(fehler(unterlagenAktionSchema.safeParse({ aktion: "frist-aendern", nachforderungId: ID }))).toBe(
      MELDUNGEN.FRIST_FEHLT,
    );
  });

  it("erneut-senden: Adresse, Bestätigung und „frühere sperren“ optional", () => {
    expect(unterlagenAktionSchema.parse({ aktion: "erneut-senden", nachforderungId: ID })).toEqual({
      aktion: "erneut-senden",
      nachforderungId: ID,
    });
    expect(
      unterlagenAktionSchema.parse({
        aktion: "erneut-senden",
        nachforderungId: ID,
        empfaenger: "neu@example.org",
        adresseBestaetigt: true,
        fruehereSperren: true,
      }),
    ).toEqual({
      aktion: "erneut-senden",
      nachforderungId: ID,
      empfaenger: "neu@example.org",
      adresseBestaetigt: true,
      fruehereSperren: true,
    });
    expect(unterlagenAktionSchema.parse({ aktion: "erneut-senden", nachforderungId: ID, empfaenger: "" })).not.toHaveProperty(
      "empfaenger",
      "",
    );
    expect(
      fehler(unterlagenAktionSchema.safeParse({ aktion: "erneut-senden", nachforderungId: ID, empfaenger: "falsch" })),
    ).toBe("Bitte geben Sie eine gültige E-Mail-Adresse an.");
  });

  it("zurueckziehen braucht eine gültige Nachforderungs-Id", () => {
    expect(fehler(unterlagenAktionSchema.safeParse({ aktion: "zurueckziehen" }))).toBe("Ungültige Nachforderung.");
    expect(fehler(unterlagenAktionSchema.safeParse({ aktion: "zurueckziehen", nachforderungId: "n1" }))).toBe(
      "Ungültige Nachforderung.",
    );
  });
});

// =============================================
// POST …/positionen/[positionId]
// =============================================

describe("positionsAktionSchema", () => {
  it("annehmen: Datum, „unbefristet“ oder nichts — nicht beides (Z1)", () => {
    expect(positionsAktionSchema.parse({ aktion: "annehmen" })).toEqual({ aktion: "annehmen" });
    expect(positionsAktionSchema.parse({ aktion: "annehmen", gueltigBis: "2028-03-31" })).toEqual({
      aktion: "annehmen",
      gueltigBis: "2028-03-31",
    });
    expect(positionsAktionSchema.parse({ aktion: "annehmen", gueltigBis: "" })).toEqual({ aktion: "annehmen", gueltigBis: null });
    expect(positionsAktionSchema.parse({ aktion: "annehmen", gueltigBis: null, unbefristet: true })).toEqual({
      aktion: "annehmen",
      gueltigBis: null,
      unbefristet: true,
    });
    expect(fehler(positionsAktionSchema.safeParse({ aktion: "annehmen", gueltigBis: "2028-03-31", unbefristet: true }))).toBe(
      "Bitte entweder ein Ablaufdatum angeben oder „Unbefristet“ wählen, nicht beides.",
    );
    expect(fehler(positionsAktionSchema.safeParse({ aktion: "annehmen", gueltigBis: "31.03.2028" }))).toBe(
      "Bitte geben Sie das Ablaufdatum als Datum an (Tag, Monat, Jahr).",
    );
  });

  it("annehmen: die Art einer freien Zeile darf SONSTIGES sein", () => {
    expect(positionsAktionSchema.parse({ aktion: "annehmen", dokumentTyp: "SONSTIGES" })).toEqual({
      aktion: "annehmen",
      dokumentTyp: "SONSTIGES",
    });
    expect(fehler(positionsAktionSchema.safeParse({ aktion: "annehmen", dokumentTyp: "<script>" }))).toBe(
      MELDUNGEN.TYP_UNBEKANNT,
    );
  });

  it("zurueckweisen: Begründung Pflicht (1..1000), Frist optional", () => {
    expect(positionsAktionSchema.parse({ aktion: "zurueckweisen", begruendung: " Rückseite fehlt. " })).toEqual({
      aktion: "zurueckweisen",
      begruendung: "Rückseite fehlt.",
    });
    expect(positionsAktionSchema.parse({ aktion: "zurueckweisen", begruendung: "x", frist: FRIST })).toMatchObject({
      frist: FRIST,
    });
    for (const begruendung of [undefined, "", "   "]) {
      expect(fehler(positionsAktionSchema.safeParse({ aktion: "zurueckweisen", begruendung }))).toBe(
        "Bitte geben Sie eine Begründung für die Person an.",
      );
    }
    expect(fehler(positionsAktionSchema.safeParse({ aktion: "zurueckweisen", begruendung: "x".repeat(1001) }))).toBe(
      "Die Begründung darf höchstens 1000 Zeichen lang sein.",
    );
  });

  it("entfaellt: interne Notiz optional (≤ 500); annahme-zuruecknehmen ohne Felder", () => {
    expect(positionsAktionSchema.parse({ aktion: "entfaellt" })).toEqual({ aktion: "entfaellt" });
    expect(positionsAktionSchema.parse({ aktion: "entfaellt", notiz: " steht auf dem Titel " })).toEqual({
      aktion: "entfaellt",
      notiz: "steht auf dem Titel",
    });
    expect(fehler(positionsAktionSchema.safeParse({ aktion: "entfaellt", notiz: "x".repeat(501) }))).toBe(
      "Die Notiz darf höchstens 500 Zeichen lang sein.",
    );
    expect(positionsAktionSchema.parse({ aktion: "annahme-zuruecknehmen", fremd: 1 })).toEqual({
      aktion: "annahme-zuruecknehmen",
    });
  });

  it("unbekannte oder fehlende Aktion", () => {
    expect(fehler(positionsAktionSchema.safeParse({}))).toBe("Unbekannte oder fehlende Aktion.");
    expect(fehler(positionsAktionSchema.safeParse({ aktion: "anfordern" }))).toBe("Unbekannte oder fehlende Aktion.");
    expect(fehler(positionsAktionSchema.safeParse(undefined))).toBe(MELDUNGEN.UNGUELTIGE_EINGABE);
  });
});

// =============================================
// Oeffentliche Upload-Seite
// =============================================

describe("gueltigBisPatchSchema", () => {
  it("Datum, null oder leer — das Feld ist Pflicht", () => {
    expect(gueltigBisPatchSchema.parse({ gueltigBis: "2028-03-31" })).toEqual({ gueltigBis: "2028-03-31" });
    expect(gueltigBisPatchSchema.parse({ gueltigBis: null })).toEqual({ gueltigBis: null });
    expect(gueltigBisPatchSchema.parse({ gueltigBis: " " })).toEqual({ gueltigBis: null });
    expect(fehler(gueltigBisPatchSchema.safeParse({}))).toBe(
      "Bitte geben Sie das Ablaufdatum als Datum an (Tag, Monat, Jahr).",
    );
    expect(fehler(gueltigBisPatchSchema.safeParse({ gueltigBis: "2028-13-01" }))).toBe(
      "Bitte geben Sie das Ablaufdatum als Datum an (Tag, Monat, Jahr).",
    );
    expect(fehler(gueltigBisPatchSchema.safeParse([]))).toBe(MELDUNGEN.UNGUELTIGE_EINGABE);
  });
});

describe("uebermittelnSchema", () => {
  it("{} ist gültig; „Gültig bis“ je Position wird mitgeschickt", () => {
    expect(uebermittelnSchema.parse({})).toEqual({});
    const positionId = randomUUID();
    expect(uebermittelnSchema.parse({ gueltigBis: { [positionId]: "2028-03-31" } })).toEqual({
      gueltigBis: { [positionId]: "2028-03-31" },
    });
    expect(uebermittelnSchema.parse({ gueltigBis: { [positionId]: "" } })).toEqual({ gueltigBis: { [positionId]: null } });
  });

  it("fremde Schlüssel, falsche Daten und zu viele Einträge werden abgewiesen", () => {
    expect(fehler(uebermittelnSchema.safeParse({ gueltigBis: { "p-1": "2028-03-31" } }))).toBe("Unbekannte Unterlage.");
    expect(fehler(uebermittelnSchema.safeParse({ gueltigBis: { [randomUUID()]: "morgen" } }))).toBe(
      "Bitte geben Sie das Ablaufdatum als Datum an (Tag, Monat, Jahr).",
    );
    const viele = Object.fromEntries(Array.from({ length: MAX_POSITIONEN + 1 }, () => [randomUUID(), null]));
    expect(fehler(uebermittelnSchema.safeParse({ gueltigBis: viele }))).toBe(MELDUNGEN.UNGUELTIGE_EINGABE);
    expect(fehler(uebermittelnSchema.safeParse({ gueltigBis: ["2028-03-31"] }))).toBe(MELDUNGEN.UNGUELTIGE_EINGABE);
  });
});

describe("positionEingabeSchema", () => {
  it("unterscheidet Katalog und freie Zeile an `typ: null`", () => {
    expect(positionEingabeSchema.parse({ typ: "MASERNSCHUTZ" })).toEqual({ art: "KATALOG", typ: "MASERNSCHUTZ" });
    expect(positionEingabeSchema.parse({ typ: null, bezeichnung: "Attest", originalErforderlich: false })).toEqual({
      art: "FREI",
      typ: null,
      bezeichnung: "Attest",
      originalErforderlich: false,
    });
    // Ein mitgeschicktes `art` entscheidet nicht — `typ` tut es.
    expect(positionEingabeSchema.parse({ art: "FREI", typ: "MASERNSCHUTZ" })).toEqual({ art: "KATALOG", typ: "MASERNSCHUTZ" });
  });
});
