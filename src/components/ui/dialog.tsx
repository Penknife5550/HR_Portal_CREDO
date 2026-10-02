"use client";

/**
 * Dialog und Bestaetigungsdialog (UX-Umbau „Klarer Weg", U0)
 *
 * Der EINE Dialog des Portals und der Ersatz fuer `confirm()`. Fokusfang,
 * Portal, Scroll-Sperre und ARIA kommen aus Radix (Entscheidung F1); die
 * Regeln, die Radix nicht von sich aus kennt, stammen aus
 * `unterlagen/dialog-rahmen.tsx` und gelten hier unveraendert:
 *
 *   1. Waehrend eine Aktion laeuft (`gesperrt`), schliesst NICHTS — weder
 *      Escape noch „Abbrechen" noch das Kreuz. Sonst verschwaende der Dialog,
 *      waehrend die Aktion noch laeuft, und ihr Ergebnis (etwa ein 409) haette
 *      keinen Ort mehr. Die Knoepfe bleiben dabei fokussierbar
 *      (`aria-disabled`), der Fokus faellt also nicht auf `body`.
 *   2. Ein NEUER Fehler des Servers (`fehler`) bekommt den Fokus
 *      (`role="alert"`, `tabIndex={-1}`). Der Fehler, mit dem der Dialog
 *      geoeffnet wird, zaehlt nicht als neu.
 *   3. Ein gesperrter Bestaetigen-Knopf nennt seinen Grund als sichtbaren Text
 *      (`bestaetigen.sperrGrund`), nie nur als Tooltip.
 *   4. Nach dem Schliessen geht der Fokus zurueck auf das Element, das beim
 *      Oeffnen den Fokus hatte. Ist es verschwunden oder nimmt es den Fokus
 *      nicht an (echtes `disabled`), bekommt ihn `fokusZiel` — die Id eines
 *      Elements mit `tabIndex={-1}`, etwa der Titel der Karte.
 *
 * Dazu:
 *   - Ein Klick neben den Dialog schliesst NICHT. Ein halb ausgefuelltes
 *     Formular ginge sonst durch einen verrutschten Klick verloren.
 *   - Beim Oeffnen bekommt „Abbrechen" den Fokus — nie der bestaetigende
 *     Knopf, sonst loeste ein zu schnelles Enter die Aktion aus. Soll ein Feld
 *     ihn bekommen, traegt es `data-autofokus`.
 *   - Der Dialog wird GESTEUERT (`offen`, `onSchliessen`); er ruft keine
 *     Schnittstelle. Der Aufrufer fuehrt die Aktion aus, setzt `gesperrt` und
 *     gibt einen Fehler als `fehler` zurueck.
 *   - Auf dem Handy stehen die Knoepfe untereinander, der bestaetigende oben.
 *   - Die Fehlerzeile nimmt das Farbpaar aus `STATUS_TOENE.critical` — damit
 *     ist ihr Kontrast schon gerechnet (ui-kontrast.test.ts).
 *   - Der Rand haelt den Dialog im Windows-Kontrastmodus sichtbar (dort
 *     entfallen Flaechen und Schatten).
 *
 * Die Ueberlagerung (`fixed inset-0`) gibt es NUR hier; `src/components/ui/`
 * ist bei diesem Muster von der Sperrklinke ausgenommen.
 */
import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { STATUS_TOENE } from "@/components/ui/statuspille";

export type DialogBreite = "sm" | "md" | "lg";

const BREITEN: Record<DialogBreite, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

export interface DialogBestaetigen {
  text: string;
  onClick: () => void;
  /** `critical` fuer loeschen, stornieren, zurueckziehen. */
  variante?: "primary" | "critical";
  /** Fehlt eine Angabe? Dann gesperrt, mit diesem Satz als sichtbarem Text. */
  sperrGrund?: string | null;
  /** Text des Knopfs, waehrend die Aktion laeuft (Vorgabe: `text`). */
  laeuftText?: string;
}

