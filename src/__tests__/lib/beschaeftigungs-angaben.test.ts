/**
 * Tests fuer das Datenmodell der drei Tabellen aus Abschnitt 4 der
 * Minijob-Checkliste (AP 5).
 *
 * Der Kern: Alle drei Tabellen liegen im selben Modell, aber jede verlangt
 * andere Felder. Wenn die kategoriespezifische Validierung nachgibt, landen
 * unvollstaendige Zeilen in der Akte — und in der Betriebspruefung fehlt genau
 * die Angabe, wegen der die Tabelle ueberhaupt erhoben wird.
 */

import {
  ART_LABELS,
  BESCHAEFTIGUNGS_KATEGORIEN,
  KATEGORIE_LABELS,
  beschaeftigungsAngabeSchema,
  beschaeftigungsAngabenListeSchema,
  zuDatensatz,
  type BeschaeftigungsAngabeEingabe,
} from "@/lib/validations/beschaeftigungs-angaben";
import { berechnePruefsumme, kanonischeAngaben } from "@/lib/fragebogen-pruefsumme";

function fehlerPfade(eingabe: unknown): string[] {
  const ergebnis = beschaeftigungsAngabeSchema.safeParse(eingabe);
  return ergebnis.success ? [] : ergebnis.error.issues.map((i) => i.path.join("."));
}

function fehlerMeldungen(eingabe: unknown): string[] {
  const ergebnis = beschaeftigungsAngabeSchema.safeParse(eingabe);
  return ergebnis.success ? [] : ergebnis.error.issues.map((i) => i.message);
}

const WEITERE = {
  kategorie: "WEITERE" as const,
  beginn: "2026-02-01",
  art: "GERINGFUEGIG_MIT_EIGENANTEIL" as const,
};

const VORBESCHAEFTIGUNG = {
  kategorie: "VORBESCHAEFTIGUNG" as const,
  beginn: "2026-01-05",
  ende: "2026-02-20",
  entgeltUeberGrenze: true,
  arbeitstage: 18,
  beiArbeitsagentur: false,
};

const AUSLAND = {
  kategorie: "AUSLAND" as const,
  beginn: "2025-09-01",
};

describe("4a — weitere Beschäftigung", () => {
  it("nimmt Beginn und Art", () => {
    expect(fehlerPfade(WEITERE)).toEqual([]);
  });

  it("verlangt den Beschäftigungsbeginn", () => {
    expect(fehlerPfade({ ...WEITERE, beginn: undefined })).toContain("beginn");
  });

  it("verlangt die Art der Beschäftigung", () => {
    // Ohne sie ist nicht zu entscheiden, ob zusammengerechnet werden muss.
    expect(fehlerPfade({ ...WEITERE, art: undefined })).toContain("art");
  });

  it("kennt genau die drei Arten des amtlichen Musters", () => {
    for (const art of Object.keys(ART_LABELS)) {
      expect(fehlerPfade({ ...WEITERE, art })).toEqual([]);
    }
    expect(fehlerPfade({ ...WEITERE, art: "IRGENDWAS" })).toContain("art");
  });

  it("laesst Arbeitgeber und Adresse weg — Angabe freiwillig", () => {
    expect(fehlerPfade(WEITERE)).toEqual([]);
    expect(
      fehlerPfade({ ...WEITERE, arbeitgeberName: "Bäckerei Lindemann", arbeitgeberAdresse: "Weserstr. 1, Minden" })
    ).toEqual([]);
  });

  it("weist ein unsinniges Datumsformat ab", () => {
    expect(fehlerPfade({ ...WEITERE, beginn: "01.02.2026" })).toContain("beginn");
  });
});

