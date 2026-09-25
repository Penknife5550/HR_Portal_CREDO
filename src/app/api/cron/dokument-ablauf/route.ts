/**
 * API: POST /api/cron/dokument-ablauf
 *
 * Taegliche Fristerinnerung fuer befristete Nachweise (Aufenthaltstitel,
 * Arbeitserlaubnis). Aufruf extern via n8n mit Bearer-CRON_SECRET, wie die
 * uebrigen Cron-Routen.
 *
 * ## Warum dieser Cron ueber DOKUMENTE laeuft und nicht ueber Vorgaenge
 *
 * Es gibt keinen "Aufenthaltstitel-Vorgang". Die Frist haengt am hochgeladenen
 * Papier (`Document.gueltigBis`), und ein Aufenthaltstitel laeuft typisch in
 * ein bis drei Jahren ab — der zugehoerige OnboardingProcess ist dann laengst
 * COMPLETED. Deshalb filtert die Abfrage BEWUSST NICHT nach Vorgangsstatus:
 * Das Risiko entsteht bei der BESCHAEFTIGUNG, und die laeuft weiter, wenn das
 * Onboarding abgeschlossen ist. Wer hier einen Statusfilter ergaenzt, schaltet
 * die Ueberwachung genau fuer den Regelfall ab.
 *
 * ## Empfaenger
 *
 * NUR das HR-Postfach (Entscheidung 07.09.2026). Beide Events stehen deshalb
 * mit `defaultRecipients.to: ""` im Katalog — die Adresse muss in der Vorlage
 * konfiguriert werden, sonst wird das Event uebersprungen und protokolliert.
 * Den neuen Titel besorgt zwar die beschaeftigte Person, aber das
 * Beschaeftigungsverbot trifft den Arbeitgeber; und der Magic Link der Person
 * ist zum Ablaufzeitpunkt regelmaessig tot.
 *
 * ## Staffelung (Entscheidung 07.09.2026)
 *
 * 90 / 42 / 14 Tage und ueberfaellig, mit abnehmenden Abstaenden — die
 * Schwellen und Intervalle stehen in `src/lib/dokument-fristen.ts` und werden
 * hier NICHT ein zweites Mal geschrieben. Der lange Vorlauf, weil eine
 * Verlaengerung bei der Auslaenderbehoerde Wochen bis Monate dauert.
 *
 * ## Warum nicht jeden Tag dieselbe Mail
 *
 * `Document.ablaufErinnertAm` + `ablaufErinnertStufe` sind der Merker. Erinnert
 * wird, wenn ENTWEDER die Stufe seit der letzten Erinnerung gewechselt hat
 * ODER das Intervall der aktuellen Stufe abgelaufen ist.
 *
 * Der Merker haelt bewusst die zuletzt VERSENDETE Stufe und nicht die Stufe von
 * gestern. Das ist der Unterschied, der einen Cron-Ausfall ueberlebt: Faellt
 * der Aufruf zwei Tage aus und springt die Stufe in dieser Zeit von BEOBACHTEN
 * auf KRITISCH, sieht der naechste Lauf immer noch "zuletzt erinnert:
 * BEOBACHTEN" und erinnert sofort. Auch das Intervall verschluckt nichts — die
 * Bedingung ist "mindestens so lange her", nicht "genau so lange her".
 *
 * Der Merker haengt am Mailergebnis — dieselbe Hausregel wie im
 * Erinnerungs-Cron (`/api/cron/reminders`, Entscheidung 09/2026):
 *
 *   SENT     Merker setzen, AuditLog DOKUMENT_ABLAUF_ERINNERT.
 *   SKIPPED  Merker TROTZDEM setzen, kein AuditLog. SKIPPED heisst: Vorlage
 *            deaktiviert oder fehlt, kein Empfaenger in der Vorlage — ein
 *            Versuch am naechsten Tag aendert daran nichts. Ohne Merker liefe
 *            die Erinnerung taeglich statt im Intervall der Stufe:
 *            `triggerWebhooks` feuert die DB-Webhooks unabhaengig vom
 *            Mailergebnis (wer die Vorlage abgeschaltet hat, weil n8n per
 *            Webhook erinnert, bekaeme jeden Tag dieselbe Meldung), und jeder
 *            Lauf schriebe je Dokument einen SKIPPED-Eintrag ins
 *            Versandprotokoll. Ist die Vorlage wieder eingerichtet, kommt die
 *            naechste Mail spaetestens beim naechsten Stufenwechsel oder nach
 *            dem Intervall.
 *   FAILED   (und `null`, falls der Dispatcher selbst scheitert) Merker NICHT
 *            setzen: Ein SMTP-Ausfall ist voruebergehend, der naechste Lauf
 *            versucht es erneut, statt die Erinnerung ein ganzes Intervall
 *            lang als erledigt zu fuehren.
 *
 * Aendert HR (oder die Person ueber den Magic Link) das Ablaufdatum, leert die
 * Schreibroute den Merker und nimmt ein EXPIRED zurueck, wenn die neue Frist
 * nicht abgelaufen ist — fuer die neue Frist beginnt ein neuer Zyklus
 * (PATCH /api/onboarding/[id]/documents/[docId]). Damit ein Lauf, der das
 * Dokument VOR dieser Aenderung gelesen hat, sie nicht mit dem alten Stand
 * ueberschreibt, schreibt er Status und Merker nur, solange `gueltigBis` noch
 * dem gelesenen Wert entspricht (bedingtes `updateMany`).
 *
 * ## Was am Ablauftag passiert
 *
 * Der Dokumentstatus wandert auf EXPIRED, damit eine gewoehnliche
 * Statusabfrage abgelaufene Nachweise findet. GESPERRT wird NICHTS
 * (Entscheidung 07.09.2026) — die Pruefung und die Entscheidung bleiben bei HR.
 *
 * ## Unbefristet (Paket 4, Z1)
 *
 * Liegt fuer Person und Art ein Dokument mit `unbefristet = true` vor (etwa die
 * Niederlassungserlaubnis nach einem abgelaufenen Titel), ist die Art erledigt
 * — dieselbe Regel wie `nachweisLagen` in der Vorgangsansicht. Der Lauf
 * mahnt dann nicht mehr; der alte Titel wird trotzdem als abgelaufen gefuehrt
 * (das Datum ist eine Tatsache). Ein abgelehnter Scan belegt auch hier nichts.
 *
 * ## Handlungsanweisung nur, wo das Portal sie anbietet (Paket 4, Z3)
 *
 * Beide Vorlagen verweisen HR auf „Unterlagen nachfordern" — aber nur, wenn
 * das fuer den Vorgang auch geht (`nachforderung_moeglich`). Weil der Lauf
 * nicht nach dem Vorgangsstatus filtert (siehe oben), mahnt er auch bei einem
 * EXPIRED-Vorgang und bei offenem Fragebogen; dort lehnt der Dienst die
 * Nachforderung ab (409). Die Mail nennt dann den Grund
 * (`nachforderung_gesperrt`, `nachforderung_hinweis`) aus derselben Regel wie
 * die Karte (`onboardingNachforderungGesperrt`). Welche Mails hinausgehen,
 * aendert sich dadurch nicht.
 *
 * ## Kein Dateiname in der Mail
 *
 * `dokument_datei` traegt seit Paket 4 KEINEN Dateinamen mehr: Ein
 * angenommener Nachweis hat als `fileName` den Namen, den die Person ihrer
 * Datei gab, und Anzeigenamen gehoeren weder in Mails noch in Webhooks
 * (Feinplanung Abschnitt 11). Die Variable bleibt fuer bestehende Vorlagen und
 * Webhook-Abnehmer — mit einer neutralen Bezeichnung (`dokumentBezeichnung`).
 * Auch die frei vergebene Bezeichnung einer Unterlage (`Document.bezeichnung`,
 * Freitext von HR) steht NICHT darin: Namen von Unterlagen gehoeren nicht in
 * die Payload von HR-Mails, die auch an Webhooks gehen (Abschnitt 11), und
 * `dokument_datei` wird im HTML-Teil nicht maskiert (`renderTemplate`).
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { triggerWebhooks } from "@/lib/webhooks";
import { getBaseUrl } from "@/lib/url";
import { documentTypeLabel } from "@/lib/required-documents";
import {
  ABLAUF_ERINNERUNG_INTERVALL_TAGE,
  ABLAUF_KATEGORIE_META,
  ABLAUF_SCHWELLEN_TAGE,
  FRISTPFLICHTIGE_DOKUMENTTYPEN,
  ablaufAmpel,
  ablaufKalendertag,
  kalendertagAlsDatum,
} from "@/lib/dokument-fristen";
import { berlinerKalendertag, formatiere, heuteInBerlin, tageSpaeter } from "@/lib/minijob-fristen";
import { MITARBEITER_NEUTRAL, mitarbeiterName } from "@/lib/onboarding-spuren";
import {
  ONBOARDING_NACHFORDERUNG_GESPERRT_MAIL,
  onboardingNachforderungGesperrt,
} from "@/lib/unterlagen-onboarding";
import type { EventEmailResult } from "@/lib/mailer";

const MS_PER_DAY = 86400000;

/**
 * `dokument_datei` ohne Dateinamen und ohne Freitext (Kopfkommentar): der Tag
 * des Hochladens in deutscher Zeit — „hochgeladen am 12.09.2026". Beide
 * Vorlagen setzen den Wert unter bzw. in Klammern hinter die Art
 * („Aufenthaltstitel (hochgeladen am 12.09.2026)"); ohne Datum die Art
 * selbst. Beides entsteht im Code — nichts davon kann Markup tragen.
 */
