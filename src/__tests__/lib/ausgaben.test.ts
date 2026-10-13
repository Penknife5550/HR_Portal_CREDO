/**
 * Tests: Ausstattung & Zugaenge, Stufe 2 (Paket A4) – die reinen Regeln in
 * src/lib/ausgaben.ts und die Zod-Schemata in src/lib/validations/ausgaben.ts.
 *
 * S21: Konstanten, Texte und Protokoll-Codes. Die Wertlisten gegen die
 * Schemakommentare und die Enums prueft ausstattung-schema.test.ts, die
 * Beschriftungen im Protokoll audit-log-labels.test.tsx.
 * S22: je Funktion aus Feinplan A4, 1.3, ein Block (Abschnitt „Funktionen“),
 * danach Zod. Jest rechnet in UTC wie der Container (jest.config.ts); alle
 * Zeitpunkte stehen deshalb ausdruecklich in UTC (Z), Berliner Zeit im Kommentar.
 * S23: jede Vorgabe besteht `positionPruefen` an ihrem Vorschlag, die Rechnung
 * von „Rückgabe-Vorgaben übernehmen …“ (`rueckgabeVorgabenPlan`), ihre
 * Meldungen und die Webhook-Ereignisse gegen den Katalog (G21).
 */

import fs from "fs";
import path from "path";
import {
  A4_WEBHOOK_EREIGNISSE,
  AUSGABE_AKTIV,
  AUSGABE_AUFBEWAHRUNG_MONATE,
  AUSGABE_GESPERRT_LABEL,
  AUSGABE_GRENZEN,
  AUSGABE_QUELLE_TEXTE,
  AUSGABE_VERJAEHRUNG_JAHRE,
  AUSGABE_ZUSTAENDE,
  AUSGABE_ZUSTAND_LABELS,
  AUSGABEN_AUDIT,
  AUSGABEN_AUDIT_LABELS,
  FOLGE_ORDER_INDEX,
  FOLGE_STELLE,
  GEDAECHTNISSTUETZE,
  KENNUNG_LABEL_STANDARD,
  LAGE_TEXTE,
  LAGE_WEITERE_GELOESCHT,
  MELDUNGEN_AUSGABEN,
  RUECKGABE_LAGEN,
  RUECKGABE_VORGABEN,
  RUECKGABE_ZUSTAENDE,
  RUECKNAHME_TEXTE,
  TAUSCH_GRUENDE,
  VORSCHLAG_GRUENDE,
  ausgabeBezeichnung,
  ausgabeLoeschenAb,
  ausgabeMoeglich,
  ausgabeVermerkMailFelder,
  ausgabeZustandDaten,
  ausgabeZustandLabel,
  ausgabenAngeboten,
  ausgabenJeAufgabe,
  ausgabenListeMailFelder,
  ausgabenZeile,
  bindenderAustritt,
  bindetAusgabe,
  brauchtFolgeStelle,
  folgeAufgabe,
  folgeAufgabeNoetig,
  folgeAufgabeSchritt,
  lageText,
  namensSchluessel,
  offeneRueckgaben,
  ohneVermerk,
  perLinkEntfernbar,
  protokollStand,
  protokollStellen,
  protokollText,
  rueckgabeDaten,
  rueckgabeLage,
  rueckgabeOffen,
  rueckgabeVorgabenPlan,
  rueckgabeVorschlag,
  rueckgabeZeileText,
  rueckgabeZustand,
  rueckgabenSchritt,
  ruecknahmeAufgabe,
  vermerkPruefen,
  zuordnungsVorschlaege,
  type AusgabeBezug,
  type AusgabeZeilenDaten,
  type BestandAufgabe,
  type EinstellungsKandidat,
  type LageStand,
  type LageTextWerte,
  type VorschlagAusgabe,
} from "@/lib/ausgaben";
import {
  AUSSTATTUNG_KATEGORIE,
  BEI_AUSTRITT,
  GRENZEN,
  ORDER_BASIS,
  VORSCHLAEGE,
  katalogWerte,
  positionPruefen,
} from "@/lib/ausstattung";
import { EVENT_CATALOG } from "@/lib/events";
import { EVENTS_OHNE_WEBHOOK } from "@/lib/ereignis-liste";
import { DEPARTMENT_KEYS, RUECKGABE_KATEGORIEN } from "@/lib/constants";
import { berlinerKalendertag } from "@/lib/kalendertag";
import {
  ausgabenAktionSchema,
  einstellungAktionSchema,
  einstellungSucheSchema,
  kennungSchema,
  vermerkSchema,
} from "@/lib/validations/ausgaben";
import { rueckgabeAendernSchema, updateOffboardingSchema } from "@/lib/validations/offboarding";

// =============================================
// Zustaende und ihre Anzeige
// =============================================

describe("Zustaende", () => {
  it("jeder Zustand hat genau ein Wort, keines doppelt", () => {
    expect(Object.keys(AUSGABE_ZUSTAND_LABELS)).toEqual([...AUSGABE_ZUSTAENDE]);
    const woerter = Object.values(AUSGABE_ZUSTAND_LABELS);
    for (const w of woerter) expect(w.trim()).not.toBe("");
    expect(new Set(woerter).size).toBe(woerter.length);
  });

  it("die Woerter aus dem Feinplan (1.2)", () => {
    expect(AUSGABE_ZUSTAND_LABELS).toEqual({
      AUSGEGEBEN: "ausgegeben",
      ZURUECK: "zurück",
      BESCHAEDIGT: "beschädigt zurück",
      FEHLT: "fehlt",
      VERBLEIBT: "verbleibt",
      ENTFAELLT: "entfällt",
      ERSETZT: "ersetzt",
    });
    expect(AUSGABE_GESPERRT_LABEL).toBe("gesperrt");
  });

  it("aktiv sind genau AUSGEGEBEN und VERBLEIBT (noch bei der Person)", () => {
    expect([...AUSGABE_AKTIV]).toEqual(["AUSGEGEBEN", "VERBLEIBT"]);
  });

  it("Tausch nur mit Grund: defekt oder verloren (G7)", () => {
    expect([...TAUSCH_GRUENDE]).toEqual(["DEFEKT", "VERLOREN"]);
  });
});

// =============================================
// Vorgaben fuer den Katalog (G27)
// =============================================

describe("RUECKGABE_VORGABEN", () => {
  const nachSchluessel = new Map(VORSCHLAEGE.map((v) => [v.vorschlagSchluessel, v]));

  it("jeder Schluessel kommt in VORSCHLAEGE vor, und nie an einer Angabe", () => {
    for (const schluessel of Object.keys(RUECKGABE_VORGABEN)) {
      const vorschlag = nachSchluessel.get(schluessel);
      expect(`${schluessel}: ${vorschlag ? vorschlag.art : "fehlt"}`).not.toMatch(/fehlt|ANGABE/);
    }
  });

  it("deckt jeden Vorschlag ab, der keine Angabe ist (Tabelle in Feinplan 1.3)", () => {
    const ohneAngabe = VORSCHLAEGE.filter((v) => v.art !== "ANGABE").map((v) => v.vorschlagSchluessel);
    expect(Object.keys(RUECKGABE_VORGABEN).sort()).toEqual([...ohneAngabe].sort());
  });

  it("VORSCHLAEGE selbst tragen KEINE A4-Werte (G27: kein Einschalten ueber „Vorschläge übernehmen“)", () => {
    for (const v of VORSCHLAEGE) {
      const zeile = v as unknown as Record<string, unknown>;
      for (const feld of ["beiAustritt", "rueckgabeKategorie", "ausgabeKennung"]) {
        expect(`${v.vorschlagSchluessel}.${feld}: ${String(zeile[feld] ?? null)}`).toBe(
          `${v.vorschlagSchluessel}.${feld}: null`,
        );
      }
    }
  });

  it("jede Zeile passt in sich: Kategorie und Kennung nur bei RUECKGABE", () => {
    for (const [schluessel, v] of Object.entries(RUECKGABE_VORGABEN)) {
      expect(BEI_AUSTRITT as readonly string[]).toContain(v.beiAustritt);
      if (v.beiAustritt === "RUECKGABE") {
        expect(`${schluessel}: ${v.rueckgabeKategorie}`).toMatch(new RegExp(`: (${RUECKGABE_KATEGORIEN.join("|")})$`));
        expect(v.ausgabeKennung?.trim()).toBeTruthy();
        expect(v.ausgabeKennung!.length).toBeLessThanOrEqual(AUSGABE_GRENZEN.kennungLabel);
      } else {
        expect(`${schluessel}: ${v.rueckgabeKategorie} ${v.ausgabeKennung}`).toBe(`${schluessel}: null null`);
      }
    }
  });

  it("die Tabelle aus dem Feinplan", () => {
    expect(RUECKGABE_VORGABEN.IT_IPAD).toEqual({
      beiAustritt: "RUECKGABE",
      rueckgabeKategorie: "IT_HARDWARE",
      ausgabeKennung: "Inventarnummer",
    });
    // G14: Transponder/Chip ist ein Rueckgabe-Stueck, keine Sperraufgabe.
    expect(RUECKGABE_VORGABEN.FACILITY_TRANSPONDER).toEqual({
      beiAustritt: "RUECKGABE",
      rueckgabeKategorie: "SCHLUESSEL",
      ausgabeKennung: "Chipnummer",
    });
    expect(RUECKGABE_VORGABEN.IT_ZUGAENGE.beiAustritt).toBe("SPERREN");
    expect(RUECKGABE_VORGABEN.IT_BYOD.beiAustritt).toBe("SPERREN");
    expect(RUECKGABE_VORGABEN.VERWALTUNG_DIENSTAUSWEIS.rueckgabeKategorie).toBe("DOKUMENTE");
    expect(RUECKGABE_VORGABEN.VERWALTUNG_KOPIERKARTE.rueckgabeKategorie).toBe("SONSTIGES");
    for (const s of ["FACILITY_PARKPLATZ", "VERWALTUNG_FACH", "VERWALTUNG_TUERSCHILD"]) {
      expect(RUECKGABE_VORGABEN[s].beiAustritt).toBe("NICHTS");
    }
  });

  it("S23: jede Vorgabe besteht positionPruefen an ihrem Vorschlag (so, wie die Aktion sie schreibt)", () => {
    for (const [schluessel, vorgabe] of Object.entries(RUECKGABE_VORGABEN)) {
      const v = VORSCHLAEGE.find((x) => x.vorschlagSchluessel === schluessel)!;
      const mitVorgabe = { ...katalogWerte({ ...v, isActive: true }), ...vorgabe };
      expect(`${schluessel}: ${positionPruefen(mitVorgabe)}`).toBe(`${schluessel}: null`);
    }
  });
});

// =============================================
// „Rückgabe-Vorgaben übernehmen …“ (G27, G21; S23)
// =============================================

describe("rueckgabeVorgabenPlan", () => {
  const pos = (id: string, teil: Record<string, unknown> = {}) => ({
    id,
    art: "JA_NEIN",
    bezeichnung: `Position ${id}`,
    departmentKey: "IT",
    vorschlagSchluessel: null as string | null,
    beiAustritt: null as string | null,
    ...teil,
  });

  it("setzt nur an Vorschlagspositionen mit Vorgabe und leerem beiAustritt", () => {
    const plan = rueckgabeVorgabenPlan([
      pos("ipad", { vorschlagSchluessel: "IT_IPAD" }),
      pos("zugaenge", { vorschlagSchluessel: "IT_ZUGAENGE", art: "AUSWAHL", beiAustritt: "" }),
      // Von HR gesetzt — bleibt.
      pos("laptop", { vorschlagSchluessel: "IT_LAPTOP", beiAustritt: "NICHTS" }),
      // Von HR angelegt, ohne Vorschlagsschluessel — kommt nicht vor.
      pos("eigen"),
      // Eine Angabe hat keine Vorgabe — kommt nicht vor.
      pos("durchwahl", { vorschlagSchluessel: "IT_DURCHWAHL", art: "ANGABE" }),
      // Inzwischen eine Angabe geworden: uebersprungen (dort bleiben die Felder leer).
      pos("schild", { vorschlagSchluessel: "VERWALTUNG_TUERSCHILD", art: "ANGABE" }),
    ]);
    expect(plan.setzen.map((e) => e.id)).toEqual(["ipad", "zugaenge"]);
    expect(plan.setzen[0]).toEqual({
      id: "ipad",
      bezeichnung: "Position ipad",
      departmentKey: "IT",
      vorschlagSchluessel: "IT_IPAD",
      vorgabe: RUECKGABE_VORGABEN.IT_IPAD,
    });
    expect(plan.setzen[1].vorgabe.beiAustritt).toBe("SPERREN");
    // Mit Grund: Rueckfrage und Meldung sagen einer Angabe nicht nach, sie habe schon einen Wert.
    expect(plan.uebersprungen.map((e) => [e.id, e.grund])).toEqual([
      ["laptop", "WERT"],
      ["schild", "ANGABE"],
    ]);
  });

  it("eine Angabe zaehlt immer als ANGABE, auch mit (ungueltigem) Wert", () => {
    const plan = rueckgabeVorgabenPlan([pos("schild", { vorschlagSchluessel: "VERWALTUNG_TUERSCHILD", art: "ANGABE", beiAustritt: "NICHTS" })]);
    expect(plan.setzen).toEqual([]);
    expect(plan.uebersprungen.map((e) => e.grund)).toEqual(["ANGABE"]);
  });

  it("ein unbekannter oder Prototyp-Schluessel ergibt keine Vorgabe", () => {
    const plan = rueckgabeVorgabenPlan([
      pos("a", { vorschlagSchluessel: "toString" }),
      pos("b", { vorschlagSchluessel: "GIBT_ES_NICHT" }),
    ]);
    expect(plan).toEqual({ setzen: [], uebersprungen: [] });
  });

  it("alle Vorschlaege frisch angelegt: jede Vorgabe wird gesetzt, keine uebersprungen", () => {
    const plan = rueckgabeVorgabenPlan(
      VORSCHLAEGE.map((v) => ({ ...katalogWerte({ ...v, isActive: false }), id: `id-${v.vorschlagSchluessel}`, vorschlagSchluessel: v.vorschlagSchluessel })),
    );
    expect(plan.setzen.map((e) => e.vorschlagSchluessel).sort()).toEqual(Object.keys(RUECKGABE_VORGABEN).sort());
    expect(plan.uebersprungen).toEqual([]);
  });

  it("Meldungen: Ergebnis mit Einzahl und Mehrzahl, nichts zu tun, Webhook-Hinweis", () => {
    expect(MELDUNGEN_AUSGABEN.RUECKGABE_VORGABEN_ERGEBNIS(1, 0)).toBe(
      "Rückgabe-Vorgaben an 1 Position übernommen. Link-Seite und Karte bieten dort ab jetzt Übergaben an.",
    );
    expect(MELDUNGEN_AUSGABEN.RUECKGABE_VORGABEN_ERGEBNIS(10, 2)).toBe(
      "Rückgabe-Vorgaben an 10 Positionen übernommen. Link-Seite und Karte bieten dort ab jetzt Übergaben an. 2 Positionen hatten schon einen Wert und bleiben unverändert.",
    );
    expect(MELDUNGEN_AUSGABEN.RUECKGABE_VORGABEN_ERGEBNIS(3, 1)).toContain(
      "1 Position hatte schon einen Wert und bleibt unverändert.",
    );
    expect(MELDUNGEN_AUSGABEN.RUECKGABE_VORGABEN_ERGEBNIS(0, 4)).toContain("schon einen Wert für „Beim Austritt“");
    expect(MELDUNGEN_AUSGABEN.RUECKGABE_VORGABEN_ERGEBNIS(0, 0)).toContain("keine Position aus „Vorschläge übernehmen“");
    // Angaben: nie „hat schon einen Wert“, sondern ihr eigener Grund.
    expect(MELDUNGEN_AUSGABEN.RUECKGABE_VORGABEN_ERGEBNIS(2, 0, 1)).toBe(
      "Rückgabe-Vorgaben an 2 Positionen übernommen. Link-Seite und Karte bieten dort ab jetzt Übergaben an. 1 Position ist eine Angabe und bekommt keine Vorgabe.",
    );
    expect(MELDUNGEN_AUSGABEN.RUECKGABE_VORGABEN_ERGEBNIS(1, 1, 2)).toContain(
      "1 Position hatte schon einen Wert und bleibt unverändert. 2 Positionen sind Angaben und bekommen keine Vorgabe.",
    );
    expect(MELDUNGEN_AUSGABEN.RUECKGABE_VORGABEN_ERGEBNIS(0, 0, 1)).toBe(
      "Es wurde nichts geändert. 1 Position ist eine Angabe und bekommt keine Vorgabe.",
    );
    expect(MELDUNGEN_AUSGABEN.RUECKGABE_VORGABEN_ERGEBNIS(0, 0, 1)).not.toContain("Wert");
    expect(MELDUNGEN_AUSGABEN.RUECKGABE_VORGABEN_ERGEBNIS(0, 2, 1)).toBe(
      "Es wurde nichts geändert. 2 Positionen hatten schon einen Wert und bleiben unverändert. 1 Position ist eine Angabe und bekommt keine Vorgabe.",
    );
    expect(MELDUNGEN_AUSGABEN.RUECKGABE_VORGABEN_UEBERSPRUNGEN).toEqual({
      WERT: "hat schon einen Wert, bleibt",
      ANGABE: "ist eine Angabe, bekommt keine Vorgabe",
    });
    // Der Sperrgrund gilt fuer beide Gruende – er behauptet keinen Wert.
    expect(MELDUNGEN_AUSGABEN.RUECKGABE_VORGABEN_NICHTS_ZU_TUN).not.toMatch(/ohne Wert|schon einen Wert/);
    expect(MELDUNGEN_AUSGABEN.RUECKGABE_VORGABEN_WEBHOOKS(1)).toContain("ist 1 Webhook aktiv");
    expect(MELDUNGEN_AUSGABEN.RUECKGABE_VORGABEN_WEBHOOKS(2)).toContain("sind 2 Webhooks aktiv");
    expect(MELDUNGEN_AUSGABEN.RUECKGABE_VORGABEN_WEBHOOKS(2)).toContain("Einstellungen → Webhooks");
  });

  it("G21: die Webhook-Ereignisse stehen im Katalog und sind webhookfaehig (nicht in EVENTS_OHNE_WEBHOOK)", () => {
    const katalog = new Set(EVENT_CATALOG.map((e) => e.event));
    for (const event of A4_WEBHOOK_EREIGNISSE) {
      expect(`${event}: ${katalog.has(event)}`).toBe(`${event}: true`);
      expect(Object.keys(EVENTS_OHNE_WEBHOOK)).not.toContain(event);
    }
    // Alle Offboarding-Abteilungsereignisse (offboarding-department-*) sind dabei.
    for (const e of EVENT_CATALOG.filter((x) => x.event.startsWith("offboarding-department-"))) {
      expect(A4_WEBHOOK_EREIGNISSE as readonly string[]).toContain(e.event);
    }
  });
});

