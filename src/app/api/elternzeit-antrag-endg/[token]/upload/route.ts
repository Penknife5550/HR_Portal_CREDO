/**
 * API: /api/elternzeit-antrag-endg/[token]/upload
 *
 * POST – Public-Upload der Geburtsurkunde via Magic Link Token 2.
 *        KEINE Authentifizierung — Token-basiert.
 *        Single-Use Token-Schutz greift erst beim Absenden des Antrags;
 *        hier darf der Mitarbeiter mehrfach hochladen (z.B. falsche Datei
 *        ersetzen). Doppelte Uploads ersetzen das vorhandene Dokument.
 */

import { NextRequest, NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { sanitizeFilename, saveUploadedFile, validateUpload } from "@/lib/file-upload";
import { hashToken } from "@/lib/token-hash";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const tokenHash = hashToken(token);

    const ez = await prisma.elternzeitProzess.findUnique({
      where: { antragTokenEndg: tokenHash },
      select: {
        id: true,
        antragTokenEndgExpiry: true,
        antragTokenEndgUsedAt: true,
      },
    });
    if (!ez) {
      return NextResponse.json({ error: "Token ungueltig" }, { status: 404 });
    }
    if (ez.antragTokenEndgExpiry && new Date() > ez.antragTokenEndgExpiry) {
      return NextResponse.json({ error: "Token abgelaufen" }, { status: 403 });
    }
    if (ez.antragTokenEndgUsedAt) {
      return NextResponse.json(
        { error: "Antrag wurde bereits eingereicht — Upload nicht mehr moeglich" },
        { status: 410 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Datei erforderlich" }, { status: 400 });
    }

    const validation = await validateUpload(file);
    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.error },
        { status: validation.status },
      );
    }

    // Bestehende Geburtsurkunde ersetzen (Mitarbeiter darf korrigieren).
    // Wichtig: NEUE Datei zuerst speichern, dann in Transaktion DB-Eintraege
    // tauschen, ALTE Dateien erst nach erfolgreichem Commit loeschen.
    // Verhindert Datenverlust falls zwischen Delete und Save ein Crash passiert.
    const newFilename = sanitizeFilename(file.name);
    const newPath = await saveUploadedFile(
      validation.buffer,
      `elternzeit/${ez.id}`,
      newFilename,
    );

    const filesToCleanup: string[] = [];
    let dokument;
    try {
      dokument = await prisma.$transaction(async (tx) => {
        const existing = await tx.elternzeitDokument.findMany({
          where: { elternzeitId: ez.id, dokumentTyp: "GEBURTSURKUNDE" },
        });
        for (const old of existing) {
          filesToCleanup.push(old.dateipfad);
          await tx.elternzeitDokument.delete({ where: { id: old.id } });
        }

        const created = await tx.elternzeitDokument.create({
          data: {
            elternzeitId: ez.id,
            dokumentTyp: "GEBURTSURKUNDE",
            dateiname: file.name,
            dateipfad: newPath,
            mimeType: file.type,
            fileSize: file.size,
            generiert: false,
            hochgeladenVon: "Mitarbeiter (Magic Link)",
          },
        });

        await tx.auditLog.create({
          data: {
            elternzeitId: ez.id,
            processType: "ELTERNZEIT",
            action: "GEBURTSURKUNDE_UPLOADED",
            details: { dateiname: file.name, fileSize: file.size },
            ipAddress:
              request.headers.get("x-forwarded-for") ||
              request.headers.get("x-real-ip") ||
              null,
          },
        });

        return created;
      });
    } catch (txError) {
      // Transaktion fehlgeschlagen → neue Datei aufraeumen, alte bleiben erhalten
      await unlink(newPath).catch(() => undefined);
      throw txError;
    }

    // Erst NACH erfolgreicher TX die alten Dateien physisch loeschen
    const uploadsRoot = path.resolve(process.cwd(), "uploads");
    const expectedDir = path.resolve(uploadsRoot, "elternzeit", ez.id);
    for (const oldPath of filesToCleanup) {
      const resolved = path.resolve(oldPath);
      if (resolved.startsWith(expectedDir + path.sep)) {
        await unlink(resolved).catch(() => undefined);
      }
    }

    return NextResponse.json({
      data: { id: dokument.id, dateiname: dokument.dateiname },
    });
  } catch (error) {
    console.error("[API] elternzeit-antrag-endg upload fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
