/**
 * Waechter: Server-Code formatiert Datum und Uhrzeit nur in deutscher Zeit.
 *
 * Der Container laeuft in UTC (kein TZ in Dockerfile/Compose).
 * `toLocaleString`, `toLocaleDateString` und `toLocaleTimeString` ohne
 * `timeZone` rechnen in der Serverzeit: Uhrzeiten stehen 1–2 Stunden zu
 * frueh, ein Zeitpunkt kurz nach Mitternacht faellt auf den Vortag. So stand
 * der Zeitpunkt der Erklaerung im Personalfragebogen-PDF (Unterschriftsersatz)
 * zu frueh da, und Briefe zwischen 0 und 2 Uhr trugen das gestrige Datum.
 *
 * Warum ein eigener Waechter neben der Sperrklinke: Die zaehlt nur
 * `toLocaleDateString`/`toLocaleTimeString`, nicht `toLocaleString` — das
 * formatiert auch Zahlen. Genau darueber liefen aber die Erklaerung im
 * Fragebogen-PDF, das Protokoll im BEM-Export und die SMTP-Testmail, und
 * keine dieser Stellen hat einen eigenen Test.
 *
 * DIE REGEL: In `src/lib`, `src/app/api` und `src/app/verify` (Server-
 * Component der oeffentlichen Pruefseite) traegt jeder `toLocale…String`-
 * Aufruf `timeZone` in seinen Argumenten. Fuer Daten und Zeitpunkte gibt es
 * `formatDatumDE`/`formatZeitpunktDE` aus `@/lib/format`. Zahlen haben keine
 * Zeitzone; sie stehen mit Datei und Anzahl in `ZAHLEN`.
 *
 * Client-Komponenten bleiben draussen: Der Browser rechnet in Ortszeit, und
 * ihre Datumsaufrufe haelt die Sperrklinke.
 */
import { readdirSync, readFileSync } from "fs";
import { join, relative, sep } from "path";

const SRC = join(__dirname, "..", "..");
const BEREICHE = ["lib", "app/api", "app/verify"];

/** Zahlenformatierung ohne Zeitzone: Datei → Anzahl der Aufrufe. */
const ZAHLEN: Record<string, number> = {
  // euroDe — Geldbetraege in Word-Vorlagen
  "lib/doc-template-resolvers.ts": 1,
};

const AUFRUF = /\.toLocale(?:Date|Time)?String\(/g;

/**
 * Aufrufe ohne `timeZone` in einem Quelltext. Zeilen, die mit `*` oder `//`
 * beginnen, sind Kommentare (die Kopfkommentare in format.ts nennen die
 * Altmuster). Die Argumente reichen bis zur passenden Klammer.
 */
function aufrufeOhneZeitzone(text: string): string[] {
  const treffer: string[] = [];
  for (const m of text.matchAll(AUFRUF)) {
    const zeilenAnfang = text.lastIndexOf("\n", m.index) + 1;
    const zeile = text.slice(zeilenAnfang, m.index).trimStart();
    if (zeile.startsWith("*") || zeile.startsWith("//") || zeile.startsWith("/*")) continue;

    let tiefe = 0;
    let i = m.index + m[0].length - 1;
    for (; i < text.length; i += 1) {
      if (text[i] === "(") tiefe += 1;
      else if (text[i] === ")" && --tiefe === 0) break;
    }
    const aufruf = text.slice(m.index, i + 1);
    if (!/\btimeZone\b/.test(aufruf)) treffer.push(aufruf.replace(/\s+/g, " "));
  }
  return treffer;
}

function quelltexte(verzeichnis: string): string[] {
  const dateien: string[] = [];
  for (const eintrag of readdirSync(verzeichnis, { withFileTypes: true })) {
    if (eintrag.name === "__tests__") continue;
    const pfad = join(verzeichnis, eintrag.name);
    if (eintrag.isDirectory()) dateien.push(...quelltexte(pfad));
    else if (/\.tsx?$/.test(eintrag.name)) dateien.push(pfad);
  }
  return dateien;
}

describe("Zeitzonen-Waechter: Erkennung", () => {
  it.each([
    ['d.toLocaleString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit" })', 0],
    ['d.toLocaleString("de-DE")', 1],
    ['d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })', 1],
    ["d.toLocaleTimeString()", 1],
    ['d.toLocaleString("de-DE", optionen({ a: 1 })) + x.timeZone', 1],
    [' * statt `toLocaleDateString("de-DE")` im Kommentar', 0],
    ['  // d.toLocaleString("de-DE")', 0],
  ])("%s → %i", (text, erwartet) => {
    expect(aufrufeOhneZeitzone(text)).toHaveLength(erwartet);
  });
});

describe("Zeitzonen-Waechter: Server-Code", () => {
  const ist: Record<string, string[]> = {};
  for (const bereich of BEREICHE) {
    for (const pfad of quelltexte(join(SRC, ...bereich.split("/")))) {
      const treffer = aufrufeOhneZeitzone(readFileSync(pfad, "utf8"));
      if (treffer.length > 0) ist[relative(SRC, pfad).split(sep).join("/")] = treffer;
    }
  }

  it("formatiert Datum und Uhrzeit nur mit timeZone (sonst formatDatumDE/formatZeitpunktDE)", () => {
    const zuViel = Object.entries(ist)
      .filter(([datei, treffer]) => treffer.length > (ZAHLEN[datei] ?? 0))
      .map(([datei, treffer]) => `${datei}: ${treffer.join(" | ")}`);
    expect(zuViel).toEqual([]);
  });

  it("ZAHLEN ist aktuell (eine entfernte Zahlenformatierung auch hier austragen)", () => {
    const veraltet = Object.entries(ZAHLEN)
      .filter(([datei, anzahl]) => (ist[datei]?.length ?? 0) < anzahl)
      .map(([datei, anzahl]) => `${datei}: nur noch ${ist[datei]?.length ?? 0}, eingetragen ${anzahl}`);
    expect(veraltet).toEqual([]);
  });
});
