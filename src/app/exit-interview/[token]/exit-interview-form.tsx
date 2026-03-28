"use client";

/**
 * Exit-Interview – Multi-Step Survey Form (Magic Link)
 *
 * Step 0: DSGVO-Einwilligung
 * Steps 1-N: Kategorien mit Fragen
 * Letzter Step: Zusammenfassung + Absenden
 *
 * Apple-like UX, touch-friendly, responsive.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import Image from "next/image";
import { CredoLinie } from "@/components/credo-linie";
import type {
  ExitInterviewData,
  ExitInterviewResponse,
  TemplateSnapshotCategory,
  TemplateSnapshotQuestion,
} from "./page";

// =============================================
// Types
// =============================================

interface ExitInterviewFormProps {
  token: string;
  initialData: ExitInterviewData;
}

/** Lokaler Antwort-State pro Frage */
interface AnswerState {
  ratingValue?: number | null;
  textValue?: string | null;
  choiceValues?: string[] | null;
  singleChoiceValue?: string | null;
}

// =============================================
// Component
// =============================================

export function ExitInterviewForm({ token, initialData }: ExitInterviewFormProps) {
  const { templateSnapshot, employeeFirstName, organizationName } = initialData;

  // -- Filter categories: remove questions where roleFilter doesn't match
  const filteredCategories = useMemo(() => {
    // employeeRole is not directly in the data from GET, but we have no role info
    // on the public side. roleFilter filtering happens here if the data had it.
    return templateSnapshot.categories
      .map((cat) => ({
        ...cat,
        questions: cat.questions
          .filter(() => true) // No role filtering since employeeRole is not exposed
          .sort((a, b) => a.orderIndex - b.orderIndex),
      }))
      .filter((cat) => cat.questions.length > 0)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }, [templateSnapshot]);

  // Total steps: DSGVO (0) + categories (1..N) + summary (N+1)
  const totalSteps = filteredCategories.length + 2; // DSGVO + categories + summary
  const summaryStepIndex = filteredCategories.length + 1;

  // -- State
  const [currentStep, setCurrentStep] = useState(0);
  const [dsgvoAccepted, setDsgvoAccepted] = useState(initialData.dsgvoAccepted);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>(() => {
    // Initialize from existing responses
    const initial: Record<string, AnswerState> = {};
    for (const resp of initialData.responses) {
      initial[resp.snapshotQuestionId] = {
        ratingValue: resp.ratingValue,
        textValue: resp.textValue,
        choiceValues: resp.choiceValues,
        singleChoiceValue: resp.singleChoiceValue,
      };
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  // Scroll to top on step change
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentStep]);

  // -- Save current step answers via PUT
  const saveCurrentStep = useCallback(async (stepAnswers?: Record<string, AnswerState>, saveDsgvo?: boolean) => {
    setSaving(true);
    setErrorMessage(null);
    try {
      const answersToSave = stepAnswers || answers;

      // Build responses array from all answers
      const responses: Array<{
        snapshotQuestionId: string;
        ratingValue?: number | null;
        textValue?: string | null;
        choiceValues?: string[] | null;
        singleChoiceValue?: string | null;
      }> = [];

      for (const [questionId, answer] of Object.entries(answersToSave)) {
        responses.push({
          snapshotQuestionId: questionId,
          ratingValue: answer.ratingValue ?? null,
          textValue: answer.textValue ?? null,
          choiceValues: answer.choiceValues ?? null,
          singleChoiceValue: answer.singleChoiceValue ?? null,
        });
      }

      const body: Record<string, unknown> = { responses };
      if (saveDsgvo) {
        body.dsgvoAccepted = true;
      }

      const res = await fetch(`/api/exit-interview/${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Fehler beim Speichern");
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Fehler beim Speichern.");
      setTimeout(() => setErrorMessage(null), 5000);
    } finally {
      setSaving(false);
    }
  }, [token, answers]);

  // -- Navigation
  const goNext = useCallback(async () => {
    // Save before navigating
    const saveDsgvo = currentStep === 0 && dsgvoAccepted;
    await saveCurrentStep(answers, saveDsgvo || false);
    setCurrentStep((prev) => Math.min(prev + 1, totalSteps - 1));
  }, [currentStep, dsgvoAccepted, answers, saveCurrentStep, totalSteps]);

  const goBack = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, []);

  // -- Submit
  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      // Final save of all answers
      await saveCurrentStep(answers, false);

      // Submit
      const res = await fetch(`/api/exit-interview/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Fehler beim Einreichen");
      }

      setSubmitted(true);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Fehler beim Einreichen.");
    } finally {
      setSubmitting(false);
    }
  }, [token, answers, saveCurrentStep]);

  // -- Update answer for a question
  const updateAnswer = useCallback((questionId: string, update: Partial<AnswerState>) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        ...update,
      },
    }));
  }, []);

  // -- Check if current step can proceed
  const canProceed = useMemo(() => {
    if (currentStep === 0) return dsgvoAccepted;
    if (currentStep >= 1 && currentStep <= filteredCategories.length) {
      const category = filteredCategories[currentStep - 1];
      // Check all required questions have an answer
      for (const q of category.questions) {
        if (!q.isRequired) continue;
        const answer = answers[q.id];
        if (!answer) return false;
        switch (q.questionType) {
          case "RATING_5_STAR":
          case "ENPS":
            if (answer.ratingValue == null) return false;
            break;
          case "FREE_TEXT":
            if (!answer.textValue || answer.textValue.trim().length === 0) return false;
            break;
          case "MULTIPLE_CHOICE":
            if (!answer.choiceValues || answer.choiceValues.length === 0) return false;
            break;
          case "SINGLE_CHOICE":
            if (!answer.singleChoiceValue) return false;
            break;
        }
      }
      return true;
    }
    return true; // summary step
  }, [currentStep, dsgvoAccepted, answers, filteredCategories]);

  // Progress percentage
  const progressPercent = Math.round((currentStep / (totalSteps - 1)) * 100);

  // -- Success screen
  if (submitted) {
    return (
      <div className="min-h-screen bg-muted">
        <header className="sticky top-0 z-50 border-b bg-card shadow-sm">
          <div className="mx-auto flex max-w-2xl items-center justify-center px-4 py-3">
            <Image
              src="/credo_logo.svg"
              alt="CREDO"
              width={100}
              height={33}
              priority
            />
          </div>
          <CredoLinie height={2} />
        </header>
        <main className="mx-auto max-w-2xl px-4 py-12">
          <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-green-800">Vielen Dank!</h1>
            <p className="mt-3 text-sm text-green-700">
              Ihre Antworten wurden erfolgreich übermittelt.
            </p>
            <p className="mt-2 text-sm text-green-700">
              Vielen Dank, {employeeFirstName}, dass Sie sich die Zeit genommen haben.
              Ihre Rückmeldung hilft uns, {organizationName} weiterzuentwickeln.
            </p>
            <p className="mt-6 text-xs text-green-600">
              Sie können dieses Fenster jetzt schließen.
            </p>
          </div>
        </main>
        <footer className="mt-auto border-t bg-card py-6 text-center">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Christlicher Schulverein Minden e.V.
          </p>
        </footer>
      </div>
    );
  }

  // =============================================
  // Render helpers
  // =============================================

  return (
    <div className="min-h-screen bg-muted" ref={mainRef}>
      {/* Sticky Header */}
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
              <p className="text-xs text-muted-foreground">Exit-Interview</p>
            </div>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            Schritt {currentStep + 1} / {totalSteps}
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-1 w-full bg-muted">
          <div
            className="h-full bg-credo-gruen transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <CredoLinie height={2} />
      </header>

      {/* Content */}
      <main className="mx-auto max-w-2xl px-4 py-6">
        {/* Error banner */}
        {errorMessage && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {errorMessage}
          </div>
        )}

        {/* Step 0: DSGVO */}
        {currentStep === 0 && (
          <DsgvoStep
            introText={templateSnapshot.introText}
            dsgvoText={templateSnapshot.dsgvoText}
            accepted={dsgvoAccepted}
            onAcceptChange={setDsgvoAccepted}
            employeeFirstName={employeeFirstName}
          />
        )}

        {/* Steps 1..N: Categories */}
        {currentStep >= 1 && currentStep <= filteredCategories.length && (
          <CategoryStep
            category={filteredCategories[currentStep - 1]}
            answers={answers}
            onUpdateAnswer={updateAnswer}
            stepNumber={currentStep}
            totalCategorySteps={filteredCategories.length}
          />
        )}

        {/* Summary step */}
        {currentStep === summaryStepIndex && (
          <SummaryStep
            categories={filteredCategories}
            answers={answers}
            templateSnapshot={templateSnapshot}
          />
        )}

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between gap-4 pb-8">
          {currentStep > 0 ? (
            <button
              onClick={goBack}
              className="rounded-xl border border-input bg-card px-6 py-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted active:scale-[0.98]"
            >
              Zurück
            </button>
          ) : (
            <div />
          )}

          {currentStep < summaryStepIndex ? (
            <button
              onClick={goNext}
              disabled={!canProceed || saving}
              className="flex items-center gap-2 rounded-xl bg-credo-gruen px-6 py-3 text-sm font-medium text-white shadow-sm transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving && (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              )}
              Weiter
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-2 rounded-xl bg-credo-gruen px-8 py-3 text-sm font-bold text-white shadow-sm transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting && (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              )}
              Absenden
            </button>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t bg-card py-6 text-center">
        <p className="mt-1 text-xs text-muted-foreground">
          Ihre Eingaben werden verschlüsselt übertragen und gemäß DSGVO verarbeitet.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Christlicher Schulverein Minden e.V.
        </p>
      </footer>
    </div>
  );
}

