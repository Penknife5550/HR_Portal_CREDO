/**
 * Neue Detailseite Vertragsende: Reiter „Vertragsdaten" (UX-Umbau, Pilot)
 *
 * Die Vertragsdaten der Verlaengerung, wie die Fuehrungskraft sie im Formular
 * erfasst — dieselben Felder wie die alte Ansicht, dazu der Befristungsgrund.
 * Nur Lesen.
 */
import { FileText } from "lucide-react";
import { Gruppe, Zeile } from "@/components/ui/gruppe";
import { Leerzustand } from "@/components/ui/leerzustand";
import { Statuspille } from "@/components/ui/statuspille";
import { formatDatumDE } from "@/lib/format";
import { FELD_BEZEICHNUNGEN } from "@/lib/formular-fehler";
import { FreitextZeile } from "./reiter-uebersicht";
import type { Vertragsdaten } from "./typen";

const ZAHL = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });

const zahl = (wert: number | null) => (wert == null ? "" : ZAHL.format(wert));

/**
 * Noch nichts erfasst — dieselbe Bedingung wie die alte Ansicht: Die Anfrage
 * an die Fuehrungskraft legt einen leeren Datensatz an, er zaehlt erst mit
 * Inhalt.
 */
function leer(daten: Vertragsdaten): boolean {
  return !daten.isComplete && !daten.vertragsbeginn && !daten.entgeltgruppe;
}

export function ReiterVertragsdaten({ daten }: { daten: Vertragsdaten | null }) {
  const titel = "Vertragsdaten der Verlängerung";

  if (!daten || leer(daten)) {
    return (
      <Gruppe titel={titel}>
        <Leerzustand symbol={FileText} titel="Noch keine Vertragsdaten">
          Sie entstehen, sobald die Führungskraft das Formular abgesendet hat.
        </Leerzustand>
      </Gruppe>
    );
  }

  return (
    <Gruppe
      titel={titel}
      // Die Pille sagt den Stand der Daten; sie ist kein Knopf.
      aktion={daten.isComplete ? <Statuspille ton="ok">Abgesendet</Statuspille> : undefined}
    >
      <Zeile label="Vertragsbeginn (neu)">{formatDatumDE(daten.vertragsbeginn)}</Zeile>
      <Zeile label="Befristet">{daten.befristet == null ? "" : daten.befristet ? "Ja" : "Nein"}</Zeile>
      <Zeile label="Vertragsende (neu)">{formatDatumDE(daten.vertragsende)}</Zeile>
      <Zeile label="Befristungsgrund">{daten.befristungSachgrund ?? ""}</Zeile>
      <Zeile label="Wochenstunden">{zahl(daten.wochenstunden)}</Zeile>
      <Zeile label="Entgeltgruppe">{daten.entgeltgruppe ?? ""}</Zeile>
      <Zeile label="Stufe">{daten.stufe ?? ""}</Zeile>
      <Zeile label="Urlaubstage pro Jahr">{zahl(daten.urlaubstageProJahr)}</Zeile>
      {/* Die Auswahl im Formular kommt als Name; der Freitext nur bei Altbestand. */}
      <Zeile label="Betriebsstätte">{daten.betriebsstaetteName ?? daten.betriebsstaette ?? ""}</Zeile>
      <Zeile label={FELD_BEZEICHNUNGEN.stellenbeschreibung}>{daten.stellenbeschreibung ?? ""}</Zeile>
      <FreitextZeile label="Zusätzliche Vereinbarungen">{daten.zusatzvereinbarungen}</FreitextZeile>
    </Gruppe>
  );
}
