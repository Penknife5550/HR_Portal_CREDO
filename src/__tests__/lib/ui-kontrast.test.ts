/**
 * Kontrast der Oberflaechen-Tokens (UX-Umbau, U0).
 *
 * „Barrierefreiheit wird gemessen, nicht behauptet" (UX-Plan, Abschnitt 7).
 * axe kann Farbkontraste im Jest-Lauf nicht pruefen (jsdom hat kein Layout);
 * deshalb liest dieser Test die Tokens aus `src/app/globals.css` und rechnet
 * jedes Paar, das die Bausteine in `src/components/ui/` wirklich bilden.
 *
 * Wer einen Tokenwert aendert, sieht hier sofort, ob er noch lesbar ist. Wer
 * ein neues Paar baut (neuer Ton auf neuem Grund), traegt es unten ein.
 */
import { readFileSync } from "fs";
import { join } from "path";
import {
  AA_BEDIENELEMENT,
  AA_TEXT,
  aufUntergrund,
  farbeLesen,
  kontrast,
  leuchtdichte,
  type Farbe,
} from "@/lib/ui/kontrast";

const css = readFileSync(join(__dirname, "..", "..", "app", "globals.css"), "utf8");

function token(name: string): Farbe {
  const treffer = new RegExp(`--color-${name}:\\s*([^;]+);`).exec(css);
  if (!treffer) throw new Error(`Token --color-${name} fehlt in globals.css`);
  const farbe = farbeLesen(treffer[1]);
  if (!farbe) throw new Error(`Token --color-${name} ist nicht lesbar: ${treffer[1]}`);
  return farbe;
}

describe("Rechnung", () => {
  it("liest Hex, Kurz-Hex, rgb und rgba", () => {
    expect(farbeLesen("#FFFFFF")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(farbeLesen("#0f0")).toEqual({ r: 0, g: 255, b: 0, a: 1 });
    expect(farbeLesen("rgb(1, 2, 3)")).toEqual({ r: 1, g: 2, b: 3, a: 1 });
    expect(farbeLesen("rgba(0, 0, 0, 0.08)")).toEqual({ r: 0, g: 0, b: 0, a: 0.08 });
    expect(farbeLesen("rgba(0,0,0,.5)")).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
  });

  it("weist Unlesbares ab statt zu raten", () => {
    for (const wert of ["", "rot", "#12", "#gggggg", "rgb(300,0,0)", "rgba(0,0,0,2)", "var(--x)"]) {
      expect(farbeLesen(wert)).toBeNull();
    }
  });

  it("Schwarz auf Weiss ist 21:1, gleiche Farben 1:1", () => {
    const schwarz = farbeLesen("#000")!;
    const weiss = farbeLesen("#fff")!;
    expect(kontrast(schwarz, weiss)).toBeCloseTo(21, 5);
    expect(kontrast(weiss, schwarz)).toBeCloseTo(21, 5);
    expect(kontrast(weiss, weiss)).toBeCloseTo(1, 5);
    expect(leuchtdichte(weiss)).toBeCloseTo(1, 5);
  });

  it("legt einen halbtransparenten Ton auf seinen Untergrund", () => {
    const halb = farbeLesen("rgba(0,0,0,0.5)")!;
    const weiss = farbeLesen("#fff")!;
    expect(aufUntergrund(halb, weiss)).toEqual({ r: 127.5, g: 127.5, b: 127.5, a: 1 });
    // Auf Weiss ist der Ton ein Grau, kein Schwarz.
    expect(kontrast(weiss, halb, weiss)).toBeLessThan(kontrast(weiss, { ...halb, a: 1 }));
  });

  it("verlangt den Untergrund, statt einen halbtransparenten Ton als deckend zu rechnen", () => {
    const halb = farbeLesen("rgba(0,0,0,0.06)")!;
    const weiss = farbeLesen("#fff")!;
    expect(() => kontrast(weiss, halb)).toThrow("braucht einen deckenden Untergrund");
    expect(() => kontrast(weiss, halb, halb)).toThrow("braucht einen deckenden Untergrund");
    expect(() => kontrast(weiss, halb, weiss)).not.toThrow();
  });
});

describe("Tokens aus globals.css", () => {
  /** Die beiden Flaechen, auf denen Inhalte stehen. */
  const FLAECHEN = ["card", "surface"] as const;

  it.each(["ink", "ink-2", "action", "ok", "wait", "critical", "info"])(
    "%s ist als Text auf Karte und Seitengrund lesbar",
    (name) => {
      for (const flaeche of FLAECHEN) {
        expect(kontrast(token(name), token(flaeche))).toBeGreaterThanOrEqual(AA_TEXT);
      }
    },
  );

  // Statuspille: Zustandston als Text auf seinem „-soft"-Grund — und die Pille
  // steht in Gruppen (Karte) ebenso wie frei auf dem Seitengrund.
  it.each([
    ["ok", "ok-soft"],
    ["wait", "wait-soft"],
    ["critical", "critical-soft"],
    ["info", "info-soft"],
    ["ink-2", "neutral-soft"],
    ["ink", "action-soft"],
    ["ink", "neutral-soft"],
  ])("%s auf %s erreicht AA – auf Karte und auf Seitengrund", (text, grund) => {
    for (const flaeche of FLAECHEN) {
      expect(kontrast(token(text), token(grund), token(flaeche))).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  // Gefuellte Knoepfe
  it.each([
    ["action-foreground", "action"],
    ["critical-foreground", "critical"],
  ])("%s auf %s erreicht AA", (text, grund) => {
    expect(kontrast(token(text), token(grund))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("der Fokusring (action) hebt sich von beiden Flaechen ab", () => {
    for (const flaeche of FLAECHEN) {
      expect(kontrast(token("action"), token(flaeche))).toBeGreaterThanOrEqual(AA_BEDIENELEMENT);
    }
  });

  // ink-3 steht bewusst in KEINER der Listen oben: 2,8:1. Er ist kein Textton —
  // auch nicht fuer Platzhalter, die nach WCAG Text sind (dafuer ink-2). Erlaubt
  // nur fuer Gesperrtes (von WCAG ausgenommen), Trennzeichen und Zierde. Die
  // Regel halten globals.css und CLAUDE.md fest; ein Test, der den schwachen
  // Kontrast VERLANGT, fiele genau dann, wenn jemand den Ton verbessert.
});
