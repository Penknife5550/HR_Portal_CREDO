"use client";

/**
 * Step 3: Bankverbindung
 * IBAN, BIC, Bankname, Kontoinhaber
 */

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { step3Schema, type Step3Data } from "@/lib/validations/personal-data";
import { formatIBAN } from "@/lib/utils/iban-validator";

interface StepProps {
  data: Record<string, unknown>;
  onNext: (data: Record<string, unknown>) => void;
  onBack: () => void;
  saving: boolean;
}

export function Step3Bank({ data, onNext, onBack, saving }: StepProps) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<Step3Data>({
    resolver: zodResolver(step3Schema),
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
    onNext(values as unknown as Record<string, unknown>);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="rounded-lg border border-[#009AC6]/20 bg-[#009AC6]/5 p-4">
        <p className="text-sm text-[#009AC6]">
          Bitte geben Sie die Bankverbindung an, auf die Ihr Gehalt ueberwiesen
          werden soll. Die IBAN finden Sie auf Ihrer Bankkarte oder im
          Online-Banking.
        </p>
      </div>

      {/* IBAN */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          IBAN <span className="text-destructive">*</span>
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

      {/* BIC */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          BIC (optional)
        </label>
        <input
          type="text"
          {...register("bic")}
          placeholder="COBADEFFXXX"
          className="w-full rounded-lg border border-input bg-background px-4 py-2.5 font-mono text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        />
        <p className="text-xs text-muted-foreground">
          Fuer innerdeutsche Ueberweisungen ist der BIC nicht zwingend
          erforderlich.
        </p>
      </div>

      {/* Bankname */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          Name der Bank (optional)
        </label>
        <input
          type="text"
          {...register("bankName")}
          placeholder="z.B. Sparkasse Minden-Luebbecke"
          className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Kontoinhaber */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          Kontoinhaber (falls abweichend)
        </label>
        <input
          type="text"
          {...register("accountHolder")}
          placeholder="Nur angeben, wenn Konto auf anderen Namen laeuft"
          className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        />
      </div>

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
