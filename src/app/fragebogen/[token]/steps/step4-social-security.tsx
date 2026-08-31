"use client";

/**
 * Step 4: Sozialversicherung
 * SV-Nummer, Krankenkasse, Elterneigenschaft + inline Kinder-Erfassung
 */

import { useMemo, useState, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createStep4Schema, type Step4Data } from "@/lib/validations/personal-data";
import { FieldConfigHelper } from "@/lib/field-definitions";

interface ChildEntry {
  firstName: string;
  lastName: string;
  birthDate: string;
  taxAllowance: boolean;
}

interface StepProps {
  data: Record<string, unknown>;
  onNext: (data: Record<string, unknown>) => void;
  onBack: () => void;
  saving: boolean;
  fieldConfig?: FieldConfigHelper;
  token?: string;
}

interface UploadState {
  uploading: boolean;
  fileName: string | null;
  error: string | null;
}

export function Step4SocialSecurity({
  data,
  onNext,
  onBack,
  saving,
  fieldConfig,
  token,
}: StepProps) {
  const fc = fieldConfig ?? new FieldConfigHelper(4);
  const schema = useMemo(() => createStep4Schema(fc), [fc]);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<Step4Data>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      socialSecurityNumber: (data.socialSecurityNumber as string) || "",
      healthInsuranceName: (data.healthInsuranceName as string) || "",
      healthInsuranceType:
        (data.healthInsuranceType as Step4Data["healthInsuranceType"]) ||
        undefined,
      parentStatus: (data.parentStatus as boolean) || false,
      minijobRvBefreiung: (data.minijobRvBefreiung as boolean) || false,
    },
  });

  // Kinder-State
  const existing = (data.children as ChildEntry[]) || [];
  const [children, setChildren] = useState<ChildEntry[]>(existing);
  const [childErrors, setChildErrors] = useState<Record<string, string>>({});

  // parentStatus live beobachten
  const parentStatus = useWatch({ control, name: "parentStatus" });

  // Geburtsurkunde-Upload pro Kind
  const [uploads, setUploads] = useState<Record<number, UploadState>>({});
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const handleChildDocUpload = async (childIndex: number, file: File) => {
    if (!token) return;
    setUploads((prev) => ({ ...prev, [childIndex]: { uploading: true, fileName: null, error: null } }));
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "geburtsurkunde_kind");
      formData.append("notes", `Kind ${childIndex + 1}: ${children[childIndex]?.firstName || ""}`);
      const res = await fetch(`/api/fragebogen/${token}/documents`, { method: "POST", body: formData });
      if (res.ok) {
        setUploads((prev) => ({ ...prev, [childIndex]: { uploading: false, fileName: file.name, error: null } }));
      } else {
        setUploads((prev) => ({ ...prev, [childIndex]: { uploading: false, fileName: null, error: "Upload fehlgeschlagen" } }));
      }
    } catch {
      setUploads((prev) => ({ ...prev, [childIndex]: { uploading: false, fileName: null, error: "Verbindungsfehler" } }));
    }
  };

  const addChild = () => {
    setChildren([...children, { firstName: "", lastName: "", birthDate: "", taxAllowance: false }]);
  };

  const removeChild = (index: number) => {
    setChildren(children.filter((_, i) => i !== index));
    const newErrors = { ...childErrors };
    Object.keys(newErrors).forEach((key) => {
      if (key.startsWith(`${index}-`)) delete newErrors[key];
    });
    setChildErrors(newErrors);
  };

  const updateChild = (index: number, field: keyof ChildEntry, value: string | boolean) => {
    const updated = [...children];
    updated[index] = { ...updated[index], [field]: value };
    setChildren(updated);
    if (childErrors[`${index}-${field}`]) {
      const newErrors = { ...childErrors };
      delete newErrors[`${index}-${field}`];
      setChildErrors(newErrors);
    }
  };

  const validateChildren = (): boolean => {
    if (!parentStatus || children.length === 0) return true;
    const newErrors: Record<string, string> = {};
    children.forEach((child, index) => {
      if (!child.firstName.trim()) {
        newErrors[`${index}-firstName`] = "Vorname ist erforderlich.";
      }
      if (!child.birthDate) {
        newErrors[`${index}-birthDate`] = "Geburtsdatum ist erforderlich.";
      }
    });
    setChildErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const onSubmit = (values: Step4Data) => {
    if (!validateChildren()) return;
    // Kinder-Daten mitsenden
    const result: Record<string, unknown> = { ...values };
    if (parentStatus) {
      result.children = children;
    }
    onNext(result);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* SV-Nummer */}
      {fc.isVisible("socialSecurityNumber") && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {fc.getLabel("socialSecurityNumber")} {fc.isRequired("socialSecurityNumber") && <span className="text-destructive">*</span>}
          </label>
          <input
            type="text"
            autoComplete="off"
            {...register("socialSecurityNumber")}
            placeholder="12 345678 A 123"
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 font-mono text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            Die SV-Nummer finden Sie auf Ihrem Sozialversicherungsausweis oder in
            Schreiben Ihres Rentenversicherungstraegers. Falls Sie Ihre Nummer
            nicht kennen, kann sie über die Krankenkasse ermittelt werden.
          </p>
        </div>
      )}

      {/* Versicherungsart */}
      {fc.isVisible("healthInsuranceType") && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {fc.getLabel("healthInsuranceType")} {fc.isRequired("healthInsuranceType") && <span className="text-destructive">*</span>}
          </label>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                value="gesetzlich"
                {...register("healthInsuranceType")}
                className="h-4 w-4 border-border text-primary focus:ring-primary"
              />
              Gesetzlich versichert
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                value="privat"
                {...register("healthInsuranceType")}
                className="h-4 w-4 border-border text-primary focus:ring-primary"
              />
              Privat versichert
            </label>
          </div>
          {errors.healthInsuranceType && (
            <p className="text-xs text-destructive">
              {errors.healthInsuranceType.message}
            </p>
          )}
        </div>
      )}

      {/* Krankenkasse */}
      {fc.isVisible("healthInsuranceName") && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {fc.getLabel("healthInsuranceName")} {fc.isRequired("healthInsuranceName") && <span className="text-destructive">*</span>}
          </label>
          <input
            type="text"
            autoComplete="off"
            {...register("healthInsuranceName")}
            placeholder="z.B. AOK, TK, Barmer, DAK"
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
          {errors.healthInsuranceName && (
            <p className="text-xs text-destructive">
              {errors.healthInsuranceName.message}
            </p>
          )}
        </div>
      )}

      {/* Elterneigenschaft (Pflegeversicherung) */}
      {fc.isVisible("parentStatus") && (
        <div className="rounded-lg border border-border bg-muted/50 p-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              {...register("parentStatus")}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <div>
              <span className="text-sm font-medium text-foreground">
                {fc.getLabel("parentStatus")}
              </span>
              <p className="text-xs text-muted-foreground">
                Bitte ankreuzen, wenn Sie leibliche, adoptierte oder
                Stiefkinder haben. Diese Angabe ist wichtig für die
                Pflegeversicherung: Arbeitnehmer ohne Kinder zahlen ab
                23 Jahren einen Beitragszuschlag von 0,6%. Bei mehreren
                Kindern unter 25 Jahren reduziert sich Ihr Beitrag
                zusaetzlich.
              </p>
            </div>
          </label>
        </div>
      )}

      {/* ===== Inline Kinder-Erfassung ===== */}
      {parentStatus && (
        <div className="rounded-xl border-2 border-credo-blau/20 bg-credo-blau/5 p-5 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <div>
            <h3 className="text-sm font-bold text-foreground">Angaben zu Ihren Kindern</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Diese Angaben werden für die Berechnung des Kinderfreibetrages und der Pflegeversicherung benoetigt.
            </p>
          </div>

          {children.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-border bg-card p-6 text-center">
              <p className="text-sm text-muted-foreground mb-3">Noch keine Kinder eingetragen.</p>
              <button
                type="button"
                onClick={addChild}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                + Kind hinzufuegen
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {children.map((child, index) => (
                <div key={index} className="rounded-lg border border-border bg-card p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-foreground">Kind {index + 1}</h4>
                    <button
                      type="button"
                      onClick={() => removeChild(index)}
                      className="rounded-md px-2 py-1 text-xs text-destructive transition-colors hover:bg-destructive/10"
                    >
                      Entfernen
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">
                        Vorname <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="text"
                        autoComplete="off"
                        value={child.firstName}
                        onChange={(e) => updateChild(index, "firstName", e.target.value)}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                      />
                      {childErrors[`${index}-firstName`] && (
                        <p className="text-xs text-destructive">{childErrors[`${index}-firstName`]}</p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">Nachname</label>
                      <input
                        type="text"
                        autoComplete="off"
                        value={child.lastName}
                        onChange={(e) => updateChild(index, "lastName", e.target.value)}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">
                        Geburtsdatum <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="date"
                        value={child.birthDate}
                        onChange={(e) => updateChild(index, "birthDate", e.target.value)}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                      />
                      {childErrors[`${index}-birthDate`] && (
                        <p className="text-xs text-destructive">{childErrors[`${index}-birthDate`]}</p>
                      )}
                    </div>

                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={child.taxAllowance}
                          onChange={(e) => updateChild(index, "taxAllowance", e.target.checked)}
                          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                        />
                        Kinderfreibetrag
                      </label>
                    </div>
                  </div>

                  {/* Geburtsurkunde Upload */}
                  <div className="mt-3 rounded-lg border border-dashed border-border bg-muted/30 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <svg className="h-4 w-4 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground">Geburtsurkunde</p>
                          {uploads[index]?.fileName ? (
                            <p className="text-[10px] text-credo-gruen truncate">{uploads[index].fileName}</p>
                          ) : uploads[index]?.error ? (
                            <p className="text-[10px] text-destructive">{uploads[index].error}</p>
                          ) : (
                            <p className="text-[10px] text-muted-foreground">Optional — kann auch spaeter hochgeladen werden</p>
                          )}
                        </div>
                      </div>
                      <input
                        ref={(el) => { fileRefs.current[index] = el; }}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleChildDocUpload(index, file);
                          e.target.value = "";
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => fileRefs.current[index]?.click()}
                        disabled={uploads[index]?.uploading}
                        className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                          uploads[index]?.fileName
                            ? "border border-credo-gruen/30 bg-credo-gruen/5 text-credo-gruen"
                            : "border border-border bg-card text-muted-foreground hover:bg-muted"
                        } disabled:opacity-50`}
                      >
                        {uploads[index]?.uploading ? "..." : uploads[index]?.fileName ? "Ersetzen" : "Hochladen"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={addChild}
                className="w-full rounded-lg border-2 border-dashed border-border py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                + Weiteres Kind hinzufuegen
              </button>
            </div>
          )}
        </div>
      )}

      {/* Die Frage nach der RV-Befreiung stand frueher hier als einzelner
          Haken. Seit AP 7 ist sie ein eigener Schritt mit vier Wegen
          (step11-rente.tsx) — der Haken bildete die Entscheidung nie ab.

          Er wird deshalb nicht mehr gerendert, auch wenn eine gespeicherte
          Vorlagen-Konfiguration ihn noch als sichtbar fuehrt. Sonst
          beantwortete derselbe Mensch dieselbe Frage zweimal, mit
          unterschiedlicher Aufloesung — und die Akte truege zur
          folgenreichsten Angabe des Fragebogens zwei Antworten, beide unter
          derselben Wahrheitsversicherung.

          Das Feld selbst bleibt im Modell und lesbar: Altvorgaenge haben es
          befuellt. */}

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
