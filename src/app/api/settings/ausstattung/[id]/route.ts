/**
 * API: /api/settings/ausstattung/[id]  (Einstellungen → Ausstattung & Zugänge)
 *
 * PATCH  - Position ändern, auch ein- und ausschalten (`isActive`)
 * DELETE - Position löschen; 409, sobald ein Vorgang sie gewählt hat
 *          („bitte ausschalten statt löschen“)
 *
 * Berechtigung: SUPER_ADMIN, HR_LEITUNG (adminHandler)
 *
 * Duenne Huelle um positionAendern und positionLoeschen
 * (src/lib/ausstattung-katalog.ts): nur echte Aenderungen werden geschrieben
 * und protokolliert, die Pruefung laeuft auf gespeicherter Zeile plus
 * Aenderung, 404 bei unbekannter Position, 409 `INZWISCHEN_GEAENDERT`, wenn
 * der mitgeschickte `stand` (updatedAt beim Oeffnen des Dialogs) veraltet ist.
 */

import { NextResponse } from "next/server";
import { adminHandler } from "@/lib/api-handler";
import { positionAendern, positionLoeschen } from "@/lib/ausstattung-katalog";
import {
  katalogPositionAenderungSchema,
  type KatalogPositionAenderungInput,
} from "@/lib/validations/ausstattung";

const LOG_LABEL = "Einstellungen/Ausstattung";

// =============================================
// PATCH /api/settings/ausstattung/[id]
// =============================================
export const PATCH = adminHandler<KatalogPositionAenderungInput>(
  async ({ body, params, session }) => {
    const antwort = await positionAendern({ id: params.id, body, userId: session?.userId ?? null });
    return NextResponse.json(antwort.body, { status: antwort.status });
  },
  { bodySchema: katalogPositionAenderungSchema, logLabel: LOG_LABEL },
);

// =============================================
// DELETE /api/settings/ausstattung/[id]
// =============================================
export const DELETE = adminHandler(
  async ({ params, session }) => {
    const antwort = await positionLoeschen({ id: params.id, userId: session?.userId ?? null });
    return NextResponse.json(antwort.body, { status: antwort.status });
  },
  { logLabel: LOG_LABEL },
);
