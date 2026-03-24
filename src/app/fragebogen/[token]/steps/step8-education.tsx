"use client";

/**
 * Step 8: Bildung & Beruf
 * Hoechster Schulabschluss und hoechste Berufsausbildung (Haufe HI13214732)
 */

import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createStep8Schema, type Step8Data } from "@/lib/validations/personal-data";
import { FieldConfigHelper } from "@/lib/field-definitions";

interface StepProps {
  data: Record<string, unknown>;
  onNext: (data: Record<string, unknown>) => void;
  onBack: () => void;
  saving: boolean;
  fieldConfig?: FieldConfigHelper;
}

export function Step8Education({ data, onNext, onBack, saving, fieldConfig }: StepProps) {
  const fc = fieldConfig ?? new FieldConfigHelper(8);
  const schema = useMemo(() => createStep8Schema(fc), [fc]);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Step8Data>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      highestSchoolDegree:
        (data.highestSchoolDegree as Step8Data["highestSchoolDegree"]) ||
        undefined,
      highestProfessionalDegree:
        (data.highestProfessionalDegree as Step8Data["highestProfessionalDegree"]) ||
        undefined,
    },
  });

  const onSubmit = (values: Step8Data) => {
    onNext(values as unknown as Record<string, unknown>);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Info-Box */}
      <div className="rounded-lg border border-[#009AC6]/20 bg-[#009AC6]/5 p-4">
        <p className="text-sm text-[#009AC6]">
          Diese Angaben werden fuer die Meldung zur Sozialversicherung
          benoetigt. Bitte geben Sie Ihren hoechsten Schul- und
          Berufsausbildungsabschluss an.
        </p>
      </div>

      {/* Hoechster Schulabschluss */}
      {fc.isVisible("highestSchoolDegree") && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {fc.getLabel("highestSchoolDegree")} {fc.isRequired("highestSchoolDegree") && <span className="text-destructive">*</span>}
          </label>
          <select
            {...register("highestSchoolDegree")}
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          >
            <option value="">Bitte waehlen...</option>
            <option value="ohne_schulabschluss">Ohne Schulabschluss</option>
            <option value="hauptschulabschluss">
              Haupt-/Volksschulabschluss
            </option>
            <option value="mittlere_reife">
              Mittlere Reife / gleichwertiger Abschluss
            </option>
            <option value="abitur_fachabitur">Abitur / Fachabitur</option>
            <option value="sonstiges">Sonstiges / nicht bekannt</option>
          </select>
          {errors.highestSchoolDegree && (
            <p className="text-xs text-destructive">
              {errors.highestSchoolDegree.message}
            </p>
          )}
        </div>
      )}

      {/* Hoechste Berufsausbildung */}
      {fc.isVisible("highestProfessionalDegree") && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {fc.getLabel("highestProfessionalDegree")} {fc.isRequired("highestProfessionalDegree") && <span className="text-destructive">*</span>}
          </label>
          <select
            {...register("highestProfessionalDegree")}
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          >
            <option value="">Bitte waehlen...</option>
            <option value="ohne_berufsausbildung">
              Ohne berufliche Ausbildung
            </option>
            <option value="anerkannte_berufsausbildung">
              Abschluss einer anerkannten Berufsausbildung
            </option>
            <option value="meister_techniker_fachschule">
              Meister-/Techniker- oder gleichwertige Fachschulausbildung
            </option>
            <option value="bachelor">Bachelor</option>
            <option value="diplom_magister_master_staatsexamen">
              Diplom/Magister/Master/Staatsexamen
            </option>
            <option value="promotion">Promotion</option>
          </select>
          {errors.highestProfessionalDegree && (
            <p className="text-xs text-destructive">
              {errors.highestProfessionalDegree.message}
            </p>
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
