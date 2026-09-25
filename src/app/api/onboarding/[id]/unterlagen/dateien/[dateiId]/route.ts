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
 * (`no-store`, `Cross-Origin-Resource-Policy`, die CSP: bei Bildern `sandbox`,
 * sonst die des Portals) und das Protokoll stehen dort. Uebernommene Dateien
 * liefert die Dokumentroute (`/api/onboarding/[id]/documents/[docId]`).
 *
 * Die Middleware setzt fuer diesen Pfad KEINE eigene CSP
 * (`routeSetztEigeneCsp`, src/lib/content-security-policy.ts): Next.js haengt
 * einen Kopf der Route nur an, wenn die Middleware ihn nicht schon gesetzt hat.
 * Deshalb traegt hier JEDE Antwort ihre CSP selbst — auch 401, die
 * Fehlerantworten des Dienstes und 500 (`antwortOhneDatei`), sonst stuenden
 * sie als einzige Antworten des Portals ohne CSP da.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { portalCsp } from "@/lib/content-security-policy";
import { fehlerKennung, unterlagenDateiOeffnen } from "@/lib/unterlagen-dienst";

/** Eine JSON-Antwort ohne Datei: `no-store` und die CSP des Portals, wie sonst die Middleware. */
function antwortOhneDatei(body: unknown, status: number, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers, "Content-Security-Policy": portalCsp() },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; dateiId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return antwortOhneDatei({ error: "Nicht authentifiziert" }, 401);

    const { id, dateiId } = await params;
    const ergebnis = await unterlagenDateiOeffnen({ modul: "ONBOARDING", vorgangId: id, dateiId, session });
    if (!ergebnis.ok) {
      return antwortOhneDatei(ergebnis.antwort.body, ergebnis.antwort.status, ergebnis.antwort.headers);
    }
    // Buffer als Uint8Array — so nimmt NextResponse ihn an.
    return new NextResponse(new Uint8Array(ergebnis.inhalt), { status: 200, headers: ergebnis.headers });
  } catch (error) {
    // Nur der Fehlercode: Die Meldung kann Pfade tragen.
    console.error("[API] Unterlagen-Datei nicht geoeffnet:", fehlerKennung(error));
    return antwortOhneDatei({ error: "Interner Serverfehler" }, 500);
  }
}
