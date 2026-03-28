"use client";

/**
 * Beurteilungs-Formular – Schulleitungs-Ansicht (Magic Link)
 *
 * Zwei Modi:
 * - BEURTEILUNG: Unterrichtsbesuch-Bewertung mit Noten 1-6 pro Kriterium
 * - REFERENZ: 12 Pruefpunkte mit Ja/Nein/Teilweise + Gemeinde-Referenz
 *
 * Apple-like UX, Auto-Save, Touch-friendly.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import Image from "next/image";
import { CredoLinie } from "@/components/credo-linie";
import type { AssessmentData, SnapshotCategory } from "./page";

// =============================================
// Konstanten
// =============================================

const GRADE_LABELS: Record<number, string> = {
  1: "Sehr gut",
  2: "Gut",
  3: "Befriedigend",
  4: "Ausreichend",
  5: "Mangelhaft",
  6: "Ungenuegend",
};

const ASSESSMENT_NUMBER_LABELS: Record<number, string> = {
  1: "1. Beurteilung (nach 1 Jahr)",
  2: "2. Beurteilung (nach 2 Jahren)",
  3: "3. Beurteilung (nach 2,5 Jahren)",
};

/** Farb-Klassen fuer die Note (Hintergrund wenn selektiert) */
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

/** Farbe fuer Durchschnittswert */
function getAverageColor(avg: number): string {
  if (avg < 2.0) return "text-credo-gruen";
  if (avg < 3.0) return "text-credo-gruen";
  if (avg < 3.5) return "text-credo-gelb";
  if (avg < 4.5) return "text-orange-500";
  return "text-red-500";
}

/** Debounce-Timeout in ms */
const SAVE_DEBOUNCE_MS = 800;

// =============================================
// Die 12 Referenz-Pruefpunkte
// =============================================

const REFERENZ_QUESTIONS = [
  { id: "andachtsbesuch", label: "Regelmaessiger Andachtsbesuch" },
  { id: "vollzeit-perspektive", label: "Perspektive Vollzeit / mind. 75%" },
  { id: "belastbarkeit", label: "Belastbarkeit" },
  { id: "gutes-miteinander", label: "Gutes Miteinander (Kollegium, Schueler, Eltern)" },
  { id: "besondere-aufgaben", label: "Bereitschaft besondere Aufgaben zu uebernehmen" },
  { id: "klassenleitung", label: "Klassenleitung uebernommen" },
  { id: "engagement-schule", label: "Engagement fuer Schule sichtbar" },
  { id: "identifikation-fes", label: "Identifikation mit Grundsaetzen FES Minden" },
  { id: "grundsaetze-gelebt", label: "Grundsaetze der FES werden gelebt" },
  { id: "zielvereinbarungen", label: "Zielvereinbarungen vereinbart" },
  { id: "gemeindemitgliedschaft", label: "Aktive Gemeindemitgliedschaft" },
  { id: "mitarbeit-gemeinde", label: "Mitarbeit in der Gemeinde — welcher Bereich?", hasTextField: true },
];

const REFERENZ_OPTIONS = ["Ja", "Nein", "Teilweise"];

// =============================================
// Props
// =============================================

interface AssessmentFormProps {
  token: string;
  initialData: AssessmentData;
}

// =============================================
// Komponente
// =============================================

