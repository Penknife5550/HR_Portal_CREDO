/**
 * Vorlagenbibliothek (E0) — einzelne Vorlage.
 *
 * GET    /api/brief-vorlagen/[id]   Detail (HR-Rollen)
 * PATCH  /api/brief-vorlagen/[id]   Metadaten aendern (SUPER_ADMIN + HR_LEITUNG)
 * DELETE /api/brief-vorlagen/[id]   Deaktivieren / Soft-Delete (SUPER_ADMIN + HR_LEITUNG)
 */

import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { ADMIN_ROLES, HR_EDIT_ROLES, canAccessOrg } from "@/lib/permissions";
import { updateTemplateSchema } from "@/lib/validations/brief-vorlagen";
import type { UpdateTemplateInput } from "@/lib/validations/brief-vorlagen";

function clientIp(headers: Headers): string | null {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    null
  );
}

export const GET = apiHandler(
  { roles: HR_EDIT_ROLES, logLabel: "BriefVorlage GET" },
  async ({ params, session }) => {
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    const { id } = params;
    const template = await prisma.documentTemplate.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        modul: true,
        originalName: true,
        fileSize: true,
        hash: true,
        platzhalter: true,
        organizationId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        organization: { select: { name: true, mandantNumber: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!template) {
      return NextResponse.json(
        { error: "Vorlage nicht gefunden" },
        { status: 404 },
      );
    }
    // Mandanten-gebundene Vorlage nur fuer berechtigte Mandanten sichtbar
    // (404 statt 403, um keine Existenz preiszugeben).
    if (
      template.organizationId &&
      !(await canAccessOrg(session, template.organizationId))
    ) {
      return NextResponse.json(
        { error: "Vorlage nicht gefunden" },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: template });
  },
);

export const PATCH = apiHandler<UpdateTemplateInput>(
  {
    roles: ADMIN_ROLES,
    bodySchema: updateTemplateSchema,
    logLabel: "BriefVorlage PATCH",
  },
  async ({ params, body, session, request }) => {
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    const { id } = params;
    const existing = await prisma.documentTemplate.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Vorlage nicht gefunden" },
        { status: 404 },
      );
    }

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

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.modul !== undefined) updateData.modul = body.modul;
    if (body.organizationId !== undefined)
      updateData.organizationId = body.organizationId;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;

    const template = await prisma.documentTemplate.update({
      where: { id },
      data: updateData,
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
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        processType: "DOCUMENT_TEMPLATE",
        action: "DOC_TEMPLATE_UPDATED",
        details: { templateId: id, changes: Object.keys(updateData) },
        ipAddress: clientIp(request.headers),
      },
    });

    return NextResponse.json({ data: template });
  },
);

export const DELETE = apiHandler(
  { roles: ADMIN_ROLES, logLabel: "BriefVorlage DELETE" },
  async ({ params, session, request }) => {
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    const { id } = params;
    const existing = await prisma.documentTemplate.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Vorlage nicht gefunden" },
        { status: 404 },
      );
    }

    await prisma.documentTemplate.update({
      where: { id },
      data: { isActive: false },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        processType: "DOCUMENT_TEMPLATE",
        action: "DOC_TEMPLATE_DELETED",
        details: { templateId: id },
        ipAddress: clientIp(request.headers),
      },
    });

    return NextResponse.json({ data: { id, isActive: false } });
  },
);
