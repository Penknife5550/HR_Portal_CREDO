"use client";

/**
 * Lehrkraft-Bekanntgabe-Formular
 *
 * Zeigt die eingereichte Beurteilung als Read-Only und erlaubt der Lehrkraft:
 * 1. Die Beurteilung zur Kenntnis zu nehmen (Pflicht-Checkbox)
 * 2. Optional eine Gegenaeusserung gemäß § 92 Abs. 1 Satz 6 LBG NRW
 *    abzugeben (mehrzeilig, max. 10.000 Zeichen)
 * 3. Final zu bestaetigen
 *
 * Apple-like UX, CREDO CI durchgaengig (Theme-Variablen, Montserrat,
 * CredoLinie, BeurteilungStatusStepper).
 */

import { useState, useMemo } from "react";
import Image from "next/image";
import { CredoLinie } from "@/components/credo-linie";
import { BeurteilungStatusStepper } from "@/components/beurteilung-status-stepper";
import { deriveBeurteilungStatus } from "@/lib/beurteilung-status";
import { LegalBox } from "../../civil-service-assessment/[token]/steps/legal-box";
import {
  BRL_SCALE_LABELS,
  SCHULNOTEN_SCALE_LABELS,
} from "@/lib/beurteilung-defaults";
import type { AcknowledgementData } from "./page";

