"use client";

import { DEPARTMENT_LABELS } from "@/lib/constants";
import type { ChecklistItemData, DepartmentLinkData } from "../types";
import {
  formatDate,
  formatDateTime,
  CHECKLIST_PHASE_LABELS,
} from "../helpers";
import { Card } from "../shared-components";
import {
  CheckIcon,
  ChatBubbleIcon,
  NoteIndicatorIcon,
  SendIcon,
} from "../icons";

export function TabChecklist({
  checklistItems,
  togglingItems,
  toggleChecklistItem,
  editingChecklistNoteId,
  setEditingChecklistNoteId,
  checklistNoteText,
  setChecklistNoteText,
  savingChecklistNote,
  saveChecklistNote,
  departmentLinks,
  sendDepartmentLinks,
  sendingLinks,
  sendReminder,
  sendingReminder,
  copiedLinkId,
  setCopiedLinkId,
}: {
  checklistItems: ChecklistItemData[];
  togglingItems: Set<string>;
  toggleChecklistItem: (id: string, current: boolean) => void;
  editingChecklistNoteId: string | null;
  setEditingChecklistNoteId: (id: string | null) => void;
  checklistNoteText: string;
  setChecklistNoteText: (v: string) => void;
  savingChecklistNote: boolean;
  saveChecklistNote: (id: string) => void;
  departmentLinks: DepartmentLinkData[];
  sendDepartmentLinks: () => void;
  sendingLinks: boolean;
  sendReminder: (key: string) => void;
  sendingReminder: string | null;
  copiedLinkId: string | null;
  setCopiedLinkId: (id: string | null) => void;
}) {
  if (checklistItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card py-16">
        <CheckIcon className="mb-4 h-16 w-16 text-border" />
        <p className="mb-1 text-base font-medium text-foreground">Keine Checkliste</p>
        <p className="text-sm text-muted-foreground">
          Diesem Vorgang wurde noch keine Checkliste zugeordnet.
        </p>
      </div>
    );
  }

  const completed = checklistItems.filter((i) => i.isCompleted).length;
  const total = checklistItems.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Group by category
  const grouped: Record<string, ChecklistItemData[]> = {};
  checklistItems.forEach((item) => {
    const cat = item.category || "Sonstige";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  });

  return (
    <div className="space-y-6">
      {/* Progress Bar */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Fortschritt</p>
            <p className="text-xs text-muted-foreground">
              {completed} von {total} Aufgaben erledigt
            </p>
          </div>
          <span
            className={`text-2xl font-bold ${
              pct === 100 ? "text-credo-gruen" : pct > 50 ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {pct}%
          </span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-credo-gruen transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Department Links Section */}
      {departmentLinks.length > 0 && (
        <Card
          title="Abteilungs-Links"
          action={
            <button
              onClick={sendDepartmentLinks}
              disabled={sendingLinks}
              className="inline-flex items-center gap-1.5 rounded-lg bg-credo-gruen px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#5a9420] disabled:opacity-50"
            >
              <SendIcon className="h-3.5 w-3.5" />
              {sendingLinks ? "Wird gesendet..." : "Magic Links versenden"}
            </button>
          }
        >
          <div className="space-y-3">
            {departmentLinks.map((link) => {
              const magicUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/offboarding-tasks/${link.token}`;
              return (
                <div key={link.id} className="rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex rounded-full bg-[#009AC6]/10 px-2.5 py-0.5 text-[10px] font-semibold text-[#009AC6]">
                        {DEPARTMENT_LABELS[link.departmentKey] || link.departmentName}
                      </span>
                      <span className="text-xs text-muted-foreground">{link.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Status */}
                      {link.allTasksComplete ? (
                        <span className="inline-flex rounded-full bg-credo-gruen/10 px-2.5 py-0.5 text-[10px] font-semibold text-credo-gruen">
                          Fertig
                        </span>
                      ) : link.firstOpenedAt ? (
                        <span className="inline-flex rounded-full bg-credo-blau/10 px-2.5 py-0.5 text-[10px] font-semibold text-credo-blau">
                          Geöffnet ({link.openCount}x)
                        </span>
                      ) : link.sentAt ? (
                        <span className="inline-flex rounded-full bg-credo-gelb/10 px-2.5 py-0.5 text-[10px] font-semibold text-credo-gelb">
                          Gesendet
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-[10px] font-semibold text-gray-600">
                          Nicht gesendet
                        </span>
                      )}
                      {/* Reminder button */}
                      {link.sentAt && !link.allTasksComplete && (
                        <button
                          onClick={() => sendReminder(link.departmentKey)}
                          disabled={sendingReminder === link.departmentKey}
                          className="rounded-md border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                          title={link.lastReminderAt ? `Letzter Reminder: ${formatDateTime(link.lastReminderAt)}` : "Reminder senden"}
                        >
                          {sendingReminder === link.departmentKey ? "..." : "Reminder"}
                        </button>
                      )}
                      {/* Copy Magic Link */}
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(magicUrl);
                          setCopiedLinkId(link.id);
                          setTimeout(() => setCopiedLinkId(null), 2000);
                        }}
                        className="rounded-md border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        title={magicUrl}
                      >
                        {copiedLinkId === link.id ? (
                          <span className="text-credo-gruen">Kopiert!</span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            Link
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {departmentLinks.length === 0 && (
        <div className="flex items-center justify-between rounded-xl border border-dashed border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Noch keine Abteilungs-Links erstellt.</p>
          <button
            onClick={sendDepartmentLinks}
            disabled={sendingLinks}
            className="inline-flex items-center gap-1.5 rounded-lg bg-credo-gruen px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#5a9420] disabled:opacity-50"
          >
            <SendIcon className="h-3.5 w-3.5" />
            {sendingLinks ? "Wird gesendet..." : "Magic Links versenden"}
          </button>
        </div>
      )}

      {/* Grouped Items */}
      {Object.entries(grouped).map(([category, items]) => {
        const catCompleted = items.filter((i) => i.isCompleted).length;
        const catTotal = items.length;
        const catPct = catTotal > 0 ? Math.round((catCompleted / catTotal) * 100) : 0;

        return (
          <div key={category}>
            <div className="mb-3 flex items-center gap-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {CHECKLIST_PHASE_LABELS[category] || category}
              </h3>
              <span className="h-px flex-1 bg-border" />
              <span className="text-[11px] font-medium text-muted-foreground">{catCompleted}/{catTotal}</span>
            </div>
            {/* Category progress bar */}
            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-credo-gruen transition-all duration-500"
                style={{ width: `${catPct}%` }}
              />
            </div>
            <div className="space-y-2">
              {items
                .sort((a, b) => a.orderIndex - b.orderIndex)
                .map((item) => (
                  <div key={item.id} className="rounded-xl border border-border bg-card transition-all hover:shadow-sm">
                    <div className="flex items-start gap-3 p-4">
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleChecklistItem(item.id, item.isCompleted)}
                        disabled={togglingItems.has(item.id)}
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all ${
                          item.isCompleted
                            ? "border-credo-gruen bg-credo-gruen"
                            : "border-border hover:border-credo-gruen/50"
                        } ${togglingItems.has(item.id) ? "opacity-50" : ""}`}
                      >
                        {item.isCompleted && <CheckIcon className="h-3.5 w-3.5 text-white" />}
                      </button>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={`text-sm font-medium ${
                              item.isCompleted ? "text-muted-foreground line-through" : "text-foreground"
                            }`}
                          >
                            {item.title}
                          </p>

                          {/* Note button */}
                          <button
                            onClick={() => {
                              if (editingChecklistNoteId === item.id) {
                                setEditingChecklistNoteId(null);
                                setChecklistNoteText("");
                              } else {
                                setEditingChecklistNoteId(item.id);
                                setChecklistNoteText(item.notes || "");
                              }
                            }}
                            className={`relative shrink-0 rounded-md p-1.5 transition-colors ${
                              editingChecklistNoteId === item.id
                                ? "bg-[#009AC6]/10 text-[#009AC6]"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            }`}
                            title="Notiz"
                          >
                            <ChatBubbleIcon className="h-4 w-4" />
                            {item.notes && (
                              <span className="absolute -right-0.5 -top-0.5">
                                <NoteIndicatorIcon className="h-2.5 w-2.5 text-[#FBC900]" />
                              </span>
                            )}
                          </button>
                        </div>

                        {/* Meta info */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          {item.assigneeDepartment && (
                            <span className="inline-flex rounded-full bg-[#009AC6]/10 px-2.5 py-0.5 text-[10px] font-semibold text-[#009AC6]">
                              {DEPARTMENT_LABELS[item.assigneeDepartment] || item.assigneeDepartment}
                            </span>
                          )}
                          {item.dueDate && (
                            <span className="text-[11px] text-muted-foreground">
                              Fällig: {formatDate(item.dueDate)}
                            </span>
                          )}
                          {item.isCompleted && item.completedAt && (
                            <span className="text-[11px] text-muted-foreground">
                              am {formatDate(item.completedAt)}
                            </span>
                          )}
                        </div>

                        {/* Existing note display */}
                        {item.notes && editingChecklistNoteId !== item.id && (
                          <div className="mt-2 rounded-md border border-[#FBC900]/30 bg-[#FBC900]/5 px-3 py-2">
                            <p className="text-xs text-foreground">{item.notes}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Inline note editor */}
                    {editingChecklistNoteId === item.id && (
                      <div className="border-t border-border bg-muted/30 p-4">
                        <textarea autoComplete="off"
                          value={checklistNoteText}
                          onChange={(e) => setChecklistNoteText(e.target.value)}
                          placeholder="Notiz eingeben..."
                          rows={2}
                          className="mb-2 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-credo-blau focus:ring-1 focus:ring-credo-blau"
                          autoFocus
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setEditingChecklistNoteId(null);
                              setChecklistNoteText("");
                            }}
                            className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                          >
                            Abbrechen
                          </button>
                          <button
                            onClick={() => saveChecklistNote(item.id)}
                            disabled={savingChecklistNote}
                            className="rounded-md bg-credo-gruen px-4 py-1.5 text-xs font-medium text-white transition-all hover:bg-[#5a9420] active:scale-95 disabled:opacity-50"
                          >
                            {savingChecklistNote ? "..." : "Speichern"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
