/**
 * API: /api/onboarding/[id]/ausgaben (Ausstattung & Zugaenge, Stufe 2 – A4)
 *
 * POST - eine Ausgaben-Aktion der Karte „Ausstattung & Zugänge“: vermerken,
 *        korrigieren, tauschen, zurueckgenommen, entfernen (Feinplan A4, G7)
 *
 * Duenne Huelle um ausgabenAktionAusfuehren (src/lib/ausgaben-dienst.ts).
 * Rolle (nur HR_EDIT_ROLES, nie der n8n-Schluessel SERVICE), Mandant (404 mit
 * demselben Text wie „unbekannt“), Sperren, Bindung an einen Austritt (409),
 * Schreiben ueber den einzigen Schreiber der Tabelle und das Protokoll stehen
 * dort — hier wird nichts ein zweites Mal geprueft oder protokolliert. Gilt
 * bei jedem Status des Vorgangs, auch nach Abschluss und Absage.
 *
 * Antwort 200: { data: AusstattungsUebersicht, meldung }.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { MELDUNGEN } from "@/lib/abteilungsaufgaben";
import { ausgabenAktionAusfuehren } from "@/lib/ausgaben-dienst";

// =============================================
// POST /api/onboarding/[id]/ausgaben
// =============================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const { id } = await params;

    // Kaputtes JSON ist ein 400 — nie eine Standardaktion. Ein leerer Body
    // laeuft als `undefined` in die Pruefung und scheitert dort.
    const text = await request.text();
    let rohBody: unknown = undefined;
    if (text.trim() !== "") {
      try {
        rohBody = JSON.parse(text);
      } catch {
        return NextResponse.json({ error: MELDUNGEN.UNGUELTIGE_EINGABE }, { status: 400 });
      }
    }

    const antwort = await ausgabenAktionAusfuehren({ onboardingId: id, rohBody, session });
    return NextResponse.json(antwort.body, { status: antwort.status });
  } catch (error) {
    console.error("[API] Ausgabe aendern fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
