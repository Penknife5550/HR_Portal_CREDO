"use client";

import { useState, useMemo } from "react";
import type { ExitInterviewData, ExitInterviewResponseData } from "../types";
import { Card, FieldRow } from "../shared-components";

// =============================================
// Insights Berechnung
// =============================================

interface CategoryInsight {
  name: string;
  avgRating: number | null;
  questionCount: number;
  ratingCount: number;
}

function computeInsights(
  templateSnapshot: ExitInterviewData["templateSnapshot"],
  responses: ExitInterviewResponseData[]
) {
  if (!templateSnapshot || !responses.length) return null;

  const responseMap = new Map(responses.map((r) => [r.snapshotQuestionId, r]));
  let totalRatingSum = 0;
  let totalRatingCount = 0;
  let enpsValue: number | null = null;
  const categoryInsights: CategoryInsight[] = [];
  const strengths: string[] = [];
  const concerns: string[] = [];

  for (const cat of templateSnapshot.categories) {
    let catSum = 0;
    let catCount = 0;

    for (const q of cat.questions) {
      const resp = responseMap.get(q.id);
      if (!resp) continue;

      if (q.questionType === "RATING_5_STAR" && resp.ratingValue != null) {
        catSum += resp.ratingValue;
        catCount++;
        totalRatingSum += resp.ratingValue;
        totalRatingCount++;

        if (resp.ratingValue >= 4) strengths.push(q.questionText);
        if (resp.ratingValue <= 2) concerns.push(q.questionText);
      }
      if (q.questionType === "ENPS" && resp.ratingValue != null) {
        enpsValue = resp.ratingValue;
      }
    }

    categoryInsights.push({
      name: cat.name,
      avgRating: catCount > 0 ? Math.round((catSum / catCount) * 10) / 10 : null,
      questionCount: cat.questions.length,
      ratingCount: catCount,
    });
  }

  const overallAvg = totalRatingCount > 0
    ? Math.round((totalRatingSum / totalRatingCount) * 10) / 10
    : null;

  return { categoryInsights, overallAvg, enpsValue, strengths, concerns };
}

function getRatingColor(rating: number): string {
  if (rating >= 4) return "text-credo-gruen";
  if (rating >= 3) return "text-credo-gelb";
  return "text-credo-rot";
}

function getRatingBg(rating: number): string {
  if (rating >= 4) return "bg-credo-gruen/10";
  if (rating >= 3) return "bg-credo-gelb/10";
  return "bg-credo-rot/10";
}

function getEnpsLabel(score: number): { label: string; color: string } {
  if (score >= 9) return { label: "Promoter", color: "bg-credo-gruen/10 text-credo-gruen" };
  if (score >= 7) return { label: "Passiv", color: "bg-credo-gelb/10 text-credo-gelb" };
  return { label: "Kritiker", color: "bg-credo-rot/10 text-credo-rot" };
}

// =============================================
// Komponente
// =============================================

