"use client";

/**
 * Step 1: Persoenliche Angaben
 * Name, Geburtsdatum, Familienstand, Schwerbehinderung
 */

import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createStep1Schema, type Step1Data } from "@/lib/validations/personal-data";
import { FieldConfigHelper } from "@/lib/field-definitions";

interface StepProps {
  data: Record<string, unknown>;
  onNext: (data: Record<string, unknown>) => void;
  onBack: () => void;
  saving: boolean;
  fieldConfig?: FieldConfigHelper;
}

export function Step1Personal({ data, onNext, saving, fieldConfig }: StepProps) {
  const fc = fieldConfig ?? new FieldConfigHelper(1);
  const schema = useMemo(() => createStep1Schema(fc), [fc]);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<Step1Data>({
    resolver: zodResolver(schema),
    defaultValues: {
      salutation: (data.salutation as Step1Data["salutation"]) || undefined,
      title: (data.title as string) || "",
      firstName: (data.firstName as string) || "",
      lastName: (data.lastName as string) || "",
      birthName: (data.birthName as string) || "",
      birthDate: (data.birthDate as string) || "",
      birthPlace: (data.birthPlace as string) || "",
      birthCountry: (data.birthCountry as string) || "Deutschland",
      nationality: (data.nationality as string) || "deutsch",
      maritalStatus:
        (data.maritalStatus as Step1Data["maritalStatus"]) || undefined,
      severelyDisabled: (data.severelyDisabled as boolean) || false,
      disabilityDegree: (data.disabilityDegree as number) || null,
    },
  });

  const severelyDisabled = watch("severelyDisabled");

  const onSubmit = (values: Step1Data) => {
    onNext(values as unknown as Record<string, unknown>);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Anrede – alwaysVisible */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          {fc.getLabel("salutation")} <span className="text-destructive">*</span>
        </label>
        <div className="flex gap-4">
          {["Herr", "Frau"].map((val) => (
            <label key={val} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                value={val}
                {...register("salutation")}
                className="h-4 w-4 border-border text-primary focus:ring-primary"
              />
              {val}
            </label>
          ))}
        </div>
        {errors.salutation && (
          <p className="text-xs text-destructive">{errors.salutation.message}</p>
        )}
      </div>

      {/* Titel */}
      {fc.isVisible("title") && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {fc.getLabel("title")} {fc.isRequired("title") && <span className="text-destructive">*</span>}
          </label>
          <input
            type="text"
            {...register("title")}
            placeholder="z.B. Dr., Prof."
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
        </div>
      )}

      {/* Vorname + Nachname – alwaysVisible */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {fc.getLabel("firstName")} <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            {...register("firstName")}
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
          {errors.firstName && (
            <p className="text-xs text-destructive">{errors.firstName.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {fc.getLabel("lastName")} <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            {...register("lastName")}
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
          {errors.lastName && (
            <p className="text-xs text-destructive">{errors.lastName.message}</p>
          )}
        </div>
      </div>

      {/* Geburtsname */}
      {fc.isVisible("birthName") && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {fc.getLabel("birthName")} {fc.isRequired("birthName") && <span className="text-destructive">*</span>}
          </label>
          <input
            type="text"
            {...register("birthName")}
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
        </div>
      )}

      {/* Geburtsdatum + Geburtsort */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Geburtsdatum – alwaysVisible */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {fc.getLabel("birthDate")} <span className="text-destructive">*</span>
          </label>
          <input
            type="date"
            {...register("birthDate")}
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
          {errors.birthDate && (
            <p className="text-xs text-destructive">
              {errors.birthDate.message}
            </p>
          )}
        </div>
        {fc.isVisible("birthPlace") && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              {fc.getLabel("birthPlace")} {fc.isRequired("birthPlace") && <span className="text-destructive">*</span>}
            </label>
            <input
              type="text"
              {...register("birthPlace")}
              className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
            {errors.birthPlace && (
              <p className="text-xs text-destructive">
                {errors.birthPlace.message}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Geburtsland + Staatsangehoerigkeit */}
      {(fc.isVisible("birthCountry") || fc.isVisible("nationality")) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {fc.isVisible("birthCountry") && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {fc.getLabel("birthCountry")} {fc.isRequired("birthCountry") && <span className="text-destructive">*</span>}
              </label>
              <input
                type="text"
                {...register("birthCountry")}
                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
            </div>
          )}
          {fc.isVisible("nationality") && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {fc.getLabel("nationality")} {fc.isRequired("nationality") && <span className="text-destructive">*</span>}
              </label>
              <input
                type="text"
                {...register("nationality")}
                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
            </div>
          )}
        </div>
      )}

      {/* Familienstand */}
      {fc.isVisible("maritalStatus") && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {fc.getLabel("maritalStatus")} {fc.isRequired("maritalStatus") && <span className="text-destructive">*</span>}
          </label>
          <select
            {...register("maritalStatus")}
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          >
            <option value="">Bitte waehlen...</option>
            <option value="ledig">Ledig</option>
            <option value="verheiratet">Verheiratet</option>
            <option value="geschieden">Geschieden</option>
            <option value="verwitwet">Verwitwet</option>
            <option value="getrennt_lebend">Getrennt lebend</option>
            <option value="eingetragene_partnerschaft">
              Eingetragene Lebenspartnerschaft
            </option>
          </select>
          {errors.maritalStatus && (
            <p className="text-xs text-destructive">
              {errors.maritalStatus.message}
            </p>
          )}
        </div>
      )}

      {/* Schwerbehinderung */}
      {fc.isVisible("severelyDisabled") && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/50 p-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              {...register("severelyDisabled")}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-sm font-medium text-foreground">
              {fc.getLabel("severelyDisabled")}
            </span>
          </label>
          {severelyDisabled && (
            <div className="ml-7 space-y-2">
              <label className="text-sm text-muted-foreground">
                Grad der Behinderung (GdB)
              </label>
              <input
                type="number"
                {...register("disabilityDegree", { valueAsNumber: true })}
                min={0}
                max={100}
                step={10}
                className="w-32 rounded-lg border border-input bg-background px-4 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-end pt-4">
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