// =============================================
// Step 0: DSGVO Consent
// =============================================

function DsgvoStep({
  introText,
  dsgvoText,
  accepted,
  onAcceptChange,
  employeeFirstName,
}: {
  introText: string | null;
  dsgvoText: string | null;
  accepted: boolean;
  onAcceptChange: (v: boolean) => void;
  employeeFirstName: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">
          Willkommen, {employeeFirstName}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Exit-Interview
        </p>
      </div>

      {/* Intro Text */}
      {introText && (
        <div className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
            {introText}
          </p>
        </div>
      )}

      {/* DSGVO Text */}
      <div className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
        <h3 className="mb-3 text-sm font-bold text-foreground">
          Datenschutzhinweis (DSGVO)
        </h3>
        {dsgvoText ? (
          <div className="mb-5 max-h-60 overflow-y-auto rounded-lg bg-muted p-4 text-xs leading-relaxed text-muted-foreground">
            <p className="whitespace-pre-line">{dsgvoText}</p>
          </div>
        ) : (
          <div className="mb-5 rounded-lg bg-muted p-4 text-xs leading-relaxed text-muted-foreground">
            <p>
              Ihre Antworten werden vertraulich behandelt und ausschließlich in anonymisierter
              Form zur Verbesserung unserer Arbeitsbedingungen ausgewertet. Die Datenverarbeitung
              erfolgt gemäß DSGVO Art. 6 Abs. 1 lit. a.
            </p>
          </div>
        )}

        {/* Consent checkbox */}
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => onAcceptChange(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-gray-300 text-credo-gruen accent-credo-gruen"
          />
          <span className="text-sm text-foreground">
            Ich habe den Datenschutzhinweis gelesen und stimme der Verarbeitung meiner
            Antworten zu den genannten Zwecken zu.
          </span>
        </label>
      </div>
    </div>
  );
}

// =============================================
// Steps 1-N: Category with Questions
// =============================================

function CategoryStep({
  category,
  answers,
  onUpdateAnswer,
  stepNumber,
  totalCategorySteps,
}: {
  category: TemplateSnapshotCategory;
  answers: Record<string, AnswerState>;
  onUpdateAnswer: (questionId: string, update: Partial<AnswerState>) => void;
  stepNumber: number;
  totalCategorySteps: number;
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium text-muted-foreground">
          Kategorie {stepNumber} von {totalCategorySteps}
        </p>
        <h2 className="mt-1 text-xl font-bold text-foreground sm:text-2xl">
          {category.name}
        </h2>
        {category.description && (
          <p className="mt-1 text-sm text-muted-foreground">{category.description}</p>
        )}
      </div>

      <div className="space-y-4">
        {category.questions.map((question, idx) => (
          <QuestionCard
            key={question.id}
            question={question}
            answer={answers[question.id] || {}}
            onUpdate={(update) => onUpdateAnswer(question.id, update)}
            index={idx + 1}
          />
        ))}
      </div>
    </div>
  );
}

// =============================================
// Question Card
// =============================================

function QuestionCard({
  question,
  answer,
  onUpdate,
  index,
}: {
  question: TemplateSnapshotQuestion;
  answer: AnswerState;
  onUpdate: (update: Partial<AnswerState>) => void;
  index: number;
}) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
          {index}
        </span>
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground sm:text-base">
            {question.questionText}
          </p>
          {!question.isRequired && (
            <p className="mt-0.5 text-xs text-muted-foreground">Optional</p>
          )}
        </div>
      </div>

      {question.questionType === "RATING_5_STAR" && (
        <RatingStars
          value={answer.ratingValue ?? null}
          onChange={(v) => onUpdate({ ratingValue: v })}
        />
      )}

      {question.questionType === "ENPS" && (
        <EnpsScale
          value={answer.ratingValue ?? null}
          onChange={(v) => onUpdate({ ratingValue: v })}
        />
      )}

      {question.questionType === "FREE_TEXT" && (
        <FreeText
          value={answer.textValue ?? ""}
          onChange={(v) => onUpdate({ textValue: v })}
        />
      )}

      {question.questionType === "MULTIPLE_CHOICE" && (
        <MultipleChoice
          options={question.options || []}
          value={answer.choiceValues ?? []}
          onChange={(v) => onUpdate({ choiceValues: v })}
        />
      )}

      {question.questionType === "SINGLE_CHOICE" && (
        <SingleChoice
          options={question.options || []}
          value={answer.singleChoiceValue ?? null}
          onChange={(v) => onUpdate({ singleChoiceValue: v })}
          questionId={question.id}
        />
      )}
    </div>
  );
}

