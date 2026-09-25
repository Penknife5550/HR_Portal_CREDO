/**
 * API: /api/unterlagen/[token]
 *
 * GET - Stand der Nachforderung fuer die Upload-Seite der Person (Paket 4)
 *
 * OEFFENTLICH - kein Auth erforderlich! Zugang nur ueber einen gueltigen
 * Token. Die Middleware laeuft fuer /api/unterlagen/* nicht (Matcher).
 *
 * Duenne Huelle um unterlagenLaden (src/lib/unterlagen-upload.ts). Dort
 * stehen IP-Bremse, Tokenformat (ohne Datenbank), Suche nur ueber den Hash,
 * Gueltigkeit (404/410, ERLEDIGT → readOnly) und der Datenzuschnitt: Name,
 * Einrichtung, Vorgangsnummer, Frist, Nachricht, Positionen mit eigenen
 * Entwuerfen, verantwortliche Stelle. NIE E-Mail-Adresse, Pruefsummen,
 * Notizen oder Namen eingereichter Dateien. Die Kopfzeilen (no-store,
 * nosniff, no-referrer, noindex) setzt oeffentlicheAntwort — auch bei 500.
 */

import { NextRequest } from "next/server";
import {
  fehlerKennung,
  OEFFENTLICHER_SERVERFEHLER,
  oeffentlicheAntwort,
  unterlagenLaden,
} from "@/lib/unterlagen-upload";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    return oeffentlicheAntwort(await unterlagenLaden(request, token));
  } catch (error) {
    // Nur der Fehlercode — nie die URL (sie traegt den Token) oder die Meldung.
    console.error("[API] Unterlagen laden fehlgeschlagen:", fehlerKennung(error));
    return oeffentlicheAntwort(OEFFENTLICHER_SERVERFEHLER);
  }
}
