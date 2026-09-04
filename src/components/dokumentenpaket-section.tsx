"use client";

/**
 * Karte "Dokumente versenden" im Vorgang.
 *
 * Zeigt das hinterlegte Standardpaket, den bisherigen Versandverlauf und den
 * Knopf, der den Dialog oeffnet. Modulneutral — Phase 2 bindet dieselbe Karte
 * in Offboarding, Verbeamtung und Vertragsverlaengerung ein und aendert nur
 * Beschriftung und Modul.
 *
 * Loest StarterpaketVersandSection ab: Dort war der Knopf ein
 * Alles-oder-nichts-Versand ohne Rueckfrage.
 */

import { useCallback, useEffect, useState } from "react";
import { DokumentenpaketDialog, type PaketAngebot } from "@/components/dokumentenpaket-dialog";

export function DokumentenpaketSection({
  modul,
  refId,
  canEdit,
  titel = "Dokumente versenden",
  beschreibung = "Feste PDFs und befüllte Vorlagen gehen als Anhänge an die im Vorgang hinterlegte Adresse. Das Standardpaket wird unter Mandanten → Einrichtung → Standardpaket gepflegt.",
  offen: offenExtern,
  onOffenChange,
}: {
  modul: string;
  refId: string;
  canEdit: boolean;
  titel?: string;
  beschreibung?: string;
  /**
   * Offen-Zustand von aussen steuern — der Knopf im Abschluss-Schritt oeffnet
   * denselben Dialog. Ohne diese beiden Angaben verwaltet die Karte ihn selbst.
   */
  offen?: boolean;
  onOffenChange?: (offen: boolean) => void;
}) {
  const [angebot, setAngebot] = useState<PaketAngebot | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState("");
  const [offenIntern, setOffenIntern] = useState(false);
  const offen = offenExtern ?? offenIntern;
  const setOffen = (wert: boolean) => {
    setOffenIntern(wert);
    onOffenChange?.(wert);
  };

  const laedt = useCallback(async () => {
    setLaden(true);
    try {
      const res = await fetch(
        `/api/dokumentenpaket?modul=${encodeURIComponent(modul)}&refId=${encodeURIComponent(refId)}`,
      );
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setAngebot(j.data);
        setFehler("");
      } else {
        setAngebot(null);
        setFehler(j.error || "Der Versand konnte nicht vorbereitet werden.");
      }
    } catch {
      setAngebot(null);
      setFehler("Verbindungsfehler.");
    } finally {
      setLaden(false);
    }
  }, [modul, refId]);

  useEffect(() => {
    laedt();
  }, [laedt]);

  const standard = (angebot?.standardpaket ?? [])
    .map((s) => angebot?.verfuegbar.find((p) => p.art === s.art && p.id === s.id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  const letzter = angebot?.verlauf[0];

  return (
    <div className="rounded-2xl border-2 border-credo-blau/30 bg-credo-blau/5 p-5">
      <h3 className="mb-1 text-sm font-bold text-foreground">{titel}</h3>
      <p className="mb-3 text-xs text-muted-foreground">{beschreibung}</p>

      {fehler && (
        <div className="mb-3 rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-3 py-2 text-xs text-credo-rot">
          {fehler}
        </div>
      )}

      {laden ? (
        <p className="text-xs text-muted-foreground">Lade…</p>
      ) : angebot ? (
        <>
          {standard.length === 0 ? (
            <p className="mb-3 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
              Für diesen Mandanten ist kein Standardpaket hinterlegt. Im Dialog lässt sich trotzdem
              einzeln auswählen.
            </p>
          ) : (
            <ul className="mb-3 space-y-1 text-xs text-foreground">
              {standard.map((p) => (
                <li key={`${p.art}:${p.id}`} className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground">•</span>
                  {p.name}
                  {p.art === "VORLAGE" && (
                    <span className="rounded-md bg-credo-gruen/10 px-1.5 py-0.5 text-[10px] font-medium text-credo-gruen">
                      Vorlage
                    </span>
                  )}
                  {p.sensibleFelder.length > 0 && (
                    <span className="rounded-md bg-credo-rot/10 px-1.5 py-0.5 text-[10px] font-medium text-credo-rot">
                      Bestätigung nötig
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {canEdit && (
              <button
                type="button"
                onClick={() => setOffen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-credo-blau px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-credo-blau/90"
              >
                {letzter ? "Erneut versenden…" : "Dokumente versenden…"}
              </button>
            )}
            <span className="text-xs text-muted-foreground">
              {letzter
                ? `Zuletzt am ${new Date(letzter.createdAt).toLocaleString("de-DE")} an ${letzter.empfaenger}${
                    angebot.verlauf.length > 1 ? ` (${angebot.verlauf.length}×)` : ""
                  }`
                : "Noch nicht versendet"}
            </span>
          </div>
        </>
      ) : null}

      {offen && angebot && (
        <DokumentenpaketDialog
          angebot={angebot}
          modul={modul}
          refId={refId}
          titel={titel}
          onClose={() => setOffen(false)}
          onVersendet={laedt}
        />
      )}
    </div>
  );
}
