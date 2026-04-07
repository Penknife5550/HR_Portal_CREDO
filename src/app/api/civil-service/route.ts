/**
 * API: /api/civil-service
 *
 * GET  – Alle Verbeamtungsvorgaenge auflisten (mit Filtern & Pagination)
 * POST – Neuen Verbeamtungsvorgang anlegen
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { createCivilServiceSchema } from "@/lib/validations/civil-service";
import { orgFilter, PORTAL_ROLES } from "@/lib/permissions";
import { triggerWebhooks } from "@/lib/webhooks";
import { formatEmployeeName } from "@/lib/format";
import {
  CIVIL_SERVICE_CHECKLIST_TEMPLATE,
  CIVIL_SERVICE_PHASES,
} from "@/lib/civil-service-checklist-template";

// =============================================
// GET /api/civil-service – Alle Vorgaenge auflisten
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

    // Rollencheck: Portal-Rollen (inkl. VORGESETZTER)
    if (!PORTAL_ROLES.includes(session.role)) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
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
    const allowedSortFields = [
      "createdAt",
      "displayId",
      "targetStartDate",
      "status",
      "employeeLastName",
      "currentStep",
    ];
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
      where.createdAt = {
        ...(where.createdAt as object || {}),
        gte: new Date(from),
      };
    }
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      where.createdAt = {
        ...(where.createdAt as object || {}),
        lte: toDate,
      };
    }
    if (search) {
      where.OR = [
        { displayId: { contains: search, mode: "insensitive" } },
        { employeeEmail: { contains: search, mode: "insensitive" } },
        { employeeFirstName: { contains: search, mode: "insensitive" } },
        { employeeLastName: { contains: search, mode: "insensitive" } },
      ];
    }

    const [processes, total, statusCounts] = await Promise.all([
      prisma.civilServiceProcess.findMany({
        where,
        include: {
          organization: {
            select: { id: true, name: true, mandantNumber: true, type: true },
          },
          phases: {
            select: { phaseKey: true, status: true },
            orderBy: { orderIndex: "asc" },
          },
          _count: {
            select: {
              assessments: true,
              documents: true,
              checklistItems: true,
            },
          },
          checklistItems: {
            select: { isCompleted: true },
          },
        },
        orderBy,
        take: limit,
        skip,
      }),
      prisma.civilServiceProcess.count({ where }),
      prisma.civilServiceProcess.groupBy({
        by: ["status"],
        _count: { status: true },
      }),
    ]);

    // Checklisten-Fortschritt aufbereiten
    const data = processes.map(({ checklistItems, ...rest }) => ({
      ...rest,
      checklistProgress: {
        completed: checklistItems.filter((item) => item.isCompleted).length,
        total: checklistItems.length,
      },
    }));

    // Status-Zaehler als Objekt
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
    console.error("Fehler beim Laden der Verbeamtungsvorgaenge:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// POST /api/civil-service – Neuen Vorgang anlegen
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

    // Rollencheck: nur HR-Rollen
    const hrRoles = ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER"];
    if (!hrRoles.includes(session.role)) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = createCivilServiceSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const {
      employeeFirstName,
      employeeLastName,
      employeeEmail,
      employeePersonalNr,
      organizationId,
      targetStartDate,
      employeeId,
      stakeholders,
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

    // displayId generieren: "PSI-{year}-{orgShortName}-{sequential}"
    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear + 1, 0, 1);
    const shortName = org.shortName || org.mandantNumber;

    let displayId = "";
    let sequentialNumber = 0;

    for (let attempt = 0; attempt < 3; attempt++) {
      const countThisYear = await prisma.civilServiceProcess.count({
        where: {
          organizationId,
          createdAt: { gte: yearStart, lt: yearEnd },
        },
      });
      sequentialNumber = countThisYear + 1 + attempt;
      displayId = `PSI-${currentYear}-${shortName}-${sequentialNumber
        .toString()
        .padStart(3, "0")}`;
      const exists = await prisma.civilServiceProcess.findUnique({
        where: { displayId },
        select: { id: true },
      });
      if (!exists) break;
    }

    // Gesamte Erstellung in einer Transaktion
    const civilService = await prisma.$transaction(async (tx) => {
      // Verbeamtungsvorgang erstellen
      const created = await tx.civilServiceProcess.create({
        data: {
          displayId,
          sequentialNumber,
          organizationId,
          employeeFirstName,
          employeeLastName,
          employeeEmail,
          employeePersonalNr: employeePersonalNr || null,
          employeeId: employeeId || null,
          targetStartDate: targetStartDate ? new Date(targetStartDate) : null,
          status: "DRAFT",
          currentStep: 1,
          initiatedById: session.userId,
          stakeholders: stakeholders ? (stakeholders as any) : undefined,
        },
        include: {
          organization: true,
        },
      });

      // Alle 11 Phasen erstellen
      await tx.civilServicePhase.createMany({
        data: CIVIL_SERVICE_PHASES.map((phase) => ({
          processId: created.id,
          phaseKey: phase.phaseKey,
          phaseName: phase.phaseName,
          orderIndex: phase.orderIndex,
          status: "PENDING",
        })),
      });

      // Alle Checklisten-Items aus Template erstellen
      await tx.civilServiceChecklistItem.createMany({
        data: CIVIL_SERVICE_CHECKLIST_TEMPLATE.map((item, index) => ({
          processId: created.id,
          step: item.step,
          phase: item.phase,
          category: item.category,
          title: item.title,
          description: item.description || null,
          assignee: item.assignee,
          isGatekeeper: item.isGatekeeper,
          linkedDocumentType: item.linkedDocumentType || null,
          orderIndex: index,
        })),
      });

      // Audit-Log
      await tx.auditLog.create({
        data: {
          civilServiceId: created.id,
          userId: session.userId,
          processType: "CIVIL_SERVICE",
          action: "CIVIL_SERVICE_CREATED",
          details: {
            employeeEmail,
            employeeName: `${employeeFirstName} ${employeeLastName}`,
            organization: org.name,
            displayId,
          },
        },
      });

      return created;
    });

    // Vorgang mit allen Includes zurueckgeben
    const result = await prisma.civilServiceProcess.findUnique({
      where: { id: civilService.id },
      include: {
        organization: true,
        phases: { orderBy: { orderIndex: "asc" } },
        checklistItems: { orderBy: { orderIndex: "asc" } },
      },
    });

    // Webhook fire-and-forget (triggerWebhooks wirft nie, blockiert Response nicht).
    // .catch() als doppelte Sicherheit fuer den theoretischen Fall, dass die
    // "wirft nie"-Garantie verletzt wird (z. B. durch Test-Mocks).
    triggerWebhooks("psi-created", {
      civilServiceId: civilService.id,
      displayId: civilService.displayId,
      employeeEmail: civilService.employeeEmail,
      employeeName: formatEmployeeName(civilService),
      organization: org.name,
      mandantNumber: org.mandantNumber,
      targetStartDate: civilService.targetStartDate?.toISOString() ?? null,
    }).catch((err) =>
      console.error("[psi-created] Webhook-Fehler:", err instanceof Error ? err.message : err)
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Fehler beim Anlegen des Verbeamtungsvorgangs:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
