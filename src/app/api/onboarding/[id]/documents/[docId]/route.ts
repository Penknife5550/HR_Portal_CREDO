/**
 * API: /api/onboarding/:id/documents/:docId
 *
 * GET   – Dokument herunterladen (Portal-Rollen, nur im eigenen Mandanten)
 * PATCH – Ablaufdatum eines befristeten Nachweises setzen, aendern oder loeschen,
 *         oder ihn als unbefristet kennzeichnen (Paket 4, Z1)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessProcess, HR_EDIT_ROLES, PORTAL_ROLES } from "@/lib/permissions";
import {
  anzeigeNameBereinigen,
  asciiFilename,
  DOCX_MIME,
  ENDUNG_FUER_DATEITYP,
  pfadInWurzeln,
  type ErkannterDateityp,
} from "@/lib/file-upload";
import {
  ablaufKalendertag,
  istAbgelaufen,
  istFristpflichtig,
  pruefeGueltigBis,
} from "@/lib/dokument-fristen";
import { SENSIBLE_DOKUMENTTYPEN } from "@/lib/required-documents";
import { UNTERLAGEN_AUDIT } from "@/lib/unterlagen";
import { dokumentFristPatchSchema } from "@/lib/validations/unterlagen";
import { readFile } from "fs/promises";
import path from "path";

/** Derselbe Text fuer unbekannten Vorgang und fremden Mandanten — ein eigener verriete, dass es ihn gibt. */
const VORGANG_NICHT_GEFUNDEN = "Vorgang nicht gefunden";
/** Derselbe Text fuer unbekanntes Dokument und Dokument eines anderen Vorgangs. */
const DOKUMENT_NICHT_GEFUNDEN = "Dokument nicht gefunden";

/**
 * Die Endung des Download-Namens je gespeichertem Typ (Paket 4, 6.2). Nur
 * diese Typen nimmt das Onboarding an: die aus den Bytes erkannten
 * (`ENDUNG_FUER_DATEITYP` — Fragebogen und Nachforderung) und dazu Word, das
 * nur der Fragebogen zulaesst. Ein neuer erkannter Typ braucht hier keine
 * zweite Liste.
 */
const ENDUNG_AUS_TYP: Readonly<Record<string, string>> = {
  ...ENDUNG_FUER_DATEITYP,
  "application/msword": ".doc",
  [DOCX_MIME]: ".docx",
};

function istErkannterTyp(mimeType: string): mimeType is ErkannterDateityp {
  return Object.prototype.hasOwnProperty.call(ENDUNG_FUER_DATEITYP, mimeType);
}

/**
 * Der Name im Content-Disposition-Header: der gespeicherte Name, aber mit
 * der Endung AUS DEM TYP (6.2). Fuer die erkannten Typen dieselbe Regel wie
 * beim Anzeigenamen einer Nachforderung (`anzeigeNameBereinigen`: letzte
 * Endung weg, gleichwertige wie `.jpeg` nicht doppelt, Steuer- und
 * Bidi-Zeichen weg, leer → „Datei"). Word und unbekannte Typen nach derselben
 * Regel mit eigener Endung; ein unbekannter Typ bekommt ".bin" — nie eine
 * Endung, die Windows ausfuehrt.
 *
 * Warum: Der Fragebogen legt den Originalnamen ungeprueft in `fileName` ab
 * (`x.hta` mit JPEG-Bytes), und ein angenommener Nachweis traegt ihn als
 * Anzeigenamen weiter. Mit der Endung aus dem Namen landete eine
 * JPEG/HTA-Polyglot-Datei als `.hta` auf dem Rechner von HR.
 */
function downloadName(fileName: string, mimeType: string): string {
  if (istErkannterTyp(mimeType)) return asciiFilename(anzeigeNameBereinigen(fileName, mimeType));
  const endung = ENDUNG_AUS_TYP[mimeType] ?? ".bin";
  const basis = (fileName.split(/[/\\]/).pop() ?? "").trim();
  const punkt = basis.lastIndexOf(".");
  let stamm = punkt >= 0 ? basis.slice(0, punkt) : basis;
  if (stamm.toLowerCase().endsWith(endung)) stamm = stamm.slice(0, -endung.length);
  return asciiFilename(`${stamm.trim() || "Datei"}${endung}`);
}

