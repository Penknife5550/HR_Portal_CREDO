"use client";

/**
 * Modal: Neuen Offboarding-Vorgang (Austritt) anlegen
 *
 * Felder: Vorname, Nachname, Dienst-E-Mail, Private E-Mail,
 * Einrichtung, Austrittsart, Letzter Arbeitstag, Personalnummer
 */

import { useState, useEffect } from "react";
import { EXIT_TYPE_LABELS } from "@/lib/constants";

interface Organization {
  id: string;
  mandantNumber: string;
  name: string;
  shortName: string | null;
  type: string;
}

interface NeuerAustrittModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function NeuerAustrittModal({
  open,
  onClose,
  onCreated,
}: NeuerAustrittModalProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [privateEmail, setPrivateEmail] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [exitType, setExitType] = useState("");
  const [lastWorkingDay, setLastWorkingDay] = useState("");
  const [personalNumber, setPersonalNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    displayId: string;
    offboardingId: string;
  } | null>(null);

  // Escape-Taste zum Schliessen + Focus Trap
  useEffect(() => {
    if (!open) return;
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const modal = document.querySelector('[role="dialog"]');
        if (!modal) return;
        const focusable = modal.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeydown);
    // Fokus auf erstes Element setzen
    setTimeout(() => {
      const modal = document.querySelector('[role="dialog"]');
      const first = modal?.querySelector<HTMLElement>('input, select, button');
      first?.focus();
    }, 50);
    return () => document.removeEventListener("keydown", handleKeydown);
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
      const res = await fetch("/api/offboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeFirstName: firstName,
          employeeLastName: lastName,
          employeeEmail: workEmail,
          employeePrivateEmail: privateEmail || undefined,
          organizationId,
          exitType,
          lastWorkingDay,
          employeePersonalNr: personalNumber || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Fehler beim Anlegen des Vorgangs.");
        return;
      }

      const data = await res.json();
      setResult({
        displayId: data.displayId,
        offboardingId: data.id,
      });
      onCreated();
    } catch {
      setError("Verbindungsfehler.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFirstName("");
    setLastName("");
    setWorkEmail("");
    setPrivateEmail("");
    setOrganizationId("");
    setExitType("");
    setLastWorkingDay("");
    setPersonalNumber("");
    setError("");
    setResult(null);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="austritt-modal-title">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 id="austritt-modal-title" className="text-lg font-bold text-foreground">
            {result ? "Austritt angelegt" : "Neuer Offboarding-Vorgang"}
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
            /* Erfolg */
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg bg-credo-gruen/5 p-4">
                <svg
                  className="h-6 w-6 shrink-0 text-credo-gruen"
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
                <div className="text-sm text-credo-gruen">
                  <p className="font-medium">
                    Offboarding-Vorgang wurde erfolgreich angelegt!
                  </p>
                  <p className="mt-1">
                    Vorgangs-ID:{" "}
                    <span className="font-mono font-bold">
                      {result.displayId}
                    </span>
                  </p>
                </div>
              </div>

              <a
                href={`/dashboard/offboarding/${result.offboardingId}`}
                className="block rounded-lg border border-border px-4 py-3 text-center text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Vorgang öffnen
              </a>
            </div>
          ) : (
            /* Formular */
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              {/* Vorname & Nachname */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label htmlFor="austritt-vorname" className="text-sm font-medium text-foreground">
                    Vorname <span className="text-destructive">*</span>
                  </label>
                  <input autoComplete="off"
                    id="austritt-vorname"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Max"
                    required
                    autoFocus
                    className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="austritt-nachname" className="text-sm font-medium text-foreground">
                    Nachname <span className="text-destructive">*</span>
                  </label>
                  <input autoComplete="off"
                    id="austritt-nachname"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Mustermann"
                    required
                    className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>

              {/* Dienst-E-Mail */}
              <div className="space-y-2">
                <label htmlFor="austritt-email" className="text-sm font-medium text-foreground">
                  Dienst-E-Mail <span className="text-destructive">*</span>
                </label>
                <input autoComplete="off"
                  id="austritt-email"
                  type="email"
                  value={workEmail}
                  onChange={(e) => setWorkEmail(e.target.value)}
                  placeholder="max.mustermann@einrichtung.de"
                  required
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                />
              </div>

              {/* Private E-Mail */}
              <div className="space-y-2">
                <label htmlFor="austritt-private-email" className="text-sm font-medium text-foreground">
                  Private E-Mail{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    (optional)
                  </span>
                </label>
                <input autoComplete="off"
                  id="austritt-private-email"
                  type="email"
                  value={privateEmail}
                  onChange={(e) => setPrivateEmail(e.target.value)}
                  placeholder="max@privat.de"
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                />
                <p className="text-xs text-muted-foreground">
                  Für Exit-Survey nach Austritt
                </p>
              </div>

              {/* Einrichtung */}
              <div className="space-y-2">
                <label htmlFor="austritt-einrichtung" className="text-sm font-medium text-foreground">
                  Einrichtung / Mandant{" "}
                  <span className="text-destructive">*</span>
                </label>
                <select autoComplete="off"
                  id="austritt-einrichtung"
                  value={organizationId}
                  onChange={(e) => setOrganizationId(e.target.value)}
                  required
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                >
                  <option value="">Bitte wählen...</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} ({org.mandantNumber})
                    </option>
                  ))}
                </select>
              </div>

              {/* Austrittsart */}
              <div className="space-y-2">
                <label htmlFor="austritt-art" className="text-sm font-medium text-foreground">
                  Austrittsart <span className="text-destructive">*</span>
                </label>
                <select autoComplete="off"
                  id="austritt-art"
                  value={exitType}
                  onChange={(e) => setExitType(e.target.value)}
                  required
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                >
                  <option value="">Bitte wählen...</option>
                  {Object.entries(EXIT_TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Letzter Arbeitstag */}
              <div className="space-y-2">
                <label htmlFor="austritt-datum" className="text-sm font-medium text-foreground">
                  Letzter Arbeitstag{" "}
                  <span className="text-destructive">*</span>
                </label>
                <input autoComplete="off"
                  id="austritt-datum"
                  type="date"
                  value={lastWorkingDay}
                  onChange={(e) => setLastWorkingDay(e.target.value)}
                  required
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                />
                {lastWorkingDay && new Date(lastWorkingDay) < new Date(new Date().toISOString().split("T")[0]) && (
                  <p className="text-xs text-orange-600">
                    Hinweis: Der letzte Arbeitstag liegt in der Vergangenheit.
                  </p>
                )}
              </div>

              {/* Personalnummer */}
              <div className="space-y-2">
                <label htmlFor="austritt-personalnr" className="text-sm font-medium text-foreground">
                  Personalnummer{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    (optional)
                  </span>
                </label>
                <input autoComplete="off"
                  id="austritt-personalnr"
                  type="text"
                  value={personalNumber}
                  onChange={(e) => setPersonalNumber(e.target.value)}
                  placeholder="z.B. P-12345"
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                />
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
                  {loading ? "Wird angelegt..." : "Austritt anlegen"}
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
