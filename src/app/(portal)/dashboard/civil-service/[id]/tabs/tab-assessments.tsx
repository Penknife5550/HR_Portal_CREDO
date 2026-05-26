"use client";

import { useEffect, useState } from "react";
import type { AssessmentData } from "../types";
import { formatDate } from "../helpers";
import { CopyIcon } from "../icons";
import { AssessmentDetailModal } from "../components/assessment-detail-modal";
import { ReleaseLinkModal } from "../components/release-link-modal";
import { BeurteilungStatusStepper } from "@/components/beurteilung-status-stepper";
import { deriveBeurteilungStatus } from "@/lib/beurteilung-status";

interface TemplateOption {
  id: string;
  name: string;
  scaleType: string;
  isDefault: boolean;
  organizationId: string | null;
}

export function TabAssessments({
  assessments,
  employeeName,
  copiedId,
  onCopyLink,
  processId,
  onReload,
  setActionError,
  setActionSuccess,
}: {
  assessments: AssessmentData[];
  employeeName: string;
  copiedId: string | null;
  onCopyLink: (token: string, id: string) => void;
  processId: string;
  onReload: () => Promise<void>;
  setActionError: (msg: string) => void;
  setActionSuccess: (msg: string) => void;
}) {
  const [requestModal, setRequestModal] = useState<{
    open: boolean;
    assessmentNumber: number | null;
  }>({ open: false, assessmentNumber: null });

  const [detailAssessment, setDetailAssessment] =
    useState<AssessmentData | null>(null);

  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [releaseModal, setReleaseModal] = useState<{
    ackLink: string;
    expiresAt: string;
  } | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  // =============================================
  // Bekanntgabe an Lehrkraft (Phase 5)
  // Erzeugt einen separaten Magic-Link und oeffnet ein Modal, das den
  // Lehrkraft-Link explizit anzeigt — verhindert Verwechslung mit dem
  // SL-Magic-Link.
  //
  // Path-Param ist der SL-Token (nicht die Assessment-ID), um konsistent
  // mit den anderen [token]-Routen zu bleiben.
  // =============================================
  const handleReleaseToEmployee = async (
    assessmentId: string,
    slToken: string,
  ) => {
    setReleasingId(assessmentId);
    try {
      const res = await fetch(
        `/api/civil-service-assessment/${slToken}/release-to-employee`,
        { method: "POST" },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          json.error || "Bekanntgabe-Link konnte nicht erstellt werden.",
        );
      }
      const json = await res.json();
      const ackLink = json.data?.ackLink;
      const expiresAt = json.data?.tokenExpiresAt;
      if (ackLink && expiresAt) {
        setReleaseModal({ ackLink, expiresAt });
      }
      await onReload();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Verbindungsfehler.",
      );
    } finally {
      setReleasingId(null);
    }
  };

  // =============================================
  // Archivieren / In Personalakte aufnehmen (Schritt 9 — COMPLETED)
  // Vorbedingung: Lehrkraft hat quittiert.
  // =============================================
  const handleArchive = async (assessmentId: string, slToken: string) => {
    if (
      !window.confirm(
        "Diese Beurteilung jetzt formal in die Personalakte aufnehmen? Nach der Archivierung ist sie eingefroren und kann nicht mehr verändert werden.",
      )
    )
      return;

    setArchivingId(assessmentId);
    try {
      const res = await fetch(
        `/api/civil-service-assessment/${slToken}/archive`,
        { method: "POST" },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          json.error || "Archivierung fehlgeschlagen.",
        );
      }
      setActionSuccess(
        "Beurteilung in Personalakte aufgenommen — Workflow abgeschlossen.",
      );
      await onReload();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Verbindungsfehler.",
      );
    } finally {
      setArchivingId(null);
    }
  };

  const ASSESSMENT_LABELS = [
    "1. Unterrichtsbesuch",
    "2. Unterrichtsbesuch",
    "3. Unterrichtsbesuch",
  ];

  const statusBadge = (status: string) => {
    switch (status) {
      case "SUBMITTED":
        return { label: "Eingereicht", color: "bg-credo-gruen/10 text-credo-gruen" };
      case "PENDING":
        return { label: "Ausstehend", color: "bg-credo-gelb/10 text-credo-gelb" };
      case "SENT":
        return { label: "Link versendet", color: "bg-credo-blau/10 text-credo-blau" };
      default:
        return { label: status, color: "bg-gray-100 text-gray-600" };
    }
  };

  const openRequest = (assessmentNumber: number) => {
    setRequestModal({ open: true, assessmentNumber });
  };

  const closeRequest = () => {
    setRequestModal({ open: false, assessmentNumber: null });
  };

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {ASSESSMENT_LABELS.map((label, idx) => {
        const num = idx + 1;
        const assessment = assessments.find((a) => a.assessmentNumber === num);

        if (!assessment) {
          return (
            <div
              key={num}
              className="rounded-2xl border-2 border-dashed border-gray-200 bg-white p-6 flex flex-col items-center justify-center gap-3"
            >
              <span className="text-3xl text-gray-200">&#128203;</span>
              <span className="text-sm font-medium text-gray-500">{label}</span>
              <span className="text-xs text-gray-400">Noch nicht angefordert</span>
              <button
                onClick={() => openRequest(num)}
                className="mt-2 rounded-xl bg-credo-blau px-4 py-2 text-xs font-semibold text-white hover:bg-credo-blau/90 transition-colors min-h-[44px]"
              >
                Beurteilung anfordern
              </button>
            </div>
          );
        }

        // Status aus den vorhandenen Feldern ableiten (zentrale Helper)
        const status = deriveBeurteilungStatus({
          unbiasedConfirmed: assessment.unbiasedConfirmed,
          ratingsData: assessment.ratingsData,
          meetsRequirementsManual: assessment.meetsRequirementsManual,
          overallReasoning: assessment.overallReasoning,
          beurteilungsgespraechAt: assessment.beurteilungsgespraechAt,
          submittedAt: assessment.submittedAt,
          releasedToEmployeeAt: assessment.releasedToEmployeeAt,
          acknowledgedByEmployeeAt: assessment.acknowledgedByEmployeeAt,
          archivedAt: assessment.archivedAt,
          templateSnapshot: assessment.templateSnapshot,
        });
        const isArchived = Boolean(assessment.archivedAt);
        const isAcknowledged = Boolean(assessment.acknowledgedByEmployeeAt);

        // Legacy-Badge für "ist angekommen?"
        const sb = assessment.submittedAt
          ? statusBadge("SUBMITTED")
          : assessment.firstOpenedAt
            ? statusBadge("PENDING")
            : statusBadge("SENT");

        const grade = assessment.overallGrade;
        const hasGrade = typeof grade === "number" && !Number.isNaN(grade);
        const isSubmitted = Boolean(assessment.submittedAt);
        const hasAnyData =
          assessment.unbiasedConfirmed ||
          (assessment.ratingsData && Object.keys(assessment.ratingsData).length > 0) ||
          assessment.referenceData ||
          assessment.gemeindeReferenz;

        return (
          <div
            key={num}
            className={`rounded-2xl border bg-white p-5 shadow-sm ${
              isArchived
                ? "border-credo-gruen/40 ring-1 ring-credo-gruen/20"
                : "border-gray-100"
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-900">{label}</h3>
              {isArchived ? (
                <span className="rounded-full bg-credo-gruen/15 px-2.5 py-0.5 text-[10px] font-semibold text-credo-gruen">
                  ✓ In Personalakte
                </span>
              ) : (
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${sb.color}`}>
                  {sb.label}
                </span>
              )}
            </div>

            {/* Mini Status-Stepper */}
            <div className="mb-4">
              <BeurteilungStatusStepper status={status} variant="compact" />
            </div>

            <div className="space-y-2 text-sm">
              {assessment.recipientName && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Schulleitung</span>
                  <span className="text-gray-800 font-medium">{assessment.recipientName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-400">E-Mail</span>
                <span className="text-gray-800 text-right text-xs">
                  {assessment.recipientEmail}
                </span>
              </div>
              {assessment.scheduledDate && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Termin</span>
                  <span className="text-gray-800 text-right text-xs">
                    {formatDate(assessment.scheduledDate)}
                  </span>
                </div>
              )}
              {(assessment.fach || assessment.klasse) && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Fach/Klasse</span>
                  <span className="text-gray-800 text-right text-xs">
                    {[assessment.fach, assessment.klasse].filter(Boolean).join(" • ")}
                  </span>
                </div>
              )}
              {/* Manuelles Gesamturteil — wenn vergeben */}
              {assessment.meetsRequirementsManual !== null && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Gesamturteil</span>
                  <span
                    className={`font-semibold text-xs ${
                      assessment.meetsRequirementsManual
                        ? "text-credo-gruen"
                        : "text-credo-rot"
                    }`}
                  >
                    {assessment.meetsRequirementsManual
                      ? "✓ Erfüllt"
                      : "✗ Nicht erfüllt"}
                  </span>
                </div>
              )}
              {hasGrade && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Gesamt-Ø</span>
                  <span className="text-gray-800 font-bold">{grade!.toFixed(2)}</span>
                </div>
              )}
              {assessment.submittedAt && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Eingereicht</span>
                  <span className="text-gray-800">{formatDate(assessment.submittedAt)}</span>
                </div>
              )}
              {assessment.releasedToEmployeeAt &&
                !assessment.acknowledgedByEmployeeAt && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Bekanntgabe</span>
                      <span className="text-credo-blau text-xs font-semibold">
                        Wartet auf Quittung
                      </span>
                    </div>
                    {assessment.employeeAckToken && (
                      <BekanntgabeLinkBox
                        ackToken={assessment.employeeAckToken}
                      />
                    )}
                  </>
                )}
              {assessment.acknowledgedByEmployeeAt && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Quittiert</span>
                  <span className="text-credo-gruen text-xs font-semibold">
                    ✓ {formatDate(assessment.acknowledgedByEmployeeAt)}
                  </span>
                </div>
              )}
              {assessment.rebuttalText && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Gegenäußerung</span>
                  <span className="text-credo-gelb text-xs font-semibold">
                    Vorhanden
                  </span>
                </div>
              )}
              {assessment.archivedAt && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Archiviert</span>
                  <span className="text-credo-gruen text-xs font-semibold">
                    ✓ {formatDate(assessment.archivedAt)}
                  </span>
                </div>
              )}
            </div>

            {/* Aktions-Buttons */}
            <div className="mt-4 space-y-2">
              {(isSubmitted || hasAnyData) && (
                <button
                  onClick={() => setDetailAssessment(assessment)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-credo-blau px-3 py-2 text-xs font-semibold text-white hover:bg-credo-blau/90 transition-colors min-h-[44px]"
                >
                  Details ansehen
                </button>
              )}

              {/* Bekanntgabe-Buttons (nur für eingereichte BEURTEILUNG, vor Quittung) */}
              {isSubmitted &&
                assessment.assessmentType === "BEURTEILUNG" &&
                assessment.token &&
                !isAcknowledged && (
                  <button
                    onClick={() =>
                      handleReleaseToEmployee(assessment.id, assessment.token!)
                    }
                    disabled={releasingId === assessment.id}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-credo-blau bg-white px-3 py-2 text-xs font-semibold text-credo-blau hover:bg-credo-blau/5 transition-colors min-h-[44px] disabled:opacity-50"
                  >
                    {releasingId === assessment.id
                      ? "Wird erstellt…"
                      : assessment.releasedToEmployeeAt
                        ? "Bekanntgabe-Link erneut kopieren"
                        : "Zur Bekanntgabe an Lehrkraft senden"}
                  </button>
                )}

              {/* Archiv-Button — sichtbar wenn quittiert und noch nicht archiviert */}
              {isAcknowledged && !isArchived && assessment.token && (
                <button
                  onClick={() => handleArchive(assessment.id, assessment.token!)}
                  disabled={archivingId === assessment.id}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-credo-gruen px-3 py-2 text-xs font-semibold text-white hover:bg-credo-gruen/90 transition-colors min-h-[44px] disabled:opacity-50"
                >
                  {archivingId === assessment.id
                    ? "Wird übernommen…"
                    : "✓ In Personalakte aufnehmen"}
                </button>
              )}

              {assessment.token && !isSubmitted && (
                <button
                  onClick={() => onCopyLink(assessment.token!, assessment.id)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors min-h-[44px]"
                  title="Link für die Schulleitung — NICHT an die Lehrkraft weitergeben"
                >
                  <CopyIcon className="h-3.5 w-3.5" />
                  {copiedId === assessment.id
                    ? "Schulleitungs-Link kopiert!"
                    : "Schulleitungs-Link kopieren"}
                </button>
              )}

              {/* Audit-Link (Phase 6) — sichtbar für eingereichte Beurteilungen,
                  damit HR den Read-Only-Link an die Bezirksregierung weitergeben kann. */}
              {isSubmitted &&
                assessment.assessmentType === "BEURTEILUNG" &&
                assessment.verifyToken && (
                  <AuditLinkButton verifyToken={assessment.verifyToken} />
                )}
            </div>
          </div>
        );
      })}

      {requestModal.open && requestModal.assessmentNumber !== null && (
        <RequestAssessmentModal
          processId={processId}
          assessmentNumber={requestModal.assessmentNumber}
          onClose={closeRequest}
          onCreated={async () => {
            closeRequest();
            setActionSuccess("Beurteilung angefordert.");
            await onReload();
          }}
          onError={(msg) => setActionError(msg)}
        />
      )}

      {detailAssessment && (
        <AssessmentDetailModal
          assessment={detailAssessment}
          employeeName={employeeName}
          onClose={() => setDetailAssessment(null)}
        />
      )}

      {releaseModal && (
        <ReleaseLinkModal
          ackLink={releaseModal.ackLink}
          expiresAt={releaseModal.expiresAt}
          employeeName={employeeName}
          onClose={() => setReleaseModal(null)}
        />
      )}
    </div>
  );
}

