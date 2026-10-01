"use client";

/**
 * Karte „Individuelle E-Mail“ im Reiter Dokumente (Paket 3).
 *
 * Sitzt in Onboarding, Offboarding, Verbeamtung und Vertragsverlaengerung
 * direkt unter der Karte „Dokumente versenden“. Die Paketkarte bleibt
 * unveraendert und zaehlt weiter nur Pakete — eine Rueckfrage-Mail darf das
 * Starterpaket nicht als „versendet“ markieren.
 *
 * Nur fuer HR_EDIT_ROLES (`canEdit`): Der Verlauf nennt Adressen und
 * Betreffzeilen, und die Route antwortet anderen Rollen ohnehin mit 403.
 * Rechnet nichts selbst — Texte und Grenzen kommen aus individuelle-mail.ts.
 */

import { useCallback, useEffect, useState } from "react";
import { MailIcon } from "lucide-react";
import { IndividuelleMailDialog } from "@/components/individuelle-mail/individuelle-mail-dialog";
import { kurzstand, type IndividuelleMailModul, type IndividuelleMailUebersicht } from "@/lib/individuelle-mail";

export function IndividuelleMailKarte({
  modul,
  refId,
  canEdit,
  onVersendet,
}: {
  modul: IndividuelleMailModul;
  refId: string;
  canEdit: boolean;
  /** Nach einem Versand, z.B. damit der Reiter „E-Mails“ neu laedt. */
  onVersendet?: () => void;
}) {
  const [uebersicht, setUebersicht] = useState<IndividuelleMailUebersicht | null>(null);
  const [fehler, setFehler] = useState("");
  const [offen, setOffen] = useState(false);

  const laden = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/individuelle-mail?modul=${encodeURIComponent(modul)}&refId=${encodeURIComponent(refId)}`,
        { cache: "no-store" },
      );
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setUebersicht(j.data as IndividuelleMailUebersicht);
        setFehler("");
      } else {
        setFehler(j.error || "Die E-Mails zu diesem Vorgang konnten nicht geladen werden.");
      }
    } catch {
      setFehler("Verbindungsfehler.");
    }
  }, [modul, refId]);

  useEffect(() => {
    if (canEdit) laden();
  }, [canEdit, laden]);

  if (!canEdit) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-foreground">
        <MailIcon className="h-4 w-4 text-muted-foreground" />
        Individuelle E-Mail
      </h3>
      <p className="mb-3 text-xs text-muted-foreground">
        Freie Nachricht mit eigenem Betreff und eigenen Anhängen, z. B. dem unterschriebenen Vertrag – unabhängig vom
        Standardpaket.
      </p>

      {fehler && (
        <div className="mb-3 rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-3 py-2 text-xs text-credo-rot">
          {fehler}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOffen(true)}
          disabled={!uebersicht}
          className="inline-flex items-center gap-2 rounded-lg border border-credo-blau/40 bg-background px-5 py-2 text-sm font-semibold text-credo-blau transition-colors hover:bg-credo-blau/5 disabled:opacity-50"
        >
          E-Mail schreiben…
        </button>
        <span className="text-xs text-muted-foreground">{uebersicht ? kurzstand(uebersicht.verlauf) : "Lade…"}</span>
      </div>

      {offen && uebersicht && (
        <IndividuelleMailDialog
          modul={modul}
          refId={refId}
          uebersicht={uebersicht}
          onClose={() => setOffen(false)}
          onVersendet={() => {
            laden();
            onVersendet?.();
          }}
        />
      )}
    </div>
  );
}
