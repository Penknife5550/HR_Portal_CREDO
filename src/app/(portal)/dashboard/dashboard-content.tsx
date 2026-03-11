"use client";

/**
 * HR-Dashboard – Client Component
 *
 * Zeigt alle Onboarding-Vorgaenge mit Status-Uebersicht,
 * Filtern und Aktionen (neuer Vorgang, Export).
 */

import { useState, useEffect, useCallback } from "react";
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
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
                      onClick={() => setSelectedId(ob.id)}
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

      {/* Detail-Ansicht Sidebar */}
      {selectedId && (
        <DetailSidebar
          onboardingId={selectedId}
          onClose={() => setSelectedId(null)}
          onRefresh={loadOnboardings}
        />
      )}
    </div>
  );
}

// =============================================
// Detail-Sidebar fuer einen Onboarding-Vorgang
// =============================================
interface DocumentData {
  id: string;
  type: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  status: string;
  uploadedAt: string;
}

interface ChecklistItemData {
  id: string;
  title: string;
  category: string;
  orderIndex: number;
  isCompleted: boolean;
  completedAt: string | null;
  completedBy: { firstName: string; lastName: string } | null;
  dueDate: string | null;
  assignee: string | null;
  notes: string | null;
}

interface DetailData {
  id: string;
  displayId: string | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  questionnaireType: string;
  token: string;
  supervisorToken: string | null;
  supervisorEmail: string | null;
  invitedAt: string;
  submittedAt: string | null;
  organization: { name: string; mandantNumber: string };
  personalData: {
    firstName: string | null;
    lastName: string | null;
    isComplete: boolean;
    currentStep: number;
    street: string | null;
    city: string | null;
    iban: string | null;
    taxId: string | null;
    healthInsuranceName: string | null;
  } | null;
  supervisorData: {
    isComplete: boolean;
    currentStep: number;
    stellenbeschreibung: string | null;
    verguetungsmodell: string | null;
    entgeltgruppe: string | null;
  } | null;
  documents: DocumentData[];
  checklistItems: ChecklistItemData[];
  checklistTemplateId: string | null;
}

