/**
 * API: /api/onboarding/:id/documents/:docId
 *
 * GET – Dokument herunterladen (nur HR-Team)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { asciiFilename } from "@/lib/file-upload";
import { readFile } from "fs/promises";
import path from "path";

// =============================================
// GET /api/onboarding/:id/documents/:docId
// =============================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    // Auth-Check
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    const { id, docId } = await params;

    // Dokument aus der Datenbank laden
    const document = await prisma.document.findUnique({
      where: { id: docId },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Dokument nicht gefunden" },
        { status: 404 }
      );
    }

    // Pruefen ob das Dokument zum Onboarding-Vorgang gehoert
    if (document.onboardingId !== id) {
      return NextResponse.json(
        { error: "Dokument gehoert nicht zu diesem Vorgang" },
        { status: 403 }
      );
    }

    // Path-Traversal-Schutz: Kein '../' im Dateipfad erlauben
    if (document.filePath.includes("../") || document.filePath.includes("..\\")) {
      console.error("Path-Traversal-Versuch erkannt:", document.filePath);
      return NextResponse.json(
        { error: "Ungültiger Dateipfad" },
        { status: 400 }
      );
    }

    // Datei von der Festplatte lesen
    const absolutePath = path.resolve(process.cwd(), document.filePath);

    // Zusaetzliche Sicherheitspruefung: Der aufgeloeste Pfad muss
    // innerhalb des Projektverzeichnisses (uploads/) liegen
    const uploadsDir = path.resolve(process.cwd(), "uploads");
    if (!absolutePath.startsWith(uploadsDir)) {
      console.error("Dateizugriff ausserhalb des Upload-Verzeichnisses:", absolutePath);
      return NextResponse.json(
        { error: "Ungültiger Dateipfad" },
        { status: 400 }
      );
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = await readFile(absolutePath);
    } catch {
      console.error("Datei nicht gefunden:", absolutePath);
      return NextResponse.json(
        { error: "Datei nicht gefunden auf dem Server" },
        { status: 404 }
      );
    }

    // Response mit korrekten Headers zurueckgeben
    // Buffer muss in Uint8Array umgewandelt werden für NextResponse-Kompatibilitaet
    //
    // Der Dateiname im Content-Disposition-Header laeuft ueber asciiFilename()
    // (@/lib/file-upload) - dieselbe Funktion wie beim BEM-Download und beim
    // Download erzeugter Brief-Dokumente.
    //
    // Vorher stand hier ein eigener Ausdruck,
    // `.replace(/[^a-zA-Z0-9._\- \u00C0-\u024F]/g, "_")`, der den Bereich
    // U+00C0-U+024F (Latin-1 Supplement und Latin Extended-A) ausdruecklich
    // stehen liess - also genau die Umlaute. Damit trug ein HTTP-Header
    // Nicht-ASCII-Zeichen: Der `filename`-Parameter vertraegt nach RFC 6266
    // nichts ausserhalb von ISO-8859-1, und Browser reagieren darauf
    // unterschiedlich bis gar nicht - mal kommt ein verstuemmelter Name an,
    // mal bricht der Download ab. Ein Nachweis heisst im Portal nun einmal
    // "Fuehrungszeugnis Mueller.pdf"; der Fall war also der Normalfall und
    // nicht die Ausnahme.
    //
    // Der ausgelieferte Name aendert sich dadurch sichtbar: Umlaute UND
    // Leerzeichen werden zu Unterstrichen ("Fuehrungszeugnis Mueller.pdf" ->
    // "F_hrungszeugnis_M_ller.pdf"). Das ist gewollt - ein lesbarer, aber
    // kaputt uebertragener Name ist schlechter als ein sperriger, der ankommt.
    // Der Name in der Oberflaeche bleibt unberuehrt: Er kommt aus
    // `document.fileName` und nicht aus diesem Header.
    //
    // Das nachgestellte `.replace(/"/g, "")` von frueher entfaellt ersatzlos.
    // asciiFilename ersetzt das Anfuehrungszeichen - wie jedes Zeichen
    // ausserhalb von \w, "-" und "." - durch einen Unterstrich; es kann den
    // gequoteten Parameter also nicht mehr verlassen. Dasselbe gilt fuer
    // Zeilenumbrueche, mit denen sich sonst ein zweiter Header einschmuggeln
    // liesse.
    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "Content-Type": document.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${asciiFilename(document.fileName)}"`,
        "Content-Length": fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("Fehler beim Herunterladen des Dokuments:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
