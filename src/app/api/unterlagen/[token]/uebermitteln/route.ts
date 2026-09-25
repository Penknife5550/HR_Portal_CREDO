/**
 * API: /api/unterlagen/[token]/uebermitteln
 *
 * POST - „Unterlagen übermitteln": alle Entwuerfe gehen an HR.
 *        { gueltigBis?: { [positionId]: "YYYY-MM-DD" | null } }
 *
 * OEFFENTLICH - kein Auth erforderlich! Zugang nur ueber einen gueltigen
 * Token. Die Middleware laeuft fuer /api/unterlagen/* nicht (Matcher).
 *
 * Duenne Huelle um unterlagenUebermitteln (src/lib/unterlagen-upload.ts). Dort:
 * IP-Bremse, Tokenformat, Link, Bremse je Nachforderung, Body begrenzt lesen
 * (kaputt oder leer = 400, nie eine Standardaktion), die Daten „Gültig bis"
 * in DERSELBEN Transaktion wie die Uebermittlung, Merker „vollständig",
 * AuditLog ohne IP und ohne Dateinamen. Doppelklick = 200 mit aktuellem Stand.
 * Die HR-Meldung geht erst NACH der Antwort hinaus (after()).
 */

import { NextRequest } from "next/server";
import { fehlerKennung } from "@/lib/fehler-kennung";
import {
  OEFFENTLICHER_SERVERFEHLER,
  oeffentlicheAntwort,
  unterlagenUebermitteln,
} from "@/lib/unterlagen-upload";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    return oeffentlicheAntwort(await unterlagenUebermitteln(request, token));
  } catch (error) {
    console.error("[API] Unterlagen übermitteln fehlgeschlagen:", fehlerKennung(error));
    return oeffentlicheAntwort(OEFFENTLICHER_SERVERFEHLER);
  }
}
