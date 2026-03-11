/**
 * API: /api/onboarding/:id/documents/:docId
 *
 * GET – Dokument herunterladen (nur HR-Team)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { readFile } from "fs/promises";
import path from "path";

// =============================================
// GET /api/onboarding/:id/documents/:docId
// =============================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    // Auth-Check
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    const { id, docId } = await params;

    // Dokument aus der Datenbank laden
    const document = await prisma.document.findUnique({
      where: { id: docId },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Dokument nicht gefunden" },
        { status: 404 }
      );
    }

    // Pruefen ob das Dokument zum Onboarding-Vorgang gehoert
    if (document.onboardingId !== id) {
      return NextResponse.json(
        { error: "Dokument gehoert nicht zu diesem Vorgang" },
        { status: 403 }
      );
    }

    // Path-Traversal-Schutz: Kein '../' im Dateipfad erlauben
    if (document.filePath.includes("../") || document.filePath.includes("..\\")) {
      console.error("Path-Traversal-Versuch erkannt:", document.filePath);
      return NextResponse.json(
        { error: "Ungueltiger Dateipfad" },
        { status: 400 }
      );
    }

    // Datei von der Festplatte lesen
    const absolutePath = path.resolve(process.cwd(), document.filePath);

    // Zusaetzliche Sicherheitspruefung: Der aufgeloeste Pfad muss
    // innerhalb des Projektverzeichnisses (uploads/) liegen
    const uploadsDir = path.resolve(process.cwd(), "uploads");
    if (!absolutePath.startsWith(uploadsDir)) {
      console.error("Dateizugriff ausserhalb des Upload-Verzeichnisses:", absolutePath);
      return NextResponse.json(
        { error: "Ungueltiger Dateipfad" },
        { status: 400 }
      );
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = await readFile(absolutePath);
    } catch {
      console.error("Datei nicht gefunden:", absolutePath);
      return NextResponse.json(
        { error: "Datei nicht gefunden auf dem Server" },
        { status: 404 }
      );
    }

    // Response mit korrekten Headers zurueckgeben
    // Buffer muss in Uint8Array umgewandelt werden fuer NextResponse-Kompatibilitaet
    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "Content-Type": document.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${document.fileName}"`,
        "Content-Length": fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("Fehler beim Herunterladen des Dokuments:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
