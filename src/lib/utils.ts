import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge kennt nur die Standard-Namen. Eigene GROESSEN-Tokens aus
 * `globals.css` muessen ihm genannt werden — sonst haelt es `shadow-overlay`
 * fuer eine Schattenfarbe und `text-titel` fuer eine Textfarbe: Die Klasse
 * fiele neben einer echten Farbe weg, und `shadow-none` ueberschriebe sie
 * nicht. Farb-Tokens braucht es hier nicht (alles Unbekannte gilt als Farbe).
 *
 * Wer in `globals.css` ein `--shadow-*`, `--text-*` oder `--tracking-*`
 * ergaenzt, traegt es hier ein (Test: src/__tests__/lib/utils-cn.test.ts).
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      shadow: ["overlay"],
      text: ["2xs", "titel"],
      tracking: ["label", "titel"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
