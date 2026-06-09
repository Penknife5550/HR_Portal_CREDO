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
import { syncBemFristen } from "@/lib/bem-fristen";

export type BemTransitionResult =
  | { ok: true; data: { status: BemStatus } }
  | { ok: false; error: string; status: number };

interface BemTransitionInput {
  bemFallId: string;
  zielStatus: BemStatus;
  beendigungsgrund?: string | null;
  ergebnis?: string | null;
  session: SessionPayload;
  ipAddress: string | null;
}

/** Berechnet Zusatzfelder, die mit dem Statuswechsel gesetzt werden. */
/**
 * Addiert Jahre datumssicher. setFullYear auf dem 29.02. wuerde sonst in
 * Nicht-Schaltjahren auf den 01.03. rutschen — wir klemmen auf den letzten
 * gueltigen Tag des Zielmonats (28.02.), damit die Aufbewahrungsfrist exakt
 * stimmt (relevant fuer die automatische Loeschung).
 */
function addYearsSafe(date: Date, years: number): Date {
  const d = new Date(date);
  const tag = d.getDate();
  d.setFullYear(d.getFullYear() + years);
  if (d.getDate() !== tag) d.setDate(0); // auf letzten Tag des Vormonats zurueck
  return d;
}

function buildExtraData(
  zielStatus: BemStatus,
  currentStatus: BemStatus,
  beendigungsgrund: string | null | undefined,
  ergebnis: string | null | undefined,
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
    case "MASSNAHMEN_LAUFEN":
      // Wieder-Oeffnen aus ABGESCHLOSSEN: Abschluss-/Aufbewahrungsfelder leeren.
      if (currentStatus === "ABGESCHLOSSEN") {
        return {
          beendetAm: null,
          beendigungsgrund: null,
          ergebnis: null,
          aufbewahrungBis: null,
        };
      }
      return {};
    case "ABGESCHLOSSEN":
      return {
        beendetAm: now,
        beendigungsgrund: beendigungsgrund ?? null,
        ergebnis: ergebnis ?? null,
        aufbewahrungBis: addYearsSafe(now, aufbewahrungJahre),
      };
    case "ABGEBROCHEN":
      return {
        beendetAm: now,
        beendigungsgrund: beendigungsgrund ?? null,
        aufbewahrungBis: addYearsSafe(now, aufbewahrungJahre),
      };
    case "ANGELEGT":
      // Wieder-Einladen aus ABGEBROCHEN/EINWILLIGUNG_ABGELEHNT: Verfahren neu
      // starten — Abschluss-/Prozess-Zeitstempel zuruecksetzen.
      return {
        beendetAm: null,
        beendigungsgrund: null,
        ergebnis: null,
        aufbewahrungBis: null,
        einladungAm: null,
        datenschutzAm: null,
        erstgespraechAm: null,
      };
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
    fall.status as BemStatus,
    input.beendigungsgrund,
    input.ergebnis,
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

    // Fristen an den neuen Status anpassen (z.B. Erstgespraech-/Aufbewahrungsfrist).
    await syncBemFristen(input.bemFallId);

    return { ok: true, data: { status: input.zielStatus } };
  } catch (error) {
    console.error(
      `[bemTransition] DB-Fehler bei Fall ${input.bemFallId}:`,
      error instanceof Error ? error.message : error,
    );
    return { ok: false, error: "Interner Serverfehler", status: 500 };
  }
}
