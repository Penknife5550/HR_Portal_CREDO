/**
 * API: /api/onboarding/:id/checklist/:itemId
 *
 * PATCH – Checklisten-Aufgabe im Portal aendern (abhaken, interne Notiz,
 *         Zustaendigkeit, Faelligkeit)
 *
 * Duenne Huelle um onboardingAufgabeImPortalAendern
 * (src/lib/abteilungsaufgaben-uebergaenge.ts). Dort: Rolle (CHECKLIST_ROLES),
 * Mandant (404 mit demselben Text wie "unbekannt"), zod, bekannte
 * Zustaendigkeit, abgelaufener Vorgang (409), gesperrte Transaktion mit
 * Neuberechnung BEIDER Abteilungen beim Umhaengen und das Protokoll.
 *
 * KEINE Mail (Entscheidung Paket 5): Das Haekchen von HR meldet weder HR noch
 * die Abteilung etwas — anders als im Offboarding.
 *
 * Antwort 200: { item: <Eintrag + completedBy + erledigtVon>,
 *                progress: { total, completed, allCompleted } }
 * Frueher war es der nackte Datensatz.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { onboardingAufgabeImPortalAendern } from "@/lib/abteilungsaufgaben-uebergaenge";

// =============================================
// PATCH /api/onboarding/:id/checklist/:itemId
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
    const antwort = await onboardingAufgabeImPortalAendern({
      onboardingId: id,
      itemId,
      rohBody: roh,
      session,
    });
    return NextResponse.json(antwort.body, { status: antwort.status });
  } catch (error) {
    console.error("Fehler beim Aktualisieren des Checklist-Items:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