// =============================================
// Rating 5 Stars
// =============================================

function RatingStars({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = (hover ?? value ?? 0) >= star;
        return (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(null)}
            className="h-10 w-10 touch-manipulation transition-transform active:scale-110"
            aria-label={`${star} Stern${star !== 1 ? "e" : ""}`}
          >
            <svg
              viewBox="0 0 24 24"
              className={`h-full w-full transition-colors ${
                filled ? "fill-yellow-400 text-yellow-400" : "fill-none text-gray-300"
              }`}
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
              />
            </svg>
          </button>
        );
      })}
      {value && (
        <span className="ml-2 text-sm text-muted-foreground">{value}/5</span>
      )}
    </div>
  );
}

// =============================================
// eNPS Scale (0-10)
// =============================================

function EnpsScale({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
}) {
  const getColor = (n: number) => {
    if (n >= 9) return "bg-green-500 text-white";
    if (n >= 7) return "bg-yellow-400 text-gray-900";
    return "bg-red-500 text-white";
  };

  const getSelectedColor = (n: number) => {
    if (n >= 9) return "ring-green-600 bg-green-600 text-white";
    if (n >= 7) return "ring-yellow-500 bg-yellow-500 text-gray-900";
    return "ring-red-600 bg-red-600 text-white";
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        {Array.from({ length: 11 }, (_, i) => i).map((n) => {
          const isSelected = value === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={`flex h-10 w-10 touch-manipulation items-center justify-center rounded-lg text-sm font-bold transition-all sm:h-11 sm:w-11 ${
                isSelected
                  ? `ring-2 ring-offset-2 ${getSelectedColor(n)} scale-110`
                  : `${getColor(n)} opacity-70 hover:opacity-100 active:scale-105`
              }`}
              aria-label={`${n} von 10`}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>Überhaupt nicht</span>
        <span>Sehr wahrscheinlich</span>
      </div>
    </div>
  );
}

// =============================================
// Free Text
// =============================================

function FreeText({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const maxChars = 2000;

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, maxChars))}
        rows={4}
        placeholder="Ihre Antwort..."
        className="w-full rounded-lg border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-ring focus:ring-1 focus:ring-ring"
      />
      <p className="mt-1 text-right text-xs text-muted-foreground">
        {value.length} / {maxChars}
      </p>
    </div>
  );
}

