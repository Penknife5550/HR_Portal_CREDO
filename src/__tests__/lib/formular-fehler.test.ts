/**
 * Tests fuer den Uebersetzer von Server-Fehlerantworten in deutsche Saetze.
 *
 * Die Befunde werden, wo immer es geht, von ECHTEN Zod-Schemata erzeugt statt
 * von Hand geschrieben. Grund: Der Helfer lebt davon, die Zod-Standardmeldungen
 * und -Codes zu erkennen. Handgeschriebene Objekte wuerden auch dann noch
 * gruen bleiben, wenn Zod seine Meldungen aendert — der Test soll aber genau
 * das merken.
 */

import { z } from "zod";
import {
  fehlerMeldung,
  fehlerGrund,
  feldBezeichnung,
  FELD_BEZEICHNUNGEN,
  STANDARD_FEHLERMELDUNG,
} from "@/lib/formular-fehler";

/**
 * Ausschnitt aus den beiden Server-Schemata (fragebogen/[token]/route.ts und
 * modalitaeten/[token]/route.ts) — woertlich uebernommen, damit die erzeugten
 * Befunde dieselben sind wie im Betrieb.
 */
const schemaAusschnitt = z.object({
  firstName: z.string().min(1).max(100).optional(),
  title: z.string().max(100).optional(),
  salutation: z.enum(["Herr", "Frau"]).optional(),
  taxAllowance: z.number().min(0).nullable().optional(),
  wochenstunden: z.number().min(0).max(60).nullable().optional(),
  currentStep: z.number().int().min(1).max(9).optional(),
  dsgvoAccepted: z.literal(true).optional(),
  emailPrivate: z.string().email().optional(),
  children: z
    .array(
      z.object({
        firstName: z.string().min(1).max(100),
        birthDate: z.string().min(1),
      }),
    )
    .optional(),
  beschaeftigungsAngaben: z
    .array(
      z.object({
        beginn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Bitte ein gültiges Datum angeben."),
      }),
    )
    .max(20, "Es sind höchstens 20 Einträge möglich.")
    .optional(),
});

/** Baut die Antwort, die beide Routen bei fehlgeschlagener Validierung senden. */
function antwortFuer(eingabe: unknown) {
  const geprueft = schemaAusschnitt.safeParse(eingabe);
  if (geprueft.success) throw new Error("Die Eingabe war unerwartet gültig.");
  return { error: "Validierungsfehler", details: geprueft.error.issues };
}

describe("fehlerMeldung — der gemeldete Fehler", () => {
  it("nennt Feld und Grund, wenn ein Zahlenfeld geleert wurde (NaN)", () => {
    // Genau der Ausloeser aus dem Betrieb: `register(..., { valueAsNumber: true })`
    // liefert fuer ein geleertes Zahlenfeld NaN.
    const satz = fehlerMeldung(antwortFuer({ taxAllowance: NaN }));

    expect(satz).toContain("Steuerfreibetrag");
    expect(satz).toContain("Zahl");
    expect(satz).not.toContain("Validierungsfehler");
    expect(satz).not.toMatch(/received|Expected|nan/);
  });

  it("nennt auch bei den Modalitaeten das betroffene Feld", () => {
    const satz = fehlerMeldung(antwortFuer({ wochenstunden: NaN }));

    expect(satz).toContain("Wochenstunden");
    expect(satz).toContain("Zahl");
  });
});

