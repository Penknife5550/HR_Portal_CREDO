/**
 * API: /api/cron/contract-end-reminders
 *
 * POST – Erinnerungen an Vorgesetzte mit OFFENER Uebernahme-Anfrage.
 *
 * Wird (wie die uebrigen Cron-Routen) per CRON_SECRET Bearer-Token von n8n
 * aufgerufen. Erinnert nur Vorgaenge im Status ANFRAGE_VORGESETZTER (bzw. der
 * Alt-Bestand ENTSCHEIDUNG_UEBERNAHME) mit gesetzter supervisorEmail.
 *
 * Das Intervall ist nach der Fristen-Ampel gestaffelt — je naeher das
 * Vertragsende, desto haeufiger wird erinnert:
 *   KRITISCH   (1-2 Mon)  -> alle 3 Tage
 *   WARNUNG    (3-6 Mon)  -> alle 7 Tage
 *   BEOBACHTEN (7-12 Mon) -> alle 14 Tage
 *   AUSSERHALB            -> keine Erinnerung
 * Vor der ersten Erinnerung muss die Anfrage mindestens das Intervall her sein
 * (Referenz: lastSupervisorReminderAt, sonst supervisorLinkSentAt).
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { triggerWebhooks } from "@/lib/webhooks";
import { getBaseUrl } from "@/lib/url";
import {
  getContractEndCategory,
  CONTRACT_END_CATEGORY_META,
  type ContractEndCategory,
} from "@/lib/contract-end-fristen";

const MS_PER_DAY = 86400000;

// Erinnerungs-Intervall (Tage) je Ampel-Kategorie. null = keine Erinnerung.
const REMINDER_INTERVAL_DAYS: Record<ContractEndCategory, number | null> = {
  KRITISCH: 3,
  WARNUNG: 7,
  BEOBACHTEN: 14,
  AUSSERHALB: null,
};

/** Timing-Safe String-Vergleich (verhindert Timing-Attacken auf CRON_SECRET). */
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET nicht konfiguriert" }, { status: 500 });
  }
  if (!timingSafeCompare(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const now = new Date();
  const results = { reminders: 0, skipped: 0, errors: 0 };

  try {
    // Offene Vorgesetzten-Anfragen (neuer Prozess: ANFRAGE_VORGESETZTER;
    // ENTSCHEIDUNG_UEBERNAHME = Alt-Bestandsdaten).
    const offen = await prisma.contractEndProcess.findMany({
      where: {
        status: { in: ["ANFRAGE_VORGESETZTER", "ENTSCHEIDUNG_UEBERNAHME"] },
        supervisorEmail: { not: null },
        supervisorLinkSentAt: { not: null },
      },
      include: { organization: { select: { name: true } } },
    });

    for (const ce of offen) {
      try {
        const kategorie = getContractEndCategory(new Date(ce.contractEndDate), now);
        const intervall = REMINDER_INTERVAL_DAYS[kategorie];
        if (intervall == null) {
          results.skipped++;
          continue;
        }

        // Referenz fuer das Intervall: letzte Erinnerung, sonst der Anfrage-Versand.
        const referenz = ce.lastSupervisorReminderAt ?? ce.supervisorLinkSentAt!;
        const tageSeitReferenz = (now.getTime() - new Date(referenz).getTime()) / MS_PER_DAY;
        if (tageSeitReferenz < intervall) {
          results.skipped++;
          continue;
        }

        const tageOffen = Math.floor(
          (now.getTime() - new Date(ce.supervisorLinkSentAt!).getTime()) / MS_PER_DAY,
        );
        const meta = CONTRACT_END_CATEGORY_META[kategorie];
        const link = `${getBaseUrl()}/vertrag-formular/${ce.supervisorToken}`;
        const vertragsende = new Date(ce.contractEndDate).toLocaleDateString("de-DE");

        // SMTP primaer (Event), Webhooks zusaetzlich — wirft nie
        await triggerWebhooks("contract-end-supervisor-reminder", {
          contractEndId: ce.id,
          displayId: ce.displayId,
          supervisorEmail: ce.supervisorEmail,
          mitarbeiter_name: `${ce.employeeFirstName} ${ce.employeeLastName}`,
          einrichtung: ce.organization.name,
          organization: ce.organization.name,
          link,
          formularLink: link,
          tage_offen: tageOffen,
          dringlichkeit: meta.label,
          vertragsende,
          contractEndDate: new Date(ce.contractEndDate).toISOString(),
        });

        await prisma.contractEndProcess.update({
          where: { id: ce.id },
          data: {
            lastSupervisorReminderAt: now,
            supervisorReminderCount: { increment: 1 },
          },
        });

        await prisma.auditLog.create({
          data: {
            contractEndId: ce.id,
            processType: "CONTRACT_END",
            action: "SUPERVISOR_REMINDER_SENT",
            details: {
              tageOffen,
              kategorie,
              email: ce.supervisorEmail || "",
            },
          },
        });

        results.reminders++;
      } catch (err) {
        console.error(`[ContractEndReminders] Fehler bei ${ce.id}:`, err);
        results.errors++;
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      ...results,
    });
  } catch (error) {
    console.error("[ContractEndReminders] Schwerer Fehler:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
