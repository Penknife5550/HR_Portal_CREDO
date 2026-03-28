/**
 * API: /api/civil-service/:id/documents/:docId
 *
 * GET    – Dokument herunterladen
 * DELETE – Dokument löschen (Soft Delete)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { readFile } from "fs/promises";
import path from "path";

// =============================================
// GET /api/civil-service/:id/documents/:docId
// =============================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    const { id, docId } = await params;

    const document = await prisma.civilServiceDocument.findFirst({
      where: {
        id: docId,
        processId: id,
        status: { not: "DELETED" },
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Dokument nicht gefunden" },
        { status: 404 }
      );
    }

    if (!document.filePath) {
      return NextResponse.json(
        { error: "Keine Datei vorhanden" },
        { status: 404 }
      );
    }

    // Path-Traversal-Schutz
    const uploadBaseDir = path.resolve(process.cwd(), "uploads", "civil-service");
    const resolvedPath = path.resolve(process.cwd(), document.filePath);
    if (!resolvedPath.startsWith(uploadBaseDir)) {
      return NextResponse.json(
        { error: "Ungültiger Dateipfad" },
        { status: 400 }
      );
    }

    const fileBuffer = await readFile(resolvedPath);
    const mimeType = document.mimeType || "application/octet-stream";
    const fileName = document.fileName || "download";

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
        "Content-Length": fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("Fehler beim Dokument-Download:", error);
    return NextResponse.json(
      { error: "Fehler beim Herunterladen der Datei." },
      { status: 500 }
    );
  }
}

// =============================================
// DELETE /api/civil-service/:id/documents/:docId
// =============================================
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    const { id, docId } = await params;

    const document = await prisma.civilServiceDocument.findFirst({
      where: {
        id: docId,
        processId: id,
        status: { not: "DELETED" },
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Dokument nicht gefunden" },
        { status: 404 }
      );
    }

    // Soft Delete
    await prisma.civilServiceDocument.update({
      where: { id: docId },
      data: { status: "DELETED" },
    });

    // Audit-Log
    await prisma.auditLog.create({
      data: {
        userId: session.userId !== "n8n-service" ? session.userId : undefined,
        civilServiceId: id,
        processType: "CIVIL_SERVICE",
        action: "DOCUMENT_DELETED",
        details: {
          documentId: docId,
          documentType: document.documentType,
          fileName: document.fileName,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Dokument gelöscht.",
    });
  } catch (error) {
    console.error("Fehler beim Löschen des Dokuments:", error);
    return NextResponse.json(
      { error: "Fehler beim Löschen des Dokuments." },
      { status: 500 }
    );
  }
}
