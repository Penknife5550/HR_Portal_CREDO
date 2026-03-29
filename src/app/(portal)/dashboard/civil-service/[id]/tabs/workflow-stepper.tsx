"use client";

/**
 * Workflow-Stepper: Zeigt den Verbeamtungsprozess als geführten Workflow.
 * Der Anwender sieht immer klar: Was ist der nächste Schritt? Wer ist dran? Was muss getan werden?
 *
 * Logik:
 * - Schritte werden nach step-Feld gruppiert und sequenziell angezeigt
 * - Der erste Schritt mit offenen Gatekeeper-Items ist der "aktive" Schritt
 * - Aktiver Schritt: gross, prominent, mit Aktions-Buttons
 * - Kommende Schritte: kompakt, ausgegraut
 * - Erledigte Schritte: zusammengeklappt mit Haken
 */

import { useMemo, useState } from "react";
import type { ChecklistItem, Stakeholders } from "../types";
import { ASSIGNEE_COLORS } from "../types";
import { CIVIL_SERVICE_ASSIGNEE_LABELS } from "@/lib/constants";

// =============================================
// Typen
// =============================================

interface WorkflowStep {
  stepKey: string;
  phase: string;
  category: string;
  items: ChecklistItem[];
  gatekeeperItems: ChecklistItem[];
  nonGatekeeperItems: ChecklistItem[];
  isCompleted: boolean;
  isActive: boolean;
  completedCount: number;
  totalCount: number;
}

interface NoteProps {
  editingNoteId: string | null;
  noteText: string;
  savingNote: boolean;
  onEditNote: (id: string, currentNotes: string | null) => void;
  onCancelNote: () => void;
  onNoteTextChange: (text: string) => void;
  onSaveNote: (itemId: string) => void;
}

interface WorkflowStepperProps extends NoteProps {
  checklistItems: ChecklistItem[];
  stakeholders: Stakeholders | null;
  employeeName: string;
  employeeEmail: string;
  processId: string;
  applicationToken: string | null;
  applicationSubmittedAt: string | null;
  onToggleItem: (itemId: string, currentValue: boolean) => void;
  togglingItems: Set<string>;
  onSendApplicationLink?: () => void;
  sendingLink?: boolean;
}

// =============================================
// Schritt-Labels und Beschreibungen
// =============================================

