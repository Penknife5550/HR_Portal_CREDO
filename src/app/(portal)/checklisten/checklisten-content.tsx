"use client";

/**
 * Checklisten-Vorlagen – Client Component
 *
 * Zeigt alle Checklisten-Vorlagen als Karten an.
 * SUPER_ADMIN und HR_LEITUNG koennen Vorlagen erstellen, bearbeiten und löschen.
 * Items werden nach Kategorie gruppiert und sind aufklappbar.
 *
 * Paket 5 – drei Aenderungen, die zusammengehoeren:
 *
 *  1. SPEICHERN IN EINEM SCHRITT. Frueher loeschte diese Seite beim Bearbeiten
 *     erst ALLE Punkte einzeln und legte sie danach einzeln neu an — ohne eine
 *     einzige Antwort zu pruefen. Brach etwas dazwischen ab, war die Vorlage
 *     leer, und die Oberflaeche meldete trotzdem „erfolgreich aktualisiert".
 *     Jetzt geht genau EIN `PUT /api/checklisten/[id]` hinaus (bzw. POST beim
 *     Anlegen), die Antwort wird geprueft, und vorhandene Punkte behalten ihre
 *     ID (sonst zeigte `ChecklistItem.templateItemId` laufender Vorgaenge ins
 *     Leere).
 *  2. ZUSTAENDIGKEIT ALS AUSWAHL, auch im Onboarding. Dort war sie Freitext:
 *     „Verwaltung", „Sekretariat" und „Verw." waeren drei verschiedene Stellen
 *     gewesen, und keine davon haette einen Link bekommen. Alte Werte gehen
 *     nicht still verloren — sie stehen als „Unbekannt: … (bitte zuordnen)" in
 *     der Auswahl, und der Server nimmt sie erst nach der Zuordnung an.
 *  3. FAELLIGKEIT UND HINWEIS. Die Fälligkeit in Tagen wirkt seit Paket 5 im
 *     Vorgang (Vertragsbeginn bzw. letzter Arbeitstag plus Tage); der neue
 *     Hinweis wird in die Aufgabe kopiert und steht auf der Link-Seite und in
 *     der Mail an die Abteilung.
 */

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PortalHeader } from "@/components/portal-header";
import { abteilungLabel, DEPARTMENT_KEYS } from "@/lib/constants";
import { istFuehrungskraft, istLinkAbteilung } from "@/lib/abteilungsaufgaben";
import { CHECKLISTEN_HINWEIS_MAX } from "@/lib/validations/abteilungsaufgaben";

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

interface ChecklistTemplateItem {
  id: string;
  templateId: string;
  title: string;
  category: string;
  orderIndex: number;
  defaultDueDays: number | null;
  defaultAssignee: string | null;
  description: string | null;
  createdAt: string;
}

interface ChecklistTemplate {
  id: string;
  name: string;
  description: string | null;
  questionnaireType: string | null;
  isActive: boolean;
  items: ChecklistTemplateItem[];
  _count: { items: number; onboardings: number };
  createdAt: string;
  updatedAt: string;
}

/** Eine Abteilung aus Einstellungen → Abteilungen (nur, was der Editor braucht). */
interface AbteilungsKonfigZeile {
  departmentKey: string;
  departmentName: string;
  isActive: boolean;
}

interface NewItem {
  /** Vorhandener Punkt — wird mitgeschickt, damit die ID erhalten bleibt. */
  id?: string;
  title: string;
  category: string;
  orderIndex: number;
  defaultDueDays: number | null;
  defaultAssignee: string;
  description: string;
}

interface ModalData {
  id?: string;
  name: string;
  description: string;
  questionnaireType: string;
  items: NewItem[];
}

// Lesbare Labels für QuestionnaireType
const TYPE_LABELS: Record<string, string> = {
  STANDARD: "Standard",
  BEAMTE: "Beamte",
  ERZIEHER: "Erzieher",
  MINIJOB: "Minijob",
  EHRENAMT: "Ehrenamt",
};

// Farben für QuestionnaireType-Badges
const TYPE_COLORS: Record<string, string> = {
  STANDARD: "bg-blue-100 text-blue-800",
  BEAMTE: "bg-purple-100 text-purple-800",
  ERZIEHER: "bg-green-100 text-green-800",
  MINIJOB: "bg-amber-100 text-amber-800",
  EHRENAMT: "bg-rose-100 text-rose-800",
};

// Kategorie-Vorschlaege (Onboarding)
const CATEGORY_SUGGESTIONS = [
  "Vor Arbeitsbeginn",
  "Erster Arbeitstag",
  "Erste Woche",
  "Einarbeitung",
  "Dokumente",
  "IT-Einrichtung",
  "Verwaltung",
];

// Kategorie-Vorschlaege (Offboarding – 6 Phasen)
const OFFBOARDING_CATEGORY_SUGGESTIONS = [
  "Phase 1: Sofort",
  "Phase 2: Erste Woche",
  "Phase 3: Übergabe",
  "Phase 4: Letzte Woche",
  "Phase 5: Letzter Tag",
  "Phase 6: Nach Austritt",
];

