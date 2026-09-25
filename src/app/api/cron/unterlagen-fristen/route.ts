/**
 * API: POST /api/cron/unterlagen-fristen[?dryRun=1]
 *
 * Der taegliche Lauf von „Unterlagen nachfordern" (Paket 4, Feinplanung
 * Abschnitt 9): HR-Meldung „vollständig" nachholen, gescheiterte Mails an die
 * Person nachholen, Erinnerungen (7 Tage vorher und am Fristtag), „Frist
 * verstrichen" an HR, Nachforderungen eingestellter Vorgaenge zurueckziehen
 * (Z2) und aufraeumen (Dateien nach 30 Tagen, Entwuerfe, Waisen).
 *
 * Duenne Huelle um `unterlagenFristenLauf` (src/lib/unterlagen-lauf.ts, die
 * Regeln rein in src/lib/unterlagen-fristen.ts): Anmeldung, `dryRun`, Antwort
 * 1:1.
 *
 *   - Aufruf extern ueber n8n mit `Authorization: Bearer <CRON_SECRET>`. Das
 *     Geheimnis muss mindestens 24 Zeichen haben (sonst 500, wie
 *     `dokumente-aufbewahrung`), verglichen wird zeitkonstant (401).
 *   - `?dryRun=1`: dieselbe Planung, aber keine Mail, kein Link, kein
 *     Schreibzugriff, keine Loeschung — fuer die ersten Tage nach dem Deploy.
 *   - 200 auch bei Teilfehlern (Zaehler `errors`), 409, solange ein anderer
 *     Lauf arbeitet, 500 bei einem schweren Fehler.
 *   - Die Antwort traegt keine Personendaten: n8n speichert Ausfuehrungsdaten.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { fehlerKennung } from "@/lib/unterlagen-dienst";
import { unterlagenFristenLauf } from "@/lib/unterlagen-lauf";

/** Mindestlaenge des CRON_SECRET — ein kurzes Geheimnis ist ein Konfigurationsfehler. */
const CRON_SECRET_MIN_LAENGE = 24;

/**
 * Zeitkonstanter Vergleich ueber die SHA-256 beider Seiten: gleiche Laenge
 * unabhaengig von der Eingabe, und `timingSafeEqual` wirft nie — auch nicht
 * bei Zeichen ausserhalb von ASCII, deren Bytelaenge von der Zeichenlaenge
 * abweicht.
 */
function gleichZeitkonstant(a: string, b: string): boolean {
  const hash = (wert: string) => crypto.createHash("sha256").update(wert, "utf8").digest();
  return crypto.timingSafeEqual(hash(a), hash(b));
}

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.length < CRON_SECRET_MIN_LAENGE) {
    console.error("[cron/unterlagen-fristen] CRON_SECRET fehlt oder ist zu kurz");
    return NextResponse.json({ error: "Konfigurationsfehler" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization") ?? "";
  if (!gleichZeitkonstant(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  try {
    const antwort = await unterlagenFristenLauf({ dryRun });
    return NextResponse.json(antwort.body, { status: antwort.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // Nur der Fehlercode: Die Meldung kann Adressen oder Pfade tragen.
    console.error("[cron/unterlagen-fristen] Schwerer Fehler:", fehlerKennung(error));
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
