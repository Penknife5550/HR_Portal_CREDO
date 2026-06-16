"use client";

import { useState, useEffect, useCallback } from "react";
import { PortalHeader } from "@/components/portal-header";
import { VariablenKatalog } from "@/components/variablen-katalog";

interface User {
  userId: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

interface Organization {
  id: string;
  name: string;
  mandantNumber: string;
  shortName: string | null;
  isActive: boolean;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  modul: string;
  originalName: string;
  fileSize: number;
  platzhalter: string[];
  organizationId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  organization: { name: string; mandantNumber: string } | null;
  createdBy: { firstName: string; lastName: string } | null;
  _count?: { generatedDocuments: number };
}

const ADMIN_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];

const MODULE_OPTIONS = [
  { value: "ALLGEMEIN", label: "Allgemein" },
  { value: "BEM", label: "BEM" },
  { value: "ONBOARDING", label: "Onboarding" },
  { value: "OFFBOARDING", label: "Offboarding" },
  { value: "VERBEAMTUNG", label: "Verbeamtung" },
  { value: "MUTTERSCHUTZ", label: "Mutterschutz" },
  { value: "ELTERNZEIT", label: "Elternzeit" },
];

const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";

function moduleLabel(value: string): string {
  return MODULE_OPTIONS.find((m) => m.value === value)?.label || value;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function filenameFromHeaders(res: Response, fallback: string): string {
  const cd = res.headers.get("Content-Disposition") || "";
  const m = cd.match(/filename="?([^"]+)"?/);
  return m?.[1] || fallback;
}

