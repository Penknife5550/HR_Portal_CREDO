"use client";

/**
 * Vorschau-Schalter der Vertragsende-Detailseite (UX-Umbau, Pilot, Feinplan 3.8)
 *
 * Eine schmale Zeile ueber dem Inhalt, in BEIDEN Ansichten:
 *   alt – „Neue Ansicht ausprobieren"
 *   neu – „Zur bisherigen Ansicht" und „Rückmeldung geben" (`mailto:`, F5 —
 *         kein neuer Versandweg)
 *
 * Regeln:
 *   - Die Zeile entscheidet nichts: Welche Ansicht gilt, liest die Seite auf
 *     dem Server aus dem Cookie (`page.tsx`). Hier wird der Cookie nur
 *     gesetzt bzw. geloescht — Name und Zeile kommen aus `src/lib/ansicht.ts`,
 *     der EINEN Stelle dafuer.
 *   - Umschalten laedt die Seite ganz neu (`seiteNeuLaden`), mit Pfad und
 *     Suche (`?tab=` bleibt). Ein Wechsel im Client liefe am Server vorbei,
 *     und der liest den Cookie.
 *   - `Secure` nur auf https: Ohne TLS — etwa beim Zugriff ueber eine LAN-IP
 *     oder einen Hostnamen ohne Zertifikat — verwirft der Browser einen
 *     Secure-Cookie, und der Schalter taete nichts. (`http://localhost` waere
 *     kein Grund: Chrome und Firefox nehmen ihn dort an.)
 *   - „Rückmeldung geben" ist ein `Textverweis` (extern, `mailto:`), kein Knopf.
 *   - Ein Bereich mit Namen (`aside`), damit die Zeile nicht ausserhalb jeder
 *     Landmarke steht. Ohne Anrede, ohne Ueberschrift — die `h1` gehoert dem
 *     Seitenkopf darunter.
 *   - Breite wie der Inhalt darunter: die alte Ansicht ist `max-w-5xl`, die
 *     neue `max-w-6xl` (U1-F1).
 *
 * Entfaellt nach dem Pilot mit Cookie und alter Ansicht in einem Commit.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textverweis } from "@/components/ui/textverweis";
import { ansichtCookieZeile, ansichtRueckmeldungLink, type Ansicht } from "@/lib/ansicht";
import { seiteNeuLaden } from "@/lib/seite-laden";
import { cn } from "@/lib/utils";

const BREITE: Record<Ansicht, string> = {
  alt: "max-w-5xl",
  neu: "max-w-6xl",
};

export function AnsichtSchalter({ ansicht }: { ansicht: Ansicht }) {
  const [wechselt, setWechselt] = useState(false);
  const ziel: Ansicht = ansicht === "neu" ? "alt" : "neu";

  function wechseln() {
    if (wechselt) return;
    setWechselt(true);
    document.cookie = ansichtCookieZeile(ziel, window.location.protocol === "https:");
    seiteNeuLaden(window.location.pathname + window.location.search);
  }

  return (
    <aside aria-label="Ansicht dieser Seite" className="border-b border-hairline bg-card">
      <div
        className={cn(
          "mx-auto flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm text-ink-2 sm:px-6",
          BREITE[ansicht],
        )}
      >
        <p>{ansicht === "neu" ? "Neue Ansicht (Vorschau)." : "Für diese Seite gibt es eine neue Ansicht."}</p>
        <Button variante="secondary" groesse="sm" laedt={wechselt} onClick={wechseln}>
          {wechselt
            ? "Ansicht wird gewechselt …"
            : ansicht === "neu"
              ? "Zur bisherigen Ansicht"
              : "Neue Ansicht ausprobieren"}
        </Button>
        {ansicht === "neu" && <Textverweis href={ansichtRueckmeldungLink()}>Rückmeldung geben</Textverweis>}
      </div>
    </aside>
  );
}