describe("fehlerMeldung — Feldbezeichnungen", () => {
  it("uebersetzt bekannte Felder ins Deutsche", () => {
    expect(fehlerMeldung(antwortFuer({ firstName: "" }))).toContain("Vorname");
    expect(fehlerMeldung(antwortFuer({ salutation: "Divers" }))).toContain(
      "Anrede",
    );
  });

  it("faellt bei unbekanntem Feld auf den technischen Namen zurueck", () => {
    const satz = fehlerMeldung({
      error: "Validierungsfehler",
      details: [
        {
          code: "invalid_type",
          expected: "string",
          received: "undefined",
          path: ["nochNichtBenanntesFeld"],
          message: "Required",
        },
      ],
    });

    expect(satz).toBe("nochNichtBenanntesFeld: Bitte füllen Sie dieses Feld aus.");
  });

  it("macht verschachtelte Pfade lesbar (Zeile einer Tabelle)", () => {
    const satz = fehlerMeldung(
      antwortFuer({ beschaeftigungsAngaben: [{ beginn: "irgendwas" }] }),
    );

    expect(satz).toContain("Weitere Beschäftigung, Eintrag 1, Beginn");
    // Zaehlung ab eins, nicht ab null.
    expect(satz).not.toContain("Eintrag 0");
  });

  it("zaehlt die Eintraege ab eins, auch bei der zweiten Zeile", () => {
    const satz = fehlerMeldung(
      antwortFuer({
        children: [
          { firstName: "Anna", birthDate: "2020-01-01" },
          { firstName: "", birthDate: "2021-01-01" },
        ],
      }),
    );

    expect(satz).toContain("Kind, Eintrag 2, Vorname");
  });

  it("kommt ohne Pfad aus (dann steht nur der Grund da)", () => {
    const satz = fehlerMeldung({
      details: [{ code: "custom", path: [], message: "Die Angaben passen nicht zusammen." }],
    });

    expect(satz).toBe("Die Angaben passen nicht zusammen.");
  });
});

describe("fehlerMeldung — mehrere Fehler", () => {
  // Zod meldet in der Reihenfolge der SCHEMA-Definition, nicht in der des
  // gesendeten Objekts. Im Ausschnitt oben ist das:
  // firstName, title, salutation, taxAllowance, wochenstunden.

  it("nennt die ersten drei Felder und zaehlt den Rest", () => {
    const satz = fehlerMeldung(
      antwortFuer({
        firstName: "",
        title: "x".repeat(101),
        salutation: "Divers",
        taxAllowance: NaN,
        wochenstunden: 99,
      }),
    );

    expect(satz).toContain("Vorname");
    expect(satz).toContain("Titel");
    expect(satz).toContain("Anrede");
    // Vier und fuenf werden nur gezaehlt, nicht genannt.
    expect(satz).not.toContain("Steuerfreibetrag");
    expect(satz).not.toContain("Wochenstunden");
    expect(satz).toContain("Und 2 weitere Angaben.");
  });

  it("sagt bei genau einem uebrigen Fehler „Angabe“ im Singular", () => {
    const satz = fehlerMeldung(
      antwortFuer({
        firstName: "",
        title: "x".repeat(101),
        salutation: "Divers",
        taxAllowance: NaN,
      }),
    );

    expect(satz).toContain("Und 1 weitere Angabe.");
  });

  it("haengt bei genau drei Fehlern keinen Zaehler an", () => {
    const satz = fehlerMeldung(
      antwortFuer({ firstName: "", title: "x".repeat(101), salutation: "Divers" }),
    );

    expect(satz).not.toContain("weitere");
  });

  it("nennt denselben Satz nicht doppelt", () => {
    const satz = fehlerMeldung({
      details: [
        { code: "invalid_type", received: "nan", expected: "number", path: ["taxAllowance"], message: "Expected number, received nan" },
        { code: "invalid_type", received: "nan", expected: "number", path: ["taxAllowance"], message: "Expected number, received nan" },
      ],
    });

    expect(satz.match(/Steuerfreibetrag/g)).toHaveLength(1);
    expect(satz).not.toContain("weitere");
  });
});

