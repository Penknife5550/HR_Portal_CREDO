"use client";

/**
 * Modal: Neuen Onboarding-Vorgang anlegen
 *
 * Felder: E-Mail, Einrichtung (Mandant), Fragebogentyp
 * Erstellt den Vorgang via API und zeigt den generierten Link an.
 */

import { useState, useEffect } from "react";

interface Organization {
  id: string;
  mandantNumber: string;
  name: string;
  shortName: string | null;
  type: string;
}

interface NeuerVorgangModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function NeuerVorgangModal({
  open,
  onClose,
  onCreated,
}: NeuerVorgangModalProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [email, setEmail] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [questionnaireType, setQuestionnaireType] = useState("STANDARD");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    fragebogenLink: string;
    onboardingId: string;
  } | null>(null);

  // Escape-Taste zum Schliessen
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  // Einrichtungen laden
  useEffect(() => {
    if (!open) return;
    fetch("/api/organizations")
      .then((res) => res.json())
      .then((data) => {
        if (data.data) setOrganizations(data.data);
      })
      .catch(() => {});
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          organizationId,
          questionnaireType,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Fehler beim Anlegen des Vorgangs.");
        return;
      }

      const data = await res.json();
      setResult({
        fragebogenLink: data.fragebogenLink,
        onboardingId: data.id,
      });
      onCreated();
    } catch {
      setError("Verbindungsfehler.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setEmail("");
    setOrganizationId("");
    setQuestionnaireType("STANDARD");
    setError("");
    setResult(null);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg rounded-xl bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-bold text-foreground">
            {result ? "Vorgang angelegt" : "Neuer Onboarding-Vorgang"}
          </h2>
          <button
            onClick={handleClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          {result ? (
            /* Erfolg: Link anzeigen */
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg bg-green-50 p-4">
                <svg
                  className="h-6 w-6 shrink-0 text-green-600"
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
                <p className="text-sm text-green-800">
                  Onboarding-Vorgang wurde erfolgreich angelegt!
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Fragebogen-Link (fuer den neuen Mitarbeiter):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={result.fragebogenLink}
                    className="flex-1 rounded-lg border border-input bg-muted px-3 py-2 font-mono text-xs"
                  />
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(result.fragebogenLink);
                      } catch {
                        // Fallback fuer Nicht-HTTPS-Kontexte
                        const textarea = document.createElement("textarea");
                        textarea.value = result.fragebogenLink;
                        textarea.style.position = "fixed";
                        textarea.style.opacity = "0";
                        document.body.appendChild(textarea);
                        textarea.select();
                        document.execCommand("copy");
                        document.body.removeChild(textarea);
                      }
                    }}
                    className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Kopieren
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Senden Sie diesen Link an den neuen Mitarbeiter (z.B. per
                  E-Mail ueber n8n). Der Link ist 30 Tage gueltig.
                </p>
              </div>
            </div>
          ) : (
            /* Formular */
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  E-Mail des neuen Mitarbeiters{" "}
                  <span className="text-destructive">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vorname.nachname@beispiel.de"
                  required
                  autoFocus
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Einrichtung / Mandant{" "}
                  <span className="text-destructive">*</span>
                </label>
                <select
                  value={organizationId}
                  onChange={(e) => setOrganizationId(e.target.value)}
                  required
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                >
                  <option value="">Bitte waehlen...</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} ({org.mandantNumber})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Fragebogentyp
                </label>
                <select
                  value={questionnaireType}
                  onChange={(e) => setQuestionnaireType(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                >
                  <option value="STANDARD">Standard (Angestellte)</option>
                  <option value="BEAMTE">Beamte / Planstelleninhaber</option>
                  <option value="ERZIEHER">
                    Erzieher/in (TV-L S)
                  </option>
                  <option value="MINIJOB">Minijob</option>
                  <option value="EHRENAMT">Ehrenamt</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {loading ? "Wird angelegt..." : "Vorgang anlegen"}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer bei Erfolg */}
        {result && (
          <div className="border-t px-6 py-4">
            <button
              onClick={handleClose}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Schliessen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
