/**
 * Zeitplaner — einen Lauf ausfuehren (Server).
 *
 * EINE Tuer fuer alle Ausloeser: Takt des Zeitplaners, Knopf „Jetzt
 * ausführen“ unter Einstellungen → Automatische Läufe und die duennen
 * Cron-Routen (Handaufruf mit CRON_SECRET). So gelten fuer alle dieselbe
 * Sperre, derselbe Tagesmerker und dasselbe Protokoll.
 *
 * Ablauf:
 *  1. Anspruch in der Datenbank (bedingtes `updateMany` auf die Zeile des
 *     Laufs): frei (`laeuftSeit` leer oder aelter als 2 h) und — nur beim
 *     Zeitplan — heute noch nicht erledigt. 0 Treffer → nicht starten
 *     (Knopf/Route: 409). Traegt auch ueber einen Neustart mitten im Lauf und
 *     waere bei zwei Containern richtig; die prozesslokalen Sperren der
 *     einzelnen Laeufe (etwa Unterlagen) bleiben zusaetzlich bestehen.
 *     Ein echter Lauf (kein Probelauf) setzt `tagErledigt` auf heute — der
 *     Zeitplan startet ihn dann heute nicht noch einmal.
 *  2. Protokollzeile `LAEUFT` — im Anspruch, damit die Oberflaeche sofort
 *     „läuft“ zeigt.
 *  3. Lauf-Funktion (src/lib/laeufe/*), Auswertung (bericht.ts), Berichtsmail
 *     ueber den Dispatcher (nur bei Problemen, im Probelauf, bei Fehlern und —
 *     wenn eingestellt — nach versendeten Mails).
 *  4. Protokoll abschliessen, Sperre freigeben (im `finally`, bedingt auf den
 *     eigenen Zeitstempel: eine verwaiste, inzwischen neu beanspruchte Sperre
 *     bleibt unberuehrt).
 *
 * Wirft nie; Fehler landen als Kennung (fehlerKennung) im Protokoll.
 */

import { prisma } from "@/lib/db";
import { triggerWebhooks } from "@/lib/webhooks";
import { getBaseUrl } from "@/lib/url";
import { fehlerKennung } from "@/lib/fehler-kennung";
import { formatKalendertag } from "@/lib/kalendertag";
import type { LaufErgebnis, LaufOptionen } from "@/lib/laeufe/lauf-ergebnis";
import { onboardingErinnerungenLauf } from "@/lib/laeufe/onboarding-erinnerungen";
import { offboardingErinnerungenLauf } from "@/lib/laeufe/offboarding-erinnerungen";
import { dokumentAblaufLauf } from "@/lib/laeufe/dokument-ablauf";
import { verbeamtungFristenLauf } from "@/lib/laeufe/verbeamtung-fristen";
import { vertragsendeErinnerungenLauf } from "@/lib/laeufe/vertragsende-erinnerungen";
import { elternzeitFristenLauf } from "@/lib/laeufe/elternzeit-fristen";
import { bemFristenLauf } from "@/lib/laeufe/bem-fristen";
import { bemAufbewahrungLauf } from "@/lib/laeufe/bem-aufbewahrung";
import { dokumenteAufbewahrungLauf } from "@/lib/laeufe/dokumente-aufbewahrung";
import { wartungLauf } from "@/lib/laeufe/wartung";
import { unterlagenFristenLauf } from "@/lib/unterlagen-lauf";
import { LAEUFE, SPERRE_VERWAIST_MS, laufDefinition, type LaufAusloeser, type LaufSchluessel } from "./katalog";
import { berlinerZeit } from "./faelligkeit";
import { MAX_SCHRITTE, berichtNoetig, berichtPayload, laufAuswerten } from "./bericht";

export type LaufFunktion = (opts: LaufOptionen) => Promise<LaufErgebnis>;

