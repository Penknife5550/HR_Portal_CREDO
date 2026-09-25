"use client";

/**
 * Rahmen der Dialoge „Unterlagen nachfordern" (Paket 4, modulneutral)
 *
 * Das Hausmuster aus `abteilungen-dialog.tsx` (AbteilungenDialog), EINMAL
 * zentral — die Karte hat sieben Rueckfragen und Pruef-Dialoge
 * (pruef-dialoge.tsx), dazu kommt der Dialog „Unterlagen nachfordern…"
 * (Schritt 10). Sieben Kopien desselben Rahmens liefen beim ersten
 * Nachbessern auseinander; genau die Stellen, die man nicht sieht (Fokus,
 * Escape waehrend des Sendens), vergaesse man dann in einer davon.
 *
 * Was der Rahmen regelt (Feinplanung 10.1):
 *   - `role="dialog"`, `aria-modal`, `aria-labelledby` auf den Titel und
 *     `aria-describedby` auf den Untertitel;
 *   - Fokus EINMAL beim Oeffnen auf „Abbrechen" — nicht an `onAbbrechen`
 *     gehaengt, sonst risse jedes Neuzeichnen der Karte (neue Pfeilfunktion je
 *     Render) den Fokus zurueck (Lehre aus abteilungen-dialog.tsx);
 *   - einfacher Fokusfang: Tab und Umschalt+Tab kreisen im Dialog — der
 *     Horcher haengt an `document`, damit er auch greift, wenn der Fokus auf
 *     `body` liegt (Klick auf Text, gesperrter Knopf waehrend des Sendens);
 *   - beim Schliessen zurueck auf das Element, das den Dialog geoeffnet hat —
 *     ist es inzwischen verschwunden oder gesperrt (die Aktion hat den Knopf
 *     weggenommen oder grau gemacht), auf `fokusZiel` (die Karte gibt ihren
 *     Titel);
 *   - Knopf „Schließen" im Kopf, Fehlerzeile mit `role="alert"`; ein NEUER
 *     Fehler des Servers bekommt den Fokus, sonst laege er nach dem Senden auf
 *     `body`;
 *   - Escape schliesst wie „Abbrechen" — und genau wie dieser Knopf NICHT
 *     waehrend des Sendens: Sonst verschwaende der Dialog, waehrend die Aktion
 *     noch laeuft, und ihr Ergebnis (etwa ein 409) haette keinen Ort mehr;
 *   - ein gesperrter Bestaetigen-Knopf nennt seinen Grund als sichtbaren Text,
 *     nie nur als Tooltip;
 *   - auf dem Handy stehen die Knoepfe untereinander, der bestaetigende oben.
 *
 * Der Rahmen ruft KEINE Schnittstelle. Die Dialoge melden ihr Ergebnis an die
 * Karte, die die Aktion ausfuehrt und einen Fehler des Servers hierher
 * zurueckgibt (`fehler`).
 */

import { useEffect, useId, useRef, type ReactNode } from "react";

export type BestaetigenFarbe = "gruen" | "rot" | "blau";

const BESTAETIGEN_KLASSEN: Record<BestaetigenFarbe, string> = {
  gruen: "bg-credo-gruen hover:bg-[#5a9420]",
  rot: "bg-credo-rot hover:bg-credo-rot/90",
  blau: "bg-credo-blau hover:bg-credo-blau/90",
};

/** Was per Tab erreichbar ist — gesperrte Felder und `tabIndex={-1}` nicht. */
const FOKUSSIERBAR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DialogRahmenProps {
  titel: string;
  /** Kleine Zeile unter dem Titel, etwa die Bezeichnung der Unterlage. */
  untertitel?: string | null;
  /** Laeuft die Aktion? Dann „Wird gesendet…", alle Knoepfe gesperrt, Escape wirkungslos. */
  sendet?: boolean;
  /** Fehler des Servers — der Dialog bleibt offen, damit die Eingabe korrigiert werden kann. */
  fehler?: string | null;
  onAbbrechen: () => void;
  bestaetigen: {
    text: string;
    onClick: () => void;
    /** Fehlt eine Pflichtangabe? Dann gesperrt, mit `grund` als sichtbarem Text. */
    grund?: string | null;
    farbe?: BestaetigenFarbe;
  };
  /** `data-dialog` fuer Selektoren und Tests. */
  name?: string;
  /** Id eines Elements, das den Fokus bekommt, wenn der Ausloeser beim Schliessen fehlt. */
  fokusZiel?: string;
  /** Zeile „* Pflichtfeld" im Fuss. */
  mitPflichtfeldern?: boolean;
  children?: ReactNode;
}

/**
 * Einfacher Fokusfang: Am Ende geht Tab zum Anfang, am Anfang Umschalt+Tab zum
 * Ende. Ein Fokus ausserhalb des Panels (etwa auf `body`) wird zurueckgeholt.
 */
