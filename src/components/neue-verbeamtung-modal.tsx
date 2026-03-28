"use client";

/**
 * Modal: Neue Verbeamtung (PSI) anlegen
 */

import { useState, useEffect } from "react";

interface Organization {
  id: string;
  mandantNumber: string;
  name: string;
  shortName: string | null;
  type: string;
}

interface NeueVerbeamtungModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function NeueVerbeamtungModal({ open, onClose, onCreated }: NeueVerbeamtungModalProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [personalNr, setPersonalNr] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [targetStartDate, setTargetStartDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ displayId: string; id: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/organizations")
      .then((res) => res.json())
      .then((data) => { if (data.data) setOrganizations(data.data); })
      .catch(() => {});
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/civil-service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeFirstName: firstName,
          employeeLastName: lastName,
          employeeEmail: email,
          employeePersonalNr: personalNr || undefined,
          organizationId,
          targetStartDate: targetStartDate || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Fehler beim Anlegen.");
        return;
      }
      const data = await res.json();
      setResult({ displayId: data.data?.displayId || data.displayId, id: data.data?.id || data.id });
      onCreated();
    } catch {
      setError("Verbindungsfehler.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFirstName(""); setLastName(""); setEmail(""); setPersonalNr("");
    setOrganizationId(""); setTargetStartDate(""); setError(""); setResult(null);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="psi-modal-title">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} aria-hidden="true" />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 id="psi-modal-title" className="text-lg font-bold text-foreground">
            {result ? "Verbeamtung angelegt" : "Neue Verbeamtung (PSI)"}
          </h2>
          <button onClick={handleClose} className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5">
          {result ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg bg-credo-gruen/5 p-4">
                <svg className="h-6 w-6 shrink-0 text-credo-gruen" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div className="text-sm text-credo-gruen">
                  <p className="font-medium">Verbeamtungsvorgang wurde erfolgreich angelegt!</p>
                  <p className="mt-1">Vorgangs-ID: <span className="font-mono font-bold">{result.displayId}</span></p>
                  <p className="mt-0.5 text-xs">62 Checklisten-Punkte und 11 Phasen wurden erstellt.</p>
                </div>
              </div>
              <a href={`/dashboard/civil-service/${result.id}`}
                className="block rounded-lg border border-border px-4 py-3 text-center text-sm font-medium text-foreground transition-colors hover:bg-accent">
                Vorgang öffnen
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label htmlFor="psi-vorname" className="text-sm font-medium text-foreground">
                    Vorname <span className="text-destructive">*</span>
                  </label>
                  <input autoComplete="off" id="psi-vorname" type="text" value={firstName}
                    onChange={(e) => setFirstName(e.target.value)} placeholder="Maria" required autoFocus
                    className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
                </div>
                <div className="space-y-2">
                  <label htmlFor="psi-nachname" className="text-sm font-medium text-foreground">
                    Nachname <span className="text-destructive">*</span>
                  </label>
                  <input autoComplete="off" id="psi-nachname" type="text" value={lastName}
                    onChange={(e) => setLastName(e.target.value)} placeholder="Schmidt" required
                    className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="psi-email" className="text-sm font-medium text-foreground">
                  Dienst-E-Mail <span className="text-destructive">*</span>
                </label>
                <input autoComplete="off" id="psi-email" type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="m.schmidt@fes-minden.de" required
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
              </div>

              <div className="space-y-2">
                <label htmlFor="psi-einrichtung" className="text-sm font-medium text-foreground">
                  Schule / Einrichtung <span className="text-destructive">*</span>
                </label>
                <select autoComplete="off" id="psi-einrichtung" value={organizationId}
                  onChange={(e) => setOrganizationId(e.target.value)} required
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring">
                  <option value="">Bitte wählen...</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>{org.name} ({org.mandantNumber})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label htmlFor="psi-datum" className="text-sm font-medium text-foreground">
                    Geplanter Vertragsbeginn
                  </label>
                  <input autoComplete="off" id="psi-datum" type="date" value={targetStartDate}
                    onChange={(e) => setTargetStartDate(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
                </div>
                <div className="space-y-2">
                  <label htmlFor="psi-personalnr" className="text-sm font-medium text-foreground">
                    Personalnummer <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <input autoComplete="off" id="psi-personalnr" type="text" value={personalNr}
                    onChange={(e) => setPersonalNr(e.target.value)} placeholder="P-12345"
                    className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={handleClose}
                  className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent">
                  Abbrechen
                </button>
                <button type="submit" disabled={loading}
                  className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
                  {loading ? "Wird angelegt..." : "Verbeamtung anlegen"}
                </button>
              </div>
            </form>
          )}
        </div>

        {result && (
          <div className="border-t px-6 py-4">
            <button onClick={handleClose}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
              Schließen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
