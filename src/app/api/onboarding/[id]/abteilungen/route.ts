/**
 * API: /api/onboarding/[id]/abteilungen
 *
 * GET  - Uebersicht der Abteilungen dieses Vorgangs (Karte, Stepper, Dialog)
 * POST - Abteilungen informieren bzw. eine Aktion fuer EINE Abteilung
 *        (Erneut senden, Erinnern, Link erneuern)
 *
 * Duenne Huellen um onboardingAbteilungenLaden und
 * onboardingAbteilungsAktionAusfuehren (src/lib/abteilungsaufgaben-onboarding.ts).
 * Rolle, Mandant (404 mit demselben Text wie "unbekannt"), Vorgangsstatus, die
 * Voraussetzung „Modalitaeten eingereicht", das einmalige Setzen der
 * Faelligkeiten, die Sperre gegen Doppelklicks, Versand, Protokoll und die
 * Antwortform (Versandbericht 201/409/502) stehen dort — hier wird nichts ein
 * zweites Mal geprueft oder protokolliert.
 *
 * Request (POST):
 *   leer oder {}                                   → informieren
 *   { aktion: "erneut-senden" | "erinnern" | "link-erneuern", departmentKey }
 *   { action: "remind", departmentKey }            → Alias fuer "erinnern"
 *
 * Gegenstueck im Offboarding: /api/offboarding/[id]/department-links.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { MELDUNGEN } from "@/lib/abteilungsaufgaben";
import {
  onboardingAbteilungenLaden,
  onboardingAbteilungsAktionAusfuehren,
} from "@/lib/abteilungsaufgaben-onboarding";

// =============================================
// GET /api/onboarding/[id]/abteilungen
// =============================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const { id } = await params;
    const antwort = await onboardingAbteilungenLaden({ onboardingId: id, session });
    return NextResponse.json(antwort.body, { status: antwort.status });
  } catch (error) {
    console.error("[API] Onboarding-Abteilungen laden fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// =============================================
// POST /api/onboarding/[id]/abteilungen
// =============================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const { id } = await params;

    // Body selbst lesen statt request.json().catch(): Ein LEERER Body heisst
    // "informieren", ein KAPUTTER darf das aber nicht heissen — sonst loeste
    // ein abgeschnittener Aufruf { "aktion": "link-erneu… den Versand an alle
    // Abteilungen aus.
    const text = await request.text();
    let rohBody: unknown = undefined;
    if (text.trim() !== "") {
      try {
        rohBody = JSON.parse(text);
      } catch {
        return NextResponse.json({ error: MELDUNGEN.UNGUELTIGE_EINGABE }, { status: 400 });
      }
    }

    const antwort = await onboardingAbteilungsAktionAusfuehren({ onboardingId: id, rohBody, session });
    return NextResponse.json(antwort.body, { status: antwort.status });
  } catch (error) {
    console.error("[API] Onboarding-Abteilungs-Aktion fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
