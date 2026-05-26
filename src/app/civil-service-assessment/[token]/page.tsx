"use client";

/**
 * Beurteilungs-Magic-Link – Einstiegsseite für Schulleitungen
 *
 * Validiert den Token und zeigt entweder den Bewertungsbogen
 * (BEURTEILUNG oder REFERENZ) oder eine Fehlermeldung an.
 */

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { CredoLinie } from "@/components/credo-linie";
import { AssessmentForm } from "./assessment-form";

// =============================================
// Typen
// =============================================

export interface SnapshotCriterion {
  id: string;
  name: string;
  description: string | null;
  weight: number;
  orderIndex: number;
}

export interface SnapshotCategory {
  id: string;
  name: string;
  description?: string | null;
  weight: number;
  orderIndex: number;
  isMandatory?: boolean;
  legalReference?: string | null;
  criteria: SnapshotCriterion[];
}

export interface TemplateSnapshot {
  templateId?: string | null;
  name?: string;
  version?: number;
  scaleType?: "BRL_1_5" | "SCHULNOTEN_1_6";
  scaleLabels?: Record<string, string>;
  categories: SnapshotCategory[];
}

export interface AssessmentData {
  id: string;
  assessmentNumber: number;
  assessmentType: "BEURTEILUNG" | "REFERENZ";
  recipientName: string | null;
  recipientEmail: string;
  templateSnapshot: TemplateSnapshot | null;
  scaleType: "BRL_1_5" | "SCHULNOTEN_1_6" | null;
  ratingsData: Record<string, number> | null;
  referenceData: Record<string, string> | null;
  gemeindeReferenz: string | null;
  overallGrade: number | null;
  meetsRequirements: boolean | null;
  meetsRequirementsManual: boolean | null;
  overallReasoning: string | null;
  // Workflow-Felder Phase 3
  scheduledDate: string | null;
  announcedAt: string | null;
  fach: string | null;
  klasse: string | null;
  vertrauenslehrkraft: string | null;
  unbiasedConfirmed: boolean | null;
  unbiasedConfirmedAt: string | null;
  postReviewAt: string | null;
  postReviewNotes: string | null;
  beurteilungsgespraechAt: string | null;
  beurteilungsgespraechNotes: string | null;
  verifyToken: string | null;
  employee: {
    name: string;
    organizationName: string;
  };
}

export default function CivilServiceAssessmentPage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AssessmentData | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/civil-service-assessment/${token}`);
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Fehler beim Laden des Bewertungsbogens.");
        return;
      }
      const result = await res.json();
      setData(result.data);
    } catch {
      setError("Verbindungsfehler. Bitte versuchen Sie es spaeter erneut.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Ladezustand
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">
            Beurteilungsbogen wird geladen...
          </p>
        </div>
      </div>
    );
  }

  // Fehler (Token ungültig, abgelaufen, bereits eingereicht)
  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-4">
        <div className="w-full max-w-md overflow-hidden rounded-xl bg-card shadow-lg">
          <div className="p-8 text-center">
            <Image
              src="/credo_logo_claim.svg"
              alt="CREDO"
              width={200}
              height={65}
              className="mx-auto mb-6"
              priority
            />
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <svg
                className="h-8 w-8 text-destructive"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-foreground">
              Link nicht gueltig
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <p className="mt-4 text-xs text-muted-foreground">
              Bitte wenden Sie sich an die Personalabteilung,
              falls Sie einen neuen Link benoetigen.
            </p>
          </div>
          <CredoLinie />
        </div>
      </div>
    );
  }

  // Beurteilungsbogen anzeigen
  return <AssessmentForm token={token} initialData={data!} />;
}