describe("fehlerGrund — die englischen Zod-Meldungen werden uebersetzt", () => {
  /** Erzeugt genau einen Befund aus einem echten Schema. */
  function befund(schema: z.ZodTypeAny, wert: unknown) {
    const geprueft = schema.safeParse(wert);
    if (geprueft.success) throw new Error("Die Eingabe war unerwartet gültig.");
    return geprueft.error.issues[0];
  }

  it("fehlende Pflichtangabe", () => {
    // Zod meldet ein fehlendes Pflichtfeld als „Required".
    expect(fehlerGrund(befund(z.object({ a: z.string() }), {}))).toBe(
      "Bitte füllen Sie dieses Feld aus.",
    );
    // null statt Text ist derselbe Sachverhalt fuer die Person am Bildschirm.
    expect(fehlerGrund(befund(z.string(), null))).toBe(
      "Bitte füllen Sie dieses Feld aus.",
    );
    // Leerer Text bei min(1) ebenso.
    expect(fehlerGrund(befund(z.string().min(1), ""))).toBe(
      "Bitte füllen Sie dieses Feld aus.",
    );
  });

  it("geleertes Zahlenfeld (NaN)", () => {
    expect(fehlerGrund(befund(z.number(), NaN))).toBe(
      "Hier wird eine Zahl erwartet. Bitte geben Sie eine Zahl ein oder lassen Sie das Feld ganz leer.",
    );
  });

  it("falscher Typ", () => {
    expect(fehlerGrund(befund(z.number(), "abc"))).toBe(
      "Bitte geben Sie eine Zahl ein.",
    );
    expect(fehlerGrund(befund(z.string(), 42))).toBe(
      "Bitte geben Sie einen Text ein.",
    );
    expect(fehlerGrund(befund(z.number().int(), 2.5))).toBe(
      "Bitte geben Sie eine ganze Zahl ohne Nachkommastellen ein.",
    );
  });

  it("ungueltige Auswahl", () => {
    expect(fehlerGrund(befund(z.enum(["Herr", "Frau"]), "Divers"))).toBe(
      "Bitte wählen Sie einen der angebotenen Werte.",
    );
    const union = z.discriminatedUnion("kategorie", [
      z.object({ kategorie: z.literal("WEITERE") }),
      z.object({ kategorie: z.literal("AUSLAND") }),
    ]);
    expect(fehlerGrund(befund(union, { kategorie: "SONST" }))).toBe(
      "Bitte wählen Sie einen der angebotenen Werte.",
    );
  });

  it("fehlende Bestaetigung (z.literal(true))", () => {
    expect(fehlerGrund(befund(z.literal(true), false))).toBe(
      "Diese Bestätigung ist erforderlich.",
    );
  });

  it("Text zu lang", () => {
    expect(fehlerGrund(befund(z.string().max(100), "x".repeat(101)))).toBe(
      "Der Text ist zu lang. Bitte kürzen Sie ihn auf höchstens 100 Zeichen.",
    );
  });

  it("Zahl zu gross und zu klein", () => {
    expect(fehlerGrund(befund(z.number().max(60), 99))).toBe(
      "Der Wert ist zu groß. Zulässig sind höchstens 60.",
    );
    expect(fehlerGrund(befund(z.number().min(0), -1))).toBe(
      "Der Wert ist zu klein. Zulässig sind mindestens 0.",
    );
  });

  it("ungueltige E-Mail-Adresse", () => {
    expect(fehlerGrund(befund(z.string().email(), "kein-at-zeichen"))).toBe(
      "Bitte geben Sie eine gültige E-Mail-Adresse ein.",
    );
  });

  it("ungueltiges Datum", () => {
    // z.date() meldet invalid_date …
    expect(fehlerGrund(befund(z.date(), new Date("nichts")))).toBe(
      "Bitte geben Sie ein gültiges Datum ein.",
    );
    // … und ein fehlendes Datumsfeld faellt auf die Pflichtangabe zurueck.
    expect(fehlerGrund(befund(z.object({ d: z.date() }), {}))).toBe(
      "Bitte füllen Sie dieses Feld aus.",
    );
  });

  it("reicht eigene deutsche Meldungen aus dem Schema unveraendert durch", () => {
    const datum = z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Bitte ein gültiges Datum angeben.");
    expect(fehlerGrund(befund(datum, "gestern"))).toBe(
      "Bitte ein gültiges Datum angeben.",
    );

    const liste = z.array(z.string()).max(20, "Es sind höchstens 20 Einträge möglich.");
    expect(fehlerGrund(befund(liste, Array(21).fill("x")))).toBe(
      "Es sind höchstens 20 Einträge möglich.",
    );

    const ende = z
      .object({ beginn: z.string(), ende: z.string() })
      .superRefine((wert, ctx) => {
        if (wert.ende < wert.beginn) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["ende"],
            message: "Das Ende darf nicht vor dem Beginn liegen.",
          });
        }
      });
    expect(fehlerGrund(befund(ende, { beginn: "2026-05-01", ende: "2026-01-01" }))).toBe(
      "Das Ende darf nicht vor dem Beginn liegen.",
    );
  });

  it("gibt Unbekanntes neutral aus statt englisches Zod-Kauderwelsch", () => {
    expect(
      fehlerGrund({ code: "irgendwas_neues", message: "Invalid something new" }),
    ).toBe("Bitte prüfen Sie die Eingabe.");
    // Auch ohne jede Angabe darf nichts Englisches durchrutschen.
    expect(fehlerGrund({})).toBe("Bitte prüfen Sie die Eingabe.");
  });

  it("laesst keine englische Standardmeldung in die Ausgabe", () => {
    const eingaben: Array<[z.ZodTypeAny, unknown]> = [
      [z.string(), null],
      [z.number(), NaN],
      [z.number().max(60), 99],
      [z.string().max(3), "zulang"],
      [z.enum(["a", "b"]), "c"],
      [z.literal(true), false],
      [z.string().email(), "x"],
      [z.array(z.string()).min(2), ["x"]],
      [z.date(), new Date("nichts")],
    ];

    for (const [schema, wert] of eingaben) {
      const satz = fehlerGrund(befund(schema, wert));
      expect(satz).not.toMatch(
        /Required|Expected |Invalid|must contain|must be|character\(s\)|element\(s\)/,
      );
    }
  });
});

