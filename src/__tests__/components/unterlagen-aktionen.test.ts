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
import { ADRESS_TEXTE, adresseGleich, adressFormatFehler, dialogHeute, saetze } from "@/components/unterlagen/aktionen";
import { fristGrenzen } from "@/lib/unterlagen";

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

  it("aktionen.ts importiert keine Komponente — nur einen Typ der Abteilungskarte und reine, client-sichere Regeln", () => {
    const eigene = importe("aktionen.ts");
    for (const i of eigene.filter((x) => x.pfad.startsWith("@/components/"))) {
      expect(i).toEqual({ pfad: "@/components/abteilungsaufgaben/abteilungen-karte", nurTyp: true });
    }
    expect(eigene.map((i) => i.pfad).filter((p) => !p.startsWith("@/components/"))).toEqual([
      "@/lib/constants",
      "@/lib/kalendertag",
      "@/lib/unterlagen",
    ]);
  });

  it("die Helfer gibt es nur noch an einer Stelle", () => {
    const helfer = [
      "unterlagenAntwortAuswerten",
      "unterlagenAktionSenden",
      "adresseGleich",
      "adressFormatFehler",
      "dialogHeute",
      "heuteAus",
      "saetze",
    ];
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

describe("dialogHeute (KO-K3) — derselbe Tag in allen drei Frist-Dialogen", () => {
  // 25.09., 10:00 Uhr in Berlin, als der Server die Uebersicht baute.
  const server = fristGrenzen("2026-09-25");

  it("der Tag des Servers, solange der Browser nicht weiter ist", () => {
    expect(dialogHeute(server, new Date("2026-09-25T21:00:00.000Z"))).toBe("2026-09-25");
  });

  it("Seite ueber Mitternacht offen: der Berliner Tag im Browser — sonst gaebe das Feld eine Frist frei, die der Server ablehnt", () => {
    // 26.09., 00:05 Uhr in Berlin (22:05 UTC am 25.09.).
    expect(dialogHeute(server, new Date("2026-09-25T22:05:00.000Z"))).toBe("2026-09-26");
    expect(fristGrenzen(dialogHeute(server, new Date("2026-09-25T22:05:00.000Z"))).min).toBe("2026-09-27");
  });

  it("nie frueher als der Server (Uhr im Browser falsch gestellt) und ohne Server-Grenzen der Browser", () => {
    expect(dialogHeute(server, new Date("2026-09-20T08:00:00.000Z"))).toBe("2026-09-25");
    expect(dialogHeute(null, new Date("2026-09-20T08:00:00.000Z"))).toBe("2026-09-20");
  });
});

describe("adressFormatFehler — dieselbe Pruefung in beiden Adressdialogen", () => {
  it("leer, ohne Domain, mit Leerzeichen: Grund; eine gueltige Adresse: null", () => {
    expect(adressFormatFehler("  ")).toBe(ADRESS_TEXTE.EMAIL_FEHLT);
    expect(adressFormatFehler("anna.beispiel@")).toBe(ADRESS_TEXTE.EMAIL_UNGUELTIG);
    expect(adressFormatFehler("anna beispiel@example.org")).toBe(ADRESS_TEXTE.EMAIL_UNGUELTIG);
    expect(adressFormatFehler(" anna.beispiel@example.org ")).toBeNull();
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
