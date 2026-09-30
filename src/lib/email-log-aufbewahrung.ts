/**
 * Aufbewahrung des Versandprotokolls (`EmailLog`): 90 Tage (DSGVO).
 *
 * EINE Stelle fuer Frist und Loeschung. Durchgesetzt wird sie vom Lauf
 * „Wartung“ (src/lib/laeufe/wartung.ts, Zeitplaner) und zusaetzlich — hoechstens
 * einmal am Tag — beim Oeffnen des Versandprotokolls
 * (GET /api/settings/email-log), falls die Wartung ausgeschaltet ist.
 */

import { prisma } from "@/lib/db";

export const EMAIL_LOG_AUFBEWAHRUNG_TAGE = 90;

const MS_PRO_TAG = 86_400_000;

/** Eintraege vor diesem Zeitpunkt sind abgelaufen. */
export function emailLogGrenze(jetzt: Date): Date {
  return new Date(jetzt.getTime() - EMAIL_LOG_AUFBEWAHRUNG_TAGE * MS_PRO_TAG);
}

/** Loescht abgelaufene Eintraege (Probelauf: zaehlt nur). Liefert die Anzahl. */
export async function emailLogAufraeumen(jetzt: Date = new Date(), opts: { dryRun?: boolean } = {}): Promise<number> {
  const where = { createdAt: { lt: emailLogGrenze(jetzt) } };
  if (opts.dryRun) return prisma.emailLog.count({ where });
  return (await prisma.emailLog.deleteMany({ where })).count;
}
