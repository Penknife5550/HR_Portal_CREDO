/**
 * API: /api/onboarding/:id/supervisor-link
 *
 * POST – Vorgesetzten-Link generieren
 *
 * n8n ruft diesen Endpunkt auf, um für einen bestehenden
 * Onboarding-Vorgang einen zweiten Link für den Vorgesetzten
 * zu erstellen (Einstellungsmodalitaeten).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateToken, getTokenExpiryDate, getSession } from "@/lib/auth";
import { triggerN8nWebhook } from "@/lib/n8n";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth-Check
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { supervisorEmail } = body;

    if (!supervisorEmail) {
      return NextResponse.json(
        { error: "supervisorEmail ist ein Pflichtfeld" },
        { status: 400 }
      );
    }

    // Vorgang pruefen
    const onboarding = await prisma.onboardingProcess.findUnique({
      where: { id },
      include: { organization: true },
    });

    if (!onboarding) {
      return NextResponse.json(
        { error: "Vorgang nicht gefunden" },
        { status: 404 }
      );
    }

    // Supervisor-Token generieren
    const supervisorToken = generateToken();
    const supervisorTokenExpiresAt = getTokenExpiryDate();

    // Vorgang aktualisieren
    const updated = await prisma.onboardingProcess.update({
      where: { id },
      data: {
        supervisorEmail,
        supervisorToken,
        supervisorTokenExpiresAt,
        status:
          onboarding.status === "SUBMITTED"
            ? "SUPERVISOR_PENDING"
            : onboarding.status,
      },
    });

    // SupervisorData-Datensatz anlegen (leer, wird vom Vorgesetzten gefuellt)
    await prisma.supervisorData.upsert({
      where: { onboardingId: id },
      update: {},
      create: { onboardingId: id },
    });

    // Audit-Log
    await prisma.auditLog.create({
      data: {
        onboardingId: id,
        userId: session.userId,
        action: "SUPERVISOR_LINK_CREATED",
        details: {
          supervisorEmail,
          organization: onboarding.organization.name,
        },
      },
    });

    // Link zusammenbauen
    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const modalitaetenLink = `${appUrl}/modalitaeten/${supervisorToken}`;

    // n8n Webhook: Vorgesetzten-Link erstellt (damit n8n die E-Mail an den Vorgesetzten senden kann)
    const employeeName = onboarding.firstName
      ? `${onboarding.firstName} ${onboarding.lastName}`
      : onboarding.email;
    await triggerN8nWebhook("supervisor-link-created", {
      onboardingId: id,
      supervisorEmail,
      modalitaetenLink,
      employeeName,
      organization: onboarding.organization.name,
      mandantNumber: onboarding.organization.mandantNumber,
      supervisorTokenExpiresAt: supervisorTokenExpiresAt.toISOString(),
    });

    return NextResponse.json(
      {
        id: updated.id,
        supervisorEmail,
        modalitaetenLink,
        organization: {
          id: onboarding.organization.id,
          name: onboarding.organization.name,
          mandantNumber: onboarding.organization.mandantNumber,
        },
        employeeName,
        supervisorTokenExpiresAt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Fehler beim Erstellen des Vorgesetzten-Links:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
