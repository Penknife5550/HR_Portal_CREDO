/**
 * Kontrast der Oberflaechen-Tokens (UX-Umbau, U0).
 *
 * „Barrierefreiheit wird gemessen, nicht behauptet" (UX-Plan, Abschnitt 7).
 * axe kann Farbkontraste im Jest-Lauf nicht pruefen (jsdom hat kein Layout);
 * deshalb rechnet dieser Test die Tokens aus `src/app/globals.css`.
 *
 * EINE QUELLE: Welche Paare es gibt, steht nicht hier, sondern in den
 * Bausteinen — `STATUS_TOENE` (statuspille.tsx) und `BUTTON_FARBEN`
 * (button.tsx), dazu die Symbolfarben aus `TOAST_TOENE` (toast.tsx). Der Test liest deren Klassen und rechnet jedes Paar, auch die
 * beim Ueberfahren. Ein neuer Ton oder eine neue Variante ist damit von selbst
 * dabei; eine Hand-Liste liefe auseinander (so geschehen: das Hover-Paar des
 * Primaerknopfs fehlte, ein nie benutztes Paar stand darin).
 *
 * WAS DER TEST NICHT SIEHT
 *   - Abblenden ueber `opacity` (ein ohne `laedt` gesperrter Knopf): gilt als
 *     inaktiv und ist von WCAG ausgenommen. `laedt` blendet deshalb NICHT ab.
 *   - Untergruende ausser Karte und Seitengrund. Die „-soft"-Toene sind
 *     halbtransparent; auf einem getoenten Zeilen-Hover hielte eine Pille die
 *     4,5:1 nicht mehr (neutral: 4,1–4,4:1). Regel: Zeilen mit Pillen
 *     bekommen keinen getoenten Hover.
 *   - `text-ink-3`: haelt die Sperrklinke (Stand 0), nicht dieser Test.
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
import { BUTTON_FARBEN, type ButtonVariante } from "@/components/ui/button";
import { SEGMENT_FARBEN } from "@/components/ui/segment";
import { MENUE_FARBEN } from "@/components/ui/seitenkopf";
import { KOPF_FARBEN } from "@/components/rahmen/portal-kopf";
import { STATUS_TOENE, type StatusTon } from "@/components/ui/statuspille";
import { TOAST_TOENE, type ToastTon } from "@/components/ui/toast";

// Kommentare zaehlen nicht: Ein „--color-ok: #…" in einem Kommentar waere
// sonst der erste Treffer und der Test maesse den falschen Wert.
const css = readFileSync(join(__dirname, "..", "..", "app", "globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

function token(name: string): Farbe {
  const treffer = [...css.matchAll(new RegExp(`--color-${name}:\\s*([^;]+);`, "g"))];
  // Genau EINE Deklaration: Bei zweien gaelte im Browser die letzte, und der
  // Test wuesste nicht, welche er messen soll.
  if (treffer.length !== 1) {
    throw new Error(`Token --color-${name}: ${treffer.length} Deklarationen in globals.css, erwartet genau eine`);
  }
  const farbe = farbeLesen(treffer[0][1]);
  if (!farbe) throw new Error(`Token --color-${name} ist nicht lesbar: ${treffer[0][1]}`);
  return farbe;
}

/** Tokenname aus der ersten Klasse mit diesem Praefix (`bg-ok-soft` → `ok-soft`). */
function farbeAus(
  klassen: string,
  praefix: "bg" | "text" | "hover:bg" | "data-[highlighted]:bg",
): string | null {
  const klasse = klassen.split(/\s+/).find((k) => k.startsWith(`${praefix}-`));
  return klasse ? klasse.slice(praefix.length + 1) : null;
}

/** Die beiden Flaechen, auf denen Inhalte stehen. */
const FLAECHEN = ["card", "surface"] as const;

