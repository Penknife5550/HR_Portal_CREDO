"use client";

/**
 * Neue Detailseite Vertragsende: Reiter „Dokumente" (UX-Umbau, Pilot)
 *
 * Die BESTEHENDEN Karten, unveraendert eingebunden wie in der alten Ansicht —
 * Vorlagen erstellen, Dokumentenpaket versenden, individuelle E-Mail. Neu ist
 * nur der Leertext der Vorlagen-Karte (ohne Anrede, Feinplan 3.6). Die
 * Vorstand-Warnung steht nicht mehr hier, sondern als Hinweis ueber allen
 * Reitern. Die Karten tragen h3-Ueberschriften; eine h2 nur fuer Screenreader
 * davor haelt die Gliederung unter der h1 des Kopfs lueckenlos.
 */
import { useState } from "react";
import { DokumentenpaketSection } from "@/components/dokumentenpaket-section";
import { IndividuelleMailKarte } from "@/components/individuelle-mail/individuelle-mail-karte";
import { TemplateGenerationSection } from "@/components/template-generation-section";

export interface ReiterDokumenteProps {
  vorgangId: string;
  organizationId: string;
  darfBearbeiten: boolean;
}

export function ReiterDokumente({ vorgangId, organizationId, darfBearbeiten }: ReiterDokumenteProps) {
  // Ein Paketversand legt fuer jede mitgeschickte Vorlage ein Dokument an. Die
  // Erstellen- und die Versenden-Karte sind Geschwister und wissen nichts
  // voneinander — dieser Zaehler ist das Signal von der einen zur anderen.
  // Er darf mit dem Reiter verschwinden: Beim Zurueckwechseln laedt die
  // Vorlagen-Karte ohnehin neu.
  const [versandZaehler, setVersandZaehler] = useState(0);

  return (
    <div className="space-y-4">
      <h2 className="sr-only">Dokumente</h2>
      <TemplateGenerationSection
        modul="VERTRAGSVERLAENGERUNG"
        refId={vorgangId}
        organizationId={organizationId}
        canEdit={darfBearbeiten}
        emptyHint="Keine Vertragsvorlagen hinterlegt. Vorlagen entstehen unter „Brief-Vorlagen“ (Modul Vertragsverlängerung)."
        aktualisierung={versandZaehler}
      />
      <DokumentenpaketSection
        modul="VERTRAGSVERLAENGERUNG"
        refId={vorgangId}
        canEdit={darfBearbeiten}
        titel="Unterlagen zur Vertragsverlängerung versenden"
        beschreibung="Feste PDFs und befüllte Vorlagen gehen als Anhänge an die beschäftigte Person. Das Standardpaket wird unter Mandanten → Einrichtung → Dokumentenpakete gepflegt."
        onVersendet={() => setVersandZaehler((n) => n + 1)}
      />
      <IndividuelleMailKarte modul="VERTRAGSVERLAENGERUNG" refId={vorgangId} canEdit={darfBearbeiten} />
    </div>
  );
}
