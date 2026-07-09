/**
 * API: /api/contract-end/[id]/reminder
 *
 * POST – Manuelle Erinnerung an die Fuehrungskraft (HR-Button auf der
 * Detailseite). Verschickt die bekannte Erinnerungs-Mail mit dem BESTEHENDEN
 * Magic-Link — im Gegensatz zu "Anfrage erneut senden" wird KEIN neuer Token
 * erzeugt und keine begonnene Bearbeitung zurueckgesetzt.
 *
 * Kein Intervall-Zwang wie im Cron: der Klick ist eine bewusste HR-Entscheidung.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { HR_EDIT_ROLES, canAccessProcess } from "@/lib/permissions";
import { sendSupervisorReminder } from "@/lib/contract-end-reminder";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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
    const ce = await prisma.contractEndProcess.findUnique({
      where: { id },
      include: { organization: { select: { name: true } } },
    });
    if (!ce) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (!(await canAccessProcess(session, ce.organizationId))) {
      return NextResponse.json(
        { error: "Keine Berechtigung für diesen Vorgang" },
        { status: 403 },
      );
    }

    // Erinnern ergibt nur Sinn, solange die Anfrage offen ist
    // (ENTSCHEIDUNG_UEBERNAHME = Alt-Bestandsdaten des frueheren Flows).
    if (!["ANFRAGE_VORGESETZTER", "ENTSCHEIDUNG_UEBERNAHME"].includes(ce.status)) {
      return NextResponse.json(
        { error: "Es gibt keine offene Vorgesetzten-Anfrage für diesen Vorgang." },
        { status: 409 },
      );
    }
    if (!ce.supervisorEmail || !ce.supervisorToken || !ce.supervisorLinkSentAt) {
      return NextResponse.json(
        { error: "Es wurde noch keine Anfrage an die Führungskraft versendet." },
        { status: 409 },
      );
    }
    if (!ce.supervisorTokenExpiresAt || ce.supervisorTokenExpiresAt < new Date()) {
      return NextResponse.json(
        {
          error:
            "Der Formular-Link ist abgelaufen. Bitte „Anfrage erneut senden“ nutzen (erzeugt einen neuen Link).",
        },
        { status: 409 },
      );
    }

    await sendSupervisorReminder(ce, new Date(), { manuell: true });

    const updated = await prisma.contractEndProcess.findUnique({
      where: { id },
      select: { lastSupervisorReminderAt: true, supervisorReminderCount: true },
    });
    return NextResponse.json({ ok: true, ...updated });
  } catch (error) {
    console.error("[API] Vertragsende-Erinnerung fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
