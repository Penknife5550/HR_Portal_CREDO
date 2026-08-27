/**
 * Tests fuer Abschnitt 5 der Minijob-Checkliste: die Entscheidung zur
 * Rentenversicherung (AP 7).
 *
 * Das ist die folgenreichste Frage im Fragebogen — sie wirkt sich auf die
 * spaetere Rente aus und ist bindend. Geprueft wird deshalb nicht nur, dass die
 * vier Wege vollstaendig sind, sondern auch, dass die Darstellung keinen von
 * ihnen bevorzugt und dass die Zusagen an den richtigen Wegen haengen.
 */

import {
  BINDUNG_TEXT,
  MERKBLATT_KERN,
  RV_OPTIONEN,
  RV_SAETZE,
  eigenanteilInEuro,
  getRvOption,
  istWaehlbar,
  rvEntscheidungLabel,
} from "@/lib/minijob-rentenversicherung";
import { FRAGEBOGEN_STEPS, getActiveSteps } from "@/lib/fragebogen-steps";
import { FIELD_REGISTRY } from "@/lib/field-definitions";

describe("Die vier Wege", () => {
  it("bildet alle vier Auswahlmöglichkeiten des Musters ab", () => {
    expect(RV_OPTIONEN).toHaveLength(4);
    expect(RV_OPTIONEN.map((o) => o.wert)).toEqual([
      "KEINE_BEFREIUNG",
      "BEFREIUNG_BEANTRAGT",
      "RENTENVERSICHERUNGSFREI",
      "AUFHEBUNG_BEANTRAGT",
    ]);
  });

  it("beschreibt jeden Weg mit Folgen, nicht nur mit einer Überschrift", () => {
    for (const o of RV_OPTIONEN) {
      expect(o.label.trim().length).toBeGreaterThan(0);
      expect(o.kurz.trim().length).toBeGreaterThan(0);
      expect(o.folgen.length).toBeGreaterThan(0);
    }
  });

  it("stellt die beiden Hauptwege gleich ausführlich dar", () => {
    // Wer sich befreien laesst, verzichtet auf Rentenanspruechen. Waere ein Weg
    // knapper beschrieben als der andere, waere die Gestaltung schon ein Schubs.
    const bleiben = getRvOption("KEINE_BEFREIUNG")!;
    const befreien = getRvOption("BEFREIUNG_BEANTRAGT")!;
    const abstand = Math.abs(bleiben.folgen.length - befreien.folgen.length);
    expect(abstand).toBeLessThanOrEqual(1);
  });

  it("benennt die Nachteile der Befreiung ausdrücklich", () => {
    const text = getRvOption("BEFREIUNG_BEANTRAGT")!.folgen.join(" ");
    expect(text).toContain("anteilig");
    expect(text).toContain("alle Ihre Minijobs");
  });

  it("nennt die Vorteile des Versichertbleibens konkret", () => {
    const text = getRvOption("KEINE_BEFREIUNG")!.folgen.join(" ");
    expect(text).toContain("Erwerbsminderung");
    expect(text).toContain("Reha");
  });

  it("beziffert den Eigenanteil in Euro, nicht nur in Prozent", () => {
    // "3,6 %" sagt wenig, "rund 22 €" sagt etwas.
    expect(getRvOption("KEINE_BEFREIUNG")!.kurz).toMatch(/€/);
    expect(eigenanteilInEuro(603)).toBeCloseTo(21.71, 2);
    expect(eigenanteilInEuro(0)).toBe(0);
  });
});

describe("Zusagen hängen am richtigen Weg", () => {
  it("verlangt das Merkblatt nur vor einer Befreiung", () => {
    // Das amtliche Muster nennt die Kenntnisnahme nur im Befreiungsantrag.
    expect(getRvOption("BEFREIUNG_BEANTRAGT")?.brauchtMerkblatt).toBe(true);
    for (const wert of ["KEINE_BEFREIUNG", "RENTENVERSICHERUNGSFREI", "AUFHEBUNG_BEANTRAGT"]) {
      expect(getRvOption(wert)?.brauchtMerkblatt).toBeUndefined();
    }
  });

  it("verlangt die Bindungswirkung bei Befreiung und Aufhebung", () => {
    // Beide gelten fuer alle Minijobs gleichzeitig; die uebrigen Arbeitgeber
    // muessen informiert werden.
    expect(getRvOption("BEFREIUNG_BEANTRAGT")?.brauchtBindung).toBe(true);
    expect(getRvOption("AUFHEBUNG_BEANTRAGT")?.brauchtBindung).toBe(true);
    expect(getRvOption("KEINE_BEFREIUNG")?.brauchtBindung).toBeUndefined();
  });

  it("verlangt die Schriftform nur bei der Befreiung", () => {
    // § 6 Abs. 1b SGB VI verlangt Schriftform, § 6 Abs. 6 laesst die
    // elektronische Erklaerung ausdruecklich zu. Genau dieser Unterschied.
    expect(getRvOption("BEFREIUNG_BEANTRAGT")?.brauchtUnterschrift).toBe(true);
    expect(getRvOption("AUFHEBUNG_BEANTRAGT")?.brauchtUnterschrift).toBeUndefined();
  });

  it("sagt beim Aufhebungsweg, dass kein Ausdruck nötig ist", () => {
    expect(getRvOption("AUFHEBUNG_BEANTRAGT")!.folgen.join(" ")).toContain("ohne Ausdruck");
  });
});

