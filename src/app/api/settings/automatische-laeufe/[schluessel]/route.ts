/**
 * API: PATCH /api/settings/automatische-laeufe/[schluessel]
 *
 * Einen automatischen Lauf ein-/ausschalten, Uhrzeit, „nur werktags“,
 * Probelauf und „Bericht auch bei Erfolg“ aendern. Regeln in
 * einstellungAendern (src/lib/zeitplaner/dienst.ts): Loeschlaeufe erst nach
 * einem Probelauf scharf (409), erster Lauf nach dem Einschalten nie
 * ueberraschend sofort. AuditLog im selben Commit.
 *
 * Berechtigung: SUPER_ADMIN, HR_LEITUNG (adminHandler)
 */

import { NextResponse } from "next/server";
import { adminHandler } from "@/lib/api-handler";
import { einstellungAendern } from "@/lib/zeitplaner/dienst";
import { laufEinstellungSchema, type LaufEinstellungInput } from "@/lib/validations/zeitplaner";

export const PATCH = adminHandler<LaufEinstellungInput>(
  async ({ body, params, session }) => {
    const antwort = await einstellungAendern(params.schluessel, body, session!.userId);
    return NextResponse.json(antwort.body, { status: antwort.status });
  },
  { bodySchema: laufEinstellungSchema, logLabel: "Einstellungen/Automatische Läufe" },
);
