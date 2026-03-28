"use client";

/**
 * Analytics Dashboard – KPI-Sektion fuer Prozess-Dashboards
 *
 * Zeigt KPI-Karten, Austrittsgründe, monatliche Trends,
 * Exit-Interview-Insights und Abteilungs-Performance.
 * Rein CSS/Tailwind-basiert, keine externen Chart-Libraries.
 */

import { useState, useEffect, useCallback } from "react";

const EXIT_TYPE_MAP: Record<string, string> = {
  KUENDIGUNG_ARBEITNEHMER: "Kündigung (AN)",
  KUENDIGUNG_ARBEITGEBER: "Kündigung (AG)",
  AUFHEBUNGSVERTRAG: "Aufhebungsvertrag",
  BEFRISTUNGSENDE: "Befristungsende",
  RENTE_PENSION: "Rente/Pension",
  ERWERBSMINDERUNG: "Erwerbsminderung",
  ENTLASSUNG_BEAMTER: "Entlassung Beamter",
  VERSETZUNG: "Versetzung",
  TOD: "Tod",
  SONSTIGES: "Sonstiges",
};

// =============================================
// Types
// =============================================

export interface AnalyticsDashboardProps {
  apiEndpoint: string;
  dateFrom?: string;
  dateTo?: string;
  organizationId?: string;
}

interface KPIData {
  activeCount: number;
  completedCount: number;
  avgDurationDays: number | null;
  overdueCount: number;
}

interface ExitReasonEntry {
  label: string;
  count: number;
  percentage: number;
}

interface MonthlyTrendEntry {
  month: string;
  label: string;
  created: number;
  completed: number;
}

interface ExitInterviewInsights {
  completionRate: number;
  averageRating: number | null;
  enpsScore: number | null;
  totalInterviews: number;
  submittedCount: number;
  categoryAverages: { name: string; avgRating: number }[];
}

interface DepartmentPerformance {
  name: string;
  assigned: number;
  completed: number;
  avgReactionDays: number | null;
}

interface AnalyticsData {
  kpi: KPIData;
  exitReasons: ExitReasonEntry[];
  monthlyTrend: MonthlyTrendEntry[];
  exitInterviewInsights: ExitInterviewInsights | null;
  departmentPerformance: DepartmentPerformance[];
}

// =============================================
// Collapsible Section
// =============================================

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-2xl border bg-card">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-6 py-4 text-left"
      >
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <svg
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          open ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="border-t px-6 pb-6 pt-4">{children}</div>
      </div>
    </div>
  );
}

// =============================================
// Skeleton Loader
// =============================================

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border bg-card p-6">
      <div className="mb-3 h-3 w-20 rounded bg-muted" />
      <div className="mb-2 h-8 w-16 rounded bg-muted" />
      <div className="h-3 w-24 rounded bg-muted" />
    </div>
  );
}

function SkeletonBar({ width }: { width: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-3 w-24 shrink-0 rounded bg-muted animate-pulse" />
      <div className="h-4 flex-1 rounded bg-muted animate-pulse" style={{ maxWidth: width }} />
      <div className="h-3 w-8 rounded bg-muted animate-pulse" />
    </div>
  );
}

// =============================================
// Color helpers
// =============================================

const CHART_COLORS = [
  "bg-credo-blau",
  "bg-credo-gruen",
  "bg-credo-gelb",
  "bg-credo-rot",
  "bg-purple-500",
  "bg-orange-500",
  "bg-teal-500",
  "bg-pink-500",
];

function reactionTimeColor(days: number | null): string {
  if (days === null) return "text-muted-foreground";
  if (days < 3) return "text-credo-gruen";
  if (days <= 7) return "text-credo-gelb";
  return "text-credo-rot";
}

function reactionTimeBg(days: number | null): string {
  if (days === null) return "";
  if (days < 3) return "bg-credo-gruen/10";
  if (days <= 7) return "bg-credo-gelb/10";
  return "bg-credo-rot/10";
}

function getRatingColor(rating: number): string {
  if (rating >= 4) return "text-credo-gruen";
  if (rating >= 3) return "text-credo-gelb";
  return "text-credo-rot";
}

function getRatingBarColor(rating: number): string {
  if (rating >= 4) return "bg-credo-gruen";
  if (rating >= 3) return "bg-credo-gelb";
  return "bg-credo-rot";
}