describe("4b — Vorbeschäftigung", () => {
  it("nimmt alle vier Spalten des Musters", () => {
    expect(fehlerPfade(VORBESCHAEFTIGUNG)).toEqual([]);
  });

  it("verlangt Beginn und Ende", () => {
    expect(fehlerPfade({ ...VORBESCHAEFTIGUNG, ende: undefined })).toContain("ende");
    expect(fehlerPfade({ ...VORBESCHAEFTIGUNG, beginn: undefined })).toContain("beginn");
  });

  it("verlangt das Entgelt-Merkmal", () => {
    expect(fehlerPfade({ ...VORBESCHAEFTIGUNG, entgeltUeberGrenze: undefined })).toContain(
      "entgeltUeberGrenze"
    );
  });

  it("verlangt die tatsächlichen Arbeitstage", () => {
    // Sie entscheiden ueber die Drei-Monats-/70-Tage-Grenze.
    expect(fehlerPfade({ ...VORBESCHAEFTIGUNG, arbeitstage: undefined })).toContain("arbeitstage");
  });

  it("weist unmögliche Arbeitstage ab", () => {
    expect(fehlerPfade({ ...VORBESCHAEFTIGUNG, arbeitstage: -1 })).toContain("arbeitstage");
    expect(fehlerPfade({ ...VORBESCHAEFTIGUNG, arbeitstage: 400 })).toContain("arbeitstage");
    expect(fehlerPfade({ ...VORBESCHAEFTIGUNG, arbeitstage: 12.5 })).toContain("arbeitstage");
  });

  it("erlaubt eine Meldung bei der Arbeitsagentur statt einer Beschäftigung", () => {
    // Das Muster fuehrt beides in derselben Tabelle.
    expect(fehlerPfade({ ...VORBESCHAEFTIGUNG, beiArbeitsagentur: true })).toEqual([]);
  });

  it("setzt beiArbeitsagentur auf false, wenn es fehlt", () => {
    const ergebnis = beschaeftigungsAngabeSchema.parse({
      ...VORBESCHAEFTIGUNG,
      beiArbeitsagentur: undefined,
    });
    expect(ergebnis).toMatchObject({ beiArbeitsagentur: false });
  });

  it("weist ein Ende vor dem Beginn ab", () => {
    expect(fehlerPfade({ ...VORBESCHAEFTIGUNG, ende: "2025-12-01" })).toContain("ende");
  });

  it("erlaubt Beginn und Ende am selben Tag", () => {
    expect(fehlerPfade({ ...VORBESCHAEFTIGUNG, ende: VORBESCHAEFTIGUNG.beginn })).toEqual([]);
  });
});

describe("4c — Tätigkeit im Ausland", () => {
  it("verlangt nur den Beginn", () => {
    expect(fehlerPfade(AUSLAND)).toEqual([]);
  });

  it("laesst eine laufende Tätigkeit ohne Ende zu", () => {
    expect(fehlerPfade({ ...AUSLAND, ende: null })).toEqual([]);
  });

  it("weist ein Ende vor dem Beginn ab", () => {
    expect(fehlerPfade({ ...AUSLAND, ende: "2025-08-01" })).toContain("ende");
  });

  it("verlangt weder Arbeitstage noch Entgelt-Merkmal", () => {
    // Die gehoeren zu 4b. Wuerden sie hier verlangt, waere die Trennung der
    // Kategorien wirkungslos.
    expect(fehlerPfade(AUSLAND)).toEqual([]);
  });
});

describe("Kategorien sauber getrennt", () => {
  it("kennt genau die drei Kategorien des Musters", () => {
    expect([...BESCHAEFTIGUNGS_KATEGORIEN]).toEqual([
      "WEITERE",
      "VORBESCHAEFTIGUNG",
      "AUSLAND",
    ]);
    for (const k of BESCHAEFTIGUNGS_KATEGORIEN) {
      expect(KATEGORIE_LABELS[k]).toBeTruthy();
    }
  });

  it("weist eine unbekannte Kategorie ab", () => {
    expect(fehlerPfade({ ...WEITERE, kategorie: "SONSTIGES" }).length).toBeGreaterThan(0);
  });

  it("wendet nicht die Regeln der falschen Kategorie an", () => {
    // Eine 4a-Zeile darf nicht an Feldern scheitern, die nur 4b kennt.
    expect(fehlerPfade(WEITERE)).toEqual([]);
    // Eine 4b-Zeile ohne die 4a-Art muss trotzdem durchgehen.
    expect(fehlerPfade(VORBESCHAEFTIGUNG)).toEqual([]);
  });
});

describe("Liste der Zeilen", () => {
  it("nimmt mehrere Kategorien gemischt", () => {
    const ergebnis = beschaeftigungsAngabenListeSchema.safeParse([
      WEITERE,
      VORBESCHAEFTIGUNG,
      AUSLAND,
    ]);
    expect(ergebnis.success).toBe(true);
  });

  it("nimmt eine leere Liste — das heisst 'keine Zeilen'", () => {
    expect(beschaeftigungsAngabenListeSchema.safeParse([]).success).toBe(true);
  });

  it("begrenzt die Zahl der Zeilen", () => {
    const zuViele = Array.from({ length: 21 }, () => WEITERE);
    expect(beschaeftigungsAngabenListeSchema.safeParse(zuViele).success).toBe(false);
  });
});

