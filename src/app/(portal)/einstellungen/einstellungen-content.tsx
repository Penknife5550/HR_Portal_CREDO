"use client";

/**
 * CREDO HR-Portal – Einstellungen (Client Component)
 *
 * Drei Tabs:
 * 1. Webhooks  – Pro-Event Webhooks anlegen, testen, aktivieren
 * 2. SMTP      – Fallback-Mail-Server konfigurieren und testen
 * 3. E-Mail-Vorlagen – HTML-Vorlagen fuer SMTP-Fallback bearbeiten
 */

import { useState, useEffect, useCallback } from "react";
import { PortalHeader } from "@/components/portal-header";

// =============================================
// Typen
// =============================================
interface User {
  userId: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

interface WebhookConfig {
  id: string;
  event: string;
  name: string;
  url: string;
  authType: string;
  authHeader: string | null;
  authValue: string | null;
  isActive: boolean;
  description: string | null;
}

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  isActive: boolean;
}

interface EmailTemplate {
  id: string;
  event: string;
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText: string | null;
  variables: { key: string; description: string }[];
  isActive: boolean;
}

// =============================================
// Konstanten
// =============================================
const WEBHOOK_EVENTS = [
  { value: "onboarding-created", label: "Onboarding erstellt (Einladung Mitarbeiter)" },
  { value: "questionnaire-completed", label: "Fragebogen eingereicht" },
  { value: "supervisor-link-created", label: "Vorgesetzten-Link erstellt" },
  { value: "supervisor-completed", label: "Einstellungsmodalitäten eingereicht" },
];

const AUTH_TYPES = [
  { value: "none", label: "Keine Authentifizierung" },
  { value: "api_key", label: "API-Key (eigener Header)" },
  { value: "bearer", label: "Bearer Token" },
  { value: "basic", label: "Basic Auth (Benutzername / Passwort)" },
];

const EVENT_LABELS: Record<string, string> = Object.fromEntries(
  WEBHOOK_EVENTS.map((e) => [e.value, e.label])
);

// =============================================
// Haupt-Komponente
// =============================================
export function EinstellungenContent({ user }: { user: User }) {
  const [activeTab, setActiveTab] = useState<"webhooks" | "smtp" | "vorlagen">("webhooks");

  const tabs = [
    { id: "webhooks" as const, label: "Webhooks" },
    { id: "smtp" as const, label: "SMTP (E-Mail-Fallback)" },
    { id: "vorlagen" as const, label: "E-Mail-Vorlagen" },
  ];

  return (
    <div className="min-h-screen bg-muted">
      <PortalHeader user={user} />

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* Seitenheader */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-foreground">Einstellungen</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Webhooks, SMTP-Fallback und E-Mail-Vorlagen verwalten
          </p>
        </div>

        {/* Tab-Navigation */}
        <div className="mb-6 flex gap-1 rounded-lg border bg-card p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab-Inhalte */}
        {activeTab === "webhooks" && <WebhooksTab />}
        {activeTab === "smtp" && <SmtpTab />}
        {activeTab === "vorlagen" && <VorlagenTab />}
      </main>
    </div>
  );
}