// =============================================
// Grenzen und Fristen
// =============================================

describe("Grenzen und Fristen", () => {
  it("die Zahlen aus dem Feinplan (1.3)", () => {
    expect(AUSGABE_GRENZEN).toEqual({
      kennung: 60,
      kennungLabel: 40,
      // S22: Laenge von Ausgabe.bezeichnung (Schema „max. 200“), auf die
      // ausgabeBezeichnung kappt; Hoechstlaenge der Suche (1.4: 3..60).
      bezeichnung: 200,
      stueckJeVermerk: 10,
      aktiveJeAufgabe: 20,
      rueckwirkendTage: 365,
      kandidaten: 10,
      suche: 20,
      sucheMinZeichen: 3,
      sucheMaxZeichen: 60,
    });
    expect(AUSGABE_AUFBEWAHRUNG_MONATE).toBe(6);
    expect(AUSGABE_VERJAEHRUNG_JAHRE).toBe(3);
  });

  it("die Beschriftung der Kennung hat EINE Grenze mit dem Katalog (S23)", () => {
    expect(AUSGABE_GRENZEN.kennungLabel).toBe(GRENZEN.ausgabeKennung);
  });

  it("ein Vermerk hat mindestens Platz fuer ein volles Kontingent", () => {
    expect(AUSGABE_GRENZEN.stueckJeVermerk).toBeLessThanOrEqual(AUSGABE_GRENZEN.aktiveJeAufgabe);
  });

  it("die Meldungen nennen dieselben Zahlen", () => {
    expect(MELDUNGEN_AUSGABEN.ZU_VIELE_STUECKE).toContain(String(AUSGABE_GRENZEN.stueckJeVermerk));
    expect(MELDUNGEN_AUSGABEN.ZU_VIELE_AKTIVE).toContain(String(AUSGABE_GRENZEN.aktiveJeAufgabe));
    expect(MELDUNGEN_AUSGABEN.DATUM_ZU_FRUEH).toContain(String(AUSGABE_GRENZEN.rueckwirkendTage));
    expect(MELDUNGEN_AUSGABEN.KENNUNG_ZU_LANG).toContain(String(AUSGABE_GRENZEN.kennung));
    expect(MELDUNGEN_AUSGABEN.SUCHE_ZU_KURZ).toBe("Mindestens 3 Zeichen");
  });
});

// =============================================
// Ruecknahme-, Sperr- und Folgeaufgaben (G14, G17)
// =============================================

describe("RUECKNAHME_TEXTE", () => {
  it("Titel aus der Bezeichnung, ohne Kennung", () => {
    expect(RUECKNAHME_TEXTE.titelRueckgabe("Dienst-iPad (Lernmittel)")).toBe("Dienst-iPad (Lernmittel) zurücknehmen");
    expect(RUECKNAHME_TEXTE.titelSperren("Zugänge: WebUntis")).toBe("Zugänge: WebUntis sperren");
    expect(RUECKNAHME_TEXTE.titelFolge("Schlüssel: Haupteingang")).toBe("Schließung prüfen: Schlüssel: Haupteingang");
  });

  it("die Beschreibungen sind fest und nennen weder Kennung noch Person", () => {
    expect(RUECKNAHME_TEXTE.beschreibungRueckgabe).toBe(
      "Bitte nehmen Sie den Gegenstand zurück und bestätigen Sie den Zustand auf Ihrer Aufgabenseite. Dort steht auch die Kennung.",
    );
    expect(RUECKNAHME_TEXTE.beschreibungSperren).toBe("Bitte sperren Sie den Zugang zum letzten Arbeitstag.");
    expect(RUECKNAHME_TEXTE.beschreibungFolge).toContain("im Schließsystem sperren");
    // Beschreibung einer Aufgabe = ChecklistItem.description, dort hoechstens 500 Zeichen.
    for (const text of [
      RUECKNAHME_TEXTE.beschreibungRueckgabe,
      RUECKNAHME_TEXTE.beschreibungSperren,
      RUECKNAHME_TEXTE.beschreibungFolge,
    ]) {
      expect(text.length).toBeLessThanOrEqual(GRENZEN.hinweisStelle);
      expect(text).not.toMatch(/\{|\}/);
    }
  });

  it("die Folgeaufgabe geht an die Gebaeudewirtschaft", () => {
    expect(FOLGE_STELLE).toBe(DEPARTMENT_KEYS.FACILITY);
  });
});

// =============================================
// Reiter „Rückgaben“ (E-A36)
// =============================================

describe("LAGE_TEXTE", () => {
  const WERTE: LageTextWerte = { nr: "ONB-2027-GYM-0007", gegenstaende: 2, zugaenge: 1, ohneVermerk: 3 };

  it("je Lage ein Text, in der Pruefreihenfolge von rueckgabeLage", () => {
    expect(Object.keys(LAGE_TEXTE).sort()).toEqual([...RUECKGABE_LAGEN].sort());
    expect(RUECKGABE_LAGEN[0]).toBe("KEINE_EINSTELLUNG");
    expect(RUECKGABE_LAGEN[RUECKGABE_LAGEN.length - 1]).toBe("VOR_EINFUEHRUNG");
  });

  it("setzt Nummer und Anzahlen ein", () => {
    expect(LAGE_TEXTE.KEINE_EINSTELLUNG(WERTE)).toBe(
      "Keine Einstellung zugeordnet. Was ausgegeben wurde, kennt das Portal erst nach „Einstellung zuordnen …“.",
    );
    expect(LAGE_TEXTE.AUSGABEN(WERTE)).toBe(
      "Laut Portal ausgegeben (Einstellung ONB-2027-GYM-0007, von HR zugeordnet): 2 Gegenstände, 1 Zugang.",
    );
    expect(LAGE_TEXTE.AUSGABEN({ ...WERTE, gegenstaende: 1, zugaenge: 2 })).toContain("1 Gegenstand, 2 Zugänge.");
    expect(LAGE_TEXTE.NICHTS_ERFASST(WERTE)).toBe("Laut Portal bereitgestellt, aber keine Übergabe vermerkt: 3 Aufgaben.");
    expect(LAGE_TEXTE.NICHTS_ERFASST({ ...WERTE, ohneVermerk: 1 })).toContain(": 1 Aufgabe.");
    for (const lage of ["VOR_EINFUEHRUNG", "NICHTS_AUSGEGEBEN", "GELOESCHT"] as const) {
      expect(LAGE_TEXTE[lage](WERTE)).toContain("Einstellung ONB-2027-GYM-0007");
    }
  });

  it("die drei Leeranzeigen sind unterscheidbar", () => {
    const texte = (["KEINE_EINSTELLUNG", "VOR_EINFUEHRUNG", "NICHTS_AUSGEGEBEN"] as const).map((l) => LAGE_TEXTE[l](WERTE));
    expect(new Set(texte).size).toBe(3);
  });

  it("Zusatzzeilen", () => {
    expect(LAGE_WEITERE_GELOESCHT).toBe("Weitere Ausgaben wurden nach Ablauf der Aufbewahrungsfrist gelöscht.");
    expect(GEDAECHTNISSTUETZE).toBe(
      "Das Portal ist eine Gedächtnisstütze; maßgeblich bleiben Geräteverwaltung und Schließplan.",
    );
  });
});

// =============================================
// Meldungen
// =============================================

describe("MELDUNGEN_AUSGABEN", () => {
  it("die festen Texte aus dem Feinplan", () => {
    expect(MELDUNGEN_AUSGABEN.AUSGABE_VORHANDEN).toBe(
      "Für diese Position ist eine Ausgabe vermerkt – erst die Ausgabe entfernen oder zurücknehmen.",
    );
    expect(MELDUNGEN_AUSGABEN.EINSTELLUNG_VERGEBEN).toBe("Diese Einstellung ist schon einem laufenden Austritt zugeordnet.");
    expect(MELDUNGEN_AUSGABEN.EINSTELLUNG_ABGESAGT).toBe("Diese Einstellung wurde abgesagt und lässt sich nicht zuordnen.");
    expect(MELDUNGEN_AUSGABEN.GEBAEUDEWIRTSCHAFT_INFORMIEREN).toBe(
      "Bitte die Gebäudewirtschaft wegen der Schließung informieren.",
    );
    expect(MELDUNGEN_AUSGABEN.AUSGABEN_GELOESCHT).toBe("Ausgaben nach Ablauf der Aufbewahrungsfrist gelöscht");
    expect(MELDUNGEN_AUSGABEN.ZUORDNUNG_EMPFOHLEN).toBe("Einstellung zuordnen, bevor Sie die Abteilungen informieren");
    expect(MELDUNGEN_AUSGABEN.KEIN_VORSCHLAG).toBe("Kein Vorschlag – über Vorgangsnummer oder Nachname suchen");
    expect(MELDUNGEN_AUSGABEN.KEIN_TREFFER).toBe("Kein Treffer");
  });

  it("AUSGABE_IM_AUSTRITT nennt die Vorgangsnummer nur, wenn sie mitkommt (G7)", () => {
    expect(MELDUNGEN_AUSGABEN.AUSGABE_IM_AUSTRITT("OFF-2027-GYM-0003")).toContain("Austritt OFF-2027-GYM-0003");
    const ohne = MELDUNGEN_AUSGABEN.AUSGABE_IM_AUSTRITT(null);
    expect(ohne).toContain("einem anderen Austritt");
    expect(ohne).not.toMatch(/OFF-/);
  });

  it("SCHON_IM_AUSTRITT: Einzahl, Mehrzahl, ohne Nummer", () => {
    expect(MELDUNGEN_AUSGABEN.SCHON_IM_AUSTRITT(1, "OFF-2027-GYM-0003")).toBe("1 Stück läuft im Austritt OFF-2027-GYM-0003.");
    expect(MELDUNGEN_AUSGABEN.SCHON_IM_AUSTRITT(2, null)).toBe("2 Stücke laufen in einem anderen Austritt.");
  });

  it("LOESEN_RUECKFRAGE: zweiter Satz nur, wenn schon Stellen informiert sind", () => {
    expect(MELDUNGEN_AUSGABEN.LOESEN_RUECKFRAGE(3, 2)).toBe(
      "3 Rücknahme- und Sperraufgaben werden gelöscht. 2 Stellen wurden schon informiert und sehen sie danach nicht mehr – bitte ggf. Bescheid geben.",
    );
    expect(MELDUNGEN_AUSGABEN.LOESEN_RUECKFRAGE(1, 1)).toBe(
      "1 Rücknahme- bzw. Sperraufgabe wird gelöscht. 1 Stelle wurde schon informiert und sieht sie danach nicht mehr – bitte ggf. Bescheid geben.",
    );
    expect(MELDUNGEN_AUSGABEN.LOESEN_RUECKFRAGE(2, 0)).toBe("2 Rücknahme- und Sperraufgaben werden gelöscht.");
  });

  it("RUECKGABEN_OFFEN: Einzahl und Mehrzahl, Abschluss bleibt moeglich (G18)", () => {
    expect(MELDUNGEN_AUSGABEN.RUECKGABEN_OFFEN(1)).toMatch(/^1 Rückgabe oder Sperre ist noch offen\./);
    expect(MELDUNGEN_AUSGABEN.RUECKGABEN_OFFEN(4)).toMatch(/^4 Rückgaben oder Sperren sind noch offen\./);
    expect(MELDUNGEN_AUSGABEN.RUECKGABEN_OFFEN(4)).toContain("trotzdem abschließen");
  });

  it("Protokoll: fehlt bzw. hochgeladen am, je Art", () => {
    expect(MELDUNGEN_AUSGABEN.PROTOKOLL_FEHLT("UEBERGABE")).toBe("Unterschriebenes Übergabeprotokoll: fehlt");
    expect(MELDUNGEN_AUSGABEN.PROTOKOLL_FEHLT("RUECKGABE")).toBe("Unterschriebenes Rückgabeprotokoll: fehlt");
    expect(MELDUNGEN_AUSGABEN.PROTOKOLL_HOCHGELADEN("UEBERGABE", "28.01.2027")).toBe(
      "Unterschriebenes Übergabeprotokoll: hochgeladen am 28.01.2027",
    );
  });

  it("kein Text ist leer", () => {
    for (const [schluessel, wert] of Object.entries(MELDUNGEN_AUSGABEN)) {
      if (typeof wert === "string") expect(`${schluessel}: ${wert.trim() === ""}`).toBe(`${schluessel}: false`);
    }
  });
});