/**
 * Zustaendige, die im Portal arbeiten. Sie bekommen NIE einen Link — deshalb
 * stehen sie in einer eigenen Gruppe der Auswahl. „Mitarbeiter/in" statt des
 * Katalog-Labels „Mitarbeiter", weil hier eine Person gemeint ist.
 */
const PORTAL_OPTIONEN: { key: string; label: string }[] = [
  { key: DEPARTMENT_KEYS.HR, label: "Personalabteilung" },
  { key: DEPARTMENT_KEYS.MITARBEITER, label: "Mitarbeiter/in" },
];

/**
 * Feste Stellen, die ihre Aufgaben per Link bekommen. „Führungskraft des
 * Vorgangs", damit klar ist, dass die Adresse aus dem Vorgang stammt und nicht
 * aus den Einstellungen.
 */
const LINK_OPTIONEN: { key: string; label: string }[] = [
  { key: DEPARTMENT_KEYS.IT, label: "IT-Abteilung" },
  { key: DEPARTMENT_KEYS.VERWALTUNG, label: "Verwaltung / Sekretariat" },
  { key: DEPARTMENT_KEYS.FACILITY, label: "Facility Management" },
  { key: DEPARTMENT_KEYS.BUCHHALTUNG, label: "Buchhaltung" },
  { key: DEPARTMENT_KEYS.DSB, label: "Datenschutzbeauftragte/r" },
  { key: DEPARTMENT_KEYS.VORGESETZTER, label: "Führungskraft des Vorgangs" },
];

// Farben pro Abteilung für Badges (feste Klassen, damit Tailwind sie findet)
const DEPARTMENT_BADGE_COLORS: Record<string, string> = {
  HR: "bg-blue-100 text-blue-800",
  IT: "bg-purple-100 text-purple-800",
  VERWALTUNG: "bg-teal-100 text-teal-800",
  FACILITY: "bg-orange-100 text-orange-800",
  BUCHHALTUNG: "bg-yellow-100 text-yellow-800",
  VORGESETZTER: "bg-green-100 text-green-800",
  MITARBEITER: "bg-gray-100 text-gray-800",
  DSB: "bg-red-100 text-red-800",
};

// Abteilungs-Label nachschlagen (unbekannter Schlüssel/Freitext bleibt, wie er ist)
function getDepartmentLabel(key: string): string {
  return abteilungLabel(key);
}

// Pruefen ob ein Template ein Offboarding-Template ist
function isOffboardingTemplate(template: { name: string; questionnaireType?: string | null }): boolean {
  return template.name.startsWith("Offboarding:") || template.name.startsWith("Offboarding: ");
}

type TabType = "onboarding" | "offboarding" | "verbeamtung";

// Leeres Item
function createEmptyItem(orderIndex: number): NewItem {
  return {
    title: "",
    category: "",
    orderIndex,
    defaultDueDays: null,
    defaultAssignee: "",
    description: "",
  };
}

/** Beschriftungen, die sich je Modul unterscheiden. */
interface ModulText {
  /** Hilfetext unter „Fällig (Tage)". */
  bezugKurz: string;
  /** Formulierung fuer 0 Tage. */
  bezugAm: string;
  /** Formulierung nach „… Tage vor". */
  bezugVor: string;
  /** Formulierung nach „… Tage nach". */
  bezugNach: string;
  /** Infokasten ueber den Punkten. */
  infobox: string;
}

const MODUL_TEXT: Record<"onboarding" | "offboarding", ModulText> = {
  onboarding: {
    bezugKurz: "relativ zum Vertragsbeginn",
    bezugAm: "Am Vertragsbeginn",
    bezugVor: "Vertragsbeginn",
    bezugNach: "Vertragsbeginn",
    infobox:
      "Jeder Punkt braucht Titel und Kategorie. Optional: Fälligkeit in Tagen relativ zum Vertragsbeginn (−7 = eine Woche vorher, 0 = am Vertragsbeginn) und die zuständige Stelle. Aufgaben von IT, Verwaltung, Facility, Buchhaltung, Datenschutz und Führungskraft kann HR im Vorgang per Link verschicken.",
  },
  offboarding: {
    bezugKurz: "relativ zum letzten Arbeitstag",
    bezugAm: "Am letzten Arbeitstag",
    bezugVor: "dem letzten Arbeitstag",
    bezugNach: "dem letzten Arbeitstag",
    infobox:
      "Jeder Punkt braucht Titel und Kategorie. Optional: Fälligkeit in Tagen relativ zum letzten Arbeitstag (−7 = eine Woche vorher, 0 = am letzten Arbeitstag) und die zuständige Stelle. Aufgaben von IT, Verwaltung, Facility, Buchhaltung, Datenschutz und Führungskraft kann HR im Vorgang per Link verschicken.",
  },
};

