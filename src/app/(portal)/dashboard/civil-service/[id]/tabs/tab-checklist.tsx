"use client";

import { CIVIL_SERVICE_PHASE_LABELS, CIVIL_SERVICE_ASSIGNEE_LABELS } from "@/lib/constants";
import type { ChecklistItem } from "../types";
import { PHASE_ORDER, ASSIGNEE_COLORS } from "../types";
import { formatDate } from "../helpers";
import { ChevronIcon } from "../icons";

export function TabChecklist({
  checklistByPhase,
  collapsedPhases,
  togglePhaseCollapse,
  togglingItems,
  onToggle,
}: {
  checklistByPhase: Record<string, ChecklistItem[]>;
  collapsedPhases: Set<string>;
  togglePhaseCollapse: (key: string) => void;
  togglingItems: Set<string>;
  onToggle: (id: string, current: boolean) => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="space-y-3">
      {PHASE_ORDER.map((phaseKey) => {
        const items = checklistByPhase[phaseKey];
        if (!items || items.length === 0) return null;

        const completedCount = items.filter((i) => i.isCompleted).length;
        const isCollapsed = collapsedPhases.has(phaseKey);
        const phaseLabel = CIVIL_SERVICE_PHASE_LABELS[phaseKey] || phaseKey;
        const allDone = completedCount === items.length;

        return (
          <div
            key={phaseKey}
            className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden"
          >
            {/* Phase header */}
            <button
              onClick={() => togglePhaseCollapse(phaseKey)}
              className="flex w-full items-center justify-between px-5 py-3.5 hover:bg-gray-50/50 transition-colors min-h-[44px]"
            >
              <div className="flex items-center gap-3">
                <ChevronIcon open={!isCollapsed} className="h-4 w-4 text-gray-400" />
                <span className="text-sm font-bold text-gray-900">{phaseLabel}</span>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  allDone ? "bg-credo-gruen/10 text-credo-gruen" : "bg-gray-100 text-gray-600"
                }`}
              >
                {completedCount}/{items.length}
              </span>
            </button>

            {/* Items */}
            {!isCollapsed && (
              <div className="border-t border-gray-50 divide-y divide-gray-50">
                {items.map((item) => {
                  const isOverdue =
                    !item.isCompleted && item.dueDate && new Date(item.dueDate) < today;
                  const isToggling = togglingItems.has(item.id);

                  return (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 px-5 py-3 transition-colors ${
                        isOverdue ? "bg-credo-rot/[0.03]" : ""
                      }`}
                    >
                      {/* Checkbox */}
                      <button
                        onClick={() => onToggle(item.id, item.isCompleted)}
                        disabled={isToggling}
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-all min-w-[20px] ${
                          item.isCompleted
                            ? "border-credo-gruen bg-credo-gruen text-white"
                            : "border-gray-300 hover:border-credo-blau"
                        } ${isToggling ? "opacity-50" : ""}`}
                      >
                        {item.isCompleted && (
                          <svg
                            className="h-3 w-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>

                      {/* Title + meta */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {item.isGatekeeper && (
                            <span className="text-xs" title="Gatekeeper-Aufgabe">
                              &#128274;
                            </span>
                          )}
                          <span
                            className={`text-sm ${
                              item.isCompleted ? "text-gray-400 line-through" : "text-gray-800"
                            }`}
                          >
                            {item.title}
                          </span>
                        </div>
                        {item.dueDate && (
                          <span
                            className={`text-[10px] ${
                              isOverdue ? "text-credo-rot font-semibold" : "text-gray-400"
                            }`}
                          >
                            Fällig: {formatDate(item.dueDate)}
                            {isOverdue && " (überfällig)"}
                          </span>
                        )}
                      </div>

                      {/* Assignee badge */}
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          ASSIGNEE_COLORS[item.assignee] || "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {CIVIL_SERVICE_ASSIGNEE_LABELS[item.assignee] || item.assignee}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
