/**
 * Ausstattung & Zugaenge (Paket A3, S17): zwei Zeilen fuer die Karte
 * „Aufgaben für Abteilungen“ (src/components/abteilungsaufgaben/abteilungen-karte.tsx)
 *
 *   NachtragHinweis  „Nach der Information geändert: „…“ hinzugefügt. Die
 *                    Stelle erfährt davon erst mit „Nachtrag senden“.“
 *                    (Regel 10, Mockup 6.3) — aus `zeile.nachtrag`.
 *   WaechterHinweis  der rote Waechter (Regel 15) in den Sonderzeilen der
 *                    Karte (Stelle uebersprungen, Fuehrungskraft fehlt), die
 *                    den gewoehnlichen Hinweis der Zeile nicht zeigen — aus
 *                    `anzeige.hinweis` mit `anzeige.hinweisTon === "rot"`.
 *
 * Beide rechnen nichts: Text und Ton baut der Server (`abteilungsZeilenBauen`,
 * `waechterHinweis`, `nachtragZeilenText` in src/lib/abteilungsaufgaben.ts).
 * Eigene Datei, damit die bestehende Karte nur einbindet (Sperrklinke: neue
 * Oberflaeche nur mit Tokens).
 */

import type { AbteilungsZeile, Anzeige } from "@/lib/abteilungsaufgaben";

/** Die Zeile „Nach der Information geändert: …“ — nur mit offenem Nachtrag. */
export function NachtragHinweis({ nachtrag }: { nachtrag: AbteilungsZeile["nachtrag"] }) {
  if (!nachtrag || nachtrag.anzahl <= 0) return null;
  return (
    <p
      className="mt-1.5 rounded-md border border-credo-gelb/40 bg-credo-gelb/10 px-2 py-1 text-xs text-foreground"
      data-hinweis="nachtrag"
    >
      {nachtrag.text}
    </p>
  );
}

/**
 * Der rote Waechter in einer Sonderzeile (eine Zeile mit `flex-wrap`: der
 * Hinweis steht mit `basis-full` in einer eigenen Reihe darunter).
 *
 * Der Text steht in `text-foreground`, nicht in `text-credo-rot` — wie beim
 * `NachtragHinweis` darueber und aus demselben Grund wie in
 * `ausgaben/rueckgaben-karte.tsx` („Text immer in Vordergrundfarbe (Kontrast),
 * der Zustand steht als Wort da“). Belegt durch die Durchsicht vom 15.10.2026,
 * Zahlen nachgerechnet: Die beiden Sonderzeilen der Karte haben selbst schon
 * `bg-credo-gelb/10`, die halbtransparenten Toene stapeln sich also
 * (rgb(252,225,210)), und #E2001A kam darauf bei 12 px nur auf 3,96:1 (noetig
 * 4,5:1) — auf weissem Grund allein waeren es 4,15:1, ebenfalls zu wenig.
 * `foreground` erreicht 13,96:1. Genau davor warnt CLAUDE.md („Kein `opacity`,
 * kein Filter, kein `/50` in Farbklassen — das aenderte den Kontrast am Test
 * vorbei“), und diese Datei liegt ausserhalb der Reichweite des
 * Kontrast-Waechters.
 *
 * Flaeche und Rand sind dabei Zierde, nicht die Aussage (der Rand hat gegen den
 * Grund nur 1,96:1): Die Aussage steht im Text — „ein Zustand traegt immer
 * Text, nie nur Farbe“.
 */
export function WaechterHinweis({ anzeige }: { anzeige: Pick<Anzeige, "hinweis" | "hinweisTon"> }) {
  if (anzeige.hinweisTon !== "rot" || !anzeige.hinweis) return null;
  return (
    <p
      className="basis-full rounded-md border border-credo-rot/40 bg-credo-rot/10 px-2 py-1 text-xs text-foreground"
      data-hinweis="waechter"
    >
      {anzeige.hinweis}
    </p>
  );
}
