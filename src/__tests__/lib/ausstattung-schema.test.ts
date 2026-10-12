/**
 * Tests: Ausstattung & Zugaenge – Schema und Grundkonstanten (Feinplan S1)
 *
 * Zustaende sind Zeichenketten, keine Enums (`db push --accept-data-loss`
 * spielte einen umbenannten Enum-Wert still aus). Die Wertliste steht deshalb
 * zweimal: als Kommentar in prisma/schema.prisma und als Konstante in
 * src/lib/ausstattung.ts. Dieser Test haelt beide gleich, ebenso die
 * Laengengrenzen in den Kommentaren und die Tabellen der Personengruppen und
 * Einrichtungsarten gegen die Enums des generierten Clients.
 *
 * `$Enums` ist ein eigener Export von @prisma/client, nicht Teil des
 * Namespace `Prisma` (Feinplan 1.3). Er wird nur hier importiert –
 * ausstattung.ts selbst bleibt ohne Prisma-Import (client-sicher).
 */

import fs from "fs";
import path from "path";
import { $Enums } from "@prisma/client";
import {
  AENDERUNGS_ARTEN,
  ANGABE_SCHLUESSEL,
  ANGABEN_KATALOG,
  AUFGABEN_HERKUNFT,
  AUSSTATTUNG_ARTEN,
  AUSSTATTUNG_AUDIT,
  AUSSTATTUNG_AUDIT_LABELS,
  AUSSTATTUNG_KATEGORIE,
  AUSSTATTUNG_QUELLEN,
  BEI_AUSTRITT,
  BEMERKUNG_HINWEIS,
  BEMERKUNG_QUELLEN,
  EINRICHTUNGSARTEN,
  GRENZEN,
  HINWEIS_AUFGABE_TITEL,
  HINWEIS_FAELLIG_TAGE,
  HINWEIS_ORDER_BASIS,
  NICHT_ERLAUBTE_STELLEN,
  ORDER_BASIS,
  PERSONENGRUPPEN,
} from "@/lib/ausstattung";
import { RESERVIERTE_ABTEILUNGSSCHLUESSEL } from "@/lib/constants";

// =============================================
// Hilfen zum Lesen des Schemas
// =============================================

const SCHEMA = fs
  .readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8")
  .replace(/\r\n/g, "\n");
const ZEILEN = SCHEMA.split("\n");

/** Zeilenindex von `model <name> {`. */
function modellStart(name: string): number {
  const i = ZEILEN.findIndex((z) => z.trim() === `model ${name} {`);
  if (i < 0) throw new Error(`Modell ${name} fehlt im Schema`);
  return i;
}

/** Die Zeilen eines Modells zwischen `{` und der schliessenden `}`. */
function modellZeilen(name: string): string[] {
  const start = modellStart(name);
  const ende = ZEILEN.findIndex((z, i) => i > start && z.trim() === "}");
  return ZEILEN.slice(start + 1, ende);
}

/** Die Kommentarzeilen direkt ueber `model <name> {` (ohne Leerzeile dazwischen). */
function kopfKommentar(name: string): string {
  const zeilen: string[] = [];
  for (let i = modellStart(name) - 1; i >= 0 && ZEILEN[i].trim().startsWith("//"); i--) {
    zeilen.unshift(ZEILEN[i].trim());
  }
  return zeilen.join("\n");
}

/** Die Zeile eines Feldes in einem Modell. */
function feldZeile(modell: string, feld: string): string {
  const zeile = modellZeilen(modell).find((z) => z.trim().split(/\s+/)[0] === feld);
  if (!zeile) throw new Error(`Feld ${modell}.${feld} fehlt im Schema`);
  return zeile;
}

/** Der Kommentar hinter einem Feld (`// …`), leer ohne Kommentar. */
function feldKommentar(modell: string, feld: string): string {
  const zeile = feldZeile(modell, feld);
  const i = zeile.indexOf("//");
  return i < 0 ? "" : zeile.slice(i + 2).trim();
}

/** Alle in Anfuehrungszeichen gesetzten Werte aus GROSSBUCHSTABEN. */
function werte(text: string): string[] {
  return [...text.matchAll(/"([A-Z][A-Z_]*)"/g)].map((m) => m[1]);
}

/** Der Abschnitt `<schluessel>: …` eines Kommentars bis `;` oder Zeilenende. */
function abschnitt(text: string, schluessel: string): string {
  const m = text.match(new RegExp(`\\b${schluessel}:([^;\\n]*)`));
  if (!m) throw new Error(`„${schluessel}:“ fehlt im Kommentar: ${text}`);
  return m[1];
}