export interface DialogProps {
  offen: boolean;
  /** Escape, „Abbrechen" und das Kreuz — nie waehrend `gesperrt`. */
  onSchliessen: () => void;
  titel: string;
  /** Zeile unter dem Titel; Screenreader lesen sie als Beschreibung des Dialogs. */
  beschreibung?: ReactNode;
  /** Eine Aktion laeuft: nichts schliesst, der Bestaetigen-Knopf zeigt das Ladesymbol. */
  gesperrt?: boolean;
  /** Fehler des Servers — der Dialog bleibt offen, ein neuer Fehler bekommt den Fokus. */
  fehler?: string | null;
  /** Id eines Elements (`tabIndex={-1}`), das den Fokus bekommt, wenn der Ausloeser beim Schliessen fehlt. */
  fokusZiel?: string;
  breite?: DialogBreite;
  /** Ohne `bestaetigen` gibt es nur einen Knopf; er heisst dann „Schließen". */
  bestaetigen?: DialogBestaetigen;
  abbrechenText?: string;
  /** `alertdialog` fuer Rueckfragen, die eine Antwort verlangen. */
  rolle?: "dialog" | "alertdialog";
  /** `data-dialog` fuer Selektoren und Tests. */
  name?: string;
  children?: ReactNode;
}

function nichtSchliessen(e: Event) {
  e.preventDefault();
}

