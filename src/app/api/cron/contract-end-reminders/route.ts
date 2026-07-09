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
 *
 * Zusaetzlich:
 *  - ESKALATION an HR (Event contract-end-eskalation), wenn zum
 *    Erinnerungszeitpunkt bereits >= 3 Erinnerungen ohne Antwort liefen —
 *    genau EINMAL je Anfrage (escalatedAt; Reset bei "Anfrage erneut senden").
 *  - MONTAGS-DIGEST an HR (Event contract-end-unbearbeitet): kritische/
 *    Warnung-Vorgaenge im Status ANGELEGT, fuer die noch keine Anfrage
 *    versendet wurde.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { triggerWebhooks } from "@/lib/webhooks";
import { getBaseUrl } from "@/lib/url";
import { sendSupervisorReminder } from "@/lib/contract-end-reminder";
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

// Ab so vielen erfolglosen Erinnerungen wird an HR eskaliert.
const ESKALATION_AB_ERINNERUNGEN = 3;

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
  const results = { reminders: 0, eskalationen: 0, unbearbeitetHinweis: 0, skipped: 0, errors: 0 };

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

        // Versand + Zaehler + Audit im gemeinsamen Helfer (auch vom manuellen
        // "Erinnerung senden"-Button genutzt)
        await sendSupervisorReminder(ce, now);

        results.reminders++;

        // ESKALATION an HR: liefen zum Erinnerungszeitpunkt bereits >= 3
        // Erinnerungen ohne Antwort, wird genau EINMAL je Anfrage eskaliert.
        if (ce.supervisorReminderCount >= ESKALATION_AB_ERINNERUNGEN && !ce.escalatedAt) {
          const tageOffen = Math.floor(
            (now.getTime() - new Date(ce.supervisorLinkSentAt!).getTime()) / MS_PER_DAY,
          );
          await triggerWebhooks("contract-end-eskalation", {
            contractEndId: ce.id,
            displayId: ce.displayId,
            mitarbeiter_name: `${ce.employeeFirstName} ${ce.employeeLastName}`,
            supervisorEmail: ce.supervisorEmail,
            einrichtung: ce.organization.name,
            organization: ce.organization.name,
            vertragsende: new Date(ce.contractEndDate).toLocaleDateString("de-DE"),
            contractEndDate: new Date(ce.contractEndDate).toISOString(),
            anzahl_erinnerungen: ce.supervisorReminderCount,
            tage_offen: tageOffen,
            dringlichkeit: CONTRACT_END_CATEGORY_META[kategorie].label,
            portalLink: `${getBaseUrl()}/dashboard/contract-end/${ce.id}`,
          });
          await prisma.contractEndProcess.update({
            where: { id: ce.id },
            data: { escalatedAt: now },
          });
          await prisma.auditLog.create({
            data: {
              contractEndId: ce.id,
              processType: "CONTRACT_END",
              action: "ESKALATION_GESENDET",
              details: {
                anzahlErinnerungen: ce.supervisorReminderCount,
                tageOffen,
                kategorie,
                supervisorEmail: ce.supervisorEmail || "",
              },
            },
          });
          results.eskalationen++;
        }
      } catch (err) {
        console.error(`[ContractEndReminders] Fehler bei ${ce.id}:`, err);
        results.errors++;
      }
    }

    // MONTAGS-DIGEST: kritische/Warnung-Vorgaenge, fuer die noch gar keine
    // Anfrage versendet wurde (Status ANGELEGT). Cron laeuft taeglich —
    // der Digest geht nur montags raus, und nur wenn die Liste nicht leer ist.
    if (now.getDay() === 1) {
      try {
        const unbearbeitet = await prisma.contractEndProcess.findMany({
          where: { status: "ANGELEGT" },
          include: { organization: { select: { name: true } } },
          orderBy: { contractEndDate: "asc" },
        });
        const kritische = unbearbeitet
          .map((ce) => ({
            ce,
            kategorie: getContractEndCategory(new Date(ce.contractEndDate), now),
          }))
          .filter(({ kategorie }) => kategorie === "KRITISCH" || kategorie === "WARNUNG");

        if (kritische.length > 0) {
          const zeile = ({ ce, kategorie }: (typeof kritische)[number]) =>
            `${ce.displayId} · ${ce.employeeFirstName} ${ce.employeeLastName} · ${ce.organization.name} · Vertragsende ${new Date(ce.contractEndDate).toLocaleDateString("de-DE")} (${CONTRACT_END_CATEGORY_META[kategorie].label})`;
          await triggerWebhooks("contract-end-unbearbeitet", {
            anzahl: kritische.length,
            liste_text: kritische.map(zeile).join("\n"),
            liste_html: kritische.map((k) => `<li>${zeile(k)}</li>`).join(""),
            portalLink: `${getBaseUrl()}/dashboard`,
          });
          results.unbearbeitetHinweis = kritische.length;
        }
      } catch (err) {
        console.error("[ContractEndReminders] Fehler beim Unbearbeitet-Digest:", err);
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
