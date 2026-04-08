"use client";

/**
 * Referenz-Formular (REFERENZ-Modus, Single-Page)
 *
 * Übernommen aus dem alten assessment-form.tsx — bleibt unverändert
 * funktional. Phase 3 baut nur den BEURTEILUNG-Modus zum Multi-Step um.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import type { AssessmentData } from "./page";
import { REFERENZ_QUESTIONS } from "@/lib/referenz-labels";

const REFERENZ_OPTIONS = ["Ja", "Nein", "Teilweise"] as const;
const SAVE_DEBOUNCE_MS = 800;

export function ReferenceForm({
  token,
  initialData,
  onSubmitted,
}: {
  token: string;
  initialData: AssessmentData;
  onSubmitted: () => void;
}) {
  const [referenceAnswers, setReferenceAnswers] = useState<Record<string, string>>(
    () => (initialData.referenceData as Record<string, string>) || {},
  );
  const [gemeindeReferenz, setGemeindeReferenz] = useState(
    initialData.gemeindeReferenz || "",
  );
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDataRef = useRef(false);

  const flushSave = useCallback(async () => {
    if (!pendingDataRef.current) return;
    pendingDataRef.current = false;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/civil-service-assessment/${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referenceData: referenceAnswers,
          gemeindeReferenz,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Fehler beim Speichern");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern");
      setTimeout(() => setError(null), 5000);
    } finally {
      setSaving(false);
    }
  }, [token, referenceAnswers, gemeindeReferenz]);

  const scheduleSave = useCallback(() => {
    pendingDataRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  }, [flushSave]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  function handleAnswer(id: string, value: string) {
    setReferenceAnswers((prev) => ({ ...prev, [id]: value }));
    scheduleSave();
  }

  function handleGemeinde(value: string) {
    setGemeindeReferenz(value);
    scheduleSave();
  }

  const allAnswered = REFERENZ_QUESTIONS.every((q) => referenceAnswers[q.id]);
  const canSubmit = allAnswered && gemeindeReferenz.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    pendingDataRef.current = true;
    await flushSave();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/civil-service-assessment/${token}/submit`,
        { method: "POST" },
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Fehler beim Einreichen");
      }
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Einreichen");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground">
          Referenz für {initialData.employee.name}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Bitte beantworten Sie die 12 Prüfpunkte und geben Sie eine
          Gemeinde-Referenz ab.
        </p>
        {saving && (
          <p className="mt-2 text-xs text-muted-foreground">
            Wird gespeichert…
          </p>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-credo-rot/30 bg-credo-rot/10 p-3 text-sm text-credo-rot">
          {error}
        </div>
      )}

      {/* Prüfpunkte */}
      <div className="space-y-3">
        {REFERENZ_QUESTIONS.map((q, idx) => {
          const current = referenceAnswers[q.id] || "";
          return (
            <div
              key={q.id}
              className="rounded-xl border border-border bg-card p-4 shadow-sm"
            >
              <p className="text-sm font-medium text-foreground mb-3">
                <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                  {idx + 1}
                </span>
                {q.label}
              </p>
              <div className="flex gap-2">
                {REFERENZ_OPTIONS.map((opt) => {
                  const selected = current === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => handleAnswer(q.id, opt)}
                      className={`flex h-11 min-w-[80px] items-center justify-center rounded-lg px-4 text-sm font-medium transition-all ${
                        selected
                          ? opt === "Ja"
                            ? "bg-credo-gruen text-white shadow-md"
                            : opt === "Nein"
                              ? "bg-credo-rot text-white shadow-md"
                              : "bg-credo-gelb text-white shadow-md"
                          : "bg-muted text-foreground hover:bg-muted/80"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              {q.hasTextField && current && (
                <input
                  type="text"
                  value={referenceAnswers[`${q.id}_detail`] || ""}
                  onChange={(e) => handleAnswer(`${q.id}_detail`, e.target.value)}
                  placeholder="Welcher Bereich?"
                  className="mt-3 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none"
                  autoComplete="off"
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Gemeinde-Referenz */}
      <div className="mt-6 rounded-xl border border-border bg-card p-4 shadow-sm">
        <label className="block text-sm font-semibold text-foreground mb-2">
          Gemeinde-Referenz *
        </label>
        <p className="text-xs text-muted-foreground mb-3">
          Bitte geben Sie eine ausführliche Referenz über die
          Gemeindemitgliedschaft und das Engagement der Lehrkraft ab.
        </p>
        <textarea
          value={gemeindeReferenz}
          onChange={(e) => handleGemeinde(e.target.value)}
          rows={5}
          placeholder="Ausführliche Gemeinde-Referenz…"
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none resize-y"
        />
      </div>

      {/* Submit */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit || submitting}
        className={`mt-6 w-full rounded-xl px-6 py-4 text-base font-bold transition-all ${
          canSubmit && !submitting
            ? "bg-primary text-primary-foreground shadow-lg hover:shadow-xl"
            : "cursor-not-allowed bg-muted text-muted-foreground"
        }`}
      >
        {submitting ? "Wird eingereicht…" : "Referenz einreichen"}
      </button>
    </main>
  );
}
