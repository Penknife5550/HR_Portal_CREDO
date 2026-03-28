"use client";

import { useState } from "react";
import type { ZeugnisBewertungData } from "../types";
import { Card, FieldRow } from "../shared-components";

export function TabZeugnis({
  zeugnisBewertung,
  creatingZeugnis,
  createZeugnisBewertung,
}: {
  zeugnisBewertung: ZeugnisBewertungData | null;
  creatingZeugnis: boolean;
  createZeugnisBewertung: (email: string, name: string, jobGroup: string) => void;
}) {
  const [svEmail, setSvEmail] = useState("");
  const [svName, setSvName] = useState("");
  const [svJobGroup, setSvJobGroup] = useState("LEHRKRAFT");
  const [showForm, setShowForm] = useState(false);
  const [copiedZB, setCopiedZB] = useState(false);

  const jobGroupLabels: Record<string, string> = {
    LEHRKRAFT: "Lehrkraft",
    ERZIEHER: "Erzieher/in",
    VERWALTUNG: "Verwaltung",
    SCHULLEITUNG: "Schulleitung",
    SONSTIGES: "Sonstiges Personal",
  };

  const gradeLabels: Record<number, string> = {
    1: "Sehr gut", 2: "Gut", 3: "Befriedigend", 4: "Ausreichend", 5: "Mangelhaft", 6: "Ungenügend",
  };

  if (!zeugnisBewertung) {
    return (
      <div className="space-y-6">
        {!showForm ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card py-16">
            <svg className="mb-4 h-16 w-16 text-border" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <p className="mb-2 text-sm font-medium text-foreground">Keine Zeugnis-Bewertung erstellt</p>
            <p className="mb-6 max-w-sm text-center text-xs text-muted-foreground">
              Erstellen Sie eine Zeugnis-Bewertung. Der Vorgesetzte erhält einen Magic Link zur Benotung.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="rounded-lg bg-credo-gruen px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-credo-gruen/85"
            >
              Zeugnis-Bewertung erstellen
            </button>
          </div>
        ) : (
          <Card title="Zeugnis-Bewertung erstellen">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="sv-email" className="text-sm font-medium text-foreground">E-Mail Vorgesetzte/r *</label>
                  <input autoComplete="off" id="sv-email" type="email" value={svEmail} onChange={(e) => setSvEmail(e.target.value)} placeholder="vorgesetzte@einrichtung.de"
                    className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
                </div>
                <div className="space-y-2">
                  <label htmlFor="sv-name" className="text-sm font-medium text-foreground">Name Vorgesetzte/r</label>
                  <input autoComplete="off" id="sv-name" type="text" value={svName} onChange={(e) => setSvName(e.target.value)} placeholder="Dr. Maria Schmidt"
                    className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="sv-jobgroup" className="text-sm font-medium text-foreground">Berufsgruppe *</label>
                <select autoComplete="off" id="sv-jobgroup" value={svJobGroup} onChange={(e) => setSvJobGroup(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring">
                  {Object.entries(jobGroupLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setShowForm(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted">
                  Abbrechen
                </button>
                <button onClick={() => { createZeugnisBewertung(svEmail, svName, svJobGroup); setShowForm(false); }}
                  disabled={!svEmail || creatingZeugnis}
                  className="rounded-lg bg-credo-gruen px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-credo-gruen/85 disabled:opacity-50">
                  {creatingZeugnis ? "Wird erstellt..." : "Bewertung erstellen & Link senden"}
                </button>
              </div>
            </div>
          </Card>
        )}
      </div>
    );
  }

  const magicUrl = typeof window !== "undefined" ? `${window.location.origin}/zeugnis-bewertung/${zeugnisBewertung.token}` : "";

  const statusLabels: Record<string, { label: string; color: string }> = {
    INVITED: { label: "Eingeladen", color: "bg-credo-blau/10 text-credo-blau" },
    IN_PROGRESS: { label: "In Bearbeitung", color: "bg-credo-gelb/10 text-credo-gelb" },
    SUBMITTED: { label: "Eingereicht", color: "bg-credo-blau/10 text-credo-blau" },
    HR_REVIEW: { label: "HR-Prüfung", color: "bg-credo-gelb/10 text-credo-gelb" },
    FINALIZED: { label: "Finalisiert", color: "bg-credo-gruen/10 text-credo-gruen" },
    EXPIRED: { label: "Abgelaufen", color: "bg-credo-rot/10 text-credo-rot" },
  };
  const statusInfo = statusLabels[zeugnisBewertung.status] || statusLabels.INVITED;

  return (
    <div className="space-y-6">
      <Card title="Zeugnis-Bewertung">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="text-xs text-muted-foreground">Status</span>
            <div className="mt-1">
              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusInfo.color}`}>{statusInfo.label}</span>
            </div>
          </div>
          <FieldRow label="Vorgesetzte/r" value={zeugnisBewertung.supervisorName || zeugnisBewertung.supervisorEmail} />
          <FieldRow label="E-Mail" value={zeugnisBewertung.supervisorEmail} />
          <FieldRow label="Berufsgruppe" value={jobGroupLabels[zeugnisBewertung.jobGroup] || zeugnisBewertung.jobGroup} />
          <FieldRow label="Geöffnet" value={`${zeugnisBewertung.openCount}x`} />
          {zeugnisBewertung.overallGrade && (
            <div>
              <span className="text-xs text-muted-foreground">Gesamtnote</span>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-2xl font-bold text-foreground">{zeugnisBewertung.overallGrade.toFixed(1)}</span>
                {zeugnisBewertung.overallGradeRounded && (
                  <span className="text-sm text-muted-foreground">({gradeLabels[zeugnisBewertung.overallGradeRounded] || ""})</span>
                )}
              </div>
            </div>
          )}
          {zeugnisBewertung.supervisorSubmittedAt && <FieldRow label="Eingereicht am" value={new Date(zeugnisBewertung.supervisorSubmittedAt).toLocaleDateString("de-DE")} />}
          {zeugnisBewertung.finalizedAt && <FieldRow label="Finalisiert am" value={new Date(zeugnisBewertung.finalizedAt).toLocaleDateString("de-DE")} />}
        </div>
      </Card>

      {/* Bewertungen anzeigen */}
      {zeugnisBewertung && ["SUBMITTED", "HR_REVIEW", "FINALIZED"].includes(zeugnisBewertung.status) &&
       zeugnisBewertung.templateSnapshot && zeugnisBewertung.ratings && zeugnisBewertung.ratings.length > 0 && (
        <Card title="Bewertungen des Vorgesetzten">
          <div className="space-y-5">
            {zeugnisBewertung.templateSnapshot.categories.map((cat) => {
              const catRatings = zeugnisBewertung.ratings!.filter((r) => r.snapshotCategoryId === cat.id);
              const catAvg = catRatings.length > 0
                ? catRatings.reduce((sum, r) => sum + (r.hrOverrideGrade || r.grade), 0) / catRatings.length
                : null;
              return (
                <div key={cat.id}>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-foreground">{cat.name}</h4>
                    {catAvg !== null && (
                      <span className="text-xs font-medium text-muted-foreground">Ø {catAvg.toFixed(1)}</span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {cat.criteria.map((crit) => {
                      const rating = catRatings.find((r) => r.snapshotCriterionId === crit.id);
                      if (!rating) return null;
                      const effectiveGrade = rating.hrOverrideGrade || rating.grade;
                      const gradeColor = effectiveGrade <= 2 ? "bg-credo-gruen text-white" : effectiveGrade === 3 ? "bg-credo-gelb text-white" : effectiveGrade === 4 ? "bg-orange-500 text-white" : "bg-red-500 text-white";
                      return (
                        <div key={crit.id} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
                          <span className="text-xs text-foreground">{crit.name}</span>
                          <div className="flex items-center gap-2">
                            {rating.hrOverrideGrade && rating.hrOverrideGrade !== rating.grade && (
                              <span className="text-[10px] text-muted-foreground line-through">{rating.grade}</span>
                            )}
                            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${gradeColor}`}>
                              {effectiveGrade}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Magic Link kopieren */}
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(magicUrl);
          setCopiedZB(true);
          setTimeout(() => setCopiedZB(false), 2000);
        }}
        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title={magicUrl}
      >
        {copiedZB ? (
          <span className="inline-flex items-center gap-1 text-credo-gruen">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            Kopiert!
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            Bewertungslink kopieren
          </span>
        )}
      </button>
    </div>
  );
}
