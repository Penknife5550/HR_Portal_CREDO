/**
 * API: /api/unterlagen/[token]/positionen/[positionId]/dateien
 *
 * POST - Eine Datei zu einer Unterlage hochladen (multipart, genau ein Feld
 *        `datei`). Sie liegt danach als Entwurf bereit; HR sieht sie erst nach
 *        „Unterlagen übermitteln".
 *
 * OEFFENTLICH - kein Auth erforderlich! Zugang nur ueber einen gueltigen
 * Token. Die Middleware laeuft fuer /api/unterlagen/* nicht: Nur mit ihr
 * klonte Next.js den Body, schnitte ihn bei 10 MiB ab und schriebe die URL
 * samt Token ins Log.
 *
 * Duenne Huelle um unterlagenDateiHochladen (src/lib/unterlagen-upload.ts).
 * Dort steht die verbindliche Reihenfolge der Pruefung (Feinplanung 4.3):
 * IP-Bremse, Tokenformat, Content-Type, Content-Length, Link, Bremse je
 * Nachforderung, Position, Kontingente, Body begrenzt lesen, Typ aus den
 * Bytes, Datei schreiben, Transaktion. Den Body liest nur der Dienst.
 */

import { NextRequest } from "next/server";
import { fehlerKennung } from "@/lib/fehler-kennung";
import {
  OEFFENTLICHER_SERVERFEHLER,
  oeffentlicheAntwort,
  unterlagenDateiHochladen,
} from "@/lib/unterlagen-upload";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; positionId: string }> }
) {
  try {
    const { token, positionId } = await params;
    return oeffentlicheAntwort(await unterlagenDateiHochladen(request, token, positionId));
  } catch (error) {
    // Nur der Fehlercode — nie die URL (Token) oder der Dateiname.
    console.error("[API] Unterlagen hochladen fehlgeschlagen:", fehlerKennung(error));
    return oeffentlicheAntwort(OEFFENTLICHER_SERVERFEHLER);
  }
}
