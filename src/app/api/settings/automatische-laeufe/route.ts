/**
 * API: GET /api/settings/automatische-laeufe  (Einstellungen → Automatische Läufe)
 *
 * Uebersicht aller automatischen Laeufe: Einstellung, naechster Lauf, Waechter
 * und die letzten Protokolle — fertig aufbereitet von uebersichtLaden
 * (src/lib/zeitplaner/dienst.ts). Schreibt nichts ausser fehlenden Zeilen
 * (immer ausgeschaltet).
 *
 * Berechtigung: SUPER_ADMIN, HR_LEITUNG (adminHandler)
 */

import { NextResponse } from "next/server";
import { adminHandler } from "@/lib/api-handler";
import { uebersichtLaden } from "@/lib/zeitplaner/dienst";

export const GET = adminHandler(
  async () => {
    const uebersicht = await uebersichtLaden();
    return NextResponse.json(uebersicht, { headers: { "Cache-Control": "no-store" } });
  },
  { logLabel: "Einstellungen/Automatische Läufe" },
);
