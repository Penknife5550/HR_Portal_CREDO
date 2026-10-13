"use client";

/**
 * Rueckfrage „Vorgang abschließen?“ im Onboarding (Ausstattung & Zugaenge,
 * Paket A3, S19, E-A19) — ersetzt das `window.confirm` der Detailseite
 * (src/app/(portal)/dashboard/[id]/detail-content.tsx).
 *
 * Zwei Schritte, die Liste kommt vom Server:
 *   1. „Vorgang abschließen“ schickt `{ status: "COMPLETED" }`.
 *   2. Sind noch Ausstattungs- oder Hinweis-Aufgaben offen, antwortet
 *      PATCH /api/onboarding/[id] mit 409 `{ error, grund: "AUSSTATTUNG_OFFEN",
 *      offen: [{ titel, stelle }] }` und hat NICHTS geaendert. Der Dialog
 *      bleibt offen, zeigt die Meldung des Servers und die Liste; erst
 *      „Trotzdem abschließen“ schickt `bestaetigt: true`.
 * Ohne offene Ausstattung schliesst schon der erste Klick ab — wie bisher,
 * nur mit eigenem Dialog statt `confirm()`.
 *
 * Wie im Hausmuster (dialog-rahmen.tsx) ruft der Dialog selbst keine
 * Schnittstelle: Den Aufruf baut `abschlussSenden` (exportiert, getestet), die
 * Seite haelt den Zustand und gibt Liste und Fehler zurueck. Portal: Texte
 * ohne Anrede; nur Farb-Tokens (neue Datei, Stand 0 in der Sperrklinke).
 */

import { DialogRahmen } from "@/components/unterlagen/dialog-rahmen";
import { ABSCHLUSS_AUSSTATTUNG_OFFEN, AUSSTATTUNG_KATEGORIE, type AbschlussOffeneAufgabe } from "@/lib/ausstattung";

/** Alle Texte des Dialogs (Tests lesen von hier). */
export const ABSCHLUSS_TEXTE = {
  titel: "Vorgang abschließen?",
  satz: "Der Vorgang wird als abgeschlossen markiert. Das lässt sich nicht rückgängig machen; die Links der Stellen sind danach nur noch lesbar.",
  offenTitel: (anzahl: number) => `Noch offen aus „${AUSSTATTUNG_KATEGORIE}“ (${anzahl})`,
  abschliessen: "Vorgang abschließen",
  trotzdem: "Trotzdem abschließen",
  verbindung: "Verbindungsfehler. Bitte erneut versuchen.",
  fehlerAllgemein: "Der Vorgang konnte nicht abgeschlossen werden.",
} as const;

// =============================================
// Aufruf (PATCH /api/onboarding/[id])
// =============================================

/** Ergebnis eines Abschlussversuchs. */
export type AbschlussAusgang =
  | { art: "ok" }
  /** 409 AUSSTATTUNG_OFFEN: nichts geaendert, die Liste fuer die Rueckfrage. */
  | { art: "offen"; offen: AbschlussOffeneAufgabe[]; meldung: string }
  | { art: "fehler"; meldung: string };

function istOffeneAufgabe(wert: unknown): wert is AbschlussOffeneAufgabe {
  if (!wert || typeof wert !== "object") return false;
  const w = wert as Record<string, unknown>;
  return typeof w.titel === "string" && typeof w.stelle === "string";
}

/**
 * Schliesst den Vorgang ab — `bestaetigt` nur nach der Rueckfrage mit Liste.
 * Der Body traegt `bestaetigt` nur, wenn es gesetzt ist. Eine 409 ohne Liste
 * (etwa „erst als geprüft markieren“) ist ein gewoehnlicher Fehler mit dem
 * Text des Servers; nie ein erfundener Ersatztext, solange einer kommt.
 */
export async function abschlussSenden(onboardingId: string, bestaetigt: boolean): Promise<AbschlussAusgang> {
  let res: Response;
  try {
    res = await fetch(`/api/onboarding/${onboardingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bestaetigt ? { status: "COMPLETED", bestaetigt: true } : { status: "COMPLETED" }),
    });
  } catch {
    return { art: "fehler", meldung: ABSCHLUSS_TEXTE.verbindung };
  }
  if (res.ok) return { art: "ok" };
  const daten = (await res.json().catch(() => null)) as { error?: unknown; grund?: unknown; offen?: unknown } | null;
  const meldung =
    typeof daten?.error === "string" && daten.error.trim() ? daten.error : ABSCHLUSS_TEXTE.fehlerAllgemein;
  if (res.status === 409 && daten?.grund === ABSCHLUSS_AUSSTATTUNG_OFFEN && Array.isArray(daten.offen)) {
    const offen = daten.offen.filter(istOffeneAufgabe);
    if (offen.length > 0) return { art: "offen", offen, meldung };
  }
  return { art: "fehler", meldung };
}

// =============================================
// Dialog
// =============================================

export interface AbschlussDialogProps {
  /**
   * `null`: noch nicht gefragt (erster Schritt). Sonst die offenen Aufgaben
   * aus der 409 — dann heisst der Knopf „Trotzdem abschließen“ und schickt
   * `bestaetigt: true`.
   */
  offen: ReadonlyArray<AbschlussOffeneAufgabe> | null;
  /** Meldung des Servers (bei der 409 mit Liste: warum die Rueckfrage kommt). */
  fehler: string | null;
  /** Laeuft der Aufruf? Dann gesperrt, Escape wirkungslos. */
  sendet: boolean;
  /** Kleine Zeile unter dem Titel, z. B. Vorgangsnummer und Name. */
  untertitel?: string | null;
  onAbbrechen: () => void;
  onAbschliessen: (bestaetigt: boolean) => void;
}

export function AbschlussDialog({ offen, fehler, sendet, untertitel, onAbbrechen, onAbschliessen }: AbschlussDialogProps) {
  const mitListe = !!offen && offen.length > 0;
  return (
    <DialogRahmen
      name="abschluss"
      titel={ABSCHLUSS_TEXTE.titel}
      untertitel={untertitel}
      sendet={sendet}
      fehler={fehler}
      onAbbrechen={onAbbrechen}
      bestaetigen={
        mitListe
          ? { text: ABSCHLUSS_TEXTE.trotzdem, onClick: () => onAbschliessen(true), farbe: "rot" }
          : { text: ABSCHLUSS_TEXTE.abschliessen, onClick: () => onAbschliessen(false), farbe: "gruen" }
      }
    >
      <p className="text-foreground">{ABSCHLUSS_TEXTE.satz}</p>
      {mitListe && (
        <div data-liste="abschluss-offen">
          <p className="mb-1 text-xs font-semibold text-muted-foreground">{ABSCHLUSS_TEXTE.offenTitel(offen.length)}</p>
          <ul className="list-disc space-y-0.5 pl-5 text-foreground">
            {offen.map((a, i) => (
              <li key={`${i}-${a.titel}`}>
                {a.titel}
                {a.stelle ? <span className="text-muted-foreground"> – {a.stelle}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </DialogRahmen>
  );
}
