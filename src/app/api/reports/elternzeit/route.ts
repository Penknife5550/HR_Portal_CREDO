/**
 * API: /api/reports/elternzeit (Reporting, Read-Only)
 *
 * GET – Elternzeit-Vorgaenge fuer externe Auswertungen
 *       Query: ?status=AKTIV|...&organizationId=...
 *
 * Auth: API-Key mit Scope "reports:read" oder Portal-Session.
 * Bewusst KEINE Kind-Daten und KEINE sensiblen Felder (§ Datenschutz).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateReportAccess } from "@/lib/api-key";
import { reportRateLimit } from "@/lib/report-query";
import { Prisma, ElternzeitStatus } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const limited = reportRateLimit(request);
    if (limited) return limited;

    const auth = await authenticateReportAccess(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status ?? 401 });
    }

    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");
    const organizationId = searchParams.get("organizationId");
    if (status && !Object.values(ElternzeitStatus).includes(status as ElternzeitStatus)) {
      return NextResponse.json(
        { error: `Ungueltiger Status. Erlaubt: ${Object.values(ElternzeitStatus).join(", ")}` },
        { status: 400 }
      );
    }

    const where: Prisma.ElternzeitProzessWhereInput = {};
    if (status) where.status = status as ElternzeitStatus;
    if (organizationId) where.organizationId = organizationId;

    const prozesse = await prisma.elternzeitProzess.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        displayId: true,
        status: true,
        personalgruppe: true,
        employeeFirstName: true,
        employeeLastName: true,
        employeeEmail: true,
        antragVorlAm: true,
        antragEndgAm: true,
        genehmigungAm: true,
        createdAt: true,
        organization: {
          select: { name: true, shortName: true, mandantNumber: true },
        },
      },
    });

    return NextResponse.json({
      data: prozesse,
      meta: { count: prozesse.length, generatedAt: new Date().toISOString() },
    });
  } catch (error) {
    console.error("[API] Report Elternzeit fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
