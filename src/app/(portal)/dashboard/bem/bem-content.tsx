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
  name: string;
  mandantNumber: string;
  shortName: string | null;
}

interface BemFall {
  id: string;
  displayId: string;
  status: string;
  eingangsweg: string;
  employeeFirstName: string;
  employeeLastName: string;
  createdAt: string;
  organization: { id: string; name: string; mandantNumber: string } | null;
  _count?: { gespraeche: number; massnahmen: number; dokumente: number };
}

const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";

const STATUS_LABELS: Record<string, string> = {
  ANGELEGT: "Angelegt",
  EINLADUNG_VERSENDET: "Einladung versendet",
  EINWILLIGUNG_ERTEILT: "Einwilligung erteilt",
  EINWILLIGUNG_ABGELEHNT: "Einwilligung abgelehnt",
  ERSTGESPRAECH: "Erstgespräch",
  MASSNAHMEN_LAUFEN: "Maßnahmen laufen",
  ABGESCHLOSSEN: "Abgeschlossen",
  ABGEBROCHEN: "Abgebrochen",
  AUFBEWAHRUNG: "Aufbewahrung",
  GELOESCHT: "Gelöscht",
};

function statusBadgeClass(status: string): string {
  switch (status) {
    case "ABGESCHLOSSEN":
    case "EINWILLIGUNG_ERTEILT":
      return "bg-credo-gruen/10 text-credo-gruen border-credo-gruen/30";
    case "EINWILLIGUNG_ABGELEHNT":
    case "ABGEBROCHEN":
      return "bg-credo-rot/10 text-credo-rot border-credo-rot/30";
    case "GELOESCHT":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "bg-credo-blau/10 text-credo-blau border-credo-blau/30";
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

interface HandlungsbedarfItem {
  fallId: string;
  displayId: string;
  employeeName: string;
  bezeichnung: string;
  faelligAm: string;
  severity: string;
}

function severityChip(severity: string): { label: string; cls: string } {
  switch (severity) {
    case "OVERDUE":
      return { label: "Überfällig", cls: "bg-credo-rot/10 text-credo-rot border-credo-rot/30" };
    case "URGENT":
      return { label: "Dringend", cls: "bg-credo-rot/10 text-credo-rot border-credo-rot/30" };
    case "WARNING":
      return { label: "Bald fällig", cls: "bg-amber-100 text-amber-700 border-amber-300" };
    default:
      return { label: "Im Plan", cls: "bg-muted text-muted-foreground border-border" };
  }
}

export function BemContent({ user }: { user: User }) {
  const [faelle, setFaelle] = useState<BemFall[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [handlungsbedarf, setHandlungsbedarf] = useState<HandlungsbedarfItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (statusFilter) qs.set("status", statusFilter);
      if (search.trim()) qs.set("search", search.trim());
      const res = await fetch(`/api/bem?${qs.toString()}`);
      if (!res.ok) throw new Error("Fehler beim Laden der BEM-Faelle");
      const json = await res.json();
      setFaelle(json.data || []);
      setStatusCounts(json.statusCounts || {});
      setCanCreate(!!json.canCreate);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/organizations")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => setOrganizations(j.data || []))
      .catch(() => setOrganizations([]));
  }, []);

  useEffect(() => {
    fetch("/api/bem/handlungsbedarf")
      .then((r) => (r.ok ? r.json() : { data: { items: [] } }))
      .then((j) => setHandlungsbedarf(j.data?.items || []))
      .catch(() => setHandlungsbedarf([]));
  }, []);

  function notify(msg: string) {
    setSuccess(msg);
    setError("");
    setTimeout(() => setSuccess(""), 4000);
  }

  const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const laufend =
    (statusCounts.EINLADUNG_VERSENDET || 0) +
    (statusCounts.EINWILLIGUNG_ERTEILT || 0) +
    (statusCounts.ERSTGESPRAECH || 0) +
    (statusCounts.MASSNAHMEN_LAUFEN || 0);

  return (
    <div className="min-h-screen bg-background">
      <PortalHeader user={user} />

      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">🔒 BEM — Betriebliches Eingliederungsmanagement</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Versiegelte Akte (§ 167 SGB IX). Sichtbar sind ausschließlich
              Fälle, für die Sie freigegeben sind. Jeder Zugriff wird
              protokolliert.
            </p>
          </div>
          {canCreate && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-lg bg-credo-blau px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-credo-blau/90"
            >
              + Neuer Fall
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

        {/* Handlungsbedarf — fallübergreifende offene/überfällige Fristen */}
        {handlungsbedarf.length > 0 && (
          <div className="mb-6 overflow-hidden rounded-xl border border-credo-rot/30 bg-credo-rot/5">
            <div className="flex items-center justify-between border-b border-credo-rot/20 px-4 py-2">
              <h2 className="text-sm font-semibold text-foreground">
                ⚠️ Handlungsbedarf ({handlungsbedarf.length})
              </h2>
              <span className="text-xs text-muted-foreground">
                Fällige &amp; überfällige Fristen
              </span>
            </div>
            <ul className="divide-y divide-border">
              {handlungsbedarf.slice(0, 8).map((h, i) => {
                const chip = severityChip(h.severity);
                return (
                  <li key={`${h.fallId}-${i}`}>
                    <Link
                      href={`/dashboard/bem/${h.fallId}`}
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm hover:bg-credo-rot/5"
                    >
                      <span>
                        <span className="font-medium text-foreground">{h.displayId}</span>
                        <span className="text-muted-foreground"> · {h.employeeName}</span>
                        <span className="text-foreground"> — {h.bezeichnung}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          fällig {formatDate(h.faelligAm)}
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${chip.cls}`}>
                          {chip.label}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {handlungsbedarf.length > 8 && (
              <div className="px-4 py-2 text-xs text-muted-foreground">
                … und {handlungsbedarf.length - 8} weitere.
              </div>
            )}
          </div>
        )}

        {/* KPIs */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiCard label="Fälle gesamt" value={total} />
          <KpiCard label="Laufend" value={laufend} accent="blau" />
          <KpiCard label="Abgeschlossen" value={statusCounts.ABGESCHLOSSEN || 0} accent="gruen" />
          <KpiCard label="Abgebrochen" value={statusCounts.ABGEBROCHEN || 0} accent="rot" />
        </div>

        {/* Filter */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Alle Status</option>
            {Object.entries(STATUS_LABELS).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suche (Fall-Nr, Name)…"
            className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Fall-Nr.</th>
                <th className="px-4 py-3 font-medium">Beschäftigte:r</th>
                <th className="px-4 py-3 font-medium">Mandant</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Angelegt</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Lade Fälle…
                  </td>
                </tr>
              ) : faelle.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Keine freigegebenen BEM-Fälle.
                  </td>
                </tr>
              ) : (
                faelle.map((f) => (
                  <tr key={f.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {f.displayId}
                    </td>
                    <td className="px-4 py-3">
                      {f.employeeFirstName} {f.employeeLastName}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {f.organization
                        ? `${f.organization.mandantNumber} — ${f.organization.name}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(f.status)}`}
                      >
                        {STATUS_LABELS[f.status] || f.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(f.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/bem/${f.id}`}
                        className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        Öffnen
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {createOpen && (
        <CreateModal
          organizations={organizations}
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            notify("BEM-Fall angelegt.");
            load();
          }}
        />
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "blau" | "gruen" | "rot";
}) {
  const color =
    accent === "gruen"
      ? "text-credo-gruen"
      : accent === "rot"
        ? "text-credo-rot"
        : accent === "blau"
          ? "text-credo-blau"
          : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

// =============================================
// Anlege-Modal
// =============================================
function CreateModal({
  organizations,
  onClose,
  onSaved,
}: {
  organizations: Organization[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [employeeFirstName, setFirstName] = useState("");
  const [employeeLastName, setLastName] = useState("");
  const [employeeEmail, setEmail] = useState("");
  const [employeePersonalNr, setPersonalNr] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [eingangsweg, setEingangsweg] = useState<"DIGITAL" | "PAPIER">("DIGITAL");
  const [anlassFehlzeitenAb, setAnlass] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function handleSubmit() {
    setErr("");
    if (!employeeFirstName.trim() || !employeeLastName.trim()) {
      setErr("Vor- und Nachname sind erforderlich.");
      return;
    }
    if (!organizationId) {
      setErr("Bitte einen Mandanten wählen.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/bem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeFirstName: employeeFirstName.trim(),
          employeeLastName: employeeLastName.trim(),
          employeeEmail: employeeEmail.trim() || undefined,
          employeePersonalNr: employeePersonalNr.trim() || null,
          organizationId,
          eingangsweg,
          anlassFehlzeitenAb: anlassFehlzeitenAb || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error || "Fehler beim Anlegen.");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-card p-6 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Neuer BEM-Fall</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Schließen"
          >
            ✕
          </button>
        </div>

        {err && (
          <div className="mb-4 rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-4 py-2 text-sm text-credo-rot">
            {err}
          </div>
        )}

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Vorname</label>
              <input
                value={employeeFirstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Nachname</label>
              <input
                value={employeeLastName}
                onChange={(e) => setLastName(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">E-Mail (optional)</label>
              <input
                type="email"
                value={employeeEmail}
                onChange={(e) => setEmail(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Personalnummer (optional)</label>
              <input
                value={employeePersonalNr}
                onChange={(e) => setPersonalNr(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Mandant</label>
            <select
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">Bitte wählen…</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.mandantNumber} — {o.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Eingangsweg</label>
              <select
                value={eingangsweg}
                onChange={(e) => setEingangsweg(e.target.value as "DIGITAL" | "PAPIER")}
                className={INPUT_CLASS}
              >
                <option value="DIGITAL">Digital (Magic-Link)</option>
                <option value="PAPIER">Papier (Scan)</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Fehlzeiten ab (optional)</label>
              <input
                type="date"
                value={anlassFehlzeitenAb}
                onChange={(e) => setAnlass(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          </div>
        </div>

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
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-lg bg-credo-blau px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-credo-blau/90 disabled:opacity-50"
          >
            {saving ? "Lege an…" : "Fall anlegen"}
          </button>
        </div>
      </div>
    </div>
  );
}
