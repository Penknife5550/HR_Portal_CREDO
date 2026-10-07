/**
 * Gemeinsame Versand-Logik fuer Vorgesetzten-Erinnerungen (Vertragsende).
 *
 * Genutzt vom taeglichen Cron (/api/cron/contract-end-reminders, Intervall-
 * Staffelung bleibt dort) UND vom manuellen "Erinnerung senden"-Button
 * (/api/contract-end/[id]/reminder). Kapselt Payload-Aufbau, Event-Versand
 * (SMTP primaer via triggerWebhooks), Zaehler-/Zeitstempel-Fortschreibung
 * und den AuditLog-Eintrag.
 *
 * Gezaehlt wird nur, was hinausging (seit 10/2026, `versandBewerten`):
 *   SENT / WEBHOOK  → Zaehler +1, Zeitstempel, AuditLog
 *   SKIPPED         → im Lauf nur der Zeitstempel (sonst versuchte er es jeden
 *                     Tag erneut), NIE der Zaehler — sonst ginge nach drei
 *                     uebersprungenen Erinnerungen die Eskalation „reagiert
 *                     nicht auf 3 Erinnerungen" an HR. Per Knopf: nichts.
 *   FAILED          → nichts; der naechste Lauf versucht es erneut.
 */

import { prisma } from "@/lib/db";
import { triggerWebhooks } from "@/lib/webhooks";
import { versandBewerten } from "@/lib/contract-end-versand";
import type { LinkVersandErgebnis } from "@/lib/abteilungsaufgaben";
import { getBaseUrl } from "@/lib/url";
import {
  getContractEndCategory,
  CONTRACT_END_CATEGORY_META,
} from "@/lib/contract-end-fristen";

const MS_PER_DAY = 86400000;

export interface ReminderContractEnd {
  id: string;
  displayId: string;
  employeeFirstName: string;
  employeeLastName: string;
  supervisorEmail: string | null;
  supervisorToken: string | null;
  supervisorLinkSentAt: Date | string | null;
  contractEndDate: Date | string;
  organization: { name: string };
}

export interface ErinnerungsErgebnis {
  versand: LinkVersandErgebnis;
  /** Zaehlt als Erinnerung (Zaehler +1, AuditLog)? Nur SENT und WEBHOOK. */
  gezaehlt: boolean;
}

/**
 * Verschickt die Erinnerungs-Mail an die Fuehrungskraft (bestehender Link,
 * KEIN Token-Reset), schreibt Zaehler/Zeitstempel fort und auditiert — beides
 * nur, wenn die Mail hinausging (siehe Kopf). Voraussetzungen
 * (supervisorEmail/Token/LinkSentAt gesetzt) prueft der Aufrufer. Wirft bei
 * DB-Fehlern.
 */
export async function sendSupervisorReminder(
  ce: ReminderContractEnd,
  now: Date,
  opts: { manuell?: boolean } = {},
): Promise<ErinnerungsErgebnis> {
  const kategorie = getContractEndCategory(new Date(ce.contractEndDate), now);
  const meta = CONTRACT_END_CATEGORY_META[kategorie];
  const tageOffen = Math.floor(
    (now.getTime() - new Date(ce.supervisorLinkSentAt!).getTime()) / MS_PER_DAY,
  );
  const link = `${getBaseUrl()}/vertrag-formular/${ce.supervisorToken}`;
  const vertragsende = new Date(ce.contractEndDate).toLocaleDateString("de-DE");

  // SMTP primaer (Event), Webhooks zusaetzlich — wirft nie
  const ergebnis = await triggerWebhooks("contract-end-supervisor-reminder", {
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

  const versand = await versandBewerten("contract-end-supervisor-reminder", ergebnis);

  if (!versand.erfolgreich) {
    // Uebersprungen (Vorlage aus, kein Empfaenger): Der Lauf merkt sich den
    // Tag, damit er nicht taeglich erneut anlaeuft — der Zaehler bleibt.
    if (versand.status === "SKIPPED" && !opts.manuell) {
      await prisma.contractEndProcess.update({
        where: { id: ce.id },
        data: { lastSupervisorReminderAt: now },
      });
    }
    return { versand, gezaehlt: false };
  }

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
        versand: versand.status,
        ...(opts.manuell ? { manuell: true } : {}),
      },
    },
  });
  return { versand, gezaehlt: true };
}