function fokusFangen(e: KeyboardEvent, panel: HTMLElement | null) {
  if (!panel) return;
  const ziele = Array.from(panel.querySelectorAll<HTMLElement>(FOKUSSIERBAR));
  if (ziele.length === 0) {
    e.preventDefault();
    return;
  }
  const erstes = ziele[0];
  const letztes = ziele[ziele.length - 1];
  const aktiv = document.activeElement;
  const drinnen = !!aktiv && panel.contains(aktiv);
  if (e.shiftKey) {
    if (!drinnen || aktiv === erstes) {
      e.preventDefault();
      letztes.focus();
    }
  } else if (!drinnen || aktiv === letztes) {
    e.preventDefault();
    erstes.focus();
  }
}

export function DialogRahmen({
  titel,
  untertitel,
  sendet = false,
  fehler,
  onAbbrechen,
  bestaetigen,
  name,
  fokusZiel,
  mitPflichtfeldern = false,
  children,
}: DialogRahmenProps) {
  const id = useId();
  const titelId = `${id}-titel`;
  const untertitelId = `${id}-untertitel`;
  const grundId = `${id}-grund`;
  const panelRef = useRef<HTMLDivElement>(null);
  const abbrechenRef = useRef<HTMLButtonElement>(null);
  const fehlerRef = useRef<HTMLParagraphElement>(null);
  // Der Wert beim Oeffnen genuegt: Das Ersatzziel ist der Titel der Karte.
  const fokusZielRef = useRef(fokusZiel);
  // Der Fehler beim Oeffnen zaehlt nicht als neu — der Fokus gehoert dann „Abbrechen".
  const letzterFehlerRef = useRef(fehler ?? null);

  // Fokus EINMAL beim Oeffnen, und beim Schliessen zurueck. Der Ausloeser wird
  // gemerkt, bevor der Fokus in den Dialog springt. Ohne Abhaengigkeiten: Der
  // Fokus gehoert dem Oeffnen, nicht dem Neuzeichnen. Ein gesperrter Ausloeser
  // nimmt `focus()` stillschweigend nicht an (etwa „Link erneut senden" in der
  // Sperrzeit) — dann das Ersatzziel statt `body`.
  useEffect(() => {
    const vorher = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const ersatz = fokusZielRef.current;
    abbrechenRef.current?.focus();
    return () => {
      if (vorher && vorher.isConnected && vorher !== document.body) {
        vorher.focus();
        if (document.activeElement === vorher) return;
      }
      if (ersatz) document.getElementById(ersatz)?.focus();
    };
  }, []);

  // Tastatur an `document`, nicht am Overlay: Liegt der Fokus auf `body`, laeuft
  // ein Tastendruck gar nicht durch das Overlay. Escape schliesst — nicht
  // waehrend des Sendens; Tab bleibt immer im Dialog. `sendet` ist
  // Abhaengigkeit: Der Horcher wird bei jedem Wechsel neu gesetzt, liest also
  // nie einen veralteten Wert aus einer frueheren Closure.
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!sendet) onAbbrechen();
      } else if (e.key === "Tab") {
        fokusFangen(e, panelRef.current);
      }
    };
    document.addEventListener("keydown", taste);
    return () => document.removeEventListener("keydown", taste);
  }, [onAbbrechen, sendet]);

  // Ein neuer Fehler des Servers holt den Fokus in den Dialog zurueck: Waehrend
  // des Sendens war der Bestaetigen-Knopf gesperrt, der Fokus liegt also auf
  // `body`. Die Fehlerzeile ist `tabIndex={-1}` — erreichbar per Programm, nicht
  // per Tab.
  useEffect(() => {
    const neu = fehler ?? null;
    if (neu && neu !== letzterFehlerRef.current) fehlerRef.current?.focus();
    letzterFehlerRef.current = neu;
  }, [fehler]);

  const grund = bestaetigen.grund?.trim() || null;
  const farbe = BESTAETIGEN_KLASSEN[bestaetigen.farbe ?? "blau"];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titelId}
      aria-describedby={untertitel ? untertitelId : undefined}
      data-dialog={name}
    >
      <div
        ref={panelRef}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-card shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id={titelId} className="text-base font-bold text-foreground">
              {titel}
            </h2>
            {untertitel && (
              <p id={untertitelId} className="mt-0.5 break-words text-xs text-muted-foreground">
                {untertitel}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onAbbrechen}
            disabled={sendet}
            aria-label="Dialog schließen"
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">{children}</div>

        <div className="space-y-2 border-t border-border px-5 py-4">
          {fehler && (
            <p
              ref={fehlerRef}
              role="alert"
              tabIndex={-1}
              className="rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-3 py-2 text-sm text-credo-rot outline-none"
              data-zeile="fehler"
            >
              {fehler}
            </p>
          )}
          {grund && !sendet && (
            <p id={grundId} className="text-xs text-muted-foreground" data-zeile="grund">
              {grund}
            </p>
          )}
          {mitPflichtfeldern && <p className="text-[11px] text-muted-foreground">* Pflichtfeld</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              ref={abbrechenRef}
              type="button"
              onClick={onAbbrechen}
              disabled={sendet}
              className="w-full rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50 sm:w-auto"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={bestaetigen.onClick}
              disabled={sendet || !!grund}
              aria-describedby={grund && !sendet ? grundId : undefined}
              className={`w-full rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto ${farbe}`}
            >
              {sendet ? "Wird gesendet…" : bestaetigen.text}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
