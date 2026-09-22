/**
 * API: /api/offboarding/[id]/department-links
 *
 * POST - Abteilungen informieren bzw. eine Aktion fuer EINE Abteilung
 *        (Erneut senden, Erinnern, Link erneuern)
 *
 * Duenne Huelle um abteilungsAktionAusfuehren (src/lib/abteilungsaufgaben-dienst.ts).
 * Rolle (HR_EDIT_ROLES), Mandant (404 mit demselben Text wie "unbekannt"),
 * Vorgangsstatus, Sperre gegen Doppelklicks, Versand, Protokoll und die
 * Antwortform (Versandbericht 201/409/502) stehen dort — hier wird nichts
 * zweites Mal geprueft oder protokolliert.
 *
 * Request:
 *   leer oder {}                                   → informieren
 *   { aktion: "erneut-senden" | "erinnern" | "link-erneuern", departmentKey }
 *   { action: "remind", departmentKey }            → Alias fuer "erinnern"
 *
 * Den frueheren GET-Export (Link-Liste) gibt es nicht mehr: Die Oberflaeche
 * hat ihn nie aufgerufen, die Karte bekommt ihre Zeilen aus
 * GET /api/offboarding/[id] (`abteilungen`).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { abteilungsAktionAusfuehren } from "@/lib/abteilungsaufgaben-dienst";
import { MELDUNGEN } from "@/lib/abteilungsaufgaben";

// =============================================
// POST /api/offboarding/[id]/department-links
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

    const antwort = await abteilungsAktionAusfuehren({ offboardingId: id, rohBody, session });
    return NextResponse.json(antwort.body, { status: antwort.status });
  } catch (error) {
    console.error("[API] Abteilungs-Aktion fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
