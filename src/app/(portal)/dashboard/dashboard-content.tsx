"use client";

/**
 * HR-Dashboard – Client Component
 *
 * Zeigt alle Onboarding-Vorgaenge mit Status-Uebersicht,
 * Filtern und Aktionen (neuer Vorgang, Export).
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PortalHeader } from "@/components/portal-header";
import { NeuerVorgangModal } from "@/components/neuer-vorgang-modal";

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

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  INVITED: { label: "Eingeladen", color: "bg-[var(--color-status-invited)]/15 text-[var(--color-status-invited)]" },
  IN_PROGRESS: {
    label: "In Bearbeitung",
    color: "bg-[var(--color-status-in-progress)]/15 text-[var(--color-status-in-progress)]",
  },
  SUBMITTED: { label: "Eingereicht", color: "bg-[var(--color-status-submitted)]/15 text-[var(--color-status-submitted)]" },
  SUPERVISOR_PENDING: {
    label: "Vorgesetzter offen",
    color: "bg-[var(--color-status-supervisor-pending)]/15 text-[var(--color-status-supervisor-pending)]",
  },
  SUPERVISOR_SUBMITTED: {
    label: "Vorgesetzter fertig",
    color: "bg-[var(--color-status-supervisor-submitted)]/15 text-[var(--color-status-supervisor-submitted)]",
  },
  REVIEWED: { label: "Geprueft", color: "bg-[var(--color-status-reviewed)]/15 text-[var(--color-status-reviewed)]" },
  COMPLETED: { label: "Abgeschlossen", color: "bg-[var(--color-status-completed)]/15 text-[var(--color-status-completed)]" },
  EXPIRED: { label: "Abgelaufen", color: "bg-[var(--color-status-expired)]/15 text-[var(--color-status-expired)]" },
};

export function DashboardContent({ user }: { user: User }) {
  const [onboardings, setOnboardings] = useState<Onboarding[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [organizationFilter, setOrganizationFilter] = useState<string>("");
  const [displayIdSearch, setDisplayIdSearch] = useState<string>("");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [showNewModal, setShowNewModal] = useState(false);
  const router = useRouter();

  // Einrichtungen laden
  useEffect(() => {
    fetch("/api/organizations")
      .then((res) => res.json())
      .then((data) => {
        if (data.data) setOrganizations(data.data);
      })
      .catch(() => {});
  }, []);

  const loadOnboardings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (organizationFilter) params.set("organizationId", organizationFilter);

      const res = await fetch(`/api/onboarding?${params.toString()}`);
      const data = await res.json();
      setOnboardings(data.data || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error("Fehler beim Laden:", error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, organizationFilter]);

  useEffect(() => {
    loadOnboardings();
  }, [loadOnboardings]);

  return (
    <div className="min-h-screen bg-muted">
      <PortalHeader user={user} />

      {/* Dashboard Content */}
      <main className="mx-auto max-w-7xl px-4 py-6">
        {/* Status-Zusammenfassung */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            {
              label: "Gesamt",
              value: total,
              filter: "",
              color: "bg-card",
            },
            {
              label: "Eingeladen",
              value: onboardings.filter((o) => o.status === "INVITED").length,
              filter: "INVITED",
              color: "bg-blue-50",
            },
            {
              label: "In Bearbeitung",
              value: onboardings.filter(
                (o) =>
                  o.status === "IN_PROGRESS" || o.status === "SUBMITTED"
              ).length,
              filter: "IN_PROGRESS",
              color: "bg-yellow-50",
            },
            {
              label: "Abgeschlossen",
              value: onboardings.filter((o) => o.status === "COMPLETED").length,
              filter: "COMPLETED",
              color: "bg-green-50",
            },
          ].map((stat) => (
            <button
              key={stat.label}
              onClick={() => setStatusFilter(stat.filter)}
              className={`rounded-lg ${stat.color} border p-4 text-left transition-shadow hover:shadow-md ${
                statusFilter === stat.filter ? "ring-2 ring-primary" : ""
              }`}
            >
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">
            Onboarding-Vorgaenge
          </h2>
          <div className="flex items-center gap-3">
            {/* Vorgangs-ID Suche */}
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
                value={displayIdSearch}
                onChange={(e) => setDisplayIdSearch(e.target.value)}
                placeholder="Vorgangs-ID suchen..."
                className="rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
            </div>
            {/* Einrichtungs-Filter */}
            <select
              value={organizationFilter}
              onChange={(e) => setOrganizationFilter(e.target.value)}
              className="rounded-lg border border-input bg-background px-4 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            >
              <option value="">Alle Einrichtungen</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.mandantNumber})
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowNewModal(true)}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              + Neuer Vorgang
            </button>
          </div>
        </div>

        {/* Tabelle */}
        <div className="overflow-hidden rounded-lg border bg-card">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              Lade Vorgaenge...
            </div>
          ) : onboardings.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <p className="text-lg">Keine Vorgaenge vorhanden</p>
              <p className="mt-1 text-sm">
                Erstellen Sie einen neuen Onboarding-Vorgang oder nutzen Sie die
                API.
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted text-left text-xs font-medium uppercase text-muted-foreground">
                  <th className="px-4 py-3">Vorgangs-ID</th>
                  <th className="px-4 py-3">Name / E-Mail</th>
                  <th className="px-4 py-3">Einrichtung</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Fragebogen</th>
                  <th className="px-4 py-3">Vorgesetzter</th>
                  <th className="px-4 py-3">Notizen</th>
                  <th className="px-4 py-3">Datum</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {onboardings
                  .filter((ob) => {
                    if (!displayIdSearch) return true;
                    const search = displayIdSearch.toLowerCase();
                    return (
                      ob.displayId?.toLowerCase().includes(search) ?? false
                    );
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
                          ? "Vollstaendig"
                          : ob.personalData
                            ? `Step ${ob.personalData.currentStep}/10`
                            : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {ob.supervisorData?.isComplete
                          ? "Vollstaendig"
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