// =============================================
// Protokoll (1.10)
// =============================================

describe("AUSGABEN_AUDIT", () => {
  it("die Codes aus dem Feinplan, jeder mit Beschriftung, keine doppelt", () => {
    expect(Object.values(AUSGABEN_AUDIT).sort()).toEqual(
      [
        "AUSGABE_VERMERKT",
        "AUSGABE_KORRIGIERT",
        "AUSGABE_GETAUSCHT",
        "AUSGABE_ZURUECKGENOMMEN",
        "AUSGABE_ENTFERNT",
        "AUSGABE_UEBERNOMMEN",
        "EINSTELLUNG_ZUGEORDNET",
        "EINSTELLUNG_GELOEST",
        "RUECKGABEN_AKTUALISIERT",
        "RUECKGABEN_VORGESCHLAGEN",
        "AUSGABE_ZUSTAND_GEAENDERT",
        "AUSGABEN_GELOESCHT",
      ].sort(),
    );
    const labels = Object.values(AUSGABEN_AUDIT_LABELS);
    for (const l of labels) expect(l.trim()).not.toBe("");
    expect(new Set(labels).size).toBe(labels.length);
  });
});

// =============================================
// Reinheit und Importrichtung (G1)
// =============================================

describe("Reinheit der Datei", () => {
  const quelle = (datei: string) => fs.readFileSync(path.join(process.cwd(), datei), "utf8");
  const importe = (datei: string) => [...quelle(datei).matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);

  it("ausgaben.ts importiert weder Prisma noch die Datenbank noch Node-Module (client-sicher)", () => {
    const erlaubt = [
      "@/lib/ausstattung",
      "@/lib/abteilungsaufgaben",
      "@/lib/constants",
      "@/lib/format",
      "@/lib/kalendertag",
      "@/lib/vorgangsjahr",
      "@/lib/minijob-fristen",
      // S22: escapeHtml fuer die Mailfelder (Feinplan 1.3); email-layout.ts importiert selbst nichts.
      "@/lib/email-layout",
    ];
    for (const ziel of importe("src/lib/ausgaben.ts")) expect(erlaubt).toContain(ziel);
    expect(importe("src/lib/email-layout.ts")).toEqual([]);
  });

  it("die reinen Regeln lesen nie die Zod-Schicht (die Richtung ist validations → ausgaben)", () => {
    expect(importe("src/lib/ausgaben.ts").some((z) => z.includes("validations"))).toBe(false);
  });

  it("ausstattung.ts und abteilungsaufgaben.ts lesen ausgaben.ts hoechstens als Typ (kein Kreis)", () => {
    expect(quelle("src/lib/ausstattung.ts")).not.toMatch(/^import\s+(?!type\b)[^;]*from\s+"@\/lib\/ausgaben"/m);
    expect(quelle("src/lib/abteilungsaufgaben.ts")).not.toMatch(/^import\s+(?!type\b)[^;]*from\s+"@\/lib\/ausgaben"/m);
  });
});

// =============================================
// Funktionen (S22) – Fristen und Zustandswechsel
// =============================================

/** Ein Zeitpunkt in UTC; die Berliner Zeit steht jeweils im Kommentar. */
const utc = (iso: string) => new Date(iso);

describe("ausgabeLoeschenAb (E-A37, G20)", () => {
  it("ZURUECK am 31.08. ergibt den Beginn des 28. bzw. 29.02. (Monatsende gekappt)", () => {
    // 31.08.2026, 12:00 Berlin → 28.02.2027, 00:00 Berlin (Winterzeit, UTC+1)
    expect(ausgabeLoeschenAb({ zustand: "ZURUECK", zustandAm: utc("2026-08-31T10:00:00Z") })?.toISOString()).toBe(
      "2027-02-27T23:00:00.000Z",
    );
    // 31.08.2027 → 29.02.2028 (Schaltjahr)
    expect(ausgabeLoeschenAb({ zustand: "ZURUECK", zustandAm: utc("2027-08-31T10:00:00Z") })?.toISOString()).toBe(
      "2028-02-28T23:00:00.000Z",
    );
  });

  it("Sommer- und Winterzeit: der Fristbeginn ist immer 00:00 Uhr in Berlin", () => {
    // 15.01.2027 → 15.07.2027 (Sommerzeit, UTC+2)
    const sommer = ausgabeLoeschenAb({ zustand: "BESCHAEDIGT", zustandAm: utc("2027-01-15T09:00:00Z") })!;
    expect(sommer.toISOString()).toBe("2027-07-14T22:00:00.000Z");
    // 15.05.2027 (Sommerzeit) → 15.11.2027 (Winterzeit)
    const winter = ausgabeLoeschenAb({ zustand: "ENTFAELLT", zustandAm: utc("2027-05-15T09:00:00Z") })!;
    expect(winter.toISOString()).toBe("2027-11-14T23:00:00.000Z");
    expect(berlinerKalendertag(sommer)).toBe("2027-07-15");
    expect(berlinerKalendertag(winter)).toBe("2027-11-15");
  });

  it("der Berliner Tag zaehlt, nicht der UTC-Tag", () => {
    // 31.08.2027 22:30 UTC = 01.09.2027 00:30 Berlin → 01.03.2028
    expect(berlinerKalendertag(ausgabeLoeschenAb({ zustand: "ERSETZT", zustandAm: utc("2027-08-31T22:30:00Z") })!)).toBe(
      "2028-03-01",
    );
  });

  it("FEHLT: drei Jahre ab Ende des BERLINER Jahres – das Paar um Mitternacht belegt es", () => {
    // 31.12.2027 23:30 Berlin = 22:30 UTC → Jahr 2027 → 1.1.2031
    const vorher = ausgabeLoeschenAb({ zustand: "FEHLT", zustandAm: utc("2027-12-31T22:30:00Z") })!;
    expect(vorher.toISOString()).toBe("2030-12-31T23:00:00.000Z");
    expect(berlinerKalendertag(vorher)).toBe("2031-01-01");
    // 01.01.2028 00:30 Berlin = 31.12.2027 23:30 UTC → Jahr 2028 → 1.1.2032
    const nachher = ausgabeLoeschenAb({ zustand: "FEHLT", zustandAm: utc("2027-12-31T23:30:00Z") })!;
    expect(nachher.toISOString()).toBe("2031-12-31T23:00:00.000Z");
    expect(berlinerKalendertag(nachher)).toBe("2032-01-01");
  });

  it("AUSGEGEBEN: ohne Anlass null, mit Abschluss bzw. Absage drei Jahre ab Jahresende (G18, G10)", () => {
    const jetzt = utc("2027-06-01T10:00:00Z");
    expect(ausgabeLoeschenAb({ zustand: "AUSGEGEBEN", zustandAm: jetzt })).toBeNull();
    for (const feld of ["austrittAbgeschlossenAm", "vorgangEingestelltAm"] as const) {
      expect(
        ausgabeLoeschenAb({ zustand: "AUSGEGEBEN", zustandAm: jetzt, [feld]: utc("2027-12-31T22:30:00Z") })?.toISOString(),
      ).toBe("2030-12-31T23:00:00.000Z");
      expect(
        ausgabeLoeschenAb({ zustand: "AUSGEGEBEN", zustandAm: jetzt, [feld]: utc("2027-12-31T23:30:00Z") })?.toISOString(),
      ).toBe("2031-12-31T23:00:00.000Z");
    }
    // Beide gesetzt (im Ablauf nicht vorgesehen): der spaetere – nie frueher loeschen.
    expect(
      ausgabeLoeschenAb({
        zustand: "AUSGEGEBEN",
        zustandAm: jetzt,
        austrittAbgeschlossenAm: utc("2028-03-01T10:00:00Z"),
        vorgangEingestelltAm: utc("2027-03-01T10:00:00Z"),
      })?.toISOString(),
    ).toBe("2031-12-31T23:00:00.000Z");
  });

  it("VERBLEIBT: null – auch mit Abschluss (bleibt Bestand der Person, G28)", () => {
    const jetzt = utc("2027-06-01T10:00:00Z");
    expect(ausgabeLoeschenAb({ zustand: "VERBLEIBT", zustandAm: jetzt })).toBeNull();
    expect(ausgabeLoeschenAb({ zustand: "VERBLEIBT", zustandAm: jetzt, austrittAbgeschlossenAm: jetzt })).toBeNull();
  });

  it("die Fristen haengen an den Konstanten", () => {
    expect(AUSGABE_AUFBEWAHRUNG_MONATE).toBe(6);
    expect(AUSGABE_VERJAEHRUNG_JAHRE).toBe(3);
  });
});

describe("ausgabeZustandDaten (G3: einziger Bauplan)", () => {
  const jetzt = utc("2027-03-10T09:15:00Z");

  it("liefert fuer JEDEN Zustand zustandAm = jetzt und die Frist aus ausgabeLoeschenAb", () => {
    for (const zustand of AUSGABE_ZUSTAENDE) {
      const daten = ausgabeZustandDaten(zustand, jetzt);
      expect(daten.zustand).toBe(zustand);
      expect(daten.zustandAm).toBe(jetzt);
      expect(daten.loeschenAb).toEqual(ausgabeLoeschenAb({ zustand, zustandAm: jetzt }));
    }
  });

  it("reicht Abschluss und Absage an die Frist durch", () => {
    const abschluss = utc("2027-12-31T22:30:00Z");
    expect(ausgabeZustandDaten("AUSGEGEBEN", jetzt, { austrittAbgeschlossenAm: abschluss }).loeschenAb).toEqual(
      ausgabeLoeschenAb({ zustand: "AUSGEGEBEN", zustandAm: jetzt, austrittAbgeschlossenAm: abschluss }),
    );
    expect(ausgabeZustandDaten("AUSGEGEBEN", jetzt, { vorgangEingestelltAm: abschluss }).loeschenAb).not.toBeNull();
  });
});

// =============================================
// Bindung an einen Austritt (G28)
// =============================================

describe("bindetAusgabe / bindenderAustritt / perLinkEntfernbar (G28, G6)", () => {
  const LAUFEND = ["INITIATED", "NOTICE_PERIOD", "HANDOVER_PHASE", "FINAL_SETTLEMENT"];

  it("laufend bindet jeden Zustand", () => {
    for (const status of LAUFEND) {
      for (const zustand of AUSGABE_ZUSTAENDE) expect(`${status}/${zustand}: ${bindetAusgabe(status, zustand)}`).toBe(`${status}/${zustand}: true`);
    }
  });

  it("COMPLETED bindet alles ausser VERBLEIBT – auch ein offen gebliebenes AUSGEGEBEN", () => {
    for (const zustand of AUSGABE_ZUSTAENDE) {
      expect(`${zustand}: ${bindetAusgabe("COMPLETED", zustand)}`).toBe(`${zustand}: ${zustand !== "VERBLEIBT"}`);
    }
    expect(bindetAusgabe("COMPLETED", "AUSGEGEBEN")).toBe(true);
  });

  it("CANCELLED bindet nie", () => {
    for (const zustand of AUSGABE_ZUSTAENDE) expect(bindetAusgabe("CANCELLED", zustand)).toBe(false);
  });

  it("bindenderAustritt: der erste bindende Bezug, der eigene Austritt zaehlt nicht", () => {
    const bezuege = [
      { offboardingId: "off-abgebrochen", status: "CANCELLED", displayId: "OFF-1" },
      { offboardingId: "off-eigen", status: "INITIATED", displayId: "OFF-2" },
      { offboardingId: "off-alt", status: "COMPLETED", displayId: null },
    ];
    expect(bindenderAustritt({ zustand: "AUSGEGEBEN" }, bezuege)?.offboardingId).toBe("off-eigen");
    expect(bindenderAustritt({ zustand: "AUSGEGEBEN" }, bezuege, "off-eigen")?.offboardingId).toBe("off-alt");
    // VERBLEIBT: der abgeschlossene gibt frei, der eigene ist ausgenommen.
    expect(bindenderAustritt({ zustand: "VERBLEIBT" }, bezuege, "off-eigen")).toBeNull();
    expect(bindenderAustritt({ zustand: "AUSGEGEBEN" }, [])).toBeNull();
  });

  it("perLinkEntfernbar: nur eigener Link-Vermerk, AUSGEGEBEN, ungebunden", () => {
    expect(perLinkEntfernbar({ quelle: "LINK", zustand: "AUSGEGEBEN" }, false)).toBe(true);
    expect(perLinkEntfernbar({ quelle: "HR", zustand: "AUSGEGEBEN" }, false)).toBe(false);
    expect(perLinkEntfernbar({ quelle: "LINK", zustand: "VERBLEIBT" }, false)).toBe(false);
    expect(perLinkEntfernbar({ quelle: "LINK", zustand: "AUSGEGEBEN" }, true)).toBe(false);
  });
});

// =============================================
// Wann eine Uebergabe angeboten wird (G4, E-A36)
// =============================================

describe("ausgabeMoeglich (G4)", () => {
  it("RUECKGABE und SPERREN ja", () => {
    expect(ausgabeMoeglich({ art: "JA_NEIN", beiAustritt: "RUECKGABE" })).toBe(true);
    expect(ausgabeMoeglich({ art: "AUSWAHL", beiAustritt: "SPERREN", gestrichenAm: null })).toBe(true);
  });

  it("NICHTS, null, Angabe und gestrichen nein", () => {
    expect(ausgabeMoeglich({ art: "JA_NEIN", beiAustritt: "NICHTS" })).toBe(false);
    expect(ausgabeMoeglich({ art: "JA_NEIN", beiAustritt: null })).toBe(false);
    expect(ausgabeMoeglich({ art: "JA_NEIN", beiAustritt: undefined })).toBe(false);
    expect(ausgabeMoeglich({ art: "ANGABE", beiAustritt: "RUECKGABE" })).toBe(false);
    expect(ausgabeMoeglich({ art: "JA_NEIN", beiAustritt: "RUECKGABE", gestrichenAm: utc("2027-01-20T10:00:00Z") })).toBe(false);
  });
});

