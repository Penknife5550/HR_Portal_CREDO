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
 */
export function WaechterHinweis({ anzeige }: { anzeige: Pick<Anzeige, "hinweis" | "hinweisTon"> }) {
  if (anzeige.hinweisTon !== "rot" || !anzeige.hinweis) return null;
  return (
    <p
      className="basis-full rounded-md bg-credo-rot/10 px-2 py-1 text-xs text-credo-rot"
      data-hinweis="waechter"
    >
      {anzeige.hinweis}
    </p>
  );
}
