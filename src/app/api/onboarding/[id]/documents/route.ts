/**
 * API: /api/onboarding/:id/documents
 *
 * POST – unterschriebenes Uebergabeprotokoll hochladen (Ausstattung &
 *        Zugaenge, Stufe 2 – Feinplan A4, S34, G19). Multipart: `datei`
 *        (genau eine Datei) und `type` (in A4 nur `UEBERGABEPROTOKOLL`).
 *        Nur HR_EDIT_ROLES; Mandant per canAccessProcess.
 *
 * Der Spiegel von POST /api/offboarding/:id/documents (dort der
 * RUECKGABEPROTOKOLL-Weg), aber mit den Werkzeugen der oeffentlichen Uploads
 * (Paket 4) statt Endung und `file.type`:
 *
 *   - **Groesse vor dem Lesen.** `contentLengthZuGross` sagt 413, ohne ein Byte
 *     des Bodys anzufassen; danach liest `leseBodyBegrenzt` mitgezaehlt (auch
 *     ohne bzw. mit falschem `Content-Length`). Hoechstens 9 MB Rohbytes je
 *     Datei (`PROTOKOLL_MAX_BYTES`, wie die individuelle E-Mail): Die
 *     Middleware schneidet Portal-Bodys bei 10 MiB STILL ab, eine Datei von
 *     10 MB kaeme samt Multipart-Rahmen abgeschnitten an – als „kaputtes
 *     Formular" statt „zu gross". Die Offboarding-Route hat dieselbe Luecke;
 *     sie bleibt in A4 unveraendert (eigener kleiner Fix, Übergabe).
 *   - **Typ aus den Bytes** (`erkenneDateityp`, 415 bzw. 400 fuer ein
 *     abgeschnittenes PDF), Anzeigename `anzeigeNameBereinigen` (Endung =
 *     erkannter Typ). Der Speichername ist `<dokumentId>.<ext>` – der Name der
 *     Person gehoert weder in den Pfad noch ins Protokoll.
 *   - **Ablage nur unter `uploads/<onboardingId>/`** (`zielVerzeichnisPruefen`:
 *     UUID-Form, kein umgelenkter Ordner). Dort liest die Download-Route
 *     (`[docId]/route.ts`), und dort loescht der Lauf „Aufbewahrung erzeugter
 *     Dokumente“ das Protokoll mit der letzten Ausgabe (S35, G20).
 *   - **Eine Transaktion:** `Document` (Status APPROVED, `reviewedAt`/
 *     `reviewedById` = HR – HR selbst legt es ab, es gibt nichts zu pruefen)
 *     plus AuditLog `DOCUMENT_UPLOADED` (nur ID, Art, Groesse, Typ – kein
 *     Dateiname, wie im Offboarding). Scheitert sie, wird die gerade
 *     geschriebene Datei wieder entfernt.
 *
 * Reihenfolge der Antworten (Feinplan 1.6): 401/403 (apiHandler) → 413
 * (`Content-Length`, dann gezaehlt) → 400 (Formular, Datei, Art) → 404
 * (unbekannt ODER fremder Mandant, derselbe Text) → 415 (Typ aus den Bytes).
 * Erfolg: 201.
 *
 * Die Person sieht das Protokoll nie: Die oeffentliche Fragebogen-Route
 * liefert nur Dokumente der waehlbaren Typen (`SELECTABLE_DOCUMENT_TYPES`),
 * und `UEBERGABEPROTOKOLL` steht dort nicht.
 */

import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { writeFile } from "fs/promises";
import path from "path";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { canAccessProcess, HR_EDIT_ROLES } from "@/lib/permissions";
import {
  ENDUNG_FUER_DATEITYP,
  UUID_MUSTER,
  anzeigeNameBereinigen,
  contentLengthZuGross,
  dateiLoeschen,
  erkenneDateityp,
  leseBodyBegrenzt,
  zielVerzeichnisPruefen,
} from "@/lib/file-upload";
import {
  PROTOKOLL_MAX_ANFRAGE_BYTES,
  PROTOKOLL_UPLOAD_MELDUNGEN as M,
  PROTOKOLL_UPLOAD_TYP,
  protokollDateiGrund,
  protokollDateiGrundText,
} from "@/lib/ausgaben";
import { MELDUNGEN as ABTEILUNGS_MELDUNGEN } from "@/lib/abteilungsaufgaben";

const LOG_LABEL = "Onboarding/Dokumente";

function fehler(text: string, status: number) {
  return NextResponse.json({ error: text }, { status });
}

/** Wurzel aller Onboarding-Ablagen; geschrieben wird nur in `<wurzel>/<onboardingId>`. */
function uploadsWurzel(): string {
  return path.join(process.cwd(), "uploads");
}

