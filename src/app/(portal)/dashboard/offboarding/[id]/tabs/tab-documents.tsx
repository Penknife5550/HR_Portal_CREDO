"use client";

import React from "react";
import { OFFBOARDING_DOC_TYPE_LABELS } from "@/lib/constants";
import type { OffboardingData } from "../types";
import { formatDate, formatFileSize } from "../helpers";
import { DocumentIcon, UploadCloudIcon, DownloadIcon } from "../icons";

export function TabDocuments({
  data,
  offboardingId,
  docType,
  setDocType,
  uploadingDoc,
  fileInputRef,
  handleFileSelect,
  handleFileDrop,
  dragOver,
  setDragOver,
}: {
  data: OffboardingData;
  offboardingId: string;
  docType: string;
  setDocType: (v: string) => void;
  uploadingDoc: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleFileDrop: (e: React.DragEvent) => void;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
}) {
  const DOC_STATUS_LABELS: Record<string, { label: string; color: string }> = {
    UPLOADED: { label: "Hochgeladen", color: "bg-gray-100 text-gray-600" },
    REVIEWED: { label: "Geprüft", color: "bg-credo-blau/10 text-credo-blau" },
    APPROVED: { label: "Genehmigt", color: "bg-credo-gruen/10 text-credo-gruen" },
    REJECTED: { label: "Abgelehnt", color: "bg-credo-rot/10 text-credo-rot" },
  };

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <div
        className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragOver
            ? "border-credo-gruen bg-credo-gruen/5"
            : "border-border bg-card hover:border-credo-gruen/30"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleFileDrop}
      >
        <UploadCloudIcon className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
        <p className="mb-2 text-sm font-medium text-foreground">
          {uploadingDoc ? "Wird hochgeladen..." : "Datei hier ablegen oder auswählen"}
        </p>
        <div className="flex items-center justify-center gap-3">
          <select autoComplete="off"
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-credo-blau"
          >
            {Object.entries(OFFBOARDING_DOC_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingDoc}
            className="rounded-md bg-credo-gruen px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#5a9420] active:scale-95 disabled:opacity-50"
          >
            Datei auswählen
          </button>
          <input autoComplete="off"
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>
      </div>

      {/* Document List */}
      {data.documents.length > 0 ? (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {data.documents.length} Dokument{data.documents.length !== 1 ? "e" : ""} hochgeladen
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.documents.map((doc) => {
              const statusLabel = DOC_STATUS_LABELS[doc.status] || DOC_STATUS_LABELS.UPLOADED;
              const typeLabel = OFFBOARDING_DOC_TYPE_LABELS[doc.type] || doc.type;

              return (
                <div
                  key={doc.id}
                  className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 transition-all hover:border-[#009AC6]/30 hover:shadow-md"
                >
                  {/* Document Icon + Name */}
                  <div className="mb-3 flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <DocumentIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground" title={doc.fileName}>
                        {doc.fileName}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{formatFileSize(doc.fileSize)}</p>
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="mb-3 flex flex-wrap gap-2">
                    <span className="inline-flex rounded-full bg-[#009AC6]/10 px-2.5 py-0.5 text-[10px] font-semibold text-[#009AC6]">
                      {typeLabel}
                    </span>
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${statusLabel.color}`}>
                      {statusLabel.label}
                    </span>
                  </div>

                  {/* Date + Download */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">{formatDate(doc.uploadedAt)}</span>
                    <a
                      href={`/api/offboarding/${offboardingId}/documents/${doc.id}`}
                      download={doc.fileName}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-credo-gruen/10 hover:text-credo-gruen"
                      title="Herunterladen"
                    >
                      <DownloadIcon className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card py-12">
          <DocumentIcon className="mb-3 h-12 w-12 text-border" />
          <p className="mb-1 text-base font-medium text-foreground">Keine Dokumente</p>
          <p className="text-sm text-muted-foreground">
            Laden Sie Dokumente über den Upload-Bereich oben hoch.
          </p>
        </div>
      )}
    </div>
  );
}
