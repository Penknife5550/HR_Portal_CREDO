/**
 * Starterpaket-Pool — einzelnes Dokument.
 *
 * PATCH  /api/starterpaket-dokumente/[dokId]   Name/Beschreibung/aktiv aendern
 * DELETE /api/starterpaket-dokumente/[dokId]   Entfernen (Soft-Delete falls markiert)
 *
 * Berechtigung: SUPER_ADMIN / HR_LEITUNG.
 */
import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { ADMIN_ROLES } from "@/lib/permissions";
import { deleteUploadedFile } from "@/lib/file-upload";
import {
  updateStarterpaketDokumentSchema,
  type UpdateStarterpaketDokument,
} from "@/lib/validations/starterpaket";

function clientIp(headers: Headers): string | null {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    null
  );
}

export const PATCH = apiHandler<UpdateStarterpaketDokument>(
  {
    roles: ADMIN_ROLES,
    bodySchema: updateStarterpaketDokumentSchema,
    logLabel: "Starterpaket-Dokument PATCH",
  },
  async ({ params, body, session }) => {
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    const { dokId } = params;
    const existing = await prisma.starterpaketDokument.findUnique({
      where: { id: dokId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Dokument nicht gefunden" }, { status: 404 });
    }

    const updated = await prisma.starterpaketDokument.update({
      where: { id: dokId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.beschreibung !== undefined ? { beschreibung: body.beschreibung } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
      select: {
        id: true,
        name: true,
        beschreibung: true,
        organizationId: true,
        isActive: true,
      },
    });

    return NextResponse.json({ data: updated });
  },
);

export const DELETE = apiHandler(
  { roles: ADMIN_ROLES, logLabel: "Starterpaket-Dokument DELETE" },
  async ({ request, params, session }) => {
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    const { dokId } = params;
    const existing = await prisma.starterpaketDokument.findUnique({
      where: { id: dokId },
      select: { id: true, dateipfad: true, _count: { select: { auswahl: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Dokument nicht gefunden" }, { status: 404 });
    }

    // In mindestens einem Mandanten-Starterpaket markiert -> NICHT hart loeschen
    // (Markierung/Historie erhalten), stattdessen deaktivieren.
    if (existing._count.auswahl > 0) {
      await prisma.starterpaketDokument.update({
        where: { id: dokId },
        data: { isActive: false },
      });
      await prisma.auditLog.create({
        data: {
          userId: session.userId,
          processType: "STARTERPAKET",
          action: "STARTERPAKET_DOC_DEACTIVATED",
          details: { dokumentId: dokId },
          ipAddress: clientIp(request.headers),
        },
      });
      return NextResponse.json({
        data: { deactivated: true },
        hinweis: "Dokument ist in Starterpaketen markiert — deaktiviert statt geloescht.",
      });
    }

    await prisma.starterpaketDokument.delete({ where: { id: dokId } });
    await deleteUploadedFile(existing.dateipfad);
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        processType: "STARTERPAKET",
        action: "STARTERPAKET_DOC_DELETED",
        details: { dokumentId: dokId },
        ipAddress: clientIp(request.headers),
      },
    });

    return NextResponse.json({ data: { deleted: true } });
  },
);
