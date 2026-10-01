"use client";

/**
 * Musterseite, Teil „Dialoge und Meldungen" — die Bausteine mit Zustand
 * (die Seite selbst ist eine Server-Komponente).
 *
 * Die Aktionen sind gespielt: Ein Zeitgeber ersetzt den Server, damit sich
 * „gesperrt, waehrend die Aktion laeuft" und „Fehler bleibt im Dialog" von Hand
 * pruefen lassen (Escape, Tab, Fokus zurueck).
 */
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { BestaetigungsDialog, Dialog } from "@/components/ui/dialog";
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
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-ink-2">Begründung</span>
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
