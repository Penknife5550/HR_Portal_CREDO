/**
 * API: POST /api/bem/[id]/einwilligung/papier  (multipart)
 *
 * Erfasst eine auf Papier erteilte Einwilligung: Scan-Upload + Anlage einer
 * BemEinwilligung (ERTEILT) und eines BemDokuments (Quelle UPLOAD, Ablage
 * NUR_BEM). Versiegelte Akte: Zugriff via canAccessBemContent.
 */

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessBemContent } from "@/lib/permissions";
import { validateUpload, saveUploadedFile, sanitizeFilename } from "@/lib/file-upload";
import { logBemAudit, BEM_AUDIT_ACTIONS } from "@/lib/bem-audit";

function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

const ERLAUBTE_ARTEN = ["DATENSCHUTZ", "DURCHFUEHRUNG"];

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    const { id } = await context.params;
    if (!(await canAccessBemContent(session, id))) {
      return NextResponse.json({ error: "Fall nicht gefunden" }, { status: 404 });
    }

    const form = await request.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: "Ungueltiger Upload" }, { status: 400 });
    }
    const file = form.get("file");
    const art = String(form.get("art") || "DATENSCHUTZ");
    const signedName = String(form.get("signedName") || "").trim();
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Keine Datei uebergeben" }, { status: 400 });
    }
    if (!ERLAUBTE_ARTEN.includes(art)) {
      return NextResponse.json({ error: "Ungueltige Einwilligungsart" }, { status: 400 });
    }

    const valid = await validateUpload(file);
    if (!valid.ok) {
      return NextResponse.json({ error: valid.error }, { status: valid.status });
    }

    const filename = sanitizeFilename(file.name);
    const pfad = await saveUploadedFile(valid.buffer, `bem/${id}/einwilligung`, filename);
    const hash = createHash("sha256").update(valid.buffer).digest("hex");
    const now = new Date();
    const ipAddress = clientIp(request);

    const result = await prisma.$transaction(async (tx) => {
      const dok = await tx.bemDokument.create({
        data: {
          bemFallId: id,
          typ: "DATENSCHUTZVEREINBARUNG",
          ablage: "NUR_BEM",
          quelle: "UPLOAD",
          dateiname: file.name,
          dateipfad: pfad,
          mimeType: file.type,
          fileSize: file.size,
          hash,
          createdById: session.userId,
        },
        select: { id: true },
      });
      const einw = await tx.bemEinwilligung.create({
        data: {
          bemFallId: id,
          art: art as "DATENSCHUTZ" | "DURCHFUEHRUNG",
          status: "ERTEILT",
          signedAt: now,
          signedName: signedName || null,
          dokumentHash: hash,
        },
        select: { id: true },
      });
      // Fall-Status fortschreiben (aus ANGELEGT oder EINLADUNG_VERSENDET).
      await tx.bemFall.updateMany({
        where: { id, status: { in: ["ANGELEGT", "EINLADUNG_VERSENDET"] } },
        data: { status: "EINWILLIGUNG_ERTEILT", eingangsweg: "PAPIER", datenschutzAm: now },
      });
      return { dokId: dok.id, einwId: einw.id };
    });

    await logBemAudit({
      bemFallId: id,
      userId: session.userId,
      action: BEM_AUDIT_ACTIONS.EINWILLIGUNG_ERTEILT,
      details: {
        einwilligungId: result.einwId,
        dokumentId: result.dokId,
        weg: "PAPIER",
        art,
      },
      ipAddress,
    });

    return NextResponse.json({ data: { ok: true, ...result } }, { status: 201 });
  } catch (error) {
    console.error("[API] BEM Einwilligung Papier fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
