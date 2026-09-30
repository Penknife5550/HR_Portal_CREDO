/**
 * Lauf „Wartung“ — Aufbewahrungsfristen des Portals selbst.
 *
 *  - `EmailLog` aelter als 90 Tage (DSGVO). Bisher nur beim Oeffnen des
 *    Versandprotokolls und im Lauf „Onboarding-Erinnerungen“ — beides haengt
 *    davon ab, dass jemand etwas tut bzw. dass dieser Lauf eingeschaltet ist.
 *  - Protokolle der automatischen Laeufe aelter als 90 Tage (nur beendete).
 *
 * Probelauf: nur zaehlen.
 */

import { prisma } from "@/lib/db";
import { PROTOKOLL_AUFBEWAHRUNG_TAGE } from "@/lib/zeitplaner/katalog";
import { laufAntwort, type LaufErgebnis, type LaufOptionen } from "@/lib/laeufe/lauf-ergebnis";
import { emailLogAufraeumen } from "@/lib/email-log-aufbewahrung";

const MS_PRO_TAG = 86_400_000;

export async function wartungLauf(opts: LaufOptionen = {}): Promise<LaufErgebnis> {
  const jetzt = opts.jetzt ?? new Date();
  const grenze = new Date(jetzt.getTime() - PROTOKOLL_AUFBEWAHRUNG_TAGE * MS_PRO_TAG);
  // Nach Alter, auch ohne `beendetAm`: Ein Lauf, der vor 90 Tagen begann und
  // nie endete, ist abgebrochen (Neustart) und bliebe sonst fuer immer liegen.
  const protokollWhere = { gestartetAm: { lt: grenze } };

  if (opts.dryRun) {
    const [emailLogs, protokolle] = await Promise.all([
      emailLogAufraeumen(jetzt, { dryRun: true }),
      prisma.automatischerLaufProtokoll.count({ where: protokollWhere }),
    ]);
    return laufAntwort({ success: true, dryRun: true, emailLogs, protokolle });
  }

  const emailLogs = await emailLogAufraeumen(jetzt);
  const protokolle = await prisma.automatischerLaufProtokoll.deleteMany({ where: protokollWhere });
  return laufAntwort({ success: true, dryRun: false, emailLogs, protokolle: protokolle.count });
}
