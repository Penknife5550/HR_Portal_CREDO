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
 *   - Die Beschriftung ist eine echte Ueberschrift und benennt die Gruppe fuer
 *     Screenreader (`aria-labelledby`). Vorgabe ist `h2`: Gruppen stehen direkt
 *     unter dem Seitentitel (`h1`). Liegt die Gruppe tiefer, `ebene` setzen —
 *     eine uebersprungene Ebene meldet axe als `heading-order`.
 *   - Zwei Gruppen mit demselben Titel auf einer Seite sind zwei gleichnamige
 *     Bereiche; dann einen der Titel genauer fassen.
 *   - Beschriftungen in `ink-2`, nie `ink-3` (kein Textton). Gruppentitel nach
 *     der Schriftskala des Plans: 11 px, Versalien, Laufweite +6 %.
 *   - Der Kopf ist immer gleich hoch, mit oder ohne `aktion` — sonst stuenden
 *     zwei Gruppen nebeneinander versetzt.
 *   - Eine `Zeile` mit `label` zeigt Beschriftung links und Wert rechts; ohne
 *     `label` gehoert ihr die ganze Breite (Listenzeilen, eigene Inhalte).
 *   - Ein leerer Wert bleibt sichtbar als „—", damit eine fehlende Angabe
 *     nicht wie eine fehlende Zeile aussieht. Leer ist auch `false` aus
 *     `{bedingung && wert}`, eine leere Liste und reiner Leerraum. Ein
 *     Element, das selbst nichts zeichnet, erkennt die Zeile nicht.
 *   - Nichts wird abgeschnitten: Lange Werte (IBAN, E-Mail, Dateiname) und
 *     lange Beschriftungen brechen um — die Beschriftung zwischen den
 *     Woertern (sie schrumpft nur bis zu ihrem laengsten Wort, hoechstens
 *     auf die halbe Breite), der Wert notfalls an jeder Stelle. Die Gruppe schneidet NICHT ab
 *     (kein `overflow-hidden`). Zeilen haben deshalb keinen eigenen
 *     Hintergrund bis an den Rand.
 */
import { useId, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { istLeererInhalt } from "@/components/ui/statuspille";

export interface GruppeProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** Beschriftung ueber der Gruppe. */
  titel?: string;
  /** Ein Satz unter der Beschriftung. */
  beschreibung?: string;
  /** Rechts neben der Beschriftung, z. B. ein kleiner Knopf. */
  aktion?: ReactNode;
  /** Ueberschriften-Ebene der Beschriftung (Vorgabe 2). */
  ebene?: 2 | 3 | 4;
}

export function Gruppe({
  titel,
  beschreibung,
  aktion,
  ebene = 2,
  className,
  children,
  "aria-labelledby": benanntDurch,
  ...rest
}: GruppeProps) {
  const titelId = useId();
  const Ueberschrift = `h${ebene}` as "h2" | "h3" | "h4";

  return (
    <section
      {...rest}
      aria-labelledby={benanntDurch ?? (titel ? titelId : undefined)}
      className={cn("space-y-2", className)}
    >
      {(titel || beschreibung || aktion) && (
        <div className="flex min-h-8 items-end justify-between gap-3 px-1">
          <div className="min-w-0">
            {titel && (
              <Ueberschrift
                id={titelId}
                className="font-heading text-2xs font-semibold uppercase tracking-label text-ink-2"
              >
                {titel}
              </Ueberschrift>
            )}
            {beschreibung && <p className="mt-0.5 text-xs text-ink-2">{beschreibung}</p>}
          </div>
          {aktion && <div className="shrink-0">{aktion}</div>}
        </div>
      )}
      <div className="divide-y divide-hairline rounded-xl bg-card ring-1 ring-hairline">{children}</div>
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
      <div className={cn("px-4 py-3 text-sm text-ink wrap-anywhere", className)} {...rest}>
        {children}
      </div>
    );
  }

  return (
    <div className={cn("flex items-baseline justify-between gap-4 px-4 py-3 text-sm", className)} {...rest}>
      <span className="max-w-[50%] text-ink-2 wrap-break-word">{label}</span>
      <span className="min-w-0 text-right font-medium text-ink wrap-anywhere">
        {istLeererInhalt(children) ? "—" : children}
      </span>
    </div>
  );
}
