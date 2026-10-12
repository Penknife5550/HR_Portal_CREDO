/**
 * API: PUT /api/settings/ausstattung/[id]/ausblendung
 *
 * Eine Einrichtung blendet eine ZENTRALE Position für sich aus
 * (`{ organizationId, ausgeblendet: true }`) oder wieder ein
 * (`ausgeblendet: false`). Idempotent; 400 bei einer Position einer
 * Einrichtung (die wird ausgeschaltet, nicht ausgeblendet) und bei einer
 * unbekannten Einrichtung, 404 bei unbekannter Position.
 *
 * Berechtigung: SUPER_ADMIN, HR_LEITUNG (adminHandler)
 *
 * Duenne Huelle um ausblendungSetzen (src/lib/ausstattung-katalog.ts).
 */

import { NextResponse } from "next/server";
import { adminHandler } from "@/lib/api-handler";
import { ausblendungSetzen } from "@/lib/ausstattung-katalog";
import { ausblendungSchema, type AusblendungInput } from "@/lib/validations/ausstattung";

export const PUT = adminHandler<AusblendungInput>(
  async ({ body, params, session }) => {
    const antwort = await ausblendungSetzen({ id: params.id, body, userId: session?.userId ?? null });
    return NextResponse.json(antwort.body, { status: antwort.status });
  },
  { bodySchema: ausblendungSchema, logLabel: "Einstellungen/Ausstattung" },
);
