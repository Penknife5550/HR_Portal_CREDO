/**
 * API: /api/offboarding/:id/checklist/:itemId
 *
 * PATCH – Checklisten-Aufgabe im Portal aendern (abhaken, Notiz, Zustaendigkeit)
 *
 * Duenne Huelle um aufgabeImPortalAendern
 * (src/lib/abteilungsaufgaben-uebergaenge.ts). Dort: Rolle (CHECKLIST_ROLES),
 * Mandant (404 mit demselben Text wie "unbekannt"), zod, bekannte
 * Zustaendigkeit, abgebrochener Vorgang (409), gesperrte Transaktion mit
 * Neuberechnung BEIDER Abteilungen beim Umhaengen, Protokoll und die Mail
 * "Aufgabe erledigt" — nur bei Aufgaben einer Link-Abteilung und nur bei einem
 * echten Wechsel.
 *
 * Antwort 200: { item: <Eintrag + erledigtVon>, progress: { total, completed, allCompleted } }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { aufgabeImPortalAendern } from "@/lib/abteilungsaufgaben-uebergaenge";

// =============================================
// PATCH /api/offboarding/:id/checklist/:itemId
// =============================================
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    const { id, itemId } = await params;
    // Kaputter Body → undefined; das Schema antwortet mit 400 "Ungültige
    // Eingabe" (frueher warf request.json() und es gab 500).
    const roh = await request.json().catch(() => undefined);
    const antwort = await aufgabeImPortalAendern({ offboardingId: id, itemId, rohBody: roh, session });
    return NextResponse.json(antwort.body, { status: antwort.status });
  } catch (error) {
    console.error("Fehler beim Aktualisieren des Checklisten-Items:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
