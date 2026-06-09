/**
 * API: /api/bem  (BEM-Faelle — "versiegelte Akte", § 167 SGB IX)
 *
 * GET  – Faelle auflisten. Liefert NUR Faelle, fuer die der/die Nutzer:in eine
 *        aktive BemZugriff-Freigabe hat (bemFilter) — KEIN globaler Bypass.
 * POST – Neuen Fall anlegen (nur SUPER_ADMIN + BEM-Beauftragte). Der/die
 *        Anlegende erhaelt automatisch eine BemZugriff-Freigabe (BEAUFTRAGTE),
 *        damit der Fall sofort sichtbar ist (explizit auditiert).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  PORTAL_ROLES,
  bemFilter,
  canCreateBemFall,
  canManageBemAccess,
  canAccessOrg,
} from "@/lib/permissions";
import { createBemSchema } from "@/lib/validations/bem";
import { generateBemDisplayId } from "@/lib/bem-helpers";
import { BEM_AUDIT_ACTIONS } from "@/lib/bem-audit";
import { syncBemFristen } from "@/lib/bem-fristen";

function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

// =============================================
// GET /api/bem – Liste (nur freigegebene Faelle)
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

    // bemFilter = { id: { in: [<freigegebene Fall-IDs>] } }. Kein Eintrag = leer.
    const baseWhere: Record<string, unknown> = { ...(await bemFilter(session)) };
    if (organizationId) baseWhere.organizationId = organizationId;
    if (search) {
      baseWhere.OR = [
        { displayId: { contains: search, mode: "insensitive" } },
        { employeeFirstName: { contains: search, mode: "insensitive" } },
        { employeeLastName: { contains: search, mode: "insensitive" } },
      ];
    }
    const where: Record<string, unknown> = { ...baseWhere };
    if (status) where.status = status;

    const [items, total, statusCountsRaw] = await Promise.all([
      prisma.bemFall.findMany({
        where,
        include: {
          organization: {
            select: { id: true, name: true, mandantNumber: true, type: true },
          },
          _count: {
            select: { gespraeche: true, massnahmen: true, dokumente: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.bemFall.count({ where }),
      prisma.bemFall.groupBy({
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
      canCreate: await canCreateBemFall(session),
      canManageAccess: canManageBemAccess(session),
    });
  } catch (error) {
    console.error("[API] BEM GET fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// =============================================
// POST /api/bem – Fall anlegen
// =============================================
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!(await canCreateBemFall(session))) {
      return NextResponse.json(
        { error: "Nur SUPER_ADMIN oder BEM-Beauftragte dürfen Fälle anlegen" },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = createBemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }
    const d = parsed.data;

    const org = await prisma.organization.findUnique({
      where: { id: d.organizationId },
      select: { id: true, name: true, shortName: true, mandantNumber: true },
    });
    // IDOR: 404 statt 403, um Existenz nicht zu leaken.
    if (!org || !(await canAccessOrg(session, d.organizationId))) {
      return NextResponse.json(
        { error: "Mandant nicht gefunden" },
        { status: 404 },
      );
    }

    const shortName = org.shortName || org.mandantNumber;
    const { displayId, sequentialNumber } = await generateBemDisplayId(
      d.organizationId,
      shortName,
    );
    const ipAddress = clientIp(request);

    const created = await prisma.$transaction(async (tx) => {
      const fall = await tx.bemFall.create({
        data: {
          displayId,
          sequentialNumber,
          organizationId: d.organizationId,
          createdById: session.userId,
          employeeId: d.employeeId || null,
          employeeFirstName: d.employeeFirstName,
          employeeLastName: d.employeeLastName,
          employeeEmail: d.employeeEmail || null,
          employeePersonalNr: d.employeePersonalNr || null,
          eingangsweg: d.eingangsweg,
          anlassFehlzeitenAb: d.anlassFehlzeitenAb
            ? new Date(d.anlassFehlzeitenAb)
            : null,
          status: "ANGELEGT",
        },
      });

      // Auto-Freigabe fuer die/den Anlegende:n — sonst waere der eigene Fall
      // unsichtbar. Explizit auditiert, kein globaler Bypass.
      await tx.bemZugriff.create({
        data: {
          bemFallId: fall.id,
          userId: session.userId,
          rolle: "BEAUFTRAGTE",
          grantedById: session.userId,
        },
      });

      await tx.auditLog.create({
        data: {
          bemFallId: fall.id,
          userId: session.userId,
          processType: "BEM",
          action: BEM_AUDIT_ACTIONS.FALL_ANGELEGT,
          details: {
            displayId,
            organization: org.name,
            eingangsweg: d.eingangsweg,
          },
          ipAddress,
        },
      });

      return fall;
    });

    // Initiale Fristen (z.B. "Einladung versenden") anlegen.
    await syncBemFristen(created.id);

    return NextResponse.json(
      { id: created.id, displayId: created.displayId },
      { status: 201 },
    );
  } catch (error) {
    console.error("[API] BEM POST fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
