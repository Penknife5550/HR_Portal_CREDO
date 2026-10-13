/**
 * API: POST /api/settings/ausstattung/rueckgabe-vorgaben  („Rückgabe-Vorgaben übernehmen …“, A4)
 *
 * Setzt „Beim Austritt“, Rückgabekategorie und Kennungsbeschriftung aus den
 * festen Vorgaben (RUECKGABE_VORGABEN in src/lib/ausgaben.ts) an den Positionen
 * aus „Vorschläge übernehmen“, die dafür noch keinen Wert haben — und schaltet
 * damit die Erfassung der Übergaben ein (G27). Wiederholbar; von Hand gesetzte
 * Werte bleiben. Antwort `{ gesetzt, uebersprungen, meldung, hinweis? }`;
 * `hinweis`, wenn ein Webhook auf die Offboarding-Abteilungsereignisse aktiv
 * ist (G21). Kein Body.
 *
 * Berechtigung: SUPER_ADMIN, HR_LEITUNG (adminHandler)
 *
 * Duenne Huelle um rueckgabeVorgabenUebernehmen (src/lib/ausstattung-katalog.ts).
 */

import { NextResponse } from "next/server";
import { adminHandler } from "@/lib/api-handler";
import { rueckgabeVorgabenUebernehmen } from "@/lib/ausstattung-katalog";

export const POST = adminHandler(
  async ({ session }) => {
    const antwort = await rueckgabeVorgabenUebernehmen({ userId: session?.userId ?? null });
    return NextResponse.json(antwort.body, { status: antwort.status });
  },
  { logLabel: "Einstellungen/Ausstattung" },
);