describe("fehlerMeldung — Antworten ohne Zod-Befunde", () => {
  it("reicht den vorhandenen Fehlertext durch", () => {
    expect(fehlerMeldung({ error: "Fragebogen wurde bereits eingereicht." })).toBe(
      "Fragebogen wurde bereits eingereicht.",
    );
    expect(fehlerMeldung({ error: "Zu viele Anfragen. Bitte warten Sie." })).toBe(
      "Zu viele Anfragen. Bitte warten Sie.",
    );
  });

  it("nimmt ersatzweise message", () => {
    expect(fehlerMeldung({ message: "Der Link ist abgelaufen." })).toBe(
      "Der Link ist abgelaufen.",
    );
  });

  it("liefert den Standardsatz, wenn nichts Verwertbares da ist", () => {
    expect(fehlerMeldung(undefined)).toBe(STANDARD_FEHLERMELDUNG);
    expect(fehlerMeldung(null)).toBe(STANDARD_FEHLERMELDUNG);
    expect(fehlerMeldung({})).toBe(STANDARD_FEHLERMELDUNG);
    expect(fehlerMeldung({ error: "   " })).toBe(STANDARD_FEHLERMELDUNG);
    expect(fehlerMeldung({ details: [] })).toBe(STANDARD_FEHLERMELDUNG);
    expect(fehlerMeldung(42)).toBe(STANDARD_FEHLERMELDUNG);
    expect(fehlerMeldung("")).toBe(STANDARD_FEHLERMELDUNG);
  });

  it("faellt auf den Fehlertext zurueck, wenn details unbrauchbar ist", () => {
    expect(
      fehlerMeldung({ error: "Etwas ist schiefgelaufen.", details: "kaputt" }),
    ).toBe("Etwas ist schiefgelaufen.");
  });

  it("nimmt auch eine Antwort, die nur Text ist", () => {
    expect(fehlerMeldung("Der Dienst ist nicht erreichbar.")).toBe(
      "Der Dienst ist nicht erreichbar.",
    );
  });

  it("versteht auch einen kompletten ZodError statt nur der issues", () => {
    const geprueft = schemaAusschnitt.safeParse({ taxAllowance: NaN });
    if (geprueft.success) throw new Error("Die Eingabe war unerwartet gültig.");
    const satz = fehlerMeldung({
      error: "Validierungsfehler",
      details: { issues: geprueft.error.issues },
    });

    expect(satz).toContain("Steuerfreibetrag");
  });

  it("uebersteht kaputte Eintraege in details", () => {
    const satz = fehlerMeldung({
      error: "Validierungsfehler",
      details: [null, "kaputt", { path: ["firstName"], code: "invalid_type", received: "undefined" }],
    });

    expect(satz).toBe("Vorname: Bitte füllen Sie dieses Feld aus.");
  });
});

