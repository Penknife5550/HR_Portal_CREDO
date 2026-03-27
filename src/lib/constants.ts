/**
 * CREDO HR-Portal – Zentrale Konstanten
 *
 * Einheitliche Definitionen fuer Status-Labels, Rollen,
 * Validierungsfunktionen und andere wiederverwendbare Werte.
 */

// =============================================
// Status-Labels (Dashboard + Detail-Seite)
// =============================================
export const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  INVITED: { label: "Eingeladen", color: "bg-[var(--color-status-invited)]/15 text-[var(--color-status-invited)]" },
  IN_PROGRESS: {
    label: "In Bearbeitung",
    color: "bg-[var(--color-status-in-progress)]/15 text-[var(--color-status-in-progress)]",
  },
  SUBMITTED: { label: "Eingereicht", color: "bg-[var(--color-status-submitted)]/15 text-[var(--color-status-submitted)]" },
  SUPERVISOR_PENDING: {
    label: "Vorgesetzter offen",
    color: "bg-[var(--color-status-supervisor-pending)]/15 text-[var(--color-status-supervisor-pending)]",
  },
  SUPERVISOR_SUBMITTED: {
    label: "Vorgesetzter fertig",
    color: "bg-[var(--color-status-supervisor-submitted)]/15 text-[var(--color-status-supervisor-submitted)]",
  },
  REVIEWED: { label: "Geprüft", color: "bg-[var(--color-status-reviewed)]/15 text-[var(--color-status-reviewed)]" },
  COMPLETED: { label: "Abgeschlossen", color: "bg-[var(--color-status-completed)]/15 text-[var(--color-status-completed)]" },
  EXPIRED: { label: "Abgelaufen", color: "bg-[var(--color-status-expired)]/15 text-[var(--color-status-expired)]" },
};

// =============================================
// Prozesstyp-Labels (zukunftssicher fuer weitere HR-Vorgaenge)
// =============================================
export const PROCESS_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  EINSTELLUNG: { label: "Einstellung", color: "bg-blue-100 text-blue-800" },
  VERBEAMTUNG: { label: "Verbeamtung", color: "bg-purple-100 text-purple-800" },
  VERTRAGSAENDERUNG: { label: "Vertragsänderung", color: "bg-orange-100 text-orange-800" },
  KUENDIGUNG: { label: "Kündigung", color: "bg-red-100 text-red-800" },
};

// =============================================
// Berechtigungsrollen
// =============================================
export const ADMIN_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"] as const;
export const ALL_PORTAL_ROLES = ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER"] as const;

// =============================================
// Validierungsfunktionen
// =============================================
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
