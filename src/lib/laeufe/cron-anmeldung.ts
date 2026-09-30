/**
 * Anmeldung der duennen Cron-Routen (Handaufruf, Bearer CRON_SECRET).
 *
 * Im Normalbetrieb startet der Zeitplaner die Laeufe selbst; die Routen
 * bleiben fuer den Notfall (`curl` vom Server). Jede Route behaelt ihre
 * bisherigen Antworten: fehlendes Geheimnis → 500 (Text je Route), falsches → 401.
 */

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * Zeitkonstanter Vergleich ueber die SHA-256 beider Seiten: gleiche Laenge
 * unabhaengig von der Eingabe, und `timingSafeEqual` wirft nie.
 */
function gleichZeitkonstant(a: string, b: string): boolean {
  const hash = (wert: string) => crypto.createHash("sha256").update(wert, "utf8").digest();
  return crypto.timingSafeEqual(hash(a), hash(b));
}

/**
 * `null` = angemeldet; sonst die fertige Fehlerantwort.
 *
 * @param opts.mindestLaenge  kuerzeres CRON_SECRET gilt als Konfigurationsfehler
 * @param opts.fehlerText     Text der 500-Antwort (je Route wie bisher)
 * @param opts.logPraefix     gesetzt: Konfigurationsfehler ins Log schreiben
 */
export function cronAnmeldungPruefen(
  request: NextRequest,
  opts: { mindestLaenge?: number; fehlerText: string; logPraefix?: string },
): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.length < (opts.mindestLaenge ?? 1)) {
    if (opts.logPraefix) console.error(`[${opts.logPraefix}] CRON_SECRET fehlt oder ist zu kurz`);
    return NextResponse.json({ error: opts.fehlerText }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization") ?? "";
  if (!gleichZeitkonstant(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }
  return null;
}

/** Die bisherige 500-Antwort der aelteren Routen bei fehlendem Geheimnis. */
export const NICHT_KONFIGURIERT = "CRON_SECRET nicht konfiguriert";
/** … und die der neueren Routen (Mindestlaenge 24). */
export const KONFIGURATIONSFEHLER = "Konfigurationsfehler";
