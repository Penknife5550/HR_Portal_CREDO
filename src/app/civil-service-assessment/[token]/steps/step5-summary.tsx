/**
 * Step 5 — Zusammenfassung & Submit
 *
 * Zertifikat-Layout mit Read-Only-Übersicht aller Eingaben.
 * Verifikations-QR-Vorschau (Phase 6).
 *
 * Rechtsgrundlagen:
 * - § 92 Abs. 1 LBG NRW — Personalakte
 */

import { useMemo } from "react";
import { LegalBox } from "./legal-box";
import type { StepProps } from "./types";

export function Step5Summary({ initialData, formState }: StepProps) {
  const snapshot = initialData.templateSnapshot;

  const sortedCategories = useMemo(
    () =>
      snapshot
        ? [...snapshot.categories].sort((a, b) => a.orderIndex - b.orderIndex)
        : [],
    [snapshot],
  );

  // Verifikations-Hash (8 Zeichen aus verifyToken)
  const verifyHash = useMemo(() => {
    if (!initialData.verifyToken) return null;
    const clean = initialData.verifyToken.replace(/-/g, "");
    return `CRD-${clean.slice(0, 4).toUpperCase()}-${clean.slice(4, 8).toUpperCase()}`;
  }, [initialData.verifyToken]);

  if (!snapshot) return null;

  function formatDate(iso: string): string {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">
          Schritt 5 — Zusammenfassung & Einreichen
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Bitte prüfen Sie alle Angaben sorgfältig. Nach dem Einreichen kann
          die Beurteilung nicht mehr verändert werden.
        </p>
      </div>

      <LegalBox
        references={["LBG_92_1"]}
        intro="Nach dem Einreichen wird die Beurteilung der Lehrkraft zur Bekanntgabe vorgelegt. Die Lehrkraft hat das Recht auf eine Gegenäußerung."
      />

      {/* Stammdaten */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border p-4 bg-muted/30">
          <h3 className="text-sm font-bold text-foreground">Beurteilte Lehrkraft</h3>
        </div>
        <dl className="divide-y divide-border text-sm">
          <Row label="Name" value={initialData.employee.name} />
          <Row label="Schule" value={initialData.employee.organizationName} />
          <Row label="Beurteilung Nr." value={`${initialData.assessmentNumber}. Unterrichtsbesuch`} />
        </dl>
      </div>

      {/* Vorbereitung */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border p-4 bg-muted/30">
          <h3 className="text-sm font-bold text-foreground">Vorbereitung</h3>
        </div>
        <dl className="divide-y divide-border text-sm">
          <Row label="Termin" value={formatDate(formState.scheduledDate)} />
          <Row label="Fach" value={formState.fach || "—"} />
          <Row label="Klasse / Lerngruppe" value={formState.klasse || "—"} />
          <Row label="Vertrauenslehrkraft" value={formState.vertrauenslehrkraft || "—"} />
          <Row
            label="Befangenheit"
            value={
              formState.unbiasedConfirmed
                ? "✓ keine Befangenheit bestätigt"
                : "✗ noch nicht bestätigt"
            }
            highlight={formState.unbiasedConfirmed ? "good" : "bad"}
          />
        </dl>
      </div>

      {/* Bewertungen */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border p-4 bg-muted/30">
          <h3 className="text-sm font-bold text-foreground">Bewertungen</h3>
        </div>
        <div className="p-4 space-y-3">
          {sortedCategories.map((cat) => {
            const ratedCriteria = cat.criteria.filter(
              (cr) => formState.ratings[cr.id] !== undefined,
            );
            return (
              <div key={cat.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-foreground">
                    {cat.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {ratedCriteria.length}/{cat.criteria.length} bewertet
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {cat.criteria.map((crit) => {
                    const grade = formState.ratings[crit.id];
                    return (
                      <span
                        key={crit.id}
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium ${
                          grade !== undefined
                            ? "bg-credo-blau/10 text-credo-blau"
                            : "bg-muted text-muted-foreground"
                        }`}
                        title={crit.name}
                      >
                        {crit.name.length > 25
                          ? crit.name.slice(0, 25) + "…"
                          : crit.name}
                        {grade !== undefined && (
                          <strong className="font-bold">{grade}</strong>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Gesamturteil */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border p-4 bg-muted/30">
          <h3 className="text-sm font-bold text-foreground">Gesamturteil</h3>
        </div>
        <dl className="divide-y divide-border text-sm">
          <Row
            label="Anforderungen"
            value={
              formState.meetsRequirementsManual === true
                ? "✓ Erfüllt"
                : formState.meetsRequirementsManual === false
                  ? "✗ Nicht erfüllt"
                  : "noch nicht entschieden"
            }
            highlight={
              formState.meetsRequirementsManual === true
                ? "good"
                : formState.meetsRequirementsManual === false
                  ? "bad"
                  : undefined
            }
          />
        </dl>
        {formState.overallReasoning && (
          <div className="border-t border-border p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Begründung
            </p>
            <p className="text-sm text-foreground whitespace-pre-line">
              {formState.overallReasoning}
            </p>
          </div>
        )}
      </div>

      {/* Gespräche */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border p-4 bg-muted/30">
          <h3 className="text-sm font-bold text-foreground">Gespräche</h3>
        </div>
        <dl className="divide-y divide-border text-sm">
          <Row
            label="Nachbesprechung"
            value={
              formState.postReviewAt
                ? formatDate(formState.postReviewAt)
                : "nicht dokumentiert"
            }
          />
          <Row
            label="Beurteilungsgespräch"
            value={
              formState.beurteilungsgespraechAt
                ? formatDate(formState.beurteilungsgespraechAt)
                : "noch nicht dokumentiert"
            }
            highlight={formState.beurteilungsgespraechAt ? "good" : "bad"}
          />
        </dl>
      </div>

      {/* Verifikations-Hinweis */}
      {verifyHash && (
        <div className="rounded-xl border border-credo-gruen/30 bg-credo-gruen/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-credo-gruen mb-2">
            Verifikation
          </p>
          <p className="text-sm text-foreground">
            Diese Beurteilung erhält nach dem Einreichen einen einmaligen
            Verifikations-Code für unabhängige Dritte (z.B. Bezirksregierung):
          </p>
          <p className="mt-2 font-mono text-base font-bold text-foreground">
            {verifyHash}
          </p>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "good" | "bad";
}) {
  const valueClass =
    highlight === "good"
      ? "text-credo-gruen font-medium"
      : highlight === "bad"
        ? "text-credo-rot font-medium"
        : "text-foreground";
  return (
    <div className="flex items-center justify-between p-4">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={`text-sm text-right ${valueClass}`}>{value}</dd>
    </div>
  );
}
