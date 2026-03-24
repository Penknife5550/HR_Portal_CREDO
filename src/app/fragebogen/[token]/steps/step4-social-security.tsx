"use client";

/**
 * Step 4: Sozialversicherung
 * SV-Nummer, Krankenkasse, Elterneigenschaft
 */

import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createStep4Schema, type Step4Data } from "@/lib/validations/personal-data";
import { FieldConfigHelper } from "@/lib/field-definitions";

interface StepProps {
  data: Record<string, unknown>;
  onNext: (data: Record<string, unknown>) => void;
  onBack: () => void;
  saving: boolean;
  fieldConfig?: FieldConfigHelper;
}

export function Step4SocialSecurity({
  data,
  onNext,
  onBack,
  saving,
  fieldConfig,
}: StepProps) {
  const fc = fieldConfig ?? new FieldConfigHelper(4);
  const schema = useMemo(() => createStep4Schema(fc), [fc]);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Step4Data>({
    resolver: zodResolver(schema),
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

  const onSubmit = (values: Step4Data) => {
    onNext(values as unknown as Record<string, unknown>);
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
            {...register("socialSecurityNumber")}
            placeholder="12 345678 A 123"
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 font-mono text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            Die SV-Nummer finden Sie auf Ihrem Sozialversicherungsausweis oder in
            Schreiben Ihres Rentenversicherungstraegers. Falls Sie Ihre Nummer
            nicht kennen, kann sie ueber die Krankenkasse ermittelt werden.
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
                Stiefkinder haben. Diese Angabe ist wichtig fuer die
                Pflegeversicherung: Arbeitnehmer ohne Kinder zahlen ab
                23 Jahren einen Beitragszuschlag von 0,6%. Bei mehreren
                Kindern unter 25 Jahren reduziert sich Ihr Beitrag
                zusaetzlich.
              </p>
            </div>
          </label>
        </div>
      )}

      {/* Minijob RV-Befreiung */}
      {fc.isVisible("minijobRvBefreiung") && (
        <div className="rounded-lg border border-border bg-muted/50 p-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              {...register("minijobRvBefreiung")}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <div>
              <span className="text-sm font-medium text-foreground">
                {fc.getLabel("minijobRvBefreiung")}
              </span>
              <p className="text-xs text-muted-foreground">
                Nur relevant bei geringfuegiger Beschaeftigung (Minijob): Ich
                moechte mich von der Rentenversicherungspflicht befreien lassen.
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
