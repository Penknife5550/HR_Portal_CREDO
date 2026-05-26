"use client";

/**
 * Modal: Neue Verbeamtung (PSI) anlegen — 2-Schritt-Wizard
 * Schritt 1: Stammdaten (LK)
 * Schritt 2: Beteiligte erfassen (SL, Amtsarzt, Beirat)
 */

import { useState, useEffect } from "react";

interface Organization {
  id: string;
  mandantNumber: string;
  name: string;
  shortName: string | null;
  type: string;
}

interface Stakeholders {
  schulleitung?: { name?: string; email: string };
  amtsarzt?: { email: string };
  beirat?: { email: string };
}

interface NeueVerbeamtungModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function NeueVerbeamtungModal({ open, onClose, onCreated }: NeueVerbeamtungModalProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [step, setStep] = useState<1 | 2>(1);

  // Schritt 1: Stammdaten
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [personalNr, setPersonalNr] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [targetStartDate, setTargetStartDate] = useState("");

  // Schritt 2: Beteiligte
  const [slName, setSlName] = useState("");
  const [slEmail, setSlEmail] = useState("");
  const [amtsarztEmail, setAmtsarztEmail] = useState("");
  const [beiratEmail, setBeiratEmail] = useState("");

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

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setStep(2);
  };

  const handleBack = () => {
    setError("");
    setStep(1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Stakeholders zusammenbauen (nur befuellte Felder)
    const stakeholders: Stakeholders = {};
    if (slEmail.trim()) {
      stakeholders.schulleitung = {
        email: slEmail.trim(),
        ...(slName.trim() ? { name: slName.trim() } : {}),
      };
    }
    if (amtsarztEmail.trim()) {
      stakeholders.amtsarzt = { email: amtsarztEmail.trim() };
    }
    if (beiratEmail.trim()) {
      stakeholders.beirat = { email: beiratEmail.trim() };
    }

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
          stakeholders: Object.keys(stakeholders).length > 0 ? stakeholders : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Fehler beim Anlegen.");
        return;
      }
      const data = await res.json();
      setResult({ displayId: data.displayId || data.data?.displayId, id: data.id || data.data?.id });
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
    setSlName(""); setSlEmail(""); setAmtsarztEmail(""); setBeiratEmail("");
    setStep(1);
    onClose();
  };

  if (!open) return null;

  const inputClass = "w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";
  const labelClass = "text-sm font-medium text-foreground";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="psi-modal-title">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} aria-hidden="true" />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <h2 id="psi-modal-title" className="text-lg font-bold text-foreground">
              {result ? "Verbeamtung angelegt" : "Neue Verbeamtung (PSI)"}
            </h2>
            {!result && (
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                Schritt {step} von 2
              </span>
            )}
          </div>
          <button onClick={handleClose} className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Stepper Indicator */}
        {!result && (
          <div className="px-6 pt-4">
            <div className="flex items-center gap-2">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${step >= 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>1</div>
              <div className={`h-0.5 flex-1 ${step >= 2 ? "bg-primary" : "bg-muted"}`} />
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${step >= 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>2</div>
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
              <span>Lehrkraft</span>
              <span>Beteiligte</span>
            </div>
          </div>
        )}

        <div className="px-6 py-5">
          {/* Erfolgs-Ansicht */}
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

              {/* Magic Link Vorschau */}
              {(slEmail || email) && (
                <div className="rounded-lg border border-border p-4 space-y-2">
                  <p className="text-sm font-medium text-foreground">Magic Links werden vorbereitet für:</p>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-[10px] font-bold text-green-700">LK</span>
                      <span>{firstName} {lastName} ({email}) — Antragsformular</span>
                    </div>
                    {slEmail && (
                      <>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-purple-100 text-[10px] font-bold text-purple-700">SL</span>
                          <span>{slName || "Schulleitung"} ({slEmail}) — Beurteilungen + Referenzen</span>
                        </div>
                      </>
                    )}
                    {amtsarztEmail && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-orange-100 text-[10px] font-bold text-orange-700">AA</span>
                        <span>{amtsarztEmail} — Erinnerungen</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <a href={`/dashboard/civil-service/${result.id}`}
                className="block rounded-lg border border-border px-4 py-3 text-center text-sm font-medium text-foreground transition-colors hover:bg-accent">
                Vorgang oeffnen
              </a>
            </div>
          ) : step === 1 ? (
            /* Schritt 1: Stammdaten */
            <form onSubmit={handleNext} className="space-y-4">
              {error && (
                <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label htmlFor="psi-vorname" className={labelClass}>
                    Vorname <span className="text-destructive">*</span>
                  </label>
                  <input autoComplete="off" id="psi-vorname" type="text" value={firstName}
                    onChange={(e) => setFirstName(e.target.value)} placeholder="Maria" required autoFocus
                    className={inputClass} />
                </div>
                <div className="space-y-2">
                  <label htmlFor="psi-nachname" className={labelClass}>
                    Nachname <span className="text-destructive">*</span>
                  </label>
                  <input autoComplete="off" id="psi-nachname" type="text" value={lastName}
                    onChange={(e) => setLastName(e.target.value)} placeholder="Schmidt" required
                    className={inputClass} />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="psi-email" className={labelClass}>
                  Dienst-E-Mail der Lehrkraft <span className="text-destructive">*</span>
                </label>
                <input autoComplete="off" id="psi-email" type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="m.schmidt@fes-minden.de" required
                  className={inputClass} />
              </div>

              <div className="space-y-2">
                <label htmlFor="psi-einrichtung" className={labelClass}>
                  Schule / Einrichtung <span className="text-destructive">*</span>
                </label>
                <select autoComplete="off" id="psi-einrichtung" value={organizationId}
                  onChange={(e) => setOrganizationId(e.target.value)} required
                  className={inputClass}>
                  <option value="">Bitte waehlen...</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>{org.name} ({org.mandantNumber})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label htmlFor="psi-datum" className={labelClass}>
                    Geplanter Vertragsbeginn
                  </label>
                  <input autoComplete="off" id="psi-datum" type="date" value={targetStartDate}
                    onChange={(e) => setTargetStartDate(e.target.value)}
                    className={inputClass} />
                </div>
                <div className="space-y-2">
                  <label htmlFor="psi-personalnr" className={labelClass}>
                    Personalnummer <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <input autoComplete="off" id="psi-personalnr" type="text" value={personalNr}
                    onChange={(e) => setPersonalNr(e.target.value)} placeholder="P-12345"
                    className={inputClass} />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={handleClose}
                  className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent">
                  Abbrechen
                </button>
                <button type="submit"
                  className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                  Weiter
                </button>
              </div>
            </form>
          ) : (
            /* Schritt 2: Beteiligte */
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
              )}

              <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                Erfasse hier die Beteiligten am Verbeamtungsprozess. Diese erhalten spaeter die entsprechenden Magic Links.
              </div>

              {/* Schulleitung */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-purple-100 text-[10px] font-bold text-purple-700">SL</span>
                  <h3 className="text-sm font-semibold text-foreground">Schulleitung</h3>
                  <span className="text-xs text-muted-foreground">— Beurteilungen, Referenzen, Unterrichtsbesuche</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label htmlFor="psi-sl-name" className="text-xs font-medium text-muted-foreground">Name</label>
                    <input autoComplete="off" id="psi-sl-name" type="text" value={slName}
                      onChange={(e) => setSlName(e.target.value)} placeholder="Dr. Mueller"
                      className={inputClass} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="psi-sl-email" className="text-xs font-medium text-muted-foreground">E-Mail</label>
                    <input autoComplete="off" id="psi-sl-email" type="email" value={slEmail}
                      onChange={(e) => setSlEmail(e.target.value)} placeholder="mueller@fes-minden.de"
                      className={inputClass} />
                  </div>
                </div>
              </div>

              {/* Amtsarzt */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-orange-100 text-[10px] font-bold text-orange-700">AA</span>
                  <h3 className="text-sm font-semibold text-foreground">Amtsarzt</h3>
                  <span className="text-xs text-muted-foreground">— Erinnerungen an Untersuchungstermin</span>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="psi-aa-email" className="text-xs font-medium text-muted-foreground">E-Mail <span className="text-muted-foreground">(optional)</span></label>
                  <input autoComplete="off" id="psi-aa-email" type="email" value={amtsarztEmail}
                    onChange={(e) => setAmtsarztEmail(e.target.value)} placeholder="praxis@amtsarzt-minden.de"
                    className={inputClass} />
                </div>
              </div>

              {/* Beirat */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-yellow-100 text-[10px] font-bold text-yellow-700">BR</span>
                  <h3 className="text-sm font-semibold text-foreground">Beirat</h3>
                  <span className="text-xs text-muted-foreground">— Benachrichtigung bei Entscheidungsbedarf</span>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="psi-br-email" className="text-xs font-medium text-muted-foreground">E-Mail <span className="text-muted-foreground">(optional)</span></label>
                  <input autoComplete="off" id="psi-br-email" type="email" value={beiratEmail}
                    onChange={(e) => setBeiratEmail(e.target.value)} placeholder="beirat@fes-minden.de"
                    className={inputClass} />
                </div>
              </div>

              {/* Vorschau: Wer bekommt was */}
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
                <p className="text-xs font-semibold text-foreground">Magic Link Vorschau</p>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    <span className="font-medium">{firstName} {lastName}</span> erhält Antragsformular (12 Voraussetzungen)
                  </div>
                  {slEmail ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                      <span className="font-medium">{slName || "Schulleitung"}</span> erhält Beurteilungs- und Referenz-Links
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-orange-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                      Schulleitung nicht angegeben — Links koennen spaeter zugewiesen werden
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-between gap-3 pt-2">
                <button type="button" onClick={handleBack}
                  className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent">
                  Zurück
                </button>
                <div className="flex gap-3">
                  <button type="button" onClick={handleClose}
                    className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent">
                    Abbrechen
                  </button>
                  <button type="submit" disabled={loading}
                    className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
                    {loading ? "Wird angelegt..." : "Verbeamtung anlegen"}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>

        {result && (
          <div className="border-t px-6 py-4">
            <button onClick={handleClose}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
              Schliessen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
