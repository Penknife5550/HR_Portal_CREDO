"use client";

/**
 * Detail-Ansicht eines Offboarding-Vorgangs (Vollbild-Seite)
 *
 * Tabs: Uebersicht | Checkliste | Rueckgaben | Dokumente | Notizen | Exit-Interview | Zeugnis
 * Nutzt die bestehende PortalHeader-Komponente und CREDO Corporate Design.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { PortalHeader } from "@/components/portal-header";
import {
  OFFBOARDING_STATUS_LABELS,
  EXIT_TYPE_LABELS,
} from "@/lib/constants";

// Local modules
import type {
  User,
  OffboardingData,
  NoteData,
  ChecklistItemData,
  ReturnItemData,
  ExitInterviewData,
  ZeugnisBewertungData,
  TabId,
} from "./types";
import { TABS } from "./types";
import { STATUS_TRANSITIONS, formatDate, daysUntilLabel } from "./helpers";
import { ArrowLeftIcon, ChevronDownIcon } from "./icons";
import {
  TabOverview,
  TabChecklist,
  TabReturns,
  TabDocuments,
  TabNotes,
  TabExitInterview,
  TabZeugnis,
} from "./tabs";

// =============================================
// Main Component
// =============================================

export function OffboardingDetailContent({
  offboardingId,
  user,
}: {
  offboardingId: string;
  user: User;
}) {
  const router = useRouter();
  const [data, setData] = useState<OffboardingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  // Status change
  const [changingStatus, setChangingStatus] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);

  // Notes
  const [notes, setNotes] = useState<NoteData[]>([]);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");

  // Checklist
  const [checklistItems, setChecklistItems] = useState<ChecklistItemData[]>([]);
  const [togglingItems, setTogglingItems] = useState<Set<string>>(new Set());
  const [editingChecklistNoteId, setEditingChecklistNoteId] = useState<string | null>(null);
  const [checklistNoteText, setChecklistNoteText] = useState("");
  const [savingChecklistNote, setSavingChecklistNote] = useState(false);

  // Return items
  const [returnItems, setReturnItems] = useState<ReturnItemData[]>([]);
  const [showAddReturn, setShowAddReturn] = useState(false);
  const [newReturn, setNewReturn] = useState({ category: "IT_HARDWARE", itemName: "", serialNumber: "", notes: "" });
  const [savingReturn, setSavingReturn] = useState(false);

  // Documents
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docType, setDocType] = useState("SONSTIGES");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Department Links
  const [sendingLinks, setSendingLinks] = useState(false);
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  // Inline Edit
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [savingField, setSavingField] = useState(false);

  // Action-Feedback
  const [actionError, setActionError] = useState<string | null>(null);

  // Exit-Interview & Zeugnis
  const [exitInterview, setExitInterview] = useState<ExitInterviewData | null>(null);
  const [zeugnisBewertung, setZeugnisBewertung] = useState<ZeugnisBewertungData | null>(null);
  const [creatingExitInterview, setCreatingExitInterview] = useState(false);
  const [creatingZeugnis, setCreatingZeugnis] = useState(false);
  useEffect(() => {
    if (!actionError) return;
    const timer = setTimeout(() => setActionError(null), 5000);
    return () => clearTimeout(timer);
  }, [actionError]);

  // Click-Outside für Status-Dropdown
  useEffect(() => {
    if (!showStatusDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-status-dropdown]")) {
        setShowStatusDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showStatusDropdown]);

  const isAdmin = user.role === "SUPER_ADMIN" || user.role === "HR_LEITUNG";

  // ---- Data Loading ----
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/offboarding/${offboardingId}`);
      if (!res.ok) throw new Error("Vorgang konnte nicht geladen werden");
      const result: OffboardingData = await res.json();
      setData(result);
      setNotes(result.notes || []);
      setChecklistItems(result.checklistItems || []);
      setReturnItems(result.returnItems || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [offboardingId]);

  const loadExitInterview = useCallback(async () => {
    try {
      const res = await fetch(`/api/offboarding/${offboardingId}/exit-interview`);
      if (res.ok) {
        const result = await res.json();
        setExitInterview(result.data || null);
      }
    } catch {}
  }, [offboardingId]);

  const loadZeugnisBewertung = useCallback(async () => {
    try {
      const res = await fetch(`/api/offboarding/${offboardingId}/zeugnis-bewertung`);
      if (res.ok) {
        const result = await res.json();
        setZeugnisBewertung(result.data || null);
      }
    } catch {}
  }, [offboardingId]);

  useEffect(() => {
    loadData();
    loadExitInterview();
    loadZeugnisBewertung();
  }, [loadData, loadExitInterview, loadZeugnisBewertung]);

  // ---- Status change ----
  const handleStatusChange = async (newStatus: string) => {
    if (!data) return;
    if (newStatus === "COMPLETED" || newStatus === "CANCELLED") {
      const msg = newStatus === "COMPLETED"
        ? "Moechten Sie diesen Offboarding-Vorgang wirklich als abgeschlossen markieren?"
        : "Moechten Sie diesen Offboarding-Vorgang wirklich abbrechen?";
      if (!window.confirm(msg)) return;
    }
    setChangingStatus(true);
    setShowStatusDropdown(false);
    try {
      const res = await fetch(`/api/offboarding/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        await loadData();
      } else {
        setActionError("Status konnte nicht geändert werden.");
      }
    } catch {
      setActionError("Verbindungsfehler bei Status-Änderung.");
    } finally {
      setChangingStatus(false);
    }
  };

  // ---- Inline field edit ----
  const handleFieldSave = async (fieldPath: string, value: string) => {
    if (!data) return;
    setSavingField(true);
    try {
      const res = await fetch(`/api/offboarding/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [fieldPath]: value }),
      });
      if (res.ok) {
        await loadData();
        setEditingField(null);
        setEditingValue("");
      } else {
        setActionError("Feld konnte nicht gespeichert werden.");
      }
    } catch {
      setActionError("Verbindungsfehler beim Speichern.");
    } finally {
      setSavingField(false);
    }
  };

  // ---- Note actions ----
  const addNote = async () => {
    if (!newNote.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/offboarding/${offboardingId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newNote.trim() }),
      });
      if (res.ok) {
        const result = await res.json();
        setNotes((prev) => [result.data || result, ...prev]);
        setNewNote("");
      } else {
        setActionError("Notiz konnte nicht gespeichert werden.");
      }
    } catch {
      setActionError("Verbindungsfehler beim Speichern der Notiz.");
    } finally {
      setSavingNote(false);
    }
  };

  const updateNote = async (noteId: string) => {
    if (!editingNoteText.trim()) return;
    try {
      const res = await fetch(`/api/offboarding/${offboardingId}/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editingNoteText.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setNotes((prev) => prev.map((n) => (n.id === noteId ? (updated.data || updated) : n)));
        setEditingNoteId(null);
        setEditingNoteText("");
      } else {
        setActionError("Notiz konnte nicht aktualisiert werden.");
      }
    } catch {
      setActionError("Verbindungsfehler beim Aktualisieren der Notiz.");
    }
  };

  const deleteNote = async (noteId: string) => {
    if (!window.confirm("Notiz wirklich löschen?")) return;
    try {
      const res = await fetch(`/api/offboarding/${offboardingId}/notes/${noteId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setNotes((prev) => prev.filter((n) => n.id !== noteId));
      } else {
        setActionError("Notiz konnte nicht gelöscht werden.");
      }
    } catch {
      setActionError("Verbindungsfehler beim Löschen der Notiz.");
    }
  };

  // ---- Checklist actions ----
  const toggleChecklistItem = async (itemId: string, currentState: boolean) => {
    setTogglingItems((prev) => new Set(prev).add(itemId));
    try {
      const res = await fetch(`/api/offboarding/${offboardingId}/checklist/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isCompleted: !currentState }),
      });
      if (res.ok) {
        const result = await res.json();
        setChecklistItems((prev) => prev.map((item) => (item.id === itemId ? (result.item || result) : item)));
      } else {
        setActionError("Checklisten-Eintrag konnte nicht aktualisiert werden.");
      }
    } catch {
      setActionError("Verbindungsfehler bei Checkliste.");
    } finally {
      setTogglingItems((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  const saveChecklistNote = async (itemId: string) => {
    setSavingChecklistNote(true);
    try {
      const res = await fetch(`/api/offboarding/${offboardingId}/checklist/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: checklistNoteText }),
      });
      if (res.ok) {
        const result = await res.json();
        setChecklistItems((prev) => prev.map((item) => (item.id === itemId ? (result.item || result) : item)));
        setEditingChecklistNoteId(null);
        setChecklistNoteText("");
      } else {
        setActionError("Checklisten-Notiz konnte nicht gespeichert werden.");
      }
    } catch {
      setActionError("Verbindungsfehler bei Checklisten-Notiz.");
    } finally {
      setSavingChecklistNote(false);
    }
  };

  // ---- Return item actions ----
  const addReturnItem = async () => {
    if (!newReturn.itemName.trim()) return;
    setSavingReturn(true);
    try {
      const res = await fetch(`/api/offboarding/${offboardingId}/returns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newReturn),
      });
      if (res.ok) {
        const result = await res.json();
        setReturnItems((prev) => [...prev, result.data || result]);
        setNewReturn({ category: "IT_HARDWARE", itemName: "", serialNumber: "", notes: "" });
        setShowAddReturn(false);
      } else {
        setActionError("Rückgabe-Gegenstand konnte nicht angelegt werden.");
      }
    } catch {
      setActionError("Verbindungsfehler beim Anlegen des Gegenstands.");
    } finally {
      setSavingReturn(false);
    }
  };

  const confirmReturn = async (itemId: string) => {
    if (!window.confirm("Rückgabe des Gegenstands bestätigen?")) return;
    try {
      const res = await fetch(`/api/offboarding/${offboardingId}/returns/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isReturned: true, returnedAt: new Date().toISOString() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setReturnItems((prev) => prev.map((item) => (item.id === itemId ? (updated.data || updated) : item)));
      } else {
        setActionError("Rückgabe konnte nicht bestätigt werden.");
      }
    } catch {
      setActionError("Verbindungsfehler bei Rückgabe-Bestätigung.");
    }
  };

  // ---- Document actions ----
  const uploadDocument = async (file: File) => {
    setUploadingDoc(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", docType);
      const res = await fetch(`/api/offboarding/${offboardingId}/documents`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        await loadData();
      } else {
        setActionError("Dokument konnte nicht hochgeladen werden.");
      }
    } catch {
      setActionError("Verbindungsfehler beim Dokument-Upload.");
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadDocument(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadDocument(file);
  };

  // ---- Department Link actions ----
  const sendDepartmentLinks = async () => {
    setSendingLinks(true);
    try {
      await fetch(`/api/offboarding/${offboardingId}/department-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      await loadData();
    } catch {
      setActionError("Abteilungs-Links konnten nicht generiert werden.");
    } finally {
      setSendingLinks(false);
    }
  };

  const sendReminder = async (departmentKey: string) => {
    setSendingReminder(departmentKey);
    try {
      await fetch(`/api/offboarding/${offboardingId}/department-links/${departmentKey}/reminder`, {
        method: "POST",
      });
      await loadData();
    } catch {
      setActionError("Reminder konnte nicht gesendet werden.");
    } finally {
      setSendingReminder(null);
    }
  };

  const createExitInterview = async () => {
    setCreatingExitInterview(true);
    try {
      const res = await fetch(`/api/offboarding/${offboardingId}/exit-interview`, { method: "POST" });
      if (res.ok) {
        await loadExitInterview();
      } else {
        const err = await res.json();
        setActionError(err.error || "Exit-Interview konnte nicht erstellt werden.");
      }
    } catch {
      setActionError("Verbindungsfehler.");
    } finally {
      setCreatingExitInterview(false);
    }
  };

  const sendExitInterviewLink = async () => {
    try {
      const res = await fetch(`/api/offboarding/${offboardingId}/exit-interview/send`, { method: "POST" });
      if (res.ok) await loadExitInterview();
      else setActionError("Link konnte nicht gesendet werden.");
    } catch {
      setActionError("Verbindungsfehler.");
    }
  };

  const createZeugnisBewertung = async (supervisorEmail: string, supervisorName: string, jobGroup: string) => {
    setCreatingZeugnis(true);
    try {
      const res = await fetch(`/api/offboarding/${offboardingId}/zeugnis-bewertung`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supervisorEmail, supervisorName, jobGroup }),
      });
      if (res.ok) {
        await loadZeugnisBewertung();
      } else {
        const err = await res.json();
        setActionError(err.error || "Zeugnis-Bewertung konnte nicht erstellt werden.");
      }
    } catch {
      setActionError("Verbindungsfehler.");
    } finally {
      setCreatingZeugnis(false);
    }
  };

  // ---- Computed values ----
  const statusInfo = data
    ? OFFBOARDING_STATUS_LABELS[data.status] || { label: data.status, color: "bg-gray-100 text-gray-800" }
    : OFFBOARDING_STATUS_LABELS.INITIATED;

  const displayName = data
    ? `${data.employeeFirstName} ${data.employeeLastName}`
    : "";

  const exitTypeLabel = data ? (EXIT_TYPE_LABELS[data.exitType] || data.exitType) : "";

  const validTransitions = data ? (STATUS_TRANSITIONS[data.status] || []) : [];

  // ---- Render ----
  if (loading) {
    return (
      <div className="min-h-screen bg-muted">
        <PortalHeader user={user} />
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-border border-t-credo-gruen" />
            <p className="text-sm text-muted-foreground">Lade Offboarding-Daten...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-muted">
        <PortalHeader user={user} />
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center">
            <p className="mb-2 text-lg font-semibold text-foreground">Fehler</p>
            <p className="mb-4 text-sm text-muted-foreground">{error || "Vorgang nicht gefunden"}</p>
            <button
              onClick={() => router.push("/dashboard?tab=offboarding")}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Zurück zum Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const lastWorkingDayInfo = daysUntilLabel(data.lastWorkingDay);

  return (
    <div className="min-h-screen bg-muted">
      <PortalHeader user={user} />

      {/* ============================================= */}
      {/* Top Bar: Back + ID + Status + Exit Type       */}
      {/* ============================================= */}
      <div className="border-b bg-card">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          {/* Row 1: Back + ID + Status + ExitType + Status-Dropdown */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => router.push("/dashboard?tab=offboarding")}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Zurück</span>
            </button>

            <div className="h-5 w-px bg-border" />

            <span className="inline-flex rounded-md bg-muted px-3 py-1 font-mono text-sm font-bold text-foreground">
              {data.displayId}
            </span>

            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusInfo.color}`}>
              {statusInfo.label}
            </span>

            <span className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
              {exitTypeLabel}
            </span>

            {/* Status-Aendern Dropdown */}
            {isAdmin && validTransitions.length > 0 && (
              <div className="relative ml-auto" data-status-dropdown>
                <button
                  onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                  disabled={changingStatus}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-credo-gruen px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#5a9420] disabled:opacity-50"
                >
                  {changingStatus ? "Wird geändert..." : "Status ändern"}
                  <ChevronDownIcon className="h-3.5 w-3.5" />
                </button>
                {showStatusDropdown && (
                  <div className="absolute right-0 top-full z-20 mt-1 min-w-[200px] rounded-lg border border-border bg-card py-1 shadow-lg">
                    {validTransitions.map((status) => {
                      const info = OFFBOARDING_STATUS_LABELS[status] || { label: status, color: "" };
                      return (
                        <button
                          key={status}
                          onClick={() => handleStatusChange(status)}
                          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                        >
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${info.color}`}>
                            {info.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Row 2: Person info + Last working day */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{displayName}</span>
            <span className="text-border">&middot;</span>
            <span>{data.employeeEmail}</span>
            <span className="text-border">&middot;</span>
            <span>
              {data.organization.name} ({data.organization.mandantNumber})
            </span>
            <span className="text-border">&middot;</span>
            <span>
              Letzter Arbeitstag: {formatDate(data.lastWorkingDay)}{" "}
              <span className={`font-semibold ${lastWorkingDayInfo.color}`}>
                ({lastWorkingDayInfo.text})
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Fehler-Banner */}
      {actionError && (
        <div className="border-b border-destructive/20 bg-destructive/10 px-4 py-3">
          <div className="mx-auto flex max-w-6xl items-center gap-2 text-sm text-destructive">
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{actionError}</span>
            <button onClick={() => setActionError(null)} className="ml-auto text-destructive/70 hover:text-destructive">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ============================================= */}
      {/* Tab Navigation                                */}
      {/* ============================================= */}
      <div className="border-b bg-card">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Tabs">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                    isActive
                      ? "border-credo-gruen text-credo-gruen"
                      : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                  }`}
                >
                  {tab.label}
                  {tab.id === "checklist" && checklistItems.length > 0 && (
                    <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                      {checklistItems.filter((i) => i.isCompleted).length}/{checklistItems.length}
                    </span>
                  )}
                  {tab.id === "returns" && returnItems.length > 0 && (
                    <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                      {returnItems.filter((i) => i.isReturned).length}/{returnItems.length}
                    </span>
                  )}
                  {tab.id === "documents" && data.documents.length > 0 && (
                    <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                      {data.documents.length}
                    </span>
                  )}
                  {tab.id === "notes" && notes.length > 0 && (
                    <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                      {notes.length}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* ============================================= */}
      {/* Tab Content                                   */}
      {/* ============================================= */}
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {/* Tab 1: Uebersicht */}
        {activeTab === "overview" && (
          <TabOverview
            data={data}
            editingField={editingField}
            editingValue={editingValue}
            savingField={savingField}
            setEditingField={setEditingField}
            setEditingValue={setEditingValue}
            handleFieldSave={handleFieldSave}
            departmentLinks={data.departmentLinks || []}
            onNavigateTab={(tab) => setActiveTab(tab as TabId)}
          />
        )}

        {/* Tab 2: Checkliste */}
        {activeTab === "checklist" && (
          <TabChecklist
            checklistItems={checklistItems}
            togglingItems={togglingItems}
            toggleChecklistItem={toggleChecklistItem}
            editingChecklistNoteId={editingChecklistNoteId}
            setEditingChecklistNoteId={setEditingChecklistNoteId}
            checklistNoteText={checklistNoteText}
            setChecklistNoteText={setChecklistNoteText}
            savingChecklistNote={savingChecklistNote}
            saveChecklistNote={saveChecklistNote}
            departmentLinks={data.departmentLinks || []}
            sendDepartmentLinks={sendDepartmentLinks}
            sendingLinks={sendingLinks}
            sendReminder={sendReminder}
            sendingReminder={sendingReminder}
            copiedLinkId={copiedLinkId}
            setCopiedLinkId={setCopiedLinkId}
          />
        )}

        {/* Tab 3: Rueckgaben */}
        {activeTab === "returns" && (
          <TabReturns
            returnItems={returnItems}
            confirmReturn={confirmReturn}
            showAddReturn={showAddReturn}
            setShowAddReturn={setShowAddReturn}
            newReturn={newReturn}
            setNewReturn={setNewReturn}
            addReturnItem={addReturnItem}
            savingReturn={savingReturn}
          />
        )}

        {/* Tab 4: Dokumente */}
        {activeTab === "documents" && (
          <TabDocuments
            data={data}
            offboardingId={offboardingId}
            docType={docType}
            setDocType={setDocType}
            uploadingDoc={uploadingDoc}
            fileInputRef={fileInputRef}
            handleFileSelect={handleFileSelect}
            handleFileDrop={handleFileDrop}
            dragOver={dragOver}
            setDragOver={setDragOver}
          />
        )}

        {/* Tab 5: Notizen */}
        {activeTab === "notes" && (
          <TabNotes
            notes={notes}
            newNote={newNote}
            setNewNote={setNewNote}
            savingNote={savingNote}
            addNote={addNote}
            editingNoteId={editingNoteId}
            setEditingNoteId={setEditingNoteId}
            editingNoteText={editingNoteText}
            setEditingNoteText={setEditingNoteText}
            updateNote={updateNote}
            deleteNote={deleteNote}
            currentUserId={user.userId}
          />
        )}

        {/* Tab 6: Exit-Interview */}
        {activeTab === "exit-interview" && (
          <TabExitInterview
            exitInterview={exitInterview}
            creatingExitInterview={creatingExitInterview}
            createExitInterview={createExitInterview}
            sendExitInterviewLink={sendExitInterviewLink}
            hasPrivateEmail={!!data.employeePrivateEmail}
          />
        )}

        {/* Tab 7: Zeugnis */}
        {activeTab === "zeugnis" && (
          <TabZeugnis
            zeugnisBewertung={zeugnisBewertung}
            creatingZeugnis={creatingZeugnis}
            createZeugnisBewertung={createZeugnisBewertung}
          />
        )}
      </main>
    </div>
  );
}
