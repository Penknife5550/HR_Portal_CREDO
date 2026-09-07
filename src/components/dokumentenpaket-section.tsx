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
import { FileTextIcon } from "lucide-react";
import { DokumentenpaketDialog } from "@/components/dokumentenpaket-dialog";
/**
 * Der Typ kommt direkt aus der importfreien Typdatei, nicht mehr ueber den
 * Dialog: Ein Umweg ueber eine Komponente laesst den Typ mit ihr wandern —
 * wird der Dialog umbenannt oder geteilt, haengt die Karte an der falschen
 * Datei. `PaketAngebotJson` und nicht `PaketAngebot`, weil die Karte das
 * Angebot hinter JSON.parse sieht: `createdAt` und `altversand.am` sind dort
 * Strings, deshalb weiter unten `new Date(...)`.
 */
import type { PaketAngebotJson } from "@/lib/types/dokumentenpaket";

export function DokumentenpaketSection({
  modul,
  refId,
  canEdit,
  titel = "Dokumente versenden",
  beschreibung = "Feste PDFs und befüllte Vorlagen gehen als Anhänge an die im Vorgang hinterlegte Adresse. Das Standardpaket wird unter Mandanten → Einrichtung → Standardpaket gepflegt.",
  offen: offenExtern,
  onOffenChange,
  onVersendet,
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
  /**
   * Wird nach einem angenommenen Versand gerufen — auch dann, wenn das Ergebnis
   * Warnungen traegt. Die Mail ist in dem Fall raus, nur der Nachweis fehlt;
   * die Nachbarkarten muessen trotzdem neu fragen, statt einen Stand von vor
   * dem Versand weiterzuzeigen. Die Karte laedt ihr eigenes Angebot ohnehin
   * nach; dieser Rueckruf ist fuer alles daneben.
   */
  onVersendet?: () => void;
}) {
  const [angebot, setAngebot] = useState<PaketAngebotJson | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState("");
  const [offenIntern, setOffenIntern] = useState(false);
  /**
   * Nach einem Versand mit gescheitertem Nachweis kennt der Server keinen
   * Verlauf — die Mail ist trotzdem raus. Die Nachweis-Transaktion legt
   * DokumentenVersand, GeneratedDocument UND den Zeitstempel im Vorgang
   * gemeinsam an; scheitert sie, ist alles zurueckgerollt, waehrend das
   * Ergebnis SENT bleibt (siehe src/lib/dokumentenpaket.ts). Der anschliessende
   * laedt()-Lauf brachte dann weder Verlauf noch Altversand, und die Karte
   * stuende wieder auf "Noch nicht versendet". Der naechste Griff waere der
   * zweite Versand desselben Pakets — genau das verhindert dieser Merker.
   *
   * Bewusst nur fuer die Dauer der Sitzung: Er ersetzt keinen Nachweis, er
   * verhindert nur eine Falschaussage der Anzeige bis zum Seitenwechsel.
   */
  const [versendetInDieserSitzung, setVersendetInDieserSitzung] = useState(false);
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
        // Das bisherige Angebot BEHALTEN. Wird es hier verworfen,
        // verschwindet der Dialog — und mit ihm die Ergebnisanzeige samt
        // der Warnung "Bitte den Versand NICHT wiederholen". Wer die nicht
        // mehr sieht, verschickt dasselbe Paket ein zweites Mal.
        setFehler(j.error || "Der Versand konnte nicht vorbereitet werden.");
      }
    } catch {
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
                  <FileTextIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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
                {letzter || angebot.altversand || versendetInDieserSitzung
                  ? "Erneut versenden…"
                  : "Dokumente versenden…"}
              </button>
            )}
            <span className="text-xs text-muted-foreground">
              {letzter
                ? `Zuletzt am ${new Date(letzter.createdAt).toLocaleString("de-DE")} an ${letzter.empfaenger}${
                    angebot.verlauf.length > 1 ? ` (${angebot.verlauf.length}×)` : ""
                  }`
                : angebot.altversand
                  ? // Vorgang aus der Zeit vor dem Nachweis: Zeitpunkt und Anzahl
                    // sind bekannt, Empfaenger und Dokumente nicht. Das steht so
                    // da, statt "Noch nicht versendet" zu behaupten — sonst ginge
                    // das Paket ein zweites Mal hinaus.
                    `Bereits versendet am ${new Date(angebot.altversand.am).toLocaleString("de-DE")}${
                      angebot.altversand.anzahl > 1 ? ` (${angebot.altversand.anzahl}×)` : ""
                    } — vor Einführung des Nachweises, ohne Angabe der Dokumente`
                  : versendetInDieserSitzung
                    ? // Versand angenommen, aber kein Verlauf zurueckgekommen:
                      // Die Mail ist raus, der Nachweis fehlt. "Noch nicht
                      // versendet" waere hier die gefaehrlichste aller
                      // Falschaussagen.
                      "Soeben versendet — der Nachweis konnte nicht gespeichert werden. Bitte die Warnung im Versanddialog und die Protokolle beachten."
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
          onVersendet={() => {
            // Erst das eigene Angebot (Verlauf, "Zuletzt am …"), dann die
            // Nachbarkarte: Der Versand hat dort je Vorlage ein Dokument mit
            // dem Etikett "per E-Mail versendet" angelegt.
            //
            // Bewusst OHNE Bedingung auf den Warnungsstand: Der Dialog meldet
            // unmittelbar nach res.ok — und gerade der Warnfall (Mail raus,
            // Nachweis gescheitert) ist der, in dem die Anzeige stimmen muss.
            laedt();
            setVersendetInDieserSitzung(true);
            onVersendet?.();
          }}
        />
      )}
    </div>
  );
}
