/**
 * Fristen-Ampel fuer Vertragsende-Vorgaenge.
 *
 * Die Stufe wird LIVE aus dem Vertragsende abgeleitet (KEIN DB-Feld) — exakt
 * nach der Staffelung des bestehenden n8n-Flows "Email-Vertragsende-Personal":
 *   KRITISCH 1-2 Monate | WARNUNG 3-6 | BEOBACHTEN 7-12 | sonst AUSSERHALB.
 * So bleibt die Ampel immer aktuell und konsistent mit der HR-Uebersichtsmail.
 */

export type ContractEndCategory = "KRITISCH" | "WARNUNG" | "BEOBACHTEN" | "AUSSERHALB";

/**
 * Verbleibende ganze Monate bis zum Vertragsende (aufgerundet, wie der
 * n8n-Flow: Math.ceil(Tage / 30.44)). Bereits abgelaufene Vertraege -> 0.
 */
export function monthsUntilContractEnd(contractEndDate: Date, now: Date = new Date()): number {
  const days = Math.ceil((contractEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 0;
  return Math.ceil(days / 30.44);
}

/** Ampel-Kategorie fuer ein Vertragsende. */
export function getContractEndCategory(
  contractEndDate: Date,
  now: Date = new Date()
): ContractEndCategory {
  const months = monthsUntilContractEnd(contractEndDate, now);
  if (months >= 1 && months <= 2) return "KRITISCH";
  if (months >= 3 && months <= 6) return "WARNUNG";
  if (months >= 7 && months <= 12) return "BEOBACHTEN";
  return "AUSSERHALB";
}

/** UI-Metadaten je Kategorie (CREDO-CI: rot / gelb / blau / grau). */
export const CONTRACT_END_CATEGORY_META: Record<
  ContractEndCategory,
  { label: string; color: string; bg: string }
> = {
  KRITISCH: { label: "Kritisch", color: "#b3121a", bg: "#fde3e3" },
  WARNUNG: { label: "Warnung", color: "#8a6d00", bg: "#fff3c9" },
  BEOBACHTEN: { label: "Beobachten", color: "#0a7ca6", bg: "#e0f3fb" },
  AUSSERHALB: { label: "—", color: "#777777", bg: "#ececec" },
};
