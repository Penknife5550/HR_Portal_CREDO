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
 * Bestaetigung, fehlende Datei, fehlerhafte Vorlage oder nicht freigegebene
 * Empfaengeradresse, 413 zu gross, 429 zu viele Versendungen, 502 PDF-Dienst
 * oder SMTP. Kein Abbruch hinterlaesst einen Nachweis.
 *
 * Die Bremse (429, je Benutzerkonto 10 pro Minute und 60 pro Stunde als
 * Nachfuellrate) teilt sich diese Route mit der individuellen E-Mail — Regeln
 * und Begruendung in src/lib/versand-bremse.ts.
 *
 * Berechtigung: HR_EDIT_ROLES + Mandant des Vorgangs.
 */
import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { versendePaket, statusFuerFehler } from "@/lib/dokumentenpaket";
import { HR_EDIT_ROLES } from "@/lib/permissions";
import { getClientIpOrNull } from "@/lib/rate-limit";
import { versandBremsen } from "@/lib/versand-bremse";
import { versendePaketSchema, type VersendePaket } from "@/lib/validations/dokumentenpaket";

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

    // Vor allem anderen — auch ein abgewiesener Versuch (fehlende Bestaetigung,
    // fremder Mandant, nicht freigegebene Adresse) kostet ein Kontingent. Sonst
    // liesse sich ueber die Fehlerpfade beliebig oft probieren, und gerade die
    // Fehlerpfade verraten, welche Vorgangs-ID existiert.
    const gebremst = versandBremsen(session.userId);
    if (gebremst) return gebremst;

    const ergebnis = await versendePaket({
      modul: body.modul,
      refId: body.refId,
      positionen: body.positionen,
      empfaenger: body.empfaenger,
      nachricht: body.nachricht,
      session,
      ipAddress: getClientIpOrNull(request),
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
