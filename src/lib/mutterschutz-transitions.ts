/**
 * Mutterschutz Status-Transition-Helper
 *
 * Zentralisiert den vollstaendigen Transition-Pfad:
 *  - Vorgang-Existenz + Org-Scope-Check (IDOR-Schutz)
 *  - Atomarer State-Wechsel via updateMany mit Vorgaenger-Status im WHERE
 *    (verhindert Race-Conditions bei parallelen Klicks)
 *  - Update + AuditLog in einer $transaction (Compliance: kein Statuswechsel
 *    ohne Audit-Spur)
 *  - Best-effort Webhook-Trigger nach Commit
 *
 * Wird von den 4 Transition-Routes (bad-beauftragen, bad-abschliessen,
 * aktivieren, beenden) genutzt — die Routes selbst sind dadurch auf das
 * Wesentliche reduziert (ZielStatus + Webhook-Event + extraData).
 */

import { prisma } from "@/lib/db";
import { triggerWebhooks } from "@/lib/webhooks";
import {
  getErlaubteVorgaenger,
  type MutterschutzStatus,
} from "@/lib/mutterschutz-workflow";
import {
  type SessionPayload,
  HR_EDIT_ROLES,
  canAccessProcess,
} from "@/lib/permissions";
import type { Prisma } from "@prisma/client";

export type TransitionResult =
  | { ok: true; data: { status: MutterschutzStatus } }
  | { ok: false; error: string; status: number };

interface TransitionInput {
  prozessId: string;
  zielStatus: MutterschutzStatus;
  /** Zusaetzliche Felder, die mit dem Status-Wechsel gesetzt werden */
  extraData?: Omit<Prisma.MutterschutzProzessUpdateInput, "status">;
  webhookEvent: string;
  auditAction: string;
  session: SessionPayload;
  ipAddress: string | null;
}

export async function mutterschutzTransition(
  input: TransitionInput,
): Promise<TransitionResult> {
  // 1) Auth: Rolle (Routes pruefen das idR. selbst, hier nochmal als Defense)
  if (!HR_EDIT_ROLES.includes(input.session.role)) {
    return { ok: false, error: "Keine Berechtigung", status: 403 };
  }

  // 2) Vorgang laden — minimal, nur fuer Org-Scope + badErforderlich + Audit-Daten
  const ms = await prisma.mutterschutzProzess.findUnique({
    where: { id: input.prozessId },
    select: {
      id: true,
      organizationId: true,
      status: true,
      badErforderlich: true,
      displayId: true,
      employeeFirstName: true,
      employeeLastName: true,
    },
  });
  if (!ms) {
    return { ok: false, error: "Vorgang nicht gefunden", status: 404 };
  }

  // 3) IDOR: Mandant-Scope pruefen — 404 statt 403, um Existenz nicht zu leaken
  if (!(await canAccessProcess(input.session, ms.organizationId))) {
    return { ok: false, error: "Vorgang nicht gefunden", status: 404 };
  }

  const erlaubteVorgaenger = getErlaubteVorgaenger(
    input.zielStatus,
    ms.badErforderlich,
  );
  if (erlaubteVorgaenger.length === 0) {
    // Zielstatus ist von keinem Status aus erreichbar (Programmierfehler)
    return {
      ok: false,
      error: `Status '${input.zielStatus}' ist kein gueltiges Ziel`,
      status: 409,
    };
  }

  // 4) Atomarer State-Wechsel + AuditLog in einer Transaktion.
  //    updateMany mit count===1 schliesst Race-Conditions: zwei parallele
  //    Requests koennen nicht beide das Update durchfuehren.
  try {
    const result = await prisma.$transaction(async (tx) => {
      const upd = await tx.mutterschutzProzess.updateMany({
        where: {
          id: input.prozessId,
          status: { in: erlaubteVorgaenger },
        },
        data: {
          status: input.zielStatus,
          ...(input.extraData ?? {}),
        },
      });

      if (upd.count === 0) {
        // Race verloren ODER Status hat sich zwischenzeitlich geaendert
        return {
          ok: false as const,
          error: `Status-Uebergang von '${ms.status}' nach '${input.zielStatus}' nicht erlaubt`,
          status: 409,
        };
      }

      await tx.auditLog.create({
        data: {
          mutterschutzId: input.prozessId,
          userId: input.session.userId,
          processType: "MUTTERSCHUTZ",
          action: input.auditAction,
          details: { vorher: ms.status, nachher: input.zielStatus },
          ipAddress: input.ipAddress,
        },
      });

      return { ok: true as const };
    });

    if (!result.ok) {
      return result;
    }

    // 5) Webhook best-effort NACH erfolgreichem Commit
    triggerWebhooks(input.webhookEvent, {
      mutterschutzId: input.prozessId,
      displayId: ms.displayId,
      employeeName: `${ms.employeeFirstName} ${ms.employeeLastName}`,
      status: input.zielStatus,
    }).catch((err) =>
      console.error(
        `[Webhooks] mutterschutz-transition '${input.webhookEvent}' fehlgeschlagen:`,
        err instanceof Error ? err.message : err,
      ),
    );

    return { ok: true, data: { status: input.zielStatus } };
  } catch (error) {
    console.error(
      `[mutterschutzTransition] DB-Fehler bei '${input.auditAction}':`,
      error instanceof Error ? error.message : error,
    );
    return { ok: false, error: "Interner Serverfehler", status: 500 };
  }
}
