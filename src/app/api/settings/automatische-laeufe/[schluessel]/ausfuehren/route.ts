/**
 * API: POST /api/settings/automatische-laeufe/[schluessel]/ausfuehren
 *
 * Knopf „Jetzt ausführen“ bzw. „Probelauf jetzt“. Nimmt den Anspruch (409,
 * solange der Lauf arbeitet) und fuehrt den Lauf im Hintergrund zu Ende —
 * Antwort 202 mit der Protokoll-ID; das Ergebnis erscheint im Protokoll.
 *
 * Berechtigung: SUPER_ADMIN, HR_LEITUNG (adminHandler)
 */

import { NextResponse } from "next/server";
import { adminHandler } from "@/lib/api-handler";
import { handStarten } from "@/lib/zeitplaner/dienst";
import { laufStartenSchema, type LaufStartenInput } from "@/lib/validations/zeitplaner";

export const POST = adminHandler<LaufStartenInput>(
  async ({ body, params, session }) => {
    const antwort = await handStarten(params.schluessel, body.probelauf, session!.userId);
    return NextResponse.json(antwort.body, { status: antwort.status });
  },
  { bodySchema: laufStartenSchema, logLabel: "Einstellungen/Automatische Läufe" },
);
