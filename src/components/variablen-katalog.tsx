"use client";

/**
 * Variablen-Katalog: zeigt die fuer ein Modul verfuegbaren {platzhalter}
 * (gruppiert), klick-zum-Kopieren. Hilft beim Anlegen/Bearbeiten von Vorlagen,
 * die korrekten Variablen zu platzieren.
 */
import { useMemo, useState } from "react";
import { getPlaceholderCatalog, type PlaceholderDef } from "@/lib/placeholder-catalog";

const MODULE_LABEL: Record<string, string> = {
  ALLGEMEIN: "Allgemein",
  ONBOARDING: "Onboarding",
  OFFBOARDING: "Offboarding",
  VERBEAMTUNG: "Verbeamtung",
  MUTTERSCHUTZ: "Mutterschutz",
  ELTERNZEIT: "Elternzeit",
  BEM: "BEM",
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

  async function copy(key: string) {
    try {
      await navigator.clipboard.writeText(`{${key}}`);
    } catch {
      // Clipboard nicht verfuegbar — Variable bleibt sichtbar zum Abtippen.
    }
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1200);
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
              {items.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => copy(d.key)}
                  title={d.example ? `${d.label} — z.B. ${d.example}` : d.label}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors ${
                    copied === d.key
                      ? "border-credo-gruen/50 bg-credo-gruen/10 text-credo-gruen"
                      : "border-border bg-background text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <code className="font-mono text-foreground">{`{${d.key}}`}</code>
                  <span className="hidden sm:inline">
                    {copied === d.key ? "kopiert" : d.label}
                  </span>
                  {d.sensitive && (
                    <span
                      title="sensibel — wird beim Erzeugen entschluesselt und protokolliert"
                      className="text-credo-rot"
                      aria-label="sensibel"
                    >
                      &#9679;
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