// =============================================
// Component
// =============================================
export function ChecklistenContent({ user }: { user: User }) {
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [abteilungen, setAbteilungen] = useState<AbteilungsKonfigZeile[]>([]);
  const [abteilungenGeladen, setAbteilungenGeladen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("onboarding");

  // Aufklapp-State für Kategorien (templateId -> Set<category>)
  const [expandedCategories, setExpandedCategories] = useState<
    Record<string, Set<string>>
  >({});

  // Modal-State
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState<ModalData>({
    name: "",
    description: "",
    questionnaireType: "",
    items: [createEmptyItem(0)],
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const canEdit =
    user.role === "SUPER_ADMIN" || user.role === "HR_LEITUNG";

  // Gefilterte Templates nach aktivem Tab. Der Tab „Verbeamtung" zeigte hier
  // frueher die Onboarding-Vorlagen mit an — die Verbeamtungs-Checkliste
  // entsteht aber im Vorgang und hat gar keine Vorlage.
  const filteredTemplates =
    activeTab === "verbeamtung"
      ? []
      : templates.filter((t) =>
          activeTab === "offboarding"
            ? isOffboardingTemplate(t)
            : !isOffboardingTemplate(t)
        );

  // Helfer: Ist das Modal gerade im Offboarding-Modus?
  const isModalOffboarding =
    activeTab === "offboarding" ||
    (modalData.id != null && isOffboardingTemplate(modalData));

  const modulText = isModalOffboarding ? MODUL_TEXT.offboarding : MODUL_TEXT.onboarding;
  const listenText = activeTab === "offboarding" ? MODUL_TEXT.offboarding : MODUL_TEXT.onboarding;

  // Eigene Schlüssel aus den Einstellungen (alles, was nicht fest ist)
  const feste = new Set<string>(Object.values(DEPARTMENT_KEYS));
  const eigeneOptionen: { key: string; label: string }[] = [];
  for (const zeile of abteilungen) {
    if (feste.has(zeile.departmentKey)) continue;
    if (eigeneOptionen.some((o) => o.key === zeile.departmentKey)) continue;
    eigeneOptionen.push({ key: zeile.departmentKey, label: zeile.departmentName || zeile.departmentKey });
  }

  /** Alle Schlüssel, die die Auswahl anbietet. */
  const bekannteSchluessel = new Set<string>([
    ...PORTAL_OPTIONEN.map((o) => o.key),
    ...LINK_OPTIONEN.map((o) => o.key),
    ...eigeneOptionen.map((o) => o.key),
  ]);

  /** Link-Abteilungen mit hinterlegter, aktiver Adresse. */
  const schluesselMitAdresse = new Set(
    abteilungen.filter((a) => a.isActive).map((a) => a.departmentKey)
  );

  /**
   * Anzeigename einer Zustaendigkeit — nie der rohe Schluessel, wenn wir es
   * besser wissen.
   *
   * `abteilungLabel()` kennt nur die festen Schluessel und gibt alles andere
   * unveraendert zurueck. Fuer einen SELBST angelegten Schluessel stand damit
   * „EMPFANG" auf der Karte, waehrend die Auswahl direkt darueber „Empfang"
   * anbot. Den echten Namen liefern die Einstellungen (`abteilungen`).
   */
  function zustaendigLabel(schluesselOderText: string | null | undefined): string {
    if (!schluesselOderText) return "";
    const eigener = eigeneOptionen.find((o) => o.key === schluesselOderText);
    return eigener?.label ?? getDepartmentLabel(schluesselOderText);
  }

  // =============================================
  // Vorlagen laden
  // =============================================
  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/checklisten");
      if (!res.ok) {
        throw new Error("Fehler beim Laden der Checklisten-Vorlagen");
      }
      const json = await res.json();
      setTemplates(json.data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unbekannter Fehler"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // =============================================
  // Abteilungen laden (fuer Auswahl und Adress-Warnung)
  //
  // Scheitert der Aufruf, bleibt die Liste leer: Die Auswahl zeigt dann nur die
  // festen Stellen, und es wird KEINE Adress-Warnung behauptet.
  // =============================================
  const loadAbteilungen = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/departments");
      if (!res.ok) return;
      const json = await res.json();
      if (Array.isArray(json.data)) {
        setAbteilungen(json.data as AbteilungsKonfigZeile[]);
        setAbteilungenGeladen(true);
      }
    } catch {
      // Ohne Abteilungsliste bleibt der Editor benutzbar.
    }
  }, []);

  useEffect(() => {
    loadTemplates();
    loadAbteilungen();
  }, [loadTemplates, loadAbteilungen]);

  // =============================================
  // Kategorien gruppieren
  // =============================================
  function groupByCategory(items: ChecklistTemplateItem[]) {
    const groups: Record<string, ChecklistTemplateItem[]> = {};
    for (const item of items) {
      if (!groups[item.category]) {
        groups[item.category] = [];
      }
      groups[item.category].push(item);
    }
    return groups;
  }

  function getUniqueCategories(items: ChecklistTemplateItem[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of items) {
      if (!seen.has(item.category)) {
        seen.add(item.category);
        result.push(item.category);
      }
    }
    return result;
  }

  // =============================================
  // Kategorie auf-/zuklappen
  // =============================================
  function toggleCategory(templateId: string, category: string) {
    setExpandedCategories((prev) => {
      const current = prev[templateId] || new Set<string>();
      const next = new Set(current);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return { ...prev, [templateId]: next };
    });
  }

  function isCategoryExpanded(templateId: string, category: string): boolean {
    return expandedCategories[templateId]?.has(category) ?? false;
  }

  // =============================================
  // Punkte ohne hinterlegte Adresse (je Vorlage)
  //
  // Die Führungskraft zaehlt nicht mit: Ihre Adresse steht im Vorgang, nicht in
  // den Einstellungen.
  // =============================================
  function fehlendeAdressen(template: ChecklistTemplate): { label: string; anzahl: number }[] {
    if (!abteilungenGeladen) return [];
    const zaehler = new Map<string, number>();
    for (const item of template.items) {
      const key = item.defaultAssignee?.trim();
      if (!key || !istLinkAbteilung(key) || istFuehrungskraft(key)) continue;
      if (schluesselMitAdresse.has(key)) continue;
      zaehler.set(key, (zaehler.get(key) ?? 0) + 1);
    }
    return [...zaehler.entries()].map(([key, anzahl]) => ({
      label: zustaendigLabel(key),
      anzahl,
    }));
  }

  // =============================================
  // Modal oeffnen: Neu erstellen
  // =============================================
  function handleCreate() {
    setModalData({
      name: activeTab === "offboarding" ? "Offboarding: " : "",
      description: "",
      questionnaireType: "",
      items: [createEmptyItem(0)],
    });
    setShowModal(true);
  }

  // =============================================
  // Modal oeffnen: Bearbeiten
  // =============================================
  function handleEdit(template: ChecklistTemplate) {
    setModalData({
      id: template.id,
      name: template.name,
      description: template.description || "",
      questionnaireType: template.questionnaireType || "",
      items: template.items.map((item) => ({
        // Die ID geht mit hinaus — nur so behaelt der Punkt sie beim Speichern.
        id: item.id,
        title: item.title,
        category: item.category,
        orderIndex: item.orderIndex,
        defaultDueDays: item.defaultDueDays,
        defaultAssignee: item.defaultAssignee || "",
        description: item.description || "",
      })),
    });
    setShowModal(true);
  }

  // =============================================
  // Modal: Item hinzufuegen
  // =============================================
  function handleAddItem() {
    setModalData((prev) => ({
      ...prev,
      items: [...prev.items, createEmptyItem(prev.items.length)],
    }));
  }

  // =============================================
  // Modal: Item entfernen
  // =============================================
  function handleRemoveItem(index: number) {
    setModalData((prev) => ({
      ...prev,
      items: prev.items
        .filter((_, i) => i !== index)
        .map((item, i) => ({ ...item, orderIndex: i })),
    }));
  }

  // =============================================
  // Modal: Item-Feld aendern
  // =============================================
  function handleItemChange(
    index: number,
    field: keyof NewItem,
    value: string | number | null
  ) {
    setModalData((prev) => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      ),
    }));
  }

  // =============================================
  // Modal: Speichern (Erstellen oder Bearbeiten)
  //
  // EIN Aufruf, dessen Antwort geprueft wird. Vorhandene Punkte schicken ihre
  // `id` mit; der Server ersetzt Metadaten und Punkte in einer Transaktion.
  // =============================================
  async function handleSave() {
    if (!modalData.name.trim()) {
      setError("Name ist ein Pflichtfeld");
      return;
    }

    // Unvollstaendige Punkte werden GEMELDET, nicht weggefiltert.
    //
    // Frueher ging nur eine gefilterte Liste in den Rumpf. Ein VORHANDENER Punkt,
    // dessen Titel oder Kategorie im Modal geleert wurde (etwa um ihn neu zu
    // tippen), fehlte damit in `items`, seine ID stand nicht in `behalten` —
    // und das `deleteMany` der PUT-Route loeschte ihn endgueltig, waehrend die
    // Oberflaeche „erfolgreich aktualisiert" meldete. Der Server sagt beim
    // Speichern dasselbe („Punkt n: Titel ist ein Pflichtfeld."); hier kommen
    // wir ihm nur zuvor, damit die Zeilennummer schon vor dem Absenden steht.
    if (modalData.items.length === 0) {
      setError("Mindestens ein Checklisten-Punkt ist erforderlich.");
      return;
    }
    const unvollstaendig = modalData.items.findIndex(
      (item) => !item.title.trim() || !item.category.trim()
    );
    if (unvollstaendig >= 0) {
      setError(`Punkt ${unvollstaendig + 1}: Titel und Kategorie sind Pflichtfelder.`);
      return;
    }
    const punkte = modalData.items;

    // Offboarding-spezifisch: Name-Prefix sicherstellen, questionnaireType = null
    let finalName = modalData.name.trim();
    let finalQuestionnaireType: string | null = modalData.questionnaireType || null;
    if (isModalOffboarding) {
      if (!finalName.startsWith("Offboarding:")) {
        finalName = "Offboarding: " + finalName;
      }
      finalQuestionnaireType = null;
    }

    const rumpf = {
      name: finalName,
      description: modalData.description.trim() || null,
      questionnaireType: finalQuestionnaireType,
      items: punkte.map((item, index) => ({
        ...(item.id ? { id: item.id } : {}),
        title: item.title.trim(),
        category: item.category.trim(),
        orderIndex: index,
        defaultDueDays: item.defaultDueDays,
        defaultAssignee: item.defaultAssignee.trim() || null,
        description: item.description.trim() || null,
      })),
    };

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(
        modalData.id ? `/api/checklisten/${modalData.id}` : "/api/checklisten",
        {
          method: modalData.id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(rumpf),
        }
      );

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Fehler beim Speichern");
      }

      setSuccessMessage(
        modalData.id
          ? "Checkliste erfolgreich aktualisiert"
          : "Checkliste erfolgreich erstellt"
      );
      setShowModal(false);
      await loadTemplates();

      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Fehler beim Speichern"
      );
    } finally {
      setSaving(false);
    }
  }

  // =============================================
  // Aktiv/Inaktiv Toggle
  // =============================================
  async function handleToggleActive(template: ChecklistTemplate) {
    try {
      const res = await fetch(`/api/checklisten/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !template.isActive }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Fehler beim Umschalten");
      }

      await loadTemplates();
      setSuccessMessage(
        `Checkliste "${template.name}" ${!template.isActive ? "aktiviert" : "deaktiviert"}`
      );
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Fehler beim Umschalten"
      );
    }
  }

  // =============================================
  // Vorlage löschen
  // =============================================
  async function handleDelete(template: ChecklistTemplate) {
    if (!confirm(`Checkliste "${template.name}" wirklich löschen?`)) {
      return;
    }

    setDeleting(template.id);
    try {
      const res = await fetch(`/api/checklisten/${template.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Fehler beim Löschen");
      }

      await loadTemplates();
      setSuccessMessage(`Checkliste "${template.name}" gelöscht`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Fehler beim Löschen"
      );
    } finally {
      setDeleting(null);
    }
  }

  // =============================================
  // Render: Faelligkeitstage formulieren (je Modul)
  // =============================================
  function formatDueDays(days: number | null, texte: ModulText): string {
    if (days === null || days === undefined) return "-";
    if (days === 0) return texte.bezugAm;
    // „1 Tage vor …" war deutsch danebengegriffen; HR kann ±1 jederzeit
    // eintragen, auch wenn der Seed die Werte nicht nutzt.
    const anzahl = Math.abs(days);
    const einheit = anzahl === 1 ? "Tag" : "Tage";
    if (days < 0) return `${anzahl} ${einheit} vor ${texte.bezugVor}`;
    return `${anzahl} ${einheit} nach ${texte.bezugNach}`;
  }

  // =============================================
  // Render
  // =============================================
  return (
    <div className="min-h-screen bg-muted">
      <PortalHeader user={user} />

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* Seitentitel */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">
              Checklisten-Vorlagen
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Erstellen und verwalten Sie Checklisten für Onboarding und Offboarding
            </p>
          </div>
          {canEdit && activeTab !== "verbeamtung" && (
            <button
              onClick={handleCreate}
              className="rounded-lg bg-[#6BAA24] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#5a9120]"
            >
              + Neue Checkliste
            </button>
          )}
        </div>

        {/* Tabs: Onboarding | Offboarding */}
        <div className="mb-6 flex border-b border-border">
          <button
            onClick={() => setActiveTab("onboarding")}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "onboarding"
                ? "border-b-2 border-[#6BAA24] text-[#6BAA24]"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Onboarding
          </button>
          <button
            onClick={() => setActiveTab("offboarding")}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "offboarding"
                ? "border-b-2 border-[#6BAA24] text-[#6BAA24]"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Offboarding
          </button>
          <button
            onClick={() => setActiveTab("verbeamtung")}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "verbeamtung"
                ? "border-b-2 border-[#6BAA24] text-[#6BAA24]"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Verbeamtung
          </button>
        </div>

        {/* Verbeamtung Tab — Info */}
        {activeTab === "verbeamtung" && (
          <div className="rounded-xl border bg-card p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-credo-blau/10">
                <svg className="h-6 w-6 text-credo-blau" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Verbeamtung (PSI) — 62 Checklisten-Punkte</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Die Verbeamtungs-Checkliste wird automatisch beim Anlegen eines neuen Vorgangs erstellt.
                  Sie umfasst 62 Punkte über alle 11 Schritte und 4 Phasen des PSI-Prozesses.
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-xs text-muted-foreground">Phase I</p>
                    <p className="text-sm font-semibold text-foreground">Antrag &amp; Beurteilung</p>
                    <p className="text-xs text-muted-foreground">11 Punkte</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-xs text-muted-foreground">Phase II</p>
                    <p className="text-sm font-semibold text-foreground">Verwaltung (A-H)</p>
                    <p className="text-xs text-muted-foreground">30 Punkte</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-xs text-muted-foreground">Phase III</p>
                    <p className="text-sm font-semibold text-foreground">Probezeit</p>
                    <p className="text-xs text-muted-foreground">16 Punkte</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-xs text-muted-foreground">Phase IV</p>
                    <p className="text-sm font-semibold text-foreground">Übernahme Lebenszeit</p>
                    <p className="text-xs text-muted-foreground">5 Punkte</p>
                  </div>
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  Die Punkte können in der Detail-Ansicht jedes Verbeamtungsvorgangs bearbeitet werden.
                  Gatekeeper-Punkte (🔒) müssen erledigt sein bevor die nächste Phase beginnt.
                </p>
                <Link href="/dashboard?tab=civil-service"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                  Zum Verbeamtungs-Dashboard →
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Erfolgsmeldung */}
        {successMessage && (
          <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <div className="flex items-center justify-between">
              <span>{successMessage}</span>
              <button
                onClick={() => setSuccessMessage(null)}
                className="text-emerald-600 hover:text-emerald-800"
              >
                Schliessen
              </button>
            </div>
          </div>
        )}

        {/* Fehlermeldung. Bei offenem Modal steht sie IM Modal — hier laege sie
            hinter der Abdeckung, und ein gescheitertes Speichern saehe aus wie
            gar nichts. */}
        {error && !showModal && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <div className="flex items-center justify-between">
              <span>{error}</span>
              <button
                onClick={() => setError(null)}
                className="text-red-600 hover:text-red-800"
              >
                Schliessen
              </button>
            </div>
          </div>
        )}

        {/* Ladeanzeige */}
        {loading && activeTab !== "verbeamtung" && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">
                Checklisten werden geladen...
              </p>
            </div>
          </div>
        )}

        {/* Keine Vorlagen */}
        {!loading && activeTab !== "verbeamtung" && filteredTemplates.length === 0 && !error && (
          <div className="rounded-xl border bg-card p-8 text-center shadow-sm">
            <p className="text-muted-foreground">
              Keine {activeTab === "offboarding" ? "Offboarding" : "Onboarding"}-Checklisten-Vorlagen gefunden.
            </p>
            {canEdit && (
              <button
                onClick={handleCreate}
                className="mt-4 rounded-lg bg-[#6BAA24] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#5a9120]"
              >
                Erste {activeTab === "offboarding" ? "Offboarding" : "Onboarding"}-Checkliste erstellen
              </button>
            )}
          </div>
        )}

        {/* Template-Karten */}
        {!loading && activeTab !== "verbeamtung" && filteredTemplates.length > 0 && (
          <div className="space-y-6">
            {filteredTemplates.map((template) => {
              const groups = groupByCategory(template.items);
              const categories = getUniqueCategories(template.items);
              const categoryCount = categories.length;
              const ohneAdresse = fehlendeAdressen(template);

              return (
                <div
                  key={template.id}
                  className="rounded-xl border bg-card shadow-sm"
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between border-b px-6 py-4">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-foreground">
                        {template.name}
                      </h3>
                      {template.questionnaireType && (
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            TYPE_COLORS[template.questionnaireType] ||
                            "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {TYPE_LABELS[template.questionnaireType] ||
                            template.questionnaireType}
                        </span>
                      )}
                      {template.isActive ? (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                          Aktiv
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                          Inaktiv
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">
                        {template._count.items} Punkte in {categoryCount} Kategorien
                      </span>
                      {canEdit && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEdit(template)}
                            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
                          >
                            Bearbeiten
                          </button>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={template.isActive}
                            aria-label={`${template.name} ${template.isActive ? "deaktivieren" : "aktivieren"}`}
                            onClick={() => handleToggleActive(template)}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                              template.isActive
                                ? "bg-[#6BAA24]"
                                : "bg-muted-foreground/30"
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${
                                template.isActive
                                  ? "translate-x-5"
                                  : "translate-x-0"
                              }`}
                            />
                          </button>
                          <button
                            onClick={() => handleDelete(template)}
                            disabled={deleting === template.id}
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                          >
                            {deleting === template.id ? "..." : "Löschen"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Beschreibung */}
                  {template.description && (
                    <div className="border-b px-6 py-2">
                      <p className="text-sm text-muted-foreground">
                        {template.description}
                      </p>
                    </div>
                  )}

                  {/* Warnung: Link-Abteilung ohne hinterlegte Adresse */}
                  {ohneAdresse.length > 0 && (
                    <div className="border-b border-amber-200 bg-amber-50 px-6 py-2">
                      {ohneAdresse.map((eintrag) => (
                        <p key={eintrag.label} className="text-xs text-amber-800">
                          {eintrag.anzahl} {eintrag.anzahl === 1 ? "Punkt" : "Punkte"} ohne Adresse:{" "}
                          {eintrag.label} ist unter Einstellungen → Abteilungen nicht hinterlegt.
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Items nach Kategorie gruppiert */}
                  <div className="px-6 py-4">
                    <div className="space-y-2">
                      {categories.map((category) => {
                        const items = groups[category];
                        const expanded = isCategoryExpanded(
                          template.id,
                          category
                        );

                        return (
                          <div
                            key={category}
                            className="rounded-lg border border-border"
                          >
                            {/* Kategorie-Header (aufklappbar) */}
                            <button
                              onClick={() =>
                                toggleCategory(template.id, category)
                              }
                              className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-accent/50"
                            >
                              <div className="flex items-center gap-2">
                                <svg
                                  className={`h-4 w-4 text-muted-foreground transition-transform ${
                                    expanded ? "rotate-90" : ""
                                  }`}
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M9 5l7 7-7 7"
                                  />
                                </svg>
                                <span className="text-sm font-semibold text-foreground">
                                  {category}
                                </span>
                                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                  {items.length}
                                </span>
                              </div>
                            </button>

                            {/* Items in dieser Kategorie */}
                            {expanded && (
                              <div className="border-t px-4 py-2">
                                <div className="space-y-1">
                                  {items.map((item) => {
                                    const perLink = istLinkAbteilung(item.defaultAssignee);
                                    return (
                                      <div
                                        key={item.id}
                                        className="flex items-start justify-between gap-4 rounded-md px-3 py-2 text-sm hover:bg-muted/50"
                                      >
                                        <div className="min-w-0">
                                          <span className="text-foreground">{item.title}</span>
                                          {item.description && (
                                            <p className="mt-0.5 text-xs text-muted-foreground">
                                              {item.description}
                                            </p>
                                          )}
                                        </div>
                                        <div className="flex shrink-0 items-center gap-4 text-xs text-muted-foreground">
                                          {item.defaultAssignee && (
                                            <span
                                              title={
                                                perLink
                                                  ? "Wird im Vorgang per Link an die Abteilung verschickt"
                                                  : undefined
                                              }
                                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                                                DEPARTMENT_BADGE_COLORS[item.defaultAssignee] ||
                                                "bg-[#009AC6]/10 text-[#009AC6]"
                                              }`}
                                            >
                                              {perLink && (
                                                <svg
                                                  aria-hidden="true"
                                                  className="h-3 w-3"
                                                  fill="none"
                                                  viewBox="0 0 24 24"
                                                  stroke="currentColor"
                                                  strokeWidth={2}
                                                >
                                                  <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 015.656 5.656l-1.5 1.5"
                                                  />
                                                </svg>
                                              )}
                                              {zustaendigLabel(item.defaultAssignee)}
                                            </span>
                                          )}
                                          <span>
                                            {formatDueDays(item.defaultDueDays, listenText)}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Verwendungs-Info */}
                  {template._count.onboardings > 0 && (
                    <div className="border-t px-6 py-3">
                      <p className="text-xs text-muted-foreground">
                        Verwendet in {template._count.onboardings} Onboarding-Vorgang/Vorgängen
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* =============================================
          Erstellen/Bearbeiten-Modal
          ============================================= */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10">
          <div className="w-full max-w-3xl rounded-xl bg-card shadow-xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">
                {modalData.id
                  ? "Checkliste bearbeiten"
                  : "Neue Checkliste erstellen"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                aria-label="Schliessen"
                className="text-muted-foreground hover:text-foreground"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="max-h-[70vh] overflow-y-auto px-6 py-4">
              {/* Fehlermeldung des Servers (z.B. „Punkt 2: Die Zuständigkeit
                  „Werkstatt“ ist unbekannt – bitte in der Auswahl zuordnen.") */}
              {error && (
                <div
                  role="alert"
                  className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                >
                  {error}
                </div>
              )}

              {/* Name */}
              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-foreground">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={modalData.name}
                  onChange={(e) =>
                    setModalData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="z.B. Standard-Einstellung (TV-L)"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Beschreibung */}
              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-foreground">
                  Beschreibung
                </label>
                <textarea
                  value={modalData.description}
                  onChange={(e) =>
                    setModalData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="Optionale Beschreibung der Checkliste"
                  rows={2}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Fragebogentyp – nur bei Onboarding sichtbar */}
              {!isModalOffboarding && (
                <div className="mb-6">
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    Fragebogentyp-Zuordnung
                  </label>
                  <select
                    value={modalData.questionnaireType}
                    onChange={(e) =>
                      setModalData((prev) => ({
                        ...prev,
                        questionnaireType: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">Keine Zuordnung</option>
                    <option value="STANDARD">Standard</option>
                    <option value="BEAMTE">Beamte</option>
                    <option value="ERZIEHER">Erzieher</option>
                    <option value="MINIJOB">Minijob</option>
                    <option value="EHRENAMT">Ehrenamt</option>
                  </select>
                </div>
              )}

              {/* Offboarding-Hinweis */}
              {isModalOffboarding && (
                <div className="mb-6 rounded-lg border border-orange-200 bg-orange-50 p-3">
                  <p className="text-xs text-orange-800">
                    Offboarding-Vorlage: Der Name beginnt automatisch mit „Offboarding: “.
                    Ein Fragebogentyp wird dabei entfernt, damit die Vorlage nicht
                    versehentlich als Onboarding-Checkliste verwendet wird.
                  </p>
                </div>
              )}

              {/* Info-Box */}
              <div className="mb-4 rounded-lg border border-[#009AC6]/20 bg-[#009AC6]/5 p-3">
                <p className="text-xs text-[#009AC6]">{modulText.infobox}</p>
              </div>

              {/* Items-Liste */}
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground">
                    Checklisten-Punkte
                  </label>
                  <button
                    onClick={handleAddItem}
                    className="rounded-md bg-[#6BAA24] px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-[#5a9120]"
                  >
                    + Punkt hinzufügen
                  </button>
                </div>

                <div className="space-y-3">
                  {modalData.items.map((item, index) => {
                    const zugeordnet = item.defaultAssignee.trim();
                    // Ein Altwert, den die Auswahl nicht kennt, darf nicht still
                    // verschwinden — er steht als eigener Eintrag darin.
                    const unbekannt =
                      zugeordnet !== "" && !bekannteSchluessel.has(zugeordnet)
                        ? zugeordnet
                        : null;

                    return (
                      <div
                        key={index}
                        className="rounded-lg border border-border bg-muted/30 p-3"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground">
                            Punkt {index + 1}
                          </span>
                          {modalData.items.length > 1 && (
                            <button
                              onClick={() => handleRemoveItem(index)}
                              className="text-xs text-red-500 hover:text-red-700"
                            >
                              Entfernen
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {/* Titel */}
                          <div>
                            <label
                              htmlFor={`punkt-titel-${index}`}
                              className="mb-1 block text-xs font-medium text-muted-foreground"
                            >
                              Titel *
                            </label>
                            <input
                              id={`punkt-titel-${index}`}
                              type="text"
                              value={item.title}
                              onChange={(e) =>
                                handleItemChange(index, "title", e.target.value)
                              }
                              placeholder="Titel *"
                              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          </div>

                          {/* Kategorie */}
                          <div>
                            <label
                              htmlFor={`punkt-kategorie-${index}`}
                              className="mb-1 block text-xs font-medium text-muted-foreground"
                            >
                              Kategorie *
                            </label>
                            <input
                              id={`punkt-kategorie-${index}`}
                              type="text"
                              value={item.category}
                              onChange={(e) =>
                                handleItemChange(
                                  index,
                                  "category",
                                  e.target.value
                                )
                              }
                              list={`category-suggestions-${index}`}
                              placeholder="Kategorie *"
                              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                            <datalist id={`category-suggestions-${index}`}>
                              {(isModalOffboarding
                                ? OFFBOARDING_CATEGORY_SUGGESTIONS
                                : CATEGORY_SUGGESTIONS
                              ).map((cat) => (
                                <option key={cat} value={cat} />
                              ))}
                            </datalist>
                          </div>

                          {/* Faelligkeit in Tagen */}
                          <div>
                            <label
                              htmlFor={`punkt-faellig-${index}`}
                              className="mb-1 block text-xs font-medium text-muted-foreground"
                            >
                              Fällig (Tage)
                            </label>
                            <input
                              id={`punkt-faellig-${index}`}
                              type="number"
                              value={
                                item.defaultDueDays !== null &&
                                item.defaultDueDays !== undefined
                                  ? item.defaultDueDays
                                  : ""
                              }
                              onChange={(e) =>
                                handleItemChange(
                                  index,
                                  "defaultDueDays",
                                  e.target.value !== ""
                                    ? parseInt(e.target.value)
                                    : null
                                )
                              }
                              placeholder="z.B. -7"
                              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                            <p className="mt-1 text-xs text-muted-foreground">
                              {modulText.bezugKurz}
                            </p>
                          </div>

                          {/* Zustaendigkeit */}
                          <div>
                            <label
                              htmlFor={`punkt-zustaendig-${index}`}
                              className="mb-1 block text-xs font-medium text-muted-foreground"
                            >
                              Zuständig
                            </label>
                            <select
                              id={`punkt-zustaendig-${index}`}
                              value={item.defaultAssignee}
                              onChange={(e) =>
                                handleItemChange(
                                  index,
                                  "defaultAssignee",
                                  e.target.value
                                )
                              }
                              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                              <option value="">— keine —</option>
                              {unbekannt && (
                                <option value={unbekannt}>
                                  Unbekannt: {unbekannt} (bitte zuordnen)
                                </option>
                              )}
                              <optgroup label="Im Portal">
                                {PORTAL_OPTIONEN.map((opt) => (
                                  <option key={opt.key} value={opt.key}>
                                    {opt.label}
                                  </option>
                                ))}
                              </optgroup>
                              <optgroup label="Per Link">
                                {[...LINK_OPTIONEN, ...eigeneOptionen].map((opt) => (
                                  <option key={opt.key} value={opt.key}>
                                    {opt.label}
                                  </option>
                                ))}
                              </optgroup>
                            </select>
                          </div>
                        </div>

                        {/* Hinweis fuer die zustaendige Stelle */}
                        <div className="mt-3">
                          <label
                            htmlFor={`punkt-hinweis-${index}`}
                            className="mb-1 block text-xs font-medium text-muted-foreground"
                          >
                            Hinweis für die zuständige Stelle (optional)
                          </label>
                          <textarea
                            id={`punkt-hinweis-${index}`}
                            value={item.description}
                            maxLength={CHECKLISTEN_HINWEIS_MAX}
                            onChange={(e) =>
                              handleItemChange(index, "description", e.target.value)
                            }
                            placeholder="z.B. Konto in der Schulverwaltung und in Microsoft 365 anlegen"
                            rows={2}
                            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <p className="mt-1 text-right text-xs text-muted-foreground">
                            {item.description.length} / {CHECKLISTEN_HINWEIS_MAX}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 border-t px-6 py-4">
              <button
                onClick={() => setShowModal(false)}
                disabled={saving}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-[#6BAA24] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#5a9120] disabled:opacity-50"
              >
                {saving
                  ? "Speichern..."
                  : modalData.id
                    ? "Aktualisieren"
                    : "Erstellen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
