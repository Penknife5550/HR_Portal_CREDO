"use client";

import { useState, useMemo } from "react";
import { CIVIL_SERVICE_PHASE_LABELS, CIVIL_SERVICE_ASSIGNEE_LABELS } from "@/lib/constants";
import type { ChecklistItem } from "../types";
import { PHASE_ORDER, ASSIGNEE_COLORS } from "../types";
import { formatDate } from "../helpers";
import { ChevronIcon } from "../icons";

const ASSIGNEE_FILTER_OPTIONS = [
  { key: "ALL", label: "Alle" },
  { key: "HR", label: "HR" },
  { key: "SL", label: "SL" },
  { key: "LK", label: "LK" },
  { key: "EXTERN", label: "Extern" },
  { key: "BEIRAT", label: "Beirat" },
] as const;

export function TabChecklist({
  checklistByPhase,
  collapsedPhases,
  togglePhaseCollapse,
  togglingItems,
  onToggle,
  editingNoteId,
  noteText,
  savingNote,
  onEditNote,
  onCancelNote,
  onNoteTextChange,
  onSaveNote,
}: {
  checklistByPhase: Record<string, ChecklistItem[]>;
  collapsedPhases: Set<string>;
  togglePhaseCollapse: (key: string) => void;
  togglingItems: Set<string>;
  onToggle: (id: string, current: boolean) => void;
  editingNoteId: string | null;
  noteText: string;
  savingNote: boolean;
  onEditNote: (id: string, currentNotes: string | null) => void;
  onCancelNote: () => void;
  onNoteTextChange: (text: string) => void;
  onSaveNote: (itemId: string) => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [assigneeFilter, setAssigneeFilter] = useState<string>("ALL");

  const assigneeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    let total = 0;
    for (const items of Object.values(checklistByPhase)) {
      for (const item of items) {
        counts[item.assignee] = (counts[item.assignee] || 0) + 1;
        total++;
      }
    }
    counts["ALL"] = total;
    return counts;
  }, [checklistByPhase]);

  const filteredByPhase = useMemo(() => {
    if (assigneeFilter === "ALL") return checklistByPhase;
    const filtered: Record<string, ChecklistItem[]> = {};
    for (const [phase, items] of Object.entries(checklistByPhase)) {
      const matching = items.filter((i) => i.assignee === assigneeFilter);
      if (matching.length > 0) {
        filtered[phase] = matching;
      }
    }
    return filtered;
  }, [checklistByPhase, assigneeFilter]);

  return (
    <div className="space-y-3">
      {/* Assignee Filter Bar */}
      <div className="flex items-center gap-2 flex-wrap rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
        {ASSIGNEE_FILTER_OPTIONS.map((opt) => {
          const count = assigneeCounts[opt.key] || 0;
          const isActive = assigneeFilter === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => setAssigneeFilter(opt.key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                isActive
                  ? "bg-credo-gruen text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {opt.label}
              <span
                className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                  isActive ? "bg-white/20 text-white" : "bg-gray-200 text-gray-500"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Phases */}
      {PHASE_ORDER.map((phaseKey) => {
        const items = filteredByPhase[phaseKey];
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
                  const isEditingThis = editingNoteId === item.id;

                  return (
                    <div key={item.id}>
                      <div
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
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>

                        {/* Title + meta */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {item.isGatekeeper && (
                              <span className="text-xs" title="Gatekeeper-Aufgabe">&#128274;</span>
                            )}
                            <span className={`text-sm ${item.isCompleted ? "text-gray-400 line-through" : "text-gray-800"}`}>
                              {item.title}
                            </span>
                          </div>
                          {item.dueDate && (
                            <span className={`text-[10px] ${isOverdue ? "text-credo-rot font-semibold" : "text-gray-400"}`}>
                              Fällig: {formatDate(item.dueDate)}
                              {isOverdue && " (überfällig)"}
                            </span>
                          )}

                          {/* Notiz anzeigen */}
                          {item.notes && !isEditingThis && (
                            <div className="mt-1.5 rounded-md border border-credo-gelb/30 bg-credo-gelb/5 px-3 py-1.5">
                              <p className="text-xs text-foreground whitespace-pre-wrap">{item.notes}</p>
                            </div>
                          )}
                        </div>

                        {/* Notiz-Button */}
                        <button
                          onClick={() => {
                            if (isEditingThis) {
                              onCancelNote();
                            } else {
                              onEditNote(item.id, item.notes);
                            }
                          }}
                          className={`relative shrink-0 rounded-md p-1.5 transition-colors ${
                            isEditingThis
                              ? "bg-credo-blau/10 text-credo-blau"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
                          title="Notiz"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                          </svg>
                          {item.notes && (
                            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-credo-gelb" />
                          )}
                        </button>

                        {/* Assignee badge */}
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            ASSIGNEE_COLORS[item.assignee] || "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {CIVIL_SERVICE_ASSIGNEE_LABELS[item.assignee] || item.assignee}
                        </span>
                      </div>

                      {/* Notiz-Editor */}
                      {isEditingThis && (
                        <div className="border-t border-border bg-muted/30 px-5 py-3">
                          <textarea
                            value={noteText}
                            onChange={(e) => onNoteTextChange(e.target.value)}
                            placeholder="Notiz eingeben..."
                            rows={2}
                            className="mb-2 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                            autoFocus
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={onCancelNote}
                              className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                            >
                              Abbrechen
                            </button>
                            <button
                              onClick={() => onSaveNote(item.id)}
                              disabled={savingNote}
                              className="rounded-md bg-credo-gruen px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-credo-gruen/85 disabled:opacity-50"
                            >
                              {savingNote ? "..." : "Speichern"}
                            </button>
                          </div>
                        </div>
                      )}
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
