/**
 * API: /api/onboarding/[id]/ausstattung
 *
 * GET  - Karte „Ausstattung & Zugänge“ des Vorgangs (Reiter Checkliste)
 * POST - eine Aktion der Karte: hinzufuegen, aendern, streichen,
 *        hinweis-aendern, hinweis-gesehen, hinweis-uebernehmen
 *
 * Duenne Huellen um ausstattungKarteLaden und ausstattungAktionAusfuehren
 * (src/lib/ausstattung-dienst.ts). Rolle (nur HR_EDIT_ROLES, nie der
 * n8n-Schluessel SERVICE — Regel 16), Mandant (404 mit demselben Text wie
 * „unbekannt“), Endstatus und Voraussetzung (409), die Versandsperre, die
 * Transaktion samt Aenderungsliste, Nachholen und Protokoll stehen dort —
 * hier wird nichts ein zweites Mal geprueft oder protokolliert.
 *
 * Antwort POST 200: { data: AusstattungsUebersicht, meldung }.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { MELDUNGEN } from "@/lib/abteilungsaufgaben";
import { ausstattungAktionAusfuehren, ausstattungKarteLaden } from "@/lib/ausstattung-dienst";

// =============================================
// GET /api/onboarding/[id]/ausstattung
// =============================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const { id } = await params;
    const antwort = await ausstattungKarteLaden({ onboardingId: id, session });
    return NextResponse.json(antwort.body, { status: antwort.status });
  } catch (error) {
    console.error("[API] Ausstattung laden fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// =============================================
// POST /api/onboarding/[id]/ausstattung
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

    const antwort = await ausstattungAktionAusfuehren({ onboardingId: id, rohBody, session });
    return NextResponse.json(antwort.body, { status: antwort.status });
  } catch (error) {
    console.error("[API] Ausstattung aendern fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