describe("ausgabenAngeboten (E-A36)", () => {
  it("ein Ausschnitt mit RUECKGABE bzw. SPERREN ja", () => {
    expect(ausgabenAngeboten([{ art: "JA_NEIN", beiAustritt: "NICHTS" }, { art: "JA_NEIN", beiAustritt: "RUECKGABE" }])).toBe(true);
    expect(ausgabenAngeboten([{ art: "AUSWAHL", beiAustritt: "SPERREN" }])).toBe(true);
  });

  it("nur NICHTS, ohne Wert oder leer nein; eine Angabe zaehlt nie", () => {
    expect(ausgabenAngeboten([{ art: "JA_NEIN", beiAustritt: "NICHTS" }, { art: "JA_NEIN", beiAustritt: null }])).toBe(false);
    expect(ausgabenAngeboten([])).toBe(false);
    expect(ausgabenAngeboten([{ art: "ANGABE", beiAustritt: "RUECKGABE" }])).toBe(false);
  });
});

describe("ausgabeBezeichnung (G2)", () => {
  it("ganze Position bzw. mit Option", () => {
    expect(ausgabeBezeichnung({ bezeichnung: "Dienst-iPad (Lernmittel)" }, "")).toBe("Dienst-iPad (Lernmittel)");
    expect(ausgabeBezeichnung({ bezeichnung: " Schlüssel " }, " Haupteingang ")).toBe("Schlüssel: Haupteingang");
  });

  it("nie Freitext: nur Bezeichnung und Option, nichts sonst (auch keine Bemerkung oder Kennung)", () => {
    const zeile = { bezeichnung: "Schlüssel", bemerkung: "nur werktags", kennung: "GS-114" };
    expect(ausgabeBezeichnung(zeile, "Haupteingang")).toBe("Schlüssel: Haupteingang");
  });

  it("gekappt auf die Laenge der Spalte (120 + „: “ + 80 waeren 202 Zeichen)", () => {
    const lang = ausgabeBezeichnung({ bezeichnung: "B".repeat(GRENZEN.bezeichnung) }, "O".repeat(GRENZEN.option));
    expect(Array.from(lang)).toHaveLength(AUSGABE_GRENZEN.bezeichnung);
    expect(lang.endsWith("…")).toBe(true);
    const passt = ausgabeBezeichnung({ bezeichnung: "B".repeat(GRENZEN.bezeichnung) }, "O".repeat(78));
    expect(passt).toHaveLength(200);
    expect(passt.endsWith("O")).toBe(true);
  });
});

describe("vermerkPruefen (G4)", () => {
  const ctx = { heute: "2027-02-10", vorgangAngelegt: utc("2027-01-05T09:00:00Z"), aktiv: 0 };
  const stueck = (uebergebenAm?: string | null) => ({ kennung: "FES-IPAD-0412", uebergebenAm });

  it("1 bis 10 Stueck", () => {
    expect(vermerkPruefen({ stuecke: [] }, ctx)).toBe("KEIN_STUECK");
    expect(vermerkPruefen({ stuecke: Array.from({ length: 11 }, () => stueck()) }, ctx)).toBe("ZU_VIELE_STUECKE");
    expect(vermerkPruefen({ stuecke: Array.from({ length: 10 }, () => stueck()) }, ctx)).toBeNull();
  });

  it("Grenze der aktiven Stuecke je Aufgabe", () => {
    expect(vermerkPruefen({ stuecke: [stueck(), stueck(), stueck(), stueck(), stueck()] }, { ...ctx, aktiv: 15 })).toBeNull();
    expect(vermerkPruefen({ stuecke: Array.from({ length: 6 }, () => stueck()) }, { ...ctx, aktiv: 15 })).toBe(
      "ZU_VIELE_AKTIVE",
    );
    expect(vermerkPruefen({ stuecke: [stueck()] }, { ...ctx, aktiv: 20 })).toBe("ZU_VIELE_AKTIVE");
  });

  it("Datum: heute ja, morgen nein; ohne Datum gilt heute", () => {
    expect(vermerkPruefen({ stuecke: [stueck("2027-02-10")] }, ctx)).toBeNull();
    expect(vermerkPruefen({ stuecke: [stueck("2027-02-11")] }, ctx)).toBe("DATUM_IN_ZUKUNFT");
    expect(vermerkPruefen({ stuecke: [stueck(undefined), stueck(null)] }, ctx)).toBeNull();
  });

  it("Datum: hoechstens 365 Tage vor dem Berliner Tag des Anlegens; kein 31.02.", () => {
    expect(vermerkPruefen({ stuecke: [stueck("2026-01-05")] }, ctx)).toBeNull();
    expect(vermerkPruefen({ stuecke: [stueck("2026-01-04")] }, ctx)).toBe("DATUM_ZU_FRUEH");
    expect(vermerkPruefen({ stuecke: [stueck("2027-02-31")] }, ctx)).toBe("DATUM_UNGUELTIG");
    // Angelegt am 04.01.2027 23:30 UTC = 05.01.2027 00:30 Berlin: es zaehlt der 05.01.
    const spaet = { ...ctx, vorgangAngelegt: utc("2027-01-04T23:30:00Z") };
    expect(vermerkPruefen({ stuecke: [stueck("2026-01-04")] }, spaet)).toBe("DATUM_ZU_FRUEH");
  });

  it("jeder Grund hat seinen Text in MELDUNGEN_AUSGABEN", () => {
    for (const grund of ["KEIN_STUECK", "ZU_VIELE_STUECKE", "ZU_VIELE_AKTIVE", "DATUM_UNGUELTIG", "DATUM_IN_ZUKUNFT", "DATUM_ZU_FRUEH"] as const) {
      expect(typeof MELDUNGEN_AUSGABEN[grund]).toBe("string");
    }
  });
});

// =============================================
// Rueckgabe-Zeilen (G16, 1.9)
// =============================================

describe("rueckgabeZustand / rueckgabeOffen / rueckgabeDaten (G16)", () => {
  it("der Zustand fuehrt; Altbestand mit isReturned ohne Zustand gilt als ZURUECK", () => {
    for (const zustand of RUECKGABE_ZUSTAENDE) {
      expect(rueckgabeZustand({ zustand, isReturned: false })).toBe(zustand);
      expect(rueckgabeOffen({ zustand, isReturned: false })).toBe(false);
    }
    expect(rueckgabeZustand({ zustand: null, isReturned: true })).toBe("ZURUECK");
    expect(rueckgabeOffen({ zustand: null, isReturned: true })).toBe(false);
    expect(rueckgabeZustand({ zustand: null, isReturned: false })).toBeNull();
    expect(rueckgabeOffen({ isReturned: false })).toBe(true);
    // Ein unbekannter Wert ist kein Zustand.
    expect(rueckgabeZustand({ zustand: "KAPUTT", isReturned: false })).toBeNull();
  });

  it("isReturned nur bei ZURUECK und BESCHAEDIGT, sonst ohne Zeitpunkt und Person", () => {
    const jetzt = utc("2027-07-31T10:00:00Z");
    expect(rueckgabeDaten("ZURUECK", jetzt, "u-1")).toEqual({
      zustand: "ZURUECK",
      isReturned: true,
      returnedAt: jetzt,
      returnedToId: "u-1",
    });
    expect(rueckgabeDaten("BESCHAEDIGT", jetzt, null)).toMatchObject({ isReturned: true, returnedAt: jetzt });
    for (const zustand of ["FEHLT", "VERBLEIBT", "ENTFAELLT", null] as const) {
      expect(rueckgabeDaten(zustand, jetzt, "u-1")).toEqual({
        zustand,
        isReturned: false,
        returnedAt: null,
        returnedToId: null,
      });
    }
  });
});

describe("rueckgabeZeileText (1.9)", () => {
  // 31.07.2027 23:30 UTC = 01.08.2027 01:30 Berlin
  const am = utc("2027-07-31T23:30:00Z");
  const zeile = (zustand: string | null, isReturned = false) => ({
    itemName: "Laptop",
    serialNumber: "FES-0412",
    zustand,
    isReturned,
    returnedAt: am,
  });

  it("jeder Zustand mit seinem Wort; das Datum in Berliner Zeit", () => {
    expect(rueckgabeZeileText(zeile("ZURUECK", true))).toBe("Laptop (FES-0412) — zurueck am 01.08.2027");
    expect(rueckgabeZeileText(zeile("BESCHAEDIGT", true))).toBe("Laptop (FES-0412) — beschädigt zurück am 01.08.2027");
    expect(rueckgabeZeileText({ ...zeile("FEHLT"), returnedAt: null })).toBe("Laptop (FES-0412) — fehlt");
    expect(rueckgabeZeileText(zeile("VERBLEIBT"))).toBe("Laptop (FES-0412) — verbleibt");
    expect(rueckgabeZeileText(zeile("ENTFAELLT"))).toBe("Laptop (FES-0412) — entfällt");
  });

  it("Altbestand (isReturned ohne Zustand) wie bisher; offen nur Name und Kennung", () => {
    expect(rueckgabeZeileText(zeile(null, true))).toBe("Laptop (FES-0412) — zurueck am 01.08.2027");
    expect(rueckgabeZeileText({ ...zeile(null, true), returnedAt: null })).toBe("Laptop (FES-0412)");
    expect(rueckgabeZeileText({ ...zeile(null), serialNumber: null })).toBe("Laptop");
    expect(rueckgabeZeileText({ ...zeile("BESCHAEDIGT", true), returnedAt: null })).toBe("Laptop (FES-0412) — beschädigt zurück");
  });
});

// =============================================
// Ruecknahme-, Sperr- und Folgeaufgaben (G14, G17)
// =============================================

describe("ruecknahmeAufgabe (G14)", () => {
  const ipad = { id: "a-1", bezeichnung: "Dienst-iPad (Lernmittel)", beiAustritt: "RUECKGABE", departmentKey: "IT" };

  it("Titel und Beschreibung ohne Kennung, Kategorie und Reihenfolge oben", () => {
    const a = ruecknahmeAufgabe(ipad, { letzterArbeitstag: utc("2027-07-31T00:00:00Z"), heute: "2027-07-01", index: 2 });
    expect(a).toEqual({
      title: "Dienst-iPad (Lernmittel) zurücknehmen",
      description: RUECKNAHME_TEXTE.beschreibungRueckgabe,
      category: AUSSTATTUNG_KATEGORIE,
      orderIndex: ORDER_BASIS + 2,
      dueDate: utc("2027-07-31T00:00:00.000Z"),
      assigneeDepartment: "IT",
      herkunft: "AUSGABE",
      ausgabeId: "a-1",
    });
    expect(a.orderIndex).toBeLessThan(0); // vor allen Vorlagenpunkten (ab 0)
  });

  it("Sperraufgabe bei SPERREN", () => {
    const a = ruecknahmeAufgabe(
      { id: "a-2", bezeichnung: "Zugänge: WebUntis", beiAustritt: "SPERREN", departmentKey: "IT" },
      { letzterArbeitstag: "2027-07-31", heute: "2027-07-01", index: 0 },
    );
    expect(a.title).toBe("Zugänge: WebUntis sperren");
    expect(a.description).toBe(RUECKNAHME_TEXTE.beschreibungSperren);
  });

  it("faellig am spaeteren von letztem Arbeitstag und heute", () => {
    const vorbei = ruecknahmeAufgabe(ipad, { letzterArbeitstag: utc("2027-06-30T00:00:00Z"), heute: "2027-07-05", index: 0 });
    expect(vorbei.dueDate.toISOString()).toBe("2027-07-05T00:00:00.000Z");
    const ohne = ruecknahmeAufgabe(ipad, { letzterArbeitstag: null, heute: "2027-07-05", index: 0 });
    expect(ohne.dueDate.toISOString()).toBe("2027-07-05T00:00:00.000Z");
  });

  it("HR-Stelle bleibt HR (Portal-Aufgabe ohne Link)", () => {
    expect(
      ruecknahmeAufgabe({ ...ipad, departmentKey: "HR" }, { letzterArbeitstag: null, heute: "2027-07-05", index: 0 })
        .assigneeDepartment,
    ).toBe("HR");
  });
});

describe("folgeAufgabe / folgeAufgabeNoetig / brauchtFolgeStelle (G17)", () => {
  const schluessel = { rueckgabeKategorie: "SCHLUESSEL" };
  const laptop = { rueckgabeKategorie: "IT_HARDWARE" };

  it("Folgeaufgabe an die Gebaeudewirtschaft, heute faellig, ohne Kennung", () => {
    expect(folgeAufgabe({ id: "a-3", bezeichnung: "Schlüssel: Haupteingang" }, "2027-08-02")).toEqual({
      title: "Schließung prüfen: Schlüssel: Haupteingang",
      description: RUECKNAHME_TEXTE.beschreibungFolge,
      category: AUSSTATTUNG_KATEGORIE,
      orderIndex: FOLGE_ORDER_INDEX,
      dueDate: utc("2027-08-02T00:00:00.000Z"),
      assigneeDepartment: "FACILITY",
      herkunft: "AUSGABE_FEHLT",
      ausgabeId: "a-3",
    });
    expect(FOLGE_ORDER_INDEX).toBeLessThan(ORDER_BASIS);
  });

  it("noetig nur bei FEHLT eines Schluessels", () => {
    expect(folgeAufgabeNoetig(schluessel, "FEHLT")).toBe(true);
    expect(folgeAufgabeNoetig(schluessel, "ZURUECK")).toBe(false);
    expect(folgeAufgabeNoetig(laptop, "FEHLT")).toBe(false);
  });

  it("FACILITY mitsperren nur bei SCHLUESSEL, beim Setzen UND beim Verlassen von FEHLT", () => {
    expect(brauchtFolgeStelle(schluessel, "AUSGEGEBEN", "FEHLT")).toBe(true);
    expect(brauchtFolgeStelle(schluessel, "FEHLT", "ZURUECK")).toBe(true);
    expect(brauchtFolgeStelle(schluessel, "FEHLT", null)).toBe(true);
    expect(brauchtFolgeStelle(schluessel, "FEHLT", "FEHLT")).toBe(false);
    expect(brauchtFolgeStelle(schluessel, "AUSGEGEBEN", "ZURUECK")).toBe(false);
    expect(brauchtFolgeStelle(laptop, "AUSGEGEBEN", "FEHLT")).toBe(false);
    expect(brauchtFolgeStelle({ rueckgabeKategorie: null }, "AUSGEGEBEN", "FEHLT")).toBe(false);
  });
});

