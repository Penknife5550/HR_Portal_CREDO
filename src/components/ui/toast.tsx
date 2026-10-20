"use client";

/**
 * Toast (UX-Umbau „Klarer Weg", U0)
 *
 * Die kurze Rueckmeldung nach einer Aktion und der Ersatz fuer `alert()`:
 *
 *   toast.ok("Vorgang storniert.");
 *   toast.ok("Aufgabe erledigt.", { rueckgaengig: () => wiederOeffnen(id) });
 *   toast.fehler("Speichern fehlgeschlagen. Bitte erneut versuchen.");
 *   toast.hinweis("Die Liste wurde aktualisiert.");
 *
 * Regeln:
 *   - Ein FEHLER bleibt stehen, bis ihn jemand schliesst. Erfolg und Hinweis
 *     verschwinden nach 5 Sekunden, mit „Rückgängig" nach 10 — fuenf Sekunden
 *     reichen zum Lesen, nicht zum Lesen UND Entscheiden. Die Zeit haelt an,
 *     solange der Zeiger oder der Fokus auf der Meldung liegt (Radix).
 *   - Ein Fehler, zu dem der Mensch etwas korrigieren muss, gehoert NICHT in
 *     einen Toast, sondern an die Stelle der Eingabe (im Dialog: `fehler`).
 *   - Der Text ist Pflicht (ohne Text entsteht keine Meldung); das Symbol
 *     allein traegt keine Bedeutung. Screenreader hoeren bei einem Fehler
 *     „Fehler:" vorweg; Fehler werden sofort angesagt, alles andere hoeflich.
 *   - Dieselbe Meldung zweimal ersetzt die erste, statt sich zu stapeln.
 *     Hoechstens vier Meldungen stehen zugleich; die aelteste weicht.
 *   - `toast` ist ein einfacher Speicher auf Modulebene, kein Hook: Er laesst
 *     sich aus jedem Handler rufen. Gezeichnet wird nur, wo der
 *     `ToastAnbieter` eingehaengt ist — im Portal-Layout
 *     (`src/app/(portal)/layout.tsx`). Die oeffentlichen Link-Seiten haben
 *     keinen; dort bliebe eine Meldung unsichtbar (Warnung in der Konsole der
 *     Entwicklungsumgebung).
 *   - Meldungen gehoeren zur Sitzung: Verlaesst jemand das Portal (Abmelden,
 *     abgelaufene Sitzung), raeumt der Anbieter beim Aushaengen alles ab. Eine
 *     stehengebliebene Fehlermeldung mit einem Namen darin stuende sonst fuer
 *     die naechste Person am selben Rechner da.
 *   - Solange ein Dialog offen ist, haelt die Zeit ALLER Meldungen an: Der
 *     Fokusfang des Dialogs laesst die Tastatur nicht an die Meldung, „Rück-
 *     gängig" liefe sonst ab, ohne dass man es erreichen konnte. Nach dem
 *     Schliessen laeuft die Zeit weiter.
 *   - Farben: Flaeche `card`, Text `ink`, nur das Symbol traegt den Ton
 *     (`TOAST_TOENE`; der Kontrasttest liest die Tabelle).
 */