/** Welche Funktion ein Lauf ausfuehrt. Ein Test haelt diese Tabelle gegen LAEUFE. */
export const AUSFUEHRER: Record<LaufSchluessel, LaufFunktion> = {
  wartung: wartungLauf,
  "bem-aufbewahrung": bemAufbewahrungLauf,
  "dokumente-aufbewahrung": dokumenteAufbewahrungLauf,
  "unterlagen-fristen": unterlagenFristenLauf,
  "dokument-ablauf": dokumentAblaufLauf,
  reminders: onboardingErinnerungenLauf,
  "offboarding-reminders": offboardingErinnerungenLauf,
  "civil-service-deadlines": verbeamtungFristenLauf,
  "contract-end-reminders": vertragsendeErinnerungenLauf,
  "elternzeit-fristen": elternzeitFristenLauf,
  "bem-fristen": bemFristenLauf,
};

export const BERICHT_EVENT = "automatischer-lauf-bericht";

/** Fehlerkennung eines Laufs, der nie zu Ende kam (Neustart mitten im Lauf). */
export const ABGEBROCHEN = "ABGEBROCHEN";

export const ZEITPLANER_MELDUNGEN = {
  LAEUFT_BEREITS: "Dieser Lauf arbeitet gerade. Bitte warten, bis er fertig ist.",
  KEIN_PROBELAUF: "Dieser Lauf kann keinen Probelauf.",
  UNBEKANNT: "Unbekannter Lauf.",
} as const;

/**
 * Fehlende Zeilen anlegen — IMMER aus (siehe Schema). Vorhandene bleiben
 * unberuehrt; gepflegte Einstellungen werden nie ueberschrieben.
 */
export async function laeufeSicherstellen(): Promise<void> {
  await prisma.automatischerLauf.createMany({
    data: LAEUFE.map((l) => ({ schluessel: l.schluessel, uhrzeit: l.standardUhrzeit, aktiv: false })),
    skipDuplicates: true,
  });
}

/**
 * Alle Einstellungszeilen — legt fehlende nur an, wenn wirklich welche fehlen
 * (der Takt liest jede Minute; ein INSERT je Minute waere reine Last).
 */
export async function einstellungenLaden() {
  const zeilen = await prisma.automatischerLauf.findMany();
  if (zeilen.length >= LAEUFE.length) return zeilen;
  await laeufeSicherstellen();
  return prisma.automatischerLauf.findMany();
}

export interface Anspruch {
  schluessel: LaufSchluessel;
  ausloeser: LaufAusloeser;
  probelauf: boolean;
  /** Wert von `laeuftSeit` — die Freigabe ist bedingt darauf. */
  seit: Date;
  protokollId: string;
  berichtBeiErfolg: boolean;
  benutzerId: string | null;
}

/**
 * Schritt 1 und 2: Anspruch nehmen und Protokollzeile anlegen. `null`, wenn
 * der Lauf gerade arbeitet (oder beim Zeitplan: nicht mehr faellig / aus).
 */
