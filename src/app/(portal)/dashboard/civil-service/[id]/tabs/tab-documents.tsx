"use client";

import { useState } from "react";
import { CIVIL_SERVICE_DOC_TYPES } from "@/lib/constants";
import type { DocumentData, AssessmentData } from "../types";
import { formatDate, formatFileSize } from "../helpers";
import { UploadIcon, DownloadIcon } from "../icons";
import { TemplateGenerationSection } from "@/components/template-generation-section";

// =============================================
// PDF Export Sektion
// =============================================

function ExportSection({ processId, assessments }: { processId: string; assessments: AssessmentData[] }) {
  const [downloading, setDownloading] = useState<string | null>(null);

  const handleDownload = async (type: string, nr?: number) => {
    const key = nr ? `${type}_${nr}` : type;
    setDownloading(key);
    try {
      const params = new URLSearchParams({ type });
      if (nr) params.set("nr", String(nr));
      const res = await fetch(`/api/civil-service/${processId}/export?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Export fehlgeschlagen" }));
        alert(err.error || "Export fehlgeschlagen");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") || `${type}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("Verbindungsfehler beim Export.");
    } finally {
      setDownloading(null);
    }
  };

  const beurteilungen = assessments.filter((a) => a.assessmentType === "BEURTEILUNG");
  const referenzen = assessments.filter((a) => a.assessmentType === "REFERENZ");

  return (
    <div className="rounded-2xl border-2 border-credo-blau/20 bg-credo-blau/5 p-5 mb-6">
      <h3 className="text-sm font-bold text-foreground mb-1 flex items-center gap-2">
        <svg className="h-5 w-5 text-credo-blau" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        PDF-Export für DMS
      </h3>
      <p className="text-xs text-muted-foreground mb-4">
        Jedes Dokument erhält einen QR-Code auf der Deckseite zur automatischen DMS-Zuordnung.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {/* Gesamtakte */}
        <ExportCard
          title="Gesamtakte"
          description="Alle Dokumente in einem PDF"
          icon="full"
          isDownloading={downloading === "gesamtakte"}
          onDownload={() => handleDownload("gesamtakte")}
        />

        {/* Antrag */}
        <ExportCard
          title="Antrag"
          description="Voraussetzungen + Erklärung"
          icon="doc"
          isDownloading={downloading === "antrag"}
          onDownload={() => handleDownload("antrag")}
        />

        {/* Checkliste */}
        <ExportCard
          title="Checkliste"
          description="62 Punkte mit Notizen"
          icon="list"
          isDownloading={downloading === "checkliste"}
          onDownload={() => handleDownload("checkliste")}
        />

        {/* Beurteilungen */}
        {[1, 2, 3].map((nr) => {
          const exists = beurteilungen.find((a) => a.assessmentNumber === nr);
          return (
            <ExportCard
              key={`beurteilung_${nr}`}
              title={`${nr}. Beurteilung`}
              description={exists?.submittedAt ? `Eingereicht ${formatDate(exists.submittedAt)}` : "Nicht eingereicht"}
              icon="grade"
              isDownloading={downloading === `beurteilung_${nr}`}
              onDownload={() => handleDownload("beurteilung", nr)}
              disabled={!exists}
            />
          );
        })}

        {/* Referenzen */}
        {[1, 2].map((nr) => {
          const exists = referenzen.find((a) => a.assessmentNumber === nr);
          return (
            <ExportCard
              key={`referenz_${nr}`}
              title={`${nr}. Referenz`}
              description={exists?.submittedAt ? `Eingereicht ${formatDate(exists.submittedAt)}` : "Nicht eingereicht"}
              icon="ref"
              isDownloading={downloading === `referenz_${nr}`}
              onDownload={() => handleDownload("referenz", nr)}
              disabled={!exists}
            />
          );
        })}
      </div>
    </div>
  );
}

function ExportCard({
  title,
  description,
  icon,
  isDownloading,
  onDownload,
  disabled,
}: {
  title: string;
  description: string;
  icon: string;
  isDownloading: boolean;
  onDownload: () => void;
  disabled?: boolean;
}) {
  const iconMap: Record<string, string> = {
    full: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    doc: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    list: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
    grade: "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z",
    ref: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z",
  };

  return (
    <div className={`rounded-xl border bg-card p-4 transition-colors ${disabled ? "opacity-40" : "border-border"}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-credo-blau/10">
          <svg className="h-5 w-5 text-credo-blau" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={iconMap[icon] || iconMap.doc} />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-[11px] text-muted-foreground">{description}</p>
        </div>
      </div>
      <button
        onClick={onDownload}
        disabled={isDownloading || disabled}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {isDownloading ? (
          <>
            <div className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />
            Wird erstellt...
          </>
        ) : (
          <>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            PDF herunterladen
          </>
        )}
      </button>
    </div>
  );
}

// =============================================
// Hauptkomponente
// =============================================

export function TabDocuments({
  documents,
  uploadingDoc,
  uploadDocType,
  setUploadDocType,
  fileInputRef,
  onUpload,
  processId,
  assessments,
  organizationId,
  canEdit,
}: {
  documents: DocumentData[];
  uploadingDoc: boolean;
  uploadDocType: string;
  setUploadDocType: (t: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onUpload: (file: File, type: string) => void;
  processId: string;
  assessments?: AssessmentData[];
  organizationId: string;
  /** Darf die angemeldete Person Dokumente erzeugen? */
  canEdit: boolean;
}) {
  const docTypeEntries = Object.entries(CIVIL_SERVICE_DOC_TYPES);

  const getDocStatus = (type: string) => {
    const doc = documents.find((d) => d.type === type);
    if (!doc)
      return { status: "missing" as const, label: "Ausstehend", color: "text-gray-400", bgColor: "bg-gray-50" };
    if (doc.expiresAt && new Date(doc.expiresAt) < new Date()) {
      return { status: "expired" as const, label: "Abgelaufen", color: "text-orange-600", bgColor: "bg-orange-50" };
    }
    return { status: "uploaded" as const, label: "Vorhanden", color: "text-credo-gruen", bgColor: "bg-credo-gruen/5" };
  };

  const getDocFile = (type: string) => documents.find((d) => d.type === type);

  return (
    <div>
      {/* Dokumente aus Vorlagen erzeugen. Reihenfolge wie im Dokumente-Hub des
          Onboardings: erst erstellen, dann exportieren, dann hochladen. */}
      <div className="mb-6">
        <TemplateGenerationSection
          modul="VERBEAMTUNG"
          refId={processId}
          organizationId={organizationId}
          canEdit={canEdit}
          emptyHint="Keine Verbeamtungs-Vorlagen hinterlegt. Vorlagen legen Sie unter „Brief-Vorlagen“ (Modul Verbeamtung) an."
        />
      </div>

      {/* PDF Export Sektion */}
      <ExportSection processId={processId} assessments={assessments || []} />

      {/* Dokument-Upload Sektion */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && uploadDocType) onUpload(file, uploadDocType);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {docTypeEntries.map(([typeKey, typeLabel]) => {
          const ds = getDocStatus(typeKey);
          const docFile = getDocFile(typeKey);
          const isAmtsarzt = typeKey.startsWith("AMTSARZT");

          return (
            <div
              key={typeKey}
              className={`rounded-2xl border border-gray-100 p-4 shadow-sm transition-colors ${ds.bgColor}`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h4 className="text-sm font-medium text-gray-800 leading-tight">{typeLabel}</h4>
                <span className={`shrink-0 text-xs font-semibold ${ds.color}`}>
                  {ds.status === "missing" ? "\u25A1" : ds.status === "expired" ? "\u26A0" : "\u2713"}{" "}
                  {ds.label}
                </span>
              </div>

              {docFile && (
                <div className="mb-2 text-xs text-gray-500">
                  <p className="truncate">{docFile.fileName}</p>
                  <p>{formatFileSize(docFile.fileSize)} &middot; {formatDate(docFile.uploadedAt)}</p>
                </div>
              )}

              {isAmtsarzt && ds.status === "expired" && (
                <div className="mb-2 rounded-lg bg-orange-100 px-2 py-1 text-[10px] font-medium text-orange-700">
                  Amtsaerztliches Zeugnis ist abgelaufen. Neues Zeugnis erforderlich.
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setUploadDocType(typeKey);
                    fileInputRef.current?.click();
                  }}
                  disabled={uploadingDoc}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 min-h-[36px]"
                >
                  <UploadIcon className="h-3.5 w-3.5" />
                  {uploadingDoc && uploadDocType === typeKey ? "..." : "Hochladen"}
                </button>

                {docFile && (
                  <a
                    href={`/api/civil-service/${processId}/documents/${docFile.id}`}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors min-h-[36px]"
                    download
                  >
                    <DownloadIcon className="h-3.5 w-3.5" />
                    Laden
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
