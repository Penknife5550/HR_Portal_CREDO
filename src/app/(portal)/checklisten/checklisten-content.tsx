"use client";

/**
 * Checklisten-Vorlagen – Client Component
 *
 * Zeigt alle Checklisten-Vorlagen als Karten an.
 * SUPER_ADMIN und HR_LEITUNG koennen Vorlagen erstellen, bearbeiten und loeschen.
 * Items werden nach Kategorie gruppiert und sind aufklappbar.
 */

import { useEffect, useState, useCallback } from "react";
import { PortalHeader } from "@/components/portal-header";

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

interface NewItem {
  title: string;
  category: string;
  orderIndex: number;
  defaultDueDays: number | null;
  defaultAssignee: string;
}

interface ModalData {
  id?: string;
  name: string;
  description: string;
  questionnaireType: string;
  items: NewItem[];
}

// Lesbare Labels fuer QuestionnaireType
const TYPE_LABELS: Record<string, string> = {
  STANDARD: "Standard",
  BEAMTE: "Beamte",
  ERZIEHER: "Erzieher",
  MINIJOB: "Minijob",
  EHRENAMT: "Ehrenamt",
};

// Farben fuer QuestionnaireType-Badges
const TYPE_COLORS: Record<string, string> = {
  STANDARD: "bg-blue-100 text-blue-800",
  BEAMTE: "bg-purple-100 text-purple-800",
  ERZIEHER: "bg-green-100 text-green-800",
  MINIJOB: "bg-amber-100 text-amber-800",
  EHRENAMT: "bg-rose-100 text-rose-800",
};

// Kategorie-Vorschlaege
const CATEGORY_SUGGESTIONS = [
  "Vor Arbeitsbeginn",
  "Erster Arbeitstag",
  "Erste Woche",
  "Dokumente",
  "IT-Einrichtung",
  "Verwaltung",
];

// Leeres Item
function createEmptyItem(orderIndex: number): NewItem {
  return {
    title: "",
    category: "",
    orderIndex,
    defaultDueDays: null,
    defaultAssignee: "",
  };
}

