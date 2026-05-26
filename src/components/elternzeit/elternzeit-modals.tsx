"use client";

/**
 * Modale Komponenten für Elternzeit-Aktionen (Phase 2 — Block 5)
 *
 * Ersetzt 8 native prompt()/confirm()-Aufrufe durch CREDO-konforme Modals
 * mit Validierung, Live-Feedback und Abbruch ohne Datenverlust.
 *
 * Enthaltene Modals:
 *  - AblehnungModal       — Textarea mit Live-Counter (>=10 Zeichen)
 *  - MagicLinkModal       — E-Mail-Eingabe für Magic-Link-Versand
 *  - GenehmigungEndgModal — Unterzeichner waehlen (GF-Dropdown + Freitext)
 *  - AGBescheinigungModal — 4 strukturierte Felder (LOGA-Daten)
 *  - ConfirmDeleteModal   — Generische Löschen-Bestaetigung
 *
 * Pattern angelehnt an `showSendLinkModal` aus Phase 1.
 */

import { useState, useEffect } from "react";

// =============================================
// Shared Modal-Wrapper
// =============================================

function Modal({
  titel,
  beschreibung,
  onClose,
  children,
}: {
  titel: string;
  beschreibung?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // ESC zum Schliessen
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">{titel}</h2>
        {beschreibung && (
          <p className="mt-1 text-xs text-muted-foreground">{beschreibung}</p>
        )}
        {children}
      </div>
    </div>
  );
}

// =============================================
// AblehnungModal — Textarea mit Live-Counter
// =============================================

