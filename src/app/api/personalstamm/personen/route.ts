/**
 * API: Personalstamm aus DokuBit — Liste der Ansicht „Personen" (Self-Service, Paket S0)
 *
 * GET /api/personalstamm/personen?search=&isActive=true|false|all&page=&limit=
 *   → { data, total, page, limit, bestandLeer }
 *
 * Nur lesen, nur die HR-Rollen (authHandler, ohne SERVICE). Bewusst eine
 * eigene, schlanke Leseform neben GET /api/employees:
 *   - Sie liefert nur, was die Ansicht zeigt — keine private Adresse, kein
 *     Geburtsdatum, kein Telefon, keine LOGA-Nummer (Datenminimierung).
 *   - Die Suche trifft Name, dienstliche Adresse und die MANR der Vertraege
 *     (so nennt „Zu prüfen" einen Vertrag), nie die LOGA-Nummer der Person.
 * `bestandLeer`: Es gibt ueberhaupt keine Person — fuer den Leerzustand
 * „Noch keine Personen", unabhaengig von Suche und Filter.
 */

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { authHandler } from "@/lib/api-handler";

const PERSONEN_FELDER = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  isActive: true,
  importSource: true,
  lastSyncAt: true,
  employments: {
    select: {
      id: true,
      isActive: true,
      endDate: true,
      mandantNumber: true,
      abrechnungskreis: true,
      personalNumber: true,
      organization: { select: { name: true } },
    },
    orderBy: { startDate: "desc" },
  },
} satisfies Prisma.EmployeeSelect;

export const GET = authHandler(
  async ({ request }) => {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() || undefined;
    const isActive = searchParams.get("isActive");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25", 10) || 25));

    const where: Prisma.EmployeeWhereInput = {};
    // Standard wie GET /api/employees: nur aktive
    if (isActive === "false") where.isActive = false;
    else if (isActive !== "all") where.isActive = true;
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { employments: { some: { personalNumber: { contains: search, mode: "insensitive" } } } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: PERSONEN_FELDER,
      }),
      prisma.employee.count({ where }),
    ]);
    const bestandLeer = total === 0 && (await prisma.employee.count()) === 0;

    return NextResponse.json({ data, total, page, limit, bestandLeer });
  },
  { logLabel: "Personalstamm Personen GET" },
);
