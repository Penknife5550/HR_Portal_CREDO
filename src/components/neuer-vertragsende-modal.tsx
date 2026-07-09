"use client";

/**
 * Modal: Neuen Vertragsende-Vorgang manuell anlegen.
 * Felder: Vorname, Nachname, Dienst-E-Mail, Einrichtung, Vertragsende (Pflicht),
 * Vertragsbeginn (optional), Personalnummer (optional). POST /api/contract-end.
 */

import { useState, useEffect } from "react";

interface Organization {
  id: string;
  mandantNumber: string;
  name: string;
  shortName: string | null;
  type: string;
}

interface NeuerVertragsendeModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function NeuerVertragsendeModal({ open, onClose, onCreated }: NeuerVertragsendeModalProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [contractEndDate, setContractEndDate] = useState("");
  const [contractStartDate, setContractStartDate] = useState("");
  const [personalNumber, setPersonalNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ displayId: string; id: string } | null>(null);

  // Escape-Taste zum Schliessen + Focus-Trap
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
    setTimeout(() => {
      const modal = document.querySelector('[role="dialog"]');
      const first = modal?.querySelector<HTMLElement>("input, select, button");
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
      const res = await fetch("/api/contract-end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeFirstName: firstName,
          employeeLastName: lastName,
          employeeEmail: email,
          organizationId,
          contractEndDate,
          contractStartDate: contractStartDate || undefined,
          employeePersonalNr: personalNumber || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Fehler beim Anlegen des Vorgangs.");
        return;
      }
      setResult({ displayId: data.displayId, id: data.id });
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
    setEmail("");
    setOrganizationId("");
    setContractEndDate("");
    setContractStartDate("");
    setPersonalNumber("");
    setError("");
    setResult(null);
    onClose();
  };

  if (!open) return null;

  const INPUT =
    "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-bold text-foreground">
            {result ? "Vertragsende-Vorgang angelegt" : "Neuer Vertragsende-Vorgang"}
          </h2>
          <button onClick={handleClose} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Schliessen">
            ✕
          </button>
        </div>

        <div className="px-6 py-5">
          {result ? (
            <div className="space-y-4">
              <div className="flex gap-3 rounded-lg bg-credo-gruen/5 p-4">
                <svg className="h-6 w-6 shrink-0 text-credo-gruen" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div className="text-sm text-credo-gruen">
                  <p className="font-medium">Vorgang erfolgreich angelegt.</p>
                  <p className="mt-1">
                    Vorgangs-ID: <span className="font-mono font-bold">{result.displayId}</span>
                  </p>
                </div>
              </div>
              <a
                href={`/dashboard/contract-end/${result.id}`}
                className="block rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Vorgang öffnen
              </a>
              <button
                onClick={handleClose}
                className="block w-full rounded-lg border border-border px-4 py-2.5 text-center text-sm font-medium text-muted-foreground hover:bg-accent"
              >
                Schliessen
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">
                    Vorname <span className="text-destructive">*</span>
                  </label>
                  <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} required autoComplete="off" placeholder="Max" className={INPUT} />
                </div>
                <div>
                  <label className="text-sm font-medium">
                    Nachname <span className="text-destructive">*</span>
                  </label>
                  <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} required autoComplete="off" placeholder="Mustermann" className={INPUT} />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">
                  Dienst-E-Mail <span className="text-destructive">*</span>
                </label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" placeholder="max.mustermann@einrichtung.de" className={INPUT} />
              </div>

              <div>
                <label className="text-sm font-medium">
                  Einrichtung <span className="text-destructive">*</span>
                </label>
                <select value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} required className={INPUT}>
                  <option value="">Bitte wählen…</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} ({org.mandantNumber})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">
                    Vertragsende <span className="text-destructive">*</span>
                  </label>
                  <input type="date" value={contractEndDate} onChange={(e) => setContractEndDate(e.target.value)} required className={INPUT} />
                </div>
                <div>
                  <label className="text-sm font-medium">
                    Vertragsbeginn <span className="text-xs text-muted-foreground">(optional)</span>
                  </label>
                  <input type="date" value={contractStartDate} onChange={(e) => setContractStartDate(e.target.value)} className={INPUT} />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">
                  Personalnummer <span className="text-xs text-muted-foreground">(optional)</span>
                </label>
                <input type="text" value={personalNumber} onChange={(e) => setPersonalNumber(e.target.value)} autoComplete="off" placeholder="z.B. P-12345" className={INPUT} />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={handleClose} className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent">
                  Abbrechen
                </button>
                <button type="submit" disabled={loading} className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {loading ? "Wird angelegt…" : "Vorgang anlegen"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
