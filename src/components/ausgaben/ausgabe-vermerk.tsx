"use client";

/**
 * „Übergabe vermerken“ auf der Link-Seite der Stelle (Onboarding,
 * Ausstattung & Zugaenge Stufe 2 – Feinplan A4, 1.8, G6, Mockup 6.5)
 *
 * Block an einer Ausstattungsaufgabe, eingebunden von der gemeinsamen
 * Aufgabenseite (src/components/abteilungsaufgaben/aufgaben-seite.tsx) unter
 * dem Kasten der Bemerkung. Zeigt:
 *
 *   - die schon vermerkten Stuecke DIESER Stelle („FES-IPAD-0412 · übergeben
 *     28.01.2027“, bei einem Zugang „eingerichtet …“) – mit „Entfernen“ nur an
 *     eigenen Link-Vermerken, die der Server auch entfernt (`entfernbar`);
 *   - nach dem Abhaken ohne Vermerk den Satz „Übergabe noch nicht vermerkt“;
 *   - das Formular „Übergabe vermerken“: Kennung (beschriftet mit
 *     `kennungLabel`, freiwillig), Datum (Vorgabe heute, nie in der Zukunft),
 *     „+ weiteres Stück“ bis zur Grenze je Vermerk – nur, wenn `moeglich`.
 *
 * Getrennt vom Abhaken (E-A30): Ein Vermerk hakt nichts ab, das Abhaken
 * vermerkt nichts. Was moeglich ist und was angezeigt wird, kommt fertig vom
 * Server (`linkAusgabeBauen`); der Block rechnet nichts. Fehlertexte stehen
 * so im Block, wie der Server sie schickt. Die Aufgabenseite zeigt den Block
 * nur ohne „nur lesen“ und nicht an einer entfallenen Aufgabe.
 *
 * Fokus (Tastatur, Screenreader): Verschwindet der fokussierte Knopf, legt der
 * Block den Fokus selbst weiter, statt ihn auf `body` fallen zu lassen –
 * nach „Abbrechen“ und nach dem Speichern auf „Übergabe vermerken“ (gibt es
 * ihn nicht mehr, auf den Block), nach „Entfernen“ auf den naechsten
 * Entfernen-Knopf (sonst den Block), nach „Stück weglassen“ auf „weiteres
 * Stück“ (wie im HR-Dialog), bei einem Fehler auf dessen Text (wie
 * `DialogRahmen`). Zeilen des Formulars tragen stabile Schluessel.
 *
 * Nur Farb-Tokens und lucide-react (neue Datei, Stand 0 in der Sperrklinke),
 * Texte im „Sie“ (Link-Seite ohne Anmeldung).
 */

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import {
  AUSGABE_GRENZEN,
  MELDUNGEN_AUSGABEN,
  linkStueckText,
  type AusgabeBeiAustritt,
  type LinkAusgabe,
} from "@/lib/ausgaben";
import { heuteInBerlin } from "@/lib/kalendertag";

/** Woerter je Art: ein Gegenstand wird uebergeben, ein Zugang eingerichtet (G4). */
export const VERMERK_TEXTE: Readonly<
  Record<AusgabeBeiAustritt, { titel: string; datum: string; fehlt: string; speichern: string }>
> = {
  RUECKGABE: {
    titel: "Übergabe vermerken",
    datum: "Übergeben am",
    fehlt: MELDUNGEN_AUSGABEN.UEBERGABE_NOCH_NICHT_VERMERKT,
    speichern: "Übergabe speichern",
  },
  SPERREN: {
    titel: "Einrichtung vermerken",
    datum: "Eingerichtet am",
    fehlt: MELDUNGEN_AUSGABEN.EINRICHTUNG_NOCH_NICHT_VERMERKT,
    speichern: "Einrichtung speichern",
  },
};

/** Ein Stueck, wie es an den Server geht (`vermerkSchema`). */
export interface VermerkEingabe {
  kennung: string | null;
  uebergebenAm?: string;
}

export interface AusgabeVermerkProps {
  aufgabeId: string;
  ausgabe: LinkAusgabe;
  /** Aufgabe abgehakt: ohne Stueck der Satz „… noch nicht vermerkt“. */
  erledigt: boolean;
  /** Eine andere Aenderung an der Aufgabe laeuft gerade. */
  gesperrt?: boolean;
  /** POST …/ausgaben; wirft mit dem Text des Servers. */
  onVermerken: (stuecke: VermerkEingabe[]) => Promise<void>;
  /** DELETE …/ausgaben/[ausgabeId]; wirft mit dem Text des Servers. */
  onEntfernen: (ausgabeId: string) => Promise<void>;
  /** Nur fuer Tests: der heutige Berliner Tag (`YYYY-MM-DD`). */
  heute?: string;
}

