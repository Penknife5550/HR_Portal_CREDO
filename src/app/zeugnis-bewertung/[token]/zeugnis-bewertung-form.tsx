"use client";

/**
 * Zeugnis-Bewertungsbogen – Vorgesetzten-Ansicht (Magic Link)
 *
 * Zeigt den Bewertungsbogen mit allen Kategorien und Kriterien.
 * Noten können per Klick vergeben werden (1-6).
 * Auto-Save bei Änderung, finale Einreichung per Button.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import Image from "next/image";
import { CredoLinie } from "@/components/credo-linie";
import type {
  ZeugnisBewertungData,
  SnapshotCategory,
  SnapshotCriterion,
} from "./page";

// =============================================
// Konstanten
// =============================================

const GRADE_LABELS: Record<number, string> = {
  1: "Sehr gut",
  2: "Gut",
  3: "Befriedigend",
  4: "Ausreichend",
  5: "Mangelhaft",
  6: "Ungenügend",
};

/** Farb-Klassen für die Note (Hintergrund wenn selektiert) */
function getGradeColor(grade: number, selected: boolean): string {
  if (!selected) return "bg-muted text-foreground hover:bg-muted/80";
  switch (grade) {
    case 1:
    case 2:
      return "bg-credo-gruen text-white";
    case 3:
      return "bg-credo-gelb text-white";
    case 4:
      return "bg-orange-500 text-white";
    case 5:
    case 6:
      return "bg-red-500 text-white";
    default:
      return "bg-muted text-foreground";
  }
}

/** Debounce-Timeout in ms */
const SAVE_DEBOUNCE_MS = 800;

// =============================================
// Props
// =============================================

interface ZeugnisBewertungFormProps {
  token: string;
  initialData: ZeugnisBewertungData;
}

// =============================================
// Komponente
// =============================================

