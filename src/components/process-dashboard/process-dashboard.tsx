"use client";

/**
 * Process Dashboard – Generische, wiederverwendbare Komponente
 *
 * Kann fuer Onboarding, Offboarding, Verbeamtung und alle
 * zukuenftigen HR-Prozesse verwendet werden.
 */

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ProcessDashboardConfig, ProcessRow } from "./types";
import { AnalyticsDashboard } from "@/components/analytics-dashboard";

interface Organization {
  id: string;
  mandantNumber: string;
  name: string;
  shortName: string | null;
  type: string;
}

export interface ProcessDashboardProps {
  config: ProcessDashboardConfig;
  /** Optionale Render-Funktion fuer das Erstellen-Modal */
  renderCreateModal?: (props: {
    open: boolean;
    onClose: () => void;
    onCreated: () => void;
  }) => ReactNode;
}

export function ProcessDashboard({ config, renderCreateModal }: ProcessDashboardProps) {
  const {
    apiEndpoint,
    detailUrlPrefix,
    title,
    createButtonLabel,
    searchPlaceholder = "Name, E-Mail oder Vorgangs-ID...",
    statusTiles,
    statusLabels,
    columns,
    defaultSortBy = "createdAt",
    defaultSortOrder = "desc",
    pageSize = 25,
    emptyStateText,
    emptyFilterText,
    emptyStateHint,
    emptyFilterHint,
    exportEndpoint,
    analyticsEndpoint,
  } = config;

  const [data, setData] = useState<ProcessRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [organizationFilter, setOrganizationFilter] = useState<string>("");
  const [searchInput, setSearchInput] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(0);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState(defaultSortBy);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(defaultSortOrder);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [showAnalytics, setShowAnalytics] = useState(false);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Einrichtungen laden
  useEffect(() => {
    fetch("/api/organizations")
      .then((res) => res.json())
      .then((result) => {
        if (result.data) setOrganizations(result.data);
      })
      .catch(() => {});
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchQuery(searchInput);
      setPage(0);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (organizationFilter) params.set("organizationId", organizationFilter);
      if (searchQuery) params.set("search", searchQuery);
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);
      params.set("page", String(page + 1));
      params.set("limit", String(pageSize));

      const res = await fetch(`${apiEndpoint}?${params.toString()}`);
      const result = await res.json();
      const allItems = result.data || [];
      const ARCHIVED_STATUSES = ["COMPLETED", "CANCELLED", "REJECTED"];
      const filtered = showArchived ? allItems : allItems.filter((o: ProcessRow) => !ARCHIVED_STATUSES.includes(String(o.status)));
      setData(filtered);
      setTotal(showArchived ? (result.total || 0) : filtered.length);
      if (result.statusCounts) {
        setStatusCounts(result.statusCounts);
      }
    } catch (error) {
      console.error("Fehler beim Laden:", error);
    } finally {
      setLoading(false);
    }
  }, [apiEndpoint, statusFilter, organizationFilter, searchQuery, dateFrom, dateTo, sortBy, sortOrder, page, pageSize, showArchived]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter-Handler
  const handleStatusFilter = (filter: string) => {
    setStatusFilter((prev) => (prev === filter ? "" : filter));
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
      // Datumsfelder standardmaessig absteigend
      const dateFields = ["createdAt", "lastWorkingDay", "invitedAt", "submittedAt", "startDate", "endDate"];
      setSortOrder(dateFields.includes(field) ? "desc" : "asc");
    }
    setPage(0);
  };

  const handleResetFilters = () => {
    setStatusFilter("");
    setOrganizationFilter("");
    setSearchInput("");
    setSearchQuery("");
    setDateFrom("");
    setDateTo("");
    setPage(0);
  };

  const totalPages = Math.ceil(total / pageSize);
  const hasActiveFilters = statusFilter || organizationFilter || searchQuery || dateFrom || dateTo;

  const SortIcon = ({ field }: { field: string }) => {
    if (sortBy !== field)
      return <span className="ml-1 text-muted-foreground/40">&#8597;</span>;
    return (
      <span className="ml-1">
        {sortOrder === "asc" ? "\u25B2" : "\u25BC"}
      </span>
    );
  };

  // Zellenwert aus einer Zeile auslesen (Top-Level-Key)
  const getCellValue = (row: ProcessRow, key: string): unknown => {
    return row[key];
  };

  // Standard-Zellenrendering
  const renderCellDefault = (value: unknown): ReactNode => {
    if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return <>{String(value)}</>;
    }
    return <>{JSON.stringify(value)}</>;
  };

  return (
    <div className="min-h-screen bg-muted">
      <main className="mx-auto max-w-7xl px-4 py-6">
        {/* Status-Kacheln */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {statusTiles.map((tile) => {
            const statusInfo = statusLabels[tile.key];
            const count = statusCounts[tile.key] || 0;
            return (
              <button
                key={tile.key}
                onClick={() => handleStatusFilter(tile.key)}
                className={`min-h-[44px] rounded-lg ${tile.color} border p-4 text-left transition-shadow hover:shadow-md ${
                  statusFilter === tile.key ? "ring-2 ring-primary" : ""
                }`}
              >
                <p className="text-2xl font-bold text-foreground">{count}</p>
                <p className="text-xs text-muted-foreground">
                  {statusInfo?.label || tile.label}
                </p>
              </button>
            );
          })}
        </div>

        {/* Analytics Toggle + Dashboard */}
        {analyticsEndpoint && (
          <div className="mb-6">
            <button
              onClick={() => setShowAnalytics((prev) => !prev)}
              className="mb-4 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <svg
                className={`h-3.5 w-3.5 transition-transform duration-200 ${showAnalytics ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              {showAnalytics ? "Analytics ausblenden" : "Analytics anzeigen"}
            </button>
            {showAnalytics && (
              <AnalyticsDashboard
                apiEndpoint={analyticsEndpoint}
                dateFrom={dateFrom || undefined}
                dateTo={dateTo || undefined}
                organizationId={organizationFilter || undefined}
              />
            )}
          </div>
        )}

        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">
            {title}
            {total > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({total} {total === 1 ? "Vorgang" : "Vorgänge"})
              </span>
            )}
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            {/* Suche */}
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
                placeholder={searchPlaceholder}
                autoComplete="off"
                className="w-64 rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
              {searchInput && (
                <button
                  onClick={() => {
                    setSearchInput("");
                    setSearchQuery("");
                    setPage(0);
                  }}
                  className="absolute right-2 top-1/2 min-h-[44px] min-w-[44px] -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  title="Suche leeren"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>

            {/* Einrichtungs-Filter */}
            <select
              value={organizationFilter}
              onChange={(e) => handleOrgFilter(e.target.value)}
              autoComplete="off"
              className="min-h-[44px] rounded-lg border border-input bg-background px-4 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            >
              <option value="">Alle Einrichtungen</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.mandantNumber})
                </option>
              ))}
            </select>

            {/* Zeitraum-Filter */}
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
                className="rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                autoComplete="off"
                title="Von"
              />
              <span className="text-xs text-muted-foreground">&ndash;</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
                className="rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                autoComplete="off"
                title="Bis"
              />
            </div>

            {/* Filter zuruecksetzen */}
            {hasActiveFilters && (
              <button
                onClick={handleResetFilters}
                className="min-h-[44px] rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
              >
                Filter zurücksetzen
              </button>
            )}

            {/* CSV-Export */}
            {exportEndpoint && (
              <button
                onClick={() => {
                  const params = new URLSearchParams();
                  if (statusFilter) params.set("status", statusFilter);
                  if (organizationFilter) params.set("organizationId", organizationFilter);
                  if (searchQuery) params.set("search", searchQuery);
                  if (dateFrom) params.set("from", dateFrom);
                  if (dateTo) params.set("to", dateTo);
                  const qs = params.toString();
                  window.open(`${exportEndpoint}${qs ? `?${qs}` : ""}`, "_blank");
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                title="Als CSV exportieren"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3"
                  />
                </svg>
                CSV
              </button>
            )}

            {/* Erstellen-Button */}
            <button
              onClick={() => setShowArchived(!showArchived)}
              className={`min-h-[44px] rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                showArchived ? "border-credo-blau bg-credo-blau/10 text-credo-blau" : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {showArchived ? "Archiv ausblenden" : "Archiv anzeigen"}
            </button>
            {renderCreateModal && (
              <button
                onClick={() => setShowNewModal(true)}
                className="min-h-[44px] rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                + {createButtonLabel}
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
          ) : data.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <p className="text-lg">
                {hasActiveFilters
                  ? (emptyFilterText || "Keine Vorgänge für diese Filter gefunden")
                  : (emptyStateText || `Keine ${title} vorhanden`)}
              </p>
              <p className="mt-1 text-sm">
                {hasActiveFilters
                  ? (emptyFilterHint || "Versuchen Sie andere Filterkriterien oder setzen Sie die Filter zurück.")
                  : (emptyStateHint || "Erstellen Sie einen neuen Vorgang.")}
              </p>
            </div>
          ) : (
            <>
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted text-left text-xs font-medium uppercase text-muted-foreground">
                    {columns.map((col) => (
                      <th
                        key={col.key}
                        className={`px-4 py-3 ${
                          col.sortable
                            ? "cursor-pointer select-none hover:text-foreground"
                            : ""
                        }`}
                        onClick={col.sortable ? () => handleSort(col.key) : undefined}
                      >
                        {col.label}
                        {col.sortable && <SortIcon field={col.key} />}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer transition-colors hover:bg-muted/50"
                      onClick={() => router.push(`${detailUrlPrefix}/${row.id}`)}
                    >
                      {columns.map((col) => {
                        const value = getCellValue(row, col.key);
                        return (
                          <td key={col.key} className="px-4 py-3 text-sm">
                            {col.render
                              ? col.render(value, row)
                              : renderCellDefault(value)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
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
                      className="min-h-[44px] min-w-[44px] rounded border px-2 py-1 text-xs disabled:opacity-30"
                      title="Erste Seite"
                    >
                      &#171;
                    </button>
                    <button
                      onClick={() => setPage(Math.max(0, page - 1))}
                      disabled={page === 0}
                      className="min-h-[44px] min-w-[44px] rounded border px-2 py-1 text-xs disabled:opacity-30"
                      title="Vorherige Seite"
                    >
                      &#8249;
                    </button>
                    {Array.from(
                      { length: Math.min(5, totalPages) },
                      (_, i) => {
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
                            className={`min-h-[44px] min-w-[44px] rounded border px-2.5 py-1 text-xs font-medium ${
                              page === pageNum
                                ? "bg-primary text-primary-foreground"
                                : "hover:bg-accent"
                            }`}
                          >
                            {pageNum + 1}
                          </button>
                        );
                      }
                    )}
                    <button
                      onClick={() =>
                        setPage(Math.min(totalPages - 1, page + 1))
                      }
                      disabled={page >= totalPages - 1}
                      className="min-h-[44px] min-w-[44px] rounded border px-2 py-1 text-xs disabled:opacity-30"
                      title="Nächste Seite"
                    >
                      &#8250;
                    </button>
                    <button
                      onClick={() => setPage(totalPages - 1)}
                      disabled={page >= totalPages - 1}
                      className="min-h-[44px] min-w-[44px] rounded border px-2 py-1 text-xs disabled:opacity-30"
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

      {/* Erstellen-Modal */}
      {renderCreateModal?.({
        open: showNewModal,
        onClose: () => setShowNewModal(false),
        onCreated: loadData,
      })}
    </div>
  );
}
