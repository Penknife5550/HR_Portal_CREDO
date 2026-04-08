/**
 * Elternzeit Dashboard – Konfiguration fuer ProcessDashboard
 */

import type { ProcessDashboardConfig } from "@/components/process-dashboard/types";

const ELTERNZEIT_STATUS_LABELS: Record<
  string,
  { label: string; color: string }
> = {
  ANGELEGT: { label: "Angelegt", color: "bg-gray-100 text-gray-800" },
  ANTRAG_VORL_VERSANDT: {
    label: "Antrag versandt",
    color: "bg-blue-100 text-blue-800",
  },
  ANTRAG_VORL_EINGEREICHT: {
    label: "Antrag eingereicht",
    color: "bg-yellow-100 text-yellow-800",
  },
  VORLAEUFIG_GENEHMIGT: {
    label: "Vorl. genehmigt",
    color: "bg-purple-100 text-purple-800",
  },
  VORLAEUFIG_ABGELEHNT: {
    label: "Vorl. abgelehnt",
    color: "bg-red-100 text-red-800",
  },
  ANTRAG_ENDG_VERSANDT: {
    label: "Endg. Antrag versandt",
    color: "bg-blue-100 text-blue-800",
  },
  ANTRAG_ENDG_EINGEREICHT: {
    label: "Endg. eingereicht",
    color: "bg-yellow-100 text-yellow-800",
  },
  GENEHMIGT: { label: "Genehmigt", color: "bg-green-100 text-green-800" },
  AKTIV: { label: "Aktiv", color: "bg-green-100 text-green-800" },
  UNTERBROCHEN: { label: "Unterbrochen", color: "bg-orange-100 text-orange-800" },
  RUECKKEHR_GEPLANT: {
    label: "Rueckkehr geplant",
    color: "bg-purple-100 text-purple-800",
  },
  BEENDET: { label: "Beendet", color: "bg-gray-100 text-gray-800" },
  ABGELEHNT: { label: "Abgelehnt", color: "bg-red-100 text-red-800" },
};

const PERSONALGRUPPE_LABELS: Record<string, string> = {
  TARIF_TV_L: "TV-L",
  BEAMTER: "Beamter",
  PLANSTELLENINHABER: "PSI",
};

export const elternzeitDashboardConfig: ProcessDashboardConfig = {
  apiEndpoint: "/api/elternzeit",
  detailUrlPrefix: "/dashboard/elternzeit",
  title: "Elternzeit",
  createButtonLabel: "Neue Elternzeit",
  searchPlaceholder: "Name, E-Mail oder Vorgangs-ID...",

  statusTiles: [
    { key: "ANGELEGT", label: "Angelegt", color: "bg-gray-50" },
    { key: "ANTRAG_VORL_EINGEREICHT", label: "Eingereicht", color: "bg-yellow-50" },
    { key: "VORLAEUFIG_GENEHMIGT", label: "Vorl. genehmigt", color: "bg-purple-50" },
    { key: "AKTIV", label: "Aktiv", color: "bg-green-50" },
    { key: "BEENDET", label: "Beendet", color: "bg-gray-50" },
  ],

  statusLabels: ELTERNZEIT_STATUS_LABELS,

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
      label: "Mitarbeiter/in",
      render: (_v, row) => (
        <div>
          <div className="font-medium text-foreground">
            {String(row.employeeFirstName || "")}{" "}
            {String(row.employeeLastName || "")}
          </div>
          <div className="text-xs text-muted-foreground">
            {row.geschlecht === "MUTTER" ? "Mutter" : "Vater"} ·{" "}
            {String(row.kindNummer || 1)}. Kind
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
      key: "personalgruppe",
      label: "Personalgruppe",
      render: (value) => (
        <span className="inline-flex rounded bg-muted px-2 py-0.5 text-xs">
          {PERSONALGRUPPE_LABELS[String(value)] || String(value)}
        </span>
      ),
    },
    {
      key: "abschnitte",
      label: "EZ-Beginn",
      render: (value) => {
        const abs = value as { abschnittNr: number; von: string }[] | null;
        if (!abs || abs.length === 0)
          return <span className="text-muted-foreground">—</span>;
        const first = abs[0];
        return (
          <span className="text-xs">
            {new Date(first.von).toLocaleDateString("de-DE")}
          </span>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value) => {
        const info =
          ELTERNZEIT_STATUS_LABELS[String(value)] ||
          ELTERNZEIT_STATUS_LABELS.ANGELEGT;
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

  emptyStateText: "Keine Elternzeit-Vorgaenge vorhanden",
  emptyStateHint: "Erstellen Sie einen neuen Elternzeit-Vorgang.",
  emptyFilterText: "Keine Vorgaenge fuer diese Filter gefunden",
};
