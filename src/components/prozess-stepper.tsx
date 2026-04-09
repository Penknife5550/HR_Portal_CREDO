"use client";

/**
 * ProzessStepper — generische horizontale Schritt-Anzeige
 *
 * Visualisiert einen Workflow als Sequenz von Schritten:
 *  - abgeschlossene Schritte: gruener Hintergrund, Haken
 *  - aktueller Schritt: kraeftig umrandet, gefettet
 *  - kommende Schritte: grau
 *  - "Erster Schritt" / "Letzter Schritt"-Marker an den Enden
 *  - Mobile: bricht in vertikale Liste um
 *
 * Wird sowohl von der Elternzeit- als auch der Mutterschutz-Detailseite
 * verwendet — die jeweilige Workflow-Lib liefert die Schritte.
 */

import { CheckIcon } from "lucide-react";

export type StepperItem = {
  id: string;
  label: string;
  beschreibung?: string;
};

export function ProzessStepper({
  steps,
  currentStepIndex,
  abgebrochen = false,
  pausiert = false,
}: {
  steps: StepperItem[];
  /** Index des aktuellen Schritts (-1 = ausserhalb der Sequenz, z.B. abgebrochen) */
  currentStepIndex: number;
  /** Vorgang ist abgebrochen (Ablehnung) */
  abgebrochen?: boolean;
  /** Vorgang ist pausiert (Unterbrechung) */
  pausiert?: boolean;
}) {
  if (abgebrochen) {
    return (
      <div className="rounded-lg border border-credo-rot/30 bg-credo-rot/5 p-4">
        <div className="text-sm font-semibold text-credo-rot">
          Vorgang abgebrochen
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          Der Antrag wurde abgelehnt — keine weiteren Schritte mehr.
        </div>
      </div>
    );
  }

  if (pausiert) {
    return (
      <div className="rounded-lg border border-credo-gelb/40 bg-credo-gelb/10 p-4">
        <div className="text-sm font-semibold">Vorgang pausiert</div>
        <div className="mt-1 text-xs text-muted-foreground">
          Der Vorgang ist aktuell unterbrochen.
        </div>
      </div>
    );
  }

  // a11y-Helfer: liefert das Status-Wort fuer Screenreader
  const statusWort = (
    istErledigt: boolean,
    istAktuell: boolean,
  ): string =>
    istErledigt ? "abgeschlossen" : istAktuell ? "aktueller Schritt" : "offen";

  return (
    <nav
      aria-label="Prozessfortschritt"
      className="rounded-lg border bg-card p-4"
    >
      <div className="mb-3 text-xs text-muted-foreground">
        Schritt{" "}
        {currentStepIndex >= 0 ? currentStepIndex + 1 : "?"} von {steps.length}
      </div>

      {/* Desktop: Horizontaler Stepper */}
      <ol className="hidden sm:flex items-start gap-1">
        {steps.map((step, idx) => {
          const istErledigt = idx < currentStepIndex;
          const istAktuell = idx === currentStepIndex;
          const istErster = idx === 0;
          const istLetzter = idx === steps.length - 1;

          return (
            <li
              key={step.id}
              className="relative flex-1 min-w-0"
              aria-current={istAktuell ? "step" : undefined}
              aria-label={`Schritt ${idx + 1} von ${steps.length}: ${step.label} — ${statusWort(istErledigt, istAktuell)}`}
            >
              {/* Verbindungslinie zum naechsten Schritt */}
              {!istLetzter && (
                <div
                  className={`absolute top-4 left-1/2 right-0 h-0.5 -translate-y-1/2 ${
                    istErledigt ? "bg-credo-gruen" : "bg-border"
                  }`}
                  style={{ width: "calc(100% - 1rem)" }}
                  aria-hidden="true"
                />
              )}

              <div className="relative flex flex-col items-center">
                {/* Kreis */}
                <div
                  className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                    istErledigt
                      ? "border-credo-gruen bg-credo-gruen text-white"
                      : istAktuell
                        ? "border-credo-gruen bg-background text-credo-gruen ring-4 ring-credo-gruen/20"
                        : "border-border bg-background text-muted-foreground"
                  }`}
                  aria-hidden="true"
                >
                  {istErledigt ? (
                    <CheckIcon className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <span className="text-xs font-semibold">{idx + 1}</span>
                  )}
                </div>

                {/* Label (visuell, fuer SR ist aria-label am <li> die Quelle) */}
                <div
                  className={`mt-2 text-center text-[10px] leading-tight ${
                    istAktuell
                      ? "font-semibold text-foreground"
                      : istErledigt
                        ? "text-foreground/70"
                        : "text-muted-foreground"
                  }`}
                  aria-hidden="true"
                >
                  {step.label}
                </div>

                {/* Erster/Letzter Marker */}
                {(istErster || istLetzter) && (
                  <div
                    className="mt-1 text-[9px] uppercase tracking-wide text-muted-foreground"
                    aria-hidden="true"
                  >
                    {istErster ? "Start" : "Ende"}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Mobile: Vertikale Liste */}
      <ol className="sm:hidden space-y-2">
        {steps.map((step, idx) => {
          const istErledigt = idx < currentStepIndex;
          const istAktuell = idx === currentStepIndex;
          const istErster = idx === 0;
          const istLetzter = idx === steps.length - 1;

          return (
            <li
              key={step.id}
              className="flex items-start gap-3"
              aria-current={istAktuell ? "step" : undefined}
              aria-label={`Schritt ${idx + 1} von ${steps.length}: ${step.label} — ${statusWort(istErledigt, istAktuell)}`}
            >
              <div
                className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                  istErledigt
                    ? "border-credo-gruen bg-credo-gruen text-white"
                    : istAktuell
                      ? "border-credo-gruen bg-background text-credo-gruen ring-2 ring-credo-gruen/20"
                      : "border-border bg-background text-muted-foreground"
                }`}
                aria-hidden="true"
              >
                {istErledigt ? (
                  <CheckIcon className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <span className="text-[10px] font-semibold">{idx + 1}</span>
                )}
              </div>
              <div className="flex-1 min-w-0" aria-hidden="true">
                <div
                  className={`text-xs ${
                    istAktuell
                      ? "font-semibold text-foreground"
                      : istErledigt
                        ? "text-foreground/70"
                        : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                  {istErster && (
                    <span className="ml-2 text-[9px] uppercase tracking-wide text-muted-foreground">
                      Start
                    </span>
                  )}
                  {istLetzter && (
                    <span className="ml-2 text-[9px] uppercase tracking-wide text-muted-foreground">
                      Ende
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * NaechsterSchrittBanner — prominenter Hinweis unter dem Stepper.
 * Zeigt, was als naechstes zu tun ist, und rendert optional einen Action-Button.
 */
export function NaechsterSchrittBanner({
  titel,
  beschreibung,
  hrAktion,
  actionLabel,
  onAction,
  disabled = false,
}: {
  titel: string;
  beschreibung: string;
  hrAktion: boolean;
  actionLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`mt-3 rounded-lg border p-4 ${
        hrAktion
          ? "border-credo-gruen/40 bg-credo-gruen/5"
          : "border-border bg-muted/30"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`inline-block h-2 w-2 rounded-full ${
                hrAktion
                  ? "bg-credo-gruen motion-safe:animate-pulse"
                  : "bg-muted-foreground"
              }`}
            />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {hrAktion ? "Naechster Schritt — HR" : "Naechster Schritt"}
            </span>
          </div>
          <div className="mt-1 text-sm font-semibold">{titel}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {beschreibung}
          </div>
        </div>
        {hrAktion && actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            disabled={disabled}
            className="flex-shrink-0 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