// =============================================
// Component
// =============================================
export function ChecklistenContent({ user }: { user: User }) {
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Aufklapp-State fuer Kategorien (templateId -> Set<category>)
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

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

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
  // Modal oeffnen: Neu erstellen
  // =============================================
  function handleCreate() {
    setModalData({
      name: "",
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
        title: item.title,
        category: item.category,
        orderIndex: item.orderIndex,
        defaultDueDays: item.defaultDueDays,
        defaultAssignee: item.defaultAssignee || "",
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
  // =============================================
  async function handleSave() {
    if (!modalData.name.trim()) {
      setError("Name ist ein Pflichtfeld");
      return;
    }

    const validItems = modalData.items.filter(
      (item) => item.title.trim() && item.category.trim()
    );
    if (validItems.length === 0) {
      setError("Mindestens ein Checklisten-Punkt mit Titel und Kategorie ist erforderlich");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (modalData.id) {
        // Bearbeiten: Template updaten + Items komplett ersetzen
        // 1. Template-Metadaten updaten
        const templateRes = await fetch(`/api/checklisten/${modalData.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: modalData.name.trim(),
            description: modalData.description.trim() || null,
            questionnaireType: modalData.questionnaireType || null,
          }),
        });
        if (!templateRes.ok) {
          const json = await templateRes.json();
          throw new Error(json.error || "Fehler beim Speichern");
        }

        // 2. Bestehende Items loeschen
        const existingTemplate = templates.find((t) => t.id === modalData.id);
        if (existingTemplate) {
          for (const item of existingTemplate.items) {
            await fetch(
              `/api/checklisten/${modalData.id}/items?itemId=${item.id}`,
              { method: "DELETE" }
            );
          }
        }

        // 3. Neue Items anlegen
        for (const item of validItems) {
          await fetch(`/api/checklisten/${modalData.id}/items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: item.title.trim(),
              category: item.category.trim(),
              orderIndex: item.orderIndex,
              defaultDueDays: item.defaultDueDays,
              defaultAssignee: item.defaultAssignee?.trim() || null,
            }),
          });
        }

        setSuccessMessage("Checkliste erfolgreich aktualisiert");
      } else {
        // Neu erstellen
        const res = await fetch("/api/checklisten", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: modalData.name.trim(),
            description: modalData.description.trim() || null,
            questionnaireType: modalData.questionnaireType || null,
            items: validItems.map((item) => ({
              title: item.title.trim(),
              category: item.category.trim(),
              orderIndex: item.orderIndex,
              defaultDueDays: item.defaultDueDays,
              defaultAssignee: item.defaultAssignee?.trim() || null,
            })),
          }),
        });

        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error || "Fehler beim Erstellen");
        }

        setSuccessMessage("Checkliste erfolgreich erstellt");
      }

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
  // Vorlage loeschen
  // =============================================
  async function handleDelete(template: ChecklistTemplate) {
    if (!confirm(`Checkliste "${template.name}" wirklich loeschen?`)) {
      return;
    }

    setDeleting(template.id);
    try {
      const res = await fetch(`/api/checklisten/${template.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Fehler beim Loeschen");
      }

      await loadTemplates();
      setSuccessMessage(`Checkliste "${template.name}" geloescht`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Fehler beim Loeschen"
      );
    } finally {
      setDeleting(null);
    }
  }

  // =============================================
  // Render: Faelligkeitstage formatieren
  // =============================================
  function formatDueDays(days: number | null): string {
    if (days === null || days === undefined) return "-";
    if (days < 0) return `${Math.abs(days)} Tage vorher`;
    if (days === 0) return "Am Vertragsbeginn";
    return `${days} Tage danach`;
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
              Erstellen und verwalten Sie Checklisten fuer den Onboarding-Prozess
            </p>
          </div>
          {canEdit && (
            <button
              onClick={handleCreate}
              className="rounded-lg bg-[#6BAA24] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#5a9120]"
            >
              + Neue Checkliste
            </button>
          )}
        </div>

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

        {/* Fehlermeldung */}
        {error && (
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
        {loading && (
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
        {!loading && templates.length === 0 && !error && (
          <div className="rounded-xl border bg-card p-8 text-center shadow-sm">
            <p className="text-muted-foreground">
              Keine Checklisten-Vorlagen gefunden.
            </p>
            {canEdit && (
              <button
                onClick={handleCreate}
                className="mt-4 rounded-lg bg-[#6BAA24] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#5a9120]"
              >
                Erste Checkliste erstellen
              </button>
            )}
          </div>
        )}

        {/* Template-Karten */}
        {!loading && templates.length > 0 && (
          <div className="space-y-6">
            {templates.map((template) => {
              const groups = groupByCategory(template.items);
              const categories = getUniqueCategories(template.items);
              const categoryCount = categories.length;

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
                            {deleting === template.id ? "..." : "Loeschen"}
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
                                  {items.map((item) => (
                                    <div
                                      key={item.id}
                                      className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted/50"
                                    >
                                      <span className="text-foreground">
                                        {item.title}
                                      </span>
                                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                        {item.defaultAssignee && (
                                          <span className="rounded-full bg-[#009AC6]/10 px-2 py-0.5 text-[#009AC6]">
                                            {item.defaultAssignee}
                                          </span>
                                        )}
                                        <span>
                                          {formatDueDays(item.defaultDueDays)}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
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
                        Verwendet in {template._count.onboardings} Onboarding-Vorgang/Vorgaengen
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

              {/* Fragebogentyp */}
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

              {/* Info-Box */}
              <div className="mb-4 rounded-lg border border-[#009AC6]/20 bg-[#009AC6]/5 p-3">
                <p className="text-xs text-[#009AC6]">
                  Fuegen Sie Checklisten-Punkte hinzu. Jeder Punkt benoetigt einen
                  Titel und eine Kategorie. Optional koennen Sie Faelligkeitstage
                  (relativ zum Vertragsbeginn) und einen Verantwortlichen festlegen.
                </p>
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
                    + Punkt hinzufuegen
                  </button>
                </div>

                <div className="space-y-3">
                  {modalData.items.map((item, index) => (
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

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {/* Titel */}
                        <div>
                          <input
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
                          <input
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
                            {CATEGORY_SUGGESTIONS.map((cat) => (
                              <option key={cat} value={cat} />
                            ))}
                          </datalist>
                        </div>

                        {/* Faelligkeitstage */}
                        <div>
                          <input
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
                            placeholder="Faelligkeitstage (z.B. -7)"
                            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>

                        {/* Verantwortlicher */}
                        <div>
                          <input
                            type="text"
                            value={item.defaultAssignee}
                            onChange={(e) =>
                              handleItemChange(
                                index,
                                "defaultAssignee",
                                e.target.value
                              )
                            }
                            placeholder="Verantwortlicher (z.B. HR, IT)"
                            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
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
