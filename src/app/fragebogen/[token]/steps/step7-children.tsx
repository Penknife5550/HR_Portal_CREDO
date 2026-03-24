"use client";

/**
 * Step 7: Kinder
 * Dynamische Liste von Kindern mit Name, Geburtsdatum, Kinderfreibetrag
 */

import { useState } from "react";
import { FieldConfigHelper } from "@/lib/field-definitions";

interface ChildEntry {
  firstName: string;
  lastName: string;
  birthDate: string;
  taxAllowance: boolean;
}

interface StepProps {
  data: Record<string, unknown>;
  onNext: (data: Record<string, unknown>) => void;
  onBack: () => void;
  saving: boolean;
  fieldConfig?: FieldConfigHelper;
}

export function Step7Children({ data, onNext, onBack, saving, fieldConfig }: StepProps) {
  const existing = (data.children as ChildEntry[]) || [];
  const [children, setChildren] = useState<ChildEntry[]>(existing);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const addChild = () => {
    setChildren([
      ...children,
      { firstName: "", lastName: "", birthDate: "", taxAllowance: false },
    ]);
  };

  const removeChild = (index: number) => {
    setChildren(children.filter((_, i) => i !== index));
    // Fehler bereinigen
    const newErrors = { ...errors };
    Object.keys(newErrors).forEach((key) => {
      if (key.startsWith(`${index}-`)) delete newErrors[key];
    });
    setErrors(newErrors);
  };

  const updateChild = (
    index: number,
    field: keyof ChildEntry,
    value: string | boolean
  ) => {
    const updated = [...children];
    updated[index] = { ...updated[index], [field]: value };
    setChildren(updated);
    // Fehler fuer dieses Feld entfernen
    if (errors[`${index}-${field}`]) {
      const newErrors = { ...errors };
      delete newErrors[`${index}-${field}`];
      setErrors(newErrors);
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    children.forEach((child, index) => {
      if (!child.firstName.trim()) {
        newErrors[`${index}-firstName`] = "Vorname ist erforderlich.";
      }
      if (!child.birthDate) {
        newErrors[`${index}-birthDate`] = "Geburtsdatum ist erforderlich.";
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onNext({ children });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-lg border border-[#009AC6]/20 bg-[#009AC6]/5 p-4">
        <p className="text-sm text-[#009AC6]">
          Bitte geben Sie Ihre Kinder an. Diese Angaben werden fuer die
          Berechnung des Kinderfreibetrages und der Pflegeversicherung benoetigt.
          Wenn Sie keine Kinder haben, koennen Sie diesen Schritt ueberspringen.
        </p>
      </div>

      {/* Kinderliste */}
      {children.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Keine Kinder eingetragen.
          </p>
          <button
            type="button"
            onClick={addChild}
            className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            + Kind hinzufuegen
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {children.map((child, index) => (
            <div
              key={index}
              className="rounded-lg border border-border bg-muted/30 p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  Kind {index + 1}
                </h3>
                <button
                  type="button"
                  onClick={() => removeChild(index)}
                  className="rounded-md px-2 py-1 text-xs text-destructive transition-colors hover:bg-destructive/10"
                >
                  Entfernen
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {/* Vorname */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">
                    Vorname <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={child.firstName}
                    onChange={(e) =>
                      updateChild(index, "firstName", e.target.value)
                    }
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                  {errors[`${index}-firstName`] && (
                    <p className="text-xs text-destructive">
                      {errors[`${index}-firstName`]}
                    </p>
                  )}
                </div>

                {/* Nachname */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">
                    Nachname
                  </label>
                  <input
                    type="text"
                    value={child.lastName}
                    onChange={(e) =>
                      updateChild(index, "lastName", e.target.value)
                    }
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </div>

                {/* Geburtsdatum */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">
                    Geburtsdatum <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="date"
                    value={child.birthDate}
                    onChange={(e) =>
                      updateChild(index, "birthDate", e.target.value)
                    }
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                  {errors[`${index}-birthDate`] && (
                    <p className="text-xs text-destructive">
                      {errors[`${index}-birthDate`]}
                    </p>
                  )}
                </div>

                {/* Kinderfreibetrag */}
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={child.taxAllowance}
                      onChange={(e) =>
                        updateChild(index, "taxAllowance", e.target.checked)
                      }
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    Kinderfreibetrag
                  </label>
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addChild}
            className="w-full rounded-lg border-2 border-dashed border-border py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            + Weiteres Kind hinzufuegen
          </button>
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
