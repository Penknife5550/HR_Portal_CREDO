/**
 * API: /api/onboarding/[id]/unterlagen/positionen/[positionId]
 *
 * POST - Die vier Entscheidungen ueber eine angeforderte Unterlage (Paket 4):
 *        { aktion: "annehmen", gueltigBis?, unbefristet?, dokumentTyp? }
 *        { aktion: "zurueckweisen", begruendung, frist? }
 *        { aktion: "entfaellt", notiz? }
 *        { aktion: "annahme-zuruecknehmen" }
 *
 * Duenne Huelle um unterlagenPositionsAktionAusfuehren
 * (src/lib/unterlagen-dienst.ts): Sitzung, Body, EINE Dienstfunktion, Antwort
 * 1:1 (Status, Body und bei 429 `Retry-After`). Rolle, Mandant (404 mit
 * demselben Text wie „unbekannt"), Bindung der Position an den Vorgang,
 * Sperren, Dateiumzug, Mail und Protokoll stehen dort — hier wird nichts ein
 * zweites Mal geprueft oder protokolliert.
 *
 * Kaputtes JSON, ein leerer Body oder eine fehlende Aktion ergeben 400 — nie
 * eine Standardaktion (jsonKoerperPruefen): Jede Aktion entscheidet ueber
 * einen Nachweis.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { fehlerKennung } from "@/lib/fehler-kennung";
import { unterlagenPositionsAktionAusfuehren } from "@/lib/unterlagen-dienst";
import { jsonKoerperPruefen, positionsAktionSchema } from "@/lib/validations/unterlagen";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; positionId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const { id, positionId } = await params;
    const koerper = jsonKoerperPruefen(await request.text(), positionsAktionSchema);
    if (!koerper.ok) return NextResponse.json({ error: koerper.error }, { status: koerper.status });

    const antwort = await unterlagenPositionsAktionAusfuehren({
      modul: "ONBOARDING",
      vorgangId: id,
      positionId,
      eingabe: koerper.daten,
      session,
    });
    return NextResponse.json(antwort.body, { status: antwort.status, headers: antwort.headers });
  } catch (error) {
    // Nur der Fehlercode: Die Meldung kann Adressen oder Pfade tragen.
    console.error("[API] Unterlagen-Entscheidung fehlgeschlagen:", fehlerKennung(error));
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
