/**
 * Mutterschutz Dashboard – Konfiguration für ProcessDashboard
 */

import type { ProcessDashboardConfig } from "@/components/process-dashboard/types";

const MUTTERSCHUTZ_STATUS_LABELS: Record<
  string,
  { label: string; color: string }
> = {
  GEMELDET: { label: "Gemeldet", color: "bg-blue-100 text-blue-800" },
  BAD_BEAUFTRAGT: { label: "BAD beauftragt", color: "bg-yellow-100 text-yellow-800" },
  BAD_ABGESCHLOSSEN: {
    label: "BAD abgeschlossen",
    color: "bg-purple-100 text-purple-800",
  },
  AKTIV: { label: "Aktiv", color: "bg-green-100 text-green-800" },
  BEENDET: { label: "Beendet", color: "bg-gray-100 text-gray-800" },
};

export const mutterschutzDashboardConfig: ProcessDashboardConfig = {
  apiEndpoint: "/api/mutterschutz",
  detailUrlPrefix: "/dashboard/mutterschutz",
  title: "Mutterschutz",
  createButtonLabel: "Neuer Mutterschutz",
  searchPlaceholder: "Name, E-Mail oder Vorgangs-ID...",

  statusTiles: [
    { key: "GEMELDET", label: "Gemeldet", color: "bg-blue-50" },
    { key: "BAD_BEAUFTRAGT", label: "BAD", color: "bg-yellow-50" },
    { key: "AKTIV", label: "Aktiv", color: "bg-green-50" },
    { key: "BEENDET", label: "Beendet", color: "bg-gray-50" },
  ],

  statusLabels: MUTTERSCHUTZ_STATUS_LABELS,

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
      label: "Mitarbeiterin",
      render: (_v, row) => (
        <div>
          <div className="font-medium text-foreground">
            {String(row.employeeFirstName || "")}{" "}
            {String(row.employeeLastName || "")}
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
      key: "voraussGeburt",
      label: "Voraussichtlicher Geburtstermin",
      sortable: true,
      render: (value) => {
        if (!value) return <span className="text-muted-foreground">—</span>;
        return (
          <span className="text-xs">
            {new Date(value as string).toLocaleDateString("de-DE")}
          </span>
        );
      },
    },
    {
      key: "mutterschutzBeginn",
      label: "Beginn Mutterschutz",
      render: (value) =>
        value ? (
          <span className="text-xs">
            {new Date(value as string).toLocaleDateString("de-DE")}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value) => {
        const info =
          MUTTERSCHUTZ_STATUS_LABELS[String(value)] ||
          MUTTERSCHUTZ_STATUS_LABELS.GEMELDET;
        return (
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${info.color}`}
          >
            {info.label}
          </span>
        );
      },
    },
  ],

  defaultSortBy: "createdAt",
  defaultSortOrder: "desc",
  pageSize: 25,

  emptyStateText: "Keine Mutterschutz-Vorgaenge vorhanden",
  emptyStateHint: "Erstellen Sie einen neuen Mutterschutz-Vorgang.",
  emptyFilterText: "Keine Vorgaenge für diese Filter gefunden",
};
