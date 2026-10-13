"use client";

/**
 * Ausstattung & Zugaenge (Paket A3, S19, E-A20): Block „Absage an die
 * Stellen“ in der Karte „Aufgaben für Abteilungen“
 * (src/components/abteilungsaufgaben/abteilungen-karte.tsx), nur im
 * Onboarding und nur, wenn der Server einen Stand liefert
 * (`AbteilungsUebersichtDaten.absage`: Vorgang EXPIRED, mindestens eine Stelle
 * informiert — `absageStand` in src/lib/abteilungsaufgaben.ts).
 *
 *   - Solange eine informierte Stelle noch keine Absage hat (`moeglich`) und
 *     die Rolle handeln darf: Knopf „Stellen über die Absage informieren…“.
 *     Er oeffnet eine Rueckfrage (DialogRahmen); erst „Absage senden“ ruft die
 *     Aktion `absage`. Nie automatisch (E-A20, wie „Nachtrag senden“).
 *   - Danach (alle haben sie): nur die Zeile „Absage … gesendet“.
 *   - Immer (A4, G10): der Satz, dass HR Ausgegebenes nach der Ruecknahme in
 *     der Karte vermerkt (‚zurückgenommen‘) — die Absage-Mail nennt die
 *     Ausgaben der Stelle, Aufgaben dafuer gibt es nicht.
 *
 * Der Block rechnet nichts: Stellen, Datum und Moeglichkeit kommen fertig vom
 * Server, das Ergebnis der Aktion zeigt die Karte in ihrer Meldungsleiste.
 * Portal: Texte ohne Anrede. Eigene Datei, nur Farb-Tokens (Sperrklinke: neue
 * Oberflaeche Stand 0, die Karte bindet nur ein).
 */

import { useState } from "react";
import { Ban } from "lucide-react";
import { DialogRahmen } from "@/components/unterlagen/dialog-rahmen";
import type { AbsageStand } from "@/lib/abteilungsaufgaben";
import { formatDatumDE } from "@/lib/format";

/** Alle Texte des Blocks und seiner Rueckfrage (Tests lesen von hier). */
export const ABSAGE_TEXTE = {
  titel: "Absage an die Stellen",
  satz:
    "Informierte Stellen erfahren von der Absage nur per Knopf: eine E-Mail ohne Link an die Adresse, an die sie informiert wurden – mit den Aufgaben, die sie schon erledigt haben, und dem, was sie laut Portal ausgegeben haben.",
  // A4 (G10): Die Absage nennt die Ausgaben, die Ruecknahme selbst vermerkt HR
  // in der Karte „Ausstattung & Zugänge“ (Aktion „Zurückgenommen…“) — neue
  // Aufgaben gibt es dafuer nicht, der Link antwortet 410.
  rueckbau: "Ausgegebenes vermerken Sie nach der Rücknahme in der Karte (‚zurückgenommen‘).",
  offen: (stellen: ReadonlyArray<string>) => `Noch ohne Absage: ${stellen.join(", ")}.`,
  zuletzt: (datum: string) => `Zuletzt gesendet am ${datum}.`,
  alleGesendet: (datum: string) =>
    datum
      ? `Absage an alle informierten Stellen gesendet (zuletzt am ${datum}).`
      : "Absage an alle informierten Stellen gesendet.",
  knopf: "Stellen über die Absage informieren…",
  dialogTitel: "Stellen über die Absage informieren?",
  dialogSatz:
    "Jede Stelle erhält eine E-Mail ohne Link an die Adresse, an die sie informiert wurde. Sie nennt die Aufgaben, die die Stelle schon erledigt hat, und was sie laut Portal ausgegeben hat, damit Zugänge gelöscht und Ausgegebenes zurückgenommen werden kann.",
  dialogEinmal: "Jede Stelle erhält die Absage nur einmal.",
  empfaenger: "Empfänger",
  senden: (anzahl: number) => (anzahl === 1 ? "Absage senden" : `${anzahl} Absagen senden`),
} as const;

export interface AbsageBlockProps {
  absage: AbsageStand;
  /** Darf die Rolle handeln (HR_EDIT_ROLES)? Sonst nur der Stand. */
  darfAktionen: boolean;
  /** Laeuft gerade die Absage? Dann „Wird gesendet…“ im Dialog. */
  sendet: boolean;
  /** Laeuft irgendeine Aktion der Karte? Dann ist der Knopf gesperrt. */
  gesperrt: boolean;
  /** Fuehrt die Aktion `absage` aus; der Dialog schliesst, wenn sie fertig ist. */
  onSenden: () => Promise<unknown> | void;
  /**
   * Id des Kartentitels (`tabIndex={-1}`): Ersatzziel des Fokus, wenn der
   * Knopf nach dem Senden verschwunden ist — nach der letzten Absage gibt es
   * ihn nicht mehr, der Fokus fiele sonst auf `body`.
   */
  fokusZiel?: string;
}

export function AbsageBlock({ absage, darfAktionen, sendet, gesperrt, onSenden, fokusZiel }: AbsageBlockProps) {
  const [dialogOffen, setDialogOffen] = useState(false);
  const datum = absage.gesendetAm ? formatDatumDE(absage.gesendetAm) : "";
  const zeigeKnopf = darfAktionen && absage.moeglich;

  const senden = async () => {
    try {
      await onSenden();
    } finally {
      setDialogOffen(false);
    }
  };

  return (
    <div
      className="mb-3 space-y-2 rounded-lg border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground"
      data-block="absage"
    >
      <p className="flex items-center gap-1.5 font-semibold text-foreground">
        <Ban className="h-3.5 w-3.5" aria-hidden="true" />
        {ABSAGE_TEXTE.titel}
      </p>
      {absage.moeglich ? (
        <>
          <p>{ABSAGE_TEXTE.satz}</p>
          <p className="text-foreground" data-zeile="absage-offen">
            {ABSAGE_TEXTE.offen(absage.stellen)}
            {datum ? ` ${ABSAGE_TEXTE.zuletzt(datum)}` : ""}
          </p>
        </>
      ) : (
        <p className="text-foreground" data-zeile="absage-gesendet">
          {ABSAGE_TEXTE.alleGesendet(datum)}
        </p>
      )}
      <p data-zeile="absage-rueckbau">{ABSAGE_TEXTE.rueckbau}</p>
      {zeigeKnopf && (
        <button
          type="button"
          onClick={() => setDialogOffen(true)}
          disabled={gesperrt}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sendet ? "Wird gesendet…" : ABSAGE_TEXTE.knopf}
        </button>
      )}
      {dialogOffen && zeigeKnopf && (
        <DialogRahmen
          name="absage"
          titel={ABSAGE_TEXTE.dialogTitel}
          sendet={sendet}
          fokusZiel={fokusZiel}
          onAbbrechen={() => setDialogOffen(false)}
          bestaetigen={{ text: ABSAGE_TEXTE.senden(absage.stellen.length), onClick: () => void senden(), farbe: "rot" }}
        >
          <p className="text-foreground">{ABSAGE_TEXTE.dialogSatz}</p>
          <div>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">{ABSAGE_TEXTE.empfaenger}</p>
            <ul className="list-disc space-y-0.5 pl-5 text-foreground" data-liste="absage-empfaenger">
              {absage.stellen.map((name, i) => (
                <li key={`${i}-${name}`}>{name}</li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">{ABSAGE_TEXTE.dialogEinmal}</p>
        </DialogRahmen>
      )}
    </div>
  );
}
