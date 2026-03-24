/**
 * API: /api/cron/reminders
 *
 * POST – Erinnerungs-E-Mails an ueberfaellige Vorgaenge senden
 *
 * Wird taeglich von n8n per Cron-Workflow aufgerufen.
 * Sicherheit: Authentifizierung ueber CRON_SECRET Bearer-Token.
 *
 * Logik:
 * - Mitarbeiter-Erinnerung: Status INVITED/IN_PROGRESS, >7 Tage offen
 * - Vorgesetzten-Erinnerung: Status SUPERVISOR_PENDING, >7 Tage offen
 * - Eskalation: Zweite Erinnerung nach 14 Tagen
 * - Maximal 1 Erinnerung pro 7-Tage-Intervall
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { triggerWebhooks } from "@/lib/webhooks";

const REMINDER_INTERVAL_DAYS = 7;
const MS_PER_DAY = 86400000;

/** Timing-Safe String-Vergleich (verhindert Timing-Attacken auf CRON_SECRET) */
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function POST(request: NextRequest) {
  // Auth-Check: CRON_SECRET (Timing-Safe)
  const authHeader = request.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET nicht konfiguriert" },
      { status: 500 }
    );
  }

  const expected = `Bearer ${cronSecret}`;
  if (!timingSafeCompare(authHeader, expected)) {
    return NextResponse.json(
      { error: "Nicht autorisiert" },
      { status: 401 }
    );
  }

  const now = new Date();
  const reminderThreshold = new Date(now.getTime() - REMINDER_INTERVAL_DAYS * MS_PER_DAY);
  const results = { employeeReminders: 0, supervisorReminders: 0, errors: 0 };

  try {
    // =============================================
    // 1. Mitarbeiter-Erinnerungen
    // Status: INVITED oder IN_PROGRESS, eingeladen vor >7 Tagen,
    // letzte Erinnerung >7 Tage her oder noch nie erinnert
    // =============================================
    const employeeOverdue = await prisma.onboardingProcess.findMany({
      where: {
        status: { in: ["INVITED", "IN_PROGRESS"] },
        invitedAt: { lt: reminderThreshold },
        OR: [
          { lastEmployeeReminderAt: null },
          { lastEmployeeReminderAt: { lt: reminderThreshold } },
        ],
      },
      include: {
        organization: { select: { name: true } },
        personalData: { select: { firstName: true, lastName: true } },
      },
    });

    for (const process of employeeOverdue) {
      try {
        const daysOpen = Math.floor(
          (now.getTime() - new Date(process.invitedAt).getTime()) / MS_PER_DAY
        );

        const vorname = process.personalData?.firstName || process.firstName || "";
        const nachname = process.personalData?.lastName || process.lastName || "";

        await triggerWebhooks("employee-reminder", {
          onboardingId: process.id,
          email: process.email,
          vorname,
          nachname,
          firstName: vorname,
          lastName: nachname,
          einrichtung: process.organization.name,
          organization: process.organization.name,
          tage_offen: daysOpen,
          fragebogenLink: `${getBaseUrl()}/fragebogen/${process.token}`,
          link: `${getBaseUrl()}/fragebogen/${process.token}`,
          displayId: process.displayId || process.id.substring(0, 8),
        });

        await prisma.onboardingProcess.update({
          where: { id: process.id },
          data: { lastEmployeeReminderAt: now },
        });

        // Audit-Log
        await prisma.auditLog.create({
          data: {
            onboardingId: process.id,
            action: "EMPLOYEE_REMINDER_SENT",
            details: { daysOpen, email: process.email },
          },
        });

        results.employeeReminders++;
      } catch (err) {
        console.error(`[Reminders] Fehler bei MA-Erinnerung ${process.id}:`, err);
        results.errors++;
      }
    }

    // =============================================
    // 2. Vorgesetzten-Erinnerungen
    // Status: SUPERVISOR_PENDING, Supervisor-Token existiert,
    // erstellt vor >7 Tagen
    // =============================================
    const supervisorOverdue = await prisma.onboardingProcess.findMany({
      where: {
        status: "SUPERVISOR_PENDING",
        supervisorToken: { not: null },
        invitedAt: { lt: reminderThreshold },
        OR: [
          { lastSupervisorReminderAt: null },
          { lastSupervisorReminderAt: { lt: reminderThreshold } },
        ],
      },
      include: {
        organization: { select: { name: true } },
        personalData: { select: { firstName: true, lastName: true } },
      },
    });

    for (const process of supervisorOverdue) {
      // Ohne Supervisor-E-Mail koennen wir keine Erinnerung senden
      if (!process.supervisorEmail) {
        continue;
      }

      try {
        const daysOpen = Math.floor(
          (now.getTime() - new Date(process.invitedAt).getTime()) / MS_PER_DAY
        );

        const mitarbeiterName =
          process.personalData?.firstName && process.personalData?.lastName
            ? `${process.personalData.firstName} ${process.personalData.lastName}`
            : process.email;

        await triggerWebhooks("supervisor-reminder", {
          onboardingId: process.id,
          email: process.supervisorEmail,
          supervisorEmail: process.supervisorEmail,
          mitarbeiter_name: mitarbeiterName,
          einrichtung: process.organization.name,
          organization: process.organization.name,
          tage_offen: daysOpen,
          modalitaetenLink: `${getBaseUrl()}/vorgesetzter/${process.supervisorToken}`,
          supervisor_link: `${getBaseUrl()}/vorgesetzter/${process.supervisorToken}`,
          displayId: process.displayId || process.id.substring(0, 8),
        });

        await prisma.onboardingProcess.update({
          where: { id: process.id },
          data: { lastSupervisorReminderAt: now },
        });

        await prisma.auditLog.create({
          data: {
            onboardingId: process.id,
            action: "SUPERVISOR_REMINDER_SENT",
            details: { daysOpen, email: process.supervisorEmail },
          },
        });

        results.supervisorReminders++;
      } catch (err) {
        console.error(`[Reminders] Fehler bei VG-Erinnerung ${process.id}:`, err);
        results.errors++;
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      ...results,
      total: results.employeeReminders + results.supervisorReminders,
    });
  } catch (error) {
    console.error("[Reminders] Schwerer Fehler:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "https://hr.credo-schulen.de";
}
