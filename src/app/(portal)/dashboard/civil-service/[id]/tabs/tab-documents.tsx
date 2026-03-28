"use client";

import { CIVIL_SERVICE_DOC_TYPES } from "@/lib/constants";
import type { DocumentData } from "../types";
import { formatDate, formatFileSize } from "../helpers";
import { UploadIcon, DownloadIcon } from "../icons";

export function TabDocuments({
  documents,
  uploadingDoc,
  uploadDocType,
  setUploadDocType,
  fileInputRef,
  onUpload,
  processId,
}: {
  documents: DocumentData[];
  uploadingDoc: boolean;
  uploadDocType: string;
  setUploadDocType: (t: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onUpload: (file: File, type: string) => void;
  processId: string;
}) {
  const docTypeEntries = Object.entries(CIVIL_SERVICE_DOC_TYPES);

  const getDocStatus = (type: string) => {
    const doc = documents.find((d) => d.type === type);
    if (!doc)
      return {
        status: "missing" as const,
        label: "Ausstehend",
        color: "text-gray-400",
        bgColor: "bg-gray-50",
      };
    if (doc.expiresAt && new Date(doc.expiresAt) < new Date()) {
      return {
        status: "expired" as const,
        label: "Abgelaufen",
        color: "text-orange-600",
        bgColor: "bg-orange-50",
      };
    }
    return {
      status: "uploaded" as const,
      label: "Vorhanden",
      color: "text-credo-gruen",
      bgColor: "bg-credo-gruen/5",
    };
  };

  const getDocFile = (type: string) => documents.find((d) => d.type === type);

  return (
    <div>
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
                  {ds.status === "missing"
                    ? "\u25A1"
                    : ds.status === "expired"
                    ? "\u26A0"
                    : "\u2713"}{" "}
                  {ds.label}
                </span>
              </div>

              {docFile && (
                <div className="mb-2 text-xs text-gray-500">
                  <p className="truncate">{docFile.fileName}</p>
                  <p>
                    {formatFileSize(docFile.fileSize)} &middot; {formatDate(docFile.uploadedAt)}
                  </p>
                </div>
              )}

              {isAmtsarzt && ds.status === "expired" && (
                <div className="mb-2 rounded-lg bg-orange-100 px-2 py-1 text-[10px] font-medium text-orange-700">
                  Amtsärztliches Zeugnis ist abgelaufen. Neues Zeugnis erforderlich.
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
