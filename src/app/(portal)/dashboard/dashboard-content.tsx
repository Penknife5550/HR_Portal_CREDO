"use client";

/**
 * HR-Dashboard – Client Component
 *
 * Zeigt alle Onboarding-Vorgaenge mit Status-Uebersicht,
 * Filtern, Sortierung, Pagination und Aktionen.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { NeuerVorgangModal } from "@/components/neuer-vorgang-modal";
import { STATUS_LABELS } from "@/lib/constants";
import {
  OverdueBanner,
  DurationKPI,
  OverdueBadge,
} from "@/components/dashboard-kennzahlen";

// Die beiden Diagramme kommen nach, statt im Einstiegs-Bundle mitzureisen.
//
// recharts wiegt rund 145 kB und war fest in die Seite gelinkt: /dashboard
// lieferte 261 kB First-Load-JS -- den ersten Bildschirm nach dem Login.
// Gebraucht werden die Diagramme aber erst, wenn die Kennzahlen geladen sind,
// und sie stehen weit unten auf der Seite.
//
// ssr:false, weil recharts die Groesse seines Containers misst; serverseitig
// gerendert kaeme ein leeres Diagramm heraus, das der Browser sofort ersetzt.
const StatusPieChart = dynamic(
  () => import("@/components/dashboard-charts").then((m) => m.StatusPieChart),
  { ssr: false, loading: () => <ChartPlatzhalter /> }
);
const MonthlyTrendChart = dynamic(
  () => import("@/components/dashboard-charts").then((m) => m.MonthlyTrendChart),
  { ssr: false, loading: () => <ChartPlatzhalter /> }
);

/** Haelt die Hoehe frei, damit die Seite beim Nachladen nicht springt. */
function ChartPlatzhalter() {
  return (
    <div
      className="flex h-[300px] items-center justify-center rounded-lg bg-muted/30 text-sm text-muted-foreground"
      role="status"
      aria-label="Diagramm wird geladen"
    >
      Diagramm wird geladen …
    </div>
  );
}
import { formatProgress, type FragebogenFortschritt } from "@/lib/fragebogen-steps";

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
  shortName: string | null;
  type: string;
}

interface Onboarding {
  id: string;
  /** Serverseitig gegen die Vorlage dieses Vorgangs berechnet. */
  fragebogenFortschritt: FragebogenFortschritt;
  displayId: string | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  questionnaireType: string;
  invitedAt: string;
  submittedAt: string | null;
  organization: {
    name: string;
    mandantNumber: string;
    type: string;
  };
  personalData: {
    firstName: string | null;
    lastName: string | null;
    isComplete: boolean;
    currentStep: number;
  } | null;
  supervisorData: {
    isComplete: boolean;
    currentStep: number;
  } | null;
  _count?: { notes: number };
}

// Konsistente Definition: offene Status (für Ueberfaellig-Filter)
const OPEN_STATUSES = ["INVITED", "IN_PROGRESS", "SUBMITTED", "SUPERVISOR_PENDING", "SUPERVISOR_SUBMITTED"];

const PAGE_SIZE = 25;

