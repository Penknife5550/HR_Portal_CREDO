"use client";

/**
 * Reiter (UX-Umbau „Klarer Weg", Pilot Vertragsende)
 *
 * Teilt EINE Seite in Bereiche mit eigenem Inhalt („Übersicht · Vertragsdaten ·
 * Dokumente 1 · E-Mails 0"): eine Zeile Namen ueber einer Haarlinie, darunter
 * das Inhaltsfeld des gewaehlten Reiters.
 *
 *   <Reiter label="Bereiche des Vorgangs" wert={reiter} onWechsel={setReiter}
 *     reiter={[{ wert: "uebersicht", text: "Übersicht" }, { wert: "dokumente", text: "Dokumente", zahl: 1 }]}>
 *     <ReiterInhalt wert="uebersicht">…</ReiterInhalt>
 *     <ReiterInhalt wert="dokumente">…</ReiterInhalt>
 *   </Reiter>
 *
 * Regeln:
 *   - Reiter haben ein INHALTSFELD (Radix Tabs: `tablist`, `tab`, `tabpanel`).
 *     Das unterscheidet sie vom `Segment`, das eine Liste nur filtert und
 *     deshalb eine Auswahlgruppe ist. Je Eintrag in `reiter` gehoert genau ein
 *     `<ReiterInhalt>` mit demselben `wert` dazu — der Reiter verweist auf sein
 *     Feld (`aria-controls`), ohne Feld zeigte der Verweis ins Leere.
 *   - GESTEUERT: Den gewaehlten Reiter fuehrt die Seite (`wert`/`onWechsel`),
 *     spaeter in der Adresse. Der Baustein liest NICHTS aus der Adresse und
 *     merkt sich nichts. `onWechsel` laeuft nur bei einem echten Wechsel, nie
 *     beim Klick auf den schon gewaehlten Reiter — und je Klick genau EINMAL,
 *     auch wenn die Seite den neuen `wert` erst spaeter zurueckgibt (Adresse).
 *     Wechselt die Seite den Reiter von aussen, zieht der Halt der Tab-Taste
 *     mit: Er liegt immer auf dem gewaehlten Reiter.
 *   - Passt `wert` zu keinem Eintrag (ein unbekanntes `?tab=`), gilt der ERSTE
 *     Reiter als gewaehlt: Die Leiste steht nie ohne gewaehlten Reiter und ohne
 *     sichtbaren Inhalt da. Ohne Eintraege zeichnet der Baustein nichts.
 *   - Nur der Inhalt des gewaehlten Reiters steht im DOM; von den uebrigen
 *     Feldern haelt Radix die leere, versteckte Huelle (auf sie zeigt der
 *     Verweis ihres Reiters). Was in einem Reiter liegt, wird erst mit dem
 *     Wechsel eingehaengt und laedt dann seine Daten — und haengt beim
 *     Wegwechseln wieder aus (Eingaben darin gehen verloren, wenn die Seite
 *     sie nicht haelt).
 *   - Tastatur wie bei Reitern ueblich: Tab erreicht den gewaehlten Reiter, die
 *     Pfeiltasten wechseln (rundum), Pos1 und Ende springen; die Auswahl folgt
 *     dem Fokus. Das naechste Tab fuehrt in das Inhaltsfeld. Bild-auf und
 *     Bild-ab rollen die Seite wie ueberall (Radix belegte sie sonst mit
 *     „erster/letzter Reiter").
 *   - `label` benennt die Leiste fuer Screenreader und ist Pflicht.
 *   - Der Zaehler gehoert zum Namen des Reiters („Dokumente 1"). Eine Zahl
 *     ohne Wort gibt es nicht; `0` wird gezeigt.
 *   - Der gewaehlte Reiter hebt sich durch Strich UND Schriftstaerke ab, nie
 *     nur durch Farbe. Der Strich ist ein echter Rand, kein Schatten: Im
 *     Windows-Kontrastmodus entfallen Schatten und Flaechen, Raender bleiben.
 *     Die uebrigen Reiter tragen deshalb GAR KEINEN Rand — auch keinen
 *     durchsichtigen, der dort sichtbar wuerde —, den Platz haelt ihr Innenabstand.
 *   - Auf schmalen Bildschirmen rollt die Leiste waagerecht, statt umzubrechen
 *     oder abzuschneiden; der gewaehlte Reiter wird dabei in den sichtbaren
 *     Teil geholt (ein Verweis auf den letzten Reiter zeigte am Handy sonst
 *     eine Leiste ohne Auswahl). Der Fokusring liegt INNEN — er wuerde sonst
 *     vom Rollbereich abgeschnitten.
 *   - Die Reiter stehen auf `surface` oder `card`. `REITER_FARBEN` ist die
 *     EINE Quelle der Farben; der Kontrasttest liest sie von hier.
 *   - Das Inhaltsfeld hat keine eigene Flaeche: Was darin steht, bringt seine
 *     mit (`Gruppe`). Es ist fokussierbar und zeigt dann einen Fokusring.
 *   - Keine Fachbegriffe: Namen, Zaehler und Inhalte kommen von der Seite.
 */
