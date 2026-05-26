"use client";

/**
 * Elternzeit-Antrag (endgültig) — 3-Schritt-Formular (Phase 2)
 *
 * Schritt 1: Kind-Daten (Name, Geburtsdatum, Geschlecht, Fruehgeburt, Mehrlinge)
 * Schritt 2: Geburtsurkunde-Upload (PDF/JPG/PNG, max 10 MB)
 * Schritt 3: Bestaetigung + DSGVO + Absenden
 *
 * Single-Use Schutz im Backend, mehrfacher Datei-Upload erlaubt.
 */

import { useState } from "react";
import Image from "next/image";
import { CredoLinie } from "@/components/credo-linie";
import type { ElternzeitAntragEndgData } from "./page";

const STEP_LABELS = ["Kind-Daten", "Geburtsurkunde", "Abschluss"];

interface FormState {
  kindName: string;
  kindGeburtsdatum: string;
  kindGeschlecht: "TOCHTER" | "SOHN" | "";
  fruehgeburt: boolean;
  mehrlinge: boolean;
  bestaetigungAngabenKorrekt: boolean;
  dsgvoEinwilligung: boolean;
}

export function ElternzeitAntragEndgForm({
  token,
  initialData,
}: {
  token: string;
  initialData: ElternzeitAntragEndgData;
}) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(
    initialData.geburtsurkundeBereitsHochgeladen,
  );
  const [uploadFilename, setUploadFilename] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>({
    kindName: initialData.kindName ?? "",
    kindGeburtsdatum: initialData.kindGeburtsdatum ?? "",
    kindGeschlecht: initialData.kindGeschlecht ?? "",
    fruehgeburt: initialData.fruehgeburt,
    mehrlinge: initialData.mehrlinge,
    bestaetigungAngabenKorrekt: false,
    dsgvoEinwilligung: false,
  });

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/elternzeit-antrag-endg/${token}/upload`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Upload fehlgeschlagen");
        return;
      }
      setUploadSuccess(true);
      setUploadFilename(file.name);
    } catch {
      setError("Verbindungsfehler beim Upload");
    } finally {
      setUploading(false);
    }
  };

  const canNext = (): boolean => {
    if (step === 1) {
      return Boolean(
        form.kindName.trim() &&
          form.kindGeburtsdatum &&
          (form.kindGeschlecht === "TOCHTER" || form.kindGeschlecht === "SOHN"),
      );
    }
    if (step === 2) return uploadSuccess;
    if (step === 3) {
      return form.bestaetigungAngabenKorrekt && form.dsgvoEinwilligung;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!canNext()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/elternzeit-antrag-endg/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kindName: form.kindName.trim(),
          kindGeburtsdatum: form.kindGeburtsdatum,
          kindGeschlecht: form.kindGeschlecht,
          fruehgeburt: form.fruehgeburt,
          mehrlinge: form.mehrlinge,
          geburtsurkundeHochgeladen: true,
          dsgvoEinwilligung: form.dsgvoEinwilligung,
          bestaetigungAngabenKorrekt: form.bestaetigungAngabenKorrekt,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Antrag konnte nicht abgesendet werden");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Verbindungsfehler beim Absenden");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted px-4">
        <div className="w-full max-w-md overflow-hidden rounded-xl bg-card shadow-lg">
          <div className="p-8 text-center">
            <Image
              src="/credo_logo_claim.svg"
              alt="CREDO"
              width={200}
              height={65}
              className="mx-auto mb-6"
              priority
            />
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-credo-gruen/10">
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
            <h1 className="text-lg font-bold text-foreground">
              Antrag erfolgreich abgesendet
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Vielen Dank! Wir haben Ihren endgültigen Elternzeit-Antrag und
              die Geburtsurkunde erhalten. Sie erhalten in Kuerze eine
              Bestaetigung der Personalabteilung.
            </p>
          </div>
          <CredoLinie />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted">
      <header className="bg-card shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Image
            src="/credo_logo_claim.svg"
            alt="CREDO"
            width={160}
            height={52}
            priority
          />
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Vorgang</p>
            <p className="font-mono text-sm font-semibold">
              {initialData.displayId}
            </p>
          </div>
        </div>
        <CredoLinie />
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">
            Endgültiger Elternzeit-Antrag
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {initialData.employeeName} · {initialData.organizationName}
          </p>
        </div>

        {/* Step Indicator */}
        <div className="mb-8 flex items-center gap-2">
          {STEP_LABELS.map((label, i) => {
            const n = i + 1;
            const active = n === step;
            const done = n < step;
            return (
              <div key={label} className="flex flex-1 items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : done
                        ? "bg-credo-gruen text-white"
                        : "bg-muted-foreground/20 text-muted-foreground"
                  }`}
                >
                  {n}
                </div>
                <span
                  className={`text-xs ${active ? "font-semibold" : "text-muted-foreground"}`}
                >
                  {label}
                </span>
                {i < STEP_LABELS.length - 1 && (
                  <div className="ml-2 h-px flex-1 bg-muted-foreground/20" />
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-4 py-3 text-sm text-credo-rot">
            {error}
          </div>
        )}

        <div className="rounded-lg border bg-card p-6">
          {/* Schritt 1: Kind-Daten */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Angaben zum Kind</h2>
              <p className="text-sm text-muted-foreground">
                Bitte geben Sie die endgültigen Daten Ihres Kindes ein.
                Falls die Personalabteilung bereits Daten hinterlegt hat,
                koennen Sie diese hier korrigieren.
              </p>
              <div>
                <label className="block text-sm font-medium">
                  Vorname des Kindes <span className="text-credo-rot">*</span>
                </label>
                <input
                  type="text"
                  value={form.kindName}
                  onChange={(e) => update("kindName", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm"
                  required
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium">
                    Geburtsdatum <span className="text-credo-rot">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.kindGeburtsdatum}
                    onChange={(e) =>
                      update("kindGeburtsdatum", e.target.value)
                    }
                    className="mt-1 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">
                    Geschlecht <span className="text-credo-rot">*</span>
                  </label>
                  <select
                    value={form.kindGeschlecht}
                    onChange={(e) =>
                      update(
                        "kindGeschlecht",
                        e.target.value as FormState["kindGeschlecht"],
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm"
                    required
                  >
                    <option value="">Bitte waehlen</option>
                    <option value="TOCHTER">Tochter</option>
                    <option value="SOHN">Sohn</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.fruehgeburt}
                    onChange={(e) => update("fruehgeburt", e.target.checked)}
                    className="h-4 w-4 rounded border-input"
                  />
                  Fruehgeburt (vor der 37. SSW)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.mehrlinge}
                    onChange={(e) => update("mehrlinge", e.target.checked)}
                    className="h-4 w-4 rounded border-input"
                  />
                  Mehrlingsgeburt (Zwillinge / Drillinge)
                </label>
              </div>
            </div>
          )}

          {/* Schritt 2: Geburtsurkunde-Upload */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Geburtsurkunde hochladen</h2>
              <p className="text-sm text-muted-foreground">
                Bitte laden Sie eine Kopie der Geburtsurkunde hoch.
                Erlaubte Formate: PDF, JPG, PNG, WebP. Maximale Groesse: 10 MB.
              </p>

              <div className="rounded-lg border-2 border-dashed border-input p-6 text-center">
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="block w-full text-sm"
                />
                {uploading && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Wird hochgeladen...
                  </p>
                )}
                {uploadSuccess && !uploading && (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-credo-gruen/10 px-3 py-1 text-xs text-credo-gruen">
                    <svg
                      className="h-4 w-4"
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
                    Hochgeladen
                    {uploadFilename ? `: ${uploadFilename}` : ""}
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Sie koennen die Datei jederzeit ersetzen, solange Sie den
                Antrag noch nicht abgesendet haben.
              </p>
            </div>
          )}

          {/* Schritt 3: Abschluss */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Bestaetigung &amp; Absenden</h2>

              <div className="rounded-lg bg-muted p-4">
                <h3 className="text-sm font-medium">Zusammenfassung</h3>
                <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <dt>Kind:</dt>
                    <dd className="font-medium text-foreground">
                      {form.kindName}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Geburtsdatum:</dt>
                    <dd className="font-medium text-foreground">
                      {form.kindGeburtsdatum}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Geschlecht:</dt>
                    <dd className="font-medium text-foreground">
                      {form.kindGeschlecht === "TOCHTER" ? "Tochter" : "Sohn"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Geburtsurkunde:</dt>
                    <dd className="font-medium text-foreground">
                      {uploadSuccess ? "Hochgeladen" : "Fehlt"}
                    </dd>
                  </div>
                </dl>
              </div>

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.bestaetigungAngabenKorrekt}
                  onChange={(e) =>
                    update("bestaetigungAngabenKorrekt", e.target.checked)
                  }
                  className="mt-0.5 h-4 w-4 rounded border-input"
                />
                <span>
                  Ich bestaetige, dass meine Angaben vollstaendig und
                  wahrheitsgemaess sind.
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.dsgvoEinwilligung}
                  onChange={(e) =>
                    update("dsgvoEinwilligung", e.target.checked)
                  }
                  className="mt-0.5 h-4 w-4 rounded border-input"
                />
                <span>
                  Ich willige in die Verarbeitung meiner personenbezogenen
                  Daten gemäß DSGVO zur Bearbeitung des Elternzeit-Antrags ein.
                </span>
              </label>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-between">
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            disabled={step === 1}
            className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Zurück
          </button>
          {step < 3 ? (
            <button
              type="button"
              onClick={() => canNext() && setStep(step + 1)}
              disabled={!canNext()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Weiter
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canNext() || submitting}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {submitting ? "Wird abgesendet..." : "Antrag absenden"}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
