/**
 * Vorlagenbibliothek (E0) — Liste + Upload.
 *
 * GET  /api/brief-vorlagen        Liste der Vorlagen (HR-Rollen)
 * POST /api/brief-vorlagen        Neue .docx-Vorlage hochladen (SUPER_ADMIN + HR_LEITUNG)
 */

import { NextResponse } from "next/server";
import crypto from "crypto";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import {
  ADMIN_ROLES,
  HR_EDIT_ROLES,
  canAccessOrg,
  getAllowedOrgIds,
} from "@/lib/permissions";
import {
  validateDocxUpload,
  saveUploadedFile,
  sanitizeFilename,
} from "@/lib/file-upload";
import { extractPlaceholders, TemplateError } from "@/lib/doc-templates";
import { createTemplateMetaSchema } from "@/lib/validations/brief-vorlagen";

function clientIp(headers: Headers): string | null {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    null
  );
}

function formStr(value: FormDataEntryValue | null): string | undefined {
  if (typeof value === "string" && value.trim() !== "") return value;
  return undefined;
}

export const GET = apiHandler(
  { roles: HR_EDIT_ROLES, logLabel: "BriefVorlagen GET" },
  async ({ request, session }) => {
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("includeInactive") === "1";
    const modul = searchParams.get("modul")?.trim() || undefined;

    const where: Record<string, unknown> = {};
    if (!includeInactive) where.isActive = true;
    if (modul) where.modul = modul;

    // Mandanten-Scope: globale Rollen sehen alles; eingeschraenkte Rollen nur
    // globale Vorlagen (organizationId = null) + ihnen zugewiesene Mandanten.
    const allowedOrgIds = await getAllowedOrgIds(session);
    if (allowedOrgIds !== null) {
      where.OR = [
        { organizationId: null },
        { organizationId: { in: allowedOrgIds } },
      ];
    }

    const templates = await prisma.documentTemplate.findMany({
      where,
      orderBy: [{ modul: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        description: true,
        modul: true,
        originalName: true,
        fileSize: true,
        platzhalter: true,
        organizationId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        organization: { select: { name: true, mandantNumber: true } },
        createdBy: { select: { firstName: true, lastName: true } },
        _count: { select: { generatedDocuments: true } },
      },
    });

    return NextResponse.json({ data: templates });
  },
);

export const POST = apiHandler(
  { roles: ADMIN_ROLES, logLabel: "BriefVorlagen POST" },
  async ({ request, session }) => {
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Ungueltiger Upload (multipart erwartet)" },
        { status: 400 },
      );
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Keine Datei hochgeladen" },
        { status: 400 },
      );
    }

    const parsed = createTemplateMetaSchema.safeParse({
      name: formStr(form.get("name")),
      description: formStr(form.get("description")),
      modul: formStr(form.get("modul")),
      organizationId: formStr(form.get("organizationId")),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }
    const meta = parsed.data;

    // Datei validieren (.docx, Magic Bytes)
    const valid = await validateDocxUpload(file);
    if (!valid.ok) {
      return NextResponse.json({ error: valid.error }, { status: valid.status });
    }

    // Mandanten-Scope pruefen, falls gesetzt
    if (meta.organizationId) {
      const org = await prisma.organization.findUnique({
        where: { id: meta.organizationId },
        select: { id: true },
      });
      if (!org) {
        return NextResponse.json(
          { error: "Mandant nicht gefunden" },
          { status: 404 },
        );
      }
      if (!(await canAccessOrg(session, meta.organizationId))) {
        return NextResponse.json(
          { error: "Keine Berechtigung fuer diesen Mandanten" },
          { status: 403 },
        );
      }
    }

    // Platzhalter extrahieren (validiert zugleich die Vorlage)
    let platzhalter: string[];
    try {
      platzhalter = extractPlaceholders(valid.buffer);
    } catch (error) {
      if (error instanceof TemplateError) {
        return NextResponse.json(
          { error: error.message, details: error.details },
          { status: 400 },
        );
      }
      throw error;
    }

    // Datei speichern
    const filename = sanitizeFilename(file.name);
    const dateipfad = await saveUploadedFile(valid.buffer, "brief-vorlagen", filename);
    const hash = crypto.createHash("sha256").update(valid.buffer).digest("hex");

    const template = await prisma.documentTemplate.create({
      data: {
        name: meta.name,
        description: meta.description ?? null,
        modul: meta.modul,
        dateipfad,
        originalName: file.name,
        fileSize: valid.buffer.length,
        hash,
        platzhalter,
        organizationId: meta.organizationId ?? null,
        createdById: session.userId,
      },
      select: {
        id: true,
        name: true,
        description: true,
        modul: true,
        originalName: true,
        fileSize: true,
        platzhalter: true,
        organizationId: true,
        isActive: true,
        createdAt: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        processType: "DOCUMENT_TEMPLATE",
        action: "DOC_TEMPLATE_CREATED",
        details: {
          templateId: template.id,
          name: template.name,
          modul: template.modul,
          organizationId: template.organizationId,
          platzhalterCount: platzhalter.length,
        },
        ipAddress: clientIp(request.headers),
      },
    });

    return NextResponse.json({ data: template }, { status: 201 });
  },
);
