/**
 * AuditView — Read-Only-Sicht der Verify-Page (Phase 6).
 *
 * Server-Component, kein Client-Bundle. Wird mobil, im Inkognito-Browser
 * und via QR-Code-Scan aus dem PDF aufgerufen — entsprechend leichtgewichtig.
 *
 * CREDO CI: Theme-Variablen, Montserrat, keine Hex-Hartcodes.
 */

import { BeurteilungStatusStepper } from "@/components/beurteilung-status-stepper";
import { CredoLinie } from "@/components/credo-linie";
import { deriveBeurteilungStatus } from "@/lib/beurteilung-status";
import {
  BRL_SCALE_LABELS,
  SCHULNOTEN_SCALE_LABELS,
} from "@/lib/beurteilung-defaults";
import { LEGAL_REFERENCES } from "@/lib/legal-references";
import { REFERENZ_LABELS } from "@/lib/referenz-labels";
import {
  AUDIT_ACTION_LABELS,
  buildVerifyHash,
  type VerifyAssessmentData,
} from "@/lib/verify-assessment";

interface SnapshotCriterion {
  id: string;
  name: string;
  description?: string | null;
  weight?: number;
  orderIndex?: number;
}

interface SnapshotCategory {
  id: string;
  name: string;
  weight?: number;
  orderIndex?: number;
  legalReference?: string | null;
  criteria: SnapshotCriterion[];
}

