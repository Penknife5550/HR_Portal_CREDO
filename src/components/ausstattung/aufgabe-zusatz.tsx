/**
 * Ausstattung & Zugänge unter einem Checklistenpunkt im Portal (Feinplan S16,
 * Mockup 6.3) — die Bausteine, die der Reiter Checkliste
 * (src/app/(portal)/dashboard/[id]/detail-content.tsx, `TabChecklist`) nur
 * einbindet:
 *
 *   AufgabeZusatz   unter einer Aufgabe: „Entfällt“ (von HR gestrichen, F2),
 *                   „Eilt“ (Frist auf den Tag des Versands angehoben,
 *                   Regel 14) und die Bemerkung zur Position mit ihrer
 *                   Beschriftung nach Herkunft (Regel 8)
 *   EntfaelltHaken  der gesperrte Haken einer entfallenen Aufgabe — ein Klick
 *                   liefe sonst in die 409 `AUFGABE_ENTFAELLT` des Portal-PATCH
 *
 * Die Bemerkung sehen im Portal nur HR_EDIT_ROLES (Regel 16): Sie kommt aus
 * der Uebersicht (`bemerkungJeAufgabe`), die nur diese Rollen bekommen; ohne
 * sie gibt der Aufrufer `null` — dann steht hier keine. „Eilt“ und „Entfällt“
 * stehen am Checklistenpunkt selbst und sind kein Freitext.
 *
 * Nur Farb-Tokens und lucide-react (neue Datei, Stand 0 in der Sperrklinke).
 * Die Kennzeichen und der Bemerkungskasten sind dieselben wie auf der
 * Link-Seite der Stelle (link-seite-teile.tsx) — eine Optik fuer dieselbe
 * Aussage.
 */

import { Minus } from "lucide-react";
import {
  BemerkungKasten,
  EiltKennzeichen,
  EntfaelltKennzeichen,
} from "@/components/ausstattung/link-seite-teile";

export const ZUSATZ_TEXTE = {
  /** Erklaerung unter einer entfallenen Aufgabe (statt „erledigt von …“). */
  entfaellt: "Von der Personalabteilung gestrichen – entfällt für die zuständige Stelle.",
  /** Name des gesperrten Hakens fuer Screenreader. */
  haken: "Entfällt – kann nicht abgehakt werden",
} as const;

/** Was der Zusatz von einem Checklistenpunkt braucht (`ChecklistItemData` der Detailroute). */
export interface ZusatzAufgabe {
  isCompleted: boolean;
  eilt?: boolean | null;
  entfaelltAm?: string | null;
}

/** Ist die Aufgabe von HR gestrichen (F2)? Dieselbe Frage wie `aufgabenStatus` — nur am Checklistenpunkt. */
export function istEntfallen(item: { entfaelltAm?: string | Date | null }): boolean {
  return item.entfaelltAm != null;
}

/**
 * „Entfällt“, „Eilt“ und die Bemerkung unter einem Checklistenpunkt.
 * „Eilt“ nur an einer offenen Aufgabe (eine erledigte eilt nicht mehr).
 * Nichts davon → nichts.
 */
export function AufgabeZusatz({
  item,
  bemerkung,
}: {
  item: ZusatzAufgabe;
  /** Bemerkung zur Position (nur HR, aus `bemerkungJeAufgabe`); `null` = keine bzw. kein Recht. */
  bemerkung?: { text: string; label: string } | null;
}) {
  const entfaellt = istEntfallen(item);
  const eilt = !entfaellt && !item.isCompleted && item.eilt === true;
  const mitBemerkung = !!bemerkung && bemerkung.text.trim() !== "";
  if (!entfaellt && !eilt && !mitBemerkung) return null;

  return (
    <div className="mt-2 space-y-2" data-zusatz="ausstattung">
      {(entfaellt || eilt) && (
        <div className="flex flex-wrap items-center gap-2">
          {entfaellt && <EntfaelltKennzeichen />}
          {eilt && <EiltKennzeichen />}
          {entfaellt && <span className="text-xs text-muted-foreground">{ZUSATZ_TEXTE.entfaellt}</span>}
        </div>
      )}
      {mitBemerkung && <BemerkungKasten bemerkung={bemerkung} />}
    </div>
  );
}

/**
 * Der Haken einer entfallenen Aufgabe: sichtbar (die Zeile bleibt stehen),
 * aber gesperrt. Ein „wieder öffnen“ gibt es nur ueber die Karte (Position
 * wieder aufnehmen bzw. Option wieder waehlen, F23).
 */
export function EntfaelltHaken() {
  return (
    <button
      type="button"
      disabled
      aria-label={ZUSATZ_TEXTE.haken}
      title={ZUSATZ_TEXTE.haken}
      data-haken="entfaellt"
      className="mt-0.5 flex h-5 w-5 shrink-0 cursor-not-allowed items-center justify-center rounded-md border-2 border-border bg-muted"
    >
      <Minus className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}
