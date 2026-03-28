import type { PhaseData } from "./types";
import { SUB_PHASES_II } from "./types";

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

export function getPhaseStatus(phases: PhaseData[], key: string): string {
  return phases.find((p) => p.phaseKey === key)?.status || "NOT_STARTED";
}

export function getMainPhaseStatus(phases: PhaseData[], mainKey: string): string {
  if (mainKey !== "II") return getPhaseStatus(phases, mainKey);
  const subs = SUB_PHASES_II.map((k) => getPhaseStatus(phases, k));
  if (subs.every((s) => s === "COMPLETED")) return "COMPLETED";
  if (subs.some((s) => s === "IN_PROGRESS" || s === "COMPLETED")) return "IN_PROGRESS";
  if (subs.some((s) => s === "BLOCKED")) return "BLOCKED";
  return "NOT_STARTED";
}
