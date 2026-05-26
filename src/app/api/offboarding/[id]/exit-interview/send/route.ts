/**
 * API: /api/offboarding/[id]/exit-interview/send
 *
 * POST - Magic Link sofort senden (7-Tage-Verzoegerung ueberspringen)
 *
 * Berechtigung: Authentifizierter Benutzer
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// =============================================
// POST /api/offboarding/[id]/exit-interview/send
// =============================================
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const { id } = await params;

    // Exit-Interview laden
    const exitInterview = await prisma.exitInterview.findUnique({
      where: { offboardingId: id },
    });

    if (!exitInterview) {
      return NextResponse.json({ error: "Kein Exit-Interview für dieses Offboarding gefunden" }, { status: 404 });
    }

    if (exitInterview.status === "SUBMITTED") {
      return NextResponse.json({ error: "Exit-Interview wurde bereits abgeschlossen" }, { status: 400 });
    }

    if (exitInterview.status === "EXPIRED") {
      return NextResponse.json({ error: "Exit-Interview ist abgelaufen" }, { status: 400 });
    }

    // Status auf INVITED setzen, sentAt aktualisieren
    const updated = await prisma.exitInterview.update({
      where: { id: exitInterview.id },
      data: {
        status: "INVITED",
        sentAt: new Date(),
      },
    });

    // TODO: Webhook "exit-interview-invited" triggern
    // await triggerWebhooks("exit-interview-invited", { ... });
    console.log(`[Exit-Interview] Einladung gesendet für Interview ${exitInterview.id}, Offboarding ${id}`);

    // AuditLog schreiben
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        offboardingId: id,
        processType: "OFFBOARDING",
        action: "EXIT_INTERVIEW_INVITED",
        details: {
          exitInterviewId: exitInterview.id,
          recipientEmail: exitInterview.recipientEmail,
          forceSent: true,
        },
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("[API] Exit-Interview senden fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
