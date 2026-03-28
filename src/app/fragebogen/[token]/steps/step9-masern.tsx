"use client";

/**
 * Step 9: Masernschutz
 * Fuer Gemeinschaftseinrichtungen (Schulen, Kitas) ab 01.03.2020 Pflicht
 * gemaess Masernschutzgesetz (IfSG §20 Abs. 8)
 */

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
}

export function Step9Masern({
  data,
  onNext,
  onBack,
  saving,
  organization,
  fieldConfig,
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

  // Masernschutz ist besonders relevant fuer Schulen und Kitas
  const isGemeinschaftseinrichtung = [
    "GYMNASIUM",
    "GESAMTSCHULE",
    "GRUNDSCHULE",
    "BERUFSKOLLEG",
    "KITA",
  ].includes(organization.type);

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
            : "border-[#009AC6]/20 bg-[#009AC6]/5"
        }`}
      >
        <p
          className={`text-sm ${
            isGemeinschaftseinrichtung ? "text-yellow-800" : "text-[#009AC6]"
          }`}
        >
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
              Masernschutznachweis vorliegt. Diese Angabe ist fuer die
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
                benötigen keinen Nachweis.
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
                mit 2 Masern-Impfungen, ärztliches Attest über Immunität,
                oder eine Kontraindikation.
              </p>
            </div>
          </label>

          <div className="ml-7 rounded-lg bg-muted p-3">
            <p className="text-xs text-muted-foreground">
              <strong>Mögliche Nachweise:</strong>
            </p>
            <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
              <li>Impfausweis (2 Impfungen gegen Masern)</li>
              <li>Ärztliches Zeugnis über ausreichenden Impfschutz</li>
              <li>Ärztliches Zeugnis über Immunität</li>
              <li>
                Ärztliches Zeugnis über medizinische Kontraindikation
              </li>
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Den Nachweis reichen Sie bitte später als Dokument ein oder
              legen ihn bei der Personalabteilung vor.
            </p>
          </div>
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
