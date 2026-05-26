/**
 * Process Dashboard – Generische Typen
 *
 * Wiederverwendbare Typen für alle HR-Prozess-Dashboards
 * (Onboarding, Offboarding, Verbeamtung, etc.)
 */

import type { ReactNode } from "react";

/** Definition einer einzelnen Tabellenspalte */
export interface ProcessColumn {
  /** Schlüssel im Datenobjekt (unterstuetzt auch Dot-Notation nicht, nur Top-Level-Keys) */
  key: string;
  /** Angezeigter Spaltenname */
  label: string;
  /** Ist die Spalte sortierbar? */
  sortable?: boolean;
  /** Optionale Render-Funktion für benutzerdefinierte Zellenformatierung */
  render?: (value: unknown, row: ProcessRow) => ReactNode;
}

/** Status-Kachel oberhalb der Tabelle */
export interface StatusTile {
  /** Status-Schlüssel (muss mit API-Werten uebereinstimmen) */
  key: string;
  /** Angezeigter Label-Text */
  label: string;
  /** Tailwind-Hintergrundklasse, z.B. "bg-blue-50" */
  color: string;
}

/** Generische Datenzeile */
export interface ProcessRow {
  id: string;
  [key: string]: unknown;
}

/** Vollstaendige Konfiguration eines Prozess-Dashboards */
export interface ProcessDashboardConfig {
  /** API-Endpunkt für Datenabruf, z.B. "/api/offboarding" */
  apiEndpoint: string;
  /** URL-Praefix für Detail-Seiten, z.B. "/dashboard/offboarding" */
  detailUrlPrefix: string;
  /** Seitentitel, z.B. "Offboarding-Vorgaenge" */
  title: string;
  /** Button-Label für neuen Vorgang, z.B. "Neuer Austritt" */
  createButtonLabel: string;
  /** Such-Platzhalter, z.B. "Name, E-Mail oder Vorgangs-ID..." */
  searchPlaceholder?: string;
  /** Status-Kacheln-Konfiguration */
  statusTiles: StatusTile[];
  /** Status-Label-Map: Schlüssel → { label, color } */
  statusLabels: Record<string, { label: string; color: string }>;
  /** Tabellen-Spalten */
  columns: ProcessColumn[];
  /** Standard-Sortierfeld */
  defaultSortBy?: string;
  /** Standard-Sortierrichtung */
  defaultSortOrder?: "asc" | "desc";
  /** Seitengroesse (Standard: 25) */
  pageSize?: number;
  /** Leerzustand-Text wenn keine Daten und keine Filter aktiv */
  emptyStateText?: string;
  /** Leerzustand-Text wenn keine Daten aber Filter aktiv */
  emptyFilterText?: string;
  /** Text für den Hinweis im Leerzustand */
  emptyStateHint?: string;
  /** Text für den Hinweis im leeren Filter-Zustand */
  emptyFilterHint?: string;
  /** Optionaler API-Endpunkt für CSV-Export, z.B. "/api/offboarding/export" */
  exportEndpoint?: string;
  /** Optionaler API-Endpunkt für Analytics-Dashboard, z.B. "/api/offboarding/analytics" */
  analyticsEndpoint?: string;
}
