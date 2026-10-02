"use client";

/**
 * Segment-Schalter (UX-Umbau „Klarer Weg", U0)
 *
 * Waehlt EINE von zwei bis fuenf Sichten derselben Liste („Alle · Kritisch ·
 * Bei HR"), optional mit Zaehler je Sicht.
 *
 *   <Segment label="Sicht" wert={sicht} onWechsel={setSicht}
 *     optionen={[{ wert: "alle", text: "Alle", zahl: 12 }, …]} />
 *
 * Regeln:
 *   - Der Schalter FILTERT, er navigiert nicht: Fuer den Wechsel zwischen
 *     Seiten gibt es Verweise, fuer Reiter mit eigenem Inhalt Tabs.
 *   - Er ist eine Auswahlgruppe (`radiogroup`): Tab erreicht die gewaehlte
 *     Sicht, die Pfeiltasten wechseln (rundum), Pos1 und Ende springen. Die
 *     Auswahl folgt dem Fokus — wie bei Reitern.
 *   - `label` benennt die Gruppe fuer Screenreader und ist Pflicht.
 *   - Der Zaehler gehoert zum Namen der Sicht („Kritisch 3"). Eine Zahl ohne
 *     Wort gibt es nicht.
 *   - Die gewaehlte Sicht hebt sich durch Flaeche UND Schriftstaerke ab, nie
 *     nur durch Farbe. `SEGMENT_FARBEN` ist die EINE Quelle der Paare; der
 *     Kontrasttest liest sie von hier.
 *   - Auf schmalen Bildschirmen rollt der Schalter waagerecht, statt
 *     umzubrechen oder abzuschneiden. Der Fokusring liegt deshalb INNEN
 *     (er wuerde sonst vom Rollbereich abgeschnitten).
 */
import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string = string> {
  wert: T;
  text: string;
  /** Zaehler hinter dem Text; `0` wird gezeigt, `undefined` nicht. */
  zahl?: number;
}

/** Farbklassen: Grund des Schalters, nicht gewaehlte und gewaehlte Sicht. */
export const SEGMENT_FARBEN = {
  grund: "bg-neutral-soft",
  ruhe: "text-ink-2",
  aktiv: "bg-card text-ink",
} as const;

export interface SegmentProps<T extends string> {
  /** Name der Gruppe fuer Screenreader, z. B. „Sicht". */
  label: string;
  wert: T;
  onWechsel: (wert: T) => void;
  /** Zwei bis fuenf Sichten. */
  optionen: readonly SegmentOption<T>[];
  className?: string;
}

export function Segment<T extends string>({ label, wert, onWechsel, optionen, className }: SegmentProps<T>) {
  const knoepfe = useRef<(HTMLButtonElement | null)[]>([]);
  const gewaehlt = optionen.findIndex((o) => o.wert === wert);
  // Passt `wert` zu keiner Sicht, bleibt die Gruppe ueber die erste erreichbar.
  const erreichbar = Math.max(0, gewaehlt);

  const gehe = (index: number) => {
    const ziel = (index + optionen.length) % optionen.length;
    if (optionen[ziel].wert !== wert) onWechsel(optionen[ziel].wert);
    knoepfe.current[ziel]?.focus();
  };

  const taste = (e: KeyboardEvent, index: number) => {
    const schritt: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: optionen.length - 1,
    };
    if (!(e.key in schritt)) return;
    e.preventDefault();
    gehe(schritt[e.key]);
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg p-0.5", SEGMENT_FARBEN.grund, className)}
    >
      {optionen.map((o, index) => {
        const aktiv = index === gewaehlt;
        return (
          <button
            key={o.wert}
            ref={(el) => {
              knoepfe.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={aktiv}
            tabIndex={index === erreichbar ? 0 : -1}
            onClick={() => {
              if (!aktiv) onWechsel(o.wert);
            }}
            onKeyDown={(e) => taste(e, index)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm whitespace-nowrap transition-colors select-none",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-action",
              // Windows-Kontrastmodus: Flaechen entfallen dort, die Auswahl
              // braeuchte sonst allein die Schriftstaerke.
              "forced-colors:aria-checked:forced-color-adjust-none forced-colors:aria-checked:bg-[Highlight] forced-colors:aria-checked:text-[HighlightText]",
              aktiv ? cn("font-semibold", SEGMENT_FARBEN.aktiv) : cn("font-medium hover:text-ink", SEGMENT_FARBEN.ruhe),
            )}
          >
            <span>{o.text}</span>
            {o.zahl !== undefined && <span className="tabular-nums">{o.zahl}</span>}
          </button>
        );
      })}
    </div>
  );
}
