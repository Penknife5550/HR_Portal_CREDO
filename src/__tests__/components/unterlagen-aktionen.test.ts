/**
 * Gemeinsame Client-Helfer der Karte „Unterlagen nachfordern" und ihrer
 * Dialoge (src/components/unterlagen/aktionen.ts, Paket 4 Schritt 11a).
 *
 * Die Auswertung der Antworten (`unterlagenAntwortAuswerten`) und die Basis der
 * Routen belegt nachforderung-karte.test.tsx, den Adressvergleich
 * unterlagen-pruef-dialoge.test.tsx — beide importieren sie von hier. Dieser
 * Test haelt fest, was der Umzug leisten sollte:
 *
 *  1. Kein Ringimport mehr: Der Dialog holt sich nichts aus Karte oder
 *     Pruef-Dialogen, die Pruef-Dialoge nichts aus Karte oder Dialog; die drei
 *     Komponenten nehmen die Helfer aus aktionen.ts. aktionen.ts selbst
 *     importiert keine Komponente (nur einen Typ der Abteilungskarte).
 *  2. `saetze` (Meldungsaufbereitung): leere Teile fallen weg, Rand-Leerraum
 *     auch, und derselbe Satz steht nur einmal da.
 *
 * Reine Funktionen und Quelltext — keine Umgebung noetig.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { adresseGleich, saetze } from "@/components/unterlagen/aktionen";

const ORDNER = join(__dirname, "..", "..", "components", "unterlagen");

/** Die Importpfade einer Datei (Kommentare entfernt), mit `type`-Kennung. */
function importe(datei: string): Array<{ pfad: string; nurTyp: boolean }> {
  const code = readFileSync(join(ORDNER, datei), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  return Array.from(code.matchAll(/^import\s+(type\s+)?[\s\S]*?from\s+"([^"]+)";/gm)).map((m) => ({
    pfad: m[2],
    nurTyp: !!m[1],
  }));
}

const pfade = (datei: string) => importe(datei).map((i) => i.pfad);

describe("aktionen.ts löst den Ringimport auf", () => {
  it("der Dialog importiert weder Karte noch Prüf-Dialoge — die Helfer kommen aus aktionen.ts", () => {
    const dialog = pfade("nachforderung-dialog.tsx");
    expect(dialog).toContain("@/components/unterlagen/aktionen");
    expect(dialog).not.toContain("@/components/unterlagen/nachforderung-karte");
    expect(dialog).not.toContain("@/components/unterlagen/pruef-dialoge");
  });

  it("die Prüf-Dialoge importieren weder Karte noch Dialog, die Karte nicht den Dialog", () => {
    const pruef = pfade("pruef-dialoge.tsx");
    expect(pruef).toContain("@/components/unterlagen/aktionen");
    expect(pruef).not.toContain("@/components/unterlagen/nachforderung-karte");
    expect(pruef).not.toContain("@/components/unterlagen/nachforderung-dialog");

    const karte = pfade("nachforderung-karte.tsx");
    expect(karte).toContain("@/components/unterlagen/aktionen");
    expect(karte).not.toContain("@/components/unterlagen/nachforderung-dialog");
  });

  it("aktionen.ts importiert keine Komponente — nur einen Typ der Abteilungskarte und die reinen Regeln", () => {
    const eigene = importe("aktionen.ts");
    for (const i of eigene.filter((x) => x.pfad.startsWith("@/components/"))) {
      expect(i).toEqual({ pfad: "@/components/abteilungsaufgaben/abteilungen-karte", nurTyp: true });
    }
    expect(eigene.map((i) => i.pfad).filter((p) => !p.startsWith("@/components/"))).toEqual(["@/lib/unterlagen"]);
  });

  it("die Helfer gibt es nur noch an einer Stelle", () => {
    const helfer = ["unterlagenAntwortAuswerten", "unterlagenAktionSenden", "unterlagenApiBasis", "adresseGleich", "saetze"];
    for (const datei of ["nachforderung-dialog.tsx", "nachforderung-karte.tsx", "pruef-dialoge.tsx"]) {
      const quelle = readFileSync(join(ORDNER, datei), "utf8");
      for (const name of helfer) {
        expect({ datei, name, eigeneDefinition: new RegExp(`function ${name}\\b`).test(quelle) }).toEqual({
          datei,
          name,
          eigeneDefinition: false,
        });
      }
    }
  });
});

describe("saetze", () => {
  it("fügt Sätze zusammen — ohne leere Teile, ohne Rand-Leerraum, ohne Wiederholung", () => {
    expect(saetze("Die Frist ist geändert.", null, undefined, "  ", " Die Frist ist geändert. ", "Danke.")).toBe(
      "Die Frist ist geändert. Danke.",
    );
    expect(saetze()).toBe("");
    expect(saetze(null, "")).toBe("");
  });
});

describe("adresseGleich", () => {
  it("Groß- und Kleinschreibung und Rand-Leerraum zählen nicht", () => {
    expect(adresseGleich(" Anna@Example.org ", "anna@example.org")).toBe(true);
    expect(adresseGleich("anna@example.org", "anna@example.com")).toBe(false);
  });
});
