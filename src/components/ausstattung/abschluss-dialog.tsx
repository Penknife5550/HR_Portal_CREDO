"use client";

/**
 * Rueckfrage „Vorgang abschließen?“ — im Onboarding (Ausstattung & Zugaenge,
 * Paket A3, S19, E-A19) und seit A4 (S32, G18, E-A33) auch im Offboarding.
 * Ersetzt das `window.confirm` beider Detailseiten.
 *
 * Zwei Schritte, die Liste kommt vom Server:
 *   1. „Vorgang abschließen“ schickt `{ status: "COMPLETED" }`.
 *   2. Ist noch etwas offen, antwortet der PATCH mit 409 `{ error, grund,
 *      offen: [{ titel, stelle }] }` und hat NICHTS geaendert – Onboarding
 *      `grund: "AUSSTATTUNG_OFFEN"` (Ausstattungs- und Hinweis-Aufgaben),
 *      Offboarding `grund: "RUECKGABEN_OFFEN"` (Rueckgaben, Sperr- und
 *      Folgeaufgaben, Stueck fuer Stueck). Der Dialog bleibt offen, zeigt die
 *      Meldung des Servers und die Liste; erst „Trotzdem abschließen“ schickt
 *      `bestaetigt: true`.
 * Ohne offene Stuecke schliesst schon der erste Klick ab.
 *
 * Verallgemeinert (S32): Texte (`texte`) und Absender (`abschlussSendenAn`:
 * Adresse und Grund der Rueckfrage) sind Eigenschaften; die Vorgaben sind die
 * des Onboardings und unveraendert. Das Offboarding nimmt
 * `AUSTRITT_ABSCHLUSS_TEXTE` und `austrittAbschlussSenden`, dazu eine
 * Hinweiszeile (`hinweis`), wenn das unterschriebene Rueckgabeprotokoll fehlt
 * (G19, ohne Sperre). Eine 409 `INZWISCHEN_GEAENDERT` (Status zwischen Lesen
 * und Sperre bewegt) traegt ihren `grund` hinaus, damit die Seite neu laedt.
 *
 * Wie im Hausmuster (dialog-rahmen.tsx) ruft der Dialog selbst keine
 * Schnittstelle: Den Aufruf baut `abschlussSenden` bzw. `austrittAbschlussSenden`
 * (exportiert, getestet), die Seite haelt den Zustand und gibt Liste und Fehler
 * zurueck. Portal: Texte ohne Anrede; nur Farb-Tokens (neue Datei, Stand 0 in
 * der Sperrklinke).
 */

import { FileWarning } from "lucide-react";
import { DialogRahmen } from "@/components/unterlagen/dialog-rahmen";
import { ABSCHLUSS_AUSSTATTUNG_OFFEN, AUSSTATTUNG_KATEGORIE, type AbschlussOffeneAufgabe } from "@/lib/ausstattung";

/** Die Texte des Dialogs. */
export interface AbschlussTexte {
  titel: string;
  satz: string;
  offenTitel: (anzahl: number) => string;
  abschliessen: string;
  trotzdem: string;
  verbindung: string;
  fehlerAllgemein: string;
}

/** Alle Texte des Dialogs im Onboarding — die Vorgabe (Tests lesen von hier). */
export const ABSCHLUSS_TEXTE = {
  titel: "Vorgang abschließen?",
  satz: "Der Vorgang wird als abgeschlossen markiert. Das lässt sich nicht rückgängig machen; die Links der Stellen sind danach nur noch lesbar.",
  offenTitel: (anzahl: number) => `Noch offen aus „${AUSSTATTUNG_KATEGORIE}“ (${anzahl})`,
  abschliessen: "Vorgang abschließen",
  trotzdem: "Trotzdem abschließen",
  verbindung: "Verbindungsfehler. Bitte erneut versuchen.",
  fehlerAllgemein: "Der Vorgang konnte nicht abgeschlossen werden.",
} as const satisfies AbschlussTexte;

/** Die Texte im Offboarding (S32, G18): offen sind dort Rueckgaben, Sperr- und Folgeaufgaben. */
export const AUSTRITT_ABSCHLUSS_TEXTE = {
  titel: "Austritt abschließen?",
  satz: "Der Austritt wird als abgeschlossen markiert. Das lässt sich nicht rückgängig machen; die Links der Stellen sind danach nur noch lesbar. Eine späte Rückgabe lässt sich weiter im Reiter „Rückgaben“ vermerken.",
  offenTitel: (anzahl: number) => `Noch offen: Rückgaben und Sperren (${anzahl})`,
  abschliessen: "Austritt abschließen",
  trotzdem: "Trotzdem abschließen",
  verbindung: "Verbindungsfehler. Bitte erneut versuchen.",
  fehlerAllgemein: "Der Austritt konnte nicht abgeschlossen werden.",
} as const satisfies AbschlussTexte;

/** `grund` der 409 mit Liste im Offboarding (PATCH /api/offboarding/[id], G18). */
export const ABSCHLUSS_RUECKGABEN_OFFEN = "RUECKGABEN_OFFEN";

// =============================================
// Aufruf (PATCH /api/onboarding/[id] bzw. /api/offboarding/[id])
// =============================================

/** Ergebnis eines Abschlussversuchs. */
export type AbschlussAusgang =
  | { art: "ok" }
  /** 409 mit Liste: nichts geaendert, die Liste fuer die Rueckfrage. */
  | { art: "offen"; offen: AbschlussOffeneAufgabe[]; meldung: string }
  /** `grund` des Servers, wenn er einen schickt (etwa INZWISCHEN_GEAENDERT – dann neu laden). */
  | { art: "fehler"; meldung: string; grund?: string };

