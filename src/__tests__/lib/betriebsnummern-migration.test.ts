/**
 * Erstbefuellung der BA-Betriebsnummern (prisma/seed-check.js).
 *
 * Die Migration laeuft im Container als reines JS ohne Datenbank-Zugriff auf
 * ihre Entscheidungslogik. Genau die wird hier geprueft: welcher Mandant
 * geschrieben wird, welcher stehen bleibt und welcher fehlt. Dank des
 * `require.main === module`-Guards laesst sich seed-check.js laden, ohne dass
 * der Entrypoint startet.
 */

import { istGueltigeBetriebsnummer } from "@/lib/betriebsnummer";

const seedCheck = require("../../../prisma/seed-check.js");

type Eintrag = { mandant: string; name: string; betriebsnummer: string };
type Org = {
  id: string;
  mandantNumber: string;
  name: string;
  betriebsnummer: string | null;
};

const BETRIEBSNUMMERN: Eintrag[] = seedCheck.BETRIEBSNUMMERN;
const PLATZHALTER: string = seedCheck.BETRIEBSNUMMER_PLATZHALTER;
const normalisiere: (w: unknown) => string = seedCheck.normalisiereMandantNummer;
const plane: (o: Org[], e: Eintrag[]) => {
  zuSchreiben: (Eintrag & { id: string })[];
  uebersprungen: (Eintrag & { vorhanden: string })[];
  fehlend: Eintrag[];
} = seedCheck.planeBetriebsnummern;

/** Mandanten so, wie sie in der Datenbank stehen: dreistellig, ohne Nummer. */
function orgsAusListe(overrides: Partial<Record<string, string | null>> = {}): Org[] {
  const gesehen = new Set<string>();
  return BETRIEBSNUMMERN.filter((e) => {
    if (gesehen.has(e.mandant)) return false;
    gesehen.add(e.mandant);
    return true;
  }).map((e) => ({
    id: "org-" + e.mandant,
    mandantNumber: e.mandant,
    name: e.name,
    betriebsnummer: e.mandant in overrides ? overrides[e.mandant]! : null,
  }));
}

describe("BETRIEBSNUMMERN – Stammdaten der Liste", () => {
  it("enthaelt genau die 16 Mandanten", () => {
    expect(BETRIEBSNUMMERN).toHaveLength(16);
  });

  it("nennt jede LOGA-Mandantennummer genau einmal", () => {
    const nummern = BETRIEBSNUMMERN.map((e) => e.mandant);
    expect(new Set(nummern).size).toBe(nummern.length);
  });

  it("haelt fuer jeden Eintrag eine formal gueltige Betriebsnummer", () => {
    for (const e of BETRIEBSNUMMERN) {
      expect(istGueltigeBetriebsnummer(e.betriebsnummer)).toBe(true);
    }
  });

  it("laesst mehrere Mandanten dieselbe Betriebsnummer teilen", () => {
    // Haddenhausen/Minderheide und Gesamtschule/Gymnasium/Berufskolleg sind im
    // Sinne der BA jeweils ein Betrieb. Faellt das weg, ist die Liste falsch.
    const geteilt = BETRIEBSNUMMERN.filter(
      (e, _i, alle) => alle.filter((x) => x.betriebsnummer === e.betriebsnummer).length > 1,
    );
    expect(geteilt.map((e) => e.mandant).sort()).toEqual(
      ["712", "721", "728", "737", "767"].sort(),
    );
  });
});

describe("normalisiereMandantNummer", () => {
  it("macht die vierstellige Kundenschreibweise vergleichbar", () => {
    expect(normalisiere("0742")).toBe("742");
    expect(normalisiere("742")).toBe("742");
    expect(normalisiere(" 0712 ")).toBe("712");
  });

  it("bleibt bei fehlendem Wert leer statt zu werfen", () => {
    expect(normalisiere(null)).toBe("");
    expect(normalisiere(undefined)).toBe("");
  });
});

describe("planeBetriebsnummern", () => {
  it("schreibt alle 16, wenn noch keine Nummer gepflegt ist", () => {
    const { zuSchreiben, uebersprungen, fehlend } = plane(orgsAusListe(), BETRIEBSNUMMERN);
    expect(zuSchreiben).toHaveLength(16);
    expect(uebersprungen).toHaveLength(0);
    expect(fehlend).toHaveLength(0);
  });

  it("ordnet auch zu, wenn die Datenbank die fuehrende Null traegt", () => {
    const orgs = orgsAusListe().map((o) => ({ ...o, mandantNumber: "0" + o.mandantNumber }));
    const { zuSchreiben, fehlend } = plane(orgs, BETRIEBSNUMMERN);
    expect(zuSchreiben).toHaveLength(16);
    expect(fehlend).toHaveLength(0);
  });

  it("ueberschreibt den dokumentierten Testwert", () => {
    const orgs = orgsAusListe({ "767": PLATZHALTER });
    const { zuSchreiben, uebersprungen } = plane(orgs, BETRIEBSNUMMERN);
    expect(uebersprungen).toHaveLength(0);
    expect(zuSchreiben.find((e) => e.mandant === "767")?.betriebsnummer).toBe("78071501");
  });

  it("laesst eine abweichende, bereits gepflegte Nummer stehen und meldet sie", () => {
    const orgs = orgsAusListe({ "742": "99999999" });
    const { zuSchreiben, uebersprungen } = plane(orgs, BETRIEBSNUMMERN);
    expect(zuSchreiben.some((e) => e.mandant === "742")).toBe(false);
    expect(uebersprungen).toHaveLength(1);
    expect(uebersprungen[0]).toMatchObject({ mandant: "742", vorhanden: "99999999" });
  });

  it("schreibt nicht erneut, wenn der Wert schon stimmt", () => {
    const orgs = orgsAusListe({ "742": "93465718" });
    const { zuSchreiben, uebersprungen } = plane(orgs, BETRIEBSNUMMERN);
    expect(zuSchreiben.some((e) => e.mandant === "742")).toBe(false);
    expect(uebersprungen).toHaveLength(0);
  });

  it("meldet einen Mandanten, den die Datenbank nicht kennt, statt still zu schlucken", () => {
    const orgs = orgsAusListe().filter((o) => o.mandantNumber !== "747");
    const { zuSchreiben, fehlend } = plane(orgs, BETRIEBSNUMMERN);
    expect(zuSchreiben).toHaveLength(15);
    expect(fehlend.map((e) => e.mandant)).toEqual(["747"]);
  });
});
