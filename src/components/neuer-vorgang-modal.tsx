"use client";

/**
 * Modal: Neuen Onboarding-Vorgang anlegen
 *
 * Felder: E-Mail, Vorname/Nachname (optional), Einrichtung (Mandant),
 * Vorgangsart, Fragebogentyp und — nur fuer HR_EDIT_ROLES — die E-Mail der
 * Fuehrungskraft. Ist sie eingetragen, erzeugt POST /api/onboarding in
 * derselben Transaktion auch den Link zu den Einstellungsmodalitaeten; beide
 * Spuren laufen parallel (src/lib/onboarding-spuren.ts).
 *
 * Die Erfolgsansicht meldet je Link, ob die Einladung hinausging. Scheitert
 * eine Mail, ist der Vorgang trotzdem angelegt — HR gibt den Link dann selbst
 * weiter. Deshalb ist das Schliessen gesperrt, solange die Anfrage laeuft:
 * Sonst gaebe es den Vorgang, aber niemand saehe seine Links.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { formatDatumDE } from "@/lib/format";

interface Organization {
  id: string;
  mandantNumber: string;
  name: string;
  shortName: string | null;
  type: string;
}

/** Ergebnis des Mailversands je Einladung; `null` = kein Ergebnis vom Dispatcher. */
type MailVersand = "SENT" | "FAILED" | "SKIPPED" | null;

/** Antwort von POST /api/onboarding (201) — nur die Felder, die das Modal zeigt. */
interface AnlegeErgebnis {
  id: string;
  displayId: string | null;
  email: string;
  fragebogenLink: string;
  tokenExpiresAt: string;
  mailVersand: MailVersand;
  vorgesetzter: {
    supervisorEmail: string;
    modalitaetenLink: string;
    supervisorTokenExpiresAt: string;
    mailVersand: MailVersand;
  } | null;
}

interface NeuerVorgangModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  /**
   * Nur HR_EDIT_ROLES duerfen den Vorgesetzten-Link erzeugen — dieselbe Regel
   * wie in /supervisor-link. Ohne das Recht fehlt der Block ganz; der Server
   * wiese das Feld mit 403 ab.
   */
  darfVorgesetztenLink: boolean;
}

const inputClass =
  "w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";
const labelClass = "text-sm font-medium text-foreground";

