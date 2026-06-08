/**
 * Vorlagenbibliothek (E0) — Dokument aus Vorlage erzeugen.
 *
 * POST /api/brief-vorlagen/[id]/generate
 * Body (JSON):
 *   format: "docx" | "pdf" | "mail"
 *   organizationId?  Mandant fuer Platzhalter/Scope
 *   refId?           Bezug (z.B. bemFallId)
 *   values?          manuelle Platzhalter-Werte (ueberschreiben Resolver)
 *   withDeckblatt?   DMS-Deckblatt vor PDF (Default true)
 *   email?           { to, subject?, message? } — nur bei format=mail
 *
 * Rueckgabe:
 *   docx/pdf -> Datei (Content-Disposition: attachment)
 *   mail     -> JSON { sent, missing, attached, pdfWarning? }
 */

import { NextResponse } from "next/server";
import crypto from "crypto";
import { readFile } from "fs/promises";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { HR_EDIT_ROLES, canAccessOrg } from "@/lib/permissions";
import {
  generateSchema,
  type GenerateInput,
} from "@/lib/validations/brief-vorlagen";
import { getResolver } from "@/lib/doc-template-resolvers";
import { generateFromTemplate } from "@/lib/doc-generation";
import { saveUploadedFile } from "@/lib/file-upload";
import { sendEmail } from "@/lib/mailer";
import type { DeckblattMeta } from "@/lib/pdf-deckblatt";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function clientIp(headers: Headers): string | null {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    null
  );
}

