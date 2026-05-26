/**
 * LegalBox — wiederverwendbare Rechtsgrundlage-Box für jeden Step.
 *
 * CREDO CI: blaue Info-Box wie in step6-employment.tsx beim Onboarding.
 * Quelle: src/lib/legal-references.ts
 */

import { getLegalReferences } from "@/lib/legal-references";

interface Props {
  /** Schlüssel-Liste aus LEGAL_REFERENCES (z.B. ["BRL_8_3", "BRL_4_10"]). */
  references: string[];
  /** Optionale Einleitung über den Verweisen. */
  intro?: string;
}

export function LegalBox({ references, intro }: Props) {
  const refs = getLegalReferences(...references);
  if (refs.length === 0) return null;

  return (
    <div className="rounded-lg border border-credo-blau/20 bg-credo-blau/5 p-4">
      <div className="flex items-center gap-2 mb-2">
        <svg
          className="h-4 w-4 text-credo-blau"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span className="text-xs font-semibold uppercase tracking-wider text-credo-blau">
          Rechtsgrundlage
        </span>
      </div>
      {intro && <p className="text-xs text-foreground mb-3">{intro}</p>}
      <ul className="space-y-2">
        {refs.map((ref) => (
          <li key={ref.key} className="text-xs text-foreground">
            <div className="flex items-start gap-2">
              <span className="inline-flex shrink-0 rounded bg-credo-blau/15 px-1.5 py-0.5 text-[10px] font-bold text-credo-blau">
                {ref.shortLabel}
              </span>
              <span>
                <strong className="text-foreground">{ref.title}</strong>
                <br />
                <span className="text-muted-foreground">{ref.summary}</span>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
