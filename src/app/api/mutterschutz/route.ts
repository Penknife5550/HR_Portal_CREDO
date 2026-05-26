/**
 * API: /api/mutterschutz
 *
 * GET  – Alle Mutterschutz-Vorgaenge auflisten (mit Filtern, Pagination, Org-Scope)
 * POST – Neuen Mutterschutz-Vorgang anlegen
 *
 * Phase 1 MVP — Mutterschutz & Elternzeit
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  orgFilter,
  PORTAL_ROLES,
  PROCESS_CREATE_ROLES,
  canAccessOrg,
} from "@/lib/permissions";
import { createMutterschutzSchema } from "@/lib/validations/elternzeit";
import {
  berechneMutterschutzBeginn,
  generateMutterschutzDisplayId,
} from "@/lib/elternzeit-helpers";
import { getMutterschutzCheckliste } from "@/lib/elternzeit-checkliste-template";
import { triggerWebhooks } from "@/lib/webhooks";
import { formatEmployeeName } from "@/lib/format";

// =============================================
// GET /api/mutterschutz – Liste
// =============================================
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!PORTAL_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const organizationId = searchParams.get("organizationId");
    const search = searchParams.get("search")?.trim();
    const page = Math.max(parseInt(searchParams.get("page") || "1"), 1);
    const rawLimit = parseInt(searchParams.get("limit") || "50");
    const limit = Math.min(Math.max(isNaN(rawLimit) ? 50 : rawLimit, 1), 200);
    const skip = (page - 1) * limit;

    // Basis-Where ohne Status — wird für KPI-Counts verwendet,
    // damit die Kacheln nicht vom aktuell aktiven Status-Filter abhaengen.
    const baseWhere: Record<string, unknown> = {
      ...(await orgFilter(session)),
    };
    if (organizationId) baseWhere.organizationId = organizationId;
    if (search) {
      baseWhere.OR = [
        { displayId: { contains: search, mode: "insensitive" } },
        { employeeFirstName: { contains: search, mode: "insensitive" } },
        { employeeLastName: { contains: search, mode: "insensitive" } },
        { employeeEmail: { contains: search, mode: "insensitive" } },
      ];
    }
    const where: Record<string, unknown> = { ...baseWhere };
    if (status) where.status = status;

    const [items, total, statusCountsRaw] = await Promise.all([
      prisma.mutterschutzProzess.findMany({
        where,
        include: {
          organization: {
            select: { id: true, name: true, mandantNumber: true, type: true },
          },
          _count: {
            select: { dokumente: true, checklistItems: true, elternzeitProzesse: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.mutterschutzProzess.count({ where }),
      prisma.mutterschutzProzess.groupBy({
        by: ["status"],
        where: baseWhere,
        _count: { status: true },
      }),
    ]);

    const statusCounts: Record<string, number> = {};
    for (const sc of statusCountsRaw) {
      statusCounts[sc.status] = sc._count.status;
    }

    return NextResponse.json({
      data: items,
      total,
      page,
      limit,
      statusCounts,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("[API] Mutterschutz GET fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// =============================================
// POST /api/mutterschutz – Anlegen
// =============================================
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!PROCESS_CREATE_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = createMutterschutzSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    const {
      employeeFirstName,
      employeeLastName,
      employeeEmail,
      employeePersonalNr,
      employeeId,
      organizationId,
      voraussGeburt,
      einrichtungstyp,
      badErforderlich,
      personalgruppe,
    } = parsed.data;

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org) {
      return NextResponse.json(
        { error: "Organisation nicht gefunden" },
        { status: 404 },
      );
    }
    if (!(await canAccessOrg(session, organizationId))) {
      return NextResponse.json(
        { error: "Organisation nicht gefunden" },
        { status: 404 },
      );
    }

    const shortName = org.shortName || org.mandantNumber;
    const { displayId, sequentialNumber } = await generateMutterschutzDisplayId(
      organizationId,
      shortName,
    );

    const voraussGeburtDate = new Date(voraussGeburt);
    const mutterschutzBeginn = berechneMutterschutzBeginn(voraussGeburtDate);

    // BAD-Pflicht: bei Kita standardmaessig true, sonst per Body
    const badPflicht =
      einrichtungstyp === "KITA" ? true : (badErforderlich ?? false);

    const checklistTemplate = getMutterschutzCheckliste(badPflicht, personalgruppe);

    const created = await prisma.$transaction(async (tx) => {
      const ms = await tx.mutterschutzProzess.create({
        data: {
          displayId,
          sequentialNumber,
          organizationId,
          initiatedById: session.userId,
          employeeId: employeeId || null,
          employeeFirstName,
          employeeLastName,
          employeeEmail,
          employeePersonalNr: employeePersonalNr || null,
          voraussGeburt: voraussGeburtDate,
          mutterschutzBeginn,
          einrichtungstyp,
          badErforderlich: badPflicht,
          status: "GEMELDET",
        },
      });

      await tx.mutterschutzChecklistItem.createMany({
        data: checklistTemplate.map((item) => ({
          mutterschutzId: ms.id,
          titel: item.titel,
          beschreibung: item.beschreibung || null,
          logaHinweis: item.logaHinweis || null,
          personalgruppe: item.personalgruppe,
          orderIndex: item.orderIndex,
        })),
      });

      await tx.auditLog.create({
        data: {
          mutterschutzId: ms.id,
          userId: session.userId,
          processType: "MUTTERSCHUTZ",
          action: "MUTTERSCHUTZ_CREATED",
          details: {
            displayId,
            employeeName: `${employeeFirstName} ${employeeLastName}`,
            organization: org.name,
            voraussGeburt,
            badErforderlich: badPflicht,
          },
        },
      });

      return ms;
    });

    triggerWebhooks("mutterschutz-angelegt", {
      mutterschutzId: created.id,
      displayId: created.displayId,
      employeeEmail: created.employeeEmail,
      employeeName: formatEmployeeName(created),
      organization: org.name,
      mandantNumber: org.mandantNumber,
      voraussGeburt: created.voraussGeburt.toISOString(),
      mutterschutzBeginn: created.mutterschutzBeginn.toISOString(),
    }).catch((err) =>
      console.error(
        "[mutterschutz-angelegt] Webhook-Fehler:",
        err instanceof Error ? err.message : err,
      ),
    );

    const result = await prisma.mutterschutzProzess.findUnique({
      where: { id: created.id },
      include: {
        organization: true,
        checklistItems: { orderBy: { orderIndex: "asc" } },
      },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("[API] Mutterschutz POST fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
