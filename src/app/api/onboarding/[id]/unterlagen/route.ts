/**
 * API: /api/onboarding/[id]/unterlagen
 *
 * POST - Die fuenf Aktionen auf eine Nachforderung von Unterlagen (Paket 4):
 *        { aktion: "anfordern" | "ergaenzen" | "frist-aendern"
 *                  | "erneut-senden" | "zurueckziehen", … }
 *
 * Duenne Huelle um unterlagenAktionAusfuehren (src/lib/unterlagen-dienst.ts):
 * Sitzung, Body, EINE Dienstfunktion, Antwort 1:1 (Status, Body und bei 429
 * `Retry-After`). Rolle, Mandant (404 mit demselben Text wie „unbekannt"),
 * Sperren, Mail-Bremse, Versand und Protokoll stehen dort — hier wird nichts
 * ein zweites Mal geprueft oder protokolliert.
 *
 * Kaputtes JSON, ein leerer Body oder eine fehlende Aktion ergeben 400 — nie
 * eine Standardaktion (jsonKoerperPruefen): Jede Aktion verschickt eine Mail
 * an eine Privatadresse oder beendet die Nachforderung.
 *
 * Eine eigene Uebersicht gibt es nicht; sie haengt als `unterlagen` an
 * GET /api/onboarding/[id] (unterlagenUebersichtLaden).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { fehlerKennung, unterlagenAktionAusfuehren } from "@/lib/unterlagen-dienst";
import { jsonKoerperPruefen, unterlagenAktionSchema } from "@/lib/validations/unterlagen";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const { id } = await params;
    const koerper = jsonKoerperPruefen(await request.text(), unterlagenAktionSchema);
    if (!koerper.ok) return NextResponse.json({ error: koerper.error }, { status: koerper.status });

    const antwort = await unterlagenAktionAusfuehren({
      modul: "ONBOARDING",
      vorgangId: id,
      eingabe: koerper.daten,
      session,
    });
    return NextResponse.json(antwort.body, { status: antwort.status, headers: antwort.headers });
  } catch (error) {
    // Nur der Fehlercode: Die Meldung kann Adressen oder Pfade tragen.
    console.error("[API] Unterlagen-Aktion fehlgeschlagen:", fehlerKennung(error));
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
