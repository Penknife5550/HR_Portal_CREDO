/**
 * API: GET /api/vorgaenge/[modul]/[id]/mails
 *
 * Mailprotokoll eines Vorgangs fuer den Reiter „E-Mails“ — alle Zeilen des
 * Versandprotokolls (`EmailLog`) mit diesem Vorgangsbezug, neueste zuerst.
 * Regeln und Zeilenaufbau: src/lib/vorgangs-mails.ts.
 *
 * `modul`: onboarding | offboarding | civil-service | contract-end |
 * elternzeit | mutterschutz (die englischen Modulnamen der Schnittstellen; die Seiten heissen anders, src/lib/adressen.ts). BEM gibt es hier
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
import { mandantDesVorgangs } from "@/lib/vorgangs-mails-dienst";
import {
  VORGANGS_MAIL_HINWEIS,
  VORGANGS_MAIL_LIMIT,
  mailZeileBauen,
  vorgangTypAusModul,
} from "@/lib/vorgangs-mails";

const NICHT_GEFUNDEN = "Vorgang nicht gefunden";

export const GET = apiHandler(
  { roles: HR_EDIT_ROLES, logLabel: "Vorgang/E-Mails" },
  async ({ params, session }) => {
    const typ = vorgangTypAusModul(params.modul);
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
        // Nur OB es einen Text gibt, nie der Text selbst — den laedt die
        // Textroute erst auf Klick (…/mails/[mailId]/text).
        text: { select: { emailLogId: true } },
      },
    });
    return NextResponse.json(
      { eintraege: logs.map(mailZeileBauen), hinweis: VORGANGS_MAIL_HINWEIS },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
);
