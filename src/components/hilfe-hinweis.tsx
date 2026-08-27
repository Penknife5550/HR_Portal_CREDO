"use client";

/**
 * Erklaerungen im Personalfragebogen.
 *
 * Der Fragebogen fragt Dinge ab, die gesetzlich definiert sind — was als
 * „Schüler" gilt, was die Regelaltersgrenze ist, warum mehrere Minijobs
 * zusammengerechnet werden. Wer das ungefragt in die Beschriftung schreibt,
 * macht das Formular unlesbar; wer es weglaesst, laesst die Leute raten.
 *
 * Deshalb zwei Bausteine:
 *
 * - `HilfeHinweis` — ein Fragezeichen neben einer Beschriftung. Ein Klick
 *   klappt die Erklaerung darunter auf.
 * - `ErklaerBox` — ein ruhiger Kasten fuer das, was einen ganzen Abschnitt
 *   betrifft und vor dem Ausfuellen gelesen werden sollte.
 *
 * **Aufklappen statt Hover:** Ein Tooltip am Mauszeiger ist auf dem Handy nicht
 * erreichbar und fuer Screenreader schwer zu fassen. Die Erklaerung steht
 * deshalb im Textfluss und bleibt offen, bis man sie wieder schliesst.
 */

import { useId, useState, type ReactNode } from "react";

interface HilfeHinweisProps {
  /** Worum geht es? Wird Screenreadern als Beschriftung vorgelesen. */
  thema: string;
  children: ReactNode;
}

export function HilfeHinweis({ thema, children }: HilfeHinweisProps) {
  const [offen, setOffen] = useState(false);
  const id = useId();

  return (
    <>
      <button
        type="button"
        onClick={() => setOffen((v) => !v)}
        aria-expanded={offen}
        aria-controls={id}
        aria-label={
          offen
            ? `Erklärung zu „${thema}“ schließen`
            : `Was bedeutet „${thema}“?`
        }
        className={`ml-1.5 inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border text-[11px] font-bold leading-none transition-colors ${
          offen
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-muted text-muted-foreground hover:border-primary hover:text-primary"
        }`}
      >
        ?
      </button>
      {offen && (
        <div
          id={id}
          className="mt-1.5 rounded-lg border-l-4 border-[#009AC6] bg-[#009AC6]/5 px-3 py-2 text-xs leading-relaxed text-foreground"
        >
          {children}
        </div>
      )}
    </>
  );
}

interface ErklaerBoxProps {
  titel: string;
  children: ReactNode;
  /** Hebt den Kasten hervor, wenn die Angabe spuerbare Folgen hat. */
  betont?: boolean;
}

export function ErklaerBox({ titel, children, betont = false }: ErklaerBoxProps) {
  return (
    <div
      className={`rounded-lg border-l-4 p-4 ${
        betont
          ? "border-[#FBC900] bg-[#FBC900]/10"
          : "border-[#009AC6] bg-[#009AC6]/5"
      }`}
    >
      <p className="text-sm font-semibold text-foreground">{titel}</p>
      <div className="mt-1 space-y-2 text-xs leading-relaxed text-foreground/80">
        {children}
      </div>
    </div>
  );
}