describe("zuDatensatz — Abbildung auf die Datenbank", () => {
  it("setzt fremde Felder ausdrücklich auf null", () => {
    // Beim Ersetzen einer Zeile darf kein Wert aus einer anderen Kategorie
    // stehen bleiben.
    const satz = zuDatensatz(WEITERE as BeschaeftigungsAngabeEingabe, "pd-1", 0);
    expect(satz).toMatchObject({
      kategorie: "WEITERE",
      art: "GERINGFUEGIG_MIT_EIGENANTEIL",
      ende: null,
      entgeltUeberGrenze: null,
      arbeitstage: null,
      beiArbeitsagentur: false,
    });
  });

  it("übernimmt die 4b-Felder vollständig", () => {
    const satz = zuDatensatz(VORBESCHAEFTIGUNG as BeschaeftigungsAngabeEingabe, "pd-1", 2);
    expect(satz).toMatchObject({
      kategorie: "VORBESCHAEFTIGUNG",
      art: null,
      entgeltUeberGrenze: true,
      arbeitstage: 18,
      orderIndex: 2,
    });
    expect(satz.ende).toBeInstanceOf(Date);
  });

  it("lässt das Ende einer laufenden Auslandstätigkeit leer", () => {
    const satz = zuDatensatz(AUSLAND as BeschaeftigungsAngabeEingabe, "pd-1", 0);
    expect(satz.ende).toBeNull();
    expect(satz.beginn).toBeInstanceOf(Date);
  });

  it("macht aus leeren Arbeitgeber-Angaben null, nicht Leerstring", () => {
    const satz = zuDatensatz(
      { ...WEITERE, arbeitgeberName: "   ", arbeitgeberAdresse: "" } as BeschaeftigungsAngabeEingabe,
      "pd-1",
      0
    );
    expect(satz.arbeitgeberName).toBeNull();
    expect(satz.arbeitgeberAdresse).toBeNull();
  });
});

describe("Fehlermeldungen der Zeilen", () => {
  /**
   * Zods Rohmeldungen sind englisch, und sie sagen nicht, welches Feld gemeint
   * ist. Genau so las sich die rote Box bisher: Wer die automatisch angelegte
   * leere Zeile stehen liess, bekam das Wort "Required" zu sehen.
   */
  const ENGLISCHE_ROHMELDUNGEN =
    /String must contain|Number must be|Invalid enum value|Expected \w+, received|^Required$|Invalid input|Invalid discriminator/;

  /**
   * Eine unberuehrte Zeile, so wie `zurPruefung()` in
   * `src/app/fragebogen/[token]/steps/step6-employment.tsx` sie sendet: leere
   * Textfelder als "", nicht beantwortete Fragen als `undefined`.
   */
  const LEERE_ZEILE: Record<string, Record<string, unknown>> = {
    WEITERE: {
      kategorie: "WEITERE",
      beginn: "",
      arbeitgeberName: null,
      arbeitgeberAdresse: null,
      art: undefined,
    },
    VORBESCHAEFTIGUNG: {
      kategorie: "VORBESCHAEFTIGUNG",
      beginn: "",
      ende: "",
      entgeltUeberGrenze: undefined,
      arbeitstage: undefined,
      beiArbeitsagentur: false,
      arbeitgeberName: null,
      arbeitgeberAdresse: null,
    },
    AUSLAND: {
      kategorie: "AUSLAND",
      beginn: "",
      ende: null,
      arbeitgeberName: null,
      arbeitgeberAdresse: null,
    },
  };

  it.each(Object.keys(LEERE_ZEILE))(
    "meldet die leere %s-Zeile ohne englische Rohmeldung",
    (kategorie) => {
      const meldungen = fehlerMeldungen(LEERE_ZEILE[kategorie]);
      expect(meldungen.length).toBeGreaterThan(0);
      for (const m of meldungen) expect(m).not.toMatch(ENGLISCHE_ROHMELDUNGEN);
    }
  );

  it("gibt jedem offenen Feld einer Zeile einen eigenen Satz", () => {
    // Der Aufrufer entdoppelt die Meldungen einer Zeile, bevor er sie in die
    // rote Box schreibt (step6-employment.tsx, onSubmit). Traegen zwei Felder
    // denselben Satz, bleibt nach dem Entdoppeln einer uebrig — und die Person
    // raet, welches Feld gemeint war. Vier offene Felder, vier Saetze.
    const meldungen = fehlerMeldungen(LEERE_ZEILE.VORBESCHAEFTIGUNG);
    expect(fehlerPfade(LEERE_ZEILE.VORBESCHAEFTIGUNG).sort()).toEqual([
      "arbeitstage",
      "beginn",
      "ende",
      "entgeltUeberGrenze",
    ]);
    expect(new Set(meldungen).size).toBe(4);
  });

  it("nennt in der Datumsmeldung, um welches Datum es geht", () => {
    const [beginn] = fehlerMeldungen({ ...VORBESCHAEFTIGUNG, beginn: "" });
    const [ende] = fehlerMeldungen({ ...VORBESCHAEFTIGUNG, ende: "" });
    expect(beginn).toMatch(/Beginn/);
    expect(ende).toMatch(/Ende/);
    expect(beginn).not.toBe(ende);
  });

  it("meldet die Art der Beschäftigung mit einem Satz — leer wie unberührt", () => {
    // Beide Faelle kann die Oberflaeche liefern: `undefined` als Vorgabewert
    // und "" fuer den Eintrag "Bitte waehlen...".
    const satz = "Bitte wählen Sie die Art der Beschäftigung.";
    expect(fehlerMeldungen({ ...WEITERE, art: undefined })).toEqual([satz]);
    expect(fehlerMeldungen({ ...WEITERE, art: "" })).toEqual([satz]);
    expect(fehlerMeldungen({ ...WEITERE, art: "IRGENDWAS" })).toEqual([satz]);
  });

  it("erklärt das fehlende Entgelt-Merkmal", () => {
    const [meldung] = fehlerMeldungen({
      ...VORBESCHAEFTIGUNG,
      entgeltUeberGrenze: undefined,
    });
    expect(meldung).toMatch(/Entgelt/);
    expect(meldung).not.toMatch(ENGLISCHE_ROHMELDUNGEN);
  });

  it("meldet unbrauchbare Arbeitstage deutsch", () => {
    // `Number("acht")` ist NaN — fuer Zod ein Typfehler, kein Bereichsfehler.
    for (const wert of [undefined, Number.NaN, -1, 400, 12.5]) {
      const meldungen = fehlerMeldungen({ ...VORBESCHAEFTIGUNG, arbeitstage: wert });
      expect(meldungen.length).toBeGreaterThan(0);
      for (const m of meldungen) expect(m).not.toMatch(ENGLISCHE_ROHMELDUNGEN);
    }
  });

  it("meldet zu lange Arbeitgeber-Angaben deutsch", () => {
    const name = fehlerMeldungen({ ...WEITERE, arbeitgeberName: "x".repeat(201) });
    const adresse = fehlerMeldungen({ ...WEITERE, arbeitgeberAdresse: "x".repeat(301) });
    expect(name.length).toBe(1);
    expect(adresse.length).toBe(1);
    for (const m of [...name, ...adresse]) expect(m).not.toMatch(ENGLISCHE_ROHMELDUNGEN);
  });

  it("meldet eine unbekannte Kategorie deutsch", () => {
    // Nur ueber einen manipulierten oder veralteten Aufruf erreichbar — aber
    // eine englische Rohmeldung in einer sonst deutschen Box faellt auf.
    const meldungen = fehlerMeldungen({ ...WEITERE, kategorie: "SONSTIGES" });
    expect(meldungen.length).toBeGreaterThan(0);
    for (const m of meldungen) expect(m).not.toMatch(ENGLISCHE_ROHMELDUNGEN);
  });

  it("lässt die Meldungen der Mitglieder unberührt", () => {
    // Die errorMap sitzt an der Vereinigung. Wuerde sie auf die Felder
    // durchschlagen, stuende ueberall derselbe Satz.
    expect(fehlerMeldungen({ ...WEITERE, art: undefined })).not.toEqual(
      fehlerMeldungen({ ...WEITERE, beginn: "" })
    );
  });
});

