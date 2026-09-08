"use client";

/**
 * Step 2: Adresse & Kontakt
 * Strasse, PLZ, Ort, Telefon, E-Mail
 */

import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createStep2Schema, type Step2Data } from "@/lib/validations/personal-data";
import { FieldConfigHelper } from "@/lib/field-definitions";

interface StepProps {
  data: Record<string, unknown>;
  onNext: (data: Record<string, unknown>) => void;
  onBack: () => void;
  saving: boolean;
  fieldConfig?: FieldConfigHelper;
}

export function Step2Address({ data, onNext, onBack, saving, fieldConfig }: StepProps) {
  // Der Rueckfall darf nicht bei jedem Tastendruck ein neues Helfer-Objekt
  // bauen — sonst haengt das Schema unten an einer Kennung, die sich staendig
  // aendert, und wird bei jedem Rendern neu gebaut.
  const fc = useMemo(() => fieldConfig ?? new FieldConfigHelper(2), [fieldConfig]);
  // Geprueft wird gegen dieselbe Konfiguration, aus der die Maske ihre
  // Sternchen zeichnet. Vorher stand hier das feste `step2Schema`: Nahm HR ein
  // Feld aus der Pflicht, verlangte der Schritt es weiter — ohne Stern, den man
  // haette deuten koennen; und umgekehrt liess er ein neu zur Pflicht erklaertes
  // Feld leer durch.
  const schema = useMemo(() => createStep2Schema(fc), [fc]);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Step2Data>({
    resolver: zodResolver(schema),
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
      {fc.isVisible("street") && (
        <div className="grid grid-cols-[1fr_8rem] gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              {fc.getLabel("street")} {fc.isRequired("street") && <span className="text-destructive">*</span>}
            </label>
            <input
              type="text"
              autoComplete="off"
              {...register("street")}
              className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
            {errors.street && (
              <p className="text-xs text-destructive">{errors.street.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              {fc.getLabel("houseNumber")} {fc.isRequired("houseNumber") && <span className="text-destructive">*</span>}
            </label>
            <input
              type="text"
              autoComplete="off"
              {...register("houseNumber")}
              maxLength={20}
              className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
            {errors.houseNumber && (
              <p className="text-xs text-destructive">
                {errors.houseNumber.message}
              </p>
            )}
          </div>
        </div>
      )}

      {/* PLZ + Ort */}
      {fc.isVisible("zipCode") && (
        <div className="grid gap-4 sm:grid-cols-[6rem_1fr]">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              {fc.getLabel("zipCode")} {fc.isRequired("zipCode") && <span className="text-destructive">*</span>}
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
              {fc.getLabel("city")} {fc.isRequired("city") && <span className="text-destructive">*</span>}
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
      )}

      {/* Land */}
      {fc.isVisible("country") && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {fc.getLabel("country")} {fc.isRequired("country") && <span className="text-destructive">*</span>}
          </label>
          <input
            type="text"
            {...register("country")}
            maxLength={100}
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
          {errors.country && (
            <p className="text-xs text-destructive">{errors.country.message}</p>
          )}
        </div>
      )}

      {/* Telefon + Mobil */}
      {(fc.isVisible("phone") || fc.isVisible("mobile")) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {fc.isVisible("phone") && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {fc.getLabel("phone")} {fc.isRequired("phone") && <span className="text-destructive">*</span>}
              </label>
              <input
                type="tel"
                {...register("phone")}
                maxLength={50}
                placeholder="0571 / 123456"
                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
              {errors.phone && (
                <p className="text-xs text-destructive">{errors.phone.message}</p>
              )}
            </div>
          )}
          {fc.isVisible("mobile") && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {fc.getLabel("mobile")} {fc.isRequired("mobile") && <span className="text-destructive">*</span>}
              </label>
              <input
                type="tel"
                {...register("mobile")}
                maxLength={50}
                placeholder="0170 / 1234567"
                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
              {errors.mobile && (
                <p className="text-xs text-destructive">{errors.mobile.message}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Private E-Mail */}
      {fc.isVisible("emailPrivate") && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {fc.getLabel("emailPrivate")} {fc.isRequired("emailPrivate") && <span className="text-destructive">*</span>}
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
