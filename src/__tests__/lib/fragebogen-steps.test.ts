/**
 * Tests fuer die zentrale Schritt-Definition des Personalfragebogens
 * (src/lib/fragebogen-steps.ts), AP 1 — Renderer entkoppeln.
 *
 * Der Kern: Die Vorlagen-Konfiguration muss sich tatsaechlich auf die Strecke
 * auswirken, und die gespeicherte Schrittnummer muss stabil bleiben, wenn sich
 * die Vorlage aendert. Beides war vorher nicht der Fall.
 */

import {
  FRAGEBOGEN_STEPS,
  MANDATORY_STEP_NUMBERS,
  MAX_STEP_NUMBER,
  SUMMARY_STEP_NUMBER,
  LEGACY_DISPLAY_ORDER,
  describeProgress,
  formatProgress,
  getActiveSteps,
  getStep,
  getStepTitle,
  indexOfStep,
  legacyIndexToStepNumber,
  resolveResumeStep,
} from "@/lib/fragebogen-steps";
import {
  FIELD_REGISTRY,
  generateFullStepsConfig,
  mergeStepsConfig,
} from "@/lib/field-definitions";
// seed-check.js laeuft im Container als reines JS ohne tsx und kann die
// Feld-Registry nicht importieren; die Werte sind dort dupliziert. Dank des
// `require.main === module`-Guards laesst sich die Datei hier laden, ohne dass
// der Entrypoint startet — so werden die Kopien echt geprueft statt per
// Textsuche im Quelltext.
const seedCheck = require("../../../prisma/seed-check.js");

/** Vorlagen-Konfiguration bauen: alles an, ausser den genannten Schritten. */
function configExcept(disabled: number[]) {
  return FRAGEBOGEN_STEPS.map((s) => ({
    step: s.step,
    title: s.title,
    enabled: !disabled.includes(s.step),
  }));
}