describe("Prüfsumme deckt die Zeilen mit ab", () => {
  const angaben = { firstName: "Lena", lastName: "Bergmann" };
  const zeile = {
    kategorie: "WEITERE",
    beginn: "2026-02-01",
    art: "GERINGFUEGIG_MIT_EIGENANTEIL",
    arbeitgeberName: "Bäckerei Lindemann",
  };

  it("ändert sich, sobald eine Zeile dazukommt", () => {
    expect(berechnePruefsumme(angaben, [], [zeile])).not.toBe(
      berechnePruefsumme(angaben, [])
    );
  });

  it("ändert sich, wenn sich eine Zeile ändert", () => {
    const geaendert = { ...zeile, art: "MEHR_ALS_GERINGFUEGIG" };
    expect(berechnePruefsumme(angaben, [], [geaendert])).not.toBe(
      berechnePruefsumme(angaben, [], [zeile])
    );
  });

  it("hängt nicht an der Reihenfolge der Zeilen", () => {
    const zwei = [zeile, { ...zeile, beginn: "2025-01-01" }];
    expect(berechnePruefsumme(angaben, [], zwei)).toBe(
      berechnePruefsumme(angaben, [], [...zwei].reverse())
    );
  });

  it("lässt Prüfsummen ohne Zeilen unverändert", () => {
    // Vorgaenge, die vor diesem Modell abgesendet wurden, muessen nachrechenbar
    // bleiben — sonst waere die Pruefsumme wertlos.
    expect(berechnePruefsumme(angaben, [], [])).toBe(berechnePruefsumme(angaben, []));
    expect(kanonischeAngaben(angaben, [], [])).not.toContain("beschaeftigungen");
  });
});