describe("folgeAufgabeSchritt (G17: hoechstens eine Folgeaufgabe je Austritt und Ausgabe)", () => {
  const schluessel = { id: "a-3", bezeichnung: "Schlüssel: Haupteingang", rueckgabeKategorie: "SCHLUESSEL" };
  const heute = "2027-08-02";
  const offen = { id: "f-1", isCompleted: false };
  const erledigt = { id: "f-1", isCompleted: true };

  it("FEHLT ohne Folgeaufgabe: anlegen (wie folgeAufgabe)", () => {
    expect(folgeAufgabeSchritt({ ausgabe: schluessel, alt: "AUSGEGEBEN", neu: "FEHLT", vorhanden: null, heute })).toEqual({
      art: "ANLEGEN",
      aufgabe: folgeAufgabe(schluessel, heute),
    });
  });

  it("FEHLT → erledigt → ZURUECK → wieder FEHLT: dieselbe Zeile wird wieder geoeffnet, keine zweite (Unique-Index)", () => {
    // Verlassen von FEHLT: Die erledigte Folgeaufgabe bleibt stehen.
    expect(folgeAufgabeSchritt({ ausgabe: schluessel, alt: "FEHLT", neu: "ZURUECK", vorhanden: erledigt, heute })).toBeNull();
    // Erneut FEHLT, ueber jeden Weg (auch vom Wiederoeffnen aus: AUSGEGEBEN bzw. ReturnItem null).
    for (const alt of ["ZURUECK", "AUSGEGEBEN", null]) {
      expect(folgeAufgabeSchritt({ ausgabe: schluessel, alt, neu: "FEHLT", vorhanden: erledigt, heute })).toEqual({
        art: "WIEDEROEFFNEN",
        id: "f-1",
        daten: {
          isCompleted: false,
          completedAt: null,
          completedById: null,
          dueDate: utc("2027-08-02T00:00:00.000Z"),
          abteilungKommentar: null,
          abteilungKommentarAm: null,
        },
      });
    }
  });

  it("FEHLT bei schon offener Folgeaufgabe: nichts; FEHLT verlassen: offene loeschen, erledigte bleibt", () => {
    expect(folgeAufgabeSchritt({ ausgabe: schluessel, alt: "ZURUECK", neu: "FEHLT", vorhanden: offen, heute })).toBeNull();
    expect(folgeAufgabeSchritt({ ausgabe: schluessel, alt: "FEHLT", neu: "AUSGEGEBEN", vorhanden: offen, heute })).toEqual({
      art: "LOESCHEN",
      id: "f-1",
    });
    expect(folgeAufgabeSchritt({ ausgabe: schluessel, alt: "FEHLT", neu: null, vorhanden: offen, heute })).toEqual({
      art: "LOESCHEN",
      id: "f-1",
    });
    expect(folgeAufgabeSchritt({ ausgabe: schluessel, alt: "FEHLT", neu: "BESCHAEDIGT", vorhanden: erledigt, heute })).toBeNull();
    expect(folgeAufgabeSchritt({ ausgabe: schluessel, alt: "FEHLT", neu: "ZURUECK", vorhanden: null, heute })).toBeNull();
  });

  it("kein Schluessel oder kein Wechsel: nichts – und nie ohne vorab gesperrten FACILITY-Link", () => {
    const laptop = { ...schluessel, rueckgabeKategorie: "IT_HARDWARE" };
    expect(folgeAufgabeSchritt({ ausgabe: laptop, alt: "AUSGEGEBEN", neu: "FEHLT", vorhanden: null, heute })).toBeNull();
    expect(folgeAufgabeSchritt({ ausgabe: schluessel, alt: "FEHLT", neu: "FEHLT", vorhanden: erledigt, heute })).toBeNull();
    expect(folgeAufgabeSchritt({ ausgabe: schluessel, alt: "AUSGEGEBEN", neu: "ZURUECK", vorhanden: null, heute })).toBeNull();
    const zustaende = [null, ...AUSGABE_ZUSTAENDE];
    for (const alt of zustaende) {
      for (const neu of zustaende) {
        for (const vorhanden of [null, offen, erledigt]) {
          const schritt = folgeAufgabeSchritt({ ausgabe: schluessel, alt, neu, vorhanden, heute });
          if (schritt !== null) expect(brauchtFolgeStelle(schluessel, alt, neu)).toBe(true);
        }
      }
    }
  });
});

// =============================================
// Zuordnung Austritt ↔ Einstellung (E-A31)
// =============================================

describe("namensSchluessel (E-A31, ohne Unschaerfe)", () => {
  it("„Müller“ in NFC und NFD ergibt denselben Schluessel", () => {
    const nfc = "Müller".normalize("NFC");
    const nfd = "Müller".normalize("NFD");
    expect(nfc).not.toBe(nfd);
    expect(namensSchluessel(nfd)).toBe(namensSchluessel(nfc));
    expect(namensSchluessel(nfc)).toBe("müller");
  });

  it("fuehrende, doppelte und folgende Leerraeume fallen zusammen", () => {
    expect(namensSchluessel("  Anna   Maria\tSchmidt ")).toBe("anna maria schmidt");
    expect(namensSchluessel(null)).toBe("");
  });

  it("„Mueller“ ist nicht „Müller“ (keine Unschaerfe)", () => {
    expect(namensSchluessel("Mueller")).not.toBe(namensSchluessel("Müller"));
  });
});

describe("zuordnungsVorschlaege (E-A31)", () => {
  const austritt = {
    employeeFirstName: "Anna",
    employeeLastName: "Schmidt",
    employeeEmail: "a.schmidt@fes-minden.de",
    employeePrivateEmail: "Anna.S@example.org ",
    organizationId: "org-gym",
    arbeitsortId: null,
  };
  const kandidat = (teil: Partial<EinstellungsKandidat> & { id: string }): EinstellungsKandidat => ({
    displayId: `2027-GYM-${teil.id}`,
    organizationId: "org-gs",
    email: "andere@example.org",
    firstName: "Berta",
    lastName: "Meier",
    personalData: null,
    supervisorData: { vertragsbeginn: utc("2027-02-01T00:00:00Z") },
    ...teil,
  });

  it("E-Mail privat gegen die Einladungsadresse ergibt STARK", () => {
    const [v] = zuordnungsVorschlaege(austritt, [kandidat({ id: "1", email: " anna.s@EXAMPLE.org" })]);
    expect(v).toMatchObject({ onboardingId: "1", stufe: "STARK", vertragsbeginn: "2027-02-01" });
    expect(v.gruende.map((g) => g.schluessel)).toEqual(["EMAIL"]);
    expect(v.gruende[0].text).toBe(VORSCHLAG_GRUENDE.EMAIL);
  });

  it("dienstliche Adresse gegen die private Adresse im Fragebogen ergibt ebenfalls STARK", () => {
    const [v] = zuordnungsVorschlaege(austritt, [
      kandidat({ id: "1", personalData: { emailPrivate: "a.schmidt@fes-minden.de" } }),
    ]);
    expect(v.stufe).toBe("STARK");
  });

  it("Vor- und Nachname mit gleicher Einrichtung ergibt MITTEL, der Geburtsname zaehlt mit", () => {
    const [name] = zuordnungsVorschlaege(austritt, [
      kandidat({ id: "1", firstName: "Anna", lastName: "Schmidt", organizationId: "org-gym" }),
    ]);
    expect(name.stufe).toBe("MITTEL");
    expect(name.gruende.map((g) => g.schluessel)).toEqual(["NAME", "EINRICHTUNG"]);

    const [geburt] = zuordnungsVorschlaege(austritt, [
      kandidat({
        id: "2",
        firstName: "Anna",
        lastName: "Wagner",
        organizationId: "org-gym",
        personalData: { birthName: "Schmidt" },
      }),
    ]);
    expect(geburt.stufe).toBe("MITTEL");
    expect(geburt.gruende.map((g) => g.schluessel)).toEqual(["NAME_GEBURTSNAME", "EINRICHTUNG"]);
  });

  it("gleicher Arbeitsort genuegt statt gleicher Einrichtung", () => {
    const [v] = zuordnungsVorschlaege({ ...austritt, organizationId: "org-foerderverein", arbeitsortId: "org-gs" }, [
      kandidat({ id: "1", firstName: "Anna", lastName: "Schmidt", organizationId: "org-x", arbeitsortId: "org-gs" }),
    ]);
    expect(v.stufe).toBe("MITTEL");
    expect(v.gruende.map((g) => g.schluessel)).toEqual(["NAME", "ARBEITSORT"]);
  });

  it("nur der Nachname: SCHWACH mit Einrichtung, ohne Einrichtung kein Vorschlag", () => {
    const [v] = zuordnungsVorschlaege(austritt, [kandidat({ id: "1", lastName: "Schmidt", organizationId: "org-gym" })]);
    expect(v.stufe).toBe("SCHWACH");
    expect(zuordnungsVorschlaege(austritt, [kandidat({ id: "2", lastName: "Schmidt" })])).toEqual([]);
    // Auch der volle Name ohne gemeinsame Einrichtung ist keiner.
    expect(zuordnungsVorschlaege(austritt, [kandidat({ id: "3", firstName: "Anna", lastName: "Schmidt" })])).toEqual([]);
    // Und die Einrichtung allein ebenso wenig.
    expect(zuordnungsVorschlaege(austritt, [kandidat({ id: "4", organizationId: "org-gym" })])).toEqual([]);
  });

  it("keine Adresse im Vorschlag", () => {
    const vorschlaege = zuordnungsVorschlaege(austritt, [
      kandidat({ id: "1", email: "anna.s@example.org", personalData: { emailPrivate: "privat@example.org" } }),
    ]);
    const text = JSON.stringify(vorschlaege);
    expect(text).not.toMatch(/@/);
    expect(Object.keys(vorschlaege[0]).sort()).toEqual(
      ["arbeitsortId", "displayId", "gruende", "name", "onboardingId", "organizationId", "stufe", "vertragsbeginn"].sort(),
    );
  });

  it("sortiert nach Stufe, dann Vertragsbeginn (neuester zuerst, ohne Datum zuletzt), hoechstens 10", () => {
    const vb = (tag: string | null) => ({ vertragsbeginn: tag ? utc(`${tag}T00:00:00Z`) : null });
    const liste = [
      kandidat({ id: "s1", lastName: "Schmidt", organizationId: "org-gym", supervisorData: vb("2027-09-01") }),
      kandidat({ id: "m1", firstName: "Anna", lastName: "Schmidt", organizationId: "org-gym", supervisorData: vb("2026-08-01") }),
      kandidat({ id: "m2", firstName: "Anna", lastName: "Schmidt", organizationId: "org-gym", supervisorData: vb(null) }),
      kandidat({ id: "m3", firstName: "Anna", lastName: "Schmidt", organizationId: "org-gym", supervisorData: vb("2027-08-01") }),
      kandidat({ id: "st", email: "a.schmidt@fes-minden.de", supervisorData: vb("2020-01-01") }),
    ];
    expect(zuordnungsVorschlaege(austritt, liste).map((v) => v.onboardingId)).toEqual(["st", "m3", "m1", "m2", "s1"]);

    const viele = Array.from({ length: 14 }, (_, i) => kandidat({ id: `k${String(i).padStart(2, "0")}`, lastName: "Schmidt", organizationId: "org-gym" }));
    expect(zuordnungsVorschlaege(austritt, viele)).toHaveLength(AUSGABE_GRENZEN.kandidaten);
  });

  it("der Name kommt vom Vorgang, sonst aus dem Fragebogen", () => {
    const [v] = zuordnungsVorschlaege(austritt, [
      kandidat({ id: "1", email: "anna.s@example.org", firstName: null, lastName: null, personalData: { firstName: "Anna", lastName: "Schmidt" } }),
    ]);
    expect(v.name).toBe("Anna Schmidt");
  });
});

// =============================================
// Rueckgabe-Vorschlag (E-A35, G13, G28)
// =============================================

describe("rueckgabeVorschlag (E-A35, G13)", () => {
  type A = VorschlagAusgabe;
  const ausgabe = (id: string, teil: Partial<A> = {}): A => ({
    id,
    zustand: "AUSGEGEBEN",
    beiAustritt: "RUECKGABE",
    organizationId: "org-gym",
    zentral: false,
    ...teil,
  });
  const basis = {
    austritt: { id: "off-1", organizationId: "org-gym", arbeitsortId: null },
    einstellung: { organizationId: "org-gym", arbeitsortId: null },
    weitereBeschaeftigung: false,
    bezuege: [] as AusgabeBezug[],
  };
  const ids = (liste: A[]) => liste.map((a) => a.id);

  it("Ausgaben der Einrichtung bzw. des Arbeitsorts des Austritts werden vorgeschlagen, andere nur Hinweis", () => {
    const r = rueckgabeVorschlag({
      ...basis,
      austritt: { id: "off-1", organizationId: "org-gym", arbeitsortId: "org-gs" },
      ausgaben: [ausgabe("eigen"), ausgabe("arbeitsort", { organizationId: "org-gs" }), ausgabe("fremd", { organizationId: "org-bk" })],
    });
    expect(ids(r.vorschlag)).toEqual(["eigen", "arbeitsort"]);
    expect(ids(r.hinweisAndereEinrichtung)).toEqual(["fremd"]);
  });

  it("Arbeitsort der Einstellung an ANDERER Einrichtung: nur Hinweis; gleiche Einrichtung (OGS): Vorschlag", () => {
    // Einstellung an X mit Arbeitsort Z, Austritt an Y: das Stueck gehoert Z.
    const anders = rueckgabeVorschlag({
      ...basis,
      austritt: { id: "off-1", organizationId: "org-y", arbeitsortId: null },
      einstellung: { organizationId: "org-x", arbeitsortId: "org-z" },
      ausgaben: [ausgabe("a", { organizationId: "org-z" })],
    });
    expect(ids(anders.vorschlag)).toEqual([]);
    expect(ids(anders.hinweisAndereEinrichtung)).toEqual(["a"]);
    // OGS-Kraft: Foerderverein (Einrichtung) mit Arbeitsort Grundschule, Austritt am Foerderverein.
    const ogs = rueckgabeVorschlag({
      ...basis,
      austritt: { id: "off-1", organizationId: "org-fv", arbeitsortId: null },
      einstellung: { organizationId: "org-fv", arbeitsortId: "org-gs" },
      ausgaben: [ausgabe("a", { organizationId: "org-gs" })],
    });
    expect(ids(ogs.vorschlag)).toEqual(["a"]);
  });

  it("zentrale Ausgaben ohne Einrichtungsfilter: ohne Merker Vorschlag, mit Merker Hinweis", () => {
    const zentral = ausgabe("z", { zentral: true, organizationId: "org-bk" });
    expect(ids(rueckgabeVorschlag({ ...basis, ausgaben: [zentral] }).vorschlag)).toEqual(["z"]);
    expect(ids(rueckgabeVorschlag({ ...basis, weitereBeschaeftigung: null, ausgaben: [zentral] }).vorschlag)).toEqual(["z"]);
    const mit = rueckgabeVorschlag({ ...basis, weitereBeschaeftigung: true, ausgaben: [zentral] });
    expect(ids(mit.vorschlag)).toEqual([]);
    expect(ids(mit.hinweisZentral)).toEqual(["z"]);
  });

  it("Bezuege nach G28: laufend gebunden, CANCELLED frei, COMPLETED mit VERBLEIBT frei, mit offenem AUSGEGEBEN gebunden", () => {
    const r = rueckgabeVorschlag({
      ...basis,
      ausgaben: [
        ausgabe("laufend"),
        ausgabe("abgebrochen"),
        ausgabe("verbleibt", { zustand: "VERBLEIBT" }),
        ausgabe("offen-geblieben"),
        ausgabe("eigener"),
      ],
      bezuege: [
        { ausgabeId: "laufend", offboardingId: "off-2", status: "HANDOVER_PHASE", displayId: "OFF-2027-GYM-0002" },
        { ausgabeId: "abgebrochen", offboardingId: "off-3", status: "CANCELLED" },
        { ausgabeId: "verbleibt", offboardingId: "off-4", status: "COMPLETED" },
        { ausgabeId: "offen-geblieben", offboardingId: "off-4", status: "COMPLETED", displayId: null },
        { ausgabeId: "eigener", offboardingId: "off-1", status: "INITIATED" },
      ],
    });
    expect(ids(r.vorschlag)).toEqual(["abgebrochen", "verbleibt", "eigener"]);
    expect(r.schonImAustritt).toEqual([
      { offboardingId: "off-2", displayId: "OFF-2027-GYM-0002", anzahl: 1 },
      { offboardingId: "off-4", displayId: null, anzahl: 1 },
    ]);
  });

  it("nur aktive Stuecke mit RUECKGABE oder SPERREN; VERBLEIBT eingeschlossen", () => {
    const r = rueckgabeVorschlag({
      ...basis,
      ausgaben: [
        ausgabe("verbleibt", { zustand: "VERBLEIBT" }),
        ausgabe("sperren", { beiAustritt: "SPERREN" }),
        ausgabe("zurueck", { zustand: "ZURUECK" }),
        ausgabe("ersetzt", { zustand: "ERSETZT" }),
        ausgabe("nichts", { beiAustritt: "NICHTS" }),
      ],
    });
    expect(ids(r.vorschlag)).toEqual(["verbleibt", "sperren"]);
    expect(r.hinweisAndereEinrichtung).toEqual([]);
  });
});