// =============================================
// GET /api/onboarding/:id/documents/:docId
// =============================================
/**
 * Gehaertet mit Paket 4 (Feinplanung 6.2): Hierhin uebernimmt die
 * Nachforderung angenommene Nachweise nach Art. 9 und 10 DSGVO
 * (Masernschutz, SB-Ausweis, Fuehrungszeugnis, Aufenthaltsstatus).
 *
 *   - Nur Portal-Rollen: Der n8n-Schluessel meldet sich als SERVICE an
 *     (`getSession`), und SERVICE steht nicht in PORTAL_ROLES → 403.
 *   - Mandant ueber `canAccessProcess`; unbekannter Vorgang und fremder
 *     Mandant ergeben dieselbe 404, ebenso unbekanntes Dokument und Dokument
 *     eines anderen Vorgangs (frueher 403 mit eigenem Text — der verriet, dass
 *     es das Dokument gibt).
 *   - Gelesen wird nur unter `uploads/<onboardingId>` (`pfadInWurzeln`:
 *     realpath, Pfadgrenzen) — nie `uploads` als Ganzes, darunter liegen auch
 *     die BEM-Anlagen.
 *   - `Cache-Control: no-store`, Endung des Download-Namens aus dem Typ.
 *   - Oeffnen eines sensiblen Nachweises (`SENSIBLE_DOKUMENTTYPEN`) steht im
 *     Protokoll (`DOKUMENT_GEOEFFNET`, ohne Dateinamen). Ohne Eintrag keine Datei.
 */
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
    if (!PORTAL_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id, docId } = await params;

    const onboarding = await prisma.onboardingProcess.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    });
    if (!onboarding || !(await canAccessProcess(session, onboarding.organizationId))) {
      return NextResponse.json({ error: VORGANG_NICHT_GEFUNDEN }, { status: 404 });
    }

    // Die Bindung an den Vorgang steckt in der Abfrage selbst.
    const document = await prisma.document.findFirst({
      where: { id: docId, onboardingId: onboarding.id },
      select: { id: true, type: true, fileName: true, filePath: true, mimeType: true },
    });
    if (!document) {
      return NextResponse.json({ error: DOKUMENT_NICHT_GEFUNDEN }, { status: 404 });
    }

    // Nur unter dem Ordner DIESES Vorgangs — dort legen Fragebogen und
    // Nachforderung ab (uploads/<onboardingId>/…).
    let echterPfad: string;
    try {
      echterPfad = await pfadInWurzeln(path.resolve(process.cwd(), document.filePath), [
        path.join(process.cwd(), "uploads", onboarding.id),
      ]);
    } catch (fehler) {
      // realpath wirft ENOENT, wenn die Datei fehlt — alles andere heisst „ausserhalb".
      if ((fehler as { code?: unknown } | null)?.code === "ENOENT") {
        console.error("Datei zum Dokument fehlt:", document.id);
        return NextResponse.json({ error: "Datei nicht gefunden auf dem Server" }, { status: 404 });
      }
      console.error("Dateipfad ausserhalb des Vorgangsordners:", document.id);
      return NextResponse.json({ error: "Ungültiger Dateipfad" }, { status: 400 });
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = await readFile(echterPfad);
    } catch {
      console.error("Datei zum Dokument nicht lesbar:", document.id);
      return NextResponse.json(
        { error: "Datei nicht gefunden auf dem Server" },
        { status: 404 }
      );
    }

    if (SENSIBLE_DOKUMENTTYPEN.includes(document.type)) {
      await prisma.auditLog.create({
        data: {
          userId: session.userId,
          onboardingId: onboarding.id,
          processType: "ONBOARDING",
          action: UNTERLAGEN_AUDIT.DOKUMENT_GEOEFFNET,
          details: { documentId: document.id, dokumentTyp: document.type },
        },
      });
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
    //
    // Seit Paket 4 (6.2) kommt die ENDUNG aus dem gespeicherten Typ
    // (`downloadName`), und ein unbekannter Typ geht als
    // application/octet-stream hinaus. `no-store`: Personalunterlagen gehoeren
    // in keinen Browser- oder Proxy-Cache.
    const bekannt = Object.prototype.hasOwnProperty.call(ENDUNG_AUS_TYP, document.mimeType);
    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "Content-Type": bekannt ? document.mimeType : "application/octet-stream",
        "Content-Disposition": `attachment; filename="${downloadName(document.fileName, document.mimeType)}"`,
        "Content-Length": fileBuffer.length.toString(),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
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
 *   - EXPIRED wird zurueckgenommen, wenn das neue Datum nicht (mehr)
 *     abgelaufen ist (`istAbgelaufen`, dieselbe Ampel wie Anzeige und Lauf;
 *     ohne Datum ist nichts abgelaufen). Der Status davor ist nicht
 *     gespeichert (EXPIRED ueberschreibt ihn, siehe DocumentStatus in
 *     prisma/schema.prisma), lesbar ist nur, OB geprueft wurde: Traegt das
 *     Dokument `reviewedAt`, wird es APPROVED — das schreibt nur Paket 4, und
 *     zwar immer zusammen mit APPROVED beim Annehmen eines nachgeforderten
 *     Nachweises. Sonst UPLOADED; die Pruefung liegt dann wieder bei HR.
 *   - Ist das neue Datum selbst schon vorbei, bleibt der Status, wie er ist;
 *     EXPIRED setzt dann der naechste Lauf (die eine Stelle, die ihn setzt).
 *   - REJECTED bleibt unberuehrt: Die Ablehnung gilt dem Scan, nicht dem
 *     Datum. Die Ruecknahme trifft deshalb NUR EXPIRED — als Bedingung in der
 *     Abfrage (`updateMany … status: "EXPIRED"`), nicht nach dem vorher
 *     gelesenen Stand. Setzt der Lauf EXPIRED genau zwischen Lesen und
 *     Schreiben, wird es trotzdem zurueckgenommen.
 *
 * **„Unbefristet" (Paket 4, Z1).** `{ gueltigBis: null, unbefristet: true }`
 * kennzeichnet einen Nachweis als ausdruecklich unbefristet (etwa die
 * Niederlassungserlaubnis): Er verdraengt dann jedes datierte Dokument
 * derselben Art, und weder Warnbalken noch „Frist fehlt" bleiben stehen. Ein
 * gesetztes Datum nimmt das Kennzeichen zurueck, ebenso ein leeres Datum ohne
 * `unbefristet` („Frist noch nicht erfasst"). Datum UND Kennzeichen zugleich
 * sind ein Widerspruch (400). Auch ein Wechsel nur des Kennzeichens ist eine
 * echte Aenderung — mit Protokoll, geleertem Merker und Statusruecknahme.
 *
 * Im Protokoll steht kein Dateiname: Ein angenommener Nachweis traegt als
 * `fileName` den Anzeigenamen der Person, und der gehoert nie ins AuditLog
 * (Feinplanung Abschnitt 11). Die `documentId` genuegt.
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

    let roh: unknown;
    try {
      roh = await request.json();
    } catch {
      return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    }
    // Form und Widerspruch „Datum UND unbefristet" (Zod); das Datum selbst
    // prueft weiter pruefeGueltigBis, siehe unten.
    const eingabe = dokumentFristPatchSchema.safeParse(roh);
    if (!eingabe.success) {
      return NextResponse.json(
        { error: eingabe.error.errors[0]?.message || "Ungültige Anfrage." },
        { status: 400 }
      );
    }
    const koerper = eingabe.data;

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
      return NextResponse.json({ error: VORGANG_NICHT_GEFUNDEN }, { status: 404 });
    }
    if (!(await canAccessProcess(session, onboarding.organizationId))) {
      return NextResponse.json({ error: VORGANG_NICHT_GEFUNDEN }, { status: 404 });
    }

    const document = await prisma.document.findFirst({
      where: { id: docId, onboardingId: onboarding.id },
      select: { id: true, type: true, gueltigBis: true, unbefristet: true, status: true, reviewedAt: true },
    });
    if (!document) {
      return NextResponse.json(
        { error: DOKUMENT_NICHT_GEFUNDEN },
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
    // Datum UND Kennzeichen zugleich hat das Schema schon abgewiesen.
    const unbefristet = koerper.unbefristet === true;

    const vorher = ablaufKalendertag(document.gueltigBis);
    const nachher = ablaufKalendertag(frist.gueltigBis);
    const unbefristetVorher = document.unbefristet === true;
    if (vorher === nachher && unbefristetVorher === unbefristet) {
      // Nichts zu tun — und vor allem kein Protokolleintrag, der eine Aenderung
      // behauptet, die keine war.
      return NextResponse.json({
        id: document.id,
        type: document.type,
        gueltigBis: document.gueltigBis,
        unbefristet: unbefristetVorher,
        status: document.status,
      });
    }

    // Abgelaufen nach der NEUEN Frist? Dieselbe Rechnung wie Ampel und Lauf.
    const neuAbgelaufen = istAbgelaufen(frist.gueltigBis);
    // Geprueft war er, wenn `reviewedAt` steht — nur Paket 4 schreibt das,
    // immer zusammen mit APPROVED (Kopfkommentar).
    const statusNachher = document.reviewedAt ? "APPROVED" : "UPLOADED";

    // Aenderung und Protokoll in EINER Transaktion: Ein Nachweis, dessen Frist
    // sich ohne Spur verschiebt, ist genau der Zustand, den die Ampel
    // verhindern soll. Interaktiv, weil das Protokoll wissen muss, ob der
    // Status tatsaechlich zurueckgenommen wurde (Kopfkommentar).
    const aktualisiert = await prisma.$transaction(async (tx) => {
      const statusZurueck = neuAbgelaufen
        ? { count: 0 }
        : await tx.document.updateMany({
            where: { id: document.id, status: "EXPIRED" },
            data: { status: statusNachher },
          });

      const ergebnis = await tx.document.update({
        where: { id: document.id },
        data: {
          gueltigBis: frist.gueltigBis,
          unbefristet,
          // Neuer Zyklus fuer die neue Frist (Kopfkommentar).
          ablaufErinnertAm: null,
          ablaufErinnertStufe: null,
        },
        select: { id: true, type: true, gueltigBis: true, unbefristet: true, status: true },
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
            vorher,
            nachher,
            // Nur bei einem echten Wechsel des Kennzeichens bzw. des Status —
            // sonst stuende im Protokoll eine Aenderung, die keine war.
            ...(unbefristetVorher !== unbefristet
              ? { unbefristetVorher, unbefristetNachher: unbefristet }
              : {}),
            ...(statusZurueck.count > 0
              ? { statusVorher: "EXPIRED", statusNachher }
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