export async function laufBeanspruchen(
  schluessel: LaufSchluessel,
  opts: { ausloeser: LaufAusloeser; probelauf?: boolean; benutzerId?: string | null; jetzt?: Date },
): Promise<Anspruch | null> {
  const jetzt = opts.jetzt ?? new Date();
  const heute = berlinerZeit(jetzt).tag;

  let einstellung = await prisma.automatischerLauf.findUnique({ where: { schluessel } });
  if (!einstellung) {
    await laeufeSicherstellen();
    einstellung = await prisma.automatischerLauf.findUnique({ where: { schluessel } });
  }
  if (!einstellung) return null;
  const def = laufDefinition(schluessel)!;
  // Zeitplan: Probelauf laut Einstellung; von Hand/Route: wie angefordert.
  const gewuenscht = opts.ausloeser === "ZEITPLAN" ? einstellung.probelauf : opts.probelauf === true;
  const probelauf = gewuenscht && def.kannProbelauf;

  const frei = { OR: [{ laeuftSeit: null }, { laeuftSeit: { lt: new Date(jetzt.getTime() - SPERRE_VERWAIST_MS) } }] };
  const nochOffen = { OR: [{ tagErledigt: null }, { tagErledigt: { lt: heute } }] };
  const where =
    opts.ausloeser === "ZEITPLAN" ? { schluessel, aktiv: true, AND: [frei, nochOffen] } : { schluessel, AND: [frei] };

  // Tagesmerker: Der Zeitplan erledigt seinen Tag IMMER — auch als Probelauf,
  // sonst startete ihn jeder Takt neu (jede Minute ein Lauf samt Berichtsmail).
  // Ein Probelauf von Hand oder ueber die Route zaehlt dagegen nicht als Tageslauf.
  const tagErledigen = opts.ausloeser === "ZEITPLAN" || !probelauf;
  const beansprucht = await prisma.automatischerLauf.updateMany({
    where,
    data: { laeuftSeit: jetzt, ...(tagErledigen ? { tagErledigt: heute } : {}) },
  });
  if (beansprucht.count === 0) return null;

  try {
    // Wer den Anspruch haelt, ist der einzige laufende Lauf dieses Schluessels.
    // Protokollzeilen, die noch auf LAEUFT stehen, stammen also von einem
    // abgebrochenen Lauf (Neustart mitten im Lauf) — sie werden geschlossen,
    // statt fuer immer „läuft“ zu zeigen.
    await prisma.automatischerLaufProtokoll.updateMany({
      where: { schluessel, ergebnis: "LAEUFT", gestartetAm: { lt: jetzt } },
      data: { ergebnis: "FEHLER", beendetAm: jetzt, fehler: ABGEBROCHEN },
    });
    const protokoll = await prisma.automatischerLaufProtokoll.create({
      data: {
        schluessel,
        ausloeser: opts.ausloeser,
        probelauf,
        gestartetAm: jetzt,
        benutzerId: opts.benutzerId ?? null,
      },
      select: { id: true },
    });
    return {
      schluessel,
      ausloeser: opts.ausloeser,
      probelauf,
      seit: jetzt,
      protokollId: protokoll.id,
      berichtBeiErfolg: einstellung.berichtBeiErfolg,
      benutzerId: opts.benutzerId ?? null,
    };
  } catch (fehler) {
    await sperreFreigeben(schluessel, jetzt);
    throw fehler;
  }
}

async function sperreFreigeben(schluessel: LaufSchluessel, seit: Date): Promise<void> {
  try {
    await prisma.automatischerLauf.updateMany({ where: { schluessel, laeuftSeit: seit }, data: { laeuftSeit: null } });
  } catch (fehler) {
    // Verwaist nach 2 h — der naechste Anspruch uebernimmt sie dann.
    console.error(`[Zeitplaner] Sperre ${schluessel} nicht freigegeben:`, fehlerKennung(fehler));
  }
}

/**
 * Schritt 3 und 4: Lauf ausfuehren, auswerten, berichten, protokollieren,
 * freigeben. Wirft nie. `funktion` ersetzt nur in Tests bzw. der Route die
 * Tabelle AUSFUEHRER.
 */