// =============================================
// Multiple Choice (Checkboxes)
// =============================================

function MultipleChoice({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggleOption = (option: string) => {
    if (value.includes(option)) {
      onChange(value.filter((v) => v !== option));
    } else {
      onChange([...value, option]);
    }
  };

  return (
    <div className="space-y-2">
      {options.map((option) => {
        const checked = value.includes(option);
        return (
          <label
            key={option}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors sm:p-4 ${
              checked
                ? "border-credo-gruen bg-credo-gruen/5"
                : "border-input hover:bg-muted/50"
            }`}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggleOption(option)}
              className="h-5 w-5 shrink-0 cursor-pointer rounded border-gray-300 accent-credo-gruen"
            />
            <span className="text-sm text-foreground">{option}</span>
          </label>
        );
      })}
    </div>
  );
}

// =============================================
// Single Choice (Radio)
// =============================================

function SingleChoice({
  options,
  value,
  onChange,
  questionId,
}: {
  options: string[];
  value: string | null;
  onChange: (v: string) => void;
  questionId: string;
}) {
  return (
    <div className="space-y-2">
      {options.map((option) => {
        const selected = value === option;
        return (
          <label
            key={option}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors sm:p-4 ${
              selected
                ? "border-credo-gruen bg-credo-gruen/5"
                : "border-input hover:bg-muted/50"
            }`}
          >
            <input
              type="radio"
              name={`radio-${questionId}`}
              checked={selected}
              onChange={() => onChange(option)}
              className="h-5 w-5 shrink-0 cursor-pointer accent-credo-gruen"
            />
            <span className="text-sm text-foreground">{option}</span>
          </label>
        );
      })}
    </div>
  );
}

