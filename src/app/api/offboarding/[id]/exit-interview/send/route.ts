/**
 * API: /api/offboarding/[id]/exit-interview/send
 *
 * POST - Magic Link sofort senden (7-Tage-Verzoegerung ueberspringen) bzw.
 *        erneut senden („Reminder")
 *
 * Berechtigung: HR_EDIT_ROLES — die Mail traegt den Magic Link an die private
 * Adresse der Person; der n8n-Schluessel (SERVICE) und die Portal-Rollen ohne
 * Bearbeitungsrecht bekommen 403. Mandant per canAccessProcess: unbekannt und
 * fremd = dieselbe 404.
 *
 * Ablauf: erst die Mail (E-Mail primaer, Webhooks zusaetzlich), dann Status,
 * `sentAt` und AuditLog in EINER Transaktion — bedingt auf einen Status, in
 * dem der Link noch gilt; ein gleichzeitig abgeschlossenes Interview bleibt
 * abgeschlossen. Scheitert die Mail (FAILED), aendert sich nichts (502).
 * Aus SCHEDULED wird INVITED; INVITED und IN_PROGRESS behalten ihren Status
 * (frueher fiel ein begonnenes Interview beim „Reminder" auf INVITED zurueck).
 * Im AuditLog steht keine Adresse der Person.
 */

import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { HR_EDIT_ROLES } from "@/lib/permissions";
import { nichtGefunden, offboardingZugaenglich } from "@/lib/offboarding-zugriff";
import { triggerWebhooks } from "@/lib/webhooks";
import { getBaseUrl } from "@/lib/url";

/** In diesen Status gilt der Link noch — nur dann wird (erneut) eingeladen. */
const OFFENE_STATUS = ["SCHEDULED", "INVITED", "IN_PROGRESS"] as const;

function konflikt(text: string) {
  return NextResponse.json({ error: text }, { status: 409 });
}

// =============================================
// POST /api/offboarding/[id]/exit-interview/send
// =============================================
export const POST = apiHandler(
  { roles: HR_EDIT_ROLES, logLabel: "Offboarding/Exit-Interview senden" },
  async ({ params, session }) => {
    const id = params.id;
    if (!(await offboardingZugaenglich(session!, id))) return nichtGefunden();

    // Exit-Interview laden (inkl. Offboarding fuer E-Mail-Variablen)
    const exitInterview = await prisma.exitInterview.findUnique({
      where: { offboardingId: id },
      include: {
        offboarding: { include: { organization: true } },
      },
    });
    if (!exitInterview) {
      return nichtGefunden("Für diesen Vorgang gibt es noch kein Exit-Interview.");
    }

    if (exitInterview.status === "SUBMITTED") {
      return konflikt("Das Exit-Interview ist bereits abgeschlossen.");
    }
    if (exitInterview.status === "EXPIRED" || exitInterview.tokenExpiresAt < new Date()) {
      return konflikt("Der Link zum Exit-Interview ist abgelaufen.");
    }

    // Einladung versenden (E-Mail primaer, Webhooks zusaetzlich)
    const mail = await triggerWebhooks("exit-interview-invited", {
      offboardingId: id,
      displayId: exitInterview.offboarding.displayId,
      recipientEmail: exitInterview.recipientEmail,
      employeeName: `${exitInterview.offboarding.employeeFirstName} ${exitInterview.offboarding.employeeLastName}`,
      organization: exitInterview.offboarding.organization.name,
      magicLink: `${getBaseUrl()}/exit-interview/${exitInterview.token}`,
      expiresAt: exitInterview.tokenExpiresAt.toISOString(),
    });
    if (mail?.status === "FAILED") {
      console.error(`[Exit-Interview] Einladung fehlgeschlagen für Interview ${exitInterview.id}`);
      return NextResponse.json(
        { error: "Die Einladung konnte nicht versendet werden. Bitte später erneut versuchen." },
        { status: 502 }
      );
    }
    console.log(`[Exit-Interview] Einladung gesendet für Interview ${exitInterview.id}, Offboarding ${id}`);

    const updated = await prisma.$transaction(async (tx) => {
      const { count } = await tx.exitInterview.updateMany({
        where: { id: exitInterview.id, status: { in: [...OFFENE_STATUS] } },
        data: {
          ...(exitInterview.status === "SCHEDULED" ? { status: "INVITED" as const } : {}),
          sentAt: new Date(),
        },
      });
      if (count === 0) return null;
      await tx.auditLog.create({
        data: {
          userId: session!.userId,
          offboardingId: id,
          processType: "OFFBOARDING",
          action: "EXIT_INTERVIEW_INVITED",
          details: {
            exitInterviewId: exitInterview.id,
            forceSent: true,
            mailStatus: mail?.status ?? null,
          },
        },
      });
      return tx.exitInterview.findUnique({ where: { id: exitInterview.id } });
    });

    if (!updated) {
      return konflikt("Das Exit-Interview wurde inzwischen abgeschlossen. Bitte die Seite neu laden.");
    }
    return NextResponse.json({ data: updated, mailStatus: mail?.status ?? null });
  }
);
