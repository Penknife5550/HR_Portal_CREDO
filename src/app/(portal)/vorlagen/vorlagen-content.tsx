"use client";

/**
 * Formularvorlagen – Client Component
 *
 * Zeigt alle Formularvorlagen als Karten an.
 * SUPER_ADMIN und HR_LEITUNG koennen Steps ein-/ausschalten.
 * HR_SACHBEARBEITER sieht eine Read-Only-Ansicht.
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

interface StepConfig {
  step: number;
  title: string;
  enabled: boolean;
}

interface FormTemplate {
  id: string;
  questionnaireType: string;
  name: string;
  description: string | null;
  stepsConfig: StepConfig[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Steps 1 und 10 sind Pflichtschritte (immer aktiviert)
const MANDATORY_STEPS = [1, 10];

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

// =============================================
// Component
// =============================================
export function VorlagenContent({ user }: { user: User }) {
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Lokaler State fuer bearbeitete StepConfigs (pro Template-ID)
  const [editedConfigs, setEditedConfigs] = useState<
    Record<string, StepConfig[]>
  >({});

  // Tracking welche Templates gerade gespeichert werden
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  // Erfolgsmeldungen pro Template
  const [successIds, setSuccessIds] = useState<Set<string>>(new Set());

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
  // Pruefen ob Aenderungen vorliegen
  // =============================================
  function hasChanges(templateId: string): boolean {
    const edited = editedConfigs[templateId];
    if (!edited) return false;

    const template = templates.find((t) => t.id === templateId);
    if (!template) return false;

    return edited.some((editedStep, index) => {
      const originalStep = template.stepsConfig[index];
      return originalStep && editedStep.enabled !== originalStep.enabled;
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
  // Aktuelle Steps fuer ein Template
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
            Konfigurieren Sie, welche Fragebogen-Schritte fuer jeden
            Beschaeftigungstyp aktiviert sind.
          </p>
          {!canEdit && (
            <p className="mt-2 text-xs text-amber-600">
              Sie haben nur Leserechte. Wenden Sie sich an einen
              Administrator, um Aenderungen vorzunehmen.
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
                    <span className="text-sm text-muted-foreground">
                      {activeCount} von {steps.length} Schritten aktiv
                    </span>
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
                        const isMandatory = MANDATORY_STEPS.includes(
                          step.step
                        );

                        return (
                          <div
                            key={step.step}
                            className={`flex items-center justify-between rounded-lg px-4 py-3 transition-colors ${
                              step.enabled
                                ? "bg-white border border-border"
                                : "bg-muted/50 border border-transparent"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {/* Step-Nummer */}
                              <span
                                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                                  step.enabled
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted-foreground/20 text-muted-foreground"
                                }`}
                              >
                                {step.step}
                              </span>

                              {/* Step-Titel */}
                              <span
                                className={`text-sm font-medium ${
                                  step.enabled
                                    ? "text-foreground"
                                    : "text-muted-foreground line-through"
                                }`}
                              >
                                {step.title}
                              </span>

                              {/* Pflichtschritt-Hinweis */}
                              {isMandatory && (
                                <span className="text-xs text-muted-foreground">
                                  (Pflichtschritt)
                                </span>
                              )}
                            </div>

                            {/* Toggle */}
                            <div className="flex items-center gap-2">
                              {isMandatory ? (
                                <span className="text-xs text-muted-foreground">
                                  Immer aktiv
                                </span>
                              ) : canEdit ? (
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={step.enabled}
                                  aria-label={`${step.title} ${step.enabled ? "deaktivieren" : "aktivieren"}`}
                                  onClick={() =>
                                    handleStepToggle(
                                      template.id,
                                      step.step
                                    )
                                  }
                                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                                    step.enabled
                                      ? "bg-primary"
                                      : "bg-muted-foreground/30"
                                  }`}
                                >
                                  <span
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${
                                      step.enabled
                                        ? "translate-x-5"
                                        : "translate-x-0"
                                    }`}
                                  />
                                </button>
                              ) : (
                                <span
                                  className={`text-xs font-medium ${
                                    step.enabled
                                      ? "text-emerald-600"
                                      : "text-muted-foreground"
                                  }`}
                                >
                                  {step.enabled
                                    ? "Aktiviert"
                                    : "Deaktiviert"}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Card Footer (nur bei Aenderungen) */}
                  {canEdit && (changed || saved) && (
                    <div className="flex items-center justify-between border-t px-6 py-4">
                      <div>
                        {saved && (
                          <span className="text-sm font-medium text-emerald-600">
                            Aenderungen gespeichert
                          </span>
                        )}
                        {changed && !saved && (
                          <span className="text-sm text-amber-600">
                            Nicht gespeicherte Aenderungen
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
