/**
 * API: /api/settings/email-log
 *
 * GET – Versandprotokoll (EmailLog) mit Filtern und Pagination
 *       Query: ?status=SENT|FAILED|SKIPPED&event=...&page=1
 *       Aufbewahrung: Eintraege aelter als 90 Tage werden beim Abruf entfernt.
 *
 * Berechtigung: SUPER_ADMIN, HR_LEITUNG
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

const ALLOWED_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];
const PAGE_SIZE = 50;
const RETENTION_DAYS = 90;

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.role)) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });

    // Aufbewahrungsfrist durchsetzen (guenstig dank Index auf createdAt)
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await prisma.emailLog.deleteMany({ where: { createdAt: { lt: cutoff } } });

    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");
    const event = searchParams.get("event");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);

    const where = {
      ...(status && ["SENT", "FAILED", "SKIPPED"].includes(status) ? { status } : {}),
      ...(event ? { event } : {}),
    };

    const [total, logs] = await Promise.all([
      prisma.emailLog.count({ where }),
      prisma.emailLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);

    return NextResponse.json({
      data: {
        logs,
        total,
        page,
        pageSize: PAGE_SIZE,
        totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      },
    });
  } catch (error) {
    console.error("[API] Versandprotokoll laden fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