/** Zahl hinter „max. “ im Feldkommentar. */
function maxImKommentar(modell: string, feld: string): number {
  const m = feldKommentar(modell, feld).match(/max\. (\d+)/);
  if (!m) throw new Error(`„max. …“ fehlt am Feld ${modell}.${feld}`);
  return Number(m[1]);
}

const NEUE_MODELLE = [
  "AusstattungsPosition",
  "AusstattungsAusblendung",
  "OnboardingAusstattung",
  "OnboardingAusstattungAufgabe",
  "OnboardingStellenHinweis",
  "OnboardingAusstattungAenderung",
];

// =============================================
// Wertlisten in den Schemakommentaren
// =============================================

describe("Wertlisten: Schemakommentar = Konstante", () => {
  it("AusstattungsPosition.art", () => {
    expect(werte(abschnitt(kopfKommentar("AusstattungsPosition"), "art"))).toEqual([...AUSSTATTUNG_ARTEN]);
  });

  it("AusstattungsPosition.beiAustritt (A4)", () => {
    expect(werte(feldKommentar("AusstattungsPosition", "beiAustritt"))).toEqual([...BEI_AUSTRITT]);
  });

  it("OnboardingAusstattung.quelle und .bemerkungQuelle", () => {
    const kopf = kopfKommentar("OnboardingAusstattung");
    expect(werte(abschnitt(kopf, "quelle"))).toEqual([...AUSSTATTUNG_QUELLEN]);
    expect(werte(abschnitt(kopf, "bemerkungQuelle"))).toEqual([...BEMERKUNG_QUELLEN]);
  });

  it("OnboardingStellenHinweis.quelle traegt dieselben Werte wie bemerkungQuelle", () => {
    expect(werte(feldKommentar("OnboardingStellenHinweis", "quelle"))).toEqual([...BEMERKUNG_QUELLEN]);
  });

  it("OnboardingAusstattungAenderung.art", () => {
    expect(werte(abschnitt(kopfKommentar("OnboardingAusstattungAenderung"), "art"))).toEqual([
      ...AENDERUNGS_ARTEN,
    ]);
  });

  it("ChecklistItem.herkunft (null = Vorlage steht nicht in der Liste)", () => {
    const kommentar = modellZeilen("ChecklistItem")
      .filter((z) => z.trim().startsWith("//"))
      .join("\n");
    const teil = abschnitt(kommentar, "herkunft");
    expect(teil).toContain("null = Vorlage");
    expect(werte(teil)).toEqual([...AUFGABEN_HERKUNFT]);
  });

  it("die Kommentare verweisen auf die Quellen der uebrigen Werte", () => {
    expect(feldKommentar("AusstattungsPosition", "angabeSchluessel")).toContain("ANGABEN_KATALOG");
    expect(feldKommentar("AusstattungsPosition", "einrichtungsarten")).toContain("OrganizationType-Werte");
    expect(feldKommentar("AusstattungsPosition", "personengruppen")).toContain("QuestionnaireType-Werte");
    expect(feldKommentar("AusstattungsPosition", "departmentKey")).toContain(NICHT_ERLAUBTE_STELLEN.join("/"));
  });
});

// =============================================
// Grenzen in den Schemakommentaren
// =============================================

describe("Grenzen: Schemakommentar = GRENZEN", () => {
  it.each([
    ["AusstattungsPosition", "bezeichnung", GRENZEN.bezeichnung],
    ["AusstattungsPosition", "hinweisFuehrungskraft", GRENZEN.hinweisFuehrungskraft],
    ["AusstattungsPosition", "hinweisStelle", GRENZEN.hinweisStelle],
    ["AusstattungsPosition", "optionen", GRENZEN.option],
    ["AusstattungsPosition", "bemerkungPlatzhalter", GRENZEN.bemerkungPlatzhalter],
    ["AusstattungsPosition", "aufgabeTitel", GRENZEN.aufgabeTitel],
    ["OnboardingAusstattung", "angabe", GRENZEN.angabe],
    ["OnboardingAusstattung", "bemerkung", GRENZEN.bemerkung],
    ["OnboardingStellenHinweis", "text", GRENZEN.hinweis],
  ] as const)("%s.%s: max. %i", (modell, feld, grenze) => {
    expect(maxImKommentar(modell, feld)).toBe(grenze);
  });

  it("AusstattungsPosition.optionen: 1..40 Optionen", () => {
    expect(feldKommentar("AusstattungsPosition", "optionen")).toContain(`1..${GRENZEN.optionen}`);
  });
});

