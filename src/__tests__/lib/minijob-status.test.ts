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
import { FieldConfigHelper } from "@/lib/field-definitions";

const schema = createStep6Schema(new FieldConfigHelper(6));

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
