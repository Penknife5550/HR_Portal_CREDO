"use client";

/**
 * Einstellungen → Automatische Läufe (Zeitplaner, src/lib/zeitplaner/).
 *
 * Eine Karte je Lauf: ein-/ausschalten, Uhrzeit, „nur Mo–Fr“, Probelauf,
 * „Bericht auch bei Erfolg“, „Jetzt ausführen“ / „Probelauf jetzt“ und das
 * Protokoll der letzten Läufe. Die Seite rechnet nichts selbst — naechster
 * Lauf, Waechter, erlaubte Aktionen und Texte kommen fertig vom Server
 * (uebersichtLaden). Client-Code importiert Werte nur aus reinen Dateien.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getEventDefinition } from "@/lib/events";
import { formatZeitpunktDE } from "@/lib/format";
import type { LaufZeile, ProtokollZeile, Uebersicht } from "@/lib/zeitplaner/dienst";

const inputClass =
  "rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring";

const ERGEBNIS_FARBE: Record<string, string> = {
  LAEUFT: "bg-blue-100 text-blue-800",
  OK: "bg-green-100 text-green-800",
  PROBLEME: "bg-amber-100 text-amber-800",
  FEHLER: "bg-red-100 text-red-800",
};

const BERICHT_TEXT: Record<string, string> = {
  SENT: "Bericht versendet",
  SKIPPED: "Bericht übersprungen (Vorlage aus oder kein Empfänger)",
  FAILED: "Bericht nicht zugestellt",
};

function zeitpunkt(iso: string | null): string {
  return formatZeitpunktDE(iso) || "—";
}

async function anfrage(url: string, init: RequestInit): Promise<{ ok: boolean; daten: Record<string, unknown> }> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const daten = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, daten };
}

export function AutomatischeLaeufeTab({ hervorheben }: { hervorheben?: string | null }) {
  const [uebersicht, setUebersicht] = useState<Uebersicht | null>(null);
  const [laden, setLaden] = useState(true);
  const [meldung, setMeldung] = useState<{ art: "ok" | "fehler"; text: string } | null>(null);
  const [beschaeftigt, setBeschaeftigt] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/automatische-laeufe", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setUebersicht((await res.json()) as Uebersicht);
    } catch {
      setMeldung({ art: "fehler", text: "Die automatischen Läufe konnten nicht geladen werden." });
    } finally {
      setLaden(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Solange ein Lauf arbeitet, alle 5 Sekunden nachladen.
  const irgendeinerLaeuft = uebersicht?.laeufe.some((l) => l.laeuft) ?? false;
  useEffect(() => {
    if (!irgendeinerLaeuft) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [irgendeinerLaeuft, load]);

  useEffect(() => {
    if (!meldung) return;
    const t = setTimeout(() => setMeldung(null), meldung.art === "ok" ? 5000 : 9000);
    return () => clearTimeout(t);
  }, [meldung]);

  async function aendern(lauf: LaufZeile, aenderung: Record<string, unknown>, bestaetigung?: string) {
    if (bestaetigung && !confirm(bestaetigung)) return;
    setBeschaeftigt(lauf.definition.schluessel);
    const { ok, daten } = await anfrage(`/api/settings/automatische-laeufe/${lauf.definition.schluessel}`, {
      method: "PATCH",
      body: JSON.stringify(aenderung),
    });
    setBeschaeftigt(null);
    if (!ok) {
      setMeldung({ art: "fehler", text: String(daten.error ?? "Speichern fehlgeschlagen.") });
    } else {
      const naechster = daten.naechsterLaufText ? ` Nächster Lauf: ${daten.naechsterLaufText}.` : "";
      setMeldung({ art: "ok", text: `„${lauf.definition.name}“ gespeichert.${naechster}` });
    }
    load();
  }

  async function starten(lauf: LaufZeile, probelauf: boolean) {
    const def = lauf.definition;
    const frage = probelauf
      ? `Probelauf „${def.name}“ jetzt ausführen? Es wird nichts versendet und nichts gelöscht.`
      : def.loescht
        ? `„${def.name}“ jetzt ausführen? Der Lauf LÖSCHT endgültig.`
        : `„${def.name}“ jetzt ausführen? Es gehen echte E-Mails hinaus.`;
    if (!confirm(frage)) return;
    setBeschaeftigt(def.schluessel);
    const { ok, daten } = await anfrage(`/api/settings/automatische-laeufe/${def.schluessel}/ausfuehren`, {
      method: "POST",
      body: JSON.stringify({ probelauf }),
    });
    setBeschaeftigt(null);
    setMeldung(
      ok
        ? { art: "ok", text: String(daten.meldung ?? "Gestartet.") }
        : { art: "fehler", text: String(daten.error ?? "Start fehlgeschlagen.") },
    );
    load();
  }

  if (laden) {
    return <div className="rounded-lg border bg-card px-5 py-8 text-center text-sm text-muted-foreground">Wird geladen…</div>;
  }
  if (!uebersicht) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
        {meldung?.text ?? "Die automatischen Läufe konnten nicht geladen werden."}
      </div>
    );
  }

  const ausgeblieben = uebersicht.laeufe.filter((l) => l.ausgeblieben);

  return (
    <div className="space-y-4">
      {meldung && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            meldung.art === "ok" ? "border-green-300 bg-green-50 text-green-800" : "border-red-300 bg-red-50 text-red-800"
          }`}
        >
          {meldung.text}
        </div>
      )}

      <div
        className={`rounded-lg border px-4 py-3 text-sm ${
          uebersicht.zeitplaner.uhrAktiv ? "border-green-300 bg-green-50 text-green-800" : "border-amber-300 bg-amber-50 text-amber-900"
        }`}
      >
        {uebersicht.zeitplaner.uhrAktiv ? (
          <>
            Zeitplaner aktiv — das Portal startet die eingeschalteten Läufe selbst (deutsche Zeit).
            {uebersicht.zeitplaner.letzterTakt && <> Letzter Takt: {zeitpunkt(uebersicht.zeitplaner.letzterTakt)}.</>}
          </>
        ) : (
          uebersicht.zeitplaner.hinweis
        )}
      </div>

      {ausgeblieben.length > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Ausgeblieben:</strong> {ausgeblieben.map((l) => `„${l.definition.name}“`).join(", ")} — eingeschaltet,
          aber der letzte Termin lief nicht. Läuft das Portal? Im Zweifel „Jetzt ausführen“.
        </div>
      )}

      <div className="rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
        Neue Läufe kommen <strong>ausgeschaltet</strong> an. Beim ersten Lauf nach dem Einschalten geht alles Fällige
        auf einmal hinaus — deshalb einzeln einschalten und vorher die Vorlagen prüfen (An-Feld, aktiv). Läufe, die
        löschen, lassen sich erst nach einem Probelauf scharf schalten. Einen Bericht per E-Mail gibt es bei Problemen,
        bei Probeläufen und wenn ein Lauf scheitert (Vorlage „Bericht eines automatischen Laufs“, Standard: das
        HR-Postfach aus den SMTP-Einstellungen).
      </div>

      {uebersicht.laeufe.map((lauf) => (
        <LaufKarte
          key={lauf.definition.schluessel}
          lauf={lauf}
          beschaeftigt={beschaeftigt === lauf.definition.schluessel}
          hervorgehoben={hervorheben === lauf.definition.schluessel}
          onAendern={aendern}
          onStarten={starten}
        />
      ))}
    </div>
  );
}

function LaufKarte({
  lauf,
  beschaeftigt,
  hervorgehoben,
  onAendern,
  onStarten,
}: {
  lauf: LaufZeile;
  beschaeftigt: boolean;
  hervorgehoben: boolean;
  onAendern: (lauf: LaufZeile, aenderung: Record<string, unknown>, bestaetigung?: string) => void;
  onStarten: (lauf: LaufZeile, probelauf: boolean) => void;
}) {
  const def = lauf.definition;
  const [uhrzeit, setUhrzeit] = useState(lauf.uhrzeit);
  const [offen, setOffen] = useState(hervorgehoben);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setUhrzeit(lauf.uhrzeit), [lauf.uhrzeit]);
  useEffect(() => {
    if (hervorgehoben) ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hervorgehoben]);

  const letzter = lauf.protokolle[0] ?? null;
  const gesperrt = beschaeftigt || lauf.laeuft;

  function umschalten() {
    if (lauf.aktiv) {
      onAendern(lauf, { aktiv: false });
      return;
    }
    const frage = def.loescht
      ? `„${def.name}“ einschalten${lauf.probelauf ? " (als Probelauf)" : ""}? ${
          lauf.probelauf ? "Er zeigt täglich, was er löschen würde." : "Er LÖSCHT ab dann täglich endgültig."
        }`
      : `„${def.name}“ einschalten? Beim ersten Lauf gehen alle fälligen Erinnerungen auf einmal hinaus.`;
    onAendern(lauf, { aktiv: true }, frage);
  }

  return (
    <div
      ref={ref}
      className={`overflow-hidden rounded-lg border bg-card ${lauf.ausgeblieben ? "border-red-300" : ""} ${
        hervorgehoben ? "ring-2 ring-primary" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{def.name}</h3>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                lauf.aktiv ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"
              }`}
            >
              {lauf.aktiv ? (lauf.probelauf ? "an · Probelauf" : "an") : "aus"}
            </span>
            {def.loescht && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">löscht endgültig</span>}
            {lauf.laeuft && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">läuft gerade…</span>}
            {lauf.ausgeblieben && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">ausgeblieben</span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{def.beschreibung}</p>
          {def.vorlagen.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Vorlagen: {def.vorlagen.map((v) => getEventDefinition(v)?.name ?? v).join(" · ")}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={umschalten}
          disabled={gesperrt}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
            lauf.aktiv
              ? "border border-input bg-background text-foreground hover:bg-accent"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          }`}
        >
          {lauf.aktiv ? "Ausschalten" : "Einschalten"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t bg-muted/30 px-5 py-3 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">Uhrzeit</span>
          <input
            type="time"
            value={uhrzeit}
            onChange={(e) => setUhrzeit(e.target.value)}
            onBlur={() => uhrzeit !== lauf.uhrzeit && /^\d{2}:\d{2}$/.test(uhrzeit) && onAendern(lauf, { uhrzeit })}
            disabled={gesperrt}
            className={inputClass}
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={lauf.nurWerktags}
            disabled={gesperrt}
            onChange={(e) => onAendern(lauf, { nurWerktags: e.target.checked })}
          />
          <span>nur Mo–Fr</span>
        </label>
        {def.kannProbelauf && (
          <label className="flex items-center gap-2" title="Geplante Läufe planen nur: nichts versenden, nichts löschen, nichts speichern.">
            <input
              type="checkbox"
              checked={lauf.probelauf}
              disabled={gesperrt}
              onChange={(e) => onAendern(lauf, { probelauf: e.target.checked })}
            />
            <span>als Probelauf</span>
          </label>
        )}
        {def.vorlagen.length > 0 && (
          <label className="flex items-center gap-2" title="Sonst kommt ein Bericht nur bei Problemen, Probeläufen und Fehlern.">
            <input
              type="checkbox"
              checked={lauf.berichtBeiErfolg}
              disabled={gesperrt}
              onChange={(e) => onAendern(lauf, { berichtBeiErfolg: e.target.checked })}
            />
            <span>Bericht auch, wenn Mails hinausgingen</span>
          </label>
        )}
        <span className="text-muted-foreground">
          Nächster Lauf: <strong className="text-foreground">{lauf.naechsterLaufText ?? "—"}</strong>
        </span>
      </div>

      {lauf.probelaufFehlt && (
        <div className="border-t bg-amber-50 px-5 py-2 text-xs text-amber-900">
          Dieser Lauf löscht endgültig. Scharf (einschalten, „als Probelauf“ abwählen, „Jetzt ausführen“) geht erst
          nach einem Probelauf — „Probelauf jetzt“ zeigt, was er löschen würde.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Letzter Lauf:</span>
          {letzter ? (
            <>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ERGEBNIS_FARBE[letzter.ergebnis] ?? ""}`}>
                {letzter.ergebnisText}
              </span>
              <span>
                {zeitpunkt(letzter.gestartetAm)} · {letzter.ausloeser}
                {letzter.probelauf ? " · Probelauf" : ""}
              </span>
            </>
          ) : (
            <span>noch nie</span>
          )}
          {lauf.protokolle.length > 0 && (
            <button type="button" onClick={() => setOffen(!offen)} className="text-primary underline hover:no-underline">
              {offen ? "Protokoll ausblenden" : `Protokoll (${lauf.protokolle.length})`}
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {def.kannProbelauf && (
            <button
              type="button"
              onClick={() => onStarten(lauf, true)}
              disabled={gesperrt}
              className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              Probelauf jetzt
            </button>
          )}
          <button
            type="button"
            onClick={() => onStarten(lauf, false)}
            disabled={gesperrt || lauf.probelaufFehlt}
            title={lauf.probelaufFehlt ? "Erst nach einem Probelauf möglich." : undefined}
            className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            Jetzt ausführen
          </button>
        </div>
      </div>

      {offen && lauf.protokolle.length > 0 && (
        <div className="divide-y border-t">
          {lauf.protokolle.map((p) => (
            <ProtokollEintrag key={p.id} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProtokollEintrag({ p }: { p: ProtokollZeile }) {
  return (
    <div className="px-5 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ERGEBNIS_FARBE[p.ergebnis] ?? ""}`}>{p.ergebnisText}</span>
        <span className="text-foreground">{zeitpunkt(p.gestartetAm)}</span>
        <span className="text-muted-foreground">
          · {p.ausloeser}
          {p.probelauf ? " · Probelauf" : ""}
          {p.berichtMail ? ` · ${BERICHT_TEXT[p.berichtMail] ?? p.berichtMail}` : ""}
          {p.fehler ? ` · Fehlerkennung ${p.fehler}` : ""}
        </span>
      </div>
      {p.zaehler.length > 0 && (
        <table className="mt-2 text-xs">
          <tbody>
            {p.zaehler.map(([bezeichnung, wert, rot], i) => (
              <tr key={i}>
                <td className="pr-4 text-muted-foreground">{bezeichnung}</td>
                <td className={`text-right font-medium ${rot ? "text-red-700" : "text-foreground"}`}>{wert}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {p.schritte.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
          {p.schritte.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
