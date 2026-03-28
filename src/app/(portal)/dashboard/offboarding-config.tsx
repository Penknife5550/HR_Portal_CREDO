/**
 * Offboarding Dashboard – Konfiguration
 *
 * Prozessspezifische Einstellungen fuer das generische
 * Process-Dashboard, angepasst fuer Offboarding-Vorgaenge.
 */

import type { ProcessDashboardConfig, ProcessRow } from "@/components/process-dashboard/types";
import { OFFBOARDING_STATUS_LABELS, EXIT_TYPE_LABELS } from "@/lib/constants";

/**
 * Hilfsfunktion: Datum im deutschen Format anzeigen
 */
function formatDate(dateStr: unknown): string {
  if (!dateStr || typeof dateStr !== "string") return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export const offboardingDashboardConfig: ProcessDashboardConfig = {
  apiEndpoint: "/api/offboarding",
  exportEndpoint: "/api/offboarding/export",
  analyticsEndpoint: "/api/offboarding/analytics",
  detailUrlPrefix: "/dashboard/offboarding",
  title: "Offboarding-Vorgänge",
  createButtonLabel: "Neuer Austritt",
  searchPlaceholder: "Name, E-Mail oder Vorgangs-ID...",

  statusTiles: [
    { key: "INITIATED", label: "Erfasst", color: "bg-blue-50" },
    { key: "NOTICE_PERIOD", label: "Kündigungsfrist", color: "bg-yellow-50" },
    { key: "HANDOVER_PHASE", label: "Übergabe", color: "bg-orange-50" },
    { key: "FINAL_SETTLEMENT", label: "Endabrechnung", color: "bg-purple-50" },
    { key: "COMPLETED", label: "Abgeschlossen", color: "bg-green-50" },
    { key: "CANCELLED", label: "Abgebrochen", color: "bg-gray-50" },
  ],

  statusLabels: OFFBOARDING_STATUS_LABELS,

  columns: [
    {
      key: "displayId",
      label: "Vorgangs-ID",
      sortable: true,
      render: (value) =>
        value ? (
          <span className="inline-flex rounded bg-muted px-2 py-0.5 font-mono text-xs font-medium text-foreground">
            {String(value)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: "employeeName",
      label: "Name",
      sortable: false,
      render: (_value, row) => (
        <div>
          <div className="font-medium text-foreground">
            {String(row.employeeFirstName || "")} {String(row.employeeLastName || "")}
          </div>
          <div className="text-xs text-muted-foreground">
            {String(row.employeeEmail || "")}
          </div>
        </div>
      ),
    },
    {
      key: "organization",
      label: "Einrichtung",
      sortable: false,
      render: (value) => {
        const org = value as { name: string; mandantNumber: string } | null;
        if (!org) return <span className="text-muted-foreground">—</span>;
        return (
          <div>
            <span className="text-foreground">{org.name}</span>
            <span className="ml-1 text-xs text-muted-foreground">
              ({org.mandantNumber})
            </span>
          </div>
        );
      },
    },
    {
      key: "exitType",
      label: "Austrittsart",
      sortable: false,
      render: (value) => {
        const label = EXIT_TYPE_LABELS[String(value)] || String(value || "—");
        return <span className="text-foreground">{label}</span>;
      },
    },
    {
      key: "lastWorkingDay",
      label: "Letzter Arbeitstag",
      sortable: true,
      render: (value, row) => {
        const date = value as string;
        if (!date) return <span className="text-muted-foreground">—</span>;
        const formatted = new Date(date).toLocaleDateString("de-DE");
        const isPast = new Date(date) < new Date();
        const isOpen = !["COMPLETED", "CANCELLED"].includes(row.status as string);
        return (
          <div>
            <span className="text-muted-foreground">{formatted}</span>
            {isPast && isOpen && (
              <span className="ml-1.5 inline-flex rounded-full bg-credo-rot/10 px-2 py-0.5 text-[10px] font-semibold text-credo-rot">
                Überfällig
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value) => {
        const statusInfo =
          OFFBOARDING_STATUS_LABELS[String(value)] ||
          OFFBOARDING_STATUS_LABELS.INITIATED;
        return (
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusInfo.color}`}
          >
            {statusInfo.label}
          </span>
        );
      },
    },
    {
      key: "checklistProgress",
      label: "Checkliste",
      sortable: false,
      render: (value) => {
        const progress = value as { completed: number; total: number } | null;
        if (!progress) return <span className="text-muted-foreground">—</span>;
        return (
          <span className="text-muted-foreground">
            {progress.completed}/{progress.total}
          </span>
        );
      },
    },
    {
      key: "returnProgress",
      label: "Rückgaben",
      sortable: false,
      render: (value) => {
        const progress = value as { returned: number; total: number } | null;
        if (!progress) return <span className="text-muted-foreground">—</span>;
        return (
          <span className="text-muted-foreground">
            {progress.returned}/{progress.total} zurück
          </span>
        );
      },
    },
  ],

  defaultSortBy: "createdAt",
  defaultSortOrder: "desc",
  pageSize: 25,

  emptyStateText: "Keine Offboarding-Vorgänge vorhanden",
  emptyStateHint: "Erstellen Sie einen neuen Offboarding-Vorgang.",
  emptyFilterText: "Keine Vorgänge für diese Filter gefunden",
  emptyFilterHint: "Versuchen Sie andere Filterkriterien oder setzen Sie die Filter zurück.",
};
