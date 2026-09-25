/**
 * API: /api/unterlagen/[token]/dateien/[dateiId]
 *
 * DELETE - Einen eigenen, noch nicht uebermittelten Entwurf entfernen.
 *          Uebermittelte Dateien bleiben (409).
 *
 * OEFFENTLICH - kein Auth erforderlich! Zugang nur ueber einen gueltigen
 * Token. Die Middleware laeuft fuer /api/unterlagen/* nicht (Matcher).
 *
 * Duenne Huelle um unterlagenDateiEntfernen (src/lib/unterlagen-upload.ts):
 * IP-Bremse, Tokenformat, Link, Bremse je Nachforderung, Datei DIESER
 * Nachforderung (fremd = unbekannt = 404), Sperre mit Neupruefung, Zeile in
 * der Transaktion loeschen, die Datei danach.
 */

import { NextRequest } from "next/server";
import { fehlerKennung } from "@/lib/fehler-kennung";
import {
  OEFFENTLICHER_SERVERFEHLER,
  oeffentlicheAntwort,
  unterlagenDateiEntfernen,
} from "@/lib/unterlagen-upload";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; dateiId: string }> }
) {
  try {
    const { token, dateiId } = await params;
    return oeffentlicheAntwort(await unterlagenDateiEntfernen(request, token, dateiId));
  } catch (error) {
    console.error("[API] Unterlagen-Entwurf entfernen fehlgeschlagen:", fehlerKennung(error));
    return oeffentlicheAntwort(OEFFENTLICHER_SERVERFEHLER);
  }
}
