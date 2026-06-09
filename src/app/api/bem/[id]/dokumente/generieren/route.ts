/**
 * API: POST /api/bem/[id]/dokumente/generieren
 *
 * Erzeugt aus einer BEM-Vorlage (DocumentTemplate, modul=BEM) ein Dokument und
 * legt es in der BEM-Akte ab (BemDokument). Versiegelte Akte: Zugriff via
 * canAccessBemContent. Die Ablage (Aktentrennung) wird aus dem Dokumenttyp
 * abgeleitet. PDF ist best-effort (Gotenberg); Word steht immer.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessBemContent } from "@/lib/permissions";
import { resolveBemPlaceholders } from "@/lib/bem-doc";
import { generateFromTemplate } from "@/lib/doc-generation";
import { saveUploadedFile, readUploadedFile, DOCX_MIME } from "@/lib/file-upload";
import { defaultAblage } from "@/lib/bem-aktentrennung";
import { logBemAudit, BEM_AUDIT_ACTIONS } from "@/lib/bem-audit";
import { dokumentGenerierenSchema } from "@/lib/validations/bem";
import type { DeckblattMeta } from "@/lib/pdf-deckblatt";
import type { BemDokumentTyp } from "@prisma/client";

function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

function slug(name: string): string {
  return (name.replace(/[^\w\-.]/g, "_").replace(/_+/g, "_").slice(0, 80) || "dokument");
}

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

    const body = await request.json().catch(() => null);
    const parsed = dokumentGenerierenSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }
    const d = parsed.data;

    const template = await prisma.documentTemplate.findUnique({
      where: { id: d.templateId },
      select: {
        id: true,
        name: true,
        modul: true,
        dateipfad: true,
        isActive: true,
        organizationId: true,
      },
    });
    if (!template || !template.isActive) {
      return NextResponse.json({ error: "Vorlage nicht gefunden" }, { status: 404 });
    }
    if (template.modul !== "BEM") {
      return NextResponse.json(
        { error: "Nur BEM-Vorlagen können hier erzeugt werden." },
        { status: 400 },
      );
    }

    const resolved = await resolveBemPlaceholders(id);
    if (!resolved) {
      return NextResponse.json({ error: "Fall nicht gefunden" }, { status: 404 });
    }

    // Multi-Tenant-Scope: eine mandantengebundene Vorlage darf NUR fuer einen
    // Fall desselben Mandanten verwendet werden (globale Vorlagen sind frei).
    if (template.organizationId && template.organizationId !== resolved.organizationId) {
      return NextResponse.json(
        { error: "Diese Vorlage gehört zu einem anderen Mandanten." },
        { status: 403 },
      );
    }

    let templateBuffer: Buffer;
    try {
      templateBuffer = await readUploadedFile(template.dateipfad);
    } catch {
      return NextResponse.json(
        { error: "Vorlagendatei nicht gefunden (Speicher)" },
        { status: 500 },
      );
    }

    const data: Record<string, unknown> = { ...resolved.data, ...(d.values || {}) };
    const wantPdf = d.format === "pdf";

    const deckblatt: DeckblattMeta = {
      dokumentName: template.name,
      modul: "BEM",
      vorlageName: template.name,
      mandantName: resolved.organizationName ?? undefined,
      mandantNumber: resolved.mandantNumber ?? undefined,
      refId: id,
      empfaenger: resolved.empfaenger,
      erstelltAm: new Date().toLocaleDateString("de-DE"),
      erstelltVon: `${session.firstName} ${session.lastName}`.trim(),
    };

    const result = await generateFromTemplate(templateBuffer, data, {
      wantPdf,
      withDeckblatt: true,
      deckblatt,
      filename: `${slug(template.name)}.docx`,
    });

    if (wantPdf && !result.pdf) {
      return NextResponse.json(
        {
          error:
            "PDF konnte nicht erzeugt werden (Konvertierungsdienst nicht erreichbar). " +
            "Bitte als Word erzeugen.",
          detail: result.pdfError,
        },
        { status: 502 },
      );
    }

    const genId = crypto.randomUUID();
    const dateStr = new Date().toISOString().slice(0, 10);
    const base = `${slug(template.name)}_${dateStr}`;
    const subdir = `bem/${id}/dokumente/${genId}`;

    const buffer = wantPdf ? (result.pdf as Buffer) : result.docx;
    const ext = wantPdf ? "pdf" : "docx";
    const mime = wantPdf ? "application/pdf" : DOCX_MIME;
    const dateiname = `${base}.${ext}`;
    const pfad = await saveUploadedFile(buffer, subdir, dateiname);
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    const ablage = defaultAblage(d.typ as BemDokumentTyp);

    const dok = await prisma.bemDokument.create({
      data: {
        bemFallId: id,
        typ: d.typ as BemDokumentTyp,
        ablage,
        quelle: "GENERIERT",
        dateiname,
        dateipfad: pfad,
        mimeType: mime,
        fileSize: buffer.length,
        hash,
        createdById: session.userId,
      },
      select: { id: true },
    });

    await logBemAudit({
      bemFallId: id,
      userId: session.userId,
      action: BEM_AUDIT_ACTIONS.DOKUMENT_GENERIERT,
      details: {
        dokumentId: dok.id,
        typ: d.typ,
        ablage,
        templateId: template.id,
        format: ext,
        missingPlaceholders: result.missing,
      },
      ipAddress: clientIp(request),
    });

    return NextResponse.json(
      {
        data: {
          id: dok.id,
          ablage,
          missing: result.missing,
          format: ext,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[API] BEM Dokument generieren fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
