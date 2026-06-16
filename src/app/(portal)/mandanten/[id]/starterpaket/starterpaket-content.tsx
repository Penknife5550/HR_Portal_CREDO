"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { PortalHeader } from "@/components/portal-header";

interface User {
  userId: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

interface Organization {
  id: string;
  mandantNumber: string;
  name: string;
}

interface Doc {
  id: string;
  name: string;
  beschreibung: string | null;
  scope: "GLOBAL" | "MANDANT";
  fileSize: number;
  isActive: boolean;
  marked: boolean;
  orderIndex: number | null;
}

const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ScopeBadge({ scope }: { scope: "GLOBAL" | "MANDANT" }) {
  return scope === "GLOBAL" ? (
    <span className="rounded-md bg-credo-blau/10 px-2 py-0.5 text-[11px] font-medium text-credo-blau">
      Gruppenweit
    </span>
  ) : (
    <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      Nur dieser Mandant
    </span>
  );
}

export function StarterpaketContent({
  user,
  organization,
}: {
  user: User;
  organization: Organization;
}) {
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Upload-Formular
  const [upFile, setUpFile] = useState<File | null>(null);
  const [upName, setUpName] = useState("");
  const [upBeschreibung, setUpBeschreibung] = useState("");
  const [upScope, setUpScope] = useState<"global" | "mandant">("mandant");
  const [uploading, setUploading] = useState(false);

  const base = `/api/organizations/${organization.id}/starterpaket`;

  const load = useCallback(
    async (initSelected: boolean) => {
      setLoading(true);
      try {
        const res = await fetch(base);
        if (!res.ok) throw new Error("Fehler beim Laden");
        const json = await res.json();
        const docs: Doc[] = json.data?.documents || [];
        setDocuments(docs);
        if (initSelected) {
          const marked = docs
            .filter((d) => d.marked)
            .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
            .map((d) => d.id);
          setSelected(marked);
        } else {
          setSelected((prev) => prev.filter((id) => docs.some((d) => d.id === id)));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Fehler beim Laden");
      } finally {
        setLoading(false);
      }
    },
    [base],
  );

  useEffect(() => {
    load(true);
  }, [load]);

  function notify(msg: string) {
    setSuccess(msg);
    setError("");
    setTimeout(() => setSuccess(""), 4000);
  }

  function byId(id: string): Doc | undefined {
    return documents.find((d) => d.id === id);
  }

  function addToPacket(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }
  function removeFromPacket(id: string) {
    setSelected((prev) => prev.filter((x) => x !== id));
  }
  function move(id: string, dir: "up" | "down") {
    setSelected((prev) => {
      const i = prev.indexOf(id);
      if (i < 0) return prev;
      const j = dir === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(base, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dokumentIds: selected }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Fehler beim Speichern.");
        return;
      }
      notify("Starterpaket gespeichert.");
      load(false);
    } catch {
      setError("Verbindungsfehler.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload() {
    setError("");
    if (!upFile) {
      setError("Bitte eine PDF-Datei auswaehlen.");
      return;
    }
    if (!upName.trim()) {
      setError("Bitte einen Namen angeben.");
      return;
    }
    setUploading(true);
    const fd = new FormData();
    fd.append("file", upFile);
    fd.append("name", upName.trim());
    if (upBeschreibung.trim()) fd.append("beschreibung", upBeschreibung.trim());
    if (upScope === "mandant") fd.append("organizationId", organization.id);
    try {
      const res = await fetch("/api/starterpaket-dokumente", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Fehler beim Hochladen.");
        return;
      }
      setUpFile(null);
      setUpName("");
      setUpBeschreibung("");
      notify("Dokument hochgeladen.");
      load(false);
    } catch {
      setError("Verbindungsfehler beim Hochladen.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(d: Doc) {
    if (!confirm(`„${d.name}" wirklich entfernen?`)) return;
    const res = await fetch(`/api/starterpaket-dokumente/${d.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      const j = await res.json().catch(() => ({}));
      notify(j.hinweis || "Entfernt.");
      removeFromPacket(d.id);
      load(false);
    } else {
      setError("Fehler beim Entfernen.");
    }
  }

  const available = documents.filter((d) => !selected.includes(d.id));

  return (
    <div className="min-h-screen bg-background">
      <PortalHeader user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link
          href="/mandanten"
          className="mb-4 inline-block text-sm text-credo-blau hover:underline"
        >
          ← Zurück zu Mandanten
        </Link>

        <h1 className="text-2xl font-bold text-foreground">Starterpaket</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {organization.mandantNumber} — {organization.name}. Diese Dokumente erhält
          ein neuer Mitarbeiter im Onboarding-Abschluss als PDF-Anhänge. Gruppenweite
          Dokumente einmal pflegen, hier ankreuzen und in die gewünschte Reihenfolge
          bringen.
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-4 py-2 text-sm text-credo-rot">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-4 rounded-lg border border-credo-gruen/30 bg-credo-gruen/10 px-4 py-2 text-sm text-credo-gruen">
            {success}
          </div>
        )}

        {/* Auswahl + Reihenfolge */}
        <div className="mt-6 rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Im Starterpaket ({selected.length})
            </h2>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-credo-blau px-4 py-1.5 text-sm font-semibold text-white hover:bg-credo-blau/90 disabled:opacity-50"
            >
              {saving ? "Speichern…" : "Auswahl speichern"}
            </button>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Reihenfolge = Versand-Reihenfolge. Änderungen werden erst nach „Auswahl
            speichern“ aktiv.
          </p>

          {loading ? (
            <p className="py-4 text-sm text-muted-foreground">Lade…</p>
          ) : selected.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
              Noch keine Dokumente ausgewählt. Unten aus den verfügbaren Dokumenten
              hinzufügen.
            </p>
          ) : (
            <ul className="space-y-2">
              {selected.map((id, idx) => {
                const d = byId(id);
                if (!d) return null;
                return (
                  <li
                    key={id}
                    className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                  >
                    <span className="w-5 text-center text-xs font-semibold text-muted-foreground">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {d.name}
                        </span>
                        <ScopeBadge scope={d.scope} />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatBytes(d.fileSize)}
                        {d.beschreibung ? ` · ${d.beschreibung}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => move(id, "up")}
                        disabled={idx === 0}
                        aria-label="Nach oben"
                        className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => move(id, "down")}
                        disabled={idx === selected.length - 1}
                        aria-label="Nach unten"
                        className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent disabled:opacity-30"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFromPacket(id)}
                        className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                      >
                        Entfernen
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Verfügbare Dokumente */}
        <div className="mt-6 rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            Verfügbare Dokumente
          </h2>
          {available.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              Alle verfügbaren Dokumente sind bereits ausgewählt.
            </p>
          ) : (
            <ul className="space-y-2">
              {available.map((d) => (
                <li
                  key={d.id}
                  className={`flex items-center gap-3 rounded-lg border border-border px-3 py-2 ${
                    d.isActive ? "" : "opacity-50"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {d.name}
                      </span>
                      <ScopeBadge scope={d.scope} />
                      {!d.isActive && (
                        <span className="text-[11px] text-muted-foreground">
                          inaktiv
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatBytes(d.fileSize)}
                      {d.beschreibung ? ` · ${d.beschreibung}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {d.isActive && (
                      <button
                        type="button"
                        onClick={() => addToPacket(d.id)}
                        className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        Hinzufügen
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(d)}
                      className="rounded-md border border-credo-rot/40 px-3 py-1 text-xs font-medium text-credo-rot hover:bg-credo-rot/10"
                    >
                      Löschen
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Upload */}
        <div className="mt-6 rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            Neues Dokument hochladen
          </h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">PDF-Datei</label>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setUpFile(e.target.files?.[0] || null)}
                className={INPUT_CLASS}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground">Name</label>
                <input
                  value={upName}
                  onChange={(e) => setUpName(e.target.value)}
                  placeholder="z.B. Leitbild"
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Geltung</label>
                <select
                  value={upScope}
                  onChange={(e) =>
                    setUpScope(e.target.value === "global" ? "global" : "mandant")
                  }
                  className={INPUT_CLASS}
                >
                  <option value="mandant">Nur dieser Mandant</option>
                  <option value="global">Gruppenweit (alle Mandanten)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                Beschreibung (optional)
              </label>
              <input
                value={upBeschreibung}
                onChange={(e) => setUpBeschreibung(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading}
                className="rounded-lg bg-credo-blau px-5 py-2 text-sm font-semibold text-white hover:bg-credo-blau/90 disabled:opacity-50"
              >
                {uploading ? "Lade hoch…" : "Hochladen"}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
