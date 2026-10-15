/**
 * API: /api/onboarding/[id]/arbeitsort
 *
 * PATCH - Arbeitsort des Vorgangs aendern (E-A10), Body `{ arbeitsortId: string | null }`
 *         (`null` = wie Einrichtung)
 *
 * Duenne Huelle um arbeitsortAendern (src/lib/onboarding-arbeitsort.ts). Rolle
 * (HR_EDIT_ROLES), Mandant (404 mit demselben Text wie "unbekannt" — geprueft
 * am Arbeitgeber, nie am Arbeitsort), die Sperre ab dem Modalitaeten-Link
 * (409 LINK_ERZEUGT), das bedingte Schreiben und das Protokoll stehen dort —
 * hier wird nichts ein zweites Mal geprueft oder protokolliert.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { MELDUNGEN } from "@/lib/abteilungsaufgaben";
import { arbeitsortAendern } from "@/lib/onboarding-arbeitsort";

// =============================================
// PATCH /api/onboarding/[id]/arbeitsort
// =============================================
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const { id } = await params;

    // Kaputtes JSON ist ein 400 — nie „wie Einrichtung“. Ein leerer Body
    // laeuft als `undefined` in die Pruefung und scheitert dort (Pflichtfeld).
    const text = await request.text();
    let rohBody: unknown = undefined;
    if (text.trim() !== "") {
      try {
        rohBody = JSON.parse(text);
      } catch {
        return NextResponse.json({ error: MELDUNGEN.UNGUELTIGE_EINGABE }, { status: 400 });
      }
    }

    const antwort = await arbeitsortAendern({ onboardingId: id, rohBody, session });
    return NextResponse.json(antwort.body, { status: antwort.status });
  } catch (error) {
    console.error("[API] Arbeitsort aendern fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
