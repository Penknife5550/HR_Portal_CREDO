/**
 * Lauf „Wartung“ — Aufbewahrungsfristen des Portals selbst.
 *
 *  - `EmailLog` aelter als 90 Tage (DSGVO). Bisher nur beim Oeffnen des
 *    Versandprotokolls und im Lauf „Onboarding-Erinnerungen“ — beides haengt
 *    davon ab, dass jemand etwas tut bzw. dass dieser Lauf eingeschaltet ist.
 *  - Protokolle der automatischen Laeufe aelter als 90 Tage (nur beendete).
 *  - Protokolleintraege des Stammabgleichs aus DokuBit (AuditLog mit
 *    processType PERSONALSTAMM) aelter als PERSONALSTAMM_AUFBEWAHRUNG_TAGE
 *    (365, Entscheidung 17.10.2026, mit dem DSB abzustimmen). Sie tragen
 *    Vertragsschluessel (MANR) und Kennungen der Personen, keine Namen und
 *    keine Adressen; Frist laut Plan 12.3 (Loeschtabelle), ohne diese Zeile
 *    blieben sie unbefristet. Antwortfeld `personalstammProtokolle`.
 *
 * Probelauf: nur zaehlen.
 */

import { prisma } from "@/lib/db";
import { PROTOKOLL_AUFBEWAHRUNG_TAGE } from "@/lib/zeitplaner/katalog";
import { laufAntwort, type LaufErgebnis, type LaufOptionen } from "@/lib/laeufe/lauf-ergebnis";
import { emailLogAufraeumen } from "@/lib/email-log-aufbewahrung";
import { PERSONALSTAMM_AUFBEWAHRUNG_TAGE, PERSONALSTAMM_PROCESS_TYPE } from "@/lib/constants";

const MS_PRO_TAG = 86_400_000;

export async function wartungLauf(opts: LaufOptionen = {}): Promise<LaufErgebnis> {
  const jetzt = opts.jetzt ?? new Date();
  const grenze = new Date(jetzt.getTime() - PROTOKOLL_AUFBEWAHRUNG_TAGE * MS_PRO_TAG);
  // Nach Alter, auch ohne `beendetAm`: Ein Lauf, der vor 90 Tagen begann und
  // nie endete, ist abgebrochen (Neustart) und bliebe sonst fuer immer liegen.
  const protokollWhere = { gestartetAm: { lt: grenze } };
  // Nur der Stammabgleich: andere AuditLog-Eintraege haben keine Frist hier.
  const personalstammWhere = {
    processType: PERSONALSTAMM_PROCESS_TYPE,
    createdAt: { lt: new Date(jetzt.getTime() - PERSONALSTAMM_AUFBEWAHRUNG_TAGE * MS_PRO_TAG) },
  };

  if (opts.dryRun) {
    const [emailLogs, protokolle, personalstammProtokolle] = await Promise.all([
      emailLogAufraeumen(jetzt, { dryRun: true }),
      prisma.automatischerLaufProtokoll.count({ where: protokollWhere }),
      prisma.auditLog.count({ where: personalstammWhere }),
    ]);
    return laufAntwort({ success: true, dryRun: true, emailLogs, protokolle, personalstammProtokolle });
  }

  const emailLogs = await emailLogAufraeumen(jetzt);
  const protokolle = await prisma.automatischerLaufProtokoll.deleteMany({ where: protokollWhere });
  const personalstamm = await prisma.auditLog.deleteMany({ where: personalstammWhere });
  return laufAntwort({
    success: true,
    dryRun: false,
    emailLogs,
    protokolle: protokolle.count,
    personalstammProtokolle: personalstamm.count,
  });
}