export function DashboardContent({ user }: { user: User }) {
  const [onboardings, setOnboardings] = useState<Onboarding[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [organizationFilter, setOrganizationFilter] = useState<string>("");
  const [searchInput, setSearchInput] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [stats, setStats] = useState<{
    statusDistribution: { status: string; count: number }[];
    monthlyTrend: { month: string; created: number; completed: number }[];
    averageDuration: { days: number; processCount: number };
    overdue: { count: number; criticalCount: number; items: { id: string }[] };
  } | null>(null);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dashboard-Statistiken laden
  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((res) => res.json())
      .then((data) => { if (!data.error) setStats(data); })
      .catch(() => {});
  }, []);

  // Einrichtungen laden
  useEffect(() => {
    fetch("/api/organizations")
      .then((res) => res.json())
      .then((data) => {
        if (data.data) setOrganizations(data.data);
      })
      .catch(() => {});
  }, []);

  // Debounced search: Tippt der Nutzer, warten wir 400ms bevor die Suche ausgeloest wird
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchQuery(searchInput);
      setPage(0);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput]);

  const loadOnboardings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (organizationFilter) params.set("organizationId", organizationFilter);
      if (searchQuery) params.set("search", searchQuery);
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));

      // Das Archiv filtert der Server, nicht der Browser.
      //
      // Vorher holte die Seite bis zu PAGE_SIZE Datensaetze, warf daraus die
      // archivierten weg und setzte `total` auf die Laenge des Rests. Damit war
      // total nie groesser als eine Seite, totalPages also immer 1 und die
      // Blaetternavigation wurde nie gerendert: Ab dem 26. offenen Vorgang war
      // jeder weitere im Dashboard unerreichbar.
      if (!showArchived && !statusFilter) params.set("archiv", "aus");

      const res = await fetch(`/api/onboarding?${params.toString()}`);
      const data = await res.json();
      setOnboardings(data.data || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error("Fehler beim Laden:", error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, organizationFilter, searchQuery, sortBy, sortOrder, page, showArchived]);

  useEffect(() => {
    loadOnboardings();
  }, [loadOnboardings]);

  // Bei Filterwechsel immer auf Seite 0 zurück
  const handleStatusFilter = (filter: string) => {
    setStatusFilter(filter);
    setPage(0);
  };

  const handleOrgFilter = (orgId: string) => {
    setOrganizationFilter(orgId);
    setPage(0);
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder(field === "createdAt" ? "desc" : "asc");
    }
    setPage(0);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const SortIcon = ({ field }: { field: string }) => {
    if (sortBy !== field) return <span className="ml-1 text-muted-foreground/40">&#8597;</span>;
    return <span className="ml-1">{sortOrder === "asc" ? "▲" : "▼"}</span>;
  };

  return (
    <div className="min-h-screen bg-muted">
      {/* Dashboard Content */}
      <main className="mx-auto max-w-7xl px-4 py-6">
        {/* Status-Zusammenfassung */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            {
              label: "Gesamt",
              value: stats
                ? stats.statusDistribution.reduce((sum, s) => sum + s.count, 0)
                : total,
              filter: "",
              color: "bg-card",
            },
            {
              label: "Offen",
              value: stats
                ? stats.statusDistribution
                    .filter((s) => OPEN_STATUSES.includes(s.status))
                    .reduce((sum, s) => sum + s.count, 0)
                : onboardings.filter((o) => OPEN_STATUSES.includes(o.status)).length,
              filter: "OPEN",
              color: "bg-yellow-50",
            },
            {
              label: "Geprüft",
              value: stats
                ? stats.statusDistribution
                    .filter((s) => s.status === "REVIEWED")
                    .reduce((sum, s) => sum + s.count, 0)
                : onboardings.filter((o) => o.status === "REVIEWED").length,
              filter: "REVIEWED",
              color: "bg-blue-50",
            },
            {
              label: "Abgeschlossen",
              value: stats
                ? stats.statusDistribution
                    .filter((s) => s.status === "COMPLETED")
                    .reduce((sum, s) => sum + s.count, 0)
                : onboardings.filter((o) => o.status === "COMPLETED").length,
              filter: "COMPLETED",
              color: "bg-green-50",
            },
          ].map((stat) => (
            <button
              key={stat.label}
              onClick={() => handleStatusFilter(stat.filter)}
              className={`rounded-lg ${stat.color} border p-4 text-left transition-shadow hover:shadow-md ${
                statusFilter === stat.filter ? "ring-2 ring-primary" : ""
              }`}
            >
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </button>
          ))}
        </div>

        {/* Ueberfaellig-Banner */}
        {stats && stats.overdue.count > 0 && (
          <OverdueBanner
            count={stats.overdue.count}
            criticalCount={stats.overdue.criticalCount}
            onFilter={() => setShowOverdueOnly(!showOverdueOnly)}
          />
        )}

        {/* Charts & KPIs */}
        {stats && (
          <div className="mb-6 grid gap-4 lg:grid-cols-3">
            {/* Tortendiagramm: Status-Verteilung */}
            <div className="rounded-lg border bg-card p-4">
              <h3 className="mb-2 text-sm font-semibold text-foreground">
                Status-Verteilung
              </h3>
              <StatusPieChart data={stats.statusDistribution} />
            </div>
            {/* Balkendiagramm: Monatlicher Trend */}
            <div className="rounded-lg border bg-card p-4">
              <h3 className="mb-2 text-sm font-semibold text-foreground">
                Monatlicher Trend (6 Monate)
              </h3>
              <MonthlyTrendChart data={stats.monthlyTrend} />
            </div>
            {/* KPIs */}
            <div className="flex flex-col gap-4">
              <DurationKPI
                days={stats.averageDuration.days}
                processCount={stats.averageDuration.processCount}
              />
              <div className="rounded-lg border bg-card p-4">
                <p className="text-2xl font-bold text-foreground">
                  {stats.overdue.count}
                </p>
                <p className="text-xs text-muted-foreground">
                  Überfällige Vorgänge (&gt;7 Tage)
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">
            Onboarding-Vorgänge
            {total > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({total} {total === 1 ? "Vorgang" : "Vorgänge"})
              </span>
            )}
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            {/* Suche (Name, E-Mail, Vorgangs-ID) */}
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (debounceRef.current) clearTimeout(debounceRef.current);
                    setSearchQuery(searchInput);
                    setPage(0);
                  }
                }}
                placeholder="Name, E-Mail oder Vorgangs-ID..."
                className="w-64 rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
              {searchInput && (
                <button
                  onClick={() => { setSearchInput(""); setSearchQuery(""); setPage(0); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  title="Suche leeren"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {/* Einrichtungs-Filter */}
            <select
              value={organizationFilter}
              onChange={(e) => handleOrgFilter(e.target.value)}
              className="rounded-lg border border-input bg-background px-4 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            >
              <option value="">Alle Einrichtungen</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.mandantNumber})
                </option>
              ))}
            </select>
            {/* Alle Filter zuruecksetzen */}
            {(statusFilter || organizationFilter || searchQuery || showOverdueOnly) && (
              <button
                onClick={() => {
                  setStatusFilter("");
                  setOrganizationFilter("");
                  setSearchInput("");
                  setSearchQuery("");
                  setShowOverdueOnly(false);
                  setPage(0);
                }}
                className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
              >
                Filter zurücksetzen
              </button>
            )}
            <button
              onClick={() => setShowArchived(!showArchived)}
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                showArchived ? "border-credo-blau bg-credo-blau/10 text-credo-blau" : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {showArchived ? "Archiv ausblenden" : "Archiv anzeigen"}
            </button>
            {["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER", "EINRICHTUNGSLEITUNG"].includes(user.role) && (
              <button
                onClick={() => setShowNewModal(true)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                + Neuer Vorgang
              </button>
            )}
          </div>
        </div>

        {/* Tabelle */}
        <div className="overflow-x-auto rounded-lg border bg-card">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              <div className="mx-auto mb-2 h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Lade Vorgänge...
            </div>
          ) : onboardings.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <p className="text-lg">
                {searchQuery || statusFilter || organizationFilter
                  ? "Keine Vorgänge für diese Filter gefunden"
                  : "Keine Vorgänge vorhanden"}
              </p>
              <p className="mt-1 text-sm">
                {searchQuery || statusFilter || organizationFilter
                  ? "Versuchen Sie andere Filterkriterien oder setzen Sie die Filter zurück."
                  : "Erstellen Sie einen neuen Onboarding-Vorgang."}
              </p>
            </div>
          ) : (
            <>
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted text-left text-xs font-medium uppercase text-muted-foreground">
                    <th className="cursor-pointer select-none px-4 py-3 hover:text-foreground" onClick={() => handleSort("displayId")}>
                      Vorgangs-ID <SortIcon field="displayId" />
                    </th>
                    <th className="px-4 py-3">Name / E-Mail</th>
                    <th className="px-4 py-3">Einrichtung</th>
                    <th className="cursor-pointer select-none px-4 py-3 hover:text-foreground" onClick={() => handleSort("status")}>
                      Status <SortIcon field="status" />
                    </th>
                    <th className="px-4 py-3">Fragebogen</th>
                    <th className="px-4 py-3">Vorgesetzter</th>
                    <th className="px-4 py-3">Notizen</th>
                    <th className="cursor-pointer select-none px-4 py-3 hover:text-foreground" onClick={() => handleSort("createdAt")}>
                      Datum <SortIcon field="createdAt" />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {onboardings
                    .filter((ob) => {
                      if (!showOverdueOnly) return true;
                      const daysOpen = Math.floor((Date.now() - new Date(ob.invitedAt).getTime()) / 86400000);
                      return OPEN_STATUSES.includes(ob.status) && daysOpen >= 7;
                    })
                    .map((ob) => {
                    const displayName =
                      ob.personalData?.firstName && ob.personalData?.lastName
                        ? `${ob.personalData.firstName} ${ob.personalData.lastName}`
                        : ob.email;
                    const statusInfo =
                      STATUS_LABELS[ob.status] || STATUS_LABELS.INVITED;

                    return (
                      <tr
                        key={ob.id}
                        className="cursor-pointer transition-colors hover:bg-muted/50"
                        onClick={() => router.push(`/dashboard/${ob.id}`)}
                      >
                        <td className="px-4 py-3">
                          {ob.displayId ? (
                            <span className="inline-flex rounded bg-muted px-2 py-0.5 font-mono text-xs font-medium text-foreground">
                              {ob.displayId}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">
                            {displayName}
                          </div>
                          {ob.personalData?.firstName && (
                            <div className="text-xs text-muted-foreground">
                              {ob.email}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className="text-foreground">
                            {ob.organization.name}
                          </span>
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({ob.organization.mandantNumber})
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusInfo.color}`}
                          >
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {ob.personalData?.isComplete
                            ? "Vollständig"
                            : ob.personalData
                              ? formatProgress(ob.fragebogenFortschritt)
                              : "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {ob.supervisorData?.isComplete
                            ? "Vollständig"
                            : ob.supervisorData
                              ? "In Bearbeitung"
                              : "—"}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {ob._count?.notes && ob._count.notes > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                              <svg
                                className="h-3.5 w-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                                />
                              </svg>
                              {ob._count.notes}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {new Date(ob.invitedAt).toLocaleDateString("de-DE")}
                          <OverdueBadge invitedAt={ob.invitedAt} status={ob.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    Seite {page + 1} von {totalPages} ({total} Vorgänge)
                  </p>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setPage(0)}
                      disabled={page === 0}
                      className="rounded border px-2 py-1 text-xs disabled:opacity-30"
                      title="Erste Seite"
                    >
                      &#171;
                    </button>
                    <button
                      onClick={() => setPage(Math.max(0, page - 1))}
                      disabled={page === 0}
                      className="rounded border px-2 py-1 text-xs disabled:opacity-30"
                      title="Vorherige Seite"
                    >
                      &#8249;
                    </button>
                    {/* Seitenzahlen (max 5 anzeigen) */}
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) {
                        pageNum = i;
                      } else if (page < 3) {
                        pageNum = i;
                      } else if (page > totalPages - 4) {
                        pageNum = totalPages - 5 + i;
                      } else {
                        pageNum = page - 2 + i;
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setPage(pageNum)}
                          className={`rounded border px-2.5 py-1 text-xs font-medium ${
                            page === pageNum
                              ? "bg-primary text-primary-foreground"
                              : "hover:bg-accent"
                          }`}
                        >
                          {pageNum + 1}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                      disabled={page >= totalPages - 1}
                      className="rounded border px-2 py-1 text-xs disabled:opacity-30"
                      title="Nächste Seite"
                    >
                      &#8250;
                    </button>
                    <button
                      onClick={() => setPage(totalPages - 1)}
                      disabled={page >= totalPages - 1}
                      className="rounded border px-2 py-1 text-xs disabled:opacity-30"
                      title="Letzte Seite"
                    >
                      &#187;
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Neuer Vorgang Modal */}
      <NeuerVorgangModal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreated={loadOnboardings}
      />

    </div>
  );
}
