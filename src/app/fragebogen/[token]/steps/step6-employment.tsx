"use client";

/**
 * Step 6: Weitere Beschaeftigung
 * Angaben zu anderen Arbeitgebern
 */

import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createStep6Schema, type Step6Data } from "@/lib/validations/personal-data";
import { FieldConfigHelper } from "@/lib/field-definitions";

interface StepProps {
  data: Record<string, unknown>;
  onNext: (data: Record<string, unknown>) => void;
  onBack: () => void;
  saving: boolean;
  fieldConfig?: FieldConfigHelper;
}

export function Step6Employment({ data, onNext, onBack, saving, fieldConfig }: StepProps) {
  const fc = fieldConfig ?? new FieldConfigHelper(6);
  const schema = useMemo(() => createStep6Schema(fc), [fc]);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<Step6Data>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      hasOtherEmployment: (data.hasOtherEmployment as boolean) || false,
      otherEmployerName: (data.otherEmployerName as string) || "",
      otherWeeklyHours: (data.otherWeeklyHours as number) || null,
      employerType:
        (data.employerType as Step6Data["employerType"]) || undefined,
      hasMinijob: (data.hasMinijob as boolean) || false,
    },
  });

  const hasOther = watch("hasOtherEmployment");

  const onSubmit = (values: Step6Data) => {
    onNext(values as unknown as Record<string, unknown>);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="rounded-lg border border-[#009AC6]/20 bg-[#009AC6]/5 p-4">
        <p className="text-sm text-[#009AC6]">
          Bitte teilen Sie uns mit, ob Sie neben Ihrer Taetigkeit bei uns noch
          bei einem anderen Arbeitgeber beschaeftigt sind. Diese Angabe ist
          wichtig fuer die korrekte Berechnung Ihrer Sozialversicherungsbeitraege.
        </p>
      </div>

      {/* Hauptfrage */}
      {fc.isVisible("hasOtherEmployment") && (
        <div className="rounded-lg border border-border bg-muted/50 p-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              {...register("hasOtherEmployment")}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <div>
              <span className="text-sm font-medium text-foreground">
                {fc.getLabel("hasOtherEmployment")}
              </span>
              <p className="text-xs text-muted-foreground">
                Oder ich uebe eine selbststaendige / freiberufliche Taetigkeit
                aus.
              </p>
            </div>
          </label>
        </div>
      )}

      {/* Bedingte Felder */}
      {hasOther && (
        <div className="space-y-4 rounded-lg border border-border p-4">
          {fc.isVisible("otherEmployerName") && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {fc.getLabel("otherEmployerName")} {fc.isRequired("otherEmployerName") && <span className="text-destructive">*</span>}
              </label>
              <input
                type="text"
                {...register("otherEmployerName")}
                placeholder="z.B. Firma XY GmbH"
                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
            </div>
          )}
          {fc.isVisible("otherWeeklyHours") && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {fc.getLabel("otherWeeklyHours")} {fc.isRequired("otherWeeklyHours") && <span className="text-destructive">*</span>}
              </label>
              <input
                type="number"
                {...register("otherWeeklyHours", { valueAsNumber: true })}
                min={0}
                max={60}
                step={0.5}
                placeholder="z.B. 10"
                className="w-32 rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
              {errors.otherWeeklyHours && (
                <p className="text-xs text-destructive">
                  {errors.otherWeeklyHours.message}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Haupt- oder Nebenarbeitgeber */}
      {fc.isVisible("employerType") && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {fc.getLabel("employerType")}{" "}
            {fc.isRequired("employerType") && <span className="text-destructive">*</span>}
          </label>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                value="hauptarbeitgeber"
                {...register("employerType")}
                className="h-4 w-4 border-border text-primary focus:ring-primary"
              />
              Ja, Hauptarbeitgeber
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                value="nebenarbeitgeber"
                {...register("employerType")}
                className="h-4 w-4 border-border text-primary focus:ring-primary"
              />
              Ja, Nebenarbeitgeber
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                value="nein"
                {...register("employerType")}
                className="h-4 w-4 border-border text-primary focus:ring-primary"
              />
              Nein
            </label>
          </div>
          {errors.employerType && (
            <p className="text-xs text-destructive">
              {errors.employerType.message}
            </p>
          )}
        </div>
      )}

      {/* Weitere geringfuegige Beschaeftigung (Minijob) */}
      {fc.isVisible("hasMinijob") && (
        <div className="rounded-lg border border-border bg-muted/50 p-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              {...register("hasMinijob")}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <div>
              <span className="text-sm font-medium text-foreground">
                {fc.getLabel("hasMinijob")}
              </span>
              <p className="text-xs text-muted-foreground">
                Bitte angeben, falls Sie neben dieser Taetigkeit einen Minijob
                ausueben.
              </p>
            </div>
          </label>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
        >
          Zurueck
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
