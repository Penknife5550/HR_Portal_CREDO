/**
 * BeurteilungStatusStepper
 *
 * Visueller Stepper, der den aktuellen Workflow-Status einer Beurteilung
 * zeigt. Wird wiederverwendet in:
 * - SL-Multi-Step-Form (kompakt im Sticky Header)
 * - HR-Dashboard tab-assessments (volle Variante)
 * - Public Verify-Page (Phase 6)
 *
 * CREDO CI: Theme-Variablen, keine Hex-Hartcodes.
 */

import {
  ALL_STATUS_STEPS,
  getStepStates,
  type BeurteilungStatus,
} from "@/lib/beurteilung-status";

interface Props {
  status: BeurteilungStatus;
  /** Kompakte Variante (nur Punkte, kein Label) für enge Bereiche. */
  variant?: "full" | "compact";
  className?: string;
}

export function BeurteilungStatusStepper({
  status,
  variant = "full",
  className = "",
}: Props) {
  const steps = getStepStates(status);
  const isCompact = variant === "compact";

  return (
    <div
      className={`flex items-center w-full ${className}`}
      role="list"
      aria-label="Workflow-Status"
    >
      {steps.map((step, idx) => {
        const isLast = idx === steps.length - 1;

        // Farb-Klassen je Zustand
        let dotClass = "bg-gray-200 text-gray-400 border-gray-200";
        let lineClass = "bg-gray-200";
        let labelClass = "text-gray-400";

        if (step.state === "completed") {
          dotClass =
            "bg-credo-gruen text-white border-credo-gruen";
          lineClass = "bg-credo-gruen";
          labelClass = "text-credo-gruen";
        } else if (step.state === "current") {
          dotClass =
            "bg-credo-blau text-white border-credo-blau ring-4 ring-credo-blau/20";
          lineClass = "bg-gray-200";
          labelClass = "text-credo-blau font-semibold";
        }

        return (
          <div
            key={step.key}
            role="listitem"
            className={`flex items-center ${isLast ? "" : "flex-1"}`}
          >
            {/* Punkt */}
            <div className="flex flex-col items-center">
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-colors ${dotClass}`}
                title={ALL_STATUS_STEPS[idx].label}
              >
                {step.state === "completed" ? "✓" : idx + 1}
              </div>
              {!isCompact && (
                <span
                  className={`mt-1.5 text-[10px] font-medium whitespace-nowrap ${labelClass}`}
                >
                  {step.shortLabel}
                </span>
              )}
            </div>

            {/* Verbindungslinie */}
            {!isLast && (
              <div
                className={`mx-1 h-0.5 flex-1 transition-colors ${lineClass}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
