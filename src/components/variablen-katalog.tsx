"use client";

/**
 * Variablen-Katalog: zeigt die fuer ein Modul verfuegbaren {platzhalter}
 * (gruppiert), klick-zum-Kopieren. Hilft beim Anlegen/Bearbeiten von Vorlagen,
 * die korrekten Variablen zu platzieren.
 *
 * Listen (A4, S33 — z.B. {#ausgaben_je_stelle}) stehen mit ihren inneren
 * Namen eingerueckt darunter: Die inneren Namen gelten nur zwischen
 * {#liste} und {/liste}, ein Leersatz steht zwischen {^liste} und {/liste}.
 */
import { useMemo, useState } from "react";
import {
  getPlaceholderCatalog,
  type ListenFeld,
  type PlaceholderDef,
} from "@/lib/placeholder-catalog";

const MODULE_LABEL: Record<string, string> = {
  ALLGEMEIN: "Allgemein",
  ONBOARDING: "Onboarding",
  OFFBOARDING: "Offboarding",
  VERBEAMTUNG: "Verbeamtung",
  MUTTERSCHUTZ: "Mutterschutz",
  ELTERNZEIT: "Elternzeit",
  BEM: "BEM",
  VERTRAGSVERLAENGERUNG: "Vertragsverlängerung",
};

export function VariablenKatalog({ modul }: { modul: string }) {
  const [copied, setCopied] = useState<string | null>(null);

  const groups = useMemo(() => {
    const defs = getPlaceholderCatalog(modul);
    const map = new Map<string, PlaceholderDef[]>();
    for (const d of defs) {
      const g = d.group || "Weitere";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(d);
    }
    return [...map.entries()];
  }, [modul]);

  async function copy(key: string, text = `{${key}}`) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard nicht verfuegbar — Variable bleibt sichtbar zum Abtippen.
    }
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1200);
  }

  /** Ein Knopf je Variable; `kopie` ist der Text in der Zwischenablage. */
  function knopf(key: string, label: string, opts: { kopie?: string; title?: string; sensibel?: boolean } = {}) {
    const anzeige = opts.kopie ?? `{${key}}`;
    return (
      <button
        key={key}
        type="button"
        onClick={() => copy(key, anzeige)}
        title={opts.title ?? label}
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors ${
          copied === key
            ? "border-credo-gruen/50 bg-credo-gruen/10 text-credo-gruen"
            : "border-border bg-background text-muted-foreground hover:bg-accent"
        }`}
      >
        <code className="font-mono text-foreground">{anzeige}</code>
        <span className="hidden sm:inline">{copied === key ? "kopiert" : label}</span>
        {opts.sensibel && (
          <span
            title="sensibel — wird beim Erzeugen entschluesselt und protokolliert"
            className="text-credo-rot"
            aria-label="sensibel"
          >
            &#9679;
          </span>
        )}
      </button>
    );
  }

  function felder(liste: ListenFeld[]) {
    return <div className="flex flex-wrap gap-1.5">{liste.map((f) => knopf(f.name, f.label))}</div>;
  }

  /** Eine Liste: Schleifenkopf, darunter eingerueckt ihre Felder und die Unterliste. */
  function listenEintrag(d: PlaceholderDef) {
    const liste = d.liste!;
    return (
      <div key={d.key} className="w-full rounded-md border border-border bg-background p-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {knopf(d.key, d.label, { kopie: `{#${d.key}}` })}
          <span className="text-[11px] text-muted-foreground">
            Liste: bis <code className="font-mono">{`{/${d.key}}`}</code>, leer:{" "}
            <code className="font-mono">{`{^${d.key}}…{/${d.key}}`}</code>
          </span>
        </div>
        <div className="mt-1.5 space-y-1.5 border-l border-border pl-3" role="group" aria-label={`Felder der Liste ${d.key}`}>
          {felder(liste.felder)}
          {liste.unterliste && (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {knopf(liste.unterliste.name, liste.unterliste.label, { kopie: `{#${liste.unterliste.name}}` })}
                <span className="text-[11px] text-muted-foreground">
                  bis <code className="font-mono">{`{/${liste.unterliste.name}}`}</code> (z. B. eine Tabellenzeile)
                </span>
              </div>
              <div className="border-l border-border pl-3" role="group" aria-label={`Felder der Liste ${liste.unterliste.name}`}>
                {felder(liste.unterliste.felder)}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const label = MODULE_LABEL[(modul ?? "").toUpperCase()] || modul;

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="mb-2 text-xs font-medium text-foreground">
        Verfuegbare Variablen — {label}
        <span className="ml-1 font-normal text-muted-foreground">
          (klicken zum Kopieren)
        </span>
      </p>
      <div className="space-y-2">
        {groups.map(([group, items]) => (
          <div key={group}>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {group}
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {items.map((d) =>
                d.liste
                  ? listenEintrag(d)
                  : knopf(d.key, d.label, {
                      title: d.example ? `${d.label} — z.B. ${d.example}` : d.label,
                      sensibel: d.sensitive,
                    }),
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
