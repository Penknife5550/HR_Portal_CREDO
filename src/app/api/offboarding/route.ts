/**
 * API: /api/offboarding
 *
 * GET  – Alle Offboarding-Vorgaenge auflisten (mit Filtern & Pagination)
 * POST – Neuen Offboarding-Vorgang anlegen
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { createOffboardingSchema } from "@/lib/validations/offboarding";
import { orgFilter, PORTAL_ROLES, PROCESS_CREATE_ROLES, HR_EDIT_ROLES, canAccessProcess } from "@/lib/permissions";
import { createOffboardingProcess } from "@/lib/offboarding";

// =============================================
// GET /api/offboarding – Alle Vorgaenge auflisten
// =============================================
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
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

    // Sortierung
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";
    const allowedSortFields = ["createdAt", "displayId", "lastWorkingDay", "status", "employeeLastName"];
    const orderByField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const orderBy = { [orderByField]: sortOrder };

    // Datums-Filter
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    // Filter zusammenbauen (inkl. Org-Einschraenkung)
    const where: Record<string, unknown> = {
      ...(await orgFilter(session)),
    };
    if (status) where.status = status;
    if (organizationId) where.organizationId = organizationId;
    if (from) {
      where.createdAt = { ...(where.createdAt as object || {}), gte: new Date(from) };
    }
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      where.createdAt = { ...(where.createdAt as object || {}), lte: toDate };
    }
    if (search) {
      where.OR = [
        { displayId: { contains: search, mode: "insensitive" } },
        { employeeEmail: { contains: search, mode: "insensitive" } },
        { employeeFirstName: { contains: search, mode: "insensitive" } },
        { employeeLastName: { contains: search, mode: "insensitive" } },
      ];
    }

    const [offboardings, total, statusCounts] = await Promise.all([
      prisma.offboardingProcess.findMany({
        where,
        include: {
          organization: {
            select: { id: true, name: true, mandantNumber: true, type: true },
          },
          _count: {
            select: {
              checklistItems: true,
              returnItems: true,
              departmentLinks: true,
            },
          },
          checklistItems: {
            select: { isCompleted: true },
          },
          returnItems: {
            select: { id: true, isReturned: true },
          },
        },
        orderBy,
        take: limit,
        skip,
      }),
      prisma.offboardingProcess.count({ where }),
      prisma.offboardingProcess.groupBy({
        by: ["status"],
        _count: { status: true },
      }),
    ]);

    // Checklisten- und Rueckgabe-Zaehler aufbereiten
    const data = offboardings.map(({ checklistItems, returnItems, ...rest }) => ({
      ...rest,
      checklistProgress: {
        completed: checklistItems.filter((item) => item.isCompleted).length,
        total: checklistItems.length,
      },
      returnProgress: {
        returned: returnItems.filter((item) => item.isReturned).length,
        total: returnItems.length,
      },
    }));

    // Status-Zaehler als Objekt aufbereiten
    const statusCountsMap: Record<string, number> = {};
    for (const sc of statusCounts) {
      statusCountsMap[sc.status] = sc._count.status;
    }

    return NextResponse.json({
      data,
      total,
      page,
      limit,
      statusCounts: statusCountsMap,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Fehler beim Laden der Offboarding-Vorgaenge:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// POST /api/offboarding – Neuen Vorgang anlegen
// =============================================
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }
    if (!PROCESS_CREATE_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = createOffboardingSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const {
      employeeEmail,
      employeeFirstName,
      employeeLastName,
      organizationId,
      exitType,
      lastWorkingDay,
      employeePrivateEmail,
      employeePersonalNr,
    } = parsed.data;

    // Organisation pruefen
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org) {
      return NextResponse.json(
        { error: "Organisation nicht gefunden" },
        { status: 404 }
      );
    }

    // Entlassungsschutz-Cross-Check: § 18 BEEG
    // Pruefen ob aktive/genehmigte Elternzeit vorliegt — Override mit confirmElternzeit Flag.
    const aktiveElternzeit = await prisma.elternzeitProzess.findFirst({
      where: {
        employeeEmail,
        status: {
          in: [
            "ANTRAG_VORL_EINGEREICHT",
            "VORLAEUFIG_GENEHMIGT",
            "ANTRAG_ENDG_EINGEREICHT",
            "GENEHMIGT",
            "AKTIV",
            "RUECKKEHR_GEPLANT",
          ],
        },
      },
      select: { id: true, displayId: true, status: true },
    });
    const confirmElternzeit =
      typeof body === "object" && body !== null && "confirmElternzeit" in body
        ? Boolean((body as Record<string, unknown>).confirmElternzeit)
        : false;
    if (aktiveElternzeit && !confirmElternzeit) {
      return NextResponse.json(
        {
          error:
            `Achtung: ${employeeFirstName} ${employeeLastName} hat eine aktive/genehmigte Elternzeit ` +
            `(${aktiveElternzeit.displayId}). Eine Kuendigung waehrend der Elternzeit ist nur mit ` +
            `Zustimmung der zustaendigen Behoerde zulaessig (§ 18 BEEG). Bitte zur Bestaetigung ` +
            `mit confirmElternzeit=true erneut absenden.`,
          warning: {
            type: "ELTERNZEIT_AKTIV",
            elternzeitId: aktiveElternzeit.id,
            elternzeitDisplayId: aktiveElternzeit.displayId,
            elternzeitStatus: aktiveElternzeit.status,
          },
        },
        { status: 409 }
      );
    }

    const parsedLastWorkingDay = new Date(lastWorkingDay);

    // Anlage (displayId, Checkliste, Transaktion, Event) im gemeinsamen Service
    const offboarding = await createOffboardingProcess({
      organization: org,
      employeeEmail,
      employeeFirstName,
      employeeLastName,
      employeePersonalNr,
      employeePrivateEmail,
      exitType,
      lastWorkingDay: parsedLastWorkingDay,
      initiatedById: session.userId,
    });

    // Vorgang mit allen Includes zurueckgeben
    const result = await prisma.offboardingProcess.findUnique({
      where: { id: offboarding.id },
      include: {
        organization: true,
        exitData: true,
        checklistItems: {
          orderBy: [{ category: "asc" }, { orderIndex: "asc" }],
        },
        returnItems: true,
        departmentLinks: true,
      },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Fehler beim Anlegen des Offboarding-Vorgangs:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
