"use client";

/**
 * Generischer Workflow-Stepper fuer alle Prozesse (Onboarding, Offboarding, Verbeamtung)
 *
 * Zeigt einen gefuehrten Prozess:
 * - Aktiver Schritt: prominent, blau hervorgehoben, mit Aktions-Buttons
 * - Kommende Schritte: kompakt, ausgegraut
 * - Erledigte Schritte: zusammengeklappt mit Haken
 */

import { useState } from "react";

// =============================================
// Typen
// =============================================

export interface WorkflowAction {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  loading?: boolean;
}

export interface WorkflowSubItem {
  id: string;
  title: string;
  isCompleted: boolean;
  assignee?: string;
  assigneeColor?: string;
  contactName?: string;
  statusLabel?: string;
  statusColor?: string;
  note?: string | null;
}

export interface WorkflowStep {
  key: string;
  title: string;
  description: string;
  status: "completed" | "active" | "upcoming" | "blocked";
  completedAt?: string;
  /** Haupt-Aktionen fuer den aktiven Schritt */
  actions?: WorkflowAction[];
  /** Sub-Items (z.B. Checklist-Items, Abteilungen, Rueckgaben) */
  items?: WorkflowSubItem[];
  /** Fortschritt (z.B. 3/5) */
  progress?: { done: number; total: number };
  /** Zusaetzlicher Infotext */
  info?: string;
  /** Warnung */
  warning?: string;
}

interface ProcessWorkflowStepperProps {
  steps: WorkflowStep[];
  /** Optionaler Titel ueber dem Stepper */
  title?: string;
}

// =============================================
// Farben
// =============================================

const STATUS_STYLES = {
  completed: {
    circle: "bg-credo-gruen text-white",
    border: "border-credo-gruen/20",
    bg: "bg-credo-gruen/5",
    connector: "bg-credo-gruen",
    text: "text-credo-gruen",
  },
  active: {
    circle: "bg-credo-blau text-white",
    border: "border-credo-blau",
    bg: "bg-white",
    connector: "bg-gray-200",
    text: "text-credo-blau",
  },
  upcoming: {
    circle: "bg-gray-200 text-gray-500",
    border: "border-gray-100",
    bg: "bg-gray-50/50",
    connector: "bg-gray-200",
    text: "text-gray-400",
  },
  blocked: {
    circle: "bg-credo-rot text-white",
    border: "border-credo-rot/20",
    bg: "bg-credo-rot/5",
    connector: "bg-gray-200",
    text: "text-credo-rot",
  },
};

// =============================================
// Komponente
// =============================================