function istOffeneAufgabe(wert: unknown): wert is AbschlussOffeneAufgabe {
  if (!wert || typeof wert !== "object") return false;
  const w = wert as Record<string, unknown>;
  return typeof w.titel === "string" && typeof w.stelle === "string";
}

/**
 * Schliesst einen Vorgang ab — `bestaetigt` nur nach der Rueckfrage mit Liste.
 * `url` ist die PATCH-Adresse des Vorgangs, `grundOffen` der `grund` der 409
 * mit Liste. Der Body traegt `bestaetigt` nur, wenn es gesetzt ist. Eine 409
 * ohne Liste (etwa „erst als geprüft markieren“) ist ein gewoehnlicher Fehler
 * mit dem Text des Servers; nie ein erfundener Ersatztext, solange einer kommt.
 */
export async function abschlussSendenAn(
  url: string,
  bestaetigt: boolean,
  opts: { grundOffen: string; texte?: Pick<AbschlussTexte, "verbindung" | "fehlerAllgemein"> },
): Promise<AbschlussAusgang> {
  const texte = opts.texte ?? ABSCHLUSS_TEXTE;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bestaetigt ? { status: "COMPLETED", bestaetigt: true } : { status: "COMPLETED" }),
    });
  } catch {
    return { art: "fehler", meldung: texte.verbindung };
  }
  if (res.ok) return { art: "ok" };
  const daten = (await res.json().catch(() => null)) as { error?: unknown; grund?: unknown; offen?: unknown } | null;
  const meldung = typeof daten?.error === "string" && daten.error.trim() ? daten.error : texte.fehlerAllgemein;
  if (res.status === 409 && daten?.grund === opts.grundOffen && Array.isArray(daten.offen)) {
    const offen = daten.offen.filter(istOffeneAufgabe);
    if (offen.length > 0) return { art: "offen", offen, meldung };
  }
  // Ein anderer `grund` geht mit hinaus (INZWISCHEN_GEAENDERT → die Seite laedt
  // neu); die Rueckfrage ohne Liste ist nur ein Fehler mit dem Text des Servers.
  return typeof daten?.grund === "string" && daten.grund.trim() && daten.grund !== opts.grundOffen
    ? { art: "fehler", meldung, grund: daten.grund }
    : { art: "fehler", meldung };
}

/** Onboarding: PATCH /api/onboarding/[id], 409 AUSSTATTUNG_OFFEN (unveraendert seit A3). */
export async function abschlussSenden(onboardingId: string, bestaetigt: boolean): Promise<AbschlussAusgang> {
  return abschlussSendenAn(`/api/onboarding/${onboardingId}`, bestaetigt, { grundOffen: ABSCHLUSS_AUSSTATTUNG_OFFEN });
}

/** Offboarding (S32, G18): PATCH /api/offboarding/[id], 409 RUECKGABEN_OFFEN. */
export async function austrittAbschlussSenden(offboardingId: string, bestaetigt: boolean): Promise<AbschlussAusgang> {
  return abschlussSendenAn(`/api/offboarding/${encodeURIComponent(offboardingId)}`, bestaetigt, {
    grundOffen: ABSCHLUSS_RUECKGABEN_OFFEN,
    texte: AUSTRITT_ABSCHLUSS_TEXTE,
  });
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
  /** Texte des Moduls; ohne die des Onboardings. */
  texte?: AbschlussTexte;
  /**
   * Hinweiszeile ohne Sperre, etwa „Unterschriebenes Rückgabeprotokoll: fehlt“
   * (Offboarding, G19). Ohne Text keine Zeile.
   */
  hinweis?: string | null;
  /**
   * Id eines Elements fuer den Fokus, wenn der Ausloeser beim Schliessen fehlt
   * (`DialogRahmen`). Im Offboarding oeffnet der Dialog aus dem Status-Menue,
   * das im selben Rendern zugeht – ohne Ersatzziel laege der Fokus danach auf
   * `body`, und Tab begaenne oben auf der Seite.
   */
  fokusZiel?: string;
  onAbbrechen: () => void;
  onAbschliessen: (bestaetigt: boolean) => void;
}

export function AbschlussDialog({
  offen,
  fehler,
  sendet,
  untertitel,
  texte = ABSCHLUSS_TEXTE,
  hinweis,
  fokusZiel,
  onAbbrechen,
  onAbschliessen,
}: AbschlussDialogProps) {
  const mitListe = !!offen && offen.length > 0;
  const hinweisText = hinweis?.trim() || null;
  return (
    <DialogRahmen
      name="abschluss"
      titel={texte.titel}
      untertitel={untertitel}
      sendet={sendet}
      fehler={fehler}
      fokusZiel={fokusZiel}
      onAbbrechen={onAbbrechen}
      bestaetigen={
        mitListe
          ? { text: texte.trotzdem, onClick: () => onAbschliessen(true), farbe: "rot" }
          : { text: texte.abschliessen, onClick: () => onAbschliessen(false), farbe: "gruen" }
      }
    >
      <p className="text-foreground">{texte.satz}</p>
      {hinweisText && (
        <p
          className="flex items-start gap-2 rounded-lg border border-credo-gelb/50 bg-credo-gelb/10 px-3 py-2 text-foreground"
          data-hinweis="abschluss"
        >
          <FileWarning className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{hinweisText}</span>
        </p>
      )}
      {mitListe && (
        <div data-liste="abschluss-offen">
          <p className="mb-1 text-xs font-semibold text-muted-foreground">{texte.offenTitel(offen.length)}</p>
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
