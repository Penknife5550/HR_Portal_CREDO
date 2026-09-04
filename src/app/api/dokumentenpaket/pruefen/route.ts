/**
 * Vorpruefung eines Dokumentenpakets.
 *
 * POST /api/dokumentenpaket/pruefen
 *   Sagt vor dem Versand, was hinausgehen wuerde: leere Felder je Vorlage,
 *   Gesamtgroesse, Erreichbarkeit des PDF-Dienstes, ob die Mailvorlage die
 *   Nachricht kennt.
 *
 * Persistiert nichts und entschluesselt nichts — sensible Platzhalter zaehlen
 * hier als "wird beim Versand befuellt", nicht als leer. Die Bibliothek prueft
 * den Mandanten selbst; diese Route bleibt duenn.
 *
 * Berechtigung: HR_EDIT_ROLES + Mandant des Vorgangs.
 */
import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { pruefePaket, statusFuerFehler } from "@/lib/dokumentenpaket";
import { HR_EDIT_ROLES } from "@/lib/permissions";
import { pruefePaketSchema, type PruefePaket } from "@/lib/validations/dokumentenpaket";

export const POST = apiHandler<PruefePaket>(
  {
    roles: HR_EDIT_ROLES,
    bodySchema: pruefePaketSchema,
    logLabel: "Dokumentenpaket Vorpruefung",
  },
  async ({ body, session }) => {
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const ergebnis = await pruefePaket({
      modul: body.modul,
      refId: body.refId,
      positionen: body.positionen,
      empfaenger: body.empfaenger,
      session,
    });

    if (ergebnis.status === "FEHLER") {
      return NextResponse.json(
        { error: ergebnis.detail, fehler: ergebnis.fehler },
        { status: statusFuerFehler(ergebnis.fehler) },
      );
    }

    return NextResponse.json({ data: ergebnis.pruefung });
  },
);