export function AblehnungModal({
  titel,
  onClose,
  onSubmit,
}: {
  titel: string;
  onClose: () => void;
  onSubmit: (grund: string) => Promise<void> | void;
}) {
  const [grund, setGrund] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = grund.trim().length >= 10;

  async function handleSubmit() {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(grund.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Speichern");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      titel={titel}
      beschreibung="Die Begruendung wird im PDF-Bescheid an den Mitarbeiter ausgegeben und ist Teil der Personalakte."
      onClose={onClose}
    >
      <label className="mt-4 block">
        <span className="mb-1 block text-xs font-medium">
          Begruendung (mind. 10 Zeichen)
        </span>
        <textarea
          value={grund}
          onChange={(e) => setGrund(e.target.value)}
          rows={5}
          autoFocus
          className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm resize-y"
          placeholder="z.B. Antrag entspricht nicht den Voraussetzungen des § 15 BEEG, weil ..."
        />
        <div className="mt-1 flex justify-between text-xs">
          <span
            className={
              valid ? "text-credo-gruen" : "text-muted-foreground"
            }
          >
            {valid ? "✓ ausreichend" : "noch zu kurz"}
          </span>
          <span className="text-muted-foreground">
            {grund.trim().length} Zeichen
          </span>
        </div>
      </label>
      {error && (
        <div className="mt-3 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg border px-4 py-2 text-sm font-medium"
          disabled={submitting}
        >
          Abbrechen
        </button>
        <button
          onClick={handleSubmit}
          disabled={!valid || submitting}
          className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground disabled:opacity-50"
        >
          {submitting ? "Sende..." : "Ablehnen"}
        </button>
      </div>
    </Modal>
  );
}

// =============================================
// MagicLinkModal — E-Mail-Eingabe
// =============================================

export function MagicLinkModal({
  titel,
  beschreibung,
  defaultEmail,
  onClose,
  onSubmit,
}: {
  titel: string;
  beschreibung?: string;
  defaultEmail?: string;
  onClose: () => void;
  onSubmit: (email: string) => Promise<void> | void;
}) {
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  async function handleSubmit() {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(email);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Erstellen des Links");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal titel={titel} beschreibung={beschreibung} onClose={onClose}>
      <label className="mt-4 block">
        <span className="mb-1 block text-xs font-medium">E-Mail-Empfaenger</span>
        <input
          type="email"
          value={email}
          autoFocus
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm"
          placeholder="vorname.nachname@credo-gruppe.de"
        />
        {!valid && email.length > 0 && (
          <p className="mt-1 text-xs text-destructive">
            Bitte gueltige E-Mail-Adresse eingeben.
          </p>
        )}
      </label>
      {error && (
        <div className="mt-3 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg border px-4 py-2 text-sm font-medium"
          disabled={submitting}
        >
          Abbrechen
        </button>
        <button
          onClick={handleSubmit}
          disabled={!valid || submitting}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {submitting ? "Sende..." : "Link generieren"}
        </button>
      </div>
    </Modal>
  );
}

// =============================================
// GenehmigungEndgModal — Unterzeichner waehlen
// =============================================

export function GenehmigungEndgModal({
  defaultUnterzeichner,
  onClose,
  onSubmit,
}: {
  /** Vorschlag aus Mandanten-Config (z.B. "Dr. Hans Meier") */
  defaultUnterzeichner?: string;
  onClose: () => void;
  onSubmit: (unterzeichner: string) => Promise<void> | void;
}) {
  const [unterzeichner, setUnterzeichner] = useState(defaultUnterzeichner ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = unterzeichner.trim().length >= 1;

  async function handleSubmit() {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(unterzeichner.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler bei endgültiger Genehmigung");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      titel="Endgültige Genehmigung"
      beschreibung="Der Unterzeichner erscheint im PDF-Bescheid als unterschreibende Person der Geschaeftsfuehrung."
      onClose={onClose}
    >
      <label className="mt-4 block">
        <span className="mb-1 block text-xs font-medium">
          Name des Unterzeichners
        </span>
        <input
          type="text"
          value={unterzeichner}
          autoFocus
          onChange={(e) => setUnterzeichner(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm"
          placeholder="z.B. Dr. Hans Meier"
        />
        {defaultUnterzeichner && (
          <p className="mt-1 text-xs text-muted-foreground">
            Vorschlag aus Mandanten-Konfiguration uebernommen — kann ueberschrieben werden.
          </p>
        )}
      </label>
      {error && (
        <div className="mt-3 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg border px-4 py-2 text-sm font-medium"
          disabled={submitting}
        >
          Abbrechen
        </button>
        <button
          onClick={handleSubmit}
          disabled={!valid || submitting}
          className="rounded-lg bg-credo-gruen px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Sende..." : "Endgültig genehmigen"}
        </button>
      </div>
    </Modal>
  );
}

// =============================================
// AGBescheinigungModal — 4 strukturierte Felder
// =============================================

export interface AGBescheinigungData {
  brutto12Monate: string;
  arbeitszeitWochenstunden: number | null;
  beschaeftigtSeit: string | null;
  geburtsdatum: string | null;
}

export function AGBescheinigungModal({
  defaultGeburtsdatum,
  onClose,
  onSubmit,
}: {
  defaultGeburtsdatum?: string | null;
  onClose: () => void;
  onSubmit: (data: AGBescheinigungData) => Promise<void> | void;
}) {
  const [brutto, setBrutto] = useState("");
  const [wstd, setWstd] = useState("");
  const [seit, setSeit] = useState("");
  const [gebDat, setGebDat] = useState(defaultGeburtsdatum ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const datumOk = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const valid =
    brutto.trim().length > 0 &&
    (wstd === "" || (Number(wstd) >= 0 && Number(wstd) <= 80)) &&
    (seit === "" || datumOk(seit)) &&
    (gebDat === "" || datumOk(gebDat));

  async function handleSubmit() {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        brutto12Monate: brutto.trim(),
        arbeitszeitWochenstunden: wstd === "" ? null : Number(wstd),
        beschaeftigtSeit: seit === "" ? null : seit,
        geburtsdatum: gebDat === "" ? null : gebDat,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler bei AG-Bescheinigung");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      titel="Arbeitgeberbescheinigung Elterngeld"
      beschreibung="Die Daten werden im PDF an die Elterngeldstelle uebergeben. Quelle: LOGA."
      onClose={onClose}
    >
      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium">
            Brutto-Entgelt der letzten 12 Monate
          </span>
          <input
            type="text"
            value={brutto}
            autoFocus
            onChange={(e) => setBrutto(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm"
            placeholder="z.B. 27.500,00 EUR"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium">
            Arbeitszeit (Wochenstunden, optional)
          </span>
          <input
            type="number"
            step="0.1"
            min={0}
            max={80}
            value={wstd}
            onChange={(e) => setWstd(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm"
            placeholder="z.B. 25.5"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium">
            Beschaeftigt seit (optional)
          </span>
          <input
            type="date"
            value={seit}
            onChange={(e) => setSeit(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium">
            Geburtsdatum Mitarbeiter (optional)
          </span>
          <input
            type="date"
            value={gebDat}
            onChange={(e) => setGebDat(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm"
          />
        </label>
      </div>
      {error && (
        <div className="mt-3 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg border px-4 py-2 text-sm font-medium"
          disabled={submitting}
        >
          Abbrechen
        </button>
        <button
          onClick={handleSubmit}
          disabled={!valid || submitting}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {submitting ? "Generiere..." : "PDF generieren"}
        </button>
      </div>
    </Modal>
  );
}

// =============================================
// ConfirmDeleteModal — Generische Löschen-Bestaetigung
// =============================================

export function ConfirmDeleteModal({
  titel = "Wirklich löschen?",
  beschreibung,
  bestaetigungsText = "Löschen",
  onClose,
  onConfirm,
}: {
  titel?: string;
  beschreibung?: string;
  bestaetigungsText?: string;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Löschen fehlgeschlagen");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      titel={titel}
      beschreibung={beschreibung ?? "Diese Aktion kann nicht rueckgaengig gemacht werden."}
      onClose={onClose}
    >
      {error && (
        <div className="mt-4 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border px-4 py-2 text-sm font-medium"
          disabled={submitting}
        >
          Abbrechen
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting}
          className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground disabled:opacity-50"
        >
          {submitting ? "Loesche..." : bestaetigungsText}
        </button>
      </div>
    </Modal>
  );
}