// =============================================
// Form des Schemas (Feinplan 1.2)
// =============================================

describe("Form des Schemas", () => {
  it("jede Liste (String[]) in den neuen Modellen hat @default([])", () => {
    for (const modell of NEUE_MODELLE) {
      for (const zeile of modellZeilen(modell).filter((z) => /\sString\[\]/.test(z))) {
        expect(`${modell}: ${zeile.trim()}`).toMatch(/@default\(\[\]\)/);
      }
    }
  });

  it("neue Katalogpositionen sind ausgeschaltet (Regel 1)", () => {
    expect(feldZeile("AusstattungsPosition", "isActive")).toMatch(/@default\(false\)/);
  });

  it("die bestehende Einrichtungs-Relation ist nur benannt, ihre Fremdschluessel-Aktion bleibt (F14)", () => {
    const zeile = feldZeile("OnboardingProcess", "organization");
    expect(zeile).toContain('@relation("OnboardingEinrichtung", fields: [organizationId], references: [id])');
    // Ein onDelete hier aenderte onboarding_processes_organizationId_fkey –
    // der Schema-Abgleich beim Start spielte das ohne Rueckfrage aus.
    expect(zeile).not.toContain("onDelete");
    expect(feldZeile("Organization", "onboardings")).toContain('@relation("OnboardingEinrichtung")');
  });

  it("der Arbeitsort ist eine eigene, nullbare Relation mit SetNull (E-A10)", () => {
    expect(feldZeile("OnboardingProcess", "arbeitsortId")).toMatch(/\sString\?/);
    expect(feldZeile("OnboardingProcess", "arbeitsort")).toContain(
      '@relation("OnboardingArbeitsort", fields: [arbeitsortId], references: [id], onDelete: SetNull)',
    );
    expect(feldZeile("Organization", "onboardingArbeitsorte")).toContain('@relation("OnboardingArbeitsort")');
  });

  it("neue Spalten an bestehenden Modellen sind nullbar oder haben einen Standardwert", () => {
    // Nur additiv (Abschnitt 4, Schema-Deploy): eine Pflichtspalte ohne
    // Standardwert liesse sich in eine gefuellte Tabelle nicht einspielen.
    const neu: [string, string][] = [
      ["OnboardingProcess", "arbeitsortId"],
      ["OnboardingProcess", "expiredAt"],
      ["OnboardingProcess", "ausstattungSammelmailAm"],
      ["SupervisorData", "mitAusstattung"],
      ["SupervisorData", "ausstattungGespeichertAm"],
      ["ChecklistItem", "herkunft"],
      ["ChecklistItem", "eilt"],
      ["ChecklistItem", "entfaelltAm"],
      ["OffboardingDepartmentLink", "abgesagtAm"],
    ];
    for (const [modell, feld] of neu) {
      const zeile = feldZeile(modell, feld);
      const typ = zeile.trim().split(/\s+/)[1];
      expect(`${modell}.${feld}: ${typ.endsWith("?") || zeile.includes("@default(")}`).toBe(
        `${modell}.${feld}: true`,
      );
    }
  });

  it("die Verknuepfung Aufgabe ↔ Wahl hat Primaerschluessel (ausstattungId, option) (F4)", () => {
    expect(modellZeilen("OnboardingAusstattungAufgabe").map((z) => z.trim())).toContain(
      "@@id([ausstattungId, option])",
    );
    expect(feldZeile("OnboardingAusstattungAufgabe", "option")).toContain('@default("")');
  });
});

// =============================================
// Konstanten gegen die Enums des generierten Clients (1.3)
// =============================================

