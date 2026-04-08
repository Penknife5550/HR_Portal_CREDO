"use client";

/**
 * Beurteilungs-Formular — Schulleitungs-Ansicht (Magic Link)
 *
 * Zwei Modi:
 * - BEURTEILUNG: 5-Step-Wizard im Onboarding-Stil mit Auto-Save,
 *                Sticky-Header mit Status-Stepper, Rechtsgrundlagen-Boxen
 *                und manuellem Gesamturteil (kein arithmetisches Mittel).
 * - REFERENZ:    Single-Page (delegiert an ReferenceForm)
 *
 * Apple-like UX, CREDO CI durchgängig (Theme-Variablen, Montserrat,
 * CredoLinie). Auto-Save debounced 800ms.
 */

import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import Image from "next/image";
import { CredoLinie } from "@/components/credo-linie";
import { BeurteilungStatusStepper } from "@/components/beurteilung-status-stepper";
import {
  deriveBeurteilungStatus,
  type BeurteilungStatus,
} from "@/lib/beurteilung-status";
import type { AssessmentData } from "./page";
import { ReferenceForm } from "./reference-form";
import {
  buildInitialFormState,
  type BeurteilungFormState,
} from "./steps/types";
import { Step1Vorbereitung } from "./steps/step1-vorbereitung";
import { Step2Beobachtung } from "./steps/step2-beobachtung";
import { Step3Gesamturteil } from "./steps/step3-gesamturteil";
import { Step4Gespraech } from "./steps/step4-gespraech";
import { Step5Summary } from "./steps/step5-summary";

const SAVE_DEBOUNCE_MS = 800;

const STEPS = [
  { num: 1, label: "Vorbereitung" },
  { num: 2, label: "Beobachtung" },
  { num: 3, label: "Gesamturteil" },
  { num: 4, label: "Gespräch" },
  { num: 5, label: "Einreichen" },
] as const;

interface AssessmentFormProps {
  token: string;
  initialData: AssessmentData;
}

export function AssessmentForm({ token, initialData }: AssessmentFormProps) {
  // REFERENZ → eigene Komponente
  if (initialData.assessmentType === "REFERENZ") {
    return <ReferenceFormWrapper token={token} initialData={initialData} />;
  }

  return <BeurteilungWizard token={token} initialData={initialData} />;
}

// =============================================
// REFERENZ Wrapper (mit gemeinsamem Header)
// =============================================
function ReferenceFormWrapper({
  token,
  initialData,
}: AssessmentFormProps) {
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <SubmittedScreen
        title="Referenz eingereicht"
        employeeName={initialData.employee.name}
        verifyToken={initialData.verifyToken}
      />
    );
  }

  return (
    <div className="min-h-screen bg-muted flex flex-col">
      <header className="border-b bg-card shadow-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Image
            src="/credo_logo.svg"
            alt="CREDO"
            width={100}
            height={33}
            priority
          />
          <span className="text-xs font-medium text-muted-foreground">
            Referenz · {initialData.employee.organizationName}
          </span>
        </div>
      </header>
      <div className="flex-1">
        <ReferenceForm
          token={token}
          initialData={initialData}
          onSubmitted={() => setSubmitted(true)}
        />
      </div>
      <CredoLinie />
    </div>
  );
}

