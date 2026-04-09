/**
 * API: /api/mutterschutz/[id]/dokumente
 *
 * GET  – Dokumente eines Mutterschutz-Vorgangs auflisten
 * POST – Dokument hochladen (HR, multipart/form-data)
 *
 * Magic-Bytes-Validierung, max 10 MB, sichere Dateinamen.
 * Spiegelt das Pattern von /api/elternzeit/[id]/dokumente.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  HR_EDIT_ROLES,
  PORTAL_ROLES,
  canAccessProcess,
} from "@/lib/permissions";
import {
  sanitizeFilename,
  saveUploadedFile,
  validateUpload,
} from "@/lib/file-upload";
import { unlink } from "fs/promises";
import type { MutterschutzDokumentTyp } from "@prisma/client";

const VALID_DOC_TYPES: MutterschutzDokumentTyp[] = [
  "BAD_AUFFORDERUNG",
  "BAD_BESCHEINIGUNG",
  "GEFAEHRDUNGSBEURTEILUNG",
  "LOHNBESCHEINIGUNG_KK",
  "AERZTLICHES_ZEUGNIS",
  "SONSTIGES",
];

// =============================================
// GET – Dokumente auflisten
// =============================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!PORTAL_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id } = await params;

    const ms = await prisma.mutterschutzProzess.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    });
    if (!ms) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (!(await canAccessProcess(session, ms.organizationId))) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }

    const dokumente = await prisma.mutterschutzDokument.findMany({
      where: { mutterschutzId: id },
      orderBy: { hochgeladenAm: "desc" },
    });

    return NextResponse.json({ data: dokumente });
  } catch (error) {
    console.error("[API] mutterschutz/dokumente GET fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// =============================================
// POST – Dokument hochladen
// =============================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!HR_EDIT_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id } = await params;
    const ms = await prisma.mutterschutzProzess.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    });
    if (!ms) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (!(await canAccessProcess(session, ms.organizationId))) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }

    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      null;

    const formData = await request.formData();
    const file = formData.get("file");
    const dokumentTyp = formData.get("dokumentTyp");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Datei erforderlich" }, { status: 400 });
    }
    if (
      typeof dokumentTyp !== "string" ||
      !VALID_DOC_TYPES.includes(dokumentTyp as MutterschutzDokumentTyp)
    ) {
      return NextResponse.json(
        { error: "Ungueltiger Dokumenttyp" },
        { status: 400 },
      );
    }

    const validation = await validateUpload(file);
    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.error },
        { status: validation.status },
      );
    }

    const filename = sanitizeFilename(file.name);
    const filePath = await saveUploadedFile(
      validation.buffer,
      `mutterschutz/${id}`,
      filename,
    );

    let dokument;
    try {
      dokument = await prisma.mutterschutzDokument.create({
        data: {
          mutterschutzId: id,
          dokumentTyp: dokumentTyp as MutterschutzDokumentTyp,
          dateiname: file.name,
          dateipfad: filePath,
          mimeType: file.type,
          fileSize: file.size,
          generiert: false,
          hochgeladenVon: `${session.firstName} ${session.lastName}`,
        },
      });

      await prisma.auditLog.create({
        data: {
          mutterschutzId: id,
          userId: session.userId,
          processType: "MUTTERSCHUTZ",
          action: "DOCUMENT_UPLOADED",
          details: { dokumentTyp, dateiname: file.name, fileSize: file.size },
          ipAddress,
        },
      });
    } catch (dbError) {
      await unlink(filePath).catch(() => undefined);
      throw dbError;
    }

    return NextResponse.json({ data: dokument });
  } catch (error) {
    console.error("[API] mutterschutz/dokumente POST fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
