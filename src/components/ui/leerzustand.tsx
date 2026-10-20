/**
 * Leerzustand (UX-Umbau „Klarer Weg", U0)
 *
 * Steht dort, wo eine Liste oder Gruppe nichts zu zeigen hat: Symbol, Titel,
 * ein Satz, hoechstens ein Knopf.
 *
 *   <Leerzustand symbol={Inbox} titel="Keine offenen Aufgaben">
 *     Sobald eine Abteilung etwas zurückmeldet, steht es hier.
 *   </Leerzustand>
 *
 * Regeln:
 *   - Der Titel sagt, WAS leer ist („Keine offenen Aufgaben"), der Satz, wie
 *     es weitergeht oder warum das in Ordnung ist. Kein „Ups", kein Emoji —
 *     das Symbol kommt aus `lucide-react` und ist Zierde (`aria-hidden`).
 *   - „Leer" ist nicht „Fehler" und nicht „laedt": Ein gescheitertes Laden
 *     bekommt eine Fehlermeldung, ein laufendes ein `Skelett`. Wer hier
 *     „Keine Vorgänge" zeigt, waehrend die Abfrage gescheitert ist, luegt.
 *   - „Kein Treffer fuer diesen Filter" ist ein eigener Text mit dem Knopf
 *     „Filter zurücksetzen" — nicht derselbe wie „es gibt noch nichts".
 *   - Hoechstens EIN Knopf (`aktion`), und zwar der, der den Zustand beendet
 *     („Neuen Vorgang anlegen"). Meist gar keiner.
 *   - Der Titel ist bewusst KEINE Ueberschrift: Der Leerzustand steht in einer
 *     `Gruppe`, deren Titel den Bereich schon benennt.
 *   - In einer `Gruppe` steht er anstelle der Zeilen; allein bekommt er mit
 *     `mitFlaeche` die weisse Flaeche der Gruppe.
 */
import type { HTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LeerzustandProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Symbol aus `lucide-react`. */
  symbol: LucideIcon;
  /** Was leer ist. */
  titel: string;
  /** Ein Satz: wie es weitergeht. */
  children?: ReactNode;
  /** Hoechstens ein Knopf. */
  aktion?: ReactNode;
  /** Weisse Flaeche mit Haarlinie — fuer den Leerzustand ausserhalb einer Gruppe. */
  mitFlaeche?: boolean;
}

export function Leerzustand({
  symbol: Symbol,
  titel,
  children,
  aktion,
  mitFlaeche = false,
  className,
  ...rest
}: LeerzustandProps) {
  return (
    <div
      {...rest}
      data-leerzustand=""
      className={cn(
        "flex flex-col items-center px-4 py-10 text-center",
        mitFlaeche && "rounded-xl bg-card ring-1 ring-hairline",
        className,
      )}
    >
      <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-soft text-ink-2">
        <Symbol className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-semibold text-ink wrap-anywhere">{titel}</p>
      {children && <p className="mt-1 max-w-md text-sm text-ink-2 wrap-anywhere">{children}</p>}
      {aktion && <div className="mt-4">{aktion}</div>}
    </div>
  );
}
