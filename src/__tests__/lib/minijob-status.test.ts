/**
 * Tests fuer Abschnitt 2 der Minijob-Checkliste: Status bei Beginn der
 * Beschaeftigung und die Rueckfrage zur Agentur fuer Arbeit (AP 6).
 *
 * Zwei Anliegen:
 *
 * 1. Der Katalog bildet das amtliche Muster vollstaendig ab. Fehlt eine Option,
 *    kann der Beschaeftigte sich nicht korrekt einordnen — und die
 *    sozialversicherungsrechtliche Beurteilung steht auf falschem Grund.
 * 2. Die Erklaerungen sind da, wo eine gesetzliche Definition dahintersteckt.
 *    Auf Papier stehen sie in Fussnoten; am Bildschirm liest die niemand.
 */

import {
  STATUS_OPTIONEN,
  fragtNachAgentur,
  getStatusOption,
  nachweisFuerStatus,
  statusLabel,
} from "@/lib/minijob-status";
import { createStep6Schema } from "@/lib/validations/personal-data";
import { FIELD_REGISTRY, FieldConfigHelper } from "@/lib/field-definitions";

// seed-check.js haelt den Zielzustand von Schritt 6 fuer MINIJOB. Ihn hier zu
// verwenden statt einer handgeschriebenen Kopie heisst: Die Tests pruefen
// genau die Konfiguration, die die Migration in die Vorlage schreibt.
const seedCheck = require("../../../prisma/seed-check.js");

/** Schritt 6 so, wie ihn ein MINIJOB-Vorgang sieht. */
const schema = createStep6Schema(
  new FieldConfigHelper(6, seedCheck.MINIJOB_STEP6_FIELDS)
);

/** Schritt 6 so, wie ihn ein TV-L-, Beamten- oder Erzieher-Vorgang sieht. */
const schemaOhneMinijob = createStep6Schema(new FieldConfigHelper(6));

function fehlerPfade(eingabe: Record<string, unknown>): string[] {
  const ergebnis = schema.safeParse(eingabe);
  return ergebnis.success ? [] : ergebnis.error.issues.map((i) => i.path.join("."));
}

const BASIS = {
  beschaeftigungsStatus: "SCHUELER",
  beschaeftigungsStatusSonstige: "",
  alsArbeitsuchendGemeldet: false,
  agenturFuerArbeit: "",
  mitLeistungsbezug: null,
  hasOtherEmployment: false,
  summeUeberGeringfuegigkeitsgrenze: null,
  vorbeschaeftigungenVorhanden: false,
  auslandsbeschaeftigungVorhanden: false,
  employerType: "hauptarbeitgeber",
};

