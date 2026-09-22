/**
 * API: /api/cron/reminders
 *
 * POST – Erinnerungs-E-Mails an ueberfaellige Vorgaenge senden
 *
 * Wird taeglich von n8n per Cron-Workflow aufgerufen.
 * Sicherheit: Authentifizierung über CRON_SECRET Bearer-Token.
 *
 * Logik (seit 09/2026 fuer zwei parallele Spuren, siehe src/lib/onboarding-spuren.ts):
 * - Mitarbeiter-Erinnerung: Fragebogen nicht abgesendet (`submittedAt` leer,
 *   Status INVITED/IN_PROGRESS), Link noch gueltig, eingeladen vor > 7 Tagen.
 * - Vorgesetzten-Erinnerung: Link erzeugt und noch gueltig, Modalitaeten nicht
 *   abgesendet, Vorgang nicht geprueft/abgeschlossen/abgelaufen — AUCH solange
 *   der Fragebogen noch offen ist. Erstmals 7 Tage nach dem Link.
 * - Hoechstens eine Erinnerung je Seite und 7-Tage-Intervall.
 * - Der Merker `last…ReminderAt` haengt am Mailergebnis (Entscheidung 09/2026):
 *     SENT     Merker setzen, AuditLog „…_REMINDER_SENT".
 *     SKIPPED  Merker TROTZDEM setzen, kein AuditLog. SKIPPED heisst: Vorlage
 *              deaktiviert oder fehlt, kein Empfaenger — ein Versuch am
 *              naechsten Tag aendert daran nichts. Ohne Merker liefe die
 *              ganze Erinnerung taeglich statt woechentlich: `triggerWebhooks`
 *              feuert die DB-Webhooks unabhaengig vom Mailergebnis (wer die
 *              Vorlage abgeschaltet hat, weil n8n per Webhook erinnert, haette
 *              die Person taeglich angeschrieben), und jeder Lauf schriebe je
 *              Vorgang einen SKIPPED-Eintrag ins Versandprotokoll.
 *     FAILED   (und `null`, falls der Dispatcher selbst scheitert) Merker NICHT
 *              setzen: Ein SMTP-Ausfall ist voruebergehend, der naechste Lauf
 *              versucht es erneut, statt die Erinnerung eine Woche lang als
 *              erledigt zu fuehren.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { triggerWebhooks } from "@/lib/webhooks";
import { getBaseUrl } from "@/lib/url";
import { magicLinkGueltigkeitMs } from "@/lib/auth";
import {
  HR_STATUS,
  MITARBEITER_NEUTRAL,
  mitarbeiterName as nameDerPerson,
  vorgesetzteAbgesendet,
  vorgesetztenLinkErzeugtAm,
} from "@/lib/onboarding-spuren";
import type { EventEmailResult } from "@/lib/mailer";

const REMINDER_INTERVAL_DAYS = 7;
const MS_PER_DAY = 86400000;

/**
 * Soll der Merker „zuletzt erinnert" gesetzt werden? Bei SENT und SKIPPED ja,
 * bei FAILED (oder ohne Ergebnis) nein — Begruendung im Kopfkommentar.
 */