export function ProcessWorkflowStepper({ steps, title }: ProcessWorkflowStepperProps) {
  const [expandedCompleted, setExpandedCompleted] = useState<Set<string>>(new Set());

  const completedSteps = steps.filter((s) => s.status === "completed");
  const activeStep = steps.find((s) => s.status === "active");
  const upcomingSteps = steps.filter((s) => s.status === "upcoming" || s.status === "blocked");

  const toggleExpand = (key: string) => {
    setExpandedCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* ===== AKTIVER SCHRITT ===== */}
      {activeStep && (
        <div className="rounded-2xl border-2 border-credo-blau bg-white shadow-md overflow-hidden">
          <div className="bg-credo-blau/5 px-6 py-4 border-b border-credo-blau/10">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-credo-blau text-white text-sm font-bold">
                {steps.indexOf(activeStep) + 1}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-foreground">{activeStep.title}</h3>
                  <span className="rounded-full bg-credo-blau/10 px-2.5 py-0.5 text-[11px] font-semibold text-credo-blau">
                    Aktueller Schritt
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{activeStep.description}</p>
              </div>
              {activeStep.progress && (
                <span className="text-sm font-medium text-muted-foreground">
                  {activeStep.progress.done}/{activeStep.progress.total}
                </span>
              )}
            </div>
          </div>

          <div className="px-6 py-4 space-y-4">
            {/* Warnung */}
            {activeStep.warning && (
              <div className="rounded-lg bg-credo-rot/5 border border-credo-rot/20 px-4 py-3 text-sm text-credo-rot">
                {activeStep.warning}
              </div>
            )}

            {/* Info */}
            {activeStep.info && (
              <div className="rounded-lg bg-credo-blau/5 border border-credo-blau/20 px-4 py-3 text-sm text-credo-blau">
                {activeStep.info}
              </div>
            )}

            {/* Sub-Items */}
            {activeStep.items && activeStep.items.length > 0 && (
              <div className="space-y-2">
                {activeStep.items.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
                      item.isCompleted
                        ? "border-credo-gruen/20 bg-credo-gruen/5"
                        : "border-gray-100 bg-gray-50/50"
                    }`}
                  >
                    {/* Status Icon */}
                    <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      item.isCompleted ? "bg-credo-gruen text-white" : "bg-gray-200 text-gray-500"
                    }`}>
                      {item.isCompleted ? "\u2713" : "\u2022"}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-sm font-medium ${item.isCompleted ? "text-muted-foreground line-through" : "text-foreground"}`}>
                          {item.title}
                        </p>
                        {item.statusLabel && (
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.statusColor || "bg-gray-100 text-gray-600"}`}>
                            {item.statusLabel}
                          </span>
                        )}
                      </div>
                      {item.assignee && (
                        <div className="mt-1 flex items-center gap-2">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.assigneeColor || "bg-gray-100 text-gray-600"}`}>
                            {item.assignee}
                          </span>
                          {item.contactName && (
                            <span className="text-xs text-muted-foreground">{item.contactName}</span>
                          )}
                        </div>
                      )}
                      {item.note && (
                        <div className="mt-1.5 rounded-md border border-credo-gelb/30 bg-credo-gelb/5 px-3 py-1.5">
                          <p className="text-xs text-foreground whitespace-pre-wrap">{item.note}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Aktions-Buttons */}
            {activeStep.actions && activeStep.actions.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {activeStep.actions.map((action, i) => {
                  const base = "rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50";
                  const variant = action.variant === "danger"
                    ? "bg-credo-rot text-white hover:bg-credo-rot/90"
                    : action.variant === "secondary"
                    ? "border border-border bg-card text-foreground hover:bg-accent"
                    : "bg-primary text-primary-foreground hover:bg-primary/90";
                  return (
                    <button
                      key={i}
                      onClick={action.onClick}
                      disabled={action.disabled || action.loading}
                      className={`${base} ${variant}`}
                    >
                      {action.loading ? (
                        <span className="flex items-center gap-2">
                          <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                          {action.label}
                        </span>
                      ) : action.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== KOMMENDE SCHRITTE ===== */}
      {upcomingSteps.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-gray-500 text-xs">&#8594;</span>
            Kommende Schritte ({upcomingSteps.length})
          </h3>
          <div className="space-y-2">
            {upcomingSteps.map((s) => {
              const idx = steps.indexOf(s) + 1;
              const style = STATUS_STYLES[s.status];
              return (
                <div key={s.key} className={`flex items-center gap-3 rounded-lg border ${style.border} ${style.bg} px-4 py-3 opacity-60`}>
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${style.circle}`}>
                    {s.status === "blocked" ? "\u2717" : idx}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{s.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{s.description}</p>
                  </div>
                  {s.progress && (
                    <span className="text-xs text-muted-foreground">{s.progress.done}/{s.progress.total}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== ERLEDIGTE SCHRITTE ===== */}
      {completedSteps.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-credo-gruen/10 text-credo-gruen text-xs">&#10003;</span>
            Erledigt ({completedSteps.length} Schritte)
          </h3>
          <div className="space-y-1.5">
            {completedSteps.map((s) => {
              const isExpanded = expandedCompleted.has(s.key);
              return (
                <div key={s.key}>
                  <button
                    onClick={() => toggleExpand(s.key)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-gray-50"
                  >
                    <span className="text-credo-gruen text-sm">&#10003;</span>
                    <span className="flex-1 text-sm text-muted-foreground">{s.title}</span>
                    {s.completedAt && (
                      <span className="text-[10px] text-muted-foreground">{s.completedAt}</span>
                    )}
                    <svg className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isExpanded && s.items && s.items.length > 0 && (
                    <div className="ml-8 mt-1 mb-2 space-y-1">
                      {s.items.map((item) => (
                        <div key={item.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className={item.isCompleted ? "text-credo-gruen" : "text-gray-400"}>
                            {item.isCompleted ? "\u2713" : "\u2610"}
                          </span>
                          <span>{item.title}</span>
                          {item.assignee && (
                            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${item.assigneeColor || "bg-gray-100 text-gray-600"}`}>
                              {item.assignee}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Alles erledigt */}
      {!activeStep && upcomingSteps.length === 0 && completedSteps.length > 0 && (
        <div className="rounded-2xl border-2 border-credo-gruen bg-credo-gruen/5 p-6 text-center">
          <div className="flex justify-center mb-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-credo-gruen text-white text-lg font-bold">&#10003;</div>
          </div>
          <h3 className="text-lg font-bold text-foreground">Prozess abgeschlossen</h3>
          <p className="text-sm text-muted-foreground mt-1">Alle Schritte wurden erfolgreich abgearbeitet.</p>
        </div>
      )}
    </div>
  );
}
