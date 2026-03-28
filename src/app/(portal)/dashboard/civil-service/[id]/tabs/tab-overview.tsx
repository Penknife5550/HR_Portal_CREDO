"use client";

import { useState, useMemo } from "react";
import {
  CIVIL_SERVICE_STATUS_LABELS,
  CIVIL_SERVICE_ASSIGNEE_LABELS,
} from "@/lib/constants";
import type { CivilServiceData, ChecklistItem, AssessmentData } from "../types";
import { ASSIGNEE_COLORS } from "../types";
import { formatDate } from "../helpers";

// =============================================
// Magic Link status helpers
// =============================================

interface LinkStatus {
  label: string;
  colorClass: string;
  dotClass: string;
}

function getApplicationLinkStatus(
  token: string | null,
  submittedAt: string | null
): LinkStatus {
  if (token && submittedAt) {
    return {
      label: "Eingereicht",
      colorClass: "bg-credo-gruen/10 text-credo-gruen",
      dotClass: "bg-credo-gruen",
    };
  }
  if (token) {
    return {
      label: "Erstellt",
      colorClass: "bg-credo-blau/10 text-credo-blau",
      dotClass: "bg-credo-blau",
    };
  }
  return {
    label: "Nicht erstellt",
    colorClass: "bg-gray-100 text-gray-500",
    dotClass: "bg-gray-300",
  };
}

function getAssessmentLinkStatus(assessment: AssessmentData): LinkStatus {
  if (assessment.submittedAt) {
    return {
      label: "Eingereicht",
      colorClass: "bg-credo-gruen/10 text-credo-gruen",
      dotClass: "bg-credo-gruen",
    };
  }
  if (assessment.firstOpenedAt) {
    const count = assessment.openCount || 1;
    return {
      label: `Geöffnet (${count}x)`,
      colorClass: "bg-credo-gelb/10 text-credo-gelb",
      dotClass: "bg-credo-gelb",
    };
  }
  if (assessment.sentAt) {
    return {
      label: "Gesendet",
      colorClass: "bg-credo-blau/10 text-credo-blau",
      dotClass: "bg-credo-blau",
    };
  }
  return {
    label: "Nicht erstellt",
    colorClass: "bg-gray-100 text-gray-500",
    dotClass: "bg-gray-300",
  };
}

function getAssessmentTypeLabel(assessment: AssessmentData): string {
  const num = assessment.assessmentNumber;
  if (assessment.assessmentType === "REFERENZ") {
    return `${num}. Referenz`;
  }
  return `${num}. Beurteilung`;
}

// =============================================
// Expected link rows: application + 3 beurteilungen + 2 referenzen
// =============================================

interface MagicLinkRow {
  key: string;
  typeLabel: string;
  recipientLabel: string;
  recipientEmail: string | null;
  status: LinkStatus;
  token: string | null;
  assessment: AssessmentData | null;
  isApplication: boolean;
}

function buildMagicLinkRows(data: CivilServiceData): MagicLinkRow[] {
  const rows: MagicLinkRow[] = [];

  // 1) Application link
  const appStatus = getApplicationLinkStatus(
    data.applicationToken,
    data.applicationSubmittedAt
  );
  rows.push({
    key: "application",
    typeLabel: "Antragsformular",
    recipientLabel: "Lehrkraft",
    recipientEmail: data.employeeEmail,
    status: appStatus,
    token: data.applicationToken,
    assessment: null,
    isApplication: true,
  });

  // 2) Build from assessments
  const expectedSlots: { type: string; number: number; label: string }[] = [
    { type: "BEURTEILUNG", number: 1, label: "1. Beurteilung" },
    { type: "REFERENZ", number: 1, label: "1. Referenz" },
    { type: "BEURTEILUNG", number: 2, label: "2. Beurteilung" },
    { type: "REFERENZ", number: 2, label: "2. Referenz" },
    { type: "BEURTEILUNG", number: 3, label: "3. Beurteilung" },
  ];

  for (const slot of expectedSlots) {
    const found = data.assessments?.find(
      (a) => a.assessmentType === slot.type && a.assessmentNumber === slot.number
    );

    if (found) {
      const status = getAssessmentLinkStatus(found);
      rows.push({
        key: `${slot.type}-${slot.number}`,
        typeLabel: getAssessmentTypeLabel(found),
        recipientLabel: "Schulleitung",
        recipientEmail: found.recipientEmail || found.supervisorEmail || null,
        status,
        token: found.token,
        assessment: found,
        isApplication: false,
      });
    } else {
      rows.push({
        key: `${slot.type}-${slot.number}`,
        typeLabel: slot.label,
        recipientLabel: "Schulleitung",
        recipientEmail: null,
        status: {
          label: "Nicht erstellt",
          colorClass: "bg-gray-100 text-gray-500",
          dotClass: "bg-gray-300",
        },
        token: null,
        assessment: null,
        isApplication: false,
      });
    }
  }

  return rows;
}

