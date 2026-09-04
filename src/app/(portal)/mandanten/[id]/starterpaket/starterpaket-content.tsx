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

type Art = "PDF" | "VORLAGE";

/** Eine Position im Paket — entweder ein Pool-PDF oder eine Brief-Vorlage. */
interface Position {
  art: Art;
  id: string;
}

interface SensiblesFeld {
  key: string;
  label: string;
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

interface Vorlage {
  id: string;
  name: string;
  beschreibung: string | null;
  modul: string;
  scope: "GLOBAL" | "MANDANT";
  fileSize: number;
  isSystem: boolean;
  sensibleFelder: SensiblesFeld[];
  marked: boolean;
  orderIndex: number | null;
}

/**
 * Module mit eigenem Standardpaket — je Modul ein Reiter.
 *
 * Die Reihenfolge folgt dem Lebenslauf eines Arbeitsverhaeltnisses. Wer hier
 * ein Modul ergaenzt, braucht dafuer auch einen Eintrag in der Modul-Tabelle
 * von src/lib/dokumentenpaket.ts und eine eigene Mailvorlage — sonst laesst
 * sich zwar konfigurieren, aber nie versenden.
 */
const MODULE: ReadonlyArray<{ value: string; label: string }> = [
  { value: "ONBOARDING", label: "Onboarding" },
  { value: "VERTRAGSVERLAENGERUNG", label: "Vertragsverlängerung" },
  { value: "VERBEAMTUNG", label: "Verbeamtung" },
  { value: "OFFBOARDING", label: "Offboarding" },
];

const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Eindeutiger Schluessel einer Position — dieselbe UUID kann es je Art geben. */
function posKey(p: Position): string {
  return `${p.art}:${p.id}`;
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

function ArtBadge({ art }: { art: Art }) {
  return art === "VORLAGE" ? (
    <span className="rounded-md bg-credo-gruen/10 px-2 py-0.5 text-[11px] font-medium text-credo-gruen">
      Vorlage
    </span>
  ) : (
    <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      PDF
    </span>
  );
}

/**
 * Rotes Kennzeichen: Diese Vorlage befuellt sensible Felder.
 *
 * Sie darf trotzdem ins Paket (Entscheidung vom 02.09.2026) — beim Versand
 * verlangt der Dialog dann je Vorlage eine ausdrueckliche Bestaetigung.
 */
function SensibelHinweis({ felder }: { felder: SensiblesFeld[] }) {
  if (felder.length === 0) return null;
  return (
    <div className="mt-1 rounded-md border border-credo-rot/30 bg-credo-rot/5 px-2 py-1 text-[11px] text-credo-rot">
      Enthält sensible Daten: {felder.map((f) => f.label).join(", ")}. Beim Versand ist je
      Vorgang eine Bestätigung nötig.
    </div>
  );
}

export function StarterpaketContent({
  user,
  organization,
}: {
  user: User;
  organization: Organization;
}) {
  const [modul, setModul] = useState<string>(MODULE[0].value);
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [vorlagen, setVorlagen] = useState<Vorlage[]>([]);
  const [selected, setSelected] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Upload-Formular (nur Pool-PDFs; Vorlagen werden in der Vorlagenverwaltung gepflegt)
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
        const res = await fetch(`${base}?modul=${modul}`);
        if (!res.ok) throw new Error("Fehler beim Laden");
        const json = await res.json();
        const docs: Doc[] = json.data?.documents || [];
        const vorl: Vorlage[] = json.data?.vorlagen || [];
        setDocuments(docs);
        setVorlagen(vorl);

        if (initSelected) {
          // Die Reihenfolge kommt fertig vom Server (`paket`) — Oberflaeche und
          // Versand sollen nicht getrennt sortieren.
          const paket: Position[] = (json.data?.paket || []).map(
            (p: { art: Art; id: string }) => ({ art: p.art, id: p.id }),
          );
          setSelected(paket);
        } else {
          // Nach Speichern/Upload: nur noch Vorhandenes behalten.
          setSelected((prev) =>
            prev.filter((p) =>
              p.art === "PDF"
                ? docs.some((d) => d.id === p.id)
                : vorl.some((v) => v.id === p.id),
            ),
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Fehler beim Laden");
      } finally {
        setLoading(false);
      }
    },
    [base, modul],
  );

  useEffect(() => {
    load(true);
  }, [load]);

  function notify(msg: string) {
    setSuccess(msg);
    setError("");
    setTimeout(() => setSuccess(""), 4000);
  }

  function docById(id: string): Doc | undefined {
    return documents.find((d) => d.id === id);
  }
  function vorlageById(id: string): Vorlage | undefined {
    return vorlagen.find((v) => v.id === id);
  }

  function addToPacket(p: Position) {
    setSelected((prev) =>
      prev.some((x) => posKey(x) === posKey(p)) ? prev : [...prev, p],
    );
  }
  function removeFromPacket(p: Position) {
    setSelected((prev) => prev.filter((x) => posKey(x) !== posKey(p)));
  }
  function move(index: number, dir: "up" | "down") {
    setSelected((prev) => {
      const j = dir === "up" ? index - 1 : index + 1;
      if (index < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j], next[index]];
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
        body: JSON.stringify({ modul, positionen: selected }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Fehler beim Speichern.");
        return;
      }
      notify("Standardpaket gespeichert.");
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
      removeFromPacket({ art: "PDF", id: d.id });
      load(false);
    } else {
      setError("Fehler beim Entfernen.");
    }
  }

  const gewaehlt = new Set(selected.map(posKey));
  const freieDokumente = documents.filter((d) => !gewaehlt.has(`PDF:${d.id}`));
  const freieVorlagen = vorlagen.filter((v) => !gewaehlt.has(`VORLAGE:${v.id}`));

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

        <h1 className="text-2xl font-bold text-foreground">Dokumentenpakete</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {organization.mandantNumber} — {organization.name}. Je Modul ein eigenes Paket:
          Diese Unterlagen sind im jeweiligen Vorgang vorausgewählt, wenn etwas verschickt
          wird. Feste PDFs gehen so, wie
          sie hochgeladen wurden; Brief-Vorlagen werden vorher automatisch mit den Daten
          des Vorgangs befüllt.
        </p>

        {MODULE.length > 1 && (
          <div className="mt-5 flex gap-1 border-b border-border">
            {MODULE.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setModul(m.value)}
                className={`border-b-2 px-3 py-1.5 text-sm font-medium transition-colors ${
                  m.value === modul
                    ? "border-credo-blau text-credo-blau"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

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

        {/* Auswahl + Reihenfolge — eine Liste aus beiden Quellen */}
        <div className="mt-6 rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Im Standardpaket ({selected.length})
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
            Reihenfolge = Reihenfolge der Anhänge. Änderungen werden erst nach „Auswahl
            speichern“ aktiv.
          </p>

          {loading ? (
            <p className="py-4 text-sm text-muted-foreground">Lade…</p>
          ) : selected.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
              Noch nichts ausgewählt. Unten aus den verfügbaren Dokumenten und Vorlagen
              hinzufügen.
            </p>
          ) : (
            <ul className="space-y-2">
              {selected.map((p, idx) => {
                const d = p.art === "PDF" ? docById(p.id) : undefined;
                const v = p.art === "VORLAGE" ? vorlageById(p.id) : undefined;
                const name = d?.name ?? v?.name;
                if (!name) return null;
                return (
                  <li
                    key={posKey(p)}
                    className="flex items-start gap-3 rounded-lg border border-border px-3 py-2"
                  >
                    <span className="mt-1 w-5 text-center text-xs font-semibold text-muted-foreground">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {name}
                        </span>
                        <ArtBadge art={p.art} />
                        <ScopeBadge scope={(d ?? v)!.scope} />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatBytes((d ?? v)!.fileSize)}
                        {(d ?? v)!.beschreibung ? ` · ${(d ?? v)!.beschreibung}` : ""}
                      </div>
                      {v && <SensibelHinweis felder={v.sensibleFelder} />}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => move(idx, "up")}
                        disabled={idx === 0}
                        aria-label="Nach oben"
                        className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => move(idx, "down")}
                        disabled={idx === selected.length - 1}
                        aria-label="Nach unten"
                        className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent disabled:opacity-30"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFromPacket(p)}
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

        {/* Quelle 1: feste PDFs aus dem Pool */}
        <div className="mt-6 rounded-xl border border-border bg-card p-5">
          <h2 className="mb-1 text-sm font-semibold text-foreground">
            Verfügbare Dokumente (feste PDFs)
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Gehen unverändert als Anhang mit — etwa Leitbild oder Hausordnung.
          </p>
          {freieDokumente.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              {documents.length === 0
                ? "Für diesen Mandanten ist noch kein PDF hinterlegt. Unten hochladen."
                : "Alle verfügbaren Dokumente sind bereits ausgewählt."}
            </p>
          ) : (
            <ul className="space-y-2">
              {freieDokumente.map((d) => (
                <li
                  key={d.id}
                  className={`flex items-center gap-3 rounded-lg border border-border px-3 py-2 ${
                    d.isActive ? "" : "opacity-50"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {d.name}
                      </span>
                      <ScopeBadge scope={d.scope} />
                      {!d.isActive && (
                        <span className="text-[11px] text-muted-foreground">inaktiv</span>
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
                        onClick={() => addToPacket({ art: "PDF", id: d.id })}
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

        {/* Quelle 2: Brief-Vorlagen */}
        <div className="mt-6 rounded-xl border border-border bg-card p-5">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">
              Verfügbare Vorlagen (werden befüllt)
            </h2>
            <Link
              href="/vorlagen"
              className="shrink-0 text-xs text-credo-blau hover:underline"
            >
              Vorlagen verwalten
            </Link>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Werden vor dem Versand mit den Daten des Vorgangs befüllt und als PDF
            angehängt. Angezeigt werden aktive Vorlagen dieses Moduls und
            modulübergreifende.
          </p>
          {freieVorlagen.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              {vorlagen.length === 0
                ? "Für dieses Modul ist keine Vorlage hinterlegt."
                : "Alle verfügbaren Vorlagen sind bereits ausgewählt."}
            </p>
          ) : (
            <ul className="space-y-2">
              {freieVorlagen.map((v) => (
                <li
                  key={v.id}
                  className="flex items-start gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {v.name}
                      </span>
                      <ScopeBadge scope={v.scope} />
                      {v.modul === "ALLGEMEIN" && (
                        <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          Modulübergreifend
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatBytes(v.fileSize)}
                      {v.beschreibung ? ` · ${v.beschreibung}` : ""}
                    </div>
                    <SensibelHinweis felder={v.sensibleFelder} />
                  </div>
                  <button
                    type="button"
                    onClick={() => addToPacket({ art: "VORLAGE", id: v.id })}
                    className="shrink-0 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Hinzufügen
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Upload — nur fuer feste PDFs */}
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
