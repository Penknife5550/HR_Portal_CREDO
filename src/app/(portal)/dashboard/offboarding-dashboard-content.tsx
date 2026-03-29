"use client";

/**
 * Offboarding-Dashboard – Client Component
 *
 * Zeigt alle Offboarding-Vorgaenge mit Status-Uebersicht,
 * Filtern, Sortierung, Pagination und Aktionen.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { NeuerAustrittModal } from "@/components/neuer-austritt-modal";
import { OFFBOARDING_STATUS_LABELS, EXIT_TYPE_LABELS } from "@/lib/constants";

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

interface Offboarding {
  id: string;
  displayId: string | null;
  employeeFirstName: string;
  employeeLastName: string;
  employeeEmail: string;
  exitType: string;
  status: string;
  lastWorkingDay: string | null;
  organization: {
    name: string;
    mandantNumber: string;
    type: string;
  };
  checklistProgress?: {
    completed: number;
    total: number;
  };
  returnProgress?: {
    returned: number;
    total: number;
  };
}

const PAGE_SIZE = 25;

// Status-Kacheln-Konfiguration
const STATUS_TILES = [
  { key: "INITIATED", color: "bg-blue-50" },
  { key: "NOTICE_PERIOD", color: "bg-yellow-50" },
  { key: "HANDOVER_PHASE", color: "bg-orange-50" },
  { key: "FINAL_SETTLEMENT", color: "bg-purple-50" },
  { key: "COMPLETED", color: "bg-green-50" },
  { key: "CANCELLED", color: "bg-gray-50" },
];

export function OffboardingDashboardContent({ user }: { user: User }) {
  const [offboardings, setOffboardings] = useState<Offboarding[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [organizationFilter, setOrganizationFilter] = useState<string>("");
  const [searchInput, setSearchInput] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [showNewModal, setShowNewModal] = useState(false);
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [showArchived, setShowArchived] = useState(false);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Einrichtungen laden
  useEffect(() => {
    fetch("/api/organizations")
      .then((res) => res.json())
      .then((data) => {
        if (data.data) setOrganizations(data.data);
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

  const loadOffboardings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (organizationFilter) params.set("organizationId", organizationFilter);
      if (searchQuery) params.set("search", searchQuery);
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);
      params.set("page", String(page + 1));
      params.set("limit", String(PAGE_SIZE));

      const res = await fetch(`/api/offboarding?${params.toString()}`);
      const data = await res.json();
      const allItems = data.data || [];
      const ARCHIVED_STATUSES = ["COMPLETED", "CANCELLED"];
      const filtered = showArchived ? allItems : allItems.filter((o: Offboarding) => !ARCHIVED_STATUSES.includes(o.status));
      setOffboardings(filtered);
      setTotal(showArchived ? (data.total || 0) : filtered.length);
      if (data.statusCounts) {
        setStatusCounts(data.statusCounts);
      }
    } catch (error) {
      console.error("Fehler beim Laden:", error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, organizationFilter, searchQuery, sortBy, sortOrder, page, showArchived]);

  useEffect(() => {
    loadOffboardings();
  }, [loadOffboardings]);

  // Bei Filterwechsel immer auf Seite 0 zurueck
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
      setSortOrder(field === "createdAt" || field === "lastWorkingDay" ? "desc" : "asc");
    }
    setPage(0);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasActiveFilters = statusFilter || organizationFilter || searchQuery;

  const SortIcon = ({ field }: { field: string }) => {
    if (sortBy !== field)
      return <span className="ml-1 text-muted-foreground/40">&#8597;</span>;
    return (
      <span className="ml-1">
        {sortOrder === "asc" ? "\u25B2" : "\u25BC"}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-muted">
      <main className="mx-auto max-w-7xl px-4 py-6">
        {/* Status-Kacheln */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {STATUS_TILES.map((tile) => {
            const statusInfo = OFFBOARDING_STATUS_LABELS[tile.key];
            const count = statusCounts[tile.key] || 0;
            return (
              <button
                key={tile.key}
                onClick={() => handleStatusFilter(tile.key)}
                className={`rounded-lg ${tile.color} border p-4 text-left transition-shadow hover:shadow-md ${
                  statusFilter === tile.key ? "ring-2 ring-primary" : ""
                }`}
              >
                <p className="text-2xl font-bold text-foreground">{count}</p>
                <p className="text-xs text-muted-foreground">
                  {statusInfo?.label || tile.key}
                </p>
              </button>
            );
          })}
        </div>

        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">
            Offboarding-Vorgänge
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
                placeholder="Name, E-Mail oder Vorgangs-ID..."
                className="w-64 rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
              {searchInput && (
                <button
                  onClick={() => {
                    setSearchInput("");
                    setSearchQuery("");
                    setPage(0);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
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
              className="rounded-lg border border-input bg-background px-4 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            >
              <option value="">Alle Einrichtungen</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.mandantNumber})
                </option>
              ))}
            </select>

            {/* Filter zuruecksetzen */}
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setStatusFilter("");
                  setOrganizationFilter("");
                  setSearchInput("");
                  setSearchQuery("");
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
                + Neuer Austritt
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
          ) : offboardings.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <p className="text-lg">
                {hasActiveFilters
                  ? "Keine Vorgänge für diese Filter gefunden"
                  : "Keine Offboarding-Vorgänge vorhanden"}
              </p>
              <p className="mt-1 text-sm">
                {hasActiveFilters
                  ? "Versuchen Sie andere Filterkriterien oder setzen Sie die Filter zurück."
                  : "Erstellen Sie einen neuen Offboarding-Vorgang."}
              </p>
            </div>
          ) : (
            <>
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted text-left text-xs font-medium uppercase text-muted-foreground">
                    <th
                      className="cursor-pointer select-none px-4 py-3 hover:text-foreground"
                      onClick={() => handleSort("displayId")}
                    >
                      Vorgangs-ID <SortIcon field="displayId" />
                    </th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Einrichtung</th>
                    <th className="px-4 py-3">Austrittsart</th>
                    <th
                      className="cursor-pointer select-none px-4 py-3 hover:text-foreground"
                      onClick={() => handleSort("lastWorkingDay")}
                    >
                      Letzter Arbeitstag <SortIcon field="lastWorkingDay" />
                    </th>
                    <th
                      className="cursor-pointer select-none px-4 py-3 hover:text-foreground"
                      onClick={() => handleSort("status")}
                    >
                      Status <SortIcon field="status" />
                    </th>
                    <th className="px-4 py-3">Checkliste</th>
                    <th className="px-4 py-3">Rückgaben</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {offboardings.map((ob) => {
                    const statusInfo =
                      OFFBOARDING_STATUS_LABELS[ob.status] ||
                      OFFBOARDING_STATUS_LABELS.INITIATED;
                    const exitTypeLabel =
                      EXIT_TYPE_LABELS[ob.exitType] || ob.exitType;

                    return (
                      <tr
                        key={ob.id}
                        className="cursor-pointer transition-colors hover:bg-muted/50"
                        onClick={() =>
                          router.push(`/dashboard/offboarding/${ob.id}`)
                        }
                      >
                        <td className="px-4 py-3">
                          {ob.displayId ? (
                            <span className="inline-flex rounded bg-muted px-2 py-0.5 font-mono text-xs font-medium text-foreground">
                              {ob.displayId}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">
                            {ob.employeeFirstName} {ob.employeeLastName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {ob.employeeEmail}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className="text-foreground">
                            {ob.organization.name}
                          </span>
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({ob.organization.mandantNumber})
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">
                          {exitTypeLabel}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {formatDate(ob.lastWorkingDay)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusInfo.color}`}
                          >
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {ob.checklistProgress
                            ? `${ob.checklistProgress.completed}/${ob.checklistProgress.total}`
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {ob.returnProgress
                            ? `${ob.returnProgress.returned}/${ob.returnProgress.total} zurück`
                            : "—"}
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
                            className={`rounded border px-2.5 py-1 text-xs font-medium ${
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

      {/* Neuer Austritt Modal */}
      <NeuerAustrittModal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreated={loadOffboardings}
      />
    </div>
  );
}
