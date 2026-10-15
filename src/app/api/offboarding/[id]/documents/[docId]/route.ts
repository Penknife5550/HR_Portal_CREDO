/**
 * API: /api/offboarding/:id/documents/:docId
 *
 * GET – Dokument herunterladen (PORTAL_ROLES, nur im eigenen Mandanten)
 *
 * Gehaertet wie die Schwesterroute /api/onboarding/:id/documents/:docId
 * (Paket 4, 6.2) — hier liegen Kuendigungsschreiben, Aufhebungsvertraege,
 * Abfindungsvereinbarungen und Zeugnisse:
 *
 *   - Nur Portal-Rollen: Der n8n-Schluessel meldet sich als SERVICE an
 *     (`getSession`), und SERVICE steht nicht in PORTAL_ROLES → 403.
 *   - Mandant ueber `canAccessProcess`; unbekannter Vorgang und fremder
 *     Mandant ergeben dieselbe 404, ebenso unbekanntes Dokument und Dokument
 *     eines anderen Vorgangs (frueher 403 mit eigenem Text — der verriet, dass
 *     es das Dokument gibt).
 *   - Gelesen wird nur unter `uploads/offboarding/<offboardingId>`
 *     (`pfadInWurzeln`: realpath, Pfadgrenzen) — nie `uploads` als Ganzes,
 *     darunter liegen auch die BEM-Anlagen. Dorthin legt der Upload
 *     (POST …/documents) jede Datei, eine andere Quelle fuer
 *     `offboardingDocument` gibt es nicht.
 *   - `Cache-Control: no-store`, `nosniff`; Typ und Endung des Download-Namens
 *     aus dem gespeicherten Typ, ein unbekannter geht als
 *     application/octet-stream mit `.bin` hinaus.
 */

import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import {
  anzeigeNameBereinigen,
  asciiFilename,
  fehlerCode,
  istErkannterDateityp,
  pfadInWurzeln,
} from "@/lib/file-upload";
import { PORTAL_ROLES } from "@/lib/permissions";
import { nichtGefunden, offboardingZugaenglich } from "@/lib/offboarding-zugriff";

/** Derselbe Text fuer unbekanntes Dokument und Dokument eines anderen Vorgangs. */
const DOKUMENT_NICHT_GEFUNDEN = "Dokument nicht gefunden";

/**
 * Der Name im Content-Disposition-Header.
 *
 * Laeuft ueber asciiFilename() (@/lib/file-upload) — dieselbe Funktion wie
 * beim Onboarding-, BEM- und Brief-Download. Der `filename`-Parameter
 * vertraegt nach RFC 6266 nichts ausserhalb von ISO-8859-1; Umlaute und
 * Leerzeichen werden deshalb zu Unterstrichen („Kündigung Müller.pdf" →
 * „K_ndigung_M_ller.pdf"). Ein lesbarer, aber kaputt uebertragener Name ist
 * schlechter als ein sperriger, der ankommt; der Name in der Oberflaeche kommt
 * aus `fileName` und bleibt unberuehrt. Anfuehrungszeichen und Zeilenumbrueche
 * koennen den gequoteten Parameter so nicht verlassen.
 *
 * Die ENDUNG kommt aus dem gespeicherten Typ (`anzeigeNameBereinigen`), nie aus
 * dem hochgeladenen Namen — eine Datei `x.hta` mit PDF-Bytes kommt als `x.pdf`
 * an. Ein unbekannter Typ bekommt `.bin`.
 */
function downloadName(fileName: string, mimeType: string | null): string {
  if (istErkannterDateityp(mimeType)) return asciiFilename(anzeigeNameBereinigen(fileName, mimeType));
  const basis = (fileName.split(/[/\\]/).pop() ?? "").trim();
  const punkt = basis.lastIndexOf(".");
  const stamm = (punkt >= 0 ? basis.slice(0, punkt) : basis).trim();
  return asciiFilename(`${stamm || "Datei"}.bin`);
}

// =============================================
// GET /api/offboarding/:id/documents/:docId
// =============================================
export const GET = apiHandler(
  { roles: PORTAL_ROLES, logLabel: "Offboarding/Dokument-Download" },
  async ({ params, session }) => {
    const { id, docId } = params;
    if (!(await offboardingZugaenglich(session!, id))) return nichtGefunden();

    // Die Bindung an den Vorgang steckt in der Abfrage selbst.
    const document = await prisma.offboardingDocument.findFirst({
      where: { id: docId, offboardingId: id },
      select: { id: true, fileName: true, filePath: true, mimeType: true },
    });
    if (!document) return nichtGefunden(DOKUMENT_NICHT_GEFUNDEN);

    // Nur unter dem Ordner DIESES Vorgangs.
    let echterPfad: string;
    try {
      echterPfad = await pfadInWurzeln(path.resolve(process.cwd(), document.filePath), [
        path.join(process.cwd(), "uploads", "offboarding", id),
      ]);
    } catch (fehler) {
      // realpath wirft ENOENT, wenn die Datei fehlt — alles andere heisst „ausserhalb".
      if (fehlerCode(fehler) === "ENOENT") {
        console.error("Datei zum Offboarding-Dokument fehlt:", document.id);
        return NextResponse.json({ error: "Datei nicht gefunden auf dem Server" }, { status: 404 });
      }
      console.error("Dateipfad ausserhalb des Vorgangsordners:", document.id);
      return NextResponse.json({ error: "Ungültiger Dateipfad" }, { status: 400 });
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = await readFile(echterPfad);
    } catch {
      console.error("Datei zum Offboarding-Dokument nicht lesbar:", document.id);
      return NextResponse.json({ error: "Datei nicht gefunden auf dem Server" }, { status: 404 });
    }

    const bekannt = istErkannterDateityp(document.mimeType);
    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "Content-Type": bekannt ? document.mimeType! : "application/octet-stream",
        "Content-Disposition": `attachment; filename="${downloadName(document.fileName, document.mimeType)}"`,
        "Content-Length": fileBuffer.length.toString(),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
);
