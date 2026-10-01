/**
 * Farbkontrast nach WCAG 2.1 (rein, client-sicher).
 *
 * Wozu: Die Tokens der Oberflaeche („Klarer Weg", U0) sollen AA erreichen —
 * gemessen, nicht behauptet. axe kann das im Jest-Lauf nicht: jsdom hat kein
 * Layout, die Regel „color-contrast" laeuft dort ins Leere. Deshalb rechnet
 * `src/__tests__/lib/ui-kontrast.test.ts` die Token-Paare aus `globals.css`
 * mit diesen Funktionen nach.
 *
 * Halbtransparente Toene (`rgba(…)`, die „-soft"-Tokens) haben fuer sich keinen
 * Kontrast; sie werden zuerst auf ihren Untergrund gelegt (`aufUntergrund`).
 */

export interface Farbe {
  r: number;
  g: number;
  b: number;
  /** Deckkraft 0–1. */
  a: number;
}

/** Liest `#rgb`, `#rrggbb`, `rgb(…)` und `rgba(…)`. Anderes ergibt `null`. */
export function farbeLesen(wert: string): Farbe | null {
  const text = wert.trim().toLowerCase();

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (z) => z + z) : hex[1];
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 1,
    };
  }

  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(\d*\.?\d+)\s*)?\)$/.exec(text);
  if (rgb) {
    const [r, g, b] = [rgb[1], rgb[2], rgb[3]].map(Number);
    const a = rgb[4] === undefined ? 1 : Number(rgb[4]);
    if (r > 255 || g > 255 || b > 255 || a > 1) return null;
    return { r, g, b, a };
  }

  return null;
}

/** Legt eine (halbtransparente) Farbe auf einen deckenden Untergrund. */
export function aufUntergrund(farbe: Farbe, untergrund: Farbe): Farbe {
  const mische = (oben: number, unten: number) => oben * farbe.a + unten * (1 - farbe.a);
  return {
    r: mische(farbe.r, untergrund.r),
    g: mische(farbe.g, untergrund.g),
    b: mische(farbe.b, untergrund.b),
    a: 1,
  };
}

/** Relative Leuchtdichte (0 = Schwarz, 1 = Weiss) einer deckenden Farbe. */
export function leuchtdichte(farbe: Farbe): number {
  const linear = (kanal: number) => {
    const c = kanal / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(farbe.r) + 0.7152 * linear(farbe.g) + 0.0722 * linear(farbe.b);
}

/**
 * Kontrastverhaeltnis 1–21 von Vordergrund auf Hintergrund. Der Hintergrund
 * darf halbtransparent sein; dann zaehlt, worauf er liegt, und `untergrund`
 * (deckend) ist PFLICHT. Ohne ihn rechnete die Funktion den Ton still als
 * deckend — `rgba(0,0,0,.06)` waere Schwarz — und ein unlesbares Paar koennte
 * bestehen. Deshalb ein Fehler statt einer falschen Zahl.
 */
export function kontrast(vordergrund: Farbe, hintergrund: Farbe, untergrund?: Farbe): number {
  if (hintergrund.a < 1 && (!untergrund || untergrund.a < 1)) {
    throw new Error("kontrast: halbtransparenter Hintergrund braucht einen deckenden Untergrund");
  }
  const flaeche = hintergrund.a < 1 && untergrund ? aufUntergrund(hintergrund, untergrund) : hintergrund;
  const text = vordergrund.a < 1 ? aufUntergrund(vordergrund, flaeche) : vordergrund;
  const [hell, dunkel] = [leuchtdichte(text), leuchtdichte(flaeche)].sort((x, y) => y - x);
  return (hell + 0.05) / (dunkel + 0.05);
}

/** AA-Grenzen: normaler Text 4,5:1; Bedienelemente und grosse Schrift 3:1. */
export const AA_TEXT = 4.5;
export const AA_BEDIENELEMENT = 3;
