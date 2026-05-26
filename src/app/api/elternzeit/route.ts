/**
 * API: /api/elternzeit
 *
 * GET  – Alle Elternzeit-Vorgaenge auflisten (mit Filtern, Pagination, Org-Scope)
 * POST – Neuen Elternzeit-Vorgang anlegen (auto-generiert Checkliste)
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
import { createElternzeitSchema } from "@/lib/validations/elternzeit";
import { generateElternzeitDisplayId } from "@/lib/elternzeit-helpers";
import { getElternzeitCheckliste } from "@/lib/elternzeit-checkliste-template";
import { triggerWebhooks } from "@/lib/webhooks";
import { syncElternzeitFristen } from "@/lib/elternzeit-fristen";
import { formatEmployeeName } from "@/lib/format";

// =============================================
// GET /api/elternzeit – Liste
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
    const personalgruppe = searchParams.get("personalgruppe");
    const search = searchParams.get("search")?.trim();
    const page = Math.max(parseInt(searchParams.get("page") || "1"), 1);
    const rawLimit = parseInt(searchParams.get("limit") || "50");
    const limit = Math.min(Math.max(isNaN(rawLimit) ? 50 : rawLimit, 1), 200);
    const skip = (page - 1) * limit;

    // Basis-Where ohne Status — wird für KPI-Counts verwendet,
    // damit die Kacheln nicht vom aktiven Status-Filter abhaengen.
    const baseWhere: Record<string, unknown> = {
      ...(await orgFilter(session)),
    };
    if (organizationId) baseWhere.organizationId = organizationId;
    if (personalgruppe) baseWhere.personalgruppe = personalgruppe;
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
      prisma.elternzeitProzess.findMany({
        where,
        include: {
          organization: {
            select: { id: true, name: true, mandantNumber: true, type: true },
          },
          abschnitte: { orderBy: { abschnittNr: "asc" } },
          _count: {
            select: { dokumente: true, checklistItems: true, notizen: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.elternzeitProzess.count({ where }),
      prisma.elternzeitProzess.groupBy({
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
    console.error("[API] Elternzeit GET fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// =============================================
// POST /api/elternzeit – Anlegen
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
    const parsed = createElternzeitSchema.safeParse(body);
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
      personalgruppe,
      geschlecht,
      kvTyp,
      kindNummer,
      mutterschutzId,
      einrichtungsleiterName,
      einrichtungsleiterEmail,
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
    // IDOR-Schutz: User darf nur Vorgaenge in eigenen Mandanten anlegen.
    // 404 statt 403, um Existenz nicht zu leaken.
    if (!(await canAccessOrg(session, organizationId))) {
      return NextResponse.json(
        { error: "Organisation nicht gefunden" },
        { status: 404 },
      );
    }

    // Validierung Mutterschutz-Verknuepfung: nur bei Mutter zulaessig
    if (mutterschutzId && geschlecht !== "MUTTER") {
      return NextResponse.json(
        { error: "Mutterschutz kann nur bei Geschlecht MUTTER verknuepft werden" },
        { status: 400 },
      );
    }
    if (mutterschutzId) {
      const ms = await prisma.mutterschutzProzess.findUnique({
        where: { id: mutterschutzId },
        select: { id: true, organizationId: true },
      });
      if (!ms || !(await canAccessOrg(session, ms.organizationId))) {
        return NextResponse.json(
          { error: "Verknuepfter Mutterschutz-Vorgang nicht gefunden" },
          { status: 404 },
        );
      }
    }

    const shortName = org.shortName || org.mandantNumber;
    const { displayId, sequentialNumber } = await generateElternzeitDisplayId(
      organizationId,
      shortName,
    );

    const checklistTemplate = getElternzeitCheckliste(personalgruppe);

    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      null;

    const created = await prisma.$transaction(async (tx) => {
      const ez = await tx.elternzeitProzess.create({
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
          mutterschutzId: mutterschutzId || null,
          personalgruppe,
          geschlecht,
          kvTyp,
          kindNummer,
          einrichtungsleiterName: einrichtungsleiterName || null,
          einrichtungsleiterEmail: einrichtungsleiterEmail || null,
          status: "ANGELEGT",
        },
      });

      await tx.elternzeitChecklistItem.createMany({
        data: checklistTemplate.map((item) => ({
          elternzeitId: ez.id,
          titel: item.titel,
          beschreibung: item.beschreibung || null,
          logaHinweis: item.logaHinweis || null,
          personalgruppe: item.personalgruppe,
          phase: item.phase,
          orderIndex: item.orderIndex,
        })),
      });

      await tx.auditLog.create({
        data: {
          elternzeitId: ez.id,
          userId: session.userId,
          processType: "ELTERNZEIT",
          action: "ELTERNZEIT_CREATED",
          details: {
            displayId,
            employeeName: `${employeeFirstName} ${employeeLastName}`,
            organization: org.name,
            personalgruppe,
            geschlecht,
            kindNummer,
          },
          ipAddress,
        },
      });

      return ez;
    });

    await syncElternzeitFristen(created.id).catch((err) =>
      console.error(
        `[syncElternzeitFristen] Fehler nach Anlage ${created.id}:`,
        err instanceof Error ? err.message : err,
      ),
    );

    triggerWebhooks("elternzeit-angelegt", {
      elternzeitId: created.id,
      displayId: created.displayId,
      employeeEmail: created.employeeEmail,
      employeeName: formatEmployeeName(created),
      organization: org.name,
      mandantNumber: org.mandantNumber,
      personalgruppe: created.personalgruppe,
      geschlecht: created.geschlecht,
    }).catch((err) =>
      console.error(
        "[elternzeit-angelegt] Webhook-Fehler:",
        err instanceof Error ? err.message : err,
      ),
    );

    const result = await prisma.elternzeitProzess.findUnique({
      where: { id: created.id },
      include: {
        organization: true,
        checklistItems: { orderBy: [{ phase: "asc" }, { orderIndex: "asc" }] },
        abschnitte: true,
      },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("[API] Elternzeit POST fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