describe("Aufhebung erst ab 1. Juli 2026", () => {
  const aufhebung = getRvOption("AUFHEBUNG_BEANTRAGT")!;

  it("ist vor dem Stichtag nicht wählbar", () => {
    expect(istWaehlbar(aufhebung, new Date("2026-06-30"))).toBe(false);
  });

  it("ist ab dem Stichtag wählbar", () => {
    expect(istWaehlbar(aufhebung, new Date("2026-07-01"))).toBe(true);
    expect(istWaehlbar(aufhebung, new Date("2027-01-01"))).toBe(true);
  });

  it("lässt die übrigen Wege unbeschränkt", () => {
    for (const o of RV_OPTIONEN.filter((x) => x.wert !== "AUFHEBUNG_BEANTRAGT")) {
      expect(istWaehlbar(o, new Date("2020-01-01"))).toBe(true);
    }
  });
});

describe("Merkblatt im Formular", () => {
  it("nennt die Beitragssätze vollständig", () => {
    const text = MERKBLATT_KERN.einleitung;
    expect(text).toContain(String(RV_SAETZE.arbeitgeber));
    expect(text).toContain(String(RV_SAETZE.eigenanteil).replace(".", ","));
    expect(text).toContain(String(RV_SAETZE.voll).replace(".", ","));
    expect(text).toContain(String(RV_SAETZE.mindestbemessung));
  });

  it("führt die Vorteile des amtlichen Merkblatts auf", () => {
    const text = MERKBLATT_KERN.vorteile.join(" ");
    for (const punkt of ["Reha", "Übergangsgeld", "Erwerbsminderung", "Riester", "Entgeltumwandlung"]) {
      expect(text).toContain(punkt);
    }
  });

  it("benennt den Verzicht klar", () => {
    expect(MERKBLATT_KERN.verzicht).toContain("verzichtet");
    expect(MERKBLATT_KERN.verzicht).toContain("anteilig");
  });

  it("verweist auf die Beratung der Rentenversicherung", () => {
    // Das amtliche Merkblatt empfiehlt sie ausdruecklich — ein Formular darf
    // eine solche Entscheidung nicht allein tragen.
    expect(MERKBLATT_KERN.beratung).toContain("0800 10004800");
    expect(MERKBLATT_KERN.beratung).toContain("Beratung");
  });
});

describe("Bindungswirkung", () => {
  it("nennt Geltung für alle Minijobs und die Informationspflicht", () => {
    expect(BINDUNG_TEXT).toContain("alle meine Minijobs");
    expect(BINDUNG_TEXT).toContain("bindend");
    expect(BINDUNG_TEXT).toContain("informieren");
  });
});

describe("Beschriftung für Akte und PDF", () => {
  it("liefert eine Kurzform je Weg", () => {
    for (const o of RV_OPTIONEN) {
      expect(rvEntscheidungLabel(o.wert)).not.toBe("—");
    }
  });

  it("meldet Unbekanntes als leer", () => {
    expect(rvEntscheidungLabel(null)).toBe("—");
    expect(rvEntscheidungLabel("GIBT_ES_NICHT")).toBe("—");
  });
});

describe("Einbindung als Schritt 11", () => {
  const eintrag = FRAGEBOGEN_STEPS.find((s) => s.step === 11);

  it("steht in der zentralen Definition", () => {
    expect(eintrag).toBeDefined();
    expect(eintrag?.key).toBe("rente");
  });

  it("erscheint vor der Zusammenfassung", () => {
    const nummern = FRAGEBOGEN_STEPS.map((s) => s.step);
    expect(nummern.indexOf(11)).toBeLessThan(nummern.indexOf(10));
  });

  it("hat einen Eintrag in der Feld-Registry", () => {
    expect(FIELD_REGISTRY[11]).toBeDefined();
    expect(FIELD_REGISTRY[11].map((f) => f.name)).toContain("rvEntscheidung");
  });

  it("bleibt aus, wenn eine Vorlage ihn nicht kennt", () => {
    // Der entscheidende Punkt aus dem Code-Review: Bestehende Konfigurationen
    // kennen die 11 nicht — sie darf nicht von selbst im TV-L-Fragebogen
    // auftauchen.
    const alteVorlage = FRAGEBOGEN_STEPS.filter((s) => s.step !== 11).map((s) => ({
      step: s.step,
      title: s.title,
      enabled: true,
    }));
    expect(getActiveSteps(alteVorlage).map((s) => s.step)).not.toContain(11);
  });

  it("erscheint, sobald eine Vorlage ihn einschaltet", () => {
    const minijob = FRAGEBOGEN_STEPS.map((s) => ({
      step: s.step,
      title: s.title,
      enabled: s.step !== 9,
    }));
    const aktiv = getActiveSteps(minijob).map((s) => s.step);
    expect(aktiv).toContain(11);
    // Und zwar an der vorletzten Stelle, direkt vor der Zusammenfassung.
    expect(aktiv[aktiv.length - 2]).toBe(11);
    expect(aktiv[aktiv.length - 1]).toBe(10);
  });

  it("macht aus der Minijob-Strecke neun Schritte", () => {
    // So zeigen es die Masken-Entwuerfe: 1..9 mit der Rentenversicherung auf 8.
    const minijob = FRAGEBOGEN_STEPS.map((s) => ({
      step: s.step,
      title: s.title,
      enabled: s.step !== 9,
    }));
    expect(getActiveSteps(minijob)).toHaveLength(9);
  });
});
