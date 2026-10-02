"use client";

/**
 * Musterseite, die Teile mit Zustand — Kopf mit Menue, Segment-Schalter,
 * Dialoge, Meldungen, Ladezustand (die Seite selbst ist eine
 * Server-Komponente).
 *
 * Die Aktionen sind gespielt: Ein Zeitgeber ersetzt den Server, damit sich
 * „gesperrt, waehrend die Aktion laeuft" und „Fehler bleibt im Dialog" von Hand
 * pruefen lassen (Escape, Tab, Fokus zurueck).
 */
import { vorgangslistePfad } from "@/lib/adressen";
import { useRef, useState } from "react";
import { Download, History, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BestaetigungsDialog, Dialog } from "@/components/ui/dialog";
import { Gruppe, Zeile } from "@/components/ui/gruppe";
import { Segment } from "@/components/ui/segment";
import { Seitenkopf, SEITENTITEL_ID } from "@/components/ui/seitenkopf";
import { Skelett } from "@/components/ui/skelett";
import { Statuspille } from "@/components/ui/statuspille";
import { toast } from "@/components/ui/toast";

type Offen = null | "rueckfrage" | "kritisch" | "formular";

const SERVER_MS = 1500;

export function DialogMuster() {
  const [offen, setOffen] = useState<Offen>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [grund, setGrund] = useState("");
  const versuche = useRef(0);

  const schliessen = () => {
    setOffen(null);
    setFehler(null);
    setGrund("");
  };

  /** Spielt den Server: `scheitertZuerst` liefert beim ersten Versuch einen Fehler. */
  const ausfuehren = (meldung: string, scheitertZuerst = false) => {
    setLaeuft(true);
    setFehler(null);
    window.setTimeout(() => {
      setLaeuft(false);
      versuche.current += 1;
      if (scheitertZuerst && versuche.current % 2 === 1) {
        setFehler("Der Vorgang wurde inzwischen von jemand anderem geändert. Bitte erneut versuchen.");
        return;
      }
      schliessen();
      toast.ok(meldung, { rueckgaengig: () => toast.hinweis("Rückgängig gemacht.") });
    }, SERVER_MS);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setOffen("rueckfrage")}>Rückfrage</Button>
        <Button onClick={() => setOffen("kritisch")}>Kritische Rückfrage</Button>
        <Button onClick={() => setOffen("formular")}>Dialog mit Feld</Button>
      </div>

      <BestaetigungsDialog
        offen={offen === "rueckfrage"}
        onAbbrechen={schliessen}
        onBestaetigen={() => ausfuehren("Erinnerung gesendet.")}
        titel="Erinnerung senden?"
        bestaetigenText="Erinnerung senden"
        laeuftText="Wird gesendet …"
        gesperrt={laeuft}
        fehler={fehler}
      >
        Die Führungskraft bekommt eine E-Mail mit dem Link zu den Einstellungsmodalitäten.
      </BestaetigungsDialog>

      <BestaetigungsDialog
        offen={offen === "kritisch"}
        onAbbrechen={schliessen}
        onBestaetigen={() => ausfuehren("Vorgang storniert.", true)}
        titel="Vorgang stornieren?"
        bestaetigenText="Stornieren"
        laeuftText="Wird storniert …"
        variante="critical"
        gesperrt={laeuft}
        fehler={fehler}
      >
        Alle verschickten Links werden ungültig. Das lässt sich nicht zurücknehmen. (Der erste Versuch scheitert hier
        zur Probe.)
      </BestaetigungsDialog>

      <Dialog
        offen={offen === "formular"}
        onSchliessen={schliessen}
        titel="Unterlage zurückweisen"
        beschreibung="Meldebescheinigung"
        gesperrt={laeuft}
        fehler={fehler}
        bestaetigen={{
          text: "Zurückweisen",
          laeuftText: "Wird gesendet …",
          onClick: () => ausfuehren("Unterlage zurückgewiesen."),
          sperrGrund: grund.trim() ? null : "Bitte eine Begründung eintragen.",
        }}
      >
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-ink-2">Begründung</span>
          <textarea
            data-autofokus
            rows={3}
            value={grund}
            onChange={(e) => setGrund(e.target.value)}
            className="block w-full rounded-lg border border-hairline bg-card px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          />
        </label>
      </Dialog>
    </>
  );
}

export function ToastMuster() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={() => toast.ok("Änderung gespeichert.")}>Erfolg</Button>
      <Button
        onClick={() =>
          toast.ok("Aufgabe als erledigt markiert.", { rueckgaengig: () => toast.hinweis("Aufgabe wieder offen.") })
        }
      >
        Erfolg mit „Rückgängig“
      </Button>
      <Button onClick={() => toast.fehler("Speichern fehlgeschlagen. Bitte erneut versuchen.")}>Fehler</Button>
      <Button onClick={() => toast.hinweis("Die Liste wurde aktualisiert.")}>Hinweis</Button>
    </div>
  );
}

