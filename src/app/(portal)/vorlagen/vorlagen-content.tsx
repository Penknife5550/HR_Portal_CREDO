"use client";

/**
 * Formularvorlagen – Client Component
 *
 * Zeigt alle Formularvorlagen als Karten an.
 * SUPER_ADMIN und HR_LEITUNG koennen Steps ein-/ausschalten.
 * HR_SACHBEARBEITER sieht eine Read-Only-Ansicht.
 */

import { useEffect, useState, useCallback } from "react";
import {
  SELECTABLE_DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
} from "@/lib/required-documents";
import { useRouter } from "next/navigation";
import { PortalHeader } from "@/components/portal-header";
import { FIELD_REGISTRY, getDefaultFieldConfig, type FieldConfig } from "@/lib/field-definitions";

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

interface StepConfig {
  step: number;
  title: string;
  enabled: boolean;
  fields?: FieldConfig[];
}

interface FormTemplate {
  id: string;
  questionnaireType: string;
  name: string;
  description: string | null;
  stepsConfig: StepConfig[];
  requiredDocuments?: string[];
  isActive: boolean;
  version?: number;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// Steps 1 und 10 sind Pflichtschritte (immer aktiviert)
const MANDATORY_STEPS = [1, 10];

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

// =============================================
// Component
// =============================================
export function VorlagenContent({ user }: { user: User }) {
  const router = useRouter();
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Lokaler State für bearbeitete StepConfigs (pro Template-ID)
  const [editedConfigs, setEditedConfigs] = useState<
    Record<string, StepConfig[]>
  >({});

  // Welcher Schritt ist für Feld-Konfiguration aufgeklappt? "templateId:stepNumber"
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  // Tracking welche Templates gerade gespeichert werden
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  // Erfolgsmeldungen pro Template
  const [successIds, setSuccessIds] = useState<Set<string>>(new Set());

  // Pflicht-Dokumente: editierter Zustand + Save-Tracking (pro Template-ID)
  const [editedRequiredDocs, setEditedRequiredDocs] = useState<
    Record<string, string[]>
  >({});
  const [savingDocsIds, setSavingDocsIds] = useState<Set<string>>(new Set());
  const [successDocsIds, setSuccessDocsIds] = useState<Set<string>>(new Set());

  function getCurrentRequiredDocs(template: FormTemplate): string[] {
    return (
      editedRequiredDocs[template.id] ??
      template.requiredDocuments ?? ["GEBURTSURKUNDE_EIGEN", "GEBURTSURKUNDE_KIND"]
    );
  }

  function toggleRequiredDoc(template: FormTemplate, type: string) {
    const current = getCurrentRequiredDocs(template);
    const next = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    setEditedRequiredDocs((prev) => ({ ...prev, [template.id]: next }));
  }

  function requiredDocsChanged(template: FormTemplate): boolean {
    const edited = editedRequiredDocs[template.id];
    if (!edited) return false;
    const orig = template.requiredDocuments ?? [
      "GEBURTSURKUNDE_EIGEN",
      "GEBURTSURKUNDE_KIND",
    ];
    if (edited.length !== orig.length) return true;
    const a = [...edited].sort();
    const b = [...orig].sort();
    return a.some((t, i) => t !== b[i]);
  }

  async function handleSaveRequiredDocs(templateId: string) {
    const docs = editedRequiredDocs[templateId];
    if (!docs) return;
    setSavingDocsIds((prev) => new Set(prev).add(templateId));
    try {
      const res = await fetch(`/api/vorlagen/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requiredDocuments: docs }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Fehler beim Speichern");
      }
      const updated = await res.json();
      setTemplates((prev) => prev.map((t) => (t.id === templateId ? updated : t)));
      setEditedRequiredDocs((prev) => {
        const next = { ...prev };
        delete next[templateId];
        return next;
      });
      setSuccessDocsIds((prev) => new Set(prev).add(templateId));
      setTimeout(() => {
        setSuccessDocsIds((prev) => {
          const next = new Set(prev);
          next.delete(templateId);
          return next;
        });
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setSavingDocsIds((prev) => {
        const next = new Set(prev);
        next.delete(templateId);
        return next;
      });
    }
  }

  const canEdit =
    user.role === "SUPER_ADMIN" || user.role === "HR_LEITUNG";

  // =============================================
  // Vorlagen laden
  // =============================================
  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/vorlagen");
      if (!res.ok) {
        throw new Error("Fehler beim Laden der Vorlagen");
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
  // Step-Toggle
  // =============================================
  function handleStepToggle(templateId: string, stepNumber: number) {
    // Pflichtschritte koennen nicht deaktiviert werden
    if (MANDATORY_STEPS.includes(stepNumber)) return;

    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    // Aktuellen Config-Stand verwenden (editiert oder original)
    const currentConfig =
      editedConfigs[templateId] || [...template.stepsConfig];

    const updatedConfig = currentConfig.map((s) =>
      s.step === stepNumber ? { ...s, enabled: !s.enabled } : { ...s }
    );

    setEditedConfigs((prev) => ({
      ...prev,
      [templateId]: updatedConfig,
    }));

    // Erfolgsmeldung zuruecksetzen wenn erneut bearbeitet
    setSuccessIds((prev) => {
      const next = new Set(prev);
      next.delete(templateId);
      return next;
    });
  }

  // =============================================
  // Feld-Toggle (sichtbar/pflicht)
  // =============================================
  function handleFieldToggle(
    templateId: string,
    stepNumber: number,
    fieldName: string,
    property: "visible" | "required"
  ) {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    const currentConfig = editedConfigs[templateId] || template.stepsConfig.map((s) => ({ ...s }));
    const stepConfig = currentConfig.find((s) => s.step === stepNumber);
    if (!stepConfig) return;

    // Felder initialisieren falls noch nicht vorhanden
    if (!stepConfig.fields) {
      stepConfig.fields = getDefaultFieldConfig(stepNumber);
    }

    // Feld-Definition pruefen (alwaysVisible/alwaysRequired)
    const definition = FIELD_REGISTRY[stepNumber]?.find((d) => d.name === fieldName);
    if (property === "visible" && definition?.alwaysVisible) return;
    if (property === "required" && definition?.alwaysRequired) return;

    const field = stepConfig.fields.find((f) => f.name === fieldName);
    if (!field) return;

    if (property === "visible") {
      field.visible = !field.visible;
      // Wenn ausgeblendet, auch required deaktivieren
      if (!field.visible) field.required = false;
    } else {
      field.required = !field.required;
    }

    setEditedConfigs((prev) => ({ ...prev, [templateId]: [...currentConfig] }));
    setSuccessIds((prev) => { const next = new Set(prev); next.delete(templateId); return next; });
  }

  // =============================================
  // Pruefen ob Aenderungen vorliegen
  // =============================================
  function hasChanges(templateId: string): boolean {
    const edited = editedConfigs[templateId];
    if (!edited) return false;

    const template = templates.find((t) => t.id === templateId);
    if (!template) return false;

    // Step-Level pruefen (enabled)
    const stepChanged = edited.some((editedStep, index) => {
      const originalStep = template.stepsConfig[index];
      return originalStep && editedStep.enabled !== originalStep.enabled;
    });
    if (stepChanged) return true;

    // Feld-Level pruefen
    return edited.some((editedStep) => {
      if (!editedStep.fields) return false;
      const originalStep = template.stepsConfig.find((s) => s.step === editedStep.step);
      const originalFields = originalStep?.fields ?? getDefaultFieldConfig(editedStep.step);
      return editedStep.fields.some((ef) => {
        const of = originalFields.find((f) => f.name === ef.name);
        return of && (ef.visible !== of.visible || ef.required !== of.required);
      });
    });
  }

  // =============================================
  // Speichern
  // =============================================
  async function handleSave(templateId: string) {
    const config = editedConfigs[templateId];
    if (!config) return;

    setSavingIds((prev) => new Set(prev).add(templateId));

    try {
      const res = await fetch(`/api/vorlagen/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepsConfig: config }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Fehler beim Speichern");
      }

      const updated = await res.json();

      // Template in der Liste aktualisieren
      setTemplates((prev) =>
        prev.map((t) => (t.id === templateId ? updated : t))
      );

      // Editierten State zuruecksetzen
      setEditedConfigs((prev) => {
        const next = { ...prev };
        delete next[templateId];
        return next;
      });

      // Erfolgsmeldung anzeigen
      setSuccessIds((prev) => new Set(prev).add(templateId));
      setTimeout(() => {
        setSuccessIds((prev) => {
          const next = new Set(prev);
          next.delete(templateId);
          return next;
        });
      }, 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Fehler beim Speichern"
      );
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(templateId);
        return next;
      });
    }
  }

  // =============================================
  // Aenderungen verwerfen
  // =============================================
  function handleDiscard(templateId: string) {
    setEditedConfigs((prev) => {
      const next = { ...prev };
      delete next[templateId];
      return next;
    });
  }

  // =============================================
  // Aktuelle Steps für ein Template
  // =============================================
  function getCurrentSteps(template: FormTemplate): StepConfig[] {
    return editedConfigs[template.id] || template.stepsConfig;
  }

  // =============================================
  // Anzahl aktiver Steps
  // =============================================
  function getActiveStepCount(steps: StepConfig[]): number {
    return steps.filter((s) => s.enabled).length;
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
            Formularvorlagen
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Konfigurieren Sie, welche Fragebogen-Schritte für jeden
            Beschäftigungstyp aktiviert sind.
          </p>
          {!canEdit && (
            <p className="mt-2 text-xs text-amber-600">
              Sie haben nur Leserechte. Wenden Sie sich an einen
              Administrator, um Änderungen vorzunehmen.
            </p>
          )}
        </div>

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
                Vorlagen werden geladen...
              </p>
            </div>
          </div>
        )}

        {/* Keine Vorlagen */}
        {!loading && templates.length === 0 && !error && (
          <div className="rounded-xl border bg-card p-8 text-center shadow-sm">
            <p className="text-muted-foreground">
              Keine Formularvorlagen gefunden. Bitte fuehren Sie das
              Datenbank-Seeding aus.
            </p>
          </div>
        )}

        {/* Template-Karten */}
        {!loading && templates.length > 0 && (
          <div className="space-y-6">
            {templates.map((template) => {
              const steps = getCurrentSteps(template);
              const changed = hasChanges(template.id);
              const saving = savingIds.has(template.id);
              const saved = successIds.has(template.id);
              const activeCount = getActiveStepCount(steps);
              const requiredDocs = getCurrentRequiredDocs(template);
              const docsChanged = requiredDocsChanged(template);
              const docsSaving = savingDocsIds.has(template.id);
              const docsSaved = successDocsIds.has(template.id);

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
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          TYPE_COLORS[template.questionnaireType] ||
                          "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {TYPE_LABELS[template.questionnaireType] ||
                          template.questionnaireType}
                      </span>
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
                      {template.version && (
                        <span className="text-xs text-muted-foreground">
                          v{template.version}
                        </span>
                      )}
                      <span className="text-sm text-muted-foreground">
                        {activeCount} von {steps.length} Schritten
                      </span>
                      {canEdit && (
                        <button
                          onClick={() => router.push(`/vorlagen/vorschau/${template.id}`)}
                          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
                        >
                          Vorschau
                        </button>
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

                  {/* Steps */}
                  <div className="px-6 py-4">
                    <div className="space-y-2">
                      {steps.map((step) => {
                        const isMandatory = MANDATORY_STEPS.includes(step.step);
                        const expandKey = `${template.id}:${step.step}`;
                        const isExpanded = expandedStep === expandKey;
                        const definitions = FIELD_REGISTRY[step.step] ?? [];
                        const fields = step.fields ?? getDefaultFieldConfig(step.step);

                        return (
                          <div key={step.step}>
                            {/* Step-Zeile */}
                            <div
                              className={`flex items-center justify-between rounded-lg px-4 py-3 transition-colors ${
                                step.enabled
                                  ? "bg-white border border-border"
                                  : "bg-muted/50 border border-transparent"
                              } ${isExpanded ? "rounded-b-none" : ""}`}
                            >
                              <div className="flex items-center gap-3">
                                <span
                                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                                    step.enabled
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted-foreground/20 text-muted-foreground"
                                  }`}
                                >
                                  {step.step}
                                </span>
                                <span
                                  className={`text-sm font-medium ${
                                    step.enabled ? "text-foreground" : "text-muted-foreground line-through"
                                  }`}
                                >
                                  {step.title}
                                </span>
                                {isMandatory && (
                                  <span className="text-xs text-muted-foreground">(Pflichtschritt)</span>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                {/* Feld-Konfiguration aufklappen (nur für aktive Steps mit Feldern) */}
                                {step.enabled && definitions.length > 0 && canEdit && (
                                  <button
                                    onClick={() => setExpandedStep(isExpanded ? null : expandKey)}
                                    className="rounded-md border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
                                  >
                                    {isExpanded ? "▲ Felder" : "▼ Felder"}
                                  </button>
                                )}

                                {/* Step-Toggle */}
                                {isMandatory ? (
                                  <span className="text-xs text-muted-foreground">Immer aktiv</span>
                                ) : canEdit ? (
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={step.enabled}
                                    onClick={() => handleStepToggle(template.id, step.step)}
                                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                                      step.enabled ? "bg-primary" : "bg-muted-foreground/30"
                                    }`}
                                  >
                                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform ${
                                      step.enabled ? "translate-x-5" : "translate-x-0"
                                    }`} />
                                  </button>
                                ) : (
                                  <span className={`text-xs font-medium ${step.enabled ? "text-emerald-600" : "text-muted-foreground"}`}>
                                    {step.enabled ? "Aktiviert" : "Deaktiviert"}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Aufklappbare Feld-Konfiguration */}
                            {isExpanded && step.enabled && (
                              <div className="border border-t-0 border-border rounded-b-lg bg-muted/30 px-4 py-3">
                                <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                  Felder in diesem Schritt
                                </p>
                                <div className="space-y-1.5">
                                  {definitions.map((def) => {
                                    const field = fields.find((f) => f.name === def.name);
                                    const isVisible = field?.visible ?? def.defaultVisible;
                                    const isRequired = field?.required ?? def.defaultRequired;

                                    return (
                                      <div
                                        key={def.name}
                                        className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
                                          isVisible ? "bg-white border border-border/50" : "bg-muted/50 opacity-60"
                                        }`}
                                      >
                                        <div className="flex items-center gap-2">
                                          <span className={`font-medium ${isVisible ? "text-foreground" : "text-muted-foreground line-through"}`}>
                                            {def.label}
                                          </span>
                                          {def.alwaysVisible && (
                                            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600">Pflichtfeld</span>
                                          )}
                                          {isRequired && isVisible && !def.alwaysRequired && (
                                            <span className="text-destructive text-xs">*</span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-3">
                                          {/* Sichtbarkeit */}
                                          {!def.alwaysVisible && (
                                            <label className="flex items-center gap-1.5 cursor-pointer">
                                              <input
                                                type="checkbox"
                                                checked={isVisible}
                                                onChange={() => handleFieldToggle(template.id, step.step, def.name, "visible")}
                                                className="h-3.5 w-3.5 rounded border-gray-300"
                                              />
                                              <span className="text-xs text-muted-foreground">Sichtbar</span>
                                            </label>
                                          )}
                                          {/* Pflichtfeld */}
                                          {isVisible && !def.alwaysRequired && (
                                            <label className="flex items-center gap-1.5 cursor-pointer">
                                              <input
                                                type="checkbox"
                                                checked={isRequired}
                                                onChange={() => handleFieldToggle(template.id, step.step, def.name, "required")}
                                                className="h-3.5 w-3.5 rounded border-gray-300"
                                              />
                                              <span className="text-xs text-muted-foreground">Pflicht</span>
                                            </label>
                                          )}
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

                  {/* Pflicht-Dokumente (pro Vorlage konfigurierbar) */}
                  <div className="border-t px-6 py-4">
                    <div className="mb-2 flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">
                          Pflicht-Dokumente
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          Diese Dokumente müssen vor dem Absenden hochgeladen
                          werden. Die Geburtsurkunde(n) der Kinder wird nur
                          verlangt, wenn Kinder angegeben sind.
                        </p>
                      </div>
                      {docsSaved && (
                        <span className="text-xs font-medium text-emerald-600">
                          Gespeichert
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {SELECTABLE_DOCUMENT_TYPES.map((type) => {
                        const active = requiredDocs.includes(type);
                        return (
                          <button
                            key={type}
                            type="button"
                            disabled={!canEdit}
                            onClick={() => toggleRequiredDoc(template, type)}
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
                              active
                                ? "border-credo-blau bg-credo-blau/10 text-credo-blau"
                                : "border-border text-muted-foreground hover:bg-accent"
                            }`}
                          >
                            {active ? "✓ " : ""}
                            {DOCUMENT_TYPE_LABELS[type] ?? type}
                          </button>
                        );
                      })}
                    </div>
                    {canEdit && docsChanged && (
                      <div className="mt-3 flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            setEditedRequiredDocs((prev) => {
                              const next = { ...prev };
                              delete next[template.id];
                              return next;
                            })
                          }
                          disabled={docsSaving}
                          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
                        >
                          Verwerfen
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveRequiredDocs(template.id)}
                          disabled={docsSaving}
                          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                        >
                          {docsSaving ? "Speichern..." : "Pflicht-Dokumente speichern"}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Card Footer (nur bei Aenderungen) */}
                  {canEdit && (changed || saved) && (
                    <div className="flex items-center justify-between border-t px-6 py-4">
                      <div>
                        {saved && (
                          <span className="text-sm font-medium text-emerald-600">
                            Änderungen gespeichert
                          </span>
                        )}
                        {changed && !saved && (
                          <span className="text-sm text-amber-600">
                            Nicht gespeicherte Änderungen
                          </span>
                        )}
                      </div>
                      {changed && (
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleDiscard(template.id)}
                            disabled={saving}
                            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
                          >
                            Verwerfen
                          </button>
                          <button
                            onClick={() => handleSave(template.id)}
                            disabled={saving}
                            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                          >
                            {saving ? "Speichern..." : "Speichern"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