export function Dialog({
  offen,
  onSchliessen,
  titel,
  beschreibung,
  gesperrt = false,
  fehler,
  fokusZiel,
  breite = "md",
  bestaetigen,
  abbrechenText,
  rolle = "dialog",
  name,
  children,
}: DialogProps) {
  const grundId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const abbrechenRef = useRef<HTMLButtonElement>(null);
  const fehlerRef = useRef<HTMLParagraphElement>(null);
  const vorherRef = useRef<HTMLElement | null>(null);
  const letzterFehlerRef = useRef<string | null>(fehler ?? null);

  // Den Ausloeser merken, BEVOR der Inhalt entsteht: Radix haengt ihn erst in
  // einem zweiten Durchgang ein (Portal), ein `autoFocus` darin hat den Fokus
  // dann noch nicht verschoben.
  useLayoutEffect(() => {
    if (!offen) return;
    const aktiv = document.activeElement;
    vorherRef.current = aktiv instanceof HTMLElement && aktiv !== document.body ? aktiv : null;
  }, [offen]);

  useEffect(() => {
    const neu = offen ? (fehler ?? null) : null;
    if (neu && neu !== letzterFehlerRef.current) fehlerRef.current?.focus();
    letzterFehlerRef.current = neu;
  }, [fehler, offen]);

  const schliessen = () => {
    if (!gesperrt) onSchliessen();
  };

  const sperrGrund = bestaetigen?.sperrGrund?.trim() || null;
  const grundSichtbar = Boolean(sperrGrund) && !gesperrt;

  return (
    <RadixDialog.Root
      open={offen}
      onOpenChange={(auf) => {
        if (!auf) schliessen();
      }}
    >
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-scrim p-4">
          <RadixDialog.Content
            ref={panelRef}
            role={rolle}
            data-dialog={name}
            // Ohne Beschreibung ausdruecklich `undefined`, sonst warnt Radix.
            {...(beschreibung ? {} : { "aria-describedby": undefined })}
            onEscapeKeyDown={gesperrt ? nichtSchliessen : undefined}
            onPointerDownOutside={nichtSchliessen}
            onInteractOutside={nichtSchliessen}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              const ziel = panelRef.current?.querySelector<HTMLElement>("[data-autofokus]") ?? abbrechenRef.current;
              ziel?.focus();
            }}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              const vorher = vorherRef.current;
              if (vorher?.isConnected) {
                vorher.focus();
                if (document.activeElement === vorher) return;
              }
              if (fokusZiel) document.getElementById(fokusZiel)?.focus();
            }}
            className={cn(
              "flex max-h-[90dvh] w-full flex-col rounded-xl border border-hairline bg-card text-ink shadow-overlay outline-none",
              BREITEN[breite],
            )}
          >
            <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
              <div className="min-w-0">
                <RadixDialog.Title className="font-heading text-base font-bold text-ink wrap-anywhere">
                  {titel}
                </RadixDialog.Title>
                {beschreibung && (
                  // `div` statt des `<p>` von Radix: Die Beschreibung darf
                  // Absaetze und Listen enthalten, ein `<p>` in `<p>` nicht.
                  <RadixDialog.Description asChild>
                    <div className="mt-1 text-sm text-ink-2 wrap-anywhere">{beschreibung}</div>
                  </RadixDialog.Description>
                )}
              </div>
              <Button
                variante="ghost"
                groesse="sm"
                aria-label="Dialog schließen"
                aria-disabled={gesperrt || undefined}
                onClick={schliessen}
                className="shrink-0 px-2"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </Button>
            </div>

            {children !== undefined && children !== null && children !== false && (
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">{children}</div>
            )}

            <div className="space-y-2 border-t border-hairline px-5 py-4">
              {fehler && (
                <p
                  ref={fehlerRef}
                  role="alert"
                  tabIndex={-1}
                  data-zeile="fehler"
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium wrap-anywhere focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-critical",
                    STATUS_TOENE.critical,
                  )}
                >
                  {fehler}
                </p>
              )}
              {grundSichtbar && (
                <p id={grundId} data-zeile="grund" className="text-xs text-ink-2">
                  {sperrGrund}
                </p>
              )}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  ref={abbrechenRef}
                  aria-disabled={gesperrt || undefined}
                  onClick={schliessen}
                  className="w-full sm:w-auto"
                >
                  {abbrechenText ?? (bestaetigen ? "Abbrechen" : "Schließen")}
                </Button>
                {bestaetigen && (
                  <Button
                    variante={bestaetigen.variante ?? "primary"}
                    laedt={gesperrt}
                    aria-disabled={grundSichtbar || undefined}
                    aria-describedby={grundSichtbar ? grundId : undefined}
                    onClick={bestaetigen.onClick}
                    className="w-full sm:w-auto"
                  >
                    {gesperrt ? (bestaetigen.laeuftText ?? bestaetigen.text) : bestaetigen.text}
                  </Button>
                )}
              </div>
            </div>
          </RadixDialog.Content>
        </RadixDialog.Overlay>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export interface BestaetigungsDialogProps {
  offen: boolean;
  onAbbrechen: () => void;
  onBestaetigen: () => void;
  /** Die Frage, moeglichst ohne Anrede: „Vorgang stornieren?" */
  titel: string;
  /** Ein Satz zur Folge: was passiert, was sich nicht zuruecknehmen laesst. */
  children?: ReactNode;
  /** Das Verb der Aktion („Stornieren"), nie „OK" oder „Ja". */
  bestaetigenText: string;
  variante?: "primary" | "critical";
  abbrechenText?: string;
  gesperrt?: boolean;
  laeuftText?: string;
  fehler?: string | null;
  fokusZiel?: string;
  name?: string;
}

/**
 * Rueckfrage vor einer Aktion — der Ersatz fuer `confirm()`. Titel, ein Satz,
 * zwei Knoepfe. Der Fokus liegt beim Oeffnen auf „Abbrechen".
 */
export function BestaetigungsDialog({
  offen,
  onAbbrechen,
  onBestaetigen,
  titel,
  children,
  bestaetigenText,
  variante = "primary",
  abbrechenText,
  gesperrt,
  laeuftText,
  fehler,
  fokusZiel,
  name,
}: BestaetigungsDialogProps) {
  return (
    <Dialog
      offen={offen}
      onSchliessen={onAbbrechen}
      titel={titel}
      beschreibung={children}
      rolle="alertdialog"
      breite="sm"
      gesperrt={gesperrt}
      fehler={fehler}
      fokusZiel={fokusZiel}
      abbrechenText={abbrechenText}
      bestaetigen={{ text: bestaetigenText, onClick: onBestaetigen, variante, laeuftText }}
      name={name}
    />
  );
}
