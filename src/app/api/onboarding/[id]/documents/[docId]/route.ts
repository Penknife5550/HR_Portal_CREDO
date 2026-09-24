/**
 * API: /api/onboarding/:id/documents/:docId
 *
 * GET   – Dokument herunterladen (nur HR-Team)
 * PATCH – Ablaufdatum eines befristeten Nachweises setzen, aendern oder loeschen
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessProcess, HR_EDIT_ROLES } from "@/lib/permissions";
import { asciiFilename } from "@/lib/file-upload";
import {
  ablaufKalendertag,
  istAbgelaufen,
  istFristpflichtig,
  pruefeGueltigBis,
} from "@/lib/dokument-fristen";
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

// =============================================
// PATCH /api/onboarding/:id/documents/:docId
// =============================================
/**
 * Warum HR dieses Feld schreiben koennen MUSS.
 *
 * `Document.gueltigBis` traegt die gesamte Fristenueberwachung: die Ampel an
 * der Dokumentenzeile, den Warnbalken am Vorgang und den naechtlichen
 * Erinnerungs-Cron (der auf `gueltigBis: { not: null }` filtert und einen
 * Nachweis ohne Datum deshalb nie sieht). Geschrieben werden konnte das Feld
 * bis hierher aber ausschliesslich ueber den Magic Link der beschaeftigten
 * Person — und der wird mit dem Absenden des Fragebogens ungueltig
 * (`validateMagicToken` ohne `allowSubmitted`).
 *
 * Damit war jeder Nachweis, der ohne Datum abgegeben wurde, dauerhaft
 * unueberwacht: Die Oberflaeche forderte HR an zwei Stellen woertlich auf, das
 * Ablaufdatum „nachzutragen" — und es gab im ganzen Portal keine Stelle, an der
 * das moeglich gewesen waere. Genauso wenig liess sich der Kreis schliessen,
 * fuer den der Cron gebaut ist: Die Erinnerung geht an HR, die Person schickt
 * den verlaengerten Titel, und die neue Frist konnte niemand eintragen.
 *
 * **Loeschen ist hier erlaubt, ueber den Magic Link nicht.** Dort waere ein
 * leeres Datum ein Klick, mit dem sich die Ablaufkontrolle stumm schalten
 * liesse, ohne dass es hinterher von „nie erfasst" zu unterscheiden waere. Hier
 * ist es die einzige Moeglichkeit, ein faelschlich eingetragenes Datum an einem
 * unbefristeten Titel (Niederlassungserlaubnis) wieder loszuwerden — und jede
 * Aenderung landet mitsamt altem und neuem Wert im AuditLog. Der Unterschied
 * ist also nicht Vertrauen, sondern die Spur.
 *
 * **Eine neue Frist beginnt von vorn** (Durchsicht 09/2026). Der naechtliche
 * Lauf (`/api/cron/dokument-ablauf`) schreibt zwei Dinge an das Dokument, die
 * am ALTEN Datum haengen: den Status EXPIRED und den Erinnerungs-Merker
 * (`ablaufErinnertAm`/`ablaufErinnertStufe`). Blieben beide stehen, truege ein
 * korrigierter Titel dauerhaft das Abzeichen „Abgelaufen" neben der gruenen
 * Ampel, und die erste Erinnerung zur neuen Frist wartete das Intervall der
 * alten Stufe ab. Deshalb gilt bei jeder ECHTEN Aenderung des Datums:
 *
 *   - Der Merker wird geleert — fuer die neue Frist beginnt ein neuer Zyklus.
 *   - EXPIRED wird zu UPLOADED, wenn das neue Datum nicht (mehr) abgelaufen ist
 *     (`istAbgelaufen`, dieselbe Ampel wie Anzeige und Lauf; ohne Datum ist
 *     nichts abgelaufen). UPLOADED und nicht „der Status davor", weil der nicht
 *     gespeichert ist (EXPIRED ueberschreibt ihn, siehe DocumentStatus in
 *     prisma/schema.prisma) — und weil das Onboarding einen Nachweis heute
 *     ohnehin nur als UPLOADED oder EXPIRED kennt. Die Pruefung liegt damit
 *     wieder bei HR.
 *   - Ist das neue Datum selbst schon vorbei, bleibt der Status, wie er ist;
 *     EXPIRED setzt dann der naechste Lauf (die eine Stelle, die ihn setzt).
 *   - REJECTED bleibt unberuehrt: Die Ablehnung gilt dem Scan, nicht dem
 *     Datum. Die Ruecknahme trifft deshalb NUR EXPIRED — als Bedingung in der
 *     Abfrage (`updateMany … status: "EXPIRED"`), nicht nach dem vorher
 *     gelesenen Stand. Setzt der Lauf EXPIRED genau zwischen Lesen und
 *     Schreiben, wird es trotzdem zurueckgenommen.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!HR_EDIT_ROLES.includes(session.role)) {
      return NextResponse.json(
        { error: "Keine Berechtigung zum Bearbeiten dieses Vorgangs" },
        { status: 403 }
      );
    }

    const { id, docId } = await params;

    let koerper: { gueltigBis?: unknown };
    try {
      koerper = await request.json();
    } catch {
      return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    }

    // Vorgang zuerst: Die Mandanten-Pruefung haengt an seiner Organisation, und
    // ohne sie saehe eine Sachbearbeitung mit eingeschraenktem Zugriff zwar
    // keinen fremden Vorgang, koennte aber ein Dokument daran aendern.
    const onboarding = await prisma.onboardingProcess.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    });
    // Gleicher Text wie beim fremden Mandanten weiter unten: Ein eigener
    // Statuscode fuer „gibt es, gehoert aber nicht dir" verriete genau das.
    if (!onboarding) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (!(await canAccessProcess(session, onboarding.organizationId))) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }

    const document = await prisma.document.findFirst({
      where: { id: docId, onboardingId: onboarding.id },
      select: { id: true, type: true, fileName: true, gueltigBis: true, status: true },
    });
    if (!document) {
      return NextResponse.json(
        { error: "Dokument nicht gefunden" },
        { status: 404 }
      );
    }

    // Ein Datum an einer Geburtsurkunde ist keine Angabe, sondern ein
    // Bedienfehler — und `pruefeGueltigBis` liesse den leeren Wert an JEDEM Typ
    // durch, wuerde die Ruecknahme hier also stillschweigend annehmen.
    if (!istFristpflichtig(document.type)) {
      return NextResponse.json(
        {
          error:
            "Ein Ablaufdatum wird nur beim Aufenthaltstitel und bei der " +
            "Arbeitserlaubnis erfasst.",
        },
        { status: 400 }
      );
    }

    const frist = pruefeGueltigBis(koerper.gueltigBis, document.type);
    if (!frist.ok) {
      return NextResponse.json({ error: frist.fehler }, { status: 400 });
    }

    const vorher = ablaufKalendertag(document.gueltigBis);
    const nachher = ablaufKalendertag(frist.gueltigBis);
    if (vorher === nachher) {
      // Nichts zu tun — und vor allem kein Protokolleintrag, der eine Aenderung
      // behauptet, die keine war.
      return NextResponse.json({
        id: document.id,
        type: document.type,
        gueltigBis: document.gueltigBis,
        status: document.status,
      });
    }

    // Abgelaufen nach der NEUEN Frist? Dieselbe Rechnung wie Ampel und Lauf.
    const neuAbgelaufen = istAbgelaufen(frist.gueltigBis);

    // Aenderung und Protokoll in EINER Transaktion: Ein Nachweis, dessen Frist
    // sich ohne Spur verschiebt, ist genau der Zustand, den die Ampel
    // verhindern soll. Interaktiv, weil das Protokoll wissen muss, ob der
    // Status tatsaechlich zurueckgenommen wurde (Kopfkommentar).
    const aktualisiert = await prisma.$transaction(async (tx) => {
      const statusZurueck = neuAbgelaufen
        ? { count: 0 }
        : await tx.document.updateMany({
            where: { id: document.id, status: "EXPIRED" },
            data: { status: "UPLOADED" },
          });

      const ergebnis = await tx.document.update({
        where: { id: document.id },
        data: {
          gueltigBis: frist.gueltigBis,
          // Neuer Zyklus fuer die neue Frist (Kopfkommentar).
          ablaufErinnertAm: null,
          ablaufErinnertStufe: null,
        },
        select: { id: true, type: true, gueltigBis: true, status: true },
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          onboardingId: onboarding.id,
          processType: "ONBOARDING",
          action: "DOKUMENT_FRIST_GEAENDERT",
          details: {
            documentId: document.id,
            dokumentTyp: document.type,
            dokumentDatei: document.fileName,
            vorher,
            nachher,
            // Nur bei einem echten Wechsel — sonst stuende im Protokoll eine
            // Statusaenderung, die keine war.
            ...(statusZurueck.count > 0
              ? { statusVorher: "EXPIRED", statusNachher: "UPLOADED" }
              : {}),
          },
        },
      });

      return ergebnis;
    });

    return NextResponse.json(aktualisiert);
  } catch (error) {
    console.error("Fehler beim Aendern des Ablaufdatums:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