// =============================================
// Summary Step
// =============================================

function SummaryStep({
  categories,
  answers,
  templateSnapshot,
}: {
  categories: TemplateSnapshotCategory[];
  answers: Record<string, AnswerState>;
  templateSnapshot: { name: string };
}) {
  // Count answered questions
  const totalQuestions = categories.reduce((acc, cat) => acc + cat.questions.length, 0);
  const answeredQuestions = categories.reduce((acc, cat) => {
    return (
      acc +
      cat.questions.filter((q) => {
        const a = answers[q.id];
        if (!a) return false;
        switch (q.questionType) {
          case "RATING_5_STAR":
          case "ENPS":
            return a.ratingValue != null;
          case "FREE_TEXT":
            return a.textValue != null && a.textValue.trim().length > 0;
          case "MULTIPLE_CHOICE":
            return a.choiceValues != null && a.choiceValues.length > 0;
          case "SINGLE_CHOICE":
            return a.singleChoiceValue != null;
          default:
            return false;
        }
      }).length
    );
  }, 0);

  const renderAnswerPreview = (q: TemplateSnapshotQuestion) => {
    const a = answers[q.id];
    if (!a) return <span className="text-muted-foreground">Keine Antwort</span>;

    switch (q.questionType) {
      case "RATING_5_STAR": {
        if (a.ratingValue == null) return <span className="text-muted-foreground">Keine Antwort</span>;
        return (
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <svg
                key={star}
                viewBox="0 0 24 24"
                className={`h-4 w-4 ${
                  star <= (a.ratingValue ?? 0)
                    ? "fill-yellow-400 text-yellow-400"
                    : "fill-none text-gray-300"
                }`}
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                />
              </svg>
            ))}
            <span className="ml-1 text-xs text-muted-foreground">{a.ratingValue}/5</span>
          </div>
        );
      }
      case "ENPS": {
        if (a.ratingValue == null) return <span className="text-muted-foreground">Keine Antwort</span>;
        const color = a.ratingValue >= 9 ? "text-green-600" : a.ratingValue >= 7 ? "text-yellow-600" : "text-red-600";
        return <span className={`font-bold ${color}`}>{a.ratingValue}/10</span>;
      }
      case "FREE_TEXT":
        if (!a.textValue || a.textValue.trim().length === 0) return <span className="text-muted-foreground">Keine Antwort</span>;
        return (
          <p className="text-sm text-foreground">
            {a.textValue.length > 120 ? `${a.textValue.slice(0, 120)}...` : a.textValue}
          </p>
        );
      case "MULTIPLE_CHOICE":
        if (!a.choiceValues || a.choiceValues.length === 0) return <span className="text-muted-foreground">Keine Antwort</span>;
        return (
          <div className="flex flex-wrap gap-1.5">
            {a.choiceValues.map((c) => (
              <span key={c} className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
                {c}
              </span>
            ))}
          </div>
        );
      case "SINGLE_CHOICE":
        if (!a.singleChoiceValue) return <span className="text-muted-foreground">Keine Antwort</span>;
        return (
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
            {a.singleChoiceValue}
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">
          Zusammenfassung
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Bitte prüfen Sie Ihre Antworten, bevor Sie das Interview absenden.
        </p>
      </div>

      {/* Stats */}
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Beantwortete Fragen</p>
            <p className="text-lg font-bold text-foreground">
              {answeredQuestions} / {totalQuestions}
            </p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-credo-gruen/10">
            <svg className="h-6 w-6 text-credo-gruen" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-credo-gruen transition-all duration-500"
            style={{ width: `${totalQuestions > 0 ? Math.round((answeredQuestions / totalQuestions) * 100) : 0}%` }}
          />
        </div>
      </div>

      {/* Answers by category */}
      {categories.map((cat) => (
        <div key={cat.id} className="rounded-xl border bg-card shadow-sm">
          <div className="border-b px-5 py-3 sm:px-6">
            <h3 className="text-sm font-bold text-foreground">{cat.name}</h3>
          </div>
          <div className="divide-y">
            {cat.questions.map((q) => (
              <div key={q.id} className="px-5 py-3 sm:px-6">
                <p className="mb-1.5 text-xs text-muted-foreground">
                  {q.questionText}
                  {!q.isRequired && " (optional)"}
                </p>
                {renderAnswerPreview(q)}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="rounded-xl border border-credo-gelb/30 bg-credo-gelb/5 p-4 text-center">
        <p className="text-sm text-foreground">
          Mit dem Klick auf <strong>Absenden</strong> werden Ihre Antworten endgültig übermittelt.
        </p>
      </div>
    </div>
  );
}
