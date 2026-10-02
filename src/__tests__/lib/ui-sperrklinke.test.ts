/**
 * Sperrklinke gegen neue Altmuster der Oberflaeche.
 *
 * Der UX-Umbau („Klarer Weg", docs/module/ux-ui/) loest Muster ab, die es im
 * Quelltext noch hundertfach gibt: Browser-Rueckfragen, selbst gebaute
 * Ueberlagerungen, fest eingetragene Farben. Solange sie Modul fuer Modul
 * verschwinden, darf ihre Zahl SINKEN, aber nicht STEIGEN.
 *
 * WIE GEZAEHLT WIRD
 *   - je DATEI, nicht als Summe ueber alles: Ein entferntes Altmuster in Modul
 *     A gleicht ein neues in Modul B nicht aus, und die Meldung nennt die Datei.
 *   - OHNE Kommentare: „ersetzt confirm()" in einem Kopfkommentar ist kein
 *     Aufruf. (Frueher zaehlten Kommentare mit; der Ersatzbaustein haette sich
 *     selbst gesperrt, sobald sein Kommentar das Altmuster nennt.)
 *   - in `src/` ohne `__tests__`, .ts und .tsx. Einzelne Muster nehmen
 *     `src/components/ui/` aus — dort entsteht der Ersatz (ein Dialog BRAUCHT
 *     seine Ueberlagerung).
 *
 * DER STAND steht in `ui-sperrklinke.stand.json` (Muster → Datei → Anzahl).
 * Der Test verlangt je Datei GENAU diesen Stand:
 *   - mehr als im Stand  → neues Altmuster: den Ersatz nehmen (Spalte
 *     „stattdessen"), nicht den Stand anheben;
 *   - weniger als im Stand → gut. Stand neu schreiben, damit der Gewinn
 *     gehalten wird:  SPERRKLINKE_STAND=schreiben npx jest ui-sperrklinke
 *
 * GEGEN STILLES ANHEBEN steht je Muster zusaetzlich die Summe als `gesamt` in
 * dieser Datei. Wer den Stand neu schreibt, muss `gesamt` von Hand nachziehen —
 * nach unten ohne Weiteres. NACH OBEN nur in einem Merge-Commit, der Altmuster
 * von einem anderen Zweig mitbringt (im Logbuch des Umbaus vermerken), nie in
 * einem Commit, der selbst Oberflaeche baut.
 *
 * WAS DIE SPERRKLINKE NICHT KANN: Sie laeuft nur, wenn Jest laeuft. Es gibt
 * weder CI noch Git-Hooks; `npm run pruefen` (Typen, Lint, Tests) gehoert vor
 * jeden Push.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join, relative, sep } from "path";

const WURZEL = join(__dirname, "..", "..");
const STAND_DATEI = join(__dirname, "ui-sperrklinke.stand.json");
const SCHREIBEN = process.env.SPERRKLINKE_STAND === "schreiben";

// =============================================
// Quelltexte einlesen (einmal, ohne Kommentare)
// =============================================

/**
 * Entfernt Zeilen- und Blockkommentare. Zeichenketten bleiben stehen — ein
 * `//` in "https://…" ist kein Kommentar. Bewusst ein kleiner Zustandsautomat
 * statt eines Parsers: Er muss nicht jede Feinheit kennen (Regex-Literale,
 * `//` im JSX-Fliesstext), nur stetig dasselbe liefern.
 */