function merkerSetzen(mail: EventEmailResult | null | undefined): boolean {
  return mail?.status === "SENT" || mail?.status === "SKIPPED";
}

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
  // `notSent`: faellige Erinnerungen, deren Mail nicht rausging (FAILED oder
  // SKIPPED, z. B. Vorlage deaktiviert). Der Grund steht im EmailLog.
  const results = { employeeReminders: 0, supervisorReminders: 0, notSent: 0, errors: 0 };

  try {
    // =============================================
    // 1. Mitarbeiter-Erinnerungen
    // Fragebogen nicht abgesendet, Link noch gueltig, eingeladen vor >7 Tagen,
    // letzte Erinnerung >7 Tage her oder noch nie erinnert.
    //
    // `submittedAt: null` zusaetzlich zum Status: Der Status fasst seit dem
    // parallelen Ablauf beide Spuren zusammen; massgeblich ist die eigene.
    // `tokenExpiresAt > jetzt`: Frueher gingen Erinnerungen auch mit einem
    // Link hinaus, der beim Klick nur noch „Token abgelaufen" zeigte.
    // =============================================
    const employeeOverdue = await prisma.onboardingProcess.findMany({
      where: {
        submittedAt: null,
        status: { in: ["INVITED", "IN_PROGRESS"] },
        tokenExpiresAt: { gt: now },
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

        const mail = await triggerWebhooks("employee-reminder", {
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

        // Merker bei SENT und SKIPPED, nicht bei FAILED (siehe Kopfkommentar).
        // Ohne diese Unterscheidung stuende nach einem SMTP-Ausfall eine Woche
        // lang „erinnert" im Vorgang, obwohl niemand etwas bekommen hat.
        if (merkerSetzen(mail)) {
          await prisma.onboardingProcess.update({
            where: { id: process.id },
            data: { lastEmployeeReminderAt: now },
          });
        }
        if (mail?.status !== "SENT") {
          results.notSent++;
          continue;
        }

        // Audit-Log — nur fuer eine wirklich versendete Erinnerung
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
    // Link erzeugt und noch gueltig, Modalitaeten nicht abgesendet, Vorgang
    // nicht in HR-Hand. Frueher nur bei Status SUPERVISOR_PENDING — also erst,
    // NACHDEM der Fragebogen da war. Im parallelen Ablauf entsteht der Link
    // aber oft frueher, und die Fuehrungskraft bekam dann nie eine Erinnerung.
    //
    // Faellig 7 Tage nach der letzten Erinnerung, sonst 7 Tage nach dem Link
    // (`supervisorLinkSentAt`).
    //
    // Links aus der Zeit vor dieser Spalte (Bestand beim Deploy) haben keinen
    // `supervisorLinkSentAt`. Frueher galt fuer sie die Einladung der Person
    // (`invitedAt`) — das traf, solange nur SUPERVISOR_PENDING erinnert wurde.
    // Jetzt fallen auch Vorgaenge mit offenem Fragebogen darunter, deren Link
    // HR vielleicht erst vor zwei Tagen erzeugt hat; sie bekaemen gleich beim
    // ersten Lauf eine Erinnerung mit „seit 23 Tagen offen". Deshalb wird der
    // Erzeugungszeitpunkt aus dem Ablauf zurueckgerechnet (Ablauf minus
    // Gueltigkeit, nie vor der Einladung — `vorgesetztenLinkErzeugtAm`). Im
    // WHERE heisst „erzeugt vor der Schwelle" damit: eingeladen vor der
    // Schwelle UND Ablauf vor Schwelle + Gueltigkeit.
    // =============================================
    const linkGueltigkeitMs = magicLinkGueltigkeitMs();
    const supervisorOverdue = await prisma.onboardingProcess.findMany({
      where: {
        supervisorToken: { not: null },
        supervisorEmail: { not: null },
        supervisorSubmittedAt: null,
        supervisorTokenExpiresAt: { gt: now },
        status: { notIn: [...HR_STATUS] },
        OR: [
          { lastSupervisorReminderAt: { lt: reminderThreshold } },
          {
            lastSupervisorReminderAt: null,
            supervisorLinkSentAt: { lt: reminderThreshold },
          },
          {
            lastSupervisorReminderAt: null,
            supervisorLinkSentAt: null,
            invitedAt: { lt: reminderThreshold },
            supervisorTokenExpiresAt: {
              lt: new Date(reminderThreshold.getTime() + linkGueltigkeitMs),
            },
          },
        ],
      },
      include: {
        organization: { select: { name: true } },
        personalData: { select: { firstName: true, lastName: true } },
        supervisorData: { select: { isComplete: true } },
      },
    });

    for (const process of supervisorOverdue) {
      // Ohne Supervisor-E-Mail koennen wir keine Erinnerung senden (steht auch
      // im WHERE — die Zeile schuetzt den Typ und einen Altbestand mit "").
      if (!process.supervisorEmail) {
        continue;
      }
      // Altfall: Modalitaeten abgesendet, aber ohne Zeitstempel (isComplete).
      if (vorgesetzteAbgesendet(process)) {
        continue;
      }

      try {
        // Offen seit dem Link, nicht seit der Einladung der Person: Im
        // parallelen Ablauf liegen dazwischen oft Tage. Derselbe Anker wie im
        // WHERE oben (Rueckrechnung fuer Bestandslinks).
        const offenSeit = vorgesetztenLinkErzeugtAm(process, linkGueltigkeitMs);
        const daysOpen = Math.floor(
          (now.getTime() - offenSeit.getTime()) / MS_PER_DAY
        );

        // Name aus Fragebogen oder Vorgang, sonst die neutrale Bezeichnung —
        // NIE die private E-Mail-Adresse der Person (Datensparsamkeit, Art. 5
        // Abs. 1 lit. c DSGVO). Seit die Erinnerung auch bei offenem
        // Fragebogen kommt, ist „noch kein Name" der Normalfall: Die Adresse
        // stuende sonst woechentlich in Betreff und Text an die Fuehrungskraft,
        // 90 Tage im Versandprotokoll und in jedem Webhook. Die Vorlage sagt
        // „Einstellungsmodalitäten für {{mitarbeiter_name}}" — genau der
        // Akkusativ, fuer den MITARBEITER_NEUTRAL gebaut ist. Ausdruecklich
        // gesetzt, nie leer: Ein leerer Wert fiele in `extractVariables`
        // (mailer.ts) auf `payload.email` zurueck, und das ist hier die Adresse
        // der Fuehrungskraft.
        const mitarbeiterName = nameDerPerson(process) ?? MITARBEITER_NEUTRAL;

        // Frueher /vorgesetzter/<token> — diese Seite gibt es nicht; jede
        // Vorgesetzten-Erinnerung fuehrte auf einen 404.
        const modalitaetenLink = `${getBaseUrl()}/modalitaeten/${process.supervisorToken}`;

        const mail = await triggerWebhooks("supervisor-reminder", {
          onboardingId: process.id,
          email: process.supervisorEmail,
          supervisorEmail: process.supervisorEmail,
          mitarbeiter_name: mitarbeiterName,
          einrichtung: process.organization.name,
          organization: process.organization.name,
          tage_offen: daysOpen,
          modalitaetenLink,
          supervisor_link: modalitaetenLink,
          displayId: process.displayId || process.id.substring(0, 8),
        });

        // Merker bei SENT und SKIPPED, nicht bei FAILED (siehe Kopfkommentar).
        if (merkerSetzen(mail)) {
          await prisma.onboardingProcess.update({
            where: { id: process.id },
            data: { lastSupervisorReminderAt: now },
          });
        }
        if (mail?.status !== "SENT") {
          results.notSent++;
          continue;
        }

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

    // EmailLog-Aufbewahrung (90 Tage, DSGVO): taeglich hier durchsetzen,
    // unabhaengig davon ob jemand das Versandprotokoll in der UI oeffnet
    try {
      const cutoff = new Date(now.getTime() - 90 * MS_PER_DAY);
      await prisma.emailLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    } catch (err) {
      console.error("[Reminders] EmailLog-Cleanup fehlgeschlagen:", err);
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