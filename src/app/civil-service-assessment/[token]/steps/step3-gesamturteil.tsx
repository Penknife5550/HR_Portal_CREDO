/**
 * Step 3 — Gesamturteil
 *
 * Manuelle Entscheidung "erfüllt die Anforderungen" Ja/Nein + Pflichtbegründung
 * (mind. 200 Zeichen). Visualisierung der Kategorie-Schnitte als Hilfe, aber
 * KEIN automatisches Gesamturteil (BRL Nr. 7.5).
 *
 * Rechtsgrundlagen:
 * - Art. 33 Abs. 2 GG, § 9 BeamtStG (Bestenauslese)
 * - BRL Nr. 7.5 — Gesamturteil ist KEIN arithmetisches Mittel
 */

import { useMemo } from "react";
import { LegalBox } from "./legal-box";
import type { StepProps } from "./types";

export function Step3Gesamturteil({
  initialData,
  formState,
  setFormState,
  onChange,
}: StepProps) {
  const snapshot = initialData.templateSnapshot;

  const sortedCategories = useMemo(
    () =>
      snapshot
        ? [...snapshot.categories].sort((a, b) => a.orderIndex - b.orderIndex)
        : [],
    [snapshot],
  );

  // Kategorie-Schnitte (gewichtet) — nur Visualisierung!
  const categoryAverages = useMemo(() => {
    const result: Record<string, number | null> = {};
    for (const cat of sortedCategories) {
      let totalWeight = 0;
      let weightedSum = 0;
      for (const crit of cat.criteria) {
        const grade = formState.ratings[crit.id];
        if (typeof grade !== "number") continue;
        totalWeight += crit.weight;
        weightedSum += crit.weight * grade;
      }
      result[cat.id] =
        totalWeight === 0 ? null : Math.round((weightedSum / totalWeight) * 100) / 100;
    }
    return result;
  }, [sortedCategories, formState.ratings]);

  if (!snapshot) return null;

  const scaleType = snapshot.scaleType ?? initialData.scaleType ?? "BRL_1_5";

  const reasoningLength = formState.overallReasoning.trim().length;
  const reasoningOk = reasoningLength >= 200;
  const decisionMade = formState.meetsRequirementsManual !== null;

  // "Best" je Skala
  const isBest = scaleType === "BRL_1_5"
    ? (avg: number) => avg >= 4
    : (avg: number) => avg <= 2;
  const isOk = scaleType === "BRL_1_5"
    ? (avg: number) => avg >= 3
    : (avg: number) => avg <= 3;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">
          Schritt 3 — Gesamturteil
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Treffen Sie eine eigenständige, abwägende Gesamtbeurteilung. Die
          Kategorie-Schnitte unten dienen nur als Übersicht — Ihr Urteil ist
          KEIN arithmetisches Mittel.
        </p>
      </div>

      <LegalBox
        references={["BRL_7_5", "Art_33_2_GG", "BeamtStG_9"]}
        intro="Das Gesamturteil ist eine Wertung der Gesamtpersönlichkeit nach Eignung, Befähigung und fachlicher Leistung. Es ist schriftlich zu begründen."
      />

      {/* Kategorie-Schnitte als Visualisierung */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Kategorie-Schnitte (Hilfsvisualisierung)
        </p>
        <div className="space-y-2">
          {sortedCategories.map((cat) => {
            const avg = categoryAverages[cat.id];
            const colorClass =
              avg === null
                ? "text-muted-foreground"
                : isBest(avg)
                  ? "text-credo-gruen"
                  : isOk(avg)
                    ? "text-credo-gelb"
                    : "text-credo-rot";
            return (
              <div
                key={cat.id}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-foreground">{cat.name}</span>
                <span className={`font-bold ${colorClass}`}>
                  {avg !== null ? avg.toFixed(2) : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Manuelles Gesamturteil */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Erfüllt die Lehrkraft die Anforderungen für die Verbeamtung? *
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              setFormState((p) => ({ ...p, meetsRequirementsManual: true }));
              onChange();
            }}
            className={`rounded-xl border-2 px-4 py-4 text-sm font-semibold transition-colors ${
              formState.meetsRequirementsManual === true
                ? "border-credo-gruen bg-credo-gruen/10 text-credo-gruen"
                : "border-border bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            ✓ Ja, erfüllt die Anforderungen
          </button>
          <button
            type="button"
            onClick={() => {
              setFormState((p) => ({ ...p, meetsRequirementsManual: false }));
              onChange();
            }}
            className={`rounded-xl border-2 px-4 py-4 text-sm font-semibold transition-colors ${
              formState.meetsRequirementsManual === false
                ? "border-credo-rot bg-credo-rot/10 text-credo-rot"
                : "border-border bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            ✗ Nein, erfüllt nicht
          </button>
        </div>
      </div>

      {/* Pflichtbegründung */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-foreground">
            Begründung des Gesamturteils *
          </label>
          <span
            className={`text-xs font-medium ${
              reasoningOk ? "text-credo-gruen" : "text-muted-foreground"
            }`}
          >
            {reasoningLength}/200 Zeichen min.
          </span>
        </div>
        <textarea
          value={formState.overallReasoning}
          onChange={(e) => {
            setFormState((p) => ({ ...p, overallReasoning: e.target.value }));
            onChange();
          }}
          rows={8}
          placeholder="Bitte begründen Sie Ihr Gesamturteil ausführlich und unter Berücksichtigung der Gesamtpersönlichkeit. Beziehen Sie sich auf konkrete Beobachtungen aus dem Unterricht und auf die Zusammenarbeit. Mindestens 200 Zeichen."
          className="w-full rounded-lg border border-input bg-background px-4 py-3 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none resize-y"
        />
        {!reasoningOk && reasoningLength > 0 && (
          <p className="mt-1 text-xs text-credo-gelb">
            Noch {200 - reasoningLength} Zeichen bis zum Mindestumfang.
          </p>
        )}
      </div>

      {!decisionMade && (
        <div className="rounded-lg border border-credo-gelb/30 bg-credo-gelb/5 p-3 text-xs text-foreground">
          Sie müssen sowohl ein Gesamturteil treffen als auch die Begründung
          ausfüllen, bevor Sie zum nächsten Schritt weitergehen können.
        </div>
      )}
    </div>
  );
}