export function ohneKommentare(text: string): string {
  let aus = "";
  let i = 0;
  let inZeichenkette: string | null = null;
  while (i < text.length) {
    const z = text[i];
    const n = text[i + 1];
    if (inZeichenkette) {
      aus += z;
      if (z === "\\") {
        aus += n ?? "";
        i += 2;
        continue;
      }
      if (z === inZeichenkette) inZeichenkette = null;
      i += 1;
      continue;
    }
    if (z === '"' || z === "'" || z === "`") {
      inZeichenkette = z;
      aus += z;
      i += 1;
      continue;
    }
    if (z === "/" && n === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      continue;
    }
    if (z === "/" && n === "*") {
      const ende = text.indexOf("*/", i + 2);
      // Zeilenumbrueche behalten, damit nichts zusammenwaechst
      aus += text.slice(i, ende < 0 ? text.length : ende + 2).replace(/[^\n]/g, "");
      i = ende < 0 ? text.length : ende + 2;
      continue;
    }
    aus += z;
    i += 1;
  }
  return aus;
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

const DATEIEN: { pfad: string; text: string }[] = quelltexte(WURZEL).map((pfad) => ({
  // Immer mit „/", damit der Stand auf Windows und Linux gleich aussieht
  pfad: relative(WURZEL, pfad).split(sep).join("/"),
  text: ohneKommentare(readFileSync(pfad, "utf8")),
}));

// =============================================
// Muster
// =============================================

const HEX = /#[0-9A-Fa-f]{3,8}(?![0-9A-Fa-f])/g;

/**
 * Hex-Farben in `style={{ … }}`, mit Klammerzaehlung: Ein Template-Literal
 * oder ein verschachteltes Objekt davor (`width: \`${pct}%\``) beendete die
 * fruehere Regex am ersten `}` — die Farbe dahinter blieb ungezaehlt.
 */
export function hexInStyleObjekten(text: string): number {
  let anzahl = 0;
  let ab = 0;
  for (;;) {
    const start = text.indexOf("style={{", ab);
    if (start < 0) return anzahl;
    let tiefe = 0;
    let i = start + "style=".length;
    for (; i < text.length; i += 1) {
      if (text[i] === "{") tiefe += 1;
      else if (text[i] === "}") {
        tiefe -= 1;
        if (tiefe === 0) break;
      }
    }
    anzahl += text.slice(start, i).match(HEX)?.length ?? 0;
    ab = i;
  }
}

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const FARB_PRAEFIXE =
  "bg|text|border|ring|divide|outline|fill|stroke|from|via|to|shadow|decoration|accent|caret";

interface Muster {
  schluessel: string;
  name: string;
  zaehle: (text: string) => number;
  /** Summe ueber alle Dateien — von Hand nachzuziehen, siehe Kopf. */
  gesamt: number;
  stattdessen: string;
  /** Pfade, die dieses Muster nicht zaehlt (dort entsteht der Ersatz). */
  ausser?: RegExp;
}

const perRegex = (muster: RegExp) => (text: string) => text.match(muster)?.length ?? 0;

const MUSTER: Muster[] = [
  {
    schluessel: "confirm",
    name: "confirm(",
    zaehle: perRegex(/\bconfirm\(/g),
    gesamt: 30,
    stattdessen: "eigener Bestaetigungsdialog (ui/dialog, bis dahin unterlagen/dialog-rahmen.tsx)",
  },
  {
    schluessel: "alert",
    name: "alert(",
    zaehle: perRegex(/\balert\(/g),
    gesamt: 4,
    stattdessen: "Meldung in der Oberflaeche (ui/toast bzw. Fehlerzeile mit role=alert)",
  },
  {
    schluessel: "prompt",
    name: "prompt(",
    zaehle: perRegex(/\bprompt\(/g),
    gesamt: 1,
    stattdessen: "eigener Dialog mit Eingabefeld",
  },
  {
    schluessel: "datum",
    name: "toLocaleDateString / toLocaleTimeString",
    zaehle: perRegex(/\.toLocale(?:Date|Time)String\(/g),
    gesamt: 72,
    stattdessen: "formatDatumDE aus lib/format (deutsche Zeit, TT.MM.JJJJ)",
  },
  {
    schluessel: "hexKlasse",
    name: "Hex-Farbe in einer Klasse ([…#…])",
    zaehle: perRegex(/\[[^\][\s"'`]*#[0-9A-Fa-f]{3,8}(?![0-9A-Fa-f])[^\][\s"'`]*\]/g),
    gesamt: 181,
    stattdessen: "Farb-Token aus globals.css (z. B. shadow-[0_3px_0_0] shadow-primary)",
  },
  {
    schluessel: "farbfunktionKlasse",
    name: "Farbfunktion in einer Klasse (rgb, hsl, oklch, color-mix …)",
    zaehle: perRegex(/\[[^\][\s"'`]*(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|color)\([^\]\s"'`]*\]/gi),
    gesamt: 1,
    stattdessen: "Farb-Token aus globals.css",
  },
  {
    schluessel: "hexStyle",
    name: "Hex-Farbe in einem style-Objekt",
    zaehle: hexInStyleObjekten,
    gesamt: 10,
    stattdessen: "Token-Klasse statt style",
  },
  {
    schluessel: "palette",
    name: "Tailwind-Palettenfarbe (bg-green-100, text-red-500 …)",
    zaehle: perRegex(new RegExp(`\\b(?:${FARB_PRAEFIXE})-(?:${PALETTE})-(?:50|[1-9]00|950)\\b`, "g")),
    gesamt: 1373,
    stattdessen: "Farb-Token aus globals.css; Zustaende ueber die Statuspille (Branch ux-umbau)",
  },
  {
    schluessel: "ueberlagerung",
    name: "selbst gebaute Ueberlagerung (fixed inset-0)",
    zaehle: perRegex(/\bfixed\s+inset-0\b|\binset-0\s+fixed\b/g),
    gesamt: 29,
    stattdessen: "Dialog-Baustein (ui/dialog, bis dahin unterlagen/dialog-rahmen.tsx)",
    ausser: /^components\/ui\//,
  },
  {
    schluessel: "svg",
    name: "Inline-<svg",
    zaehle: perRegex(/<svg\b/g),
    gesamt: 148,
    stattdessen: "Symbol aus lucide-react",
  },
  {
    schluessel: "ink3Text",
    name: "ink-3 als Textfarbe (text-ink-3, auch als Platzhalter)",
    zaehle: perRegex(/\btext-ink-3\b/g),
    gesamt: 0,
    stattdessen: "text-ink-2 — ink-3 hat 2,8:1 und ist kein Textton",
  },
];

// =============================================
// Zaehlen und Stand
// =============================================

type Stand = Record<string, Record<string, number>>;

function zaehleAlles(): Stand {
  const stand: Stand = {};
  for (const m of MUSTER) {
    const jeDatei: Record<string, number> = {};
    for (const { pfad, text } of DATEIEN) {
      if (m.ausser?.test(pfad)) continue;
      const n = m.zaehle(text);
      if (n > 0) jeDatei[pfad] = n;
    }
    stand[m.schluessel] = jeDatei;
  }
  return stand;
}

const IST = zaehleAlles();
if (SCHREIBEN) writeFileSync(STAND_DATEI, `${JSON.stringify(IST, null, 2)}\n`, "utf8");
const SOLL: Stand = existsSync(STAND_DATEI) ? JSON.parse(readFileSync(STAND_DATEI, "utf8")) : {};

const summe = (jeDatei: Record<string, number> = {}) => Object.values(jeDatei).reduce((a, b) => a + b, 0);

describe("Zaehlweise", () => {
  it("Kommentare zaehlen nicht, Zeichenketten bleiben", () => {
    const text = [
      "// ersetzt confirm()",
      "/* alert( ist verboten */",
      'const adresse = "https://beispiel.invalid/a//b";',
      "const x = `${a} // kein Kommentar`;",
      "if (confirm('Wirklich?')) weiter(); // und noch ein confirm(",
    ].join("\n");
    const ohne = ohneKommentare(text);
    expect(ohne.match(/\bconfirm\(/g)).toHaveLength(1);
    expect(ohne).not.toContain("alert(");
    expect(ohne).toContain("https://beispiel.invalid/a//b");
    expect(ohne).toContain("// kein Kommentar");
    expect(ohne.split("\n")).toHaveLength(5);
  });

  it("Hex im style-Objekt wird auch hinter einem Template-Literal und einem verschachtelten Objekt gefunden", () => {
    expect(hexInStyleObjekten('<i style={{ color: "#fff" }} />')).toBe(1);
    expect(hexInStyleObjekten('<i style={{ width: `${pct}%`, backgroundColor: "#6BAA24" }} />')).toBe(1);
    expect(hexInStyleObjekten('<i style={{ ...(a ? { opacity: 1 } : {}), color: "#b42318", fill: "#000" }} />')).toBe(2);
    expect(hexInStyleObjekten('<i style={{ width: 3 }} /> <a href="#abc" />')).toBe(0);
  });

  it.each([
    ["hexKlasse", 'className="shadow-[0_3px_0_0_#575756] bg-[#fff]"', 2],
    ["farbfunktionKlasse", 'className="bg-[hsl(96_65%_40%)] text-[oklch(0.5_0.2_30)] ring-[rgb(1,2,3)]"', 3],
    ["palette", 'className="bg-green-100 text-green-800 hover:text-red-500 border-gray-200"', 4],
    ["ueberlagerung", 'className="fixed inset-0 z-50" + "inset-0 fixed"', 2],
    ["prompt", 'window.prompt("Grund?")', 1],
    ["datum", "d.toLocaleDateString('de-DE') + d.toLocaleTimeString() + n.toLocaleString()", 2],
    ["ink3Text", 'className="text-ink-3 placeholder:text-ink-3 bg-ink-3"', 2],
  ])("Muster %s trifft, was es treffen soll", (schluessel, text, erwartet) => {
    expect(MUSTER.find((m) => m.schluessel === schluessel)!.zaehle(text)).toBe(erwartet);
  });
});

describe("Sperrklinke: Altmuster duerfen je Datei nur weniger werden", () => {
  it("der Stand ist vorhanden", () => {
    expect(Object.keys(SOLL).sort()).toEqual(MUSTER.map((m) => m.schluessel).sort());
  });

  it.each(MUSTER)("$name (stattdessen: $stattdessen)", ({ schluessel, gesamt }) => {
    const ist = IST[schluessel];
    const soll = SOLL[schluessel] ?? {};
    const dateien = [...new Set([...Object.keys(ist), ...Object.keys(soll)])].sort();
    const mehr = dateien
      .filter((d) => (ist[d] ?? 0) > (soll[d] ?? 0))
      .map((d) => `${d}: ${ist[d] ?? 0} statt hoechstens ${soll[d] ?? 0}`);
    const weniger = dateien
      .filter((d) => (ist[d] ?? 0) < (soll[d] ?? 0))
      .map((d) => `${d}: nur noch ${ist[d] ?? 0}, im Stand ${soll[d]}`);

    // Neues Altmuster: den Ersatz nehmen, nicht den Stand anheben.
    expect({ neueAltmuster: mehr }).toEqual({ neueAltmuster: [] });
    // Gewinn halten: SPERRKLINKE_STAND=schreiben npx jest ui-sperrklinke
    expect({ standNachziehen: weniger }).toEqual({ standNachziehen: [] });
    // Die Summe steht zusaetzlich hier im Test — siehe Kopf.
    expect({ gesamt: summe(ist) }).toEqual({ gesamt });
  });
});