// =============================================
// BEURTEILUNG Multi-Step Wizard
// =============================================
function BeurteilungWizard({ token, initialData }: AssessmentFormProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [formState, setFormState] = useState<BeurteilungFormState>(() =>
    buildInitialFormState(initialData),
  );
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDataRef = useRef(false);
  const formStateRef = useRef(formState);
  formStateRef.current = formState;

  // =============================================
  // Auto-Save (debounced)
  // =============================================
  const flushSave = useCallback(async () => {
    if (!pendingDataRef.current) return;
    pendingDataRef.current = false;

    setSaving(true);
    setErrorMessage(null);

    const fs = formStateRef.current;
    const body: Record<string, unknown> = {
      ratingsData: fs.ratings,
      scheduledDate: fs.scheduledDate
        ? new Date(fs.scheduledDate).toISOString()
        : null,
      fach: fs.fach,
      klasse: fs.klasse,
      vertrauenslehrkraft: fs.vertrauenslehrkraft,
      unbiasedConfirmed: fs.unbiasedConfirmed,
      meetsRequirementsManual: fs.meetsRequirementsManual,
      overallReasoning: fs.overallReasoning,
      postReviewAt: fs.postReviewAt
        ? new Date(fs.postReviewAt).toISOString()
        : null,
      postReviewNotes: fs.postReviewNotes,
      beurteilungsgespraechAt: fs.beurteilungsgespraechAt
        ? new Date(fs.beurteilungsgespraechAt).toISOString()
        : null,
      beurteilungsgespraechNotes: fs.beurteilungsgespraechNotes,
    };

    try {
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
        err instanceof Error ? err.message : "Fehler beim Speichern.",
      );
      setTimeout(() => setErrorMessage(null), 5000);
    } finally {
      setSaving(false);
    }
  }, [token]);

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

  // =============================================
  // Status (live aus formState abgeleitet)
  // =============================================
  const currentStatus: BeurteilungStatus = useMemo(
    () =>
      deriveBeurteilungStatus({
        unbiasedConfirmed: formState.unbiasedConfirmed,
        ratingsData: formState.ratings,
        meetsRequirementsManual: formState.meetsRequirementsManual,
        overallReasoning: formState.overallReasoning,
        beurteilungsgespraechAt: formState.beurteilungsgespraechAt || null,
        submittedAt: submitted ? new Date().toISOString() : null,
        archivedAt: null,
        templateSnapshot: initialData.templateSnapshot,
      }),
    [formState, initialData.templateSnapshot, submitted],
  );

  // =============================================
  // Validierung pro Step
  // =============================================
  const stepValidation = useMemo(() => {
    const snapshot = initialData.templateSnapshot;
    const totalCriteria =
      snapshot?.categories.reduce((s, c) => s + c.criteria.length, 0) ?? 0;
    const ratedCriteria = Object.keys(formState.ratings).length;
    const reasoningLength = formState.overallReasoning.trim().length;

    return {
      step1: formState.unbiasedConfirmed,
      step2: ratedCriteria === totalCriteria && totalCriteria > 0,
      step3:
        formState.meetsRequirementsManual !== null && reasoningLength >= 200,
      step4: Boolean(formState.beurteilungsgespraechAt),
      step5: true,
      totalCriteria,
      ratedCriteria,
    };
  }, [formState, initialData.templateSnapshot]);

  const canSubmit =
    stepValidation.step1 &&
    stepValidation.step2 &&
    stepValidation.step3 &&
    stepValidation.step4;

  // =============================================
  // Step-Navigation
  // =============================================
  function goToStep(step: number) {
    if (step < 1 || step > STEPS.length) return;
    // Erst speichern, dann wechseln
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (pendingDataRef.current) {
      void flushSave();
    }
    setCurrentStep(step);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  const handleChange = useCallback(() => {
    scheduleSave();
  }, [scheduleSave]);

  // =============================================
  // Submit
  // =============================================
  async function handleSubmit() {
    if (!canSubmit || submitting) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    pendingDataRef.current = true;
    await flushSave();

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch(
        `/api/civil-service-assessment/${token}/submit`,
        { method: "POST" },
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Fehler beim Einreichen");
      }
      setSubmitted(true);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Fehler beim Einreichen.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  // =============================================
  // Erfolgsbildschirm
  // =============================================
  if (submitted) {
    return (
      <SubmittedScreen
        title="Beurteilung eingereicht"
        employeeName={initialData.employee.name}
        verifyToken={initialData.verifyToken}
      />
    );
  }

  // =============================================
  // Hauptformular
  // =============================================
  const stepProps = {
    initialData,
    formState,
    setFormState,
    onChange: handleChange,
  };

  return (
    <div className="min-h-screen bg-muted flex flex-col">
      {/* ===== Sticky Header ===== */}
      <header className="sticky top-0 z-50 border-b bg-card shadow-sm">
        <div className="mx-auto max-w-3xl px-4 py-3 space-y-3">
          {/* Top-Zeile: Logo + Mitarbeiter + Save-Indikator */}
          <div className="flex items-center justify-between gap-3">
            <Image
              src="/credo_logo.svg"
              alt="CREDO"
              width={90}
              height={30}
              priority
            />
            <div className="flex items-center gap-3 min-w-0">
              <div className="text-right min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">
                  {initialData.employee.name}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {initialData.employee.organizationName} ·{" "}
                  {initialData.assessmentNumber}. Unterrichtsbesuch
                </p>
              </div>
              {saving ? (
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  Speichere…
                </span>
              ) : lastSaved ? (
                <span className="text-[10px] text-credo-gruen whitespace-nowrap">
                  ✓ Gespeichert
                </span>
              ) : null}
            </div>
          </div>

          {/* Status-Stepper */}
          <div className="hidden md:block">
            <BeurteilungStatusStepper
              status={currentStatus}
              variant="full"
            />
          </div>
          <div className="md:hidden">
            <BeurteilungStatusStepper
              status={currentStatus}
              variant="compact"
            />
          </div>

          {/* Step-Tabs */}
          <div className="flex items-center justify-between gap-1 overflow-x-auto">
            {STEPS.map((step) => {
              const isActive = currentStep === step.num;
              const isPast = currentStep > step.num;
              return (
                <button
                  key={step.num}
                  type="button"
                  onClick={() => goToStep(step.num)}
                  className={`flex-1 min-w-0 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? "bg-credo-blau text-white"
                      : isPast
                        ? "bg-credo-gruen/10 text-credo-gruen"
                        : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {step.num}. {step.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* ===== Fehler-Banner ===== */}
      {errorMessage && (
        <div className="mx-auto w-full max-w-3xl px-4 pt-3">
          <div className="rounded-lg border border-credo-rot/30 bg-credo-rot/10 p-3 text-sm text-credo-rot">
            {errorMessage}
          </div>
        </div>
      )}

      {/* ===== Step-Inhalt ===== */}
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-6">
        {currentStep === 1 && <Step1Vorbereitung {...stepProps} />}
        {currentStep === 2 && <Step2Beobachtung {...stepProps} />}
        {currentStep === 3 && <Step3Gesamturteil {...stepProps} />}
        {currentStep === 4 && <Step4Gespraech {...stepProps} />}
        {currentStep === 5 && <Step5Summary {...stepProps} />}

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => goToStep(currentStep - 1)}
            disabled={currentStep === 1}
            className="rounded-xl border border-border bg-card px-5 py-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ← Zurück
          </button>

          {currentStep < STEPS.length ? (
            <button
              type="button"
              onClick={() => goToStep(currentStep + 1)}
              className="rounded-xl bg-credo-blau px-6 py-3 text-sm font-semibold text-white hover:bg-credo-blau/90"
            >
              Weiter →
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className={`rounded-xl px-6 py-3 text-sm font-bold transition-all ${
                canSubmit && !submitting
                  ? "bg-primary text-primary-foreground shadow-lg hover:shadow-xl"
                  : "cursor-not-allowed bg-muted text-muted-foreground"
              }`}
            >
              {submitting ? "Wird eingereicht…" : "Beurteilung einreichen"}
            </button>
          )}
        </div>

        {/* Validierungs-Hinweise im letzten Step */}
        {currentStep === STEPS.length && !canSubmit && (
          <div className="mt-4 rounded-lg border border-credo-gelb/30 bg-credo-gelb/5 p-4 text-xs text-foreground">
            <p className="font-semibold mb-2">
              Vor dem Einreichen sind folgende Punkte erforderlich:
            </p>
            <ul className="space-y-1 list-disc list-inside">
              {!stepValidation.step1 && (
                <li>Schritt 1: Befangenheits-Erklärung bestätigen</li>
              )}
              {!stepValidation.step2 && (
                <li>
                  Schritt 2: Alle {stepValidation.totalCriteria} Kriterien
                  bewerten ({stepValidation.ratedCriteria} bisher)
                </li>
              )}
              {!stepValidation.step3 && (
                <li>
                  Schritt 3: Gesamturteil + Begründung (mind. 200 Zeichen)
                </li>
              )}
              {!stepValidation.step4 && (
                <li>Schritt 4: Beurteilungsgespräch dokumentieren</li>
              )}
            </ul>
          </div>
        )}
      </main>

      {/* ===== Footer ===== */}
      <footer className="mt-auto border-t bg-card py-6 text-center">
        <p className="text-xs text-muted-foreground">
          Ihre Eingaben werden verschlüsselt übertragen und gemäß DSGVO
          verarbeitet.
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground">
          © {new Date().getFullYear()} Christlicher Schulverein Minden e.V. · CREDO HR-Portal
        </p>
      </footer>
      <CredoLinie />
    </div>
  );
}

// =============================================
// Erfolgsbildschirm (Zertifikat-Layout)
// =============================================
function SubmittedScreen({
  title,
  employeeName,
  verifyToken,
}: {
  title: string;
  employeeName: string;
  verifyToken: string | null;
}) {
  const verifyHash = useMemo(() => {
    if (!verifyToken) return null;
    const clean = verifyToken.replace(/-/g, "");
    return `CRD-${clean.slice(0, 4).toUpperCase()}-${clean.slice(4, 8).toUpperCase()}`;
  }, [verifyToken]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-4">
      <div className="w-full max-w-lg overflow-hidden rounded-xl bg-card shadow-2xl">
        <div className="p-8 text-center">
          <Image
            src="/credo_logo_claim.svg"
            alt="CREDO"
            width={200}
            height={65}
            className="mx-auto mb-6"
            priority
          />
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-credo-gruen/15">
            <svg
              className="h-8 w-8 text-credo-gruen"
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
          <h1 className="text-xl font-bold text-foreground">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Vielen Dank für Ihre Beurteilung von{" "}
            <span className="font-medium text-foreground">{employeeName}</span>.
          </p>

          {verifyHash && (
            <div className="mt-6 rounded-xl border border-credo-gruen/30 bg-credo-gruen/5 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-credo-gruen mb-1">
                Verifikations-Code
              </p>
              <p className="font-mono text-base font-bold text-foreground">
                {verifyHash}
              </p>
              <p className="mt-2 text-[10px] text-muted-foreground">
                Über diesen Code kann die Beurteilung später durch unabhängige
                Dritte (z. B. Bezirksregierung) verifiziert werden.
              </p>
            </div>
          )}

          <p className="mt-6 text-xs text-muted-foreground">
            Die Personalabteilung wird die Beurteilung prüfen und der Lehrkraft
            zur Bekanntgabe vorlegen. Sie können dieses Fenster jetzt schließen.
          </p>
        </div>
        <CredoLinie />
      </div>
    </div>
  );
}
