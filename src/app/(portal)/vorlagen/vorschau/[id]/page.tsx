"use client";

/**
 * Fragebogen-Vorschau für Admins (Vorschlag 6)
 *
 * Zeigt den Personalfragebogen so an, wie ihn ein Mitarbeiter sehen wuerde,
 * basierend auf der aktuellen Vorlagen-Konfiguration.
 *
 * - Kein Token erforderlich
 * - Keine Daten werden gespeichert
 * - Deutlicher "Vorschau"-Banner
 */

import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { CredoLinie } from "@/components/credo-linie";
import { getActiveSteps, type FragebogenStepKey } from "@/lib/fragebogen-steps";
import { FieldConfigHelper, type StepFieldConfig } from "@/lib/field-definitions";

import { Step1Personal } from "@/app/fragebogen/[token]/steps/step1-personal";
import { Step2Address } from "@/app/fragebogen/[token]/steps/step2-address";
import { Step3Bank } from "@/app/fragebogen/[token]/steps/step3-bank";
import { Step4SocialSecurity } from "@/app/fragebogen/[token]/steps/step4-social-security";
import { Step5Tax } from "@/app/fragebogen/[token]/steps/step5-tax";
import { Step6Employment } from "@/app/fragebogen/[token]/steps/step6-employment";
import { Step8Education } from "@/app/fragebogen/[token]/steps/step8-education";
import { Step9Masern } from "@/app/fragebogen/[token]/steps/step9-masern";

interface PreviewData {
  questionnaireType: string;
  templateName: string;
  templateVersion: number;
  stepsConfig: StepFieldConfig[];
}

