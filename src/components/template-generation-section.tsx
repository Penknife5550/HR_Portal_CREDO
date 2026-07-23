"use client";

/**
 * Generische "Dokumente erstellen"-Sektion fuer den Dokumente-Hub.
 *
 * Laedt die Vorlagen eines Moduls (GET /api/brief-vorlagen?modul=...) und
 * erzeugt daraus Word/PDF (POST /api/brief-vorlagen/[id]/generate mit refId).
 * Wird von Onboarding UND Vertragsende genutzt (spaeter auch Offboarding/
 * Verbeamtung, #13). Modul-spezifische Statik-Dokumente (z.B. das amtliche
 * Masernschutz-PDF im Onboarding) kommen ueber `staticDocuments` herein.
 *
 * Wird `organizationId` uebergeben, liefert die Schnittstelle nur gruppenweite
 * Vorlagen und die des jeweiligen Traegers — sonst erschienen im Vorgang auch
 * die Vorlagen fremder Mandanten (und ein daraus erzeugtes Schreiben truege den
 * falschen Briefkopf).
 */

import { useCallback, useEffect, useState } from "react";

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
  badge,
  children,
}: {
  name: string;
  tag?: string | null;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {name}
          {badge}
        </p>
        {/* Zweite Zeile nur bei gepflegter Beschreibung — frueher stand hier bei
            ungepflegten Vorlagen das nichtssagende Fuellwort "Vorlage". */}
        {tag && <p className="text-[11px] text-muted-foreground">{tag}</p>}
      </div>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}

