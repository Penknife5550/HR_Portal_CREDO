"use client";

/**
 * Personalfragebogen – Magic-Link Einstiegsseite
 *
 * Validiert den Token und zeigt entweder den Fragebogen
 * oder eine Fehlermeldung an.
 */

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { CredoLinie } from "@/components/credo-linie";
import { FragebogenForm } from "./fragebogen-form";

interface OnboardingData {
  onboardingId: string;
  email: string;
  organization: {
    name: string;
    mandantNumber: string;
    type: string;
  };
  questionnaireType: string;
  status: string;
  personalData: Record<string, unknown> | null;
}

export default function FragebogenPage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OnboardingData | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/fragebogen/${token}`);
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Fehler beim Laden des Fragebogens.");
        return;
      }
      const result = await res.json();
      setData(result);
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
            Fragebogen wird geladen...
          </p>
        </div>
      </div>
    );
  }

  // Fehler (Token ungueltig, abgelaufen, etc.)
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

  // Fragebogen bereits eingereicht
  if (data?.status === "SUBMITTED" || data?.status === "COMPLETED" || data?.status === "REVIEWED" || data?.status === "SUPERVISOR_PENDING" || data?.status === "SUPERVISOR_SUBMITTED") {
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
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <svg
                className="h-8 w-8 text-green-600"
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
            <h1 className="text-lg font-bold text-foreground">
              Fragebogen bereits eingereicht
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Vielen Dank! Ihr Personalfragebogen wurde bereits erfolgreich
              eingereicht. Sie koennen dieses Fenster schliessen.
            </p>
          </div>
          <CredoLinie />
        </div>
      </div>
    );
  }

  // Fragebogen anzeigen
  return (
    <FragebogenForm
      token={token}
      initialData={data!}
    />
  );
}
