/**
 * Einstellungsmodalitäten, Zusammenfassung vor dem Absenden: die Karte
 * „5. Ausstattung & Zugänge“ (Paket A2, Feinplan S9, Mockup 6.2).
 *
 * Kurzform je Stelle („Dienst-iPad · Zugänge (3)“), die Bemerkungen nur
 * gezählt — ihr Text steht im Schritt davor. Gerechnet wird in
 * `formularKurzform` (src/lib/ausstattung.ts) aus der gespeicherten Wahl; die
 * Karte zeichnet nur. Dazu der Satz, dass Änderungen nach dem Absenden an die
 * Personalabteilung gehen (E-A26).
 *
 * Optik der übrigen Karten der Zusammenfassung (src/app/modalitaeten/[token]/
 * page.tsx), nur mit Farb-Tokens (neue Datei, Stand 0 in der Sperrklinke).
 */

import { formularKurzform, type FuehrungskraftSicht } from "@/lib/ausstattung";
import { SUP_SCHRITT_AUSSTATTUNG } from "@/lib/validations/supervisor-data";

export const KEINE_AUSWAHL = "Keine Auswahl";

export function AusstattungZusammenfassung({
  nummer,
  sicht,
}: {
  /** Laufende Nummer der Karte in der Zusammenfassung (Position des Schritts). */
  nummer: number;
  sicht: FuehrungskraftSicht | null;
}) {
  const kurz = sicht ? formularKurzform(sicht) : { stellen: [], bemerkungen: 0 };
  return (
    <div className="rounded-lg border border-border" data-zusammenfassung="ausstattung">
      <div className="border-b bg-muted/50 px-4 py-2">
        <h3 className="text-sm font-semibold">
          {nummer}. {SUP_SCHRITT_AUSSTATTUNG.title}
        </h3>
      </div>
      <div className="space-y-1 px-4 py-3 text-xs">
        {kurz.stellen.length === 0 ? (
          <p className="text-muted-foreground">{KEINE_AUSWAHL}</p>
        ) : (
          kurz.stellen.map((stelle) => (
            <div key={stelle.departmentKey} className="flex justify-between gap-4" data-stelle={stelle.departmentKey}>
              <span className="shrink-0 text-muted-foreground">{stelle.stelleName}</span>
              <span className="max-w-[62%] text-right font-medium">{stelle.text}</span>
            </div>
          ))
        )}
        {kurz.bemerkungen > 0 && (
          <div className="flex justify-between gap-4" data-zeile="bemerkungen">
            <span className="text-muted-foreground">Bemerkungen</span>
            <span className="font-medium">{kurz.bemerkungen}</span>
          </div>
        )}
        {sicht && <p className="pt-1 text-muted-foreground">{sicht.aenderungenHinweis}</p>}
      </div>
    </div>
  );
}