/**
 * Der Kopf der Musterseite IST das Muster des Seitenkopfs: Pfad, Titel,
 * Unterzeile, Zustand, ein Primaerknopf und das „…"-Menue. Der Menuepunkt
 * „Rückfrage aus dem Menü …" zeigt, dass der Fokus nach dem Schliessen auf dem
 * „…"-Knopf landet.
 */
export function MusterKopf() {
  const [rueckfrage, setRueckfrage] = useState(false);

  return (
    <>
      <Seitenkopf
        pfad={[{ text: "Verwaltung", href: "/einstellungen" }, { text: "Oberfläche" }, { text: "UI-Muster" }]}
        titel="UI-Muster"
        unterzeile="Bausteine der neuen Oberfläche („Klarer Weg“) · wächst mit jedem Baustein · Regeln und Stand in docs/module/ux-ui/"
        status={<Statuspille ton="info">U0 in Arbeit</Statuspille>}
        aktion={
          <Button variante="primary" onClick={() => toast.hinweis("Der Primärknopf des Seitenkopfs.")}>
            Primäraktion
          </Button>
        }
        menue={[
          { text: "Verlauf anzeigen", symbol: History, onWaehlen: () => toast.hinweis("Verlauf gewählt.") },
          { text: "Zur Startseite", href: vorgangslistePfad() },
          { text: "Als PDF exportieren", symbol: Download, gesperrt: true },
          { text: "Rückfrage aus dem Menü …", symbol: XCircle, kritisch: true, onWaehlen: () => setRueckfrage(true) },
        ]}
      />
      <BestaetigungsDialog
        offen={rueckfrage}
        onAbbrechen={() => setRueckfrage(false)}
        onBestaetigen={() => {
          setRueckfrage(false);
          toast.ok("Bestätigt.");
        }}
        titel="Aus dem Menü geöffnet"
        bestaetigenText="Bestätigen"
        variante="critical"
        fokusZiel={SEITENTITEL_ID}
      >
        Nach dem Schließen liegt der Fokus wieder auf dem „…“-Knopf.
      </BestaetigungsDialog>
    </>
  );
}

type Sicht = "alle" | "kritisch" | "hr" | "andere";

const SICHTEN: { wert: Sicht; text: string; zahl: number }[] = [
  { wert: "alle", text: "Alle", zahl: 24 },
  { wert: "kritisch", text: "Kritisch", zahl: 3 },
  { wert: "hr", text: "Bei HR", zahl: 9 },
  { wert: "andere", text: "Bei anderen", zahl: 12 },
];

export function SegmentMuster() {
  const [sicht, setSicht] = useState<Sicht>("alle");
  const [art, setArt] = useState<"alle" | "mails" | "probleme">("alle");
  const gewaehlt = SICHTEN.find((s) => s.wert === sicht)!;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Segment label="Sicht" wert={sicht} onWechsel={setSicht} optionen={SICHTEN} />
        <span className="text-xs text-ink-2" aria-live="polite">
          {gewaehlt.zahl} Vorgänge in „{gewaehlt.text}“
        </span>
      </div>
      <Segment
        label="Art der Einträge"
        wert={art}
        onWechsel={setArt}
        optionen={[
          { wert: "alle", text: "Alle" },
          { wert: "mails", text: "E-Mails" },
          { wert: "probleme", text: "Probleme" },
        ]}
      />
    </div>
  );
}

/**
 * Skelett und Inhalt im Wechsel: Der Knopf schaltet um, damit sich pruefen
 * laesst, dass beim Eintreffen der Daten nichts springt.
 */
export function LadeMuster() {
  const [laedt, setLaedt] = useState(true);

  return (
    <div className="space-y-3">
      <Button groesse="sm" aria-pressed={laedt} onClick={() => setLaedt((l) => !l)}>
        {laedt ? "Inhalt zeigen" : "Ladezustand zeigen"}
      </Button>
      <div className="grid items-start gap-8 lg:grid-cols-2">
        {laedt ? (
          <Skelett art="liste" zeilen={3} label="Vorgänge werden geladen" />
        ) : (
          <Gruppe aria-label="Vorgänge">
            {[
              ["Muster, Maria", "Onboarding · Berufskolleg", "Wartet"],
              ["Beispiel, Jonas", "Vertragsende · Gesamtschule", "Wartet"],
              ["Probe, Lea", "Verbeamtung · Gymnasium", "Wartet"],
            ].map(([name, unterzeile, zustand]) => (
              <Zeile key={name} className="flex items-center justify-between gap-4">
                <span>
                  <span className="block font-semibold">{name}</span>
                  <span className="block text-xs text-ink-2">{unterzeile}</span>
                </span>
                <Statuspille ton="wait">{zustand}</Statuspille>
              </Zeile>
            ))}
          </Gruppe>
        )}
        {laedt ? (
          <Skelett art="gruppe" zeilen={3} label="Vertragsdaten werden geladen" />
        ) : (
          <Gruppe aria-label="Vertragsdaten">
            <Zeile label="Einrichtung">Berufskolleg</Zeile>
            <Zeile label="Vertragsbeginn">01.02.2027</Zeile>
            <Zeile label="Umfang">25,5 Stunden</Zeile>
          </Gruppe>
        )}
      </div>
    </div>
  );
}
