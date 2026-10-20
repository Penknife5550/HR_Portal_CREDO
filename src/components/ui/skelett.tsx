/**
 * Skelett (UX-Umbau „Klarer Weg", U0)
 *
 * Der Ladezustand einer Liste oder Gruppe: graue Balken an der Stelle, an der
 * gleich der Inhalt steht — statt eines Drehkreises mitten auf der Seite.
 *
 *   {laedt ? <Skelett art="liste" zeilen={5} /> : <Gruppe>…</Gruppe>}
 *
 * Regeln:
 *   - Das Skelett hat die Form dessen, was kommt: dieselbe Flaeche, dieselben
 *     Haarlinien und Abstaende wie `Gruppe`/`Zeile`. So springt die Seite beim
 *     Eintreffen der Daten nicht. Die Balken sitzen dafuer in Kaesten mit der
 *     Zeilenhoehe des Textes (20 px Inhalt, 16 px Unterzeile) — ein Balken
 *     allein waere niedriger als die Zeile, die er vertritt. `liste` = Name
 *     und Unterzeile links, Pille rechts; `gruppe` = Beschriftung links, Wert
 *     rechts. `mitTitel` haelt den Platz des Gruppentitels frei.
 *   - Screenreader bekommen EINEN Satz (`label`, Vorgabe „Inhalt wird
 *     geladen"), die Balken selbst sind Zierde (`aria-hidden`). Der Bereich
 *     ist `role="status"` — bewusst OHNE `aria-busy`: Das Attribut haelt die
 *     Ansage zurueck, bis es `false` wird, und das Skelett wird entfernt, nie
 *     umgeschaltet; der Satz wuerde nie gesagt.
 *   - Kein sichtbarer Text „Lädt …" — der Platzhalter sagt es schon.
 *   - Die Balken pulsieren; wer im System „Bewegung reduzieren" gewaehlt hat,
 *     sieht sie ruhig.
 *   - Die Breiten der Balken wechseln nach festem Muster, nicht zufaellig:
 *     Server und Browser muessen dasselbe zeichnen.
 */
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type SkelettArt = "liste" | "gruppe";

const BALKEN = "rounded-sm bg-neutral-soft motion-safe:animate-pulse";

/** Wechselnde Breiten, damit die Zeilen nicht wie ein Raster aussehen. */
const BREITEN_LANG = ["w-2/5", "w-1/2", "w-1/3", "w-3/5"];
const BREITEN_KURZ = ["w-1/4", "w-1/5", "w-1/3", "w-1/4"];
const BREITEN_WERT = ["w-24", "w-32", "w-20", "w-28"];

export interface SkelettProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Form der Zeilen (Vorgabe `liste`). */
  art?: SkelettArt;
  /** Anzahl der Zeilen (Vorgabe 3, mindestens 1). */
  zeilen?: number;
  /** Platz fuer den Gruppentitel freihalten. */
  mitTitel?: boolean;
  /** Der Satz fuer Screenreader. */
  label?: string;
}

export function Skelett({
  art = "liste",
  zeilen = 3,
  mitTitel = false,
  label = "Inhalt wird geladen",
  className,
  ...rest
}: SkelettProps) {
  const anzahl = Math.max(1, Math.floor(zeilen));

  return (
    <div {...rest} role="status" data-skelett={art} className={cn("space-y-2", className)}>
      <span className="sr-only">{label}</span>
      {mitTitel && (
        <div aria-hidden="true" className="flex min-h-8 items-end px-1">
          <div className={cn(BALKEN, "h-3 w-28")} />
        </div>
      )}
      <div aria-hidden="true" className="divide-y divide-hairline rounded-xl bg-card ring-1 ring-hairline">
        {Array.from({ length: anzahl }, (_, i) =>
          art === "liste" ? (
            <div key={i} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex h-5 items-center">
                  <div className={cn(BALKEN, "h-3.5", BREITEN_LANG[i % BREITEN_LANG.length])} />
                </div>
                <div className="flex h-4 items-center">
                  <div className={cn(BALKEN, "h-3", BREITEN_KURZ[i % BREITEN_KURZ.length])} />
                </div>
              </div>
              <div className={cn(BALKEN, "h-5 w-24 shrink-0 rounded-full")} />
            </div>
          ) : (
            <div key={i} className="flex items-center justify-between gap-4 px-4 py-3">
              {/* 14 px Balken + 2 × 3 px = die 20 px einer Textzeile */}
              <div className={cn(BALKEN, "my-0.75 h-3.5", BREITEN_KURZ[i % BREITEN_KURZ.length])} />
              <div className={cn(BALKEN, "my-0.75 h-3.5", BREITEN_WERT[i % BREITEN_WERT.length])} />
            </div>
          ),
        )}
      </div>
    </div>
  );
}
