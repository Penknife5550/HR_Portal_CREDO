/**
 * API: /api/onboarding/[id]/unterlagen/dateien/[dateiId]
 *
 * GET - HR oeffnet eine uebermittelte Datei einer Nachforderung zur Pruefung
 *       (Paket 4, EP-10): `inline` im neuen Tab, kein iframe (X-Frame-Options).
 *
 * Duenne Huelle um unterlagenDateiOeffnen (src/lib/unterlagen-dienst.ts):
 * Sitzung, EINE Dienstfunktion, Antwort 1:1. Rolle (HR_EDIT_ROLES), Mandant,
 * Bindung der Datei an den Vorgang, 404 fuer Entwuerfe, nie uebermittelte,
 * geloeschte und uebernommene Dateien (derselbe Text), die Kopfzeilen
 * (`no-store`, `Cross-Origin-Resource-Policy`, bei Bildern `sandbox`) und das
 * Protokoll stehen dort. Uebernommene Dateien liefert die Dokumentroute
 * (`/api/onboarding/[id]/documents/[docId]`).
 *
 * Die `sandbox` der Route wirkt erst, wenn die Middleware fuer diesen Pfad
 * keine eigene CSP setzt: Next.js haengt einen Kopf der Route nur an, wenn die
 * Middleware ihn nicht schon gesetzt hat (Einzelheiten bei
 * unterlagenDateiOeffnen).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { fehlerKennung, unterlagenDateiOeffnen } from "@/lib/unterlagen-dienst";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; dateiId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const { id, dateiId } = await params;
    const ergebnis = await unterlagenDateiOeffnen({ modul: "ONBOARDING", vorgangId: id, dateiId, session });
    if (!ergebnis.ok) {
      return NextResponse.json(ergebnis.antwort.body, {
        status: ergebnis.antwort.status,
        headers: { "Cache-Control": "no-store", ...ergebnis.antwort.headers },
      });
    }
    // Buffer als Uint8Array — so nimmt NextResponse ihn an.
    return new NextResponse(new Uint8Array(ergebnis.inhalt), { status: 200, headers: ergebnis.headers });
  } catch (error) {
    // Nur der Fehlercode: Die Meldung kann Pfade tragen.
    console.error("[API] Unterlagen-Datei nicht geoeffnet:", fehlerKennung(error));
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