// =============================================
// BekanntgabeLinkBox
// Zeigt den Bekanntgabe-Link direkt in der Karte an, sobald released.
// Verhindert die Verwechslung mit dem SL-Link aus dem Browser-Verlauf.
// =============================================
function BekanntgabeLinkBox({ ackToken }: { ackToken: string }) {
  const [copied, setCopied] = useState(false);
  const ackLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/civil-service-acknowledgement/${ackToken}`
      : `/civil-service-acknowledgement/${ackToken}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(ackLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback ignoriert
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-credo-blau/30 bg-credo-blau/5 p-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-credo-blau mb-1">
        Lehrkraft-Bekanntgabe-Link
      </p>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={ackLink}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 min-w-0 rounded border border-gray-200 bg-white px-2 py-1 text-[10px] font-mono text-gray-800 outline-none focus:border-credo-blau"
        />
        <button
          onClick={copy}
          className={`shrink-0 rounded px-2 py-1 text-[10px] font-bold transition-colors ${
            copied
              ? "bg-credo-gruen text-white"
              : "bg-credo-blau text-white hover:bg-credo-blau/90"
          }`}
          title="In die Zwischenablage kopieren"
        >
          {copied ? "✓" : "📋"}
        </button>
      </div>
    </div>
  );
}

// =============================================
// AuditLinkButton (Phase 6)
// Read-Only-Audit-Link für Bezirksregierung — kein Login noetig.
// Wird über den verifyToken konstruiert (separate UUID, nie identisch mit
// dem SL- oder Lehrkraft-Token).
// =============================================
function AuditLinkButton({ verifyToken }: { verifyToken: string }) {
  const [copied, setCopied] = useState(false);
  const auditLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/verify/civil-service-assessment/${verifyToken}`
      : `/verify/civil-service-assessment/${verifyToken}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(auditLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback ignoriert
    }
  }

  return (
    <button
      onClick={copy}
      className={`flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors min-h-[44px] ${
        copied
          ? "border-credo-gruen bg-credo-gruen/10 text-credo-gruen"
          : "border-credo-gruen/40 bg-white text-credo-gruen hover:bg-credo-gruen/5"
      }`}
      title="Read-Only-Audit-Link für Bezirksregierung (kein Login noetig)"
    >
      <CopyIcon className="h-3.5 w-3.5" />
      {copied ? "Audit-Link kopiert!" : "Audit-Link kopieren"}
    </button>
  );
}

