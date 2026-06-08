/**
 * BEM Status-Transition-Helper
 *
 * Analog zu mutterschutz-transitions.ts, aber mit dem invertierten
 * Zugriffsmodell ("versiegelte Akte"):
 *  - Zugriff wird ueber canAccessBemContent geprueft (NICHT Rolle) — nur
 *    fuer den Fall freigegebene Personen duerfen den Status aendern.
 *  - Atomarer State-Wechsel via updateMany mit Vorgaenger-Status im WHERE
 *    (race-frei bei parallelen Klicks).
 *  - Update + AuditLog in einer $transaction (kein Statuswechsel ohne Audit).
 *
 * BEM nutzt KEINE Webhooks/n8n (Entscheidung #9: SMTP-direkt, versiegelte Akte).
 */

import { prisma } from "@/lib/db";
import {
  getErlaubteVorgaenger,
  statusLabel,
  type BemStatus,
} from "@/lib/bem-workflow";
import { type SessionPayload, canAccessBemContent } from "@/lib/permissions";
import { BEM_AUDIT_ACTIONS } from "@/lib/bem-audit";

export type BemTransitionResult =
  | { ok: true; data: { status: BemStatus } }
  | { ok: false; error: string; status: number };

interface BemTransitionInput {
  bemFallId: string;
  zielStatus: BemStatus;
  beendigungsgrund?: string | null;
  session: SessionPayload;
  ipAddress: string | null;
}

/** Berechnet Zusatzfelder, die mit dem Statuswechsel gesetzt werden. */
function buildExtraData(
  zielStatus: BemStatus,
  beendigungsgrund: string | null | undefined,
  aufbewahrungJahre: number,
  now: Date,
): Record<string, unknown> {
  switch (zielStatus) {
    case "EINLADUNG_VERSENDET":
      return { einladungAm: now };
    case "EINWILLIGUNG_ERTEILT":
      return { datenschutzAm: now };
    case "ERSTGESPRAECH":
      return { erstgespraechAm: now };
    case "ABGESCHLOSSEN":
    case "ABGEBROCHEN": {
      const aufbewahrungBis = new Date(now);
      aufbewahrungBis.setFullYear(aufbewahrungBis.getFullYear() + aufbewahrungJahre);
      return {
        beendetAm: now,
        beendigungsgrund: beendigungsgrund ?? null,
        aufbewahrungBis,
      };
    }
    case "GELOESCHT":
      return { geloeschtAm: now };
    default:
      return {};
  }
}

export async function bemTransition(
  input: BemTransitionInput,
): Promise<BemTransitionResult> {
  // 1) Fall laden — minimal, nur fuer Existenz + Aufbewahrungsfrist + Audit-Daten.
  const fall = await prisma.bemFall.findUnique({
    where: { id: input.bemFallId },
    select: {
      id: true,
      status: true,
      displayId: true,
      organization: { select: { bemAufbewahrungJahre: true } },
    },
  });
  // 2) Zugriff: ohne aktive BemZugriff-Freigabe -> 404 (Existenz nicht leaken).
  if (!fall || !(await canAccessBemContent(input.session, input.bemFallId))) {
    return { ok: false, error: "Fall nicht gefunden", status: 404 };
  }

  const erlaubteVorgaenger = getErlaubteVorgaenger(input.zielStatus);
  if (erlaubteVorgaenger.length === 0) {
    return {
      ok: false,
      error: `Status '${input.zielStatus}' ist kein gueltiges Ziel`,
      status: 409,
    };
  }

  const now = new Date();
  const extraData = buildExtraData(
    input.zielStatus,
    input.beendigungsgrund,
    fall.organization.bemAufbewahrungJahre,
    now,
  );

  try {
    const result = await prisma.$transaction(async (tx) => {
      const upd = await tx.bemFall.updateMany({
        where: {
          id: input.bemFallId,
          status: { in: erlaubteVorgaenger },
        },
        data: {
          status: input.zielStatus,
          ...extraData,
        },
      });

      if (upd.count === 0) {
        return {
          ok: false as const,
          error: `Status-Uebergang von '${statusLabel(
            fall.status as BemStatus,
          )}' nach '${statusLabel(input.zielStatus)}' nicht erlaubt`,
          status: 409,
        };
      }

      await tx.auditLog.create({
        data: {
          bemFallId: input.bemFallId,
          userId: input.session.userId,
          processType: "BEM",
          action: BEM_AUDIT_ACTIONS.STATUS_GEAENDERT,
          details: { vorher: fall.status, nachher: input.zielStatus },
          ipAddress: input.ipAddress,
        },
      });

      return { ok: true as const };
    });

    if (!result.ok) return result;
    return { ok: true, data: { status: input.zielStatus } };
  } catch (error) {
    console.error(
      `[bemTransition] DB-Fehler bei Fall ${input.bemFallId}:`,
      error instanceof Error ? error.message : error,
    );
    return { ok: false, error: "Interner Serverfehler", status: 500 };
  }
}
