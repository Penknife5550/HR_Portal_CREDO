/**
 * Statuspille (UX-Umbau „Klarer Weg", U0)
 *
 * Zeigt EINEN Zustand: Punkt plus Text auf getoentem Grund.
 *
 * Regeln (Entscheidung E1):
 *   - Der Text ist Pflicht. Eine Farbe allein traegt keine Bedeutung — wer
 *     Rot und Gruen nicht unterscheidet, liest das Wort.
 *   - Fuenf Toene, alle funktional, keiner eine CI-Farbe: ok (erledigt),
 *     wait (wartet, Frist naht), critical (ueberfaellig, Fehler),
 *     info (Hinweis), neutral (alles Uebrige).
 *   - Kein Einrichtungs-Farbpunkt daneben: Gelb, Gruen, Rot und Blau der
 *     CREDO-Linie sind zugleich Einrichtungsfarben und stuenden sonst neben
 *     einem Zustand in aehnlicher Farbe.
 *
 * Welcher Fachstatus welchen Ton bekommt, entscheidet nicht dieser Baustein,
 * sondern der Katalog des Moduls (kommt mit U3/U4).
 */
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusTon = "ok" | "wait" | "critical" | "info" | "neutral";

const TON_KLASSEN: Record<StatusTon, string> = {
  ok: "bg-ok-soft text-ok",
  wait: "bg-wait-soft text-wait",
  critical: "bg-critical-soft text-critical",
  info: "bg-info-soft text-info",
  neutral: "bg-neutral-soft text-ink-2",
};

export interface StatuspilleProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  ton: StatusTon;
  /** Der Zustand als Wort — Pflicht. */
  children: ReactNode;
}

export function Statuspille({ ton, className, children, ...rest }: StatuspilleProps) {
  return (
    <span
      data-ton={ton}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold",
        TON_KLASSEN[ton],
        className,
      )}
      {...rest}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}