// =============================================
// POST /api/onboarding/:id/documents
// =============================================
export const POST = apiHandler(
  { roles: HR_EDIT_ROLES, logLabel: LOG_LABEL },
  async ({ request, params, session }) => {
    // 413 VOR dem Lesen des Bodys – eine zu grosse Anfrage beschaeftigt weder
    // den Speicher noch die Datenbank.
    if (contentLengthZuGross(request, PROTOKOLL_MAX_ANFRAGE_BYTES)) {
      return fehler(M.ZU_GROSS, 413);
    }
    // Mitgezaehlt lesen: auch ohne bzw. mit zu kleinem `Content-Length`.
    const body = await leseBodyBegrenzt(request, PROTOKOLL_MAX_ANFRAGE_BYTES);
    if (!body.ok) {
      return body.status === 413 ? fehler(M.ZU_GROSS, 413) : fehler(M.ABGEBROCHEN, 400);
    }

    let form: FormData;
    try {
      form = await new Response(body.buffer, {
        headers: { "content-type": request.headers.get("content-type") ?? "" },
      }).formData();
    } catch {
      return fehler(M.FORMULAR, 400);
    }

    const dateien = form.getAll("datei");
    const datei = dateien.length === 1 ? dateien[0] : null;
    if (!datei || typeof datei === "string") return fehler(M.KEINE_DATEI, 400);

    const groessenGrund = protokollDateiGrund(datei.size);
    if (groessenGrund) {
      return fehler(protokollDateiGrundText(groessenGrund), groessenGrund === "ZU_GROSS" ? 413 : 400);
    }

    // In A4 genau eine Art – kein Rueckfall auf SONSTIGES wie im Fragebogen.
    if (form.get("type") !== PROTOKOLL_UPLOAD_TYP) return fehler(M.FALSCHE_ART, 400);

    // Unbekannt und fremder Mandant: dieselbe 404 mit demselben Text. Eine
    // ID ohne UUID-Form kann es nicht geben (`zielVerzeichnisPruefen`
    // verlangte sie ohnehin) – ohne Datenbankabfrage.
    const id = params.id ?? "";
    const onboarding = UUID_MUSTER.test(id)
      ? await prisma.onboardingProcess.findUnique({
          where: { id },
          select: { id: true, organizationId: true },
        })
      : null;
    if (!onboarding || !(await canAccessProcess(session!, onboarding.organizationId))) {
      return fehler(ABTEILUNGS_MELDUNGEN.ONBOARDING_VORGANG_NICHT_GEFUNDEN, 404);
    }

    // Typ allein aus den Bytes – nie aus `file.type` oder der Endung.
    const buffer = Buffer.from(await datei.arrayBuffer());
    const typ = erkenneDateityp(buffer);
    if (!typ.ok) {
      return typ.status === 415 ? fehler(M.TYP_NICHT_ERLAUBT, 415) : fehler(M.PDF_UNVOLLSTAENDIG, 400);
    }

    const dokumentId = randomUUID();
    const speichername = `${dokumentId}${ENDUNG_FUER_DATEITYP[typ.mimeType]}`;
    const relativ = `uploads/${onboarding.id}/${speichername}`;
    const verzeichnis = await zielVerzeichnisPruefen(uploadsWurzel(), onboarding.id);
    const absolut = path.join(verzeichnis, speichername);
    // `wx`: eine Dokument-ID gibt es nur einmal, nie ueberschreiben.
    await writeFile(absolut, buffer, { flag: "wx" });

    let dokument;
    try {
      dokument = await prisma.$transaction(async (tx) => {
        const jetzt = new Date();
        const neu = await tx.document.create({
          data: {
            id: dokumentId,
            onboardingId: onboarding.id,
            type: PROTOKOLL_UPLOAD_TYP,
            fileName: anzeigeNameBereinigen(datei.name, typ.mimeType),
            filePath: relativ,
            fileSize: buffer.length,
            mimeType: typ.mimeType,
            status: "APPROVED",
            reviewedAt: jetzt,
            reviewedById: session!.userId,
          },
          select: { id: true, fileName: true, fileSize: true, type: true, status: true, uploadedAt: true },
        });
        await tx.auditLog.create({
          data: {
            onboardingId: onboarding.id,
            userId: session!.userId,
            processType: "ONBOARDING",
            action: "DOCUMENT_UPLOADED",
            details: {
              documentId: neu.id,
              dokumentTyp: PROTOKOLL_UPLOAD_TYP,
              groesse: buffer.length,
              mimeType: typ.mimeType,
            },
          },
        });
        return neu;
      });
    } catch (dbFehler) {
      // Sonst laege die Datei ohne Zeile auf der Platte. Nur unter dem
      // (aufgeloesten) Ordner DIESES Vorgangs; `dateiLoeschen` wirft nie.
      await dateiLoeschen(absolut, [verzeichnis]);
      throw dbFehler;
    }

    return NextResponse.json(
      {
        id: dokument.id,
        fileName: dokument.fileName,
        fileSize: dokument.fileSize,
        type: dokument.type,
        status: dokument.status,
        uploadedAt: dokument.uploadedAt,
        meldung: M.ERFOLG,
      },
      { status: 201 },
    );
  },
);
