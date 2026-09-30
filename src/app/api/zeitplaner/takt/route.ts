/**
 * API: POST /api/zeitplaner/takt
 *
 * Takt des Zeitplaners — jede Minute von der Uhr im selben Prozess
 * aufgerufen (src/lib/zeitplaner/uhr.ts, gestartet aus src/instrumentation.ts).
 * Startet alle faelligen automatischen Laeufe im Hintergrund und antwortet
 * sofort.
 *
 * Anmeldung: Kopf `x-zeitplaner-token` mit dem Geheimnis, das die Uhr beim
 * Start erzeugt und nur im Speicher haelt. Ohne laufende Uhr (oder von aussen)
 * gibt es darum nur 404 — die Route verraet nicht, dass es sie gibt.
 */

import { NextRequest, NextResponse } from "next/server";
import { fehlerKennung } from "@/lib/fehler-kennung";
import { TAKT_KOPF, taktTokenGueltig, taktVermerken } from "@/lib/zeitplaner/uhr";
import { taktAusfuehren } from "@/lib/zeitplaner/dienst";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!taktTokenGueltig(request.headers.get(TAKT_KOPF))) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }
  const jetzt = new Date();
  taktVermerken(jetzt);
  try {
    const gestartet = await taktAusfuehren(jetzt);
    return NextResponse.json({ ok: true, gestartet }, { headers: { "Cache-Control": "no-store" } });
  } catch (fehler) {
    console.error("[Zeitplaner] Takt:", fehlerKennung(fehler));
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
