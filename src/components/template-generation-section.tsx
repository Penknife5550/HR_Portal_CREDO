"use client";

/**
 * Generische "Dokumente erstellen"-Sektion fuer den Dokumente-Hub.
 *
 * Laedt die Vorlagen eines Moduls (GET /api/brief-vorlagen?modul=...) und
 * erzeugt daraus Word/PDF (POST /api/brief-vorlagen/[id]/generate mit refId).
 * Wird von Onboarding UND Vertragsende genutzt (spaeter auch Offboarding/
 * Verbeamtung, #13). Modul-spezifische Statik-Dokumente (z.B. das amtliche
 * Masernschutz-PDF im Onboarding) kommen ueber `staticDocuments` herein.
 */

import { useEffect, useState } from "react";

const ERZEUG_BTN =
  "rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50";

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 4H7a2 2 0 01-2-2V6a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z" />
    </svg>
  );
}

function DocErzeugZeile({
  name,
  tag,
  children,
}: {
  name: string;
  tag: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        <p className="text-[11px] text-muted-foreground">{tag}</p>
      </div>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}

interface VorlageItem {
  id: string;
  name: string;
  description: string | null;
}

/** Statisches Dokument (fester Link, keine Vorlage), z.B. amtliches PDF. */
export interface StaticDocument {
  name: string;
  tag: string;
  href: string;
  label: string;
}

export interface TemplateGenerationSectionProps {
  /** Modul-Schluessel, z.B. "ONBOARDING" | "VERTRAGSVERLAENGERUNG". */
  modul: string;
  /** Bezug innerhalb des Moduls (onboardingId / contractEndId). */
  refId: string;
  /** Nur bei Bearbeitungsrechten werden Aktionen angezeigt. */
  canEdit?: boolean;
  /** Modul-spezifische statische Dokumente (vor den Vorlagen gerendert). */
  staticDocuments?: StaticDocument[];
  /** Hinweis, wenn keine Vorlagen hinterlegt sind. */
  emptyHint?: string;
}

export function TemplateGenerationSection({
  modul,
  refId,
  canEdit = false,
  staticDocuments = [],
  emptyHint,
}: TemplateGenerationSectionProps) {
  const [templates, setTemplates] = useState<VorlageItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/brief-vorlagen?modul=${encodeURIComponent(modul)}`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) =>
        setTemplates(
          (j.data || []).map((t: { id: string; name: string; description: string | null }) => ({
            id: t.id,
            name: t.name,
            description: t.description,
          })),
        ),
      )
      .catch(() => setTemplates([]));
  }, [modul]);

  async function generate(templateId: string, format: "docx" | "pdf") {
    setBusy(`${templateId}:${format}`);
    setErr(null);
    try {
      const res = await fetch(`/api/brief-vorlagen/${templateId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, refId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error || "Erzeugung fehlgeschlagen.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") ||
        `dokument.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErr("Verbindungsfehler bei der Erzeugung.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-foreground">
        <DocumentIcon className="h-5 w-5 text-muted-foreground" />
        Dokumente erstellen
      </h3>
      <p className="mb-4 text-xs text-muted-foreground">
        Aus Vorlagen erzeugte Schreiben werden automatisch mit den Vorgangsdaten befüllt.
      </p>
      {err && (
        <div className="mb-3 rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-3 py-2 text-xs text-credo-rot">
          {err}
        </div>
      )}
      <div className="space-y-2">
        {canEdit &&
          staticDocuments.map((doc) => (
            <DocErzeugZeile key={doc.href} name={doc.name} tag={doc.tag}>
              <a href={doc.href} target="_blank" rel="noopener" className={ERZEUG_BTN}>
                {doc.label}
              </a>
            </DocErzeugZeile>
          ))}
        {templates.map((t) => (
          <DocErzeugZeile key={t.id} name={t.name} tag={t.description || "Vorlage"}>
            <button
              type="button"
              onClick={() => generate(t.id, "docx")}
              disabled={busy === `${t.id}:docx`}
              className={ERZEUG_BTN}
            >
              {busy === `${t.id}:docx` ? "…" : "Word"}
            </button>
            <button
              type="button"
              onClick={() => generate(t.id, "pdf")}
              disabled={busy === `${t.id}:pdf`}
              className={ERZEUG_BTN}
            >
              {busy === `${t.id}:pdf` ? "…" : "PDF"}
            </button>
          </DocErzeugZeile>
        ))}
        {templates.length === 0 && staticDocuments.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {emptyHint || "Keine Vorlagen hinterlegt. Vorlagen legst du unter „Brief-Vorlagen“ an."}
          </p>
        )}
      </div>
    </div>
  );
}