interface Zeile {
  /** Stabiler Schluessel der Zeile (Weglassen baut die uebrigen nicht neu auf). */
  nr: number;
  kennung: string;
  datum: string;
}

/** Wohin der Fokus nach dem naechsten Zeichnen geht (siehe Kopfkommentar). */
type FokusZiel =
  | { art: "vermerken" }
  | { art: "weiter" }
  | { art: "fehler" }
  /** Der Entfernen-Knopf an dieser Stelle der Liste (sonst der letzte, sonst der Block). */
  | { art: "entfernen"; index: number };

const FEHLER_ALLGEMEIN = "Fehler beim Speichern.";

function fehlerText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : FEHLER_ALLGEMEIN;
}

export function AusgabeVermerk({
  aufgabeId,
  ausgabe,
  erledigt,
  gesperrt = false,
  onVermerken,
  onEntfernen,
  heute,
}: AusgabeVermerkProps) {
  const texte = VERMERK_TEXTE[ausgabe.art] ?? VERMERK_TEXTE.RUECKGABE;
  const tag = heute ?? heuteInBerlin();
  const naechsteNr = useRef(0);
  const leereZeile = (): Zeile => ({ nr: naechsteNr.current++, kennung: "", datum: tag });

  const [offen, setOffen] = useState(false);
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const blockRef = useRef<HTMLDivElement>(null);
  const vermerkenRef = useRef<HTMLButtonElement>(null);
  const weiterRef = useRef<HTMLButtonElement>(null);
  const fehlerRef = useRef<HTMLParagraphElement>(null);
  const [fokusZiel, setFokusZiel] = useState<FokusZiel | null>(null);

  // Erst nach dem Zeichnen: Dann steht der neue Stand (auch der frische Stand
  // des Servers, den die Seite vor dem Ende von `onVermerken` setzt) im DOM.
  useEffect(() => {
    if (!fokusZiel) return;
    setFokusZiel(null);
    const block = blockRef.current;
    if (!block) return;
    let ziel: HTMLElement | null = null;
    if (fokusZiel.art === "vermerken") ziel = vermerkenRef.current;
    else if (fokusZiel.art === "weiter") ziel = weiterRef.current;
    else if (fokusZiel.art === "fehler") ziel = fehlerRef.current;
    else {
      const knoepfe = block.querySelectorAll<HTMLButtonElement>("[data-ausgabe-entfernen]");
      ziel = knoepfe.length > 0 ? knoepfe[Math.min(fokusZiel.index, knoepfe.length - 1)] : null;
    }
    // Ein gesperrter Knopf nimmt den Fokus nicht an – dann der Block selbst.
    if (ziel && !(ziel as HTMLButtonElement).disabled) ziel.focus();
    else block.focus();
  }, [fokusZiel]);

  const aus = gesperrt || laeuft;
  const formId = `ausgabe-vermerk-${aufgabeId}`;

  const oeffnen = () => {
    setZeilen([leereZeile()]);
    setFehler(null);
    setOffen(true);
  };

  const schliessen = () => {
    setOffen(false);
    setZeilen([]);
    setFehler(null);
    setFokusZiel({ art: "vermerken" });
  };

  const zeileSetzen = (nr: number, teil: Partial<Omit<Zeile, "nr">>) =>
    setZeilen((prev) => prev.map((z) => (z.nr === nr ? { ...z, ...teil } : z)));

  const weglassen = (nr: number) => {
    setZeilen((prev) => prev.filter((z) => z.nr !== nr));
    setFokusZiel({ art: "weiter" });
  };

  const speichern = async (e: FormEvent) => {
    e.preventDefault();
    if (aus || zeilen.length === 0) return;
    setLaeuft(true);
    setFehler(null);
    try {
      await onVermerken(
        zeilen.map((z) => ({
          kennung: z.kennung.trim() || null,
          ...(z.datum ? { uebergebenAm: z.datum } : {}),
        })),
      );
      setOffen(false);
      setZeilen([]);
      setFokusZiel({ art: "vermerken" });
    } catch (err) {
      setFehler(fehlerText(err));
      setFokusZiel({ art: "fehler" });
    } finally {
      setLaeuft(false);
    }
  };

  const entfernen = async (ausgabeId: string, index: number) => {
    if (aus) return;
    setLaeuft(true);
    setFehler(null);
    try {
      await onEntfernen(ausgabeId);
      setFokusZiel({ art: "entfernen", index });
    } catch (err) {
      setFehler(fehlerText(err));
      setFokusZiel({ art: "fehler" });
    } finally {
      setLaeuft(false);
    }
  };

  // Position je entfernbarem Stueck: der Knopf an derselben Stelle ist danach der naechste.
  const entfernbare = ausgabe.stuecke.filter((s) => s.entfernbar).map((s) => s.id);

  return (
    <div
      ref={blockRef}
      tabIndex={-1}
      className="mt-2 rounded-lg border border-border bg-card px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-ausgabe-vermerk={aufgabeId}
    >
      {ausgabe.stuecke.length > 0 && (
        <ul className="space-y-1" aria-label="Vermerkte Stücke">
          {ausgabe.stuecke.map((s) => {
            const text = linkStueckText(s, ausgabe.art);
            return (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 text-xs text-foreground"
                data-ausgabe-stueck={s.id}
              >
                <span className="min-w-0 break-words">{text}</span>
                {s.entfernbar && (
                  <button
                    type="button"
                    onClick={() => entfernen(s.id, entfernbare.indexOf(s.id))}
                    disabled={aus}
                    data-ausgabe-entfernen={s.id}
                    aria-label={`Vermerk „${text}“ entfernen`}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                    Entfernen
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {ausgabe.stuecke.length === 0 && erledigt && (
        <p className="text-xs font-medium text-foreground" data-vermerk-fehlt>
          {texte.fehlt}
        </p>
      )}

      {fehler && (
        <p ref={fehlerRef} tabIndex={-1} role="alert" className="mt-1 text-xs font-medium text-destructive outline-none">
          {fehler}
        </p>
      )}

      {ausgabe.moeglich && !offen && (
        <button
          ref={vermerkenRef}
          type="button"
          onClick={oeffnen}
          disabled={aus}
          className="mt-1 text-xs text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
        >
          {texte.titel}
        </button>
      )}

      {ausgabe.moeglich && offen && (
        <form id={formId} onSubmit={speichern} className="mt-2 space-y-2" aria-label={texte.titel}>
          <p className="text-xs font-semibold text-foreground">{texte.titel}</p>
          {zeilen.map((z, i) => {
            const kennungId = `${formId}-kennung-${z.nr}`;
            const datumId = `${formId}-datum-${z.nr}`;
            const stueck = zeilen.length > 1 ? ` – Stück ${i + 1}` : "";
            return (
              <div key={z.nr} className="flex flex-wrap items-end gap-2" data-vermerk-zeile={i}>
                <div className="min-w-0 flex-1">
                  <label htmlFor={kennungId} className="block text-xs text-muted-foreground">
                    {`${ausgabe.kennungLabel}${stueck} (optional)`}
                  </label>
                  <input
                    id={kennungId}
                    type="text"
                    value={z.kennung}
                    maxLength={AUSGABE_GRENZEN.kennung}
                    onChange={(e) => zeileSetzen(z.nr, { kennung: e.target.value })}
                    autoFocus={i === zeilen.length - 1}
                    className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-base text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring sm:text-sm"
                  />
                </div>
                <div>
                  <label htmlFor={datumId} className="block text-xs text-muted-foreground">
                    {`${texte.datum}${stueck}`}
                  </label>
                  <input
                    id={datumId}
                    type="date"
                    value={z.datum}
                    max={tag}
                    onChange={(e) => zeileSetzen(z.nr, { datum: e.target.value })}
                    className="rounded-lg border border-input bg-background px-2 py-1.5 text-base text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring sm:text-sm"
                  />
                </div>
                {zeilen.length > 1 && (
                  <button
                    type="button"
                    onClick={() => weglassen(z.nr)}
                    disabled={aus}
                    aria-label={`Stück ${i + 1} weglassen`}
                    className="mb-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            );
          })}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {zeilen.length < AUSGABE_GRENZEN.stueckJeVermerk ? (
              <button
                ref={weiterRef}
                type="button"
                onClick={() => {
                  const neu = leereZeile();
                  setZeilen((prev) => [...prev, neu]);
                }}
                disabled={aus}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
              >
                <Plus className="h-3 w-3" aria-hidden="true" />
                weiteres Stück
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={schliessen}
                disabled={laeuft}
                className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={aus}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {laeuft ? "Wird gespeichert …" : texte.speichern}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
