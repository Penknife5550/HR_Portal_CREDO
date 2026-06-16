/**
 * Starterpaket-Markierung pro Mandant.
 *
 * GET /api/organizations/[id]/starterpaket
 *   Verfuegbare Pool-Dokumente fuer diesen Mandanten (global + eigene) inkl.
 *   Markierungs-Status + Reihenfolge.
 * PUT /api/organizations/[id]/starterpaket
 *   Setzt die komplette (geordnete) Auswahl des Mandanten neu (atomar).
 *
 * Berechtigung: SUPER_ADMIN / HR_LEITUNG.
 */
import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { ADMIN_ROLES } from "@/lib/permissions";
import {
  setStarterpaketAuswahlSchema,
  type SetStarterpaketAuswahl,
} from "@/lib/validations/starterpaket";

function clientIp(headers: Headers): string | null {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    null
  );
}

export const GET = apiHandler(
  { roles: ADMIN_ROLES, logLabel: "Starterpaket-Auswahl GET" },
  async ({ params, session }) => {
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    const { id } = params;

    const org = await prisma.organization.findUnique({
      where: { id },
      select: { id: true, name: true, mandantNumber: true },
    });
    if (!org) {
      return NextResponse.json({ error: "Mandant nicht gefunden" }, { status: 404 });
    }

    // Verfuegbar = globale Pool-Dokumente + die dieses Mandanten.
    const docs = await prisma.starterpaketDokument.findMany({
      where: { OR: [{ organizationId: null }, { organizationId: id }] },
      select: {
        id: true,
        name: true,
        beschreibung: true,
        organizationId: true,
        fileSize: true,
        isActive: true,
      },
    });
    const auswahl = await prisma.starterpaketAuswahl.findMany({
      where: { organizationId: id },
      select: { dokumentId: true, orderIndex: true },
    });
    const markMap = new Map(auswahl.map((a) => [a.dokumentId, a.orderIndex]));

    const documents = docs
      .map((d) => ({
        id: d.id,
        name: d.name,
        beschreibung: d.beschreibung,
        scope: d.organizationId ? ("MANDANT" as const) : ("GLOBAL" as const),
        fileSize: d.fileSize,
        isActive: d.isActive,
        marked: markMap.has(d.id),
        orderIndex: markMap.get(d.id) ?? null,
      }))
      // markierte zuerst (in Reihenfolge), dann unmarkierte alphabetisch
      .sort((a, b) => {
        if (a.marked && b.marked) return (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
        if (a.marked) return -1;
        if (b.marked) return 1;
        return a.name.localeCompare(b.name, "de");
      });

    return NextResponse.json({ data: { organization: org, documents } });
  },
);

export const PUT = apiHandler<SetStarterpaketAuswahl>(
  {
    roles: ADMIN_ROLES,
    bodySchema: setStarterpaketAuswahlSchema,
    logLabel: "Starterpaket-Auswahl PUT",
  },
  async ({ request, params, body, session }) => {
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    const { id } = params;

    const org = await prisma.organization.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!org) {
      return NextResponse.json({ error: "Mandant nicht gefunden" }, { status: 404 });
    }

    // Duplikate entfernen, Reihenfolge erhalten
    const ids = [...new Set(body.dokumentIds)];

    // Alle markierten Dokumente muessen fuer diesen Mandanten verfuegbar sein
    // (global oder mandantenspezifisch) — sonst koennte ein fremdes Mandanten-PDF
    // markiert werden.
    if (ids.length > 0) {
      const verfuegbar = await prisma.starterpaketDokument.count({
        where: {
          id: { in: ids },
          OR: [{ organizationId: null }, { organizationId: id }],
        },
      });
      if (verfuegbar !== ids.length) {
        return NextResponse.json(
          { error: "Mindestens ein Dokument ist fuer diesen Mandanten nicht verfuegbar." },
          { status: 400 },
        );
      }
    }

    await prisma.$transaction([
      prisma.starterpaketAuswahl.deleteMany({ where: { organizationId: id } }),
      ...(ids.length > 0
        ? [
            prisma.starterpaketAuswahl.createMany({
              data: ids.map((dokumentId, index) => ({
                organizationId: id,
                dokumentId,
                orderIndex: index,
              })),
            }),
          ]
        : []),
    ]);

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        processType: "STARTERPAKET",
        action: "STARTERPAKET_SELECTION_UPDATED",
        details: { organizationId: id, anzahl: ids.length },
        ipAddress: clientIp(request.headers),
      },
    });

    return NextResponse.json({ data: { organizationId: id, dokumentIds: ids } });
  },
);
