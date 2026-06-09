/**
 * BEM — zentrale Audit- & Versandprotokoll-Helfer (NFR 0a)
 *
 * Prüfungssichere Nachvollziehbarkeit (DSGVO Art. 5 Abs. 2 Rechenschaftspflicht;
 * § 167 SGB IX Dokumentationspflicht). Zwei Ebenen:
 *
 *  1. AuditLog (technische Lückenlosigkeit): jeder Lesezugriff, Statuswechsel,
 *     jede Freigabe/Entzug. -> logBemAudit()
 *  2. BemKommunikation (Versandnachweis): jede ausgehende Mail / jeder Brief
 *     als strukturierter, beweissicherer Eintrag mit Hash + Message-ID.
 *     -> logBemKommunikation()
 *
 * Beide Helfer sind so gebaut, dass sie NIEMALS den aufrufenden Vorgang
 * sprengen: Audit-/Protokollfehler werden geloggt, aber nicht geworfen.
 */

import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

// =============================================
// Action-Vokabular (einheitlich, damit Protokoll-Reports stabil bleiben)
// =============================================
export const BEM_AUDIT_ACTIONS = {
  FALL_ANGELEGT: "BEM_FALL_ANGELEGT",
  AKTE_GEOEFFNET: "BEM_AKTE_GEOEFFNET", // jeder Lesezugriff auf Inhalte
  STATUS_GEAENDERT: "BEM_STATUS_GEAENDERT",
  ZUGRIFF_GEWAEHRT: "BEM_ZUGRIFF_GEWAEHRT",
  ZUGRIFF_ENTZOGEN: "BEM_ZUGRIFF_ENTZOGEN",
  EINLADUNG_VERSENDET: "BEM_EINLADUNG_VERSENDET",
  EINLADUNG_FEHLGESCHLAGEN: "BEM_EINLADUNG_FEHLGESCHLAGEN",
  DOKUMENT_GENERIERT: "BEM_DOKUMENT_GENERIERT",
  DOKUMENT_HOCHGELADEN: "BEM_DOKUMENT_HOCHGELADEN",
  MAIL_VERSENDET: "BEM_MAIL_VERSENDET",
  MAIL_FEHLGESCHLAGEN: "BEM_MAIL_FEHLGESCHLAGEN",
  EINWILLIGUNG_ERTEILT: "BEM_EINWILLIGUNG_ERTEILT",
  EINWILLIGUNG_ABGELEHNT: "BEM_EINWILLIGUNG_ABGELEHNT",
  EINWILLIGUNG_WIDERRUFEN: "BEM_EINWILLIGUNG_WIDERRUFEN",
  ANSPRECHPARTNER_GEWAEHLT: "BEM_ANSPRECHPARTNER_GEWAEHLT",
  SCHWERBEHINDERUNG_GEAENDERT: "BEM_SCHWERBEHINDERUNG_GEAENDERT",
  DIAGNOSE_SCHUTZ_GEAENDERT: "BEM_DIAGNOSE_SCHUTZ_GEAENDERT",
  GESPRAECH_ERFASST: "BEM_GESPRAECH_ERFASST",
  GESPRAECH_AKTUALISIERT: "BEM_GESPRAECH_AKTUALISIERT",
  GESPRAECH_GELOESCHT: "BEM_GESPRAECH_GELOESCHT",
  MASSNAHME_ERFASST: "BEM_MASSNAHME_ERFASST",
  MASSNAHME_AKTUALISIERT: "BEM_MASSNAHME_AKTUALISIERT",
  MASSNAHME_GELOESCHT: "BEM_MASSNAHME_GELOESCHT",
  EXPORT_ERSTELLT: "BEM_EXPORT_ERSTELLT",
  FRIST_ERINNERUNG: "BEM_FRIST_ERINNERUNG", // automatische Frist-Erinnerung (Cron)
  AUFBEWAHRUNG_GEWARNT: "BEM_AUFBEWAHRUNG_GEWARNT",
  GELOESCHT: "BEM_GELOESCHT",
} as const;

export type BemAuditAction =
  (typeof BEM_AUDIT_ACTIONS)[keyof typeof BEM_AUDIT_ACTIONS];

// =============================================
// AuditLog-Eintrag fuer einen BEM-Fall
// =============================================
export async function logBemAudit(params: {
  bemFallId: string;
  userId?: string | null;
  action: BemAuditAction;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        bemFallId: params.bemFallId,
        processType: "BEM",
        action: params.action,
        details: (params.details ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        ipAddress: params.ipAddress ?? null,
      },
    });
  } catch (err) {
    console.error(
      "[BEM-Audit] AuditLog-Eintrag fehlgeschlagen:",
      err instanceof Error ? err.message : err
    );
  }
}

// =============================================
// Versandprotokoll-Eintrag (Mail / Brief)
// =============================================
type Kanal = "EMAIL" | "BRIEF";
type KommStatus = "GESENDET" | "FEHLGESCHLAGEN" | "GENERIERT";

export async function logBemKommunikation(params: {
  bemFallId: string;
  kanal: Kanal;
  status: KommStatus;
  empfaenger: string;
  betreff?: string | null;
  dokumentId?: string | null;
  dokumentHash?: string | null;
  messageId?: string | null;
  fehlertext?: string | null;
  ipAddress?: string | null;
  gesendetById?: string | null;
}): Promise<void> {
  try {
    await prisma.bemKommunikation.create({
      data: {
        bemFallId: params.bemFallId,
        kanal: params.kanal,
        status: params.status,
        empfaenger: params.empfaenger,
        betreff: params.betreff ?? null,
        dokumentId: params.dokumentId ?? null,
        dokumentHash: params.dokumentHash ?? null,
        messageId: params.messageId ?? null,
        fehlertext: params.fehlertext ?? null,
        ipAddress: params.ipAddress ?? null,
        gesendetById: params.gesendetById ?? null,
      },
    });
  } catch (err) {
    console.error(
      "[BEM-Audit] Kommunikations-Protokoll fehlgeschlagen:",
      err instanceof Error ? err.message : err
    );
  }
}
