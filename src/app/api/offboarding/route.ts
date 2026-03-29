/**
 * API: /api/offboarding
 *
 * GET  – Alle Offboarding-Vorgaenge auflisten (mit Filtern & Pagination)
 * POST – Neuen Offboarding-Vorgang anlegen
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { triggerWebhooks } from "@/lib/webhooks";
import { createOffboardingSchema } from "@/lib/validations/offboarding";
import { orgFilter, PORTAL_ROLES, PROCESS_CREATE_ROLES, HR_EDIT_ROLES, canAccessProcess } from "@/lib/permissions";

// Template-Name anhand OrganizationType bestimmen
function getTemplateNameForOrgType(orgType: string): string {
  switch (orgType) {
    case "KITA":
    case "GYMNASIUM":
    case "GRUNDSCHULE":
    case "GESAMTSCHULE":
    case "BERUFSKOLLEG":
      return "Offboarding: Bildungseinrichtung";
    case "VERWALTUNG":
    case "GMBH":
    case "VEREIN":
      return "Offboarding: Standard-Offboarding";
    default:
      return "Offboarding: Standard-Offboarding";
  }
}

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

    const parsedLastWorkingDay = new Date(lastWorkingDay);

    // displayId generieren: "OFF-{year}-{orgShortName}-{sequential}"
    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear + 1, 0, 1);
    const shortName = org.shortName || org.mandantNumber;

    let displayId = "";
    let sequentialNumber = 0;

    for (let attempt = 0; attempt < 3; attempt++) {
      const countThisYear = await prisma.offboardingProcess.count({
        where: {
          organizationId,
          createdAt: { gte: yearStart, lt: yearEnd },
        },
      });
      sequentialNumber = countThisYear + 1 + attempt;
      displayId = `OFF-${currentYear}-${shortName}-${sequentialNumber
        .toString()
        .padStart(3, "0")}`;
      const exists = await prisma.offboardingProcess.findUnique({
        where: { displayId },
        select: { id: true },
      });
      if (!exists) break;
    }

    // Passendes Checklisten-Template finden
    const templateName = getTemplateNameForOrgType(org.type);
    const checklistTemplate = await prisma.checklistTemplate.findFirst({
      where: {
        name: templateName,
        isActive: true,
      },
      include: {
        items: {
          orderBy: { orderIndex: "asc" },
        },
      },
    });

    // Gesamte Erstellung in einer Transaktion
    const offboarding = await prisma.$transaction(async (tx) => {
      // Offboarding-Vorgang erstellen
      const created = await tx.offboardingProcess.create({
        data: {
          displayId,
          sequentialNumber,
          organizationId,
          employeeEmail,
          employeeFirstName,
          employeeLastName,
          employeePersonalNr: employeePersonalNr || null,
          employeePrivateEmail: employeePrivateEmail || null,
          exitType,
          lastWorkingDay: parsedLastWorkingDay,
          status: "INITIATED",
          initiatedById: session.userId,
        },
        include: {
          organization: true,
        },
      });

      // OffboardingExitData anlegen (leer)
      await tx.offboardingExitData.create({
        data: {
          offboardingId: created.id,
        },
      });

      // Checklisten-Items aus Template erstellen
      if (checklistTemplate && checklistTemplate.items.length > 0) {
        await tx.offboardingChecklistItem.createMany({
          data: checklistTemplate.items.map((templateItem) => ({
            offboardingId: created.id,
            title: templateItem.title,
            category: templateItem.category,
            orderIndex: templateItem.orderIndex,
            assigneeDepartment: templateItem.defaultAssignee || null,
            dueDate: templateItem.defaultDueDays != null
              ? new Date(
                  parsedLastWorkingDay.getTime() +
                    templateItem.defaultDueDays * 24 * 60 * 60 * 1000
                )
              : null,
          })),
        });
      }

      // Audit-Log
      await tx.auditLog.create({
        data: {
          offboardingId: created.id,
          userId: session.userId,
          processType: "OFFBOARDING",
          action: "OFFBOARDING_CREATED",
          details: {
            employeeEmail,
            employeeName: `${employeeFirstName} ${employeeLastName}`,
            organization: org.name,
            exitType,
            lastWorkingDay,
          },
        },
      });

      return created;
    });

    // Webhook ausserhalb der Transaktion triggern
    await triggerWebhooks("offboarding-created", {
      offboardingId: offboarding.id,
      displayId: offboarding.displayId,
      employeeEmail: offboarding.employeeEmail,
      employeeName: `${offboarding.employeeFirstName} ${offboarding.employeeLastName}`,
      organization: org.name,
      mandantNumber: org.mandantNumber,
      exitType: offboarding.exitType,
      lastWorkingDay: offboarding.lastWorkingDay.toISOString(),
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