// =============================================
// Bestand der Einstellung (G13, G20, E-A36)
// =============================================

describe("ohneVermerk (G13, G20)", () => {
  const zeilen = [
    { id: "z-ipad", art: "JA_NEIN", beiAustritt: "RUECKGABE" },
    { id: "z-zugang", art: "AUSWAHL", beiAustritt: "SPERREN" },
    { id: "z-parkplatz", art: "JA_NEIN", beiAustritt: "NICHTS" },
    { id: "z-alt", art: "JA_NEIN", beiAustritt: null },
  ];
  const aufgabe = (id: string, ausstattungId: string | null, teil: Partial<BestandAufgabe> = {}): BestandAufgabe => ({
    id,
    title: `Aufgabe ${id}`,
    isCompleted: true,
    // 27.01.2027 23:30 UTC = 28.01.2027 00:30 Berlin
    completedAt: utc("2027-01-27T23:30:00Z"),
    entfaelltAm: null,
    ausgabenGeloeschtAm: null,
    ausstattungId,
    ...teil,
  });

  it("erledigt, mit RUECKGABE bzw. SPERREN und ohne Ausgabe: ja – mit dem Berliner Tag der Erledigung", () => {
    expect(ohneVermerk([aufgabe("t1", "z-ipad"), aufgabe("t2", "z-zugang")], zeilen, [])).toEqual([
      { checklistItemId: "t1", titel: "Aufgabe t1", erledigtAm: "2027-01-28" },
      { checklistItemId: "t2", titel: "Aufgabe t2", erledigtAm: "2027-01-28" },
    ]);
  });

  it("entfallen, offen, mit Ausgabe, ohne beiAustritt bzw. NICHTS, mit Loeschmerker: nein", () => {
    const aufgaben = [
      aufgabe("entfallen", "z-ipad", { entfaelltAm: utc("2027-01-20T10:00:00Z") }),
      aufgabe("offen", "z-ipad", { isCompleted: false, completedAt: null }),
      aufgabe("mit-ausgabe", "z-ipad"),
      aufgabe("nichts", "z-parkplatz"),
      aufgabe("alt", "z-alt"),
      aufgabe("ohne-zeile", null),
      aufgabe("geloescht", "z-ipad", { ausgabenGeloeschtAm: utc("2027-09-01T02:00:00Z") }),
    ];
    expect(ohneVermerk(aufgaben, zeilen, [{ checklistItemId: "mit-ausgabe" }, { checklistItemId: null }])).toEqual([]);
  });
});

describe("rueckgabeLage (E-A36)", () => {
  const basis = {
    einstellung: { id: "onb-1" },
    zeilen: [] as { art: string; beiAustritt?: string | null }[],
    ausgaben: [] as unknown[],
    ohneVermerk: [] as unknown[],
    ausgabenAngeboten: null as boolean | null,
    geloeschteAufgaben: 0,
  };

  it("alle sechs Lagen in der Pruefreihenfolge", () => {
    expect(rueckgabeLage({ ...basis, einstellung: null, ausgaben: [{}] })).toBe("KEINE_EINSTELLUNG");
    expect(rueckgabeLage({ ...basis, ausgaben: [{}], geloeschteAufgaben: 1, ohneVermerk: [{}] })).toBe("AUSGABEN");
    expect(rueckgabeLage({ ...basis, geloeschteAufgaben: 2, ohneVermerk: [{}] })).toBe("GELOESCHT");
    expect(rueckgabeLage({ ...basis, ohneVermerk: [{}] })).toBe("NICHTS_ERFASST");
    expect(rueckgabeLage({ ...basis, zeilen: [{ art: "JA_NEIN", beiAustritt: "SPERREN" }] })).toBe("NICHTS_AUSGEGEBEN");
    expect(rueckgabeLage(basis)).toBe("VOR_EINFUEHRUNG");
  });

  it("nach der Einfuehrung nichts gewaehlt (Merker true, keine Zeile mit RUECKGABE/SPERREN): NICHTS_AUSGEGEBEN", () => {
    expect(rueckgabeLage({ ...basis, ausgabenAngeboten: true })).toBe("NICHTS_AUSGEGEBEN");
  });

  it("nur NICHTS-Positionen gewaehlt: mit Merker true NICHTS_AUSGEGEBEN, mit false VOR_EINFUEHRUNG", () => {
    const zeilen = [{ art: "JA_NEIN", beiAustritt: "NICHTS" }];
    expect(rueckgabeLage({ ...basis, zeilen, ausgabenAngeboten: true })).toBe("NICHTS_AUSGEGEBEN");
    expect(rueckgabeLage({ ...basis, zeilen, ausgabenAngeboten: false })).toBe("VOR_EINFUEHRUNG");
  });

  it("Ehrenamt ohne Modalitaeten (Merker null, keine Zeilen): VOR_EINFUEHRUNG", () => {
    expect(rueckgabeLage({ ...basis, ausgabenAngeboten: null, zeilen: [] })).toBe("VOR_EINFUEHRUNG");
  });

  it("alle Ausgaben geloescht: GELOESCHT, nicht NICHTS_ERFASST", () => {
    // ohneVermerk laesst geloeschte Aufgaben ohnehin weg; selbst wenn noch eine
    // andere ohne Vermerk dasteht, gewinnt die Loeschung.
    expect(rueckgabeLage({ ...basis, geloeschteAufgaben: 1, ohneVermerk: [{}] })).toBe("GELOESCHT");
  });
});

describe("lageText / rueckgabenSchritt (E-A36)", () => {
  const stand: LageStand = { lage: "AUSGABEN", nr: "2027-GYM-007", gegenstaende: 4, zugaenge: 0, ohneVermerk: 0 };

  it("Text aus LAGE_TEXTE", () => {
    expect(lageText(stand)).toBe(LAGE_TEXTE.AUSGABEN(stand));
    expect(lageText({ ...stand, lage: "KEINE_EINSTELLUNG" })).toBe(LAGE_TEXTE.KEINE_EINSTELLUNG(stand));
  });

  it("erledigt, wenn nichts offen ist – als Zahl oder als Liste", () => {
    expect(rueckgabenSchritt(stand, 0)).toEqual({ erledigt: true, text: LAGE_TEXTE.AUSGABEN(stand) });
    expect(rueckgabenSchritt(stand, 2).erledigt).toBe(false);
    expect(rueckgabenSchritt(stand, [{ titel: "Laptop", stelle: "IT" }]).erledigt).toBe(false);
    expect(rueckgabenSchritt({ ...stand, lage: "VOR_EINFUEHRUNG" }, []).text).toContain("Einstellung 2027-GYM-007");
  });
});

// =============================================
// Abschluss: offene Rueckgaben (E-A33, G18)
// =============================================

describe("offeneRueckgaben (E-A33)", () => {
  const stellenNamen = { IT: "IT-Abteilung FES", FACILITY: "Hausmeister Gymnasium" };

  it("je Stueck einmal: offene Rueckgabe-Zeilen, offene Sperr- und Folgeaufgaben", () => {
    const offen = offeneRueckgaben({
      rueckgaben: [
        { id: "r-1", itemName: "Dienst-iPad (Lernmittel)", ausgabeId: "a-ipad", zustand: null, isReturned: false },
        { id: "r-2", itemName: "Schlüssel: Haupteingang", ausgabeId: "a-key", zustand: "FEHLT", isReturned: false },
        { id: "r-3", itemName: "Laptop", ausgabeId: "a-laptop", zustand: "ZURUECK", isReturned: true },
        { id: "r-4", itemName: "Parkausweis", ausgabeId: null, zustand: null, isReturned: false },
        { id: "r-5", itemName: "Alter Schlüssel", ausgabeId: null, zustand: null, isReturned: true },
      ],
      aufgaben: [
        { id: "t-1", title: "Dienst-iPad (Lernmittel) zurücknehmen", isCompleted: false, herkunft: "AUSGABE", ausgabeId: "a-ipad", assigneeDepartment: "IT" },
        { id: "t-2", title: "Schlüssel: Haupteingang zurücknehmen", isCompleted: true, herkunft: "AUSGABE", ausgabeId: "a-key", assigneeDepartment: "FACILITY" },
        { id: "t-3", title: "Schließung prüfen: Schlüssel: Haupteingang", isCompleted: false, herkunft: "AUSGABE_FEHLT", ausgabeId: "a-key", assigneeDepartment: "FACILITY" },
        { id: "t-4", title: "Zugänge: WebUntis sperren", isCompleted: false, herkunft: "AUSGABE", ausgabeId: "a-webuntis", assigneeDepartment: "IT" },
        { id: "t-5", title: "Zugänge: Schulportal sperren", isCompleted: true, herkunft: "AUSGABE", ausgabeId: "a-portal", assigneeDepartment: "IT" },
        { id: "t-6", title: "Laptop zurücknehmen", isCompleted: true, herkunft: "AUSGABE", ausgabeId: "a-laptop", assigneeDepartment: "IT" },
        { id: "t-7", title: "Vorlagenpunkt", isCompleted: false, herkunft: null, ausgabeId: null, assigneeDepartment: "IT" },
      ],
      stellenNamen,
    });
    expect(offen).toEqual([
      { titel: "Dienst-iPad (Lernmittel)", stelle: "IT-Abteilung FES" },
      { titel: "Parkausweis", stelle: "Personalabteilung" },
      { titel: "Schließung prüfen: Schlüssel: Haupteingang", stelle: "Hausmeister Gymnasium" },
      { titel: "Zugänge: WebUntis sperren", stelle: "IT-Abteilung FES" },
    ]);
  });

  it("dieselbe Ausgabe zaehlt nur einmal, auch wenn Zeile und Aufgabe offen sind", () => {
    const offen = offeneRueckgaben({
      rueckgaben: [{ id: "r-1", itemName: "Laptop", ausgabeId: "a-1", zustand: null, isReturned: false }],
      aufgaben: [
        { id: "t-1", title: "Laptop zurücknehmen", isCompleted: false, herkunft: "AUSGABE", ausgabeId: "a-1", assigneeDepartment: "IT" },
      ],
      stellenNamen: {},
    });
    expect(offen).toEqual([{ titel: "Laptop", stelle: "IT-Abteilung" }]);
  });
});

// =============================================
// Protokoll (G19)
// =============================================

describe("protokollStand / protokollText (G19)", () => {
  it("ohne Ausgaben mit RUECKGABE nicht noetig", () => {
    const stand = protokollStand({ ausgabenMitRueckgabe: 0, dokumente: [] });
    expect(stand).toEqual({ noetig: false, hochgeladenAm: null });
    expect(protokollText("UEBERGABE", stand)).toBeNull();
  });

  it("noetig ohne Dokument: „fehlt“", () => {
    const stand = protokollStand({ ausgabenMitRueckgabe: 2, dokumente: [] });
    expect(stand.noetig).toBe(true);
    expect(protokollText("UEBERGABE", stand)).toBe("Unterschriebenes Übergabeprotokoll: fehlt");
    expect(protokollText("RUECKGABE", stand)).toBe("Unterschriebenes Rückgabeprotokoll: fehlt");
  });

  it("das juengste Dokument zaehlt, Datum in Berliner Zeit", () => {
    const stand = protokollStand({
      ausgabenMitRueckgabe: 1,
      dokumente: [
        { uploadedAt: utc("2027-02-01T10:00:00Z") },
        { uploadedAt: "2027-03-31T22:30:00.000Z" }, // 01.04.2027 00:30 Berlin
        { uploadedAt: "kaputt" },
      ],
    });
    expect(stand.hochgeladenAm?.toISOString()).toBe("2027-03-31T22:30:00.000Z");
    expect(protokollText("UEBERGABE", stand)).toBe("Unterschriebenes Übergabeprotokoll: hochgeladen am 01.04.2027");
  });
});

// =============================================
// Mailfelder (G9, G10)
// =============================================

describe("ausgabeVermerkMailFelder (G9)", () => {
  it("je aktivem Stueck eine Zeile, maskiert und flach", () => {
    const felder = ausgabeVermerkMailFelder([
      { kennung: "FES-IPAD-0412", uebergebenAm: utc("2027-01-28T00:00:00Z"), zustand: "AUSGEGEBEN" },
      { kennung: null, uebergebenAm: "2027-01-29" },
      { kennung: "<b>X</b>", uebergebenAm: "2027-01-30", beiAustritt: "SPERREN" },
      { kennung: "ALT", uebergebenAm: "2027-01-01", zustand: "ERSETZT" },
    ]);
    expect(felder).toEqual({
      ausgabe_vermerk: "FES-IPAD-0412 · übergeben 28.01.2027\nübergeben 29.01.2027\n<b>X</b> · eingerichtet 30.01.2027",
      ausgabe_vermerk_html:
        "FES-IPAD-0412 · übergeben 28.01.2027<br>übergeben 29.01.2027<br>&lt;b&gt;X&lt;/b&gt; · eingerichtet 30.01.2027",
    });
    for (const wert of Object.values(felder)) expect(typeof wert).toBe("string");
  });

  it("ohne Stueck beide \"\" (der Block faellt weg)", () => {
    expect(ausgabeVermerkMailFelder([])).toEqual({ ausgabe_vermerk: "", ausgabe_vermerk_html: "" });
    expect(ausgabeVermerkMailFelder([{ kennung: "A", uebergebenAm: "2027-01-01", zustand: "ZURUECK" }])).toEqual({
      ausgabe_vermerk: "",
      ausgabe_vermerk_html: "",
    });
  });
});