export function BriefVorlagenContent({ user }: { user: User }) {
  const canManage = ADMIN_ROLES.includes(user.role);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Template | null>(null);
  const [generateTarget, setGenerateTarget] = useState<Template | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/brief-vorlagen${includeInactive ? "?includeInactive=1" : ""}`,
      );
      if (!res.ok) throw new Error("Fehler beim Laden der Vorlagen");
      const json = await res.json();
      setTemplates(json.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    fetch("/api/organizations")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => setOrganizations(j.data || []))
      .catch(() => setOrganizations([]));
  }, []);

  function notify(msg: string) {
    setSuccess(msg);
    setError("");
    setTimeout(() => setSuccess(""), 4000);
  }

  async function handleDeactivate(t: Template) {
    if (!confirm(`Vorlage "${t.name}" wirklich deaktivieren?`)) return;
    const res = await fetch(`/api/brief-vorlagen/${t.id}`, { method: "DELETE" });
    if (res.ok) {
      notify("Vorlage deaktiviert.");
      loadTemplates();
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Fehler beim Deaktivieren");
    }
  }

  async function handleReactivate(t: Template) {
    const res = await fetch(`/api/brief-vorlagen/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: true }),
    });
    if (res.ok) {
      notify("Vorlage reaktiviert.");
      loadTemplates();
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Fehler");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <PortalHeader user={user} />

      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Brief-Vorlagen</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Zentrale Word-Vorlagen mit Platzhaltern — Ausgabe als Word, PDF oder
              per E-Mail.
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="rounded-lg bg-credo-blau px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-credo-blau/90"
            >
              + Neue Vorlage
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-4 py-2 text-sm text-credo-rot">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-lg border border-credo-gruen/30 bg-credo-gruen/10 px-4 py-2 text-sm text-credo-gruen">
            {success}
          </div>
        )}

        {canManage && (
          <label className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            Deaktivierte Vorlagen anzeigen
          </label>
        )}

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Modul</th>
                <th className="px-4 py-3 font-medium">Geltung</th>
                <th className="px-4 py-3 font-medium">Platzhalter</th>
                <th className="px-4 py-3 font-medium">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Lade Vorlagen…
                  </td>
                </tr>
              ) : templates.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Noch keine Vorlagen vorhanden.
                  </td>
                </tr>
              ) : (
                templates.map((t) => (
                  <tr
                    key={t.id}
                    className={`border-b border-border last:border-0 ${t.isActive ? "" : "opacity-50"}`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{t.name}</div>
                      {t.description && (
                        <div className="text-xs text-muted-foreground">
                          {t.description}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {t.originalName} · {formatBytes(t.fileSize)}
                      </div>
                    </td>
                    <td className="px-4 py-3">{moduleLabel(t.modul)}</td>
                    <td className="px-4 py-3">
                      {t.organization
                        ? `${t.organization.mandantNumber} — ${t.organization.name}`
                        : "Global"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-muted-foreground">
                        {t.platzhalter.length} Stk.
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setGenerateTarget(t)}
                          disabled={!t.isActive}
                          className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
                        >
                          Erzeugen
                        </button>
                        {canManage && (
                          <>
                            <button
                              type="button"
                              onClick={() => setEditTarget(t)}
                              className="rounded-md border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-accent"
                            >
                              Bearbeiten
                            </button>
                            {t.isActive ? (
                              <button
                                type="button"
                                onClick={() => handleDeactivate(t)}
                                className="rounded-md border border-credo-rot/40 px-3 py-1 text-xs font-medium text-credo-rot hover:bg-credo-rot/10"
                              >
                                Deaktivieren
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleReactivate(t)}
                                className="rounded-md border border-credo-gruen/40 px-3 py-1 text-xs font-medium text-credo-gruen hover:bg-credo-gruen/10"
                              >
                                Reaktivieren
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {uploadOpen && (
        <UploadModal
          organizations={organizations}
          onClose={() => setUploadOpen(false)}
          onSaved={() => {
            setUploadOpen(false);
            notify("Vorlage hochgeladen.");
            loadTemplates();
          }}
        />
      )}

      {editTarget && (
        <EditModal
          template={editTarget}
          organizations={organizations}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            notify("Vorlage aktualisiert.");
            loadTemplates();
          }}
        />
      )}

      {generateTarget && (
        <GenerateModal
          template={generateTarget}
          organizations={organizations}
          onClose={() => setGenerateTarget(null)}
          onMailSent={(msg) => {
            setGenerateTarget(null);
            notify(msg);
            loadTemplates();
          }}
          onDownloaded={(msg) => notify(msg)}
        />
      )}
    </div>
  );
}

// =============================================
// Upload-Modal
// =============================================
function UploadModal({
  organizations,
  onClose,
  onSaved,
}: {
  organizations: Organization[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [modul, setModul] = useState("ALLGEMEIN");
  const [organizationId, setOrganizationId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function handleSubmit() {
    setErr("");
    if (!file) {
      setErr("Bitte eine .docx-Datei auswaehlen.");
      return;
    }
    if (!name.trim()) {
      setErr("Bitte einen Namen angeben.");
      return;
    }
    setSaving(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("name", name.trim());
    if (description.trim()) fd.append("description", description.trim());
    fd.append("modul", modul);
    if (organizationId) fd.append("organizationId", organizationId);
    try {
      const res = await fetch("/api/brief-vorlagen", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const base = j.error || "Fehler beim Hochladen.";
        const detail = j.details?.length ? ` (${j.details.join("; ")})` : "";
        setErr(base + detail);
        return;
      }
      onSaved();
    } catch {
      setErr("Verbindungsfehler beim Hochladen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Neue Brief-Vorlage" onClose={onClose}>
      {err && (
        <div className="mb-4 rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-4 py-2 text-sm text-credo-rot">
          {err}
        </div>
      )}
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium">Word-Datei (.docx)</label>
          <input
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className={INPUT_CLASS}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Platzhalter im Dokument: <code>{"{vorname}"}</code>,{" "}
            <code>{"{nachname}"}</code>, Wenn/Dann:{" "}
            <code>{"{#hatKinder}…{/hatKinder}"}</code>
          </p>
        </div>
        <div>
          <label className="text-sm font-medium">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={INPUT_CLASS}
            placeholder="z.B. BEM-Einladung"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Beschreibung (optional)</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Modul</label>
            <select
              value={modul}
              onChange={(e) => setModul(e.target.value)}
              className={INPUT_CLASS}
            >
              {MODULE_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Mandant (optional)</label>
            <select
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">Global (alle Mandanten)</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.mandantNumber} — {o.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <VariablenKatalog modul={modul} />
      </div>
      <ModalActions
        onClose={onClose}
        onConfirm={handleSubmit}
        confirmLabel={saving ? "Lade hoch…" : "Hochladen"}
        disabled={saving}
      />
    </ModalShell>
  );
}

// =============================================
// Edit-Modal
// =============================================
function EditModal({
  template,
  organizations,
  onClose,
  onSaved,
}: {
  template: Template;
  organizations: Organization[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description || "");
  const [modul, setModul] = useState(template.modul);
  const [organizationId, setOrganizationId] = useState(
    template.organizationId || "",
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function handleSubmit() {
    setErr("");
    setSaving(true);
    try {
      const res = await fetch(`/api/brief-vorlagen/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          modul,
          organizationId: organizationId || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error || "Fehler beim Speichern.");
        return;
      }
      onSaved();
    } catch {
      setErr("Verbindungsfehler.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Vorlage bearbeiten" onClose={onClose}>
      {err && (
        <div className="mb-4 rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-4 py-2 text-sm text-credo-rot">
          {err}
        </div>
      )}
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Beschreibung</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Modul</label>
            <select
              value={modul}
              onChange={(e) => setModul(e.target.value)}
              className={INPUT_CLASS}
            >
              {MODULE_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Mandant</label>
            <select
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">Global (alle Mandanten)</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.mandantNumber} — {o.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Platzhalter im Dokument: {template.platzhalter.join(", ") || "—"}
        </p>
        <VariablenKatalog modul={modul} />
      </div>
      <ModalActions
        onClose={onClose}
        onConfirm={handleSubmit}
        confirmLabel={saving ? "Speichern…" : "Speichern"}
        disabled={saving}
      />
    </ModalShell>
  );
}

// =============================================
// Generate-Modal
// =============================================
function GenerateModal({
  template,
  organizations,
  onClose,
  onMailSent,
  onDownloaded,
}: {
  template: Template;
  organizations: Organization[];
  onClose: () => void;
  onMailSent: (msg: string) => void;
  onDownloaded: (msg: string) => void;
}) {
  const [format, setFormat] = useState<"docx" | "pdf" | "mail">("docx");
  const [organizationId, setOrganizationId] = useState(
    template.organizationId || "",
  );
  const [refId, setRefId] = useState("");
  const [withDeckblatt, setWithDeckblatt] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});
  const [mailTo, setMailTo] = useState("");
  const [mailSubject, setMailSubject] = useState("");
  const [mailMessage, setMailMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function setVal(key: string, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  async function handleSubmit() {
    setErr("");
    if (format === "mail" && !mailTo.trim()) {
      setErr("Bitte eine Empfaenger-E-Mail angeben.");
      return;
    }
    setBusy(true);

    // Nur ausgefuellte Werte senden
    const filledValues: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) {
      if (v.trim() !== "") filledValues[k] = v;
    }

    const payload: Record<string, unknown> = {
      format,
      values: filledValues,
      withDeckblatt,
    };
    if (organizationId) payload.organizationId = organizationId;
    if (refId.trim()) payload.refId = refId.trim();
    if (format === "mail") {
      payload.email = {
        to: mailTo.trim(),
        subject: mailSubject.trim() || undefined,
        message: mailMessage.trim() || undefined,
      };
    }

    try {
      const res = await fetch(`/api/brief-vorlagen/${template.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (format === "mail") {
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          setErr(j.error || "Fehler beim Versand.");
          return;
        }
        const missingNote =
          j.data?.missing?.length > 0
            ? ` (${j.data.missing.length} Platzhalter ohne Wert)`
            : "";
        const pdfNote = j.data?.pdfMissing
          ? " Hinweis: PDF konnte nicht erzeugt werden — nur Word wurde angehaengt."
          : "";
        onMailSent(`E-Mail an ${j.data?.to} versendet${missingNote}.${pdfNote}`);
        return;
      }

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error || "Fehler bei der Erzeugung.");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filenameFromHeaders(
        res,
        `dokument.${format === "pdf" ? "pdf" : "docx"}`,
      );
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      const missing = res.headers.get("X-Missing-Placeholders");
      const note =
        missing && missing !== "0"
          ? ` ${missing} Platzhalter ohne Wert (mit "___" markiert).`
          : "";
      onDownloaded(`Dokument erzeugt.${note}`);
      onClose();
    } catch {
      setErr("Verbindungsfehler.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title={`Erzeugen: ${template.name}`} onClose={onClose}>
      {err && (
        <div className="mb-4 rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-4 py-2 text-sm text-credo-rot">
          {err}
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label className="mb-1 block text-sm font-medium">Ausgabeformat</label>
          <div className="flex gap-2">
            {(
              [
                ["docx", "Word"],
                ["pdf", "PDF"],
                ["mail", "Per E-Mail"],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setFormat(val)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  format === val
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Mandant</label>
            <select
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">Global / keiner</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.mandantNumber} — {o.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Bezug / Ref-ID (optional)</label>
            <input
              value={refId}
              onChange={(e) => setRefId(e.target.value)}
              className={INPUT_CLASS}
              placeholder="z.B. Vorgangs-ID"
            />
          </div>
        </div>

        {template.platzhalter.length > 0 && (
          <div>
            <label className="mb-1 block text-sm font-medium">
              Platzhalter befuellen
            </label>
            <p className="mb-2 text-xs text-muted-foreground">
              Leere Felder werden automatisch (Datum, Mandant, …) ergaenzt oder mit
              „___“ markiert.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {template.platzhalter.map((p) => (
                <div key={p}>
                  <label className="text-xs text-muted-foreground">{p}</label>
                  <input
                    value={values[p] || ""}
                    onChange={(e) => setVal(p, e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {format !== "docx" && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={withDeckblatt}
              onChange={(e) => setWithDeckblatt(e.target.checked)}
            />
            DMS-Deckblatt (QR-Code) voranstellen
          </label>
        )}

        {format === "mail" && (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div>
              <label className="text-sm font-medium">Empfaenger-E-Mail</label>
              <input
                type="email"
                value={mailTo}
                onChange={(e) => setMailTo(e.target.value)}
                className={INPUT_CLASS}
                placeholder="empfaenger@example.de"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Betreff (optional)</label>
              <input
                value={mailSubject}
                onChange={(e) => setMailSubject(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Nachricht (optional)</label>
              <textarea
                value={mailMessage}
                onChange={(e) => setMailMessage(e.target.value)}
                rows={3}
                className={INPUT_CLASS}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Das Dokument wird als Word{withDeckblatt ? " und PDF" : ""} angehaengt.
            </p>
          </div>
        )}
      </div>

      <ModalActions
        onClose={onClose}
        onConfirm={handleSubmit}
        confirmLabel={
          busy
            ? "Erzeuge…"
            : format === "mail"
              ? "Senden"
              : "Erzeugen & Herunterladen"
        }
        disabled={busy}
      />
    </ModalShell>
  );
}

// =============================================
// Modal-Bausteine
// =============================================
function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-card p-6 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Schliessen"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({
  onClose,
  onConfirm,
  confirmLabel,
  disabled,
}: {
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="mt-6 flex justify-end gap-3">
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
      >
        Abbrechen
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={disabled}
        className="rounded-lg bg-credo-blau px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-credo-blau/90 disabled:opacity-50"
      >
        {confirmLabel}
      </button>
    </div>
  );
}