export function TabExitInterview({
  exitInterview,
  creatingExitInterview,
  createExitInterview,
  sendExitInterviewLink,
  hasPrivateEmail,
}: {
  exitInterview: ExitInterviewData | null;
  creatingExitInterview: boolean;
  createExitInterview: () => void;
  sendExitInterviewLink: () => void;
  hasPrivateEmail: boolean;
}) {
  const [copiedEI, setCopiedEI] = useState(false);

  const insights = useMemo(() => {
    if (!exitInterview?.templateSnapshot || !exitInterview?.responses) return null;
    return computeInsights(exitInterview.templateSnapshot, exitInterview.responses);
  }, [exitInterview]);

  if (!exitInterview) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card py-16">
        <svg className="mb-4 h-16 w-16 text-border" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="mb-2 text-sm font-medium text-foreground">Kein Exit-Interview erstellt</p>
        <p className="mb-6 max-w-sm text-center text-xs text-muted-foreground">
          {hasPrivateEmail
            ? "Erstellen Sie ein Exit-Interview. Der Fragebogen wird 7 Tage nach dem letzten Arbeitstag per Magic Link an die private E-Mail gesendet."
            : "Bitte zuerst eine private E-Mail-Adresse hinterlegen (Tab Übersicht), damit der Fragebogen versendet werden kann."}
        </p>
        <button
          onClick={createExitInterview}
          disabled={creatingExitInterview || !hasPrivateEmail}
          className="rounded-lg bg-credo-gruen px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-credo-gruen/85 disabled:opacity-50"
        >
          {creatingExitInterview ? "Wird erstellt..." : "Exit-Interview erstellen"}
        </button>
      </div>
    );
  }

  const magicUrl = typeof window !== "undefined" ? `${window.location.origin}/exit-interview/${exitInterview.token}` : "";

  const statusLabels: Record<string, { label: string; color: string }> = {
    SCHEDULED: { label: "Geplant", color: "bg-gray-100 text-gray-800" },
    INVITED: { label: "Eingeladen", color: "bg-credo-blau/10 text-credo-blau" },
    IN_PROGRESS: { label: "In Bearbeitung", color: "bg-credo-gelb/10 text-credo-gelb" },
    SUBMITTED: { label: "Abgeschlossen", color: "bg-credo-gruen/10 text-credo-gruen" },
    EXPIRED: { label: "Abgelaufen", color: "bg-credo-rot/10 text-credo-rot" },
  };
  const statusInfo = statusLabels[exitInterview.status] || statusLabels.SCHEDULED;

  const isSubmitted = exitInterview.status === "SUBMITTED";
  const hasResponses = isSubmitted && exitInterview.responses && exitInterview.responses.length > 0;
  const responseMap = new Map(
    (exitInterview.responses || []).map((r) => [r.snapshotQuestionId, r])
  );

  return (
    <div className="space-y-6">
      {/* Status + Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusInfo.color}`}>
          {statusInfo.label}
        </span>
        <span className="text-xs text-muted-foreground">
          {exitInterview.recipientEmail}
        </span>
        <span className="text-xs text-muted-foreground">
          · {exitInterview.openCount}x geöffnet
        </span>
        {exitInterview.submittedAt && (
          <span className="text-xs text-muted-foreground">
            · Ausgefüllt am {new Date(exitInterview.submittedAt).toLocaleDateString("de-DE")}
          </span>
        )}

        <div className="ml-auto flex gap-2">
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(magicUrl);
              setCopiedEI(true);
              setTimeout(() => setCopiedEI(false), 2000);
            }}
            className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title={magicUrl}
          >
            {copiedEI ? (
              <span className="text-credo-gruen">Kopiert!</span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                Link
              </span>
            )}
          </button>
          {exitInterview.status === "SCHEDULED" && (
            <button onClick={sendExitInterviewLink} className="rounded-md bg-credo-gruen px-3 py-1 text-[11px] font-semibold text-white hover:bg-credo-gruen/85">
              Jetzt senden
            </button>
          )}
          {exitInterview.status === "INVITED" && (
            <button onClick={sendExitInterviewLink} className="rounded-md border border-border px-3 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted">
              Reminder
            </button>
          )}
        </div>
      </div>

      {/* Insights Dashboard — nur wenn ausgefüllt */}
      {hasResponses && insights && (
        <>
          {/* KPI-Karten */}
          <div className="grid gap-4 sm:grid-cols-3">
            {/* Gesamtbewertung */}
            <div className={`rounded-xl border p-5 text-center ${insights.overallAvg ? getRatingBg(insights.overallAvg) : "bg-muted"}`}>
              <p className="text-xs font-medium text-muted-foreground">Gesamtbewertung</p>
              <p className={`mt-1 text-4xl font-bold ${insights.overallAvg ? getRatingColor(insights.overallAvg) : "text-foreground"}`}>
                {insights.overallAvg?.toFixed(1) || "—"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">von 5.0</p>
            </div>

            {/* eNPS */}
            {insights.enpsValue !== null && (
              <div className={`rounded-xl border p-5 text-center ${getEnpsLabel(insights.enpsValue).color}`}>
                <p className="text-xs font-medium text-muted-foreground">eNPS (Weiterempfehlung)</p>
                <p className="mt-1 text-4xl font-bold">{insights.enpsValue}</p>
                <p className="mt-0.5 text-xs font-medium">{getEnpsLabel(insights.enpsValue).label}</p>
              </div>
            )}

            {/* Antwort-Übersicht */}
            <div className="rounded-xl border bg-card p-5 text-center">
              <p className="text-xs font-medium text-muted-foreground">Antworten</p>
              <p className="mt-1 text-4xl font-bold text-foreground">
                {exitInterview.responses?.length || 0}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">Fragen beantwortet</p>
            </div>
          </div>

          {/* Kategorie-Balken */}
          <Card title="Bewertung nach Kategorien">
            <div className="space-y-3">
              {insights.categoryInsights.filter((c) => c.avgRating !== null).map((cat) => (
                <div key={cat.name} className="flex items-center gap-4">
                  <span className="w-40 shrink-0 text-xs text-foreground">{cat.name}</span>
                  <div className="flex-1">
                    <div className="h-3 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          cat.avgRating! >= 4 ? "bg-credo-gruen" : cat.avgRating! >= 3 ? "bg-credo-gelb" : "bg-credo-rot"
                        }`}
                        style={{ width: `${(cat.avgRating! / 5) * 100}%` }}
                      />
                    </div>
                  </div>
                  <span className={`w-8 text-right text-sm font-bold ${getRatingColor(cat.avgRating!)}`}>
                    {cat.avgRating!.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* Stärken & Handlungsfelder */}
          {(insights.strengths.length > 0 || insights.concerns.length > 0) && (
            <div className="grid gap-4 sm:grid-cols-2">
              {insights.strengths.length > 0 && (
                <div className="rounded-xl border border-credo-gruen/20 bg-credo-gruen/5 p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <svg className="h-4 w-4 text-credo-gruen" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017a2 2 0 01-.632-.103l-2.828-.94A2 2 0 016.868 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h.172a2 2 0 001.414-.586l3-3A2 2 0 0111 5.586V4a2 2 0 012-2h.5" />
                    </svg>
                    <h4 className="text-sm font-semibold text-credo-gruen">Stärken</h4>
                  </div>
                  <ul className="space-y-1.5">
                    {insights.strengths.slice(0, 5).map((s, i) => (
                      <li key={i} className="text-xs text-foreground">• {s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {insights.concerns.length > 0 && (
                <div className="rounded-xl border border-credo-rot/20 bg-credo-rot/5 p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <svg className="h-4 w-4 text-credo-rot" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <h4 className="text-sm font-semibold text-credo-rot">Handlungsfelder</h4>
                  </div>
                  <ul className="space-y-1.5">
                    {insights.concerns.slice(0, 5).map((c, i) => (
                      <li key={i} className="text-xs text-foreground">• {c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Detaillierte Antworten — 2 Spalten */}
          <Card title="Alle Antworten">
            <div className="space-y-8">
              {exitInterview.templateSnapshot!.categories.map((cat) => {
                const catQuestions = cat.questions.filter((q) => responseMap.has(q.id));
                if (catQuestions.length === 0) return null;
                return (
                  <div key={cat.id}>
                    <h4 className="mb-3 border-b border-border pb-2 text-sm font-semibold text-foreground">{cat.name}</h4>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {catQuestions.map((q) => {
                        const resp = responseMap.get(q.id)!;
                        return (
                          <div key={q.id} className="rounded-lg border border-border bg-muted/20 p-3">
                            <p className="mb-2 text-[11px] font-medium leading-snug text-muted-foreground">{q.questionText}</p>
                            {q.questionType === "RATING_5_STAR" && resp.ratingValue != null && (
                              <div className="flex items-center gap-1.5">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <svg key={star} className={`h-5 w-5 ${star <= resp.ratingValue! ? "text-credo-gelb" : "text-gray-200"}`} fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                  </svg>
                                ))}
                                <span className={`ml-1 text-sm font-bold ${getRatingColor(resp.ratingValue!)}`}>{resp.ratingValue}/5</span>
                              </div>
                            )}
                            {q.questionType === "ENPS" && resp.ratingValue != null && (
                              <div className="flex items-center gap-2">
                                <span className={`inline-flex rounded-full px-3 py-1 text-sm font-bold ${getEnpsLabel(resp.ratingValue).color}`}>
                                  {resp.ratingValue}/10
                                </span>
                                <span className="text-xs text-muted-foreground">{getEnpsLabel(resp.ratingValue).label}</span>
                              </div>
                            )}
                            {q.questionType === "FREE_TEXT" && resp.textValue && (
                              <p className="text-xs italic text-foreground">&ldquo;{resp.textValue}&rdquo;</p>
                            )}
                            {q.questionType === "SINGLE_CHOICE" && resp.singleChoiceValue && (
                              <span className="inline-flex rounded-full bg-credo-blau/10 px-3 py-0.5 text-xs font-medium text-credo-blau">
                                {resp.singleChoiceValue}
                              </span>
                            )}
                            {q.questionType === "MULTIPLE_CHOICE" && resp.choiceValues && (
                              <div className="flex flex-wrap gap-1">
                                {(resp.choiceValues as string[]).map((v, i) => (
                                  <span key={i} className="inline-flex rounded-full bg-credo-blau/10 px-2.5 py-0.5 text-[11px] font-medium text-credo-blau">{v}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}

      {/* Noch nicht ausgefüllt — Info */}
      {!isSubmitted && exitInterview.status !== "EXPIRED" && (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Der Fragebogen wurde noch nicht ausgefüllt. Die Ergebnisse erscheinen hier sobald der Mitarbeiter den Fragebogen abschließt.
          </p>
        </div>
      )}
    </div>
  );
}