// =============================================
// Component
// =============================================

export function TabOverview({
  data,
  openGatekeepers,
  overdueItems,
}: {
  data: CivilServiceData;
  openGatekeepers: ChecklistItem[];
  overdueItems: ChecklistItem[];
}) {
  const [sendingLink, setSendingLink] = useState(false);
  const [creatingAssessment, setCreatingAssessment] = useState<string | null>(null);
  const [applicationToken, setApplicationToken] = useState<string | null>(data.applicationToken || null);
  const [localAssessments, setLocalAssessments] = useState<AssessmentData[]>(data.assessments || []);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [slEmail, setSlEmail] = useState("");

  const magicLinkRows = useMemo(() => {
    const localData = { ...data, applicationToken, assessments: localAssessments };
    return buildMagicLinkRows(localData);
  }, [data, applicationToken, localAssessments]);

  const handleCreateAssessment = async (assessmentType: string, assessmentNumber: number) => {
    const key = `${assessmentType}-${assessmentNumber}`;
    if (!slEmail.trim()) {
      setLinkError("Bitte E-Mail der Schulleitung eingeben.");
      return;
    }
    setCreatingAssessment(key);
    setLinkError(null);
    try {
      const res = await fetch(`/api/civil-service/${data.id}/assessments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentNumber, assessmentType, recipientEmail: slEmail.trim() }),
      });
      if (res.ok) {
        const result = await res.json();
        const newAssessment = result.data || result;
        setLocalAssessments(prev => [...prev, newAssessment]);
        // Sofort kopieren
        const url = `${window.location.origin}/civil-service-assessment/${newAssessment.token}`;
        await navigator.clipboard.writeText(url);
        setCopiedLink(key);
        setTimeout(() => setCopiedLink(null), 3000);
      } else {
        const err = await res.json();
        setLinkError(err.error || "Link konnte nicht erstellt werden.");
      }
    } catch {
      setLinkError("Verbindungsfehler.");
    } finally {
      setCreatingAssessment(null);
    }
  };

  const handleSendApplicationLink = async () => {
    setSendingLink(true);
    setLinkError(null);
    try {
      const res = await fetch(`/api/civil-service/${data.id}/application`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientEmail: data.employeeEmail, recipientName: `${data.employeeFirstName} ${data.employeeLastName}` }),
      });
      if (res.ok) {
        const result = await res.json();
        const token = result.data?.token || result.token;
        setApplicationToken(token);
        const url = `${window.location.origin}/civil-service-application/${token}`;
        await navigator.clipboard.writeText(url);
        setCopiedLink("application");
        setTimeout(() => setCopiedLink(null), 3000);
      } else {
        const err = await res.json();
        setLinkError(err.error || "Link konnte nicht erstellt werden.");
      }
    } catch {
      setLinkError("Verbindungsfehler.");
    } finally {
      setSendingLink(false);
    }
  };

  const handleCopy = async (url: string, key: string) => {
    await navigator.clipboard.writeText(url);
    setCopiedLink(key);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const buildUrl = (row: MagicLinkRow): string | null => {
    if (!row.token || typeof window === "undefined") return null;
    if (row.isApplication) {
      return `${window.location.origin}/civil-service-application/${row.token}`;
    }
    return `${window.location.origin}/civil-service-assessment/${row.token}`;
  };

  return (
    <div className="space-y-5">
      {/* Magic Links — Full Tracking Section */}
      <div className="rounded-2xl border border-credo-blau/20 bg-credo-blau/5 p-5">
        <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
          <svg className="h-5 w-5 text-credo-blau" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          Magic Links
        </h3>

        {/* SL E-Mail für Beurteilungen */}
        <div className="mb-3 flex items-center gap-3">
          <label className="text-xs font-medium text-foreground shrink-0">E-Mail Schulleitung:</label>
          <input autoComplete="off"
            type="email"
            value={slEmail}
            onChange={(e) => setSlEmail(e.target.value)}
            placeholder="schulleitung@schule.de"
            className="flex-1 rounded-lg border border-input bg-background px-3 py-1.5 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
        </div>

        {linkError && (
          <div className="mb-3 rounded-lg bg-credo-rot/10 px-3 py-2 text-xs text-credo-rot">{linkError}</div>
        )}

        <div className="space-y-2">
          {magicLinkRows.map((row, idx) => {
            const url = buildUrl(row);
            const isLast = idx === magicLinkRows.length - 1;

            return (
              <div
                key={row.key}
                className={`flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 ${
                  !isLast ? "" : ""
                }`}
              >
                {/* Left: type + recipient */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-foreground">
                      {row.typeLabel}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      ({row.recipientLabel})
                    </span>
                  </div>
                  {row.recipientEmail && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {row.recipientEmail}
                    </p>
                  )}
                </div>

                {/* Middle: status badge */}
                <div className="flex items-center gap-3 shrink-0 ml-3">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${row.status.colorClass}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${row.status.dotClass}`} />
                    {row.status.label}
                  </span>

                  {/* Action button: copy or create */}
                  {url ? (
                    <button
                      onClick={() => handleCopy(url, row.key)}
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      title={url}
                    >
                      {copiedLink === row.key ? (
                        <span className="text-credo-gruen">Kopiert!</span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Link kopieren
                        </span>
                      )}
                    </button>
                  ) : row.isApplication ? (
                    <button
                      onClick={handleSendApplicationLink}
                      disabled={sendingLink}
                      className="rounded-md bg-credo-blau px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-credo-blau/85 disabled:opacity-50"
                    >
                      {sendingLink ? "Wird erstellt..." : "Erstellen"}
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        const type = row.key.split("-")[0];
                        const num = parseInt(row.key.split("-")[1]);
                        handleCreateAssessment(type, num);
                      }}
                      disabled={creatingAssessment === row.key || !slEmail.trim()}
                      className="rounded-md bg-credo-blau px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-credo-blau/85 disabled:opacity-50"
                    >
                      {creatingAssessment === row.key ? "..." : "Erstellen & kopieren"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
      {/* Nächste Aktionen */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-credo-gelb/10 text-credo-gelb text-xs">
            !
          </span>
          Nächste Aktionen
        </h3>
        {openGatekeepers.length === 0 ? (
          <p className="text-sm text-gray-400">Keine offenen Gatekeeper-Aufgaben.</p>
        ) : (
          <ul className="space-y-2">
            {openGatekeepers.slice(0, 6).map((item) => (
              <li key={item.id} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 text-credo-gelb">&#9679;</span>
                <div>
                  <span className="font-medium text-gray-800">{item.title}</span>
                  <span
                    className={`ml-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      ASSIGNEE_COLORS[item.assignee] || "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {CIVIL_SERVICE_ASSIGNEE_LABELS[item.assignee] || item.assignee}
                  </span>
                </div>
              </li>
            ))}
            {openGatekeepers.length > 6 && (
              <li className="text-xs text-gray-400">
                +{openGatekeepers.length - 6} weitere
              </li>
            )}
          </ul>
        )}
      </div>

      {/* Fristen */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-credo-rot/10 text-credo-rot text-xs">
            &#8986;
          </span>
          Fristen
        </h3>
        {overdueItems.length > 0 ? (
          <div className="mb-3 rounded-lg bg-credo-rot/5 border border-credo-rot/20 p-3">
            <p className="text-xs font-semibold text-credo-rot mb-1">
              {overdueItems.length} überfällige Aufgabe{overdueItems.length > 1 ? "n" : ""}
            </p>
            {overdueItems.slice(0, 3).map((item) => (
              <p key={item.id} className="text-xs text-credo-rot/80">
                {item.title} (Fällig: {formatDate(item.dueDate)})
              </p>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 mb-3">Keine überfälligen Aufgaben.</p>
        )}
        <div className="space-y-2 text-sm">
          {data.probationStartDate && (
            <div className="flex justify-between">
              <span className="text-gray-500">Probezeitbeginn</span>
              <span className="font-medium text-gray-800">{formatDate(data.probationStartDate)}</span>
            </div>
          )}
          {data.probationEndDate && (
            <div className="flex justify-between">
              <span className="text-gray-500">Probezeitende</span>
              <span className="font-medium text-gray-800">{formatDate(data.probationEndDate)}</span>
            </div>
          )}
          {data.lifetimeDate && (
            <div className="flex justify-between">
              <span className="text-gray-500">Übernahme Lebenszeit</span>
              <span className="font-medium text-gray-800">{formatDate(data.lifetimeDate)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Voraussetzungen */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-credo-blau/10 text-credo-blau text-xs">
            &#10003;
          </span>
          Voraussetzungen
        </h3>
        {!data.prerequisites || !Array.isArray(data.prerequisites) || data.prerequisites.length === 0 ? (
          <p className="text-sm text-gray-400">Noch nicht ausgefüllt — Antragsformular an Lehrkraft senden.</p>
        ) : (
          <ul className="space-y-1.5">
            {data.prerequisites.map((p: { key: string; label: string; met: boolean }) => (
              <li key={p.key} className="flex items-center gap-2 text-sm">
                <span className={p.met ? "text-credo-gruen" : "text-credo-rot"}>
                  {p.met ? "\u2713" : "\u2717"}
                </span>
                <span className={p.met ? "text-gray-600" : "text-gray-800 font-medium"}>
                  {p.label}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Beiratsentscheidungen */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-100 text-purple-700 text-xs">
            &#9733;
          </span>
          Beiratsentscheidungen
        </h3>
        {data.boardDecisions.length === 0 ? (
          <p className="text-sm text-gray-400">Noch keine Entscheidungen dokumentiert.</p>
        ) : (
          <ul className="space-y-2">
            {data.boardDecisions.map((d) => (
              <li key={d.id} className="flex items-start justify-between text-sm">
                <div>
                  <span className="font-medium text-gray-800">{d.decisionType}</span>
                  {d.notes && <p className="text-xs text-gray-400 mt-0.5">{d.notes}</p>}
                </div>
                <div className="text-right">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      d.result === "APPROVED"
                        ? "bg-credo-gruen/10 text-credo-gruen"
                        : d.result === "REJECTED"
                        ? "bg-credo-rot/10 text-credo-rot"
                        : "bg-credo-gelb/10 text-credo-gelb"
                    }`}
                  >
                    {d.result === "APPROVED"
                      ? "Genehmigt"
                      : d.result === "REJECTED"
                      ? "Abgelehnt"
                      : "Aufgeschoben"}
                  </span>
                  <p className="text-[10px] text-gray-400 mt-0.5">{formatDate(d.date)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Mitarbeiter-Info */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm md:col-span-2">
        <h3 className="text-sm font-bold text-gray-900 mb-3">Mitarbeiterinformationen</h3>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <span className="text-gray-400">Name</span>
            <p className="font-medium text-gray-800">
              {data.employeeFirstName} {data.employeeLastName}
            </p>
          </div>
          <div>
            <span className="text-gray-400">E-Mail</span>
            <p className="font-medium text-gray-800">{data.employeeEmail}</p>
          </div>
          <div>
            <span className="text-gray-400">Schule</span>
            <p className="font-medium text-gray-800">{data.organizationName}</p>
          </div>
          <div>
            <span className="text-gray-400">Antrag-ID</span>
            <p className="font-medium text-credo-blau">{data.displayId}</p>
          </div>
          <div>
            <span className="text-gray-400">Startdatum</span>
            <p className="font-medium text-gray-800">{formatDate(data.startDate)}</p>
          </div>
          <div>
            <span className="text-gray-400">Status</span>
            <p className="font-medium text-gray-800">
              {CIVIL_SERVICE_STATUS_LABELS[data.status]?.label || data.status}
            </p>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
