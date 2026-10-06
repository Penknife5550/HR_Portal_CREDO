/**
 * Hinweis (UX-Umbau „Klarer Weg", Pilot Vertragsende)
 *
 * Ein Kasten fuer EINE Aussage, die ueber der Arbeit stehen muss:
 *
 *   <Hinweis ton="critical" titel="Vertragsende seit 3 Tagen überschritten">
 *     Der Vertrag ist am 30.09.2026 ausgelaufen, der Vorgang ist noch offen.
 *   </Hinweis>
 *
 * Regeln:
 *   - Drei Toene: critical (etwas ist schiefgegangen oder ueberfaellig),
 *     wait (Achtung, bevor es zu spaet ist), info (zur Kenntnis). Ein „ok"
 *     gibt es nicht — was erledigt ist, braucht keinen Kasten.
 *   - Der Titel ist Pflicht und sagt die Sache selbst; ohne Titel zeichnet der
 *     Hinweis NICHTS (ein farbiger Kasten ohne Aussage waere nur Farbe). Das
 *     Symbol aus `lucide-react` ist Zierde (`aria-hidden`), traegt aber je Ton
 *     eine eigene Form — wer die Farben nicht unterscheidet, sieht trotzdem,
 *     welcher Kasten welcher ist. Keine Emojis (die alte Seite hatte ⚠ und 👥).
 *   - Hoechstens EIN Knopf (`aktion`), und zwar der, der die Sache erledigt.
 *   - Angesagt wird nur, was NEU erscheint: `ansagen` macht einen kritischen
 *     Hinweis zu `role="alert"` — fuer einen Hinweis, der nach dem Laden
 *     dazukommt (Speichern gescheitert). Was schon beim Oeffnen der Seite
 *     dasteht, ist ein gewoehnlicher Bereich mit Ueberschrift: Ein Screenreader
 *     soll nicht bei jedem Oeffnen der Seite unterbrochen werden. Bei `wait`
 *     und `info` wirkt `ansagen` nicht.
 *   - Der Titel ist eine echte Ueberschrift, Vorgabe `h2` wie bei der `Gruppe`;
 *     tiefer `ebene` setzen. Zwei Hinweise mit gleichem Titel auf einer Seite
 *     waeren zwei gleichnamige Bereiche — dann einen genauer fassen.
 *   - Farben: `HINWEIS_TOENE` ist die EINE Quelle (der Kontrasttest liest sie).
 *     Text in `ink` — `ink-2` haelt auf dem getoenten Grund ueber dem
 *     Seitengrund die 4,5:1 nicht (critical: 4,49:1). Der Rand ist
 *     durchsichtig und erscheint nur im Kontrastmodus von Windows, wo die
 *     Flaeche wegfaellt.
 *   - Nichts wird abgeschnitten: Titel und Text brechen zwischen den Woertern um.
 */
import { useId, type HTMLAttributes, type ReactNode } from "react";
import { AlertCircle, Clock, Info, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Ton → Flaeche, Text, Symbolfarbe und Standardsymbol. Ausgeschrieben, damit Tailwind sie findet. */
export const HINWEIS_TOENE = {
  critical: { flaeche: "bg-critical-soft", text: "text-ink", symbol: "text-critical", standard: AlertCircle },
  wait: { flaeche: "bg-wait-soft", text: "text-ink", symbol: "text-wait", standard: Clock },
  info: { flaeche: "bg-info-soft", text: "text-ink", symbol: "text-info", standard: Info },
} as const satisfies Record<string, { flaeche: string; text: string; symbol: string; standard: LucideIcon }>;

export type HinweisTon = keyof typeof HINWEIS_TOENE;

export interface HinweisProps extends Omit<HTMLAttributes<HTMLElement>, "title" | "role"> {
  ton: HinweisTon;
  /** Die Aussage selbst — Pflicht. */
  titel: string;
  /** Ein, zwei Saetze dazu. */
  children?: ReactNode;
  /** Hoechstens ein Knopf. */
  aktion?: ReactNode;
  /** Anderes Symbol aus `lucide-react` als das des Tons. */
  symbol?: LucideIcon;
  /** Ueberschriften-Ebene des Titels (Vorgabe 2). */
  ebene?: 2 | 3 | 4;
  /** Nur `critical`: der Hinweis ist nach dem Laden NEU erschienen und wird sofort angesagt. */
  ansagen?: boolean;
}

export function Hinweis({
  ton,
  titel,
  children,
  aktion,
  symbol,
  ebene = 2,
  ansagen = false,
  className,
  ...rest
}: HinweisProps) {
  const titelId = useId();
  if (titel.trim() === "") return null;

  const farben = HINWEIS_TOENE[ton];
  const Symbol = symbol ?? farben.standard;
  const Ueberschrift = `h${ebene}` as "h2" | "h3" | "h4";
  const alarm = ton === "critical" && ansagen;

  return (
    <section
      {...rest}
      role={alarm ? "alert" : undefined}
      aria-labelledby={alarm ? undefined : titelId}
      data-ton={ton}
      className={cn("flex gap-3 rounded-xl border border-transparent px-4 py-3", farben.flaeche, farben.text, className)}
    >
      <Symbol aria-hidden="true" className={cn("mt-0.5 h-5 w-5 shrink-0", farben.symbol)} />
      <div className="min-w-0 flex-1">
        <Ueberschrift id={titelId} className="text-sm font-semibold wrap-break-word">
          {titel}
        </Ueberschrift>
        {children && <div className="mt-1 text-sm wrap-break-word">{children}</div>}
        {aktion && <div className="mt-3">{aktion}</div>}
      </div>
    </section>
  );
}
