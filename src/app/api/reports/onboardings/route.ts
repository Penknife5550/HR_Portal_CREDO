/**
 * API: /api/reports/onboardings (Reporting, Read-Only)
 *
 * GET – Onboarding-Vorgaenge fuer externe Auswertungen
 *       Query: ?status=INVITED|...&from=&to=&organizationId=...
 *              "from"/"to" filtern auf createdAt.
 *
 * Auth: API-Key mit Scope "reports:read" oder Portal-Session.
 * Bewusst KEINE sensiblen Felder.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateReportAccess } from "@/lib/api-key";
import { parseReportDate, reportRateLimit } from "@/lib/report-query";
import { Prisma, OnboardingStatus } from "@prisma/client";

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
    if (status && !Object.values(OnboardingStatus).includes(status as OnboardingStatus)) {
      return NextResponse.json(
        { error: `Ungueltiger Status. Erlaubt: ${Object.values(OnboardingStatus).join(", ")}` },
        { status: 400 }
      );
    }

    const where: Prisma.OnboardingProcessWhereInput = {};
    if (status) where.status = status as OnboardingStatus;
    if (organizationId) where.organizationId = organizationId;
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }

    const onboardings = await prisma.onboardingProcess.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        displayId: true,
        status: true,
        processType: true,
        questionnaireType: true,
        email: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        organization: {
          select: { name: true, shortName: true, mandantNumber: true },
        },
      },
    });

    return NextResponse.json({
      data: onboardings,
      meta: { count: onboardings.length, generatedAt: new Date().toISOString() },
    });
  } catch (error) {
    console.error("[API] Report Onboardings fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
