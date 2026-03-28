"use client";

import type { AuditLogEntry } from "../types";
import { formatDateTime } from "../helpers";

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
        {auditLog.map((entry) => (
          <div key={entry.id} className="flex items-start gap-3 px-5 py-3.5">
            <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs text-gray-500">
              &#9679;
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-800">{entry.action}</p>
              {entry.details && (
                <p className="text-xs text-gray-400 mt-0.5">{entry.details}</p>
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
        ))}
      </div>
    </div>
  );
}
