/**
 * API: POST /api/settings/ausstattung/vorschlaege  („Vorschläge übernehmen …“)
 *
 * Legt die Vorschläge des Standardkatalogs an, die noch fehlen — zentral, mit
 * ihren Standardwerten (Vorauswahl, Fälligkeit, Hinweise), aber immer
 * ausgeschaltet. Wiederholbar: Ein zweiter Aufruf legt nichts an. Antwort
 * `{ angelegt, vorhanden, meldung }`. Kein Body.
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