export function ZeugnisBewertungForm({
  token,
  initialData,
}: ZeugnisBewertungFormProps) {
  // Grades: criterionId -> grade (1-6)
  const [grades, setGrades] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const r of initialData.ratings) {
      map[r.snapshotCriterionId] = r.grade;
    }
    return map;
  });

  // Comments: criterionId -> comment
  const [comments, setComments] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const r of initialData.ratings) {
      if (r.comment) map[r.snapshotCriterionId] = r.comment;
    }
    return map;
  });

  // UI State
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => {
      // Alle Kategorien standardmäßig offen
      return new Set(
        initialData.templateSnapshot.categories.map((c) => c.id)
      );
    }
  );
  const [expandedComments, setExpandedComments] = useState<Set<string>>(
    new Set()
  );
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Debounce Ref
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRatingsRef = useRef<
    { snapshotCriterionId: string; snapshotCategoryId: string; grade: number; comment: string | null }[]
  >([]);

  // Sortierte Kategorien
  const sortedCategories = useMemo(
    () =>
      [...initialData.templateSnapshot.categories].sort(
        (a, b) => a.orderIndex - b.orderIndex
      ),
    [initialData.templateSnapshot.categories]
  );

  // Gesamtanzahl Kriterien
  const totalCriteria = useMemo(
    () =>
      sortedCategories.reduce((sum, cat) => sum + cat.criteria.length, 0),
    [sortedCategories]
  );

  // Bewertete Kriterien (nur die im Template vorhandenen zaehlen)
  const validCriterionIds = useMemo(
    () => new Set(sortedCategories.flatMap((cat) => cat.criteria.map((c) => c.id))),
    [sortedCategories]
  );
  const ratedCriteria = useMemo(
    () => Object.keys(grades).filter((id) => validCriterionIds.has(id)).length,
    [grades, validCriterionIds]
  );

  // Fortschritt in Prozent
  const progressPercent = useMemo(
    () =>
      totalCriteria > 0
        ? Math.round((ratedCriteria / totalCriteria) * 100)
        : 0,
    [ratedCriteria, totalCriteria]
  );

  // Alle bewertet?
  const allRated = ratedCriteria === totalCriteria && totalCriteria > 0;

  // =============================================
  // Notenberechnung
  // =============================================

  /** Durchschnitt einer einzelnen Kategorie */
  const getCategoryAverage = useCallback(
    (category: SnapshotCategory): number | null => {
      let totalWeight = 0;
      let weightedSum = 0;

      for (const crit of category.criteria) {
        const grade = grades[crit.id];
        if (grade === undefined) continue;
        totalWeight += crit.weight;
        weightedSum += crit.weight * grade;
      }

      if (totalWeight === 0) return null;
      return Math.round((weightedSum / totalWeight) * 100) / 100;
    },
    [grades]
  );

  /** Gesamtdurchschnitt (gewichtet über Kategorien) */
  const overallGrade = useMemo(() => {
    let totalCategoryWeight = 0;
    let weightedCategorySum = 0;

    for (const cat of sortedCategories) {
      const avg = getCategoryAverage(cat);
      if (avg === null) continue;
      totalCategoryWeight += cat.weight;
      weightedCategorySum += cat.weight * avg;
    }

    if (totalCategoryWeight === 0) return null;
    return Math.round((weightedCategorySum / totalCategoryWeight) * 100) / 100;
  }, [sortedCategories, getCategoryAverage]);

  // =============================================
  // Auto-Save
  // =============================================

  const flushSave = useCallback(async () => {
    const toSave = [...pendingRatingsRef.current];
    if (toSave.length === 0) return;
    pendingRatingsRef.current = [];

    setSaving(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/zeugnis-bewertung/${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ratings: toSave }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Fehler beim Speichern");
      }

      setLastSaved(new Date());
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Fehler beim Speichern."
      );
      setTimeout(() => setErrorMessage(null), 5000);
    } finally {
      setSaving(false);
    }
  }, [token]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      flushSave();
    }, SAVE_DEBOUNCE_MS);
  }, [flushSave]);

  // Cleanup Timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // =============================================
  // Event-Handler
  // =============================================

  /** Note setzen */
  const handleGradeChange = useCallback(
    (
      criterion: SnapshotCriterion,
      categoryId: string,
      grade: number
    ) => {
      setGrades((prev) => ({ ...prev, [criterion.id]: grade }));

      // Zum Pending-Batch hinzufügen
      // Existierenden Eintrag updaten oder neuen hinzufügen
      const existing = pendingRatingsRef.current.findIndex(
        (r) => r.snapshotCriterionId === criterion.id
      );
      const entry = {
        snapshotCriterionId: criterion.id,
        snapshotCategoryId: categoryId,
        grade,
        comment: comments[criterion.id] || null,
      };
      if (existing >= 0) {
        pendingRatingsRef.current[existing] = entry;
      } else {
        pendingRatingsRef.current.push(entry);
      }

      scheduleSave();
    },
    [comments, scheduleSave]
  );

  /** Kommentar ändern (speichert auch automatisch) */
  const handleCommentChange = useCallback(
    (criterionId: string, categoryId: string, value: string) => {
      setComments((prev) => ({ ...prev, [criterionId]: value }));

      const grade = grades[criterionId];
      if (grade === undefined) return; // Nur speichern wenn schon benotet

      const existing = pendingRatingsRef.current.findIndex(
        (r) => r.snapshotCriterionId === criterionId
      );
      const entry = {
        snapshotCriterionId: criterionId,
        snapshotCategoryId: categoryId,
        grade,
        comment: value || null,
      };
      if (existing >= 0) {
        pendingRatingsRef.current[existing] = entry;
      } else {
        pendingRatingsRef.current.push(entry);
      }

      scheduleSave();
    },
    [grades, scheduleSave]
  );

  /** Kategorie auf-/zuklappen */
  const toggleCategory = (catId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  /** Kommentar-Feld auf-/zuklappen */
  const toggleComment = (criterionId: string) => {
    setExpandedComments((prev) => {
      const next = new Set(prev);
      if (next.has(criterionId)) next.delete(criterionId);
      else next.add(criterionId);
      return next;
    });
  };

  /** Einreichen */
  const handleSubmit = useCallback(async () => {
    if (!allRated || submitting) return;

    // Zuerst alle offenen Änderungen speichern
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    await flushSave();

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/zeugnis-bewertung/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Fehler beim Einreichen");
      }

      setSubmitted(true);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Fehler beim Einreichen."
      );
    } finally {
      setSubmitting(false);
    }
  }, [allRated, submitting, token, flushSave]);

  // =============================================
  // Erfolgsanzeige nach Einreichung
  // =============================================

  if (submitted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-4">
        <div className="w-full max-w-lg overflow-hidden rounded-xl bg-card shadow-lg">
          <div className="p-8 text-center">
            <Image
              src="/credo_logo_claim.svg"
              alt="CREDO"
              width={200}
              height={65}
              className="mx-auto mb-6"
              priority
            />
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <svg
                className="h-8 w-8 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-foreground">
              Bewertung eingereicht
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Vielen Dank für Ihre Bewertung von{" "}
              <span className="font-medium text-foreground">
                {initialData.employee.name}
              </span>
              .
            </p>

            {/* Zusammenfassung */}
            <div className="mt-6 rounded-xl border bg-muted p-4 text-left">
              <h3 className="mb-3 text-sm font-semibold text-foreground">
                Zusammenfassung
              </h3>
              <div className="space-y-2">
                {sortedCategories.map((cat) => {
                  const avg = getCategoryAverage(cat);
                  return (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-muted-foreground">{cat.name}</span>
                      <span className="font-medium text-foreground">
                        {avg !== null ? avg.toFixed(2) : "—"}
                      </span>
                    </div>
                  );
                })}
                <div className="mt-2 border-t pt-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">
                      Gesamtnote
                    </span>
                    <span className="text-lg font-bold text-foreground">
                      {overallGrade !== null ? overallGrade.toFixed(2) : "—"}
                      {overallGrade !== null && (
                        <span className="ml-2 text-sm font-medium text-muted-foreground">
                          ({GRADE_LABELS[Math.round(overallGrade)]})
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <p className="mt-6 text-xs text-muted-foreground">
              Die Personalabteilung wird die Bewertung prüfen und das
              Arbeitszeugnis erstellen. Sie können dieses Fenster jetzt
              schließen.
            </p>
          </div>
          <CredoLinie />
        </div>
      </div>
    );
  }

  // =============================================
  // Hauptformular
  // =============================================

  /** Anzahl bewerteter Kriterien in einer Kategorie */
  const getCategoryRatedCount = (category: SnapshotCategory): number =>
    category.criteria.filter((c) => grades[c.id] !== undefined).length;

  return (
    <div className="min-h-screen bg-muted">
      {/* ===== Sticky Header ===== */}
      <header className="sticky top-0 z-50 border-b bg-card shadow-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Image
              src="/credo_logo.svg"
              alt="CREDO"
              width={100}
              height={33}
              priority
            />
            <div className="hidden sm:block">
              <h1 className="text-sm font-bold text-foreground">HR-Portal</h1>
              <p className="text-xs text-muted-foreground">
                Zeugnis-Bewertung
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {saving && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                Speichert...
              </div>
            )}
            {!saving && lastSaved && (
              <span className="text-xs text-muted-foreground">
                Gespeichert
              </span>
            )}
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              {ratedCriteria} / {totalCriteria}
            </span>
          </div>
        </div>

        {/* Fortschrittsbalken */}
        <div className="h-1 w-full bg-muted">
          <div
            className="h-full bg-credo-gruen transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <CredoLinie height={2} />
      </header>

      {/* ===== Content ===== */}
      <main className="mx-auto max-w-2xl px-4 py-6">
        {/* Titel */}
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">
          Zeugnis-Bewertungsbogen
        </h2>
        {initialData.supervisorName && (
          <p className="mt-1 text-sm text-muted-foreground">
            Bewerter: {initialData.supervisorName}
          </p>
        )}

        {/* Info-Box Mitarbeiter */}
        <div className="mt-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Mitarbeiter/in</p>
              <p className="font-medium text-foreground">
                {initialData.employee.name}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Einrichtung</p>
              <p className="font-medium text-foreground">
                {initialData.employee.organizationName}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Berufsgruppe</p>
              <p className="font-medium text-foreground">
                {initialData.jobGroup === "PAEDAGOGISCH"
                  ? "Pädagogisch"
                  : "Nicht-Pädagogisch"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                Letzter Arbeitstag
              </p>
              <p className="font-medium text-foreground">
                {new Date(
                  initialData.employee.lastWorkingDay
                ).toLocaleDateString("de-DE", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Fehlermeldung */}
        {errorMessage && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {errorMessage}
          </div>
        )}

        {/* ===== Kategorien ===== */}
        <div className="mt-6 space-y-4">
          {sortedCategories.map((category) => {
            const isExpanded = expandedCategories.has(category.id);
            const catAvg = getCategoryAverage(category);
            const catRated = getCategoryRatedCount(category);
            const catTotal = category.criteria.length;
            const sortedCriteria = [...category.criteria].sort(
              (a, b) => a.orderIndex - b.orderIndex
            );

            return (
              <div
                key={category.id}
                className="overflow-hidden rounded-xl border bg-card shadow-sm"
              >
                {/* Kategorie-Header (klickbar) */}
                <button
                  onClick={() => toggleCategory(category.id)}
                  className="flex w-full items-center justify-between px-4 py-4 text-left transition-colors hover:bg-muted/50 sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-foreground sm:text-base">
                      {category.name}
                    </h3>
                    {category.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {category.description}
                      </p>
                    )}
                  </div>
                  <div className="ml-3 flex shrink-0 items-center gap-3">
                    {/* Kategorie-Durchschnitt */}
                    {catAvg !== null && (
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground">
                        {catAvg.toFixed(1)}
                      </span>
                    )}
                    {/* Zähler */}
                    <span className="text-xs text-muted-foreground">
                      {catRated}/{catTotal}
                    </span>
                    {/* Chevron */}
                    <svg
                      className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </button>

                {/* Kriterien */}
                {isExpanded && (
                  <div className="border-t">
                    {sortedCriteria.map((criterion, index) => {
                      const selectedGrade = grades[criterion.id];
                      const commentExpanded = expandedComments.has(
                        criterion.id
                      );
                      const commentValue = comments[criterion.id] || "";

                      return (
                        <div
                          key={criterion.id}
                          className={`px-4 py-4 sm:px-5 ${
                            index > 0 ? "border-t" : ""
                          }`}
                        >
                          {/* Kriterium Name + Beschreibung */}
                          <div className="mb-3">
                            <p className="text-sm font-medium text-foreground">
                              {criterion.name}
                            </p>
                            {criterion.description && (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {criterion.description}
                              </p>
                            )}
                          </div>

                          {/* Noten-Buttons */}
                          <div className="flex gap-2">
                            {[1, 2, 3, 4, 5, 6].map((grade) => {
                              const isSelected = selectedGrade === grade;
                              return (
                                <button
                                  key={grade}
                                  onClick={() =>
                                    handleGradeChange(
                                      criterion,
                                      category.id,
                                      grade
                                    )
                                  }
                                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-sm font-bold transition-all duration-200 sm:h-10 sm:w-10 sm:text-base ${getGradeColor(
                                    grade,
                                    isSelected
                                  )} ${
                                    isSelected
                                      ? "scale-110 shadow-md ring-2 ring-offset-1 ring-current/20"
                                      : "hover:scale-105"
                                  }`}
                                  aria-label={`Note ${grade}: ${GRADE_LABELS[grade]}`}
                                >
                                  {grade}
                                </button>
                              );
                            })}
                          </div>

                          {/* Ausgewählte Note Label */}
                          {selectedGrade !== undefined && (
                            <p className="mt-1.5 text-xs font-medium text-muted-foreground">
                              {GRADE_LABELS[selectedGrade]}
                            </p>
                          )}

                          {/* Kommentar-Toggle */}
                          <button
                            onClick={() => toggleComment(criterion.id)}
                            className="mt-2 text-xs text-primary hover:underline"
                          >
                            {commentExpanded
                              ? "Kommentar ausblenden"
                              : commentValue
                                ? "Kommentar bearbeiten"
                                : "Kommentar hinzufügen"}
                          </button>

                          {/* Kommentar-Feld */}
                          {commentExpanded && (
                            <div className="mt-2">
                              <textarea
                                value={commentValue}
                                onChange={(e) =>
                                  handleCommentChange(
                                    criterion.id,
                                    category.id,
                                    e.target.value
                                  )
                                }
                                placeholder="Optionaler Kommentar zur Bewertung..."
                                rows={2}
                                autoComplete="off"
                                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ===== Gesamtnote ===== */}
        <div className="mt-8 rounded-xl border bg-card p-6 shadow-sm">
          <h3 className="mb-4 text-center text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Gesamtergebnis
          </h3>
          {overallGrade !== null ? (
            <div className="text-center">
              <span className="text-5xl font-bold text-foreground">
                {overallGrade.toFixed(2)}
              </span>
              <p className="mt-2 text-lg font-medium text-muted-foreground">
                {GRADE_LABELS[Math.round(overallGrade)]}
              </p>
              {/* Kategorie-Übersicht */}
              <div className="mx-auto mt-4 max-w-sm space-y-1.5">
                {sortedCategories.map((cat) => {
                  const avg = getCategoryAverage(cat);
                  return (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-muted-foreground">{cat.name}</span>
                      <span className="font-medium text-foreground">
                        {avg !== null ? avg.toFixed(2) : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Bewerten Sie alle Kriterien, um die Gesamtnote zu sehen.
            </p>
          )}
        </div>

        {/* ===== Submit ===== */}
        <div className="mt-6">
          <button
            onClick={handleSubmit}
            disabled={!allRated || submitting}
            className={`w-full rounded-xl px-6 py-4 text-base font-bold transition-all duration-200 ${
              allRated && !submitting
                ? "bg-primary text-primary-foreground shadow-lg hover:shadow-xl active:scale-[0.98]"
                : "cursor-not-allowed bg-muted text-muted-foreground"
            }`}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                Wird eingereicht...
              </span>
            ) : allRated ? (
              "Bewertung einreichen"
            ) : (
              `Noch ${totalCriteria - ratedCriteria} Bewertung${
                totalCriteria - ratedCriteria !== 1 ? "en" : ""
              } offen`
            )}
          </button>
          {!allRated && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Bitte bewerten Sie alle Kriterien, bevor Sie die Bewertung
              einreichen.
            </p>
          )}
        </div>
      </main>

      {/* ===== Footer ===== */}
      <footer className="mt-auto border-t bg-card py-6 text-center">
        <p className="text-sm text-muted-foreground">
          Bei Fragen wenden Sie sich an die Personalabteilung.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Ihre Eingaben werden verschlüsselt übertragen und gemäß DSGVO
          verarbeitet. Die Bewertung dient ausschließlich zur Erstellung des
          qualifizierten Arbeitszeugnisses.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Christlicher Schulverein Minden e.V.
        </p>
      </footer>
    </div>
  );
}
