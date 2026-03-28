"use client";

/**
 * Dokumenten-Upload Komponente
 *
 * Erlaubt das Hochladen von Unterlagen (PDF, Bilder, Word)
 * mit Kategorisierung und Vorschau.
 */

import { useState, useCallback, useRef, useEffect } from "react";

interface UploadedDoc {
  id: string;
  fileName: string;
  fileSize: number;
  type: string;
  uploadedAt: string;
}

interface DocumentUploadProps {
  token: string;
  hasChildren?: boolean;
}

// Pflichtdokumente (werden separat angezeigt)
const REQUIRED_DOCUMENTS = [
  { value: "geburtsurkunde_eigen", label: "Kopie Ihrer Geburtsurkunde", dbType: "GEBURTSURKUNDE_EIGEN" },
  { value: "geburtsurkunde_kind", label: "Geburtsurkunde(n) der Kinder", dbType: "GEBURTSURKUNDE_KIND" },
];

// Optionale Dokumente (Dropdown)
const OPTIONAL_DOCUMENT_CATEGORIES = [
  { value: "kk_bescheinigung", label: "Mitgliedsbescheinigung Krankenkasse" },
  { value: "sv_ausweis", label: "Sozialversicherungsausweis" },
  { value: "masernschutz", label: "Masernschutz-Nachweis" },
  { value: "sb_ausweis", label: "Schwerbehindertenausweis" },
  { value: "rv_befreiung", label: "Antrag RV-Befreiung (Minijob)" },
  { value: "vl_vertrag", label: "VL-Vertrag (Vermoeg. Leistungen)" },
  { value: "bav_vertrag", label: "bAV-Vertrag (Altersvorsorge)" },
  { value: "zeugnis", label: "Zeugnis / Qualifikationsnachweis" },
  { value: "sonstiges", label: "Sonstiges Dokument" },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const TYPE_LABELS: Record<string, string> = {
  KK_BESCHEINIGUNG: "KK-Bescheinigung",
  GEBURTSURKUNDE_EIGEN: "Geburtsurkunde (eigene)",
  GEBURTSURKUNDE_KIND: "Geburtsurkunde Kind",
  SV_AUSWEIS: "SV-Ausweis",
  MASERNSCHUTZ: "Masernschutz",
  SB_AUSWEIS: "SB-Ausweis",
  RV_BEFREIUNG: "RV-Befreiung",
  VL_VERTRAG: "VL-Vertrag",
  BAV_VERTRAG: "bAV-Vertrag",
  ZEUGNIS: "Zeugnis",
  SONSTIGES: "Sonstiges",
  ARBEITSVERTRAG: "Arbeitsvertrag",
  FUEHRUNGSZEUGNIS: "Fuehrungszeugnis",
  ABSCHLUSSZEUGNIS: "Abschlusszeugnis",
  INFEKTIONSSCHUTZ: "Infektionsschutz",
};

export function DocumentUpload({ token, hasChildren = false }: DocumentUploadProps) {
  const [documents, setDocuments] = useState<UploadedDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("sonstiges");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requiredFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Pruefen ob ein Pflichtdokument bereits hochgeladen wurde
  const isRequiredUploaded = (dbType: string) => {
    return documents.some((doc) => doc.type === dbType);
  };

  // Dokumente laden
  const loadDocuments = useCallback(async () => {
    try {
      const res = await fetch(`/api/fragebogen/${token}/documents`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch {
      // Fehler stillschweigend ignorieren
    }
  }, [token]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Upload-Funktion (optionaler Typ-Override fuer Pflichtdokumente)
  const handleUpload = async (file: File, typeOverride?: string) => {
    setError("");
    setSuccess("");

    // Client-seitige Dateigroessen-Validierung (max. 10 MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      setError(`Datei "${file.name}" ist zu gross (max. 10 MB).`);
      return;
    }

    setUploading(true);
    if (typeOverride) setUploadingType(typeOverride);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", typeOverride || selectedCategory);

    try {
      const res = await fetch(`/api/fragebogen/${token}/documents`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Fehler beim Hochladen.");
        return;
      }

      setSuccess(`${file.name} erfolgreich hochgeladen.`);
      setTimeout(() => setSuccess(""), 3000);
      await loadDocuments();
    } catch {
      setError("Verbindungsfehler beim Hochladen.");
    } finally {
      setUploading(false);
      setUploadingType(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Dokument loeschen
  const handleDelete = async (docId: string) => {
    try {
      const res = await fetch(
        `/api/fragebogen/${token}/documents?documentId=${docId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        await loadDocuments();
      }
    } catch {
      setError("Fehler beim Löschen.");
    }
  };

  // Drag & Drop Handler
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleUpload(e.dataTransfer.files[0]);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedCategory, token]
  );

  // Pflichtdokumente filtern (Geburtsurkunde Kinder nur wenn Kinder vorhanden)
  const activeRequiredDocs = REQUIRED_DOCUMENTS.filter((doc) => {
    if (doc.value === "geburtsurkunde_kind") return hasChildren;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* ============================================= */}
      {/* PFLICHTDOKUMENTE */}
      {/* ============================================= */}
      <div className="rounded-lg border-2 border-amber-300 bg-amber-50/50 p-4">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-foreground">
          <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          Pflichtdokumente
        </h3>
        <p className="mb-4 text-xs text-amber-800">
          Die folgenden Unterlagen werden zwingend benötigt. Bitte laden Sie diese hoch (PDF, JPG, PNG, Word). Max. 10 MB pro Datei.
        </p>

        <div className="space-y-3">
          {activeRequiredDocs.map((reqDoc) => {
            const uploaded = isRequiredUploaded(reqDoc.dbType);
            const isCurrentlyUploading = uploadingType === reqDoc.value;

            return (
              <div
                key={reqDoc.value}
                className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                  uploaded
                    ? "border-green-300 bg-green-50"
                    : "border-amber-200 bg-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  {uploaded ? (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
                      <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100">
                      <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-foreground">{reqDoc.label}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {uploaded ? "Hochgeladen" : "Noch nicht hochgeladen – Pflicht"}
                    </p>
                  </div>
                </div>

                {!uploaded && (
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => requiredFileInputRefs.current[reqDoc.value]?.click()}
                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
                  >
                    {isCurrentlyUploading ? "Wird hochgeladen..." : "Hochladen"}
                  </button>
                )}
                {uploaded && (
                  <button
                    type="button"
                    onClick={() => {
                      const doc = documents.find((d) => d.type === reqDoc.dbType);
                      if (doc) handleDelete(doc.id);
                    }}
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    title="Löschen"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}

                <input
                  ref={(el) => { requiredFileInputRefs.current[reqDoc.value] = el; }}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleUpload(e.target.files[0], reqDoc.value);
                  }}
                  disabled={uploading}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* ============================================= */}
      {/* OPTIONALE DOKUMENTE */}
      {/* ============================================= */}
      <div className="rounded-lg border border-[#009AC6]/20 bg-[#009AC6]/5 p-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground">
          <svg className="h-5 w-5 text-[#009AC6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          Weitere Unterlagen (optional)
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Falls vorhanden, können Sie hier weitere Dokumente hochladen. Max. 10 MB pro Datei.
        </p>

        {/* Kategorie waehlen */}
        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-foreground">
            Dokumentenart
          </label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          >
            {OPTIONAL_DOCUMENT_CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        {/* Drag & Drop Zone */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
            dragActive
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-muted/50"
          }`}
        >
          <svg
            className="mx-auto mb-2 h-8 w-8 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 6v6m0 0v6m0-6h6m-6 0H6"
            />
          </svg>
          <p className="text-sm text-muted-foreground">
            {uploading && !uploadingType
              ? "Wird hochgeladen..."
              : "Datei hierher ziehen oder klicken zum Auswaehlen"}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) handleUpload(e.target.files[0]);
            }}
            disabled={uploading}
          />
        </div>

        {/* Status-Meldungen */}
        {error && (
          <p className="mt-2 text-xs text-destructive">{error}</p>
        )}
        {success && (
          <p className="mt-2 text-xs text-green-600">{success}</p>
        )}
      </div>

      {/* ============================================= */}
      {/* ALLE HOCHGELADENEN DOKUMENTE */}
      {/* ============================================= */}
      {documents.length > 0 && (
        <div className="rounded-lg border border-border">
          <div className="border-b bg-muted/50 px-4 py-2">
            <h4 className="text-xs font-semibold text-foreground">
              Hochgeladene Dokumente ({documents.length})
            </h4>
          </div>
          <div className="divide-y">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between px-4 py-2.5"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
                    <svg
                      className="h-4 w-4 text-[#009AC6]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">
                      {doc.fileName}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {TYPE_LABELS[doc.type] || doc.type} &middot;{" "}
                      {formatFileSize(doc.fileSize)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  title="Löschen"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