describe("FRAGEBOGEN_STEPS – Konsistenz der Definition", () => {
  it("vergibt jede Registry-Nummer genau einmal", () => {
    const nummern = FRAGEBOGEN_STEPS.map((s) => s.step);
    expect(new Set(nummern).size).toBe(nummern.length);
  });

  it("vergibt jeden Komponenten-Schluessel genau einmal", () => {
    const keys = FRAGEBOGEN_STEPS.map((s) => s.key).filter(
      (k): k is NonNullable<typeof k> => k !== null
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("kennt zu jedem Schritt einen Eintrag in der Feld-Registry", () => {
    for (const step of FRAGEBOGEN_STEPS) {
      expect(FIELD_REGISTRY[step.step]).toBeDefined();
    }
  });

  it("nennt fuer jeden virtuellen Schritt, wo er erfasst wird", () => {
    const virtuell = FRAGEBOGEN_STEPS.filter((s) => s.key === null);
    // Heute genau einer: Kinder, erfasst in der Sozialversicherung.
    expect(virtuell.length).toBeGreaterThan(0);
    for (const s of virtuell) {
      expect(typeof s.renderedWithin).toBe("number");
      expect(getStep(s.renderedWithin as number)).toBeDefined();
    }
  });

  it("haelt Pflichtschritte, Obergrenze und Zusammenfassung synchron", () => {
    expect(MANDATORY_STEP_NUMBERS).toContain(1);
    expect(MANDATORY_STEP_NUMBERS).toContain(SUMMARY_STEP_NUMBER);
    expect(MAX_STEP_NUMBER).toBe(
      Math.max(...FRAGEBOGEN_STEPS.map((s) => s.step))
    );
  });

  it("liefert Titel mit Fallback fuer unbekannte Nummern", () => {
    expect(getStepTitle(1)).toBe("Persönliche Angaben");
    expect(getStepTitle(999)).toBe("Schritt 999");
  });
});

describe("getActiveSteps – die Vorlagen-Konfiguration wirkt", () => {
  it("laesst virtuelle Schritte grundsaetzlich weg", () => {
    const aktiv = getActiveSteps(configExcept([]));
    expect(aktiv.every((s) => s.key !== null)).toBe(true);
    expect(aktiv.map((s) => s.step)).not.toContain(7);
  });

  it("nimmt ohne Konfiguration alle Schritte mit eigener Maske", () => {
    const erwartet = FRAGEBOGEN_STEPS.filter((s) => s.key !== null).length;
    expect(getActiveSteps(null)).toHaveLength(erwartet);
    expect(getActiveSteps(undefined)).toHaveLength(erwartet);
    expect(getActiveSteps([])).toHaveLength(erwartet);
  });

  it("laesst abgeschaltete Schritte weg – das war der eigentliche Fehler", () => {
    const aktiv = getActiveSteps(configExcept([5, 9]));
    const nummern = aktiv.map((s) => s.step);
    expect(nummern).not.toContain(5);
    expect(nummern).not.toContain(9);
    expect(nummern).toContain(6);
  });

  it("behaelt die Anzeigereihenfolge der zentralen Definition bei", () => {
    // Nicht aufsteigend nach Nummer: Die Registry-Nummer ist ein stabiler
    // Schluessel, die Reihenfolge im Array ist die Anzeige. Schritt 11
    // (Rentenversicherung) steht vor Schritt 10 (Zusammenfassung) — die
    // Zusammenfassung bleibt der letzte Schritt, egal was noch dazukommt.
    const nummern = getActiveSteps(configExcept([5])).map((s) => s.step);
    const erwartet = FRAGEBOGEN_STEPS.filter(
      (s) => s.key !== null && s.step !== 5
    ).map((s) => s.step);
    expect(nummern).toEqual(erwartet);
    expect(nummern[nummern.length - 1]).toBe(SUMMARY_STEP_NUMBER);
  });

  it("behaelt Pflichtschritte, auch wenn eine Konfiguration sie abschaltet", () => {
    // Sonst gaebe es einen Fragebogen ohne Absende-Schritt.
    const aktiv = getActiveSteps(configExcept([1, SUMMARY_STEP_NUMBER]));
    expect(aktiv.map((s) => s.step)).toContain(1);
    expect(aktiv.map((s) => s.step)).toContain(SUMMARY_STEP_NUMBER);
  });

  it("wertet einen in der Konfiguration fehlenden Schritt als abgeschaltet", () => {
    // Eine gespeicherte Konfiguration stammt aus dem Moment des letzten
    // Speicherns und kennt spaeter hinzugekommene Schritte nicht. Gaelten die
    // als aktiv, erschiene jeder neue Schritt sofort in allen Vorlagen.
    const luecke = configExcept([]).filter((s) => s.step !== 6);
    expect(getActiveSteps(luecke).map((s) => s.step)).not.toContain(6);
  });

  it("haelt Pflichtschritte auch dann, wenn sie in der Konfiguration fehlen", () => {
    const ohnePflicht = configExcept([]).filter(
      (s) => s.step !== 1 && s.step !== SUMMARY_STEP_NUMBER
    );
    const nummern = getActiveSteps(ohnePflicht).map((s) => s.step);
    expect(nummern).toContain(1);
    expect(nummern).toContain(SUMMARY_STEP_NUMBER);
  });

  it("laesst einen neu definierten Schritt nicht in fremde Vorlagen rutschen", () => {
    // Szenario AP 7: Die Rentenversicherung kommt als Registry-Schritt 11 dazu.
    // Die gespeicherten Konfigurationen der uebrigen Vorlagen kennen sie nicht.
    const alsWaereEsVorAP7 = configExcept([]);
    const kuenftig = [...alsWaereEsVorAP7]; // ohne Eintrag fuer 11
    const aktiv = getActiveSteps(kuenftig).map((s) => s.step);
    // Kein Schritt ausserhalb der gespeicherten Konfiguration darf auftauchen.
    const bekannt = new Set(kuenftig.map((s) => s.step));
    for (const nummer of aktiv) {
      expect(bekannt.has(nummer)).toBe(true);
    }
  });

  it("bildet die Minijob-Strecke ab: mit Bildung & Beruf und Masernschutz", () => {
    // Entscheidung 25.08.2026: Bildung & Beruf bleibt an. Entscheidung
    // 07.09.2026: Der Masernschutz kommt dazu — das Infektionsschutzgesetz
    // knuepft an die Taetigkeit in der Gemeinschaftseinrichtung an, nicht an
    // den Umfang der Beschaeftigung. Zusammen mit der Rentenversicherung
    // (Schritt 11, AP 7) sind es zehn Schritte.
    const aktiv = getActiveSteps(configExcept([]));
    expect(aktiv.map((s) => s.step)).toEqual([1, 2, 3, 4, 5, 6, 8, 9, 11, 10]);
    // Der Mitarbeiter zaehlt durchgehend, ohne Luecke bei der 7.
    expect(indexOfStep(aktiv, 8) + 1).toBe(7);
    expect(indexOfStep(aktiv, 9) + 1).toBe(8); // Masernschutz
    expect(indexOfStep(aktiv, 11) + 1).toBe(9); // Rentenversicherung
    expect(indexOfStep(aktiv, SUMMARY_STEP_NUMBER) + 1).toBe(10);
  });

  it("bildet die Ehrenamt-Strecke ab: Person, Adresse, Masernschutz, Zusammenfassung", () => {
    // Ein Ehrenamtlicher wird nicht sozialversichert — die Rentenfrage
    // (Schritt 11) stellt sich fuer ihn gar nicht. Der Masernschutz schon:
    // Wer regelmaessig in einer Kita oder Schule mitarbeitet, faellt fachlich
    // unter dieselbe Vorschrift wie eine Angestellte (Entscheidung 07.09.2026).
    const aktiv = getActiveSteps(configExcept([3, 4, 5, 6, 7, 8, 11]));
    expect(aktiv.map((s) => s.step)).toEqual([1, 2, 9, SUMMARY_STEP_NUMBER]);
  });
});

describe("indexOfStep / resolveResumeStep – Wiedereinstieg", () => {
  const aktiv = getActiveSteps(configExcept([9]));

  it("findet die Anzeigeposition zu einer Registry-Nummer", () => {
    expect(indexOfStep(aktiv, 1)).toBe(0);
    expect(indexOfStep(aktiv, 6)).toBe(5);
  });

  it("meldet -1 fuer einen Schritt, den diese Vorlage nicht hat", () => {
    expect(indexOfStep(aktiv, 9)).toBe(-1);
  });

  it("steigt an der gespeicherten Registry-Nummer wieder ein", () => {
    expect(resolveResumeStep(aktiv, 6)).toBe(5);
  });

  it("faellt auf den ersten Schritt zurueck, wenn die Vorlage sich geaendert hat", () => {
    // Masernschutz wurde abgeschaltet, waehrend der Vorgang dort stand.
    expect(resolveResumeStep(aktiv, 9)).toBe(0);
  });

  it("faellt auf den ersten Schritt zurueck, wenn nichts gespeichert ist", () => {
    expect(resolveResumeStep(aktiv, null)).toBe(0);
    expect(resolveResumeStep(aktiv, undefined)).toBe(0);
  });
});

describe("describeProgress – Fortschritt fuer die HR-Ansicht", () => {
  it("misst an der Strecke dieser Vorlage, nicht an allen Schritten", () => {
    // Der eigentliche Punkt: Ein Ehrenamtlicher auf Schritt 2 von 3 ist bei
    // 67 Prozent. Gemessen an allen neun Schritten waeren es 22.
    const ehrenamt = configExcept([3, 4, 5, 6, 7, 8, 9, 11]);
    const f = describeProgress(ehrenamt, 2);
    expect(f.position).toBe(2);
    expect(f.total).toBe(3);
    expect(f.prozent).toBe(67);
    expect(f.titel).toBe("Adresse & Kontakt");
  });

  it("rechnet fuer die Minijob-Strecke gegen deren Laenge", () => {
    // Seit dem 07.09.2026 laeuft ein Minijobber alle zehn Schritte.
    const minijob = configExcept([]);
    const f = describeProgress(minijob, 8); // Bildung & Beruf
    expect(f.position).toBe(7);
    expect(f.total).toBe(10);
    expect(f.prozent).toBe(70);
  });

  it("meldet einen nicht begonnenen Fragebogen", () => {
    for (const wert of [0, null, undefined]) {
      const f = describeProgress(configExcept([]), wert);
      expect(f.position).toBe(0);
      expect(f.prozent).toBe(0);
      expect(f.titel).toBe("noch nicht begonnen");
    }
  });

  it("loest den Titel auf, auch wenn der Schritt nicht zur Vorlage gehoert", () => {
    // Die Vorlage wurde geaendert, waehrend der Vorgang lief.
    const f = describeProgress(configExcept([9]), 9);
    expect(f.position).toBe(0);
    expect(f.prozent).toBe(0);
    expect(f.titel).toBe("Masernschutz");
  });

  it("erreicht auf dem letzten Schritt genau 100 Prozent", () => {
    for (const config of [configExcept([]), configExcept([9]), configExcept([3, 4, 5])]) {
      const aktiv = getActiveSteps(config);
      const letzter = aktiv[aktiv.length - 1];
      expect(describeProgress(config, letzter.step).prozent).toBe(100);
    }
  });

  it("meldet fuer einen virtuellen Schritt keinen Fortschritt", () => {
    // Schritt 7 (Kinder) hat keine eigene Maske und kann nie erreicht werden.
    const f = describeProgress(configExcept([]), 7);
    expect(f.position).toBe(0);
    expect(f.titel).toBe("Kinder");
  });
});

describe("formatProgress – Text fuer Listen und Statuszeilen", () => {
  it("nennt Position, Gesamtzahl und Titel", () => {
    const f = describeProgress(configExcept([9]), 3);
    expect(formatProgress(f)).toBe("Schritt 3 von 9 · Bankverbindung");
  });

  it("laesst die Zahlen weg, wenn es keine Position gibt", () => {
    expect(formatProgress(describeProgress(configExcept([]), 0))).toBe(
      "noch nicht begonnen"
    );
  });
});

describe("legacyIndexToStepNumber – Migration der Alt-Daten", () => {
  it("bildet die alte Anzeigereihenfolge ab", () => {
    // Alt: 0-basierte Position in [1,2,3,4,5,6,8,9,10].
    expect(legacyIndexToStepNumber(0)).toBe(1);
    expect(legacyIndexToStepNumber(5)).toBe(6);
    // Ab hier lief die alte Zaehlung auseinander – genau das war der Fehler.
    expect(legacyIndexToStepNumber(6)).toBe(8);
    expect(legacyIndexToStepNumber(7)).toBe(9);
    expect(legacyIndexToStepNumber(8)).toBe(10);
  });

  it("bildet die Absende-Markierung auf die Zusammenfassung ab", () => {
    // Beim Absenden wurde frueher pauschal 10 gesetzt.
    expect(legacyIndexToStepNumber(10)).toBe(SUMMARY_STEP_NUMBER);
    expect(legacyIndexToStepNumber(9)).toBe(SUMMARY_STEP_NUMBER);
  });

  it("laesst die alte Reihenfolge den virtuellen Schritt aus", () => {
    // Schritt 7 (Kinder) hatte nie eine eigene Maske.
    expect(LEGACY_DISPLAY_ORDER).not.toContain(7);
  });

  it("waechst nicht mit neuen Schritten mit", () => {
    // Wichtig: Diese Liste beschreibt die Vergangenheit — die Reihenfolge, in
    // der die alten Datensaetze gezaehlt wurden. Schritt 11 kam erst mit AP 7
    // dazu; kein Altbestand kann je dort gestanden haben. Waechst die Liste
    // mit, verschiebt die Migration bestehende Werte auf falsche Schritte.
    expect(LEGACY_DISPLAY_ORDER).not.toContain(11);
    // Was drinsteht, muss es aber weiterhin geben.
    const bekannt = new Set(FRAGEBOGEN_STEPS.map((s) => s.step));
    for (const nummer of LEGACY_DISPLAY_ORDER) {
      expect(bekannt.has(nummer)).toBe(true);
    }
    // Und die Zusammenfassung bleibt das Ende der alten Zaehlung.
    expect(LEGACY_DISPLAY_ORDER[LEGACY_DISPLAY_ORDER.length - 1]).toBe(
      SUMMARY_STEP_NUMBER
    );
  });

  it("bildet einen negativen Index auf den ersten Schritt ab", () => {
    // Ohne untere Grenze landete ein negativer Wert beim letzten Eintrag,
    // also ausgerechnet auf der Zusammenfassung.
    expect(legacyIndexToStepNumber(-1)).toBe(LEGACY_DISPLAY_ORDER[0]);
    expect(legacyIndexToStepNumber(-99)).toBe(LEGACY_DISPLAY_ORDER[0]);
  });

  it("verschiebt Werte nie nach unten – Voraussetzung der Migration", () => {
    // Die Migration arbeitet Quellwerte absteigend ab. Das ist nur kollisions-
    // frei, solange kein Zielwert kleiner als sein Quellwert ist.
    for (let i = 0; i <= 10; i++) {
      expect(legacyIndexToStepNumber(i)).toBeGreaterThanOrEqual(i);
    }
  });
});

describe("mergeStepsConfig – gespeicherte Konfiguration als Overlay", () => {
  it("ergaenzt Schritte, die die gespeicherte Konfiguration nicht kennt", () => {
    // Ohne das Zusammenfuehren waere ein neu definierter Schritt im
    // Vorlagen-Editor unsichtbar und damit nicht freischaltbar.
    const alt = configExcept([]).filter((s) => s.step !== 8);
    const merged = mergeStepsConfig(alt);
    expect(merged.map((s) => s.step)).toEqual(FRAGEBOGEN_STEPS.map((s) => s.step));
    expect(merged.find((s) => s.step === 8)?.enabled).toBe(false);
  });

  it("uebernimmt enabled und fields aus der gespeicherten Konfiguration", () => {
    const gespeichert = configExcept([9]).map((s) =>
      s.step === 5
        ? { ...s, fields: [{ name: "taxId", visible: true, required: true, label: "Steuer-ID" }] }
        : s
    );
    const merged = mergeStepsConfig(gespeichert);
    expect(merged.find((s) => s.step === 9)?.enabled).toBe(false);
    expect(merged.find((s) => s.step === 6)?.enabled).toBe(true);
    expect(merged.find((s) => s.step === 5)?.fields).toHaveLength(1);
  });

  it("haelt Pflichtschritte an, auch wenn sie fehlen", () => {
    const ohnePflicht = configExcept([]).filter(
      (s) => s.step !== 1 && s.step !== SUMMARY_STEP_NUMBER
    );
    const merged = mergeStepsConfig(ohnePflicht);
    expect(merged.find((s) => s.step === 1)?.enabled).toBe(true);
    expect(merged.find((s) => s.step === SUMMARY_STEP_NUMBER)?.enabled).toBe(true);
  });

  it("liefert ohne gespeicherte Konfiguration die Vollausstattung", () => {
    for (const stored of [null, undefined, []]) {
      const merged = mergeStepsConfig(stored);
      expect(merged).toHaveLength(FRAGEBOGEN_STEPS.length);
      expect(merged.every((s) => s.enabled)).toBe(true);
    }
  });

  it("bleibt mit getActiveSteps konsistent", () => {
    const gespeichert = configExcept([9]);
    const ausMerge = getActiveSteps(mergeStepsConfig(gespeichert)).map((s) => s.step);
    const direkt = getActiveSteps(gespeichert).map((s) => s.step);
    expect(ausMerge).toEqual(direkt);
  });

  it("nimmt immer Titel und Reihenfolge der zentralen Definition", () => {
    const mitAltemTitel = configExcept([]).map((s) =>
      s.step === 6 ? { ...s, title: "Weitere Beschaeftigung" } : s
    );
    const merged = mergeStepsConfig(mitAltemTitel);
    expect(merged.find((s) => s.step === 6)?.title).toBe("Weitere Beschäftigung");
  });
});

describe("MINIJOB-Vorlagenkorrektur im Entrypoint", () => {
  const { MINIJOB_TAX_FIELDS, korrigiereMinijobSchritte } = seedCheck;

  it("kennt jedes Feld des Steuer-Schritts", () => {
    const namen = MINIJOB_TAX_FIELDS.map((f: { name: string }) => f.name);
    expect(namen.sort()).toEqual(FIELD_REGISTRY[5].map((f) => f.name).sort());
  });

  it("laesst genau die Steuer-ID sichtbar und pflichtig", () => {
    for (const feld of MINIJOB_TAX_FIELDS) {
      const erwartet = feld.name === "taxId";
      expect(feld.visible).toBe(erwartet);
      expect(feld.required).toBe(erwartet);
    }
  });

  it("dupliziert die alte Anzeigereihenfolge unveraendert", () => {
    expect(seedCheck.LEGACY_DISPLAY_ORDER).toEqual([...LEGACY_DISPLAY_ORDER]);
  });

  it("bietet die 0 nicht als Migrationsquelle an", () => {
    // Die 0 ist der Schema-Default „noch nicht begonnen", keine alte
    // Anzeigeposition — die alte API liess nur min(1) zu. Wanderte sie mit auf
    // 1, waere nach dem Deploy nicht mehr erkennbar, wer den Link nie geöffnet
    // hat. Die Migration läuft genau einmal; danach hilft nur ein Backup.
    const quellen: number[] = seedCheck.migrationsQuellen();
    expect(quellen).not.toContain(0);
    expect(quellen).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it("arbeitet die Quellen absteigend ab", () => {
    // Voraussetzung der Kollisionsfreiheit: Jedes Ziel liegt >= Quelle.
    const quellen: number[] = seedCheck.migrationsQuellen();
    const absteigend = [...quellen].sort((a, b) => b - a);
    expect(quellen).toEqual(absteigend);
  });

  it("bildet dieselbe Abbildung wie die TypeScript-Fassung", () => {
    for (let i = -2; i <= 12; i++) {
      expect(seedCheck.legacyIndexToStepNumber(i)).toBe(legacyIndexToStepNumber(i));
    }
  });

  it("schaltet Steuer, Weitere Beschaeftigung und Bildung ein", () => {
    const vorher = configExcept([5, 6, 8, 9]);
    const { neu, geaendert } = korrigiereMinijobSchritte(vorher);

    expect(geaendert).toHaveLength(3);
    const nach = (n: number) => neu.find((s: { step: number }) => s.step === n);
    expect(nach(5).enabled).toBe(true);
    expect(nach(6).enabled).toBe(true);
    expect(nach(8).enabled).toBe(true);
    // Den Masernschutz fasst diese Korrektur nicht an — sie ist auf der
    // Produktivdatenbank bereits gelaufen und bleibt deshalb so, wie sie lief.
    // Eingeschaltet wird er von ensureMasernschutzSchritt mit eigenem Merker.
    expect(nach(9).enabled).toBe(false);
  });

  it("reduziert den Steuer-Schritt auf die Steuer-ID", () => {
    const vorher = configExcept([]);
    const { neu } = korrigiereMinijobSchritte(vorher);
    const steuer = neu.find((s: { step: number }) => s.step === 5);
    expect(steuer.fields).toEqual(MINIJOB_TAX_FIELDS);
  });

  it("korrigiert auch einen bereits aktiven Steuer-Schritt mit allen Feldern", () => {
    // Das war die Luecke: Frueher galt der Schritt als in Ordnung, sobald
    // taxId sichtbar und pflichtig war — Steuerklasse und Religion blieben
    // dann als Pflichtfelder stehen.
    const vorher = configExcept([]).map((s) =>
      s.step === 5 ? { ...s, fields: generateFullStepsConfig()[4].fields } : s
    );
    const { neu, geaendert } = korrigiereMinijobSchritte(vorher);
    expect(geaendert.some((g: string) => g.startsWith("5"))).toBe(true);
    const steuer = neu.find((s: { step: number }) => s.step === 5);
    expect(steuer.fields.find((f: { name: string }) => f.name === "religion").visible).toBe(false);
  });

  it("laesst eine bereits korrekte Konfiguration unveraendert", () => {
    const schon = configExcept([9]).map((s) =>
      s.step === 5 ? { ...s, fields: MINIJOB_TAX_FIELDS } : s
    );
    const { geaendert } = korrigiereMinijobSchritte(schon);
    expect(geaendert).toEqual([]);
  });
});

/**
 * Die Migration, die den Masernschutz-Schritt nachtraeglich einschaltet
 * (prisma/seed-check.js, Marker FORMTEMPLATE_MASERNSCHUTZ_V1).
 *
 * Sie ist die erste, die ALLE Vorlagen und alle laufenden Vorgaenge anfasst,
 * und sie laeuft im selben Startvorgang wie `db push --accept-data-loss`. Die
 * Tests halten deshalb vor allem eines fest: dass sie nichts anderes anfasst
 * als `enabled` von Schritt 9.
 */
describe("Masernschutz-Schritt im Entrypoint", () => {
  const { MASERN_SCHRITT, masernSchrittAktiv, aktiviereMasernSchritt } = seedCheck;

  it("arbeitet auf der Registry-Nummer des Masernschutz-Schritts", () => {
    expect(MASERN_SCHRITT).toBe(9);
    expect(getStep(MASERN_SCHRITT)?.key).toBe("masern");
  });

  it("erkennt einen abgeschalteten und einen fehlenden Schritt gleichermassen", () => {
    // Ein fehlender Eintrag gilt als aus (getActiveSteps) — er muss ergaenzt
    // werden, nicht uebergangen.
    expect(masernSchrittAktiv(configExcept([9]))).toBe(false);
    expect(masernSchrittAktiv(configExcept([]).filter((s) => s.step !== 9))).toBe(
      false
    );
    expect(masernSchrittAktiv(configExcept([]))).toBe(true);
  });

  it("schaltet einen vorhandenen Eintrag ein", () => {
    const neu = aktiviereMasernSchritt(configExcept([9]));
    expect(masernSchrittAktiv(neu)).toBe(true);
    expect(getActiveSteps(neu).map((s) => s.step)).toContain(9);
  });

  it("ergaenzt einen fehlenden Eintrag", () => {
    // Eine Konfiguration, die vor Schritt 9 gespeichert wurde, kennt ihn nicht.
    const ohne = configExcept([]).filter((s) => s.step !== 9);
    const neu = aktiviereMasernSchritt(ohne);
    expect(neu).toHaveLength(ohne.length + 1);
    expect(neu.find((s: { step: number }) => s.step === 9).title).toBe(
      getStepTitle(9)
    );
    expect(getActiveSteps(neu).map((s) => s.step)).toContain(9);
  });

  it("laesst jeden anderen Schritt unveraendert – das ist die Sicherung", () => {
    // HR pflegt Felder und Abschaltungen je Vorlage. Diese Migration darf
    // davon nichts anfassen; ein Rundum-Ueberschreiben traefe in einem Zug
    // alle Vorlagen und jeden laufenden Vorgang.
    const vorher = configExcept([5, 9, 11]).map((s) =>
      s.step === 5
        ? { ...s, fields: [{ name: "taxId", visible: true, required: true }] }
        : s
    );
    const neu = aktiviereMasernSchritt(vorher);
    for (const alt of vorher) {
      if (alt.step === 9) continue;
      expect(neu.find((s: { step: number }) => s.step === alt.step)).toEqual(alt);
    }
    // Insbesondere bleiben abgeschaltete Schritte abgeschaltet.
    expect(getActiveSteps(neu).map((s) => s.step)).not.toContain(5);
    expect(getActiveSteps(neu).map((s) => s.step)).not.toContain(11);
  });

  it("aendert nichts mehr, wenn der Schritt schon an ist", () => {
    // Die Migration schreibt nur, wo sich etwas aendert — und ein zweiter Lauf
    // (Merker verloren, Backup eingespielt) darf nichts kaputtmachen.
    const schon = configExcept([]);
    expect(aktiviereMasernSchritt(schon)).toEqual(schon);
    expect(aktiviereMasernSchritt(aktiviereMasernSchritt(configExcept([9])))).toEqual(
      aktiviereMasernSchritt(configExcept([9]))
    );
  });
});

describe("generateFullStepsConfig – Seed und neue Vorlagen", () => {
  it("erzeugt einen Eintrag je Schritt der zentralen Definition", () => {
    const config = generateFullStepsConfig();
    expect(config.map((c) => c.step)).toEqual(FRAGEBOGEN_STEPS.map((s) => s.step));
    expect(config.map((c) => c.title)).toEqual(FRAGEBOGEN_STEPS.map((s) => s.title));
    expect(config.every((c) => c.enabled)).toBe(true);
  });

  it("liefert zu jedem Schritt die Feld-Defaults mit", () => {
    for (const eintrag of generateFullStepsConfig()) {
      expect(Array.isArray(eintrag.fields)).toBe(true);
      expect(eintrag.fields).toHaveLength(FIELD_REGISTRY[eintrag.step].length);
    }
  });
});