const STEP_DESCRIPTIONS: Record<string, { title: string; description: string }> = {
  "1": {
    title: "Formloser Antrag & Voraussetzungen",
    description: "Die Lehrkraft reicht den Antrag ein und HR prüft die 12 Voraussetzungen.",
  },
  "2": {
    title: "Beirat informieren",
    description: "Die Schulleitung informiert den Beirat über den Antrag auf Verbeamtung.",
  },
  "3": {
    title: "Unterrichtsbesuch & Beurteilung",
    description: "Schulleitung führt den 1. Unterrichtsbesuch durch und erstellt die dienstliche Beurteilung.",
  },
  "4": {
    title: "Referenzen einholen",
    description: "Schulleitung führt Gespräch mit der Lehrkraft und erstellt schriftliche Referenz + Gemeinde-Referenz.",
  },
  "5": {
    title: "Beiratsentscheidung (Probe)",
    description: "Der Beirat entscheidet über die Zulassung zur Verbeamtung auf Probe.",
  },
  "6.A.1": { title: "Amtsarzt — Anforderung", description: "HR sendet Anforderung des amtsärztlichen Zeugnisses an die Lehrkraft." },
  "6.A.2": { title: "Amtsarzt — Zeugnis", description: "Amtsärztliches Zeugnis muss eingehen." },
  "6.A.3": { title: "Amtsarzt — Bestätigung", description: "HR bestätigt positives amtsärztliches Zeugnis." },
  "6.B.1": { title: "Besoldung — Vordienstzeiten", description: "HR berechnet die Vordienstzeiten." },
  "6.B.2": { title: "Besoldung — Erfahrungsstufe", description: "HR setzt die Erfahrungsstufe fest." },
  "6.B.3": { title: "Besoldung — Bescheid", description: "HR versendet den Bescheid an die Lehrkraft." },
  "6.C.1": { title: "Vertrag erstellen", description: "HR erstellt den PSI-Vertrag auf Probe." },
  "6.C.2": { title: "Vertrag zur Unterschrift", description: "HR sendet den Vertrag an die Lehrkraft zur Unterschrift." },
  "6.C.3": { title: "Vertrag zurück", description: "Unterschriebener Vertrag muss zurückkommen." },
  "6.C.4": { title: "BR-Antrag stellen", description: "HR stellt Antrag an Bezirksregierung Dez. 48." },
  "6.C.5": { title: "BR-Genehmigung", description: "Bezirksregierung Dez. 48 muss den Vertrag genehmigen." },
  "6.D.1": { title: "PKV-Info", description: "HR informiert Lehrkraft über PKV-Pflicht." },
  "6.D.2": { title: "KK-Bescheinigung", description: "HR erstellt die Krankenkassen-Bescheinigung." },
  "6.D.3": { title: "PKV abgeschlossen", description: "Lehrkraft muss PKV abgeschlossen haben." },
  "6.E.1": { title: "Beihilfe-Info", description: "HR sendet Info-Brief zur Beihilfe an die Lehrkraft." },
  "6.E.2": { title: "Beihilfe-Erstantrag", description: "HR übergibt den Beihilfe-Erstantrag." },
  "6.E.3": { title: "Datenschutz Beihilfe", description: "Lehrkraft muss Datenschutz-Einwilligung unterschreiben." },
  "6.E.4": { title: "Beihilfe-Stammblatt", description: "HR erstellt das Stammblatt für die Beihilfeakte." },
  "6.E.5": { title: "Mitteilung Beihilfestelle", description: "HR meldet an BR Dez. 23 (Beihilfestelle)." },
  "6.F.1": { title: "RV-Befreiung vorbereiten", description: "HR bereitet den Antrag auf RV-Befreiung vor." },
  "6.F.2": { title: "Arbeitgeber-Erklärung", description: "HR füllt die Arbeitgeber-Erklärung aus." },
  "6.F.3": { title: "RV-Antrag unterschreiben", description: "Lehrkraft muss den Antrag unterschreiben." },
  "6.F.4": { title: "RV-Antrag senden", description: "HR sendet den Antrag an die DRV Bund." },
  "6.G.1": { title: "Kündigung Angestelltenverhältnis", description: "HR erstellt Kündigungsbestätigung." },
  "6.G.2": { title: "LOGA-Überführung", description: "HR überführt von Angestelltem zu Beamtem in LOGA." },
  "6.G.3": { title: "Familienzuschläge", description: "Lehrkraft gibt Erklärung zu Familienzuschlägen ab." },
  "6.H.1": { title: "Riester-Info", description: "HR sendet Anschreiben zur Riester-Rente." },
  "6.H.2": { title: "Riester-Einverständnis", description: "Lehrkraft gibt Einverständnis für ZfA." },
  "6.H.3": { title: "Förderverein", description: "Lehrkraft muss Förderverein-Mitgliedschaft haben." },
  "6.H.4": { title: "Info an Schule", description: "HR informiert Sekretariat und Schulleitung." },
  "7.1": { title: "Tag 1 Checkliste", description: "Alle Voraussetzungen für den Probezeitbeginn prüfen." },
  "8": { title: "2. Unterrichtsbesuch (nach 1 Jahr)", description: "Schulleitung führt 2. Unterrichtsbesuch und Beurteilung durch." },
  "9": { title: "3. Unterrichtsbesuch (Ende Probezeit)", description: "Schulleitung führt den letzten Unterrichtsbesuch + Referenz durch." },
  "10.1": { title: "Amtsarzt Lebenszeit — Anforderung", description: "HR fordert neues amtsärztliches Zeugnis an." },
  "10.2": { title: "Amtsarzt Lebenszeit — Zeugnis", description: "Neues amtsärztliches Zeugnis muss eingehen." },
  "11": { title: "Übernahme auf Lebenszeit", description: "Beiratsentscheidung, neuer Vertrag, BR-Genehmigung, LOGA-Update." },
};

// Tag-1 Schritte zusammenfassen (7.1 bis 7.9 → ein Block)
function getStepGroupKey(step: string): string {
  if (step.startsWith("7.")) return "7.1";
  return step;
}

// =============================================
// Komponente
// =============================================

