/**
 * Vertragsende Dashboard – Konfiguration fuer das generische Process-Dashboard.
 * Die "Frist"-Spalte zeigt die Live-Ampel (KRITISCH/WARNUNG/BEOBACHTEN) aus dem
 * Vertragsende, exakt nach der n8n-Staffelung.
 */

import type { ProcessDashboardConfig } from "@/components/process-dashboard/types";
import { CONTRACT_END_STATUS_LABELS } from "@/lib/constants";
import { getContractEndCategory, CONTRACT_END_CATEGORY_META } from "@/lib/contract-end-fristen";

export const contractEndDashboardConfig: ProcessDashboardConfig = {
  apiEndpoint: "/api/contract-end",
  detailUrlPrefix: "/dashboard/contract-end",
  title: "Vertragsende-Vorgänge",
  createButtonLabel: "Neuer Vorgang",
  searchPlaceholder: "Name, E-Mail oder Vorgangs-ID...",

  statusTiles: [
    { key: "ANGELEGT", label: "Angelegt", color: "bg-blue-50" },
    { key: "ENTSCHEIDUNG_UEBERNAHME", label: "Übernahme", color: "bg-yellow-50" },
    { key: "VERTRAG_ERSTELLT", label: "Vertrag erstellt", color: "bg-green-50" },
    { key: "ENTSCHEIDUNG_KEINE_UEBERNAHME", label: "Keine Übernahme", color: "bg-red-50" },
    { key: "ABGESCHLOSSEN", label: "Abgeschlossen", color: "bg-purple-50" },
    { key: "STORNIERT", label: "Storniert", color: "bg-gray-50" },
  ],

  statusLabels: CONTRACT_END_STATUS_LABELS,

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
          <div className="text-xs text-muted-foreground">{String(row.employeeEmail || "")}</div>
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
            <span className="ml-1 text-xs text-muted-foreground">({org.mandantNumber})</span>
          </div>
        );
      },
    },
    {
      key: "contractEndDate",
      label: "Vertragsende",
      sortable: true,
      render: (value, row) => {
        if (!value) return <span className="text-muted-foreground">—</span>;
        const formatted = new Date(value as string).toLocaleDateString("de-DE");
        const isPast = new Date(value as string) < new Date();
        const isOpen = !["ABGESCHLOSSEN", "STORNIERT"].includes(row.status as string);
        return (
          <div>
            <span className="text-foreground">{formatted}</span>
            {isPast && isOpen && (
              <span className="ml-1.5 inline-flex rounded-full bg-credo-rot/10 px-2 py-0.5 text-[10px] font-semibold text-credo-rot">
                Abgelaufen
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "frist",
      label: "Frist",
      sortable: false,
      render: (_value, row) => {
        if (!row.contractEndDate) return <span className="text-muted-foreground">—</span>;
        const cat = getContractEndCategory(new Date(row.contractEndDate as string));
        const meta = CONTRACT_END_CATEGORY_META[cat];
        if (cat === "AUSSERHALB") {
          return <span className="text-xs text-muted-foreground">{meta.label}</span>;
        }
        return (
          <span
            className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold"
            style={{ color: meta.color, backgroundColor: meta.bg }}
          >
            {meta.label}
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
          CONTRACT_END_STATUS_LABELS[String(value)] || CONTRACT_END_STATUS_LABELS.ANGELEGT;
        return (
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusInfo.color}`}
          >
            {statusInfo.label}
          </span>
        );
      },
    },
  ],

  defaultSortBy: "contractEndDate",
  defaultSortOrder: "asc",
  pageSize: 25,

  emptyStateText: "Keine Vertragsende-Vorgänge vorhanden",
  emptyStateHint: "Erstellen Sie einen neuen Vertragsende-Vorgang oder warten Sie auf die n8n-Meldung.",
  emptyFilterText: "Keine Vorgänge für diese Filter gefunden",
  emptyFilterHint: "Versuchen Sie andere Filterkriterien oder setzen Sie die Filter zurück.",
};