export function AssessmentForm({ token, initialData }: AssessmentFormProps) {
  const isBeurteilung = initialData.assessmentType === "BEURTEILUNG";

  // =============================================
  // BEURTEILUNG State
  // =============================================

  const [grades, setGrades] = useState<Record<string, number>>(() => {
    return (initialData.ratingsData as Record<string, number>) || {};
  });

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => {
      if (!initialData.templateSnapshot) return new Set<string>();
      return new Set(initialData.templateSnapshot.categories.map((c) => c.id));
    }
  );

  // =============================================
  // REFERENZ State
  // =============================================

  const [referenceAnswers, setReferenceAnswers] = useState<Record<string, string>>(() => {
    return (initialData.referenceData as Record<string, string>) || {};
  });

  const [gemeindeReferenz, setGemeindeReferenz] = useState(
    initialData.gemeindeReferenz || ""
  );

  // =============================================
  // Shared State
  // =============================================

  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Debounce Ref
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDataRef = useRef<boolean>(false);

  // =============================================
  // BEURTEILUNG Berechnungen
  // =============================================

  const sortedCategories = useMemo(() => {
    if (!initialData.templateSnapshot) return [];
    return [...initialData.templateSnapshot.categories].sort(
      (a, b) => a.orderIndex - b.orderIndex
    );
  }, [initialData.templateSnapshot]);

  const totalCriteria = useMemo(
    () => sortedCategories.reduce((sum, cat) => sum + cat.criteria.length, 0),
    [sortedCategories]
  );

  const ratedCriteria = useMemo(
    () => Object.keys(grades).length,
    [grades]
  );

  const progressPercent = useMemo(() => {
    if (isBeurteilung) {
      return totalCriteria > 0
        ? Math.round((ratedCriteria / totalCriteria) * 100)
        : 0;
    }
    // REFERENZ: 12 Fragen + Gemeinde-Referenz = 13 items
    const answered = REFERENZ_QUESTIONS.filter((q) => referenceAnswers[q.id]).length;
    const hasGemeinde = gemeindeReferenz.trim().length > 0 ? 1 : 0;
    return Math.round(((answered + hasGemeinde) / 13) * 100);
  }, [isBeurteilung, totalCriteria, ratedCriteria, referenceAnswers, gemeindeReferenz]);

  const allBeurteilungRated = ratedCriteria === totalCriteria && totalCriteria > 0;

  const allReferenzComplete = useMemo(() => {
    const allAnswered = REFERENZ_QUESTIONS.every((q) => referenceAnswers[q.id]);
    return allAnswered && gemeindeReferenz.trim().length > 0;
  }, [referenceAnswers, gemeindeReferenz]);

  const canSubmit = isBeurteilung ? allBeurteilungRated : allReferenzComplete;

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

  /** Gesamtdurchschnitt (gewichtet ueber Kategorien) */
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

  /** Gatekeeper pruefen */
  const gatekeeperStatus = useMemo(() => {
    if (!isBeurteilung || overallGrade === null) return null;

    const categoryAverages: Record<string, number> = {};
    for (const cat of sortedCategories) {
      const avg = getCategoryAverage(cat);
      if (avg !== null) categoryAverages[cat.id] = avg;
    }

    const overallOk = overallGrade < 3.0;
    const noCategoryAbove3 = !Object.values(categoryAverages).some((a) => a > 3.0);
    const hasOneCategoryBelow2 = Object.values(categoryAverages).some((a) => a < 2.0);

    return {
      overallOk,
      noCategoryAbove3,
      hasOneCategoryBelow2,
      meetsAll: overallOk && noCategoryAbove3 && hasOneCategoryBelow2,
    };
  }, [isBeurteilung, overallGrade, sortedCategories, getCategoryAverage]);

  // =============================================
  // Auto-Save
  // =============================================

  const flushSave = useCallback(async () => {
    if (!pendingDataRef.current) return;
    pendingDataRef.current = false;

    setSaving(true);
    setErrorMessage(null);

    try {
      const body: Record<string, unknown> = {};
      if (isBeurteilung) {
        body.ratingsData = grades;
      } else {
        body.referenceData = referenceAnswers;
        body.gemeindeReferenz = gemeindeReferenz;
      }

      const res = await fetch(`/api/civil-service-assessment/${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
  }, [token, isBeurteilung, grades, referenceAnswers, gemeindeReferenz]);

  const scheduleSave = useCallback(() => {
    pendingDataRef.current = true;
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
  // Event-Handler: BEURTEILUNG
  // =============================================

  const handleGradeChange = useCallback(
    (criterionId: string, grade: number) => {
      setGrades((prev) => ({ ...prev, [criterionId]: grade }));
      scheduleSave();
    },
    [scheduleSave]
  );

  const toggleCategory = (catId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  // =============================================
  // Event-Handler: REFERENZ
  // =============================================

  const handleReferenceChange = useCallback(
    (questionId: string, value: string) => {
      setReferenceAnswers((prev) => ({ ...prev, [questionId]: value }));
      scheduleSave();
    },
    [scheduleSave]
  );

  const handleGemeindeChange = useCallback(
    (value: string) => {
      setGemeindeReferenz(value);
      scheduleSave();
    },
    [scheduleSave]
  );

  // =============================================
  // Submit
  // =============================================

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || submitting) return;

    // Zuerst alle offenen Aenderungen speichern
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    pendingDataRef.current = true;
    await flushSave();

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/civil-service-assessment/${token}/submit`, {
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
  }, [canSubmit, submitting, token, flushSave]);

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
              {isBeurteilung ? "Beurteilung" : "Referenz"} eingereicht
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Vielen Dank fuer Ihre {isBeurteilung ? "Beurteilung" : "Referenz"} von{" "}
              <span className="font-medium text-foreground">
                {initialData.employee.name}
              </span>
              .
            </p>

            {/* Zusammenfassung bei BEURTEILUNG */}
            {isBeurteilung && overallGrade !== null && (
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
                          {avg !== null ? avg.toFixed(2) : "--"}
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
                        {overallGrade.toFixed(2)}
                        <span className="ml-2 text-sm font-medium text-muted-foreground">
                          ({GRADE_LABELS[Math.round(overallGrade)]})
                        </span>
                      </span>
                    </div>
                  </div>
                  {gatekeeperStatus && (
                    <div className="mt-2 border-t pt-2">
                      <p className={`text-sm font-medium ${gatekeeperStatus.meetsAll ? "text-credo-gruen" : "text-red-500"}`}>
                        {gatekeeperStatus.meetsAll
                          ? "Anforderungen erfuellt"
                          : "Anforderungen nicht erfuellt"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <p className="mt-6 text-xs text-muted-foreground">
              Die Personalabteilung wird die {isBeurteilung ? "Beurteilung" : "Referenz"} pruefen.
              Sie koennen dieses Fenster jetzt schliessen.
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
                {isBeurteilung ? "Dienstliche Beurteilung" : "Referenz-Pruefung"}
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
            {isBeurteilung && (
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                {ratedCriteria} / {totalCriteria}
              </span>
            )}
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
          {isBeurteilung ? "Dienstliche Beurteilung" : "Referenz-Pruefung"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {ASSESSMENT_NUMBER_LABELS[initialData.assessmentNumber] ||
            `Beurteilung Nr. ${initialData.assessmentNumber}`}
        </p>

        {/* Info-Box Mitarbeiter */}
        <div className="mt-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Lehrkraft</p>
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
            {initialData.recipientName && (
              <div>
                <p className="text-xs text-muted-foreground">Bewerter/in</p>
                <p className="font-medium text-foreground">
                  {initialData.recipientName}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Fehlermeldung */}
        {errorMessage && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {errorMessage}
          </div>
        )}

        {/* ===== BEURTEILUNG Modus ===== */}
        {isBeurteilung && (
          <>
            {/* Gatekeeper-Hinweise */}
            <div className="mt-4 rounded-xl border bg-card p-4 shadow-sm">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Anforderungen an die Beurteilung
              </h3>
              <ul className="space-y-1.5 text-sm">
                <li className="flex items-start gap-2">
                  <span className={`mt-0.5 shrink-0 ${gatekeeperStatus?.overallOk ? "text-credo-gruen" : overallGrade !== null ? "text-red-500" : "text-muted-foreground"}`}>
                    {gatekeeperStatus?.overallOk ? (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01" /></svg>
                    )}
                  </span>
                  <span className="text-muted-foreground">Gesamtschnitt muss unter 3,0 liegen</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className={`mt-0.5 shrink-0 ${gatekeeperStatus?.noCategoryAbove3 ? "text-credo-gruen" : overallGrade !== null ? "text-red-500" : "text-muted-foreground"}`}>
                    {gatekeeperStatus?.noCategoryAbove3 ? (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01" /></svg>
                    )}
                  </span>
                  <span className="text-muted-foreground">Kein Bereich darf ueber 3,0 liegen</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className={`mt-0.5 shrink-0 ${gatekeeperStatus?.hasOneCategoryBelow2 ? "text-credo-gruen" : overallGrade !== null ? "text-red-500" : "text-muted-foreground"}`}>
                    {gatekeeperStatus?.hasOneCategoryBelow2 ? (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01" /></svg>
                    )}
                  </span>
                  <span className="text-muted-foreground">Mind. 1 Bereich muss unter 2,0 liegen</span>
                </li>
              </ul>
            </div>

            {/* Warnung wenn Anforderungen nicht erfuellt */}
            {gatekeeperStatus && !gatekeeperStatus.meetsAll && allBeurteilungRated && (
              <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3">
                <div className="flex items-start gap-2">
                  <svg className="mt-0.5 h-5 w-5 shrink-0 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <div>
                    <p className="text-sm font-semibold text-red-800">
                      Anforderungen nicht erfuellt
                    </p>
                    <p className="mt-1 text-sm text-red-700">
                      Die aktuelle Bewertung erfuellt nicht alle Voraussetzungen fuer die Verbeamtung.
                      Sie koennen die Beurteilung trotzdem einreichen — die Personalabteilung wird das Ergebnis pruefen.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Kategorien */}
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
                      </div>
                      <div className="ml-3 flex shrink-0 items-center gap-3">
                        {/* Kategorie-Durchschnitt */}
                        {catAvg !== null && (
                          <span className={`rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold ${getAverageColor(catAvg)}`}>
                            {catAvg.toFixed(1)}
                          </span>
                        )}
                        {/* Zaehler */}
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
                                        handleGradeChange(criterion.id, grade)
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

                              {/* Ausgewaehlte Note Label */}
                              {selectedGrade !== undefined && (
                                <p className="mt-1.5 text-xs font-medium text-muted-foreground">
                                  {GRADE_LABELS[selectedGrade]}
                                </p>
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

            {/* Gesamtnote */}
            <div className="mt-8 rounded-xl border bg-card p-6 shadow-sm">
              <h3 className="mb-4 text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Gesamtergebnis
              </h3>
              {overallGrade !== null ? (
                <div className="text-center">
                  <span className={`text-5xl font-bold ${getAverageColor(overallGrade)}`}>
                    {overallGrade.toFixed(2)}
                  </span>
                  <p className="mt-2 text-lg font-medium text-muted-foreground">
                    {GRADE_LABELS[Math.round(overallGrade)]}
                  </p>
                  {/* Kategorie-Uebersicht */}
                  <div className="mx-auto mt-4 max-w-sm space-y-1.5">
                    {sortedCategories.map((cat) => {
                      const avg = getCategoryAverage(cat);
                      return (
                        <div
                          key={cat.id}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-muted-foreground">{cat.name}</span>
                          <span className={`font-medium ${avg !== null ? getAverageColor(avg) : "text-foreground"}`}>
                            {avg !== null ? avg.toFixed(2) : "--"}
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
          </>
        )}

        {/* ===== REFERENZ Modus ===== */}
        {!isBeurteilung && (
          <>
            <p className="mt-4 text-sm text-muted-foreground">
              Bitte beantworten Sie die folgenden 12 Pruefpunkte und geben Sie eine Gemeinde-Referenz ab.
            </p>

            {/* Pruefpunkte */}
            <div className="mt-6 space-y-3">
              {REFERENZ_QUESTIONS.map((question, index) => {
                const currentValue = referenceAnswers[question.id] || "";

                return (
                  <div
                    key={question.id}
                    className="overflow-hidden rounded-xl border bg-card shadow-sm"
                  >
                    <div className="px-4 py-4 sm:px-5">
                      <div className="mb-3">
                        <p className="text-sm font-medium text-foreground">
                          <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                            {index + 1}
                          </span>
                          {question.label}
                        </p>
                      </div>

                      {/* Radio-Buttons */}
                      <div className="flex gap-2">
                        {REFERENZ_OPTIONS.map((option) => {
                          const isSelected = currentValue === option;
                          return (
                            <button
                              key={option}
                              onClick={() => handleReferenceChange(question.id, option)}
                              className={`flex h-11 items-center justify-center rounded-lg px-4 text-sm font-medium transition-all duration-200 sm:h-10 ${
                                isSelected
                                  ? option === "Ja"
                                    ? "bg-credo-gruen text-white scale-105 shadow-md"
                                    : option === "Nein"
                                      ? "bg-red-500 text-white scale-105 shadow-md"
                                      : "bg-credo-gelb text-white scale-105 shadow-md"
                                  : "bg-muted text-foreground hover:bg-muted/80 hover:scale-105"
                              }`}
                              aria-label={`${question.label}: ${option}`}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>

                      {/* Freitext-Feld bei "Mitarbeit in der Gemeinde" */}
                      {question.hasTextField && currentValue && (
                        <div className="mt-3">
                          <input
                            type="text"
                            value={referenceAnswers[`${question.id}_detail`] || ""}
                            onChange={(e) =>
                              handleReferenceChange(`${question.id}_detail`, e.target.value)
                            }
                            placeholder="Welcher Bereich? (z.B. Jugendarbeit, Musik, Kinderkirche...)"
                            autoComplete="off"
                            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Gemeinde-Referenz Textarea */}
            <div className="mt-6 overflow-hidden rounded-xl border bg-card shadow-sm">
              <div className="px-4 py-4 sm:px-5">
                <label className="mb-2 block text-sm font-semibold text-foreground">
                  Gemeinde-Referenz
                  <span className="ml-1 text-red-500">*</span>
                </label>
                <p className="mb-3 text-xs text-muted-foreground">
                  Bitte geben Sie eine ausfuehrliche Referenz ueber die Gemeindemitgliedschaft und das Engagement der Lehrkraft ab.
                </p>
                <textarea
                  value={gemeindeReferenz}
                  onChange={(e) => handleGemeindeChange(e.target.value)}
                  placeholder="Ausfuehrliche Gemeinde-Referenz..."
                  rows={5}
                  autoComplete="off"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                />
                {gemeindeReferenz.trim().length === 0 && (
                  <p className="mt-1 text-xs text-red-500">
                    Die Gemeinde-Referenz ist ein Pflichtfeld.
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        {/* ===== Submit ===== */}
        <div className="mt-6">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className={`w-full rounded-xl px-6 py-4 text-base font-bold transition-all duration-200 ${
              canSubmit && !submitting
                ? "bg-primary text-primary-foreground shadow-lg hover:shadow-xl active:scale-[0.98]"
                : "cursor-not-allowed bg-muted text-muted-foreground"
            }`}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                Wird eingereicht...
              </span>
            ) : canSubmit ? (
              `${isBeurteilung ? "Beurteilung" : "Referenz"} einreichen`
            ) : isBeurteilung ? (
              `Noch ${totalCriteria - ratedCriteria} Bewertung${
                totalCriteria - ratedCriteria !== 1 ? "en" : ""
              } offen`
            ) : (
              "Bitte alle Felder ausfuellen"
            )}
          </button>
          {!canSubmit && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {isBeurteilung
                ? "Bitte bewerten Sie alle Kriterien, bevor Sie die Beurteilung einreichen."
                : "Bitte beantworten Sie alle Pruefpunkte und geben Sie die Gemeinde-Referenz an."}
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
          Ihre Eingaben werden verschluesselt uebertragen und gemaess DSGVO
          verarbeitet. Die Beurteilung dient ausschliesslich zur Pruefung der
          Verbeamtungsvoraussetzungen.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Christlicher Schulverein Minden e.V.
        </p>
      </footer>
    </div>
  );
}