function dokumentBezeichnung(doc: { type: string; uploadedAt?: Date | string | null }): string {
  const hochgeladen = doc.uploadedAt ? new Date(doc.uploadedAt) : null;
  return hochgeladen && !Number.isNaN(hochgeladen.getTime())
    ? `hochgeladen am ${formatiere(berlinerKalendertag(hochgeladen))}`
    : documentTypeLabel(doc.type);
}

/**
 * Soll der Merker „zuletzt erinnert" gesetzt werden? Bei SENT und SKIPPED ja,
 * bei FAILED (oder ohne Ergebnis) nein — Begruendung im Kopfkommentar. Dieselbe
 * Regel wie `merkerSetzen` in /api/cron/reminders.
 */
function merkerSetzen(mail: EventEmailResult | null | undefined): boolean {
  return mail?.status === "SENT" || mail?.status === "SKIPPED";
}

/**
 * Wie lange nach dem Ablauf ueberhaupt noch erinnert wird.
 *
 * Ohne diese Grenze wuerde ein Nachweis, den niemand ersetzt, alle drei Tage
 * bis in alle Ewigkeit gemahnt — und eine Mail, die nie aufhoert, bringt
 * niemandem bei zu handeln, sondern nur, sie wegzufiltern. Danach faellt die
 * Warnung nicht weg: Der Vorgang bleibt im Portal rot markiert und der
 * Dokumentstatus bleibt EXPIRED, nur die automatische Mail schweigt.
 *
 * 180 Tage, weil die Verlaengerung bei der Auslaenderbehoerde in Wochen bis
 * Monaten gedacht wird — wer nach einem halben Jahr noch keinen neuen Titel
 * hat, hat kein Erinnerungs-, sondern ein Rechtsproblem.
 *
 * NICHT vom Nutzer entschieden — die Staffelung war es, das Ende nicht.
 */
