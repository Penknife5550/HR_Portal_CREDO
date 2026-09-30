"use client";

/**
 * Reiter „E-Mails“ eines Vorgangs: welche Mails zu diesem Vorgang
 * hinausgingen (oder nicht) — aus dem Versandprotokoll (EmailLog), gefiltert
 * auf den Vorgang (vorgangTyp + vorgangId, src/lib/vorgangs-mails.ts).
 *
 * Modulneutral: Onboarding, Offboarding, Verbeamtung, Vertragsende, Elternzeit
 * und Mutterschutz binden dieselbe Komponente ein. Texte, Status und Namen
 * kommen fertig vom Server (GET /api/vorgaenge/[modul]/[id]/mails).
 */

import { useCallback, useEffect, useState } from "react";
import { formatZeitpunktDE } from "@/lib/format";
import type { VorgangsMailAntwort, VorgangsMailZeile } from "@/lib/vorgangs-mails";

const STATUS_FARBE: Record<string, string> = {
  SENT: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
  SKIPPED: "bg-amber-100 text-amber-800",
};


export function MailProtokoll({
  modul,
  vorgangId,
  /** Ohne eigenen Kasten, wenn die Seite keine Reiter hat und selbst einen Rahmen setzt. */
  eingebettet = false,
}: {
  modul: string;
  vorgangId: string;
  eingebettet?: boolean;
}) {
  const [daten, setDaten] = useState<VorgangsMailAntwort | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);
  const [filter, setFilter] = useState<"alle" | "probleme">("alle");

  const load = useCallback(async () => {
    setLaden(true);
    try {
      const res = await fetch(`/api/vorgaenge/${modul}/${vorgangId}/mails`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Das Mailprotokoll konnte nicht geladen werden.");
      setDaten(json as VorgangsMailAntwort);
      setFehler(null);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Das Mailprotokoll konnte nicht geladen werden.");
    } finally {
      setLaden(false);
    }
  }, [modul, vorgangId]);

  useEffect(() => {
    load();
  }, [load]);

  const zeilen = (daten?.eintraege ?? []).filter((z) => filter === "alle" || z.status !== "SENT");
  const probleme = (daten?.eintraege ?? []).filter((z) => z.status !== "SENT").length;

  return (
    <div className={eingebettet ? "space-y-3" : "space-y-3 rounded-lg border bg-card p-5"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">E-Mails zu diesem Vorgang</h3>
          <p className="text-xs text-muted-foreground">{daten?.hinweis ?? " "}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as "alle" | "probleme")}
            className="rounded-lg border border-input bg-background px-2 py-1 text-sm"
          >
            <option value="alle">Alle ({daten?.eintraege.length ?? 0})</option>
            <option value="probleme">Nicht zugestellt ({probleme})</option>
          </select>
          <button
            type="button"
            onClick={load}
            disabled={laden}
            className="rounded-lg border border-input bg-background px-3 py-1 text-sm hover:bg-accent disabled:opacity-50"
          >
            {laden ? "Lädt…" : "Aktualisieren"}
          </button>
        </div>
      </div>

      {fehler && <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{fehler}</div>}

      {!fehler && !laden && zeilen.length === 0 && (
        <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          {filter === "probleme" ? "Keine nicht zugestellten Mails." : "Zu diesem Vorgang ist noch keine E-Mail protokolliert."}
        </div>
      )}

      {zeilen.length > 0 && (
        <div className="divide-y rounded-lg border">
          {zeilen.map((z) => (
            <MailZeile key={z.id} z={z} />
          ))}
        </div>
      )}
    </div>
  );
}

function MailZeile({ z }: { z: VorgangsMailZeile }) {
  const [offen, setOffen] = useState(false);
  return (
    <div className="px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_FARBE[z.status] ?? "bg-muted"}`}>
          {z.statusText}
        </span>
        <span className="text-muted-foreground">{formatZeitpunktDE(z.zeitpunkt)}</span>
        <span className="font-medium text-foreground">{z.ereignisName}</span>
      </div>
      <div className="mt-1 grid gap-0.5 text-xs text-muted-foreground sm:grid-cols-[auto_1fr] sm:gap-x-3">
        {z.betreff && (
          <>
            <span>Betreff</span>
            <span className="text-foreground">{z.betreff}</span>
          </>
        )}
        {z.empfaenger && (
          <>
            <span>An</span>
            <span className="break-all text-foreground">{z.empfaenger}</span>
          </>
        )}
        {z.cc && (
          <>
            <span>CC</span>
            <span className="break-all">{z.cc}</span>
          </>
        )}
        {z.bcc && (
          <>
            <span>BCC</span>
            <span className="break-all">{z.bcc}</span>
          </>
        )}
        {z.grund && (
          <>
            <span>Grund</span>
            <span className={z.status === "FAILED" ? "text-red-700" : "text-amber-800"}>{z.grund}</span>
          </>
        )}
      </div>
      {z.anhang && (
        <button type="button" onClick={() => setOffen(!offen)} className="mt-1 text-xs text-primary underline hover:no-underline">
          {offen ? "Anhänge ausblenden" : "Anhänge anzeigen"}
        </button>
      )}
      {offen && z.anhang && <p className="mt-1 text-xs text-muted-foreground">{z.anhang}</p>}
    </div>
  );
}
