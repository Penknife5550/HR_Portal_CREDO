/**
 * Verbeamtung (PSI) Dashboard – Konfiguration
 *
 * Prozessspezifische Einstellungen fuer das generische
 * Process-Dashboard, angepasst fuer Verbeamtungsvorgaenge.
 */

import type { ProcessDashboardConfig, ProcessRow } from "@/components/process-dashboard/types";
import { CIVIL_SERVICE_STATUS_LABELS, CIVIL_SERVICE_STEP_LABELS } from "@/lib/constants";

export const civilServiceDashboardConfig: ProcessDashboardConfig = {
  apiEndpoint: "/api/civil-service",
  exportEndpoint: "/api/civil-service/export",
  analyticsEndpoint: "/api/civil-service/analytics",
  detailUrlPrefix: "/dashboard/civil-service",
  title: "Verbeamtung",
  createButtonLabel: "Neue Verbeamtung",
  searchPlaceholder: "Name, E-Mail oder Vorgangs-ID...",

  statusTiles: [
    { key: "DRAFT", label: "Antrag", color: "bg-blue-50" },
    { key: "ADMINISTRATION", label: "Verwaltung", color: "bg-purple-50" },
    { key: "PROBATION", label: "Probezeit", color: "bg-yellow-50" },
    { key: "LIFETIME_PENDING", label: "Uebernahme", color: "bg-orange-50" },
    { key: "COMPLETED", label: "Abgeschlossen", color: "bg-green-50" },
    { key: "OVERDUE", label: "Frist!", color: "bg-red-50" },
  ],

  statusLabels: CIVIL_SERVICE_STATUS_LABELS,

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
      label: "Schule",
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
      key: "currentStep",
      label: "Schritt",
      sortable: true,
      render: (value) => {
        const step = Number(value) || 1;
        const stepLabel =
          CIVIL_SERVICE_STEP_LABELS[step] || `Schritt ${step}`;
        return (
          <div className="flex items-center gap-1.5">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-credo-gruen/15 text-[10px] font-bold text-credo-gruen">
              {step}
            </span>
            <span className="text-xs text-muted-foreground">{stepLabel}</span>
          </div>
        );
      },
    },
    {
      key: "phases",
      label: "Phase",
      sortable: false,
      render: (value) => {
        const phases = value as { phaseKey: string; status: string }[] | null;
        if (!phases || phases.length === 0) {
          return <span className="text-muted-foreground">—</span>;
        }
        // Aktive Phase finden (erste IN_PROGRESS oder letzte COMPLETED + 1)
        const activePhase =
          phases.find((p) => p.status === "IN_PROGRESS") ||
          phases.find((p) => p.status === "PENDING");
        if (!activePhase) {
          return (
            <span className="text-xs text-green-600 font-medium">Alle abgeschlossen</span>
          );
        }
        return (
          <span className="inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-800">
            {activePhase.phaseKey}
          </span>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value) => {
        const statusInfo =
          CIVIL_SERVICE_STATUS_LABELS[String(value)] ||
          CIVIL_SERVICE_STATUS_LABELS.DRAFT;
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
      label: "Fortschritt",
      sortable: false,
      render: (value) => {
        const progress = value as { completed: number; total: number } | null;
        if (!progress || progress.total === 0) {
          return <span className="text-muted-foreground">—</span>;
        }
        const pct = Math.round((progress.completed / progress.total) * 100);
        return (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-credo-gruen transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {progress.completed}/{progress.total}
            </span>
          </div>
        );
      },
    },
  ],

  defaultSortBy: "createdAt",
  defaultSortOrder: "desc",
  pageSize: 25,

  emptyStateText: "Keine Verbeamtungsvorgaenge vorhanden",
  emptyStateHint: "Erstellen Sie einen neuen Verbeamtungsvorgang.",
  emptyFilterText: "Keine Vorgaenge fuer diese Filter gefunden",
  emptyFilterHint: "Versuchen Sie andere Filterkriterien oder setzen Sie die Filter zurueck.",
};
