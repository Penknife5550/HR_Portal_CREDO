"use client";

/**
 * Musterseite, die Hinweise: je Ton ein Beispiel aus dem Vertragsende, dazu
 * einer, der erst nach einer Aktion erscheint und deshalb angesagt wird
 * (`ansagen`, nur bei `critical`).
 *
 * Die Hinweise stehen direkt auf dem Seitengrund, nicht in einer Gruppe — sie
 * sind selbst eine Flaeche. Ihre Titel sind `h3`, weil der Abschnitt der
 * Musterseite schon eine `h2` traegt.
 */
import { useState } from "react";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hinweis } from "@/components/ui/hinweis";

export function HinweisMuster() {
  const [gescheitert, setGescheitert] = useState(false);

  return (
    <div className="space-y-3">
      <Hinweis ton="critical" ebene={3} titel="Vertragsende seit 3 Tagen überschritten">
        Der Vertrag ist am 03.10.2026 ausgelaufen, der Vorgang ist aber noch offen.
      </Hinweis>
      <Hinweis ton="wait" ebene={3} titel="Hinweis zur Befristung (§ 14 TzBfG)">
        Die Person war schon zweimal befristet beschäftigt. Vor einer weiteren Befristung die Rechtslage prüfen.
      </Hinweis>
      <Hinweis
        ton="info"
        ebene={3}
        symbol={Users}
        titel="Person hat weitere Einstellungen"
        aktion={<Button groesse="sm">Einstellungen ansehen</Button>}
      >
        Zwei weitere Verträge an anderen Einrichtungen.
      </Hinweis>

      <div className="space-y-3 rounded-xl bg-card px-4 py-3 ring-1 ring-hairline">
        <p className="text-sm text-ink-2">
          Ein Hinweis, der erst nach einer Aktion erscheint, wird sofort angesagt. Was beim Öffnen der Seite schon
          dasteht, nicht.
        </p>
        {gescheitert ? (
          <Hinweis
            ton="critical"
            ansagen
            ebene={3}
            titel="Speichern fehlgeschlagen"
            aktion={
              <Button groesse="sm" onClick={() => setGescheitert(false)}>
                Erneut versuchen
              </Button>
            }
          >
            Die Verbindung zum Server ist abgebrochen. Die Eingaben sind noch da.
          </Hinweis>
        ) : (
          <Button groesse="sm" onClick={() => setGescheitert(true)}>
            Speichern versuchen
          </Button>
        )}
      </div>
    </div>
  );
}
