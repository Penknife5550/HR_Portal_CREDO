/**
 * API: POST /api/contract-end/:id/supervisor-link
 *
 * Strang A des Vertragsende-Prozesses: HR loest MANUELL (wie im Onboarding) eine
 * Anfrage per Magic-Link an die Vorgesetzte:n aus. Ueber den Link ENTSCHEIDET die
 * Fuehrungskraft selbst ueber die Uebernahme und fuellt bei Ja die neuen
 * Vertragsdaten aus (oeffentliches Formular /vertrag-formular/[token]).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { generateToken, getTokenExpiryDate, getSession } from "@/lib/auth";
import { triggerWebhooks } from "@/lib/webhooks";
import { canAccessProcess, HR_EDIT_ROLES } from "@/lib/permissions";

const bodySchema = z.object({
  supervisorEmail: z.string().email("Ungültige E-Mail-Adresse"),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!HR_EDIT_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }
    const { supervisorEmail } = parsed.data;

    const contractEnd = await prisma.contractEndProcess.findUnique({
      where: { id },
      include: { organization: true },
    });
    if (!contractEnd) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (!(await canAccessProcess(session, contractEnd.organizationId))) {
      return NextResponse.json(
        { error: "Keine Berechtigung für diesen Vorgang" },
        { status: 403 }
      );
    }
    if (
      [
        "ENTSCHEIDUNG_KEINE_UEBERNAHME",
        "VERTRAG_ERSTELLT",
        "VERTRAG_UNTERSCHRIEBEN",
        "ABGESCHLOSSEN",
        "STORNIERT",
      ].includes(contractEnd.status)
    ) {
      return NextResponse.json(
        {
          error: `Vorgang im Status "${contractEnd.status}" — eine Vorgesetzten-Anfrage ist nicht mehr moeglich.`,
        },
        { status: 400 }
      );
    }

    const supervisorToken = generateToken();
    const supervisorTokenExpiresAt = getTokenExpiryDate();

    const updated = await prisma.contractEndProcess.update({
      where: { id },
      data: {
        supervisorEmail,
        supervisorToken,
        supervisorTokenExpiresAt,
        supervisorLinkSentAt: new Date(),
        // Neuer Prozess: die Fuehrungskraft entscheidet -> Anfrage ist offen.
        // Rueckmeldung/Entscheidung zuruecksetzen (auch bei erneuter Anfrage).
        status: "ANFRAGE_VORGESETZTER",
        decision: "OFFEN",
        supervisorRespondedAt: null,
        supervisorDeclineReason: null,
      },
    });

    // Leeren Vertragsdaten-Datensatz anlegen (wird vom Vorgesetzten gefuellt)
    await prisma.contractRenewalData.upsert({
      where: { contractEndId: id },
      update: {},
      create: { contractEndId: id },
    });

    await prisma.auditLog.create({
      data: {
        contractEndId: id,
        userId: session.userId,
        processType: "CONTRACT_END",
        action: "SUPERVISOR_LINK_CREATED",
        details: {
          supervisorEmail,
          organization: contractEnd.organization.name,
        },
      },
    });

    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const formularLink = `${appUrl}/vertrag-formular/${supervisorToken}`;
    const employeeName = `${contractEnd.employeeFirstName} ${contractEnd.employeeLastName}`;

    // SMTP primaer (Event), Webhooks zusaetzlich — wirft nie
    await triggerWebhooks("contract-end-supervisor-link", {
      contractEndId: id,
      displayId: contractEnd.displayId,
      supervisorEmail,
      formularLink,
      employeeName,
      organization: contractEnd.organization.name,
      mandantNummer: contractEnd.organization.mandantNumber,
      contractEndDate: contractEnd.contractEndDate.toISOString(),
      tokenExpiresAt: supervisorTokenExpiresAt.toISOString(),
    });

    return NextResponse.json(
      {
        id: updated.id,
        supervisorEmail,
        formularLink,
        employeeName,
        supervisorTokenExpiresAt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Fehler beim Erstellen des Vorgesetzten-Links (Vertragsende):", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
