"use client";

/**
 * Multi-Step Personalfragebogen
 *
 * 10 Steps mit Fortschrittsanzeige, Auto-Save nach jedem Step,
 * und CREDO Corporate Design.
 */

import { useState, useCallback } from "react";
import Image from "next/image";
import { CredoLinie } from "@/components/credo-linie";
import { STEP_CONFIG } from "@/lib/validations/personal-data";

// Step-Komponenten
import { Step1Personal } from "./steps/step1-personal";
import { Step2Address } from "./steps/step2-address";
import { Step3Bank } from "./steps/step3-bank";
import { Step4SocialSecurity } from "./steps/step4-social-security";
import { Step5Tax } from "./steps/step5-tax";
import { Step6Employment } from "./steps/step6-employment";
import { Step7Children } from "./steps/step7-children";
import { Step8Education } from "./steps/step8-education";
import { Step9Masern } from "./steps/step9-masern";
import { Step10Summary } from "./steps/step10-summary";

interface OnboardingData {
  onboardingId: string;
  email: string;
  organization: {
    name: string;
    mandantNumber: string;
    type: string;
  };
  questionnaireType: string;
  status: string;
  personalData: Record<string, unknown> | null;
}

interface FragebogenFormProps {
  token: string;
  initialData: OnboardingData;
}

