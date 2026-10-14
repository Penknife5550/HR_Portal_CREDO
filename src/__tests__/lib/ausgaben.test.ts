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
 * S24: das Ziel eines Vermerks (`vermerkZielGrund`, `ausgabeBasis`,
 * `vermerkStuecke`), der Tausch (`tauschZustand`, `ersatzBasis`), die Anzeige
 * der Karte je Aufgabe (`ausgabenAnzeigeBauen`), die Protokollzeile
 * (`protokollAnzeige`, `ausgabenMitRueckgabe`) und die Meldungen der Karte.
 * S25: das Feld `ausgabe` der Link-Seite (`linkAusgabeBauen`) und die Zeile
 * eines Stuecks dort (`linkStueckText`).
 * S28: Zuordnung Austritt ↔ Einstellung – Anzeige und Suche, Hinweis vor dem
 * Informieren, Vorbelegung des Merkers, Arbeitsort am Austritt (G12) und die
 * Kopfzeile des Reiters aus dem Bestand (`rueckgabeLageAnzeige`).
 * S29: Uebernahme in den Austritt (`rueckgabeEntwurf`, `uebernahmePlan`), die
 * Anzeige von Vorschlag, Sperraufgaben und Tabelle im Reiter
 * (`ausgabeKurz`, `rueckgabeVorschlagAnzeige`, `sperraufgabenZeilen`,
 * `rueckgabeZeilenBauen`), „Lösen …“ (`loesenGesperrt`, `loesenStand`), die
 * neuen Meldungen und der Merker in der Query der Vorschau.
 * S30: Zielzustand eines Hakens bzw. einer Wahl (`rueckgabeZiel`,
 * `rueckgabeZielAusEingabe`, `zustandFehler`), der Plan des Gleichlaufs
 * (`ausgabeNachZiel`, `gleichlaufPlan`), die Bindung aus Sicht des Austritts
 * (`gleichlaufGesperrt`) und das Feld `ausgabe` der Offboarding-Link-Seite
 * (`offboardingLinkAusgabeBauen`, `RUECKNAHME_AUSWAHL`).
 * S33: die Brief-Platzhalter der Resolver (`ausgabenPlatzhalter`,
 * `rueckgabenJeStelle`); Vorlagen und Rendern in system-vorlagen.test.ts.
 * S34: Grenzen und Texte des Hochladens des unterschriebenen
 * Uebergabeprotokolls (`protokollDateiGrund`, `PROTOKOLL_UPLOAD_MELDUNGEN`);
 * die Route in onboarding-dokument-upload.test.ts.
 * S35: die Regeln des Loeschlaufs (`ausgabeFaellig`, `ohneFristGrenze`,
 * `loeschMengeFestlegen`, `ausgabenGeloeschtDetails`); der Lauf selbst in
 * ausgaben-lauf.test.ts.
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
  EINSTELLUNG_OHNE_NUMMER,
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
  RUECKNAHME_AUSWAHL,
  RUECKNAHME_TEXTE,
  TAUSCH_GRUENDE,
  VORSCHLAG_GRUENDE,
  absageFrist,
  abschlussFrist,
  arbeitsortBeiZuordnung,
  arbeitsortText,
  austrittLaeuft,
  ausgabeBasis,
  ausgabeBezeichnung,
  ausgabeKalendertag,
  ausgabeKurz,
  ausgabeLoeschenAb,
  ausgabeMoeglich,
  ausgabeNachZiel,
  ausgabeVermerkMailFelder,
  ausgabeZustandDaten,
  ausgabeZustandLabel,
  ausgabenAngeboten,
  ausgabenAnzeigeBauen,
  ausgabenJeAufgabe,
  ausgabenListeMailFelder,
  ausgabenMitRueckgabe,
  ausgabenPlatzhalter,
  ausgabenZeile,
  abgeloesteAustritte,
  bezugBindet,
  bindenderAustritt,
  bindetAusgabe,
  brauchtFolgeStelle,
  einstellungAnzeige,
  einstellungsTreffer,
  ersatzBasis,
  folgeAufgabe,
  folgeAufgabeNoetig,
  folgeAufgabeSchritt,
  gleichlaufGesperrt,
  gleichlaufPlan,
  gleichlaufSperreText,
  informierteStellen,
  lageText,
  linkAusgabeBauen,
  linkStueckText,
  loesenGesperrt,
  loesenStand,
  namensSchluessel,
  offboardingLinkAusgabeBauen,
  offeneRueckgaben,
  rueckgabenFortschritt,
  rueckgabenJeStelle,
  ohneVermerk,
  perLinkEntfernbar,
  protokollAnzeige,
  protokollStand,
  protokollStellen,
  protokollText,
  rueckgabeDaten,
  rueckgabeEntwurf,
  rueckgabeLage,
  rueckgabeLageAnzeige,
  rueckgabeOffen,
  rueckgabeVorgabenPlan,
  rueckgabeVorschlag,
  rueckgabeVorschlagAnzeige,
  rueckgabeZeileText,
  rueckgabeZeilenBauen,
  rueckgabeZiel,
  rueckgabeZielAusEingabe,
  rueckgabeZustand,
  rueckgabenSchritt,
  ruecknahmeAufgabe,
  sperraufgabenZeilen,
  tauschZustand,
  uebernahmePlan,
  vermerkPruefen,
  vermerkStuecke,
  vermerkZielGrund,
  weitereBeschaeftigungVorbelegung,
  zuordnungEmpfohlen,
  zuordnungsVorschlaege,
  zustandFehler,
  type AusgabeBezug,
  type AusgabeKurzDaten,
  type AusgabeZeilenDaten,
  type BestandAufgabe,
  type EinstellungsBestand,
  type EinstellungsKandidat,
  type LageStand,
  type LageTextWerte,
  type VermerkZiel,
  type VorschlagAusgabe,
  PROTOKOLL_ACCEPT,
  PROTOKOLL_MAX_ANFRAGE_BYTES,
  PROTOKOLL_MAX_BYTES,
  PROTOKOLL_UPLOAD_MELDUNGEN,
  PROTOKOLL_UPLOAD_TYP,
  protokollDateiGrund,
  protokollDateiGrundText,
  AUSGABEN_LOESCH_SEITE,
  PROTOKOLL_SYSTEM_VORLAGEN,
  ausgabeFaellig,
  ausgabenGeloeschtDetails,
  loeschMengeFestlegen,
  ohneFristGrenze,
} from "@/lib/ausgaben";
import { SELECTABLE_DOCUMENT_TYPES } from "@/lib/required-documents";
import {
  AUSSTATTUNG_KATEGORIE,
  BEI_AUSTRITT,
  GRENZEN,
  MELDUNGEN as AUSSTATTUNG_MELDUNGEN,
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
    // Standardkatalog (14.10.2026): die neuen Vorschlaege.
    expect(RUECKGABE_VORGABEN.IT_ZUGAENGE_SCHULE).toEqual({ beiAustritt: "SPERREN", rueckgabeKategorie: null, ausgabeKennung: null });
    expect(RUECKGABE_VORGABEN.IT_MOBIL).toEqual({
      beiAustritt: "RUECKGABE",
      rueckgabeKategorie: "IT_HARDWARE",
      ausgabeKennung: "Inventarnummer",
    });
    for (const s of ["FACILITY_SCHLUESSEL_KITA", "FACILITY_SCHLUESSEL_BUERO"]) {
      expect(RUECKGABE_VORGABEN[s]).toEqual(RUECKGABE_VORGABEN.FACILITY_SCHLUESSEL);
    }
    expect(RUECKGABE_VORGABEN.FACILITY_SCHLUESSEL).toEqual({
      beiAustritt: "RUECKGABE",
      rueckgabeKategorie: "SCHLUESSEL",
      ausgabeKennung: "Schlüsselnummer",
    });
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

  it("Zuordnung (S28): Fehler und Erfolg, mit und ohne Arbeitsort", () => {
    expect(MELDUNGEN_AUSGABEN.EINSTELLUNG_NICHT_GEFUNDEN).toBe("Einstellung nicht gefunden");
    expect(MELDUNGEN_AUSGABEN.KEINE_ZUORDNUNG).toBe("Diesem Austritt ist keine Einstellung zugeordnet.");
    expect(MELDUNGEN_AUSGABEN.ZUGEORDNET("2027-GS-004", null)).toBe("Einstellung 2027-GS-004 zugeordnet.");
    expect(MELDUNGEN_AUSGABEN.ZUGEORDNET("2027-GS-004", "FES Grundschule")).toBe(
      "Einstellung 2027-GS-004 zugeordnet. Arbeitsort FES Grundschule übernommen.",
    );
    expect(MELDUNGEN_AUSGABEN.GELOEST("2027-GS-004", null)).toBe("Zuordnung der Einstellung 2027-GS-004 gelöst.");
    expect(MELDUNGEN_AUSGABEN.GELOEST("2027-GS-004", "ZURUECKGESETZT")).toContain("Arbeitsort am Austritt ist wieder leer");
    expect(MELDUNGEN_AUSGABEN.GELOEST("2027-GS-004", "BLEIBT")).toContain("schon eine Stelle informiert");
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

  it("AUSGEGEBEN: ein Anker aus einem anderen Realm (structuredClone) zählt – nie still ohne Frist", () => {
    const jetzt = utc("2027-06-01T10:00:00Z");
    // structuredClone liefert in Jest ein Date eines anderen Realms – `instanceof Date` waere falsch.
    const fremd = structuredClone(utc("2026-12-15T10:00:00Z"));
    expect(ausgabeLoeschenAb({ zustand: "AUSGEGEBEN", zustandAm: jetzt, vorgangEingestelltAm: fremd })?.toISOString()).toBe(
      "2029-12-31T23:00:00.000Z",
    );
    // Ein ungueltiges Datum ist kein Anker.
    expect(ausgabeLoeschenAb({ zustand: "AUSGEGEBEN", zustandAm: jetzt, vorgangEingestelltAm: new Date("kaputt") })).toBeNull();
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

describe("bezugBindet / abgeloesteAustritte (G28: Stand beim Austritt, Review A4c)", () => {
  it("ohne eigenen Stand und ohne Ablösung genau wie bindetAusgabe", () => {
    for (const status of ["INITIATED", "FINAL_SETTLEMENT", "COMPLETED", "CANCELLED"]) {
      for (const zustand of AUSGABE_ZUSTAENDE) {
        expect(`${status}/${zustand}: ${bezugBindet({ offboardingId: "off-1", status }, zustand)}`).toBe(
          `${status}/${zustand}: ${bindetAusgabe(status, zustand)}`,
        );
      }
    }
  });

  it("abgeschlossen: gemessen am eigenen Stand – mit „verbleibt“ freigegeben bleibt frei, auch wenn das Stück später umgeschaltet wird", () => {
    // A setzte VERBLEIBT, B übernahm und setzte ZURUECK: A bindet NICHT wieder.
    const a = { offboardingId: "off-a", status: "COMPLETED", eigenerStand: "VERBLEIBT" as const };
    for (const zustand of AUSGABE_ZUSTAENDE) expect({ zustand, bindet: bezugBindet(a, zustand) }).toEqual({ zustand, bindet: false });
    // Eigener Stand ZURUECK: bindet (späte Korrektur im Reiter), auch wenn das Stück heute anders steht.
    expect(bezugBindet({ offboardingId: "off-a", status: "COMPLETED", eigenerStand: "ZURUECK" }, "VERBLEIBT")).toBe(true);
  });

  it("abgeschlossen und von einem späteren Austritt abgelöst: bindet nie (Zugang ohne Rückgabe-Zeile)", () => {
    for (const zustand of AUSGABE_ZUSTAENDE) {
      expect(bezugBindet({ offboardingId: "off-a", status: "COMPLETED", abgeloest: true }, zustand)).toBe(false);
    }
  });

  it("laufend bindet immer, abgebrochen nie – unabhängig von Stand und Ablösung", () => {
    const zusatz = { eigenerStand: "VERBLEIBT" as const, abgeloest: true };
    expect(bezugBindet({ offboardingId: "off-a", status: "HANDOVER_PHASE", ...zusatz }, "ZURUECK")).toBe(true);
    expect(bezugBindet({ offboardingId: "off-a", status: "CANCELLED", eigenerStand: "ZURUECK" }, "ZURUECK")).toBe(false);
  });

  it("bindenderAustritt: der abgeschlossene frühere bindet nicht wieder, sobald der spätere das Stück umschaltet", () => {
    const bezuege = [
      { offboardingId: "off-a", status: "COMPLETED", displayId: "OFF-A", eigenerStand: "VERBLEIBT" as const, abgeloest: true },
      { offboardingId: "off-b", status: "HANDOVER_PHASE", displayId: "OFF-B" },
    ];
    // Aus Sicht von B (eigener Austritt ausgenommen): frei – nach ZURUECK, FEHLT und wieder offen.
    for (const zustand of ["AUSGEGEBEN", "ZURUECK", "FEHLT", "BESCHAEDIGT", "ENTFAELLT"]) {
      expect({ zustand, bindend: bindenderAustritt({ zustand }, bezuege, "off-b") }).toEqual({ zustand, bindend: null });
    }
    // Aus Sicht der Karte bindet B.
    expect(bindenderAustritt({ zustand: "ZURUECK" }, bezuege)?.offboardingId).toBe("off-b");
  });

  it("abgeloesteAustritte: jeder, nach dem ein anderer das Stück bezogen hat; unbekannte Zeitpunkte zählen nicht", () => {
    const seit = new Map<string, number | null>([
      ["off-a", 1000],
      ["off-b", 2000],
      ["off-c", 3000],
    ]);
    expect([...abgeloesteAustritte(seit)].sort()).toEqual(["off-a", "off-b"]);
    expect([...abgeloesteAustritte(new Map([["off-a", 1000]]))]).toEqual([]);
    // Gleicher Zeitpunkt: keiner ist später.
    expect([...abgeloesteAustritte(new Map([["off-a", 1000], ["off-b", 1000]]))]).toEqual([]);
    // Ohne Zeitpunkt lässt sich nichts vergleichen.
    expect([...abgeloesteAustritte(new Map<string, number | null>([["off-a", null], ["off-b", 2000]]))]).toEqual([]);
  });
});

describe("absageFrist (G10, S27)", () => {
  const zustandAm = utc("2027-02-01T09:00:00Z");
  // Absage am 31.12.2027 23:30 Berlin (22:30 UTC) bzw. am 01.01.2028 00:30 Berlin.
  const ABSAGE_2027 = utc("2027-12-31T22:30:00Z");
  const ABSAGE_2028 = utc("2027-12-31T23:30:00Z");

  it("AUSGEGEBEN ohne Austrittsbezug: drei Jahre ab Ende des BERLINER Jahres der Absage", () => {
    expect(absageFrist({ zustand: "AUSGEGEBEN", zustandAm }, [], ABSAGE_2027)?.toISOString()).toBe(
      "2030-12-31T23:00:00.000Z",
    );
    expect(absageFrist({ zustand: "AUSGEGEBEN", zustandAm }, [], ABSAGE_2028)?.toISOString()).toBe(
      "2031-12-31T23:00:00.000Z",
    );
    // Dieselbe Rechnung wie ausgabeLoeschenAb mit vorgangEingestelltAm – keine zweite.
    expect(absageFrist({ zustand: "AUSGEGEBEN", zustandAm }, [], ABSAGE_2027)).toEqual(
      ausgabeLoeschenAb({ zustand: "AUSGEGEBEN", zustandAm, vorgangEingestelltAm: ABSAGE_2027 }),
    );
  });

  it("nur ein abgebrochener Austritt bezieht das Stueck: frei, also mit Frist", () => {
    const bezuege = [{ offboardingId: "off-abgebrochen", status: "CANCELLED", displayId: null }];
    expect(absageFrist({ zustand: "AUSGEGEBEN", zustandAm }, bezuege, ABSAGE_2027)).not.toBeNull();
  });

  it("gebunden (laufender oder abgeschlossener Austritt): keine Frist – das Stueck fuehrt der Austritt", () => {
    for (const status of ["INITIATED", "FINAL_SETTLEMENT", "COMPLETED"]) {
      const bezuege = [{ offboardingId: "off-1", status, displayId: null }];
      expect({ status, frist: absageFrist({ zustand: "AUSGEGEBEN", zustandAm }, bezuege, ABSAGE_2027) }).toEqual({
        status,
        frist: null,
      });
    }
  });

  it("Endzustaende behalten ihre Frist, VERBLEIBT bleibt ohne Frist (G20)", () => {
    for (const zustand of AUSGABE_ZUSTAENDE.filter((z) => z !== "AUSGEGEBEN")) {
      expect({ zustand, frist: absageFrist({ zustand, zustandAm }, [], ABSAGE_2027) }).toEqual({ zustand, frist: null });
    }
    // Auch eine mit dem Abschluss freigegebene VERBLEIBT-Ausgabe bekommt keine.
    const frei = [{ offboardingId: "off-alt", status: "COMPLETED", displayId: null }];
    expect(absageFrist({ zustand: "VERBLEIBT", zustandAm }, frei, ABSAGE_2027)).toBeNull();
    // Unbekannter Zustand: nichts schreiben.
    expect(absageFrist({ zustand: "UNBEKANNT", zustandAm }, [], ABSAGE_2027)).toBeNull();
  });
});

describe("abschlussFrist (G18, S31)", () => {
  const zustandAm = utc("2027-02-01T09:00:00Z");
  // Abschluss am 31.12.2027 23:30 Berlin (22:30 UTC) bzw. am 01.01.2028 00:30 Berlin.
  const ABSCHLUSS_2027 = utc("2027-12-31T22:30:00Z");
  const ABSCHLUSS_2028 = utc("2027-12-31T23:30:00Z");
  const SELBST = { id: "off-1", abgeschlossenAm: ABSCHLUSS_2027 };
  const eigenerBezug = [{ offboardingId: "off-1", status: "COMPLETED", displayId: null }];

  it("AUSGEGEBEN: drei Jahre ab Ende des BERLINER Jahres des Abschlusses – dieselbe Rechnung wie ausgabeLoeschenAb", () => {
    expect(abschlussFrist({ zustand: "AUSGEGEBEN", zustandAm }, eigenerBezug, SELBST)?.toISOString()).toBe(
      "2030-12-31T23:00:00.000Z",
    );
    expect(
      abschlussFrist({ zustand: "AUSGEGEBEN", zustandAm }, eigenerBezug, { id: "off-1", abgeschlossenAm: ABSCHLUSS_2028 })
        ?.toISOString(),
    ).toBe("2031-12-31T23:00:00.000Z");
    expect(abschlussFrist({ zustand: "AUSGEGEBEN", zustandAm, loeschenAb: null }, [], SELBST)).toEqual(
      ausgabeLoeschenAb({ zustand: "AUSGEGEBEN", zustandAm, austrittAbgeschlossenAm: ABSCHLUSS_2027 }),
    );
  });

  it("nur AUSGEGEBEN – Endzustände behalten ihre Frist, VERBLEIBT bleibt ohne (G20)", () => {
    for (const zustand of AUSGABE_ZUSTAENDE.filter((z) => z !== "AUSGEGEBEN")) {
      expect({ zustand, frist: abschlussFrist({ zustand, zustandAm }, eigenerBezug, SELBST) }).toEqual({
        zustand,
        frist: null,
      });
    }
    expect(abschlussFrist({ zustand: "UNBEKANNT", zustandAm }, [], SELBST)).toBeNull();
  });

  it("ein ANDERER laufender Austritt bezieht das Stück: keine Frist – dessen Abschluss setzt sie", () => {
    for (const status of ["INITIATED", "NOTICE_PERIOD", "HANDOVER_PHASE", "FINAL_SETTLEMENT"]) {
      const bezuege = [...eigenerBezug, { offboardingId: "off-2", status, displayId: null }];
      expect({ status, frist: abschlussFrist({ zustand: "AUSGEGEBEN", zustandAm }, bezuege, SELBST) }).toEqual({
        status,
        frist: null,
      });
    }
  });

  it("ein anderer abgeschlossener oder abgebrochener Austritt hält nicht ab (VERBLEIBT früher freigegeben)", () => {
    for (const status of ["COMPLETED", "CANCELLED"]) {
      const bezuege = [{ offboardingId: "off-alt", status, displayId: null }, ...eigenerBezug];
      expect(abschlussFrist({ zustand: "AUSGEGEBEN", zustandAm }, bezuege, SELBST)?.toISOString()).toBe(
        "2030-12-31T23:00:00.000Z",
      );
    }
    // Der eigene Austritt zählt nie als „anderer laufender“ – auch wenn er noch als laufend gelesen wird.
    const nochLaufend = [{ offboardingId: "off-1", status: "FINAL_SETTLEMENT", displayId: null }];
    expect(abschlussFrist({ zustand: "AUSGEGEBEN", zustandAm }, nochLaufend, SELBST)).not.toBeNull();
  });

  it("VERBLEIBT offen IN DIESEM Austritt (unverändert übernommen): dieselbe Frist – der Aufrufer setzt AUSGEGEBEN (Review A4c)", () => {
    const frist = abschlussFrist({ zustand: "VERBLEIBT", zustandAm, hierOffen: true }, eigenerBezug, SELBST);
    expect(frist?.toISOString()).toBe("2030-12-31T23:00:00.000Z");
    expect(frist).toEqual(ausgabeLoeschenAb({ zustand: "AUSGEGEBEN", zustandAm, austrittAbgeschlossenAm: ABSCHLUSS_2027 }));
    // Hier gesetztes VERBLEIBT (Zeile erledigt): frei, ohne Frist.
    expect(abschlussFrist({ zustand: "VERBLEIBT", zustandAm, hierOffen: false }, eigenerBezug, SELBST)).toBeNull();
    // Ein früherer, abgelöster Austritt hält nicht ab; ein anderer laufender schon.
    const frueher = [{ offboardingId: "off-alt", status: "COMPLETED", eigenerStand: "VERBLEIBT" as const, abgeloest: true }];
    expect(abschlussFrist({ zustand: "VERBLEIBT", zustandAm, hierOffen: true }, [...frueher, ...eigenerBezug], SELBST)).not.toBeNull();
    const laufend = [{ offboardingId: "off-2", status: "HANDOVER_PHASE" }];
    expect(abschlussFrist({ zustand: "VERBLEIBT", zustandAm, hierOffen: true }, [...laufend, ...eigenerBezug], SELBST)).toBeNull();
  });

  it("eine vorhandene Frist wird nie vorgezogen, eine frühere verlängert", () => {
    const spaeter = utc("2031-12-31T23:00:00.000Z");
    const frueher = utc("2029-12-31T23:00:00.000Z");
    const gleich = utc("2030-12-31T23:00:00.000Z");
    expect(abschlussFrist({ zustand: "AUSGEGEBEN", zustandAm, loeschenAb: spaeter }, [], SELBST)).toBeNull();
    expect(abschlussFrist({ zustand: "AUSGEGEBEN", zustandAm, loeschenAb: gleich }, [], SELBST)).toBeNull();
    expect(abschlussFrist({ zustand: "AUSGEGEBEN", zustandAm, loeschenAb: frueher }, [], SELBST)?.toISOString()).toBe(
      "2030-12-31T23:00:00.000Z",
    );
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

  it("ein Vorschlag ist die Anzeige der Einstellung plus Stufe und Begruendung (S28)", () => {
    const k = kandidat({ id: "1", email: "anna.s@example.org", arbeitsortId: "org-gs-ort" });
    const [v] = zuordnungsVorschlaege(austritt, [k]);
    const { stufe, gruende, ...anzeige } = v;
    expect(stufe).toBe("STARK");
    expect(gruende).toHaveLength(1);
    expect(anzeige).toEqual(einstellungAnzeige(k));
  });
});

describe("einstellungAnzeige / einstellungsTreffer (S28, Suche im Dialog)", () => {
  const kandidat = (teil: Partial<EinstellungsKandidat> & { id: string }): EinstellungsKandidat => ({
    displayId: `2027-GYM-${teil.id}`,
    organizationId: "org-gym",
    email: "anna.s@example.org",
    firstName: "Anna",
    lastName: "Schmidt",
    personalData: { emailPrivate: "privat@example.org", birthName: "Wagner" },
    supervisorData: { vertragsbeginn: utc("2027-01-31T23:00:00Z") },
    ...teil,
  });

  it("Anzeige ohne Adressen; Vertragsbeginn als Berliner Kalendertag", () => {
    const a = einstellungAnzeige(kandidat({ id: "1", arbeitsortId: "org-gs" }));
    expect(a).toEqual({
      onboardingId: "1",
      displayId: "2027-GYM-1",
      name: "Anna Schmidt",
      organizationId: "org-gym",
      arbeitsortId: "org-gs",
      // 31.01.2027 23:00 UTC = 01.02.2027 00:00 Berlin
      vertragsbeginn: "2027-02-01",
    });
    expect(JSON.stringify(a)).not.toMatch(/@/);
  });

  it("ohne Nummer, Arbeitsort, Namen und Beginn: null bzw. Leertext; Name aus dem Fragebogen", () => {
    expect(
      einstellungAnzeige({
        id: "2",
        organizationId: "org-gym",
        firstName: "  ",
        lastName: null,
        personalData: { firstName: "Berta", lastName: "Meier" },
        supervisorData: null,
      }),
    ).toEqual({ onboardingId: "2", displayId: null, name: "Berta Meier", organizationId: "org-gym", arbeitsortId: null, vertragsbeginn: null });
  });

  it("Treffer: neuester Vertragsbeginn zuerst, ohne Datum zuletzt, hoechstens AUSGABE_GRENZEN.suche, ohne Stufe", () => {
    const vb = (tag: string | null) => ({ vertragsbeginn: tag ? utc(`${tag}T00:00:00Z`) : null });
    const treffer = einstellungsTreffer([
      kandidat({ id: "a", supervisorData: vb("2026-08-01") }),
      kandidat({ id: "b", supervisorData: vb(null) }),
      kandidat({ id: "c", supervisorData: vb("2027-08-01") }),
    ]);
    expect(treffer.map((t) => t.onboardingId)).toEqual(["c", "a", "b"]);
    expect(treffer[0]).not.toHaveProperty("stufe");
    expect(JSON.stringify(treffer)).not.toMatch(/@/);

    const viele = Array.from({ length: AUSGABE_GRENZEN.suche + 5 }, (_, i) => kandidat({ id: `k${String(i).padStart(2, "0")}` }));
    expect(einstellungsTreffer(viele)).toHaveLength(AUSGABE_GRENZEN.suche);
  });
});

describe("austrittLaeuft / zuordnungEmpfohlen / weitereBeschaeftigungVorbelegung (G11, G12, G13)", () => {
  it("laufend heisst weder COMPLETED noch CANCELLED", () => {
    for (const s of ["INITIATED", "NOTICE_PERIOD", "HANDOVER_PHASE", "FINAL_SETTLEMENT"]) expect(austrittLaeuft(s)).toBe(true);
    expect(austrittLaeuft("COMPLETED")).toBe(false);
    expect(austrittLaeuft("CANCELLED")).toBe(false);
  });

  it("Hinweis nur ohne Zuordnung, bei laufendem Austritt und mit STARK- bzw. MITTEL-Vorschlag", () => {
    const basis = { zugeordnet: false, austrittStatus: "INITIATED" };
    expect(zuordnungEmpfohlen({ ...basis, vorschlaege: [{ stufe: "STARK" }] })).toBe(true);
    expect(zuordnungEmpfohlen({ ...basis, vorschlaege: [{ stufe: "SCHWACH" }, { stufe: "MITTEL" }] })).toBe(true);
    // Nur schwache Vorschlaege bzw. keine: kein Hinweis
    expect(zuordnungEmpfohlen({ ...basis, vorschlaege: [{ stufe: "SCHWACH" }] })).toBe(false);
    expect(zuordnungEmpfohlen({ ...basis, vorschlaege: [] })).toBe(false);
    // Schon zugeordnet bzw. nicht mehr laufend: kein Hinweis
    expect(zuordnungEmpfohlen({ ...basis, zugeordnet: true, vorschlaege: [{ stufe: "STARK" }] })).toBe(false);
    for (const s of ["COMPLETED", "CANCELLED"]) {
      expect(zuordnungEmpfohlen({ ...basis, austrittStatus: s, vorschlaege: [{ stufe: "STARK" }] })).toBe(false);
    }
  });

  it("Merker „Person bleibt in einer anderen Beschäftigung“: vorbelegt nur bei Versetzung", () => {
    expect(weitereBeschaeftigungVorbelegung("VERSETZUNG")).toBe(true);
    for (const t of ["KUENDIGUNG_ARBEITNEHMER", "BEFRISTUNGSENDE", "RENTE_PENSION", null, undefined]) {
      expect(weitereBeschaeftigungVorbelegung(t)).toBe(false);
    }
  });
});

describe("informierteStellen / arbeitsortBeiZuordnung / arbeitsortText (G12)", () => {
  const austritt = { organizationId: "org-foerderverein" };
  const ogs = { organizationId: "org-foerderverein", arbeitsortId: "org-gs" };

  it("informiert heisst sentAt ?? lastSentAt; ein nie zugestellter Link zaehlt nicht", () => {
    expect(
      informierteStellen([
        { sentAt: utc("2027-07-01T08:00:00Z"), lastSentAt: null },
        // nach gescheitertem „Link erneuern“: sentAt wieder null, aeltere Mail bleibt
        { sentAt: null, lastSentAt: utc("2027-06-01T08:00:00Z") },
        { sentAt: null, lastSentAt: null },
        { sentAt: "kein Datum" },
        {},
      ]),
    ).toBe(2);
    expect(informierteStellen([])).toBe(0);
  });

  it("gleiche Einrichtung, Arbeitsort vorhanden, niemand informiert: uebernommen", () => {
    expect(arbeitsortBeiZuordnung({ austritt, einstellung: ogs, links: [] })).toEqual({
      arbeitsortId: "org-gs",
      grund: "UEBERNOMMEN",
    });
    // Ein nie zugestellter Link (FAILED) haelt die Uebernahme nicht auf.
    expect(arbeitsortBeiZuordnung({ austritt, einstellung: ogs, links: [{ sentAt: null, lastSentAt: null }] }).grund).toBe(
      "UEBERNOMMEN",
    );
  });

  it("eine Stelle schon informiert (auch nur lastSentAt): nicht uebernommen", () => {
    for (const link of [{ sentAt: utc("2027-07-01T08:00:00Z") }, { sentAt: null, lastSentAt: utc("2027-07-01T08:00:00Z") }]) {
      expect(arbeitsortBeiZuordnung({ austritt, einstellung: ogs, links: [link] })).toEqual({
        arbeitsortId: null,
        grund: "STELLE_INFORMIERT",
      });
    }
  });

  it("Einstellung an einer anderen Einrichtung: nie uebernommen – auch ohne informierte Stelle", () => {
    expect(
      arbeitsortBeiZuordnung({ austritt: { organizationId: "org-gym" }, einstellung: ogs, links: [] }),
    ).toEqual({ arbeitsortId: null, grund: "ANDERE_EINRICHTUNG" });
  });

  it("ohne Arbeitsort (bzw. gleich der Einrichtung des Austritts): nichts zu uebernehmen, vor allen anderen Gruenden", () => {
    for (const einstellung of [
      { organizationId: "org-gym", arbeitsortId: null },
      { organizationId: "org-gym", arbeitsortId: "" },
      { organizationId: "org-gym" },
      { organizationId: "org-x", arbeitsortId: "org-foerderverein" },
    ]) {
      expect(arbeitsortBeiZuordnung({ austritt, einstellung, links: [{ sentAt: utc("2027-07-01T08:00:00Z") }] })).toEqual({
        arbeitsortId: null,
        grund: "OHNE_ARBEITSORT",
      });
    }
  });

  it("der Dialog sagt, was mit dem Arbeitsort geschieht – auch, wenn er leer bleibt", () => {
    expect(arbeitsortText("UEBERNOMMEN", "FES Grundschule")).toBe(
      "Arbeitsort FES Grundschule wird übernommen: Die Aufgaben dieses Austritts gehen an die Stellen dort.",
    );
    expect(arbeitsortText("STELLE_INFORMIERT", "FES Grundschule")).toContain("schon eine Stelle informiert");
    expect(arbeitsortText("ANDERE_EINRICHTUNG", null)).toContain("anderen Einrichtung");
    expect(arbeitsortText("UEBERNOMMEN", null)).toContain("Arbeitsort der Einstellung wird übernommen");
    expect(arbeitsortText("OHNE_ARBEITSORT", "FES Grundschule")).toBeNull();
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

describe("rueckgabeLageAnzeige (E-A36, S28: Kopfzeile aus dem Bestand)", () => {
  const aufgabe = (id: string, ausstattungId: string | null, teil: Partial<BestandAufgabe> = {}): BestandAufgabe => ({
    id,
    title: `Aufgabe ${id}`,
    isCompleted: true,
    completedAt: utc("2027-01-28T10:00:00Z"),
    entfaelltAm: null,
    ausgabenGeloeschtAm: null,
    ausstattungId,
    ...teil,
  });
  const bestand = (teil: Partial<EinstellungsBestand> = {}): EinstellungsBestand => ({
    displayId: "2027-GS-004",
    ausgabenAngeboten: true,
    zeilen: [
      { id: "z-ipad", art: "JA_NEIN", beiAustritt: "RUECKGABE" },
      { id: "z-zugang", art: "AUSWAHL", beiAustritt: "SPERREN" },
    ],
    aufgaben: [],
    ausgaben: [],
    ...teil,
  });

  it("ohne Einstellung: KEINE_EINSTELLUNG, keine Nummer, nichts ohne Vermerk", () => {
    const a = rueckgabeLageAnzeige(null);
    expect(a.stand).toEqual({ lage: "KEINE_EINSTELLUNG", nr: "", gegenstaende: 0, zugaenge: 0, ohneVermerk: 0 });
    expect(a.text).toBe(LAGE_TEXTE.KEINE_EINSTELLUNG(a.stand));
    expect(a.zusatz).toBeNull();
    expect(a.ohneVermerk).toEqual([]);
  });

  it("AUSGABEN zaehlt nur, was noch bei der Person ist – getrennt nach Gegenstand und Zugang", () => {
    const a = rueckgabeLageAnzeige(
      bestand({
        ausgaben: [
          { checklistItemId: "t1", zustand: "AUSGEGEBEN", beiAustritt: "RUECKGABE" },
          { checklistItemId: "t1", zustand: "VERBLEIBT", beiAustritt: "RUECKGABE" },
          { checklistItemId: "t1", zustand: "ERSETZT", beiAustritt: "RUECKGABE" },
          { checklistItemId: "t2", zustand: "AUSGEGEBEN", beiAustritt: "SPERREN" },
          { checklistItemId: "t2", zustand: "ZURUECK", beiAustritt: "SPERREN" },
        ],
      }),
    );
    expect(a.stand).toMatchObject({ lage: "AUSGABEN", nr: "2027-GS-004", gegenstaende: 2, zugaenge: 1 });
    expect(a.text).toBe(
      "Laut Portal ausgegeben (Einstellung 2027-GS-004, von HR zugeordnet): 2 Gegenstände, 1 Zugang.",
    );
    expect(a.zusatz).toBeNull();
  });

  it("AUSGABEN mit daneben geloeschten Ausgaben: Zusatzzeile; GELOESCHT ohne Ausgabe", () => {
    const geloescht = aufgabe("t9", "z-ipad", { ausgabenGeloeschtAm: utc("2027-09-01T02:00:00Z") });
    const mit = rueckgabeLageAnzeige(
      bestand({ aufgaben: [geloescht], ausgaben: [{ checklistItemId: "t1", zustand: "AUSGEGEBEN", beiAustritt: "RUECKGABE" }] }),
    );
    expect(mit.stand.lage).toBe("AUSGABEN");
    expect(mit.zusatz).toBe(LAGE_WEITERE_GELOESCHT);
    const ohne = rueckgabeLageAnzeige(bestand({ aufgaben: [geloescht] }));
    expect(ohne.stand.lage).toBe("GELOESCHT");
    expect(ohne.zusatz).toBeNull();
  });

  it("NICHTS_ERFASST nennt die Aufgaben ohne Vermerk; NICHTS_AUSGEGEBEN und VOR_EINFUEHRUNG nach Merker und Zeilen", () => {
    const erfasst = rueckgabeLageAnzeige(bestand({ aufgaben: [aufgabe("t1", "z-ipad"), aufgabe("t2", "z-zugang")] }));
    expect(erfasst.stand).toMatchObject({ lage: "NICHTS_ERFASST", ohneVermerk: 2 });
    expect(erfasst.ohneVermerk.map((o) => o.checklistItemId)).toEqual(["t1", "t2"]);
    expect(erfasst.text).toContain(": 2 Aufgaben.");

    expect(rueckgabeLageAnzeige(bestand()).stand.lage).toBe("NICHTS_AUSGEGEBEN");
    expect(rueckgabeLageAnzeige(bestand({ zeilen: [], ausgabenAngeboten: null })).stand.lage).toBe("VOR_EINFUEHRUNG");
  });

  it("ohne Vorgangsnummer (Altbestand) steht ein lesbarer Platzhalter da", () => {
    const a = rueckgabeLageAnzeige(bestand({ displayId: null, zeilen: [], ausgabenAngeboten: false }));
    expect(a.stand.nr).toBe(EINSTELLUNG_OHNE_NUMMER);
    expect(a.text).toContain(`Einstellung ${EINSTELLUNG_OHNE_NUMMER}`);
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

describe("rueckgabenFortschritt (Stepper „Rückgaben einsammeln“, Review A4c)", () => {
  const RUECKGABEN = [
    { id: "r-1", itemName: "Dienst-iPad (Lernmittel)", ausgabeId: "a-ipad", zustand: null, isReturned: false },
    { id: "r-2", itemName: "Schlüssel: Haupteingang", ausgabeId: "a-key", zustand: "FEHLT", isReturned: false },
    { id: "r-3", itemName: "Laptop", ausgabeId: "a-laptop", zustand: "ZURUECK", isReturned: true },
    { id: "r-4", itemName: "Parkausweis", ausgabeId: null, zustand: null, isReturned: false },
    { id: "r-5", itemName: "Alter Schlüssel", ausgabeId: null, zustand: null, isReturned: true },
  ];
  const AUFGABEN = [
    { id: "t-1", title: "Dienst-iPad (Lernmittel) zurücknehmen", isCompleted: false, herkunft: "AUSGABE", ausgabeId: "a-ipad", assigneeDepartment: "IT" },
    { id: "t-2", title: "Schlüssel: Haupteingang zurücknehmen", isCompleted: true, herkunft: "AUSGABE", ausgabeId: "a-key", assigneeDepartment: "FACILITY" },
    { id: "t-3", title: "Schließung prüfen: Schlüssel: Haupteingang", isCompleted: false, herkunft: "AUSGABE_FEHLT", ausgabeId: "a-key", assigneeDepartment: "FACILITY" },
    { id: "t-4", title: "Zugänge: WebUntis sperren", isCompleted: false, herkunft: "AUSGABE", ausgabeId: "a-webuntis", assigneeDepartment: "IT" },
    { id: "t-5", title: "Zugänge: Schulportal sperren", isCompleted: true, herkunft: "AUSGABE", ausgabeId: "a-portal", assigneeDepartment: "IT" },
    { id: "t-6", title: "Laptop zurücknehmen", isCompleted: true, herkunft: "AUSGABE", ausgabeId: "a-laptop", assigneeDepartment: "IT" },
    { id: "t-7", title: "Vorlagenpunkt", isCompleted: false, herkunft: null, ausgabeId: null, assigneeDepartment: "IT" },
  ];

  it("in denselben Stücken wie offeneRueckgaben: gesamt − erledigt = Zahl der offenen", () => {
    const f = rueckgabenFortschritt({ rueckgaben: RUECKGABEN, aufgaben: AUFGABEN });
    // Stücke: iPad, Schlüssel (samt Folgeaufgabe), Laptop, Parkausweis, alter Schlüssel, WebUntis, Schulportal.
    expect(f).toEqual({ erledigt: 3, gesamt: 7 });
    expect(f.gesamt - f.erledigt).toBe(offeneRueckgaben({ rueckgaben: RUECKGABEN, aufgaben: AUFGABEN, stellenNamen: {} }).length);
  });

  it("alle Rückgabe-Zeilen erledigt, eine Sperraufgabe offen: nie „voll“", () => {
    const f = rueckgabenFortschritt({
      rueckgaben: [{ id: "r-1", ausgabeId: "a-1", zustand: "ZURUECK", isReturned: true }],
      aufgaben: [
        { id: "t-1", isCompleted: true, herkunft: "AUSGABE", ausgabeId: "a-1" },
        { id: "t-2", isCompleted: false, herkunft: "AUSGABE", ausgabeId: "a-zugang" },
      ],
    });
    expect(f).toEqual({ erledigt: 1, gesamt: 2 });
    expect(rueckgabenFortschritt({ rueckgaben: [], aufgaben: [] })).toEqual({ erledigt: 0, gesamt: 0 });
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

  it("ein Zugang (SPERREN): korrigieren, „gesperrt“ und entfernen – nie tauschen (1.2, G7)", () => {
    // Ein Tausch „verloren“ setzte den Zugang auf FEHLT – den Zustand, den „zurückgenommen“ für Zugänge ausschliesst.
    expect(ausgabenZeile(stueck({ beiAustritt: "SPERREN", kennung: null }), HR).aktionen).toEqual({ ...ALLE, tauschen: false });
    expect(ausgabenZeile(stueck({ beiAustritt: "SPERREN", zustand: "VERBLEIBT" }), HR).aktionen).toEqual({
      korrigieren: true,
      tauschen: false,
      zurueckgenommen: true,
      entfernen: false,
    });
    // Ein Gegenstand bleibt tauschbar.
    expect(ausgabenZeile(stueck({ beiAustritt: "RUECKGABE" }), HR).aktionen.tauschen).toBe(true);
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
    expect(ausgabenJeAufgabe({ isCompleted: true }, [], { ...ctx, art: "RUECKGABE" }).hinweis?.text).toBe(
      "Übergabe nicht vermerkt",
    );
  });

  it("ein Zugang (SPERREN): „Einrichtung nicht vermerkt“ – wie Knopf und Link-Seite (G4)", () => {
    expect(ausgabenJeAufgabe({ isCompleted: true }, [], { ...ctx, art: "SPERREN" })).toEqual({
      hinweis: { text: MELDUNGEN_AUSGABEN.EINRICHTUNG_NICHT_VERMERKT, ton: "gelb" },
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
// S24: Ziel eines Vermerks, Tausch, Anzeige der Karte
// =============================================

describe("vermerkStuecke (G4: Vorgabe heute)", () => {
  it("ohne Datum der heutige Tag, Kennung getrimmt bzw. null", () => {
    expect(
      vermerkStuecke([{ kennung: " FES-1 ", uebergebenAm: "2027-02-01" }, {}, { kennung: "  ", uebergebenAm: null }], "2027-02-15"),
    ).toEqual([
      { kennung: "FES-1", uebergebenAm: "2027-02-01" },
      { kennung: null, uebergebenAm: "2027-02-15" },
      { kennung: null, uebergebenAm: "2027-02-15" },
    ]);
  });
});

describe("vermerkZielGrund / ausgabeBasis (G2, G4)", () => {
  const ziel = (teil: Partial<VermerkZiel> = {}, zeile: Partial<NonNullable<VermerkZiel["zeile"]>> = {}): VermerkZiel => ({
    aufgabe: { id: "i-1", assignee: "FACILITY", herkunft: "AUSSTATTUNG", entfaelltAm: null },
    zeile: {
      id: "z-1",
      positionId: "pos-1",
      departmentKey: "FACILITY",
      art: "AUSWAHL",
      bezeichnung: "Schlüssel",
      ausgabeKennung: "Schlüsselnummer",
      rueckgabeKategorie: "SCHLUESSEL",
      beiAustritt: "RUECKGABE",
      gestrichenAm: null,
      ...zeile,
    },
    option: "Haupteingang",
    position: { organizationId: null },
    ...teil,
  });

  it("offene und erledigte Ausstattungsaufgabe mit RUECKGABE bzw. SPERREN: frei", () => {
    expect(vermerkZielGrund(ziel())).toBeNull();
    expect(vermerkZielGrund(ziel({}, { beiAustritt: "SPERREN", rueckgabeKategorie: null }))).toBeNull();
  });

  it("KEINE_AUSGABE: ohne Zeile, nicht AUSSTATTUNG, NICHTS bzw. leer, Angabe – vor AUFGABE_ENTFAELLT", () => {
    expect(vermerkZielGrund({ ...ziel(), zeile: null })).toBe("KEINE_AUSGABE");
    expect(vermerkZielGrund(ziel({ aufgabe: { id: "i-1", assignee: "IT", herkunft: "HINWEIS", entfaelltAm: null } }))).toBe(
      "KEINE_AUSGABE",
    );
    expect(vermerkZielGrund(ziel({}, { beiAustritt: "NICHTS" }))).toBe("KEINE_AUSGABE");
    expect(vermerkZielGrund(ziel({}, { beiAustritt: null }))).toBe("KEINE_AUSGABE");
    expect(vermerkZielGrund(ziel({}, { art: "ANGABE" }))).toBe("KEINE_AUSGABE");
    expect(vermerkZielGrund(ziel({}, { beiAustritt: "NICHTS", gestrichenAm: utc("2027-01-20T10:00:00Z") }))).toBe(
      "KEINE_AUSGABE",
    );
  });

  it("AUFGABE_ENTFAELLT: entfallene Aufgabe bzw. gestrichene Position", () => {
    expect(
      vermerkZielGrund(ziel({ aufgabe: { id: "i-1", assignee: "FACILITY", herkunft: "AUSSTATTUNG", entfaelltAm: utc("2027-01-20T10:00:00Z") } })),
    ).toBe("AUFGABE_ENTFAELLT");
    expect(vermerkZielGrund(ziel({}, { gestrichenAm: utc("2027-01-20T10:00:00Z") }))).toBe("AUFGABE_ENTFAELLT");
    for (const grund of ["KEINE_AUSGABE", "AUFGABE_ENTFAELLT"] as const) expect(typeof MELDUNGEN_AUSGABEN[grund]).toBe("string");
  });

  it("ausgabeBasis: Empfänger-Einrichtung, zentral, Stelle der Aufgabe, Bezeichnung mit Option", () => {
    const vorgang = { id: "onb-1", organizationId: "org-fv", arbeitsortId: "org-gs" };
    expect(ausgabeBasis(ziel(), { vorgang, quelle: "HR", erfasstVonId: "u-hr" })).toEqual({
      onboardingId: "onb-1",
      checklistItemId: "i-1",
      organizationId: "org-gs",
      zentral: true,
      departmentKey: "FACILITY",
      bezeichnung: "Schlüssel: Haupteingang",
      kennungLabel: "Schlüsselnummer",
      rueckgabeKategorie: "SCHLUESSEL",
      beiAustritt: "RUECKGABE",
      quelle: "HR",
      erfasstVonId: "u-hr",
    });
  });

  it("ausgabeBasis: ohne Arbeitsort die Einrichtung; Position der Einrichtung bzw. frei/geloescht nicht zentral; Link ohne Konto", () => {
    const vorgang = { id: "onb-1", organizationId: "org-1" };
    const einrichtung = ausgabeBasis(ziel({ position: { organizationId: "org-1" } }), { vorgang, quelle: "LINK", erfasstVonId: "u-x" });
    expect(einrichtung).toMatchObject({ organizationId: "org-1", zentral: false, quelle: "LINK", erfasstVonId: null });
    expect(ausgabeBasis(ziel({ position: null }), { vorgang, quelle: "HR", erfasstVonId: "u-hr" }).zentral).toBe(false);
  });

  it("ausgabeBasis: SPERREN ohne Kategorie; Stelle der Zeile, wenn die Aufgabe keine trägt; ganze Position ohne Option", () => {
    const vorgang = { id: "onb-1", organizationId: "org-1" };
    const b = ausgabeBasis(
      ziel(
        { option: "", aufgabe: { id: "i-1", assignee: null, herkunft: "AUSSTATTUNG", entfaelltAm: null } },
        { beiAustritt: "SPERREN", rueckgabeKategorie: "SCHLUESSEL", ausgabeKennung: "  ", art: "JA_NEIN", bezeichnung: "Zugänge" },
      ),
      { vorgang, quelle: "HR", erfasstVonId: "u-hr" },
    );
    expect(b).toMatchObject({ rueckgabeKategorie: null, departmentKey: "FACILITY", bezeichnung: "Zugänge", kennungLabel: null });
  });

  it("ausgabeBasis wirft, wenn die Aufgabe keinen Vermerk erlaubt (Programmfehler)", () => {
    expect(() => ausgabeBasis({ ...ziel(), zeile: null }, { vorgang: { id: "o", organizationId: "x" }, quelle: "HR", erfasstVonId: null })).toThrow();
  });
});

describe("tauschZustand / ersatzBasis (G7)", () => {
  it("DEFEKT → ERSETZT, VERLOREN → FEHLT", () => {
    expect(tauschZustand("DEFEKT")).toBe("ERSETZT");
    expect(tauschZustand("VERLOREN")).toBe("FEHLT");
    for (const grund of TAUSCH_GRUENDE) expect(MELDUNGEN_AUSGABEN.GETAUSCHT(grund)).toMatch(/^Getauscht/);
  });

  it("ersatzBasis übernimmt die feste Seite der alten, vermerkt von HR", () => {
    const alt = {
      onboardingId: "onb-1",
      checklistItemId: "i-1",
      organizationId: "org-gs",
      zentral: true,
      departmentKey: "FACILITY",
      bezeichnung: "Schlüssel: Haupteingang",
      kennungLabel: "Schlüsselnummer",
      rueckgabeKategorie: "SCHLUESSEL",
      beiAustritt: "RUECKGABE",
    };
    expect(ersatzBasis(alt, { erfasstVonId: "u-hr" })).toEqual({ ...alt, quelle: "HR", erfasstVonId: "u-hr" });
    expect(() => ersatzBasis({ ...alt, beiAustritt: "NICHTS" }, { erfasstVonId: null })).toThrow();
  });
});

describe("ausgabenAnzeigeBauen (Karte je Aufgabe, G7, G20, G28)", () => {
  const zeilen = [
    { id: "z-ipad", art: "JA_NEIN", beiAustritt: "RUECKGABE", gestrichenAm: null, ausgabeKennung: "Inventarnummer", rueckgabeKategorie: "IT_HARDWARE" },
    { id: "z-schl", art: "AUSWAHL", beiAustritt: "RUECKGABE", gestrichenAm: null, ausgabeKennung: null, rueckgabeKategorie: "SCHLUESSEL" },
    { id: "z-zugang", art: "JA_NEIN", beiAustritt: "SPERREN", gestrichenAm: null },
    { id: "z-park", art: "JA_NEIN", beiAustritt: "NICHTS" },
    { id: "z-ohne", art: "JA_NEIN", beiAustritt: null },
    { id: "z-weg", art: "JA_NEIN", beiAustritt: "RUECKGABE", gestrichenAm: utc("2027-01-20T10:00:00Z"), rueckgabeKategorie: "IT_HARDWARE" },
  ];
  const verknuepfungen = [
    { ausstattungId: "z-ipad", checklistItemId: "i-ipad" },
    { ausstattungId: "z-schl", checklistItemId: "i-haupt" },
    { ausstattungId: "z-zugang", checklistItemId: "i-zugang" },
    { ausstattungId: "z-park", checklistItemId: "i-park" },
    { ausstattungId: "z-ohne", checklistItemId: "i-ohne" },
    { ausstattungId: "z-weg", checklistItemId: "i-weg" },
  ];
  const aufgaben = [
    { id: "i-ipad", isCompleted: false },
    { id: "i-haupt", isCompleted: true },
    { id: "i-zugang", isCompleted: true, ausgabenGeloeschtAm: utc("2027-08-01T02:00:00Z") },
    { id: "i-park", isCompleted: true },
    { id: "i-ohne", isCompleted: true },
    { id: "i-weg", isCompleted: true, entfaelltAm: utc("2027-01-20T10:00:00Z") },
  ];
  const stueck = (teil: Partial<AusgabeZeilenDaten & { checklistItemId: string | null }>) => ({
    id: "a-1",
    checklistItemId: "i-ipad",
    zustand: "AUSGEGEBEN",
    beiAustritt: "RUECKGABE",
    kennung: "FES-IPAD-0412",
    kennungLabel: "Inventarnummer",
    uebergebenAm: utc("2027-01-28T00:00:00Z"),
    quelle: "LINK",
    bezuege: [],
    ...teil,
  });

  it("nur Aufgaben mit RUECKGABE/SPERREN, auch gestrichene; NICHTS und leer fehlen ganz", () => {
    const r = ausgabenAnzeigeBauen({ zeilen, verknuepfungen, aufgaben, ausgaben: [], darfBearbeiten: true });
    expect(Object.keys(r).sort()).toEqual(["i-haupt", "i-ipad", "i-weg", "i-zugang"]);
  });

  it("je Aufgabe Art, Beschriftung, Schlüssel, Stücke, Hinweis und „Vermerken“", () => {
    const r = ausgabenAnzeigeBauen({
      zeilen,
      verknuepfungen,
      aufgaben,
      ausgaben: [stueck({}), stueck({ id: "a-2", zustand: "ERSETZT" }), stueck({ id: "a-fremd", checklistItemId: "i-anders" })],
      darfBearbeiten: true,
    });
    expect(r["i-ipad"]).toMatchObject({
      ausgabeMoeglich: true,
      ausgabeArt: "RUECKGABE",
      kennungLabel: "Inventarnummer",
      schluessel: false,
      ausgabenHinweis: null,
      vermerken: true,
    });
    expect(r["i-ipad"].ausgaben.map((a) => [a.id, a.aktiv])).toEqual([
      ["a-1", true],
      ["a-2", false],
    ]);
    // Erledigt ohne Ausgabe: gelb. Schluessel, Beschriftung „Kennung“.
    expect(r["i-haupt"]).toMatchObject({
      schluessel: true,
      kennungLabel: KENNUNG_LABEL_STANDARD,
      ausgabenHinweis: { text: MELDUNGEN_AUSGABEN.UEBERGABE_NICHT_VERMERKT, ton: "gelb" },
    });
    // Zugang mit geloeschten Ausgaben: grau, kein Schluessel.
    expect(r["i-zugang"]).toMatchObject({
      ausgabeArt: "SPERREN",
      schluessel: false,
      ausgabenHinweis: { text: MELDUNGEN_AUSGABEN.AUSGABEN_GELOESCHT, ton: "grau" },
    });
    // Gestrichen: keine Uebergabe mehr, frueheres sichtbar.
    expect(r["i-weg"]).toMatchObject({ ausgabeMoeglich: false, vermerken: false, ausgabenHinweis: null });
  });

  it("gebunden an einen Austritt: Sperrgrund am Stück; ohne Recht keine Aktion und kein „Vermerken“", () => {
    const gebunden = stueck({ bezuege: [{ offboardingId: "off-1", status: "INITIATED", displayId: "OFF-1" }] });
    const r = ausgabenAnzeigeBauen({ zeilen, verknuepfungen, aufgaben, ausgaben: [gebunden], darfBearbeiten: true });
    expect(r["i-ipad"].ausgaben[0]).toMatchObject({ gebunden: true, sperrGrund: MELDUNGEN_AUSGABEN.AUSGABE_IM_AUSTRITT("OFF-1") });
    const ohne = ausgabenAnzeigeBauen({ zeilen, verknuepfungen, aufgaben, ausgaben: [stueck({})], darfBearbeiten: false });
    expect(ohne["i-ipad"].vermerken).toBe(false);
    expect(Object.values(ohne["i-ipad"].ausgaben[0].aktionen).some(Boolean)).toBe(false);
  });

  it("bleibt reines JSON", () => {
    const r = ausgabenAnzeigeBauen({ zeilen, verknuepfungen, aufgaben, ausgaben: [stueck({})], darfBearbeiten: true });
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
});

describe("linkAusgabeBauen / linkStueckText (Link-Seite der Stelle, G6, G21, S25)", () => {
  const zeile = {
    departmentKey: "IT",
    art: "JA_NEIN",
    beiAustritt: "RUECKGABE",
    ausgabeKennung: "Inventarnummer",
    gestrichenAm: null,
  };
  const aufgabe = { assignee: "IT", herkunft: "AUSSTATTUNG", entfaelltAm: null };
  const stueck = (teil: Partial<Parameters<typeof linkAusgabeBauen>[0]["ausgaben"][number]> = {}) => ({
    id: "a-1",
    departmentKey: "IT",
    zustand: "AUSGEGEBEN",
    quelle: "LINK",
    kennung: "FES-IPAD-0412",
    uebergebenAm: utc("2027-01-28T00:00:00Z"),
    bezuege: [],
    ...teil,
  });
  const bauen = (teil: Partial<Parameters<typeof linkAusgabeBauen>[0]> = {}) =>
    linkAusgabeBauen({ departmentKey: "IT", aufgabe, zeile, ausgaben: [], ...teil });

  it("Ausstattungsaufgabe der eigenen Stelle mit RUECKGABE: das Feld mit Art, Beschriftung und Stücken", () => {
    expect(bauen({ ausgaben: [stueck()] })).toEqual({
      moeglich: true,
      kennungLabel: "Inventarnummer",
      art: "RUECKGABE",
      stuecke: [{ id: "a-1", kennung: "FES-IPAD-0412", uebergebenAm: "2027-01-28", entfernbar: true }],
    });
    // Ohne Momentaufnahme heisst die Kennung „Kennung“; ein Zugang ist SPERREN.
    expect(bauen({ zeile: { ...zeile, beiAustritt: "SPERREN", ausgabeKennung: null } })).toMatchObject({
      kennungLabel: KENNUNG_LABEL_STANDARD,
      art: "SPERREN",
      stuecke: [],
    });
  });

  it.each([
    ["eine Vorlagenaufgabe (ohne Herkunft)", { aufgabe: { ...aufgabe, herkunft: null } }],
    ["eine Hinweis-Aufgabe", { aufgabe: { ...aufgabe, herkunft: "HINWEIS" } }],
    ["eine Aufgabe einer anderen Stelle", { aufgabe: { ...aufgabe, assignee: "VERWALTUNG" } }],
    ["eine Zeile einer anderen Stelle (nach Stellenwechsel)", { zeile: { ...zeile, departmentKey: "VERWALTUNG" } }],
    ["eine Aufgabe ohne Zeile", { zeile: null }],
    ["„nichts“ beim Austritt", { zeile: { ...zeile, beiAustritt: "NICHTS" } }],
    ["ohne „Beim Austritt“ (A4 aus, G27)", { zeile: { ...zeile, beiAustritt: null } }],
    ["eine Angabe", { zeile: { ...zeile, art: "ANGABE" } }],
    ["eine gestrichene Zeile", { zeile: { ...zeile, gestrichenAm: utc("2027-01-20T10:00:00Z") } }],
  ])("kein Feld für %s", (_fall, teil) => {
    expect(bauen({ ...teil, ausgaben: [stueck()] })).toBeNull();
  });

  it("nur noch ausgegebene Stücke DIESER Stelle; die Kennung einer anderen Stelle fehlt", () => {
    const r = bauen({
      ausgaben: [
        stueck({ id: "a-1" }),
        stueck({ id: "a-verbleibt", zustand: "VERBLEIBT", quelle: "HR", kennung: null }),
        stueck({ id: "a-ersetzt", zustand: "ERSETZT" }),
        stueck({ id: "a-zurueck", zustand: "ZURUECK" }),
        stueck({ id: "a-fremd", departmentKey: "VERWALTUNG", kennung: "FREMD-1" }),
      ],
    });
    expect(r?.stuecke.map((s) => s.id)).toEqual(["a-1", "a-verbleibt"]);
    expect(JSON.stringify(r)).not.toContain("FREMD-1");
  });

  it("entfernbar nur ein eigener Link-Vermerk, AUSGEGEBEN, ohne bindenden Austritt (G6, G28)", () => {
    const r = bauen({
      ausgaben: [
        stueck({ id: "a-link" }),
        stueck({ id: "a-hr", quelle: "HR" }),
        stueck({ id: "a-verbleibt", zustand: "VERBLEIBT" }),
        stueck({ id: "a-gebunden", bezuege: [{ offboardingId: "off-1", status: "INITIATED" }] }),
        stueck({ id: "a-abgebrochen", bezuege: [{ offboardingId: "off-2", status: "CANCELLED" }] }),
      ],
    });
    expect(Object.fromEntries((r?.stuecke ?? []).map((s) => [s.id, s.entfernbar]))).toEqual({
      "a-link": true,
      "a-hr": false,
      "a-verbleibt": false,
      "a-gebunden": false,
      "a-abgebrochen": true,
    });
  });

  it("moeglich: nicht an einer entfallenen Aufgabe, nicht ab der Grenze aktiver Stücke (auch fremder Stellen)", () => {
    expect(bauen({ aufgabe: { ...aufgabe, entfaelltAm: utc("2027-01-20T10:00:00Z") } })?.moeglich).toBe(false);
    const voll = Array.from({ length: AUSGABE_GRENZEN.aktiveJeAufgabe }, (_, i) =>
      stueck({ id: `a-${i}`, departmentKey: i === 0 ? "VERWALTUNG" : "IT" }),
    );
    expect(bauen({ ausgaben: voll })?.moeglich).toBe(false);
    expect(bauen({ ausgaben: voll.slice(1) })?.moeglich).toBe(true);
    // Fruehere Stuecke zaehlen nicht gegen die Grenze.
    expect(bauen({ ausgaben: [...voll.slice(1), stueck({ id: "alt", zustand: "ERSETZT" })] })?.moeglich).toBe(true);
  });

  it("bleibt reines JSON", () => {
    const r = bauen({ ausgaben: [stueck()] });
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });

  it("linkStueckText: dieselbe Zeile wie in der Mail an HR (G9)", () => {
    expect(linkStueckText({ kennung: "FES-IPAD-0412", uebergebenAm: "2027-01-28" }, "RUECKGABE")).toBe(
      "FES-IPAD-0412 · übergeben 28.01.2027",
    );
    expect(linkStueckText({ kennung: null, uebergebenAm: "2027-01-28" }, "SPERREN")).toBe("eingerichtet 28.01.2027");
    expect(linkStueckText({ kennung: "X-1", uebergebenAm: "2027-01-28" }, "RUECKGABE")).toBe(
      ausgabeVermerkMailFelder([{ kennung: "X-1", uebergebenAm: "2027-01-28" }]).ausgabe_vermerk,
    );
  });
});

describe("protokollAnzeige / ausgabenMitRueckgabe (G19)", () => {
  it("nur aktive Stücke mit RUECKGABE zählen", () => {
    expect(
      ausgabenMitRueckgabe([
        { zustand: "AUSGEGEBEN", beiAustritt: "RUECKGABE" },
        { zustand: "VERBLEIBT", beiAustritt: "RUECKGABE" },
        { zustand: "ZURUECK", beiAustritt: "RUECKGABE" },
        { zustand: "AUSGEGEBEN", beiAustritt: "SPERREN" },
      ]),
    ).toBe(2);
  });

  it("Text und ISO-Zeitpunkt; nicht nötig = kein Text", () => {
    expect(protokollAnzeige("UEBERGABE", { noetig: false, hochgeladenAm: null })).toEqual({
      art: "UEBERGABE",
      noetig: false,
      hochgeladenAm: null,
      text: null,
    });
    expect(protokollAnzeige("UEBERGABE", { noetig: true, hochgeladenAm: utc("2027-03-31T22:30:00Z") })).toEqual({
      art: "UEBERGABE",
      noetig: true,
      hochgeladenAm: "2027-03-31T22:30:00.000Z",
      text: "Unterschriebenes Übergabeprotokoll: hochgeladen am 01.04.2027",
    });
  });
});

describe("Unterschriebenes Übergabeprotokoll hochladen (S34)", () => {
  it("nimmt nur UEBERGABEPROTOKOLL an – einen Typ, den die Person im Fragebogen nie sieht", () => {
    expect(PROTOKOLL_UPLOAD_TYP).toBe("UEBERGABEPROTOKOLL");
    expect(SELECTABLE_DOCUMENT_TYPES).not.toContain(PROTOKOLL_UPLOAD_TYP);
  });

  it("9 MB je Datei; die ganze Anfrage bleibt unter der 10-MiB-Grenze der Middleware", () => {
    expect(PROTOKOLL_MAX_BYTES).toBe(9 * 1024 * 1024);
    expect(PROTOKOLL_MAX_ANFRAGE_BYTES).toBeGreaterThan(PROTOKOLL_MAX_BYTES);
    expect(PROTOKOLL_MAX_ANFRAGE_BYTES).toBeLessThan(10 * 1024 * 1024);
  });

  it("protokollDateiGrund: leer, genau an der Grenze erlaubt, darueber zu gross", () => {
    expect(protokollDateiGrund(0)).toBe("LEER");
    expect(protokollDateiGrund(-1)).toBe("LEER");
    expect(protokollDateiGrund(Number.NaN)).toBe("LEER");
    expect(protokollDateiGrund(1)).toBeNull();
    expect(protokollDateiGrund(PROTOKOLL_MAX_BYTES)).toBeNull();
    expect(protokollDateiGrund(PROTOKOLL_MAX_BYTES + 1)).toBe("ZU_GROSS");
  });

  it("protokollDateiGrundText nennt den Grund", () => {
    expect(protokollDateiGrundText("LEER")).toBe(PROTOKOLL_UPLOAD_MELDUNGEN.LEER);
    expect(protokollDateiGrundText("ZU_GROSS")).toBe(PROTOKOLL_UPLOAD_MELDUNGEN.ZU_GROSS);
    expect(PROTOKOLL_UPLOAD_MELDUNGEN.ZU_GROSS).toContain("9 MB");
  });

  it("die Auswahl bietet genau die Typen an, die erkenneDateityp annimmt", () => {
    expect(PROTOKOLL_ACCEPT.split(",").filter((t) => t.includes("/")).sort()).toEqual(
      ["application/pdf", "image/jpeg", "image/png", "image/webp"],
    );
  });

  it("Texte ohne Anrede (Portal), Knopf mit dem Namen aus dem Feinplan", () => {
    expect(PROTOKOLL_UPLOAD_MELDUNGEN.KNOPF).toBe("Unterschriebenes Übergabeprotokoll hochladen");
    for (const text of Object.values(PROTOKOLL_UPLOAD_MELDUNGEN)) {
      expect(text).not.toMatch(/\b(du|Sie|Ihr|Ihre|dein|deine)\b/);
    }
  });
});

describe("ausgabeKalendertag", () => {
  it("@db.Date (Mitternacht UTC) und YYYY-MM-DD ergeben denselben Tag; leer bzw. unlesbar null", () => {
    expect(ausgabeKalendertag(utc("2027-01-28T00:00:00Z"))).toBe("2027-01-28");
    expect(ausgabeKalendertag("2027-01-28")).toBe("2027-01-28");
    expect(ausgabeKalendertag(null)).toBeNull();
    expect(ausgabeKalendertag("kaputt")).toBeNull();
  });
});

describe("Meldungen der Karte (S24)", () => {
  it("AUSGABE_VORHANDEN ist derselbe Text wie in ausstattung.ts (eine Quelle)", () => {
    expect(MELDUNGEN_AUSGABEN.AUSGABE_VORHANDEN).toBe(AUSSTATTUNG_MELDUNGEN.AUSGABE_VORHANDEN);
  });

  it("Erfolgsmeldungen ohne Anrede, Einzahl und Mehrzahl", () => {
    expect(MELDUNGEN_AUSGABEN.VERMERKT(1)).toBe("Übergabe vermerkt.");
    expect(MELDUNGEN_AUSGABEN.VERMERKT(3)).toBe("Übergabe vermerkt (3 Stück).");
    expect(MELDUNGEN_AUSGABEN.VERMERKT(1, "RUECKGABE")).toBe("Übergabe vermerkt.");
    expect(MELDUNGEN_AUSGABEN.KORRIGIERT()).toBe("Übergabevermerk korrigiert.");
    expect(MELDUNGEN_AUSGABEN.ENTFERNT("RUECKGABE")).toBe("Übergabevermerk entfernt.");
    expect(MELDUNGEN_AUSGABEN.ZURUECKGENOMMEN("beschädigt zurück", "RUECKGABE")).toBe("Rücknahme vermerkt: beschädigt zurück.");
    for (const text of [
      MELDUNGEN_AUSGABEN.KORRIGIERT(),
      MELDUNGEN_AUSGABEN.ENTFERNT(),
      MELDUNGEN_AUSGABEN.ZUGANG_NUR_GESPERRT,
      MELDUNGEN_AUSGABEN.ZUGANG_KEIN_TAUSCH,
    ]) {
      expect(text).not.toMatch(/\b(du|Sie)\b/);
    }
  });

  it("ein Zugang (SPERREN) wird eingerichtet und gesperrt, nie „übergeben“ (G4) – dieselben Wörter wie Knopf und Dialog", () => {
    expect(MELDUNGEN_AUSGABEN.VERMERKT(1, "SPERREN")).toBe("Einrichtung vermerkt.");
    expect(MELDUNGEN_AUSGABEN.VERMERKT(2, "SPERREN")).toBe("Einrichtung vermerkt (2 Stück).");
    expect(MELDUNGEN_AUSGABEN.KORRIGIERT("SPERREN")).toBe("Einrichtungsvermerk korrigiert.");
    expect(MELDUNGEN_AUSGABEN.ENTFERNT("SPERREN")).toBe("Einrichtungsvermerk entfernt.");
    expect(MELDUNGEN_AUSGABEN.ZURUECKGENOMMEN("gesperrt", "SPERREN")).toBe("Sperrung vermerkt.");
    expect(MELDUNGEN_AUSGABEN.EINRICHTUNG_NICHT_VERMERKT).toBe("Einrichtung nicht vermerkt");
    expect(MELDUNGEN_AUSGABEN.EINRICHTUNG_NOCH_NICHT_VERMERKT).toBe("Einrichtung noch nicht vermerkt");
    // Das Datum gilt fuer Uebergabe UND Einrichtung – die Meldungen sagen nur „Datum“.
    for (const text of [MELDUNGEN_AUSGABEN.DATUM_IN_ZUKUNFT, MELDUNGEN_AUSGABEN.DATUM_ZU_FRUEH, MELDUNGEN_AUSGABEN.KORREKTUR_LEER]) {
      expect(text).not.toContain("Übergabe");
    }
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

// =============================================
// S29 – Uebernahme in den Austritt und Reiter „Rückgaben“ (G13, G14)
// =============================================

describe("rueckgabeEntwurf (G14)", () => {
  const basis = { id: "ag-1", bezeichnung: "Dienst-iPad (Lernmittel)", beiAustritt: "RUECKGABE" };

  it("Gegenstand: Kategorie, Bezeichnung, Kennung als Seriennummer – offen", () => {
    expect(rueckgabeEntwurf({ ...basis, kennung: " FES-IPAD-0412 ", rueckgabeKategorie: "IT_HARDWARE" })).toEqual({
      category: "IT_HARDWARE",
      itemName: "Dienst-iPad (Lernmittel)",
      serialNumber: "FES-IPAD-0412",
      ausgabeId: "ag-1",
    });
  });

  it("ohne bzw. mit unbekannter Kategorie SONSTIGES; leere Kennung null", () => {
    expect(rueckgabeEntwurf({ ...basis, rueckgabeKategorie: null, kennung: "" })).toMatchObject({
      category: "SONSTIGES",
      serialNumber: null,
    });
    expect(rueckgabeEntwurf({ ...basis, rueckgabeKategorie: "WEG" })?.category).toBe("SONSTIGES");
    for (const k of RUECKGABE_KATEGORIEN) expect(rueckgabeEntwurf({ ...basis, rueckgabeKategorie: k })?.category).toBe(k);
  });

  it("ein Zugang (SPERREN) bekommt keine Rückgabe-Zeile", () => {
    expect(rueckgabeEntwurf({ ...basis, beiAustritt: "SPERREN", kennung: "konto.x" })).toBeNull();
  });
});

describe("uebernahmePlan (G14, Feinplan 1.7 Schritt 3.7)", () => {
  const HEUTE = "2027-07-20";
  const stueck = (id: string, teil: Record<string, unknown> = {}) => ({
    id,
    bezeichnung: `Stück ${id}`,
    beiAustritt: "RUECKGABE",
    departmentKey: "IT",
    kennung: `K-${id}`,
    rueckgabeKategorie: "IT_HARDWARE",
    ...teil,
  });
  const plan = (
    ausgaben: ReturnType<typeof stueck>[],
    vorhanden = { aufgaben: [] as string[], rueckgaben: [] as string[] },
    startIndex = 0,
  ) =>
    uebernahmePlan({
      ausgaben,
      vorhanden,
      letzterArbeitstag: new Date("2027-07-31T00:00:00.000Z"),
      heute: HEUTE,
      startIndex,
    });

  it("je Gegenstand Aufgabe und Rückgabe, je Zugang nur die Aufgabe; Stellen einmal, in Reihenfolge", () => {
    const p = plan([stueck("a"), stueck("b", { beiAustritt: "SPERREN", departmentKey: "VERWALTUNG" }), stueck("c")]);
    expect(p.aufgaben.map((a) => [a.ausgabeId, a.title, a.orderIndex])).toEqual([
      ["a", "Stück a zurücknehmen", ORDER_BASIS],
      ["b", "Stück b sperren", ORDER_BASIS + 1],
      ["c", "Stück c zurücknehmen", ORDER_BASIS + 2],
    ]);
    expect(p.rueckgaben.map((r) => r.ausgabeId)).toEqual(["a", "c"]);
    expect(p.stellen).toEqual(["IT", "VERWALTUNG"]);
    expect({ r: p.rueckgabenNeu, s: p.sperraufgabenNeu }).toEqual({ r: 2, s: 1 });
    // Kennung nie im Titel oder in der Beschreibung (G14).
    expect(JSON.stringify(p.aufgaben)).not.toContain("K-");
    expect(p.aufgaben[0].dueDate.toISOString()).toBe("2027-07-31T00:00:00.000Z");
  });

  it("nur, was fehlt: vorhandene Aufgabe bzw. Rückgabe wird nicht wieder angelegt; `startIndex` reiht dahinter", () => {
    const p = plan([stueck("a"), stueck("b"), stueck("c")], { aufgaben: ["a", "b"], rueckgaben: ["a"] }, 2);
    expect(p.aufgaben.map((a) => [a.ausgabeId, a.orderIndex])).toEqual([["c", ORDER_BASIS + 2]]);
    // b hat seine Aufgabe, aber keine Rueckgabe-Zeile: nur die fehlt.
    expect(p.rueckgaben.map((r) => r.ausgabeId)).toEqual(["b", "c"]);
    expect(p.stellen).toEqual(["IT"]);
    expect({ r: p.rueckgabenNeu, s: p.sperraufgabenNeu }).toEqual({ r: 2, s: 0 });
  });

  it("alles schon da: leerer Plan; doppelte Stücke und solche ohne RUECKGABE/SPERREN fallen weg", () => {
    expect(plan([stueck("a")], { aufgaben: ["a"], rueckgaben: ["a"] })).toEqual({
      aufgaben: [],
      rueckgaben: [],
      stellen: [],
      rueckgabenNeu: 0,
      sperraufgabenNeu: 0,
    });
    const p = plan([stueck("a"), stueck("a"), stueck("n", { beiAustritt: "NICHTS" })]);
    expect(p.aufgaben.map((a) => a.ausgabeId)).toEqual(["a"]);
  });
});

describe("ausgabeKurz / rueckgabeVorschlagAnzeige (Vorschau und Hinweise, E-A35)", () => {
  const stellen = { IT: "IT-Abteilung" };
  const orte = { "org-gym": "FES Gymnasium" };
  const a = (
    id: string,
    teil: Partial<AusgabeKurzDaten & VorschlagAusgabe> = {},
  ): AusgabeKurzDaten & VorschlagAusgabe => ({
    id,
    bezeichnung: `Stück ${id}`,
    beiAustritt: "RUECKGABE",
    kennung: `K-${id}`,
    kennungLabel: "Inventarnummer",
    departmentKey: "IT",
    organizationId: "org-gym",
    zentral: false,
    zustand: "AUSGEGEBEN",
    uebergebenAm: new Date("2027-01-28T00:00:00.000Z"),
    ...teil,
  });

  it("Bezeichnung, Kennung, Stelle, Einrichtung und „übergeben … · Stelle“; ohne Datum nur die Stelle", () => {
    expect(ausgabeKurz(a("x"), { stellenNamen: stellen, einrichtungen: orte })).toEqual({
      ausgabeId: "x",
      bezeichnung: "Stück x",
      art: "RUECKGABE",
      kennung: "K-x",
      kennungLabel: "Inventarnummer",
      departmentKey: "IT",
      stelle: "IT-Abteilung",
      zentral: false,
      einrichtung: "FES Gymnasium",
      text: "übergeben 28.01.2027 · IT-Abteilung",
    });
    const zugang = ausgabeKurz(
      a("z", {
        beiAustritt: "SPERREN",
        kennung: null,
        kennungLabel: null,
        departmentKey: "FACILITY",
        organizationId: "org-x",
        uebergebenAm: null,
      }),
      { stellenNamen: stellen, einrichtungen: orte },
    );
    expect(zugang).toMatchObject({
      kennung: null,
      kennungLabel: "Kennung",
      stelle: "Facility Management",
      einrichtung: null,
      text: "Facility Management",
    });
    expect(ausgabeKurz(a("e", { beiAustritt: "SPERREN" }), { stellenNamen: stellen, einrichtungen: orte }).text).toBe(
      "eingerichtet 28.01.2027 · IT-Abteilung",
    );
  });

  it("trennt Gegenstände und Zugänge, lässt Übernommenes weg und nennt fremde Austritte ohne Kennung", () => {
    const ergebnis = {
      vorschlag: [a("g1"), a("z1", { beiAustritt: "SPERREN" }), a("g2")],
      hinweisZentral: [a("h1", { zentral: true })],
      hinweisAndereEinrichtung: [a("h2", { organizationId: "org-gs" })],
      schonImAustritt: [{ offboardingId: "off-2", displayId: null, anzahl: 2 }],
    };
    const anzeige = rueckgabeVorschlagAnzeige(ergebnis, {
      stellenNamen: stellen,
      einrichtungen: orte,
      uebernommen: ["g2", "h1"],
    });
    expect(anzeige.rueckgaben.map((x) => x.ausgabeId)).toEqual(["g1"]);
    expect(anzeige.sperraufgaben.map((x) => x.ausgabeId)).toEqual(["z1"]);
    expect(anzeige.hinweisZentral).toEqual([]);
    expect(anzeige.hinweisAndereEinrichtung.map((x) => [x.ausgabeId, x.einrichtung])).toEqual([["h2", null]]);
    expect(anzeige.schonImAustritt).toEqual([
      { offboardingId: "off-2", displayId: null, anzahl: 2, text: "2 Stücke laufen in einem anderen Austritt." },
    ]);
  });
});

describe("sperraufgabenZeilen (Mockup 6.8)", () => {
  const aufgabe = (teil: Record<string, unknown>) => ({
    title: "x sperren",
    isCompleted: false,
    herkunft: "AUSGABE" as string | null,
    ausgabeId: null as string | null,
    assigneeDepartment: "IT" as string | null,
    ...teil,
  });

  it("je Stelle eine Zeile: nur Ausgabe-Aufgaben ohne Rückgabe-Zeile; gesperrte mit Vermerk; Personalabteilung im Portal, zuletzt", () => {
    const zeilen = sperraufgabenZeilen({
      aufgaben: [
        aufgabe({ ausgabeId: "z1" }),
        aufgabe({ ausgabeId: "z2", isCompleted: true }),
        // Gegenstand (hat eine Rueckgabe-Zeile) – keine Sperraufgabe
        aufgabe({ title: "iPad zurücknehmen", ausgabeId: "g1" }),
        aufgabe({ title: "Dienstwagen sperren", ausgabeId: "z3", assigneeDepartment: "HR" }),
        // Folgeaufgabe und Vorlagenpunkt zaehlen nicht
        aufgabe({ title: "Schließung prüfen: Schlüssel", herkunft: "AUSGABE_FEHLT", ausgabeId: "g1" }),
        aufgabe({ title: "Konto sperren", herkunft: null }),
      ],
      rueckgaben: [{ ausgabeId: "g1" }, { ausgabeId: null }],
      ausgaben: [
        { id: "z1", bezeichnung: "Zugänge: Schulportal" },
        { id: "z2", bezeichnung: "Zugänge: WebUntis" },
      ],
      stellenNamen: { IT: "IT-Abteilung" },
    });
    expect(zeilen.map((z) => [z.departmentKey, z.offen, z.text])).toEqual([
      [
        "IT",
        1,
        "Sperraufgaben zum letzten Arbeitstag – IT-Abteilung, über den Offboarding-Link: Zugänge: Schulportal und Zugänge: WebUntis (gesperrt)",
      ],
      // Ausgabe nach Ablauf der Frist geloescht: dann der Aufgabentitel.
      ["HR", 1, "Sperraufgaben zum letzten Arbeitstag – Personalabteilung, im Portal: Dienstwagen sperren"],
    ]);
    expect(zeilen[0].zugaenge).toEqual([
      { titel: "Zugänge: Schulportal", erledigt: false },
      { titel: "Zugänge: WebUntis", erledigt: true },
    ]);
  });

  it("ohne Sperraufgabe keine Zeile", () => {
    expect(sperraufgabenZeilen({ aufgaben: [], rueckgaben: [], ausgaben: [], stellenNamen: {} })).toEqual([]);
  });
});

describe("rueckgabeZeilenBauen (Reiter „Rückgaben“, G15)", () => {
  const ausgabe: AusgabeZeilenDaten & { departmentKey: string } = {
    id: "ag-ipad",
    zustand: "AUSGEGEBEN",
    beiAustritt: "RUECKGABE",
    kennung: "FES-IPAD-0412",
    kennungLabel: "Inventarnummer",
    uebergebenAm: new Date("2027-01-28T00:00:00.000Z"),
    quelle: "LINK",
    departmentKey: "IT",
    bezuege: [{ offboardingId: "off-1", status: "HANDOVER_PHASE" }],
  };
  const rueckgabe = (teil: Record<string, unknown> = {}) => ({
    id: "r-1",
    category: "IT_HARDWARE",
    itemName: "Dienst-iPad (Lernmittel)",
    serialNumber: "FES-IPAD-0412" as string | null,
    zustand: null as string | null,
    isReturned: false,
    returnedAt: null as Date | null,
    ausgabeId: "ag-ipad" as string | null,
    ...teil,
  });
  const bauen = (
    rueckgaben: ReturnType<typeof rueckgabe>[],
    darfBearbeiten = true,
    ausgaben = [ausgabe],
    austrittStatus?: string,
  ) =>
    rueckgabeZeilenBauen({
      rueckgaben,
      aufgaben: [{ herkunft: "AUSGABE", ausgabeId: "ag-ipad", assigneeDepartment: "IT" }],
      ausgaben,
      stellenNamen: { IT: "IT-Abteilung" },
      austrittId: "off-1",
      darfBearbeiten,
      austrittStatus,
    });

  it("vorgeschlagene Zeile: Stelle und Übergabe, Kennung korrigierbar (eigener Austritt), nicht löschbar", () => {
    expect(bauen([rueckgabe()])[0]).toEqual({
      id: "r-1",
      category: "IT_HARDWARE",
      kategorieLabel: "IT-Hardware",
      itemName: "Dienst-iPad (Lernmittel)",
      serialNumber: "FES-IPAD-0412",
      kennungLabel: "Inventarnummer",
      zustand: null,
      zustandLabel: "offen",
      offen: true,
      returnedAt: null,
      condition: null,
      notes: null,
      vorgeschlagen: true,
      ausgabeId: "ag-ipad",
      departmentKey: "IT",
      stelle: "IT-Abteilung",
      uebergabe: "übergeben 28.01.2027 · IT-Abteilung",
      sperrGrund: null,
      aktionen: { korrigieren: true, loeschen: false },
      zustandWaehlbar: true,
      zustandSperrGrund: null,
      folgeBeiFehlt: false,
    });
  });

  it("bindet ein anderer laufender Austritt das Stück: keine Korrektur, Sperrgrund ohne Kennung", () => {
    const gebunden = {
      ...ausgabe,
      bezuege: [{ offboardingId: "off-2", status: "INITIATED", displayId: "OFF-2027-GYM-0002" }],
    };
    const z = bauen([rueckgabe()], true, [gebunden])[0];
    expect(z.aktionen).toEqual({ korrigieren: false, loeschen: false });
    expect(z.sperrGrund).toBe(MELDUNGEN_AUSGABEN.AUSGABE_IM_AUSTRITT("OFF-2027-GYM-0002"));
    // S32: Auch den Zustand waehlt dieser Reiter dann nicht – der Server antwortete 409.
    expect(z.zustandWaehlbar).toBe(false);
    expect(z.zustandSperrGrund).toBe(MELDUNGEN_AUSGABEN.AUSGABE_IM_AUSTRITT("OFF-2027-GYM-0002"));
  });

  it("S32: abgeschlossener Austritt – ein offen gebliebenes Stück nimmt die späte Rückgabe an, ein mit „verbleibt“ freigegebenes nicht (Kennung bleibt korrigierbar)", () => {
    const abgeschlossen = (zustand: string) => ({
      ...ausgabe,
      zustand,
      bezuege: [{ offboardingId: "off-1", status: "COMPLETED" }],
    });
    const offen = bauen([rueckgabe()], true, [abgeschlossen("AUSGEGEBEN")], "COMPLETED")[0];
    expect(offen).toMatchObject({ zustandWaehlbar: true, zustandSperrGrund: null });

    const frei = bauen([rueckgabe({ zustand: "VERBLEIBT" })], true, [abgeschlossen("VERBLEIBT")], "COMPLETED")[0];
    expect(frei.zustandWaehlbar).toBe(false);
    expect(frei.zustandSperrGrund).toBe(MELDUNGEN_AUSGABEN.AUSGABE_FREIGEGEBEN);
    expect(frei.aktionen.korrigieren).toBe(true);

    // Laufend (oder ohne Status) bindet der Austritt auch ein VERBLEIBT-Stück noch selbst.
    const laufend = bauen([rueckgabe({ zustand: "VERBLEIBT" })], true, [{ ...ausgabe, zustand: "VERBLEIBT" }])[0];
    expect(laufend.zustandWaehlbar).toBe(true);
  });

  it("S32: „fehlt“ legt nur an einer Zeile aus der Einstellung mit Kategorie SCHLUESSEL eine Folgeaufgabe an", () => {
    const [schluessel, hand] = bauen([
      rueckgabe({ category: "SCHLUESSEL" }),
      rueckgabe({ id: "r-2", category: "SCHLUESSEL", ausgabeId: null }),
    ]);
    expect(schluessel.folgeBeiFehlt).toBe(true);
    expect(hand.folgeBeiFehlt).toBe(false);
    expect(bauen([rueckgabe()])[0].folgeBeiFehlt).toBe(false);
  });

  it("von HR erfasste Zeile: Personalabteilung, ohne Übergabe, korrigier- und löschbar; Altbestand `isReturned` = zurück", () => {
    const [z] = bauen([
      rueckgabe({ ausgabeId: null, serialNumber: null, isReturned: true, returnedAt: new Date("2027-07-29T08:00:00.000Z") }),
    ]);
    expect(z).toMatchObject({
      vorgeschlagen: false,
      departmentKey: "HR",
      stelle: "Personalabteilung",
      uebergabe: null,
      kennungLabel: "Kennung",
      zustand: "ZURUECK",
      zustandLabel: "zurück",
      offen: false,
      returnedAt: "2027-07-29T08:00:00.000Z",
      aktionen: { korrigieren: true, loeschen: true },
    });
  });

  it("ohne Bearbeitungsrecht (abgebrochener Austritt): keine Aktionen; Zustand FEHLT mit Wort", () => {
    const [vorgeschlagen, hand] = bauen(
      [rueckgabe({ zustand: "FEHLT" }), rueckgabe({ id: "r-2", ausgabeId: null })],
      false,
    );
    expect(vorgeschlagen.aktionen).toEqual({ korrigieren: false, loeschen: false });
    expect(vorgeschlagen.zustandLabel).toBe("fehlt");
    expect(hand.aktionen).toEqual({ korrigieren: false, loeschen: false });
    // Ohne Recht auch kein Zustand – und kein Sperrgrund (nichts, was HR erklaert werden muesste).
    expect([vorgeschlagen.zustandWaehlbar, hand.zustandWaehlbar]).toEqual([false, false]);
    expect(vorgeschlagen.zustandSperrGrund).toBeNull();
  });
});

describe("loesenGesperrt / loesenStand (G11)", () => {
  const aufgaben = [
    { herkunft: "AUSGABE", isCompleted: false, assigneeDepartment: "IT" },
    { herkunft: "AUSGABE", isCompleted: false, assigneeDepartment: "FACILITY" },
    { herkunft: null, isCompleted: true, assigneeDepartment: "IT" },
  ];
  const rueckgaben = [
    { ausgabeId: "ag-1", zustand: null, isReturned: false },
    { ausgabeId: null, zustand: "ZURUECK", isReturned: true },
  ];

  it("frei, solange nichts Vorgeschlagenes erledigt ist – Vorlagenpunkte und Handzeilen zählen nicht", () => {
    expect(loesenGesperrt({ aufgaben, rueckgaben })).toBe(false);
  });

  it("gesperrt bei erledigter Ausgabe- oder Folgeaufgabe bzw. vorgeschlagener Rückgabe mit Zustand (auch Altbestand)", () => {
    expect(loesenGesperrt({ aufgaben: [{ herkunft: "AUSGABE_FEHLT", isCompleted: true }], rueckgaben: [] })).toBe(true);
    expect(
      loesenGesperrt({ aufgaben: [], rueckgaben: [{ ausgabeId: "ag-1", zustand: "VERBLEIBT", isReturned: false }] }),
    ).toBe(true);
    expect(loesenGesperrt({ aufgaben: [], rueckgaben: [{ ausgabeId: "ag-1", zustand: null, isReturned: true }] })).toBe(true);
  });

  it("Rückfrage nennt die Aufgaben und nur die informierten Stellen dieser Aufgaben", () => {
    const stand = loesenStand({
      aufgaben,
      rueckgaben,
      links: [
        { departmentKey: "IT", sentAt: new Date("2027-07-01T08:00:00.000Z") },
        { departmentKey: "FACILITY", sentAt: null, lastSentAt: null },
        { departmentKey: "VERWALTUNG", sentAt: new Date("2027-07-01T08:00:00.000Z") },
      ],
    });
    expect(stand).toEqual({
      aufgaben: 2,
      informierteStellen: 1,
      rueckfrage: MELDUNGEN_AUSGABEN.LOESEN_RUECKFRAGE(2, 1),
      sperrGrund: null,
    });
    expect(
      loesenStand({
        aufgaben: [{ herkunft: "AUSGABE", isCompleted: true, assigneeDepartment: "IT" }],
        rueckgaben: [],
        links: [],
      }).sperrGrund,
    ).toBe(MELDUNGEN_AUSGABEN.LOESEN_GESPERRT);
  });
});

describe("Meldungen der Rückgaben im Offboarding (S29)", () => {
  it("UEBERNOMMEN: nur die Teile mit Zahl, ohne neue Zeile leer", () => {
    expect(MELDUNGEN_AUSGABEN.UEBERNOMMEN(3, 1)).toBe("3 Rückgaben und 1 Sperraufgabe übernommen.");
    expect(MELDUNGEN_AUSGABEN.UEBERNOMMEN(1, 0)).toBe("1 Rückgabe übernommen.");
    expect(MELDUNGEN_AUSGABEN.UEBERNOMMEN(0, 2)).toBe("2 Sperraufgaben übernommen.");
    expect(MELDUNGEN_AUSGABEN.UEBERNOMMEN(0, 0)).toBe("");
  });

  it("Herausgefallen, als ausgegeben übernommen, übersprungen, Merker – Einzahl und Mehrzahl", () => {
    expect(MELDUNGEN_AUSGABEN.HERAUSGEFALLEN(1)).toBe("1 Stück hat sich inzwischen geändert und wurde nicht übernommen.");
    expect(MELDUNGEN_AUSGABEN.HERAUSGEFALLEN(2)).toBe(
      "2 Stücke haben sich inzwischen geändert und wurden nicht übernommen.",
    );
    expect(MELDUNGEN_AUSGABEN.ALS_AUSGEGEBEN_UEBERNOMMEN(1)).toBe("1 Aufgabe als ausgegeben übernommen.");
    expect(MELDUNGEN_AUSGABEN.ALS_AUSGEGEBEN_UEBERNOMMEN(3)).toBe("3 Aufgaben als ausgegeben übernommen.");
    expect(MELDUNGEN_AUSGABEN.OHNE_VERMERK_UEBERSPRUNGEN(2)).toMatch(/^2 Aufgaben haben inzwischen einen Vermerk/);
    expect(MELDUNGEN_AUSGABEN.MERKER_GESPEICHERT(true)).toContain("bleibt in einer anderen Beschäftigung");
    expect(MELDUNGEN_AUSGABEN.MERKER_GESPEICHERT(false)).toContain("in keiner anderen Beschäftigung");
  });

  it("Sperraufgaben-Zeile ohne Artikel vor dem Namen der Stelle; Portal-Fehler", () => {
    expect(MELDUNGEN_AUSGABEN.SPERRAUFGABEN("IT-Abteilung", "A und B", true)).toBe(
      "Sperraufgaben zum letzten Arbeitstag – IT-Abteilung, über den Offboarding-Link: A und B",
    );
    expect(MELDUNGEN_AUSGABEN.SPERRAUFGABEN("Personalabteilung", "A", false)).toContain(", im Portal: A");
    expect(MELDUNGEN_AUSGABEN.PORTAL_NUR_HR).toBe("Rücknahme- und Sperraufgaben bearbeitet nur die Personalabteilung.");
    expect(MELDUNGEN_AUSGABEN.STELLE_FEST).toContain("ausgebende Stelle");
  });
});

describe("einstellungSucheSchema: Merker der Vorschau (S29)", () => {
  it('"true"/"false" werden Wahrheitswerte, leer = nicht angegeben, anderes = 400', () => {
    expect(einstellungSucheSchema.parse({ vorschau: "onb-1", weitereBeschaeftigung: "true" })).toEqual({
      vorschau: "onb-1",
      weitereBeschaeftigung: true,
    });
    expect(einstellungSucheSchema.parse({ weitereBeschaeftigung: "false" })).toEqual({ weitereBeschaeftigung: false });
    expect(einstellungSucheSchema.parse({ weitereBeschaeftigung: "" })).toEqual({});
    expect(einstellungSucheSchema.safeParse({ weitereBeschaeftigung: "ja" }).success).toBe(false);
  });
});

// =============================================
// S30: Zustaende und Gleichlauf (G15 bis G17)
// =============================================

describe("rueckgabeZiel (G15: Haken und Wahl an Link und Portal)", () => {
  it.each([
    // [warErledigt, isCompleted, zustand, Ziel]
    [false, true, undefined, "ZURUECK"], // abhaken ohne Zustand = ZURUECK
    [false, true, "FEHLT", "FEHLT"],
    [false, undefined, "BESCHAEDIGT", "BESCHAEDIGT"], // Portal: ein Zustand allein haket ab
    [true, true, "FEHLT", "FEHLT"], // reiner Wechsel an einer erledigten Aufgabe
    [true, undefined, "ZURUECK", "ZURUECK"],
    [true, false, undefined, null], // wieder oeffnen
    [true, true, undefined, undefined], // zweites „erledigt“: nichts
    [false, false, undefined, undefined], // „offen“ an einer offenen: nichts
    [false, undefined, undefined, undefined], // nur Kommentar oder Notiz
  ] as const)("erledigt=%s, isCompleted=%s, zustand=%s → %s", (warErledigt, isCompleted, zustand, ziel) => {
    expect(rueckgabeZiel({ warErledigt, isCompleted, zustand })).toBe(ziel);
  });
});

describe("rueckgabeZielAusEingabe (G16: Reiter, Altform `isReturned`)", () => {
  it("`zustand` gilt (auch `null` = offen), sonst `isReturned` (true = ZURUECK, false = offen), sonst nichts", () => {
    expect(rueckgabeZielAusEingabe({ zustand: "VERBLEIBT" })).toBe("VERBLEIBT");
    expect(rueckgabeZielAusEingabe({ zustand: null })).toBeNull();
    expect(rueckgabeZielAusEingabe({ isReturned: true })).toBe("ZURUECK");
    expect(rueckgabeZielAusEingabe({ isReturned: false })).toBeNull();
    expect(rueckgabeZielAusEingabe({})).toBeUndefined();
  });
});

describe("zustandFehler (G15, 1.2)", () => {
  it("ohne Zustand nie; ohne Gegenstand (Vorlage, Folgeaufgabe) immer ZUSTAND_NICHT_MOEGLICH", () => {
    expect(zustandFehler({ art: null, zustand: undefined, weg: "LINK" })).toBeNull();
    expect(zustandFehler({ art: null, zustand: null, weg: "HR" })).toBeNull();
    for (const weg of ["LINK", "HR"] as const) {
      expect(zustandFehler({ art: null, zustand: "ZURUECK", weg })).toBe("ZUSTAND_NICHT_MOEGLICH");
    }
  });

  it("Gegenstand: jeder Zustand; Zugang über den Link nie, im Portal nur gesperrt, verbleibt, entfällt", () => {
    for (const zustand of RUECKGABE_ZUSTAENDE) {
      expect(zustandFehler({ art: "RUECKGABE", zustand, weg: "HR" })).toBeNull();
      expect(zustandFehler({ art: "RUECKGABE", zustand, weg: "LINK" })).toBeNull();
      expect(zustandFehler({ art: "SPERREN", zustand, weg: "LINK" })).toBe("ZUSTAND_NICHT_MOEGLICH");
    }
    expect(zustandFehler({ art: "SPERREN", zustand: "ZURUECK", weg: "HR" })).toBeNull();
    expect(zustandFehler({ art: "SPERREN", zustand: "VERBLEIBT", weg: "HR" })).toBeNull();
    expect(zustandFehler({ art: "SPERREN", zustand: "ENTFAELLT", weg: "HR" })).toBeNull();
    expect(zustandFehler({ art: "SPERREN", zustand: "BESCHAEDIGT", weg: "HR" })).toBe("ZUGANG_NUR_GESPERRT");
    expect(zustandFehler({ art: "SPERREN", zustand: "FEHLT", weg: "HR" })).toBe("ZUGANG_NUR_GESPERRT");
  });
});

describe("ausgabeNachZiel / gleichlaufPlan (G15: drei Zeilen, ein Stand)", () => {
  it("„offen“ heißt aktiv: ein aktives Stück bleibt (auch VERBLEIBT aus einem früheren Austritt), sonst AUSGEGEBEN", () => {
    expect(ausgabeNachZiel(null, "AUSGEGEBEN")).toBe("AUSGEGEBEN");
    expect(ausgabeNachZiel(null, "VERBLEIBT")).toBe("VERBLEIBT");
    expect(ausgabeNachZiel(null, "FEHLT")).toBe("AUSGEGEBEN");
    expect(ausgabeNachZiel("FEHLT", "AUSGEGEBEN")).toBe("FEHLT");
  });

  it("Wiederöffnen nach einem HIER gesetzten „verbleibt“ setzt AUSGEGEBEN (G15, Review A4c)", () => {
    expect(ausgabeNachZiel(null, "VERBLEIBT", true)).toBe("AUSGEGEBEN");
    expect(ausgabeNachZiel(null, "VERBLEIBT", false)).toBe("VERBLEIBT");
    // Reiter: „verbleibt“, dann „offen“ – die Zeile trug den Zustand, also AUSGEGEBEN.
    expect(
      gleichlaufPlan({
        ziel: null,
        ausgabe: { zustand: "VERBLEIBT" },
        aufgabe: { isCompleted: true },
        rueckgabe: { zustand: "VERBLEIBT", isReturned: false },
      }),
    ).toEqual({ moeglich: true, ausgabe: "AUSGEGEBEN", rueckgabe: null, aufgabeErledigt: false, nach: "AUSGEGEBEN" });
    // Link-Weg (Aufgabe schon geschaltet, Zugang ohne Zeile): der Stand vorher kommt ausdrücklich mit.
    expect(
      gleichlaufPlan({ ziel: null, ausgabe: { zustand: "VERBLEIBT" }, aufgabe: null, rueckgabe: null, warErledigt: true }),
    ).toMatchObject({ ausgabe: "AUSGEGEBEN", nach: "AUSGEGEBEN" });
    expect(gleichlaufPlan({ ziel: null, ausgabe: { zustand: "VERBLEIBT" }, aufgabe: null, rueckgabe: null })).toMatchObject({
      ausgabe: null,
      nach: "VERBLEIBT",
    });
  });

  it("abhaken: Ausgabe, Rückgabe und Aufgabe folgen – nur, was sich ändert", () => {
    expect(
      gleichlaufPlan({
        ziel: "ZURUECK",
        ausgabe: { zustand: "AUSGEGEBEN" },
        aufgabe: { isCompleted: false },
        rueckgabe: { zustand: null, isReturned: false },
      }),
    ).toEqual({ moeglich: true, ausgabe: "ZURUECK", rueckgabe: "ZURUECK", aufgabeErledigt: true, nach: "ZURUECK" });
    // Der Link-Weg schaltet die Aufgabe selbst (`aufgabe: null`); ein Zugang hat keine Rueckgabe-Zeile.
    expect(gleichlaufPlan({ ziel: "ZURUECK", ausgabe: { zustand: "VERBLEIBT" }, aufgabe: null, rueckgabe: null })).toEqual({
      moeglich: true,
      ausgabe: "ZURUECK",
      rueckgabe: undefined,
      aufgabeErledigt: undefined,
      nach: "ZURUECK",
    });
  });

  it("wieder öffnen: AUSGEGEBEN, Rückgabe ohne Zustand, Aufgabe offen; schon offen = nichts", () => {
    expect(
      gleichlaufPlan({
        ziel: null,
        ausgabe: { zustand: "FEHLT" },
        aufgabe: { isCompleted: true },
        rueckgabe: { zustand: "FEHLT", isReturned: false },
      }),
    ).toEqual({ moeglich: true, ausgabe: "AUSGEGEBEN", rueckgabe: null, aufgabeErledigt: false, nach: "AUSGEGEBEN" });
    expect(
      gleichlaufPlan({
        ziel: null,
        ausgabe: { zustand: "VERBLEIBT" },
        aufgabe: { isCompleted: false },
        rueckgabe: { zustand: null, isReturned: false },
      }),
    ).toEqual({ moeglich: true, ausgabe: null, rueckgabe: undefined, aufgabeErledigt: undefined, nach: "VERBLEIBT" });
  });

  it("Altbestand (`isReturned` ohne Zustand) gilt als ZURUECK; ERSETZT ist endgültig", () => {
    expect(
      gleichlaufPlan({
        ziel: "ZURUECK",
        ausgabe: { zustand: "ZURUECK" },
        aufgabe: { isCompleted: true },
        rueckgabe: { zustand: null, isReturned: true },
      }),
    ).toEqual({ moeglich: true, ausgabe: null, rueckgabe: undefined, aufgabeErledigt: undefined, nach: "ZURUECK" });
    expect(
      gleichlaufPlan({ ziel: "ZURUECK", ausgabe: { zustand: "ERSETZT" }, aufgabe: null, rueckgabe: null }).moeglich,
    ).toBe(false);
    expect(gleichlaufPlan({ ziel: null, ausgabe: { zustand: "ERSETZT" }, aufgabe: null, rueckgabe: null }).moeglich).toBe(
      false,
    );
  });
});

describe("gleichlaufGesperrt / gleichlaufSperreText (G28 aus Sicht des Austritts)", () => {
  const A = { id: "off-a", status: "HANDOVER_PHASE" };
  const bezug = (offboardingId: string, status: string, displayId: string | null = null) => ({ offboardingId, status, displayId });

  it("laufend: frei; ein anderer laufender Austritt bindet: AUSGABE_IM_AUSTRITT (Nummer nur mit Zugriff)", () => {
    expect(gleichlaufGesperrt({ zustand: "AUSGEGEBEN" }, [bezug("off-a", A.status)], A)).toBeNull();
    const sperre = gleichlaufGesperrt({ zustand: "VERBLEIBT" }, [bezug("off-a", A.status), bezug("off-b", "INITIATED", "OFF-2027-GYM-020")], A);
    expect(sperre).toEqual({ grund: "AUSGABE_IM_AUSTRITT", displayId: "OFF-2027-GYM-020" });
    expect(gleichlaufSperreText(sperre!)).toBe(MELDUNGEN_AUSGABEN.AUSGABE_IM_AUSTRITT("OFF-2027-GYM-020"));
    expect(
      gleichlaufSperreText(gleichlaufGesperrt({ zustand: "AUSGEGEBEN" }, [bezug("off-b", "INITIATED")], A)!),
    ).toBe(MELDUNGEN_AUSGABEN.AUSGABE_IM_AUSTRITT(null));
    // Ein abgebrochener Austritt bindet nie.
    expect(gleichlaufGesperrt({ zustand: "AUSGEGEBEN" }, [bezug("off-b", "CANCELLED", "OFF-X")], A)).toBeNull();
  });

  it("abgeschlossen: die späte Rückgabe eines offenen Stücks geht; mit „verbleibt“ freigegeben nicht", () => {
    const fertig = { id: "off-a", status: "COMPLETED" };
    expect(gleichlaufGesperrt({ zustand: "AUSGEGEBEN" }, [bezug("off-a", "COMPLETED")], fertig)).toBeNull();
    expect(gleichlaufGesperrt({ zustand: "FEHLT" }, [bezug("off-a", "COMPLETED")], fertig)).toBeNull();
    const frei = gleichlaufGesperrt({ zustand: "VERBLEIBT" }, [bezug("off-a", "COMPLETED")], fertig);
    expect(frei).toEqual({ grund: "AUSGABE_FREIGEGEBEN" });
    expect(gleichlaufSperreText(frei!)).toBe(MELDUNGEN_AUSGABEN.AUSGABE_FREIGEGEBEN);
  });

  it("A mit „verbleibt“ abgeschlossen, B hat übernommen: B darf auch nach dem ersten Wechsel weiter ändern, A nicht (Review A4c)", () => {
    const B = { id: "off-b", status: "HANDOVER_PHASE" };
    const bezuege = [
      { offboardingId: "off-a", status: "COMPLETED", displayId: "OFF-A", eigenerStand: "VERBLEIBT" as const, abgeloest: true },
      { offboardingId: "off-b", status: B.status, displayId: "OFF-B" },
    ];
    for (const zustand of ["VERBLEIBT", "ZURUECK", "BESCHAEDIGT", "FEHLT", "ENTFAELLT", "AUSGEGEBEN"]) {
      expect({ zustand, sperre: gleichlaufGesperrt({ zustand }, bezuege, B) }).toEqual({ zustand, sperre: null });
    }
    // A: B bindet (laufend) – und nach dem Abschluss von B mit ZURUECK bleibt A abgelöst.
    expect(gleichlaufGesperrt({ zustand: "ZURUECK" }, bezuege, { id: "off-a", status: "COMPLETED" })).toEqual({
      grund: "AUSGABE_IM_AUSTRITT",
      displayId: "OFF-B",
    });
    const bFertig = [bezuege[0], { ...bezuege[1], status: "COMPLETED", eigenerStand: "ZURUECK" as const }];
    expect(gleichlaufGesperrt({ zustand: "ZURUECK" }, bFertig, { id: "off-b", status: "COMPLETED" })).toBeNull();
    expect(gleichlaufGesperrt({ zustand: "ZURUECK" }, bFertig, { id: "off-a", status: "COMPLETED" })).toEqual({
      grund: "AUSGABE_IM_AUSTRITT",
      displayId: "OFF-B",
    });
  });
});

describe("offboardingLinkAusgabeBauen / RUECKNAHME_AUSWAHL (Offboarding-Link-Seite, G15, G17, G21)", () => {
  const IPAD = {
    departmentKey: "IT",
    beiAustritt: "RUECKGABE",
    kennung: "FES-IPAD-0412",
    kennungLabel: "Inventarnummer",
    uebergebenAm: new Date("2027-01-28T00:00:00.000Z"),
    zustand: "AUSGEGEBEN",
  };
  const ruecknahme = (teil: Record<string, unknown> = {}) => ({
    herkunft: "AUSGABE",
    assigneeDepartment: "IT",
    isCompleted: false,
    ...teil,
  });

  it("die drei Knöpfe der Stelle – mehr wählt sie nicht", () => {
    expect(RUECKNAHME_AUSWAHL.map((k) => k.zustand)).toEqual(["ZURUECK", "BESCHAEDIGT", "FEHLT"]);
    expect(RUECKNAHME_AUSWAHL.map((k) => k.label)).toEqual(["Zurückerhalten", "Beschädigt zurückerhalten", "Fehlt"]);
  });

  it("Rücknahme der ausgebenden Stelle: Kennung, Übergabetag, Zustand aus der Rückgabe-Zeile, drei Knöpfe", () => {
    expect(
      offboardingLinkAusgabeBauen({
        departmentKey: "IT",
        aufgabe: ruecknahme(),
        ausgabe: IPAD,
        rueckgabe: { zustand: null, isReturned: false },
      }),
    ).toEqual({
      art: "RUECKGABE",
      kennungLabel: "Inventarnummer",
      kennung: "FES-IPAD-0412",
      uebergebenAm: "2027-01-28",
      zustand: null,
      zustandLabel: "offen",
      auswahl: RUECKNAHME_AUSWAHL,
    });
    // Stand beim Austritt: Ein spaeterer Austritt fuehrt das Stueck weiter, hier steht weiter „verbleibt“.
    expect(
      offboardingLinkAusgabeBauen({
        departmentKey: "IT",
        aufgabe: ruecknahme({ isCompleted: true }),
        ausgabe: { ...IPAD, zustand: "ZURUECK" },
        rueckgabe: { zustand: "VERBLEIBT", isReturned: false },
      }),
    ).toMatchObject({ zustand: "VERBLEIBT", zustandLabel: "verbleibt" });
    // Altbestand ohne Zustand, aber zurueckgegeben.
    expect(
      offboardingLinkAusgabeBauen({
        departmentKey: "IT",
        aufgabe: ruecknahme({ isCompleted: true }),
        ausgabe: IPAD,
        rueckgabe: { zustand: null, isReturned: true },
      }),
    ).toMatchObject({ zustand: "ZURUECK", zustandLabel: "zurück" });
  });

  it("Zugang: Zustand aus Aufgabe und Ausgabe („gesperrt“), keine Knöpfe; ohne Kennung „Kennung“", () => {
    const zugang = { ...IPAD, beiAustritt: "SPERREN", kennung: null, kennungLabel: null };
    expect(offboardingLinkAusgabeBauen({ departmentKey: "IT", aufgabe: ruecknahme(), ausgabe: zugang })).toMatchObject({
      art: "SPERREN",
      kennungLabel: "Kennung",
      kennung: null,
      zustand: null,
      zustandLabel: "offen",
      auswahl: [],
    });
    expect(
      offboardingLinkAusgabeBauen({ departmentKey: "IT", aufgabe: ruecknahme({ isCompleted: true }), ausgabe: { ...zugang, zustand: "ZURUECK" } }),
    ).toMatchObject({ zustand: "ZURUECK", zustandLabel: "gesperrt" });
  });

  it("Folgeaufgabe: nur die Gebäudewirtschaft, nur lesend – ohne Übergabetag, Zustand und Knöpfe", () => {
    const schluessel = { ...IPAD, departmentKey: "VERWALTUNG", kennung: "GS-114", kennungLabel: "Schlüsselnummer", zustand: "FEHLT" };
    const folge = { herkunft: "AUSGABE_FEHLT", assigneeDepartment: "FACILITY", isCompleted: false };
    expect(offboardingLinkAusgabeBauen({ departmentKey: "FACILITY", aufgabe: folge, ausgabe: schluessel })).toEqual({
      art: "RUECKGABE",
      kennungLabel: "Schlüsselnummer",
      kennung: "GS-114",
      zustandLabel: "fehlt",
    });
  });

  it("sonst fehlt das Feld ganz: fremde Stelle, Vorlagenaufgabe, ohne Ausgabe, Ausgabe einer anderen Stelle", () => {
    expect(offboardingLinkAusgabeBauen({ departmentKey: "FACILITY", aufgabe: ruecknahme(), ausgabe: IPAD })).toBeNull();
    expect(
      offboardingLinkAusgabeBauen({ departmentKey: "IT", aufgabe: ruecknahme({ herkunft: null }), ausgabe: IPAD }),
    ).toBeNull();
    expect(offboardingLinkAusgabeBauen({ departmentKey: "IT", aufgabe: ruecknahme(), ausgabe: null })).toBeNull();
    expect(
      offboardingLinkAusgabeBauen({ departmentKey: "IT", aufgabe: ruecknahme(), ausgabe: { ...IPAD, departmentKey: "VERWALTUNG" } }),
    ).toBeNull();
    // Die Folgeaufgabe sieht keine andere Stelle als die Gebaeudewirtschaft.
    expect(
      offboardingLinkAusgabeBauen({
        departmentKey: "IT",
        aufgabe: { herkunft: "AUSGABE_FEHLT", assigneeDepartment: "IT", isCompleted: false },
        ausgabe: IPAD,
      }),
    ).toBeNull();
  });
});

describe("Meldungen der Zustände (S30)", () => {
  it("feste Texte; die Link-Seite liest ZUSTAND_NICHT_MOEGLICH und STUECK_INZWISCHEN_GEAENDERT mit (neutral)", () => {
    expect(MELDUNGEN_AUSGABEN.ZUSTAND_NICHT_MOEGLICH).toBe("Einen Rückgabezustand gibt es nur bei der Rücknahme eines Gegenstands.");
    expect(MELDUNGEN_AUSGABEN.STUECK_INZWISCHEN_GEAENDERT).toBe("Das Stück wurde inzwischen geändert. Bitte die Seite neu laden.");
    expect(MELDUNGEN_AUSGABEN.GEGENSTAND_NICHT_GEFUNDEN).toBe("Rückgabe-Gegenstand nicht gefunden");
    expect(MELDUNGEN_AUSGABEN.RUECKGABE_INZWISCHEN_GEAENDERT).toContain("Bitte die Seite neu laden");
    expect(MELDUNGEN_AUSGABEN.RUECKGABEN_ABGEBROCHEN).toContain("abgebrochen");
    expect(MELDUNGEN_AUSGABEN.AUSGABE_FREIGEGEBEN).toContain("„Ausstattung & Zugänge“");
    for (const text of [MELDUNGEN_AUSGABEN.ZUSTAND_NICHT_MOEGLICH, MELDUNGEN_AUSGABEN.STUECK_INZWISCHEN_GEAENDERT]) {
      expect(text).not.toMatch(/\b(du|dein)\b/i);
    }
  });
});

// =============================================
// S33: Brief-Platzhalter der Resolver (1.9)
// =============================================

describe("ausgabenPlatzhalter (S33, 1.9)", () => {
  const stueck = (teil: Partial<Parameters<typeof ausgabenPlatzhalter>[0][number]>) => ({
    departmentKey: "IT",
    bezeichnung: "Dienst-iPad (Lernmittel)",
    kennung: "FES-IPAD-0412",
    uebergebenAm: utc("2027-01-28T00:00:00Z"),
    zustand: "AUSGEGEBEN",
    beiAustritt: "RUECKGABE",
    ...teil,
  });

  it("Liste je Stelle, Zeilen wie die Absage-Mail und Anzahl – nur aktive Stuecke", () => {
    const werte = ausgabenPlatzhalter(
      [
        stueck({}),
        stueck({ bezeichnung: "Zugänge: Dienst-E-Mail", kennung: null, beiAustritt: "SPERREN", uebergebenAm: "2027-01-29" }),
        stueck({ departmentKey: "FACILITY", bezeichnung: "Schlüssel: Haupteingang", kennung: "GS-114", zustand: "VERBLEIBT", uebergebenAm: "2027-01-30" }),
        stueck({ bezeichnung: "Laptop", kennung: "NB-1", zustand: "ERSETZT" }),
        stueck({ bezeichnung: "Alter Schlüssel", zustand: "ZURUECK" }),
      ],
      { FACILITY: "Hausmeister" },
    );
    expect(werte.ausgaben_anzahl).toBe("3");
    expect(werte.ausgaben_liste.split("\n")).toEqual([
      "Dienst-iPad (Lernmittel) · FES-IPAD-0412 · übergeben 28.01.2027",
      "Zugänge: Dienst-E-Mail · eingerichtet 29.01.2027",
      "Schlüssel: Haupteingang · GS-114 · übergeben 30.01.2027",
    ]);
    expect(werte.ausgaben_je_stelle).toEqual([
      {
        ausgabe_stelle: "IT-Abteilung",
        gegenstaende: [
          { ausgabe_gegenstand: "Dienst-iPad (Lernmittel)", ausgabe_kennung: "FES-IPAD-0412", ausgabe_uebergeben_am: "28.01.2027" },
          { ausgabe_gegenstand: "Zugänge: Dienst-E-Mail", ausgabe_kennung: "", ausgabe_uebergeben_am: "29.01.2027" },
        ],
      },
      {
        ausgabe_stelle: "Hausmeister",
        gegenstaende: [{ ausgabe_gegenstand: "Schlüssel: Haupteingang", ausgabe_kennung: "GS-114", ausgabe_uebergeben_am: "30.01.2027" }],
      },
    ]);
  });

  it("ohne aktives Stueck: leere Liste, leerer Text, Anzahl \"0\"", () => {
    expect(ausgabenPlatzhalter([], {})).toEqual({ ausgaben_je_stelle: [], ausgaben_liste: "", ausgaben_anzahl: "0" });
    expect(ausgabenPlatzhalter([stueck({ zustand: "FEHLT" })], {}).ausgaben_anzahl).toBe("0");
  });
});

describe("rueckgabenJeStelle (S33, 1.9)", () => {
  it("Stelle aus der Ausgabe, von HR erfasste unter der Personalabteilung, offene ohne Zustand und Datum", () => {
    const gruppen = rueckgabenJeStelle(
      [
        { itemName: "Parkausweis", serialNumber: null, isReturned: false, returnedAt: null, zustand: null, departmentKey: null },
        { itemName: "Dienst-iPad", serialNumber: "FES-IPAD-0412", isReturned: true, returnedAt: utc("2027-07-31T10:00:00Z"), zustand: "BESCHAEDIGT", departmentKey: "IT" },
        { itemName: "Schlüssel: Haupteingang", serialNumber: "GS-114", isReturned: false, returnedAt: null, zustand: "FEHLT", departmentKey: "FACILITY" },
        // Altbestand: zurueckgegeben ohne Zustand
        { itemName: "Monitor", isReturned: true, returnedAt: utc("2027-07-30T10:00:00Z"), departmentKey: null },
      ],
      { FACILITY: "Hausmeister" },
    );
    expect(gruppen).toEqual([
      {
        rueckgabe_stelle: "IT-Abteilung",
        gegenstaende: [
          { rueckgabe_gegenstand: "Dienst-iPad", rueckgabe_kennung: "FES-IPAD-0412", rueckgabe_zustand: "beschädigt zurück", rueckgabe_am: "31.07.2027" },
        ],
      },
      {
        rueckgabe_stelle: "Hausmeister",
        gegenstaende: [
          { rueckgabe_gegenstand: "Schlüssel: Haupteingang", rueckgabe_kennung: "GS-114", rueckgabe_zustand: "fehlt", rueckgabe_am: "" },
        ],
      },
      {
        rueckgabe_stelle: "Personalabteilung",
        gegenstaende: [
          { rueckgabe_gegenstand: "Monitor", rueckgabe_kennung: "", rueckgabe_zustand: "zurück", rueckgabe_am: "30.07.2027" },
          { rueckgabe_gegenstand: "Parkausweis", rueckgabe_kennung: "", rueckgabe_zustand: "", rueckgabe_am: "" },
        ],
      },
    ]);
  });

  it("jedes innere Feld ist eine Zeichenkette; ohne Zeile keine Gruppe", () => {
    const [g] = rueckgabenJeStelle([{ itemName: "X", isReturned: false, departmentKey: "IT" }], {});
    for (const wert of Object.values(g.gegenstaende[0])) expect(typeof wert).toBe("string");
    expect(rueckgabenJeStelle([], {})).toEqual([]);
  });
});

// =============================================
// Loeschlauf (S35, G20, Feinplan 1.11)
// =============================================

describe("ausgabeFaellig (1.11: Grenze genau am Tag)", () => {
  // Frist eines ZURUECK vom 31.08.2026: Beginn des 28.02.2027 in Berlin.
  const frist = ausgabeLoeschenAb({ zustand: "ZURUECK", zustandAm: utc("2026-08-31T10:00:00Z") })!;

  it("faellig ab dem Beginn des Berliner Tages – die Grenze zaehlt mit", () => {
    expect(frist.toISOString()).toBe("2027-02-27T23:00:00.000Z");
    expect(ausgabeFaellig(frist, frist)).toBe(true);
    // 28.02.2027, 03:15 Berlin – der Lauf dieses Tages
    expect(ausgabeFaellig(frist, utc("2027-02-28T02:15:00Z"))).toBe(true);
    // 27.02.2027, 23:59:59 Berlin – am Vortag noch nicht
    expect(ausgabeFaellig(frist, utc("2027-02-27T22:59:59.999Z"))).toBe(false);
  });

  it("ohne Frist, mit unlesbarer Frist oder ungueltigem jetzt nie faellig", () => {
    const jetzt = utc("2030-01-01T00:00:00Z");
    expect(ausgabeFaellig(null, jetzt)).toBe(false);
    expect(ausgabeFaellig(undefined, jetzt)).toBe(false);
    expect(ausgabeFaellig(new Date("kaputt"), jetzt)).toBe(false);
    expect(ausgabeFaellig("2027-01-01" as unknown as Date, jetzt)).toBe(false);
    expect(ausgabeFaellig(frist, new Date("kaputt"))).toBe(false);
  });

  it("ein Date aus einem anderen Realm zaehlt (kein instanceof)", () => {
    const fremd = structuredClone(frist);
    expect(ausgabeFaellig(fremd, utc("2027-03-01T00:00:00Z"))).toBe(true);
  });
});

describe("ohneFristGrenze (1.11, Schritt 6)", () => {
  it("Berliner Kalendertag minus drei Jahre als @db.Date-Wert (Mitternacht UTC)", () => {
    // 15.09.2027, 03:15 Berlin
    expect(ohneFristGrenze(utc("2027-09-15T01:15:00Z")).toISOString()).toBe("2024-09-15T00:00:00.000Z");
    expect(AUSGABE_VERJAEHRUNG_JAHRE).toBe(3);
  });

  it("der Berliner Tag zaehlt, nicht der UTC-Tag; der 29.02. wird gekappt", () => {
    // 31.12.2027, 23:30 UTC = 01.01.2028, 00:30 Berlin
    expect(ohneFristGrenze(utc("2027-12-31T23:30:00Z")).toISOString()).toBe("2025-01-01T00:00:00.000Z");
    // 29.02.2028 → 28.02.2025
    expect(ohneFristGrenze(utc("2028-02-29T10:00:00Z")).toISOString()).toBe("2025-02-28T00:00:00.000Z");
  });
});

describe("loeschMengeFestlegen (1.11, Schritt 3)", () => {
  const JETZT = utc("2027-09-15T01:15:00Z");
  const faellig = utc("2027-03-14T23:00:00Z");
  const spaeter = utc("2028-01-01T00:00:00Z");

  it("faellige Ausgaben nach id sortiert; nicht mehr faellige bleiben", () => {
    const menge = loeschMengeFestlegen({
      ausgaben: [
        { id: "ag-3", loeschenAb: faellig },
        { id: "ag-1", loeschenAb: faellig },
        { id: "ag-2", loeschenAb: null },
        { id: "ag-4", loeschenAb: spaeter },
      ],
      bezuege: [],
      gesperrteAustritte: [],
      jetzt: JETZT,
    });
    expect(menge).toEqual({ ids: ["ag-1", "ag-3"], nichtMehrFaellig: ["ag-2", "ag-4"], ungesperrterAustritt: [] });
  });

  it("Bezug eines nicht gesperrten Austritts: faellt fuer diesen Lauf heraus; gesperrte Bezuege stoeren nicht", () => {
    const menge = loeschMengeFestlegen({
      ausgaben: [
        { id: "ag-1", loeschenAb: faellig },
        { id: "ag-2", loeschenAb: faellig },
      ],
      bezuege: [
        { ausgabeId: "ag-1", offboardingId: "off-a" },
        { ausgabeId: "ag-2", offboardingId: "off-a" },
        { ausgabeId: "ag-2", offboardingId: "off-neu" },
        { ausgabeId: null, offboardingId: "off-x" },
      ],
      gesperrteAustritte: new Set(["off-a"]),
      jetzt: JETZT,
    });
    expect(menge).toEqual({ ids: ["ag-1"], nichtMehrFaellig: [], ungesperrterAustritt: ["ag-2"] });
  });
});

describe("ausgabenGeloeschtDetails (1.10: nur Anzahlen)", () => {
  it("feste Form, fehlende Zaehler sind 0, nichts anderes geht hinein", () => {
    expect(ausgabenGeloeschtDetails({ anzahl: 2, kommentareGeleert: 1 })).toEqual({
      anzahl: 2,
      rueckgabenGeleert: 0,
      kommentareGeleert: 1,
      protokolle: 0,
      erzeugteProtokolle: 0,
    });
    const fremd = { protokolle: 1, kennung: "FES-0412" } as unknown as Parameters<typeof ausgabenGeloeschtDetails>[0];
    expect(Object.keys(ausgabenGeloeschtDetails(fremd))).not.toContain("kennung");
    expect(ausgabenGeloeschtDetails({ anzahl: Number.NaN }).anzahl).toBe(0);
  });
});

describe("Konstanten des Loeschlaufs", () => {
  it("Seite von 500, beide Protokolle mit Suchschluessel der System-Vorlage", () => {
    expect(AUSGABEN_LOESCH_SEITE).toBe(500);
    expect(PROTOKOLL_SYSTEM_VORLAGEN.UEBERGABE.modul).toBe("ONBOARDING");
    expect(PROTOKOLL_SYSTEM_VORLAGEN.RUECKGABE.modul).toBe("OFFBOARDING");
  });
});
