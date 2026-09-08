"use client";

/**
 * Step 3: Bankverbindung
 * IBAN, BIC, Bankname, Kontoinhaber
 */

import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createStep3Schema, type Step3Data } from "@/lib/validations/personal-data";
import { formatIBAN } from "@/lib/utils/iban-validator";
import { FieldConfigHelper } from "@/lib/field-definitions";

interface StepProps {
  data: Record<string, unknown>;
  onNext: (data: Record<string, unknown>) => void;
  onBack: () => void;
  saving: boolean;
  fieldConfig?: FieldConfigHelper;
}

export function Step3Bank({ data, onNext, onBack, saving, fieldConfig }: StepProps) {
  // Siehe step2-address.tsx: Ohne useMemo waere `fc` bei jedem Rendern ein
  // neues Objekt und das Schema damit nie stabil.
  const fc = useMemo(() => fieldConfig ?? new FieldConfigHelper(3), [fieldConfig]);
  const schema = useMemo(() => createStep3Schema(fc), [fc]);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<Step3Data>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      iban: formatIBAN((data.iban as string) || ""),
      bic: (data.bic as string) || "",
      bankName: (data.bankName as string) || "",
      accountHolder: (data.accountHolder as string) || "",
    },
  });

  // IBAN automatisch formatieren (Grossbuchstaben, Leerzeichen alle 4 Zeichen)
  function handleIbanChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatIBAN(e.target.value);
    setValue("iban", formatted, { shouldValidate: false });
  }

  const onSubmit = (values: Step3Data) => {
    // Angezeigt wird in Vierergruppen, gespeichert wird ohne Trennzeichen.
    //
    // Die Formatierung blaeht eine 34-stellige IBAN auf 42 Zeichen auf. Der
    // Server laesst hoechstens 34 durch (`fragebogenFieldsSchema`) — auf einem
    // maltesischen (31) oder russischen (33) Konto scheiterte der Schritt also
    // an einer IBAN, die er selbst so hingeschrieben hatte. Zudem liegt die
    // IBAN verschluesselt in der Akte: Ein Vergleich trifft sonst nicht die
    // Nummer, sondern deren Schreibweise.
    const iban = (values.iban ?? "").replace(/[\s-]/g, "").toUpperCase();
    // Ein voller BIC hat 11 Zeichen — genau die Grenze. Ein aus dem
    // Online-Banking mitkopiertes Leerzeichen sprengt sie, ist aber im Feld
    // nicht zu sehen.
    const bic = (values.bic ?? "").replace(/\s/g, "").toUpperCase();
    onNext({ ...values, iban, bic } as unknown as Record<string, unknown>);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="rounded-lg border border-[#009AC6]/20 bg-[#009AC6]/5 p-4">
        <p className="text-sm text-[#009AC6]">
          Bitte geben Sie die Bankverbindung an, auf die Ihr Gehalt überwiesen
          werden soll. Die IBAN finden Sie auf Ihrer Bankkarte oder im
          Online-Banking.
        </p>
      </div>

      {/* IBAN */}
      {fc.isVisible("iban") && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {fc.getLabel("iban")} {fc.isRequired("iban") && <span className="text-destructive">*</span>}
          </label>
          <input
            type="text"
            {...register("iban", { onChange: handleIbanChange })}
            placeholder="DE89 3704 0044 0532 0130 00"
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 font-mono text-sm tracking-wider outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
          {errors.iban && (
            <p className="text-xs text-destructive">{errors.iban.message}</p>
          )}
        </div>
      )}

      {/* BIC */}
      {fc.isVisible("bic") && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {fc.getLabel("bic")} {fc.isRequired("bic") && <span className="text-destructive">*</span>}
          </label>
          <input
            type="text"
            {...register("bic")}
            maxLength={11}
            placeholder="COBADEFFXXX"
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 font-mono text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
          {errors.bic && (
            <p className="text-xs text-destructive">{errors.bic.message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Für innerdeutsche Überweisungen ist der BIC nicht zwingend
            erforderlich.
          </p>
        </div>
      )}

      {/* Bankname */}
      {fc.isVisible("bankName") && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {fc.getLabel("bankName")} {fc.isRequired("bankName") && <span className="text-destructive">*</span>}
          </label>
          <input
            type="text"
            {...register("bankName")}
            maxLength={200}
            placeholder="z.B. Sparkasse Minden-Luebbecke"
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
          {errors.bankName && (
            <p className="text-xs text-destructive">{errors.bankName.message}</p>
          )}
        </div>
      )}

      {/* Kontoinhaber */}
      {fc.isVisible("accountHolder") && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {fc.getLabel("accountHolder")} {fc.isRequired("accountHolder") && <span className="text-destructive">*</span>}
          </label>
          <input
            type="text"
            {...register("accountHolder")}
            maxLength={200}
            placeholder="Nur angeben, wenn Konto auf anderen Namen laeuft"
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
          {errors.accountHolder && (
            <p className="text-xs text-destructive">
              {errors.accountHolder.message}
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