import { useEffect, useRef, type ReactNode } from "react";
import * as RadixReiter from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export interface ReiterEintrag<T extends string = string> {
  /** Schluessel des Reiters, ohne Leerzeichen (daraus entsteht die Id des Inhaltsfelds). */
  wert: T;
  text: string;
  /** Zaehler hinter dem Namen; `0` wird gezeigt, `undefined` nicht. Er gehoert zum Namen („Dokumente 1"). */
  zahl?: number;
}

/**
 * Farbklassen: Name in Ruhe, beim Ueberfahren und gewaehlt, Zaehler, Strich
 * unter dem gewaehlten Reiter. Jede Textfarbe steht auf `surface` oder `card`.
 */
export const REITER_FARBEN = {
  ruhe: "text-ink-2",
  hover: "hover:text-ink",
  aktiv: "text-ink",
  zahl: "text-ink-2",
  strich: "border-ink",
} as const;

export interface ReiterProps<T extends string> {
  /** Name der Reiterleiste fuer Screenreader, z. B. „Bereiche des Vorgangs". Pflicht. */
  label: string;
  /** Der gewaehlte Reiter – GESTEUERT: Die Seite fuehrt ihn (spaeter in der Adresse, `?tab=…`). */
  wert: T;
  onWechsel: (wert: T) => void;
  reiter: readonly ReiterEintrag<T>[];
  /** Die Inhalte: je Reiter ein `<ReiterInhalt wert="…">`. */
  children: ReactNode;
  className?: string;
}

