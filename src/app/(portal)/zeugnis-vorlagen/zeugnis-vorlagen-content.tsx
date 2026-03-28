"use client";

/**
 * Zeugnis-Bewertungsbögen – Admin-Verwaltung (Client Component)
 *
 * Zeigt alle Zeugnis-Bewertungsvorlagen nach Berufsgruppe (Job Group).
 * SUPER_ADMIN und HR_LEITUNG koennen Kategorien, Kriterien und
 * Formulierungen bearbeiten.
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

interface Criterion {
  id?: string;
  categoryId?: string;
  name: string;
  description: string | null;
  weight: number;
  orderIndex: number;
}

interface Category {
  id?: string;
  templateId?: string;
  name: string;
  description: string | null;
  weight: number;
  orderIndex: number;
  criteria: Criterion[];
}

interface Formulierung {
  id?: string;
  templateId?: string;
  criterionKey: string;
  grade: number;
  formulation: string;
}

interface ZeugnisTemplate {
  id: string;
  name: string;
  jobGroup: string;
  description: string | null;
  isActive: boolean;
  version: number;
  categories: Category[];
  formulierungen: Formulierung[];
  createdAt: string;
  updatedAt: string;
}

// =============================================
// Konstanten
// =============================================
type JobGroup = "LEHRKRAFT" | "ERZIEHER" | "VERWALTUNG" | "SCHULLEITUNG" | "SONSTIGES";

const JOB_GROUP_TABS: { key: JobGroup; label: string }[] = [
  { key: "LEHRKRAFT", label: "Lehrkraft" },
  { key: "ERZIEHER", label: "Erzieher/in" },
  { key: "VERWALTUNG", label: "Verwaltung" },
  { key: "SCHULLEITUNG", label: "Schulleitung" },
  { key: "SONSTIGES", label: "Sonstiges Personal" },
];

const GRADE_LABELS: Record<number, string> = {
  1: "Sehr gut",
  2: "Gut",
  3: "Befriedigend",
  4: "Ausreichend",
  5: "Mangelhaft",
  6: "Ungenügend",
};

// =============================================
// Hilfsfunktionen
// =============================================

/** Berechnet die prozentuale Gewichtung einer Kategorie */
function categoryPercentage(category: Category, allCategories: Category[]): number {
  const total = allCategories.reduce((sum, c) => sum + c.weight, 0);
  if (total === 0) return 0;
  return (category.weight / total) * 100;
}

/** Prueft ob die Gewichtungen ausgewogen sind */
function getWeightWarning(categories: Category[]): string | null {
  if (categories.length === 0) return null;
  const total = categories.reduce((sum, c) => sum + c.weight, 0);
  if (total === 0) return "Alle Gewichtungen sind 0. Bitte setzen Sie mindestens eine Gewichtung.";
  const percentages = categories.map((c) => (c.weight / total) * 100);
  const max = Math.max(...percentages);
  const min = Math.min(...percentages);
  if (max - min > 60) {
    return "Hinweis: Die Gewichtungen sind stark unausgewogen. Bitte prüfen Sie die Verteilung.";
  }
  return null;
}

