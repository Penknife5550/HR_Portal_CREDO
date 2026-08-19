/**
 * API: Dokumenten-Upload für den Personalfragebogen
 *
 * POST /api/fragebogen/:token/documents – Dokument hochladen
 * GET  /api/fragebogen/:token/documents – Hochgeladene Dokumente auflisten
 * DELETE via query param ?documentId=... – Einzelnes Dokument löschen
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateMagicToken } from "@/lib/auth";
import { tokenRateLimiter, getClientIp } from "@/lib/rate-limit";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";

// Erlaubte Dateitypen
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// Magic Bytes für Content-Type-Validierung (MIME-Type vom Client ist nicht vertrauenswuerdig)
const MAGIC_BYTES: Record<string, number[][]> = {
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]], // %PDF
  "image/jpeg": [[0xFF, 0xD8, 0xFF]],
  "image/png": [[0x89, 0x50, 0x4E, 0x47]],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]], // RIFF
  "application/msword": [[0xD0, 0xCF, 0x11, 0xE0]], // OLE2 compound document
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [[0x50, 0x4B, 0x03, 0x04]], // ZIP (docx is a zip)
};

function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const signatures = MAGIC_BYTES[mimeType];
  if (!signatures) return false;
  return signatures.some((sig) =>
    sig.every((byte, index) => buffer[index] === byte)
  );
}

// Mapping von Upload-Kategorie auf DocumentType Enum
const DOCUMENT_TYPE_MAP: Record<string, string> = {
  arbeitsvertrag: "ARBEITSVERTRAG",
  fuehrungszeugnis: "FUEHRUNGSZEUGNIS",
  kk_bescheinigung: "KK_BESCHEINIGUNG",
  geburtsurkunde_eigen: "GEBURTSURKUNDE_EIGEN",
  geburtsurkunde_kind: "GEBURTSURKUNDE_KIND",
  sv_ausweis: "SV_AUSWEIS",
  zeugnis: "ZEUGNIS",
  abschlusszeugnis: "ABSCHLUSSZEUGNIS",
  masernschutz: "MASERNSCHUTZ",
  infektionsschutz: "INFEKTIONSSCHUTZ",
  rv_befreiung: "RV_BEFREIUNG",
  sb_ausweis: "SB_AUSWEIS",
  vl_vertrag: "VL_VERTRAG",
  bav_vertrag: "BAV_VERTRAG",
  sonstiges: "SONSTIGES",
};

// =============================================
// POST – Dokument hochladen
// =============================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // Rate Limiting
  const clientIp = getClientIp(request);
  const rlCheck = tokenRateLimiter.check(clientIp);
  if (!rlCheck.allowed) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte warten Sie." },
      { status: 429 }
    );
  }

  const { token } = await params;

  const result = await validateMagicToken(token);
  if (!result.valid) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === "Token nicht gefunden" ? 404 : 410 }
    );
  }

  const onboarding = result.onboarding!;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const docType = (formData.get("type") as string) || "sonstiges";

    if (!file) {
      return NextResponse.json(
        { error: "Keine Datei ausgewaehlt." },
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

    // MIME-Type pruefen (Client-seitig)
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error:
            "Dateityp nicht erlaubt. Erlaubt sind: PDF, JPG, PNG, Word-Dokumente.",
        },
        { status: 400 }
      );
    }

    // Dateiinhalt lesen und Magic Bytes pruefen (Server-seitig)
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!validateMagicBytes(buffer, file.type)) {
      return NextResponse.json(
        {
          error:
            "Dateiinhalt stimmt nicht mit dem angegebenen Dateityp überein. Bitte laden Sie eine gültige Datei hoch.",
        },
        { status: 400 }
      );
    }

    // Upload-Verzeichnis erstellen
    const uploadBaseDir = path.resolve(process.cwd(), "uploads");
    const uploadDir = path.join(uploadBaseDir, onboarding.id);
    await mkdir(uploadDir, { recursive: true });

    // Dateiname sanitisieren und Path-Traversal verhindern
    const safeFileName = path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, "_");
    // Leeren Dateinamen verhindern
    const finalFileName = safeFileName || "upload";
    const fileName = `${Date.now()}_${finalFileName}`;
    const filePath = path.join(uploadDir, fileName);

    // Path-Traversal-Schutz: Sicherstellen dass der Pfad im Upload-Verzeichnis bleibt
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(uploadBaseDir)) {
      return NextResponse.json(
        { error: "Ungültiger Dateiname." },
        { status: 400 }
      );
    }

    // buffer wurde bereits oben gelesen (Magic Bytes Validierung)
    await writeFile(filePath, buffer);

    // Dokument-Typ mappen.
    // Aufrufer senden teils den Kategorie-Schluessel ("geburtsurkunde_kind"),
    // teils die Enum-Schreibweise ("GEBURTSURKUNDE_KIND") — beides muss treffen,
    // sonst landet das Dokument stillschweigend als SONSTIGES und gilt als fehlend.
    const documentType =
      DOCUMENT_TYPE_MAP[docType.toLowerCase()] || "SONSTIGES";

    // Dokument in DB speichern
    const document = await prisma.document.create({
      data: {
        onboardingId: onboarding.id,
        type: documentType as never,
        fileName: file.name,
        filePath: `uploads/${onboarding.id}/${fileName}`,
        fileSize: buffer.length,
        mimeType: file.type,
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

// =============================================
// GET – Hochgeladene Dokumente auflisten
// =============================================
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // GET erlaubt auch SUBMITTED-Status (Anzeige der hochgeladenen Dokumente)
  const result = await validateMagicToken(token, { allowSubmitted: true });
  if (!result.valid) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === "Token nicht gefunden" ? 404 : 410 }
    );
  }

  const onboarding = result.onboarding!;

  const documents = await prisma.document.findMany({
    where: { onboardingId: onboarding.id },
    select: {
      id: true,
      fileName: true,
      fileSize: true,
      type: true,
      mimeType: true,
      uploadedAt: true,
    },
    orderBy: { uploadedAt: "desc" },
  });

  return NextResponse.json({ documents });
}

// =============================================
// DELETE – Dokument löschen
// =============================================
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const result = await validateMagicToken(token);
  if (!result.valid) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === "Token nicht gefunden" ? 404 : 410 }
    );
  }

  const onboarding = result.onboarding!;
  const { searchParams } = new URL(request.url);
  const documentId = searchParams.get("documentId");

  if (!documentId) {
    return NextResponse.json(
      { error: "documentId ist erforderlich." },
      { status: 400 }
    );
  }

  // Pruefen ob Dokument zu diesem Vorgang gehoert
  const document = await prisma.document.findFirst({
    where: { id: documentId, onboardingId: onboarding.id },
  });

  if (!document) {
    return NextResponse.json(
      { error: "Dokument nicht gefunden." },
      { status: 404 }
    );
  }

  // Datei vom Filesystem löschen
  try {
    const filePath = path.join(process.cwd(), document.filePath);
    await unlink(filePath);
  } catch {
    // Datei existiert nicht mehr - trotzdem DB-Eintrag löschen
  }

  // DB-Eintrag löschen
  await prisma.document.delete({ where: { id: documentId } });

  return NextResponse.json({ success: true });
}