export async function laufDurchfuehren(anspruch: Anspruch, funktion?: LaufFunktion): Promise<LaufErgebnis> {
  const { schluessel, probelauf } = anspruch;
  const def = laufDefinition(schluessel)!;
  let ergebnis: LaufErgebnis;
  let fehler: string | null = null;
  try {
    try {
      ergebnis = await (funktion ?? AUSFUEHRER[schluessel])({ jetzt: anspruch.seit, dryRun: probelauf });
    } catch (err) {
      fehler = fehlerKennung(err);
      console.error(`[Zeitplaner] Lauf ${schluessel} abgebrochen:`, fehler);
      ergebnis = { status: 500, body: { error: "Interner Serverfehler" } };
    }

    const auswertung = laufAuswerten(schluessel, ergebnis.status, ergebnis.body, probelauf);

    let berichtMail: string | null = null;
    if (berichtNoetig(auswertung, { probelauf, berichtBeiErfolg: anspruch.berichtBeiErfolg })) {
      try {
        const smtp = await prisma.smtpConfig.findUnique({ where: { id: "default" }, select: { replyToEmail: true } });
        const zeit = berlinerZeit(anspruch.seit);
        const mail = await triggerWebhooks(
          BERICHT_EVENT,
          berichtPayload({
            definition: def,
            auswertung,
            probelauf,
            ausloeser: anspruch.ausloeser,
            datum: formatKalendertag(zeit.tag),
            uhrzeit: zeit.uhrzeit,
            portalLink: `${getBaseUrl()}/einstellungen?tab=laeufe&lauf=${schluessel}`,
            hrPostfach: smtp?.replyToEmail ?? "",
          }),
        );
        berichtMail = mail?.status ?? "FAILED";
      } catch (err) {
        berichtMail = "FAILED";
        console.error(`[Zeitplaner] Bericht ${schluessel} fehlgeschlagen:`, fehlerKennung(err));
      }
    }

    try {
      await prisma.automatischerLaufProtokoll.update({
        where: { id: anspruch.protokollId },
        data: {
          beendetAm: new Date(),
          ergebnis: auswertung.ergebnis,
          status: ergebnis.status,
          // JSON kennt kein undefined: das Rot-Kennzeichen immer ausschreiben.
          zaehler: auswertung.zaehler.map(([bezeichnung, wert, rot]) => [bezeichnung, wert, rot === true]),
          schritte: auswertung.schritte.slice(0, MAX_SCHRITTE),
          fehler,
          berichtMail,
        },
      });
    } catch (err) {
      console.error(`[Zeitplaner] Protokoll ${schluessel} nicht gespeichert:`, fehlerKennung(err));
    }
    return ergebnis;
  } finally {
    await sperreFreigeben(schluessel, anspruch.seit);
  }
}

/**
 * Lauf starten und im Hintergrund zu Ende fuehren (Takt und Knopf). Der
 * Anspruch wird abgewartet — so kann der Aufrufer 409 melden —, die Arbeit
 * selbst nicht.
 */
export async function laufImHintergrundStarten(
  schluessel: LaufSchluessel,
  opts: { ausloeser: LaufAusloeser; probelauf?: boolean; benutzerId?: string | null; jetzt?: Date },
): Promise<Anspruch | null> {
  const anspruch = await laufBeanspruchen(schluessel, opts);
  if (anspruch) {
    void laufDurchfuehren(anspruch).catch((err) =>
      console.error(`[Zeitplaner] Lauf ${schluessel}:`, fehlerKennung(err)),
    );
  }
  return anspruch;
}

/**
 * Handaufruf ueber eine Cron-Route (Bearer CRON_SECRET): gleicher Anspruch,
 * gleiches Protokoll, Antwort 1:1 wie frueher — oder 409, solange der Lauf
 * arbeitet. `funktion` ist die Lauf-Funktion der Route (dieselbe wie in
 * AUSFUEHRER; als Parameter, damit die Route-Tests sie direkt pruefen).
 */
export async function laufUeberRoute(
  schluessel: LaufSchluessel,
  opts: LaufOptionen,
  funktion: LaufFunktion,
): Promise<LaufErgebnis> {
  let anspruch: Anspruch | null;
  try {
    anspruch = await laufBeanspruchen(schluessel, { ausloeser: "ROUTE", probelauf: opts.dryRun === true, jetzt: opts.jetzt });
  } catch (err) {
    console.error(`[Zeitplaner] Anspruch ${schluessel} (Route):`, fehlerKennung(err));
    return { status: 500, body: { error: "Interner Serverfehler" } };
  }
  if (!anspruch) return { status: 409, body: { error: ZEITPLANER_MELDUNGEN.LAEUFT_BEREITS } };
  return laufDurchfuehren(anspruch, funktion);
}
