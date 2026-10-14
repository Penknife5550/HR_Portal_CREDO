/**
 * API: GET /api/settings/email-log/[id]/text
 *
 * Text einer Mail aus dem allgemeinen Versandprotokoll (Einstellungen), mit
 * ERSETZTEN persoenlichen Links. Der Text kommt erst auf Klick, nie mit der
 * Liste (GET /api/settings/email-log).
 *
 * Berechtigung wie das Versandprotokoll: SUPER_ADMIN, HR_LEITUNG — ueber alle
 * Mandanten. Die Zeile eines Test-Versands hat nie einen Text; BEM und
 * uebersprungene Mails ebenso nicht → 404.
 */

import { NextResponse } from "next/server";
import { adminHandler } from "@/lib/api-handler";
import { mailTextLaden } from "@/lib/mail-text-dienst";

export const GET = adminHandler(
  async ({ params }) => {
    const text = await mailTextLaden(params.id);
    if (!text) {
      return NextResponse.json({ error: "E-Mail nicht gefunden" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json(text, { headers: { "Cache-Control": "no-store" } });
  },
  { logLabel: "Versandprotokoll/Text" },
);
