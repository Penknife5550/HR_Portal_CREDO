/**
 * Step 2 — Beobachtung
 *
 * Bewertung pro Kategorie/Kriterium auf der vom Template definierten Skala.
 * Skala dynamisch (BRL_1_5: 5–1 oder SCHULNOTEN_1_6: 1–6).
 *
 * Rechtsgrundlagen:
 * - BRL Nr. 6.1 — Sechs Beurteilungsmerkmale
 * - BRL Nr. 7.3 — 5-Punkte-Skala
 */

import { LegalBox } from "./legal-box";
import type { StepProps } from "./types";
import {
  BRL_SCALE_LABELS,
  SCHULNOTEN_SCALE_LABELS,
} from "@/lib/beurteilung-defaults";

export function Step2Beobachtung({
  initialData,
  formState,
  setFormState,
  onChange,
}: StepProps) {
  const snapshot = initialData.templateSnapshot;
  if (!snapshot) {
    return (
      <div className="rounded-lg border border-credo-rot/30 bg-credo-rot/10 p-4 text-sm text-credo-rot">
        Kein Beurteilungs-Template hinterlegt — bitte HR kontaktieren.
      </div>
    );
  }

  // Skala bestimmen
  const scaleType = snapshot.scaleType ?? initialData.scaleType ?? "BRL_1_5";
  const scaleLabels =
    snapshot.scaleLabels ??
    (scaleType === "BRL_1_5" ? BRL_SCALE_LABELS : SCHULNOTEN_SCALE_LABELS);

  // Bei BRL_1_5: 5 → 1 (5 ist best), bei SCHULNOTEN: 1 → 6 (1 ist best)
  const grades =
    scaleType === "BRL_1_5" ? [5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6];

  const sortedCategories = [...snapshot.categories].sort(
    (a, b) => a.orderIndex - b.orderIndex,
  );

  function setRating(criterionId: string, value: number) {
    setFormState((p) => ({
      ...p,
      ratings: { ...p.ratings, [criterionId]: value },
    }));
    onChange();
  }

  // Farbe je Note (Best → Schlecht, unabhängig von Skala)
  function gradeColor(grade: number, selected: boolean): string {
    if (!selected) return "bg-muted text-foreground hover:bg-muted/80";

    // "Best" je Skala
    const isBest =
      scaleType === "BRL_1_5" ? grade === 5 : grade === 1;
    const isGood =
      scaleType === "BRL_1_5" ? grade === 4 : grade === 2;
    const isMid =
      scaleType === "BRL_1_5" ? grade === 3 : grade === 3;
    const isBelow =
      scaleType === "BRL_1_5" ? grade === 2 : grade === 4;

    if (isBest || isGood) return "bg-credo-gruen text-white";
    if (isMid) return "bg-credo-gelb text-white";
    if (isBelow) return "bg-orange-500 text-white";
    return "bg-credo-rot text-white";
  }

  // Fortschritt
  const totalCriteria = sortedCategories.reduce(
    (sum, c) => sum + c.criteria.length,
    0,
  );
  const ratedCriteria = Object.keys(formState.ratings).filter((k) =>
    sortedCategories.some((c) => c.criteria.some((cr) => cr.id === k)),
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">
          Schritt 2 — Beobachtung
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Bewerten Sie jedes Kriterium gemäß der vorgegebenen Skala. Sie
          können in alle Kategorien zwischenwechseln, der Stand wird
          automatisch gespeichert.
        </p>
      </div>

      <LegalBox references={["BRL_6_1", "BRL_7_3"]} />

      {/* Skalen-Legende */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Bewertungsskala —{" "}
          {scaleType === "BRL_1_5" ? "BRL 1–5" : "Schulnoten 1–6"}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
          {grades.map((g) => (
            <div key={g} className="flex items-center gap-2 text-xs">
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded font-bold ${gradeColor(
                  g,
                  true,
                )}`}
              >
                {g}
              </span>
              <span className="text-foreground">{scaleLabels[String(g)]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Fortschritt */}
      <div className="rounded-lg bg-muted px-4 py-2 text-xs font-medium text-muted-foreground flex items-center justify-between">
        <span>
          {ratedCriteria} von {totalCriteria} Kriterien bewertet
        </span>
        <span>
          {totalCriteria > 0
            ? Math.round((ratedCriteria / totalCriteria) * 100)
            : 0}
          %
        </span>
      </div>

      {/* Kategorien */}
      <div className="space-y-6">
        {sortedCategories.map((cat) => {
          const sortedCriteria = [...cat.criteria].sort(
            (a, b) => a.orderIndex - b.orderIndex,
          );
          const catRated = sortedCriteria.filter(
            (cr) => formState.ratings[cr.id] !== undefined,
          ).length;

          return (
            <div
              key={cat.id}
              className="rounded-xl border border-border bg-card overflow-hidden"
            >
              {/* Kategorie-Header */}
              <div className="border-b border-border p-4 bg-muted/20">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h3 className="text-sm font-bold text-foreground">
                      {cat.name}
                    </h3>
                    {cat.description && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {cat.description}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 inline-flex rounded-full bg-card px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground border border-border">
                    {catRated}/{sortedCriteria.length}
                  </span>
                </div>
                {cat.legalReference && (
                  <div className="mt-2 inline-flex rounded bg-credo-blau/10 px-2 py-0.5 text-[10px] font-semibold text-credo-blau">
                    {cat.legalReference}
                  </div>
                )}
              </div>

              {/* Kriterien */}
              <div className="divide-y divide-border">
                {sortedCriteria.map((crit) => {
                  const current = formState.ratings[crit.id];
                  return (
                    <div key={crit.id} className="p-4">
                      <div className="mb-3">
                        <p className="text-sm font-medium text-foreground">
                          {crit.name}
                        </p>
                        {crit.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {crit.description}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {grades.map((g) => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => setRating(crit.id, g)}
                            className={`min-h-[44px] min-w-[44px] rounded-lg px-3 py-2 text-sm font-bold transition-colors ${gradeColor(
                              g,
                              current === g,
                            )}`}
                            aria-label={`Note ${g}`}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
