"use client";

/**
 * Arbeitsort am Onboarding-Vorgang: Anzeige und „Ändern…“ (E-A10, Feinplan S5)
 *
 * Der Arbeitsort ist die Einrichtung, an der die Person arbeitet, wenn das
 * nicht der Arbeitgeber ist (OGS-Kraft des Fördervereins an einer
 * Grundschule). Nach ihm richten sich die Aufgaben für Abteilungen und der
 * Katalog „Ausstattung & Zugänge“ im Formular der Führungskraft. Der Mandant
 * bleibt die Einrichtung des Vorgangs.
 *
 *   - `ArbeitsortFeld`: Zeile „Arbeitsort“ in der Karte „Person“ (Übersicht),
 *     mit dem Knopf „Ändern…“ nur, wenn die Seite `aenderbar` sagt — sie
 *     rechnet das aus Bearbeitungsrecht und `arbeitsortSperrGrund`
 *     (src/lib/ausstattung.ts), derselben Regel wie der Server.
 *   - `ArbeitsortKopf`: der Zusatz „· Arbeitsort: …“ in der Kopfzeile der
 *     Detailseite, nur bei Abweichung von der Einrichtung.
 *
 * Der Dialog (DialogRahmen) bietet „Wie Einrichtung“ und die aktiven
 * Einrichtungen an und schickt PATCH /api/onboarding/[id]/arbeitsort. Ein
 * Fehler des Servers (409 „Link schon erzeugt“, 404) bleibt im Dialog stehen.
 * Nach JEDER Antwort des Servers lädt die Seite den Vorgang neu
 * (`onGeaendert`, still): Auch ein 409 heißt, dass sich der Stand geändert hat
 * (jemand hat inzwischen den Link erzeugt) — sonst böte die Karte „Ändern…“
 * weiter an, und jeder Versuch endete am selben 409. Verschwindet der Knopf
 * dabei, geht der Fokus beim Schließen auf die Beschriftung „Arbeitsort“.
 */

import { useCallback, useState } from "react";
import { DialogRahmen } from "@/components/unterlagen/dialog-rahmen";
import { MELDUNGEN } from "@/lib/ausstattung";

/** So liefert GET /api/onboarding/[id] den Arbeitsort (`null` = wie Einrichtung). */
export interface ArbeitsortDaten {
  id: string;
  name: string;
  type?: string | null;
}

interface Einrichtung {
  id: string;
  name: string;
  mandantNumber?: string | null;
  isActive?: boolean;
}

export const WIE_EINRICHTUNG = "Wie Einrichtung";

const FEHLER_SPEICHERN = "Der Arbeitsort konnte nicht gespeichert werden.";
const FEHLER_VERBINDUNG = "Verbindungsfehler. Bitte erneut versuchen.";
const FEHLER_LADEN = "Die Einrichtungen konnten nicht geladen werden. Bitte den Dialog erneut öffnen.";

const EINGABE =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring";
const KNOPF_ZEILE =
  "rounded-md border border-border px-2 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-accent";

function einrichtungsText(e: { name: string; mandantNumber?: string | null }): string {
  return e.mandantNumber ? `${e.name} (${e.mandantNumber})` : e.name;
}

// =============================================
// Kopfzeile der Detailseite
// =============================================

/** „· Arbeitsort: …“ hinter der Einrichtung — nichts, solange er die Einrichtung ist. */
export function ArbeitsortKopf({ arbeitsort }: { arbeitsort: ArbeitsortDaten | null | undefined }) {
  if (!arbeitsort) return null;
  return (
    <>
      <span className="text-border">&middot;</span>
      <span data-feld="arbeitsort-kopf">Arbeitsort: {arbeitsort.name}</span>
    </>
  );
}

// =============================================
// Zeile in der Karte „Person“ samt Dialog
// =============================================

