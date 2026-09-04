/**
 * Zusammenstellung fuer den Versand-Dialog.
 *
 * GET /api/dokumentenpaket?modul=ONBOARDING&refId=<uuid>
 *   Liefert in einem Aufruf alles, was der Dialog braucht: Empfaengervorschlag,
 *   das vorausgewaehlte Standardpaket des Mandanten, alle waehlbaren PDFs und
 *   Vorlagen samt Kennzeichen sensibler Felder, den bisherigen Versandverlauf
 *   und die Groessengrenze.
 *
 * Die Bibliothek prueft Modul und Mandant; diese Route bleibt duenn.
 *
 * Berechtigung: HR_EDIT_ROLES + Mandant des Vorgangs.
 */
import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { ladePaketAngebot, statusFuerFehler } from "@/lib/dokumentenpaket";
import { HR_EDIT_ROLES } from "@/lib/permissions";

export const GET = apiHandler(
  { roles: HR_EDIT_ROLES, logLabel: "Dokumentenpaket Zusammenstellung" },
  async ({ request, session }) => {
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const params = new URL(request.url).searchParams;
    const modul = (params.get("modul") ?? "").trim().toUpperCase();
    const refId = (params.get("refId") ?? "").trim();
    if (!modul || !refId) {
      return NextResponse.json(
        { error: "modul und refId sind erforderlich." },
        { status: 400 },
      );
    }

    const ergebnis = await ladePaketAngebot({ modul, refId, session });
    if (ergebnis.status === "FEHLER") {
      return NextResponse.json(
        { error: ergebnis.detail, fehler: ergebnis.fehler },
        { status: statusFuerFehler(ergebnis.fehler) },
      );
    }

    return NextResponse.json({ data: ergebnis.angebot });
  },
);
