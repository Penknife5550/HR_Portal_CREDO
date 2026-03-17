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
}

const DOCUMENT_CATEGORIES = [
  { value: "kk_bescheinigung", label: "Mitgliedsbescheinigung Krankenkasse" },
  { value: "geburtsurkunde_kind", label: "Geburtsurkunde Kind" },
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
  GEBURTSURKUNDE_KIND: "Geburtsurkunde",
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

export function DocumentUpload({ token }: DocumentUploadProps) {
  const [documents, setDocuments] = useState<UploadedDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("sonstiges");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Upload-Funktion
  const handleUpload = async (file: File) => {
    setError("");
    setSuccess("");

    // Client-seitige Dateigroessen-Validierung (max. 10 MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      setError(`Datei "${file.name}" ist zu gross (max. 10 MB).`);
      return;
    }

    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", selectedCategory);

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
      setError("Fehler beim Loeschen.");
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

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[#009AC6]/20 bg-[#009AC6]/5 p-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground">
          <svg className="h-5 w-5 text-[#009AC6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          Unterlagen hochladen
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Laden Sie hier die erforderlichen Unterlagen hoch (PDF, JPG, PNG, Word). Maximal 10 MB pro Datei.
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
            {DOCUMENT_CATEGORIES.map((cat) => (
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
            {uploading
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

      {/* Hochgeladene Dokumente */}
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
                  title="Loeschen"
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
