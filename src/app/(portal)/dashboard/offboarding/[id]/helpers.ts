// =============================================
// Constants
// =============================================

// Gueltige Status-Uebergaenge
export const STATUS_TRANSITIONS: Record<string, string[]> = {
  INITIATED: ["NOTICE_PERIOD", "CANCELLED"],
  NOTICE_PERIOD: ["HANDOVER_PHASE", "CANCELLED"],
  HANDOVER_PHASE: ["FINAL_SETTLEMENT", "CANCELLED"],
  FINAL_SETTLEMENT: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export const CHECKLIST_PHASE_LABELS: Record<string, string> = {
  "Phase 1: Erfassung & Planung": "Phase 1: Erfassung & Planung",
  "Phase 2: Kuendigungsfrist": "Phase 2: Kuendigungsfrist",
  "Phase 3: Uebergabe": "Phase 3: Uebergabe",
  "Phase 4: IT & Zugaenge": "Phase 4: IT & Zugaenge",
  "Phase 5: Endabrechnung": "Phase 5: Endabrechnung",
  "Phase 6: Abschluss": "Phase 6: Abschluss",
};

export const CERTIFICATE_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Ausstehend", color: "bg-yellow-100 text-yellow-800" },
  IN_PROGRESS: { label: "In Bearbeitung", color: "bg-blue-100 text-blue-800" },
  COMPLETED: { label: "Erstellt", color: "bg-green-100 text-green-800" },
  SENT: { label: "Versendet", color: "bg-green-100 text-green-800" },
};

// =============================================
// Helper Functions
// =============================================

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "\u2014";
  return new Date(dateStr).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatBoolean(val: boolean | null | undefined): string {
  if (val === null || val === undefined) return "\u2014";
  return val ? "Ja" : "Nein";
}

export function formatCurrency(val: number | string | null): string {
  if (val === null || val === undefined) return "\u2014";
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return "\u2014";
  return num.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export function formatNumber(val: number | null, suffix?: string): string {
  if (val === null || val === undefined) return "\u2014";
  return suffix ? `${val} ${suffix}` : String(val);
}

export function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function daysUntilLabel(dateStr: string): { text: string; color: string } {
  const days = daysUntil(dateStr);
  if (days > 14) return { text: `Noch ${days} Tage`, color: "text-credo-gruen" };
  if (days > 0) return { text: `Noch ${days} Tage`, color: "text-orange-600" };
  if (days === 0) return { text: "Heute", color: "text-red-600" };
  return { text: `Vor ${Math.abs(days)} Tagen`, color: "text-muted-foreground" };
}