describe("Personengruppen und Einrichtungsarten", () => {
  it("PERSONENGRUPPEN hat genau die Werte von QuestionnaireType", () => {
    expect(Object.keys(PERSONENGRUPPEN).sort()).toEqual(Object.values($Enums.QuestionnaireType).sort());
  });

  it("EINRICHTUNGSARTEN hat genau die Werte von OrganizationType", () => {
    expect(Object.keys(EINRICHTUNGSARTEN).sort()).toEqual(Object.values($Enums.OrganizationType).sort());
  });

  it("jede Gruppe und jede Art hat eine Beschriftung, keine doppelt", () => {
    for (const tabelle of [PERSONENGRUPPEN, EINRICHTUNGSARTEN]) {
      const labels = Object.values(tabelle);
      for (const label of labels) expect(label.trim()).not.toBe("");
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
});

// =============================================
// Angaben (E-A13)
// =============================================

describe("ANGABEN_KATALOG", () => {
  it("enthaelt genau die Schluessel aus ANGABE_SCHLUESSEL", () => {
    expect(Object.keys(ANGABEN_KATALOG)).toEqual([...ANGABE_SCHLUESSEL]);
  });

  it("haelt die Grenzen ein (max ≤ 300, Label ≤ 120)", () => {
    for (const schluessel of ANGABE_SCHLUESSEL) {
      const a = ANGABEN_KATALOG[schluessel];
      expect(a.max).toBeGreaterThan(0);
      expect(a.max).toBeLessThanOrEqual(GRENZEN.angabe);
      expect(GRENZEN.angabe).toBe(300);
      expect(a.label.trim()).not.toBe("");
      expect(a.label.length).toBeLessThanOrEqual(GRENZEN.bezeichnung);
      expect(a.platzhalter.length).toBeLessThanOrEqual(GRENZEN.bemerkungPlatzhalter);
      if (a.hilfe !== null) expect(a.hilfe.trim()).not.toBe("");
    }
  });

  it("die Labels sind eindeutig (sie werden zur Bezeichnung der Position)", () => {
    const labels = ANGABE_SCHLUESSEL.map((s) => ANGABEN_KATALOG[s].label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("die Liste aus dem Feinplan", () => {
    expect(ANGABEN_KATALOG.UNTERRICHTSFAECHER).toEqual({
      label: "Unterrichtsfächer",
      platzhalter: "z. B. Chemie, Sport",
      hilfe: "Hilft bei der Zuordnung von Fachräumen.",
      max: 200,
    });
    expect(ANGABEN_KATALOG.DURCHWAHL.max).toBe(30);
    expect(ANGABEN_KATALOG.ARBEITSPLATZ_RAUM.max).toBe(100);
  });
});

// =============================================
// Uebrige Grundkonstanten
// =============================================

describe("Grundkonstanten", () => {
  it("NICHT_ERLAUBTE_STELLEN: MITARBEITER und VORGESETZTER, nie HR (Regel 11)", () => {
    expect([...NICHT_ERLAUBTE_STELLEN]).toEqual(["MITARBEITER", "VORGESETZTER"]);
    for (const stelle of NICHT_ERLAUBTE_STELLEN) {
      expect(RESERVIERTE_ABTEILUNGSSCHLUESSEL as readonly string[]).toContain(stelle);
    }
    expect(NICHT_ERLAUBTE_STELLEN as readonly string[]).not.toContain("HR");
  });

  it("die Reihenfolge stellt Ausstattung vor Hinweise vor Vorlagenpunkte", () => {
    // Vorlagenpunkte haben orderIndex ab 0. Ausstattungsaufgaben liegen bei
    // ORDER_BASIS + reihenfolge * 100 + optionIndex: Platz fuer mindestens 500
    // Positionen mit je 40 Optionen vor der ersten Hinweis-Aufgabe.
    expect(ORDER_BASIS).toBeLessThan(HINWEIS_ORDER_BASIS);
    expect(HINWEIS_ORDER_BASIS).toBeLessThan(0);
    expect(GRENZEN.optionen).toBeLessThan(100);
    expect(ORDER_BASIS + 500 * 100 + GRENZEN.optionen).toBeLessThan(HINWEIS_ORDER_BASIS);
  });

  it("Texte und Fristen aus dem Feinplan", () => {
    expect(AUSSTATTUNG_KATEGORIE).toBe("Ausstattung & Zugänge");
    expect(HINWEIS_AUFGABE_TITEL).toBe("Hinweis der Führungskraft beachten");
    expect(HINWEIS_FAELLIG_TAGE).toBe(-7);
    expect(BEMERKUNG_HINWEIS).toContain("Schreiben Sie, was gebraucht wird, nicht warum.");
    expect(HINWEIS_AUFGABE_TITEL.length).toBeLessThanOrEqual(GRENZEN.aufgabeTitel);
  });

  it("jeder Protokoll-Code hat eine Beschriftung, keine steht ohne Code", () => {
    const codes = Object.values(AUSSTATTUNG_AUDIT);
    expect(new Set(codes).size).toBe(codes.length);
    expect(Object.keys(AUSSTATTUNG_AUDIT_LABELS).sort()).toEqual([...codes].sort());
    for (const code of codes) expect(AUSSTATTUNG_AUDIT_LABELS[code].trim()).not.toBe("");
  });
});
