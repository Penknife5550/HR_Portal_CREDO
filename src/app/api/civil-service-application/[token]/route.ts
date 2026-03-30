/**
 * API: /api/civil-service-application/[token]
 *
 * GET  - Token validieren, Prozessinfo + Voraussetzungsstatus zurueckgeben
 * PUT  - Antragsdaten speichern (Zwischenspeichern)
 *
 * OEFFENTLICH - kein Auth erforderlich!
 * Zugang ausschliesslich ueber gueltigen Magic-Link-Token.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { tokenRateLimiter, getClientIp } from "@/lib/rate-limit";

// =============================================
// GET /api/civil-service-application/[token]
// =============================================
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    // Rate Limiting gegen Token-Enumeration
    const clientIp = getClientIp(request);
    const rlCheck = tokenRateLimiter.check(clientIp);
    if (!rlCheck.allowed) {
      return NextResponse.json(
        { error: "Zu viele Anfragen. Bitte warten Sie." },
        { status: 429 }
      );
    }

    const { token } = await params;

    // Prozess per applicationToken laden
    const process = await prisma.civilServiceProcess.findFirst({
      where: { applicationToken: token },
      select: {
        id: true,
        displayId: true,
        status: true,
        employeeFirstName: true,
        employeeLastName: true,
        employeeEmail: true,
        prerequisites: true,
        applicationTokenExpiresAt: true,
        applicationSubmittedAt: true,
        applicationData: true,
        organization: {
          select: {
            name: true,
            shortName: true,
          },
        },
      },
    });

    if (!process) {
      return NextResponse.json({ error: "Ungueltiger Link" }, { status: 404 });
    }

    if (process.applicationTokenExpiresAt && process.applicationTokenExpiresAt < new Date()) {
      return NextResponse.json({ error: "Link ist abgelaufen" }, { status: 410 });
    }

    if (process.applicationSubmittedAt) {
      return NextResponse.json(
        { error: "Dieser Antrag wurde bereits eingereicht" },
        { status: 410 }
      );
    }

    return NextResponse.json({
      data: {
        processId: process.id,
        displayId: process.displayId,
        employeeName: `${process.employeeFirstName} ${process.employeeLastName}`,
        employeeEmail: process.employeeEmail,
        organizationName: process.organization.name,
        organizationShortName: process.organization.shortName,
        prerequisites: process.prerequisites,
        applicationData: process.applicationData,
      },
    });
  } catch (error) {
    console.error("[API] Civil-Service Application Token-Zugriff fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// =============================================
// PUT /api/civil-service-application/[token]
// =============================================
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    // Rate Limiting
    const clientIp = getClientIp(request);
    const rlCheck = tokenRateLimiter.check(clientIp);
    if (!rlCheck.allowed) {
      return NextResponse.json(
        { error: "Zu viele Anfragen. Bitte warten Sie." },
        { status: 429 }
      );
    }

    const { token } = await params;

    // Prozess per applicationToken laden
    const process = await prisma.civilServiceProcess.findFirst({
      where: { applicationToken: token },
      select: {
        id: true,
        applicationTokenExpiresAt: true,
        applicationSubmittedAt: true,
      },
    });

    if (!process) {
      return NextResponse.json({ error: "Ungueltiger Link" }, { status: 404 });
    }

    if (process.applicationTokenExpiresAt && process.applicationTokenExpiresAt < new Date()) {
      return NextResponse.json({ error: "Link ist abgelaufen" }, { status: 410 });
    }

    if (process.applicationSubmittedAt) {
      return NextResponse.json(
        { error: "Dieser Antrag wurde bereits eingereicht" },
        { status: 410 }
      );
    }

    // Body parsen
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Ungueltiger Request-Body" }, { status: 400 });
    }

    const { prerequisites, employeeStatement } = body as {
      prerequisites?: Record<string, unknown>;
      employeeStatement?: string;
    };

    if (!prerequisites || typeof prerequisites !== "object") {
      return NextResponse.json({ error: "prerequisites ist erforderlich" }, { status: 400 });
    }

    // Daten speichern (JSON-Felder via Prisma)
    const applicationData: any = {
      prerequisites,
      employeeStatement: employeeStatement || null,
      lastSavedAt: new Date().toISOString(),
    };

    await prisma.civilServiceProcess.update({
      where: { id: process.id },
      data: {
        applicationData,
        prerequisites: prerequisites as any,
      },
    });

    return NextResponse.json({
      data: { success: true },
    });
  } catch (error) {
    console.error("[API] Civil-Service Application speichern fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
