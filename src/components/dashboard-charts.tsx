"use client";

/**
 * Dashboard-Charts und KPI-Komponenten
 *
 * Verwendet Recharts für interaktive Visualisierungen:
 * - StatusPieChart: Tortendiagramm der Status-Verteilung
 * - MonthlyTrendChart: Balkendiagramm erstellt vs. abgeschlossen
 * - OverdueBanner: Warnbanner für ueberfaellige Vorgaenge
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
  REVIEWED: "Geprüft",
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
    <ResponsiveContainer width="100%" height={320}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="45%"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={2}
          dataKey="value"
          label={({ value, percent }) => (percent ?? 0) > 0.05 ? `${value}` : ""}
          labelLine={true}
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => [value, "Vorgänge"]}
          contentStyle={{
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            fontSize: "13px",
          }}
        />
        <Legend
          verticalAlign="bottom"
          align="center"
          iconType="circle"
          iconSize={10}
          wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
          formatter={(value, entry) => {
            const count = (entry?.payload as { value?: number } | undefined)?.value;
            return (
              <span className="text-foreground">
                {value}
                {typeof count === "number" ? ` (${count})` : ""}
              </span>
            );
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
