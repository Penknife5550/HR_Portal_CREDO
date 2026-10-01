/**
 * GET /api/individuelle-mail/anhaenge/[anhangId]
 *
 * HR oeffnet die Kopie eines Anhangs, die 12 Monate im Vorgang bleibt. Nur
 * HR_EDIT_ROLES und nur mit Zugriff auf den Mandanten des Vorgangs (sonst 404
 * mit demselben Text wie „unbekannt“). Jedes Oeffnen landet im AuditLog.
 *
 * Immer als Download (`attachment`), Typ aus der Datenbank (beim Versand aus
 * den Bytes erkannt), `no-store`, `nosniff` — die Datei kam von einem PC und
 * wird nie im Portal-Ursprung dargestellt.
 */
import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { HR_EDIT_ROLES } from "@/lib/permissions";
import { UUID_MUSTER, asciiFilename } from "@/lib/file-upload";
import { getClientIpOrNull } from "@/lib/rate-limit";
import { anhangLaden } from "@/lib/individuelle-mail-dienst";

export const GET = apiHandler(
  { roles: HR_EDIT_ROLES, logLabel: "Individuelle E-Mail Anhang" },
  async ({ request, session, params }) => {
    const anhangId = params.anhangId ?? "";
    if (!UUID_MUSTER.test(anhangId)) {
      return NextResponse.json({ error: "Der Anhang wurde nicht gefunden." }, { status: 404 });
    }
    const ergebnis = await anhangLaden({ anhangId, session: session!, ipAddress: getClientIpOrNull(request) });
    if (!ergebnis.ok) {
      return NextResponse.json({ error: ergebnis.meldung }, { status: 404 });
    }
    const { inhalt, mimeType, dateiname } = ergebnis.daten;
    return new NextResponse(new Uint8Array(inhalt), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(inhalt.length),
        "Content-Disposition": `attachment; filename="${asciiFilename(dateiname)}"; filename*=UTF-8''${encodeURIComponent(dateiname)}`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  },
);