export function WorkflowStepper({
  checklistItems,
  stakeholders,
  employeeName,
  employeeEmail,
  processId,
  applicationToken,
  applicationSubmittedAt,
  onToggleItem,
  togglingItems,
  onSendApplicationLink,
  sendingLink,
  editingNoteId,
  noteText,
  savingNote,
  onEditNote,
  onCancelNote,
  onNoteTextChange,
  onSaveNote,
}: WorkflowStepperProps) {
  const [expandedCompleted, setExpandedCompleted] = useState<Set<string>>(new Set());

  // Schritte gruppieren
  const steps = useMemo(() => {
    const grouped: Record<string, ChecklistItem[]> = {};
    for (const item of checklistItems) {
      const groupKey = getStepGroupKey(item.step);
      if (!grouped[groupKey]) grouped[groupKey] = [];
      grouped[groupKey].push(item);
    }

    // In Reihenfolge bringen (nach erstem Auftreten in der Checkliste)
    const stepOrder: string[] = [];
    const seen = new Set<string>();
    for (const item of checklistItems) {
      const gk = getStepGroupKey(item.step);
      if (!seen.has(gk)) {
        seen.add(gk);
        stepOrder.push(gk);
      }
    }

    let foundActive = false;
    const result: WorkflowStep[] = stepOrder.map((stepKey) => {
      const items = grouped[stepKey] || [];
      const gatekeeperItems = items.filter((i) => i.isGatekeeper);
      const nonGatekeeperItems = items.filter((i) => !i.isGatekeeper);
      const completedCount = items.filter((i) => i.isCompleted).length;
      const isCompleted = items.every((i) => i.isCompleted);

      // Aktiver Schritt = erster nicht-erledigter Schritt mit offenen Gatekeeper-Items
      const hasOpenGatekeeper = gatekeeperItems.some((i) => !i.isCompleted);
      const hasOpenItems = items.some((i) => !i.isCompleted);
      let isActive = false;
      if (!foundActive && (hasOpenGatekeeper || hasOpenItems)) {
        isActive = true;
        foundActive = true;
      }

      return {
        stepKey,
        phase: items[0]?.phase || "",
        category: items[0]?.category || "",
        items,
        gatekeeperItems,
        nonGatekeeperItems,
        isCompleted,
        isActive,
        completedCount,
        totalCount: items.length,
      };
    });

    return result;
  }, [checklistItems]);

  const completedSteps = steps.filter((s) => s.isCompleted);
  const activeStep = steps.find((s) => s.isActive);
  const upcomingSteps = steps.filter((s) => !s.isCompleted && !s.isActive);

  const toggleCompletedExpand = (stepKey: string) => {
    setExpandedCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(stepKey)) next.delete(stepKey);
      else next.add(stepKey);
      return next;
    });
  };

  // Assignee-Name ermitteln (aus stakeholders)
  const getAssigneeName = (assignee: string): string | null => {
    if (assignee === "LK") return employeeName;
    if (assignee === "SL" && stakeholders?.schulleitung) {
      return stakeholders.schulleitung.name || stakeholders.schulleitung.email;
    }
    if (assignee === "EXTERN" && stakeholders?.amtsarzt) {
      return stakeholders.amtsarzt.email;
    }
    if (assignee === "BEIRAT" && stakeholders?.beirat) {
      return stakeholders.beirat.email;
    }
    return null;
  };

  const stepInfo = (key: string) => STEP_DESCRIPTIONS[key] || { title: `Schritt ${key}`, description: "" };

  return (
    <div className="space-y-4">
      {/* ===== AKTIVER SCHRITT ===== */}
      {activeStep && (
        <div className="rounded-2xl border-2 border-credo-blau bg-white shadow-md overflow-hidden">
          {/* Header */}
          <div className="bg-credo-blau/5 px-6 py-4 border-b border-credo-blau/10">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-credo-blau text-white text-sm font-bold">
                {activeStep.stepKey.split(".")[0]}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-foreground">
                    {stepInfo(activeStep.stepKey).title}
                  </h3>
                  <span className="rounded-full bg-credo-blau/10 px-2.5 py-0.5 text-[11px] font-semibold text-credo-blau">
                    Aktueller Schritt
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {stepInfo(activeStep.stepKey).description}
                </p>
              </div>
              <span className="text-sm font-medium text-muted-foreground">
                {activeStep.completedCount}/{activeStep.totalCount}
              </span>
            </div>
          </div>

          {/* Gatekeeper-Aufgaben (prominent) */}
          <div className="px-6 py-4 space-y-3">
            {activeStep.gatekeeperItems.filter((i) => !i.isCompleted).length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Pflicht-Aufgaben (muessen erledigt werden)
                </p>
                {activeStep.gatekeeperItems
                  .filter((i) => !i.isCompleted)
                  .map((item) => (
                    <ActiveTaskCard
                      key={item.id}
                      item={item}
                      assigneeName={getAssigneeName(item.assignee)}
                      onToggle={onToggleItem}
                      isToggling={togglingItems.has(item.id)}
                      isGatekeeper
                      processId={processId}
                      applicationToken={applicationToken}
                      applicationSubmittedAt={applicationSubmittedAt}
                      onSendApplicationLink={onSendApplicationLink}
                      sendingLink={sendingLink}
                      editingNoteId={editingNoteId}
                      noteText={noteText}
                      savingNote={savingNote}
                      onEditNote={onEditNote}
                      onCancelNote={onCancelNote}
                      onNoteTextChange={onNoteTextChange}
                      onSaveNote={onSaveNote}
                    />
                  ))}
              </div>
            )}

            {/* Nicht-Gatekeeper (Nebentasks) */}
            {activeStep.nonGatekeeperItems.filter((i) => !i.isCompleted).length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Weitere Aufgaben
                </p>
                {activeStep.nonGatekeeperItems
                  .filter((i) => !i.isCompleted)
                  .map((item) => (
                    <ActiveTaskCard
                      key={item.id}
                      item={item}
                      assigneeName={getAssigneeName(item.assignee)}
                      onToggle={onToggleItem}
                      isToggling={togglingItems.has(item.id)}
                      isGatekeeper={false}
                      processId={processId}
                      applicationToken={applicationToken}
                      applicationSubmittedAt={applicationSubmittedAt}
                      editingNoteId={editingNoteId}
                      noteText={noteText}
                      savingNote={savingNote}
                      onEditNote={onEditNote}
                      onCancelNote={onCancelNote}
                      onNoteTextChange={onNoteTextChange}
                      onSaveNote={onSaveNote}
                    />
                  ))}
              </div>
            )}

            {/* Bereits erledigte Items in diesem Schritt */}
            {activeStep.items.filter((i) => i.isCompleted).length > 0 && (
              <div className="border-t border-border pt-3 space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  Bereits erledigt ({activeStep.items.filter((i) => i.isCompleted).length})
                </p>
                {activeStep.items
                  .filter((i) => i.isCompleted)
                  .map((item) => (
                    <div key={item.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="text-credo-gruen">&#10003;</span>
                      <span className="line-through">{item.title}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== KOMMENDE SCHRITTE ===== */}
      {upcomingSteps.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-gray-500 text-xs">
              &#8594;
            </span>
            Kommende Schritte ({upcomingSteps.length})
          </h3>
          <div className="space-y-2">
            {upcomingSteps.map((s) => {
              const info = stepInfo(s.stepKey);
              const mainAssignees = [...new Set(s.items.map((i) => i.assignee))];
              return (
                <div
                  key={s.stepKey}
                  className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50/50 px-4 py-3 opacity-60"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-500">
                    {s.stepKey.split(".")[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{info.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{info.description}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {mainAssignees.map((a) => (
                      <span
                        key={a}
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${ASSIGNEE_COLORS[a] || "bg-gray-100 text-gray-600"}`}
                      >
                        {CIVIL_SERVICE_ASSIGNEE_LABELS[a] || a}
                      </span>
                    ))}
                  </div>
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
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-credo-gruen/10 text-credo-gruen text-xs">
              &#10003;
            </span>
            Erledigt ({completedSteps.length} Schritte)
          </h3>
          <div className="space-y-1.5">
            {completedSteps.map((s) => {
              const info = stepInfo(s.stepKey);
              const isExpanded = expandedCompleted.has(s.stepKey);
              return (
                <div key={s.stepKey}>
                  <button
                    onClick={() => toggleCompletedExpand(s.stepKey)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-gray-50"
                  >
                    <span className="text-credo-gruen text-sm">&#10003;</span>
                    <span className="flex-1 text-sm text-muted-foreground">
                      {info.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {s.totalCount}/{s.totalCount}
                    </span>
                    <svg
                      className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isExpanded && (
                    <div className="ml-8 mt-1 mb-2 space-y-1">
                      {s.items.map((item) => (
                        <div key={item.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="text-credo-gruen">&#10003;</span>
                          <span>{item.title}</span>
                          <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${ASSIGNEE_COLORS[item.assignee] || "bg-gray-100 text-gray-600"}`}>
                            {CIVIL_SERVICE_ASSIGNEE_LABELS[item.assignee] || item.assignee}
                          </span>
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
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-credo-gruen text-white text-lg font-bold">
              &#10003;
            </div>
          </div>
          <h3 className="text-lg font-bold text-foreground">Alle Schritte abgeschlossen</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Der Verbeamtungsprozess ist vollständig abgearbeitet.
          </p>
        </div>
      )}
    </div>
  );
}

// =============================================
// Aktive Aufgaben-Karte
// =============================================

function ActiveTaskCard({
  item,
  assigneeName,
  onToggle,
  isToggling,
  isGatekeeper,
  processId,
  applicationToken,
  applicationSubmittedAt,
  onSendApplicationLink,
  sendingLink,
  editingNoteId,
  noteText,
  savingNote,
  onEditNote,
  onCancelNote,
  onNoteTextChange,
  onSaveNote,
}: {
  item: ChecklistItem;
  assigneeName: string | null;
  onToggle: (id: string, current: boolean) => void;
  isToggling: boolean;
  isGatekeeper: boolean;
  processId: string;
  applicationToken: string | null;
  applicationSubmittedAt: string | null;
  onSendApplicationLink?: () => void;
  sendingLink?: boolean;
} & NoteProps) {
  // Zeigt der Item den LK-Antrag? (Schritt 1, Assignee LK, Gatekeeper, "Formloser Antrag")
  const isApplicationStep = item.step === "1" && item.assignee === "LK" && item.isGatekeeper && item.title.includes("Antrag");

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 transition-colors ${
        isGatekeeper
          ? "border-credo-blau/20 bg-credo-blau/5"
          : "border-gray-100 bg-gray-50/50"
      }`}
    >
      {/* Checkbox */}
      <button
        onClick={() => onToggle(item.id, item.isCompleted)}
        disabled={isToggling}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
          isToggling
            ? "border-gray-300 animate-pulse"
            : "border-gray-300 hover:border-credo-blau hover:bg-credo-blau/5"
        }`}
      >
        {isToggling && (
          <div className="h-3 w-3 animate-spin rounded-full border border-credo-blau border-t-transparent" />
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-foreground">{item.title}</p>
          {isGatekeeper && (
            <span className="text-[10px] text-credo-rot font-semibold" title="Pflicht / Gatekeeper">
              PFLICHT
            </span>
          )}
        </div>

        {/* Wer ist zuständig */}
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              ASSIGNEE_COLORS[item.assignee] || "bg-gray-100 text-gray-600"
            }`}
          >
            {CIVIL_SERVICE_ASSIGNEE_LABELS[item.assignee] || item.assignee}
          </span>
          {assigneeName && (
            <span className="text-xs text-muted-foreground">
              {assigneeName}
            </span>
          )}
          {item.dueDate && (
            <span className="text-[10px] text-muted-foreground">
              Fällig: {new Date(item.dueDate).toLocaleDateString("de-DE")}
            </span>
          )}
        </div>

        {item.description && (
          <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
        )}

        {/* Spezial-Buttons für bestimmte Schritte */}
        {isApplicationStep && !applicationToken && onSendApplicationLink && (
          <button
            onClick={onSendApplicationLink}
            disabled={sendingLink}
            className="mt-2 rounded-lg bg-credo-blau px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-credo-blau/85 disabled:opacity-50"
          >
            {sendingLink ? "Wird erstellt..." : "Magic Link an Lehrkraft senden"}
          </button>
        )}
        {isApplicationStep && applicationToken && !applicationSubmittedAt && (
          <div className="mt-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-credo-blau/10 px-2.5 py-1 text-[11px] font-semibold text-credo-blau">
              <span className="h-1.5 w-1.5 rounded-full bg-credo-blau" />
              Magic Link erstellt — wartet auf Einreichung
            </span>
          </div>
        )}
        {isApplicationStep && applicationSubmittedAt && (
          <div className="mt-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-credo-gruen/10 px-2.5 py-1 text-[11px] font-semibold text-credo-gruen">
              <span className="h-1.5 w-1.5 rounded-full bg-credo-gruen" />
              Antrag eingereicht am {new Date(applicationSubmittedAt).toLocaleDateString("de-DE")}
            </span>
          </div>
        )}

        {/* Dokument-Upload Hinweis */}
        {item.linkedDocumentType && (
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Dokument: {item.linkedDocumentType} — hochladen im Dokumente-Tab
          </p>
        )}

        {/* Notiz anzeigen (wenn vorhanden und nicht gerade editiert) */}
        {item.notes && editingNoteId !== item.id && (
          <div className="mt-2 rounded-md border border-credo-gelb/30 bg-credo-gelb/5 px-3 py-2">
            <p className="text-xs text-foreground whitespace-pre-wrap">{item.notes}</p>
          </div>
        )}

        {/* Notiz-Editor */}
        {editingNoteId === item.id && (
          <div className="mt-2 space-y-2">
            <textarea
              value={noteText}
              onChange={(e) => onNoteTextChange(e.target.value)}
              placeholder="Notiz eingeben..."
              rows={2}
              className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
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

      {/* Notiz-Button */}
      <button
        onClick={() => {
          if (editingNoteId === item.id) {
            onCancelNote();
          } else {
            onEditNote(item.id, item.notes);
          }
        }}
        className={`relative mt-0.5 shrink-0 rounded-md p-1.5 transition-colors ${
          editingNoteId === item.id
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
    </div>
  );
}