export function Reiter<T extends string>({ label, wert, onWechsel, reiter, children, className }: ReiterProps<T>) {
  const leiste = useRef<HTMLDivElement>(null);
  // Der Wert, der in diesem Ereignis schon gemeldet wurde (siehe `onValueChange`).
  const gemeldet = useRef<string | null>(null);
  // Passt `wert` zu keinem Eintrag, gilt der erste Reiter.
  const gewaehlt = reiter.some((r) => r.wert === wert) ? wert : reiter[0]?.wert;

  // Den gewaehlten Reiter in den sichtbaren Teil der Leiste holen. Bewusst nur
  // die Leiste rollen, nicht `scrollIntoView`: Das rollte auch die SEITE, wenn
  // die Leiste beim Oeffnen noch unter dem Bildschirmrand liegt.
  useEffect(() => {
    const liste = leiste.current;
    const knopf = liste?.querySelector('[role="tab"][aria-selected="true"]');
    if (!liste || !knopf) return;
    const rahmen = liste.getBoundingClientRect();
    const feld = knopf.getBoundingClientRect();
    if (feld.left < rahmen.left) liste.scrollLeft -= rahmen.left - feld.left;
    else if (feld.right > rahmen.right) liste.scrollLeft += feld.right - rahmen.right;
  }, [gewaehlt]);

  if (gewaehlt === undefined) return null;

  return (
    <RadixReiter.Root
      value={gewaehlt}
      activationMode="automatic"
      onValueChange={(neu) => {
        // Radix kennt nur Zeichenketten; der Eintrag gibt den Typ zurueck.
        const eintrag = reiter.find((r) => r.wert === neu);
        if (!eintrag || eintrag.wert === gewaehlt) return;
        // EIN Klick, EINE Meldung: Radix waehlt bei `mousedown` und — weil die
        // Auswahl dem Fokus folgt — beim `focus` gleich danach noch einmal,
        // solange der Reiter nicht als gewaehlt gilt. Fuehrt die Seite den
        // Reiter in der Adresse, kommt ihr neuer `wert` erst nach dem Ereignis
        // zurueck; ohne diesen Merker liefe `onWechsel` zweimal (zwei
        // Navigationen je Klick). Freigegeben wird er NACH dem Ereignis (ein
        // Mikrotask liefe zwischen `mousedown` und `focus`): Lehnt die Seite
        // den Wechsel ab, meldet ein spaeterer Klick wieder.
        if (gemeldet.current === eintrag.wert) return;
        gemeldet.current = eintrag.wert;
        setTimeout(() => {
          gemeldet.current = null;
        }, 0);
        onWechsel(eintrag.wert);
      }}
      // `min-w-0`: In einem Raster oder einer Flex-Zeile drueckte die Leiste
      // sonst die Seite breit, statt selbst zu rollen.
      className={cn("min-w-0", className)}
    >
      <RadixReiter.List
        ref={leiste}
        aria-label={label}
        // Bild-auf/Bild-ab gehoeren der Seite: Radix spraenge damit zum ersten
        // bzw. letzten Reiter und schaltete den Inhalt um, statt zu rollen.
        // Nur die Weitergabe an Radix anhalten, NICHT die Vorgabe des Browsers.
        onKeyDownCapture={(e) => {
          if (e.key === "PageUp" || e.key === "PageDown") e.stopPropagation();
        }}
        className="flex gap-3 overflow-x-auto border-b border-hairline"
      >
        {reiter.map((r) => {
          const aktiv = r.wert === gewaehlt;
          return (
            <RadixReiter.Trigger
              key={r.wert}
              value={r.wert}
              // Der Halt der Tab-Taste haengt an der AUSWAHL, nicht an Radix'
              // Merker: Der merkt sich den zuletzt fokussierten Reiter und
              // bekommt einen Wechsel von aussen (Adresse, Schritt der
              // Prozessleiste) nicht mit — Umschalt+Tab aus dem Inhalt landete
              // dann auf einem nicht gewaehlten Reiter und schaltete um.
              tabIndex={aktiv ? 0 : -1}
              className={cn(
                "inline-flex shrink-0 items-baseline gap-1.5 px-1.5 pt-2.5 text-sm whitespace-nowrap transition-colors select-none",
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-action",
                // Gleiche Hoehe mit und ohne Strich: 8 px Abstand + 2 px Rand
                // gegen 10 px Abstand — beim Wechsel springt nichts.
                aktiv
                  ? cn("border-b-2 pb-2 font-semibold", REITER_FARBEN.strich, REITER_FARBEN.aktiv)
                  : cn("pb-2.5 font-medium", REITER_FARBEN.ruhe, REITER_FARBEN.hover),
              )}
            >
              <span>{r.text}</span>
              {r.zahl !== undefined && (
                <span className={cn("text-xs tabular-nums", REITER_FARBEN.zahl)}>{r.zahl}</span>
              )}
            </RadixReiter.Trigger>
          );
        })}
      </RadixReiter.List>
      {children}
    </RadixReiter.Root>
  );
}

export interface ReiterInhaltProps {
  /** Der `wert` des Reiters, zu dem dieser Inhalt gehoert. */
  wert: string;
  children: ReactNode;
  className?: string;
}

/** Inhaltsfeld eines Reiters; sein Inhalt steht nur im DOM, solange der Reiter gewaehlt ist. */
export function ReiterInhalt({ wert, children, className }: ReiterInhaltProps) {
  return (
    <RadixReiter.Content
      value={wert}
      className={cn(
        "mt-4 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action",
        className,
      )}
    >
      {children}
    </RadixReiter.Content>
  );
}