/** Kontrast von Text auf einem (evtl. halbtransparenten oder fehlenden) Grund ueber einer Flaeche. */
function kontrastAuf(text: string, grund: string | null, flaeche: (typeof FLAECHEN)[number]): number {
  return grund === null
    ? kontrast(token(text), token(flaeche))
    : kontrast(token(text), token(grund), token(flaeche));
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

  it("ein halbtransparenter VORDERGRUND wird auf die Flaeche gelegt", () => {
    const halbSchwarz = farbeLesen("rgba(0,0,0,0.5)")!;
    const weiss = farbeLesen("#fff")!;
    const grau = farbeLesen("rgb(128,128,128)")!;
    expect(kontrast(halbSchwarz, weiss)).toBeCloseTo(kontrast(grau, weiss), 1);
  });

  it("verlangt deckende Untergruende, statt halbtransparente als deckend zu rechnen", () => {
    const halb = farbeLesen("rgba(0,0,0,0.06)")!;
    const weiss = farbeLesen("#fff")!;
    expect(() => kontrast(weiss, halb)).toThrow("braucht einen deckenden Untergrund");
    expect(() => kontrast(weiss, halb, halb)).toThrow("braucht einen deckenden Untergrund");
    expect(() => kontrast(weiss, halb, weiss)).not.toThrow();
    expect(() => aufUntergrund(halb, halb)).toThrow("der Untergrund muss deckend sein");
  });
});

describe("Tokens aus globals.css", () => {
  it("jedes Token steht genau einmal da", () => {
    for (const name of ["surface", "card", "ink", "ink-2", "action", "ok", "critical-hover", "scrim"]) {
      expect(() => token(name)).not.toThrow();
    }
    expect(() => token("gibt-es-nicht")).toThrow("0 Deklarationen");
  });

  it.each(["ink", "ink-2", "action", "ok", "wait", "critical", "info"])(
    "%s ist als Text auf Karte und Seitengrund lesbar",
    (name) => {
      for (const flaeche of FLAECHEN) {
        expect(kontrast(token(name), token(flaeche))).toBeGreaterThanOrEqual(AA_TEXT);
      }
    },
  );
});

