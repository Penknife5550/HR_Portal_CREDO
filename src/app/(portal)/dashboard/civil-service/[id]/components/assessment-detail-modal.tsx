"use client";

/**
 * AssessmentDetailModal
 *
 * Read-Only-Detailansicht einer Beurteilung für HR im PSI-Dashboard.
 * Zeigt:
 * - Status-Stepper (BeurteilungStatusStepper)
 * - Stammdaten (SL, Termin, Fach, Klasse)
 * - Vorbereitung (Befangenheit, Vertrauenslehrkraft)
 * - Bewertungen pro Kategorie/Kriterium auf der gespeicherten Skala
 * - Gesamturteil + Pflichtbegründung
 * - Nachbesprechung + Beurteilungsgespräch
 * - Bei REFERENZ: 12 Prüfpunkte + Gemeinde-Referenz
 *
 * CREDO CI: Theme-Variablen, Montserrat, keine Hex-Hartcodes.
 */

import { useMemo } from "react";
import { BeurteilungStatusStepper } from "@/components/beurteilung-status-stepper";
import { deriveBeurteilungStatus } from "@/lib/beurteilung-status";
import {
  BRL_SCALE_LABELS,
  SCHULNOTEN_SCALE_LABELS,
} from "@/lib/beurteilung-defaults";
import { REFERENZ_LABELS } from "@/lib/referenz-labels";
import type { AssessmentData } from "../types";