describe("feldBezeichnung", () => {
  it("uebersetzt einen einfachen Pfad", () => {
    expect(feldBezeichnung(["taxAllowance"])).toBe("Steuerfreibetrag");
    expect(feldBezeichnung(["betriebsstaette"])).toBe("Betriebsstätte");
  });

  it("uebersetzt einen verschachtelten Pfad", () => {
    expect(feldBezeichnung(["beschaeftigungsAngaben", 0, "beginn"])).toBe(
      "Weitere Beschäftigung, Eintrag 1, Beginn",
    );
    expect(feldBezeichnung(["children", 2, "birthDate"])).toBe(
      "Kind, Eintrag 3, Geburtsdatum",
    );
  });

  it("versteht Indizes auch als Text (JSON-Rundreise)", () => {
    expect(feldBezeichnung(["children", "1", "firstName"])).toBe(
      "Kind, Eintrag 2, Vorname",
    );
  });

  it("liefert leer, wenn kein Pfad da ist", () => {
    expect(feldBezeichnung([])).toBe("");
    expect(feldBezeichnung(undefined)).toBe("");
    expect(feldBezeichnung("firstName")).toBe("");
  });
});

describe("FELD_BEZEICHNUNGEN", () => {
  it("deckt die Felder beider Formulare ab", () => {
    // Stichprobe aus beiden Server-Schemata. Wer ein Feld hinzufuegt, ohne die
    // Tabelle zu pflegen, bekommt im Formular den technischen Namen zu sehen —
    // dieser Test haelt wenigstens den Bestand fest.
    const pflicht = [
      // Personalfragebogen
      "salutation", "firstName", "lastName", "birthDate", "iban",
      "socialSecurityNumber", "taxId", "taxClass", "taxAllowance",
      "childAllowance", "disabilityDegree", "otherWeeklyHours", "currentStep",
      "children", "beschaeftigungsAngaben", "dsgvoAccepted", "erklaerungOrt",
      // Einstellungsmodalitaeten
      "betriebsstaette", "vertragsbeginn", "wochenstunden", "tageProWoche",
      "probezeitMonate", "festgehalt", "stundenlohn", "sonderzahlungProzent",
      "sachbezuegeBetrag", "zulageBetrag", "urlaubstageProJahr",
      "kostenstelleAnteil", "hauptarbeitgeberStunden", "nebenarbeitgeberStunden",
      // Die Kostenstellen-Aufteilung: `kostenstellen` ist der Listenpfad,
      // `bezeichnung` und `anteil` sind die Felder INNERHALB einer Zeile.
      // Fehlt eines davon, steht im Fehlertext der rohe Zod-Pfad.
      "kostenstellen", "kostenstellenBemerkung", "bezeichnung", "anteil",
    ];

    for (const feld of pflicht) {
      expect(FELD_BEZEICHNUNGEN[feld]).toBeTruthy();
    }
  });

  it("enthaelt keine leeren Bezeichnungen", () => {
    for (const [feld, bezeichnung] of Object.entries(FELD_BEZEICHNUNGEN)) {
      expect(bezeichnung.trim()).not.toBe("");
      expect(bezeichnung).not.toBe(feld);
    }
  });
});