export function ArbeitsortFeld({
  onboardingId,
  einrichtung,
  arbeitsort,
  aenderbar,
  onGeaendert,
}: {
  onboardingId: string;
  /** Einrichtung des Vorgangs (Mandant) — Vorgabe des Arbeitsorts. */
  einrichtung: { id: string; name: string; mandantNumber?: string | null };
  arbeitsort: ArbeitsortDaten | null | undefined;
  /** Bearbeitungsrecht UND kein Sperrgrund (`arbeitsortSperrGrund`). Sonst nur Anzeige. */
  aenderbar: boolean;
  /** Nach dem Speichern: Vorgang neu laden. */
  onGeaendert: () => void | Promise<void>;
}) {
  const [offen, setOffen] = useState(false);
  const [auswahl, setAuswahl] = useState("");
  const [einrichtungen, setEinrichtungen] = useState<Einrichtung[] | null>(null);
  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);

  const bisher = arbeitsort?.id ?? "";

  const oeffnen = () => {
    setAuswahl(bisher);
    setFehler(null);
    setMeldung(null);
    setOffen(true);
    fetch("/api/organizations")
      .then((res) => res.json())
      .then((daten: { data?: Einrichtung[] }) => {
        if (Array.isArray(daten.data)) setEinrichtungen(daten.data);
        else setFehler(FEHLER_LADEN);
      })
      .catch(() => setFehler(FEHLER_LADEN));
  };

  // Stabil, weil DialogRahmen seinen Escape-Horcher daran haengt.
  const schliessen = useCallback(() => setOffen(false), []);

  const speichern = async () => {
    setSendet(true);
    setFehler(null);
    try {
      const res = await fetch(`/api/onboarding/${onboardingId}/arbeitsort`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arbeitsortId: auswahl || null }),
      });
      if (!res.ok) {
        const daten = (await res.json().catch(() => ({}))) as { error?: unknown };
        setFehler(typeof daten.error === "string" && daten.error.trim() ? daten.error : FEHLER_SPEICHERN);
        // Jede Antwort kann den Stand geaendert haben (Muster nachforderung-karte):
        // still neu laden, der Dialog bleibt mit der Meldung offen.
        void Promise.resolve(onGeaendert()).catch(() => undefined);
        return;
      }
      setOffen(false);
      setMeldung(MELDUNGEN.ARBEITSORT_GESPEICHERT);
      await onGeaendert();
    } catch {
      setFehler(FEHLER_VERBINDUNG);
    } finally {
      setSendet(false);
    }
  };

  // Angeboten: „Wie Einrichtung“ und jede AKTIVE Einrichtung ausser der des
  // Vorgangs (die steht schon als „Wie Einrichtung“ da). Ein inzwischen
  // stillgelegter Arbeitsort bleibt wählbar, solange er gesetzt ist.
  const angebot = (einrichtungen ?? []).filter(
    (e) => e.id !== einrichtung.id && (e.isActive !== false || e.id === bisher),
  );
  if (arbeitsort && !angebot.some((e) => e.id === arbeitsort.id)) {
    angebot.unshift({ id: arbeitsort.id, name: arbeitsort.name });
  }

  // Ersatzziel des Fokus, wenn „Ändern…“ nach dem Neuladen verschwunden ist.
  const titelId = `arbeitsort-${onboardingId}-titel`;

  return (
    <div data-feld="arbeitsort">
      <div className="flex items-baseline justify-between gap-3 py-1.5">
        <span id={titelId} tabIndex={-1} className="shrink-0 text-xs text-muted-foreground outline-none">
          Arbeitsort
        </span>
        <span className="flex flex-wrap items-baseline justify-end gap-2 text-right">
          <span className="text-sm font-medium text-foreground">
            {arbeitsort ? arbeitsort.name : WIE_EINRICHTUNG}
          </span>
          {aenderbar && (
            <button type="button" onClick={oeffnen} className={KNOPF_ZEILE}>
              Ändern…
            </button>
          )}
        </span>
      </div>
      <p role="status" className="text-right text-xs text-muted-foreground">
        {meldung}
      </p>

      {offen && (
        <DialogRahmen
          name="arbeitsort-aendern"
          titel="Arbeitsort ändern"
          untertitel={`Einrichtung: ${einrichtungsText(einrichtung)}`}
          sendet={sendet}
          fehler={fehler}
          fokusZiel={titelId}
          onAbbrechen={schliessen}
          bestaetigen={{
            text: "Speichern",
            onClick: speichern,
            grund: auswahl === bisher ? MELDUNGEN.ARBEITSORT_UNVERAENDERT : null,
            farbe: "gruen",
          }}
        >
          <p className="text-foreground">
            Nach dem Arbeitsort richten sich die Aufgaben für Abteilungen (Hausmeister, IT,
            Verwaltung) und die Auswahl „Ausstattung &amp; Zugänge“ im Formular der Führungskraft.
            Zugriff, Vorgangsnummer und Unterlagen bleiben bei der Einrichtung.
          </p>
          <div className="space-y-1.5">
            <label htmlFor={`arbeitsort-${onboardingId}`} className="block text-sm font-medium text-foreground">
              Arbeitsort
            </label>
            <select
              id={`arbeitsort-${onboardingId}`}
              value={auswahl}
              onChange={(e) => setAuswahl(e.target.value)}
              disabled={sendet}
              aria-describedby={`arbeitsort-${onboardingId}-hinweis`}
              className={EINGABE}
            >
              <option value="">{WIE_EINRICHTUNG}</option>
              {angebot.map((e) => (
                <option key={e.id} value={e.id}>
                  {einrichtungsText(e)}
                </option>
              ))}
            </select>
            <p id={`arbeitsort-${onboardingId}-hinweis`} className="text-xs text-muted-foreground">
              Änderbar, bis der Link zu den Einstellungsmodalitäten erzeugt ist.
            </p>
          </div>
        </DialogRahmen>
      )}
    </div>
  );
}