import { useEffect, useRef, useSyncExternalStore } from "react";
import * as RadixToast from "@radix-ui/react-toast";
import { AlertCircle, CheckCircle2, Info, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type ToastTon = "ok" | "fehler" | "hinweis";

/** Ton → Symbol, Symbolfarbe, Standzeit in ms (`null` = bleibt stehen). */
export const TOAST_TOENE: Record<ToastTon, { symbol: LucideIcon; farbe: string; dauer: number | null }> = {
  ok: { symbol: CheckCircle2, farbe: "text-ok", dauer: 5000 },
  fehler: { symbol: AlertCircle, farbe: "text-critical", dauer: null },
  hinweis: { symbol: Info, farbe: "text-info", dauer: 5000 },
};

/** Standzeit einer Meldung mit „Rückgängig". */
export const TOAST_DAUER_MIT_AKTION = 10000;
export const TOAST_HOECHSTZAHL = 4;

export interface ToastOptionen {
  /** Zeigt „Rückgängig"; der Klick ruft die Funktion und schliesst die Meldung. */
  rueckgaengig?: () => void;
}

interface Meldung {
  id: number;
  ton: ToastTon;
  text: string;
  rueckgaengig?: () => void;
}

const LEER: readonly Meldung[] = [];
let meldungen: readonly Meldung[] = LEER;
let naechsteId = 1;
const horcher = new Set<() => void>();

function setzen(neu: readonly Meldung[]) {
  meldungen = neu;
  horcher.forEach((h) => h());
}

function melden(ton: ToastTon, text: string, optionen?: ToastOptionen): number | null {
  const inhalt = text.trim();
  if (!inhalt) return null;
  if (horcher.size === 0 && process.env.NODE_ENV === "development") {
    console.warn("toast: kein ToastAnbieter eingehängt – die Meldung bleibt unsichtbar:", inhalt);
  }
  const id = naechsteId++;
  const ohneDoppelte = meldungen.filter((m) => !(m.ton === ton && m.text === inhalt));
  setzen([...ohneDoppelte, { id, ton, text: inhalt, rueckgaengig: optionen?.rueckgaengig }].slice(-TOAST_HOECHSTZAHL));
  return id;
}

function entfernen(id: number) {
  if (meldungen.some((m) => m.id === id)) setzen(meldungen.filter((m) => m.id !== id));
}

export const toast = {
  ok: (text: string, optionen?: ToastOptionen) => melden("ok", text, optionen),
  fehler: (text: string) => melden("fehler", text),
  hinweis: (text: string) => melden("hinweis", text),
  schliessen: entfernen,
  alleSchliessen: () => {
    if (meldungen.length > 0) setzen(LEER);
  },
};

function abonnieren(h: () => void) {
  horcher.add(h);
  return () => {
    horcher.delete(h);
  };
}

/** Zeichnet die Meldungen. Genau einmal je Seite einhaengen (Portal-Layout). */
export function ToastAnbieter() {
  const liste = useSyncExternalStore(
    abonnieren,
    () => meldungen,
    () => LEER,
  );
  const bereich = useRef<HTMLOListElement>(null);

  // Beim Verlassen des Portals alles abraeumen (siehe Kopf) — aber erst einen
  // Takt spaeter und nur, wenn dann KEIN Anbieter mehr haengt: Im Strict Mode
  // der Entwicklung haengt React jede Komponente einmal zur Probe aus und
  // sofort wieder ein; ein Abraeumen dabei loeschte Meldungen, die schon vor
  // dem Anbieter gemeldet waren.
  useEffect(
    () => () => {
      setTimeout(() => {
        if (horcher.size === 0) toast.alleSchliessen();
      }, 0);
    },
    [],
  );

  // Offener Dialog = Zeit anhalten. Radix sperrt waehrenddessen das Rollen und
  // setzt dafuer `data-scroll-locked` am body; die Meldungen hoeren auf die
  // Ereignisse `toast.viewportPause`/`-Resume` ihres Bereichs.
  useEffect(() => {
    const melden = () => {
      const gesperrt = document.body.hasAttribute("data-scroll-locked");
      bereich.current?.dispatchEvent(new CustomEvent(gesperrt ? "toast.viewportPause" : "toast.viewportResume"));
    };
    const waechter = new MutationObserver(melden);
    waechter.observe(document.body, { attributes: true, attributeFilter: ["data-scroll-locked"] });
    return () => waechter.disconnect();
  }, []);

  // Eine Meldung, die entsteht, WAEHREND ein Dialog schon offen ist, hat das
  // Pause-Ereignis oben nicht gehoert — also bei jeder Aenderung der Liste
  // noch einmal sagen. (Effekte der Kinder laufen vor diesem: Die neue Meldung
  // horcht dann schon.)
  useEffect(() => {
    if (liste.length > 0 && document.body.hasAttribute("data-scroll-locked")) {
      bereich.current?.dispatchEvent(new CustomEvent("toast.viewportPause"));
    }
  }, [liste]);

  return (
    <RadixToast.Provider label="Meldung" swipeDirection="right">
      {liste.map((m) => {
        const ton = TOAST_TOENE[m.ton];
        const Symbol = ton.symbol;
        const dauer = ton.dauer === null ? Infinity : m.rueckgaengig ? TOAST_DAUER_MIT_AKTION : ton.dauer;
        return (
          <RadixToast.Root
            key={m.id}
            type={m.ton === "fehler" ? "foreground" : "background"}
            duration={dauer}
            data-ton={m.ton}
            onOpenChange={(auf) => {
              if (!auf) entfernen(m.id);
            }}
            className="pointer-events-auto flex items-start gap-3 rounded-xl border border-hairline bg-card p-3 text-sm text-ink shadow-overlay data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x)"
          >
            <Symbol aria-hidden="true" className={cn("mt-0.5 h-5 w-5 shrink-0", ton.farbe)} />
            <RadixToast.Description className="min-w-0 flex-1 py-0.5 font-medium wrap-anywhere">
              {m.ton === "fehler" && <span className="sr-only">Fehler: </span>}
              {m.text}
            </RadixToast.Description>
            {m.rueckgaengig && (
              <RadixToast.Action altText="Rückgängig machen" asChild>
                <Button groesse="sm" onClick={() => m.rueckgaengig?.()} className="shrink-0">
                  Rückgängig
                </Button>
              </RadixToast.Action>
            )}
            <RadixToast.Close asChild>
              <Button variante="ghost" groesse="sm" aria-label="Meldung schließen" className="shrink-0 px-2">
                <X aria-hidden="true" className="h-4 w-4" />
              </Button>
            </RadixToast.Close>
          </RadixToast.Root>
        );
      })}
      {/* Ueber dem Dialog (z-50). `pointer-events-auto`: Ein offener Dialog
          nimmt dem `body` die Zeigerereignisse. Der Abstand rechts rechnet die
          Bildlaufleiste mit, die ein offener Dialog entfernt (Radix setzt dafuer
          `--removed-body-scroll-bar-size`) — sonst spraengen die Meldungen beim
          Oeffnen um deren Breite nach rechts. */}
      <RadixToast.Viewport
        ref={bereich}
        label="Meldungen ({hotkey})"
        className="pointer-events-auto fixed right-[calc(1rem+var(--removed-body-scroll-bar-size,0px))] bottom-4 z-60 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 outline-none"
      />
    </RadixToast.Provider>
  );
}
