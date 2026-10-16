/**
 * API: /api/civil-service/[id]/application
 *
 * POST - Magic Link für LK-Antrag auf Verbeamtung generieren
 *
 * Auth erforderlich (HR).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessProcess, HR_EDIT_ROLES } from "@/lib/permissions";
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

    // Rollenpruefung, bis zum 16.10.2026 FEHLEND: Diese Route erzeugt einen
    // lebenden Magic-Link-Token, ueberschreibt damit einen bestehenden und gibt
    // Token samt Adresse in der Antwort zurueck — mit ihm reicht jemand den
    // Verbeamtungsantrag im Namen der Lehrkraft ein. Geprueft wurde nur, ob
    // ueberhaupt eine Sitzung besteht; jede angemeldete Rolle und das
    // n8n-Dienstkonto kamen durch. Die uebrigen Unterrouten des Moduls pruefen
    // alle selbst (assessments, board-decision, phases, export, checklist) —
    // hier war es vergessen.
    if (!HR_EDIT_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
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
        organizationId: true,
        displayId: true,
        status: true,
        applicationToken: true,
        applicationSubmittedAt: true,
        employeeFirstName: true,
        employeeLastName: true,
      },
    });

    // Unbekannt und fremder Mandant geben dieselbe Antwort — sonst verriete der
    // Code, dass es den Vorgang gibt. `canAccessProcess` fehlte hier ebenfalls.
    if (!csProcess || !(await canAccessProcess(session, csProcess.organizationId))) {
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
