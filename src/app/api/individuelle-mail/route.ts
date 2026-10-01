/**
 * Individuelle E-Mail aus einem Vorgang (Paket 3).
 *
 * GET  /api/individuelle-mail?modul=&refId=
 *      Vorgang (Name, Nummer, Adressen), Freigabeliste, Antwortadresse und die
 *      bisher gesendeten E-Mails — alles, was Karte und Dialog brauchen.
 * POST /api/individuelle-mail   (multipart/form-data)
 *      Felder: modul, refId, dialogKennung (UUID), empfaenger, betreff,
 *      nachricht, dateien (0–10 Dateien, PDF/JPG/PNG/WebP, zusammen ≤ 9 MB)
 *
 * Duenn: Sitzung, Bremse, Formular lesen, EINE Dienstfunktion, Antwort 1:1.
 * Form der Felder: individuelleMailAnfrageSchema, Inhalt prueft der Dienst
 * (validations/individuelle-mail.ts). Regeln in src/lib/individuelle-mail.ts.
 *
 * Statuscodes: 400 Eingabe, 404 unbekannt ODER fremder Mandant (gleicher
 * Text), 409 Adresse nicht freigegeben / Vorlage aus / Versand laeuft,
 * 413 zu gross, 415 Dateityp, 429 Bremse (gemeinsam mit dem Dokumentenpaket),
 * 502 Mailserver.
 *
 * Berechtigung: HR_EDIT_ROLES + Mandant des Vorgangs.
 */
import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { HR_EDIT_ROLES } from "@/lib/permissions";
import { UUID_MUSTER, leseBodyBegrenzt } from "@/lib/file-upload";
import { getClientIpOrNull } from "@/lib/rate-limit";
import { versandBremsen } from "@/lib/versand-bremse";
import { mailSenden, uebersichtLaden, type HochgeladeneDatei } from "@/lib/individuelle-mail-dienst";
import { individuelleMailAnfrageSchema } from "@/lib/validations/individuelle-mail";
import {
  MAX_ANFRAGE_BYTES,
  MAX_ANHAENGE,
  MAX_ANHAENGE_BYTES,
  MELDUNGEN,
  statusFuerMailFehler,
} from "@/lib/individuelle-mail";

export const GET = apiHandler(
  { roles: HR_EDIT_ROLES, logLabel: "Individuelle E-Mail" },
  async ({ request, session }) => {
    const modul = request.nextUrl.searchParams.get("modul") ?? "";
    const refId = request.nextUrl.searchParams.get("refId") ?? "";
    if (!UUID_MUSTER.test(refId)) {
      return NextResponse.json({ error: MELDUNGEN.nichtGefunden }, { status: 404 });
    }
    const ergebnis = await uebersichtLaden({ modul, refId, session: session! });
    if (!ergebnis.ok) {
      return NextResponse.json({ error: ergebnis.meldung }, { status: statusFuerMailFehler(ergebnis.fehler) });
    }
    return NextResponse.json({ data: ergebnis.daten });
  },
);

function text(form: FormData, name: string): string {
  const wert = form.get(name);
  return typeof wert === "string" ? wert : "";
}

export const POST = apiHandler(
  { roles: HR_EDIT_ROLES, logLabel: "Individuelle E-Mail Versand" },
  async ({ request, session }) => {
    // Vor allem anderen — auch ein abgewiesener Versuch kostet ein Kontingent.
    const gebremst = versandBremsen(session!.userId);
    if (gebremst) return gebremst;

    // Begrenzt lesen, auch ohne Content-Length: Die Middleware schneidet den
    // Body bei 10 MiB still ab — ein kaputtes Formular hiesse dann „400“ statt
    // „zu gross“. leseBodyBegrenzt prueft den Kopf und zaehlt mit.
    const body = await leseBodyBegrenzt(request, MAX_ANFRAGE_BYTES);
    if (!body.ok) {
      return body.status === 413
        ? NextResponse.json({ error: MELDUNGEN.zuGross }, { status: 413 })
        : NextResponse.json({ error: "Die Übertragung wurde abgebrochen. Bitte erneut senden." }, { status: 400 });
    }

    let form: FormData;
    try {
      form = await new Response(body.buffer, {
        headers: { "content-type": request.headers.get("content-type") ?? "" },
      }).formData();
    } catch {
      return NextResponse.json({ error: "Das Formular konnte nicht gelesen werden." }, { status: 400 });
    }

    const anfrage = individuelleMailAnfrageSchema.safeParse({
      modul: text(form, "modul"),
      refId: text(form, "refId"),
      dialogKennung: text(form, "dialogKennung"),
    });
    if (!anfrage.success) {
      return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    }

    const eintraege = form.getAll("dateien").filter((d): d is File => typeof d !== "string");
    if (eintraege.length > MAX_ANHAENGE) {
      return NextResponse.json({ error: MELDUNGEN.zuVieleAnhaenge }, { status: 400 });
    }
    if (eintraege.reduce((s, d) => s + d.size, 0) > MAX_ANHAENGE_BYTES) {
      return NextResponse.json({ error: MELDUNGEN.zuGross }, { status: 413 });
    }
    const dateien: HochgeladeneDatei[] = [];
    for (const d of eintraege) {
      dateien.push({ name: d.name, inhalt: Buffer.from(await d.arrayBuffer()) });
    }

    const ergebnis = await mailSenden({
      ...anfrage.data,
      empfaenger: text(form, "empfaenger"),
      betreff: text(form, "betreff"),
      nachricht: text(form, "nachricht"),
      dateien,
      session: session!,
      ipAddress: getClientIpOrNull(request),
    });
    if (!ergebnis.ok) {
      return NextResponse.json(
        { error: ergebnis.meldung, fehler: ergebnis.fehler },
        { status: statusFuerMailFehler(ergebnis.fehler) },
      );
    }
    return NextResponse.json({ data: ergebnis.daten }, { status: ergebnis.daten.wiederholt ? 200 : 201 });
  },
);
