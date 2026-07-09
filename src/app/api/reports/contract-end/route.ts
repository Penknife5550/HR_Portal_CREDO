/**
 * API: /api/reports/contract-end (Reporting, Read-Only)
 *
 * GET – Vertragsende-Vorgaenge fuer externe Auswertungen (z.B. Power BI)
 *       Query: ?status=ANGELEGT|...&organizationId=...&from=YYYY-MM-DD&to=YYYY-MM-DD
 *       (from/to filtern auf das Vertragsende)
 *
 * Auth: API-Key mit Scope "reports:read" oder Portal-Session.
 * Bewusst KEINE sensiblen Felder; die Fristen-Kategorie (Ampel) wird live
 * aus dem Vertragsende berechnet.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateReportAccess } from "@/lib/api-key";
import { reportRateLimit } from "@/lib/report-query";
import { Prisma, ContractEndStatus } from "@prisma/client";
import { getContractEndCategory } from "@/lib/contract-end-fristen";

const DATE_YMD = /^\d{4}-\d{2}-\d{2}$/;

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
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (status && !Object.values(ContractEndStatus).includes(status as ContractEndStatus)) {
      return NextResponse.json(
        { error: `Ungueltiger Status. Erlaubt: ${Object.values(ContractEndStatus).join(", ")}` },
        { status: 400 }
      );
    }
    if ((from && !DATE_YMD.test(from)) || (to && !DATE_YMD.test(to))) {
      return NextResponse.json(
        { error: "from/to im Format YYYY-MM-DD erwartet" },
        { status: 400 }
      );
    }

    const where: Prisma.ContractEndProcessWhereInput = {};
    if (status) where.status = status as ContractEndStatus;
    if (organizationId) where.organizationId = organizationId;
    if (from || to) {
      where.contractEndDate = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
      };
    }

    const now = new Date();
    const vorgaenge = await prisma.contractEndProcess.findMany({
      where,
      orderBy: { contractEndDate: "asc" },
      select: {
        displayId: true,
        status: true,
        decision: true,
        employeeFirstName: true,
        employeeLastName: true,
        employeeEmail: true,
        employeePersonalNr: true,
        contractStartDate: true,
        contractEndDate: true,
        supervisorRespondedAt: true,
        contractSignedReturnedAt: true,
        mavStatus: true,
        source: true,
        createdAt: true,
        organization: {
          select: { name: true, shortName: true, mandantNumber: true },
        },
      },
    });

    const data = vorgaenge.map((v) => ({
      ...v,
      kategorie: getContractEndCategory(new Date(v.contractEndDate), now),
    }));

    return NextResponse.json({
      data,
      meta: { count: data.length, generatedAt: now.toISOString() },
    });
  } catch (error) {
    console.error("[API] Report Vertragsende fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