// =============================================
// Component
// =============================================
export function ZeugnisVorlagenContent({ user }: { user: User }) {
  const [templates, setTemplates] = useState<ZeugnisTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<JobGroup>("LEHRKRAFT");
  const [saving, setSaving] = useState(false);

  // Lokaler Bearbeitungszustand pro Template (templateId -> editierte Daten)
  const [editState, setEditState] = useState<Record<string, {
    name: string;
    description: string;
    categories: Category[];
    formulierungen: Formulierung[];
    dirty: boolean;
  }>>({});

  // Aufgeklappte Kategorien (templateId -> Set<orderIndex>)
  const [expandedCategories, setExpandedCategories] = useState<Record<string, Set<number>>>({});

  // Formulierungen-Sektion aufgeklappt (pro templateId)
  const [formulierungenExpanded, setFormulierungenExpanded] = useState<Record<string, boolean>>({});

  // =============================================
  // Daten laden
  // =============================================
  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/zeugnis-templates?includeInactive=false");
      if (!res.ok) throw new Error("Fehler beim Laden der Zeugnis-Vorlagen");
      const json = await res.json();
      setTemplates(json.data);

      // Edit-State initialisieren
      const newEditState: typeof editState = {};
      for (const t of json.data as ZeugnisTemplate[]) {
        newEditState[t.id] = {
          name: t.name,
          description: t.description || "",
          categories: t.categories.map((c) => ({
            ...c,
            criteria: c.criteria.map((cr) => ({ ...cr })),
          })),
          formulierungen: t.formulierungen.map((f) => ({ ...f })),
          dirty: false,
        };
      }
      setEditState(newEditState);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // =============================================
  // Aktuelles Template fuer den aktiven Tab
  // =============================================
  const currentTemplate = templates.find((t) => t.jobGroup === activeTab);
  const currentEdit = currentTemplate ? editState[currentTemplate.id] : null;

  // =============================================
  // Edit-Helfer
  // =============================================
  function updateEdit(templateId: string, updater: (prev: typeof editState[string]) => typeof editState[string]) {
    setEditState((prev) => {
      const current = prev[templateId];
      if (!current) return prev;
      const updated = updater(current);
      return { ...prev, [templateId]: { ...updated, dirty: true } };
    });
  }

  // Template-Meta
  function handleNameChange(templateId: string, name: string) {
    updateEdit(templateId, (prev) => ({ ...prev, name }));
  }

  function handleDescriptionChange(templateId: string, description: string) {
    updateEdit(templateId, (prev) => ({ ...prev, description }));
  }

  // Kategorien
  function handleCategoryNameChange(templateId: string, catIndex: number, name: string) {
    updateEdit(templateId, (prev) => {
      const categories = [...prev.categories];
      categories[catIndex] = { ...categories[catIndex], name };
      return { ...prev, categories };
    });
  }

  function handleCategoryWeightChange(templateId: string, catIndex: number, weight: number) {
    updateEdit(templateId, (prev) => {
      const categories = [...prev.categories];
      categories[catIndex] = { ...categories[catIndex], weight };
      return { ...prev, categories };
    });
  }

  function handleAddCategory(templateId: string) {
    updateEdit(templateId, (prev) => {
      const newCat: Category = {
        name: "",
        description: null,
        weight: 1.0,
        orderIndex: prev.categories.length,
        criteria: [],
      };
      return { ...prev, categories: [...prev.categories, newCat] };
    });
    // Neue Kategorie automatisch aufklappen
    setExpandedCategories((prev) => {
      const current = prev[templateId] || new Set<number>();
      const next = new Set(current);
      const newIndex = currentEdit ? currentEdit.categories.length : 0;
      next.add(newIndex);
      return { ...prev, [templateId]: next };
    });
  }

  function handleDeleteCategory(templateId: string, catIndex: number) {
    updateEdit(templateId, (prev) => {
      const categories = prev.categories
        .filter((_, i) => i !== catIndex)
        .map((c, i) => ({ ...c, orderIndex: i }));
      return { ...prev, categories };
    });
  }

  function handleMoveCategoryUp(templateId: string, catIndex: number) {
    if (catIndex === 0) return;
    updateEdit(templateId, (prev) => {
      const categories = [...prev.categories];
      [categories[catIndex - 1], categories[catIndex]] = [categories[catIndex], categories[catIndex - 1]];
      return { ...prev, categories: categories.map((c, i) => ({ ...c, orderIndex: i })) };
    });
  }

  function handleMoveCategoryDown(templateId: string, catIndex: number) {
    updateEdit(templateId, (prev) => {
      if (catIndex >= prev.categories.length - 1) return prev;
      const categories = [...prev.categories];
      [categories[catIndex], categories[catIndex + 1]] = [categories[catIndex + 1], categories[catIndex]];
      return { ...prev, categories: categories.map((c, i) => ({ ...c, orderIndex: i })) };
    });
  }

  // Kriterien
  function handleCriterionNameChange(templateId: string, catIndex: number, critIndex: number, name: string) {
    updateEdit(templateId, (prev) => {
      const categories = [...prev.categories];
      const criteria = [...categories[catIndex].criteria];
      criteria[critIndex] = { ...criteria[critIndex], name };
      categories[catIndex] = { ...categories[catIndex], criteria };
      return { ...prev, categories };
    });
  }

  function handleCriterionWeightChange(templateId: string, catIndex: number, critIndex: number, weight: number) {
    updateEdit(templateId, (prev) => {
      const categories = [...prev.categories];
      const criteria = [...categories[catIndex].criteria];
      criteria[critIndex] = { ...criteria[critIndex], weight };
      categories[catIndex] = { ...categories[catIndex], criteria };
      return { ...prev, categories };
    });
  }

  function handleCriterionDescriptionChange(templateId: string, catIndex: number, critIndex: number, description: string) {
    updateEdit(templateId, (prev) => {
      const categories = [...prev.categories];
      const criteria = [...categories[catIndex].criteria];
      criteria[critIndex] = { ...criteria[critIndex], description: description || null };
      categories[catIndex] = { ...categories[catIndex], criteria };
      return { ...prev, categories };
    });
  }

  function handleAddCriterion(templateId: string, catIndex: number) {
    updateEdit(templateId, (prev) => {
      const categories = [...prev.categories];
      const criteria = [...categories[catIndex].criteria];
      criteria.push({
        name: "",
        description: null,
        weight: 1.0,
        orderIndex: criteria.length,
      });
      categories[catIndex] = { ...categories[catIndex], criteria };
      return { ...prev, categories };
    });
  }

  function handleDeleteCriterion(templateId: string, catIndex: number, critIndex: number) {
    updateEdit(templateId, (prev) => {
      const categories = [...prev.categories];
      const criteria = categories[catIndex].criteria
        .filter((_, i) => i !== critIndex)
        .map((cr, i) => ({ ...cr, orderIndex: i }));
      categories[catIndex] = { ...categories[catIndex], criteria };
      return { ...prev, categories };
    });
  }

  function handleMoveCriterionUp(templateId: string, catIndex: number, critIndex: number) {
    if (critIndex === 0) return;
    updateEdit(templateId, (prev) => {
      const categories = [...prev.categories];
      const criteria = [...categories[catIndex].criteria];
      [criteria[critIndex - 1], criteria[critIndex]] = [criteria[critIndex], criteria[critIndex - 1]];
      categories[catIndex] = {
        ...categories[catIndex],
        criteria: criteria.map((cr, i) => ({ ...cr, orderIndex: i })),
      };
      return { ...prev, categories };
    });
  }

  function handleMoveCriterionDown(templateId: string, catIndex: number, critIndex: number) {
    updateEdit(templateId, (prev) => {
      const categories = [...prev.categories];
      const criteria = [...categories[catIndex].criteria];
      if (critIndex >= criteria.length - 1) return prev;
      [criteria[critIndex], criteria[critIndex + 1]] = [criteria[critIndex + 1], criteria[critIndex]];
      categories[catIndex] = {
        ...categories[catIndex],
        criteria: criteria.map((cr, i) => ({ ...cr, orderIndex: i })),
      };
      return { ...prev, categories };
    });
  }

  // Formulierungen
  function handleFormulierungChange(templateId: string, criterionKey: string, grade: number, formulation: string) {
    updateEdit(templateId, (prev) => {
      const formulierungen = [...prev.formulierungen];
      const idx = formulierungen.findIndex((f) => f.criterionKey === criterionKey && f.grade === grade);
      if (idx >= 0) {
        formulierungen[idx] = { ...formulierungen[idx], formulation };
      } else {
        formulierungen.push({ criterionKey, grade, formulation });
      }
      return { ...prev, formulierungen };
    });
  }

  function getFormulierung(formulierungen: Formulierung[], criterionKey: string, grade: number): string {
    const f = formulierungen.find((f) => f.criterionKey === criterionKey && f.grade === grade);
    return f?.formulation || "";
  }

  // Kategorie aufklappen
  function toggleCategory(templateId: string, catIndex: number) {
    setExpandedCategories((prev) => {
      const current = prev[templateId] || new Set<number>();
      const next = new Set(current);
      if (next.has(catIndex)) {
        next.delete(catIndex);
      } else {
        next.add(catIndex);
      }
      return { ...prev, [templateId]: next };
    });
  }

  function isCategoryExpanded(templateId: string, catIndex: number): boolean {
    return expandedCategories[templateId]?.has(catIndex) ?? false;
  }

  // =============================================
  // Speichern
  // =============================================
  async function handleSave(templateId: string) {
    const edit = editState[templateId];
    if (!edit) return;

    // Validierung
    if (!edit.name.trim()) {
      setError("Der Vorlagenname darf nicht leer sein.");
      return;
    }
    if (edit.categories.length === 0) {
      setError("Mindestens eine Kategorie ist erforderlich.");
      return;
    }
    for (const cat of edit.categories) {
      if (!cat.name.trim()) {
        setError("Jede Kategorie muss einen Namen haben.");
        return;
      }
      for (const crit of cat.criteria) {
        if (!crit.name.trim()) {
          setError("Jedes Kriterium muss einen Namen haben.");
          return;
        }
      }
    }

    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      const res = await fetch(`/api/zeugnis-templates/${templateId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: edit.name,
          description: edit.description || null,
          categories: edit.categories.map((c, ci) => ({
            name: c.name,
            description: c.description,
            weight: c.weight,
            orderIndex: ci,
            criteria: c.criteria.map((cr, cri) => ({
              name: cr.name,
              description: cr.description,
              weight: cr.weight,
              orderIndex: cri,
            })),
          })),
          formulierungen: edit.formulierungen
            .filter((f) => f.formulation.trim() !== "")
            .map((f) => ({
              criterionKey: f.criterionKey,
              grade: f.grade,
              formulation: f.formulation,
            })),
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Fehler beim Speichern");
      }

      setSuccessMessage("Vorlage erfolgreich gespeichert.");
      // Erneut laden fuer sauberen State
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSaving(false);
    }
  }

  // =============================================
  // Render
  // =============================================
  return (
    <div className="min-h-screen bg-muted">
      <PortalHeader user={user} />

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* Seitentitel */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-foreground">
            Zeugnis-Bewertungsbögen
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Verwalten Sie die Bewertungsvorlagen für Dienstzeugnisse nach Berufsgruppe
          </p>
        </div>

        {/* Tabs: Berufsgruppen */}
        <div className="mb-6 flex border-b border-border overflow-x-auto">
          {JOB_GROUP_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "border-b-2 border-[#6BAA24] text-[#6BAA24]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Erfolgs-/Fehlermeldungen */}
        {successMessage && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            {successMessage}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Ladezustand */}
        {loading && (
          <div className="py-12 text-center text-muted-foreground">
            Lade Bewertungsvorlagen...
          </div>
        )}

        {/* Kein Template fuer diese Berufsgruppe */}
        {!loading && !currentTemplate && (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <p className="text-muted-foreground">
              Keine Bewertungsvorlage für &quot;{JOB_GROUP_TABS.find((t) => t.key === activeTab)?.label}&quot; vorhanden.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Erstellen Sie eine Vorlage über die API (POST /api/zeugnis-templates).
            </p>
          </div>
        )}

        {/* Template Editor */}
        {!loading && currentTemplate && currentEdit && (
          <div className="space-y-6">
            {/* Template-Meta */}
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-foreground">Vorlagen-Details</h3>
                <span className="text-xs text-muted-foreground">
                  Version {currentTemplate.version}
                </span>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Vorlagenname
                  </label>
                  <input autoComplete="off"
                    type="text"
                    value={currentEdit.name}
                    onChange={(e) => handleNameChange(currentTemplate.id, e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-[#6BAA24] focus:outline-none focus:ring-1 focus:ring-[#6BAA24]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Beschreibung
                  </label>
                  <textarea autoComplete="off"
                    value={currentEdit.description}
                    onChange={(e) => handleDescriptionChange(currentTemplate.id, e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-[#6BAA24] focus:outline-none focus:ring-1 focus:ring-[#6BAA24]"
                    placeholder="Optionale Beschreibung der Vorlage..."
                  />
                </div>
              </div>
            </div>

            {/* Gewichtungswarnung */}
            {getWeightWarning(currentEdit.categories) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {getWeightWarning(currentEdit.categories)}
              </div>
            )}

            {/* Kategorien */}
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-foreground">
                  Kategorien ({currentEdit.categories.length})
                </h3>
                <button
                  onClick={() => handleAddCategory(currentTemplate.id)}
                  className="rounded-lg bg-[#6BAA24] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#5a9120]"
                >
                  + Neue Kategorie
                </button>
              </div>

              {currentEdit.categories.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Noch keine Kategorien vorhanden.
                </p>
              )}

              <div className="space-y-3">
                {currentEdit.categories.map((category, catIndex) => {
                  const expanded = isCategoryExpanded(currentTemplate.id, catIndex);
                  const pct = categoryPercentage(category, currentEdit.categories);
                  return (
                    <div
                      key={catIndex}
                      className="rounded-lg border border-border bg-background"
                    >
                      {/* Kategorie-Header */}
                      <div className="flex items-center gap-3 p-3">
                        {/* Expand Toggle */}
                        <button
                          onClick={() => toggleCategory(currentTemplate.id, catIndex)}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted transition-colors"
                          title={expanded ? "Zuklappen" : "Aufklappen"}
                        >
                          <svg
                            className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>

                        {/* Kategoriename */}
                        <input autoComplete="off"
                          type="text"
                          value={category.name}
                          onChange={(e) => handleCategoryNameChange(currentTemplate.id, catIndex, e.target.value)}
                          placeholder="Kategoriename..."
                          className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm font-medium text-foreground focus:border-[#6BAA24] focus:outline-none focus:ring-1 focus:ring-[#6BAA24]"
                        />

                        {/* Gewichtung */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <label className="text-xs text-muted-foreground">Gewicht:</label>
                          <input autoComplete="off"
                            type="number"
                            value={category.weight}
                            onChange={(e) => handleCategoryWeightChange(currentTemplate.id, catIndex, parseFloat(e.target.value) || 0)}
                            step="0.5"
                            min="0"
                            className="w-16 rounded border border-border bg-background px-2 py-1 text-sm text-center text-foreground focus:border-[#6BAA24] focus:outline-none focus:ring-1 focus:ring-[#6BAA24]"
                          />
                        </div>

                        {/* Prozent-Anzeige */}
                        <div className="flex items-center gap-1.5 shrink-0 w-24">
                          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#6BAA24] transition-all duration-300"
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-10 text-right">
                            {pct.toFixed(0)}%
                          </span>
                        </div>

                        {/* Aktionen */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleMoveCategoryUp(currentTemplate.id, catIndex)}
                            disabled={catIndex === 0}
                            className="rounded p-1 text-muted-foreground hover:bg-muted transition-colors disabled:opacity-30"
                            title="Nach oben"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleMoveCategoryDown(currentTemplate.id, catIndex)}
                            disabled={catIndex === currentEdit.categories.length - 1}
                            className="rounded p-1 text-muted-foreground hover:bg-muted transition-colors disabled:opacity-30"
                            title="Nach unten"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteCategory(currentTemplate.id, catIndex)}
                            className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                            title="Kategorie löschen"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Kriterien (aufgeklappt) */}
                      {expanded && (
                        <div className="border-t border-border p-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-muted-foreground">
                              Kriterien ({category.criteria.length})
                            </span>
                            <button
                              onClick={() => handleAddCriterion(currentTemplate.id, catIndex)}
                              className="rounded bg-muted px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted/80"
                            >
                              + Neues Kriterium
                            </button>
                          </div>

                          {category.criteria.length === 0 && (
                            <p className="text-xs text-muted-foreground py-2 text-center">
                              Noch keine Kriterien. Fügen Sie das erste Kriterium hinzu.
                            </p>
                          )}

                          <div className="space-y-2">
                            {category.criteria.map((criterion, critIndex) => (
                              <div
                                key={critIndex}
                                className="rounded border border-border bg-card p-3"
                              >
                                <div className="flex items-start gap-3">
                                  {/* Kriteriumname */}
                                  <div className="flex-1 space-y-2">
                                    <input autoComplete="off"
                                      type="text"
                                      value={criterion.name}
                                      onChange={(e) => handleCriterionNameChange(currentTemplate.id, catIndex, critIndex, e.target.value)}
                                      placeholder="Kriteriumname..."
                                      className="w-full rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:border-[#6BAA24] focus:outline-none focus:ring-1 focus:ring-[#6BAA24]"
                                    />
                                    <textarea autoComplete="off"
                                      value={criterion.description || ""}
                                      onChange={(e) => handleCriterionDescriptionChange(currentTemplate.id, catIndex, critIndex, e.target.value)}
                                      placeholder="Hilfetext / Beschreibung (optional)..."
                                      rows={1}
                                      className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-muted-foreground focus:border-[#6BAA24] focus:outline-none focus:ring-1 focus:ring-[#6BAA24]"
                                    />
                                  </div>

                                  {/* Gewichtung */}
                                  <div className="flex items-center gap-1 shrink-0">
                                    <label className="text-xs text-muted-foreground">Gew.:</label>
                                    <input autoComplete="off"
                                      type="number"
                                      value={criterion.weight}
                                      onChange={(e) => handleCriterionWeightChange(currentTemplate.id, catIndex, critIndex, parseFloat(e.target.value) || 0)}
                                      step="0.5"
                                      min="0"
                                      className="w-14 rounded border border-border bg-background px-1.5 py-1 text-xs text-center text-foreground focus:border-[#6BAA24] focus:outline-none focus:ring-1 focus:ring-[#6BAA24]"
                                    />
                                  </div>

                                  {/* Aktionen */}
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <button
                                      onClick={() => handleMoveCriterionUp(currentTemplate.id, catIndex, critIndex)}
                                      disabled={critIndex === 0}
                                      className="rounded p-1 text-muted-foreground hover:bg-muted transition-colors disabled:opacity-30"
                                      title="Nach oben"
                                    >
                                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                                      </svg>
                                    </button>
                                    <button
                                      onClick={() => handleMoveCriterionDown(currentTemplate.id, catIndex, critIndex)}
                                      disabled={critIndex === category.criteria.length - 1}
                                      className="rounded p-1 text-muted-foreground hover:bg-muted transition-colors disabled:opacity-30"
                                      title="Nach unten"
                                    >
                                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                      </svg>
                                    </button>
                                    <button
                                      onClick={() => handleDeleteCriterion(currentTemplate.id, catIndex, critIndex)}
                                      className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                      title="Kriterium löschen"
                                    >
                                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </div>
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

            {/* Formulierungen */}
            <div className="rounded-lg border border-border bg-card">
              <button
                onClick={() =>
                  setFormulierungenExpanded((prev) => ({
                    ...prev,
                    [currentTemplate.id]: !prev[currentTemplate.id],
                  }))
                }
                className="flex w-full items-center justify-between p-5 text-left"
              >
                <h3 className="text-lg font-semibold text-foreground">
                  Formulierungen (Gesamt-Zufriedenheitsformeln)
                </h3>
                <svg
                  className={`h-5 w-5 text-muted-foreground transition-transform ${
                    formulierungenExpanded[currentTemplate.id] ? "rotate-180" : ""
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {formulierungenExpanded[currentTemplate.id] && (
                <div className="border-t border-border p-5">
                  <p className="mb-4 text-sm text-muted-foreground">
                    Standard-Zufriedenheitsformulierungen für die Gesamtnote im Dienstzeugnis.
                    Diese Texte werden automatisch in das generierte Zeugnis eingefügt.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="py-2 px-3 text-left font-medium text-muted-foreground w-20">
                            Note
                          </th>
                          <th className="py-2 px-3 text-left font-medium text-muted-foreground w-28">
                            Bewertung
                          </th>
                          <th className="py-2 px-3 text-left font-medium text-muted-foreground">
                            Formulierung
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {[1, 2, 3, 4, 5, 6].map((grade) => (
                          <tr key={grade} className="border-b border-border last:border-b-0">
                            <td className="py-2 px-3">
                              <span
                                className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white ${
                                  grade <= 2
                                    ? "bg-[#6BAA24]"
                                    : grade === 3
                                      ? "bg-yellow-500"
                                      : grade === 4
                                        ? "bg-orange-500"
                                        : "bg-red-500"
                                }`}
                              >
                                {grade}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-xs text-muted-foreground">
                              {GRADE_LABELS[grade]}
                            </td>
                            <td className="py-2 px-3">
                              <textarea autoComplete="off"
                                value={getFormulierung(currentEdit.formulierungen, "GESAMT", grade)}
                                onChange={(e) =>
                                  handleFormulierungChange(currentTemplate.id, "GESAMT", grade, e.target.value)
                                }
                                rows={2}
                                placeholder={`Formulierung für Note ${grade}...`}
                                className="w-full rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:border-[#6BAA24] focus:outline-none focus:ring-1 focus:ring-[#6BAA24]"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Speichern-Button */}
            <div className="flex items-center justify-between">
              <div>
                {currentEdit.dirty && (
                  <span className="text-sm text-amber-600">
                    Ungespeicherte Änderungen vorhanden
                  </span>
                )}
              </div>
              <button
                onClick={() => handleSave(currentTemplate.id)}
                disabled={saving || !currentEdit.dirty}
                className="rounded-lg bg-[#6BAA24] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#5a9120] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Speichern..." : "Änderungen speichern"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
