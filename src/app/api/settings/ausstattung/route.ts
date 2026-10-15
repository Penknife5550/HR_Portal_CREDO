/**
 * API: /api/settings/ausstattung  (Einstellungen → Ausstattung & Zugänge)
 *
 * GET  - Der Katalog: Positionen (mit Ausblendungen und Verwendung),
 *        Einrichtungen, Stellen zur Auswahl und die Warnungen (Adresslücken,
 *        ähnliche Vorlagenpunkte, Adressen außerhalb der Freigabeliste)
 * POST - Neue Position anlegen (immer ausgeschaltet)
 *
 * Berechtigung: SUPER_ADMIN, HR_LEITUNG (adminHandler)
 *
 * Duenne Huelle um katalogLaden und positionAnlegen
 * (src/lib/ausstattung-katalog.ts). Pruefung der Felder gegeneinander,
 * unbekannte Stelle oder Einrichtung (400), Eindeutigkeit (409) und Protokoll
 * stehen dort — hier wird nichts ein zweites Mal geprueft.
 */

import { NextResponse } from "next/server";
import { adminHandler } from "@/lib/api-handler";
import { katalogLaden, positionAnlegen } from "@/lib/ausstattung-katalog";
import { katalogPositionSchema, type KatalogPositionInput } from "@/lib/validations/ausstattung";

const LOG_LABEL = "Einstellungen/Ausstattung";

// =============================================
// GET /api/settings/ausstattung
// =============================================
export const GET = adminHandler(
  async () => NextResponse.json({ data: await katalogLaden() }, { headers: { "Cache-Control": "no-store" } }),
  { logLabel: LOG_LABEL },
);

// =============================================
// POST /api/settings/ausstattung - Position anlegen
// =============================================
export const POST = adminHandler<KatalogPositionInput>(
  async ({ body, session }) => {
    const antwort = await positionAnlegen({ body, userId: session?.userId ?? null });
    return NextResponse.json(antwort.body, { status: antwort.status });
  },
  { bodySchema: katalogPositionSchema, logLabel: LOG_LABEL },
);