export default function VorschauPage() {
  const params = useParams();
  const router = useRouter();
  const templateId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  useEffect(() => {
    fetch(`/api/vorlagen/${templateId}/preview`)
      .then((r) => {
        if (!r.ok) throw new Error("Vorschau nicht verfügbar");
        return r.json();
      })
      .then(setPreview)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [templateId]);

  // Die Schritte dieser Vorlage in Anzeigereihenfolge. Die Zusammenfassung
  // faellt raus — Pruefen und Absenden braucht die Vorschau nicht.
  const previewSteps = useMemo(
    () => getActiveSteps(preview?.stepsConfig).filter((s) => s.key !== "summary"),
    [preview?.stepsConfig]
  );

  const getFieldConfig = useCallback(
    (stepNumber: number): FieldConfigHelper => {
      const stepConfig = preview?.stepsConfig?.find((s) => s.step === stepNumber);
      return new FieldConfigHelper(stepNumber, stepConfig?.fields ?? undefined);
    },
    [preview?.stepsConfig]
  );

  // Vorschau: "Speichern" simuliert, keine echte API-Aufrufe
  const handleNext = (stepData: Record<string, unknown>) => {
    setFormData((prev) => ({ ...prev, ...stepData }));
    if (currentStep + 1 < previewSteps.length) {
      setCurrentStep(currentStep + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Vorschau wird geladen...</p>
        </div>
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted">
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-destructive">{error || "Vorschau nicht verfügbar"}</p>
          <button
            onClick={() => router.push("/vorlagen")}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            Zurück zu Vorlagen
          </button>
        </div>
      </div>
    );
  }

  const stepProps = {
    data: formData,
    onNext: handleNext,
    onBack: handleBack,
    saving: false,
    questionnaireType: preview.questionnaireType,
    organization: { name: "CREDO Vorschau", mandantNumber: "000", type: "VERWALTUNG" },
  };

  // Masken je Schritt-Schluessel. Die Zusammenfassung fehlt bewusst: Pruefen und
  // Absenden gehoert nicht in die Vorschau.
  const stepComponents: Partial<Record<FragebogenStepKey, ReactNode>> = {
    personal: <Step1Personal {...stepProps} fieldConfig={getFieldConfig(1)} />,
    address: <Step2Address {...stepProps} fieldConfig={getFieldConfig(2)} />,
    bank: <Step3Bank {...stepProps} fieldConfig={getFieldConfig(3)} />,
    social: <Step4SocialSecurity {...stepProps} fieldConfig={getFieldConfig(4)} />,
    tax: <Step5Tax {...stepProps} fieldConfig={getFieldConfig(5)} />,
    employment: <Step6Employment {...stepProps} fieldConfig={getFieldConfig(6)} />,
    education: <Step8Education {...stepProps} fieldConfig={getFieldConfig(8)} />,
    masern: <Step9Masern {...stepProps} fieldConfig={getFieldConfig(9)} />,
  };

  const activeStep = previewSteps[currentStep];
  const progress = ((currentStep + 1) / Math.max(previewSteps.length, 1)) * 100;

  return (
    <div className="min-h-screen bg-muted">
      {/* Vorschau-Banner */}
      <div className="sticky top-0 z-[60] bg-amber-500 px-4 py-2 text-center">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <span className="text-sm font-bold text-amber-900">
            VORSCHAU-MODUS – Keine Daten werden gespeichert
          </span>
          <div className="flex items-center gap-3">
            <span className="rounded bg-amber-400 px-2 py-0.5 text-xs font-medium text-amber-900">
              {preview.templateName} · v{preview.templateVersion}
            </span>
            <button
              onClick={() => router.push("/vorlagen")}
              className="rounded bg-amber-900 px-3 py-1 text-xs font-medium text-white hover:bg-amber-800"
            >
              Vorschau beenden
            </button>
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="sticky top-[40px] z-50 border-b bg-card shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Image
              src="/credo_logo.svg"
              alt="CREDO"
              width={100}
              height={33}
              priority
            />
            <div className="hidden sm:block">
              <h1 className="text-sm font-bold text-foreground">Personalfragebogen</h1>
              <p className="text-xs text-muted-foreground">Vorschau – {preview.templateName}</p>
            </div>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            Schritt {currentStep + 1} / {previewSteps.length}
          </span>
        </div>

        <div className="h-1 w-full bg-muted">
          <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <CredoLinie height={2} />
      </header>

      {/* Step-Navigator */}
      <nav className="border-b bg-card">
        <div className="mx-auto max-w-3xl overflow-x-auto px-4 py-2">
          <div className="flex gap-1">
            {previewSteps.map((step, index) => {
              const isActive = index === currentStep;
              const isDone = index < currentStep;
              return (
                <button
                  key={step.step}
                  onClick={() => { if (isDone) setCurrentStep(index); }}
                  disabled={!isDone && !isActive}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                    isActive ? "bg-primary text-primary-foreground"
                    : isDone ? "bg-green-100 text-green-800 hover:bg-green-200"
                    : "text-muted-foreground opacity-50"
                  }`}
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                    isActive ? "bg-primary-foreground text-primary"
                    : isDone ? "bg-green-600 text-white"
                    : "bg-muted text-muted-foreground"
                  }`}>
                    {isDone ? "✓" : index + 1}
                  </span>
                  <span className="hidden lg:inline">{step.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Step-Inhalt */}
      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="overflow-hidden rounded-xl bg-card shadow-sm">
          <div className="border-b bg-muted/50 px-6 py-4">
            <h2 className="text-lg font-bold text-foreground">
              {activeStep?.title ?? ""}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {activeStep?.description ?? ""}
            </p>
          </div>
          <div className="p-6">
            {(activeStep?.key ? stepComponents[activeStep.key] : null) ?? (
              <p className="text-muted-foreground">Schritt nicht in der Vorschau verfügbar.</p>
            )}
          </div>
        </div>
      </main>

      <footer className="mt-auto border-t bg-card py-4 text-center">
        <p className="text-xs text-muted-foreground">
          Vorschau-Modus – Diese Daten werden nicht gespeichert
        </p>
      </footer>
    </div>
  );
}
