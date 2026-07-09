/**
 * API: /api/contract-end
 *
 * GET  – Alle Vertragsende-Vorgaenge auflisten (Filter & Pagination)
 * POST – Neuen Vertragsende-Vorgang manuell anlegen (HR)
 *
 * Die automatische Anlage aus n8n laeuft ueber /api/webhooks/contract-end
 * (Phase 2) und nutzt denselben Service createContractEndProcess().
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { createContractEndSchema } from "@/lib/validations/contract-end";
import {
  orgFilter,
  PORTAL_ROLES,
  PROCESS_CREATE_ROLES,
  canAccessProcess,
} from "@/lib/permissions";
import { createContractEndProcess } from "@/lib/contract-end";

// =============================================
// GET /api/contract-end – Alle Vorgaenge auflisten
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

    // Sortierung — Default nach Vertragsende (dringendste zuerst)
    const sortBy = searchParams.get("sortBy") || "contractEndDate";
    const sortOrder = searchParams.get("sortOrder") === "desc" ? "desc" : "asc";
    const allowedSortFields = [
      "createdAt",
      "displayId",
      "contractEndDate",
      "status",
      "employeeLastName",
    ];
    const orderByField = allowedSortFields.includes(sortBy) ? sortBy : "contractEndDate";
    const orderBy = { [orderByField]: sortOrder };

    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Record<string, unknown> = { ...(await orgFilter(session)) };
    if (status) where.status = status;
    if (organizationId) where.organizationId = organizationId;
    if (from) {
      where.contractEndDate = { ...((where.contractEndDate as object) || {}), gte: new Date(from) };
    }
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      where.contractEndDate = { ...((where.contractEndDate as object) || {}), lte: toDate };
    }
    if (search) {
      where.OR = [
        { displayId: { contains: search, mode: "insensitive" } },
        { employeeEmail: { contains: search, mode: "insensitive" } },
        { employeeFirstName: { contains: search, mode: "insensitive" } },
        { employeeLastName: { contains: search, mode: "insensitive" } },
      ];
    }

    const [items, total, statusCounts] = await Promise.all([
      prisma.contractEndProcess.findMany({
        where,
        include: {
          organization: {
            select: { id: true, name: true, mandantNumber: true, type: true },
          },
        },
        orderBy,
        take: limit,
        skip,
      }),
      prisma.contractEndProcess.count({ where }),
      prisma.contractEndProcess.groupBy({
        by: ["status"],
        _count: { status: true },
      }),
    ]);

    const statusCountsMap: Record<string, number> = {};
    for (const sc of statusCounts) {
      statusCountsMap[sc.status] = sc._count.status;
    }

    return NextResponse.json({
      data: items,
      total,
      page,
      limit,
      statusCounts: statusCountsMap,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Fehler beim Laden der Vertragsende-Vorgaenge:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// =============================================
// POST /api/contract-end – Neuen Vorgang anlegen
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
    const parsed = createContractEndSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }
    const {
      employeeEmail,
      employeeFirstName,
      employeeLastName,
      organizationId,
      contractEndDate,
      contractStartDate,
      employeePersonalNr,
    } = parsed.data;

    const org = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) {
      return NextResponse.json({ error: "Organisation nicht gefunden" }, { status: 404 });
    }

    // Multi-Tenant-Scope: darf der User fuer diese Einrichtung anlegen?
    if (!(await canAccessProcess(session, organizationId))) {
      return NextResponse.json(
        { error: "Keine Berechtigung für diese Einrichtung" },
        { status: 403 }
      );
    }

    const contractEnd = await createContractEndProcess({
      organization: org,
      employeeEmail,
      employeeFirstName,
      employeeLastName,
      employeePersonalNr,
      contractEndDate: new Date(contractEndDate),
      contractStartDate: contractStartDate ? new Date(contractStartDate) : null,
      source: "MANUAL",
      initiatedById: session.userId,
    });

    const result = await prisma.contractEndProcess.findUnique({
      where: { id: contractEnd.id },
      include: { organization: true, renewalData: true },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Fehler beim Anlegen des Vertragsende-Vorgangs:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