interface Snapshot {
  name?: string;
  scaleType?: "BRL_1_5" | "SCHULNOTEN_1_6";
  scaleLabels?: Record<string, string>;
  categories: SnapshotCategory[];
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

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function AuditView({ data }: { data: VerifyAssessmentData }) {
  const { process, assessment, auditLog } = data;
  const isBeurteilung = assessment.assessmentType === "BEURTEILUNG";
  const verifyHash = buildVerifyHash(assessment.verifyToken);

  const snapshot = assessment.templateSnapshot as Snapshot | null;
  const ratings = assessment.ratingsData ?? {};
  const scaleType = snapshot?.scaleType ?? assessment.scaleType ?? "BRL_1_5";
  const scaleLabels =
    snapshot?.scaleLabels ??
    (scaleType === "BRL_1_5" ? BRL_SCALE_LABELS : SCHULNOTEN_SCALE_LABELS);

  const status = deriveBeurteilungStatus({
    unbiasedConfirmed: assessment.unbiasedConfirmed,
    ratingsData: assessment.ratingsData,
    meetsRequirementsManual: assessment.meetsRequirementsManual,
    overallReasoning: assessment.overallReasoning,
    beurteilungsgespraechAt: assessment.beurteilungsgespraechAt,
    submittedAt: assessment.submittedAt,
    releasedToEmployeeAt: assessment.releasedToEmployeeAt,
    acknowledgedByEmployeeAt: assessment.acknowledgedByEmployeeAt,
    archivedAt: assessment.archivedAt,
    templateSnapshot: snapshot
      ? { categories: snapshot.categories.map((c) => ({ criteria: c.criteria })) }
      : null,
  });

  const sortedCategories = snapshot
    ? [...snapshot.categories].sort(
        (a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0),
      )
    : [];

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                CREDO HR-Portal
              </p>
              <h1 className="mt-1 text-xl font-bold text-gray-900 sm:text-2xl">
                Verifikation Dienstliche Beurteilung
              </h1>
              <p className="mt-1 text-xs text-gray-500">
                Read-Only-Audit-Sicht für Bezirksregierung und unabhängige
                Auditoren
              </p>
            </div>
            {verifyHash && (
              <div className="shrink-0 text-right">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-credo-gruen">
                  Verifikations-Code
                </p>
                <p className="font-mono text-sm font-bold text-gray-900 sm:text-base">
                  {verifyHash}
                </p>
              </div>
            )}
          </div>
        </div>
        <CredoLinie />
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
        {/* Status-Stepper */}
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Workflow-Status
          </p>
          <BeurteilungStatusStepper status={status} variant="full" />
        </section>

        {/* Stammdaten */}
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-gray-900">Stammdaten</h2>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
            <Row label="Vorgang" value={process.displayId} />
            <Row
              label="Beurteilung"
              value={`${assessment.assessmentNumber}. ${
                isBeurteilung ? "Unterrichtsbesuch" : "Referenz"
              }`}
            />
            <Row
              label="Lehrkraft"
              value={`${process.employeeFirstName} ${process.employeeLastName}`}
            />
            <Row
              label="Personal-Nr."
              value={process.employeePersonalNr ?? "—"}
            />
            <Row
              label="Schulträger / Mandant"
              value={`${process.mandantNumber} — ${process.organizationName}`}
            />
            <Row
              label="Schulleitung"
              value={
                assessment.recipientName
                  ? `${assessment.recipientName} (${assessment.recipientEmail})`
                  : assessment.recipientEmail
              }
            />
          </dl>
        </section>

        {isBeurteilung && (
          <>
            {/* Vorbereitung */}
            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-3">
                <h2 className="text-sm font-bold text-gray-900">Vorbereitung</h2>
                <LegalBadge keys={["BRL_4_10", "BRL_8_3"]} />
              </div>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                <Row label="Termin" value={formatDateTime(assessment.scheduledDate)} />
                <Row label="Angekündigt am" value={formatDateTime(assessment.announcedAt)} />
                <Row label="Fach" value={assessment.fach ?? "—"} />
                <Row label="Klasse / Lerngruppe" value={assessment.klasse ?? "—"} />
                <Row
                  label="Vertrauenslehrkraft"
                  value={assessment.vertrauenslehrkraft ?? "—"}
                />
                <Row
                  label="Befangenheit"
                  value={
                    assessment.unbiasedConfirmed
                      ? `✓ Keine bestätigt (${formatDateTime(assessment.unbiasedConfirmedAt)})`
                      : "Nicht bestätigt"
                  }
                  positive={Boolean(assessment.unbiasedConfirmed)}
                />
              </dl>
            </section>

            {/* Bewertungen */}
            {snapshot && sortedCategories.length > 0 && (
              <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-bold text-gray-900">Bewertungen</h2>
                  <span className="inline-flex rounded-full bg-credo-blau/10 px-2.5 py-0.5 text-[10px] font-semibold text-credo-blau">
                    {scaleType === "BRL_1_5" ? "BRL 1–5" : "Schulnoten 1–6"}
                  </span>
                </div>
                <p className="mb-3 text-[11px] text-gray-500">
                  Skala-Snapshot zum Zeitpunkt der Beurteilung —{" "}
                  {scaleType === "BRL_1_5" ? "5 = beste Note" : "1 = beste Note"}
                </p>
                <div className="space-y-3">
                  {sortedCategories.map((cat) => {
                    const sortedCriteria = [...cat.criteria].sort(
                      (a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0),
                    );
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
                        className="overflow-hidden rounded-xl border border-gray-100"
                      >
                        <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2.5">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-900">
                              {cat.name}
                            </p>
                            {cat.legalReference && (
                              <span className="mt-1 inline-flex rounded bg-credo-blau/10 px-1.5 py-0.5 text-[9px] font-semibold text-credo-blau">
                                {cat.legalReference}
                              </span>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
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
                                  <p className="truncate text-sm text-gray-800">
                                    {cr.name}
                                  </p>
                                  {cr.description && (
                                    <p className="truncate text-[11px] text-gray-400">
                                      {cr.description}
                                    </p>
                                  )}
                                </div>
                                {typeof grade === "number" ? (
                                  <span
                                    className={`inline-flex h-7 min-w-7 items-center justify-center rounded px-2 text-xs font-bold ${gradeColor(grade)}`}
                                    title={scaleLabels[String(grade)]}
                                  >
                                    {grade}
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-300">—</span>
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
            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-3">
                <h2 className="text-sm font-bold text-gray-900">Gesamturteil</h2>
                <LegalBadge keys={["BRL_7_5"]} />
              </div>
              <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
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
                      Keine Entscheidung
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
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                      Begründung
                    </p>
                    <p className="whitespace-pre-line text-sm text-gray-800">
                      {assessment.overallReasoning}
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* Gespraeche */}
            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-3">
                <h2 className="text-sm font-bold text-gray-900">Gespräche</h2>
                <LegalBadge keys={["BRL_9_1", "BRL_10_1"]} />
              </div>
              <div className="space-y-3">
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-700">
                      Nachbesprechung
                    </p>
                    <span className="text-xs text-gray-500">
                      {formatDateTime(assessment.postReviewAt)}
                    </span>
                  </div>
                  {assessment.postReviewNotes && (
                    <p className="whitespace-pre-line text-sm text-gray-800">
                      {assessment.postReviewNotes}
                    </p>
                  )}
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-700">
                      Beurteilungsgespräch
                    </p>
                    <span className="text-xs text-gray-500">
                      {formatDateTime(assessment.beurteilungsgespraechAt)}
                    </span>
                  </div>
                  {assessment.beurteilungsgespraechNotes && (
                    <p className="whitespace-pre-line text-sm text-gray-800">
                      {assessment.beurteilungsgespraechNotes}
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* Bekanntgabe + Gegenaeusserung */}
            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-3">
                <h2 className="text-sm font-bold text-gray-900">
                  Bekanntgabe & Gegenäußerung
                </h2>
                <LegalBadge keys={["LBG_92_1", "LBG_92_1_S6"]} />
              </div>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                <Row
                  label="Bekanntgabe-Link erstellt"
                  value={formatDateTime(assessment.releasedToEmployeeAt)}
                />
                <Row
                  label="Quittiert am"
                  value={formatDateTime(assessment.acknowledgedByEmployeeAt)}
                  positive={Boolean(assessment.acknowledgedByEmployeeAt)}
                />
              </dl>
              {assessment.rebuttalText && (
                <div className="mt-4 rounded-xl border border-credo-gelb/40 bg-credo-gelb/5 p-4">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-credo-gelb">
                    Gegenäußerung der Lehrkraft
                  </p>
                  {assessment.rebuttalAt && (
                    <p className="mb-2 text-[11px] text-gray-500">
                      eingegangen {formatDateTime(assessment.rebuttalAt)}
                    </p>
                  )}
                  <p className="whitespace-pre-line text-sm text-gray-800">
                    {assessment.rebuttalText}
                  </p>
                </div>
              )}
            </section>
          </>
        )}

        {/* REFERENZ */}
        {!isBeurteilung && assessment.referenceData && (
          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-bold text-gray-900">Prüfpunkte</h2>
            <div className="overflow-hidden rounded-xl border border-gray-100 divide-y divide-gray-100">
              {Object.keys(REFERENZ_LABELS).map((key) => {
                const value = assessment.referenceData?.[key];
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
                    <p className="text-sm text-gray-800">
                      {REFERENZ_LABELS[key]}
                    </p>
                    <span
                      className={`inline-flex rounded px-2.5 py-0.5 text-[11px] font-semibold ${colorClass}`}
                    >
                      {value}
                    </span>
                  </div>
                );
              })}
            </div>
            {assessment.gemeindeReferenz && (
              <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Gemeinde-Referenz
                </p>
                <p className="whitespace-pre-line text-sm text-gray-800">
                  {assessment.gemeindeReferenz}
                </p>
              </div>
            )}
          </section>
        )}

        {/* Audit-Trail */}
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-start justify-between gap-3">
            <h2 className="text-sm font-bold text-gray-900">Audit-Trail</h2>
            <LegalBadge keys={["BRL_14"]} />
          </div>
          {auditLog.length === 0 ? (
            <p className="text-sm text-gray-400">
              Keine protokollierten Aktionen.
            </p>
          ) : (
            <ol className="space-y-2">
              {auditLog.map((log) => (
                <li
                  key={log.id}
                  className="flex items-start justify-between gap-4 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {AUDIT_ACTION_LABELS[log.action] ?? log.action}
                    </p>
                    {log.actorName && (
                      <p className="text-[11px] text-gray-500">
                        durch {log.actorName}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-[11px] text-gray-500">
                    {formatDateTime(log.createdAt)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Status-Daten */}
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-gray-900">Schlüsseldaten</h2>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
            <Row label="Eingereicht am" value={formatDate(assessment.submittedAt)} />
            <Row label="Bekanntgegeben am" value={formatDate(assessment.releasedToEmployeeAt)} />
            <Row label="Quittiert am" value={formatDate(assessment.acknowledgedByEmployeeAt)} />
            <Row label="In Personalakte" value={formatDate(assessment.archivedAt)} />
          </dl>
        </section>

        {/* Footer */}
        <footer className="pt-2 pb-8">
          <CredoLinie />
          <div className="mt-3 text-center">
            <p className="text-[11px] text-gray-500">
              Verifiziert durch das CREDO HR-Portal — diese Sicht ist nicht
              indiziert und kann nur mit dem vollständigen Verifikations-Token
              aufgerufen werden.
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}

// =============================================
// Hilfs-Komponenten
// =============================================

function Row({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs text-gray-500">{label}</dt>
      <dd
        className={`min-w-0 text-right text-sm font-medium ${
          positive ? "text-credo-gruen" : "text-gray-900"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function LegalBadge({ keys }: { keys: string[] }) {
  const refs = keys
    .map((k) => LEGAL_REFERENCES[k])
    .filter((r): r is (typeof LEGAL_REFERENCES)[string] => Boolean(r));
  if (refs.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {refs.map((r) => (
        <span
          key={r.key}
          className="inline-flex rounded bg-credo-blau/10 px-1.5 py-0.5 text-[9px] font-semibold text-credo-blau"
          title={r.title}
        >
          {r.shortLabel}
        </span>
      ))}
    </div>
  );
}
