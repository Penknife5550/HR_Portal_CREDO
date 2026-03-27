"use client";

/**
 * Einstellungsmodalitäten – Vorgesetzten-Formular
 *
 * Der Vorgesetzte füllt hier die Vertragsdaten, Vergütung
 * und Arbeitgeber-Zuordnung für den neuen Mitarbeiter aus.
 */

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { CredoLinie } from "@/components/credo-linie";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  supStep1Schema,
  supStep2Schema,
  supStep3Schema,
  supStep4Schema,
  SUP_STEP_CONFIG,
  type SupStep1Data,
  type SupStep2Data,
  type SupStep3Data,
  type SupStep4Data,
} from "@/lib/validations/supervisor-data";

interface OrgOption {
  id: string;
  mandantNumber: string;
  name: string;
  shortName: string | null;
  type: string;
}

interface ModalitaetenData {
  onboardingId: string;
  email: string;
  employeeName: string;
  organization: { name: string; mandantNumber: string; type: string };
  organizations: OrgOption[];
  supervisorData: Record<string, unknown> | null;
  status: string;
}

export default function ModalitaetenPage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageData, setPageData] = useState<ModalitaetenData | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/modalitaeten/${token}`);
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Fehler beim Laden.");
        return;
      }
      const result = await res.json();
      setPageData(result);
      if (result.supervisorData) {
        setFormData(result.supervisorData);
        setCurrentStep(result.supervisorData.currentStep || 0);
      }
    } catch {
      setError("Verbindungsfehler.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const saveStepData = async (
    stepData: Record<string, unknown>,
    nextStep: number
  ) => {
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch(`/api/modalitaeten/${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...stepData, currentStep: nextStep }),
      });
      if (!res.ok) return false;
      setSaveMsg("Gespeichert");
      setTimeout(() => setSaveMsg(""), 2000);
      return true;
    } catch {
      setSaveMsg("Fehler beim Speichern.");
      return false;
    } finally {
      setSaving(false);
    }
  };

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

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/modalitaeten/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json();
        setSaveMsg(err.error || "Fehler beim Absenden.");
        return;
      }
      setSubmitted(true);
    } catch {
      setSaveMsg("Verbindungsfehler.");
    } finally {
      setSaving(false);
    }
  };

  // Loading
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Wird geladen...</p>
        </div>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-4">
        <div className="w-full max-w-md overflow-hidden rounded-xl bg-card shadow-lg">
          <div className="p-8 text-center">
            <Image src="/credo_logo_claim.svg" alt="CREDO" width={200} height={65} className="mx-auto mb-6" priority />
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <svg className="h-8 w-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-foreground">Link nicht gültig</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          </div>
          <CredoLinie />
        </div>
      </div>
    );
  }

  // Already submitted
  if (submitted || pageData?.status === "SUPERVISOR_SUBMITTED" || pageData?.status === "REVIEWED" || pageData?.status === "COMPLETED") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-4">
        <div className="w-full max-w-md overflow-hidden rounded-xl bg-card shadow-lg">
          <div className="p-8 text-center">
            <Image src="/credo_logo_claim.svg" alt="CREDO" width={200} height={65} className="mx-auto mb-6" priority />
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-foreground">Vielen Dank!</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Die Einstellungsmodalitäten wurden erfolgreich eingereicht.
            </p>
          </div>
          <CredoLinie />
        </div>
      </div>
    );
  }

  if (!pageData) return null;

  const progress = ((currentStep + 1) / SUP_STEP_CONFIG.length) * 100;

  const stepProps = {
    data: formData,
    onNext: handleNext,
    onBack: handleBack,
    saving,
    organizations: pageData.organizations,
  };

  return (
    <div className="min-h-screen bg-muted">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Image src="/credo_logo.svg" alt="CREDO" width={100} height={33} priority />
            <div className="hidden sm:block">
              <h1 className="text-sm font-bold text-foreground">Einstellungsmodalitäten</h1>
              <p className="text-xs text-muted-foreground">
                für{pageData.employeeName} &middot; {pageData.organization.name}
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
            {saveMsg && !saving && <span className="text-xs text-green-600">{saveMsg}</span>}
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              Schritt {currentStep + 1} / {SUP_STEP_CONFIG.length}
            </span>
          </div>
        </div>
        <div className="h-1 w-full bg-muted">
          <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <CredoLinie height={2} />
      </header>

      {/* Step Navigation */}
      <nav className="border-b bg-card">
        <div className="mx-auto max-w-3xl px-4 py-2">
          <div className="flex gap-1">
            {SUP_STEP_CONFIG.map((step, idx) => {
              const isActive = idx === currentStep;
              const isDone = idx < currentStep;
              const isFuture = idx > currentStep;
              return (
                <button
                  key={step.number}
                  onClick={() => isDone && setCurrentStep(idx)}
                  disabled={isFuture}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    isActive ? "bg-primary text-primary-foreground" : isDone ? "bg-green-100 text-green-800 hover:bg-green-200" : "text-muted-foreground opacity-50"
                  }`}
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                    isActive ? "bg-primary-foreground text-primary" : isDone ? "bg-green-600 text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    {isDone ? (
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : step.number}
                  </span>
                  <span className="hidden md:inline">{step.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="overflow-hidden rounded-xl bg-card shadow-sm">
          <div className="border-b bg-muted/50 px-6 py-4">
            <h2 className="text-lg font-bold text-foreground">{SUP_STEP_CONFIG[currentStep].title}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{SUP_STEP_CONFIG[currentStep].description}</p>
          </div>
          <div className="p-6">
            {currentStep === 0 && <SupStep1 {...stepProps} />}
            {currentStep === 1 && <SupStep2 {...stepProps} />}
            {currentStep === 2 && <SupStep3 {...stepProps} />}
            {currentStep === 3 && <SupStep4 {...stepProps} />}
            {currentStep === 4 && (
              <SupStep5Summary
                data={formData}
                onBack={handleBack}
                saving={saving}
                onSubmit={() => setShowConfirmDialog(true)}
                organizations={pageData.organizations}
                employeeName={pageData.employeeName}
              />
            )}
          </div>
        </div>
      </main>

      {/* Bestätigungs-Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-foreground">Verbindlich absenden?</h3>
            </div>
            <p className="mb-2 text-sm text-muted-foreground">
              Sie sind dabei, die Einstellungsmodalitäten für <strong>{pageData.employeeName}</strong> verbindlich einzureichen.
            </p>
            <p className="mb-5 text-sm text-muted-foreground">
              Nach dem Absenden können die Daten <strong>nicht mehr geändert</strong> werden. Bitte stellen Sie sicher, dass alle Angaben korrekt sind.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmDialog(false)}
                className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
              >
                Zurück zur Prüfung
              </button>
              <button
                onClick={() => { setShowConfirmDialog(false); handleSubmit(); }}
                disabled={saving}
                className="flex-1 rounded-lg bg-[#6BAA24] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#5a9420] disabled:opacity-50"
              >
                {saving ? "Wird gesendet..." : "Ja, verbindlich absenden"}
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="mt-auto border-t bg-card py-4 text-center">
        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Christlicher Schulverein Minden e.V.
        </p>
      </footer>
    </div>
  );
}

// =============================================
// Step 1: Stelle & Vertrag
// =============================================
function SupStep1({
  data,
  onNext,
  saving,
}: {
  data: Record<string, unknown>;
  onNext: (d: Record<string, unknown>) => void;
  onBack: () => void;
  saving: boolean;
  organizations: OrgOption[];
}) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm<SupStep1Data>({
    resolver: zodResolver(supStep1Schema),
    defaultValues: {
      betriebsstaette: (data.betriebsstaette as string) || "",
      stellenbeschreibung: (data.stellenbeschreibung as string) || "",
      vertragsbeginn: (data.vertragsbeginn as string) || "",
      befristet: (data.befristet as boolean) || false,
      vertragsende: (data.vertragsende as string) || "",
      befristungSachgrund: (data.befristungSachgrund as string) || "",
    },
  });

  const befristet = watch("befristet");

  return (
    <form onSubmit={handleSubmit((v) => onNext(v as unknown as Record<string, unknown>))} className="space-y-5">
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Betriebsstätte <span className="text-destructive">*</span></label>
        <input type="text" {...register("betriebsstaette")} placeholder="z.B. Gymnasium Minden" className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
        {errors.betriebsstaette && <p className="text-xs text-destructive">{errors.betriebsstaette.message}</p>}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Stellenbeschreibung (wird in Arbeitsvertrag übernommen!) <span className="text-destructive">*</span></label>
        <textarea {...register("stellenbeschreibung")} rows={3} placeholder="z.B. Lehrkraft fürMathematik und Physik" className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
        {errors.stellenbeschreibung && <p className="text-xs text-destructive">{errors.stellenbeschreibung.message}</p>}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Vertragsbeginn <span className="text-destructive">*</span></label>
        <input type="date" {...register("vertragsbeginn")} className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
        {errors.vertragsbeginn && <p className="text-xs text-destructive">{errors.vertragsbeginn.message}</p>}
      </div>

      <div className="rounded-lg border border-border bg-muted/50 p-4">
        <label className="flex items-center gap-3">
          <input type="checkbox" {...register("befristet")} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <span className="text-sm font-medium text-foreground">Befristeter Vertrag</span>
        </label>
      </div>

      {befristet && (
        <div className="space-y-4 rounded-lg border border-border p-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Vertragsende</label>
            <input type="date" {...register("vertragsende")} className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Sachgrund der Befristung</label>
            <select {...register("befristungSachgrund")} className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring">
              <option value="">Ohne Sachgrund</option>
              <option value="vertretung">Vertretung</option>
              <option value="projektbezogen">Projektbezogen</option>
              <option value="erprobung">Erprobung</option>
              <option value="sonstig">Sonstiger Sachgrund</option>
            </select>
          </div>
        </div>
      )}

      <div className="flex justify-end pt-4">
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
          {saving ? "Speichern..." : "Weiter"}
        </button>
      </div>
    </form>
  );
}

// =============================================
// Step 2: Arbeitszeit & Arbeitgeber
// =============================================
function SupStep2({
  data,
  onNext,
  onBack,
  saving,
  organizations,
}: {
  data: Record<string, unknown>;
  onNext: (d: Record<string, unknown>) => void;
  onBack: () => void;
  saving: boolean;
  organizations: OrgOption[];
}) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm<SupStep2Data>({
    resolver: zodResolver(supStep2Schema),
    defaultValues: {
      vollzeit: (data.vollzeit as boolean) ?? true,
      wochenstunden: (data.wochenstunden as number) || null,
      tageProWoche: (data.tageProWoche as number) || null,
      hauptarbeitgeberId: (data.hauptarbeitgeberId as string) || "",
      hauptarbeitgeberStunden: (data.hauptarbeitgeberStunden as number) || null,
      nebenarbeitgeberId: (data.nebenarbeitgeberId as string) || "",
      nebenarbeitgeberStunden: (data.nebenarbeitgeberStunden as number) || null,
      svPflichtig: (data.svPflichtig as boolean) ?? true,
      minijob: (data.minijob as boolean) || false,
      ehrenamt: (data.ehrenamt as boolean) || false,
    },
  });

  const vollzeit = watch("vollzeit");

  return (
    <form onSubmit={handleSubmit((v) => onNext(v as unknown as Record<string, unknown>))} className="space-y-5">
      <div className="rounded-lg border border-border bg-muted/50 p-4">
        <label className="flex items-center gap-3">
          <input type="checkbox" {...register("vollzeit")} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <span className="text-sm font-medium text-foreground">Vollzeit</span>
        </label>
      </div>

      {!vollzeit && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Wochenstunden</label>
            <input type="number" {...register("wochenstunden", { valueAsNumber: true })} step={0.01} min={0} className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Tage pro Woche</label>
            <input type="number" {...register("tageProWoche", { valueAsNumber: true })} min={1} max={7} className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
          </div>
        </div>
      )}

      <div className="rounded-lg border border-[#009AC6]/20 bg-[#009AC6]/5 p-4">
        <p className="text-sm text-[#009AC6]">
          <strong>CREDO-Besonderheit:</strong> Ein Mitarbeiter kann bei zwei Einrichtungen gleichzeitig angestellt sein (Haupt- + Nebenarbeitgeber).
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Hauptarbeitgeber <span className="text-destructive">*</span></label>
        <select {...register("hauptarbeitgeberId")} className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring">
          <option value="">Bitte wählen...</option>
          {organizations.map((org) => (
            <option key={org.mandantNumber} value={org.mandantNumber}>
              {org.name} ({org.mandantNumber})
            </option>
          ))}
        </select>
        {errors.hauptarbeitgeberId && <p className="text-xs text-destructive">{errors.hauptarbeitgeberId.message}</p>}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Stunden beim Hauptarbeitgeber</label>
        <input type="number" {...register("hauptarbeitgeberStunden", { valueAsNumber: true })} step={0.01} min={0} className="w-32 rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Nebenarbeitgeber (optional)</label>
        <select {...register("nebenarbeitgeberId")} className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring">
          <option value="">Kein Nebenarbeitgeber</option>
          {organizations.map((org) => (
            <option key={org.mandantNumber} value={org.mandantNumber}>
              {org.name} ({org.mandantNumber})
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Stunden beim Nebenarbeitgeber</label>
        <input type="number" {...register("nebenarbeitgeberStunden", { valueAsNumber: true })} step={0.01} min={0} className="w-32 rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
      </div>

      <div className="space-y-3 rounded-lg border border-border p-4">
        <p className="text-sm font-medium text-foreground">Vertragsart</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("svPflichtig")} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          SV-pflichtig
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("minijob")} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          Minijob (geringfügig beschäftigt)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("ehrenamt")} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          Ehrenamt
        </label>
      </div>

      <div className="flex justify-between pt-4">
        <button type="button" onClick={onBack} className="rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent">Zurück</button>
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
          {saving ? "Speichern..." : "Weiter"}
        </button>
      </div>
    </form>
  );
}

// =============================================
// Step 3: Vergütung
// =============================================
function SupStep3({
  data,
  onNext,
  onBack,
  saving,
}: {
  data: Record<string, unknown>;
  onNext: (d: Record<string, unknown>) => void;
  onBack: () => void;
  saving: boolean;
  organizations: OrgOption[];
}) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm<SupStep3Data>({
    resolver: zodResolver(supStep3Schema),
    defaultValues: {
      verguetungsmodell: (data.verguetungsmodell as SupStep3Data["verguetungsmodell"]) || undefined,
      entgeltgruppe: (data.entgeltgruppe as string) || "",
      stufe: (data.stufe as string) || "",
      festgehalt: (data.festgehalt as number) || null,
      stundenlohn: (data.stundenlohn as number) || null,
      bemerkungVergütung: (data.bemerkungVergütung as string) || "",
      jahressonderzahlung: (data.jahressonderzahlung as boolean) ?? true,
      sonderzahlungProzent: (data.sonderzahlungProzent as number) || null,
      sachbezuege: (data.sachbezuege as boolean) || false,
      sachbezuegeBetrag: (data.sachbezuegeBetrag as number) || null,
      zulage: (data.zulage as boolean) || false,
      zulageBetrag: (data.zulageBetrag as number) || null,
    },
  });

  const model = watch("verguetungsmodell");
  const sachbez = watch("sachbezuege");
  const zulage = watch("zulage");

  return (
    <form onSubmit={handleSubmit((v) => onNext(v as unknown as Record<string, unknown>))} className="space-y-5">
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Vergütungsmodell <span className="text-destructive">*</span></label>
        <select {...register("verguetungsmodell")} className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring">
          <option value="">Bitte wählen...</option>
          <option value="TV_L">TV-L (Tarifvertrag der Länder)</option>
          <option value="TV_L_S">TV-L S (Sozial- und Erziehungsdienst)</option>
          <option value="HAUSTARIF">Haustarif</option>
          <option value="SONSTIGES">Sonstiges</option>
        </select>
        {errors.verguetungsmodell && <p className="text-xs text-destructive">{errors.verguetungsmodell.message}</p>}
      </div>

      {(model === "TV_L" || model === "TV_L_S") && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Entgeltgruppe</label>
            <select {...register("entgeltgruppe")} className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring">
              <option value="">Bitte wählen...</option>
              {model === "TV_L" ? (
                <>
                  <option value="E1">E 1</option><option value="E2">E 2</option>
                  <option value="E3">E 3</option><option value="E4">E 4</option>
                  <option value="E5">E 5</option><option value="E6">E 6</option>
                  <option value="E7">E 7</option><option value="E8">E 8</option>
                  <option value="E9a">E 9a</option><option value="E9b">E 9b</option>
                  <option value="E10">E 10</option><option value="E11">E 11</option>
                  <option value="E12">E 12</option><option value="E13">E 13</option>
                  <option value="E14">E 14</option><option value="E15">E 15</option>
                </>
              ) : (
                <>
                  <option value="S2">S 2</option><option value="S3">S 3</option>
                  <option value="S4">S 4</option><option value="S7">S 7</option>
                  <option value="S8a">S 8a</option><option value="S8b">S 8b</option>
                  <option value="S9">S 9</option><option value="S11a">S 11a</option>
                  <option value="S11b">S 11b</option><option value="S12">S 12</option>
                  <option value="S13">S 13</option><option value="S14">S 14</option>
                  <option value="S15">S 15</option><option value="S17">S 17</option>
                  <option value="S18">S 18</option>
                </>
              )}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Stufe</label>
            <select {...register("stufe")} className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring">
              <option value="">Bitte wählen...</option>
              <option value="1">Stufe 1</option><option value="2">Stufe 2</option>
              <option value="3">Stufe 3</option><option value="4">Stufe 4</option>
              <option value="5">Stufe 5</option><option value="6">Stufe 6</option>
            </select>
          </div>
        </div>
      )}

      {(model === "HAUSTARIF" || model === "SONSTIGES") && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Festgehalt (brutto/Monat)</label>
            <div className="relative">
              <input type="number" {...register("festgehalt", { valueAsNumber: true })} step={0.01} min={0} className="w-full rounded-lg border border-input bg-background px-4 py-2.5 pr-12 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">EUR</span>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Stundenlohn (brutto)</label>
            <div className="relative">
              <input type="number" {...register("stundenlohn", { valueAsNumber: true })} step={0.01} min={0} className="w-full rounded-lg border border-input bg-background px-4 py-2.5 pr-12 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">EUR</span>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Bemerkung zur Vergütung</label>
        <textarea {...register("bemerkungVergütung")} rows={2} className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
      </div>

      <div className="space-y-3 rounded-lg border border-border p-4">
        <label className="flex items-center gap-3">
          <input type="checkbox" {...register("jahressonderzahlung")} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <span className="text-sm font-medium text-foreground">Jahressonderzahlung</span>
        </label>
        <label className="flex items-center gap-3">
          <input type="checkbox" {...register("sachbezuege")} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <span className="text-sm font-medium text-foreground">Sachbezüge</span>
        </label>
        {sachbez && (
          <div className="ml-7">
            <input type="number" {...register("sachbezuegeBetrag", { valueAsNumber: true })} step={0.01} min={0} placeholder="Betrag in EUR" className="w-40 rounded-lg border border-input bg-background px-4 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
          </div>
        )}
        <label className="flex items-center gap-3">
          <input type="checkbox" {...register("zulage")} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <span className="text-sm font-medium text-foreground">Zulage</span>
        </label>
        {zulage && (
          <div className="ml-7">
            <input type="number" {...register("zulageBetrag", { valueAsNumber: true })} step={0.01} min={0} placeholder="Betrag in EUR" className="w-40 rounded-lg border border-input bg-background px-4 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
          </div>
        )}
      </div>

      <div className="flex justify-between pt-4">
        <button type="button" onClick={onBack} className="rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent">Zurück</button>
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
          {saving ? "Speichern..." : "Weiter"}
        </button>
      </div>
    </form>
  );
}

// =============================================
// Step 4: Zusätzliche Angaben
// =============================================
function SupStep4({
  data,
  onNext,
  onBack,
  saving,
}: {
  data: Record<string, unknown>;
  onNext: (d: Record<string, unknown>) => void;
  onBack: () => void;
  saving: boolean;
  organizations: OrgOption[];
}) {
  const { register, handleSubmit, watch } = useForm<SupStep4Data>({
    resolver: zodResolver(supStep4Schema),
    defaultValues: {
      kostenstelle: (data.kostenstelle as string) || "",
      kostenstelleAnteil: (data.kostenstelleAnteil as number) || null,
      probezeit: (data.probezeit as boolean) ?? true,
      probezeitMonate: (data.probezeitMonate as number) ?? 6,
      urlaubstageProJahr: (data.urlaubstageProJahr as number) ?? 30,
      masernschutzErforderlich: (data.masernschutzErforderlich as boolean) || false,
      masernschutzVorArbeitsbeginn: (data.masernschutzVorArbeitsbeginn as boolean) || false,
      zeiterfassung: (data.zeiterfassung as boolean) ?? true,
      zusatzvereinbarungen: (data.zusatzvereinbarungen as string) || "",
    },
  });

  const probezeit = watch("probezeit");
  const masern = watch("masernschutzErforderlich");

  return (
    <form onSubmit={handleSubmit((v) => onNext(v as unknown as Record<string, unknown>))} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Kostenstelle</label>
          <input type="text" {...register("kostenstelle")} className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Kostenstellenanteil (%)</label>
          <input type="number" {...register("kostenstelleAnteil", { valueAsNumber: true })} min={0} max={100} className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-3">
        <label className="flex items-center gap-3">
          <input type="checkbox" {...register("probezeit")} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <span className="text-sm font-medium text-foreground">Probezeit</span>
        </label>
        {probezeit && (
          <div className="ml-7 space-y-2">
            <label className="text-xs text-muted-foreground">Dauer in Monaten</label>
            <input type="number" {...register("probezeitMonate", { valueAsNumber: true })} min={0} max={12} className="w-24 rounded-lg border border-input bg-background px-4 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Urlaubstage pro Jahr</label>
        <input type="number" {...register("urlaubstageProJahr", { valueAsNumber: true })} min={0} max={50} className="w-24 rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
      </div>

      <div className="space-y-3 rounded-lg border border-border p-4">
        <label className="flex items-center gap-3">
          <input type="checkbox" {...register("masernschutzErforderlich")} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <span className="text-sm font-medium text-foreground">Masernschutz erforderlich</span>
        </label>
        {masern && (
          <label className="ml-7 flex items-center gap-3">
            <input type="checkbox" {...register("masernschutzVorArbeitsbeginn")} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
            <span className="text-sm text-foreground">Muss vor Arbeitsbeginn vorliegen</span>
          </label>
        )}
      </div>

      <div className="rounded-lg border border-border bg-muted/50 p-4">
        <label className="flex items-center gap-3">
          <input type="checkbox" {...register("zeiterfassung")} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <span className="text-sm font-medium text-foreground">Zeiterfassung erforderlich</span>
        </label>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Zusätzliche Vereinbarungen / Bemerkungen</label>
        <textarea {...register("zusatzvereinbarungen")} rows={4} placeholder="z.B. besondere Regelungen, Dienstwagen, etc." className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
      </div>

      <div className="flex justify-between pt-4">
        <button type="button" onClick={onBack} className="rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent">Zurück</button>
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
          {saving ? "Speichern..." : "Weiter"}
        </button>
      </div>
    </form>
  );
}

// =============================================
// Step 5: Zusammenfassung
// =============================================
function SupStep5Summary({
  data,
  onBack,
  saving,
  onSubmit,
  organizations,
  employeeName,
}: {
  data: Record<string, unknown>;
  onBack: () => void;
  saving: boolean;
  onSubmit: () => void;
  organizations: OrgOption[];
  employeeName: string;
}) {
  const str = (v: unknown): string => (v ? String(v) : "—");
  const findOrg = (id: unknown): string => {
    const org = organizations.find((o) => o.mandantNumber === id);
    return org ? `${org.name} (${org.mandantNumber})` : str(id);
  };

  const MODELL_LABELS: Record<string, string> = {
    TV_L: "TV-L",
    TV_L_S: "TV-L S (Sozial- und Erziehungsdienst)",
    HAUSTARIF: "Haustarif",
    SONSTIGES: "Sonstiges",
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <p className="text-sm text-green-800">
          Bitte prüfen Sie alle Angaben für<strong>{employeeName}</strong> sorgfältig.
        </p>
      </div>

      {/* Stelle & Vertrag */}
      <div className="rounded-lg border border-border">
        <div className="border-b bg-muted/50 px-4 py-2"><h3 className="text-sm font-semibold">1. Stelle & Vertrag</h3></div>
        <div className="px-4 py-3 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">Betriebsstätte</span><span className="font-medium">{str(data.betriebsstaette)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Stelle</span><span className="font-medium">{str(data.stellenbeschreibung)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Vertragsbeginn</span><span className="font-medium">{str(data.vertragsbeginn)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Befristet</span><span className="font-medium">{data.befristet ? "Ja" : "Nein"}</span></div>
          {!!data.befristet && <div className="flex justify-between"><span className="text-muted-foreground">Vertragsende</span><span className="font-medium">{str(data.vertragsende)}</span></div>}
        </div>
      </div>

      {/* Arbeitszeit */}
      <div className="rounded-lg border border-border">
        <div className="border-b bg-muted/50 px-4 py-2"><h3 className="text-sm font-semibold">2. Arbeitszeit & Arbeitgeber</h3></div>
        <div className="px-4 py-3 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">Vollzeit</span><span className="font-medium">{data.vollzeit ? "Ja" : "Nein"}</span></div>
          {!data.vollzeit && <div className="flex justify-between"><span className="text-muted-foreground">Wochenstunden</span><span className="font-medium">{str(data.wochenstunden)}</span></div>}
          <div className="flex justify-between"><span className="text-muted-foreground">Hauptarbeitgeber</span><span className="font-medium">{findOrg(data.hauptarbeitgeberId)}</span></div>
          {!!data.nebenarbeitgeberId && <div className="flex justify-between"><span className="text-muted-foreground">Nebenarbeitgeber</span><span className="font-medium">{findOrg(data.nebenarbeitgeberId)}</span></div>}
        </div>
      </div>

      {/* Vergütung */}
      <div className="rounded-lg border border-border">
        <div className="border-b bg-muted/50 px-4 py-2"><h3 className="text-sm font-semibold">3. Vergütung</h3></div>
        <div className="px-4 py-3 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">Modell</span><span className="font-medium">{MODELL_LABELS[str(data.verguetungsmodell)] || str(data.verguetungsmodell)}</span></div>
          {!!data.entgeltgruppe && <div className="flex justify-between"><span className="text-muted-foreground">Entgeltgruppe</span><span className="font-medium">{str(data.entgeltgruppe)}</span></div>}
          {!!data.stufe && <div className="flex justify-between"><span className="text-muted-foreground">Stufe</span><span className="font-medium">{str(data.stufe)}</span></div>}
          {!!data.festgehalt && <div className="flex justify-between"><span className="text-muted-foreground">Festgehalt</span><span className="font-medium">{str(data.festgehalt)} EUR</span></div>}
        </div>
      </div>

      {/* Zusätzliches */}
      <div className="rounded-lg border border-border">
        <div className="border-b bg-muted/50 px-4 py-2"><h3 className="text-sm font-semibold">4. Zusätzliche Angaben</h3></div>
        <div className="px-4 py-3 text-xs space-y-1">
          {!!data.kostenstelle && <div className="flex justify-between"><span className="text-muted-foreground">Kostenstelle</span><span className="font-medium">{str(data.kostenstelle)}</span></div>}
          <div className="flex justify-between"><span className="text-muted-foreground">Probezeit</span><span className="font-medium">{data.probezeit ? `${str(data.probezeitMonate)} Monate` : "Nein"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Urlaubstage</span><span className="font-medium">{str(data.urlaubstageProJahr)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Zeiterfassung</span><span className="font-medium">{data.zeiterfassung ? "Ja" : "Nein"}</span></div>
          {!!data.zusatzvereinbarungen && <div className="flex justify-between"><span className="text-muted-foreground">Zusatzvereinbarungen</span><span className="font-medium max-w-[60%] text-right">{str(data.zusatzvereinbarungen)}</span></div>}
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <button type="button" onClick={onBack} className="rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent">Zurück</button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={saving}
          className="rounded-lg bg-[#6BAA24] px-8 py-3 text-sm font-bold text-white transition-colors hover:bg-[#5a9420] disabled:opacity-50"
        >
          {saving ? "Wird gesendet..." : "Verbindlich absenden"}
        </button>
      </div>
    </div>
  );
}
