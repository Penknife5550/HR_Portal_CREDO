/**
 * API: /api/elternzeit-antrag-endg/[token]/upload
 *
 * POST – Public-Upload der Geburtsurkunde via Magic Link Token 2.
 *        KEINE Authentifizierung — Token-basiert.
 *        Single-Use Token-Schutz greift erst beim Absenden des Antrags;
 *        hier darf der Mitarbeiter mehrfach hochladen (z.B. falsche Datei
 *        ersetzen). Ein erneuter Upload ersetzt nur die eigenen frueheren
 *        Uploads ueber den Link — eine von HR hochgeladene Geburtsurkunde bleibt.
 */

import { NextRequest, NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { sanitizeFilename, saveUploadedFile, validateUpload } from "@/lib/file-upload";
import { hashToken } from "@/lib/token-hash";
import { getClientIpOrNull } from "@/lib/rate-limit";

/**
 * `hochgeladenVon` der Uploads ueber den Link der Person (HR-Uploads tragen den
 * Namen der HR-Kraft). Der Wert steht seit dem ersten Stand des Moduls so in der
 * Datenbank und ist zugleich das Merkmal, an dem der Upload seine eigenen
 * frueheren Dateien erkennt — aendert er sich, ersetzt ein neuer Upload die
 * bestehenden Zeilen der Person nicht mehr.
 */
const HOCHGELADEN_VON_PERSON = "Mitarbeiter (Magic Link)";

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
      return NextResponse.json({ error: "Token ungültig" }, { status: 404 });
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

    // Eigene fruehere Geburtsurkunde ersetzen (Mitarbeiter darf korrigieren).
    // Wichtig: NEUE Datei zuerst speichern, dann in Transaktion DB-Eintraege
    // tauschen, ALTE Dateien erst nach erfolgreichem Commit löschen.
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
        // Nur Zeilen, die die Person selbst ueber den Link hochgeladen hat. Eine
        // Geburtsurkunde von HR (Reiter Dokumente) loeschte der Upload frueher
        // still mit — samt Datei. Zeilen OHNE `hochgeladenVon` bleiben ebenfalls
        // stehen: Beide Schreiber setzen das Feld seit jeher, eine Zeile ohne
        // stammt aus einem Handeingriff unbekannter Herkunft. Eine zu viel
        // behaltene Datei kann HR im Reiter Dokumente loeschen, eine zu viel
        // geloeschte ist unwiederbringlich weg (`= Wert` trifft in SQL kein NULL).
        const existing = await tx.elternzeitDokument.findMany({
          where: {
            elternzeitId: ez.id,
            dokumentTyp: "GEBURTSURKUNDE",
            hochgeladenVon: HOCHGELADEN_VON_PERSON,
          },
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
            hochgeladenVon: HOCHGELADEN_VON_PERSON,
          },
        });

        await tx.auditLog.create({
          data: {
            elternzeitId: ez.id,
            processType: "ELTERNZEIT",
            action: "GEBURTSURKUNDE_UPLOADED",
            details: { dateiname: file.name, fileSize: file.size },
            ipAddress: getClientIpOrNull(request),
          },
        });

        return created;
      });
    } catch (txError) {
      // Transaktion fehlgeschlagen → neue Datei aufraeumen, alte bleiben erhalten
      await unlink(newPath).catch(() => undefined);
      throw txError;
    }

    // Erst NACH erfolgreicher TX die alten Dateien physisch löschen
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
