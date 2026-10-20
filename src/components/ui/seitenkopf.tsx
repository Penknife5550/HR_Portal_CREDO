"use client";

/**
 * Seitenkopf (UX-Umbau „Klarer Weg", U0)
 *
 * Der Kopf jeder Seite der neuen Oberflaeche: Pfad (Breadcrumb), Titel,
 * Unterzeile, Zustand — rechts die EINE wichtigste Handlung und das
 * „…"-Menue fuer alles Uebrige.
 *
 *   <Seitenkopf
 *     pfad={[{ text: "Vorgänge", href: "/vorgaenge" }, { text: "Vertragsende", href: "…" }, { text: "Maria Muster" }]}
 *     titel="Maria Muster"
 *     unterzeile="Vertragsende · Berufskolleg · VE-2026-BK-004"
 *     status={<Statuspille ton="wait">Wartet auf Führungskraft</Statuspille>}
 *     aktion={<Button variante="primary">Verlängerung anlegen</Button>}
 *     menue={[{ text: "Vorgang stornieren …", kritisch: true, onWaehlen: … }]}
 *   />
 *
 * Regeln:
 *   - Der Pfad kommt als Eigenschaft; der Kopf liest NICHTS aus der Adresse
 *     (Entscheidung E4: Die Adresse traegt eine UUID, keinen Namen). Der
 *     letzte Eintrag ist die Seite selbst (`aria-current="page"`, kein
 *     Verweis); Verweise laufen ueber `next/link`.
 *   - Der Titel ist die `h1` der Seite — genau ein Seitenkopf je Seite. Er
 *     traegt eine Id (`SEITENTITEL_ID`) und `tabIndex={-1}`: das Ersatzziel
 *     fuer den Fokus, wenn ein Dialog schliesst und sein Ausloeser fehlt
 *     (`<Dialog fokusZiel={SEITENTITEL_ID}>`).
 *   - Hoechstens ein Primaerknopf (`aktion`); alles Weitere gehoert ins Menue.
 *   - Menuepunkte, die einen Dialog oeffnen, enden auf „…". Ihr `onWaehlen`
 *     laeuft erst, NACHDEM das Menue geschlossen und der Fokus zurueck auf dem
 *     „…"-Knopf ist: Ein Dialog merkt sich beim Oeffnen, wer den Fokus hatte —
 *     waere das noch der Menuepunkt, gaebe es beim Schliessen kein Ziel mehr.
 *   - Ein kritischer Punkt (`kritisch`) steht am Ende und ist rot; ein
 *     gesperrter bleibt sichtbar (abgeblendet), statt zu verschwinden — und
 *     ist dann auch mit `href` kein Verweis mehr.
 *   - Der Kopf selbst zeigt keinen Zustand ohne Text: `status` ist eine
 *     `Statuspille`.
 *   - Nichts wird abgeschnitten: Langer Titel und lange Unterzeile brechen um,
 *     auf schmalen Bildschirmen rutschen die Aktionen unter den Titel.
 *   - `MENUE_FARBEN` ist die EINE Quelle der Farbpaare des Menues; der
 *     Kontrasttest liest sie von hier. Der Schatten `shadow-overlay` gilt fuer
 *     alles, was ueber der Seite schwebt: Dialog, Toast und dieses Menue.
 */
