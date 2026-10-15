"use client";

/**
 * Reiter „Rückgaben“ des Offboardings — seit Ausstattung & Zugaenge Stufe 2
 * (Feinplan A4, S32, Mockup 6.8) nur noch die Einbindung:
 *
 *   - mit `rueckgaben` (nur HR_EDIT_ROLES, G23) die Karte
 *     src/components/ausgaben/rueckgaben-karte.tsx: Einstellung zuordnen,
 *     Vorschlag aus der Einstellung, Zustaende, Hinweise, Protokoll;
 *   - ohne (Einrichtungsleitung, Fuehrungskraft) die bisherige Liste nur
 *     lesend (`RueckgabenListe`) – schreiben duerfen ohnehin nur HR_EDIT_ROLES.
 *
 * Markup und Regeln stehen dort, nicht hier (Sperrklinke: neue Oberflaeche nur
 * unter src/components/ausgaben/; der UX-Umbau verschiebt spaeter nur die
 * Einbindung).
 */

import {
  RueckgabenKarte,
  RueckgabenListe,
  type KartenMeldung,
  type RueckgabenAufruf,
  type RueckgabenAusgang,
} from "@/components/ausgaben/rueckgaben-karte";
import type { RueckgabenUebersicht } from "@/lib/offboarding-ausgaben";
import type { ReturnItemData } from "../types";

export function TabReturns({
  returnItems,
  rueckgaben,
  canEdit,
  abgebrochen = false,
  onAufruf,
  onZuordnen,
  meldung,
  onMeldung,
}: {
  returnItems: ReturnItemData[];
  /** Feld `rueckgaben` der Detailroute; `null`/fehlend = Liste nur lesend. */
  rueckgaben?: RueckgabenUebersicht | null;
  /** Schreiben nur mit HR_EDIT_ROLES (so pruefen es die Routen). */
  canEdit: boolean;
  /** Austritt abgebrochen (CANCELLED): nichts mehr erfassen. */
  abgebrochen?: boolean;
  /** Sendet einen Aufruf der Karte und laedt danach neu. */
  onAufruf?: (aufruf: RueckgabenAufruf) => Promise<RueckgabenAusgang>;
  /** Oeffnet den Dialog „Einstellung zuordnen …“ der Seite. */
  onZuordnen?: () => void;
  meldung?: KartenMeldung | null;
  onMeldung?: (meldung: KartenMeldung | null) => void;
}) {
  if (!rueckgaben) return <RueckgabenListe returnItems={returnItems} />;
  return (
    <RueckgabenKarte
      rueckgaben={rueckgaben}
      darfBearbeiten={canEdit}
      abgebrochen={abgebrochen}
      onAufruf={onAufruf}
      onZuordnen={onZuordnen}
      meldung={meldung}
      onMeldung={onMeldung}
    />
  );
}