describe("Statuspille: jeder Ton aus STATUS_TOENE", () => {
  const TOENE = Object.keys(STATUS_TOENE) as StatusTon[];

  it("die Tabelle ist nicht leer und jeder Ton nennt Grund und Text", () => {
    expect(TOENE.length).toBeGreaterThanOrEqual(5);
    for (const ton of TOENE) {
      expect(farbeAus(STATUS_TOENE[ton], "bg")).not.toBeNull();
      expect(farbeAus(STATUS_TOENE[ton], "text")).not.toBeNull();
    }
  });

  it.each(TOENE)("%s: Text auf Grund erreicht AA – auf Karte und auf Seitengrund", (ton) => {
    const text = farbeAus(STATUS_TOENE[ton], "text")!;
    const grund = farbeAus(STATUS_TOENE[ton], "bg")!;
    for (const flaeche of FLAECHEN) {
      expect(kontrastAuf(text, grund, flaeche)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("kein Ton nutzt ink-3 als Text", () => {
    for (const ton of TOENE) expect(STATUS_TOENE[ton]).not.toMatch(/\btext-ink-3\b/);
  });
});

describe("Button: jede Variante aus BUTTON_FARBEN, in Ruhe und beim Ueberfahren", () => {
  const VARIANTEN = Object.keys(BUTTON_FARBEN) as ButtonVariante[];

  it.each(VARIANTEN)("%s erreicht AA in Ruhe", (variante) => {
    const { ruhe } = BUTTON_FARBEN[variante];
    const text = farbeAus(ruhe, "text")!;
    expect(text).not.toBeNull();
    for (const flaeche of FLAECHEN) {
      expect(kontrastAuf(text, farbeAus(ruhe, "bg"), flaeche)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it.each(VARIANTEN)("%s erreicht AA beim Ueberfahren – und der Kontrast faellt dabei nicht unter AA", (variante) => {
    const { ruhe, hover } = BUTTON_FARBEN[variante];
    const text = farbeAus(ruhe, "text")!;
    const grundHover = farbeAus(hover, "hover:bg");
    expect(grundHover).not.toBeNull();
    for (const flaeche of FLAECHEN) {
      expect(kontrastAuf(text, grundHover, flaeche)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("critical wird beim Ueberfahren dunkler: der Kontrast zum weissen Text steigt", () => {
    const weiss = token("critical-foreground");
    expect(kontrast(weiss, token("critical-hover"))).toBeGreaterThan(kontrast(weiss, token("critical")));
  });

  it("kein Filter und keine Deckkraft in den Farbklassen (beides aendert den Kontrast am Test vorbei)", () => {
    for (const variante of VARIANTEN) {
      const { ruhe, hover } = BUTTON_FARBEN[variante];
      expect(`${ruhe} ${hover}`).not.toMatch(/brightness|opacity|\/\d/);
    }
  });

  it("der Fokusring (action) hebt sich von jeder Knopfflaeche und beiden Seitenflaechen ab", () => {
    // Der Ring sitzt mit 2 px Abstand um den Knopf, steht also auf der
    // Flaeche dahinter.
    for (const flaeche of FLAECHEN) {
      expect(kontrast(token("action"), token(flaeche))).toBeGreaterThanOrEqual(AA_BEDIENELEMENT);
    }
  });
});

describe("Toast und Dialog", () => {
  const TOENE = Object.keys(TOAST_TOENE) as ToastTon[];

  it.each(TOENE)("Toast %s: das Symbol hebt sich von der Karte ab (der Text daneben ist ink)", (ton) => {
    const farbe = farbeAus(TOAST_TOENE[ton].farbe, "text");
    expect(farbe).not.toBeNull();
    expect(kontrast(token(farbe!), token("card"))).toBeGreaterThanOrEqual(AA_BEDIENELEMENT);
  });

  it("nur der Fehler bleibt stehen", () => {
    expect(TOENE.filter((ton) => TOAST_TOENE[ton].dauer === null)).toEqual(["fehler"]);
  });

  it("der Schleier hinter dem Dialog laesst die Karte klar hervortreten", () => {
    // Die Dialogflaeche (card) gegen den abgedunkelten Seitengrund.
    for (const flaeche of FLAECHEN) {
      const dahinter = aufUntergrund(token("scrim"), token(flaeche));
      expect(kontrast(token("card"), dahinter)).toBeGreaterThanOrEqual(1.5);
    }
  });
});

describe("Segment-Schalter und Menue des Seitenkopfs", () => {
  it("Segment: nicht gewaehlte Sicht auf dem Grund des Schalters, gewaehlte auf ihrer Flaeche", () => {
    const grund = farbeAus(SEGMENT_FARBEN.grund, "bg")!;
    const ruhe = farbeAus(SEGMENT_FARBEN.ruhe, "text")!;
    const aktivText = farbeAus(SEGMENT_FARBEN.aktiv, "text")!;
    const aktivGrund = farbeAus(SEGMENT_FARBEN.aktiv, "bg")!;
    for (const flaeche of FLAECHEN) {
      expect(kontrastAuf(ruhe, grund, flaeche)).toBeGreaterThanOrEqual(AA_TEXT);
      // Die gewaehlte Flaeche ist deckend; sie liegt auf dem Grund des Schalters.
      expect(kontrast(token(aktivText), token(aktivGrund))).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it.each(["normal", "kritisch"] as const)("Menue %s: Text in Ruhe und hervorgehoben (auf der Karte)", (art) => {
    const { ruhe, hervor } = MENUE_FARBEN[art];
    const text = farbeAus(ruhe, "text")!;
    const grund = farbeAus(hervor, "data-[highlighted]:bg");
    expect(grund).not.toBeNull();
    expect(kontrast(token(text), token("card"))).toBeGreaterThanOrEqual(AA_TEXT);
    expect(kontrastAuf(text, grund, "card")).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe("Kopf des Portals", () => {
  // Der Kopf steht auf `card`.
  it("Punkt in Ruhe, beim Ueberfahren und aktiv", () => {
    const ruhe = farbeAus(KOPF_FARBEN.ruhe, "text")!;
    const hoverGrund = farbeAus(KOPF_FARBEN.hover, "hover:bg")!;
    const aktivText = farbeAus(KOPF_FARBEN.aktiv, "text")!;
    const aktivGrund = farbeAus(KOPF_FARBEN.aktiv, "bg")!;
    expect(kontrast(token(ruhe), token("card"))).toBeGreaterThanOrEqual(AA_TEXT);
    // Beim Ueberfahren wird der Text `ink` (steht in KOPF_FARBEN.hover).
    expect(KOPF_FARBEN.hover).toContain("hover:text-ink");
    expect(kontrastAuf("ink", hoverGrund, "card")).toBeGreaterThanOrEqual(AA_TEXT);
    expect(kontrastAuf(aktivText, aktivGrund, "card")).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("der BEM-Zaehler: Zahl auf seiner Flaeche", () => {
    const text = farbeAus(KOPF_FARBEN.zaehler, "text")!;
    const grund = farbeAus(KOPF_FARBEN.zaehler, "bg")!;
    expect(kontrast(token(text), token(grund))).toBeGreaterThanOrEqual(AA_TEXT);
  });
});
