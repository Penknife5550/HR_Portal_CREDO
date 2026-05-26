/**
 * API: /api/elternzeit/[id]/dokumente/[docId]
 *
 * GET    – Datei-Download (mit Path-Traversal-Schutz)
 * DELETE – Dokument löschen (HR_EDIT_ROLES)
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile, unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { HR_EDIT_ROLES, PORTAL_ROLES, canAccessProcess } from "@/lib/permissions";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!PORTAL_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id, docId } = await params;
    const doc = await prisma.elternzeitDokument.findUnique({
      where: { id: docId },
      include: { elternzeit: { select: { organizationId: true } } },
    });
    if (!doc || doc.elternzeitId !== id) {
      return NextResponse.json({ error: "Dokument nicht gefunden" }, { status: 404 });
    }
    if (!(await canAccessProcess(session, doc.elternzeit.organizationId))) {
      return NextResponse.json({ error: "Dokument nicht gefunden" }, { status: 404 });
    }

    // Path-Traversal-Schutz: Datei muss innerhalb von uploads/elternzeit/<id>/ liegen
    const uploadsRoot = path.resolve(process.cwd(), "uploads");
    const expectedDir = path.resolve(uploadsRoot, "elternzeit", id);
    const resolved = path.resolve(doc.dateipfad);
    if (!resolved.startsWith(expectedDir + path.sep)) {
      return NextResponse.json(
        { error: "Ungueltiger Dateipfad" },
        { status: 400 },
      );
    }

    try {
      const buffer = await readFile(resolved);
      return new NextResponse(buffer as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": doc.mimeType || "application/octet-stream",
          "Content-Disposition": `inline; filename="${encodeURIComponent(doc.dateiname)}"`,
        },
      });
    } catch (readErr) {
      console.error("[API] dokumente GET Datei-Lesefehler:", readErr);
      return NextResponse.json(
        { error: "Datei konnte nicht gelesen werden" },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error("[API] dokumente GET fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!HR_EDIT_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id, docId } = await params;
    const doc = await prisma.elternzeitDokument.findUnique({
      where: { id: docId },
      include: { elternzeit: { select: { organizationId: true } } },
    });
    if (!doc || doc.elternzeitId !== id) {
      return NextResponse.json({ error: "Dokument nicht gefunden" }, { status: 404 });
    }
    if (!(await canAccessProcess(session, doc.elternzeit.organizationId))) {
      return NextResponse.json({ error: "Dokument nicht gefunden" }, { status: 404 });
    }

    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      null;

    // Datei vom Disk löschen (best effort)
    const uploadsRoot = path.resolve(process.cwd(), "uploads");
    const expectedDir = path.resolve(uploadsRoot, "elternzeit", id);
    const resolved = path.resolve(doc.dateipfad);
    if (resolved.startsWith(expectedDir + path.sep)) {
      await unlink(resolved).catch(() => {
        // Datei vielleicht schon weg — DB-Eintrag trotzdem entfernen
      });
    }

    await prisma.elternzeitDokument.delete({ where: { id: docId } });

    await prisma.auditLog.create({
      data: {
        elternzeitId: id,
        userId: session.userId,
        processType: "ELTERNZEIT",
        action: "DOCUMENT_DELETED",
        details: { docId, dokumentTyp: doc.dokumentTyp, dateiname: doc.dateiname },
        ipAddress,
      },
    });

    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    console.error("[API] dokumente DELETE fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