describe("Statuskatalog", () => {
  it("bildet alle 17 Auswahlmöglichkeiten des Musters ab", () => {
    expect(STATUS_OPTIONEN).toHaveLength(17);
  });

  it("vergibt jeden Wert genau einmal", () => {
    const werte = STATUS_OPTIONEN.map((o) => o.wert);
    expect(new Set(werte).size).toBe(werte.length);
  });

  it("gibt jeder Option eine Beschriftung", () => {
    for (const o of STATUS_OPTIONEN) {
      expect(o.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("erklärt die Begriffe, die im Muster eine Fußnote haben", () => {
    // Genau diese vier erlaeutert das amtliche Muster.
    for (const wert of [
      "SCHUELER",
      "SCHULENTLASSEN_STUDIUM",
      "SCHULENTLASSEN_FREIWILLIGENDIENST",
      "FREIWILLIGENDIENSTLEISTENDER",
    ]) {
      expect(getStatusOption(wert)?.hilfe).toBeTruthy();
    }
  });

  it("nennt bei „Schüler“ die gemeinten Schularten", () => {
    const hilfe = getStatusOption("SCHUELER")!.hilfe!;
    for (const schulart of ["Hauptschule", "Realschule", "Gymnasium", "Förderschule"]) {
      expect(hilfe).toContain(schulart);
    }
    // Und grenzt ab, was nicht gemeint ist.
    expect(hilfe).toContain("Berufsschule");
  });

  it("erklärt die Regelaltersgrenze, wo sie vorkommt", () => {
    expect(getStatusOption("ALTERSVOLLRENTNER_VOR_REGELALTERSGRENZE")?.hilfe).toContain(
      "Regelaltersgrenze"
    );
    // Wer sie erreicht hat, braucht keine Befreiung zu beantragen. Geprueft
    // wird die Aussage, nicht das Fachwort: "versicherungsfrei" waere fuer die
    // Zielgruppe des Formulars gerade das falsche Wort.
    expect(getStatusOption("ALTERSVOLLRENTNER_NACH_REGELALTERSGRENZE")?.hilfe).toContain(
      "Befreiung"
    );
  });

  it("kommt in den Erklärungen ohne Paragrafenketten aus", () => {
    // Verweise auf Gesetze gehoeren in die Akte, nicht in ein Formular, das
    // ein Schueler ausfuellt. Wo eine Rechtsfolge erklaert werden muss, steht
    // sie in eigenen Worten.
    for (const option of STATUS_OPTIONEN) {
      const text = `${option.kurz ?? ""} ${option.hilfe ?? ""}`;
      expect(text).not.toMatch(/§\s*\d/);
      expect(text).not.toContain("SGB");
    }
  });

  it("verlangt bei „Sonstige“ einen Freitext", () => {
    expect(getStatusOption("SONSTIGE")?.fragtNachFreitext).toBe(true);
  });

  it("fragt bei Beschäftigungslosen nach der Agentur", () => {
    expect(fragtNachAgentur("BESCHAEFTIGUNGSLOS_SUCHEND")).toBe(true);
    expect(fragtNachAgentur("SCHUELER")).toBe(false);
  });

  it("nennt den Nachweis, wo einer gebraucht wird", () => {
    expect(nachweisFuerStatus("SCHUELER")).toContain("Schulbescheinigung");
    expect(nachweisFuerStatus("STUDENT")).toContain("Immatrikulationsbescheinigung");
    expect(nachweisFuerStatus("BEAMTER")).toBeUndefined();
  });

  it("liefert eine Beschriftung mit Fallback", () => {
    expect(statusLabel("SCHUELER")).toBe("Schüler");
    expect(statusLabel("GIBT_ES_NICHT")).toBe("—");
    expect(statusLabel(null)).toBe("—");
  });
});

describe("Schritt 6 — Validierung", () => {
  it("nimmt die einfachste Antwort: nichts trifft zu", () => {
    expect(fehlerPfade(BASIS)).toEqual([]);
  });

  it("verlangt eine Statusauswahl", () => {
    expect(fehlerPfade({ ...BASIS, beschaeftigungsStatus: "" })).toContain(
      "beschaeftigungsStatus"
    );
  });

  it("verlangt bei „Sonstige“ eine Erläuterung", () => {
    expect(fehlerPfade({ ...BASIS, beschaeftigungsStatus: "SONSTIGE" })).toContain(
      "beschaeftigungsStatusSonstige"
    );
    expect(
      fehlerPfade({
        ...BASIS,
        beschaeftigungsStatus: "SONSTIGE",
        beschaeftigungsStatusSonstige: "Erwerbsminderungsrentner",
      })
    ).toEqual([]);
  });

  it("lässt Leerzeichen nicht als Erläuterung durchgehen", () => {
    expect(
      fehlerPfade({
        ...BASIS,
        beschaeftigungsStatus: "SONSTIGE",
        beschaeftigungsStatusSonstige: "   ",
      })
    ).toContain("beschaeftigungsStatusSonstige");
  });

  it("verlangt Agentur und Leistungsbezug, wenn jemand gemeldet ist", () => {
    const pfade = fehlerPfade({ ...BASIS, alsArbeitsuchendGemeldet: true });
    expect(pfade).toContain("agenturFuerArbeit");
    expect(pfade).toContain("mitLeistungsbezug");
  });

  it("nimmt die Meldung mit vollständigen Angaben an", () => {
    expect(
      fehlerPfade({
        ...BASIS,
        alsArbeitsuchendGemeldet: true,
        agenturFuerArbeit: "Agentur für Arbeit Minden",
        mitLeistungsbezug: false,
      })
    ).toEqual([]);
  });

  it("fragt die Addition nur ohne Hauptbeschäftigung", () => {
    // Mit Hauptbeschaeftigung wird der erste Minijob nicht zusammengerechnet —
    // die Frage waere sinnlos.
    expect(
      fehlerPfade({
        ...BASIS,
        beschaeftigungsStatus: "ARBEITNEHMER_HAUPTBESCHAEFTIGUNG",
        hasOtherEmployment: true,
      })
    ).toEqual([]);

    // Ohne Hauptbeschaeftigung und mit weiteren Minijobs muss sie beantwortet sein.
    expect(
      fehlerPfade({ ...BASIS, beschaeftigungsStatus: "SCHUELER", hasOtherEmployment: true })
    ).toContain("summeUeberGeringfuegigkeitsgrenze");
  });

  it("fragt die Addition nicht, wenn es nichts zu addieren gibt", () => {
    expect(
      fehlerPfade({ ...BASIS, beschaeftigungsStatus: "SCHUELER", hasOtherEmployment: false })
    ).toEqual([]);
  });

  it("nimmt ein „Nein“ auf die Additionsfrage als Antwort", () => {
    expect(
      fehlerPfade({
        ...BASIS,
        hasOtherEmployment: true,
        summeUeberGeringfuegigkeitsgrenze: false,
      })
    ).toEqual([]);
  });
});

describe("Schritt 6 — andere Fragebogentypen bleiben verschont", () => {
  /**
   * Die Regression, um die es geht: Die Minijob-Fragen aus Abschnitt 4 waren
   * eine Zeit lang unbedingte Pflichtangaben. Weil prisma/seed.ts Schritt 6
   * auch fuer STANDARD, BEAMTE und ERZIEHER aktiviert, bekam damit jede
   * TV-L-Angestellte die siebzehn Statusoptionen vorgesetzt — und konnte den
   * Schritt nicht verlassen, weil die Maske die Frage gar nicht anzeigte.
   */
  function fehlerOhneMinijob(eingabe: Record<string, unknown>): string[] {
    const ergebnis = schemaOhneMinijob.safeParse(eingabe);
    return ergebnis.success ? [] : ergebnis.error.issues.map((i) => i.path.join("."));
  }

  /** Was ein Nicht-Minijob-Fragebogen tatsaechlich liefert: keine Statusangabe. */
  const OHNE_STATUS = { ...BASIS, beschaeftigungsStatus: "" };

  it("verlangt keine Statusauswahl", () => {
    expect(fehlerOhneMinijob(OHNE_STATUS)).toEqual([]);
  });

  it("verlangt die Additionsfrage nicht, auch wenn eine weitere Beschäftigung besteht", () => {
    // Ohne das Sichtbarkeits-Gate griffe die Bedingung hier: Der Status ist
    // leer, also gilt "keine Hauptbeschaeftigung" — und der Fragebogen
    // verlangte eine Antwort auf eine Frage, die er nicht anzeigt.
    expect(
      fehlerOhneMinijob({
        ...OHNE_STATUS,
        hasOtherEmployment: true,
        summeUeberGeringfuegigkeitsgrenze: null,
      })
    ).toEqual([]);
  });

  it("blendet die fünf Minijob-Blöcke aus, lässt Arbeitgeber-Typ aber stehen", () => {
    const fc = new FieldConfigHelper(6);
    for (const feld of [
      "beschaeftigungsStatus",
      "alsArbeitsuchendGemeldet",
      "summeUeberGeringfuegigkeitsgrenze",
      "vorbeschaeftigungenVorhanden",
      "auslandsbeschaeftigungVorhanden",
    ]) {
      expect(fc.isVisible(feld)).toBe(false);
    }
    expect(fc.isVisible("employerType")).toBe(true);
    expect(fc.isVisible("hasOtherEmployment")).toBe(true);
  });

  it("zeigt dieselben Blöcke für MINIJOB", () => {
    const fc = new FieldConfigHelper(6, seedCheck.MINIJOB_STEP6_FIELDS);
    for (const feld of [
      "beschaeftigungsStatus",
      "alsArbeitsuchendGemeldet",
      "summeUeberGeringfuegigkeitsgrenze",
      "vorbeschaeftigungenVorhanden",
      "auslandsbeschaeftigungVorhanden",
      "employerType",
      "hasOtherEmployment",
    ]) {
      expect(fc.isVisible(feld)).toBe(true);
    }
  });

  it("hält die Altfelder überall aus", () => {
    // otherEmployerName, otherWeeklyHours und hasMinijob werden nicht mehr
    // erhoben. Stuenden sie sichtbar in der Registry, zeigte der Vorlagen-
    // Editor drei Schalter ohne Wirkung.
    for (const fc of [
      new FieldConfigHelper(6),
      new FieldConfigHelper(6, seedCheck.MINIJOB_STEP6_FIELDS),
    ]) {
      expect(fc.isVisible("otherEmployerName")).toBe(false);
      expect(fc.isVisible("otherWeeklyHours")).toBe(false);
      expect(fc.isVisible("hasMinijob")).toBe(false);
    }
  });
});

describe("MINIJOB_STEP6_FIELDS — synchron zur Feld-Registry", () => {
  // seed-check.js laeuft im Container als reines JS und kann die Registry
  // nicht importieren; die Namen sind dort dupliziert. Laeuft die Kopie
  // auseinander, schreibt die Migration Felder, die es nicht mehr gibt.
  it("nennt genau die Felder aus FIELD_REGISTRY[6]", () => {
    const ausRegistry = FIELD_REGISTRY[6].map((f) => f.name).sort();
    const ausMigration = seedCheck.MINIJOB_STEP6_FIELDS.map(
      (f: { name: string }) => f.name
    ).sort();
    expect(ausMigration).toEqual(ausRegistry);
  });

  it("setzt Schritt 6 in einer leeren Konfiguration auf den Zielzustand", () => {
    const gesetzt = seedCheck.setzeStep6([{ step: 5, title: "Steuer", enabled: true }]);
    expect(seedCheck.step6Passt(gesetzt)).toBe(true);
    // Der bestehende Schritt 5 darf dabei nicht verloren gehen.
    expect(gesetzt.find((s: { step: number }) => s.step === 5)).toBeDefined();
  });

  it("erkennt eine Konfiguration, der die neuen Felder fehlen", () => {
    const alt = [
      {
        step: 6,
        title: "Weitere Beschäftigung",
        enabled: true,
        fields: [{ name: "employerType", label: "Arbeitgeber-Typ", visible: true, required: true }],
      },
    ];
    expect(seedCheck.step6Passt(alt)).toBe(false);
  });
});
