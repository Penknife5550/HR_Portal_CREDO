"use client";

/**
 * Einrichtungsleiter-Genehmigung — Magic-Link Page (Phase 2)
 *
 * Token-validierte Single-Use-Page. Zeigt den Antrag an und erlaubt
 * Genehmigung oder Ablehnung mit Begruendung.
 */

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { CredoLinie } from "@/components/credo-linie";

interface Abschnitt {
  abschnittNr: number;
  von: string;
  bis: string;
  uebertragung3bis8: boolean;
  teilzeit: boolean;
  teilzeitStunden: number | null;
}

interface LeiterAntragData {
  elternzeitId: string;
  displayId: string;
  employeeName: string;
  organizationName: string;
  kindNummer: number;
  geschlecht: "MUTTER" | "VATER";
  einrichtungsleiterName: string | null;
  abschnitte: Abschnitt[];
}

export default function LeiterPage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LeiterAntragData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<"GENEHMIGT" | "ABGELEHNT" | null>(
    null,
  );
  const [grund, setGrund] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/elternzeit-leiter/${token}`);
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Fehler beim Laden");
        return;
      }
      const j = await res.json();
      setData(j.data);
    } catch {
      setError("Verbindungsfehler");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (entscheidung: "GENEHMIGT" | "ABGELEHNT") => {
    if (entscheidung === "ABGELEHNT" && grund.trim().length < 10) {
      setError("Bitte mind. 10 Zeichen Begruendung angeben.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/elternzeit-leiter/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entscheidung,
          ablehnungGrund: entscheidung === "ABGELEHNT" ? grund : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Fehler beim Absenden");
        return;
      }
      setSubmitted(entscheidung);
    } catch {
      setError("Verbindungsfehler");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted px-4">
        <div className="max-w-md rounded-xl bg-card p-8 shadow-lg text-center">
          <Image
            src="/credo_logo_claim.svg"
            alt="CREDO"
            width={200}
            height={65}
            className="mx-auto mb-6"
            priority
          />
          <h1 className="text-lg font-bold">Link nicht gueltig</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <CredoLinie />
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted px-4">
        <div className="max-w-md rounded-xl bg-card p-8 shadow-lg text-center">
          <Image
            src="/credo_logo_claim.svg"
            alt="CREDO"
            width={200}
            height={65}
            className="mx-auto mb-6"
            priority
          />
          <h1 className="text-lg font-bold">
            {submitted === "GENEHMIGT" ? "Genehmigung erfasst" : "Ablehnung erfasst"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Vielen Dank fuer Ihre Rueckmeldung. Die Personalabteilung wurde
            benachrichtigt.
          </p>
          <CredoLinie />
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-muted">
      <header className="bg-card shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Image
            src="/credo_logo_claim.svg"
            alt="CREDO"
            width={160}
            height={52}
            priority
          />
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Vorgang</p>
            <p className="font-mono text-sm font-semibold">{data.displayId}</p>
          </div>
        </div>
        <CredoLinie />
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold">Stellungnahme zur Elternzeit</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {data.organizationName} · {data.employeeName} · {data.kindNummer}. Kind
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-4 py-3 text-sm text-credo-rot">
            {error}
          </div>
        )}

        <section className="mt-6 rounded-lg border bg-card p-6">
          <h2 className="text-sm font-semibold text-primary">
            Beantragte Zeitraeume
          </h2>
          <div className="mt-3 space-y-2">
            {data.abschnitte.map((a) => (
              <div key={a.abschnittNr} className="text-sm">
                <span className="font-medium">Abschnitt {a.abschnittNr}:</span>{" "}
                {new Date(a.von).toLocaleDateString("de-DE")} bis{" "}
                {new Date(a.bis).toLocaleDateString("de-DE")}
                {a.uebertragung3bis8 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    (Uebertragung 3.–8. Lj.)
                  </span>
                )}
                {a.teilzeit && a.teilzeitStunden && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    (Teilzeit {a.teilzeitStunden} h/Woche)
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-lg border bg-card p-6">
          <h2 className="text-sm font-semibold text-primary">Ihre Entscheidung</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Bitte bestaetigen Sie den Antrag oder lehnen Sie mit Begruendung ab.
          </p>

          <textarea
            value={grund}
            onChange={(e) => setGrund(e.target.value)}
            rows={3}
            placeholder="Optionale Anmerkung — bei Ablehnung Pflicht (mind. 10 Zeichen)"
            className="mt-3 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => submit("GENEHMIGT")}
              disabled={submitting}
              className="rounded-lg bg-credo-gruen px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Genehmigen
            </button>
            <button
              onClick={() => submit("ABGELEHNT")}
              disabled={submitting}
              className="rounded-lg border border-destructive px-4 py-2 text-sm font-medium text-destructive disabled:opacity-50"
            >
              Ablehnen
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
