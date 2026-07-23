/**
 * API: GET /api/brief-vorlagen/erzeugt/[genId]/download?format=docx|pdf
 *
 * Laedt ein bereits erzeugtes Dokument herunter.
 *
 * Die Berechtigung wird hier ERNEUT geprueft und nicht aus dem vorherigen
 * Listenaufruf uebernommen — dieser Endpunkt ist direkt aufrufbar.
 * readUploadedFile stellt zusaetzlich sicher, dass der gespeicherte Pfad
 * unterhalb des uploads-Verzeichnisses liegt.
 */

import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { HR_EDIT_ROLES, canAccessOrg } from "@/lib/permissions";
import { readUploadedFile } from "@/lib/file-upload";
import { istModulUnterstuetzt, ladeVorgangsMandant } from "@/lib/erzeugte-dokumente-vorgang";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Content-Disposition vertraegt keine Umlaute — ASCII-Fallback. */
function asciiFilename(name: string): string {
  return name.replace(/[^\w\-.]/g, "_");
}

export const GET = apiHandler(
  { roles: HR_EDIT_ROLES, logLabel: "ErzeugtesDokument Download" },
  async ({ request, session, params }) => {
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") === "pdf" ? "pdf" : "docx";

    const dok = await prisma.generatedDocument.findUnique({
      where: { id: params.genId },
      select: { name: true, modul: true, refId: true, pfadDocx: true, pfadPdf: true },
    });
    if (!dok) {
      return NextResponse.json({ error: "Dokument nicht gefunden" }, { status: 404 });
    }

    // Versiegelte Akte — wie in der Liste.
    if (dok.modul === "BEM") {
      return NextResponse.json(
        { error: "BEM-Dokumente sind nur im BEM-Modul einsehbar." },
        { status: 403 },
      );
    }
    if (!dok.refId || !istModulUnterstuetzt(dok.modul)) {
      return NextResponse.json(
        { error: "Dokument gehört zu keinem abrufbaren Vorgang" },
        { status: 403 },
      );
    }

    const organizationId = await ladeVorgangsMandant(dok.modul, dok.refId);
    if (!organizationId) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (!(await canAccessOrg(session, organizationId))) {
      return NextResponse.json(
        { error: "Keine Berechtigung für diesen Vorgang" },
        { status: 403 },
      );
    }

    const pfad = format === "pdf" ? dok.pfadPdf : dok.pfadDocx;
    if (!pfad) {
      return NextResponse.json(
        { error: `Dieses Dokument liegt nicht als ${format.toUpperCase()} vor` },
        { status: 404 },
      );
    }

    let buffer: Buffer;
    try {
      buffer = await readUploadedFile(pfad);
    } catch {
      return NextResponse.json(
        { error: "Datei nicht gefunden (Speicher)" },
        { status: 404 },
      );
    }

    const dateiname = asciiFilename(`${dok.name}.${format}`);
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": format === "pdf" ? "application/pdf" : DOCX_MIME,
        "Content-Disposition": `attachment; filename="${dateiname}"`,
        "Content-Length": String(buffer.length),
      },
    });
  },
);
