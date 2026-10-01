/**
 * Sperrklinke gegen neue Altmuster (UX-Umbau, U0).
 *
 * Der Umbau loest Muster ab, die es im Quelltext noch hundertfach gibt:
 * Browser-Rueckfragen, selbst gebaute Ueberlagerungen, fest eingetragene
 * Farben. Solange sie Modul fuer Modul verschwinden (U4, U10), darf ihre Zahl
 * SINKEN, aber nicht STEIGEN — sonst waechst der Berg, waehrend er abgetragen
 * wird. Genau das ist zwischen Fassung 2 und Fassung 3 des Plans passiert:
 * Paket 3, Paket 4 und der Zeitplaner brachten 5 neue `confirm()` und 27 neue
 * `toLocaleDateString`.
 *
 * FAELLT DIESER TEST,
 *   - weil eine Zahl GESTIEGEN ist: den Baustein aus `src/components/ui/`
 *     nehmen (Spalte „stattdessen"), nicht die Grenze anheben;
 *   - weil eine Zahl GESUNKEN ist: gut — die Grenze im selben Commit auf den
 *     neuen Wert senken, damit der Gewinn gehalten wird.
 *
 * Gezaehlt wird in `src/` ohne `__tests__`, in .ts und .tsx, je Vorkommen
 * (auch in Kommentaren — eine Sperrklinke muss nicht klug sein, nur stetig).
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const WURZEL = join(__dirname, "..", "..");

function quelltexte(verzeichnis: string): string[] {
  const dateien: string[] = [];
  for (const name of readdirSync(verzeichnis)) {
    if (name === "__tests__") continue;
    const pfad = join(verzeichnis, name);
    if (statSync(pfad).isDirectory()) dateien.push(...quelltexte(pfad));
    else if (/\.tsx?$/.test(name)) dateien.push(pfad);
  }
  return dateien;
}

const inhalte = quelltexte(WURZEL).map((pfad) => readFileSync(pfad, "utf8"));

function zaehle(muster: RegExp): number {
  return inhalte.reduce((summe, text) => summe + (text.match(muster)?.length ?? 0), 0);
}

/** Stand 01.10.2026 (Beginn U0). Nur nach unten aendern. */
const GRENZEN: { name: string; muster: RegExp; hoechstens: number; stattdessen: string }[] = [
  {
    name: "confirm(",
    muster: /\bconfirm\(/g,
    hoechstens: 33,
    stattdessen: "BestaetigungsDialog aus ui/dialog",
  },
  {
    name: "alert(",
    muster: /\balert\(/g,
    hoechstens: 4,
    stattdessen: "toast aus ui/toast",
  },
  {
    name: "toLocaleDateString",
    muster: /toLocaleDateString/g,
    hoechstens: 74,
    stattdessen: "formatDatumDE aus lib/format (deutsche Zeit, TT.MM.JJJJ)",
  },
  {
    name: "fest eingetragene Hex-Farbe in einer Klasse ([#…])",
    muster: /\[#[0-9A-Fa-f]{3,8}\]/g,
    hoechstens: 181,
    stattdessen: "Tokens aus globals.css (bg-action, text-ok, …)",
  },
  {
    name: "selbst gebaute Ueberlagerung (fixed inset-0)",
    muster: /fixed inset-0/g,
    hoechstens: 29,
    stattdessen: "Dialog aus ui/dialog",
  },
  {
    name: "Inline-<svg",
    muster: /<svg/g,
    hoechstens: 150,
    stattdessen: "Symbol aus lucide-react",
  },
];

describe("Sperrklinke: Altmuster duerfen nur weniger werden", () => {
  it.each(GRENZEN)("$name: hoechstens $hoechstens (stattdessen: $stattdessen)", ({ muster, hoechstens }) => {
    expect(zaehle(muster)).toBeLessThanOrEqual(hoechstens);
  });

  it("die Grenzen sind nachgezogen – keine liegt ueber dem heutigen Stand", () => {
    // Ohne diese Probe bliebe eine Grenze nach einem Umbau zu hoch stehen und
    // liesse genau so viele neue Altmuster wieder zu, wie gerade entfernt wurden.
    const zuHoch = GRENZEN.filter((g) => zaehle(g.muster) < g.hoechstens).map(
      (g) => `${g.name}: heute ${zaehle(g.muster)}, Grenze ${g.hoechstens}`,
    );
    expect(zuHoch).toEqual([]);
  });
});
