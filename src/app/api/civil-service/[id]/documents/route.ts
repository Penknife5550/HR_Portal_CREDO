/**
 * API: /api/civil-service/:id/documents
 *
 * GET  – Alle Dokumente eines Verbeamtungsvorgangs auflisten
 * POST – Dokument hochladen (Multipart FormData)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

// ── Erlaubte Dateitypen ──

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// Magic Bytes für Content-Type-Validierung
const MAGIC_BYTES: Record<string, number[][]> = {
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]], // %PDF
  "image/jpeg": [[0xFF, 0xD8, 0xFF]],
  "image/png": [[0x89, 0x50, 0x4E, 0x47]],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]], // RIFF
};

function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const signatures = MAGIC_BYTES[mimeType];
  if (!signatures) return false;
  return signatures.some((sig) =>
    sig.every((byte, index) => buffer[index] === byte)
  );
}

// ── Gültige Dokumenttypen (33+ aus dem Verbeamtungsverfahren) ──

const CIVIL_SERVICE_DOC_TYPES = [
  // Phase I: Antrag & Voraussetzungen
  "ANTRAG_PSI",
  "LEBENSLAUF",
  "FUEHRUNGSZEUGNIS",
  "AMTSARZT_PROBE",
  "AMTSARZT_LEBENSZEIT",
  // Phase II: Verwaltung
  "VERTRAG_PROBE",
  "VERTRAG_LEBENSZEIT",
  "ERNENNUNGSURKUNDE_PROBE",
  "ERNENNUNGSURKUNDE_LEBENSZEIT",
  "BESOLDUNGSBESCHEID",
  "RV_BEFREIUNGSANTRAG",
  "RV_BEFREIUNGSBESCHEID",
  "BEIHILFE_ANTRAG",
  "BEIHILFE_BESCHEID",
  "BR_ANTRAG_PROBE",
  "BR_ANTRAG_LEBENSZEIT",
  "BR_GENEHMIGUNG_PROBE",
  "BR_GENEHMIGUNG_LEBENSZEIT",
  "DIENSTEID",
  "BELEHRUNG_DATENSCHUTZ",
  "BELEHRUNG_MASERNSCHUTZ",
  // Phase III: Probezeit
  "BEURTEILUNG_1",
  "BEURTEILUNG_2",
  "BEURTEILUNG_3",
  "REFERENZ_GEMEINDE",
  "UNTERRICHTSBESUCH_1",
  "UNTERRICHTSBESUCH_2",
  "UNTERRICHTSBESUCH_3",
  // Phase IV: Übernahme
  "BEIRAT_PROTOKOLL",
  "ANTRAG_LEBENSZEIT",
  // Allgemein
  "SONSTIGES",
];

// Amtsarzt-Dokumenttypen die automatisch ein Ablaufdatum bekommen
const AMTSARZT_TYPES = ["AMTSARZT_PROBE", "AMTSARZT_LEBENSZEIT"];

// =============================================
// GET /api/civil-service/:id/documents
// =============================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    const { id } = await params;

    const process = await prisma.civilServiceProcess.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!process) {
      return NextResponse.json(
        { error: "Verbeamtungsvorgang nicht gefunden" },
        { status: 404 }
      );
    }

    const documents = await prisma.civilServiceDocument.findMany({
      where: {
        processId: id,
        status: { not: "DELETED" },
      },
      orderBy: [{ step: "asc" }, { uploadedAt: "desc" }],
    });

    return NextResponse.json({ documents });
  } catch (error) {
    console.error("Fehler beim Laden der Dokumente:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// POST /api/civil-service/:id/documents
// =============================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    const { id } = await params;

    // Prüfen ob Vorgang existiert
    const civilServiceProcess = await prisma.civilServiceProcess.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!civilServiceProcess) {
      return NextResponse.json(
        { error: "Verbeamtungsvorgang nicht gefunden" },
        { status: 404 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const documentType = (formData.get("documentType") as string) || "SONSTIGES";
    const step = formData.get("step") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "Keine Datei ausgewählt." },
        { status: 400 }
      );
    }

    // Dokumenttyp validieren
    const upperDocType = documentType.toUpperCase();
    if (!CIVIL_SERVICE_DOC_TYPES.includes(upperDocType)) {
      return NextResponse.json(
        {
          error: `Ungültiger Dokumenttyp. Erlaubt: ${CIVIL_SERVICE_DOC_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Dateigröße prüfen
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Datei ist zu groß. Maximal 10 MB erlaubt." },
        { status: 400 }
      );
    }

    // MIME-Type prüfen
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Dateityp nicht erlaubt. Erlaubt sind: PDF, JPG, PNG, WebP." },
        { status: 400 }
      );
    }

    // Dateiinhalt lesen und Magic Bytes prüfen
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!validateMagicBytes(buffer, file.type)) {
      return NextResponse.json(
        { error: "Dateiinhalt stimmt nicht mit dem angegebenen Dateityp überein." },
        { status: 400 }
      );
    }

    // Upload-Verzeichnis erstellen
    const uploadBaseDir = path.resolve(process.cwd(), "uploads", "civil-service");
    const uploadDir = path.join(uploadBaseDir, id);
    await mkdir(uploadDir, { recursive: true });

    // Dateiname sanitisieren und Path-Traversal verhindern
    const safeFileName = path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, "_");
    const finalFileName = safeFileName || "upload";
    const fileName = `${Date.now()}_${finalFileName}`;
    const filePath = path.join(uploadDir, fileName);

    // Path-Traversal-Schutz
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(uploadBaseDir)) {
      return NextResponse.json(
        { error: "Ungültiger Dateiname." },
        { status: 400 }
      );
    }

    await writeFile(filePath, buffer);

    // Ablaufdatum für Amtsarzt-Atteste: +3 Monate
    const now = new Date();
    const expiresAt = AMTSARZT_TYPES.includes(upperDocType)
      ? new Date(new Date().setMonth(now.getMonth() + 3))
      : undefined;

    // Dokument in DB speichern
    const document = await prisma.civilServiceDocument.create({
      data: {
        processId: id,
        documentType: upperDocType,
        documentName: upperDocType.replace(/_/g, " "),
        step: step || undefined,
        fileName: file.name,
        filePath: `uploads/civil-service/${id}/${fileName}`,
        fileSize: buffer.length,
        mimeType: file.type,
        status: "UPLOADED",
        uploadedAt: now,
        expiresAt,
      },
    });

    // Verknüpfte Checklisten-Items automatisch abhaken
    const linkedItems = await prisma.civilServiceChecklistItem.findMany({
      where: {
        processId: id,
        linkedDocumentType: upperDocType,
        isCompleted: false,
      },
    });

    for (const item of linkedItems) {
      await prisma.civilServiceChecklistItem.update({
        where: { id: item.id },
        data: {
          isCompleted: true,
          completedAt: now,
          completedById: session.userId,
        },
      });
    }

    // Audit-Log
    await prisma.auditLog.create({
      data: {
        userId: session.userId !== "n8n-service" ? session.userId : undefined,
        civilServiceId: id,
        processType: "CIVIL_SERVICE",
        action: "DOCUMENT_UPLOADED",
        details: {
          documentId: document.id,
          documentType: upperDocType,
          fileName: file.name,
          fileSize: buffer.length,
          autoCompletedItems: linkedItems.map((i) => i.id),
        },
      },
    });

    return NextResponse.json(
      {
        id: document.id,
        documentType: document.documentType,
        documentName: document.documentName,
        fileName: document.fileName,
        fileSize: document.fileSize,
        status: document.status,
        step: document.step,
        uploadedAt: document.uploadedAt,
        expiresAt: document.expiresAt,
        autoCompletedItems: linkedItems.length,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Fehler beim Dokumenten-Upload:", error);
    return NextResponse.json(
      { error: "Fehler beim Hochladen der Datei." },
      { status: 500 }
    );
  }
}
