/**
 * API: POST /api/bem/[id]/dokumente/upload  (multipart)
 *
 * Laedt ein beliebiges Dokument in die BEM-Akte hoch (z.B. ein vom Mitarbeiter
 * mitgebrachtes Attest/AU oder eine intern erstellte Unterlage). Versiegelte
 * Akte: Zugriff via canAccessBemContent. Magic-Bytes-Validierung; Ablage gemaess
 * Aktentrennung aus dem gewaehlten Typ.
 */

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canMutateBemContent } from "@/lib/permissions";
import { validateUpload, saveUploadedFile, sanitizeFilename } from "@/lib/file-upload";
import { defaultAblage } from "@/lib/bem-aktentrennung";
import { logBemAudit, BEM_AUDIT_ACTIONS } from "@/lib/bem-audit";
import type { BemDokumentTyp } from "@prisma/client";

function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

// Beim Upload erlaubte Typen (NICHT EINLADUNG/GESAMT_EXPORT — die entstehen
// ausschliesslich systemseitig).
const ERLAUBTE_TYPEN: BemDokumentTyp[] = [
  "ATTEST",
  "DATENSCHUTZVEREINBARUNG",
  "ERSTGESPRAECH_PROTOKOLL",
  "FOLGEGESPRAECH_PROTOKOLL",
  "GEDAECHTNISPROTOKOLL",
  "MASSNAHMENPLAN",
  "ABSCHLUSSERKLAERUNG",
  "ABBRUCHERKLAERUNG",
  "BEENDIGUNGSERKLAERUNG",
  "SONSTIGES",
];

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
    if (!(await canMutateBemContent(session, id))) {
      return NextResponse.json({ error: "Fall nicht gefunden" }, { status: 404 });
    }

    const form = await request.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: "Ungültiger Upload" }, { status: 400 });
    }
    const file = form.get("file");
    const typ = String(form.get("typ") || "SONSTIGES") as BemDokumentTyp;
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Keine Datei übergeben" }, { status: 400 });
    }
    if (!ERLAUBTE_TYPEN.includes(typ)) {
      return NextResponse.json({ error: "Ungültiger Dokumenttyp" }, { status: 400 });
    }

    const valid = await validateUpload(file);
    if (!valid.ok) {
      return NextResponse.json({ error: valid.error }, { status: valid.status });
    }

    const filename = sanitizeFilename(file.name);
    const pfad = await saveUploadedFile(valid.buffer, `bem/${id}/dokumente/upload`, filename);
    const hash = createHash("sha256").update(valid.buffer).digest("hex");
    const ablage = defaultAblage(typ);

    const dok = await prisma.bemDokument.create({
      data: {
        bemFallId: id,
        typ,
        ablage,
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

    await logBemAudit({
      bemFallId: id,
      userId: session.userId,
      action: BEM_AUDIT_ACTIONS.DOKUMENT_HOCHGELADEN,
      details: { dokumentId: dok.id, typ, ablage, dateiname: file.name },
      ipAddress: clientIp(request),
    });

    return NextResponse.json({ data: { id: dok.id, ablage } }, { status: 201 });
  } catch (error) {
    console.error("[API] BEM Dokument Upload fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
