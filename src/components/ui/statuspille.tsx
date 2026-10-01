/**
 * Statuspille (UX-Umbau „Klarer Weg", U0)
 *
 * Zeigt EINEN Zustand: Punkt plus Text auf getoentem Grund.
 *
 * Regeln (Entscheidung E1):
 *   - Der Text ist Pflicht. Eine Farbe allein traegt keine Bedeutung — wer
 *     Rot und Gruen nicht unterscheidet, liest das Wort. Kommt kein Text an
 *     (`{eintrag?.text}` ohne Katalogeintrag), zeichnet die Pille NICHTS,
 *     statt einen blossen Farbpunkt zu zeigen.
 *   - Fuenf Toene, alle funktional, keiner eine CI-Farbe: ok (erledigt),
 *     wait (wartet, Frist naht), critical (ueberfaellig, Fehler),
 *     info (Hinweis), neutral (alles Uebrige).
 *   - Kein Einrichtungs-Farbpunkt daneben: Gelb, Gruen, Rot und Blau der
 *     CREDO-Linie sind zugleich Einrichtungsfarben und stuenden sonst neben
 *     einem Zustand in aehnlicher Farbe.
 *   - Langer Text bricht um; er wird nie abgeschnitten.
 *
 * `STATUS_TOENE` ist die EINE Quelle der Toene und ihrer Farbpaare: Der Typ,
 * die Musterseite, die Baustein-Tests und der Kontrasttest lesen von hier. Ein
 * neuer Ton wird hier eingetragen und ist damit ueberall dabei — bewusst eine
 * Tabelle statt `cva`, weil die anderen die Schluessel und Klassen LESEN
 * muessen (cva gaebe nur eine Funktion heraus).
 *
 * Welcher Fachstatus welchen Ton bekommt, entscheidet nicht dieser Baustein,
 * sondern der Katalog des Moduls (kommt mit U3/U4).
 */
import { Children, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Ton → Farbklassen (Grund und Text). Ausgeschrieben, damit Tailwind sie findet. */
export const STATUS_TOENE = {
  ok: "bg-ok-soft text-ok",
  wait: "bg-wait-soft text-wait",
  critical: "bg-critical-soft text-critical",
  info: "bg-info-soft text-info",
  neutral: "bg-neutral-soft text-ink-2",
} as const;

export type StatusTon = keyof typeof STATUS_TOENE;

/** Kein sichtbarer Inhalt: nichts, nur Leerzeichen, `false` aus `a && b`. */
export function istLeererInhalt(children: ReactNode): boolean {
  return Children.toArray(children).every((kind) => typeof kind === "string" && kind.trim() === "");
}

export interface StatuspilleProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  ton: StatusTon;
  /** Der Zustand als Wort — Pflicht. */
  children: ReactNode;
}

export function Statuspille({ ton, className, children, ...rest }: StatuspilleProps) {
  if (istLeererInhalt(children)) return null;

  return (
    <span
      {...rest}
      data-ton={ton}
      className={cn(
        "inline-flex max-w-full items-start gap-1.5 rounded-full px-2.5 py-0.5 text-left text-xs font-semibold",
        STATUS_TOENE[ton],
        className,
      )}
    >
      {/* 5 px von oben: Mitte der ersten Zeile (16 px), auch wenn der Text umbricht */}
      <span aria-hidden="true" className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      <span className="min-w-0 wrap-anywhere">{children}</span>
    </span>
  );
}
