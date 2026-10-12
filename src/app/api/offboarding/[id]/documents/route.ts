/**
 * API: /api/offboarding/:id/documents
 *
 * GET  – Alle Offboarding-Dokumente auflisten (PORTAL_ROLES — dieselbe Sicht
 *        wie GET /api/offboarding/:id, das die Liste ohnehin mitliefert)
 * POST – Dokument hochladen, Multipart FormData (HR_EDIT_ROLES)
 *
 * Mandant per canAccessProcess: unbekannt und fremd = dieselbe 404. Der
 * n8n-Schluessel (SERVICE) bekommt 403. Das Hochladen schreibt
 * `DOCUMENT_UPLOADED` im selben Commit wie die Dokumentzeile — ohne Dateinamen
 * (der traegt oft den Namen der Person), nur ID, Art, Groesse und Typ.
 */

import { NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { sanitizeFilename } from "@/lib/file-upload";
import { HR_EDIT_ROLES, PORTAL_ROLES } from "@/lib/permissions";
import { nichtGefunden, offboardingZugaenglich } from "@/lib/offboarding-zugriff";

const LOG_LABEL = "Offboarding/Dokumente";

// Erlaubte Dateitypen
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

function fehler(text: string, status = 400) {
  return NextResponse.json({ error: text }, { status });
}

// =============================================
// GET /api/offboarding/:id/documents
// =============================================
export const GET = apiHandler(
  { roles: PORTAL_ROLES, logLabel: LOG_LABEL },
  async ({ params, session }) => {
    if (!(await offboardingZugaenglich(session!, params.id))) return nichtGefunden();

    // Ohne `filePath`: Der Speicherort geht niemanden ausserhalb des Servers an.
    const documents = await prisma.offboardingDocument.findMany({
      where: { offboardingId: params.id },
      select: {
        id: true,
        offboardingId: true,
        type: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        status: true,
        uploadedAt: true,
        uploadedById: true,
        reviewedAt: true,
        reviewedById: true,
      },
      orderBy: { uploadedAt: "desc" },
    });

    return NextResponse.json({ documents });
  }
);

// =============================================
// POST /api/offboarding/:id/documents
// =============================================
export const POST = apiHandler(
  { roles: HR_EDIT_ROLES, logLabel: LOG_LABEL },
  async ({ request, params, session }) => {
    const id = params.id;
    if (!(await offboardingZugaenglich(session!, id))) return nichtGefunden();

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return fehler("Die Datei konnte nicht gelesen werden. Erlaubt sind Dateien bis 10 MB.");
    }
    const file = formData.get("file");
    const docType = formData.get("type");

    if (!file || typeof file === "string") {
      return fehler("Keine Datei ausgewählt.");
    }

    // Dokumenttyp validieren
    const upperDocType = (typeof docType === "string" && docType ? docType : "SONSTIGES").toUpperCase();
    if (!VALID_OFFBOARDING_DOC_TYPES.includes(upperDocType)) {
      return fehler("Unbekannte Dokumentart.");
    }

    // Dateigroesse pruefen
    if (file.size > MAX_FILE_SIZE) {
      return fehler("Die Datei ist zu groß. Erlaubt sind höchstens 10 MB.");
    }

    // MIME-Type pruefen
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return fehler("Dateityp nicht erlaubt. Erlaubt sind PDF, JPG, PNG und WebP.");
    }

    // Dateiinhalt lesen und Magic Bytes pruefen
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!validateMagicBytes(buffer, file.type)) {
      return fehler("Der Dateiinhalt passt nicht zum Dateityp.");
    }

    // Upload-Verzeichnis erstellen
    const uploadBaseDir = path.resolve(process.cwd(), "uploads", "offboarding");
    const uploadDir = path.join(uploadBaseDir, id);
    await mkdir(uploadDir, { recursive: true });

    // Speichername ueber sanitizeFilename() (@/lib/file-upload) statt einer
    // eigenen Bereinigung - Path-Traversal-Schutz UND Kollisionsschutz.
    //
    // Vorher stand hier `${Date.now()}_${bereinigterName}`. Der Zeitstempel
    // allein traegt nicht: Er loest nur auf Millisekunden auf, und zwei
    // Uploads derselben Datei in dieselbe Millisekunde ergeben denselben
    // Pfad. Die zweite Datei ueberschreibt dann die erste, ohne dass
    // irgendetwas fehlschlaegt - in der Datenbank stehen danach zwei
    // Dokumentzeilen, die auf dieselben Bytes zeigen, und beide sehen richtig
    // aus. Wer eine davon loescht, nimmt der anderen die Datei weg. Bei einem
    // Offboarding trifft das ausgerechnet Kuendigungsschreiben und Zeugnisse.
    //
    // Wie eng der Fall ist, gehoert dazu: Die Ordner liegen je Vorgang
    // getrennt (uploads/offboarding/<id>/), es braucht also zwei gleichzeitige
    // Uploads desselben Dateinamens im SELBEN Vorgang - ein Doppelklick, zwei
    // offene Registerkarten oder ein Wiederholungsversuch nach einer
    // Zeitueberschreitung.
    //
    // sanitizeFilename setzt acht Zeichen einer UUID zwischen Zeitstempel und
    // Namen und macht ihn damit auch bei Gleichzeitigkeit eindeutig. Die
    // Bereinigung selbst bleibt dieselbe (alles ausserhalb von a-z, A-Z, 0-9,
    // "." und "-" wird zum Unterstrich), zusaetzlich auf 100 Zeichen gekuerzt.
    //
    // Sichtbar aendert sich nichts: Der Originalname wird unveraendert in der
    // Spalte `fileName` abgelegt (siehe unten), der Speichername taucht in der
    // Oberflaeche nirgends auf. Bestandsdateien behalten ihren alten Pfad, er
    // steht in der Datenbank und wird hier nicht neu berechnet.
    const fileName = sanitizeFilename(path.basename(file.name) || "upload");
    const filePath = path.join(uploadDir, fileName);

    // Path-Traversal-Schutz: nur im Ordner DIESES Vorgangs.
    if (!path.resolve(filePath).startsWith(uploadDir + path.sep)) {
      return fehler("Ungültiger Dateiname.");
    }

    await writeFile(filePath, buffer);

    // Dokumentzeile und Protokoll in EINER Transaktion. Scheitert sie, wird
    // die gerade geschriebene Datei wieder entfernt — sonst laege sie ohne
    // Zeile auf der Platte.
    let document;
    try {
      document = await prisma.$transaction(async (tx) => {
        const neu = await tx.offboardingDocument.create({
          data: {
            offboardingId: id,
            type: upperDocType as never,
            fileName: file.name,
            filePath: `uploads/offboarding/${id}/${fileName}`,
            fileSize: buffer.length,
            mimeType: file.type,
            uploadedById: session!.userId,
          },
        });
        await tx.auditLog.create({
          data: {
            offboardingId: id,
            userId: session!.userId,
            processType: "OFFBOARDING",
            action: "DOCUMENT_UPLOADED",
            details: {
              documentId: neu.id,
              dokumentTyp: upperDocType,
              groesse: buffer.length,
              mimeType: file.type,
            },
          },
        });
        return neu;
      });
    } catch (dbFehler) {
      await unlink(filePath).catch(() => undefined);
      throw dbFehler;
    }

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
  }
);