export function FragebogenForm({ token, initialData }: FragebogenFormProps) {
  const savedStep =
    (initialData.personalData?.currentStep as number) || 0;
  const [currentStep, setCurrentStep] = useState(savedStep);
  const [formData, setFormData] = useState<Record<string, unknown>>(
    initialData.personalData || {}
  );
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // Auto-Save: Step-Daten an API senden
  const saveStepData = useCallback(
    async (stepData: Record<string, unknown>, nextStep: number) => {
      setSaving(true);
      setSaveMessage("");
      try {
        const res = await fetch(`/api/fragebogen/${token}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...stepData,
            currentStep: nextStep,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          setSaveMessage(err.error || "Fehler beim Speichern.");
          return false;
        }

        setSaveMessage("Gespeichert");
        setTimeout(() => setSaveMessage(""), 2000);
        return true;
      } catch {
        setSaveMessage("Verbindungsfehler beim Speichern.");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [token]
  );

  // Weiter zum naechsten Step
  const handleNext = async (stepData: Record<string, unknown>) => {
    const merged = { ...formData, ...stepData };
    setFormData(merged);

    const nextStep = currentStep + 1;
    const saved = await saveStepData(stepData, nextStep);
    if (saved) {
      setCurrentStep(nextStep);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Zurueck zum vorherigen Step
  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Fragebogen endgueltig absenden
  const handleSubmit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/fragebogen/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dsgvoAccepted: true }),
      });

      if (!res.ok) {
        const err = await res.json();
        setSaveMessage(err.error || "Fehler beim Absenden.");
        return;
      }

      setSubmissionTime(new Date());
      setSubmitted(true);
    } catch {
      setSaveMessage("Verbindungsfehler. Bitte versuchen Sie es erneut.");
    } finally {
      setSaving(false);
    }
  };

  // Signatur-ID generieren (deterministisch aus Onboarding-ID + Zeitstempel)
  const generateSignatureId = () => {
    const year = new Date().getFullYear();
    const shortId = initialData.onboardingId.substring(0, 8).toUpperCase();
    return `CREDO-PF-${year}-${shortId}`;
  };

  const [submissionTime, setSubmissionTime] = useState<Date | null>(null);
  const fullName = formData.firstName && formData.lastName
    ? `${formData.firstName} ${formData.lastName}`
    : initialData.email;
  const verificationCode = `${token.substring(0, 4)}-${token.substring(token.length - 4)}`.toUpperCase();

  // Erfolgsmeldung nach Absenden – mit digitaler Signatur
  if (submitted && submissionTime) {
    const signatureId = generateSignatureId();

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-4 py-8">
        <div className="w-full max-w-lg overflow-hidden rounded-xl bg-card shadow-2xl">
          {/* Header */}
          <div className="bg-primary px-8 py-6 text-center">
            <Image
              src="/credo_logo_claim.svg"
              alt="CREDO"
              width={180}
              height={58}
              className="mx-auto mb-3 brightness-0 invert"
              priority
            />
            <p className="text-xs font-medium text-primary-foreground/80">
              Digitale Bestaetigung &middot; Personalfragebogen
            </p>
          </div>

          {/* Erfolg */}
          <div className="px-8 pt-6 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-foreground">
              Erfolgreich eingereicht!
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Ihr Personalfragebogen wurde sicher uebermittelt.
            </p>
          </div>

          {/* ============================================= */}
          {/* Digitale Signatur / Bestaetigungszertifikat */}
          {/* ============================================= */}
          <div className="px-8 py-6">
            <div className="relative overflow-hidden rounded-xl border-2 border-primary/20 bg-muted/50 p-6">
              {/* Dezentes Wasserzeichen */}
              <div className="pointer-events-none absolute -right-6 -top-6 text-[120px] font-black leading-none text-primary/[0.03]">
                FES
              </div>

              {/* Signatur-ID */}
              <div className="mb-5 text-center">
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  Bestaetigungs-ID
                </p>
                <p className="mt-1 font-mono text-lg font-bold tracking-wider text-primary">
                  {signatureId}
                </p>
              </div>

              {/* Trennlinie im CREDO-Stil */}
              <div className="mb-5 flex h-[2px]">
                <div className="flex-1 bg-accent" />
                <div className="w-[12.5%] bg-credo-gelb" />
                <div className="w-[12.5%] bg-credo-gruen" />
                <div className="w-[12.5%] bg-credo-rot" />
                <div className="w-[12.5%] bg-credo-blau" />
              </div>

              {/* Details */}
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-semibold text-foreground">{fullName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Einrichtung</span>
                  <span className="font-medium text-foreground">
                    {initialData.organization.name} ({initialData.organization.mandantNumber})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Eingereicht am</span>
                  <span className="font-medium text-foreground">
                    {submissionTime.toLocaleDateString("de-DE", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}{" "}
                    um{" "}
                    {submissionTime.toLocaleTimeString("de-DE", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}{" "}
                    Uhr
                  </span>
                </div>
              </div>

              {/* Bestaetigung */}
              <div className="mt-5 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-green-700">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Personalfragebogen vollstaendig
                </div>
                <div className="flex items-center gap-2 text-xs text-green-700">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Erklaerung des Arbeitnehmers akzeptiert
                </div>
                <div className="flex items-center gap-2 text-xs text-green-700">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Datenschutzerklaerung akzeptiert
                </div>
              </div>

              {/* Signatur-Darstellung */}
              <div className="mt-6 border-t border-border/50 pt-5 text-center">
                <div className="inline-block">
                  {/* Handschrift-artige Signatur */}
                  <p
                    className="text-2xl text-primary"
                    style={{
                      fontFamily: "'Segoe Script', 'Brush Script MT', 'Lucida Handwriting', cursive",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {fullName}
                  </p>
                  <div className="mx-auto mt-1 h-[1px] w-48 bg-primary/40" />
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    Digitale Signatur via CREDO HR-Portal
                  </p>
                </div>
              </div>

              {/* Verifizierungscode */}
              <div className="mt-5 rounded-lg bg-card/60 px-3 py-2 text-center">
                <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                  Verifizierungscode
                </p>
                <p className="font-mono text-xs font-bold tracking-widest text-foreground">
                  {verificationCode}
                </p>
              </div>
            </div>
          </div>

          {/* Hinweis */}
          <div className="px-8 pb-6">
            <div className="rounded-lg bg-muted p-4 text-center">
              <p className="text-xs text-muted-foreground">
                Bitte bewahren Sie die Bestaetigungs-ID{" "}
                <strong className="text-foreground">{signatureId}</strong>{" "}
                fuer Ihre Unterlagen auf.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Sie koennen dieses Fenster jetzt schliessen.
              </p>
            </div>
          </div>

          {/* CREDO-Linie */}
          <CredoLinie />
        </div>

        {/* Footer */}
        <p className="mt-6 text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Christlicher Schulverein Minden e.V.
        </p>
      </div>
    );
  }

  // Step-Komponente rendern
  const stepProps = {
    data: formData,
    onNext: handleNext,
    onBack: handleBack,
    saving,
    questionnaireType: initialData.questionnaireType,
    organization: initialData.organization,
  };

  const stepComponents = [
    <Step1Personal key="s1" {...stepProps} />,
    <Step2Address key="s2" {...stepProps} />,
    <Step3Bank key="s3" {...stepProps} />,
    <Step4SocialSecurity key="s4" {...stepProps} />,
    <Step5Tax key="s5" {...stepProps} />,
    <Step6Employment key="s6" {...stepProps} />,
    <Step7Children key="s7" {...stepProps} />,
    <Step8Education key="s8" {...stepProps} />,
    <Step9Masern key="s9" {...stepProps} />,
    <Step10Summary
      key="s10"
      {...stepProps}
      allData={formData}
      onSubmit={handleSubmit}
      token={token}
    />,
  ];

  const progress = ((currentStep + 1) / STEP_CONFIG.length) * 100;

  return (
    <div className="min-h-screen bg-muted">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card shadow-sm">
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
              <h1 className="text-sm font-bold text-foreground">
                Personalfragebogen
              </h1>
              <p className="text-xs text-muted-foreground">
                {initialData.organization.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {saving && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
                Speichern...
              </span>
            )}
            {saveMessage && !saving && (
              <span className="text-xs text-green-600">{saveMessage}</span>
            )}
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              Schritt {currentStep + 1} / {STEP_CONFIG.length}
            </span>
          </div>
        </div>

        {/* Fortschrittsbalken */}
        <div className="h-1 w-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <CredoLinie height={2} />
      </header>

      {/* Step-Navigator (Horizontal) */}
      <nav className="border-b bg-card">
        <div className="mx-auto max-w-3xl overflow-x-auto px-4 py-2">
          <div className="flex gap-1">
            {STEP_CONFIG.map((step, index) => {
              const isActive = index === currentStep;
              const isDone = index < currentStep;
              const isFuture = index > currentStep;

              return (
                <button
                  key={step.number}
                  onClick={() => {
                    if (isDone) setCurrentStep(index);
                  }}
                  disabled={isFuture}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : isDone
                        ? "bg-green-100 text-green-800 hover:bg-green-200"
                        : "text-muted-foreground opacity-50"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                      isActive
                        ? "bg-primary-foreground text-primary"
                        : isDone
                          ? "bg-green-600 text-white"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isDone ? (
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    ) : (
                      step.number
                    )}
                  </span>
                  <span className="hidden lg:inline">{step.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Formular-Inhalt */}
      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="overflow-hidden rounded-xl bg-card shadow-sm">
          {/* Step-Header */}
          <div className="border-b bg-muted/50 px-6 py-4">
            <h2 className="text-lg font-bold text-foreground">
              {STEP_CONFIG[currentStep].title}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {STEP_CONFIG[currentStep].description}
            </p>
          </div>

          {/* Step-Inhalt */}
          <div className="p-6">{stepComponents[currentStep]}</div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t bg-card py-4 text-center">
        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Christlicher Schulverein Minden e.V.
          &middot; Ihre Daten werden verschluesselt uebertragen.
        </p>
      </footer>
    </div>
  );
}
