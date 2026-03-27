"use client";

/**
 * Detail-Ansicht eines Onboarding-Vorgangs (Vollbild-Seite)
 *
 * Tabs: Uebersicht | Dokumente | Checkliste | Vorgesetzter
 * Nutzt die bestehende PortalHeader-Komponente und CREDO Corporate Design.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { PortalHeader } from "@/components/portal-header";
import { STATUS_LABELS } from "@/lib/constants";

// =============================================
// Types
// =============================================

interface User {
  userId: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

interface DocumentData {
  id: string;
  type: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  status: string;
  uploadedAt: string;
}

interface ChecklistItemData {
  id: string;
  title: string;
  category: string;
  orderIndex: number;
  isCompleted: boolean;
  completedAt: string | null;
  completedBy: { firstName: string; lastName: string } | null;
  dueDate: string | null;
  assignee: string | null;
  notes: string | null;
}

interface NoteData {
  id: string;
  content: string;
  createdAt: string;
  createdBy: { firstName: string; lastName: string };
}

interface DetailData {
  id: string;
  displayId: string | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  questionnaireType: string;
  token: string;
  supervisorToken: string | null;
  supervisorEmail: string | null;
  invitedAt: string;
  submittedAt: string | null;
  organization: { name: string; mandantNumber: string };
  personalData: {
    firstName: string | null;
    lastName: string | null;
    isComplete: boolean;
    currentStep: number;
    // Persoenliche Angaben
    salutation: string | null;
    title: string | null;
    birthName: string | null;
    birthDate: string | null;
    birthPlace: string | null;
    birthCountry: string | null;
    nationality: string | null;
    maritalStatus: string | null;
    severelyDisabled: boolean | null;
    disabilityDegree: number | null;
    // Adresse
    street: string | null;
    houseNumber: string | null;
    zipCode: string | null;
    city: string | null;
    country: string | null;
    phone: string | null;
    mobile: string | null;
    emailPrivate: string | null;
    // Bankverbindung
    iban: string | null;
    bic: string | null;
    bankName: string | null;
    accountHolder: string | null;
    // Sozialversicherung
    socialSecurityNumber: string | null;
    healthInsuranceName: string | null;
    healthInsuranceType: string | null;
    parentStatus: boolean | null;
    // Steuer
    taxId: string | null;
    taxClass: string | null;
    taxAllowance: number | null;
    childAllowance: number | null;
    religion: string | null;
    // Bildung
    highestSchoolDegree: string | null;
    highestProfessionalDegree: string | null;
    // Sonstiges
    hasOtherEmployment: boolean | null;
    otherEmployerName: string | null;
    otherWeeklyHours: number | null;
    employerType: string | null;
    hasMinijob: boolean | null;
    minijobRvBefreiung: boolean | null;
    // Masernschutz
    bornAfter1971: boolean | null;
    masernschutzProvided: boolean | null;
    // DSGVO
    dsgvoAccepted: boolean | null;
    dsgvoAcceptedAt: string | null;
    // Kinder
    children: {
      id: string;
      firstName: string;
      lastName: string | null;
      birthDate: string;
      taxAllowance: boolean;
    }[];
  } | null;
  supervisorData: {
    isComplete: boolean;
    currentStep: number;
    betriebsstaette: string | null;
    stellenbeschreibung: string | null;
    vertragsbeginn: string | null;
    befristet: boolean | null;
    vertragsende: string | null;
    befristungSachgrund: string | null;
    vollzeit: boolean | null;
    wochenstunden: number | null;
    tageProWoche: number | null;
    hauptarbeitgeberId: string | null;
    hauptarbeitgeberStunden: number | null;
    nebenarbeitgeberId: string | null;
    nebenarbeitgeberStunden: number | null;
    svPflichtig: boolean | null;
    minijob: boolean | null;
    ehrenamt: boolean | null;
    kostenstelle: string | null;
    kostenstelleAnteil: number | null;
    probezeit: boolean | null;
    probezeitMonate: number | null;
    verguetungsmodell: string | null;
    entgeltgruppe: string | null;
    stufe: string | null;
    festgehalt: number | null;
    stundenlohn: number | null;
    bemerkungVerguetung: string | null;
    jahressonderzahlung: boolean | null;
    sonderzahlungProzent: number | null;
    sachbezuege: boolean | null;
    sachbezuegeBetrag: number | null;
    zulage: boolean | null;
    zulageBetrag: number | null;
    urlaubstageProJahr: number | null;
    masernschutzErforderlich: boolean | null;
    masernschutzVorArbeitsbeginn: boolean | null;
    zeiterfassung: boolean | null;
    zusatzvereinbarungen: string | null;
  } | null;
  documents: DocumentData[];
  checklistItems: ChecklistItemData[];
  notes: NoteData[];
  _count: { notes: number };
}

// =============================================
// Constants
// =============================================

const TABS = [
  { id: "overview", label: "Uebersicht" },
  { id: "questionnaire", label: "Fragebogen-Daten" },
  { id: "documents", label: "Dokumente" },
  { id: "checklist", label: "Checkliste" },
  { id: "supervisor", label: "Vorgesetzter" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// =============================================
// Helper Functions
// =============================================

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "\u2014";
  return new Date(dateStr).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatBoolean(val: boolean | null): string {
  if (val === null || val === undefined) return "\u2014";
  return val ? "Ja" : "Nein";
}

function formatCurrency(val: number | null): string {
  if (val === null || val === undefined) return "\u2014";
  return val.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function formatNumber(val: number | null, suffix?: string): string {
  if (val === null || val === undefined) return "\u2014";
  return suffix ? `${val} ${suffix}` : String(val);
}

// =============================================
// SVG Icons
// =============================================

function ArrowLeftIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  );
}

function ClipboardIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
    </svg>
  );
}

function CheckIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function DownloadIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}

function DocumentIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function UploadCloudIcon({ className = "h-12 w-12" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
    </svg>
  );
}

function ChatBubbleIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function NoteIndicatorIcon({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
    </svg>
  );
}

function LinkIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
}

// =============================================
// Copy Button (reusable)
// =============================================

function CopyButton({ text, label = "Kopieren" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:bg-muted active:scale-95"
    >
      {copied ? (
        <>
          <CheckIcon className="h-3.5 w-3.5 text-credo-gruen" />
          <span className="text-credo-gruen">Kopiert!</span>
        </>
      ) : (
        <>
          <ClipboardIcon className="h-3.5 w-3.5" />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}

// =============================================
// Main Component
// =============================================

export function DetailContent({
  onboardingId,
  user,
}: {
  onboardingId: string;
  user: User;
}) {
  const router = useRouter();
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  // Notes state
  const [notes, setNotes] = useState<NoteData[]>([]);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Supervisor link state
  const [supervisorEmail, setSupervisorEmail] = useState("");
  const [generatingLink, setGeneratingLink] = useState(false);
  const [linkResult, setLinkResult] = useState<string | null>(null);

  // Checklist state
  const [checklistItems, setChecklistItems] = useState<ChecklistItemData[]>([]);
  const [togglingItems, setTogglingItems] = useState<Set<string>>(new Set());
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [checklistNoteText, setChecklistNoteText] = useState("");
  const [savingChecklistNote, setSavingChecklistNote] = useState(false);
  const [completingProcess, setCompletingProcess] = useState(false);
  const [reviewingProcess, setReviewingProcess] = useState(false);

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  // ---- Status-Aktionen ----
  const isAdmin = user.role === "SUPER_ADMIN" || user.role === "HR_LEITUNG";

  // "Als geprueft markieren" – wenn Vorgesetzter fertig ist
  const canReview = data &&
    ["SUBMITTED", "SUPERVISOR_SUBMITTED"].includes(data.status) &&
    isAdmin;

  // "Vorgang abschliessen" – wenn geprueft
  const canComplete = data &&
    data.status === "REVIEWED" &&
    isAdmin;

  const handleReviewProcess = async () => {
    if (!data || !canReview) return;
    setReviewingProcess(true);
    try {
      const res = await fetch(`/api/onboarding/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "REVIEWED" }),
      });
      if (res.ok) {
        await loadData();
      }
    } catch {
      // silent
    } finally {
      setReviewingProcess(false);
    }
  };

  const handleCompleteProcess = async () => {
    if (!data || !canComplete) return;
    if (!window.confirm("Moechten Sie diesen Vorgang wirklich als abgeschlossen markieren? Diese Aktion kann nicht rueckgaengig gemacht werden.")) return;
    setCompletingProcess(true);
    try {
      const res = await fetch(`/api/onboarding/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });
      if (res.ok) {
        await loadData();
      }
    } catch {
      // silent
    } finally {
      setCompletingProcess(false);
    }
  };

  // ---- Data Loading ----
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/onboarding/${onboardingId}`);
      if (!res.ok) throw new Error("Vorgang konnte nicht geladen werden");
      const result: DetailData = await res.json();
      setData(result);
      setNotes(result.notes || []);
      setChecklistItems(result.checklistItems || []);
      setSupervisorEmail(result.supervisorEmail || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [onboardingId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ---- Note actions ----
  const addNote = async () => {
    if (!newNote.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/onboarding/${onboardingId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newNote.trim() }),
      });
      if (res.ok) {
        const result = await res.json();
        setNotes((prev) => [result.data, ...prev]);
        setNewNote("");
      }
    } catch {
      // silent
    } finally {
      setSavingNote(false);
    }
  };

  // ---- Supervisor link ----
  const generateSupervisorLink = async () => {
    if (!supervisorEmail.trim()) return;
    setGeneratingLink(true);
    try {
      const res = await fetch(`/api/onboarding/${onboardingId}/supervisor-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supervisorEmail: supervisorEmail.trim() }),
      });
      if (res.ok) {
        const result = await res.json();
        setLinkResult(result.modalitaetenLink);
        loadData();
      }
    } catch {
      // silent
    } finally {
      setGeneratingLink(false);
    }
  };

  // ---- Checklist actions ----
  const toggleChecklistItem = async (itemId: string, currentState: boolean) => {
    setTogglingItems((prev) => new Set(prev).add(itemId));
    try {
      const res = await fetch(`/api/onboarding/${onboardingId}/checklist/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isCompleted: !currentState }),
      });
      if (res.ok) {
        const updated = await res.json();
        setChecklistItems((prev) => prev.map((item) => (item.id === itemId ? updated : item)));
      }
    } catch {
      // silent
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
      const res = await fetch(`/api/onboarding/${onboardingId}/checklist/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: checklistNoteText }),
      });
      if (res.ok) {
        const updated = await res.json();
        setChecklistItems((prev) => prev.map((item) => (item.id === itemId ? updated : item)));
        setEditingNoteId(null);
        setChecklistNoteText("");
      }
    } catch {
      // silent
    } finally {
      setSavingChecklistNote(false);
    }
  };

  // ---- Computed values ----
  const statusInfo = data ? STATUS_LABELS[data.status] || STATUS_LABELS.INVITED : STATUS_LABELS.INVITED;
  const displayName =
    data?.personalData?.firstName && data?.personalData?.lastName
      ? `${data.personalData.firstName} ${data.personalData.lastName}`
      : data?.firstName && data?.lastName
        ? `${data.firstName} ${data.lastName}`
        : data?.email || "";

  // ---- Render ----
  if (loading) {
    return (
      <div className="min-h-screen bg-muted">
        <PortalHeader user={user} />
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-border border-t-credo-gruen" />
            <p className="text-sm text-muted-foreground">Lade Vorgangsdaten...</p>
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
              onClick={() => router.push("/dashboard")}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Zurueck zum Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted">
      <PortalHeader user={user} />

      {/* ============================================= */}
      {/* Top Bar: Back + ID + Status + Type            */}
      {/* ============================================= */}
      <div className="border-b bg-card">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          {/* Row 1: Back + ID + Status + Type */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => router.push("/dashboard")}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Zurueck</span>
            </button>

            <div className="h-5 w-px bg-border" />

            {data.displayId && (
              <span className="inline-flex rounded-md bg-muted px-3 py-1 font-mono text-sm font-bold text-foreground">
                {data.displayId}
              </span>
            )}

            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusInfo.color}`}>
              {statusInfo.label}
            </span>

            <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {data.questionnaireType}
            </span>

            {/* Status-Aktionen: Nur fuer SUPER_ADMIN / HR_LEITUNG */}
            {canReview && (
              <button
                onClick={handleReviewProcess}
                disabled={reviewingProcess}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                <CheckIcon className="h-3.5 w-3.5" />
                {reviewingProcess ? "Wird markiert..." : "Als geprueft markieren"}
              </button>
            )}
            {canComplete && (
              <button
                onClick={handleCompleteProcess}
                disabled={completingProcess}
                className={`${canReview ? "" : "ml-auto "}inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50`}
              >
                <CheckIcon className="h-3.5 w-3.5" />
                {completingProcess ? "Wird abgeschlossen..." : "Vorgang abschliessen"}
              </button>
            )}
          </div>

          {/* Row 2: Person info */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{displayName}</span>
            {displayName !== data.email && (
              <>
                <span className="text-border">&middot;</span>
                <span>{data.email}</span>
              </>
            )}
            <span className="text-border">&middot;</span>
            <span>
              {data.organization.name} ({data.organization.mandantNumber})
            </span>
            <span className="text-border">&middot;</span>
            <span>Eingeladen am {formatDate(data.invitedAt)}</span>
          </div>
        </div>
      </div>

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
                  {tab.id === "questionnaire" && data.personalData && (
                    <span className={`ml-1.5 inline-flex h-5 w-auto min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                      data.personalData.isComplete
                        ? "bg-green-100 text-green-800"
                        : "bg-amber-100 text-amber-800"
                    }`}>
                      {data.personalData.isComplete ? "Komplett" : `${data.personalData.currentStep}/10`}
                    </span>
                  )}
                  {tab.id === "documents" && data.documents.length > 0 && (
                    <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                      {data.documents.length}
                    </span>
                  )}
                  {tab.id === "checklist" && checklistItems.length > 0 && (
                    <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                      {checklistItems.filter((i) => i.isCompleted).length}/{checklistItems.length}
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
        {activeTab === "overview" && (
          <TabOverview
            data={data}
            appUrl={appUrl}
            supervisorEmail={supervisorEmail}
            setSupervisorEmail={setSupervisorEmail}
            generatingLink={generatingLink}
            generateSupervisorLink={generateSupervisorLink}
            linkResult={linkResult}
            notes={notes}
            newNote={newNote}
            setNewNote={setNewNote}
            savingNote={savingNote}
            addNote={addNote}
            onboardingId={onboardingId}
          />
        )}
        {activeTab === "questionnaire" && <TabFragebogenDaten data={data} />}
        {activeTab === "documents" && <TabDocuments data={data} onboardingId={onboardingId} />}
        {activeTab === "checklist" && (
          <TabChecklist
            checklistItems={checklistItems}
            togglingItems={togglingItems}
            toggleChecklistItem={toggleChecklistItem}
            editingNoteId={editingNoteId}
            setEditingNoteId={setEditingNoteId}
            checklistNoteText={checklistNoteText}
            setChecklistNoteText={setChecklistNoteText}
            savingChecklistNote={savingChecklistNote}
            saveChecklistNote={saveChecklistNote}
          />
        )}
        {activeTab === "supervisor" && <TabSupervisor data={data} appUrl={appUrl} />}
      </main>
    </div>
  );
}

// =============================================
// Tab 1: Uebersicht
// =============================================

function TabOverview({
  data,
  appUrl,
  supervisorEmail,
  setSupervisorEmail,
  generatingLink,
  generateSupervisorLink,
  linkResult,
  notes,
  newNote,
  setNewNote,
  savingNote,
  addNote,
  onboardingId,
}: {
  data: DetailData;
  appUrl: string;
  supervisorEmail: string;
  setSupervisorEmail: (v: string) => void;
  generatingLink: boolean;
  generateSupervisorLink: () => void;
  linkResult: string | null;
  notes: NoteData[];
  newNote: string;
  setNewNote: (v: string) => void;
  savingNote: boolean;
  addNote: () => void;
  onboardingId: string;
}) {
  const fragebogenLink = `${appUrl}/fragebogen/${data.token}`;
  const modalitaetenLink = data.supervisorToken
    ? `${appUrl}/modalitaeten/${data.supervisorToken}`
    : null;

  return (
    <div className="space-y-6">
      {/* 2-Column Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Person Card */}
          <Card title="Person">
            <FieldRow label="E-Mail" value={data.email} />
            <FieldRow
              label="Name"
              value={
                data.personalData?.firstName
                  ? `${data.personalData.firstName} ${data.personalData.lastName}`
                  : data.firstName
                    ? `${data.firstName} ${data.lastName}`
                    : "\u2014"
              }
            />
            <FieldRow
              label="Einrichtung"
              value={`${data.organization.name} (${data.organization.mandantNumber})`}
            />
            <FieldRow label="Eingeladen am" value={formatDate(data.invitedAt)} />
            {data.submittedAt && <FieldRow label="Eingereicht am" value={formatDate(data.submittedAt)} />}
          </Card>

          {/* Personalfragebogen Card */}
          <Card title="Personalfragebogen">
            <FieldRow
              label="Status"
              value={
                data.personalData?.isComplete
                  ? "Vollständig"
                  : data.personalData
                    ? `Schritt ${data.personalData.currentStep} von 10`
                    : "Nicht begonnen"
              }
            />
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Fragebogen-Link</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={fragebogenLink}
                  className="min-w-0 flex-1 rounded-md border border-input bg-muted px-3 py-1.5 font-mono text-xs text-foreground outline-none"
                />
                <CopyButton text={fragebogenLink} />
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Supervisor Link Card */}
          <Card title="Vorgesetzten-Link">
            {data.supervisorToken ? (
              <div className="space-y-3">
                <FieldRow
                  label="Status"
                  value={
                    data.supervisorData?.isComplete
                      ? "Vollständig"
                      : data.supervisorData
                        ? `Schritt ${data.supervisorData.currentStep} von 5`
                        : "Nicht begonnen"
                  }
                />
                {data.supervisorEmail && <FieldRow label="E-Mail Vorgesetzter" value={data.supervisorEmail} />}
                <div className="mt-2">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Modalitaeten-Link</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={modalitaetenLink || ""}
                      className="min-w-0 flex-1 rounded-md border border-input bg-muted px-3 py-1.5 font-mono text-xs text-foreground outline-none"
                    />
                    {modalitaetenLink && <CopyButton text={modalitaetenLink} />}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Noch kein Vorgesetzten-Link generiert. Geben Sie die E-Mail des Vorgesetzten ein.
                </p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={supervisorEmail}
                    onChange={(e) => setSupervisorEmail(e.target.value)}
                    placeholder="vorgesetzter@einrichtung.de"
                    className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-credo-blau focus:ring-1 focus:ring-credo-blau"
                    onKeyDown={(e) => e.key === "Enter" && generateSupervisorLink()}
                  />
                  <button
                    onClick={generateSupervisorLink}
                    disabled={generatingLink || !supervisorEmail.trim()}
                    className="shrink-0 rounded-md bg-credo-gruen px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#5a9420] active:scale-95 disabled:opacity-50"
                  >
                    {generatingLink ? "..." : "Generieren"}
                  </button>
                </div>
                {linkResult && (
                  <div className="rounded-md border border-credo-gruen/30 bg-credo-gruen/5 p-3">
                    <p className="mb-2 text-xs font-medium text-credo-gruen">Link erstellt!</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={linkResult}
                        className="min-w-0 flex-1 rounded-md border border-input bg-muted px-3 py-1.5 font-mono text-xs outline-none"
                      />
                      <CopyButton text={linkResult} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Quick Status Card */}
          <Card title="Status-Uebersicht">
            <div className="grid grid-cols-2 gap-3">
              <StatusMiniCard
                label="Fragebogen"
                value={
                  data.personalData?.isComplete
                    ? "Fertig"
                    : data.personalData
                      ? `${data.personalData.currentStep}/10`
                      : "Offen"
                }
                done={data.personalData?.isComplete ?? false}
              />
              <StatusMiniCard
                label="Vorgesetzter"
                value={
                  data.supervisorData?.isComplete
                    ? "Fertig"
                    : data.supervisorToken
                      ? "Ausstehend"
                      : "Kein Link"
                }
                done={data.supervisorData?.isComplete ?? false}
              />
              <StatusMiniCard
                label="Dokumente"
                value={`${data.documents.length} Datei${data.documents.length !== 1 ? "en" : ""}`}
                done={data.documents.length > 0}
              />
              <StatusMiniCard
                label="Checkliste"
                value={
                  data.checklistItems.length > 0
                    ? `${data.checklistItems.filter((i) => i.isCompleted).length}/${data.checklistItems.length}`
                    : "Keine"
                }
                done={
                  data.checklistItems.length > 0 &&
                  data.checklistItems.every((i) => i.isCompleted)
                }
              />
            </div>
          </Card>
        </div>
      </div>

      {/* Notes Section */}
      <Card title="Notizen">
        {/* Add Note */}
        <div className="mb-4">
          <div className="flex gap-2">
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Neue Notiz hinzufuegen..."
              rows={2}
              className="min-w-0 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-credo-blau focus:ring-1 focus:ring-credo-blau"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) addNote();
              }}
            />
            <button
              onClick={addNote}
              disabled={savingNote || !newNote.trim()}
              className="shrink-0 self-end rounded-md bg-credo-gruen px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#5a9420] active:scale-95 disabled:opacity-50"
            >
              {savingNote ? "..." : "Speichern"}
            </button>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">Strg+Enter zum Speichern</p>
        </div>

        {/* Note List */}
        {notes.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Noch keine Notizen vorhanden.</p>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <div key={note.id} className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="whitespace-pre-wrap text-sm text-foreground">{note.content}</p>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-medium">
                    {note.createdBy.firstName} {note.createdBy.lastName}
                  </span>
                  <span>&middot;</span>
                  <span>{formatDateTime(note.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Export Buttons */}
      <div className="flex gap-3">
        <a
          href={`/api/onboarding/${onboardingId}/export?format=csv`}
          download
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-muted hover:shadow-sm active:scale-[0.98]"
        >
          <DownloadIcon className="h-4 w-4 text-muted-foreground" />
          CSV Export
        </a>
        <a
          href={`/api/onboarding/${onboardingId}/export?format=json`}
          download
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-muted hover:shadow-sm active:scale-[0.98]"
        >
          <DownloadIcon className="h-4 w-4 text-muted-foreground" />
          JSON Export
        </a>
      </div>
    </div>
  );
}

// =============================================
// Tab: Fragebogen-Daten (alle Antworten)
// =============================================

const MARITAL_STATUS_LABELS: Record<string, string> = {
  ledig: "Ledig",
  verheiratet: "Verheiratet",
  geschieden: "Geschieden",
  verwitwet: "Verwitwet",
  eingetragene_lebenspartnerschaft: "Eingetragene Lebenspartnerschaft",
};

const TAX_CLASS_LABELS: Record<string, string> = {
  I: "Steuerklasse I",
  II: "Steuerklasse II",
  III: "Steuerklasse III",
  IV: "Steuerklasse IV",
  V: "Steuerklasse V",
  VI: "Steuerklasse VI",
};

const INSURANCE_TYPE_LABELS: Record<string, string> = {
  gesetzlich: "Gesetzlich",
  privat: "Privat",
};

const SCHOOL_DEGREE_LABELS: Record<string, string> = {
  ohne_schulabschluss: "Ohne Schulabschluss",
  hauptschulabschluss: "Hauptschulabschluss",
  mittlere_reife: "Mittlere Reife / Realschulabschluss",
  abitur_fachabitur: "Abitur / Fachabitur",
  sonstiges: "Sonstiges",
};

const PROF_DEGREE_LABELS: Record<string, string> = {
  ohne_berufsausbildung: "Ohne Berufsausbildung",
  anerkannte_berufsausbildung: "Anerkannte Berufsausbildung",
  meister_techniker: "Meister / Techniker / Fachwirt",
  bachelor: "Bachelor",
  master_diplom: "Master / Diplom / Magister",
  promotion: "Promotion",
  sonstiges: "Sonstiges",
};

const RELIGION_LABELS: Record<string, string> = {
  ev: "Evangelisch",
  rk: "Roemisch-Katholisch",
  keine: "Keine / Konfessionslos",
  sonstige: "Sonstige",
};

function TabFragebogenDaten({ data }: { data: DetailData }) {
  const pd = data.personalData;

  if (!pd) {
    return (
      <div className="rounded-lg border border-border bg-card p-12 text-center">
        <p className="text-lg font-semibold text-foreground">Noch keine Daten vorhanden</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Der Mitarbeiter hat den Fragebogen noch nicht begonnen.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Fortschrittsanzeige */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Fragebogen-Status: {pd.isComplete ? "Vollständig ausgefüllt" : `Schritt ${pd.currentStep} von 10`}
            </p>
            {pd.dsgvoAccepted && pd.dsgvoAcceptedAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                DSGVO-Einwilligung erteilt am {formatDate(pd.dsgvoAcceptedAt)}
              </p>
            )}
          </div>
          <div className={`rounded-full px-3 py-1 text-xs font-semibold ${
            pd.isComplete ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
          }`}>
            {pd.isComplete ? "Komplett" : "In Bearbeitung"}
          </div>
        </div>
        {/* Progress Bar */}
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-credo-gruen transition-all"
            style={{ width: `${pd.isComplete ? 100 : (pd.currentStep / 10) * 100}%` }}
          />
        </div>
      </div>

      {/* Schritt 1: Persoenliche Daten */}
      <SectionCard title="1. Persoenliche Daten" icon="&#128100;">
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <FieldRow label="Anrede" value={pd.salutation || "\u2014"} />
          <FieldRow label="Titel" value={pd.title || "\u2014"} />
          <FieldRow label="Vorname" value={pd.firstName || "\u2014"} />
          <FieldRow label="Nachname" value={pd.lastName || "\u2014"} />
          <FieldRow label="Geburtsname" value={pd.birthName || "\u2014"} />
          <FieldRow label="Geburtsdatum" value={formatDate(pd.birthDate)} />
          <FieldRow label="Geburtsort" value={pd.birthPlace || "\u2014"} />
          <FieldRow label="Geburtsland" value={pd.birthCountry || "\u2014"} />
          <FieldRow label="Staatsangehoerigkeit" value={pd.nationality || "\u2014"} />
          <FieldRow label="Familienstand" value={pd.maritalStatus ? (MARITAL_STATUS_LABELS[pd.maritalStatus] || pd.maritalStatus) : "\u2014"} />
          <FieldRow label="Schwerbehindert" value={formatBoolean(pd.severelyDisabled)} />
          {pd.severelyDisabled && <FieldRow label="Grad der Behinderung" value={formatNumber(pd.disabilityDegree, "%")} />}
        </div>
      </SectionCard>

      {/* Schritt 2: Adresse */}
      <SectionCard title="2. Adresse &amp; Kontakt" icon="&#127968;">
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <FieldRow label="Strasse" value={pd.street || "\u2014"} />
          <FieldRow label="Hausnummer" value={pd.houseNumber || "\u2014"} />
          <FieldRow label="PLZ" value={pd.zipCode || "\u2014"} />
          <FieldRow label="Ort" value={pd.city || "\u2014"} />
          <FieldRow label="Land" value={pd.country || "\u2014"} />
          <FieldRow label="Telefon (Festnetz)" value={pd.phone || "\u2014"} />
          <FieldRow label="Mobilnummer" value={pd.mobile || "\u2014"} />
          <FieldRow label="Private E-Mail" value={pd.emailPrivate || "\u2014"} />
        </div>
      </SectionCard>

      {/* Schritt 3: Bankverbindung */}
      <SectionCard title="3. Bankverbindung" icon="&#127974;">
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <FieldRow label="Kontoinhaber" value={pd.accountHolder || "\u2014"} />
          <FieldRow label="IBAN" value={pd.iban || "\u2014"} />
          <FieldRow label="BIC" value={pd.bic || "\u2014"} />
          <FieldRow label="Bankname" value={pd.bankName || "\u2014"} />
        </div>
      </SectionCard>

      {/* Schritt 4: Sozialversicherung */}
      <SectionCard title="4. Sozialversicherung" icon="&#128737;">
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <FieldRow label="SV-Nummer" value={pd.socialSecurityNumber || "\u2014"} />
          <FieldRow label="Krankenkasse" value={pd.healthInsuranceName || "\u2014"} />
          <FieldRow label="Versicherungsart" value={pd.healthInsuranceType ? (INSURANCE_TYPE_LABELS[pd.healthInsuranceType] || pd.healthInsuranceType) : "\u2014"} />
          <FieldRow label="Kinder vorhanden" value={formatBoolean(pd.parentStatus)} />
        </div>
      </SectionCard>

      {/* Schritt 5: Steuer */}
      <SectionCard title="5. Steuerliche Angaben" icon="&#128196;">
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <FieldRow label="Steuer-ID" value={pd.taxId || "\u2014"} />
          <FieldRow label="Steuerklasse" value={pd.taxClass ? (TAX_CLASS_LABELS[pd.taxClass] || pd.taxClass) : "\u2014"} />
          <FieldRow label="Jaehrlicher Freibetrag" value={pd.taxAllowance != null ? formatCurrency(pd.taxAllowance) : "\u2014"} />
          <FieldRow label="Kinderfreibetrag" value={pd.childAllowance != null ? formatCurrency(pd.childAllowance) : "\u2014"} />
          <FieldRow label="Konfession" value={pd.religion ? (RELIGION_LABELS[pd.religion] || pd.religion) : "\u2014"} />
        </div>
      </SectionCard>

      {/* Schritt 6: Beschaeftigung */}
      <SectionCard title="6. Weitere Beschaeftigung" icon="&#128188;">
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <FieldRow label="Arbeitgebertyp" value={pd.employerType || "\u2014"} />
          <FieldRow label="Weitere Beschaeftigung" value={formatBoolean(pd.hasOtherEmployment)} />
          {pd.hasOtherEmployment && (
            <>
              <FieldRow label="Anderer Arbeitgeber" value={pd.otherEmployerName || "\u2014"} />
              <FieldRow label="Wochenstunden (anderer AG)" value={formatNumber(pd.otherWeeklyHours, "Std.")} />
            </>
          )}
          <FieldRow label="Minijob" value={formatBoolean(pd.hasMinijob)} />
          {pd.hasMinijob && (
            <FieldRow label="RV-Befreiung Minijob" value={formatBoolean(pd.minijobRvBefreiung)} />
          )}
        </div>
      </SectionCard>

      {/* Schritt 7: Kinder */}
      <SectionCard title="7. Kinder" icon="&#128118;">
        {pd.children && pd.children.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 pr-4 text-xs font-semibold text-muted-foreground">Nr.</th>
                  <th className="pb-2 pr-4 text-xs font-semibold text-muted-foreground">Vorname</th>
                  <th className="pb-2 pr-4 text-xs font-semibold text-muted-foreground">Nachname</th>
                  <th className="pb-2 pr-4 text-xs font-semibold text-muted-foreground">Geburtsdatum</th>
                  <th className="pb-2 text-xs font-semibold text-muted-foreground">Kinderfreibetrag</th>
                </tr>
              </thead>
              <tbody>
                {pd.children.map((child, idx) => (
                  <tr key={child.id} className="border-b border-border/50">
                    <td className="py-2 pr-4 text-muted-foreground">{idx + 1}</td>
                    <td className="py-2 pr-4 font-medium text-foreground">{child.firstName}</td>
                    <td className="py-2 pr-4 text-foreground">{child.lastName || "\u2014"}</td>
                    <td className="py-2 pr-4 text-foreground">{formatDate(child.birthDate)}</td>
                    <td className="py-2 text-foreground">{child.taxAllowance ? "Ja" : "Nein"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Keine Kinder angegeben.</p>
        )}
      </SectionCard>

      {/* Schritt 8: Bildung */}
      <SectionCard title="8. Bildungsabschluss" icon="&#127891;">
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <FieldRow label="Hoechster Schulabschluss" value={pd.highestSchoolDegree ? (SCHOOL_DEGREE_LABELS[pd.highestSchoolDegree] || pd.highestSchoolDegree) : "\u2014"} />
          <FieldRow label="Hoechster Berufsabschluss" value={pd.highestProfessionalDegree ? (PROF_DEGREE_LABELS[pd.highestProfessionalDegree] || pd.highestProfessionalDegree) : "\u2014"} />
        </div>
      </SectionCard>

      {/* Schritt 9: Masernschutz */}
      <SectionCard title="9. Masernschutz" icon="&#128137;">
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <FieldRow label="Nach 1971 geboren" value={formatBoolean(pd.bornAfter1971)} />
          <FieldRow label="Masernschutz nachgewiesen" value={formatBoolean(pd.masernschutzProvided)} />
        </div>
      </SectionCard>

      {/* Schritt 10: DSGVO */}
      <SectionCard title="10. Datenschutz &amp; Einwilligung" icon="&#128274;">
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <FieldRow label="DSGVO-Einwilligung" value={formatBoolean(pd.dsgvoAccepted)} />
          <FieldRow label="Einwilligung erteilt am" value={formatDate(pd.dsgvoAcceptedAt)} />
        </div>
      </SectionCard>
    </div>
  );
}

// Helper: Sensible Daten maskieren (IBAN, SV-Nr, Steuer-ID)
function maskSensitive(value: string): string {
  if (value.length <= 4) return "****";
  return value.slice(0, 2) + "*".repeat(value.length - 4) + value.slice(-2);
}

// Helper: Section Card mit Icon und Titel
function SectionCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-6 py-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <span dangerouslySetInnerHTML={{ __html: icon }} />
          {title}
        </h3>
      </div>
      <div className="px-6 py-4">{children}</div>
    </div>
  );
}

// =============================================
// Tab 2: Dokumente
// =============================================

function TabDocuments({ data, onboardingId }: { data: DetailData; onboardingId: string }) {
  const DOC_STATUS_LABELS: Record<string, { label: string; color: string }> = {
    UPLOADED: { label: "Hochgeladen", color: "bg-gray-100 text-gray-600" },
    REVIEWED: { label: "Geprüft", color: "bg-blue-100 text-blue-700" },
    APPROVED: { label: "Genehmigt", color: "bg-green-100 text-green-700" },
    REJECTED: { label: "Abgelehnt", color: "bg-red-100 text-red-700" },
  };

  const DOC_TYPE_COLORS: Record<string, string> = {
    PERSONALAUSWEIS: "bg-[#009AC6]/10 text-[#009AC6]",
    LOHNSTEUERBESCHEINIGUNG: "bg-credo-gruen/10 text-credo-gruen",
    SOZIALVERSICHERUNGSAUSWEIS: "bg-purple-100 text-purple-700",
    MASERNSCHUTZ: "bg-orange-100 text-orange-700",
    FUEHRUNGSZEUGNIS: "bg-red-100 text-red-700",
    SONSTIGES: "bg-gray-100 text-gray-600",
  };

  if (data.documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card py-16">
        <UploadCloudIcon className="mb-4 h-16 w-16 text-border" />
        <p className="mb-1 text-base font-medium text-foreground">Keine Dokumente</p>
        <p className="text-sm text-muted-foreground">
          Es wurden noch keine Dokumente zu diesem Vorgang hochgeladen.
        </p>
      </div>
    );
  }

  const downloadAll = () => {
    data.documents.forEach((doc, index) => {
      setTimeout(() => {
        const link = document.createElement("a");
        link.href = `/api/onboarding/${onboardingId}/documents/${doc.id}`;
        link.download = doc.fileName;
        link.click();
      }, index * 300);
    });
  };

  return (
    <div className="space-y-4">
      {/* Header with download all */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {data.documents.length} Dokument{data.documents.length !== 1 ? "e" : ""} hochgeladen
        </p>
        <button
          onClick={downloadAll}
          className="inline-flex items-center gap-2 rounded-lg bg-credo-gruen px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#5a9420] active:scale-95"
        >
          <DownloadIcon className="h-4 w-4" />
          Alle herunterladen
        </button>
      </div>

      {/* Document Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.documents.map((doc) => {
          const statusLabel = DOC_STATUS_LABELS[doc.status] || DOC_STATUS_LABELS.UPLOADED;
          const typeColor = DOC_TYPE_COLORS[doc.type] || DOC_TYPE_COLORS.SONSTIGES;

          return (
            <div
              key={doc.id}
              className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 transition-all hover:border-[#009AC6]/30 hover:shadow-md"
            >
              {/* Document Icon + Name */}
              <div className="mb-3 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <DocumentIcon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground" title={doc.fileName}>
                    {doc.fileName}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{formatFileSize(doc.fileSize)}</p>
                </div>
              </div>

              {/* Badges */}
              <div className="mb-3 flex flex-wrap gap-2">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${typeColor}`}>
                  {doc.type.replace(/_/g, " ")}
                </span>
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${statusLabel.color}`}>
                  {statusLabel.label}
                </span>
              </div>

              {/* Date + Download */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{formatDate(doc.uploadedAt)}</span>
                <a
                  href={`/api/onboarding/${onboardingId}/documents/${doc.id}`}
                  download={doc.fileName}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-credo-gruen/10 hover:text-credo-gruen"
                  title="Herunterladen"
                >
                  <DownloadIcon className="h-4 w-4" />
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================
// Tab 3: Checkliste
// =============================================

function TabChecklist({
  checklistItems,
  togglingItems,
  toggleChecklistItem,
  editingNoteId,
  setEditingNoteId,
  checklistNoteText,
  setChecklistNoteText,
  savingChecklistNote,
  saveChecklistNote,
}: {
  checklistItems: ChecklistItemData[];
  togglingItems: Set<string>;
  toggleChecklistItem: (id: string, current: boolean) => void;
  editingNoteId: string | null;
  setEditingNoteId: (id: string | null) => void;
  checklistNoteText: string;
  setChecklistNoteText: (v: string) => void;
  savingChecklistNote: boolean;
  saveChecklistNote: (id: string) => void;
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
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
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

      {/* Grouped Items */}
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category}>
          <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            <span>{category}</span>
            <span className="h-px flex-1 bg-border" />
          </h3>
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
                            if (editingNoteId === item.id) {
                              setEditingNoteId(null);
                              setChecklistNoteText("");
                            } else {
                              setEditingNoteId(item.id);
                              setChecklistNoteText(item.notes || "");
                            }
                          }}
                          className={`relative shrink-0 rounded-md p-1.5 transition-colors ${
                            editingNoteId === item.id
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
                        {item.assignee && (
                          <span className="inline-flex rounded-full bg-[#009AC6]/10 px-2.5 py-0.5 text-[10px] font-semibold text-[#009AC6]">
                            {item.assignee}
                          </span>
                        )}
                        {item.dueDate && (
                          <span className="text-[11px] text-muted-foreground">
                            Faellig: {formatDate(item.dueDate)}
                          </span>
                        )}
                        {item.isCompleted && item.completedBy && (
                          <span className="text-[11px] text-muted-foreground">
                            von {item.completedBy.firstName} {item.completedBy.lastName}
                          </span>
                        )}
                        {item.isCompleted && item.completedAt && (
                          <span className="text-[11px] text-muted-foreground">
                            am {formatDate(item.completedAt)}
                          </span>
                        )}
                      </div>

                      {/* Existing note display */}
                      {item.notes && editingNoteId !== item.id && (
                        <div className="mt-2 rounded-md border border-[#FBC900]/30 bg-[#FBC900]/5 px-3 py-2">
                          <p className="text-xs text-foreground">{item.notes}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Inline note editor */}
                  {editingNoteId === item.id && (
                    <div className="border-t border-border bg-muted/30 p-4">
                      <textarea
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
                            setEditingNoteId(null);
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
      ))}
    </div>
  );
}