describe("ausgabenListeMailFelder (G10)", () => {
  it("Bezeichnung, Kennung und Datum je aktivem Stueck; Merker als Zeichenkette", () => {
    const felder = ausgabenListeMailFelder([
      { bezeichnung: "Dienst-iPad (Lernmittel)", kennung: "FES-IPAD-0412", uebergebenAm: "2027-01-28", zustand: "AUSGEGEBEN" },
      { bezeichnung: "Schlüssel: Haupteingang", kennung: null, uebergebenAm: "2027-01-30", zustand: "VERBLEIBT" },
      { bezeichnung: "Laptop", kennung: "NB-1", uebergebenAm: "2027-01-02", zustand: "ZURUECK" },
      { bezeichnung: "Schlüssel: <Keller>", kennung: "K&1", uebergebenAm: "2027-01-31" },
    ]);
    expect(felder.ausgaben_liste).toBe(
      "Dienst-iPad (Lernmittel) · FES-IPAD-0412 · übergeben 28.01.2027\nSchlüssel: Haupteingang · übergeben 30.01.2027\nSchlüssel: <Keller> · K&1 · übergeben 31.01.2027",
    );
    expect(felder.ausgaben_liste_html).toBe(
      "Dienst-iPad (Lernmittel) · FES-IPAD-0412 · übergeben 28.01.2027<br>Schlüssel: Haupteingang · übergeben 30.01.2027<br>Schlüssel: &lt;Keller&gt; · K&amp;1 · übergeben 31.01.2027",
    );
    expect(felder.hat_ausgaben).toBe("ja");
  });

  it("ohne Ausgaben alles \"\"", () => {
    expect(ausgabenListeMailFelder([])).toEqual({ ausgaben_liste: "", ausgaben_liste_html: "", hat_ausgaben: "" });
  });
});

// =============================================
// Anzeige in Karte und Reiter (G7, G20)
// =============================================

describe("ausgabenZeile als Matrix (G7, G28)", () => {
  const stueck = (teil: Partial<AusgabeZeilenDaten> = {}): AusgabeZeilenDaten => ({
    id: "a-1",
    zustand: "AUSGEGEBEN",
    beiAustritt: "RUECKGABE",
    kennung: "FES-IPAD-0412",
    kennungLabel: "Inventarnummer",
    uebergebenAm: utc("2027-01-28T00:00:00Z"),
    quelle: "LINK",
    bezuege: [],
    ...teil,
  });
  const HR = { darfBearbeiten: true };
  const ALLE = { korrigieren: true, tauschen: true, zurueckgenommen: true, entfernen: true };
  const KEINE = { korrigieren: false, tauschen: false, zurueckgenommen: false, entfernen: false };

  it("AUSGEGEBEN ohne Bezug: alle Aktionen, Text mit Datum, Kennung und Quelle", () => {
    expect(ausgabenZeile(stueck(), HR)).toEqual({
      id: "a-1",
      zustand: "AUSGEGEBEN",
      zustandLabel: "ausgegeben",
      aktiv: true,
      kennung: "FES-IPAD-0412",
      kennungLabel: "Inventarnummer",
      uebergebenAm: "2027-01-28",
      quelle: "LINK",
      text: "übergeben 28.01.2027 · FES-IPAD-0412 · über den Link",
      gebunden: false,
      aktionen: ALLE,
      sperrGrund: null,
    });
  });

  it("gebunden im Austritt: keine Aktion, Sperrgrund mit bzw. ohne Vorgangsnummer", () => {
    const mitNr = ausgabenZeile(stueck({ bezuege: [{ offboardingId: "off-1", status: "NOTICE_PERIOD", displayId: "OFF-2027-GYM-0003" }] }), HR);
    expect(mitNr.aktionen).toEqual(KEINE);
    expect(mitNr.gebunden).toBe(true);
    expect(mitNr.sperrGrund).toBe(MELDUNGEN_AUSGABEN.AUSGABE_IM_AUSTRITT("OFF-2027-GYM-0003"));
    const ohneNr = ausgabenZeile(stueck({ bezuege: [{ offboardingId: "off-1", status: "COMPLETED", displayId: null }] }), HR);
    expect(ohneNr.aktionen).toEqual(KEINE);
    expect(ohneNr.sperrGrund).toBe(MELDUNGEN_AUSGABEN.AUSGABE_IM_AUSTRITT(null));
    expect(ohneNr.sperrGrund).not.toMatch(/OFF-/);
    // Nur ein abgebrochener Austritt: frei.
    expect(ausgabenZeile(stueck({ bezuege: [{ offboardingId: "off-2", status: "CANCELLED" }] }), HR).aktionen).toEqual(ALLE);
  });

  it("VERBLEIBT, freigegeben durch einen abgeschlossenen Austritt: korrigieren, tauschen, zuruecknehmen – nicht entfernen", () => {
    const z = ausgabenZeile(stueck({ zustand: "VERBLEIBT", bezuege: [{ offboardingId: "off-1", status: "COMPLETED" }] }), HR);
    expect(z.aktionen).toEqual({ korrigieren: true, tauschen: true, zurueckgenommen: true, entfernen: false });
    expect(z.sperrGrund).toBeNull();
    expect(z.text).toBe("übergeben 28.01.2027 · FES-IPAD-0412 · über den Link · verbleibt");
  });

  it("ERSETZT und die anderen Endzustaende: keine Aktion, kein Sperrgrund, Zustand im Text", () => {
    const z = ausgabenZeile(stueck({ zustand: "ERSETZT" }), HR);
    expect(z.aktionen).toEqual(KEINE);
    expect(z.sperrGrund).toBeNull();
    expect(z.aktiv).toBe(false);
    expect(z.text.endsWith("· ersetzt")).toBe(true);
    for (const zustand of ["ZURUECK", "BESCHAEDIGT", "FEHLT", "ENTFAELLT"]) {
      expect(ausgabenZeile(stueck({ zustand }), HR).aktionen).toEqual(KEINE);
    }
  });

  it("Quelle LINK bzw. HR; Zugang „eingerichtet“ und „gesperrt“; ohne Kennung und Beschriftung", () => {
    expect(ausgabenZeile(stueck({ quelle: "HR", kennung: null, kennungLabel: null }), HR)).toMatchObject({
      text: "übergeben 28.01.2027 · von HR vermerkt",
      kennung: null,
      kennungLabel: KENNUNG_LABEL_STANDARD,
    });
    expect(AUSGABE_QUELLE_TEXTE).toEqual({ LINK: "über den Link", HR: "von HR vermerkt" });
    expect(ausgabenZeile(stueck({ beiAustritt: "SPERREN", kennung: null }), HR).text).toBe(
      "eingerichtet 28.01.2027 · über den Link",
    );
    expect(ausgabenZeile(stueck({ beiAustritt: "SPERREN", zustand: "ZURUECK" }), HR).zustandLabel).toBe("gesperrt");
  });

  it("ohne Recht: keine Aktion und kein Sperrgrund, die Anzeige bleibt", () => {
    const mitRecht = ausgabenZeile(stueck(), HR);
    const ohne = ausgabenZeile(stueck(), { darfBearbeiten: false });
    expect(ohne.aktionen).toEqual(KEINE);
    expect(ohne.sperrGrund).toBeNull();
    expect(ohne.text).toBe(mitRecht.text);
    expect(
      ausgabenZeile(stueck({ bezuege: [{ offboardingId: "off-1", status: "INITIATED" }] }), { darfBearbeiten: false }).sperrGrund,
    ).toBeNull();
  });

  it("im eigenen Austritt (Reiter „Rückgaben“) sperrt die eigene Bindung nicht – angeboten wird nur „korrigieren“", () => {
    const reiter = { darfBearbeiten: true, austrittId: "off-1" };
    const z = ausgabenZeile(stueck({ bezuege: [{ offboardingId: "off-1", status: "INITIATED" }] }), reiter);
    expect(z.gebunden).toBe(false);
    expect(z.sperrGrund).toBeNull();
    // Tauschen, Zuruecknehmen und Entfernen gibt es nur ohne Austrittsbezug (1.2, G7) –
    // die Onboarding-Route antwortete 409 AUSGABE_IM_AUSTRITT, weil eben dieser Austritt bindet.
    expect(z.aktionen).toEqual({ ...KEINE, korrigieren: true });
    // Auch im abgeschlossenen eigenen Austritt (spaete Rueckgabe, G28) und bei VERBLEIBT.
    expect(ausgabenZeile(stueck({ bezuege: [{ offboardingId: "off-1", status: "COMPLETED" }] }), reiter).aktionen).toEqual({
      ...KEINE,
      korrigieren: true,
    });
    expect(
      ausgabenZeile(stueck({ zustand: "VERBLEIBT", bezuege: [{ offboardingId: "off-1", status: "INITIATED" }] }), reiter)
        .aktionen,
    ).toEqual({ ...KEINE, korrigieren: true });
    // Ein Zugang (SPERREN) hat keine Rueckgabe-Zeile, ueber die der Reiter die Kennung korrigiert.
    expect(
      ausgabenZeile(stueck({ beiAustritt: "SPERREN", bezuege: [{ offboardingId: "off-1", status: "INITIATED" }] }), reiter)
        .aktionen,
    ).toEqual(KEINE);
    // Ohne Recht weiter nichts.
    expect(
      ausgabenZeile(stueck({ bezuege: [{ offboardingId: "off-1", status: "INITIATED" }] }), { ...reiter, darfBearbeiten: false })
        .aktionen,
    ).toEqual(KEINE);
  });

  it("im Reiter: bindet ein ANDERER Austritt das Stueck, gilt dessen Sperrgrund – auch neben einem eigenen Bezug", () => {
    const reiter = { darfBearbeiten: true, austrittId: "off-2" };
    const anderer = ausgabenZeile(
      stueck({
        zustand: "VERBLEIBT",
        bezuege: [
          { offboardingId: "off-2", status: "COMPLETED" },
          { offboardingId: "off-3", status: "INITIATED", displayId: "OFF-2028-GYM-0001" },
        ],
      }),
      reiter,
    );
    expect(anderer.aktionen).toEqual(KEINE);
    expect(anderer.gebunden).toBe(true);
    expect(anderer.sperrGrund).toBe(MELDUNGEN_AUSGABEN.AUSGABE_IM_AUSTRITT("OFF-2028-GYM-0001"));
  });

  it("ausgabeZustandLabel: Woerter aus AUSGABE_ZUSTAND_LABELS, ZURUECK bei SPERREN „gesperrt“", () => {
    for (const zustand of AUSGABE_ZUSTAENDE) expect(ausgabeZustandLabel(zustand)).toBe(AUSGABE_ZUSTAND_LABELS[zustand]);
    expect(ausgabeZustandLabel("ZURUECK", "SPERREN")).toBe(AUSGABE_GESPERRT_LABEL);
    expect(ausgabeZustandLabel("FEHLT", "SPERREN")).toBe("fehlt");
  });
});

describe("ausgabenJeAufgabe (G7, G20)", () => {
  const ctx = { ausgabeMoeglich: true, darfBearbeiten: true };

  it("erledigt ohne jede Ausgabe: gelb „Übergabe nicht vermerkt“", () => {
    expect(ausgabenJeAufgabe({ isCompleted: true }, [], ctx)).toEqual({
      hinweis: { text: "Übergabe nicht vermerkt", ton: "gelb" },
      vermerken: true,
    });
  });

  it("offen, entfallen oder mit Ausgabe: keine gelbe Aufforderung", () => {
    expect(ausgabenJeAufgabe({ isCompleted: false }, [], ctx).hinweis).toBeNull();
    expect(ausgabenJeAufgabe({ isCompleted: true, entfaelltAm: utc("2027-01-20T10:00:00Z") }, [], ctx)).toEqual({
      hinweis: null,
      vermerken: false,
    });
    expect(ausgabenJeAufgabe({ isCompleted: true }, [{ zustand: "AUSGEGEBEN" }], ctx).hinweis).toBeNull();
    // Zurueckgenommen: vermerkt war es – keine Aufforderung.
    expect(ausgabenJeAufgabe({ isCompleted: true }, [{ zustand: "ZURUECK" }], ctx).hinweis).toBeNull();
  });

  it("Aufgabe mit geloeschten Ausgaben: grauer Satz statt gelber Aufforderung, „Vermerken“ bleibt", () => {
    expect(ausgabenJeAufgabe({ isCompleted: true, ausgabenGeloeschtAm: utc("2027-09-01T02:00:00Z") }, [], ctx)).toEqual({
      hinweis: { text: MELDUNGEN_AUSGABEN.AUSGABEN_GELOESCHT, ton: "grau" },
      vermerken: true,
    });
  });

  it("ohne Recht kein „Vermerken“, ohne Ausgabe-Moeglichkeit gar nichts; Grenze aktiver Stuecke", () => {
    expect(ausgabenJeAufgabe({ isCompleted: true }, [], { ...ctx, darfBearbeiten: false })).toEqual({
      hinweis: { text: "Übergabe nicht vermerkt", ton: "gelb" },
      vermerken: false,
    });
    expect(ausgabenJeAufgabe({ isCompleted: true }, [], { ...ctx, ausgabeMoeglich: false })).toEqual({
      hinweis: null,
      vermerken: false,
    });
    const voll = Array.from({ length: AUSGABE_GRENZEN.aktiveJeAufgabe }, () => ({ zustand: "AUSGEGEBEN" }));
    expect(ausgabenJeAufgabe({ isCompleted: true }, voll, ctx).vermerken).toBe(false);
  });
});

// =============================================
// Word-Listen (G19, 1.9)
// =============================================

