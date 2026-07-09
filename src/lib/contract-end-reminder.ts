/**
 * Gemeinsame Versand-Logik fuer Vorgesetzten-Erinnerungen (Vertragsende).
 *
 * Genutzt vom taeglichen Cron (/api/cron/contract-end-reminders, Intervall-
 * Staffelung bleibt dort) UND vom manuellen "Erinnerung senden"-Button
 * (/api/contract-end/[id]/reminder). Kapselt Payload-Aufbau, Event-Versand
 * (SMTP primaer via triggerWebhooks), Zaehler-/Zeitstempel-Fortschreibung
 * und den AuditLog-Eintrag.
 */

import { prisma } from "@/lib/db";
import { triggerWebhooks } from "@/lib/webhooks";
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

/**
 * Verschickt die Erinnerungs-Mail an die Fuehrungskraft (bestehender Link,
 * KEIN Token-Reset), schreibt Zaehler/Zeitstempel fort und auditiert.
 * Voraussetzungen (supervisorEmail/Token/LinkSentAt gesetzt) prueft der
 * Aufrufer. Wirft bei DB-Fehlern.
 */
export async function sendSupervisorReminder(
  ce: ReminderContractEnd,
  now: Date,
  opts: { manuell?: boolean } = {},
): Promise<void> {
  const kategorie = getContractEndCategory(new Date(ce.contractEndDate), now);
  const meta = CONTRACT_END_CATEGORY_META[kategorie];
  const tageOffen = Math.floor(
    (now.getTime() - new Date(ce.supervisorLinkSentAt!).getTime()) / MS_PER_DAY,
  );
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
        ...(opts.manuell ? { manuell: true } : {}),
      },
    },
  });
}
