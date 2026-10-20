/**
 * API: GET /api/vorgaenge/[modul]/[id]/mails/[mailId]/text
 *
 * Text einer Mail aus dem Reiter „E-Mails“ — so, wie er hinausging, mit
 * ERSETZTEN persoenlichen Links (src/lib/mail-text-archiv.ts). Eigene Route
 * statt Feld der Liste: Der Text kommt erst auf Klick, nie mit 300 Zeilen.
 *
 * Berechtigung wie die Liste: HR_EDIT_ROLES, Mandant per canAccessProcess,
 * und die Zeile muss zu GENAU diesem Vorgang gehoeren (vorgangTyp + vorgangId
 * in der Abfrage, kein Test-Versand). Unbekannter Vorgang ODER fremder
 * Mandant = 404 mit gleichem Text; eine Mail, die es nicht gibt, ein anderer
 * Vorgang oder eine Zeile ohne Text = 404 „E-Mail nicht gefunden“.
 */

import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { HR_EDIT_ROLES, canAccessProcess } from "@/lib/permissions";
import { mailTextLaden } from "@/lib/mail-text-dienst";
import { mandantDesVorgangs } from "@/lib/vorgangs-mails-dienst";
import { vorgangTypAusModul } from "@/lib/vorgangs-mails";

const KEIN_CACHE = { "Cache-Control": "no-store" } as const;

export const GET = apiHandler(
  { roles: HR_EDIT_ROLES, logLabel: "Vorgang/E-Mail-Text" },
  async ({ params, session }) => {
    const typ = vorgangTypAusModul(params.modul);
    if (!typ) return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });

    const mandant = await mandantDesVorgangs(typ, params.id);
    if (!mandant || !(await canAccessProcess(session!, mandant))) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }

    const text = await mailTextLaden(params.mailId, { vorgangTyp: typ, vorgangId: params.id, isTest: false });
    if (!text) return NextResponse.json({ error: "E-Mail nicht gefunden" }, { status: 404, headers: KEIN_CACHE });

    return NextResponse.json(text, { headers: KEIN_CACHE });
  },
);
