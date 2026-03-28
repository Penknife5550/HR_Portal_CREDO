"use client";

/**
 * Audit-Log Viewer – Client Component
 *
 * Zeigt alle Audit-Log-Eintraege in einer filterbaren Tabelle.
 * Filter: Datumsbereich, Aktionstyp, Benutzersuche.
 * Pagination, kollabierbare JSON-Details.
 */

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

interface AuditLogEntry {
  id: string;
  userId: string | null;
  offboardingId: string | null;
  onboardingId: string | null;
  processType: string | null;
  action: string;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  user: {
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const ACTION_LABELS: Record<string, string> = {
  CREATED: "Vorgang erstellt",
  STATUS_CHANGED: "Status geaendert",
  NOTE_CREATED: "Notiz erstellt",
  NOTE_UPDATED: "Notiz bearbeitet",
  NOTE_DELETED: "Notiz geloescht",
  DOCUMENT_UPLOADED: "Dokument hochgeladen",
  CHECKLIST_TOGGLED: "Checkliste aktualisiert",
  DEPARTMENT_LINKS_GENERATED: "Abteilungs-Links erstellt",
  REMINDER_SENT: "Reminder gesendet",
  EXIT_INTERVIEW_CREATED: "Exit-Interview erstellt",
  EXIT_INTERVIEW_SENT: "Exit-Interview versendet",
  ZEUGNIS_CREATED: "Zeugnis-Bewertung erstellt",
  ZEUGNIS_UPDATED: "Zeugnis-Bewertung aktualisiert",
  ONBOARDING_CREATED: "Onboarding erstellt",
  OFFBOARDING_CREATED: "Offboarding erstellt",
  QUESTIONNAIRE_SUBMITTED: "Fragebogen eingereicht",
  RETURN_ITEM_UPDATED: "Rueckgabe aktualisiert",
  DEPARTMENT_FEEDBACK_SUBMITTED: "Abteilungs-Feedback eingereicht",
};

function getActionLabel(action: string): string {
  return ACTION_LABELS[action] || action;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

function truncateJson(obj: Record<string, unknown> | null): string {
  if (!obj) return "-";
  const str = JSON.stringify(obj);
  if (str.length <= 80) return str;
  return str.slice(0, 80) + "...";
}

function DetailsCell({ details }: { details: Record<string, unknown> | null }) {
  const [expanded, setExpanded] = useState(false);

  if (!details || Object.keys(details).length === 0) {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1 text-left text-xs text-primary hover:underline"
      >
        {expanded ? "Einklappen" : truncateJson(details)}
        <svg
          className={`h-3 w-3 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs text-foreground">
          {JSON.stringify(details, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ProcessLink({ entry }: { entry: AuditLogEntry }) {
  if (entry.offboardingId) {
    return (
      <Link
        href={`/dashboard/offboarding/${entry.offboardingId}`}
        className="text-xs text-primary hover:underline"
      >
        Offboarding
      </Link>
    );
  }
  if (entry.onboardingId) {
    return (
      <Link
        href={`/dashboard/${entry.onboardingId}`}
        className="text-xs text-primary hover:underline"
      >
        Onboarding
      </Link>
    );
  }
  return <span className="text-muted-foreground">-</span>;
}

export function AuditLogContent({ user }: { user: User }) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });
  const [actions, setActions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter-State
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("limit", "50");
      if (filterFrom) params.set("from", filterFrom);
      if (filterTo) params.set("to", filterTo);
      if (filterAction) params.set("action", filterAction);
      if (filterSearch) params.set("search", filterSearch);

      const res = await fetch(`/api/audit-logs?${params.toString()}`);
      if (!res.ok) throw new Error("Fehler beim Laden");
      const data = await res.json();
      setLogs(data.data || []);
      setPagination(data.pagination);
      if (data.actions) setActions(data.actions);
    } catch (err) {
      console.error("Audit-Log laden fehlgeschlagen:", err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, filterFrom, filterTo, filterAction, filterSearch]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  function handleFilter() {
    setCurrentPage(1);
    loadLogs();
  }

  function handleReset() {
    setFilterFrom("");
    setFilterTo("");
    setFilterAction("");
    setFilterSearch("");
    setCurrentPage(1);
  }

  return (
    <div className="min-h-screen bg-background">
      <PortalHeader user={user} />

      <main className="mx-auto max-w-7xl px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-foreground">Audit-Log</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Protokoll aller Systemaktivitaeten
          </p>
        </div>

        {/* Filter */}
        <div className="mb-6 rounded-lg border border-border bg-card p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Von
              </label>
              <input autoComplete="off"
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
                autoComplete="off"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Bis
              </label>
              <input autoComplete="off"
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                autoComplete="off"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Aktion
              </label>
              <select autoComplete="off"
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                autoComplete="off"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Alle Aktionen</option>
                {actions.map((a) => (
                  <option key={a} value={a}>
                    {getActionLabel(a)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Benutzer
              </label>
              <input autoComplete="off"
                type="text"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleFilter()}
                placeholder="Name suchen..."
                autoComplete="off"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={handleFilter}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Filtern
              </button>
              <button
                onClick={handleReset}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
              >
                Zuruecksetzen
              </button>
            </div>
          </div>
        </div>

        {/* Ergebnis-Info */}
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {pagination.total} {pagination.total === 1 ? "Eintrag" : "Eintraege"} gefunden
          </p>
        </div>

        {/* Tabelle */}
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Zeitpunkt
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Benutzer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Aktion
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Details
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Vorgang
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Lade Audit-Log...
                      </div>
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      Keine Eintraege gefunden
                    </td>
                  </tr>
                ) : (
                  logs.map((entry) => (
                    <tr key={entry.id} className="transition-colors hover:bg-muted/30">
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground">
                        {formatDate(entry.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground">
                        {entry.user
                          ? `${entry.user.firstName} ${entry.user.lastName}`
                          : "System"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="inline-block rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
                          {getActionLabel(entry.action)}
                        </span>
                      </td>
                      <td className="max-w-xs px-4 py-3 text-sm">
                        <DetailsCell details={entry.details} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        <ProcessLink entry={entry} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Seite {pagination.page} von {pagination.totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                Zurueck
              </button>

              {/* Seitenzahlen */}
              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                let pageNum: number;
                if (pagination.totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= pagination.totalPages - 2) {
                  pageNum = pagination.totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      pageNum === currentPage
                        ? "bg-primary text-primary-foreground"
                        : "border border-border text-foreground hover:bg-accent"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={currentPage >= pagination.totalPages}
                className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                Weiter
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
