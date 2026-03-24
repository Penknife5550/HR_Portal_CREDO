"use client";

/**
 * Step 5: Steuer
 * Steuer-ID, Steuerklasse, Freibetraege, Religion
 */

import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createStep5Schema, type Step5Data } from "@/lib/validations/personal-data";
import { FieldConfigHelper } from "@/lib/field-definitions";

interface StepProps {
  data: Record<string, unknown>;
  onNext: (data: Record<string, unknown>) => void;
  onBack: () => void;
  saving: boolean;
  fieldConfig?: FieldConfigHelper;
}

export function Step5Tax({ data, onNext, onBack, saving, fieldConfig }: StepProps) {
  const fc = fieldConfig ?? new FieldConfigHelper(5);
  const schema = useMemo(() => createStep5Schema(fc), [fc]);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Step5Data>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      taxId: (data.taxId as string) || "",
      taxClass: (data.taxClass as Step5Data["taxClass"]) || undefined,
      taxAllowance: (data.taxAllowance as number) || null,
      childAllowance: (data.childAllowance as number) || null,
      religion: (data.religion as Step5Data["religion"]) || undefined,
    },
  });

  const onSubmit = (values: Step5Data) => {
    onNext(values as unknown as Record<string, unknown>);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Steuer-ID */}
      {fc.isVisible("taxId") && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {fc.getLabel("taxId")}{" "}
            {fc.isRequired("taxId") && <span className="text-destructive">*</span>}
          </label>
          <input
            type="text"
            {...register("taxId")}
            placeholder="12345678901"
            maxLength={11}
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 font-mono text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
          {errors.taxId && (
            <p className="text-xs text-destructive">{errors.taxId.message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Die 11-stellige Steuer-ID finden Sie auf Ihrem Steuerbescheid oder in
            Schreiben des Finanzamtes. Sie ist lebenslang gueltig.
          </p>
        </div>
      )}

      {/* Steuerklasse */}
      {fc.isVisible("taxClass") && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {fc.getLabel("taxClass")} {fc.isRequired("taxClass") && <span className="text-destructive">*</span>}
          </label>
          <select
            {...register("taxClass")}
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          >
            <option value="">Bitte waehlen...</option>
            <option value="I">I – Ledig / Geschieden / Verwitwet</option>
            <option value="II">II – Alleinerziehend</option>
            <option value="III">III – Verheiratet (Ehepartner Klasse V)</option>
            <option value="IV">IV – Verheiratet (beide Klasse IV)</option>
            <option value="V">V – Verheiratet (Ehepartner Klasse III)</option>
            <option value="VI">VI – Zweitarbeitgeber</option>
          </select>
          {errors.taxClass && (
            <p className="text-xs text-destructive">{errors.taxClass.message}</p>
          )}
        </div>
      )}

      {/* Freibetraege */}
      {(fc.isVisible("taxAllowance") || fc.isVisible("childAllowance")) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {fc.isVisible("taxAllowance") && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {fc.getLabel("taxAllowance")} {fc.isRequired("taxAllowance") && <span className="text-destructive">*</span>}
              </label>
              <div className="relative">
                <input
                  type="number"
                  {...register("taxAllowance", { valueAsNumber: true })}
                  min={0}
                  step={0.01}
                  placeholder="0,00"
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 pr-8 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  EUR
                </span>
              </div>
            </div>
          )}
          {fc.isVisible("childAllowance") && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {fc.getLabel("childAllowance")} {fc.isRequired("childAllowance") && <span className="text-destructive">*</span>}
              </label>
              <div className="relative">
                <input
                  type="number"
                  {...register("childAllowance", { valueAsNumber: true })}
                  min={0}
                  step={0.5}
                  placeholder="0"
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 pr-8 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  Anzahl
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Religion / Kirchensteuer */}
      {fc.isVisible("religion") && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {fc.getLabel("religion")}{" "}
            {fc.isRequired("religion") && <span className="text-destructive">*</span>}
          </label>
          <select
            {...register("religion")}
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          >
            <option value="">Bitte waehlen...</option>
            <option value="ev">Evangelisch (ev)</option>
            <option value="rk">Roemisch-Katholisch (rk)</option>
            <option value="ak">Altkatholisch (ak)</option>
            <option value="lt">Evangelisch-Lutherisch (lt)</option>
            <option value="rf">Evangelisch-Reformiert (rf)</option>
            <option value="fr">Franzoesisch-Reformiert (fr)</option>
            <option value="fg">Freie Religionsgemeinschaft (fg)</option>
            <option value="keine">Keine Kirchensteuer</option>
            <option value="sonstige">Sonstige</option>
          </select>
          {errors.religion && (
            <p className="text-xs text-destructive">{errors.religion.message}</p>
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
