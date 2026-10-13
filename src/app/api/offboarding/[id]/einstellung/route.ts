/**
 * API: /api/offboarding/[id]/einstellung (Ausstattung & Zugaenge, Stufe 2 – A4)
 *
 * GET  - Vorschlaege, Suche und Vorschau fuer den Dialog „Einstellung
 *        zuordnen …“ (`?q=` Vorgangsnummer oder Nachname ab 3 Zeichen,
 *        `?vorschau=<onboardingId>` samt Rueckgabe-Vorschlag, dazu
 *        `?weitereBeschaeftigung=true|false` – der Merker, wie HR ihn im Dialog
 *        gerade setzt); schreibt nichts
 * POST - eine Aktion am Austritt: `zuordnen` (nur HR bestaetigt, nie ein
 *        stiller Abgleich; uebernimmt den Rueckgabe-Vorschlag bzw. die
 *        Auswahl `uebernehmen`), `loesen` (loescht die Ruecknahme- und
 *        Sperraufgaben samt Rueckgaben, solange nichts davon erledigt ist),
 *        `aktualisieren` (fehlende Rueckgaben aus der Einstellung, Merker
 *        „Person bleibt in einer anderen Beschäftigung“) und `ohne-vermerk`
 *        („Als ausgegeben übernehmen“) – Feinplan A4, G11 bis G14
 *
 * Duenne Huelle um src/lib/offboarding-ausgaben.ts. Rolle (nur HR_EDIT_ROLES,
 * nie der n8n-Schluessel SERVICE), Mandant BEIDER Vorgaenge (404 mit demselben
 * Text wie „unbekannt“), Versandsperre des Austritts, Sperren, Arbeitsort,
 * Aufgaben, Rueckgaben, Links und Protokoll stehen dort — hier wird nichts ein
 * zweites Mal geprueft oder protokolliert.
 *
 * Antworten: GET 200 { data: EinstellungsAuswahl };
 *            POST 200 { data: RueckgabenUebersicht, meldung }, 409 { error, grund }.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { MELDUNGEN } from "@/lib/abteilungsaufgaben";
import { einstellungAktionAusfuehren, einstellungVorschlaegeLaden } from "@/lib/offboarding-ausgaben";

// =============================================
// GET /api/offboarding/[id]/einstellung
// =============================================
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const { id } = await params;
    const suche = request.nextUrl.searchParams;
    const query = {
      q: suche.get("q") ?? undefined,
      vorschau: suche.get("vorschau") ?? undefined,
      weitereBeschaeftigung: suche.get("weitereBeschaeftigung") ?? undefined,
    };

    const antwort = await einstellungVorschlaegeLaden({ offboardingId: id, query, session });
    return NextResponse.json(antwort.body, { status: antwort.status });
  } catch (error) {
    console.error("[API] Einstellung zuordnen – Vorschlaege laden fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// =============================================
// POST /api/offboarding/[id]/einstellung
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

    const antwort = await einstellungAktionAusfuehren({ offboardingId: id, rohBody, session });
    return NextResponse.json(antwort.body, { status: antwort.status });
  } catch (error) {
    console.error("[API] Einstellung zuordnen fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