import { useRef, type ReactNode } from "react";
import Link from "next/link";
import * as RadixMenue from "@radix-ui/react-dropdown-menu";
import { ChevronRight, MoreHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** Id des Seitentitels — Ersatzziel fuer den Fokus (`Dialog fokusZiel`). */
export const SEITENTITEL_ID = "seitentitel";

export interface PfadEintrag {
  text: string;
  /** Ohne `href` ist der Eintrag kein Verweis (immer: der letzte). */
  href?: string;
}

export interface MenuePunkt {
  text: string;
  symbol?: LucideIcon;
  /** Aktion; laeuft, nachdem das Menue geschlossen ist. */
  onWaehlen?: () => void;
  /** Stattdessen ein Verweis innerhalb des Portals. */
  href?: string;
  /** Loeschen, stornieren, zurueckziehen. */
  kritisch?: boolean;
  gesperrt?: boolean;
}

/** Farbklassen des Menues (auf `card`): Punkt in Ruhe und hervorgehoben, normal und kritisch. */
export const MENUE_FARBEN = {
  normal: { ruhe: "text-ink", hervor: "data-[highlighted]:bg-neutral-soft" },
  kritisch: { ruhe: "text-critical", hervor: "data-[highlighted]:bg-critical-soft" },
} as const;

const PUNKT =
  "flex cursor-default items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium outline-none select-none " +
  "data-[disabled]:opacity-60";

export interface SeitenkopfProps {
  /** Breadcrumb; der letzte Eintrag ist die Seite selbst. */
  pfad?: readonly PfadEintrag[];
  titel: string;
  /** Eine Zeile unter dem Titel: „Modul · Einrichtung · Nummer". */
  unterzeile?: ReactNode;
  /** Zustand als `Statuspille`. */
  status?: ReactNode;
  /** Die eine wichtigste Handlung der Seite. */
  aktion?: ReactNode;
  /** Alles Weitere, hinter „…". Leer oder weggelassen: kein Knopf. */
  menue?: readonly MenuePunkt[];
  className?: string;
}

export function Seitenkopf({ pfad, titel, unterzeile, status, aktion, menue, className }: SeitenkopfProps) {
  const ausstehend = useRef<(() => void) | null>(null);
  const hatMenue = Boolean(menue && menue.length > 0);

  return (
    <header className={cn("space-y-2", className)}>
      {pfad && pfad.length > 0 && (
        <nav aria-label="Pfad">
          <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-ink-2">
            {pfad.map((eintrag, index) => {
              const letzter = index === pfad.length - 1;
              return (
                <li key={`${index}-${eintrag.text}`} className="flex min-w-0 items-center gap-1">
                  {index > 0 && <ChevronRight aria-hidden="true" className="h-3 w-3 shrink-0" />}
                  {eintrag.href && !letzter ? (
                    <Link
                      href={eintrag.href}
                      className="rounded-sm underline-offset-2 wrap-anywhere hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
                    >
                      {eintrag.text}
                    </Link>
                  ) : (
                    <span aria-current={letzter ? "page" : undefined} className={cn("wrap-anywhere", letzter && "font-semibold text-ink")}>
                      {eintrag.text}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1
              id={SEITENTITEL_ID}
              tabIndex={-1}
              className="rounded-sm font-heading text-titel font-bold tracking-titel text-ink wrap-anywhere focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-action"
            >
              {titel}
            </h1>
            {status}
          </div>
          {unterzeile && <p className="mt-1 text-sm text-ink-2 wrap-anywhere">{unterzeile}</p>}
        </div>

        {(aktion || hatMenue) && (
          <div className="flex shrink-0 items-center gap-2">
            {aktion}
            {hatMenue && (
              <RadixMenue.Root>
                <RadixMenue.Trigger asChild>
                  <Button aria-label="Weitere Aktionen" className="px-2.5">
                    <MoreHorizontal aria-hidden="true" className="h-5 w-5" />
                  </Button>
                </RadixMenue.Trigger>
                <RadixMenue.Portal>
                  <RadixMenue.Content
                    align="end"
                    sideOffset={6}
                    onCloseAutoFocus={() => {
                      // Erst NACH diesem Ereignis liegt der Fokus wieder auf
                      // dem „…"-Knopf — dann erst die Aktion (siehe Kopf).
                      const aktionJetzt = ausstehend.current;
                      ausstehend.current = null;
                      if (aktionJetzt) queueMicrotask(aktionJetzt);
                    }}
                    className="z-50 min-w-48 rounded-xl border border-hairline bg-card p-1 shadow-overlay"
                  >
                    {menue!.map((punkt, index) => {
                      const farben = punkt.kritisch ? MENUE_FARBEN.kritisch : MENUE_FARBEN.normal;
                      const Symbol = punkt.symbol;
                      const inhalt = (
                        <>
                          {Symbol && <Symbol aria-hidden="true" className="h-4 w-4 shrink-0" />}
                          <span>{punkt.text}</span>
                        </>
                      );
                      const klassen = cn(PUNKT, farben.ruhe, farben.hervor);
                      // Ein gesperrter Punkt wird NIE als Verweis gezeichnet: Radix
                      // sperrt nur seine eigene Auswahl, der Klick auf ein `<a>`
                      // darunter oeffnete die Seite trotzdem.
                      return punkt.href && !punkt.gesperrt ? (
                        <RadixMenue.Item key={`${index}-${punkt.text}`} asChild className={klassen}>
                          <Link href={punkt.href}>{inhalt}</Link>
                        </RadixMenue.Item>
                      ) : (
                        <RadixMenue.Item
                          key={`${index}-${punkt.text}`}
                          disabled={punkt.gesperrt}
                          onSelect={() => {
                            ausstehend.current = punkt.onWaehlen ?? null;
                          }}
                          className={klassen}
                        >
                          {inhalt}
                        </RadixMenue.Item>
                      );
                    })}
                  </RadixMenue.Content>
                </RadixMenue.Portal>
              </RadixMenue.Root>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
