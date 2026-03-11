"use client";

/**
 * Step 2: Adresse & Kontakt
 * Strasse, PLZ, Ort, Telefon, E-Mail
 */

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { step2Schema, type Step2Data } from "@/lib/validations/personal-data";

interface StepProps {
  data: Record<string, unknown>;
  onNext: (data: Record<string, unknown>) => void;
  onBack: () => void;
  saving: boolean;
}

export function Step2Address({ data, onNext, onBack, saving }: StepProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Step2Data>({
    resolver: zodResolver(step2Schema),
    defaultValues: {
      street: (data.street as string) || "",
      houseNumber: (data.houseNumber as string) || "",
      zipCode: (data.zipCode as string) || "",
      city: (data.city as string) || "",
      country: (data.country as string) || "Deutschland",
      phone: (data.phone as string) || "",
      mobile: (data.mobile as string) || "",
      emailPrivate: (data.emailPrivate as string) || "",
    },
  });

  const onSubmit = (values: Step2Data) => {
    onNext(values as unknown as Record<string, unknown>);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Strasse + Hausnummer */}
      <div className="grid gap-4 sm:grid-cols-[1fr_6rem]">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Strasse <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            {...register("street")}
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
          {errors.street && (
            <p className="text-xs text-destructive">{errors.street.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Nr. <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            {...register("houseNumber")}
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
          {errors.houseNumber && (
            <p className="text-xs text-destructive">
              {errors.houseNumber.message}
            </p>
          )}
        </div>
      </div>

      {/* PLZ + Ort */}
      <div className="grid gap-4 sm:grid-cols-[6rem_1fr]">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            PLZ <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            {...register("zipCode")}
            maxLength={10}
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
          {errors.zipCode && (
            <p className="text-xs text-destructive">{errors.zipCode.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Ort <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            {...register("city")}
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
          {errors.city && (
            <p className="text-xs text-destructive">{errors.city.message}</p>
          )}
        </div>
      </div>

      {/* Land */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Land</label>
        <input
          type="text"
          {...register("country")}
          className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Telefon + Mobil */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Telefon (Festnetz)
          </label>
          <input
            type="tel"
            {...register("phone")}
            placeholder="0571 / 123456"
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Mobil</label>
          <input
            type="tel"
            {...register("mobile")}
            placeholder="0170 / 1234567"
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Private E-Mail */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          Private E-Mail-Adresse
        </label>
        <input
          type="email"
          {...register("emailPrivate")}
          placeholder="vorname@beispiel.de"
          className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        />
        {errors.emailPrivate && (
          <p className="text-xs text-destructive">
            {errors.emailPrivate.message}
          </p>
        )}
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
