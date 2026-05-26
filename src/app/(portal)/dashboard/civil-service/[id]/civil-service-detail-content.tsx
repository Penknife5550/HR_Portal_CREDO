"use client";

/**
 * Detail-Ansicht eines Verbeamtungsvorgangs (PSI) – Vollbild-Seite
 *
 * Tabs: Uebersicht | Checkliste | Beurteilungen | Dokumente | Protokoll
 * CREDO Corporate Design, Apple-like UX.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PortalHeader } from "@/components/portal-header";
import {
  CIVIL_SERVICE_STATUS_LABELS,
  CIVIL_SERVICE_STEP_LABELS,
  CIVIL_SERVICE_PHASE_LABELS,
} from "@/lib/constants";

import type { User, CivilServiceData, PhaseData, TabId } from "./types";
import { TABS, MAIN_PHASES, SUB_PHASES_II, PHASE_ORDER } from "./types";
import { getPhaseStatus, getMainPhaseStatus } from "./helpers";
import { ArrowLeftIcon } from "./icons";
import {
  TabOverview,
  TabChecklist,
  TabAssessments,
  TabDocuments,
  TabProtocol,
} from "./tabs";

// =============================================
// Phase Timeline Component
// =============================================

function PhaseTimeline({ phases }: { phases: PhaseData[] }) {
  const statusColor = (status: string) => {
    switch (status) {
      case "COMPLETED": return "bg-credo-gruen text-white";
      case "IN_PROGRESS": return "bg-credo-gelb text-white";
      case "BLOCKED": return "bg-credo-rot text-white";
      default: return "bg-gray-200 text-gray-500";
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "COMPLETED": return "\u2713";
      case "IN_PROGRESS": return "\u25CB";
      case "BLOCKED": return "\u2717";
      default: return "\u2022";
    }
  };

  const connectorColor = (status: string) => {
    switch (status) {
      case "COMPLETED": return "bg-credo-gruen";
      case "IN_PROGRESS": return "bg-credo-gelb";
      default: return "bg-gray-200";
    }
  };

  // Calculate overall progress
  const totalItems = PHASE_ORDER.length;
  const completedItems = PHASE_ORDER.filter(
    (k) => getPhaseStatus(phases, k) === "COMPLETED"
  ).length;
  const progressPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      {/* Main phases */}
      <div className="flex items-center justify-between gap-2">
        {MAIN_PHASES.map((mp, i) => {
          const st = getMainPhaseStatus(phases, mp.key);
          return (
            <div key={mp.key} className="flex flex-1 items-center">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold transition-all ${statusColor(st)}`}
                >
                  {statusIcon(st)}
                </div>
                <span className="mt-2 text-xs font-medium text-gray-600 text-center leading-tight">
                  {mp.label}
                </span>
              </div>
              {i < MAIN_PHASES.length - 1 && (
                <div className={`h-0.5 flex-1 min-w-[24px] -mt-5 ${connectorColor(st)}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Sub-phases for Phase II */}
      <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
        {SUB_PHASES_II.map((sk) => {
          const st = getPhaseStatus(phases, sk);
          const letter = sk.split("_")[1];
          const dotColor =
            st === "COMPLETED"
              ? "bg-credo-gruen text-white"
              : st === "IN_PROGRESS"
              ? "bg-credo-gelb text-white"
              : st === "BLOCKED"
              ? "bg-credo-rot text-white"
              : "bg-gray-200 text-gray-500";
          return (
            <div
              key={sk}
              className="flex flex-col items-center"
              title={CIVIL_SERVICE_PHASE_LABELS[sk]}
            >
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold ${dotColor}`}
              >
                {letter}
              </div>
              <span className="mt-1 text-[10px] text-gray-400">
                {CIVIL_SERVICE_PHASE_LABELS[sk]?.split(" ")[0]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="mt-5">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
          <span>Gesamtfortschritt</span>
          <span className="font-semibold text-gray-700">{progressPct}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-credo-blau to-credo-gruen transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// =============================================
// Main Component
// =============================================

export function CivilServiceDetailContent({
  processId,
  user,
}: {
  processId: string;
  user: User;
}) {
  const router = useRouter();
  const [data, setData] = useState<CivilServiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  // Checklist
  const [togglingItems, setTogglingItems] = useState<Set<string>>(new Set());
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set());
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Documents
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadDocType, setUploadDocType] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Copy link feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Action feedback
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!actionError && !actionSuccess) return;
    const timer = setTimeout(() => {
      setActionError(null);
      setActionSuccess(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [actionError, actionSuccess]);

  // ---- Data Loading ----
  const loadData = useCallback(async (silent = false) => {
    // silent=true: Hintergrund-Refresh nach Aktionen (z.B. Checklisten-Toggle,
    // das serverseitig Phasen neu berechnet) — kein loading-State, damit die
    // Ansicht nicht unmountet und die Scroll-Position erhalten bleibt.
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/civil-service/${processId}`);
      if (!res.ok) throw new Error("Vorgang konnte nicht geladen werden");
      const result: CivilServiceData = await res.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [processId]);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // ---- Checklist Toggle ----
  const handleChecklistToggle = async (itemId: string, currentValue: boolean) => {
    if (!data) return;
    setTogglingItems((prev) => new Set(prev).add(itemId));
    try {
      const res = await fetch(`/api/civil-service/${processId}/checklist/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isCompleted: !currentValue }),
      });
      if (res.ok) {
        await loadData(true);
      } else {
        setActionError("Checkliste konnte nicht aktualisiert werden.");
      }
    } catch {
      setActionError("Verbindungsfehler.");
    } finally {
      setTogglingItems((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  // ---- Checklist Note Save ----
  const handleSaveNote = async (itemId: string) => {
    setSavingNote(true);
    try {
      const res = await fetch(`/api/civil-service/${processId}/checklist/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: noteText, isCompleted: data?.checklistItems.find(i => i.id === itemId)?.isCompleted ?? false }),
      });
      if (res.ok) {
        await loadData(true);
        setEditingNoteId(null);
        setNoteText("");
      } else {
        setActionError("Notiz konnte nicht gespeichert werden.");
      }
    } catch {
      setActionError("Verbindungsfehler.");
    } finally {
      setSavingNote(false);
    }
  };

  // ---- Document Upload ----
  const handleDocUpload = async (file: File, docType: string) => {
    if (!data) return;
    setUploadingDoc(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", docType);
      const res = await fetch(`/api/civil-service/${processId}/documents`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        setActionSuccess("Dokument hochgeladen.");
        await loadData(true);
      } else {
        setActionError("Upload fehlgeschlagen.");
      }
    } catch {
      setActionError("Verbindungsfehler beim Upload.");
    } finally {
      setUploadingDoc(false);
      setUploadDocType("");
    }
  };

  // ---- Copy Assessment Link ----
  const handleCopyLink = (token: string, id: string) => {
    const url = `${window.location.origin}/civil-service-assessment/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ---- Phase toggle ----
  const togglePhaseCollapse = (phaseKey: string) => {
    setCollapsedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseKey)) next.delete(phaseKey);
      else next.add(phaseKey);
      return next;
    });
  };

  // ---- Loading State ----
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50/50">
        <PortalHeader user={user} />
        <div className="flex items-center justify-center py-32">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-credo-blau border-t-transparent" />
            <span className="text-sm text-gray-500">Vorgang wird geladen...</span>
          </div>
        </div>
      </div>
    );
  }

  // ---- Error State ----
  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50/50">
        <PortalHeader user={user} />
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <div className="rounded-2xl border border-red-100 bg-red-50 p-8">
            <p className="text-credo-rot font-medium">
              {error || "Vorgang nicht gefunden."}
            </p>
            <button
              onClick={() => router.push("/dashboard?tab=civil-service")}
              className="mt-4 text-sm text-credo-blau hover:underline"
            >
              Zurück zur Übersicht
            </button>
          </div>
        </div>
      </div>
    );
  }

  const statusInfo = CIVIL_SERVICE_STATUS_LABELS[data.status] || {
    label: data.status,
    color: "bg-gray-100 text-gray-800",
  };
  const stepLabel =
    CIVIL_SERVICE_STEP_LABELS[data.currentStep] || `Schritt ${data.currentStep}`;

  // Checklist grouping
  const checklistByPhase: Record<string, typeof data.checklistItems> = {};
  for (const item of data.checklistItems) {
    if (!checklistByPhase[item.phase]) checklistByPhase[item.phase] = [];
    checklistByPhase[item.phase].push(item);
  }

  // Gatekeeper items not yet done
  const openGatekeepers = data.checklistItems.filter(
    (i) => i.isGatekeeper && !i.isCompleted
  );

  // Overdue items
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdueItems = data.checklistItems.filter(
    (i) => !i.isCompleted && i.dueDate && new Date(i.dueDate) < today
  );

  return (
    <div className="min-h-screen bg-gray-50/50">
      <PortalHeader user={user} />

      {/* Action feedback toast */}
      {(actionError || actionSuccess) && (
        <div className="fixed top-4 right-4 z-50 animate-in fade-in slide-in-from-top-2">
          <div
            className={`rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
              actionError ? "bg-credo-rot text-white" : "bg-credo-gruen text-white"
            }`}
          >
            {actionError || actionSuccess}
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {/* ---- Top Bar ---- */}
        <div className="mb-6">
          <Link
            href="/dashboard?tab=civil-service"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Zurück
          </Link>

          <div className="flex flex-wrap items-start gap-3 sm:items-center">
            <span className="rounded-lg bg-credo-blau/10 px-3 py-1 text-sm font-bold text-credo-blau tracking-wide">
              {data.displayId}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${statusInfo.color}`}
            >
              {statusInfo.label}
            </span>
            <span className="text-sm text-gray-500">
              Schritt {data.currentStep}: {stepLabel}
            </span>
          </div>

          <div className="mt-2 flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
                {data.employeeFirstName} {data.employeeLastName}
              </h1>
              <p className="text-sm text-gray-500">
                {data.employeeEmail} &middot; {data.organizationName}
              </p>
            </div>
            {/* Status-Aktionen für Admin/HR */}
            {["SUPER_ADMIN", "HR_LEITUNG"].includes(user.role) && !["COMPLETED", "REJECTED", "CANCELLED"].includes(data.status) && (
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={async () => {
                    if (!confirm("Vorgang als abgeschlossen markieren?")) return;
                    const res = await fetch(`/api/civil-service/${processId}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ status: "COMPLETED" }),
                    });
                    if (res.ok) loadData(true);
                    else alert("Status konnte nicht geaendert werden.");
                  }}
                  className="rounded-lg bg-credo-gruen px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-credo-gruen/85"
                >
                  Abschliessen
                </button>
                <button
                  onClick={async () => {
                    if (!confirm("Vorgang wirklich abbrechen?")) return;
                    const res = await fetch(`/api/civil-service/${processId}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ status: "CANCELLED" }),
                    });
                    if (res.ok) loadData(true);
                    else alert("Status konnte nicht geaendert werden.");
                  }}
                  className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
                >
                  Abbrechen
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ---- Phase Timeline ---- */}
        <div className="mb-6">
          <PhaseTimeline phases={data.phases} />
        </div>

        {/* ---- Tabs ---- */}
        <div className="mb-6 overflow-x-auto">
          <div className="flex gap-1 border-b border-gray-200">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors border-b-2 min-h-[44px] ${
                  activeTab === tab.id
                    ? "border-credo-blau text-credo-blau"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ---- Tab Content ---- */}
        {activeTab === "overview" && (
          <TabOverview
            data={data}
            openGatekeepers={openGatekeepers}
            overdueItems={overdueItems}
            onChecklistToggle={handleChecklistToggle}
            togglingItems={togglingItems}
            onReload={loadData}
            editingNoteId={editingNoteId}
            noteText={noteText}
            savingNote={savingNote}
            onEditNote={(id, currentNotes) => { setEditingNoteId(id); setNoteText(currentNotes || ""); }}
            onCancelNote={() => { setEditingNoteId(null); setNoteText(""); }}
            onNoteTextChange={setNoteText}
            onSaveNote={handleSaveNote}
          />
        )}

        {activeTab === "checklist" && (
          <TabChecklist
            checklistByPhase={checklistByPhase}
            collapsedPhases={collapsedPhases}
            togglePhaseCollapse={togglePhaseCollapse}
            togglingItems={togglingItems}
            onToggle={handleChecklistToggle}
            editingNoteId={editingNoteId}
            noteText={noteText}
            savingNote={savingNote}
            onEditNote={(id, currentNotes) => { setEditingNoteId(id); setNoteText(currentNotes || ""); }}
            onCancelNote={() => { setEditingNoteId(null); setNoteText(""); }}
            onNoteTextChange={setNoteText}
            onSaveNote={handleSaveNote}
          />
        )}

        {activeTab === "assessments" && (
          <TabAssessments
            assessments={data.assessments}
            employeeName={`${data.employeeFirstName} ${data.employeeLastName}`}
            copiedId={copiedId}
            onCopyLink={handleCopyLink}
            processId={processId}
            onReload={loadData}
            setActionError={setActionError}
            setActionSuccess={setActionSuccess}
          />
        )}

        {activeTab === "documents" && (
          <TabDocuments
            documents={data.documents}
            uploadingDoc={uploadingDoc}
            uploadDocType={uploadDocType}
            setUploadDocType={setUploadDocType}
            fileInputRef={fileInputRef}
            onUpload={handleDocUpload}
            processId={processId}
            assessments={data.assessments}
          />
        )}

        {activeTab === "protocol" && <TabProtocol auditLog={data.auditLog || data.auditLogs || []} />}
      </main>
    </div>
  );
}