function getEnpsLabel(score: number): { label: string; color: string } {
  if (score >= 9) return { label: "Promoter", color: "bg-credo-gruen/10 text-credo-gruen" };
  if (score >= 7) return { label: "Passiv", color: "bg-credo-gelb/10 text-credo-gelb" };
  return { label: "Kritiker", color: "bg-credo-rot/10 text-credo-rot" };
}

// =============================================
// Main Component
// =============================================

export function AnalyticsDashboard({
  apiEndpoint,
  dateFrom,
  dateTo,
  organizationId,
}: AnalyticsDashboardProps) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      if (organizationId) params.set("organizationId", organizationId);

      const res = await fetch(`${apiEndpoint}?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      const raw = result.data || result;

      // API-Felder auf Komponenten-Felder mappen
      setData({
        kpi: {
          activeCount: raw.overview?.activeProcesses || 0,
          completedCount: raw.overview?.completedProcesses || 0,
          avgDurationDays: raw.overview?.avgDurationDays ?? null,
          overdueCount: raw.overview?.overdueCount || 0,
        },
        exitReasons: (raw.exitTypeDistribution || []).map((e: { exitType: string; count: number; percentage: number }) => ({
          label: EXIT_TYPE_MAP[e.exitType] || e.exitType,
          count: e.count,
          percentage: e.percentage,
        })),
        monthlyTrend: raw.monthlyTrend || [],
        exitInterviewInsights: raw.exitInterviews ? {
          completionRate: raw.exitInterviews.completionRate || 0,
          averageRating: raw.exitInterviews.avgOverallRating ?? null,
          enpsScore: raw.exitInterviews.avgEnps ?? null,
          totalInterviews: raw.exitInterviews.total || 0,
          submittedCount: raw.exitInterviews.completed || 0,
          categoryAverages: (raw.exitInterviews.categoryAverages || []).map((c: { categoryName: string; avgRating: number; responseCount: number }) => ({
            name: c.categoryName,
            avgRating: c.avgRating,
          })),
        } : null,
        departmentPerformance: (raw.departmentPerformance || []).map((d: { departmentKey: string; departmentName: string; totalAssigned: number; completedOnTime: number; avgResponseDays: number | null }) => ({
          name: d.departmentName || d.departmentKey,
          assigned: d.totalAssigned,
          completed: d.completedOnTime,
          avgReactionDays: d.avgResponseDays,
        })),
      });
    } catch (err) {
      console.error("Analytics Fehler:", err);
      setError("Analysedaten konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [apiEndpoint, dateFrom, dateTo, organizationId]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  // ---- Loading State ----
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="animate-pulse rounded-2xl border bg-card p-6">
            <div className="mb-4 h-4 w-32 rounded bg-muted" />
            <div className="space-y-3">
              <SkeletonBar width="80%" />
              <SkeletonBar width="60%" />
              <SkeletonBar width="45%" />
              <SkeletonBar width="30%" />
            </div>
          </div>
          <div className="animate-pulse rounded-2xl border bg-card p-6">
            <div className="mb-4 h-4 w-32 rounded bg-muted" />
            <div className="flex items-end gap-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-muted"
                  style={{ height: `${20 + Math.random() * 60}px` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Error State ----
  if (error || !data) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          {error || "Keine Analysedaten verfügbar."}
        </p>
        <button
          onClick={loadAnalytics}
          className="mt-3 rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
        >
          Erneut versuchen
        </button>
      </div>
    );
  }

  const { kpi, exitReasons, monthlyTrend, exitInterviewInsights, departmentPerformance } = data;

  // Max values for chart scaling
  const maxExitReason = Math.max(...exitReasons.map((r) => r.count), 1);
  const maxMonthlyValue = Math.max(
    ...monthlyTrend.map((m) => Math.max(m.created, m.completed)),
    1
  );

  return (
    <div className="space-y-6">
      {/* ================================================
          Row 1: KPI Cards
          ================================================ */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Aktive Vorgänge */}
        <div className="rounded-2xl border bg-card p-6 transition-shadow hover:shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Aktive Vorgänge
          </p>
          <p className="mt-2 text-3xl font-bold text-foreground">{kpi.activeCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">In Bearbeitung</p>
        </div>

        {/* Abgeschlossen */}
        <div className="rounded-2xl border bg-card p-6 transition-shadow hover:shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Abgeschlossen
          </p>
          <p className="mt-2 text-3xl font-bold text-credo-gruen">{kpi.completedCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">Erfolgreich beendet</p>
        </div>

        {/* Durchschnittliche Dauer */}
        <div className="rounded-2xl border bg-card p-6 transition-shadow hover:shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Durchschn. Dauer
          </p>
          <p className="mt-2 text-3xl font-bold text-foreground">
            {kpi.avgDurationDays !== null ? `${kpi.avgDurationDays}` : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {kpi.avgDurationDays !== null ? "Tage im Durchschnitt" : "Noch keine Daten"}
          </p>
        </div>

        {/* Überfällig */}
        <div
          className={`rounded-2xl border p-6 transition-shadow hover:shadow-sm ${
            kpi.overdueCount > 0
              ? "border-credo-rot/30 bg-credo-rot/5"
              : "bg-card"
          }`}
        >
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Überfällig
          </p>
          <p
            className={`mt-2 text-3xl font-bold ${
              kpi.overdueCount > 0 ? "text-credo-rot" : "text-foreground"
            }`}
          >
            {kpi.overdueCount}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {kpi.overdueCount > 0 ? "Sofortige Aufmerksamkeit nötig" : "Alles im Zeitplan"}
          </p>
        </div>
      </div>

      {/* ================================================
          Row 2: Charts (collapsible)
          ================================================ */}
      <CollapsibleSection title="Austrittsgründe & Trends" defaultOpen>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Left: Austrittsgründe */}
          <div>
            <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Austrittsgründe
            </h4>
            {exitReasons.length === 0 ? (
              <p className="text-xs text-muted-foreground">Noch keine Daten vorhanden.</p>
            ) : (
              <div className="space-y-3">
                {exitReasons.map((reason, i) => (
                  <div key={reason.label} className="group">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">{reason.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {reason.count}{" "}
                        <span className="text-muted-foreground/60">
                          ({reason.percentage}%)
                        </span>
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ease-out ${
                          CHART_COLORS[i % CHART_COLORS.length]
                        }`}
                        style={{
                          width: `${(reason.count / maxExitReason) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Monatlicher Trend */}
          <div>
            <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Monatlicher Trend
            </h4>
            {monthlyTrend.length === 0 ? (
              <p className="text-xs text-muted-foreground">Noch keine Daten vorhanden.</p>
            ) : (
              <div>
                {/* Bar chart */}
                <div className="flex items-end gap-1.5" style={{ height: "160px" }}>
                  {monthlyTrend.map((month) => {
                    const createdHeight = (month.created / maxMonthlyValue) * 140;
                    const completedHeight = (month.completed / maxMonthlyValue) * 140;
                    return (
                      <div
                        key={month.month}
                        className="group relative flex flex-1 items-end justify-center gap-0.5"
                        style={{ height: "100%" }}
                      >
                        {/* Created bar */}
                        <div
                          className="w-full max-w-[14px] rounded-t bg-muted-foreground/20 transition-all duration-500"
                          style={{ height: `${Math.max(createdHeight, 2)}px` }}
                          title={`Erstellt: ${month.created}`}
                        />
                        {/* Completed bar */}
                        <div
                          className="w-full max-w-[14px] rounded-t bg-credo-gruen transition-all duration-500"
                          style={{ height: `${Math.max(completedHeight, 2)}px` }}
                          title={`Abgeschlossen: ${month.completed}`}
                        />
                        {/* Tooltip */}
                        <div className="absolute -top-10 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1.5 text-[10px] text-background shadow-lg group-hover:block">
                          <div>Erstellt: {month.created}</div>
                          <div>Abgeschlossen: {month.completed}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Month labels */}
                <div className="mt-2 flex gap-1.5">
                  {monthlyTrend.map((month) => (
                    <div
                      key={month.month}
                      className="flex-1 text-center text-[9px] text-muted-foreground"
                    >
                      {month.label}
                    </div>
                  ))}
                </div>
                {/* Legend */}
                <div className="mt-4 flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/20" />
                    <span className="text-[10px] text-muted-foreground">Erstellt</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-sm bg-credo-gruen" />
                    <span className="text-[10px] text-muted-foreground">Abgeschlossen</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </CollapsibleSection>

      {/* ================================================
          Row 3: Exit-Interview Insights
          ================================================ */}
      {exitInterviewInsights && (
        <CollapsibleSection title="Exit-Interview Insights" defaultOpen>
          <div className="space-y-6">
            {/* KPI badges */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Completion Rate */}
              <div className="rounded-xl border bg-muted/30 p-4 text-center">
                <p className="text-xs font-medium text-muted-foreground">Abschlussrate</p>
                <p className="mt-1.5 text-2xl font-bold text-foreground">
                  {exitInterviewInsights.completionRate}%
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {exitInterviewInsights.submittedCount} von{" "}
                  {exitInterviewInsights.totalInterviews} ausgefüllt
                </p>
              </div>

              {/* Average Rating */}
              <div className="rounded-xl border bg-muted/30 p-4 text-center">
                <p className="text-xs font-medium text-muted-foreground">Durchschn. Bewertung</p>
                {exitInterviewInsights.averageRating != null ? (
                  <>
                    <div className="mt-1.5 flex items-center justify-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <svg
                          key={star}
                          className={`h-5 w-5 ${
                            star <= Math.round(exitInterviewInsights.averageRating!)
                              ? "text-credo-gelb"
                              : "text-gray-200"
                          }`}
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                    </div>
                    <p
                      className={`mt-1 text-lg font-bold ${getRatingColor(
                        exitInterviewInsights.averageRating
                      )}`}
                    >
                      {exitInterviewInsights.averageRating.toFixed(1)}
                    </p>
                  </>
                ) : (
                  <p className="mt-1.5 text-2xl font-bold text-muted-foreground">—</p>
                )}
              </div>

              {/* eNPS */}
              <div
                className={`rounded-xl border p-4 text-center ${
                  exitInterviewInsights.enpsScore != null
                    ? getEnpsLabel(exitInterviewInsights.enpsScore).color
                    : "bg-muted/30"
                }`}
              >
                <p className="text-xs font-medium text-muted-foreground">eNPS Score</p>
                {exitInterviewInsights.enpsScore != null ? (
                  <>
                    <p className="mt-1.5 text-2xl font-bold">
                      {exitInterviewInsights.enpsScore.toFixed(1)}
                    </p>
                    <p className="mt-0.5 text-[10px] font-semibold">
                      {getEnpsLabel(exitInterviewInsights.enpsScore).label}
                    </p>
                  </>
                ) : (
                  <p className="mt-1.5 text-2xl font-bold text-muted-foreground">—</p>
                )}
              </div>

              {/* Interviews Count */}
              <div className="rounded-xl border bg-muted/30 p-4 text-center">
                <p className="text-xs font-medium text-muted-foreground">Interviews gesamt</p>
                <p className="mt-1.5 text-2xl font-bold text-foreground">
                  {exitInterviewInsights.totalInterviews}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Durchgeführt
                </p>
              </div>
            </div>

            {/* Category Averages */}
            {exitInterviewInsights.categoryAverages.length > 0 && (
              <div>
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Kategorie-Durchschnitte
                </h4>
                <div className="space-y-2.5">
                  {exitInterviewInsights.categoryAverages.map((cat) => (
                    <div key={cat.name} className="flex items-center gap-4">
                      <span className="w-44 shrink-0 text-xs font-medium text-foreground">
                        {cat.name}
                      </span>
                      <div className="flex-1">
                        <div className="h-3 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${getRatingBarColor(
                              cat.avgRating
                            )}`}
                            style={{ width: `${(cat.avgRating / 5) * 100}%` }}
                          />
                        </div>
                      </div>
                      <span
                        className={`w-8 text-right text-sm font-bold ${getRatingColor(
                          cat.avgRating
                        )}`}
                      >
                        {cat.avgRating.toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* ================================================
          Row 4: Abteilungs-Performance (collapsible)
          ================================================ */}
      {departmentPerformance.length > 0 && (
        <CollapsibleSection title="Abteilungs-Performance">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="pb-3 pr-4">Abteilung</th>
                  <th className="pb-3 pr-4 text-right">Zugewiesen</th>
                  <th className="pb-3 pr-4 text-right">Erledigt</th>
                  <th className="pb-3 text-right">Durchschn. Reaktionszeit</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {departmentPerformance.map((dept) => {
                  const completionPct =
                    dept.assigned > 0
                      ? Math.round((dept.completed / dept.assigned) * 100)
                      : 0;
                  return (
                    <tr key={dept.name} className="text-sm">
                      <td className="py-3 pr-4">
                        <span className="font-medium text-foreground">{dept.name}</span>
                      </td>
                      <td className="py-3 pr-4 text-right text-muted-foreground">
                        {dept.assigned}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <span className="text-foreground">{dept.completed}</span>
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          ({completionPct}%)
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        {dept.avgReactionDays !== null ? (
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${reactionTimeBg(
                              dept.avgReactionDays
                            )} ${reactionTimeColor(dept.avgReactionDays)}`}
                          >
                            {dept.avgReactionDays} Tage
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}
