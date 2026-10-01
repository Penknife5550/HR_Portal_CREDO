/**
 * Gruppe und Zeile (UX-Umbau „Klarer Weg", U0)
 *
 * Ersetzt die Kartenwaende: eine weisse Flaeche mit Haarlinien zwischen den
 * Zeilen, die Beschriftung steht DARUEBER (wie in den Einstellungen von iOS).
 * Kein Rahmen um alles, kein Schatten — Schatten tragen nur Dialog und Toast.
 *
 *   <Gruppe titel="Vertrag" aktion={<Button groesse="sm">Ändern</Button>}>
 *     <Zeile label="Beginn">01.02.2027</Zeile>
 *     <Zeile label="Umfang">25,5 Stunden</Zeile>
 *   </Gruppe>
 *
 * Regeln:
 *   - Die Beschriftung ist eine echte Ueberschrift (`h3`, per `ebene`
 *     aenderbar) und benennt die Gruppe fuer Screenreader (`aria-labelledby`).
 *   - Beschriftungen in `ink-2`, nie `ink-3` (kein Textton).
 *   - Eine `Zeile` mit `label` zeigt Beschriftung links und Wert rechts; ohne
 *     `label` gehoert ihr die ganze Breite (Listenzeilen, eigene Inhalte).
 *   - Ein leerer Wert bleibt sichtbar als „—", damit eine fehlende Angabe
 *     nicht wie eine fehlende Zeile aussieht.
 */
import { useId, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface GruppeProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** Beschriftung ueber der Gruppe. */
  titel?: string;
  /** Ein Satz unter der Beschriftung. */
  beschreibung?: string;
  /** Rechts neben der Beschriftung, z. B. ein kleiner Knopf. */
  aktion?: ReactNode;
  /** Ueberschriften-Ebene der Beschriftung (Vorgabe 3). */
  ebene?: 2 | 3 | 4;
}

export function Gruppe({ titel, beschreibung, aktion, ebene = 3, className, children, ...rest }: GruppeProps) {
  const titelId = useId();
  const Ueberschrift = `h${ebene}` as "h2" | "h3" | "h4";

  return (
    <section aria-labelledby={titel ? titelId : undefined} className={cn("space-y-2", className)} {...rest}>
      {(titel || aktion) && (
        <div className="flex items-end justify-between gap-3 px-1">
          <div className="min-w-0">
            {titel && (
              <Ueberschrift
                id={titelId}
                className="font-heading text-xs font-semibold uppercase tracking-wide text-ink-2"
              >
                {titel}
              </Ueberschrift>
            )}
            {beschreibung && <p className="mt-0.5 text-xs text-ink-2">{beschreibung}</p>}
          </div>
          {aktion && <div className="shrink-0">{aktion}</div>}
        </div>
      )}
      <div className="divide-y divide-hairline overflow-hidden rounded-xl bg-card ring-1 ring-hairline">
        {children}
      </div>
    </section>
  );
}

export interface ZeileProps extends HTMLAttributes<HTMLDivElement> {
  /** Beschriftung links; ohne sie gehoert der Zeile die ganze Breite. */
  label?: string;
}

export function Zeile({ label, className, children, ...rest }: ZeileProps) {
  if (label === undefined) {
    return (
      <div className={cn("px-4 py-3 text-sm text-ink", className)} {...rest}>
        {children}
      </div>
    );
  }

  const leer = children === undefined || children === null || children === "";
  return (
    <div className={cn("flex items-baseline justify-between gap-4 px-4 py-3 text-sm", className)} {...rest}>
      <span className="shrink-0 text-ink-2">{label}</span>
      <span className="min-w-0 text-right font-medium text-ink">{leer ? "—" : children}</span>
    </div>
  );
}
