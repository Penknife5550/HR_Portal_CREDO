"use client";

import type { AuditLogEntry } from "../types";
import { formatDateTime } from "../helpers";
import { AUDIT_ACTION_LABELS } from "@/lib/verify-assessment";

// Zusaetzliche Action-Labels für Aktionen, die nicht in AUDIT_ACTION_LABELS
// stehen (welche bewusst auf die Verify-Page beschraenkt ist).
const EXTRA_ACTION_LABELS: Record<string, string> = {
  CIVIL_SERVICE_CREATED: "Verbeamtungsvorgang angelegt",
  CIVIL_SERVICE_UPDATED: "Vorgang aktualisiert",
  CHECKLIST_ITEM_TOGGLED: "Checklisten-Item geändert",
  PHASE_STATUS_UPDATED: "Phasen-Status aktualisiert",
  DOCUMENT_UPLOADED: "Dokument hochgeladen",
  DOCUMENT_DELETED: "Dokument gelöscht",
  DOCUMENT_EXPORTED: "Dokument exportiert",
  APPLICATION_SUBMITTED: "Antrag eingereicht",
  BOARD_DECISION_RECORDED: "Beirats-Entscheidung dokumentiert",
  VERIFY_PAGE_VIEWED: "Audit-Page aufgerufen",
  VERIFY_PAGE_NOT_FOUND: "Ungültiger Verifikations-Aufruf",
};

function actionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? EXTRA_ACTION_LABELS[action] ?? action;
}

/**
 * Wandelt das Prisma-JSON-`details`-Feld in eine kompakte, lesbare Zeile um.
 * Akzeptiert sowohl alte string-Eintraege als auch das aktuelle Objekt-Format.
 */
function formatDetails(details: AuditLogEntry["details"]): string | null {
  if (details === null || details === undefined) return null;
  if (typeof details === "string") return details;
  if (typeof details !== "object") return String(details);

  const entries = Object.entries(details).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  if (entries.length === 0) return null;

  return entries
    .map(([k, v]) => {
      if (typeof v === "object") {
        try {
          return `${k}: ${JSON.stringify(v)}`;
        } catch {
          return `${k}: [object]`;
        }
      }
      return `${k}: ${String(v)}`;
    })
    .join(" · ");
}

export function TabProtocol({ auditLog }: { auditLog: AuditLogEntry[] }) {
  if (auditLog.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
        <span className="text-3xl text-gray-200">&#128196;</span>
        <p className="mt-2 text-sm text-gray-400">Noch keine Protokolleinträge vorhanden.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <div className="divide-y divide-gray-50">
        {auditLog.map((entry) => {
          const detailsLine = formatDetails(entry.details);
          return (
            <div key={entry.id} className="flex items-start gap-3 px-5 py-3.5">
              <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs text-gray-500">
                &#9679;
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800">{actionLabel(entry.action)}</p>
                {detailsLine && (
                  <p className="text-xs text-gray-400 mt-0.5 break-words">
                    {detailsLine}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs text-gray-500">{formatDateTime(entry.createdAt)}</p>
                {entry.createdBy && (
                  <p className="text-[10px] text-gray-400">
                    {entry.createdBy.firstName} {entry.createdBy.lastName}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
