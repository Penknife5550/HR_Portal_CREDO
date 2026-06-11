"use client";

/**
 * CREDO HR-Portal – Einstellungen (Client Component)
 *
 * Tabs:
 * 1. Versand-Status   – Konfigurations-Ampel je Event + SMTP-Status
 * 2. E-Mail-Vorlagen  – Vorlagen inkl. Empfaenger (To/CC/BCC) + Test-Versand
 * 3. Versandprotokoll – EmailLog (SENT/FAILED/SKIPPED) mit Filtern
 * 4. SMTP             – Primaerer Versandkanal konfigurieren und testen
 * 5. Webhooks         – Optionaler Zusatzkanal (z.B. n8n), pro Event
 * 6. Abteilungen      – Offboarding-Abteilungen mit E-Mail verwalten
 * 7. API-Zugang       – API-Keys fuer die Reporting-API
 */

import { useState, useEffect, useCallback } from "react";
import { PortalHeader } from "@/components/portal-header";
import { DEPARTMENT_KEYS, DEPARTMENT_LABELS } from "@/lib/constants";

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
  recipientTo: string;
  recipientCc: string;
  recipientBcc: string;
  variables: { key: string; description: string }[];
  isActive: boolean;
  group: string;
  recipientHint: string;
  wired: boolean;
}

interface DepartmentConfig {
  id: string;
  name: string;
  key: string;
  email: string;
  isActive: boolean;
  organizationId: string | null;
  organizationName: string | null;
}

interface OrganizationOption {
  id: string;
  name: string;
}