function DetailSidebar({
  onboardingId,
  onClose,
  onRefresh,
}: {
  onboardingId: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [supervisorEmail, setSupervisorEmail] = useState("");
  const [linkResult, setLinkResult] = useState<string | null>(null);
  const [checklistItems, setChecklistItems] = useState<ChecklistItemData[]>([]);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [togglingItems, setTogglingItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    fetch(`/api/onboarding/${onboardingId}`)
      .then((res) => res.json())
      .then((res) => {
        setData(res);
        setSupervisorEmail(res?.supervisorEmail || "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [onboardingId]);

  // Checklist laden
  useEffect(() => {
    setChecklistLoading(true);
    fetch(`/api/onboarding/${onboardingId}/checklist`)
      .then((res) => res.json())
      .then((res) => {
        if (res.data) setChecklistItems(res.data);
      })
      .catch(() => {})
      .finally(() => setChecklistLoading(false));
  }, [onboardingId]);

  const toggleChecklistItem = async (itemId: string, currentState: boolean) => {
    setTogglingItems((prev) => new Set(prev).add(itemId));
    try {
      const res = await fetch(
        `/api/onboarding/${onboardingId}/checklist/${itemId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isCompleted: !currentState }),
        }
      );
      if (res.ok) {
        const updated = await res.json();
        setChecklistItems((prev) =>
          prev.map((item) => (item.id === itemId ? updated : item))
        );
      }
    } catch {
      // Error handling
    } finally {
      setTogglingItems((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  const generateSupervisorLink = async () => {
    setGeneratingLink(true);
    try {
      const res = await fetch(
        `/api/onboarding/${onboardingId}/supervisor-link`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ supervisorEmail }),
        }
      );
      if (res.ok) {
        const result = await res.json();
        setLinkResult(result.modalitaetenLink);
        onRefresh();
      }
    } catch {
      // Error handling
    } finally {
      setGeneratingLink(false);
    }
  };

  const statusInfo = data ? STATUS_LABELS[data.status] || STATUS_LABELS.INVITED : STATUS_LABELS.INVITED;
  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md overflow-y-auto bg-card shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card px-6 py-4">
          <h2 className="text-lg font-bold text-foreground">
            Vorgang-Details
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-muted-foreground">
            Lade Details...
          </div>
        ) : data ? (
          <div className="space-y-6 p-6">
            {/* Status + Vorgangs-ID */}
            <div className="flex items-center gap-3">
              {data.displayId && (
                <span className="inline-flex rounded bg-muted px-2.5 py-1 font-mono text-xs font-semibold text-foreground">
                  {data.displayId}
                </span>
              )}
              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
              <span className="text-xs text-muted-foreground">
                {data.questionnaireType}
              </span>
            </div>

            {/* Person */}
            <div className="rounded-lg border border-border p-4">
              <h3 className="mb-2 text-sm font-semibold text-foreground">Person</h3>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">E-Mail</span>
                  <span className="font-medium">{data.email}</span>
                </div>
                {data.personalData?.firstName && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-medium">
                      {data.personalData.firstName} {data.personalData.lastName}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Einrichtung</span>
                  <span className="font-medium">
                    {data.organization.name} ({data.organization.mandantNumber})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Eingeladen am</span>
                  <span className="font-medium">
                    {new Date(data.invitedAt).toLocaleDateString("de-DE")}
                  </span>
                </div>
              </div>
            </div>

            {/* Personalfragebogen */}
            <div className="rounded-lg border border-border p-4">
              <h3 className="mb-2 text-sm font-semibold text-foreground">
                Personalfragebogen
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className="font-medium">
                    {data.personalData?.isComplete
                      ? "Vollstaendig"
                      : data.personalData
                        ? `Schritt ${data.personalData.currentStep}/10`
                        : "Nicht begonnen"}
                  </span>
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${appUrl}/fragebogen/${data.token}`}
                    className="flex-1 rounded border border-input bg-muted px-2 py-1 font-mono text-[10px]"
                  />
                  <button
                    onClick={() =>
                      navigator.clipboard.writeText(
                        `${appUrl}/fragebogen/${data.token}`
                      )
                    }
                    className="rounded bg-primary px-2 py-1 text-[10px] text-primary-foreground"
                  >
                    Kopieren
                  </button>
                </div>
              </div>
            </div>

            {/* Vorgesetzten-Link */}
            <div className="rounded-lg border border-border p-4">
              <h3 className="mb-2 text-sm font-semibold text-foreground">
                Einstellungsmodalitaeten (Vorgesetzter)
              </h3>
              {data.supervisorToken ? (
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <span className="font-medium">
                      {data.supervisorData?.isComplete
                        ? "Vollstaendig"
                        : data.supervisorData
                          ? `Schritt ${data.supervisorData.currentStep}/5`
                          : "Nicht begonnen"}
                    </span>
                  </div>
                  {data.supervisorEmail && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">E-Mail</span>
                      <span className="font-medium">{data.supervisorEmail}</span>
                    </div>
                  )}
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={`${appUrl}/modalitaeten/${data.supervisorToken}`}
                      className="flex-1 rounded border border-input bg-muted px-2 py-1 font-mono text-[10px]"
                    />
                    <button
                      onClick={() =>
                        navigator.clipboard.writeText(
                          `${appUrl}/modalitaeten/${data.supervisorToken}`
                        )
                      }
                      className="rounded bg-primary px-2 py-1 text-[10px] text-primary-foreground"
                    >
                      Kopieren
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Noch kein Vorgesetzten-Link generiert.
                  </p>
                  <div className="space-y-2">
                    <input
                      type="email"
                      value={supervisorEmail}
                      onChange={(e) => setSupervisorEmail(e.target.value)}
                      placeholder="E-Mail des Vorgesetzten"
                      className="w-full rounded border border-input bg-background px-3 py-2 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                    <button
                      onClick={generateSupervisorLink}
                      disabled={generatingLink}
                      className="w-full rounded bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                      {generatingLink
                        ? "Wird generiert..."
                        : "Vorgesetzten-Link generieren"}
                    </button>
                  </div>
                  {linkResult && (
                    <div className="mt-2 flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={linkResult}
                        className="flex-1 rounded border border-input bg-muted px-2 py-1 font-mono text-[10px]"
                      />
                      <button
                        onClick={() => navigator.clipboard.writeText(linkResult)}
                        className="rounded bg-primary px-2 py-1 text-[10px] text-primary-foreground"
                      >
                        Kopieren
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Dokumente */}
            <div className="rounded-lg border border-border p-4">
              <h3 className="mb-2 text-sm font-semibold text-foreground">
                Dokumente
              </h3>
              {data.documents && data.documents.length > 0 ? (
                <div className="space-y-2">
                  {data.documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between rounded-md border border-border bg-muted/50 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <svg
                            className="h-4 w-4 shrink-0 text-muted-foreground"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                            />
                          </svg>
                          <span className="truncate text-xs font-medium text-foreground">
                            {doc.fileName}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-3 pl-6 text-[10px] text-muted-foreground">
                          <span>{doc.type.replace(/_/g, " ")}</span>
                          <span>
                            {doc.fileSize < 1024
                              ? `${doc.fileSize} B`
                              : doc.fileSize < 1024 * 1024
                                ? `${(doc.fileSize / 1024).toFixed(1)} KB`
                                : `${(doc.fileSize / (1024 * 1024)).toFixed(1)} MB`}
                          </span>
                          <span>
                            {new Date(doc.uploadedAt).toLocaleDateString("de-DE")}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          doc.status === "APPROVED"
                            ? "bg-green-100 text-green-700"
                            : doc.status === "REJECTED"
                              ? "bg-red-100 text-red-700"
                              : doc.status === "REVIEWED"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {doc.status === "APPROVED"
                          ? "Genehmigt"
                          : doc.status === "REJECTED"
                            ? "Abgelehnt"
                            : doc.status === "REVIEWED"
                              ? "Geprueft"
                              : "Hochgeladen"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Keine Dokumente hochgeladen.
                </p>
              )}
            </div>

            {/* Checkliste */}
            <div className="rounded-lg border border-border p-4">
              <h3 className="mb-2 text-sm font-semibold text-foreground">
                Checkliste
              </h3>
              {checklistLoading ? (
                <p className="text-xs text-muted-foreground">
                  Lade Checkliste...
                </p>
              ) : checklistItems.length > 0 ? (
                <div className="space-y-3">
                  {/* Fortschrittsbalken */}
                  {(() => {
                    const completed = checklistItems.filter(
                      (i) => i.isCompleted
                    ).length;
                    const totalItems = checklistItems.length;
                    const pct =
                      totalItems > 0
                        ? Math.round((completed / totalItems) * 100)
                        : 0;
                    return (
                      <div>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="font-medium text-foreground">
                            {completed}/{totalItems} erledigt
                          </span>
                          <span className="text-muted-foreground">{pct}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-[#6BAA24] transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })()}

                  {/* Items gruppiert nach Kategorie */}
                  {(() => {
                    const grouped: Record<string, ChecklistItemData[]> = {};
                    checklistItems.forEach((item) => {
                      if (!grouped[item.category]) grouped[item.category] = [];
                      grouped[item.category].push(item);
                    });
                    return Object.entries(grouped).map(
                      ([category, items]) => (
                        <div key={category}>
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {category}
                          </p>
                          <div className="space-y-1">
                            {items
                              .sort((a, b) => a.orderIndex - b.orderIndex)
                              .map((item) => (
                                <label
                                  key={item.id}
                                  className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50"
                                >
                                  <input
                                    type="checkbox"
                                    checked={item.isCompleted}
                                    disabled={togglingItems.has(item.id)}
                                    onChange={() =>
                                      toggleChecklistItem(
                                        item.id,
                                        item.isCompleted
                                      )
                                    }
                                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[#6BAA24] accent-[#6BAA24]"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <span
                                      className={`text-xs ${
                                        item.isCompleted
                                          ? "text-muted-foreground line-through"
                                          : "text-foreground"
                                      }`}
                                    >
                                      {item.title}
                                    </span>
                                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                                      {item.dueDate && (
                                        <span>
                                          Faellig:{" "}
                                          {new Date(
                                            item.dueDate
                                          ).toLocaleDateString("de-DE")}
                                        </span>
                                      )}
                                      {item.assignee && (
                                        <span className="rounded bg-[#009AC6]/10 px-1.5 py-0.5 text-[#009AC6]">
                                          {item.assignee}
                                        </span>
                                      )}
                                      {item.isCompleted && item.completedBy && (
                                        <span>
                                          von {item.completedBy.firstName}{" "}
                                          {item.completedBy.lastName}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </label>
                              ))}
                          </div>
                        </div>
                      )
                    );
                  })()}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {data.checklistTemplateId
                    ? "Checkliste wird geladen..."
                    : "Keine Checkliste zugeordnet"}
                </p>
              )}
            </div>

            {/* Export-Button */}
            <div className="flex gap-2">
              <a
                href={`/api/onboarding/${data.id}/export?format=csv`}
                download
                className="flex-1 rounded-lg border border-border px-4 py-2 text-center text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
              >
                CSV Export
              </a>
              <a
                href={`/api/onboarding/${data.id}/export?format=json`}
                download
                className="flex-1 rounded-lg border border-border px-4 py-2 text-center text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
              >
                JSON Export
              </a>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-muted-foreground">
            Vorgang nicht gefunden.
          </div>
        )}
      </div>
    </div>
  );
}
