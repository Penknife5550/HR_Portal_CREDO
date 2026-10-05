"use client";

/**
 * Musterseite, die Reiter: vier Bereiche eines Vorgangs mit je eigenem Inhalt —
 * zwei mit Zaehler, einer davon leer („E-Mails 0").
 *
 * Der Baustein ist gesteuert: Den gewaehlten Reiter fuehrt die Seite (hier ein
 * Zustand, auf der Seite eines Vorgangs spaeter die Adresse). Die Zeile
 * „Gewählt: …" darunter folgt dem Wechsel, damit sich das von Hand pruefen
 * laesst — mit Maus und mit den Pfeiltasten.
 *
 * Die Inhalte bringen ihre Flaeche selbst mit (`Gruppe`); das Inhaltsfeld der
 * Reiter hat keine.
 */
import { useState } from "react";
import { Mail } from "lucide-react";
import { Gruppe, Zeile } from "@/components/ui/gruppe";
import { Leerzustand } from "@/components/ui/leerzustand";
import { Reiter, ReiterInhalt, type ReiterEintrag } from "@/components/ui/reiter";

type Bereich = "uebersicht" | "vertragsdaten" | "dokumente" | "e-mails";

const BEREICHE: ReiterEintrag<Bereich>[] = [
  { wert: "uebersicht", text: "Übersicht" },
  { wert: "vertragsdaten", text: "Vertragsdaten" },
  { wert: "dokumente", text: "Dokumente", zahl: 1 },
  { wert: "e-mails", text: "E-Mails", zahl: 0 },
];

export function ReiterMuster() {
  const [bereich, setBereich] = useState<Bereich>("uebersicht");
  const gewaehlt = BEREICHE.find((b) => b.wert === bereich)!;

  return (
    <div className="space-y-3">
      <Reiter label="Bereiche des Vorgangs" wert={bereich} onWechsel={setBereich} reiter={BEREICHE}>
        <ReiterInhalt wert="uebersicht">
          <Gruppe titel="Person und Vertrag">
            <Zeile label="Name">Maria Muster</Zeile>
            <Zeile label="Einrichtung">Berufskolleg</Zeile>
            <Zeile label="Vertragsende">31.07.2027</Zeile>
          </Gruppe>
        </ReiterInhalt>
        <ReiterInhalt wert="vertragsdaten">
          <Gruppe titel="Angaben der Führungskraft">
            <Zeile label="Verlängerung bis">31.07.2028</Zeile>
            <Zeile label="Umfang">25,5 Stunden</Zeile>
            <Zeile label="Befristungsgrund" />
          </Gruppe>
        </ReiterInhalt>
        <ReiterInhalt wert="dokumente">
          <Gruppe titel="Dokumente des Vorgangs">
            <Zeile>
              <span className="block font-semibold">Verlängerungsvertrag</span>
              <span className="block text-xs text-ink-2">erstellt am 12.05.2027 · noch nicht unterschrieben zurück</span>
            </Zeile>
          </Gruppe>
        </ReiterInhalt>
        <ReiterInhalt wert="e-mails">
          <Gruppe titel="E-Mails des Vorgangs">
            <Leerzustand symbol={Mail} titel="Noch keine E-Mails">
              Sobald das Portal zu diesem Vorgang eine E-Mail versendet, steht sie hier.
            </Leerzustand>
          </Gruppe>
        </ReiterInhalt>
      </Reiter>
      <p className="px-1 text-xs text-ink-2" aria-live="polite">
        Gewählt: {gewaehlt.text}
      </p>
    </div>
  );
}