// =============================================
// Konstanten
// =============================================
const WEBHOOK_EVENTS = [
  // Onboarding
  { value: "onboarding-created", label: "Onboarding erstellt", group: "Onboarding" },
  { value: "questionnaire-completed", label: "Fragebogen eingereicht", group: "Onboarding" },
  { value: "supervisor-link-created", label: "Vorgesetzten-Link erstellt", group: "Onboarding" },
  { value: "supervisor-completed", label: "Modalitäten eingereicht", group: "Onboarding" },
  { value: "employee-reminder", label: "Erinnerung Mitarbeiter", group: "Onboarding" },
  { value: "supervisor-reminder", label: "Erinnerung Vorgesetzter", group: "Onboarding" },
  // Offboarding
  { value: "offboarding-created", label: "Offboarding erstellt", group: "Offboarding" },
  { value: "offboarding-department-assigned", label: "Abteilung zugewiesen", group: "Offboarding" },
  { value: "offboarding-task-completed", label: "Aufgabe erledigt", group: "Offboarding" },
  { value: "offboarding-department-completed", label: "Abteilung fertig", group: "Offboarding" },
  { value: "offboarding-task-overdue", label: "Aufgabe überfällig", group: "Offboarding" },
  { value: "offboarding-reminder", label: "Reminder gesendet", group: "Offboarding" },
  { value: "offboarding-completed", label: "Offboarding abgeschlossen", group: "Offboarding" },
  { value: "exit-interview-invited", label: "Exit-Interview versendet", group: "Offboarding" },
  { value: "exit-interview-submitted", label: "Exit-Interview ausgefüllt", group: "Offboarding" },
  { value: "zeugnis-bewertung-invited", label: "Zeugnis-Bewertung versendet", group: "Offboarding" },
  { value: "zeugnis-bewertung-submitted", label: "Zeugnis-Bewertung eingereicht", group: "Offboarding" },
  // Verbeamtung
  { value: "psi-created", label: "Verbeamtung angelegt", group: "Verbeamtung" },
  { value: "psi-assessment-requested", label: "Beurteilung angefordert", group: "Verbeamtung" },
  { value: "psi-assessment-completed", label: "Beurteilung eingegangen", group: "Verbeamtung" },
  { value: "psi-assessment-released", label: "Beurteilung zur Bekanntgabe", group: "Verbeamtung" },
  { value: "psi-assessment-acknowledged", label: "Beurteilung quittiert", group: "Verbeamtung" },
  { value: "psi-assessment-archived", label: "Beurteilung in Personalakte", group: "Verbeamtung" },
  { value: "psi-phase-completed", label: "Phase abgeschlossen", group: "Verbeamtung" },
  { value: "psi-deadline-warning", label: "Frist-Warnung", group: "Verbeamtung" },
  { value: "psi-completed", label: "Verbeamtung abgeschlossen", group: "Verbeamtung" },
  // Elternzeit
  { value: "elternzeit-angelegt", label: "Elternzeit angelegt", group: "Elternzeit" },
  { value: "elternzeit-antrag-link-versandt", label: "Vorl. Magic-Link versandt", group: "Elternzeit" },
  { value: "elternzeit-antrag-eingereicht", label: "Vorl. Antrag eingereicht", group: "Elternzeit" },
  { value: "elternzeit-vorl-genehmigt", label: "Vorl. genehmigt", group: "Elternzeit" },
  { value: "elternzeit-vorl-abgelehnt", label: "Vorl. abgelehnt", group: "Elternzeit" },
  { value: "elternzeit-leiter-link-versandt", label: "Leiter-Magic-Link versandt", group: "Elternzeit" },
  { value: "elternzeit-endg-genehmigt", label: "Endg. genehmigt", group: "Elternzeit" },
  { value: "elternzeit-endg-abgelehnt", label: "Endg. abgelehnt", group: "Elternzeit" },
  { value: "elternzeit-br-detmold-generiert", label: "BR-Detmold-Brief generiert", group: "Elternzeit" },
  { value: "elternzeit-vbl-generiert", label: "VBL-Info-Brief generiert", group: "Elternzeit" },
  { value: "elternzeit-ag-bescheinigung-generiert", label: "AG-Bescheinigung generiert", group: "Elternzeit" },
  { value: "elternzeit-br-genehmigung-eingegangen", label: "BR-Genehmigung eingegangen", group: "Elternzeit" },
  { value: "elternzeit-frist-eskaliert", label: "Frist eskaliert (Cron)", group: "Elternzeit" },
  // Mutterschutz
  { value: "mutterschutz-angelegt", label: "Mutterschutz angelegt", group: "Mutterschutz" },
  { value: "mutterschutz-bad-beauftragt", label: "BAD beauftragt", group: "Mutterschutz" },
  { value: "mutterschutz-bad-abgeschlossen", label: "BAD abgeschlossen", group: "Mutterschutz" },
  { value: "mutterschutz-aktiviert", label: "Mutterschutz aktiviert", group: "Mutterschutz" },
  { value: "mutterschutz-beendet", label: "Mutterschutz beendet", group: "Mutterschutz" },
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
  const [activeTab, setActiveTab] = useState<
    "status" | "vorlagen" | "protokoll" | "smtp" | "webhooks" | "departments" | "api"
  >("status");
  const [smtpActive, setSmtpActive] = useState<boolean | null>(null);

  // SMTP-Status fuer das globale Warn-Banner laden
  useEffect(() => {
    fetch("/api/settings/email-status")
      .then((r) => r.json())
      .then((d) => setSmtpActive(Boolean(d.data?.smtp?.active)))
      .catch(() => setSmtpActive(null));
  }, [activeTab]);

  const tabs = [
    { id: "status" as const, label: "Versand-Status" },
    { id: "vorlagen" as const, label: "E-Mail-Vorlagen" },
    { id: "protokoll" as const, label: "Versandprotokoll" },
    { id: "smtp" as const, label: "SMTP" },
    { id: "webhooks" as const, label: "Webhooks" },
    { id: "departments" as const, label: "Abteilungen" },
    { id: "api" as const, label: "API-Zugang" },
  ];

  return (
    <div className="min-h-screen bg-muted">
      <PortalHeader user={user} />

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* Seitenheader */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-foreground">Einstellungen</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            E-Mail-Versand, Vorlagen, Webhooks und Abteilungen verwalten
          </p>
        </div>

        {/* Globales Warn-Banner: ohne aktives SMTP wird KEINE E-Mail versendet */}
        {smtpActive === false && (
          <div className="mb-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3">
            <p className="text-sm font-medium text-red-800">
              SMTP ist nicht aktiv — es werden derzeit KEINE E-Mails versendet.{" "}
              <button onClick={() => setActiveTab("smtp")} className="underline hover:no-underline">
                Jetzt SMTP konfigurieren
              </button>
            </p>
          </div>
        )}

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
        {activeTab === "status" && <StatusTab onConfigureSmtp={() => setActiveTab("smtp")} />}
        {activeTab === "vorlagen" && <VorlagenTab userEmail={user.email} />}
        {activeTab === "protokoll" && <ProtokollTab />}
        {activeTab === "smtp" && <SmtpTab />}
        {activeTab === "webhooks" && <WebhooksTab />}
        {activeTab === "departments" && <DepartmentsTab />}
        {activeTab === "api" && <ApiKeysTab />}
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
  const [prefillEvent, setPrefillEvent] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});
  // Filter
  const [filterText, setFilterText] = useState("");
  const [filterGroup, setFilterGroup] = useState<string>("ALLE");

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

  // Webhooks nach Prozess-Gruppe und dann Event gruppieren
  const groups = [
    "Onboarding",
    "Offboarding",
    "Verbeamtung",
    "Elternzeit",
    "Mutterschutz",
  ] as const;
  const groupColors: Record<string, string> = {
    Onboarding: "bg-credo-blau/10 text-credo-blau",
    Offboarding: "bg-credo-gruen/10 text-credo-gruen",
    Verbeamtung: "bg-purple-100 text-purple-800",
    Elternzeit: "bg-credo-gelb/20 text-foreground",
    Mutterschutz: "bg-credo-rot/10 text-credo-rot",
  };

  // Filter anwenden: filterGroup + Suchtext (Label oder Event-Name)
  const filterTextLower = filterText.trim().toLowerCase();
  const grouped = groups
    .filter((g) => filterGroup === "ALLE" || filterGroup === g)
    .map((group) => ({
      group,
      color: groupColors[group],
      events: WEBHOOK_EVENTS.filter((ev) => ev.group === group)
        .filter((ev) =>
          filterTextLower
            ? ev.label.toLowerCase().includes(filterTextLower) ||
              ev.value.toLowerCase().includes(filterTextLower)
            : true,
        )
        .map((ev) => ({
          event: ev.value,
          label: ev.label,
          webhooks: webhooks.filter((w) => w.event === ev.value),
        })),
    }))
    // leere Gruppen nach Filter ausblenden
    .filter((section) => section.events.length > 0);

  return (
    <div className="space-y-4">
      {success && <Alert type="success">{success}</Alert>}
      {error && <Alert type="error">{error}</Alert>}

      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Pro Event können mehrere Webhooks konfiguriert werden. Alle
          Webhooks werden hier verwaltet.
        </p>
        <button
          type="button"
          onClick={() => {
            setEditWebhook(null);
            setPrefillEvent(null);
            setShowModal(true);
          }}
          className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          + Neuer Webhook
        </button>
      </div>

      {/* Filter-Leiste */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Event durchsuchen (z.B. magic-link)"
          className="min-w-[220px] flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        />
        <select
          value={filterGroup}
          onChange={(e) => setFilterGroup(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        >
          <option value="ALLE">Alle Gruppen</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        {(filterText || filterGroup !== "ALLE") && (
          <button
            type="button"
            onClick={() => {
              setFilterText("");
              setFilterGroup("ALLE");
            }}
            className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
          >
            Filter zuruecksetzen
          </button>
        )}
      </div>

      {loading ? (
        <LoadingCard text="Lade Webhooks..." />
      ) : (
        grouped.map((section) => (
          <div key={section.group} className="space-y-3">
            {/* Gruppen-Überschrift */}
            <div className="flex items-center gap-2 pt-2">
              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${section.color}`}>
                {section.group}
              </span>
              <span className="text-xs text-muted-foreground">
                {section.events.reduce((sum, ev) => sum + ev.webhooks.length, 0)} Webhook{section.events.reduce((sum, ev) => sum + ev.webhooks.length, 0) !== 1 ? "s" : ""} konfiguriert
              </span>
            </div>

            {section.events.map((group) => (
          <div key={group.event} className="overflow-hidden rounded-lg border bg-card">
            {/* Event-Header */}
            <div className="border-b bg-muted/50 px-4 py-3 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="text-sm font-semibold text-foreground">{group.label}</span>
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">
                  {group.event}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {group.webhooks.length} Webhook{group.webhooks.length !== 1 ? "s" : ""}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditWebhook(null);
                    setPrefillEvent(group.event);
                    setShowModal(true);
                  }}
                  className="rounded-md border border-primary px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/5"
                  title={`Neuen Webhook für Event '${group.event}' anlegen`}
                >
                  + Webhook
                </button>
              </div>
            </div>

            {/* Webhook-Einträge */}
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
            ))}
          </div>
        ))
      )}

      {/* Hinweis */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <strong>Hinweis:</strong> Webhooks sind ein optionaler Zusatzkanal (z.B. für n8n-Automatisierungen)
        und werden ausschließlich hier konfiguriert. Der E-Mail-Versand läuft unabhängig davon immer über SMTP.
      </div>

      {/* Modal */}
      {showModal && (
        <WebhookModal
          initial={editWebhook}
          defaultEvent={prefillEvent}
          onClose={() => {
            setShowModal(false);
            setEditWebhook(null);
            setPrefillEvent(null);
          }}
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
            Primärer Versandkanal — alle E-Mails des Portals werden über diesen Server versendet.
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
              <span className="text-sm font-medium text-foreground">SMTP-Versand aktivieren</span>
              <p className="text-xs text-muted-foreground">
                Wenn deaktiviert, versendet das Portal KEINE E-Mails.
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
// TAB: Versand-Status (Konfigurations-Ampel je Event)
// =============================================
interface EmailEventStatus {
  event: string;
  name: string;
  group: string;
  recipientHint: string;
  wired: boolean;
  templateSource: "db" | "default" | null;
  templateActive: boolean;
  recipientConfigured: boolean;
  webhookCount: number;
  ok: boolean;
  issues: string[];
}

function StatusTab({ onConfigureSmtp }: { onConfigureSmtp: () => void }) {
  const [smtp, setSmtp] = useState<{ configured: boolean; active: boolean } | null>(null);
  const [events, setEvents] = useState<EmailEventStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/email-status")
      .then((r) => r.json())
      .then((d) => {
        setSmtp(d.data?.smtp ?? null);
        setEvents(d.data?.events ?? []);
      })
      .catch(() => setError("Versand-Status konnte nicht geladen werden"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingCard text="Lade Versand-Status..." />;
  if (error) return <Alert type="error">{error}</Alert>;

  const groups = TEMPLATE_GROUP_ORDER.map((group) => ({
    group,
    items: events.filter((e) => e.group === group),
  })).filter((g) => g.items.length > 0);

  const problemCount = events.filter((e) => !e.ok).length;

  return (
    <div className="space-y-4">
      {/* SMTP-Status */}
      <div
        className={`rounded-lg border px-4 py-3 ${
          smtp?.active ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <p className={`text-sm font-medium ${smtp?.active ? "text-green-800" : "text-red-800"}`}>
            {smtp?.active
              ? "SMTP ist aktiv — Ereignisse werden per E-Mail versendet."
              : smtp?.configured
                ? "SMTP ist konfiguriert, aber NICHT aktiv — es werden keine E-Mails versendet."
                : "SMTP ist nicht konfiguriert — es werden keine E-Mails versendet."}
          </p>
          {!smtp?.active && (
            <button
              onClick={onConfigureSmtp}
              className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              SMTP einrichten
            </button>
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {problemCount === 0
          ? "Alle Ereignisse sind vollständig konfiguriert."
          : `${problemCount} von ${events.length} Ereignissen ${problemCount === 1 ? "ist" : "sind"} nicht vollständig konfiguriert.`}
      </p>

      {groups.map(({ group, items }) => (
        <div key={group} className="overflow-hidden rounded-lg border bg-card">
          <div className="border-b bg-muted/40 px-5 py-3">
            <h3 className="text-sm font-semibold text-foreground">{group}</h3>
          </div>
          <div className="divide-y">
            {items.map((e) => (
              <div key={e.event} className="flex items-start gap-3 px-5 py-3">
                <span
                  className={`mt-1 h-3 w-3 shrink-0 rounded-full ${
                    e.ok ? "bg-green-500" : e.issues.length > 0 && !e.wired ? "bg-gray-400" : "bg-red-500"
                  }`}
                  title={e.ok ? "Konfiguriert" : e.issues.join(", ")}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{e.name}</span>
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 font-mono text-xs text-blue-700">
                      {e.event}
                    </span>
                    {e.templateSource === "default" && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        Standard-Vorlage
                      </span>
                    )}
                    {e.webhookCount > 0 && (
                      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                        +{e.webhookCount} Webhook{e.webhookCount > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  {e.issues.length > 0 && (
                    <p className="mt-0.5 text-xs text-red-700">{e.issues.join(" · ")}</p>
                  )}
                  {e.issues.length === 0 && e.recipientHint && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{e.recipientHint}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================
// TAB: API-Zugang (API-Keys fuer Reporting)
// =============================================
interface ApiKeyEntry {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

function ApiKeysTab() {
  const [keys, setKeys] = useState<ApiKeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  useAutoHide(success, setSuccess, 4000);
  useAutoHide(error, setError, 6000);

  const loadKeys = useCallback(() => {
    fetch("/api/settings/api-keys")
      .then((r) => r.json())
      .then((d) => setKeys(d.data ?? []))
      .catch(() => setError("API-Keys konnten nicht geladen werden"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    setCreatedKey(null);
    try {
      const res = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setCreatedKey(json.data.plaintextKey);
      setNewName("");
      loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "API-Key konnte nicht erstellt werden");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(key: ApiKeyEntry) {
    try {
      const res = await fetch(`/api/settings/api-keys/${key.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !key.isActive }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSuccess(`API-Key "${key.name}" ${key.isActive ? "deaktiviert" : "aktiviert"}`);
      loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aktion fehlgeschlagen");
    }
  }

  async function handleDelete(key: ApiKeyEntry) {
    if (!confirm(`API-Key "${key.name}" endgültig löschen? Externe Auswertungen mit diesem Key funktionieren danach nicht mehr.`)) return;
    try {
      const res = await fetch(`/api/settings/api-keys/${key.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      setSuccess(`API-Key "${key.name}" gelöscht`);
      loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Löschen fehlgeschlagen");
    }
  }

  if (loading) return <LoadingCard text="Lade API-Keys..." />;

  return (
    <div className="space-y-4">
      {success && <Alert type="success">{success}</Alert>}
      {error && <Alert type="error">{error}</Alert>}

      <div className="rounded-lg border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Reporting-API</h3>
        <p className="text-sm text-muted-foreground">
          Mit einem API-Key können externe Tools lesend auf Auswertungen zugreifen
          (z.B. aktuelle Kündigungen). Authentifizierung per Header{" "}
          <code className="rounded bg-muted px-1 font-mono text-xs">Authorization: Bearer &lt;Key&gt;</code> oder{" "}
          <code className="rounded bg-muted px-1 font-mono text-xs">X-API-Key</code>.
        </p>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-0.5">
          <li><code className="font-mono text-xs">GET /api/reports/offboardings</code> — Kündigungen (Filter: status, from, to, organizationId)</li>
          <li><code className="font-mono text-xs">GET /api/reports/onboardings</code> — Einstellungen (Filter: status, from, to, organizationId)</li>
          <li><code className="font-mono text-xs">GET /api/reports/elternzeit</code> — Elternzeit-Vorgänge (Filter: status, organizationId)</li>
        </ul>
      </div>

      {/* Neuer Key */}
      <div className="rounded-lg border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Neuen API-Key erstellen</h3>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder='Name, z.B. "PowerBI Auswertung"'
            className={`${inputClass} max-w-sm`}
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {creating ? "Wird erstellt..." : "Key erstellen"}
          </button>
        </div>
        {createdKey && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-2">
            <p className="text-sm font-medium text-amber-900">
              Key erstellt — JETZT kopieren, er wird nicht noch einmal angezeigt:
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="break-all rounded bg-white px-2 py-1 font-mono text-xs">{createdKey}</code>
              <button
                onClick={() => navigator.clipboard.writeText(createdKey)}
                className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-accent"
              >
                Kopieren
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Key-Liste */}
      {keys.length === 0 ? (
        <div className="rounded-lg border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
          Noch keine API-Keys vorhanden.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card divide-y">
          {keys.map((key) => (
            <div key={key.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{key.name}</span>
                  <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                    {key.prefix}…
                  </code>
                  {!key.isActive && (
                    <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
                      Deaktiviert
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Erstellt: {new Date(key.createdAt).toLocaleDateString("de-DE")}
                  {" · "}
                  Zuletzt genutzt: {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString("de-DE") : "nie"}
                </p>
              </div>
              <button
                onClick={() => handleToggle(key)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
              >
                {key.isActive ? "Deaktivieren" : "Aktivieren"}
              </button>
              <button
                onClick={() => handleDelete(key)}
                className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
              >
                Löschen
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================
// TAB: Versandprotokoll (EmailLog)
// =============================================
interface EmailLogEntry {
  id: string;
  event: string;
  recipient: string;
  cc: string | null;
  bcc: string | null;
  subject: string;
  status: "SENT" | "FAILED" | "SKIPPED";
  detail: string | null;
  messageId: string | null;
  isTest: boolean;
  createdAt: string;
}

const LOG_STATUS_STYLE: Record<string, { label: string; className: string }> = {
  SENT: { label: "Gesendet", className: "bg-green-100 text-green-800" },
  FAILED: { label: "Fehlgeschlagen", className: "bg-red-100 text-red-800" },
  SKIPPED: { label: "Übersprungen", className: "bg-amber-100 text-amber-800" },
};

function ProtokollTab() {
  const [logs, setLogs] = useState<EmailLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const loadLogs = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (statusFilter) params.set("status", statusFilter);
    if (eventFilter) params.set("event", eventFilter);
    fetch(`/api/settings/email-log?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setLogs(d.data?.logs ?? []);
        setTotalPages(d.data?.totalPages ?? 1);
        setTotal(d.data?.total ?? 0);
      })
      .catch(() => setError("Versandprotokoll konnte nicht geladen werden"))
      .finally(() => setLoading(false));
  }, [page, statusFilter, eventFilter]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  if (error) return <Alert type="error">{error}</Alert>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Jeder Versandversuch wird hier protokolliert (Aufbewahrung: 90 Tage). Übersprungene
        Ereignisse zeigen den Grund — z.B. fehlende Empfänger oder deaktivierte Vorlagen.
      </p>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className={`${inputClass} w-auto`}
        >
          <option value="">Alle Status</option>
          <option value="SENT">Gesendet</option>
          <option value="FAILED">Fehlgeschlagen</option>
          <option value="SKIPPED">Übersprungen</option>
        </select>
        <select
          value={eventFilter}
          onChange={(e) => { setEventFilter(e.target.value); setPage(1); }}
          className={`${inputClass} w-auto max-w-xs`}
        >
          <option value="">Alle Events</option>
          {WEBHOOK_EVENTS.map((ev) => (
            <option key={ev.value} value={ev.value}>{ev.label}</option>
          ))}
        </select>
        <button
          onClick={loadLogs}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
        >
          Aktualisieren
        </button>
        <span className="ml-auto text-sm text-muted-foreground">{total} Einträge</span>
      </div>

      {/* Liste */}
      {loading ? (
        <LoadingCard text="Lade Versandprotokoll..." />
      ) : logs.length === 0 ? (
        <div className="rounded-lg border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
          Keine Einträge gefunden.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card divide-y">
          {logs.map((log) => {
            const style = LOG_STATUS_STYLE[log.status] ?? LOG_STATUS_STYLE.SKIPPED;
            const isOpen = expandedLog === log.id;
            return (
              <div key={log.id}>
                <button
                  onClick={() => setExpandedLog(isOpen ? null : log.id)}
                  className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left hover:bg-muted/30"
                >
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.className}`}>
                    {style.label}
                  </span>
                  {log.isTest && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                      Test
                    </span>
                  )}
                  <span className="font-mono text-xs text-muted-foreground">{log.event}</span>
                  <span className="text-sm text-foreground">{log.recipient || "—"}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(log.createdAt).toLocaleString("de-DE")}
                  </span>
                </button>
                {isOpen && (
                  <div className="space-y-1 border-t bg-muted/20 px-4 py-3 text-sm">
                    {log.subject && <p><span className="text-muted-foreground">Betreff:</span> {log.subject}</p>}
                    {log.cc && <p><span className="text-muted-foreground">CC:</span> {log.cc}</p>}
                    {log.bcc && <p><span className="text-muted-foreground">BCC:</span> {log.bcc}</p>}
                    {log.detail && (
                      <p className={log.status === "SENT" ? "" : "text-red-700"}>
                        <span className="text-muted-foreground">Detail:</span> {log.detail}
                      </p>
                    )}
                    {log.messageId && (
                      <p className="font-mono text-xs text-muted-foreground">Message-ID: {log.messageId}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent disabled:opacity-50"
          >
            ← Zurück
          </button>
          <span className="text-sm text-muted-foreground">Seite {page} von {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent disabled:opacity-50"
          >
            Weiter →
          </button>
        </div>
      )}
    </div>
  );
}

// =============================================
// TAB 3: E-Mail-Vorlagen
// =============================================
const TEMPLATE_GROUP_ORDER = [
  "Onboarding",
  "Offboarding",
  "Exit-Interview",
  "Verbeamtung",
  "Elternzeit",
  "Mutterschutz",
  "Weitere",
];

function VorlagenTab({ userEmail }: { userEmail: string }) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<EmailTemplate>>({});
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState(userEmail);
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

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
    setTestResult(null);
    if (expanded === template.id) {
      setExpanded(null);
      setEditData({});
    } else {
      setExpanded(template.id);
      setEditData({ ...template });
    }
  }

  async function handleTestSend(template: EmailTemplate) {
    setTestSending(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/email-templates/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: template.event,
          recipientEmail: testEmail,
          // Aktuellen (ggf. ungespeicherten) Editor-Stand testen
          subject: editData.subject,
          bodyHtml: editData.bodyHtml,
          bodyText: editData.bodyText,
          recipientTo: editData.recipientTo,
          recipientCc: editData.recipientCc,
          recipientBcc: editData.recipientBcc,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setTestResult({ ok: true, message: json.data?.message ?? "Test-E-Mail versendet" });
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : "Test-Versand fehlgeschlagen",
      });
    } finally {
      setTestSending(false);
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
      // Mergen statt ersetzen: PUT-Antwort enthaelt group/recipientHint/wired nicht
      setTemplates((prev) => prev.map((t) => (t.event === template.event ? { ...t, ...updated } : t)));
      setExpanded(null);
      setSuccess(`Vorlage "${template.name}" gespeichert`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingCard text="Lade E-Mail-Vorlagen..." />;

  const groupedTemplates = TEMPLATE_GROUP_ORDER.map((group) => ({
    group,
    items: templates.filter((t) => (t.group || "Weitere") === group),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      {success && <Alert type="success">{success}</Alert>}
      {error && <Alert type="error">{error}</Alert>}

      <p className="text-sm text-muted-foreground">
        Jedes Ereignis wird über diese Vorlagen per SMTP versendet. Empfänger, Betreff und Inhalt sind
        je Vorlage konfigurierbar. Variablen im Format <code className="rounded bg-muted px-1 font-mono text-xs">{"{{variable}}"}</code> werden
        beim Versand ersetzt — auch in den Empfänger-Feldern.
      </p>

      {groupedTemplates.map(({ group, items }) => (
        <div key={group} className="space-y-2">
          <h3 className="pt-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {group}
          </h3>
          {items.map((template) => {
        const isOpen = expanded === template.id;
        return (
          <div key={template.id} className="overflow-hidden rounded-lg border bg-card">
            {/* Vorlage-Header */}
            <button
              onClick={() => handleExpand(template)}
              className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition-colors"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{template.name}</span>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 font-mono text-xs text-blue-700">
                  {template.event}
                </span>
                {!template.isActive && (
                  <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
                    Deaktiviert
                  </span>
                )}
                {!template.recipientTo && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    Kein Empfänger
                  </span>
                )}
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

                {/* Empfaenger */}
                <div className="rounded-lg border border-border p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Empfänger
                    {template.recipientHint && (
                      <span className="ml-2 normal-case font-normal">({template.recipientHint})</span>
                    )}
                  </p>
                  <FormField label="An" required>
                    <input
                      type="text"
                      value={editData.recipientTo ?? ""}
                      onChange={(e) => setEditData((prev) => ({ ...prev, recipientTo: e.target.value }))}
                      placeholder='z.B. {{email}} oder personal@fes-minden.de'
                      className={inputClass}
                    />
                  </FormField>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField label="CC (optional)">
                      <input
                        type="text"
                        value={editData.recipientCc ?? ""}
                        onChange={(e) => setEditData((prev) => ({ ...prev, recipientCc: e.target.value }))}
                        className={inputClass}
                      />
                    </FormField>
                    <FormField label="BCC (optional)">
                      <input
                        type="text"
                        value={editData.recipientBcc ?? ""}
                        onChange={(e) => setEditData((prev) => ({ ...prev, recipientBcc: e.target.value }))}
                        className={inputClass}
                      />
                    </FormField>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Mehrere Adressen mit Komma trennen. Variablen wie <code className="rounded bg-muted px-1 font-mono">{"{{email}}"}</code> und
                    Festadressen sind kombinierbar. Ohne An-Adresse wird das Ereignis nicht versendet.
                  </p>
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

                {/* Aktiv-Schalter */}
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={editData.isActive !== false}
                    onChange={(e) => setEditData((prev) => ({ ...prev, isActive: e.target.checked }))}
                    className="h-4 w-4 rounded border-border"
                  />
                  Vorlage aktiv (deaktiviert = Ereignis wird nicht versendet)
                </label>

                {/* Test-Versand */}
                <div className="rounded-lg bg-muted/50 p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Test-Versand</p>
                  <p className="text-xs text-muted-foreground">
                    Sendet den aktuellen Editor-Stand mit Beispieldaten und Betreff-Präfix [TEST] an die
                    angegebene Adresse (CC/BCC werden beim Test ignoriert).
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      type="email"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder="empfaenger@beispiel.de"
                      className={`${inputClass} max-w-xs`}
                    />
                    <button
                      onClick={() => handleTestSend(template)}
                      disabled={testSending || !testEmail}
                      className="rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
                    >
                      {testSending ? "Wird gesendet..." : "Test senden"}
                    </button>
                  </div>
                  {testResult && (
                    <p className={`text-sm ${testResult.ok ? "text-green-700" : "text-red-700"}`}>
                      {testResult.ok ? "✓ " : "✗ "}
                      {testResult.message}
                    </p>
                  )}
                </div>

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
      ))}
    </div>
  );
}

// =============================================
// Webhook Modal (Anlegen / Bearbeiten)
// =============================================
function WebhookModal({
  initial,
  defaultEvent,
  onClose,
  onSave,
}: {
  initial: WebhookConfig | null;
  defaultEvent?: string | null;
  onClose: () => void;
  onSave: (data: Partial<WebhookConfig>) => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<WebhookConfig>>(
    initial ?? {
      event: defaultEvent ?? "onboarding-created",
      authType: "none",
      isActive: true,
    },
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
// TAB 4: Abteilungen
// =============================================
function DepartmentsTab() {
  const [departments, setDepartments] = useState<DepartmentConfig[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Neues Abteilungs-Formular
  const [newName, setNewName] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newCustomKey, setNewCustomKey] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newOrgId, setNewOrgId] = useState("");
  const [formSaving, setFormSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [deptRes, orgRes] = await Promise.all([
        fetch("/api/settings/departments"),
        fetch("/api/organizations"),
      ]);
      const deptData = await deptRes.json();
      const orgData = await orgRes.json();
      setDepartments(deptData.data ?? []);
      setOrganizations(orgData.data ?? orgData ?? []);
    } catch {
      setError("Abteilungen konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useAutoHide(success, setSuccess, 4000);
  useAutoHide(error, setError, 6000);

  const deptKeyOptions = Object.entries(DEPARTMENT_KEYS).map(([, value]) => ({
    value,
    label: DEPARTMENT_LABELS[value] || value,
  }));

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const finalKey = newKey === "__custom__" ? newCustomKey : newKey;
    if (!newName || !finalKey || !newEmail) {
      setError("Bitte alle Pflichtfelder ausfüllen");
      return;
    }
    setFormSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          key: finalKey,
          email: newEmail,
          organizationId: newOrgId || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSuccess(`Abteilung "${newName}" angelegt`);
      setShowForm(false);
      setNewName("");
      setNewKey("");
      setNewCustomKey("");
      setNewEmail("");
      setNewOrgId("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Anlegen");
    } finally {
      setFormSaving(false);
    }
  }

  async function handleToggleActive(dept: DepartmentConfig) {
    try {
      const res = await fetch(`/api/settings/departments/${dept.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !dept.isActive }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSuccess(`"${dept.name}" ${dept.isActive ? "deaktiviert" : "aktiviert"}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    }
  }

  async function handleUpdateEmail(dept: DepartmentConfig) {
    if (!editEmail) { setError("E-Mail darf nicht leer sein"); return; }
    try {
      const res = await fetch(`/api/settings/departments/${dept.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: editEmail }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSuccess(`E-Mail für "${dept.name}" aktualisiert`);
      setEditingId(null);
      setEditEmail("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    }
  }

  async function handleDelete(dept: DepartmentConfig) {
    if (!confirm(`Abteilung "${dept.name}" wirklich löschen?`)) return;
    try {
      const res = await fetch(`/api/settings/departments/${dept.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      setSuccess(`"${dept.name}" gelöscht`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    }
  }

  if (loading) return <LoadingCard text="Lade Abteilungen..." />;

  return (
    <div className="space-y-4">
      {success && <Alert type="success">{success}</Alert>}
      {error && <Alert type="error">{error}</Alert>}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Abteilungen verwalten, die Offboarding-Aufgaben per Magic Link erhalten.
        </p>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {showForm ? "Abbrechen" : "+ Abteilung hinzufügen"}
        </button>
      </div>

      {/* Inline-Formular */}
      {showForm && (
        <form onSubmit={handleCreate} className="rounded-lg border bg-card p-5 space-y-4">
          <h3 className="font-semibold text-foreground">Neue Abteilung</h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Abteilungsname" required>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="z.B. IT-Abteilung Zweigstelle"
                className={inputClass}
              />
            </FormField>

            <FormField label="Abteilungs-Schlüssel" required>
              <select
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className={inputClass}
              >
                <option value="">-- Bitte waehlen --</option>
                {deptKeyOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} ({opt.value})
                  </option>
                ))}
                <option value="__custom__">Eigener Schlüssel...</option>
              </select>
            </FormField>
          </div>

          {newKey === "__custom__" && (
            <FormField label="Eigener Schlüssel" required>
              <input
                type="text"
                value={newCustomKey}
                onChange={(e) => setNewCustomKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
                placeholder="z.B. EMPFANG"
                className={inputClass}
              />
            </FormField>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="E-Mail" required>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="abteilung@credo-gruppe.de"
                className={inputClass}
              />
            </FormField>

            <FormField label="Einrichtung (optional)">
              <select
                value={newOrgId}
                onChange={(e) => setNewOrgId(e.target.value)}
                className={inputClass}
              >
                <option value="">Zentral (alle Einrichtungen)</option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={formSaving}
              className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {formSaving ? "Wird angelegt..." : "Abteilung anlegen"}
            </button>
          </div>
        </form>
      )}

      {/* Tabelle */}
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-semibold text-foreground">Abteilung</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">E-Mail</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">Einrichtung</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">Status</th>
                <th className="px-4 py-3 text-right font-semibold text-foreground">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {departments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Keine Abteilungen konfiguriert.
                  </td>
                </tr>
              ) : (
                departments.map((dept) => (
                  <tr key={dept.id} className={`${!dept.isActive ? "opacity-50" : ""}`}>
                    {/* Abteilung */}
                    <td className="px-4 py-3">
                      <div>
                        <span className="font-medium text-foreground">{dept.name}</span>
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                          {dept.key}
                        </span>
                      </div>
                    </td>

                    {/* E-Mail (inline-edit) */}
                    <td className="px-4 py-3">
                      {editingId === dept.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            className="w-48 rounded border border-input bg-background px-2 py-1 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                            autoFocus
                          />
                          <button
                            onClick={() => handleUpdateEmail(dept)}
                            className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90"
                          >
                            OK
                          </button>
                          <button
                            onClick={() => { setEditingId(null); setEditEmail(""); }}
                            className="rounded border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                          >
                            X
                          </button>
                        </div>
                      ) : (
                        <span
                          className="cursor-pointer text-foreground hover:underline"
                          onClick={() => { setEditingId(dept.id); setEditEmail(dept.email); }}
                          title="Klicken zum Bearbeiten"
                        >
                          {dept.email}
                        </span>
                      )}
                    </td>

                    {/* Einrichtung */}
                    <td className="px-4 py-3">
                      {dept.organizationId ? (
                        <span className="text-foreground">{dept.organizationName}</span>
                      ) : (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                          Zentral
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      {dept.isActive ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          Aktiv
                        </span>
                      ) : (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          Inaktiv
                        </span>
                      )}
                    </td>

                    {/* Aktionen */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleToggleActive(dept)}
                          className={`rounded-md border px-2.5 py-1 text-xs ${
                            dept.isActive
                              ? "border-red-200 text-red-700 hover:bg-red-50"
                              : "border-green-200 text-green-700 hover:bg-green-50"
                          }`}
                        >
                          {dept.isActive ? "Deakt." : "Aktiv."}
                        </button>
                        <button
                          onClick={() => handleDelete(dept)}
                          className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50"
                        >
                          Löschen
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hinweis */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <strong>Hinweis:</strong> Zentrale Abteilungen gelten für alle Einrichtungen.
        Einrichtungsspezifische Abteilungen überschreiben die zentrale Konfiguration für die jeweilige Einrichtung.
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
