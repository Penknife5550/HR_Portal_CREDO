/**
 * Die Farb-Tokens der Oberflaeche aus `src/app/globals.css`, fuer Kontrasttests.
 *
 *   expect(kontrast(token("ink-2"), token("card"))).toBeGreaterThanOrEqual(AA_TEXT);
 *
 * EINE Stelle, die die CSS-Datei liest: `ui-kontrast.test.ts` rechnet damit die
 * Tabellen von Statuspille, Button, Toast, Segment, Menue und Kopf; die Tests
 * von Prozessleiste und Reitern rechnen ihre eigenen Tabellen (`PROZESS_FARBEN`,
 * `REITER_FARBEN`).
 */
import { readFileSync } from "fs";
import { join } from "path";
import { farbeLesen, type Farbe } from "@/lib/ui/kontrast";

// Kommentare zaehlen nicht: Ein „--color-ok: #…" in einem Kommentar waere
// sonst der erste Treffer und der Test maesse den falschen Wert.
const css = readFileSync(join(__dirname, "..", "..", "app", "globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** Die beiden Flaechen, auf denen Inhalte stehen. */
export const FLAECHEN = ["card", "surface"] as const;

/** Der Wert von `--color-<name>`. Wirft, wenn das Token fehlt, doppelt dasteht oder unlesbar ist. */
export function token(name: string): Farbe {
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
