"use client";

/**
 * Detail-Ansicht eines Offboarding-Vorgangs (Vollbild-Seite)
 *
 * Tabs: Uebersicht | Checkliste | Rueckgaben | Dokumente | Notizen | Exit-Interview | Zeugnis
 * Nutzt die bestehende PortalHeader-Komponente und CREDO Corporate Design.
 *
 * Ausstattung & Zugaenge Stufe 2 (Feinplan A4, S32): Der Reiter „Rückgaben“
 * ist die Karte src/components/ausgaben/rueckgaben-karte.tsx (Feld
 * `rueckgaben`, nur HR_EDIT_ROLES); ihre Aufrufe sendet die Seite
 * (`rueckgabenAufrufSenden`) und laedt danach leise neu. Den Dialog
 * „Einstellung zuordnen …“ haelt die Seite, weil er aus drei Orten aufgeht
 * (Reiter, Schritt „Rückgaben einsammeln“, Abteilungskarte); nach dem
 * Zuordnen zeigt der Reiter „Rückgaben“ das Ergebnis. „Vorgang abschließen“
 * laeuft ueber den verallgemeinerten Abschluss-Dialog (Rueckfrage mit der
 * Liste offener Rueckgaben, G18; fehlendes Rueckgabeprotokoll als
 * Hinweiszeile, G19) statt ueber `window.confirm`. Der Zaehler am Reiter
 * zaehlt „erledigt“ (ein Zustand ist gesetzt, G16).
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
import { NUR_HR_TABS, TABS } from "./types";
import { STATUS_TRANSITIONS, formatDate, daysUntilLabel } from "./helpers";
import { ArrowLeftIcon, ChevronDownIcon } from "./icons";
import { HR_EDIT_ROLES } from "@/lib/permissions";
import { MailProtokoll } from "@/components/vorgangs-mails/mail-protokoll";
import type { AbteilungsAktion } from "@/lib/abteilungsaufgaben";
import {
  abteilungsAktionSenden,
  type AktionsMeldung,
} from "@/components/abteilungsaufgaben/abteilungen-karte";
import {
  AUSTRITT_ABSCHLUSS_TEXTE,
  AbschlussDialog,
  austrittAbschlussSenden,
} from "@/components/ausstattung/abschluss-dialog";
import {
  EinstellungZuordnenDialog,
  type EinstellungAktionBody,
} from "@/components/ausgaben/einstellung-zuordnen-dialog";
import {
  RUECKGABEN_KARTE_TITEL_ID,
  einstellungAktionSenden,
  rueckgabenAufrufSenden,
  type KartenMeldung,
  type RueckgabenAufruf,
  type RueckgabenAusgang,
} from "@/components/ausgaben/rueckgaben-karte";
import { rueckgabeOffen, type OffeneRueckgabe } from "@/lib/ausgaben";
import {
  TabOverview,
  TabChecklist,
  TabReturns,
  TabDocuments,
  TabNotes,
  TabExitInterview,
  TabZeugnis,
} from "./tabs";

/** Id des Knopfs „Status ändern“ – Ersatzziel des Fokus nach dem Abschluss-Dialog (A4, Review A4c). */
export const STATUS_KNOPF_ID = "offboarding-status-aendern";
/** Id der Vorgangsnummer im Kopf (`tabIndex={-1}`) – Fokusziel, wenn „Status ändern“ nach dem Abschluss fehlt. */
export const KOPF_ID = "offboarding-kopf";

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

  // Return items (A4: Erfassen, Zustand und Kennung laufen ueber die Karte des Reiters)
  const [returnItems, setReturnItems] = useState<ReturnItemData[]>([]);
  const [rueckgabenMeldung, setRueckgabenMeldung] = useState<KartenMeldung | null>(null);

  // „Einstellung zuordnen …“ (A4, G11 bis G13) – oeffnet aus Reiter, Stepper und Abteilungskarte.
  const [zuordnenOffen, setZuordnenOffen] = useState(false);
  const [zuordnenSendet, setZuordnenSendet] = useState(false);
  const [zuordnenFehler, setZuordnenFehler] = useState<string | null>(null);

  // „Vorgang abschließen“ mit Rueckfrage (A4, G18): `offen` = Liste der 409.
  const [abschluss, setAbschluss] = useState<{ offen: OffeneRueckgabe[] | null; fehler: string | null } | null>(null);
  const [schliesstAb, setSchliesstAb] = useState(false);
  // Zaehler der Abschluesse, nach deren Neuladen der Fokus gesetzt wird: Der
  // Dialog gibt ihn beim Schliessen an „Status ändern“ (`fokusZiel`); nach dem
  // Abschluss verschwindet der Knopf aber mit dem neuen Stand – dann die
  // Vorgangsnummer im Kopf statt `body`.
  const [abschlussFokus, setAbschlussFokus] = useState(0);

  // Documents
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docType, setDocType] = useState("SONSTIGES");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Inline Edit
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [savingField, setSavingField] = useState(false);

  // Action-Feedback
  const [actionError, setActionError] = useState<string | null>(null);
  // Ergebnis der Abteilungs-Aktionen (Informieren, Erinnern, Erneut senden,
  // Link erneuern): gruene bzw. rote Leiste plus gelber Hinweis. Eigener
  // Zustand neben actionError, weil der Versandbericht auch bei Erfolg etwas
  // zu sagen hat („Nicht informiert: Führungskraft (…)") und nicht nach fuenf
  // Sekunden verschwinden darf.
  const [actionInfo, setActionInfo] = useState<AktionsMeldung | null>(null);

  // Exit-Interview & Zeugnis
  const [exitInterview, setExitInterview] = useState<ExitInterviewData | null>(null);
  const [zeugnisBewertung, setZeugnisBewertung] = useState<ZeugnisBewertungData | null>(null);
  const [creatingExitInterview, setCreatingExitInterview] = useState(false);
  const [creatingZeugnis, setCreatingZeugnis] = useState(false);
  useEffect(() => {
    if (!actionError) return;
    // Lange Meldungen (etwa die Freigabeliste der Führungskraft) brauchen
    // mehr Lesezeit als ein „Verbindungsfehler."
    const timer = setTimeout(() => setActionError(null), actionError.length > 100 ? 12000 : 5000);
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

  useEffect(() => {
    if (abschlussFokus === 0) return;
    (document.getElementById(STATUS_KNOPF_ID) ?? document.getElementById(KOPF_ID))?.focus();
  }, [abschlussFokus]);

  const isAdmin = user.role === "SUPER_ADMIN" || user.role === "HR_LEITUNG";

  // Fuer das Erzeugen von Dokumenten gilt die Rollenmenge der Erzeugungs-Route
  // (HR_EDIT_ROLES). isAdmin waere hier zu eng und sperrte die
  // Sachbearbeitung aus, obwohl der Endpunkt sie zulaesst.
  const canEdit = HR_EDIT_ROLES.includes(user.role);

  // ---- Data Loading ----
  //
  // `leise`: nach einer Aktion neu laden, ohne die ganze Seite gegen den
  // Lade-Kreisel zu tauschen (sonst flackert jedes Haekchen), und ohne bei
  // einem Fehler die geladene Ansicht durch die Fehlerseite zu ersetzen.
  const loadData = useCallback(async (leise = false) => {
    if (!leise) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetch(`/api/offboarding/${offboardingId}`);
      if (!res.ok) throw new Error("Vorgang konnte nicht geladen werden");
      const result: OffboardingData = await res.json();
      setData(result);
      setNotes(result.notes || []);
      setChecklistItems(result.checklistItems || []);
      setReturnItems(result.returnItems || []);
    } catch (err) {
      const text = err instanceof Error ? err.message : "Unbekannter Fehler";
      if (leise) setActionError(`${text}.`);
      else setError(text);
    } finally {
      if (!leise) setLoading(false);
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
    // Exit-Interview und Zeugnis-Bewertung liefern ihre Routen nur an
    // HR_EDIT_ROLES (Magic Links in der Antwort) — ohne das Recht gibt es
    // auch die Reiter nicht (NUR_HR_TABS).
    if (canEdit) {
      loadExitInterview();
      loadZeugnisBewertung();
    }
  }, [loadData, loadExitInterview, loadZeugnisBewertung, canEdit]);

  // ---- Status change ----
  const handleStatusChange = async (newStatus: string) => {
    if (!data) return;
    // Abschluss (A4, G18): eigener Dialog mit der Liste offener Rueckgaben.
    if (newStatus === "COMPLETED") {
      setShowStatusDropdown(false);
      setAbschluss({ offen: null, fehler: null });
      return;
    }
    if (newStatus === "CANCELLED") {
      if (!window.confirm("Moechten Sie diesen Offboarding-Vorgang wirklich abbrechen?")) return;
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
        const err = await res.json().catch(() => null);
        setActionError(err?.error || "Status konnte nicht geändert werden.");
      }
    } catch {
      setActionError("Verbindungsfehler bei Status-Änderung.");
    } finally {
      setChangingStatus(false);
    }
  };

  // ---- Inline field edit ----
  // Sperre gegen einen zweiten Aufruf, solange der erste laeuft (Doppel-Enter,
  // gehaltene Taste): Ein Ref, weil `savingField` erst nach dem naechsten
  // Rendern greift. Der Server faengt doppelte Datumsaenderungen selbst ab
  // (Zeilensperre), aber ein zweiter PATCH braucht es gar nicht erst.
  const speichertFeld = useRef(false);
  const handleFieldSave = async (fieldPath: string, value: string) => {
    if (!data || speichertFeld.current) return;
    speichertFeld.current = true;
    setSavingField(true);
    try {
      const res = await fetch(`/api/offboarding/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [fieldPath]: value }),
      });
      if (res.ok) {
        await loadData(true);
        setEditingField(null);
        setEditingValue("");
      } else {
        // Den Text des Servers zeigen: etwa 409 „Die Adresse der Führungskraft
        // liegt in keiner freigegebenen Domain …" — ein pauschales „konnte
        // nicht gespeichert werden" liesse HR raten, was falsch war. Das
        // Eingabefeld bleibt offen, damit die Adresse korrigiert werden kann.
        const err = await res.json().catch(() => null);
        setActionError(err?.error || "Feld konnte nicht gespeichert werden.");
      }
    } catch {
      setActionError("Verbindungsfehler beim Speichern.");
    } finally {
      speichertFeld.current = false;
      setSavingField(false);
    }
  };

  // Link „Eintragen" in der Karte „Aufgaben für Abteilungen": in den Tab
  // Übersicht wechseln und das Feld der Führungskraft gleich öffnen.
  const fuehrungskraftEintragen = () => {
    setActiveTab("overview");
    setEditingField("supervisorEmail");
    setEditingValue(data?.supervisorEmail ?? "");
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
        const err = await res.json().catch(() => null);
        setActionError(err?.error || "Notiz konnte nicht gespeichert werden.");
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
        const err = await res.json().catch(() => null);
        setActionError(err?.error || "Notiz konnte nicht aktualisiert werden.");
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
        const err = await res.json().catch(() => null);
        setActionError(err?.error || "Notiz konnte nicht gelöscht werden.");
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
        // Der Abteilungsstand kann sich mitaendern (letzte Aufgabe erledigt →
        // „Erledigt am …"), deshalb die Karte leise nachladen.
        await loadData(true);
      } else {
        const err = await res.json().catch(() => null);
        setActionError(err?.error || "Checklisten-Eintrag konnte nicht aktualisiert werden.");
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
        const err = await res.json().catch(() => null);
        setActionError(err?.error || "Checklisten-Notiz konnte nicht gespeichert werden.");
      }
    } catch {
      setActionError("Verbindungsfehler bei Checklisten-Notiz.");
    } finally {
      setSavingChecklistNote(false);
    }
  };

  // ---- Rueckgaben (A4, S32) ----
  // Die Karte des Reiters baut den Aufruf (Zustand, Kennung, Loeschen,
  // Erfassen, Einstellung aktualisieren/loesen/uebernehmen), die Seite sendet
  // und laedt danach leise neu – auch nach einem 409, der den Stand geaendert
  // haben kann. Ohne Verbindung (status null) bleibt der Stand.
  const rueckgabenAufruf = async (aufruf: RueckgabenAufruf): Promise<RueckgabenAusgang> => {
    const ausgang = await rueckgabenAufrufSenden(offboardingId, aufruf);
    if (ausgang.status !== null) await loadData(true);
    return ausgang;
  };

  const zuordnenOeffnen = () => {
    setZuordnenFehler(null);
    setZuordnenOffen(true);
  };
  const zuordnenSchliessen = () => {
    if (zuordnenSendet) return;
    setZuordnenFehler(null);
    setZuordnenOffen(false);
  };
  // Zuordnen: erst neu laden, dann in einem Zug Dialog zu und Reiter
  // „Rückgaben“ auf – dort steht das Ergebnis samt Meldung; der Fokus geht auf
  // den Titel der Karte (der Ausloeser ist dann weg oder in einem anderen Reiter).
  const zuordnenSenden = async (body: EinstellungAktionBody) => {
    if (zuordnenSendet) return;
    setZuordnenSendet(true);
    setZuordnenFehler(null);
    try {
      const ausgang = await einstellungAktionSenden(offboardingId, body);
      if (ausgang.status !== null) await loadData(true);
      if (ausgang.ok) {
        setRueckgabenMeldung({ art: "ok", text: ausgang.meldung });
        setActiveTab("returns");
        setZuordnenOffen(false);
      } else {
        setZuordnenFehler(ausgang.meldung);
      }
    } finally {
      setZuordnenSendet(false);
    }
  };

  // ---- Abschluss (A4, G18) ----
  // Erster Klick ohne Bestaetigung; die 409 RUECKGABEN_OFFEN bringt die Liste,
  // erst „Trotzdem abschließen“ schickt `bestaetigt`. Hat sich der Status
  // inzwischen bewegt (409 INZWISCHEN_GEAENDERT), laedt die Seite neu und der
  // Dialog faengt wieder ohne Liste an.
  const abschliessen = async (bestaetigt: boolean) => {
    if (!data || schliesstAb) return;
    setSchliesstAb(true);
    try {
      const ausgang = await austrittAbschlussSenden(data.id, bestaetigt);
      if (ausgang.art === "ok") {
        setAbschluss(null);
        await loadData(true);
        setAbschlussFokus((n) => n + 1);
      } else if (ausgang.art === "offen") {
        setAbschluss({ offen: ausgang.offen, fehler: ausgang.meldung });
      } else if (ausgang.grund === "INZWISCHEN_GEAENDERT") {
        setAbschluss({ offen: null, fehler: ausgang.meldung });
        await loadData(true);
      } else {
        setAbschluss((bisher) => ({ offen: bisher?.offen ?? null, fehler: ausgang.meldung }));
      }
    } finally {
      setSchliesstAb(false);
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
        // Den Text des Servers zeigen (zu groß, falscher Typ, …).
        const err = await res.json().catch(() => null);
        setActionError(err?.error || "Dokument konnte nicht hochgeladen werden.");
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

  // ---- Abteilungs-Aktionen (Karte „Aufgaben für Abteilungen") ----
  //
  // Eine Route fuer alle vier Aktionen: Informieren (`{}`), Erinnern, Erneut
  // senden und Link erneuern (`{ aktion, departmentKey }`). Die Antwort traegt
  // den Versandbericht als fertige Meldung (201 gruen, 409/502 rot) samt
  // Hinweis (gelb). Danach IMMER neu laden — auch ein 409/502 kann den Stand
  // aendern (etwa „Versand fehlgeschlagen" an der Zeile).
  const abteilungsAktion = async (aktion: AbteilungsAktion, departmentKey?: string) => {
    setActionInfo(null);
    const meldung = await abteilungsAktionSenden(
      `/api/offboarding/${offboardingId}/department-links`,
      aktion,
      departmentKey,
    );
    setActionInfo(meldung);
    await loadData(true);
  };

  const createExitInterview = async () => {
    setCreatingExitInterview(true);
    try {
      const res = await fetch(`/api/offboarding/${offboardingId}/exit-interview`, { method: "POST" });
      if (res.ok) {
        await loadExitInterview();
      } else {
        const err = await res.json().catch(() => null);
        setActionError(err?.error || "Exit-Interview konnte nicht erstellt werden.");
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
      if (res.ok) {
        const result: { mailStatus?: string | null } = await res.json().catch(() => ({}));
        // SKIPPED: Die Mailvorlage ist aus oder hat keinen Empfänger — dann
        // ging keine E-Mail hinaus (allenfalls ein Webhook).
        if (result.mailStatus === "SKIPPED") {
          setActionError("Die Einladung wurde nicht per E-Mail versendet: Die Mailvorlage „Exit-Interview: Einladung“ ist deaktiviert oder hat keinen Empfänger.");
        }
        await loadExitInterview();
      } else {
        const err = await res.json().catch(() => null);
        setActionError(err?.error || "Link konnte nicht gesendet werden.");
        if (res.status === 409) await loadExitInterview();
      }
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
        // Etwa 409 „Die Adresse der Führungskraft liegt in keiner freigegebenen
        // Domain …" — den Text des Servers zeigen.
        const err = await res.json().catch(() => null);
        setActionError(err?.error || "Zeugnis-Bewertung konnte nicht erstellt werden.");
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

  // A4: Zuordnen nur mit Recht und solange der Server es anbietet (laufender Austritt ohne Zuordnung).
  const zuordnenMoeglich = canEdit && data?.rueckgaben?.aktionen.zuordnen === true;
  // G19: Hinweiszeile im Abschluss-Dialog, wenn das unterschriebene Rueckgabeprotokoll fehlt (ohne Sperre).
  const protokoll = data?.rueckgaben?.protokoll ?? null;
  const protokollHinweis = protokoll?.noetig && !protokoll.hochgeladenAm ? protokoll.text : null;

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

            <span
              id={KOPF_ID}
              tabIndex={-1}
              className="inline-flex rounded-md bg-muted px-3 py-1 font-mono text-sm font-bold text-foreground"
            >
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
                  id={STATUS_KNOPF_ID}
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
            {TABS.filter((tab) => canEdit || !NUR_HR_TABS.has(tab.id)).map((tab) => {
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
                      {returnItems.filter((i) => !rueckgabeOffen(i)).length}/{returnItems.length}
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
            onNavigateTab={(tab) => setActiveTab(tab as TabId)}
            hrReiterSichtbar={canEdit}
            onZuordnen={zuordnenMoeglich ? zuordnenOeffnen : undefined}
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
            abteilungen={data.abteilungen}
            fuehrungskraft={data.fuehrungskraft}
            darfAbteilungsAktionen={canEdit}
            abgebrochen={data.status === "CANCELLED"}
            onAbteilungsAktion={abteilungsAktion}
            abteilungsMeldung={actionInfo}
            onAbteilungsMeldungSchliessen={() => setActionInfo(null)}
            onFuehrungskraftEintragen={fuehrungskraftEintragen}
            returnItems={returnItems}
            onZumReiterRueckgaben={() => setActiveTab("returns")}
            zuordnungEmpfohlen={canEdit && data.rueckgaben?.zuordnungEmpfohlen === true}
            onZuordnen={zuordnenMoeglich ? zuordnenOeffnen : undefined}
          />
        )}

        {/* Tab 3: Rueckgaben (A4: Karte mit `rueckgaben`, sonst die Liste nur lesend) */}
        {activeTab === "returns" && (
          <TabReturns
            returnItems={returnItems}
            rueckgaben={data.rueckgaben}
            canEdit={canEdit}
            abgebrochen={data.status === "CANCELLED"}
            onAufruf={canEdit ? rueckgabenAufruf : undefined}
            onZuordnen={zuordnenMoeglich ? zuordnenOeffnen : undefined}
            meldung={rueckgabenMeldung}
            onMeldung={setRueckgabenMeldung}
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
            canEdit={canEdit}
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
        {activeTab === "exit-interview" && canEdit && (
          <TabExitInterview
            exitInterview={exitInterview}
            creatingExitInterview={creatingExitInterview}
            createExitInterview={createExitInterview}
            sendExitInterviewLink={sendExitInterviewLink}
            hasPrivateEmail={!!data.employeePrivateEmail}
          />
        )}

        {/* Tab 7: Zeugnis */}
        {activeTab === "zeugnis" && canEdit && (
          <TabZeugnis
            zeugnisBewertung={zeugnisBewertung}
            creatingZeugnis={creatingZeugnis}
            createZeugnisBewertung={createZeugnisBewertung}
          />
        )}

        {/* Tab 8: E-Mails (Mailprotokoll) */}
        {activeTab === "mails" && canEdit && <MailProtokoll modul="offboarding" vorgangId={offboardingId} />}
      </main>

      {/* „Einstellung zuordnen …“ (A4) – aus Reiter, Stepper und Abteilungskarte. */}
      {zuordnenOffen && (
        <EinstellungZuordnenDialog
          offboardingId={offboardingId}
          untertitel={[data.displayId, displayName].filter(Boolean).join(" · ") || null}
          sendet={zuordnenSendet}
          fehler={zuordnenFehler}
          fokusZiel={RUECKGABEN_KARTE_TITEL_ID}
          onAbbrechen={zuordnenSchliessen}
          onZuordnen={(body) => void zuordnenSenden(body)}
        />
      )}

      {/* „Vorgang abschließen“ (A4, G18) – Rueckfrage mit der Liste offener Rueckgaben. */}
      {abschluss && (
        <AbschlussDialog
          offen={abschluss.offen}
          fehler={abschluss.fehler}
          sendet={schliesstAb}
          texte={AUSTRITT_ABSCHLUSS_TEXTE}
          hinweis={protokollHinweis}
          untertitel={[data.displayId, displayName].filter(Boolean).join(" · ") || null}
          fokusZiel={STATUS_KNOPF_ID}
          onAbbrechen={() => setAbschluss(null)}
          onAbschliessen={(bestaetigt) => void abschliessen(bestaetigt)}
        />
      )}
    </div>
  );
}
