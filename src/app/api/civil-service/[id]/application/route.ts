/**
 * API: /api/civil-service/[id]/application
 *
 * POST - Magic Link fuer LK-Antrag auf Verbeamtung generieren
 *
 * Auth erforderlich (HR).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { randomUUID } from "crypto";

// =============================================
// POST /api/civil-service/[id]/application
// =============================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const { id } = await params;

    // Body parsen
    const body = await request.json().catch(() => null);
    if (!body || !body.recipientEmail) {
      return NextResponse.json(
        { error: "recipientEmail ist erforderlich" },
        { status: 400 }
      );
    }

    const { recipientEmail, recipientName } = body as {
      recipientEmail: string;
      recipientName?: string;
    };

    // Prozess laden
    const csProcess = await prisma.civilServiceProcess.findUnique({
      where: { id },
      select: {
        id: true,
        displayId: true,
        status: true,
        applicationToken: true,
        applicationSubmittedAt: true,
        employeeFirstName: true,
        employeeLastName: true,
      },
    });

    if (!csProcess) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }

    // Pruefen ob bereits eingereicht
    if (csProcess.applicationSubmittedAt) {
      return NextResponse.json(
        { error: "Der Antrag wurde bereits eingereicht" },
        { status: 400 }
      );
    }

    // Token generieren (UUID, 30 Tage gueltig)
    const token = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Token auf dem Prozess speichern
    await prisma.civilServiceProcess.update({
      where: { id },
      data: {
        applicationToken: token,
        applicationTokenExpiresAt: expiresAt,
      },
    });

    // Audit-Log schreiben
    await prisma.auditLog.create({
      data: {
        action: "APPLICATION_LINK_GENERATED",
        processType: "CIVIL_SERVICE",
        userId: session.userId,
        details: {
          recipientEmail,
          recipientName: recipientName || null,
          expiresAt: expiresAt.toISOString(),
        },
        civilServiceId: id,
      },
    });

    // Magic URL bauen
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const magicUrl = `${baseUrl}/civil-service-application/${token}`;

    return NextResponse.json({
      data: {
        token,
        magicUrl,
        expiresAt: expiresAt.toISOString(),
        recipientEmail,
        recipientName: recipientName || `${csProcess.employeeFirstName} ${csProcess.employeeLastName}`,
      },
    });
  } catch (error) {
    console.error("[API] Application-Link generieren fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
