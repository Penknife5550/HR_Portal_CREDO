"use client";

/**
 * Exit-Interview-Vorlagen – Client Component
 *
 * Admin-Seite zum Verwalten von Exit-Interview-Templates.
 * Zeigt Templates als Karten an und erlaubt Inline-Bearbeitung
 * mit Kategorien, Fragen, Optionen und Reihenfolge.
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

interface TemplateQuestion {
  id: string;
  categoryId: string;
  questionText: string;
  questionType: string;
  isRequired: boolean;
  orderIndex: number;
  options: string[] | null;
  roleFilter: string | null;
  createdAt: string;
}

interface TemplateCategory {
  id: string;
  templateId: string;
  name: string;
  description: string | null;
  orderIndex: number;
  questions: TemplateQuestion[];
  createdAt: string;
}

interface ExitInterviewTemplate {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isDefault: boolean;
  version: number;
  introText: string | null;
  dsgvoText: string | null;
  categories: TemplateCategory[];
  createdAt: string;
  updatedAt: string;
}

// Lokale Editier-Typen (ohne IDs, für den Editor-State)
interface EditQuestion {
  questionText: string;
  questionType: string;
  isRequired: boolean;
  orderIndex: number;
  options: string[];
  roleFilter: string;
}

interface EditCategory {
  name: string;
  orderIndex: number;
  questions: EditQuestion[];
}

interface EditTemplate {
  id?: string;
  name: string;
  description: string;
  introText: string;
  dsgvoText: string;
  categories: EditCategory[];
}

// Fragetypen mit deutschen Labels
const QUESTION_TYPE_LABELS: Record<string, string> = {
  RATING_5_STAR: "5-Sterne-Bewertung",
  FREE_TEXT: "Freitext",
  MULTIPLE_CHOICE: "Mehrfachauswahl",
  SINGLE_CHOICE: "Einfachauswahl",
  ENPS: "eNPS",
};

const QUESTION_TYPES = Object.keys(QUESTION_TYPE_LABELS);

// Rollen-Filter-Optionen
const ROLE_FILTER_OPTIONS = [
  { value: "", label: "Alle" },
  { value: "LEHRKRAFT", label: "Lehrkraft" },
  { value: "ERZIEHER", label: "Erzieher/in" },
  { value: "VERWALTUNG", label: "Verwaltung" },
  { value: "SCHULLEITUNG", label: "Schulleitung" },
  { value: "SONSTIGES", label: "Sonstiges" },
];

// Leere Frage erstellen
function createEmptyQuestion(orderIndex: number): EditQuestion {
  return {
    questionText: "",
    questionType: "RATING_5_STAR",
    isRequired: true,
    orderIndex,
    options: [],
    roleFilter: "",
  };
}

// Leere Kategorie erstellen
function createEmptyCategory(orderIndex: number): EditCategory {
  return {
    name: "",
    orderIndex,
    questions: [createEmptyQuestion(0)],
  };
}

// Template von API-Format in Edit-Format konvertieren
function templateToEdit(template: ExitInterviewTemplate): EditTemplate {
  return {
    id: template.id,
    name: template.name,
    description: template.description || "",
    introText: template.introText || "",
    dsgvoText: template.dsgvoText || "",
    categories: template.categories.map((cat) => ({
      name: cat.name,
      orderIndex: cat.orderIndex,
      questions: cat.questions.map((q) => ({
        questionText: q.questionText,
        questionType: q.questionType,
        isRequired: q.isRequired,
        orderIndex: q.orderIndex,
        options: Array.isArray(q.options) ? q.options : [],
        roleFilter: q.roleFilter || "",
      })),
    })),
  };
}

// Gesamtzahl der Fragen im Template zaehlen
function countQuestions(template: ExitInterviewTemplate): number {
  return template.categories.reduce(
    (sum, cat) => sum + cat.questions.length,
    0
  );
}

// =============================================
// Component
// =============================================
export function ExitInterviewVorlagenContent({ user }: { user: User }) {
  const [templates, setTemplates] = useState<ExitInterviewTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Editor-State
  const [editData, setEditData] = useState<EditTemplate | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(
    new Set()
  );

  // =============================================
  // Templates laden
  // =============================================
  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/exit-interview-templates");
      if (!res.ok) {
        throw new Error("Fehler beim Laden der Vorlagen");
      }
      const json = await res.json();
      setTemplates(json.data);
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
  // Editor oeffnen: Bearbeiten
  // =============================================
  function handleEdit(template: ExitInterviewTemplate) {
    setEditData(templateToEdit(template));
    setExpandedCategories(new Set());
    setError(null);
  }

  // =============================================
  // Editor oeffnen: Neu erstellen
  // =============================================
  function handleCreate() {
    setEditData({
      name: "",
      description: "",
      introText: "",
      dsgvoText: "",
      categories: [createEmptyCategory(0)],
    });
    setExpandedCategories(new Set([0]));
    setError(null);
  }

  // =============================================
  // Editor schließen
  // =============================================
  function handleCancel() {
    setEditData(null);
    setExpandedCategories(new Set());
    setError(null);
  }

  // =============================================
  // Kategorie aufklappen / zuklappen
  // =============================================
  function toggleCategory(index: number) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  // =============================================
  // Kategorie hinzufügen
  // =============================================
  function handleAddCategory() {
    if (!editData) return;
    const newIndex = editData.categories.length;
    setEditData({
      ...editData,
      categories: [
        ...editData.categories,
        createEmptyCategory(newIndex),
      ],
    });
    setExpandedCategories((prev) => new Set([...prev, newIndex]));
  }

  // =============================================
  // Kategorie entfernen
  // =============================================
  function handleRemoveCategory(catIdx: number) {
    if (!editData) return;
    if (!confirm(`Kategorie "${editData.categories[catIdx].name || "(ohne Name)"}" wirklich löschen?`)) return;
    setEditData({
      ...editData,
      categories: editData.categories
        .filter((_, i) => i !== catIdx)
        .map((cat, i) => ({ ...cat, orderIndex: i })),
    });
    setExpandedCategories((prev) => {
      const next = new Set<number>();
      for (const idx of prev) {
        if (idx < catIdx) next.add(idx);
        else if (idx > catIdx) next.add(idx - 1);
      }
      return next;
    });
  }

  // =============================================
  // Kategorie verschieben (hoch/runter)
  // =============================================
  function handleMoveCategory(catIdx: number, direction: "up" | "down") {
    if (!editData) return;
    const targetIdx = direction === "up" ? catIdx - 1 : catIdx + 1;
    if (targetIdx < 0 || targetIdx >= editData.categories.length) return;

    const newCategories = [...editData.categories];
    [newCategories[catIdx], newCategories[targetIdx]] = [
      newCategories[targetIdx],
      newCategories[catIdx],
    ];
    setEditData({
      ...editData,
      categories: newCategories.map((cat, i) => ({ ...cat, orderIndex: i })),
    });

    // Expanded-State mitschieben
    setExpandedCategories((prev) => {
      const next = new Set<number>();
      for (const idx of prev) {
        if (idx === catIdx) next.add(targetIdx);
        else if (idx === targetIdx) next.add(catIdx);
        else next.add(idx);
      }
      return next;
    });
  }

  // =============================================
  // Kategorie-Name aendern
  // =============================================
  function handleCategoryNameChange(catIdx: number, name: string) {
    if (!editData) return;
    setEditData({
      ...editData,
      categories: editData.categories.map((cat, i) =>
        i === catIdx ? { ...cat, name } : cat
      ),
    });
  }

  // =============================================
  // Frage hinzufügen
  // =============================================
  function handleAddQuestion(catIdx: number) {
    if (!editData) return;
    setEditData({
      ...editData,
      categories: editData.categories.map((cat, i) =>
        i === catIdx
          ? {
              ...cat,
              questions: [
                ...cat.questions,
                createEmptyQuestion(cat.questions.length),
              ],
            }
          : cat
      ),
    });
  }

  // =============================================
  // Frage entfernen
  // =============================================
  function handleRemoveQuestion(catIdx: number, qIdx: number) {
    if (!editData) return;
    setEditData({
      ...editData,
      categories: editData.categories.map((cat, i) =>
        i === catIdx
          ? {
              ...cat,
              questions: cat.questions
                .filter((_, j) => j !== qIdx)
                .map((q, j) => ({ ...q, orderIndex: j })),
            }
          : cat
      ),
    });
  }

  // =============================================
  // Frage verschieben (hoch/runter)
  // =============================================
  function handleMoveQuestion(
    catIdx: number,
    qIdx: number,
    direction: "up" | "down"
  ) {
    if (!editData) return;
    const cat = editData.categories[catIdx];
    const targetIdx = direction === "up" ? qIdx - 1 : qIdx + 1;
    if (targetIdx < 0 || targetIdx >= cat.questions.length) return;

    const newQuestions = [...cat.questions];
    [newQuestions[qIdx], newQuestions[targetIdx]] = [
      newQuestions[targetIdx],
      newQuestions[qIdx],
    ];

    setEditData({
      ...editData,
      categories: editData.categories.map((c, i) =>
        i === catIdx
          ? {
              ...c,
              questions: newQuestions.map((q, j) => ({
                ...q,
                orderIndex: j,
              })),
            }
          : c
      ),
    });
  }

  // =============================================
  // Frage-Feld aendern
  // =============================================
  function handleQuestionChange(
    catIdx: number,
    qIdx: number,
    field: keyof EditQuestion,
    value: string | boolean | string[]
  ) {
    if (!editData) return;
    setEditData({
      ...editData,
      categories: editData.categories.map((cat, i) =>
        i === catIdx
          ? {
              ...cat,
              questions: cat.questions.map((q, j) =>
                j === qIdx ? { ...q, [field]: value } : q
              ),
            }
          : cat
      ),
    });
  }

  // =============================================
  // Optionen verwalten (für MULTIPLE_CHOICE / SINGLE_CHOICE)
  // =============================================
  function handleAddOption(catIdx: number, qIdx: number) {
    if (!editData) return;
    const q = editData.categories[catIdx].questions[qIdx];
    handleQuestionChange(catIdx, qIdx, "options", [...q.options, ""]);
  }

  function handleRemoveOption(catIdx: number, qIdx: number, optIdx: number) {
    if (!editData) return;
    const q = editData.categories[catIdx].questions[qIdx];
    handleQuestionChange(
      catIdx,
      qIdx,
      "options",
      q.options.filter((_, i) => i !== optIdx)
    );
  }

  function handleOptionChange(
    catIdx: number,
    qIdx: number,
    optIdx: number,
    value: string
  ) {
    if (!editData) return;
    const q = editData.categories[catIdx].questions[qIdx];
    handleQuestionChange(
      catIdx,
      qIdx,
      "options",
      q.options.map((opt, i) => (i === optIdx ? value : opt))
    );
  }

  // =============================================
  // Speichern (Erstellen oder Aktualisieren)
  // =============================================
  async function handleSave() {
    if (!editData) return;

    if (!editData.name.trim()) {
      setError("Name ist ein Pflichtfeld");
      return;
    }

    // Validierung: Mindestens eine Kategorie mit Fragen
    const validCategories = editData.categories.filter(
      (cat) => cat.name.trim() && cat.questions.some((q) => q.questionText.trim())
    );

    if (validCategories.length === 0) {
      setError("Mindestens eine Kategorie mit mindestens einer Frage ist erforderlich");
      return;
    }

    // Optionen-Validierung für Choice-Fragen
    for (const cat of validCategories) {
      for (const q of cat.questions) {
        if (
          (q.questionType === "MULTIPLE_CHOICE" || q.questionType === "SINGLE_CHOICE") &&
          q.options.filter((o) => o.trim()).length < 2
        ) {
          setError(
            `Frage "${q.questionText || "(ohne Text)"}" in Kategorie "${cat.name}" benötigt mindestens 2 Optionen`
          );
          return;
        }
      }
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        name: editData.name.trim(),
        description: editData.description.trim() || null,
        introText: editData.introText.trim() || null,
        dsgvoText: editData.dsgvoText.trim() || null,
        categories: validCategories.map((cat, catIdx) => ({
          name: cat.name.trim(),
          orderIndex: catIdx,
          questions: cat.questions
            .filter((q) => q.questionText.trim())
            .map((q, qIdx) => ({
              questionText: q.questionText.trim(),
              questionType: q.questionType,
              isRequired: q.isRequired,
              orderIndex: qIdx,
              options:
                q.questionType === "MULTIPLE_CHOICE" ||
                q.questionType === "SINGLE_CHOICE"
                  ? q.options.filter((o) => o.trim())
                  : null,
              roleFilter: q.roleFilter || null,
            })),
        })),
      };

      let res: Response;
      if (editData.id) {
        res = await fetch(`/api/exit-interview-templates/${editData.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/exit-interview-templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Fehler beim Speichern");
      }

      setEditData(null);
      setExpandedCategories(new Set());
      await loadTemplates();
      setSuccessMessage(
        editData.id
          ? "Vorlage erfolgreich aktualisiert"
          : "Vorlage erfolgreich erstellt"
      );
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern");
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
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">
              Exit-Interview Vorlagen
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Erstellen und verwalten Sie Fragebogen-Vorlagen für Exit-Interviews
            </p>
          </div>
          {!editData && (
            <button
              onClick={handleCreate}
              className="rounded-lg bg-credo-gruen px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#5a9120]"
            >
              + Neue Vorlage
            </button>
          )}
        </div>

        {/* Erfolgsmeldung */}
        {successMessage && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {successMessage}
          </div>
        )}

        {/* Fehlermeldung */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-2 font-medium underline"
            >
              Schließen
            </button>
          </div>
        )}

        {/* Ladeindikator */}
        {loading && (
          <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
            Vorlagen werden geladen...
          </div>
        )}

        {/* ================================================ */}
        {/* Template-Karten (Übersicht) */}
        {/* ================================================ */}
        {!loading && !editData && (
          <div className="space-y-4">
            {templates.length === 0 && (
              <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
                Keine Vorlagen vorhanden. Erstellen Sie eine neue Vorlage.
              </div>
            )}

            {templates.map((template) => (
              <div
                key={template.id}
                className="cursor-pointer rounded-lg border bg-card p-5 transition-shadow hover:shadow-md"
                onClick={() => handleEdit(template)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-foreground">
                        {template.name}
                      </h3>
                      {template.isDefault && (
                        <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                          Standard
                        </span>
                      )}
                      <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                        v{template.version}
                      </span>
                    </div>
                    {template.description && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {template.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>{template.categories.length} Kategorien</span>
                    <span className="text-border">|</span>
                    <span>{countQuestions(template)} Fragen</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ================================================ */}
        {/* Template-Editor (inline) */}
        {/* ================================================ */}
        {editData && (
          <div className="space-y-6">
            {/* Zurück-Button */}
            <button
              onClick={handleCancel}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Zurück zur Übersicht
            </button>

            {/* Template-Metadaten */}
            <div className="rounded-lg border bg-card p-5 space-y-4">
              <h3 className="text-lg font-semibold text-foreground">
                {editData.id ? "Vorlage bearbeiten" : "Neue Vorlage erstellen"}
              </h3>

              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  Name *
                </label>
                <input autoComplete="off"
                  type="text"
                  value={editData.name}
                  onChange={(e) =>
                    setEditData({ ...editData, name: e.target.value })
                  }
                  placeholder="z.B. Standard Exit-Interview"
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  Beschreibung
                </label>
                <textarea autoComplete="off"
                  value={editData.description}
                  onChange={(e) =>
                    setEditData({ ...editData, description: e.target.value })
                  }
                  placeholder="Optionale Beschreibung der Vorlage"
                  rows={2}
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  Einleitungstext
                </label>
                <textarea autoComplete="off"
                  value={editData.introText}
                  onChange={(e) =>
                    setEditData({ ...editData, introText: e.target.value })
                  }
                  placeholder="Begrüßungstext, der dem Mitarbeiter zu Beginn des Interviews angezeigt wird"
                  rows={3}
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  DSGVO-Hinweis
                </label>
                <textarea autoComplete="off"
                  value={editData.dsgvoText}
                  onChange={(e) =>
                    setEditData({ ...editData, dsgvoText: e.target.value })
                  }
                  placeholder="Datenschutzhinweis, der vor Beginn bestätigt werden muss"
                  rows={3}
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            {/* Kategorien */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground">
                Kategorien & Fragen
              </h3>

              {editData.categories.map((cat, catIdx) => (
                <div
                  key={catIdx}
                  className="rounded-lg border bg-card overflow-hidden"
                >
                  {/* Kategorie-Header */}
                  <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-3">
                    {/* Reorder-Buttons */}
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => handleMoveCategory(catIdx, "up")}
                        disabled={catIdx === 0}
                        className="rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-accent disabled:opacity-30"
                        title="Nach oben"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => handleMoveCategory(catIdx, "down")}
                        disabled={catIdx === editData.categories.length - 1}
                        className="rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-accent disabled:opacity-30"
                        title="Nach unten"
                      >
                        ▼
                      </button>
                    </div>

                    {/* Expand/Collapse */}
                    <button
                      onClick={() => toggleCategory(catIdx)}
                      className="flex items-center gap-2 flex-1 text-left"
                    >
                      <span className="text-sm text-muted-foreground">
                        {expandedCategories.has(catIdx) ? "▾" : "▸"}
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {cat.name || "(Kategorie ohne Name)"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({cat.questions.length}{" "}
                        {cat.questions.length === 1 ? "Frage" : "Fragen"})
                      </span>
                    </button>

                    {/* Kategorie löschen */}
                    <button
                      onClick={() => handleRemoveCategory(catIdx)}
                      className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 transition-colors"
                      title="Kategorie löschen"
                    >
                      Löschen
                    </button>
                  </div>

                  {/* Kategorie-Inhalt (wenn aufgeklappt) */}
                  {expandedCategories.has(catIdx) && (
                    <div className="p-4 space-y-4">
                      {/* Kategorie-Name */}
                      <div>
                        <label className="mb-1 block text-sm font-medium text-foreground">
                          Kategoriename *
                        </label>
                        <input autoComplete="off"
                          type="text"
                          value={cat.name}
                          onChange={(e) =>
                            handleCategoryNameChange(catIdx, e.target.value)
                          }
                          placeholder="z.B. Arbeitsumfeld, Führung, Weiterentwicklung"
                          className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>

                      {/* Fragen */}
                      <div className="space-y-3">
                        {cat.questions.map((q, qIdx) => (
                          <div
                            key={qIdx}
                            className="rounded-lg border border-border bg-muted/30 p-4 space-y-3"
                          >
                            {/* Frage-Header mit Reorder + Löschen */}
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-muted-foreground">
                                Frage {qIdx + 1}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() =>
                                    handleMoveQuestion(catIdx, qIdx, "up")
                                  }
                                  disabled={qIdx === 0}
                                  className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent disabled:opacity-30"
                                  title="Nach oben"
                                >
                                  ▲
                                </button>
                                <button
                                  onClick={() =>
                                    handleMoveQuestion(catIdx, qIdx, "down")
                                  }
                                  disabled={qIdx === cat.questions.length - 1}
                                  className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent disabled:opacity-30"
                                  title="Nach unten"
                                >
                                  ▼
                                </button>
                                <button
                                  onClick={() =>
                                    handleRemoveQuestion(catIdx, qIdx)
                                  }
                                  className="rounded px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 transition-colors"
                                  title="Frage löschen"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>

                            {/* Fragetext */}
                            <div>
                              <label className="mb-1 block text-sm text-muted-foreground">
                                Fragetext *
                              </label>
                              <input autoComplete="off"
                                type="text"
                                value={q.questionText}
                                onChange={(e) =>
                                  handleQuestionChange(
                                    catIdx,
                                    qIdx,
                                    "questionText",
                                    e.target.value
                                  )
                                }
                                placeholder="z.B. Wie zufrieden waren Sie mit Ihrem Arbeitsumfeld?"
                                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                              />
                            </div>

                            {/* Fragetyp + Pflichtfeld + Rollenfilter */}
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                              <div>
                                <label className="mb-1 block text-sm text-muted-foreground">
                                  Fragetyp
                                </label>
                                <select autoComplete="off"
                                  value={q.questionType}
                                  onChange={(e) =>
                                    handleQuestionChange(
                                      catIdx,
                                      qIdx,
                                      "questionType",
                                      e.target.value
                                    )
                                  }
                                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                >
                                  {QUESTION_TYPES.map((type) => (
                                    <option key={type} value={type}>
                                      {QUESTION_TYPE_LABELS[type]}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="mb-1 block text-sm text-muted-foreground">
                                  Pflichtfeld
                                </label>
                                <button
                                  onClick={() =>
                                    handleQuestionChange(
                                      catIdx,
                                      qIdx,
                                      "isRequired",
                                      !q.isRequired
                                    )
                                  }
                                  className={`w-full rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                                    q.isRequired
                                      ? "border-green-300 bg-green-50 text-green-800"
                                      : "border-input bg-background text-muted-foreground"
                                  }`}
                                >
                                  {q.isRequired ? "Ja (Pflicht)" : "Nein (optional)"}
                                </button>
                              </div>

                              <div>
                                <label className="mb-1 block text-sm text-muted-foreground">
                                  Rollenfilter
                                </label>
                                <select autoComplete="off"
                                  value={q.roleFilter}
                                  onChange={(e) =>
                                    handleQuestionChange(
                                      catIdx,
                                      qIdx,
                                      "roleFilter",
                                      e.target.value
                                    )
                                  }
                                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                >
                                  {ROLE_FILTER_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {/* Optionen (nur bei MULTIPLE_CHOICE / SINGLE_CHOICE) */}
                            {(q.questionType === "MULTIPLE_CHOICE" ||
                              q.questionType === "SINGLE_CHOICE") && (
                              <div>
                                <label className="mb-1 block text-sm text-muted-foreground">
                                  Antwortoptionen
                                </label>
                                <div className="space-y-2">
                                  {q.options.map((opt, optIdx) => (
                                    <div
                                      key={optIdx}
                                      className="flex items-center gap-2"
                                    >
                                      <span className="text-xs text-muted-foreground w-5 text-right">
                                        {optIdx + 1}.
                                      </span>
                                      <input autoComplete="off"
                                        type="text"
                                        value={opt}
                                        onChange={(e) =>
                                          handleOptionChange(
                                            catIdx,
                                            qIdx,
                                            optIdx,
                                            e.target.value
                                          )
                                        }
                                        placeholder={`Option ${optIdx + 1}`}
                                        className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                      />
                                      <button
                                        onClick={() =>
                                          handleRemoveOption(catIdx, qIdx, optIdx)
                                        }
                                        className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                                        title="Option entfernen"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ))}
                                  <button
                                    onClick={() => handleAddOption(catIdx, qIdx)}
                                    className="rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
                                  >
                                    + Option hinzufügen
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}

                        {/* Neue Frage Button */}
                        <button
                          onClick={() => handleAddQuestion(catIdx)}
                          className="w-full rounded-lg border border-dashed border-border py-2.5 text-sm text-muted-foreground hover:bg-accent transition-colors"
                        >
                          + Neue Frage
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Neue Kategorie Button */}
              <button
                onClick={handleAddCategory}
                className="w-full rounded-lg border border-dashed border-border bg-card py-3 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
              >
                + Neue Kategorie
              </button>
            </div>

            {/* Aktions-Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={handleCancel}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-credo-gruen px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#5a9120] disabled:opacity-50"
              >
                {saving ? "Wird gespeichert..." : "Speichern"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
