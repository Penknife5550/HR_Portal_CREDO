/**
 * API: /api/offboarding/:id/documents
 *
 * GET  – Alle Offboarding-Dokumente auflisten
 * POST – Dokument hochladen (Multipart FormData)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

// Erlaubte Dateitypen
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// Magic Bytes fuer Content-Type-Validierung
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

const VALID_OFFBOARDING_DOC_TYPES = [
  "KUENDIGUNGSSCHREIBEN",
  "AUFHEBUNGSVERTRAG",
  "ZEUGNIS_EINFACH",
  "ZEUGNIS_QUALIFIZIERT",
  "ARBEITSBESCHEINIGUNG",
  "ABFINDUNGSVEREINBARUNG",
  "WETTBEWERBSVERBOT",
  "RUECKGABEPROTOKOLL",
  "SV_ABMELDUNG",
  "SONSTIGES",
];

// =============================================
// GET /api/offboarding/:id/documents
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

    const offboarding = await prisma.offboardingProcess.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!offboarding) {
      return NextResponse.json(
        { error: "Offboarding-Vorgang nicht gefunden" },
        { status: 404 }
      );
    }

    const documents = await prisma.offboardingDocument.findMany({
      where: { offboardingId: id },
      orderBy: { uploadedAt: "desc" },
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
// POST /api/offboarding/:id/documents
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

    // Pruefen ob Offboarding existiert
    const offboarding = await prisma.offboardingProcess.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!offboarding) {
      return NextResponse.json(
        { error: "Offboarding-Vorgang nicht gefunden" },
        { status: 404 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const docType = (formData.get("type") as string) || "SONSTIGES";

    if (!file) {
      return NextResponse.json(
        { error: "Keine Datei ausgewaehlt." },
        { status: 400 }
      );
    }

    // Dokumenttyp validieren
    const upperDocType = docType.toUpperCase();
    if (!VALID_OFFBOARDING_DOC_TYPES.includes(upperDocType)) {
      return NextResponse.json(
        { error: `Ungueltiger Dokumenttyp. Erlaubt: ${VALID_OFFBOARDING_DOC_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    // Dateigroesse pruefen
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Datei ist zu gross. Maximal 10 MB erlaubt." },
        { status: 400 }
      );
    }

    // MIME-Type pruefen
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Dateityp nicht erlaubt. Erlaubt sind: PDF, JPG, PNG, WebP." },
        { status: 400 }
      );
    }

    // Dateiinhalt lesen und Magic Bytes pruefen
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!validateMagicBytes(buffer, file.type)) {
      return NextResponse.json(
        { error: "Dateiinhalt stimmt nicht mit dem angegebenen Dateityp ueberein." },
        { status: 400 }
      );
    }

    // Upload-Verzeichnis erstellen
    const uploadBaseDir = path.resolve(process.cwd(), "uploads", "offboarding");
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
        { error: "Ungueltiger Dateiname." },
        { status: 400 }
      );
    }

    await writeFile(filePath, buffer);

    // Dokument in DB speichern
    const document = await prisma.offboardingDocument.create({
      data: {
        offboardingId: id,
        type: upperDocType as never,
        fileName: file.name,
        filePath: `uploads/offboarding/${id}/${fileName}`,
        fileSize: buffer.length,
        mimeType: file.type,
        uploadedById: session.userId,
      },
    });

    return NextResponse.json(
      {
        id: document.id,
        fileName: document.fileName,
        fileSize: document.fileSize,
        type: document.type,
        uploadedAt: document.uploadedAt,
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