export function NeuerVorgangModal({
  open,
  onClose,
  onCreated,
  darfVorgesetztenLink,
}: NeuerVorgangModalProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [processType, setProcessType] = useState("EINSTELLUNG");
  const [questionnaireType, setQuestionnaireType] = useState("STANDARD");
  const [supervisorEmail, setSupervisorEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnlegeErgebnis | null>(null);

  // Sperre gegen den Doppelklick. `loading` allein genuegt nicht: Zwischen dem
  // ersten Klick und dem neuen Rendern (disabled) kann ein zweiter Submit
  // durchrutschen — mit zwei Vorgaengen und bis zu vier Mails.
  const sendetRef = useRef(false);

  // Die Meldung steht oben im scrollenden Bereich, die Knoepfe unten. Auf dem
  // Handy ist das Formular hoeher als der Bildschirm: Ohne diesen Sprung saehe
  // man nach einer Abweisung (400/403/404/409) nur, dass der Knopf wieder
  // „Vorgang anlegen" heisst. Der Fokus hilft zusaetzlich der Tastatur.
  const fehlerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const kasten = fehlerRef.current;
    if (!error || !kasten) return;
    kasten.scrollIntoView?.({ block: "nearest" });
    kasten.focus({ preventScroll: true });
  }, [error]);

  const handleClose = useCallback(() => {
    // Waehrend der Anfrage gesperrt: Der Vorgang entsteht womoeglich gerade,
    // nach dem Schliessen saehe niemand mehr seine Links.
    if (sendetRef.current) return;
    setEmail("");
    setFirstName("");
    setLastName("");
    setOrganizationId("");
    setProcessType("EINSTELLUNG");
    setQuestionnaireType("STANDARD");
    setSupervisorEmail("");
    setError("");
    setResult(null);
    onClose();
  }, [onClose]);

  // Escape-Taste zum Schliessen — ueber handleClose, damit beim naechsten
  // Oeffnen keine alten Eingaben (fremder Name, falsche Fuehrungskraft) stehen.
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, handleClose]);

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
    if (sendetRef.current) return;
    sendetRef.current = true;
    setError("");
    setLoading(true);

    // Optionale Felder nur mitschicken, wenn etwas drinsteht.
    const body: Record<string, string> = {
      email: email.trim(),
      organizationId,
      processType,
      questionnaireType,
    };
    const vorname = firstName.trim();
    const nachname = lastName.trim();
    const fuehrungskraft = supervisorEmail.trim();
    if (vorname) body.firstName = vorname;
    if (nachname) body.lastName = nachname;
    if (darfVorgesetztenLink && fuehrungskraft) body.supervisorEmail = fuehrungskraft;

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Fehler beim Anlegen des Vorgangs.");
        return;
      }

      const data: AnlegeErgebnis = await res.json();
      setResult(data);
      onCreated();
    } catch {
      setError("Verbindungsfehler.");
    } finally {
      sendetRef.current = false;
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="neuer-vorgang-titel"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} aria-hidden="true" />

      {/* Modal: Kopf fest (in der Erfolgsansicht auch der Fuss), der Inhalt
          scrollt — auch auf dem Handy. Die Knoepfe des Formulars scrollen mit. */}
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl bg-card shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
          <h2 id="neuer-vorgang-titel" className="text-lg font-bold text-foreground">
            {result ? "Vorgang angelegt" : "Neuer Onboarding-Vorgang"}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            aria-label="Schließen"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
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
        <div className="overflow-y-auto px-6 py-5">
          {result ? (
            /* Erfolg: Vorgangsnummer, Versand je Link, Links zum Kopieren */
            <div className="space-y-5">
              <div role="status" className="flex items-start gap-3 rounded-lg bg-green-50 p-4">
                <svg
                  className="h-6 w-6 shrink-0 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <p className="text-sm text-green-800">
                  Onboarding-Vorgang{" "}
                  {result.displayId && (
                    <>
                      <span className="font-mono font-semibold">{result.displayId}</span>{" "}
                    </>
                  )}
                  wurde angelegt.
                </p>
              </div>

              <LinkBlock
                id="neuer-vorgang-fragebogen-link"
                titel="Fragebogen-Link"
                link={result.fragebogenLink}
                gueltigBis={result.tokenExpiresAt}
                versand={result.mailVersand}
                empfaenger={result.email}
                versendetAn="Einladung zum Personalfragebogen an"
              />

              {result.vorgesetzter ? (
                <div className="space-y-3 border-t pt-4">
                  <LinkBlock
                    id="neuer-vorgang-modalitaeten-link"
                    titel="Modalitäten-Link"
                    link={result.vorgesetzter.modalitaetenLink}
                    gueltigBis={result.vorgesetzter.supervisorTokenExpiresAt}
                    versand={result.vorgesetzter.mailVersand}
                    empfaenger={result.vorgesetzter.supervisorEmail}
                    versendetAn="Link zu den Einstellungsmodalitäten an"
                  />
                  <p className="text-xs text-muted-foreground">
                    Beide Seiten können unabhängig voneinander ausfüllen.
                  </p>
                </div>
              ) : (
                darfVorgesetztenLink && (
                  <p className="border-t pt-4 text-xs text-muted-foreground">
                    Den Link zu den Einstellungsmodalitäten können Sie später in der Übersicht des
                    Vorgangs erstellen.
                  </p>
                )
              )}
            </div>
          ) : (
            /* Formular */
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div
                  ref={fehlerRef}
                  role="alert"
                  tabIndex={-1}
                  className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive outline-none"
                >
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="neuer-vorgang-email" className={labelClass}>
                  E-Mail des neuen Mitarbeiters{" "}
                  <span className="text-destructive">*</span>
                </label>
                <input
                  id="neuer-vorgang-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vorname.nachname@beispiel.de"
                  required
                  autoFocus
                  maxLength={254}
                  className={inputClass}
                />
              </div>

              <div className="space-y-2">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="neuer-vorgang-vorname" className={labelClass}>
                      Vorname <span className="font-normal text-muted-foreground">(optional)</span>
                    </label>
                    <input
                      id="neuer-vorgang-vorname"
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      maxLength={100}
                      autoComplete="off"
                      aria-describedby="neuer-vorgang-name-hinweis"
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="neuer-vorgang-nachname" className={labelClass}>
                      Nachname <span className="font-normal text-muted-foreground">(optional)</span>
                    </label>
                    <input
                      id="neuer-vorgang-nachname"
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      maxLength={100}
                      autoComplete="off"
                      aria-describedby="neuer-vorgang-name-hinweis"
                      className={inputClass}
                    />
                  </div>
                </div>
                <p id="neuer-vorgang-name-hinweis" className="text-xs text-muted-foreground">
                  Wird im Fragebogen vorausgefüllt; die Person kann ihn dort korrigieren.
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="neuer-vorgang-einrichtung" className={labelClass}>
                  Einrichtung / Mandant{" "}
                  <span className="text-destructive">*</span>
                </label>
                <select
                  id="neuer-vorgang-einrichtung"
                  value={organizationId}
                  onChange={(e) => setOrganizationId(e.target.value)}
                  required
                  className={inputClass}
                >
                  <option value="">Bitte wählen...</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} ({org.mandantNumber})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="neuer-vorgang-vorgangsart" className={labelClass}>
                  Vorgangsart
                </label>
                <select
                  id="neuer-vorgang-vorgangsart"
                  value={processType}
                  onChange={(e) => setProcessType(e.target.value)}
                  className={inputClass}
                >
                  <option value="EINSTELLUNG">Einstellung (Neueinstellung)</option>
                  <option value="VERBEAMTUNG" disabled>Verbeamtung (in Vorbereitung)</option>
                  <option value="VERTRAGSAENDERUNG" disabled>Vertragsänderung (in Vorbereitung)</option>
                  <option value="KUENDIGUNG" disabled>Kündigung / Austritt (in Vorbereitung)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="neuer-vorgang-fragebogentyp" className={labelClass}>
                  Fragebogentyp
                </label>
                <select
                  id="neuer-vorgang-fragebogentyp"
                  value={questionnaireType}
                  onChange={(e) => setQuestionnaireType(e.target.value)}
                  className={inputClass}
                >
                  <option value="STANDARD">Standard (Angestellte)</option>
                  <option value="BEAMTE">Beamte / Planstelleninhaber</option>
                  <option value="ERZIEHER">Erzieher/in (TV-L S)</option>
                  <option value="MINIJOB">Minijob</option>
                  <option value="EHRENAMT">Ehrenamt</option>
                </select>
              </div>

              {darfVorgesetztenLink && (
                <fieldset className="space-y-2 rounded-lg border border-border bg-muted/40 px-4 pb-4 pt-2">
                  <legend className="px-1 text-sm font-semibold text-foreground">
                    Führungskraft (optional)
                  </legend>
                  <label htmlFor="neuer-vorgang-fuehrungskraft" className={labelClass}>
                    E-Mail der Führungskraft
                  </label>
                  <input
                    id="neuer-vorgang-fuehrungskraft"
                    type="email"
                    value={supervisorEmail}
                    onChange={(e) => setSupervisorEmail(e.target.value)}
                    placeholder="vorgesetzter@einrichtung.de"
                    maxLength={254}
                    autoComplete="off"
                    aria-describedby="neuer-vorgang-fuehrungskraft-hinweis"
                    className={inputClass}
                  />
                  <p
                    id="neuer-vorgang-fuehrungskraft-hinweis"
                    className="text-xs text-muted-foreground"
                  >
                    Ist sie eingetragen, bekommt die Führungskraft den Link zu den
                    Einstellungsmodalitäten sofort, parallel zum Fragebogen. Sonst lässt sich der
                    Link später jederzeit in der Übersicht erstellen.
                  </p>
                </fieldset>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={loading}
                  className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
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
          <div className="flex shrink-0 flex-col-reverse gap-3 border-t px-6 py-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
            >
              Schließen
            </button>
            <Link
              href={`/dashboard/${result.id}`}
              onClick={handleClose}
              className="rounded-lg bg-primary px-6 py-2.5 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Zum Vorgang
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================
// Ein Link der Erfolgsansicht: Versand, Feld zum Kopieren, Ablauf
// =============================================

function LinkBlock({
  id,
  titel,
  link,
  gueltigBis,
  versand,
  empfaenger,
  versendetAn,
}: {
  id: string;
  titel: string;
  link: string;
  gueltigBis: string;
  versand: MailVersand;
  empfaenger: string;
  /** Satzanfang fuer den Erfolgsfall, z. B. „Einladung zum Personalfragebogen an". */
  versendetAn: string;
}) {
  // Die Gueltigkeit ist per MAGIC_LINK_EXPIRY_HOURS einstellbar — deshalb das
  // Datum aus der Antwort und keine fest eingetragene Dauer.
  const bis = formatDatumDE(gueltigBis);

  return (
    <div className="space-y-2">
      {versand === "SENT" ? (
        <p className="flex items-start gap-2 text-sm text-foreground">
          <svg
            className="mt-0.5 h-4 w-4 shrink-0 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span>
            {versendetAn} <strong className="break-all">{empfaenger}</strong> versendet
          </span>
        </p>
      ) : (
        // FAILED, SKIPPED (Vorlage aus) oder kein Ergebnis: Der Vorgang steht,
        // nur die Mail fehlt. Kein automatischer neuer Versuch.
        <p
          role="alert"
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          Die E-Mail an <strong className="break-all">{empfaenger}</strong> wurde nicht versendet.
          Bitte geben Sie den Link selbst weiter.
        </p>
      )}

      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {titel}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="text"
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-lg border border-input bg-muted px-3 py-2 font-mono text-xs text-foreground outline-none"
        />
        <CopyButton text={link} />
      </div>
      {bis && <p className="text-xs text-muted-foreground">Gültig bis {bis}</p>}
    </div>
  );
}