function todayDe(): string {
  return new Date().toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function slugify(name: string): string {
  return (
    name
      .replace(/["\n\r]/g, "")
      .replace(/[^\w\-.]/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 80) || "dokument"
  );
}

function asciiFilename(name: string): string {
  // Content-Disposition vertraegt keine Umlaute -> ASCII-Fallback
  return name.replace(/[^\w\-.]/g, "_");
}

export const POST = apiHandler<GenerateInput>(
  {
    roles: HR_EDIT_ROLES,
    bodySchema: generateSchema,
    logLabel: "BriefVorlage generate",
  },
  async ({ params, body, session, request }) => {
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    const { id } = params;

    const template = await prisma.documentTemplate.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        modul: true,
        dateipfad: true,
        organizationId: true,
        isActive: true,
      },
    });
    if (!template) {
      return NextResponse.json(
        { error: "Vorlage nicht gefunden" },
        { status: 404 },
      );
    }
    if (!template.isActive) {
      return NextResponse.json(
        { error: "Vorlage ist deaktiviert" },
        { status: 409 },
      );
    }

    // Versiegelte Akte: BEM-Vorlagen duerfen NICHT ueber den generischen
    // (nur rollengeschuetzten) E0-Endpunkt erzeugt werden — sonst koennte ein
    // HR-Account ohne Fall-Freigabe BEM-Bezuege erzeugen. BEM-Dokumente werden
    // ausschliesslich ueber /api/bem/[id]/dokumente/generieren erstellt
    // (canAccessBemContent).
    if (template.modul === "BEM") {
      return NextResponse.json(
        {
          error:
            "BEM-Vorlagen werden ausschliesslich im BEM-Modul (versiegelte Akte) erzeugt.",
        },
        { status: 403 },
      );
    }

    // Mandant der Vorlage pruefen (falls vorlagen-gebunden)
    if (
      template.organizationId &&
      !(await canAccessOrg(session, template.organizationId))
    ) {
      return NextResponse.json(
        { error: "Keine Berechtigung fuer diese Vorlage" },
        { status: 403 },
      );
    }

    // Effektiver Mandant fuer Platzhalter/Deckblatt
    const effectiveOrgId = body.organizationId || template.organizationId || null;
    if (body.organizationId) {
      const org = await prisma.organization.findUnique({
        where: { id: body.organizationId },
        select: { id: true },
      });
      if (!org) {
        return NextResponse.json(
          { error: "Mandant nicht gefunden" },
          { status: 404 },
        );
      }
      if (!(await canAccessOrg(session, body.organizationId))) {
        return NextResponse.json(
          { error: "Keine Berechtigung fuer diesen Mandanten" },
          { status: 403 },
        );
      }
    }

    // Vorlagendatei laden
    let templateBuffer: Buffer;
    try {
      templateBuffer = await readFile(template.dateipfad);
    } catch {
      return NextResponse.json(
        { error: "Vorlagendatei nicht gefunden (Speicher)" },
        { status: 500 },
      );
    }

    // Platzhalter aufloesen (Resolver) + manuelle Werte (override)
    const resolver = getResolver(template.modul);
    const { data: resolverData, sensitiveFields } = await resolver({
      organizationId: effectiveOrgId,
      refId: body.refId ?? null,
      session,
      ipAddress: clientIp(request.headers),
    });
    const data: Record<string, unknown> = {
      ...resolverData,
      ...(body.values || {}),
    };

    // Deckblatt-Metadaten
    let orgMeta: { name: string; mandantNumber: string } | null = null;
    if (effectiveOrgId) {
      orgMeta = await prisma.organization.findUnique({
        where: { id: effectiveOrgId },
        select: { name: true, mandantNumber: true },
      });
    }
    // Empfaenger aus den GEMERGTEN Daten ableiten (Resolver-Werte + manuelle
    // Eingaben), damit das Deckblatt/QR auch ohne manuelle Eingabe befuellt ist.
    const dataStr = (key: string): string | undefined => {
      const v = data[key];
      return typeof v === "string" && v.trim() !== "" ? v : undefined;
    };
    const empfaenger =
      [dataStr("vorname"), dataStr("nachname")].filter(Boolean).join(" ") ||
      dataStr("empfaenger") ||
      undefined;

    const deckblatt: DeckblattMeta = {
      dokumentName: template.name,
      modul: template.modul,
      vorlageName: template.name,
      mandantName: orgMeta?.name,
      mandantNumber: orgMeta?.mandantNumber,
      refId: body.refId ?? undefined,
      empfaenger,
      erstelltAm: todayDe(),
      erstelltVon: `${session.firstName} ${session.lastName}`.trim(),
    };

    const baseName = slugify(template.name);
    const dateStr = new Date().toISOString().slice(0, 10);
    const wantPdf = body.format === "pdf" || body.format === "mail";

    const result = await generateFromTemplate(templateBuffer, data, {
      wantPdf,
      withDeckblatt: body.withDeckblatt !== false,
      deckblatt,
      filename: `${baseName}.docx`,
    });

    // Bei reinem PDF-Download ist ein PDF-Fehler hart (Gotenberg nicht erreichbar)
    if (body.format === "pdf" && !result.pdf) {
      return NextResponse.json(
        {
          error:
            "PDF konnte nicht erzeugt werden (Konvertierungsdienst nicht erreichbar). " +
            "Word-Download steht weiterhin zur Verfuegung.",
          detail: result.pdfError,
        },
        { status: 502 },
      );
    }

    // Bei format=mail ZUERST versenden — schlaegt der Versand fehl, wird KEIN
    // (irrefuehrender) GeneratedDocument-/Audit-Eintrag mit "DOC_GENERATED"
    // persistiert. So bleibt der DMS-/Audit-Trail wahrheitsgemaess.
    let mailAttached: string[] = [];
    if (body.format === "mail") {
      const email = body.email!;
      const attachments = [
        {
          filename: `${baseName}_${dateStr}.docx`,
          content: result.docx,
          contentType: DOCX_MIME,
        },
      ];
      if (result.pdf) {
        attachments.unshift({
          filename: `${baseName}_${dateStr}.pdf`,
          content: result.pdf,
          contentType: "application/pdf",
        });
      }

      const subject =
        email.subject?.trim() || `CREDO HR-Portal: ${template.name}`;
      const message =
        email.message?.trim() ||
        `Im Anhang finden Sie das Dokument "${template.name}".`;
      const html = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #1a1a1a;">${message
        .split("\n")
        .map((l) => `<p>${l || "&nbsp;"}</p>`)
        .join("")}</div>`;

      const sent = await sendEmail({
        to: email.to,
        subject,
        html,
        text: message,
        attachments,
      });

      if (!sent) {
        return NextResponse.json(
          {
            error:
              "E-Mail konnte nicht versendet werden (SMTP nicht konfiguriert oder Fehler).",
            missing: result.missing,
          },
          { status: 502 },
        );
      }
      mailAttached = attachments.map((a) => a.filename);
    }

    // Erzeugte Dateien persistieren (DMS / Audit) — bei mail erst NACH Versand
    const genId = crypto.randomUUID();
    const subdir = `brief-vorlagen-generiert/${genId}`;
    const docxHash = crypto
      .createHash("sha256")
      .update(result.docx)
      .digest("hex");

    const pfadDocx = await saveUploadedFile(
      result.docx,
      subdir,
      `${baseName}_${dateStr}.docx`,
    );
    let pfadPdf: string | null = null;
    if (result.pdf) {
      pfadPdf = await saveUploadedFile(
        result.pdf,
        subdir,
        `${baseName}_${dateStr}.pdf`,
      );
    }

    const generated = await prisma.generatedDocument.create({
      data: {
        templateId: template.id,
        name: `${template.name} (${dateStr})`,
        modul: template.modul,
        refId: body.refId ?? null,
        organizationId: effectiveOrgId,
        pfadDocx,
        pfadPdf,
        hash: docxHash,
        missingPlaceholders: result.missing,
        createdById: session.userId,
      },
      select: { id: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        processType: "DOCUMENT_TEMPLATE",
        action: "DOC_GENERATED",
        details: {
          generatedDocumentId: generated.id,
          templateId: template.id,
          modul: template.modul,
          format: body.format,
          organizationId: effectiveOrgId,
          refId: body.refId ?? null,
          missingPlaceholders: result.missing,
          sensitiveFields,
          ...(body.format === "mail"
            ? { mailSent: true, mailTo: body.email!.to, pdfAttached: !!result.pdf }
            : {}),
        },
        ipAddress: clientIp(request.headers),
      },
    });

    // --- Ausgabe ---
    if (body.format === "docx") {
      const filename = asciiFilename(`${baseName}_${dateStr}.docx`);
      return new NextResponse(result.docx as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": DOCX_MIME,
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": String(result.docx.length),
          "X-Missing-Placeholders": String(result.missing.length),
        },
      });
    }

    if (body.format === "pdf") {
      const filename = asciiFilename(`${baseName}_${dateStr}.pdf`);
      const pdf = result.pdf as Buffer;
      return new NextResponse(pdf as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": String(pdf.length),
          "X-Missing-Placeholders": String(result.missing.length),
        },
      });
    }

    // format === "mail" — PDF konnte ggf. nicht erzeugt werden (Gotenberg down);
    // dann wurde nur Word angehaengt. pdfMissing macht das fuer die UI sichtbar.
    return NextResponse.json({
      data: {
        sent: true,
        to: body.email!.to,
        attached: mailAttached,
        missing: result.missing,
        pdfMissing: !result.pdf,
        pdfWarning: result.pdfError || undefined,
        generatedDocumentId: generated.id,
      },
    });
  },
);