describe("protokollStellen (G19)", () => {
  const namen = { IT: "IT-Abteilung FES", FACILITY: "Hausmeister" };

  it("UEBERGABE: je Stelle eine Gruppe in der Reihenfolge der Abteilungskarte, nur aktive Stuecke", () => {
    const gruppen = protokollStellen(
      [
        { departmentKey: "FACILITY", bezeichnung: "Schlüssel: Sporthalle", kennung: "GS-201", am: "2027-01-30", zustand: "AUSGEGEBEN" },
        { departmentKey: "IT", bezeichnung: "Dienst-iPad (Lernmittel)", kennung: "FES-IPAD-0412", am: utc("2027-01-28T00:00:00Z"), zustand: "VERBLEIBT" },
        { departmentKey: "FACILITY", bezeichnung: "Schlüssel: Haupteingang", kennung: null, am: "2027-01-30", zustand: "AUSGEGEBEN" },
        { departmentKey: "IT", bezeichnung: "Laptop", kennung: "NB-1", am: "2027-01-02", zustand: "ERSETZT" },
        { departmentKey: "HR", bezeichnung: "Dienstausweis", kennung: "A-7", am: "2027-01-31", zustand: "AUSGEGEBEN" },
      ],
      namen,
      "UEBERGABE",
    );
    expect(gruppen).toEqual([
      {
        ausgabe_stelle: "IT-Abteilung FES",
        gegenstaende: [
          { ausgabe_gegenstand: "Dienst-iPad (Lernmittel)", ausgabe_kennung: "FES-IPAD-0412", ausgabe_uebergeben_am: "28.01.2027" },
        ],
      },
      {
        ausgabe_stelle: "Hausmeister",
        gegenstaende: [
          { ausgabe_gegenstand: "Schlüssel: Haupteingang", ausgabe_kennung: "", ausgabe_uebergeben_am: "30.01.2027" },
          { ausgabe_gegenstand: "Schlüssel: Sporthalle", ausgabe_kennung: "GS-201", ausgabe_uebergeben_am: "30.01.2027" },
        ],
      },
      {
        ausgabe_stelle: "Personalabteilung",
        gegenstaende: [{ ausgabe_gegenstand: "Dienstausweis", ausgabe_kennung: "A-7", ausgabe_uebergeben_am: "31.01.2027" }],
      },
    ]);
  });

  it("RUECKGABE: von HR erfasste Zeilen unter der Personalabteilung, offene mit leerem Zustand", () => {
    const gruppen = protokollStellen(
      [
        { departmentKey: null, bezeichnung: "Parkausweis", kennung: null, am: null, zustand: null, isReturned: false },
        { departmentKey: "IT", bezeichnung: "Laptop", kennung: "NB-1", am: utc("2027-07-31T23:30:00Z"), zustand: "BESCHAEDIGT", isReturned: true },
        { departmentKey: "IT", bezeichnung: "iPad", kennung: "I-1", am: null, zustand: "FEHLT", isReturned: false },
        { departmentKey: null, bezeichnung: "Alter Schlüssel", kennung: "S-1", am: utc("2027-07-01T08:00:00Z"), zustand: null, isReturned: true },
      ],
      {},
      "RUECKGABE",
    );
    expect(gruppen).toEqual([
      {
        rueckgabe_stelle: "IT-Abteilung",
        gegenstaende: [
          { rueckgabe_gegenstand: "iPad", rueckgabe_kennung: "I-1", rueckgabe_zustand: "fehlt", rueckgabe_am: "" },
          { rueckgabe_gegenstand: "Laptop", rueckgabe_kennung: "NB-1", rueckgabe_zustand: "beschädigt zurück", rueckgabe_am: "01.08.2027" },
        ],
      },
      {
        rueckgabe_stelle: "Personalabteilung",
        gegenstaende: [
          { rueckgabe_gegenstand: "Alter Schlüssel", rueckgabe_kennung: "S-1", rueckgabe_zustand: "zurück", rueckgabe_am: "01.07.2027" },
          { rueckgabe_gegenstand: "Parkausweis", rueckgabe_kennung: "", rueckgabe_zustand: "", rueckgabe_am: "" },
        ],
      },
    ]);
  });

  it("jedes innere Feld ist gesetzt (nie undefined), leere Liste ergibt keine Gruppe", () => {
    const [g] = protokollStellen([{ departmentKey: "IT", bezeichnung: "X" }], {}, "UEBERGABE");
    for (const wert of Object.values(g.gegenstaende[0])) expect(typeof wert).toBe("string");
    expect(protokollStellen([], {}, "RUECKGABE")).toEqual([]);
  });
});

// =============================================
// Zod (src/lib/validations/ausgaben.ts, offboarding.ts)
// =============================================

function zodFehler(ergebnis: { success: boolean; error?: { errors: { message: string }[] } }): string | undefined {
  return ergebnis.success ? undefined : ergebnis.error?.errors[0]?.message;
}

describe("kennungSchema (G4, G15)", () => {
  it("getrimmt, \\r\\n normalisiert, leer = null", () => {
    expect(kennungSchema.parse("  FES-IPAD-0412 \r\n")).toBe("FES-IPAD-0412");
    expect(kennungSchema.parse("   ")).toBeNull();
    expect(kennungSchema.parse("")).toBeNull();
    expect(kennungSchema.parse(null)).toBeNull();
  });

  it("spitze Klammern, Steuerzeichen und Zeilenumbrueche ergeben 400", () => {
    expect(zodFehler(kennungSchema.safeParse("<script>"))).toBe(MELDUNGEN_AUSGABEN.KENNUNG_UNGUELTIG);
    expect(zodFehler(kennungSchema.safeParse("A\u0007B"))).toBe(MELDUNGEN_AUSGABEN.KENNUNG_UNGUELTIG);
    expect(zodFehler(kennungSchema.safeParse("A\r\nB"))).toBe(MELDUNGEN_AUSGABEN.KENNUNG_UNGUELTIG);
    expect(zodFehler(kennungSchema.safeParse(42))).toBe(MELDUNGEN_AUSGABEN.KENNUNG_UNGUELTIG);
  });

  it("hoechstens 60 Zeichen", () => {
    expect(kennungSchema.parse("K".repeat(60))).toHaveLength(60);
    expect(zodFehler(kennungSchema.safeParse("K".repeat(61)))).toBe(MELDUNGEN_AUSGABEN.KENNUNG_ZU_LANG);
  });
});

describe("vermerkSchema (G6)", () => {
  it("1 bis 10 Stueck, Kennung und Datum optional", () => {
    expect(vermerkSchema.parse({ stuecke: [{}] })).toEqual({ stuecke: [{}] });
    expect(vermerkSchema.parse({ stuecke: [{ kennung: " A-1 ", uebergebenAm: "2027-01-28", fremd: 1 }] })).toEqual({
      stuecke: [{ kennung: "A-1", uebergebenAm: "2027-01-28" }],
    });
    expect(vermerkSchema.parse({ stuecke: [{ kennung: "", uebergebenAm: "" }] })).toEqual({
      stuecke: [{ kennung: null, uebergebenAm: undefined }],
    });
    expect(zodFehler(vermerkSchema.safeParse({ stuecke: [] }))).toBe(MELDUNGEN_AUSGABEN.KEIN_STUECK);
    expect(zodFehler(vermerkSchema.safeParse({}))).toBe(MELDUNGEN_AUSGABEN.KEIN_STUECK);
    expect(zodFehler(vermerkSchema.safeParse({ stuecke: Array.from({ length: 11 }, () => ({})) }))).toBe(
      MELDUNGEN_AUSGABEN.ZU_VIELE_STUECKE,
    );
    expect(zodFehler(vermerkSchema.safeParse(undefined))).toBe("Ungültige Eingabe");
  });

  it("Datum mit Rueckprobe: 31.02. ergibt 400", () => {
    expect(zodFehler(vermerkSchema.safeParse({ stuecke: [{ uebergebenAm: "2027-02-31" }] }))).toBe(
      MELDUNGEN_AUSGABEN.DATUM_UNGUELTIG,
    );
    expect(zodFehler(vermerkSchema.safeParse({ stuecke: [{ uebergebenAm: "28.01.2027" }] }))).toBe(
      MELDUNGEN_AUSGABEN.DATUM_UNGUELTIG,
    );
  });
});

describe("ausgabenAktionSchema (G7)", () => {
  it("die fuenf Aktionen", () => {
    expect(ausgabenAktionSchema.parse({ aktion: "vermerken", checklistItemId: "t-1", stuecke: [{ kennung: "A" }] })).toEqual({
      aktion: "vermerken",
      checklistItemId: "t-1",
      stuecke: [{ kennung: "A" }],
    });
    expect(ausgabenAktionSchema.parse({ aktion: "korrigieren", ausgabeId: "a-1", kennung: "" })).toEqual({
      aktion: "korrigieren",
      ausgabeId: "a-1",
      kennung: null,
    });
    expect(ausgabenAktionSchema.parse({ aktion: "tauschen", ausgabeId: "a-1", grund: "VERLOREN" })).toEqual({
      aktion: "tauschen",
      ausgabeId: "a-1",
      grund: "VERLOREN",
      neu: {},
    });
    expect(
      ausgabenAktionSchema.parse({ aktion: "zurueckgenommen", ausgabeId: "a-1", zustand: "FEHLT" }),
    ).toMatchObject({ zustand: "FEHLT" });
    expect(ausgabenAktionSchema.parse({ aktion: "entfernen", ausgabeId: "a-1" })).toEqual({
      aktion: "entfernen",
      ausgabeId: "a-1",
    });
  });

  it("tauschen ohne bzw. mit falschem Grund ergibt 400", () => {
    expect(zodFehler(ausgabenAktionSchema.safeParse({ aktion: "tauschen", ausgabeId: "a-1", neu: { kennung: "B" } }))).toBe(
      MELDUNGEN_AUSGABEN.TAUSCH_GRUND_FEHLT,
    );
    expect(zodFehler(ausgabenAktionSchema.safeParse({ aktion: "tauschen", ausgabeId: "a-1", grund: "KAPUTT" }))).toBe(
      MELDUNGEN_AUSGABEN.TAUSCH_GRUND_FEHLT,
    );
  });

  it("korrigieren braucht Kennung oder Datum; zurueckgenommen kennt kein VERBLEIBT", () => {
    expect(zodFehler(ausgabenAktionSchema.safeParse({ aktion: "korrigieren", ausgabeId: "a-1" }))).toBe(
      MELDUNGEN_AUSGABEN.KORREKTUR_LEER,
    );
    expect(
      zodFehler(ausgabenAktionSchema.safeParse({ aktion: "zurueckgenommen", ausgabeId: "a-1", zustand: "VERBLEIBT" })),
    ).toBe(MELDUNGEN_AUSGABEN.ZUSTAND_UNBEKANNT);
  });

  it("unbekannte Aktion, fehlende ID, kein Objekt", () => {
    expect(zodFehler(ausgabenAktionSchema.safeParse({ aktion: "loeschen" }))).toBe("Unbekannte Aktion.");
    expect(zodFehler(ausgabenAktionSchema.safeParse({ aktion: "entfernen" }))).toBe(MELDUNGEN_AUSGABEN.AUSGABE_ID_UNGUELTIG);
    expect(zodFehler(ausgabenAktionSchema.safeParse([]))).toBe("Ungültige Eingabe");
  });
});

describe("einstellungAktionSchema / einstellungSucheSchema (G11 bis G14)", () => {
  it("zuordnen mit und ohne Merker und Auswahl", () => {
    expect(einstellungAktionSchema.parse({ aktion: "zuordnen", onboardingId: "onb-1" })).toEqual({
      aktion: "zuordnen",
      onboardingId: "onb-1",
    });
    expect(
      einstellungAktionSchema.parse({
        aktion: "zuordnen",
        onboardingId: "onb-1",
        weitereBeschaeftigung: true,
        uebernehmen: ["a-1", "a-1", "a-2"],
      }),
    ).toEqual({ aktion: "zuordnen", onboardingId: "onb-1", weitereBeschaeftigung: true, uebernehmen: ["a-1", "a-2"] });
    expect(zodFehler(einstellungAktionSchema.safeParse({ aktion: "zuordnen" }))).toBe(
      MELDUNGEN_AUSGABEN.EINSTELLUNG_ID_UNGUELTIG,
    );
  });

  it("aktualisieren nimmt weitereBeschaeftigung optional", () => {
    expect(einstellungAktionSchema.parse({ aktion: "aktualisieren" })).toEqual({ aktion: "aktualisieren" });
    expect(einstellungAktionSchema.parse({ aktion: "aktualisieren", weitereBeschaeftigung: false })).toEqual({
      aktion: "aktualisieren",
      weitereBeschaeftigung: false,
    });
    expect(einstellungAktionSchema.safeParse({ aktion: "aktualisieren", weitereBeschaeftigung: "ja" }).success).toBe(false);
  });

  it("loesen ohne Felder, ohne-vermerk mit 1 bis 50 Aufgaben", () => {
    expect(einstellungAktionSchema.parse({ aktion: "loesen", onboardingId: "x" })).toEqual({ aktion: "loesen" });
    expect(einstellungAktionSchema.parse({ aktion: "ohne-vermerk", checklistItemIds: ["t-1"] })).toEqual({
      aktion: "ohne-vermerk",
      checklistItemIds: ["t-1"],
    });
    expect(zodFehler(einstellungAktionSchema.safeParse({ aktion: "ohne-vermerk", checklistItemIds: [] }))).toBe(
      MELDUNGEN_AUSGABEN.AUFGABEN_AUSWAHL,
    );
    const viele = Array.from({ length: 51 }, (_, i) => `t-${i}`);
    expect(zodFehler(einstellungAktionSchema.safeParse({ aktion: "ohne-vermerk", checklistItemIds: viele }))).toBe(
      MELDUNGEN_AUSGABEN.AUFGABEN_AUSWAHL,
    );
    expect(zodFehler(einstellungAktionSchema.safeParse({ aktion: "trennen" }))).toBe("Unbekannte Aktion.");
  });

  it("Suche 3 bis 60 Zeichen, leer = keine Suche", () => {
    expect(einstellungSucheSchema.parse({ q: " Sch " })).toEqual({ q: "Sch" });
    expect(einstellungSucheSchema.parse({ q: "" })).toEqual({});
    expect(einstellungSucheSchema.parse({ vorschau: "onb-1" })).toEqual({ vorschau: "onb-1" });
    expect(zodFehler(einstellungSucheSchema.safeParse({ q: "Sc" }))).toBe("Mindestens 3 Zeichen");
    expect(zodFehler(einstellungSucheSchema.safeParse({ q: "S".repeat(61) }))).toBe(MELDUNGEN_AUSGABEN.SUCHE_ZU_LANG);
  });
});

describe("Offboarding-Schemata (G15, G16, G18)", () => {
  it("rueckgabeAendernSchema: zustand (auch null = offen), Altbody isReturned, nie beides", () => {
    expect(rueckgabeAendernSchema.parse({ itemId: "r-1", zustand: "FEHLT" })).toMatchObject({ zustand: "FEHLT" });
    expect(rueckgabeAendernSchema.parse({ itemId: "r-1", zustand: null })).toMatchObject({ zustand: null });
    expect(rueckgabeAendernSchema.parse({ itemId: "r-1", isReturned: true })).toMatchObject({ isReturned: true });
    expect(zodFehler(rueckgabeAendernSchema.safeParse({ itemId: "r-1", isReturned: true, zustand: "ZURUECK" }))).toBe(
      MELDUNGEN_AUSGABEN.ZUSTAND_UND_RUECKGABE,
    );
    expect(zodFehler(rueckgabeAendernSchema.safeParse({ itemId: "r-1", zustand: "WEG" }))).toBe(
      MELDUNGEN_AUSGABEN.ZUSTAND_UNBEKANNT,
    );
    // Die 100 Zeichen der Seriennummer bleiben fuer von HR erfasste Zeilen.
    expect(rueckgabeAendernSchema.safeParse({ itemId: "r-1", serialNumber: "S".repeat(100) }).success).toBe(true);
  });

  it("updateOffboardingSchema: bestaetigt als Wahrheitswert", () => {
    expect(updateOffboardingSchema.parse({ status: "COMPLETED", bestaetigt: true })).toEqual({
      status: "COMPLETED",
      bestaetigt: true,
    });
    expect(updateOffboardingSchema.safeParse({ status: "COMPLETED", bestaetigt: "ja" }).success).toBe(false);
  });

  it("updateOffboardingSchema: `bestaetigt` allein ist keine Aenderung (400 wie vor A4)", () => {
    for (const bestaetigt of [true, false]) {
      expect(zodFehler(updateOffboardingSchema.safeParse({ bestaetigt }))).toBe("Mindestens ein Feld erforderlich");
    }
    expect(zodFehler(updateOffboardingSchema.safeParse({}))).toBe("Mindestens ein Feld erforderlich");
    expect(updateOffboardingSchema.safeParse({ exitReason: "Umzug", bestaetigt: true }).success).toBe(true);
  });
});
