/**
 * API: /api/mutterschutz/[id]/bad-aufforderung
 *
 * GET – Erzeugt den BAD-Aufforderungsbrief als PDF, persistiert ihn als
 *       MutterschutzDokument (Typ BAD_AUFFORDERUNG) und liefert ihn aus.
 *
 * Mehrfach-Aufruf erlaubt: bei jedem Aufruf wird ein neues Dokument
 * angelegt — das DMS speichert die Versionen.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { EXPORT_ROLES, canAccessProcess } from "@/lib/permissions";
import { generateBADAufforderungsbrief } from "@/lib/elternzeit-pdf";
import { saveUploadedFile, sanitizeFilename } from "@/lib/file-upload";
import { unlink } from "fs/promises";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!EXPORT_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id } = await params;
    const ms = await prisma.mutterschutzProzess.findUnique({
      where: { id },
      include: {
        organization: {
          select: {
            name: true,
            mandantNumber: true,
            ezGfFirstName: true,
            ezGfLastName: true,
            ezGfTitle: true,
          },
        },
      },
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

    const generiertAm = new Date();
    const pdfBuffer = await generateBADAufforderungsbrief({
      firstName: ms.employeeFirstName,
      lastName: ms.employeeLastName,
      personalNr: ms.employeePersonalNr,
      // Mutterschutz haelt keine Dienstbezeichnung — bewusst null.
      dienstbezeichnung: null,
      organizationName: ms.organization.name,
      mandantNumber: ms.organization.mandantNumber,
      displayId: ms.displayId,
      voraussGeburt: ms.voraussGeburt,
      ezGfFirstName: ms.organization.ezGfFirstName,
      ezGfLastName: ms.organization.ezGfLastName,
      ezGfTitle: ms.organization.ezGfTitle,
      generiertAm,
    });

    // Persistieren als MutterschutzDokument
    const filename = sanitizeFilename(
      `${ms.displayId}_BAD_Aufforderung_${generiertAm.toISOString().slice(0, 10)}.pdf`,
    );
    const filePath = await saveUploadedFile(
      pdfBuffer,
      `mutterschutz/${id}`,
      filename,
    );

    try {
      await prisma.mutterschutzDokument.create({
        data: {
          mutterschutzId: id,
          dokumentTyp: "BAD_AUFFORDERUNG",
          dateiname: filename,
          dateipfad: filePath,
          mimeType: "application/pdf",
          fileSize: pdfBuffer.length,
          generiert: true,
          hochgeladenVon: `${session.firstName} ${session.lastName}`,
        },
      });

      await prisma.auditLog.create({
        data: {
          mutterschutzId: id,
          userId: session.userId,
          processType: "MUTTERSCHUTZ",
          action: "BAD_AUFFORDERUNG_GENERATED",
          details: { displayId: ms.displayId, filename },
          ipAddress,
        },
      });
    } catch (dbErr) {
      await unlink(filePath).catch(() => undefined);
      throw dbErr;
    }

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[API] mutterschutz/bad-aufforderung GET fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
