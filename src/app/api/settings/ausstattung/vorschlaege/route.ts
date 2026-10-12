/**
 * API: POST /api/settings/ausstattung/vorschlaege  („Vorschläge übernehmen …“)
 *
 * Legt die Vorschläge für den Anfangsbestand an, die noch fehlen — zentral,
 * ausgeschaltet, ohne Fälligkeit. Wiederholbar: Ein zweiter Aufruf legt nichts
 * an. Antwort `{ angelegt, vorhanden, meldung }`. Kein Body.
 *
 * Berechtigung: SUPER_ADMIN, HR_LEITUNG (adminHandler)
 *
 * Duenne Huelle um vorschlaegeUebernehmen (src/lib/ausstattung-katalog.ts).
 */

import { NextResponse } from "next/server";
import { adminHandler } from "@/lib/api-handler";
import { vorschlaegeUebernehmen } from "@/lib/ausstattung-katalog";

export const POST = adminHandler(
  async ({ session }) => {
    const antwort = await vorschlaegeUebernehmen({ userId: session?.userId ?? null });
    return NextResponse.json(antwort.body, { status: antwort.status });
  },
  { logLabel: "Einstellungen/Ausstattung" },
);
