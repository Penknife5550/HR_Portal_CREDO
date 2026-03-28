"use client";

import { useState } from "react";
import type { AssessmentData } from "../types";
import { formatDate } from "../helpers";
import { CopyIcon } from "../icons";

export function TabAssessments({
  assessments,
  copiedId,
  onCopyLink,
  processId,
  onReload,
  setActionError,
  setActionSuccess,
}: {
  assessments: AssessmentData[];
  copiedId: string | null;
  onCopyLink: (token: string, id: string) => void;
  processId: string;
  onReload: () => Promise<void>;
  setActionError: (msg: string) => void;
  setActionSuccess: (msg: string) => void;
}) {
  const [creating, setCreating] = useState<number | null>(null);

  const ASSESSMENT_LABELS = [
    "1. Unterrichtsbesuch",
    "2. Unterrichtsbesuch",
    "3. Unterrichtsbesuch",
  ];

  const statusBadge = (status: string) => {
    switch (status) {
      case "SUBMITTED":
        return { label: "Eingereicht", color: "bg-credo-gruen/10 text-credo-gruen" };
      case "PENDING":
        return { label: "Ausstehend", color: "bg-credo-gelb/10 text-credo-gelb" };
      case "SENT":
        return { label: "Link versendet", color: "bg-credo-blau/10 text-credo-blau" };
      default:
        return { label: status, color: "bg-gray-100 text-gray-600" };
    }
  };

  const handleRequestAssessment = async (assessmentNumber: number) => {
    setCreating(assessmentNumber);
    try {
      const res = await fetch(`/api/civil-service/${processId}/assessments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentNumber }),
      });
      if (res.ok) {
        setActionSuccess("Beurteilung angefordert.");
        await onReload();
      } else {
        setActionError("Beurteilung konnte nicht angefordert werden.");
      }
    } catch {
      setActionError("Verbindungsfehler.");
    } finally {
      setCreating(null);
    }
  };

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {ASSESSMENT_LABELS.map((label, idx) => {
        const num = idx + 1;
        const assessment = assessments.find((a) => a.assessmentNumber === num);

        if (!assessment) {
          return (
            <div
              key={num}
              className="rounded-2xl border-2 border-dashed border-gray-200 bg-white p-6 flex flex-col items-center justify-center gap-3"
            >
              <span className="text-3xl text-gray-200">&#128203;</span>
              <span className="text-sm font-medium text-gray-500">{label}</span>
              <span className="text-xs text-gray-400">Noch nicht angefordert</span>
              <button
                onClick={() => handleRequestAssessment(num)}
                disabled={creating === num}
                className="mt-2 rounded-xl bg-credo-blau px-4 py-2 text-xs font-semibold text-white hover:bg-credo-blau/90 transition-colors disabled:opacity-50 min-h-[44px]"
              >
                {creating === num ? "Wird erstellt..." : "Beurteilung anfordern"}
              </button>
            </div>
          );
        }

        const sb = statusBadge(assessment.status);

        return (
          <div key={num} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900">{label}</h3>
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${sb.color}`}>
                {sb.label}
              </span>
            </div>

            <div className="space-y-2 text-sm">
              {assessment.supervisorName && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Schulleitung</span>
                  <span className="text-gray-800 font-medium">{assessment.supervisorName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-400">E-Mail</span>
                <span className="text-gray-800 text-right text-xs">
                  {assessment.supervisorEmail}
                </span>
              </div>
              {assessment.grade !== null && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Note</span>
                  <span className="text-gray-800 font-bold">{assessment.grade.toFixed(1)}</span>
                </div>
              )}
              {assessment.submittedAt && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Eingereicht</span>
                  <span className="text-gray-800">{formatDate(assessment.submittedAt)}</span>
                </div>
              )}
            </div>

            {assessment.token && (
              <button
                onClick={() => onCopyLink(assessment.token!, assessment.id)}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors min-h-[44px]"
              >
                <CopyIcon className="h-3.5 w-3.5" />
                {copiedId === assessment.id ? "Link kopiert!" : "Magic Link kopieren"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
