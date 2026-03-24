"use client";

/**
 * Dashboard-Charts und KPI-Komponenten
 *
 * Verwendet Recharts fuer interaktive Visualisierungen:
 * - StatusPieChart: Tortendiagramm der Status-Verteilung
 * - MonthlyTrendChart: Balkendiagramm erstellt vs. abgeschlossen
 * - OverdueBanner: Warnbanner fuer ueberfaellige Vorgaenge
 * - DurationKPI: Durchschnittliche Bearbeitungsdauer
 */

import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// =============================================
// Status-Farben (konsistent mit CSS-Variablen)
// =============================================
// Farben konsistent mit globals.css --color-status-* Variablen
const STATUS_COLORS: Record<string, string> = {
  INVITED: "#3b82f6",
  IN_PROGRESS: "#f59e0b",
  SUBMITTED: "#8b5cf6",
  SUPERVISOR_PENDING: "#ec4899",
  SUPERVISOR_SUBMITTED: "#a855f7",
  REVIEWED: "#10b981",
  COMPLETED: "#059669",
  EXPIRED: "#ef4444",
};

const STATUS_LABELS: Record<string, string> = {
  INVITED: "Eingeladen",
  IN_PROGRESS: "In Bearbeitung",
  SUBMITTED: "Eingereicht",
  SUPERVISOR_PENDING: "Vorges. offen",
  SUPERVISOR_SUBMITTED: "Vorges. fertig",
  REVIEWED: "Geprueft",
  COMPLETED: "Abgeschlossen",
  EXPIRED: "Abgelaufen",
};

// =============================================
// Typen
// =============================================
interface StatusData {
  status: string;
  count: number;
}

interface TrendData {
  month: string;
  created: number;
  completed: number;
}

interface OverdueItem {
  id: string;
  displayId: string | null;
  name: string;
  status: string;
  organization: string;
  daysOpen: number;
  critical: boolean;
}

// =============================================
// Tortendiagramm: Status-Verteilung
// =============================================
export function StatusPieChart({ data }: { data: StatusData[] }) {
  const chartData = data
    .filter((d) => d.count > 0)
    .map((d) => ({
      name: STATUS_LABELS[d.status] || d.status,
      value: d.count,
      color: STATUS_COLORS[d.status] || "#9CA3AF",
    }));

  if (chartData.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Keine Daten vorhanden
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          dataKey="value"
          label={({ value, percent }) => percent > 0.05 ? `${value}` : ""}
          labelLine={true}
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => [value, "Vorgaenge"]}
          contentStyle={{
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            fontSize: "13px",
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

// =============================================
// Balkendiagramm: Monatlicher Trend
// =============================================
export function MonthlyTrendChart({ data }: { data: TrendData[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Keine Daten vorhanden
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            fontSize: "13px",
          }}
        />
        <Legend wrapperStyle={{ fontSize: "13px" }} />
        <Bar dataKey="created" name="Erstellt" fill="#3B82F6" radius={[4, 4, 0, 0]} />
        <Bar dataKey="completed" name="Abgeschlossen" fill="#059669" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// =============================================
// Ueberfaellig-Banner
// =============================================
export function OverdueBanner({
  count,
  criticalCount,
  onFilter,
}: {
  count: number;
  criticalCount: number;
  onFilter: () => void;
}) {
  if (count === 0) return null;

  const isCritical = criticalCount > 0;
  const bgColor = isCritical ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200";
  const textColor = isCritical ? "text-red-800" : "text-amber-800";
  const iconColor = isCritical ? "text-red-500" : "text-amber-500";

  return (
    <button
      onClick={onFilter}
      className={`mb-4 flex w-full items-center gap-3 rounded-lg border ${bgColor} p-4 text-left transition-shadow hover:shadow-md`}
    >
      <svg className={`h-6 w-6 shrink-0 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
        />
      </svg>
      <div>
        <p className={`text-sm font-semibold ${textColor}`}>
          {count} {count === 1 ? "Vorgang" : "Vorgaenge"} ueberfaellig
          {criticalCount > 0 && (
            <span className="ml-1 text-red-600">
              ({criticalCount} kritisch, &gt;14 Tage)
            </span>
          )}
        </p>
        <p className={`text-xs ${textColor} opacity-75`}>
          Klicken Sie hier, um die ueberfaelligen Vorgaenge anzuzeigen
        </p>
      </div>
    </button>
  );
}

// =============================================
// KPI: Durchschnittliche Bearbeitungsdauer
// =============================================
export function DurationKPI({
  days,
  processCount,
}: {
  days: number;
  processCount: number;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-2xl font-bold text-foreground">
        {processCount > 0 ? `${days.toFixed(1).replace(".", ",")} Tage` : "—"}
      </p>
      <p className="text-xs text-muted-foreground">
        Ø Bearbeitungsdauer
        {processCount > 0 && (
          <span className="ml-1">({processCount} abgeschlossen)</span>
        )}
      </p>
    </div>
  );
}

// =============================================
// Ueberfaellig-Badge fuer Tabellenzeilen
// =============================================
export function OverdueBadge({ invitedAt, status }: { invitedAt: string; status: string }) {
  const openStatuses = ["INVITED", "IN_PROGRESS", "SUBMITTED", "SUPERVISOR_PENDING"];
  if (!openStatuses.includes(status)) return null;

  const daysOpen = Math.floor(
    (Date.now() - new Date(invitedAt).getTime()) / 86400000
  );

  if (daysOpen < 7) return null;

  const isCritical = daysOpen >= 14;

  return (
    <span
      className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        isCritical
          ? "bg-red-100 text-red-700"
          : "bg-amber-100 text-amber-700"
      }`}
    >
      {daysOpen}d
    </span>
  );
}
