"use client";

/**
 * Step 9 (ehem. 9): Masernschutz
 * Fuer Gemeinschaftseinrichtungen (Schulen, Kitas) ab 01.03.2020 Pflicht
 * gemäß Masernschutzgesetz (IfSG §20 Abs. 8)
 *
 * Wenn Nachweis vorhanden: Inline-Upload für Impfausweis/Attest
 */

import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { step9Schema, type Step9Data } from "@/lib/validations/personal-data";
import { FieldConfigHelper } from "@/lib/field-definitions";

interface StepProps {
  data: Record<string, unknown>;
  onNext: (data: Record<string, unknown>) => void;
  onBack: () => void;
  saving: boolean;
  organization: { name: string; type: string };
  fieldConfig?: FieldConfigHelper;
  token?: string;
}

export function Step9Masern({
  data,
  onNext,
  onBack,
  saving,
  organization,
  fieldConfig,
  token,
}: StepProps) {
  const fc = fieldConfig ?? new FieldConfigHelper(9);
  const {
    register,
    handleSubmit,
    watch,
  } = useForm<Step9Data>({
    resolver: zodResolver(step9Schema),
    defaultValues: {
      bornAfter1971: (data.bornAfter1971 as boolean) || false,
      masernschutzProvided: (data.masernschutzProvided as boolean) || false,
    },
  });

  const bornAfter1971 = watch("bornAfter1971");
  const masernschutzProvided = watch("masernschutzProvided");

  // Upload State
  const [uploading, setUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isGemeinschaftseinrichtung = [
    "GYMNASIUM", "GESAMTSCHULE", "GRUNDSCHULE", "BERUFSKOLLEG", "KITA",
  ].includes(organization.type);

  const handleUpload = async (file: File) => {
    if (!token) return;
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "masernschutz");
      const res = await fetch(`/api/fragebogen/${token}/documents`, { method: "POST", body: formData });
      if (res.ok) {
        setUploadedFile(file.name);
      } else {
        setUploadError("Upload fehlgeschlagen");
      }
    } catch {
      setUploadError("Verbindungsfehler");
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = (values: Step9Data) => {
    onNext(values as unknown as Record<string, unknown>);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Info-Box */}
      <div
        className={`rounded-lg border p-4 ${
          isGemeinschaftseinrichtung
            ? "border-yellow-300 bg-yellow-50"
            : "border-credo-blau/20 bg-credo-blau/5"
        }`}
      >
        <p className={`text-sm ${isGemeinschaftseinrichtung ? "text-yellow-800" : "text-credo-blau"}`}>
          {isGemeinschaftseinrichtung ? (
            <>
              <strong>Wichtig:</strong> Als Mitarbeiter/in einer
              Gemeinschaftseinrichtung ({organization.name}) sind Sie gemäß
              Masernschutzgesetz (IfSG §20 Abs. 8) verpflichtet, einen
              Masernschutz nachzuweisen, sofern Sie nach dem 31.12.1970 geboren
              wurden.
            </>
          ) : (
            <>
              Bitte geben Sie an, ob Sie nach 1970 geboren wurden und ob ein
              Masernschutznachweis vorliegt. Diese Angabe ist für die
              Personalakte relevant.
            </>
          )}
        </p>
      </div>

      {/* Geburtsjahr */}
      {fc.isVisible("bornAfter1971") && (
        <div className="rounded-lg border border-border bg-muted/50 p-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              {...register("bornAfter1971")}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <div>
              <span className="text-sm font-medium text-foreground">
                {fc.getLabel("bornAfter1971")}
              </span>
              <p className="text-xs text-muted-foreground">
                Personen, die vor 1971 geboren sind, gelten als immun und
                benoetigen keinen Nachweis.
              </p>
            </div>
          </label>
        </div>
      )}

      {/* Masernschutz vorhanden */}
      {bornAfter1971 && fc.isVisible("masernschutzProvided") && (
        <div className="space-y-4 rounded-lg border border-border p-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              {...register("masernschutzProvided")}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <div>
              <span className="text-sm font-medium text-foreground">
                {fc.getLabel("masernschutzProvided")}
              </span>
              <p className="text-xs text-muted-foreground">
                Ich kann einen der folgenden Nachweise erbringen: Impfausweis
                mit 2 Masern-Impfungen, aerztliches Attest über Immunitaet,
                oder eine Kontraindikation.
              </p>
            </div>
          </label>

          <div className="ml-7 rounded-lg bg-muted p-3">
            <p className="text-xs text-muted-foreground">
              <strong>Moegliche Nachweise:</strong>
            </p>
            <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
              <li>Impfausweis (2 Impfungen gegen Masern)</li>
              <li>Aerztliches Zeugnis über ausreichenden Impfschutz</li>
              <li>Aerztliches Zeugnis über Immunitaet</li>
              <li>Aerztliches Zeugnis über medizinische Kontraindikation</li>
            </ul>
          </div>

          {/* Inline Upload für Masernschutz-Nachweis */}
          {masernschutzProvided && token && (
            <div className="ml-7 rounded-lg border border-dashed border-border bg-muted/30 p-3 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <svg className="h-4 w-4 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">Masernschutz-Nachweis</p>
                    {uploadedFile ? (
                      <p className="text-[10px] text-credo-gruen truncate">{uploadedFile}</p>
                    ) : uploadError ? (
                      <p className="text-[10px] text-destructive">{uploadError}</p>
                    ) : (
                      <p className="text-[10px] text-muted-foreground">Optional — kann auch spaeter nachgereicht werden</p>
                    )}
                  </div>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(file);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    uploadedFile
                      ? "border border-credo-gruen/30 bg-credo-gruen/5 text-credo-gruen"
                      : "border border-border bg-card text-muted-foreground hover:bg-muted"
                  } disabled:opacity-50`}
                >
                  {uploading ? "..." : uploadedFile ? "Ersetzen" : "Hochladen"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
        >
          Zurück
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Speichern..." : "Weiter"}
        </button>
      </div>
    </form>
  );
}