interface Props {
  token: string;
  initialData: AcknowledgementData;
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

export function AcknowledgementForm({ token, initialData }: Props) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [rebuttalText, setRebuttalText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(
    Boolean(initialData.acknowledgedByEmployeeAt),
  );

  const isBeurteilung = initialData.assessmentType === "BEURTEILUNG";
  const snapshot = initialData.templateSnapshot;
  const ratings = initialData.ratingsData ?? {};

  const status = useMemo(
    () =>
      deriveBeurteilungStatus({
        unbiasedConfirmed: initialData.unbiasedConfirmed,
        ratingsData: initialData.ratingsData,
        meetsRequirementsManual: initialData.meetsRequirementsManual,
        overallReasoning: initialData.overallReasoning,
        beurteilungsgespraechAt: initialData.beurteilungsgespraechAt,
        submittedAt: initialData.submittedAt,
        releasedToEmployeeAt: initialData.releasedToEmployeeAt,
        acknowledgedByEmployeeAt: submitted
          ? new Date().toISOString()
          : initialData.acknowledgedByEmployeeAt,
        archivedAt: initialData.archivedAt,
        templateSnapshot: snapshot,
      }),
    [initialData, snapshot, submitted],
  );

  const scaleType =
    snapshot?.scaleType ?? initialData.scaleType ?? "BRL_1_5";
  const scaleLabels =
    snapshot?.scaleLabels ??
    (scaleType === "BRL_1_5" ? BRL_SCALE_LABELS : SCHULNOTEN_SCALE_LABELS);

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

  const sortedCategories = useMemo(() => {
    if (!snapshot) return [];
    return [...snapshot.categories].sort(
      (a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0),
    );
  }, [snapshot]);

  // Verifikations-Hash (Phase 6 Vorbereitung)
  const verifyHash = useMemo(() => {
    if (!initialData.verifyToken) return null;
    const clean = initialData.verifyToken.replace(/-/g, "");
    return `CRD-${clean.slice(0, 4).toUpperCase()}-${clean.slice(4, 8).toUpperCase()}`;
  }, [initialData.verifyToken]);

  async function handleSubmit() {
    if (!acknowledged || submitting) return;
    try {
      setSubmitting(true);
      setError(null);
      const res = await fetch(
        `/api/civil-service-acknowledgement/${token}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            acknowledged: true,
            rebuttalText: rebuttalText.trim() || null,
          }),
        },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Fehler beim Bestätigen");
      }
      setSubmitted(true);
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verbindungsfehler.");
    } finally {
      setSubmitting(false);
    }
  }

  // =============================================
  // Erfolgs-Bildschirm nach Bestätigung
  // =============================================
  if (submitted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-4">
        <div className="w-full max-w-lg overflow-hidden rounded-xl bg-card shadow-2xl">
          <div className="p-8 text-center">
            <Image
              src="/credo_logo_claim.svg"
              alt="CREDO"
              width={200}
              height={65}
              className="mx-auto mb-6"
              priority
            />
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-credo-gruen/15">
              <svg
                className="h-8 w-8 text-credo-gruen"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-foreground">
              Bekanntgabe quittiert
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Vielen Dank, <strong>{initialData.employee.name}</strong>. Ihre
              Quittierung wurde gespeichert
              {rebuttalText.trim().length > 0
                ? " — Ihre Gegenäußerung ist Teil der Personalakte."
                : "."}
            </p>
            <div className="mt-6">
              <BeurteilungStatusStepper status={status} variant="full" />
            </div>
            <p className="mt-6 text-xs text-muted-foreground">
              Die Beurteilung wird nun zu Ihrer Personalakte genommen. Sie
              können dieses Fenster schließen.
            </p>
          </div>
          <CredoLinie />
        </div>
      </div>
    );
  }

  // =============================================
  // Hauptansicht — Read-Only-Beurteilung + Quittierung
  // =============================================
  return (
    <div className="min-h-screen bg-muted flex flex-col">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 border-b bg-card shadow-sm">
        <div className="mx-auto max-w-3xl px-4 py-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Image
              src="/credo_logo.svg"
              alt="CREDO"
              width={90}
              height={30}
              priority
            />
            <div className="text-right min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">
                {initialData.employee.name}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                {initialData.employee.organizationName} ·{" "}
                {initialData.assessmentNumber}.{" "}
                {isBeurteilung ? "Unterrichtsbesuch" : "Referenz"}
              </p>
            </div>
          </div>
          <BeurteilungStatusStepper status={status} variant="full" />
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-6 space-y-6">
        {/* Einleitung */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Bekanntgabe Ihrer dienstlichen Beurteilung
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sehr geehrte/r {initialData.employee.name}, im Folgenden sehen Sie
            Ihre dienstliche Beurteilung Nr. {initialData.assessmentNumber}.
            Bitte prüfen Sie die Inhalte sorgfältig. Sie können eine
            schriftliche Gegenäußerung abgeben, bevor Sie die Bekanntgabe
            quittieren.
          </p>
        </div>

        <LegalBox
          references={["LBG_92_1", "LBG_92_1_S6"]}
          intro="Vor Aufnahme in die Personalakte hat die beurteilte Person das Recht auf eine schriftliche Gegenäußerung. Diese wird der Beurteilung dauerhaft beigefügt."
        />

        {error && (
          <div className="rounded-lg border border-credo-rot/30 bg-credo-rot/10 p-3 text-sm text-credo-rot">
            {error}
          </div>
        )}

        {isBeurteilung && (
          <>
            {/* Eckdaten */}
            <section className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="border-b border-border p-4 bg-muted/30">
                <h2 className="text-sm font-bold text-foreground">Eckdaten</h2>
              </div>
              <dl className="divide-y divide-border text-sm">
                <Row
                  label="Beurteilende Schulleitung"
                  value={
                    initialData.recipientName ?? initialData.recipientEmail
                  }
                />
                <Row
                  label="Termin Unterrichtsbesuch"
                  value={formatDateTime(initialData.scheduledDate)}
                />
                <Row label="Fach" value={initialData.fach ?? "—"} />
                <Row
                  label="Klasse / Lerngruppe"
                  value={initialData.klasse ?? "—"}
                />
                <Row
                  label="Vertrauenslehrkraft"
                  value={initialData.vertrauenslehrkraft ?? "—"}
                />
                <Row
                  label="Eingereicht am"
                  value={formatDateTime(initialData.submittedAt)}
                />
              </dl>
            </section>

            {/* Bewertungen */}
            {snapshot && sortedCategories.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-bold text-foreground">
                    Bewertungen
                  </h2>
                  <span className="inline-flex rounded-full bg-credo-blau/10 px-2.5 py-0.5 text-[10px] font-semibold text-credo-blau">
                    {scaleType === "BRL_1_5" ? "BRL 1–5" : "Schulnoten 1–6"}
                  </span>
                </div>
                <div className="space-y-3">
                  {sortedCategories.map((cat) => {
                    const sortedCriteria = [...cat.criteria].sort(
                      (a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0),
                    );
                    return (
                      <div
                        key={cat.id}
                        className="rounded-xl border border-border bg-card overflow-hidden"
                      >
                        <div className="border-b border-border bg-muted/30 px-4 py-2.5">
                          <p className="text-sm font-semibold text-foreground">
                            {cat.name}
                          </p>
                          {cat.legalReference && (
                            <span className="inline-flex mt-1 rounded bg-credo-blau/10 px-1.5 py-0.5 text-[9px] font-semibold text-credo-blau">
                              {cat.legalReference}
                            </span>
                          )}
                        </div>
                        <div className="divide-y divide-border">
                          {sortedCriteria.map((cr) => {
                            const grade = ratings[cr.id];
                            return (
                              <div
                                key={cr.id}
                                className="flex items-center justify-between gap-3 px-4 py-2.5"
                              >
                                <div className="min-w-0">
                                  <p className="text-sm text-foreground truncate">
                                    {cr.name}
                                  </p>
                                  {cr.description && (
                                    <p className="text-[11px] text-muted-foreground truncate">
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
                                  <span className="text-xs text-muted-foreground">
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
            <section className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="border-b border-border p-4 bg-muted/30">
                <h2 className="text-sm font-bold text-foreground">Gesamturteil</h2>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Erfüllt die Anforderungen?
                  </span>
                  {initialData.meetsRequirementsManual === true ? (
                    <span className="inline-flex rounded-full bg-credo-gruen/15 px-3 py-1 text-xs font-bold text-credo-gruen">
                      ✓ Ja, erfüllt
                    </span>
                  ) : initialData.meetsRequirementsManual === false ? (
                    <span className="inline-flex rounded-full bg-credo-rot/15 px-3 py-1 text-xs font-bold text-credo-rot">
                      ✗ Nein, erfüllt nicht
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
                {initialData.overallReasoning && (
                  <div className="border-t border-border pt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      Begründung
                    </p>
                    <p className="text-sm text-foreground whitespace-pre-line">
                      {initialData.overallReasoning}
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* Beurteilungsgespräch */}
            <section className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="border-b border-border p-4 bg-muted/30">
                <h2 className="text-sm font-bold text-foreground">
                  Beurteilungsgespräch
                </h2>
              </div>
              <div className="p-4 space-y-2">
                <Row
                  label="Datum"
                  value={formatDateTime(initialData.beurteilungsgespraechAt)}
                />
                {initialData.beurteilungsgespraechNotes && (
                  <p className="text-sm text-foreground whitespace-pre-line pt-2 border-t border-border">
                    {initialData.beurteilungsgespraechNotes}
                  </p>
                )}
              </div>
            </section>
          </>
        )}

        {/* REFERENZ-Inhalt (kompakte Anzeige) */}
        {!isBeurteilung && (
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-bold text-foreground mb-2">
              Eingereichte Referenz
            </h2>
            {initialData.gemeindeReferenz && (
              <div className="mt-3 border-t border-border pt-3">
                <p className="text-xs font-semibold text-muted-foreground mb-1">
                  Gemeinde-Referenz
                </p>
                <p className="text-sm text-foreground whitespace-pre-line">
                  {initialData.gemeindeReferenz}
                </p>
              </div>
            )}
          </section>
        )}

        {/* Gegenäußerung */}
        <section className="rounded-xl border-2 border-credo-blau/30 bg-credo-blau/5 p-5 space-y-3">
          <div>
            <h2 className="text-base font-bold text-foreground">
              Ihre Gegenäußerung (optional)
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Sie können hier eine schriftliche Stellungnahme zur Beurteilung
              abgeben. Diese wird der Beurteilung dauerhaft als Gegenäußerung
              beigefügt (§ 92 Abs. 1 Satz 6 LBG NRW).
            </p>
          </div>
          <textarea
            value={rebuttalText}
            onChange={(e) => setRebuttalText(e.target.value)}
            rows={6}
            placeholder="Optional: Ihre Gegenäußerung — Punkte, denen Sie widersprechen, weitere Sachverhalte, eigene Einschätzung."
            className="w-full rounded-lg border border-input bg-background px-4 py-3 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none resize-y"
          />
          <p className="text-[10px] text-muted-foreground text-right">
            {rebuttalText.length} / 10.000 Zeichen
          </p>
        </section>

        {/* Quittierung */}
        <section className="rounded-xl border-2 border-credo-gelb/40 bg-credo-gelb/5 p-5 space-y-4">
          <div>
            <h2 className="text-base font-bold text-foreground">
              Bekanntgabe quittieren *
            </h2>
            <p className="mt-1 text-xs text-foreground">
              Mit der Quittierung bestätigen Sie, dass Sie die Beurteilung
              gelesen und zur Kenntnis genommen haben. Erst nach Ihrer
              Quittierung wird die Beurteilung in Ihre Personalakte
              aufgenommen.
            </p>
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 h-5 w-5 rounded border-input"
            />
            <span className="text-sm text-foreground">
              <strong>Ich habe die Beurteilung gelesen</strong> und nehme sie
              hiermit zur Kenntnis. Mir ist bewusst, dass ich diese Quittierung
              nicht zurückziehen kann.
            </span>
          </label>
        </section>

        {/* Submit-Button */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!acknowledged || submitting}
            className={`rounded-xl px-8 py-3 text-sm font-bold transition-all ${
              acknowledged && !submitting
                ? "bg-primary text-primary-foreground shadow-lg hover:shadow-xl"
                : "cursor-not-allowed bg-muted text-muted-foreground"
            }`}
          >
            {submitting
              ? "Wird gespeichert…"
              : rebuttalText.trim().length > 0
                ? "Quittieren mit Gegenäußerung"
                : "Quittieren ohne Gegenäußerung"}
          </button>
        </div>

        {/* Verifikations-Hinweis */}
        {verifyHash && (
          <p className="text-center text-[10px] text-muted-foreground">
            Verifikations-Code dieser Beurteilung:{" "}
            <span className="font-mono font-semibold">{verifyHash}</span>
          </p>
        )}
      </main>

      <footer className="mt-auto border-t bg-card py-6 text-center">
        <p className="text-xs text-muted-foreground">
          Ihre Eingaben werden verschlüsselt übertragen und gemäß DSGVO
          verarbeitet.
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground">
          © {new Date().getFullYear()} Christlicher Schulverein Minden e.V. ·
          CREDO HR-Portal
        </p>
      </footer>
      <CredoLinie />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground text-right">{value}</dd>
    </div>
  );
}