interface Props {
  assessment: AssessmentData;
  employeeName: string;
  onClose: () => void;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("de-DE", {
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

export function AssessmentDetailModal({
  assessment,
  employeeName,
  onClose,
}: Props) {
  const isBeurteilung = assessment.assessmentType === "BEURTEILUNG";

  const status = useMemo(
    () =>
      deriveBeurteilungStatus({
        unbiasedConfirmed: assessment.unbiasedConfirmed,
        ratingsData: assessment.ratingsData,
        meetsRequirementsManual: assessment.meetsRequirementsManual,
        overallReasoning: assessment.overallReasoning,
        beurteilungsgespraechAt: assessment.beurteilungsgespraechAt,
        submittedAt: assessment.submittedAt,
        releasedToEmployeeAt: assessment.releasedToEmployeeAt,
        acknowledgedByEmployeeAt: assessment.acknowledgedByEmployeeAt,
        archivedAt: assessment.archivedAt,
        templateSnapshot: assessment.templateSnapshot,
      }),
    [assessment],
  );

  const snapshot = assessment.templateSnapshot;
  const ratings = assessment.ratingsData ?? {};

  // Skala bestimmen
  const scaleType =
    snapshot?.scaleType ?? assessment.scaleType ?? "BRL_1_5";
  const scaleLabels =
    snapshot?.scaleLabels ??
    (scaleType === "BRL_1_5" ? BRL_SCALE_LABELS : SCHULNOTEN_SCALE_LABELS);

  // Farbe je Note (Best → Schlecht, abhängig von Skala)
  function gradeColor(grade: number): string {
    const isBest = scaleType === "BRL_1_5" ? grade === 5 : grade === 1;
    const isGood = scaleType === "BRL_1_5" ? grade === 4 : grade === 2;
    const isMid = grade === 3;
    const isBelow = scaleType === "BRL_1_5" ? grade === 2 : grade === 4;
    if (isBest || isGood) return "bg-credo-gruen text-white";
    if (isMid) return "bg-credo-gelb text-white";
    if (isBelow) return "bg-orange-500 text-white";
    return "bg-credo-rot text-white";
  }

  // Verifikations-Hash
  const verifyHash = useMemo(() => {
    if (!assessment.verifyToken) return null;
    const clean = assessment.verifyToken.replace(/-/g, "");
    return `CRD-${clean.slice(0, 4).toUpperCase()}-${clean.slice(4, 8).toUpperCase()}`;
  }, [assessment.verifyToken]);

  const sortedCategories = useMemo(() => {
    if (!snapshot) return [];
    return [...snapshot.categories].sort(
      (a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0),
    );
  }, [snapshot]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl my-8 rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-gray-100 bg-white px-6 py-4 rounded-t-2xl">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900 truncate">
              {assessment.assessmentNumber}.{" "}
              {isBeurteilung ? "Unterrichtsbesuch" : "Referenz"} —{" "}
              {employeeName}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {assessment.recipientName ?? assessment.recipientEmail}
              {assessment.submittedAt &&
                ` · eingereicht ${formatDateTime(assessment.submittedAt)}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Schließen
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Status-Stepper */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Workflow-Status
            </p>
            <BeurteilungStatusStepper status={status} variant="full" />
          </section>

          {isBeurteilung && (
            <>
              {/* Stammdaten */}
              <section>
                <h3 className="text-sm font-bold text-gray-900 mb-2">
                  Stammdaten
                </h3>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <Row label="Schulleitung" value={assessment.recipientName ?? "—"} />
                    <Row label="E-Mail" value={assessment.recipientEmail} />
                    <Row
                      label="Termin"
                      value={formatDateTime(assessment.scheduledDate)}
                    />
                    <Row
                      label="Fach"
                      value={assessment.fach ?? "—"}
                    />
                    <Row
                      label="Klasse / Lerngruppe"
                      value={assessment.klasse ?? "—"}
                    />
                    <Row
                      label="Angekündigt am"
                      value={formatDateTime(assessment.announcedAt)}
                    />
                  </dl>
                </div>
              </section>

              {/* Vorbereitung */}
              <section>
                <h3 className="text-sm font-bold text-gray-900 mb-2">
                  Vorbereitung
                </h3>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Befangenheit</span>
                    {assessment.unbiasedConfirmed ? (
                      <span className="font-semibold text-credo-gruen">
                        ✓ Keine Befangenheit bestätigt
                        {assessment.unbiasedConfirmedAt && (
                          <span className="ml-2 font-normal text-gray-400">
                            ({formatDateTime(assessment.unbiasedConfirmedAt)})
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="font-medium text-gray-400">
                        Noch nicht bestätigt
                      </span>
                    )}
                  </div>
                  <Row
                    label="Vertrauenslehrkraft"
                    value={assessment.vertrauenslehrkraft ?? "—"}
                  />
                </div>
              </section>

              {/* Bewertungen */}
              {snapshot && sortedCategories.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-gray-900">
                      Bewertungen
                    </h3>
                    <span className="inline-flex rounded-full bg-credo-blau/10 px-2.5 py-0.5 text-[10px] font-semibold text-credo-blau">
                      {scaleType === "BRL_1_5" ? "BRL 1–5" : "Schulnoten 1–6"}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {sortedCategories.map((cat) => {
                      const sortedCriteria = [...cat.criteria].sort(
                        (a, b) =>
                          (a.orderIndex ?? 0) - (b.orderIndex ?? 0),
                      );
                      // Kategorie-Schnitt (gewichtet) — Visualisierung
                      let totalWeight = 0;
                      let weightedSum = 0;
                      let countRated = 0;
                      for (const cr of sortedCriteria) {
                        const grade = ratings[cr.id];
                        if (typeof grade !== "number") continue;
                        countRated++;
                        const w = cr.weight ?? 1;
                        totalWeight += w;
                        weightedSum += w * grade;
                      }
                      const avg =
                        totalWeight > 0
                          ? Math.round((weightedSum / totalWeight) * 100) / 100
                          : null;

                      return (
                        <div
                          key={cat.id}
                          className="rounded-xl border border-gray-100 bg-white overflow-hidden"
                        >
                          <div className="border-b border-gray-100 bg-gray-50 px-4 py-2.5 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">
                                {cat.name}
                              </p>
                              {cat.legalReference && (
                                <span className="inline-flex mt-1 rounded bg-credo-blau/10 px-1.5 py-0.5 text-[9px] font-semibold text-credo-blau">
                                  {cat.legalReference}
                                </span>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs text-gray-500">
                                {countRated}/{sortedCriteria.length}
                              </p>
                              {avg !== null && (
                                <p className="text-sm font-bold text-gray-900">
                                  Ø {avg.toFixed(2)}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="divide-y divide-gray-100">
                            {sortedCriteria.map((cr) => {
                              const grade = ratings[cr.id];
                              return (
                                <div
                                  key={cr.id}
                                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                                >
                                  <div className="min-w-0">
                                    <p className="text-sm text-gray-800 truncate">
                                      {cr.name}
                                    </p>
                                    {cr.description && (
                                      <p className="text-[11px] text-gray-400 truncate">
                                        {cr.description}
                                      </p>
                                    )}
                                  </div>
                                  {typeof grade === "number" ? (
                                    <span
                                      className={`inline-flex h-7 min-w-7 items-center justify-center rounded text-xs font-bold px-2 ${gradeColor(grade)}`}
                                      title={scaleLabels[String(grade)]}
                                    >
                                      {grade}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-gray-300">
                                      —
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Gesamturteil */}
              <section>
                <h3 className="text-sm font-bold text-gray-900 mb-2">
                  Gesamturteil
                </h3>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">
                      Erfüllt die Anforderungen?
                    </span>
                    {assessment.meetsRequirementsManual === true ? (
                      <span className="inline-flex rounded-full bg-credo-gruen/15 px-3 py-1 text-xs font-bold text-credo-gruen">
                        ✓ Ja, erfüllt
                      </span>
                    ) : assessment.meetsRequirementsManual === false ? (
                      <span className="inline-flex rounded-full bg-credo-rot/15 px-3 py-1 text-xs font-bold text-credo-rot">
                        ✗ Nein, erfüllt nicht
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">
                        Noch keine Entscheidung
                      </span>
                    )}
                  </div>
                  {assessment.overallGrade !== null && (
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>Hilfsvisualisierung — Gesamtschnitt</span>
                      <span>Ø {assessment.overallGrade.toFixed(2)}</span>
                    </div>
                  )}
                  {assessment.overallReasoning && (
                    <div className="border-t border-gray-200 pt-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                        Begründung
                      </p>
                      <p className="text-sm text-gray-800 whitespace-pre-line">
                        {assessment.overallReasoning}
                      </p>
                    </div>
                  )}
                </div>
              </section>

              {/* Gespräche */}
              <section>
                <h3 className="text-sm font-bold text-gray-900 mb-2">
                  Gespräche
                </h3>
                <div className="space-y-3">
                  {/* Nachbesprechung */}
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-gray-700">
                        Nachbesprechung
                      </p>
                      <span className="text-xs text-gray-500">
                        {formatDateTime(assessment.postReviewAt)}
                      </span>
                    </div>
                    {assessment.postReviewNotes && (
                      <p className="text-sm text-gray-800 whitespace-pre-line">
                        {assessment.postReviewNotes}
                      </p>
                    )}
                  </div>

                  {/* Beurteilungsgespräch */}
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-gray-700">
                        Beurteilungsgespräch
                      </p>
                      <span className="text-xs text-gray-500">
                        {formatDateTime(assessment.beurteilungsgespraechAt)}
                      </span>
                    </div>
                    {assessment.beurteilungsgespraechNotes && (
                      <p className="text-sm text-gray-800 whitespace-pre-line">
                        {assessment.beurteilungsgespraechNotes}
                      </p>
                    )}
                  </div>
                </div>
              </section>

              {/* Verifikation */}
              {verifyHash && (
                <section>
                  <h3 className="text-sm font-bold text-gray-900 mb-2">
                    Verifikation
                  </h3>
                  <div className="rounded-xl border border-credo-gruen/30 bg-credo-gruen/5 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-credo-gruen mb-1">
                      Verifikations-Code
                    </p>
                    <p className="font-mono text-base font-bold text-gray-900">
                      {verifyHash}
                    </p>
                    <p className="mt-2 text-[10px] text-gray-500">
                      Über diesen Code kann die Beurteilung später durch
                      unabhängige Dritte (z.B. Bezirksregierung) verifiziert
                      werden.
                    </p>
                  </div>
                </section>
              )}
            </>
          )}

          {/* REFERENZ-Anzeige */}
          {!isBeurteilung && (
            <>
              <section>
                <h3 className="text-sm font-bold text-gray-900 mb-2">
                  Stammdaten
                </h3>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <Row label="Referenzgeber" value={assessment.recipientName ?? "—"} />
                    <Row label="E-Mail" value={assessment.recipientEmail} />
                  </dl>
                </div>
              </section>

              {assessment.referenceData && (
                <section>
                  <h3 className="text-sm font-bold text-gray-900 mb-2">
                    Prüfpunkte
                  </h3>
                  <div className="rounded-xl border border-gray-100 bg-white overflow-hidden divide-y divide-gray-100">
                    {Object.keys(REFERENZ_LABELS).map((key) => {
                      const value = assessment.referenceData?.[key];
                      const detail =
                        assessment.referenceData?.[`${key}_detail`];
                      if (!value) return null;
                      const colorClass =
                        value === "Ja"
                          ? "bg-credo-gruen/15 text-credo-gruen"
                          : value === "Nein"
                            ? "bg-credo-rot/15 text-credo-rot"
                            : "bg-credo-gelb/15 text-credo-gelb";
                      return (
                        <div
                          key={key}
                          className="flex items-center justify-between gap-3 px-4 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="text-sm text-gray-800">
                              {REFERENZ_LABELS[key]}
                            </p>
                            {detail && (
                              <p className="text-[11px] text-gray-500">
                                {detail}
                              </p>
                            )}
                          </div>
                          <span
                            className={`inline-flex rounded px-2.5 py-0.5 text-[11px] font-semibold ${colorClass}`}
                          >
                            {value}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {assessment.gemeindeReferenz && (
                <section>
                  <h3 className="text-sm font-bold text-gray-900 mb-2">
                    Gemeinde-Referenz
                  </h3>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <p className="text-sm text-gray-800 whitespace-pre-line">
                      {assessment.gemeindeReferenz}
                    </p>
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-3 flex items-center justify-end rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-credo-blau px-4 py-2 text-sm font-semibold text-white hover:bg-credo-blau/90"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-800 text-right">{value}</dd>
    </div>
  );
}