// =============================================
// TAB 1: Webhooks
// =============================================
function WebhooksTab() {
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editWebhook, setEditWebhook] = useState<WebhookConfig | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/webhooks");
      const data = await res.json();
      setWebhooks(data.data ?? []);
    } catch {
      setError("Webhooks konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useAutoHide(success, setSuccess, 4000);
  useAutoHide(error, setError, 6000);

  async function handleToggleActive(w: WebhookConfig) {
    try {
      const res = await fetch(`/api/settings/webhooks/${w.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !w.isActive }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSuccess(`Webhook "${w.name}" ${w.isActive ? "deaktiviert" : "aktiviert"}`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    }
  }

  async function handleDelete(w: WebhookConfig) {
    if (!confirm(`Webhook "${w.name}" wirklich löschen?`)) return;
    try {
      const res = await fetch(`/api/settings/webhooks/${w.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      setSuccess(`Webhook "${w.name}" gelöscht`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    }
  }

  async function handleTest(w: WebhookConfig) {
    setTestResults((prev) => ({ ...prev, [w.id]: { success: false, message: "Teste..." } }));
    try {
      const res = await fetch(`/api/settings/webhooks/${w.id}/test`, { method: "POST" });
      const data = await res.json();
      setTestResults((prev) => ({
        ...prev,
        [w.id]: {
          success: data.success,
          message: data.success
            ? `Erfolgreich (HTTP ${data.statusCode}, ${data.durationMs}ms)`
            : `Fehler: ${data.error}`,
        },
      }));
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [w.id]: { success: false, message: "Netzwerkfehler" },
      }));
    }
  }

  // Webhooks nach Event gruppieren
  const grouped = WEBHOOK_EVENTS.map((ev) => ({
    event: ev.value,
    label: ev.label,
    webhooks: webhooks.filter((w) => w.event === ev.value),
  }));

  return (
    <div className="space-y-4">
      {success && <Alert type="success">{success}</Alert>}
      {error && <Alert type="error">{error}</Alert>}

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Pro Event können mehrere Webhooks konfiguriert werden. Alle Webhooks werden hier verwaltet.
          </p>
        </div>
        <button
          onClick={() => { setEditWebhook(null); setShowModal(true); }}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          + Neuer Webhook
        </button>
      </div>

      {loading ? (
        <LoadingCard text="Lade Webhooks..." />
      ) : (
        grouped.map((group) => (
          <div key={group.event} className="overflow-hidden rounded-lg border bg-card">
            {/* Event-Header */}
            <div className="border-b bg-muted/50 px-4 py-3 flex items-center justify-between">
              <div>
                <span className="text-sm font-semibold text-foreground">{group.label}</span>
                <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-mono text-blue-700">
                  {group.event}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {group.webhooks.length} Webhook{group.webhooks.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Webhook-Eintraege */}
            {group.webhooks.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">
                Kein Webhook konfiguriert – Event wird nicht ausgelöst.
              </p>
            ) : (
              <div className="divide-y">
                {group.webhooks.map((w) => (
                  <div key={w.id} className={`px-4 py-3 ${!w.isActive ? "opacity-50" : ""}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-foreground">{w.name}</span>
                          {w.isActive ? (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Aktiv</span>
                          ) : (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">Inaktiv</span>
                          )}
                          {w.authType !== "none" && (
                            <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">
                              {AUTH_TYPES.find((a) => a.value === w.authType)?.label ?? w.authType}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground font-mono truncate">{w.url}</p>
                        {w.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{w.description}</p>
                        )}
                        {testResults[w.id] && (
                          <p className={`mt-1 text-xs font-medium ${testResults[w.id].success ? "text-green-600" : "text-red-600"}`}>
                            {testResults[w.id].success ? "✓" : "✗"} {testResults[w.id].message}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleTest(w)}
                          className="rounded-md border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent"
                          title="Test-Request senden"
                        >
                          Testen
                        </button>
                        <button
                          onClick={() => { setEditWebhook(w); setShowModal(true); }}
                          className="rounded-md border px-2.5 py-1 text-xs hover:bg-accent"
                        >
                          Bearbeiten
                        </button>
                        <button
                          onClick={() => handleToggleActive(w)}
                          className={`rounded-md border px-2.5 py-1 text-xs ${
                            w.isActive
                              ? "border-red-200 text-red-700 hover:bg-red-50"
                              : "border-green-200 text-green-700 hover:bg-green-50"
                          }`}
                        >
                          {w.isActive ? "Deakt." : "Aktiv."}
                        </button>
                        <button
                          onClick={() => handleDelete(w)}
                          className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50"
                        >
                          Löschen
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}

      {/* Hinweis */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <strong>Hinweis:</strong> Alle Webhooks (inkl. n8n) werden ausschließlich hier konfiguriert.
        Wenn kein aktiver Webhook für ein Event erreichbar ist, wird automatisch der SMTP-Fallback genutzt (sofern aktiviert).
      </div>

      {/* Modal */}
      {showModal && (
        <WebhookModal
          initial={editWebhook}
          onClose={() => { setShowModal(false); setEditWebhook(null); }}
          onSave={async (data) => {
            const isEdit = Boolean(editWebhook);
            const url = isEdit
              ? `/api/settings/webhooks/${editWebhook!.id}`
              : "/api/settings/webhooks";
            const res = await fetch(url, {
              method: isEdit ? "PUT" : "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error((await res.json()).error);
            setSuccess(isEdit ? "Webhook aktualisiert" : "Webhook angelegt");
            load();
          }}
        />
      )}
    </div>
  );
}

// =============================================
// TAB 2: SMTP
// =============================================
function SmtpTab() {
  const [config, setConfig] = useState<SmtpConfig>({
    host: "", port: 587, secure: false, username: "",
    password: "", fromEmail: "", fromName: "CREDO HR-Portal", isActive: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings/smtp")
      .then((r) => r.json())
      .then((d) => { if (d.data) setConfig(d.data); })
      .catch(() => setError("SMTP-Konfiguration konnte nicht geladen werden"))
      .finally(() => setLoading(false));
  }, []);

  useAutoHide(success, setSuccess, 4000);
  useAutoHide(error, setError, 6000);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/smtp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSuccess("SMTP-Konfiguration gespeichert");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!testEmail) { setError("Bitte Test-E-Mail-Adresse eingeben"); return; }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/smtp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testEmail }),
      });
      const data = await res.json();
      setTestResult({
        success: data.success,
        message: data.success
          ? `Test-E-Mail erfolgreich gesendet an ${testEmail} (${data.durationMs}ms)`
          : `Fehler: ${data.error}`,
      });
    } catch {
      setTestResult({ success: false, message: "Netzwerkfehler beim Testen" });
    } finally {
      setTesting(false);
    }
  }

  function update(field: keyof SmtpConfig, value: string | number | boolean) {
    setConfig((prev) => ({ ...prev, [field]: value }));
  }

  if (loading) return <LoadingCard text="Lade SMTP-Konfiguration..." />;

  return (
    <div className="space-y-4">
      {success && <Alert type="success">{success}</Alert>}
      {error && <Alert type="error">{error}</Alert>}

      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h3 className="font-semibold text-foreground">SMTP-Konfiguration</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Wird als Fallback verwendet wenn n8n nicht erreichbar ist.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-5 p-6">
          {/* Aktivieren */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.isActive}
              onChange={(e) => update("isActive", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <div>
              <span className="text-sm font-medium text-foreground">SMTP-Fallback aktivieren</span>
              <p className="text-xs text-muted-foreground">
                Wenn deaktiviert, werden keine E-Mails als Fallback gesendet.
              </p>
            </div>
          </label>

          <hr className="border-border" />

          {/* Server */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <FormField label="SMTP-Host" required>
                <input
                  type="text"
                  value={config.host}
                  onChange={(e) => update("host", e.target.value)}
                  placeholder="smtp.office365.com"
                  className={inputClass}
                />
              </FormField>
            </div>
            <div>
              <FormField label="Port">
                <input
                  type="number"
                  value={config.port}
                  onChange={(e) => update("port", Number(e.target.value))}
                  min={1}
                  max={65535}
                  className={inputClass}
                />
              </FormField>
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.secure}
              onChange={(e) => update("secure", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span className="text-sm text-foreground">
              SSL/TLS verwenden (Port 465) – bei STARTTLS deaktivieren (Port 587)
            </span>
          </label>

          <hr className="border-border" />

          {/* Anmeldedaten */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Benutzername" required>
              <input
                type="text"
                value={config.username}
                onChange={(e) => update("username", e.target.value)}
                placeholder="hr@credo-gruppe.de"
                className={inputClass}
                autoComplete="off"
              />
            </FormField>
            <FormField label="Passwort">
              <input
                type="password"
                value={config.password}
                onChange={(e) => update("password", e.target.value)}
                placeholder={config.password === "••••••••" ? "Unverändert lassen oder neu eingeben" : ""}
                className={inputClass}
                autoComplete="new-password"
              />
            </FormField>
          </div>

          <hr className="border-border" />

          {/* Absender */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Absender-E-Mail" required>
              <input
                type="email"
                value={config.fromEmail}
                onChange={(e) => update("fromEmail", e.target.value)}
                placeholder="hr@credo-gruppe.de"
                className={inputClass}
              />
            </FormField>
            <FormField label="Absender-Name">
              <input
                type="text"
                value={config.fromName}
                onChange={(e) => update("fromName", e.target.value)}
                placeholder="CREDO HR-Portal"
                className={inputClass}
              />
            </FormField>
          </div>

          {/* Speichern */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Wird gespeichert..." : "Speichern"}
            </button>
          </div>
        </form>
      </div>

      {/* Test-Bereich */}
      <div className="rounded-lg border bg-card p-6">
        <h3 className="mb-1 font-semibold text-foreground">Verbindung testen</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Sendet eine Test-E-Mail mit der aktuell gespeicherten Konfiguration.
        </p>
        <div className="flex gap-3">
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="test@beispiel.de"
            className={`${inputClass} flex-1`}
          />
          <button
            onClick={handleTest}
            disabled={testing}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            {testing ? "Sendet..." : "Test-E-Mail senden"}
          </button>
        </div>
        {testResult && (
          <p className={`mt-3 text-sm font-medium ${testResult.success ? "text-green-600" : "text-red-600"}`}>
            {testResult.success ? "✓" : "✗"} {testResult.message}
          </p>
        )}
      </div>
    </div>
  );
}

// =============================================
// TAB 3: E-Mail-Vorlagen
// =============================================
function VorlagenTab() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<EmailTemplate>>({});
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/email-templates")
      .then((r) => r.json())
      .then((d) => setTemplates(d.data ?? []))
      .catch(() => setError("Vorlagen konnten nicht geladen werden"))
      .finally(() => setLoading(false));
  }, []);

  useAutoHide(success, setSuccess, 4000);
  useAutoHide(error, setError, 6000);

  function handleExpand(template: EmailTemplate) {
    if (expanded === template.id) {
      setExpanded(null);
      setEditData({});
    } else {
      setExpanded(template.id);
      setEditData({ ...template });
    }
  }

  async function handleSave(template: EmailTemplate) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/settings/email-templates/${template.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editData, event: template.event }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const updated = (await res.json()).data;
      setTemplates((prev) => prev.map((t) => (t.event === template.event ? updated : t)));
      setExpanded(null);
      setSuccess(`Vorlage "${template.name}" gespeichert`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingCard text="Lade E-Mail-Vorlagen..." />;

  return (
    <div className="space-y-4">
      {success && <Alert type="success">{success}</Alert>}
      {error && <Alert type="error">{error}</Alert>}

      <p className="text-sm text-muted-foreground">
        Diese Vorlagen werden verwendet wenn n8n nicht erreichbar ist und der SMTP-Fallback aktiv ist.
        Variablen im Format <code className="rounded bg-muted px-1 font-mono text-xs">{"{{variable}}"}</code> werden beim Versand ersetzt.
      </p>

      {templates.map((template) => {
        const isOpen = expanded === template.id;
        return (
          <div key={template.id} className="overflow-hidden rounded-lg border bg-card">
            {/* Vorlage-Header */}
            <button
              onClick={() => handleExpand(template)}
              className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition-colors"
            >
              <div>
                <span className="font-medium text-foreground">{template.name}</span>
                <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 font-mono text-xs text-blue-700">
                  {template.event}
                </span>
              </div>
              <span className="text-muted-foreground text-sm">{isOpen ? "▲ Schließen" : "▼ Bearbeiten"}</span>
            </button>

            {/* Editor */}
            {isOpen && (
              <div className="border-t p-5 space-y-4">
                {/* Verfügbare Variablen */}
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
                    Verfügbare Variablen
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {template.variables.map((v) => (
                      <span
                        key={v.key}
                        title={v.description}
                        className="cursor-help rounded bg-muted px-2 py-0.5 font-mono text-xs text-foreground"
                      >
                        {v.key}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Betreff */}
                <FormField label="Betreff" required>
                  <input
                    type="text"
                    value={editData.subject ?? ""}
                    onChange={(e) => setEditData((prev) => ({ ...prev, subject: e.target.value }))}
                    className={inputClass}
                  />
                </FormField>

                {/* HTML-Body */}
                <FormField label="HTML-Body" required>
                  <textarea
                    value={editData.bodyHtml ?? ""}
                    onChange={(e) => setEditData((prev) => ({ ...prev, bodyHtml: e.target.value }))}
                    rows={16}
                    className={`${inputClass} font-mono text-xs`}
                    spellCheck={false}
                  />
                </FormField>

                {/* Plaintext */}
                <FormField label="Plaintext (optional)">
                  <textarea
                    value={editData.bodyText ?? ""}
                    onChange={(e) => setEditData((prev) => ({ ...prev, bodyText: e.target.value }))}
                    rows={6}
                    className={`${inputClass} font-mono text-xs`}
                    spellCheck={false}
                  />
                </FormField>

                {/* Aktionen */}
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => { setExpanded(null); setEditData({}); }}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={() => handleSave(template)}
                    disabled={saving}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {saving ? "Wird gespeichert..." : "Vorlage speichern"}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// =============================================
// Webhook Modal (Anlegen / Bearbeiten)
// =============================================
function WebhookModal({
  initial,
  onClose,
  onSave,
}: {
  initial: WebhookConfig | null;
  onClose: () => void;
  onSave: (data: Partial<WebhookConfig>) => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<WebhookConfig>>(
    initial ?? { event: "onboarding-created", authType: "none", isActive: true }
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function upd(field: keyof WebhookConfig, value: string | boolean | null) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative mx-4 w-full max-w-lg rounded-lg border bg-card shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h3 className="text-lg font-bold text-foreground">
            {initial ? "Webhook bearbeiten" : "Neuer Webhook"}
          </h3>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {formError && <Alert type="error">{formError}</Alert>}

          {/* Event */}
          <FormField label="Event" required>
            <select value={form.event ?? ""} onChange={(e) => upd("event", e.target.value)} className={inputClass}>
              {WEBHOOK_EVENTS.map((ev) => (
                <option key={ev.value} value={ev.value}>{ev.label}</option>
              ))}
              <option value="">── Freies Event (eigenen Namen eingeben) ──</option>
            </select>
          </FormField>

          {/* Falls kein Standard-Event */}
          {!WEBHOOK_EVENTS.find((e) => e.value === form.event) && (
            <FormField label="Event-Name (frei)" required>
              <input
                type="text"
                value={form.event ?? ""}
                onChange={(e) => upd("event", e.target.value)}
                placeholder="z.B. document-uploaded"
                className={inputClass}
              />
            </FormField>
          )}

          {/* Name */}
          <FormField label="Bezeichnung" required>
            <input
              type="text"
              value={form.name ?? ""}
              onChange={(e) => upd("name", e.target.value)}
              placeholder="z.B. n8n Onboarding Workflow"
              className={inputClass}
            />
          </FormField>

          {/* URL */}
          <FormField label="Webhook-URL" required>
            <input
              type="url"
              value={form.url ?? ""}
              onChange={(e) => upd("url", e.target.value)}
              placeholder="https://n8n.credo.de/webhook/..."
              className={inputClass}
            />
          </FormField>

          {/* Auth */}
          <FormField label="Authentifizierung">
            <select value={form.authType ?? "none"} onChange={(e) => upd("authType", e.target.value)} className={inputClass}>
              {AUTH_TYPES.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </FormField>

          {form.authType === "api_key" && (
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Header-Name" required>
                <input
                  type="text"
                  value={form.authHeader ?? ""}
                  onChange={(e) => upd("authHeader", e.target.value)}
                  placeholder="X-API-Key"
                  className={inputClass}
                />
              </FormField>
              <FormField label="API-Key-Wert">
                <input
                  type="password"
                  value={form.authValue ?? ""}
                  onChange={(e) => upd("authValue", e.target.value)}
                  placeholder={initial?.authValue ? "Unverändert" : "Key eingeben"}
                  className={inputClass}
                />
              </FormField>
            </div>
          )}

          {form.authType === "bearer" && (
            <FormField label="Bearer Token">
              <input
                type="password"
                value={form.authValue ?? ""}
                onChange={(e) => upd("authValue", e.target.value)}
                placeholder={initial?.authValue ? "Unverändert" : "Token eingeben"}
                className={inputClass}
              />
            </FormField>
          )}

          {form.authType === "basic" && (
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Benutzername">
                <input
                  type="text"
                  value={form.authHeader ?? ""}
                  onChange={(e) => upd("authHeader", e.target.value)}
                  placeholder="admin"
                  className={inputClass}
                />
              </FormField>
              <FormField label="Passwort">
                <input
                  type="password"
                  value={form.authValue ?? ""}
                  onChange={(e) => upd("authValue", e.target.value)}
                  placeholder={initial?.authValue ? "Unverändert" : "Passwort eingeben"}
                  className={inputClass}
                />
              </FormField>
            </div>
          )}

          {/* Beschreibung */}
          <FormField label="Beschreibung (optional)">
            <input
              type="text"
              value={form.description ?? ""}
              onChange={(e) => upd("description", e.target.value || null)}
              placeholder="Kurze Beschreibung des Webhooks"
              className={inputClass}
            />
          </FormField>

          {/* Aktiv */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive !== false}
              onChange={(e) => upd("isActive", e.target.checked)}
              className="h-4 w-4 rounded"
            />
            <span className="text-sm text-foreground">Webhook aktiviert</span>
          </label>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border px-4 py-2 text-sm text-muted-foreground hover:bg-accent">
              Abbrechen
            </button>
            <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {saving ? "Wird gespeichert..." : "Speichern"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================
// Hilfsfunktionen & kleine Komponenten
// =============================================
const inputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring";

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-foreground">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function Alert({ type, children }: { type: "success" | "error"; children: React.ReactNode }) {
  const styles = type === "success"
    ? "border-green-200 bg-green-50 text-green-800"
    : "border-red-200 bg-red-50 text-red-800";
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>{children}</div>
  );
}

function LoadingCard({ text }: { text: string }) {
  return (
    <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">{text}</div>
  );
}

function useAutoHide(
  value: string | null,
  setter: React.Dispatch<React.SetStateAction<string | null>>,
  delay: number
) {
  useEffect(() => {
    if (!value) return;
    const t = setTimeout(() => setter(null), delay);
    return () => clearTimeout(t);
  }, [value, setter, delay]);
}