// =============================================
// Anforderungs-Modal
// Pflichtfelder: Typ, E-Mail SL
// Optional: Name SL, Termin, Fach, Klasse, Vorlage
// =============================================
function RequestAssessmentModal({
  processId,
  assessmentNumber,
  onClose,
  onCreated,
  onError,
}: {
  processId: string;
  assessmentNumber: number;
  onClose: () => void;
  onCreated: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [assessmentType, setAssessmentType] = useState<"BEURTEILUNG" | "REFERENZ">(
    "BEURTEILUNG",
  );
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [fach, setFach] = useState("");
  const [klasse, setKlasse] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [acknowledgeShortNotice, setAcknowledgeShortNotice] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // BRL Nr. 8.3 — Live-Berechnung der Tage bis zum Termin
  const daysUntil = scheduledDate
    ? Math.floor(
        (new Date(scheduledDate).getTime() - Date.now()) /
          (24 * 60 * 60 * 1000),
      )
    : null;
  const isShortNotice =
    assessmentType === "BEURTEILUNG" &&
    daysUntil !== null &&
    daysUntil < 14;

  // Vorlagen laden — nur für BEURTEILUNG noetig
  useEffect(() => {
    if (assessmentType !== "BEURTEILUNG") return;
    fetch("/api/beurteilung-templates?includeInactive=false")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.data)) setTemplates(d.data);
      })
      .catch(() => {
        // Fallback: Server-Default greift
      });
  }, [assessmentType]);

  // Override zuruecksetzen wenn Termin geaendert
  useEffect(() => {
    if (!isShortNotice) setAcknowledgeShortNotice(false);
  }, [isShortNotice]);

  async function handleSubmit() {
    if (!recipientEmail.trim()) {
      setLocalError("Bitte E-Mail der Schulleitung angeben.");
      return;
    }

    if (isShortNotice && !acknowledgeShortNotice) {
      setLocalError(
        "Termin liegt unter 14 Tagen. Bitte bestätigen Sie die Fristunterschreitung explizit.",
      );
      return;
    }

    try {
      setSubmitting(true);
      setLocalError(null);

      const body: Record<string, unknown> = {
        assessmentNumber,
        assessmentType,
        recipientEmail: recipientEmail.trim(),
        recipientName: recipientName.trim() || undefined,
      };

      if (assessmentType === "BEURTEILUNG") {
        if (templateId) body.templateId = templateId;
        if (scheduledDate) body.scheduledDate = new Date(scheduledDate).toISOString();
        if (fach.trim()) body.fach = fach.trim();
        if (klasse.trim()) body.klasse = klasse.trim();
        if (isShortNotice && acknowledgeShortNotice) {
          body.acknowledgeShortNotice = true;
        }
      }

      const res = await fetch(`/api/civil-service/${processId}/assessments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Beurteilung konnte nicht angefordert werden.");
      }

      await onCreated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Verbindungsfehler.";
      setLocalError(msg);
      onError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-gray-100 p-5">
          <h3 className="text-lg font-bold text-gray-900">
            {assessmentNumber}. Unterrichtsbesuch anfordern
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Die Schulleitung erhält einen Magic-Link zur digitalen Beurteilung.
          </p>
        </div>
        <div className="p-5 space-y-4">
          {localError && (
            <div className="rounded-lg border border-credo-rot/30 bg-credo-rot/10 p-3 text-sm text-credo-rot">
              {localError}
            </div>
          )}

          {/* Typ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Art der Beurteilung
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(["BEURTEILUNG", "REFERENZ"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setAssessmentType(t)}
                  className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                    assessmentType === t
                      ? "border-credo-blau bg-credo-blau/5 text-credo-blau"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {t === "BEURTEILUNG" ? "Beurteilung" : "Referenz"}
                </button>
              ))}
            </div>
          </div>

          {/* E-Mail SL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              E-Mail Schulleitung *
            </label>
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="schulleitung@beispiel-schule.de"
              className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:border-credo-blau focus:ring-1 focus:ring-credo-blau outline-none"
              autoComplete="off"
              autoFocus
            />
          </div>

          {/* Name SL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name der Schulleitung (optional)
            </label>
            <input
              type="text"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="z.B. Frau Schmidt"
              className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:border-credo-blau focus:ring-1 focus:ring-credo-blau outline-none"
              autoComplete="off"
            />
          </div>

          {/* BEURTEILUNG-spezifische Felder */}
          {assessmentType === "BEURTEILUNG" && (
            <>
              <div className="rounded-lg border border-credo-blau/20 bg-credo-blau/5 p-3 text-xs text-gray-600">
                <strong className="text-credo-blau">BRL Nr. 8.3</strong> — Unterrichtsbesuche
                sind mindestens 2 Wochen vorher anzukündigen. Der Termin kann hier
                vorgegeben werden, ist aber optional.
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Termin Unterrichtsbesuch (optional)
                </label>
                <input
                  type="datetime-local"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:border-credo-blau focus:ring-1 focus:ring-credo-blau outline-none"
                />
                {daysUntil !== null && (
                  <p
                    className={`mt-1 text-xs font-medium ${
                      isShortNotice ? "text-credo-rot" : "text-credo-gruen"
                    }`}
                  >
                    {daysUntil >= 0
                      ? `${daysUntil} Tage bis zum Termin`
                      : `Termin liegt ${Math.abs(daysUntil)} Tage in der Vergangenheit`}
                    {isShortNotice && " — unter BRL-Mindestfrist von 14 Tagen"}
                  </p>
                )}
              </div>

              {isShortNotice && (
                <div className="rounded-lg border border-credo-rot/30 bg-credo-rot/5 p-3">
                  <p className="text-xs text-credo-rot mb-2">
                    <strong>BRL Nr. 8.3:</strong> Unterrichtsbesuche sind
                    mindestens <strong>2 Wochen vorher</strong> anzukündigen. Mit
                    diesem kurzen Vorlauf könnte die Beurteilung später
                    angreifbar sein.
                  </p>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={acknowledgeShortNotice}
                      onChange={(e) =>
                        setAcknowledgeShortNotice(e.target.checked)
                      }
                      className="mt-0.5 h-4 w-4 rounded border-gray-300"
                    />
                    <span className="text-xs text-gray-700">
                      Ich bestätige bewusst, dass die 14-Tage-Frist
                      unterschritten wird (z. B. wegen außergewöhnlicher
                      Umstände).
                    </span>
                  </label>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fach
                  </label>
                  <input
                    type="text"
                    value={fach}
                    onChange={(e) => setFach(e.target.value)}
                    placeholder="z.B. Mathematik"
                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:border-credo-blau focus:ring-1 focus:ring-credo-blau outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Klasse / Lerngruppe
                  </label>
                  <input
                    type="text"
                    value={klasse}
                    onChange={(e) => setKlasse(e.target.value)}
                    placeholder="z.B. 7b"
                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:border-credo-blau focus:ring-1 focus:ring-credo-blau outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Beurteilungs-Vorlage
                </label>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:border-credo-blau focus:ring-1 focus:ring-credo-blau outline-none"
                >
                  <option value="">Standardvorlage des Mandanten</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.scaleType === "BRL_1_5" ? "BRL 1–5" : "Schulnoten 1–6"})
                      {t.isDefault ? " — Standard" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 p-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-lg bg-credo-blau px-4 py-2 text-sm font-semibold text-white hover:bg-credo-blau/90 disabled:opacity-50"
          >
            {submitting ? "Sende…" : "Anfordern"}
          </button>
        </div>
      </div>
    </div>
  );
}