// =============================================
// Tab 4: Vorgesetzter (Einstellungsmodalitaeten)
// =============================================

function TabSupervisor({ data, appUrl }: { data: DetailData; appUrl: string }) {
  const sd = data.supervisorData;
  const modalitaetenLink = data.supervisorToken ? `${appUrl}/modalitaeten/${data.supervisorToken}` : null;

  if (!sd || (!sd.isComplete && sd.currentStep === 0 && !sd.betriebsstaette)) {
    return (
      <div className="space-y-4">
        {modalitaetenLink && (
          <div className="flex items-center gap-3 rounded-xl border border-[#009AC6]/30 bg-[#009AC6]/5 p-4">
            <LinkIcon className="h-5 w-5 text-[#009AC6]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">Modalitaeten-Formular</p>
              <p className="truncate text-xs text-muted-foreground">{modalitaetenLink}</p>
            </div>
            <CopyButton text={modalitaetenLink} label="Link kopieren" />
          </div>
        )}
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card py-16">
          <svg className="mb-4 h-16 w-16 text-border" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <p className="mb-1 text-base font-medium text-foreground">Noch keine Daten</p>
          <p className="text-sm text-muted-foreground">
            Der Vorgesetzte hat noch keine Daten eingegeben.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Link bar */}
      {modalitaetenLink && (
        <div className="flex items-center gap-3 rounded-xl border border-[#009AC6]/30 bg-[#009AC6]/5 p-4">
          <LinkIcon className="h-5 w-5 text-[#009AC6]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Modalitaeten-Formular</p>
            <p className="truncate text-xs text-muted-foreground">{modalitaetenLink}</p>
          </div>
          <CopyButton text={modalitaetenLink} label="Link kopieren" />
        </div>
      )}

      {/* Sektion 1: Stelle & Vertrag */}
      <Card title="Stelle & Vertrag">
        <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
          <FieldRow label="Betriebsstaette" value={sd.betriebsstaette} />
          <FieldRow label="Stellenbeschreibung" value={sd.stellenbeschreibung} />
          <FieldRow label="Vertragsbeginn" value={formatDate(sd.vertragsbeginn)} />
          <FieldRow label="Befristet" value={formatBoolean(sd.befristet)} />
          <FieldRow label="Vertragsende" value={formatDate(sd.vertragsende)} />
          <FieldRow label="Befristung Sachgrund" value={sd.befristungSachgrund} />
        </div>
      </Card>

      {/* Sektion 2: Arbeitszeit & Arbeitgeber */}
      <Card title="Arbeitszeit & Arbeitgeber">
        <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
          <FieldRow label="Vollzeit" value={formatBoolean(sd.vollzeit)} />
          <FieldRow label="Wochenstunden" value={formatNumber(sd.wochenstunden, "Std.")} />
          <FieldRow label="Tage pro Woche" value={formatNumber(sd.tageProWoche)} />
          <FieldRow label="Hauptarbeitgeber-ID" value={sd.hauptarbeitgeberId} />
          <FieldRow label="Hauptarbeitgeber Std." value={formatNumber(sd.hauptarbeitgeberStunden, "Std.")} />
          <FieldRow label="Nebenarbeitgeber-ID" value={sd.nebenarbeitgeberId} />
          <FieldRow label="Nebenarbeitgeber Std." value={formatNumber(sd.nebenarbeitgeberStunden, "Std.")} />
          <FieldRow label="SV-pflichtig" value={formatBoolean(sd.svPflichtig)} />
          <FieldRow label="Minijob" value={formatBoolean(sd.minijob)} />
          <FieldRow label="Ehrenamt" value={formatBoolean(sd.ehrenamt)} />
        </div>
      </Card>

      {/* Sektion 3: Verguetung */}
      <Card title="Verguetung">
        <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
          <FieldRow label="Verguetungsmodell" value={sd.verguetungsmodell} />
          <FieldRow label="Entgeltgruppe" value={sd.entgeltgruppe} />
          <FieldRow label="Stufe" value={sd.stufe} />
          <FieldRow label="Festgehalt" value={formatCurrency(sd.festgehalt)} />
          <FieldRow label="Stundenlohn" value={formatCurrency(sd.stundenlohn)} />
          <FieldRow label="Bemerkung Verguetung" value={sd.bemerkungVerguetung} />
          <FieldRow label="Jahressonderzahlung" value={formatBoolean(sd.jahressonderzahlung)} />
          <FieldRow label="Sonderzahlung %" value={formatNumber(sd.sonderzahlungProzent, "%")} />
          <FieldRow label="Sachbezuege" value={formatBoolean(sd.sachbezuege)} />
          <FieldRow label="Sachbezuege Betrag" value={formatCurrency(sd.sachbezuegeBetrag)} />
          <FieldRow label="Zulage" value={formatBoolean(sd.zulage)} />
          <FieldRow label="Zulage Betrag" value={formatCurrency(sd.zulageBetrag)} />
        </div>
      </Card>

      {/* Sektion 4: Weitere Angaben */}
      <Card title="Weitere Angaben">
        <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
          <FieldRow label="Kostenstelle" value={sd.kostenstelle} />
          <FieldRow label="Kostenstelle Anteil" value={formatNumber(sd.kostenstelleAnteil, "%")} />
          <FieldRow label="Probezeit" value={formatBoolean(sd.probezeit)} />
          <FieldRow label="Probezeit Monate" value={formatNumber(sd.probezeitMonate, "Monate")} />
          <FieldRow label="Urlaubstage/Jahr" value={formatNumber(sd.urlaubstageProJahr, "Tage")} />
          <FieldRow label="Masernschutz erforderlich" value={formatBoolean(sd.masernschutzErforderlich)} />
          <FieldRow label="Masernschutz vor Arbeitsbeginn" value={formatBoolean(sd.masernschutzVorArbeitsbeginn)} />
          <FieldRow label="Zeiterfassung" value={formatBoolean(sd.zeiterfassung)} />
        </div>
        {sd.zusatzvereinbarungen && (
          <div className="mt-4 border-t border-border pt-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Zusatzvereinbarungen</p>
            <p className="whitespace-pre-wrap text-sm text-foreground">{sd.zusatzvereinbarungen}</p>
          </div>
        )}
      </Card>
    </div>
  );
}

// =============================================
// Shared UI Components
// =============================================

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-sm">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-foreground">
        <span className="h-1 w-1 rounded-full bg-credo-gruen" />
        {title}
      </h3>
      {children}
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium text-foreground">{value || "\u2014"}</span>
    </div>
  );
}

function StatusMiniCard({ label, value, done }: { label: string; value: string; done: boolean }) {
  return (
    <div className={`rounded-lg border p-3 transition-colors ${done ? "border-credo-gruen/30 bg-credo-gruen/5" : "border-border bg-muted/30"}`}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold ${done ? "text-credo-gruen" : "text-foreground"}`}>{value}</p>
    </div>
  );
}
