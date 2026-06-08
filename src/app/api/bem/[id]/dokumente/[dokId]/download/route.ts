/**
 * API: GET /api/bem/[id]/dokumente/[dokId]/download
 *
 * Laedt ein BEM-Dokument herunter. Versiegelte Akte: Zugriff via
 * canAccessBemContent; der Download wird als Lese-Zugriff auditiert.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessBemContent } from "@/lib/permissions";
import { readUploadedFile } from "@/lib/file-upload";
import { logBemAudit, BEM_AUDIT_ACTIONS } from "@/lib/bem-audit";

function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

function asciiFilename(name: string): string {
  return name.replace(/[^\w\-.]/g, "_");
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; dokId: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    const { id, dokId } = await context.params;
    if (!(await canAccessBemContent(session, id))) {
      return NextResponse.json({ error: "Fall nicht gefunden" }, { status: 404 });
    }

    const dok = await prisma.bemDokument.findFirst({
      where: { id: dokId, bemFallId: id },
      select: { dateiname: true, dateipfad: true, mimeType: true, typ: true },
    });
    if (!dok) {
      return NextResponse.json({ error: "Dokument nicht gefunden" }, { status: 404 });
    }

    let buffer: Buffer;
    try {
      buffer = await readUploadedFile(dok.dateipfad);
    } catch {
      return NextResponse.json(
        { error: "Datei nicht gefunden (Speicher)" },
        { status: 404 },
      );
    }

    await logBemAudit({
      bemFallId: id,
      userId: session.userId,
      action: BEM_AUDIT_ACTIONS.AKTE_GEOEFFNET,
      details: { dokumentId: dokId, typ: dok.typ, aktion: "download" },
      ipAddress: clientIp(request),
    });

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": dok.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${asciiFilename(dok.dateiname)}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error) {
    console.error("[API] BEM Dokument Download fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
