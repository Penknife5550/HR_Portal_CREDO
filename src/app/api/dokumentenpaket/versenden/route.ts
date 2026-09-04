/**
 * Versand eines Dokumentenpakets.
 *
 * POST /api/dokumentenpaket/versenden
 *   Body: { modul, refId, positionen[{art,id,bestaetigt?}], empfaenger, nachricht? }
 *
 * Loest POST /api/onboarding/[id]/starterpaket ab — den bisherigen
 * Alles-oder-nichts-Versand. Die Bibliothek traegt die Logik; hier stehen nur
 * die Statuscodes.
 *
 * Fehlerbilder: 403 fremder Mandant, 404 Vorgang, 409 leere Auswahl, fehlende
 * Bestaetigung, fehlende Datei oder fehlerhafte Vorlage, 413 zu gross, 502
 * PDF-Dienst oder SMTP. Kein Abbruch hinterlaesst einen Nachweis.
 *
 * Berechtigung: HR_EDIT_ROLES + Mandant des Vorgangs.
 */
import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { versendePaket, statusFuerFehler } from "@/lib/dokumentenpaket";
import { HR_EDIT_ROLES } from "@/lib/permissions";
import { versendePaketSchema, type VersendePaket } from "@/lib/validations/dokumentenpaket";

function clientIp(headers: Headers): string | null {
  // Von hinten lesen: Ein selbst gesetzter X-Forwarded-For-Header darf die
  // protokollierte Adresse nicht bestimmen (siehe getClientIp in lib/helpers).
  const kette = headers.get("x-forwarded-for");
  if (kette) {
    const teile = kette.split(",").map((t) => t.trim()).filter(Boolean);
    if (teile.length > 0) return teile[teile.length - 1];
  }
  return headers.get("x-real-ip");
}

export const POST = apiHandler<VersendePaket>(
  {
    roles: HR_EDIT_ROLES,
    bodySchema: versendePaketSchema,
    logLabel: "Dokumentenpaket Versand",
  },
  async ({ request, body, session }) => {
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const ergebnis = await versendePaket({
      modul: body.modul,
      refId: body.refId,
      positionen: body.positionen,
      empfaenger: body.empfaenger,
      nachricht: body.nachricht,
      session,
      ipAddress: clientIp(request.headers),
    });

    if (ergebnis.status === "FEHLER") {
      return NextResponse.json(
        {
          error: ergebnis.detail,
          fehler: ergebnis.fehler,
          // Bei fehlender Bestaetigung: welche Vorlagen es betrifft, damit der
          // Dialog die Haekchen genau dort setzen kann.
          betroffen: ergebnis.betroffen,
        },
        { status: statusFuerFehler(ergebnis.fehler) },
      );
    }

    return NextResponse.json({
      data: {
        versandId: ergebnis.versandId,
        empfaenger: ergebnis.empfaenger,
        dokumente: ergebnis.dokumente,
        warnungen: ergebnis.warnungen,
      },
    });
  },
);