/** Kleines Etikett, das gruppenweite von mandantengebundenen Vorlagen trennt. */
function GeltungBadge({ eigene }: { eigene: boolean }) {
  return (
    <span
      className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold align-middle ${
        eigene
          ? "bg-credo-gruen/10 text-credo-gruen"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {eigene ? "Für Ihre Einrichtung" : "Gruppenweit"}
    </span>
  );
}

interface VorlageItem {
  id: string;
  name: string;
  description: string | null;
  organizationId: string | null;
}

/** Meldung, die an einer einzelnen Zeile haengt. */
interface ZeilenMeldung {
  art: "fehler" | "luecke";
  text: string;
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
  /** Mandant des Vorgangs — grenzt die Vorlagenliste ein und fuellt das Deckblatt. */
  organizationId?: string | null;
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
  organizationId,
  canEdit = false,
  staticDocuments = [],
  emptyHint,
}: TemplateGenerationSectionProps) {
  const [templates, setTemplates] = useState<VorlageItem[]>([]);
  // Vier ehrliche Zustaende statt "jeder Fehler ist eine leere Liste".
  const [status, setStatus] = useState<"laedt" | "bereit" | "fehler">("laedt");
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [meldungen, setMeldungen] = useState<Record<string, ZeilenMeldung>>({});

  // Ohne Bearbeitungsrecht antwortet die Schnittstelle mit 403 — der Aufruf
  // unterbleibt dann ganz, statt die Ablehnung als "keine Vorlagen" zu deuten.
  const darfLaden = canEdit;

  const laden = useCallback(() => {
    if (!darfLaden) return;
    setStatus("laedt");
    const query = new URLSearchParams({ modul });
    if (organizationId) query.set("organizationId", organizationId);
    fetch(`/api/brief-vorlagen?${query.toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => {
        setTemplates(
          (j.data || []).map(
            (t: {
              id: string;
              name: string;
              description: string | null;
              organizationId: string | null;
            }) => ({
              id: t.id,
              name: t.name,
              description: t.description,
              organizationId: t.organizationId,
            }),
          ),
        );
        setStatus("bereit");
      })
      .catch(() => setStatus("fehler"));
  }, [modul, organizationId, darfLaden]);

  useEffect(() => {
    laden();
  }, [laden]);

  function setMeldung(templateId: string, meldung: ZeilenMeldung | null) {
    setMeldungen((prev) => {
      const next = { ...prev };
      if (meldung) next[templateId] = meldung;
      else delete next[templateId];
      return next;
    });
  }

  async function generate(templateId: string, format: "docx" | "pdf") {
    const key = `${templateId}:${format}`;
    setBusy((prev) => new Set(prev).add(key));
    setMeldung(templateId, null);
    try {
      const res = await fetch(`/api/brief-vorlagen/${templateId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Mandant mitsenden, damit das DMS-Deckblatt samt QR-Code auch bei
        // gruppenweiten Vorlagen korrekt zugeordnet ist.
        body: JSON.stringify({ format, refId, organizationId: organizationId || undefined }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMeldung(templateId, {
          art: "fehler",
          text: j.error || "Erzeugung fehlgeschlagen.",
        });
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

      // Der Server meldet, wie viele Platzhalter leer geblieben sind. Ohne
      // diesen Hinweis ginge ein Schreiben mit "___" unbemerkt hinaus.
      const fehlend = parseInt(res.headers.get("X-Missing-Placeholders") || "0", 10);
      if (fehlend > 0) {
        setMeldung(templateId, {
          art: "luecke",
          text: `${fehlend} ${fehlend === 1 ? "Feld blieb" : "Felder blieben"} leer — bitte im Dokument prüfen.`,
        });
      }
    } catch {
      setMeldung(templateId, { art: "fehler", text: "Verbindungsfehler bei der Erzeugung." });
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  const zeigeLeer =
    status === "bereit" && templates.length === 0 && staticDocuments.length === 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-foreground">
        <DocumentIcon className="h-5 w-5 text-muted-foreground" />
        Dokumente erstellen
        {status === "bereit" && templates.length > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            {templates.length}
          </span>
        )}
      </h3>
      <p className="mb-4 text-xs text-muted-foreground">
        Aus Vorlagen erzeugte Schreiben werden automatisch mit den Vorgangsdaten befüllt.
      </p>

      {!darfLaden ? (
        <p className="text-xs text-muted-foreground">
          Zum Erstellen von Dokumenten fehlt Ihnen die Berechtigung.
        </p>
      ) : status === "laedt" ? (
        <p className="text-xs text-muted-foreground">Vorlagen werden geladen …</p>
      ) : status === "fehler" ? (
        <div className="rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-3 py-2 text-xs text-credo-rot">
          Vorlagen konnten nicht geladen werden.{" "}
          <button type="button" onClick={laden} className="underline hover:no-underline">
            Erneut versuchen
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {staticDocuments.map((doc) => (
            <DocErzeugZeile key={doc.href} name={doc.name} tag={doc.tag}>
              <a href={doc.href} target="_blank" rel="noopener" className={ERZEUG_BTN}>
                {doc.label}
              </a>
            </DocErzeugZeile>
          ))}
          {templates.map((t) => {
            const meldung = meldungen[t.id];
            return (
              <div key={t.id}>
                <DocErzeugZeile
                  name={t.name}
                  tag={t.description}
                  badge={<GeltungBadge eigene={t.organizationId !== null} />}
                >
                  <button
                    type="button"
                    onClick={() => generate(t.id, "docx")}
                    disabled={busy.has(`${t.id}:docx`)}
                    className={ERZEUG_BTN}
                  >
                    {busy.has(`${t.id}:docx`) ? "…" : "Word"}
                  </button>
                  <button
                    type="button"
                    onClick={() => generate(t.id, "pdf")}
                    disabled={busy.has(`${t.id}:pdf`)}
                    className={ERZEUG_BTN}
                  >
                    {busy.has(`${t.id}:pdf`) ? "…" : "PDF"}
                  </button>
                </DocErzeugZeile>
                {meldung && (
                  <p
                    className={`mt-1 rounded-md border-l-[3px] px-2.5 py-1 text-[11px] ${
                      meldung.art === "fehler"
                        ? "border-credo-rot bg-credo-rot/10 text-credo-rot"
                        : "border-credo-gelb bg-credo-gelb/10 text-[#8a6d00]"
                    }`}
                  >
                    {meldung.text}
                  </p>
                )}
              </div>
            );
          })}
          {zeigeLeer && (
            <p className="text-xs text-muted-foreground">
              {emptyHint || "Keine Vorlagen hinterlegt. Vorlagen legen Sie unter „Brief-Vorlagen“ an."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
