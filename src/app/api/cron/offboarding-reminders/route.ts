/**
 * API: /api/cron/offboarding-reminders
 *
 * POST – Erinnerungen fuer offene Offboarding-Aufgaben senden
 *
 * Wird taeglich von n8n per Cron-Workflow aufgerufen.
 * Sicherheit: Authentifizierung ueber CRON_SECRET Bearer-Token.
 *
 * 3-Stufen-Logik:
 * - INFO: Item faellig in 3 Tagen, kein Reminder in letzten 3 Tagen
 * - WARNING: Item 1 Tag ueberfaellig, kein Reminder in letzten 2 Tagen
 * - ESCALATION: Item 3+ Tage ueberfaellig, kein Reminder in letzten 5 Tagen
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { triggerWebhooks } from "@/lib/webhooks";
import { getBaseUrl } from "@/lib/url";

const MS_PER_DAY = 86400000;

/** Timing-Safe String-Vergleich (verhindert Timing-Attacken auf CRON_SECRET) */
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

interface ReminderDetail {
  offboardingId: string;
  displayId: string;
  departmentKey: string;
  departmentName: string;
  email: string;
  level: "INFO" | "WARNING" | "ESCALATION";
  overdueItems: number;
  upcomingItems: number;
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
  const details: ReminderDetail[] = [];
  let errors = 0;

  try {
    // Alle aktiven Offboardings laden (nicht COMPLETED, nicht CANCELLED)
    const activeOffboardings = await prisma.offboardingProcess.findMany({
      where: {
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
      include: {
        organization: { select: { name: true } },
        departmentLinks: true,
        checklistItems: {
          where: { isCompleted: false },
          select: {
            id: true,
            title: true,
            dueDate: true,
            assigneeDepartment: true,
          },
        },
      },
    });

    for (const offboarding of activeOffboardings) {
      // Pro Department-Link pruefen ob Reminder noetig
      for (const deptLink of offboarding.departmentLinks) {
        if (deptLink.allTasksComplete) continue;

        // Offene Items fuer diese Abteilung finden
        const deptItems = offboarding.checklistItems.filter(
          (item) => item.assigneeDepartment === deptLink.departmentKey
        );

        if (deptItems.length === 0) continue;

        // Kategorisierung der Items
        const threeDaysFromNow = new Date(now.getTime() + 3 * MS_PER_DAY);
        let upcomingItems = 0; // Faellig in 3 Tagen
        let overdueItems = 0;
        let maxOverdueDays = 0;

        for (const item of deptItems) {
          if (!item.dueDate) continue;
          const dueDate = new Date(item.dueDate);
          const diffMs = now.getTime() - dueDate.getTime();
          const diffDays = diffMs / MS_PER_DAY;

          if (diffDays > 0) {
            // Ueberfaellig
            overdueItems++;
            if (diffDays > maxOverdueDays) maxOverdueDays = diffDays;
          } else if (dueDate <= threeDaysFromNow) {
            // Faellig in den naechsten 3 Tagen
            upcomingItems++;
          }
        }

        // Reminder-Level bestimmen
        let level: "INFO" | "WARNING" | "ESCALATION" | null = null;
        let minIntervalDays = 0;

        if (maxOverdueDays >= 3) {
          level = "ESCALATION";
          minIntervalDays = 5;
        } else if (maxOverdueDays >= 1) {
          level = "WARNING";
          minIntervalDays = 2;
        } else if (upcomingItems > 0) {
          level = "INFO";
          minIntervalDays = 3;
        }

        if (!level) continue;

        // Pruefen ob Reminder-Intervall eingehalten wird
        if (deptLink.lastReminderAt) {
          const daysSinceLastReminder =
            (now.getTime() - new Date(deptLink.lastReminderAt).getTime()) / MS_PER_DAY;
          if (daysSinceLastReminder < minIntervalDays) continue;
        }

        // Reminder senden
        try {
          const employeeName = `${offboarding.employeeFirstName} ${offboarding.employeeLastName}`;

          await triggerWebhooks("offboarding-reminder", {
            offboardingId: offboarding.id,
            displayId: offboarding.displayId,
            employeeName,
            employeeFirstName: offboarding.employeeFirstName,
            employeeLastName: offboarding.employeeLastName,
            einrichtung: offboarding.organization.name,
            organization: offboarding.organization.name,
            departmentKey: deptLink.departmentKey,
            departmentName: deptLink.departmentName,
            email: deptLink.email,
            level,
            overdueItems,
            upcomingItems,
            totalOpenItems: deptItems.length,
            maxOverdueDays: Math.floor(maxOverdueDays),
            magicLink: `${getBaseUrl()}/offboarding/abteilung/${deptLink.token}`,
            lastWorkingDay: offboarding.lastWorkingDay.toISOString(),
          });

          // DepartmentLink aktualisieren
          await prisma.offboardingDepartmentLink.update({
            where: { id: deptLink.id },
            data: {
              lastReminderAt: now,
              reminderCount: { increment: 1 },
            },
          });

          // Audit-Log
          await prisma.auditLog.create({
            data: {
              offboardingId: offboarding.id,
              processType: "OFFBOARDING",
              action: "OFFBOARDING_REMINDER_SENT",
              details: {
                level,
                departmentKey: deptLink.departmentKey,
                departmentName: deptLink.departmentName,
                email: deptLink.email,
                overdueItems,
                upcomingItems,
                reminderCount: deptLink.reminderCount + 1,
              },
            },
          });

          details.push({
            offboardingId: offboarding.id,
            displayId: offboarding.displayId,
            departmentKey: deptLink.departmentKey,
            departmentName: deptLink.departmentName,
            email: deptLink.email,
            level,
            overdueItems,
            upcomingItems,
          });
        } catch (err) {
          console.error(
            `[Offboarding-Reminders] Fehler bei ${offboarding.displayId} / ${deptLink.departmentKey}:`,
            err
          );
          errors++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      remindersProcessed: details.length,
      errors,
      details,
    });
  } catch (error) {
    console.error("[Offboarding-Reminders] Schwerer Fehler:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}