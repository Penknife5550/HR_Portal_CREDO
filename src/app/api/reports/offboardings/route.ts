/**
 * API: /api/reports/offboardings (Reporting, Read-Only)
 *
 * GET – Offboardings/Kuendigungen fuer externe Auswertungen
 *       Query: ?status=ACTIVE|INITIATED|...&from=2026-01-01&to=2026-12-31&organizationId=...
 *              "from"/"to" filtern auf lastWorkingDay.
 *              Ohne Filter: alle nicht abgeschlossenen Vorgaenge ("aktuelle Kuendigungen").
 *
 * Auth: API-Key (Authorization: Bearer crk_... oder X-API-Key) mit Scope
 *       "reports:read" — oder eingeloggte Portal-Session.
 *
 * Bewusst KEINE sensiblen Felder (IBAN, SV-Nr, Steuer-ID, private Adressen).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateReportAccess } from "@/lib/api-key";
import { parseReportDate, reportRateLimit } from "@/lib/report-query";
import { Prisma, OffboardingStatus } from "@prisma/client";

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
    const from = parseReportDate(searchParams.get("from"));
    const to = parseReportDate(searchParams.get("to"));
    if (from === "invalid" || to === "invalid") {
      return NextResponse.json(
        { error: "Ungueltiges Datum — erwartet ISO-Format (YYYY-MM-DD)" },
        { status: 400 }
      );
    }
    if (status && !Object.values(OffboardingStatus).includes(status as OffboardingStatus)) {
      return NextResponse.json(
        { error: `Ungueltiger Status. Erlaubt: ${Object.values(OffboardingStatus).join(", ")}` },
        { status: 400 }
      );
    }

    const where: Prisma.OffboardingProcessWhereInput = {};
    if (status) {
      where.status = status as OffboardingStatus;
    } else {
      // Default: aktuelle (nicht abgeschlossene/stornierte) Kuendigungen
      where.status = { notIn: ["COMPLETED", "CANCELLED"] as OffboardingStatus[] };
    }
    if (organizationId) where.organizationId = organizationId;
    if (from || to) {
      where.lastWorkingDay = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }

    const offboardings = await prisma.offboardingProcess.findMany({
      where,
      orderBy: { lastWorkingDay: "asc" },
      select: {
        displayId: true,
        status: true,
        exitType: true,
        exitReason: true,
        noticeDate: true,
        lastWorkingDay: true,
        contractEndDate: true,
        employeeFirstName: true,
        employeeLastName: true,
        employeeEmail: true,
        initiatedAt: true,
        completedAt: true,
        organization: {
          select: { name: true, shortName: true, mandantNumber: true },
        },
      },
    });

    return NextResponse.json({
      data: offboardings,
      meta: { count: offboardings.length, generatedAt: new Date().toISOString() },
    });
  } catch (error) {
    console.error("[API] Report Offboardings fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
