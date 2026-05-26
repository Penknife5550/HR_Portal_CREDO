/**
 * CREDO HR-Portal – Audit-Log API
 *
 * GET /api/audit-logs
 *
 * Filter:
 * - offboardingId, onboardingId, userId, action (optional)
 * - from/to Datumsbereich (optional)
 * - search (Benutzername, optional)
 * - page/limit Pagination
 *
 * Nur SUPER_ADMIN und HR_LEITUNG.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { adminHandler } from "@/lib/api-handler";

export const GET = adminHandler(async ({ request }) => {
  const url = new URL(request.url);

  // Filter-Parameter
  const offboardingId = url.searchParams.get("offboardingId");
  const onboardingId = url.searchParams.get("onboardingId");
  const userId = url.searchParams.get("userId");
  const action = url.searchParams.get("action");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const search = url.searchParams.get("search");
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50")));

  // Prisma where-Clause aufbauen
  const where: any = {};

  if (offboardingId) where.offboardingId = offboardingId;
  if (onboardingId) where.onboardingId = onboardingId;
  if (userId) where.userId = userId;
  if (action) where.action = action;

  // Datumsbereich
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) {
      // "to"-Datum bis Ende des Tages
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      where.createdAt.lte = toDate;
    }
  }

  // Suche nach Benutzername
  if (search) {
    where.user = {
      OR: [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
      ],
    };
  }

  // Daten + Count parallel abfragen
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  // Alle eindeutigen Aktionen für Filter-Dropdown
  const actions = await prisma.auditLog.findMany({
    select: { action: true },
    distinct: ["action"],
    orderBy: { action: "asc" },
  });

  return NextResponse.json({
    data: logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    actions: actions.map((a) => a.action),
  });
}, { logLabel: "AuditLog" });
