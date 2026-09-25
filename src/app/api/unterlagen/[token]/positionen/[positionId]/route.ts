/**
 * API: /api/unterlagen/[token]/positionen/[positionId]
 *
 * PATCH - „Gültig bis" einer Unterlage beim Verlassen des Feldes
 *         zwischenspeichern: { gueltigBis: "YYYY-MM-DD" | null }. Leer heisst
 *         unbefristet oder unbekannt — HR entscheidet beim Annehmen.
 *
 * OEFFENTLICH - kein Auth erforderlich! Zugang nur ueber einen gueltigen
 * Token. Die Middleware laeuft fuer /api/unterlagen/* nicht (Matcher).
 *
 * Duenne Huelle um unterlagenGueltigBisSpeichern
 * (src/lib/unterlagen-upload.ts): IP-Bremse, Tokenformat, Link, Bremse je
 * Nachforderung, Body begrenzt lesen (kaputt = 400), Position DIESER
 * Nachforderung, nur fristpflichtig und offen (409), Datum ueber
 * pruefeGueltigBis (400), Sperre mit Neupruefung.
 */

import { NextRequest } from "next/server";
import {
  fehlerKennung,
  OEFFENTLICHER_SERVERFEHLER,
  oeffentlicheAntwort,
  unterlagenGueltigBisSpeichern,
} from "@/lib/unterlagen-upload";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; positionId: string }> }
) {
  try {
    const { token, positionId } = await params;
    return oeffentlicheAntwort(await unterlagenGueltigBisSpeichern(request, token, positionId));
  } catch (error) {
    console.error("[API] Unterlagen: Gültig bis speichern fehlgeschlagen:", fehlerKennung(error));
    return oeffentlicheAntwort(OEFFENTLICHER_SERVERFEHLER);
  }
}
