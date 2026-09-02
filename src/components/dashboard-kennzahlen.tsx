"use client";

/**
 * Kennzahlen-Bausteine des Dashboards.
 *
 * Bewusst getrennt von dashboard-charts.tsx: Dort haengt recharts dran
 * (~145 kB), hier nicht. Weil ein Import die ganze Datei zieht, kam recharts
 * bisher auch dann ins Einstiegs-Bundle, wenn nur das Ueberfaellig-Banner
 * gebraucht wurde. Diese drei Bausteine bleiben deshalb statisch importierbar;
 * die beiden Diagramme laedt das Dashboard nach.
 */

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
          {count} {count === 1 ? "Vorgang" : "Vorgänge"} überfällig
          {criticalCount > 0 && (
            <span className="ml-1 text-red-600">
              ({criticalCount} kritisch, &gt;14 Tage)
            </span>
          )}
        </p>
        <p className={`text-xs ${textColor} opacity-75`}>
          Klicken Sie hier, um die überfälligen Vorgänge anzuzeigen
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
// Ueberfaellig-Badge für Tabellenzeilen
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