const UEBERFAELLIG_ERINNERN_BIS_TAGE = 180;

/** Nachweis laeuft demnaechst ab (BEOBACHTEN / WARNUNG / KRITISCH). */
const EVENT_WARNUNG = "dokument-ablauf-warnung";
/** Nachweis ist abgelaufen. Eigenes Event, weil der Ton ein anderer ist. */
const EVENT_ABGELAUFEN = "dokument-abgelaufen";

/** Timing-Safe String-Vergleich (verhindert Timing-Attacken auf CRON_SECRET). */
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET nicht konfiguriert" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization") || "";
  if (!timingSafeCompare(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const now = new Date();
  // `uebersprungen` zaehlt wie bisher ALLE Zeilen ohne versendete Erinnerung
  // (nicht faellig, ueberholt, unzustaendig — und faellige, deren Mail nicht
  // hinausging). Die beiden neuen Zaehler schluesseln den letzten Fall auf,
  // ohne dass sich die Summe fuer bestehende n8n-Auswertungen aendert:
  //   nichtZugestellt  faellig, Mail FAILED — der naechste Lauf versucht es erneut
  //   mailUebersprungen faellig, Mail SKIPPED (Vorlage aus/kein Empfaenger) —
  //                     Merker gesetzt, naechster Versuch im Intervall der Stufe
  const results = {
    geprueft: 0,
    erinnerungen: 0,
    abgelaufenMarkiert: 0,
    uebersprungen: 0,
    nichtZugestellt: 0,
    mailUebersprungen: 0,
    fehler: 0,
  };

  try {
    const typen = [...FRISTPFLICHTIGE_DOKUMENTTYPEN];

    // -----------------------------------------------------------------
    // (1) Die spaeteste Frist je Person UND Dokumenttyp.
    //
    // Ein Document wird beim Nachreichen NICHT ersetzt, sondern ergaenzt —
    // mehrere Zeilen desselben Typs sind erlaubt. Ohne diesen Schritt mahnt
    // der Cron den alten, abgelaufenen Titel weiter, obwohl der neue laengst
    // im Portal liegt: eine Warnung, die niemand abstellen kann.
    //
    // Die Abfrage geht bewusst ueber ALLE Fristen und nicht nur ueber die des
    // Erinnerungshorizonts — der neue Titel gilt ja gerade bis weit in die
    // Zukunft und stuende sonst gar nicht zum Vergleich zur Verfuegung.
    // -----------------------------------------------------------------
    const juengste = await prisma.document.groupBy({
      by: ["onboardingId", "type"],
      where: {
        type: { in: typen },
        gueltigBis: { not: null },
        // Ein abgelehnter Scan belegt nichts und darf deshalb weder selbst
        // mahnen noch einen gueltigen Nachweis ueberholen.
        status: { not: "REJECTED" },
      },
      _max: { gueltigBis: true },
    });
    const spaetesteFrist = new Map<string, string>();
    for (const gruppe of juengste) {
      const tag = ablaufKalendertag(gruppe._max?.gueltigBis ?? null);
      if (tag) spaetesteFrist.set(`${gruppe.onboardingId}|${gruppe.type}`, tag);
    }

    // -----------------------------------------------------------------
    // (2) Die Kandidaten: Nachweise, deren Frist im Erinnerungshorizont liegt
    //     oder bereits vorbei ist. Der Horizont laeuft ueber den Index auf
    //     `gueltigBis` — alles Weitere waere AUSSERHALB und wuerde ohnehin
    //     nur gelesen, um sofort verworfen zu werden.
    // -----------------------------------------------------------------
    const horizont = kalendertagAlsDatum(
      tageSpaeter(heuteInBerlin(now), ABLAUF_SCHWELLEN_TAGE.BEOBACHTEN)
    );
    const dokumente = await prisma.document.findMany({
      where: {
        type: { in: typen },
        gueltigBis: { not: null, lte: horizont },
        status: { not: "REJECTED" },
      },
      select: {
        id: true,
        type: true,
        uploadedAt: true,
        status: true,
        gueltigBis: true,
        ablaufErinnertAm: true,
        ablaufErinnertStufe: true,
        onboardingId: true,
        onboarding: {
          select: {
            displayId: true,
            firstName: true,
            lastName: true,
            email: true,
            // Ob „Unterlagen nachfordern" fuer den Vorgang geht (Z3, Kopfkommentar).
            status: true,
            submittedAt: true,
            organization: { select: { name: true } },
            // Name aus dem Fragebogen zuerst (mitarbeiterName), sonst der
            // Name am Vorgang; `isComplete` fuer die Nachforderung (Altfall).
            personalData: { select: { firstName: true, lastName: true, isComplete: true } },
            // Z1: die Arten, fuer die ein ausdruecklich unbefristetes Dokument
            // vorliegt — dann mahnt der Lauf fuer diese Art nicht mehr.
            documents: {
              where: { type: { in: typen }, unbefristet: true, status: { not: "REJECTED" } },
              select: { type: true },
            },
          },
        },
      },
      orderBy: [{ gueltigBis: "asc" }, { id: "asc" }],
    });

    // Hoechstens EINE Erinnerung je Person und Dokumenttyp pro Lauf. Greift,
    // wenn zwei Zeilen desselben Typs dasselbe Datum tragen (Doppel-Upload) —
    // dann ueberholt keine die andere, und ohne diese Sperre gingen zwei
    // identische Mails hinaus.
    //
    // Der Schluessel wird BELEGT, sobald eine Zeile zustaendig ist (nach der
    // Ueberholt-Pruefung), und NICHT erst, wenn sie heute tatsaechlich mahnt.
    // Der Unterschied ist der ganze Zweck der Sperre: Wer seinen Aufenthaltstitel
    // als Vorder- und Rueckseite hochlaedt und beide Male dasselbe Ablaufdatum
    // eintraegt, hat zwei Zeilen mit demselben Schluessel. Belegte die erste den
    // Schluessel nur an den Tagen, an denen sie mahnt, liefe die zweite am
    // Folgetag in ihren eigenen Stufenwechsel — und ab da kaeme die Mahnung
    // dauerhaft doppelt, um einen Tag versetzt. Zustaendig ist deshalb immer die
    // erste nicht ueberholte Zeile; die Sortierung (gueltigBis asc, id asc) macht
    // das ueber die Laeufe hinweg stabil.
    const behandelt = new Set<string>();

    for (const doc of dokumente) {
      try {
        results.geprueft++;

        const tag = ablaufKalendertag(doc.gueltigBis);
        if (!tag) {
          // Unlesbares Datum: die Ampel schweigt (siehe dokument-fristen.ts).
          results.uebersprungen++;
          continue;
        }

        const ampel = ablaufAmpel(doc.gueltigBis, now);
        const kategorie = ampel.kategorie;
        if (!kategorie || kategorie === "AUSSERHALB") {
          results.uebersprungen++;
          continue;
        }
        const tage = ampel.tage ?? 0;

        // (a) Statusfortschreibung. Unabhaengig vom Mailversand: Der Ablauf ist
        //     eine Tatsache des Datums, kein Ergebnis der Zustellung. REJECTED
        //     ist schon in der Abfrage ausgeschlossen — sonst ueberschriebe
        //     EXPIRED die Ablehnungsentscheidung. Die Bedingung steht trotzdem
        //     noch einmal im WHERE, zusammen mit dem gelesenen Datum: Hat HR
        //     die Frist seit dem Lesen geaendert (und EXPIRED zurueckgenommen)
        //     oder den Scan abgelehnt, schreibt dieser Lauf nichts darueber.
        if (kategorie === "ABGELAUFEN" && doc.status !== "EXPIRED") {
          const markiert = await prisma.document.updateMany({
            where: {
              id: doc.id,
              gueltigBis: doc.gueltigBis,
              status: { notIn: ["EXPIRED", "REJECTED"] },
            },
            data: { status: "EXPIRED" },
          });
          if (markiert.count > 0) results.abgelaufenMarkiert++;
        }

        const schluessel = `${doc.onboardingId}|${doc.type}`;

        // (b) Ueberholt? Es gibt einen Nachweis desselben Typs mit spaeterer
        //     Frist — das Problem ist geloest, die Mahnung waere Rauschen.
        const spaeteste = spaetesteFrist.get(schluessel);
        if (spaeteste && spaeteste > tag) {
          results.uebersprungen++;
          continue;
        }
        // (b1) Unbefristet (Z1): Fuer Person und Art liegt ein ausdruecklich
        //      unbefristeter Nachweis vor — er verdraengt jedes datierte
        //      Dokument, wie in der Vorgangsansicht (`nachweisLagen`).
        if ((doc.onboarding.documents ?? []).some((d) => d.type === doc.type)) {
          results.uebersprungen++;
          continue;
        }

        // (b2) Zustaendigkeit belegen — VOR jeder weiteren Pruefung, siehe den
        //      Kommentar an `behandelt`. Ab hier schweigt jede weitere Zeile
        //      desselben Schluessels in diesem Lauf, unabhaengig davon, ob die
        //      zustaendige Zeile heute mahnt.
        if (behandelt.has(schluessel)) {
          results.uebersprungen++;
          continue;
        }
        behandelt.add(schluessel);

        // (c) Kappung der Ueberfaelligkeit (siehe Konstante oben).
        if (tage < -UEBERFAELLIG_ERINNERN_BIS_TAGE) {
          results.uebersprungen++;
          continue;
        }

        // (d) Faellig? Stufenwechsel ODER Intervall abgelaufen.
        const intervall = ABLAUF_ERINNERUNG_INTERVALL_TAGE[kategorie];
        if (intervall == null) {
          results.uebersprungen++;
          continue;
        }
        const stufenwechsel = doc.ablaufErinnertStufe !== kategorie;
        const tageSeitErinnerung = doc.ablaufErinnertAm
          ? (now.getTime() - new Date(doc.ablaufErinnertAm).getTime()) / MS_PER_DAY
          : Number.POSITIVE_INFINITY;
        if (!stufenwechsel && tageSeitErinnerung < intervall) {
          results.uebersprungen++;
          continue;
        }

        // Name aus Fragebogen oder Vorgang, sonst die neutrale Bezeichnung —
        // NIE die private E-Mail-Adresse der Person an seiner Stelle
        // (Datensparsamkeit, Art. 5 Abs. 1 lit. c DSGVO): `mitarbeiter_name`
        // steht im Betreff und in der Ueberschrift, der Betreff 90 Tage im
        // Versandprotokoll (`EmailLog.subject`). Die Adresse selbst bleibt
        // bewusst erhalten — als `mitarbeiter_email` im Payload (bestehende
        // Webhook-Abnehmer) und im Datenblock der Mail, wo HR sie zum
        // Nachfragen braucht; neu ist nur, dass sie nicht mehr an Stelle des
        // Namens auftaucht. MITARBEITER_NEUTRAL ist ein Akkusativ; die
        // Vorlagen setzen den Namen deshalb nur nach „für" (auch als Label
        // „Nachweis für"). Ausdruecklich gesetzt, nie leer — ein leerer Wert
        // fiele in `extractVariables` (mailer.ts) auf andere Payload-Felder
        // zurueck.
        const name = mitarbeiterName(doc.onboarding) ?? MITARBEITER_NEUTRAL;
        // Z3 nur, wo das Portal die Nachforderung anbietet (Kopfkommentar).
        const gesperrt = onboardingNachforderungGesperrt(doc.onboarding);

        // Die Adresse der beschaeftigten Person heisst hier bewusst
        // `mitarbeiter_email` und NICHT `email`: Der Mailer loest `{{email}}`
        // aus mehreren Payload-Feldern als Empfaenger auf. Traegt jemand
        // `{{email}}` in das An-Feld der Vorlage ein, soll daraus KEINE
        // Adresse werden (Ergebnis: SKIPPED mit Protokolleintrag) statt einer
        // internen Warnung an die betroffene Person selbst.
        const payload = {
          onboardingId: doc.onboardingId,
          displayId: doc.onboarding.displayId ?? "",
          documentId: doc.id,
          mitarbeiter_name: name,
          mitarbeiter_email: doc.onboarding.email,
          organization: doc.onboarding.organization.name,
          dokument_typ: documentTypeLabel(doc.type),
          // Nie der Dateiname (Kopfkommentar) — die Variable bleibt fuer
          // bestehende Vorlagen und Webhook-Abnehmer.
          dokument_datei: dokumentBezeichnung(doc),
          gueltig_bis: formatiere(tag),
          // Negativ nach dem Ablauf — die Warnvorlage nutzt diesen Wert, die
          // Ablaufvorlage `tage_ueberfaellig`. Beide Events tragen beide
          // Felder, damit der Payload nur an einer Stelle gebaut wird.
          tage_verbleibend: tage,
          tage_ueberfaellig: Math.max(0, -tage),
          dringlichkeit: ABLAUF_KATEGORIE_META[kategorie].label,
          frist_text: ampel.text,
          // Merker als Zeichenketten ("ja"/"") — renderTemplate kennt nur
          // „nicht leer" und keinen Negativ-Block, deshalb zwei Merker.
          nachforderung_moeglich: gesperrt ? "" : "ja",
          nachforderung_gesperrt: gesperrt ? "ja" : "",
          nachforderung_hinweis: gesperrt ? ONBOARDING_NACHFORDERUNG_GESPERRT_MAIL[gesperrt] : "",
          portalLink: `${getBaseUrl()}/dashboard/${doc.onboardingId}`,
        };

        // SMTP primaer ueber den Dispatcher — kein direktes sendEventEmail.
        const event = kategorie === "ABGELAUFEN" ? EVENT_ABGELAUFEN : EVENT_WARNUNG;
        const mailResult = await triggerWebhooks(event, payload);

        // Merker nur, solange das Datum noch das gelesene ist — sonst truege
        // eine gerade von HR geaenderte Frist den Merker der alten.
        const merkerSchreiben = () =>
          prisma.document.updateMany({
            where: { id: doc.id, gueltigBis: doc.gueltigBis },
            data: { ablaufErinnertAm: now, ablaufErinnertStufe: kategorie },
          });

        if (mailResult?.status !== "SENT") {
          // Merker bei SKIPPED ja, bei FAILED nein (Kopfkommentar). In beiden
          // Faellen kein AuditLog: Es ist keine Erinnerung angekommen.
          const skipped = merkerSetzen(mailResult);
          if (skipped) {
            await merkerSchreiben();
            results.mailUebersprungen++;
          } else {
            results.nichtZugestellt++;
          }
          console.warn(
            `[cron/dokument-ablauf] "${event}" fuer Dokument ${doc.id} nicht zugestellt ` +
              `(${mailResult?.status ?? "unbekannt"}${mailResult?.detail ? `: ${mailResult.detail}` : ""}) — ` +
              (skipped
                ? `naechster Versuch beim Stufenwechsel oder nach ` +
                  `${intervall} Tagen. Vorlage und Empfaenger unter ` +
                  `Einstellungen -> E-Mail-Versand pruefen.`
                : `wird beim naechsten Lauf erneut versucht.`)
          );
          results.uebersprungen++;
          continue;
        }

        // Merker und Protokoll in EINER Transaktion.
        await prisma.$transaction([
          merkerSchreiben(),
          prisma.auditLog.create({
            data: {
              onboardingId: doc.onboardingId,
              processType: "ONBOARDING",
              action: "DOKUMENT_ABLAUF_ERINNERT",
              details: {
                documentId: doc.id,
                dokumentTyp: doc.type,
                gueltigBis: tag,
                kategorie,
                tage,
                event,
              },
            },
          }),
        ]);
        results.erinnerungen++;
      } catch (err) {
        // Ein kaputtes Dokument darf den Lauf nicht anhalten — die uebrigen
        // Fristen sollen trotzdem erinnert werden.
        console.error(`[cron/dokument-ablauf] Fehler bei Dokument ${doc.id}:`, err);
        results.fehler++;
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      ...results,
    });
  } catch (error) {
    console.error("[cron/dokument-ablauf] Schwerer Fehler:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
