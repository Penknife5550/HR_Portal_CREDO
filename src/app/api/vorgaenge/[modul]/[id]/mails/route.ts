/**
 * API: GET /api/vorgaenge/[modul]/[id]/mails
 *
 * Mailprotokoll eines Vorgangs fuer den Reiter „E-Mails“ — alle Zeilen des
 * Versandprotokolls (`EmailLog`) mit diesem Vorgangsbezug, neueste zuerst.
 * Regeln und Zeilenaufbau: src/lib/vorgangs-mails.ts.
 *
 * `modul`: onboarding | offboarding | civil-service | contract-end |
 * elternzeit | mutterschutz (wie die Pfade unter /dashboard). BEM gibt es hier
 * bewusst nicht (versiegelte Akte, eigenes Kommunikationsprotokoll im Fall).
 *
 * Berechtigung: HR_EDIT_ROLES (Empfaengeradressen und Fehlertexte des
 * Mailservers sind HR-Sache), Mandant per canAccessProcess. Unbekannter
 * Vorgang ODER fremder Mandant = 404 mit gleichem Text.
 */

import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { HR_EDIT_ROLES, canAccessProcess } from "@/lib/permissions";
import {
  VORGANGS_MAIL_HINWEIS,
  VORGANGS_MAIL_LIMIT,
  VORGANGS_MODULE,
  mailZeileBauen,
  type VorgangTyp,
} from "@/lib/vorgangs-mails";

const NICHT_GEFUNDEN = "Vorgang nicht gefunden";

/** Mandant des Vorgangs — `null`, wenn es ihn nicht gibt. */
async function mandantDesVorgangs(typ: VorgangTyp, id: string): Promise<string | null> {
  const where = { where: { id }, select: { organizationId: true } } as const;
  const vorgang =
    typ === "ONBOARDING"
      ? await prisma.onboardingProcess.findUnique(where)
      : typ === "OFFBOARDING"
        ? await prisma.offboardingProcess.findUnique(where)
        : typ === "CIVIL_SERVICE"
          ? await prisma.civilServiceProcess.findUnique(where)
          : typ === "CONTRACT_END"
            ? await prisma.contractEndProcess.findUnique(where)
            : typ === "ELTERNZEIT"
              ? await prisma.elternzeitProzess.findUnique(where)
              : await prisma.mutterschutzProzess.findUnique(where);
  return vorgang?.organizationId ?? null;
}

export const GET = apiHandler(
  { roles: HR_EDIT_ROLES, logLabel: "Vorgang/E-Mails" },
  async ({ params, session }) => {
    const typ = VORGANGS_MODULE[params.modul];
    if (!typ) return NextResponse.json({ error: NICHT_GEFUNDEN }, { status: 404 });

    const mandant = await mandantDesVorgangs(typ, params.id);
    if (!mandant || !(await canAccessProcess(session!, mandant))) {
      return NextResponse.json({ error: NICHT_GEFUNDEN }, { status: 404 });
    }

    const logs = await prisma.emailLog.findMany({
      where: { vorgangTyp: typ, vorgangId: params.id, isTest: false },
      orderBy: { createdAt: "desc" },
      take: VORGANGS_MAIL_LIMIT,
      select: {
        id: true,
        createdAt: true,
        event: true,
        status: true,
        subject: true,
        recipient: true,
        cc: true,
        bcc: true,
        detail: true,
      },
    });
    return NextResponse.json(
      { eintraege: logs.map(mailZeileBauen), hinweis: VORGANGS_MAIL_HINWEIS },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
);
