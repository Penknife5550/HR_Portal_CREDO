/**
 * CREDO HR-Portal – Unterlagen nachfordern: der taegliche Lauf (Paket 4, nur Server)
 *
 * `POST /api/cron/unterlagen-fristen[?dryRun=1]` ruft `unterlagenFristenLauf`.
 * WAS je Nachforderung zu tun ist, entscheidet die reine Planung
 * (`laufPlanen`, src/lib/unterlagen-fristen.ts); hier steht, WIE es geschieht
 * (Feinplanung docs/module/onboarding/paket4-feinplanung.md, Abschnitt 9):
 *
 *   1. **Laufsperre:** ein Flag im Speicher des Prozesses — ein zweiter
 *      gleichzeitiger Aufruf bekommt 409 (n8n, Retry, Handaufruf).
 *   2. **Kandidaten** — Faelligkeit steht IN der Abfrage, sortiert und in Seiten
 *      zu 500 (N3), damit ein Stapel nicht faelliger Zeilen nie faellige
 *      verdeckt:
 *        - alle LAUFENDEN Nachforderungen nach `angefordertAm`,
 *        - Nachforderungen mit faelligen Dateien (zurueckgewiesen/verworfen mit
 *          `loeschenAb <= jetzt`) oder faelligen Entwuerfen (Frist + 44 Tage
 *          erreicht), nach Faelligkeit,
 *        - Nachforderungen mit einem Ordner unter `uploads/unterlagen/` —
 *          dort koennen Waisen liegen, auch bei einer erledigten.
 *   3. **Je Kandidat:** die Sperre des Vorgangs nehmen (dieselbe wie die
 *      HR-Aktionen, `unterlagenSperreNehmen`); ist sie belegt, vormerken und
 *      am Ende EINMAL erneut versuchen — sonst fiele eine Fristtag-Erinnerung
 *      endgueltig aus. Dann frisch lesen, Mails ohne Ergebnis klaeren
 *      (`ergebnisseKlaeren`, siehe 5.), planen, handeln, im `finally`
 *      freigeben. Ein Fehler in einem Schritt zaehlt als `errors` und haelt
 *      weder die uebrigen Schritte noch den Lauf an.
 *   4. **Mails** (nie bei einem eingestellten Vorgang, EP-3): an die Person
 *      hoechstens EINE je Nachforderung und Lauf. Link vor dem Versand — in
 *      einer Transaktion unter der Sperre von Vorgang (bei EXPIRED kein Link,
 *      keine Mail) und Nachforderung (bedingt auf die gelesene Frist); mit
 *      `erstelltVonId: null` (Spur fuer den Lauf-Waechter, zaehlt nicht in die
 *      Mail-Bremse von HR). Die Mail nur ueber `sendEventEmail` mit
 *      `overrideTo`, nie ueber `triggerWebhooks` (der Link ist ein Zugang zur
 *      Personalakte, 8.1).
 *   5. **Merker** bei SENT und SKIPPED, nie bei FAILED; Merker und Protokoll
 *      im selben Commit wie das Ergebnis, bedingt auf den gelesenen Fristwert
 *      (bzw. `vollstaendigSeit` im bedingten Anspruch). So ueberschreibt der
 *      Lauf keine Friständerung. Ist die Mail versendet, aber das Speichern
 *      scheitert auch im zweiten Versuch (N2), zaehlt sie als zugestellt UND
 *      als `errors` (Status NACHWEIS_FEHLT) — dann fehlt der Merker, und der
 *      naechste Lauf schickte dieselbe Mail noch einmal; n8n meldet das HR.
 *      Ein Link, der seit ueber einer Stunde auf AUSSTEHEND steht, bekommt
 *      VOR der Planung sein Ergebnis aus dem Versandprotokoll (`EmailLog`,
 *      SENT fuer dasselbe Ereignis an dieselbe Adresse): So schickt der Lauf
 *      eine Mail, bei der nur das Speichern scheiterte (N2, auch nach einer
 *      HR-Aktion mit „bitte nicht erneut senden"), nicht noch einmal. Ohne
 *      Protokolleintrag gilt sie als nicht zugestellt (FAILED „kein
 *      Ergebnis"): Ein nachholbarer Anlass wird nachgeholt, und auch eine
 *      Erinnerung steht nicht mehr fuer immer auf „wird gesendet".
 *      Holt der Lauf eine „Link erneut senden"-Mail mit „frühere Links
 *      sperren" nach, sperrt er die frueheren Links im selben Commit (5.1).
 *   6. **SMTP-Bremse:** Nach drei FAILED in Folge geht keine Mail mehr hinaus
 *      (jede kann um die 40 s dauern). Der Rest zaehlt als `nichtZugestellt`,
 *      das Aufraeumen laeuft weiter.
 *   7. **Aufraeumen** (4.5): Entwuerfe — erst bedingt die Zeile, dann die
 *      Datei (ein gleichzeitiges Uebermitteln gewinnt). Zurueckgewiesene und
 *      verworfene Dateien — erst die Datei, dann `dateiGeloeschtAm`, nur bei
 *      „geloescht" oder „fehlte" (`fehler` versucht der naechste Lauf erneut).
 *      Waisen in beiden Ordnern (unter `uploads/unterlagen/<nf>` erst ab 24 h,
 *      im Vorgangsordner nur Dateien mit einer Datei-ID dieser Nachforderung,
 *      auf die kein Dokument zeigt), dazu verwaiste Nachforderungsordner.
 *      Laesst sich `uploads/unterlagen/` nicht lesen, zaehlt das als `errors`,
 *      der Lauf geht weiter — und raeumt KEINE verwaisten Ordner ab: Ohne die
 *      Liste der Ordner mit Nachforderung saehe jeder Ordner verwaist aus.
 *   8. **Probelauf** (`dryRun`): dieselbe Planung, aber ohne Mail, ohne Link,
 *      ohne Schreibzugriff, ohne Loeschung und ohne Sperre. Die Antwort hat
 *      dieselbe Form, `dryRun: true`, jede geplante Mail mit Status GEPLANT.
 *
 * **Zwei Uhren.** Stichtag und Planung rechnen mit dem Start des Laufs
 * (`jetzt`, `heute`) — so sieht jede Nachforderung denselben Tag. Was der
 * Lauf SCHREIBT (Link, Versandzeit, Sperren, Loeschung), traegt dagegen die
 * Zeit des Schreibens (`zeitstempel`): Legt HR waehrend des Laufs einen Link
 * an, stuende der des Laufs sonst davor, und „die juengste Mail zaehlt"
 * holte am naechsten Tag eine zugestellte Mail noch einmal nach.
 *
 * Die Antwort traegt keine Personendaten — n8n speichert Ausfuehrungsdaten:
 * nur Zaehler und je Aktion Nachforderungs-ID, Modul, Schritt, Anlass, Status.
 * Die Konsole bekommt nur ein Praefix, IDs und `fehlerKennung`.
 *
 * Laufsperre, Prozesssperre und SMTP-Bremse leben im Speicher des Prozesses
 * und tragen nur bei EINEM Container (CL:251); die Zustaende sichert die
 * Datenbank ueber die bedingten Schreibzugriffe trotzdem.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fehlerKennung } from "@/lib/fehler-kennung";
import { deleteUploadedDirIfEmpty } from "@/lib/file-upload";
import { ablaufKalendertag, heuteInBerlin, kalendertagAlsDatum, type Kalendertag } from "@/lib/kalendertag";
import {
  AUSSTEHEND_NACHHOLEN_MINUTEN,
  MELDUNGEN,
  SMTP_BREMSE_FEHLER_IN_FOLGE,
  UNTERLAGEN_AUDIT,
  WAISEN_MIN_ALTER_STUNDEN,
  linkGueltigBisFuer,
  nachforderungLinkende,
  type LinkAnlass,
  type MailStatus,
  type UnterlagenMailErgebnis,
} from "@/lib/unterlagen";
import {
  nachforderungsDateiLoeschen,
  nachforderungsOrdnerIds,
  nachforderungsWaisen,
  nachforderungsWurzel,
  verwaisteNachforderungsOrdner,
  vorgangsKopieLoeschen,
  vorgangsWaisen,
} from "@/lib/unterlagen-dateien";
import {
  BEZUG_AUSWAHL,
  fruehereLinksSperrenIn,
  hrMeldungSenden,
  hrVollstaendigMelden,
  linkAnlegen,
  mailPosition,
  mailVorgang,
  personenMailSenden,
  personenVorlagePruefen,
  unterlagenBaustein,
  unterlagenLaufZurueckziehen,
  unterlagenLinkUrl,
  unterlagenSperreFreigeben,
  unterlagenSperreNehmen,
  type PersonenMailMerker,
  type UnterlagenModulBaustein,
  type UnterlagenPersonenEvent,
  type UnterlagenVorgang,
} from "@/lib/unterlagen-dienst";
import {
  entwurfFaelligBisFrist,
  erinnerungsAnlass,
  laufPlanen,
  type AufraeumKandidaten,
  type ErinnerungsPlan,
  type NachholPlan,
} from "@/lib/unterlagen-fristen";
import {
  UNTERLAGEN_EVENTS,
  aufforderungMailFelder,
  personenEventFuerAnlass,
  erinnerungMailFelder,
  fristVerstrichenMailFelder,
  zurueckweisungMailFelder,
} from "@/lib/unterlagen-mail";
import { getBaseUrl } from "@/lib/url";

// =============================================
// Antwort (ohne Personendaten)
// =============================================

export type LaufSchritt =
  | "LESEN"
  /** Ein Link stand seit ueber einer Stunde auf AUSSTEHEND (`ergebnisseKlaeren`). */
  | "ERGEBNIS"
  | "ZURUECKZIEHEN"
  | "VOLLSTAENDIG"
  | "NACHHOLEN"
  | "ERINNERUNG"
  | "FRIST_VERSTRICHEN"
  | "AUFRAEUMEN"
  | "SPERRE";

/**
 * SENT/SKIPPED/FAILED — Ergebnis einer Mail; beim Schritt ERGEBNIS das
 * nachgetragene Ergebnis eines haengenden Links (SENT laut Versandprotokoll,
 * sonst FAILED). NACHWEIS_FEHLT — versendet, aber
 * Ergebnis, Merker und Protokoll nicht gespeichert (N2): zaehlt als zugestellt
 * UND in `errors`, bitte nicht erneut senden. GEBREMST — wegen der
 * SMTP-Bremse nicht versucht. GEPLANT — Probelauf. ERLEDIGT — Zurueckziehen
 * (Z2). UEBERSPRUNGEN — Vorgang auch im zweiten Versuch gesperrt, oder der
 * Stand aenderte sich zwischen Lesen und Schreiben. FEHLER — zaehlt in `errors`.
 */
export type LaufDetailStatus =
  | "SENT"
  | "SKIPPED"
  | "FAILED"
  | "NACHWEIS_FEHLT"
  | "GEBREMST"
  | "GEPLANT"
  | "ERLEDIGT"
  | "UEBERSPRUNGEN"
  | "FEHLER";

export interface LaufDetail {
  nachforderungId: string;
  modul: string;
  schritt: LaufSchritt;
  /** Erinnerung: VORAB/FRISTTAG; Nachholen: der Anlass der gescheiterten Mail. */
  anlass?: string;
  status: LaufDetailStatus;
}

/**
 * Die Antwort des Laufs (Abschnitt 9). Im Probelauf zaehlen die Mail-Zaehler
 * das GEPLANTE; `total` ist die Zahl der zugestellten (bzw. geplanten) Mails.
 */
export interface LaufBericht {
  success: true;
  timestamp: string;
  heute: Kalendertag;
  dryRun: boolean;
  erinnerungen: { vorab: number; fristtag: number };
  hrMeldungen: { vollstaendigNachgeholt: number; fristVerstrichen: number };
  nachgeholt: number;
  /** FAILED und von der SMTP-Bremse zurueckgehalten. */
  nichtZugestellt: number;
  /** SKIPPED (Vorlage aus oder untauglich, kein Empfaenger). */
  mailUebersprungen: number;
  /** Vorgang auch im zweiten Versuch gesperrt, oder Stand zwischen Lesen und Schreiben geaendert. */
  uebersprungen: number;
  /** Z2: Nachforderungen eingestellter Vorgaenge zurueckgezogen (Probelauf: waeren). */
  zurueckgezogen: number;
  aufgeraeumt: { dateien: number; entwuerfe: number; waisen: number; fehler: number };
  errors: number;
  total: number;
  details: LaufDetail[];
}

/** Antwort von `unterlagenFristenLauf` — die Route gibt sie 1:1 aus. */
export interface LaufAntwort {
  status: 200 | 409;
  body: LaufBericht | { error: string };
}

export const LAUF_MELDUNGEN = {
  /** 409: Ein zweiter Aufruf, waehrend der Lauf noch arbeitet. */
  LAEUFT_BEREITS: "Der tägliche Lauf für Unterlagen läuft bereits.",
} as const;

// =============================================
// Kontext eines Laufs
// =============================================

/** Seitengroesse der Abfragen (N3). */
export const LAUF_SEITE = 500;
const MS_PRO_STUNDE = 3_600_000;
const WAISEN_MIN_ALTER_MS = WAISEN_MIN_ALTER_STUNDEN * MS_PRO_STUNDE;

interface LaufKontext {
  /** Start des Laufs — Grundlage der Planung. Geschrieben wird mit `zeitstempel(c)`. */
  jetzt: Date;
  /** `Date.now()` beim Start — fuer `zeitstempel`. */
  startMs: number;
  heute: Kalendertag;
  dryRun: boolean;
  bericht: LaufBericht;
  /** SMTP-Bremse: FAILED in Folge, und ob sie greift. */
  fehlerInFolge: number;
  gebremst: boolean;
  /** Je Ereignis: der Grund, warum die gespeicherte Vorlage nicht taugt (null = taugt). */
  vorlagen: Map<UnterlagenPersonenEvent, string | null>;
  /** `SmtpConfig.replyToEmail`, einmal je Lauf gelesen. */
  hrPostfach?: string | null;
}

/** Was der Lauf zuerst von einer Nachforderung weiss: genug fuer die Sperre des Vorgangs. */
const KOPF_AUSWAHL = { id: true, modul: true, ...BEZUG_AUSWAHL } satisfies Prisma.UnterlagenNachforderungSelect;
type Kopf = Prisma.UnterlagenNachforderungGetPayload<{ select: typeof KOPF_AUSWAHL }>;

/** Der frische Stand unter der Sperre — genau, was Planung, Mails und Aufraeumen lesen. */
const LAUF_AUSWAHL = {
  ...KOPF_AUSWAHL,
  status: true,
  frist: true,
  empfaenger: true,
  nachricht: true,
  angefordertAm: true,
  erinnertFuerFrist: true,
  erinnertStufe: true,
  fristGemeldetFuer: true,
  vollstaendigSeit: true,
  vollstaendigGemeldetAm: true,
  angefordertVon: { select: { email: true, firstName: true, lastName: true, isActive: true } },
  positionen: {
    orderBy: { reihenfolge: "asc" },
    select: {
      id: true,
      bezeichnung: true,
      hinweis: true,
      sensibel: true,
      originalErforderlich: true,
      status: true,
      einreichungen: true,
      begruendung: true,
      angefordertAm: true,
    },
  },
  dateien: {
    select: {
      id: true,
      positionId: true,
      status: true,
      speicherPfad: true,
      loeschenAb: true,
      dateiGeloeschtAm: true,
      hochgeladenAm: true,
    },
  },
  links: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      anlass: true,
      empfaenger: true,
      mailStatus: true,
      gesendetAm: true,
      createdAt: true,
      nachholVersuche: true,
      positionId: true,
      entwertetAm: true,
      entwertetGrund: true,
      fruehereSperren: true,
    },
  },
} satisfies Prisma.UnterlagenNachforderungSelect;
type LaufZeile = Prisma.UnterlagenNachforderungGetPayload<{ select: typeof LAUF_AUSWAHL }>;

/** Eine Nachforderung in Bearbeitung — unter der Sperre ihres Vorgangs gelesen. */
interface Bearbeitung {
  baustein: UnterlagenModulBaustein;
  vorgangId: string;
  zeile: LaufZeile;
  /** Nur bei LAUFEND geladen (fuer die Mails), sonst null. */
  v: UnterlagenVorgang | null;
  /**
   * Ging IN DIESEM LAUF eine Mail an die Person hinaus (SENT)? `zeile.links`
   * ist der Stand VOR dem Nachholen — ohne den Merker meldete „Frist
   * verstrichen" direkt nach einem erfolgreichen Nachholen „nie zugestellt".
   */
  zugestelltImLauf: boolean;
}

function leererBericht(jetzt: Date, heute: Kalendertag, dryRun: boolean): LaufBericht {
  return {
    success: true,
    timestamp: jetzt.toISOString(),
    heute,
    dryRun,
    erinnerungen: { vorab: 0, fristtag: 0 },
    hrMeldungen: { vollstaendigNachgeholt: 0, fristVerstrichen: 0 },
    nachgeholt: 0,
    nichtZugestellt: 0,
    mailUebersprungen: 0,
    uebersprungen: 0,
    zurueckgezogen: 0,
    aufgeraeumt: { dateien: 0, entwuerfe: 0, waisen: 0, fehler: 0 },
    errors: 0,
    total: 0,
    details: [],
  };
}

// =============================================
// Zaehlen
// =============================================

type MailArt = "VORAB" | "FRISTTAG" | "NACHHOLEN" | "VOLLSTAENDIG" | "FRIST_VERSTRICHEN";

function detail(c: LaufKontext, k: Kopf, schritt: LaufSchritt, status: LaufDetailStatus, anlass?: string): void {
  c.bericht.details.push({ nachforderungId: k.id, modul: k.modul, schritt, ...(anlass ? { anlass } : {}), status });
}

/** Zugestellt (bzw. im Probelauf geplant): der Zaehler der Mail-Art und `total`. */
function zugestelltZaehlen(b: LaufBericht, art: MailArt): void {
  if (art === "VORAB") b.erinnerungen.vorab += 1;
  else if (art === "FRISTTAG") b.erinnerungen.fristtag += 1;
  else if (art === "NACHHOLEN") b.nachgeholt += 1;
  else if (art === "VOLLSTAENDIG") b.hrMeldungen.vollstaendigNachgeholt += 1;
  else b.hrMeldungen.fristVerstrichen += 1;
  b.total += 1;
}

/**
 * Das Ergebnis einer Mail zaehlen und die SMTP-Bremse fuehren: FAILED erhoeht
 * die Folge, SENT und SKIPPED setzen sie zurueck (der Server antwortet ja).
 *
 * SENT mit `nachweisFehlt` (N2): Die Mail ist draussen, aber Ergebnis, Merker
 * und Protokoll fehlen — zugestellt UND ein Fehler (wie CL Abteilungsaufgaben,
 * Regel 2: „im Cron zaehlt das als `errors`"). Sonst saehe der Bericht aus
 * wie ein normales SENT, und niemand erfuehre, warum morgen dieselbe Mail
 * noch einmal hinausgeht.
 */
function mailGezaehlt(
  c: LaufKontext,
  k: Kopf,
  schritt: LaufSchritt,
  art: MailArt,
  anlass: string | undefined,
  mail: Pick<UnterlagenMailErgebnis, "status" | "nachweisFehlt">,
): void {
  if (mail.status === "FAILED") {
    c.fehlerInFolge += 1;
    if (c.fehlerInFolge >= SMTP_BREMSE_FEHLER_IN_FOLGE) c.gebremst = true;
    c.bericht.nichtZugestellt += 1;
  } else {
    c.fehlerInFolge = 0;
    if (mail.status === "SENT") zugestelltZaehlen(c.bericht, art);
    else c.bericht.mailUebersprungen += 1;
  }
  if (mail.status === "SENT" && mail.nachweisFehlt) {
    c.bericht.errors += 1;
    detail(c, k, schritt, "NACHWEIS_FEHLT", anlass);
    console.error(`[Unterlagen-Lauf] ${schritt} (${k.id}): versendet, Nachweis nicht gespeichert.`);
    return;
  }
  detail(c, k, schritt, mail.status, anlass);
}

/**
 * Zeitstempel fuer alles, was der Lauf schreibt: die Zeit des Schreibens,
 * gemessen ab dem Start des Laufs (Kopfkommentar „Zwei Uhren").
 */
function zeitstempel(c: LaufKontext): Date {
  return new Date(c.jetzt.getTime() + Math.max(0, Date.now() - c.startMs));
}

/**
 * Vor jeder Mail: Probelauf → nur zaehlen (GEPLANT); SMTP-Bremse → nicht
 * versuchen (GEBREMST, zaehlt als nicht zugestellt). Sonst `true`: senden.
 */
function mailVersuchen(c: LaufKontext, k: Kopf, schritt: LaufSchritt, art: MailArt, anlass?: string): boolean {
  if (c.dryRun) {
    zugestelltZaehlen(c.bericht, art);
    detail(c, k, schritt, "GEPLANT", anlass);
    return false;
  }
  if (c.gebremst) {
    c.bericht.nichtZugestellt += 1;
    detail(c, k, schritt, "GEBREMST", anlass);
    return false;
  }
  return true;
}

/** Ein Schritt, der scheitert, zaehlt als Fehler — die uebrigen Schritte und der Lauf gehen weiter. */
async function schritt(c: LaufKontext, k: Kopf, name: LaufSchritt, ausfuehren: () => Promise<void>): Promise<void> {
  try {
    await ausfuehren();
  } catch (err) {
    c.bericht.errors += 1;
    detail(c, k, name, "FEHLER");
    console.error(`[Unterlagen-Lauf] ${name} (${k.id}) fehlgeschlagen:`, fehlerKennung(err));
  }
}

// =============================================
// Hilfen
// =============================================

function fristVon(zeile: Pick<LaufZeile, "frist">): Kalendertag {
  const tag = ablaufKalendertag(zeile.frist);
  if (!tag) throw new Error("Unlesbare Frist");
  return tag;
}

/** Laedt alle Seiten einer Abfrage (N3: Faelligkeit steht in der Abfrage, hier nur geblaettert). */
async function alleSeiten<T>(seite: (skip: number) => Promise<T[]>): Promise<T[]> {
  const alle: T[] = [];
  for (let skip = 0; ; skip += LAUF_SEITE) {
    const teil = await seite(skip);
    alle.push(...teil);
    if (teil.length < LAUF_SEITE) return alle;
  }
}

/** Grund, warum die gespeicherte Vorlage nicht taugt — je Lauf einmal gefragt. Eine deaktivierte meldet der Mailer selbst (SKIPPED). */
async function vorlageUntauglich(c: LaufKontext, event: UnterlagenPersonenEvent): Promise<string | null> {
  if (!c.vorlagen.has(event)) {
    const pruefung = await personenVorlagePruefen(event);
    const grund = pruefung?.body.grund;
    c.vorlagen.set(event, pruefung && grund !== "VORLAGE_DEAKTIVIERT" ? String(pruefung.body.error) : null);
  }
  return c.vorlagen.get(event) ?? null;
}

async function hrPostfach(c: LaufKontext): Promise<string | null> {
  if (c.hrPostfach === undefined) {
    const smtp = await prisma.smtpConfig.findUnique({ where: { id: "default" }, select: { replyToEmail: true } });
    c.hrPostfach = smtp?.replyToEmail ?? null;
  }
  return c.hrPostfach;
}

/** Protokolleintrag des Laufs: ohne `userId`, Bezug aus dem Baustein. */
function laufProtokoll(
  n: Pick<Bearbeitung, "baustein" | "vorgangId">,
  action: string,
  details: Record<string, unknown>,
): Prisma.AuditLogUncheckedCreateInput {
  const a = n.baustein.audit(n.vorgangId);
  return { userId: null, processType: a.processType, ...a.fk, action, details: details as Prisma.InputJsonValue };
}

/**
 * Der Link einer Mail des Laufs — VOR dem Versand, in einer Transaktion: erst
 * der Vorgang (bei EXPIRED, auch gerade erst gesetzt, 0 Treffer → nichts),
 * dann die Nachforderung, bedingt auf LAUFEND und die gelesene Frist (hat HR
 * sie geaendert, 0 Treffer → nichts). Ein abgebrochener alter Link bekommt in
 * derselben Transaktion „kein Ergebnis" (FAILED). Der neue Link traegt die
 * Zeit des Schreibens und beim Nachholen den Wunsch „frühere Links sperren"
 * weiter (scheitert auch dieser Versuch, gilt er fuer den naechsten).
 *
 * @returns null, wenn sich der Stand seit dem Lesen geaendert hat
 */
async function laufLinkAnlegen(
  n: Bearbeitung,
  c: LaufKontext,
  opts: { anlass: LinkAnlass; positionId?: string | null; nachholen?: NachholPlan },
): Promise<{ linkId: string; token: string } | null> {
  const { zeile } = n;
  const jetzt = zeitstempel(c);
  return prisma.$transaction(async (tx) => {
    if (!(await n.baustein.vorgangSperren(tx, n.vorgangId))) return null;
    const gesperrt = await tx.unterlagenNachforderung.updateMany({
      where: { id: zeile.id, status: "LAUFEND", frist: zeile.frist },
      data: { updatedAt: jetzt },
    });
    if (gesperrt.count === 0) return null;
    if (opts.nachholen?.abgebrochen) {
      await tx.unterlagenLink.updateMany({
        where: { id: opts.nachholen.linkId, mailStatus: "AUSSTEHEND" satisfies MailStatus },
        data: { mailStatus: "FAILED" satisfies MailStatus, mailDetail: MELDUNGEN.MAIL_OHNE_ERGEBNIS },
      });
    }
    return linkAnlegen(tx, {
      nachforderungId: zeile.id,
      anlass: opts.anlass,
      empfaenger: zeile.empfaenger,
      frist: fristVon(zeile),
      erstelltVonId: null,
      positionId: opts.positionId ?? null,
      ...(opts.nachholen
        ? { nachholVersuche: opts.nachholen.versuch, fruehereSperren: opts.nachholen.fruehereSperren }
        : {}),
      jetzt,
    });
  });
}

// =============================================
// Vor der Planung: Mails ohne Ergebnis klaeren
// =============================================

const AUSSTEHEND_MS = AUSSTEHEND_NACHHOLEN_MINUTEN * 60_000;

/**
 * Links, die seit ueber einer Stunde auf AUSSTEHEND stehen, bekommen VOR der
 * Planung ein Ergebnis. Ohne diesen Schritt hielte die Planung jede solche
 * Mail fuer einen Absturz zwischen Link und Versand und schickte sie noch
 * einmal — auch dann, wenn sie draussen war und nur das Speichern des
 * Ergebnisses scheiterte (N2), und HR gerade „bitte nicht erneut senden"
 * gelesen hat.
 *
 *   - Das Versandprotokoll kennt ein SENT fuer dasselbe Ereignis
 *     (`personenEventFuerAnlass`) an dieselbe Adresse, nach dem Anlegen dieses
 *     Links und vor dem naechsten Link der Nachforderung (hoechstens eine
 *     Stunde): SENT mit Zeit und Message-ID des Protokolls. Wollte HR mit
 *     dieser Mail die frueheren Links sperren (`fruehereSperren`) und ist sie
 *     die juengste, sperrt der Lauf sie im selben Commit — N2 liess das aus.
 *     Den Merker einer Erinnerung setzt er NICHT nach (bewusst wie N2 im Kopf
 *     dieser Datei: eine Erinnerung ggf. doppelt).
 *   - Sonst FAILED „kein Ergebnis": Absturz zwischen Link und Versand, oder
 *     auch das Protokoll fehlt (Datenbank ganz weg). Schritt 2 holt einen
 *     nachholbaren Anlass nach; eine Erinnerung kommt wieder, solange sie
 *     faellig ist — und steht im Mailverlauf nicht mehr fuer immer auf „wird
 *     gesendet".
 *
 * Geschrieben wird bedingt auf AUSSTEHEND. Der Probelauf liest nur und traegt
 * das Ergebnis allein in `zeile.links` ein — die Planung sieht dasselbe wie im
 * scharfen Lauf.
 */
async function ergebnisseKlaeren(c: LaufKontext, k: Kopf, zeile: LaufZeile): Promise<void> {
  const grenze = c.jetzt.getTime() - AUSSTEHEND_MS;
  const juengste = zeile.links.at(-1);
  for (const [i, l] of zeile.links.entries()) {
    if (l.mailStatus !== ("AUSSTEHEND" satisfies MailStatus) || l.createdAt.getTime() > grenze) continue;
    const naechster = zeile.links[i + 1]?.createdAt.getTime() ?? Number.POSITIVE_INFINITY;
    const bis = new Date(Math.min(naechster, l.createdAt.getTime() + AUSSTEHEND_MS));
    const protokoll = await prisma.emailLog.findFirst({
      where: {
        event: personenEventFuerAnlass(l.anlass),
        recipient: l.empfaenger,
        status: "SENT",
        isTest: false,
        createdAt: { gte: l.createdAt, lt: bis },
      },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, messageId: true },
    });
    const ergebnis: MailStatus = protokoll ? "SENT" : "FAILED";
    if (!c.dryRun) {
      const data: Prisma.UnterlagenLinkUpdateManyMutationInput = protokoll
        ? { mailStatus: ergebnis, mailDetail: null, messageId: protokoll.messageId, gesendetAm: protokoll.createdAt }
        : { mailStatus: ergebnis, mailDetail: MELDUNGEN.MAIL_OHNE_ERGEBNIS };
      await prisma.$transaction(async (tx) => {
        const r = await tx.unterlagenLink.updateMany({
          where: { id: l.id, mailStatus: "AUSSTEHEND" satisfies MailStatus },
          data,
        });
        if (r.count === 1 && protokoll && l.fruehereSperren && l.id === juengste?.id) {
          await fruehereLinksSperrenIn(tx, zeile.id, l.id, zeitstempel(c));
        }
      });
    }
    l.mailStatus = ergebnis;
    if (protokoll) l.gesendetAm = protokoll.createdAt;
    detail(c, k, "ERGEBNIS", c.dryRun ? "GEPLANT" : ergebnis, l.anlass);
  }
}

// =============================================
// Z2: zurueckziehen
// =============================================

async function zurueckziehen(c: LaufKontext, k: Kopf, n: Bearbeitung): Promise<void> {
  if (c.dryRun) {
    c.bericht.zurueckgezogen += 1;
    detail(c, k, "ZURUECKZIEHEN", "GEPLANT");
    return;
  }
  const ergebnis = await unterlagenLaufZurueckziehen({
    baustein: n.baustein,
    vorgangId: n.vorgangId,
    nachforderungId: n.zeile.id,
    jetzt: zeitstempel(c),
  });
  if (!ergebnis) {
    c.bericht.uebersprungen += 1;
    detail(c, k, "ZURUECKZIEHEN", "UEBERSPRUNGEN");
    return;
  }
  c.bericht.zurueckgezogen += 1;
  detail(c, k, "ZURUECKZIEHEN", "ERLEDIGT");
}

// =============================================
// Schritt 1: „vollständig" nachholen
// =============================================

async function vollstaendigNachholen(c: LaufKontext, k: Kopf, n: Bearbeitung): Promise<void> {
  if (!mailVersuchen(c, k, "VOLLSTAENDIG", "VOLLSTAENDIG")) return;
  // Bedingter Anspruch (Abschnitt 7): Hat ihn ein laufendes `after()` schon,
  // liefert die Funktion null, und es geht keine zweite Mail hinaus.
  const mail = await hrVollstaendigMelden(n.zeile.id, zeitstempel(c));
  if (mail) mailGezaehlt(c, k, "VOLLSTAENDIG", "VOLLSTAENDIG", undefined, mail);
}

// =============================================
// Schritt 2 und 3: die Mail an die Person
// =============================================

async function nachholen(c: LaufKontext, k: Kopf, n: Bearbeitung, plan: NachholPlan): Promise<void> {
  if (!mailVersuchen(c, k, "NACHHOLEN", "NACHHOLEN", plan.anlass)) return;
  const { zeile } = n;
  const v = n.v as UnterlagenVorgang;
  const event = personenEventFuerAnlass(plan.anlass);
  const untauglich = await vorlageUntauglich(c, event);

  // Gleicher Anlass, neuer Link (Abschnitt 9, Schritt 2).
  const link = await laufLinkAnlegen(n, c, { anlass: plan.anlass, positionId: plan.positionId, nachholen: plan });
  if (!link) {
    c.bericht.uebersprungen += 1;
    detail(c, k, "NACHHOLEN", "UEBERSPRUNGEN", plan.anlass);
    return;
  }

  const frist = fristVon(zeile);
  const neu = new Set(plan.neuePositionen);
  const basis = {
    vorgang: mailVorgang(n.baustein, v, zeile.id, frist),
    positionen: zeile.positionen.map((p) => mailPosition(p, neu)),
    empfaenger: zeile.empfaenger,
    link: unterlagenLinkUrl(link.token),
    linkGueltigBis: linkGueltigBisFuer(frist),
    heute: c.heute,
    nachricht: zeile.nachricht,
    nachgeholt: true,
  };
  const merker: PersonenMailMerker = async (tx, status) => {
    if (status !== "SENT") return;
    // „frühere Links sperren" (5.1): erst nach SENT — und im selben Commit wie
    // Nachweis und Protokoll. Bei FAILED/SKIPPED nie: Wer keinen neuen Link
    // bekam, braucht den alten.
    const gesperrt = plan.fruehereSperren
      ? await fruehereLinksSperrenIn(tx, zeile.id, link.linkId, zeitstempel(c))
      : null;
    await tx.auditLog.create({
      data: laufProtokoll(n, UNTERLAGEN_AUDIT.MAIL_NACHGEHOLT, {
        nachforderungId: zeile.id,
        linkId: link.linkId,
        vorherLinkId: plan.linkId,
        anlass: plan.anlass,
        versuch: plan.versuch,
        ...(gesperrt !== null ? { fruehereGesperrt: gesperrt } : {}),
      }),
    });
  };

  const mail = await personenMailSenden({
    event,
    linkId: link.linkId,
    jetzt: zeitstempel(c),
    merker,
    ...(untauglich ? { ohneVersand: untauglich } : {}),
    vorbereiten: async () => {
      if (plan.anlass !== "ZURUECKWEISUNG") {
        return { empfaenger: zeile.empfaenger, payload: aufforderungMailFelder({ ...basis, anlass: plan.anlass }) };
      }
      const position = zeile.positionen.find((p) => p.id === plan.positionId);
      if (!position) throw new Error("Position fehlt");
      return {
        empfaenger: zeile.empfaenger,
        payload: zurueckweisungMailFelder({
          ...basis,
          position: mailPosition(position, neu),
          begruendung: position.begruendung ?? "",
        }),
      };
    },
  });
  if (mail.status === "SENT") n.zugestelltImLauf = true;
  mailGezaehlt(c, k, "NACHHOLEN", "NACHHOLEN", plan.anlass, mail);
}

async function erinnern(c: LaufKontext, k: Kopf, n: Bearbeitung, plan: ErinnerungsPlan): Promise<void> {
  const art: MailArt = plan.stufe;
  if (!mailVersuchen(c, k, "ERINNERUNG", art, plan.stufe)) return;
  const { zeile } = n;
  const v = n.v as UnterlagenVorgang;
  const untauglich = await vorlageUntauglich(c, UNTERLAGEN_EVENTS.ERINNERUNG);

  const link = await laufLinkAnlegen(n, c, { anlass: erinnerungsAnlass(plan.stufe) });
  if (!link) {
    c.bericht.uebersprungen += 1;
    detail(c, k, "ERINNERUNG", "UEBERSPRUNGEN", plan.stufe);
    return;
  }

  const frist = fristVon(zeile);
  // Merker bedingt auf den GELESENEN Fristwert — eine Friständerung dazwischen
  // bleibt stehen und beginnt ihren eigenen Zyklus.
  const merker: PersonenMailMerker = async (tx, status) => {
    await tx.unterlagenNachforderung.updateMany({
      where: { id: zeile.id, frist: zeile.frist },
      data: { erinnertFuerFrist: zeile.frist, erinnertStufe: plan.stufe },
    });
    if (status === "SENT") {
      await tx.auditLog.create({
        data: laufProtokoll(n, UNTERLAGEN_AUDIT.ERINNERT, {
          nachforderungId: zeile.id,
          linkId: link.linkId,
          stufe: plan.stufe,
          frist,
        }),
      });
    }
  };

  const mail = await personenMailSenden({
    event: UNTERLAGEN_EVENTS.ERINNERUNG,
    linkId: link.linkId,
    jetzt: zeitstempel(c),
    merker,
    ...(untauglich ? { ohneVersand: untauglich } : {}),
    vorbereiten: async () => ({
      empfaenger: zeile.empfaenger,
      payload: erinnerungMailFelder({
        vorgang: mailVorgang(n.baustein, v, zeile.id, frist),
        positionen: zeile.positionen.map((p) => mailPosition(p, new Set())),
        empfaenger: zeile.empfaenger,
        link: unterlagenLinkUrl(link.token),
        linkGueltigBis: linkGueltigBisFuer(frist),
        heute: c.heute,
        nachricht: zeile.nachricht,
        stufe: plan.stufe,
        entwurfVorhanden: plan.entwurfVorhanden,
      }),
    }),
  });
  if (mail.status === "SENT") n.zugestelltImLauf = true;
  mailGezaehlt(c, k, "ERINNERUNG", art, plan.stufe, mail);
}

// =============================================
// Schritt 4: „Frist verstrichen" an HR
// =============================================

async function fristMelden(c: LaufKontext, k: Kopf, n: Bearbeitung): Promise<void> {
  if (!mailVersuchen(c, k, "FRIST_VERSTRICHEN", "FRIST_VERSTRICHEN")) return;
  const { zeile } = n;
  const v = n.v as UnterlagenVorgang;
  const frist = fristVon(zeile);
  const von = zeile.angefordertVon;
  const payload = fristVerstrichenMailFelder({
    vorgang: mailVorgang(n.baustein, v, zeile.id, frist),
    positionen: zeile.positionen.map((p) => mailPosition(p, new Set())),
    portalLink: `${getBaseUrl()}${n.baustein.portalPfad(n.vorgangId)}`,
    anfordernd: von
      ? { email: von.email, name: `${von.firstName} ${von.lastName}`.trim() || null, aktiv: von.isActive }
      : null,
    hrPostfach: await hrPostfach(c),
    angefordertAm: zeile.angefordertAm,
    linkGueltigBis: nachforderungLinkende(zeile.frist) ?? linkGueltigBisFuer(frist),
    // `zeile.links` ist der Stand vor dem Nachholen dieses Laufs — die eben
    // zugestellte Mail zaehlt mit, sonst hiesse es „bitte Adresse prüfen".
    nieZugestellt: !n.zugestelltImLauf && !zeile.links.some((l) => l.mailStatus === "SENT"),
  });
  // Merker `fristGemeldetFuer` bei SENT und SKIPPED, bedingt auf den gelesenen
  // Fristwert; Protokoll bei SENT — alles in der Transaktion von hrMeldungSenden.
  const mail = await hrMeldungSenden({
    event: UNTERLAGEN_EVENTS.FRIST_VERSTRICHEN,
    nachforderungId: zeile.id,
    vorgangId: n.vorgangId,
    baustein: n.baustein,
    payload,
    merker: async (tx) => {
      await tx.unterlagenNachforderung.updateMany({
        where: { id: zeile.id, frist: zeile.frist },
        data: { fristGemeldetFuer: zeile.frist },
      });
    },
  });
  mailGezaehlt(c, k, "FRIST_VERSTRICHEN", "FRIST_VERSTRICHEN", undefined, mail);
}

// =============================================
// Schritt 5: aufraeumen (4.5)
// =============================================

/**
 * Loescht, was heute faellig ist, und sucht Waisen in beiden Ordnern — unter
 * der Sperre des Vorgangs. `kandidaten` kommt aus der Planung des frischen
 * Stands; im Probelauf wird nur gezaehlt (Waisen: nur gelesen).
 */
async function aufraeumen(c: LaufKontext, n: Bearbeitung, kandidaten: AufraeumKandidaten): Promise<void> {
  const { zeile } = n;
  const a = c.bericht.aufgeraeumt;
  const nachId = new Map(zeile.dateien.map((d) => [d.id, d]));
  const loeschen = async (pfad: string | null, nachforderungId: string) =>
    pfad ? nachforderungsDateiLoeschen(pfad, nachforderungId) : ("fehlte" as const);

  // a) Entwuerfe: erst die Zeile, bedingt — uebermittelt die Person gerade,
  //    trifft das Loeschen nichts (0) und die Datei bleibt. Die Frist in der
  //    Bedingung: Eine verlaengerte rettet die Entwuerfe.
  const entwurfIds: string[] = [];
  const grenze = kalendertagAlsDatum(entwurfFaelligBisFrist(c.heute));
  for (const id of kandidaten.entwuerfe) {
    if (c.dryRun) {
      a.entwuerfe += 1;
      continue;
    }
    const weg = await prisma.unterlagenDatei.deleteMany({
      where: { id, nachforderungId: zeile.id, status: "ENTWURF", nachforderung: { frist: { lte: grenze } } },
    });
    if (weg.count !== 1) continue;
    if ((await loeschen(nachId.get(id)?.speicherPfad ?? null, zeile.id)) === "fehler") {
      // Die Zeile ist weg — die Datei faellt dem naechsten Lauf als Waise zu.
      a.fehler += 1;
      continue;
    }
    a.entwuerfe += 1;
    entwurfIds.push(id);
  }

  // b) Zurueckgewiesene und verworfene Dateien: erst die Datei, dann der
  //    Merker — nur bei „geloescht" oder „fehlte".
  const dateiIds: string[] = [];
  for (const id of kandidaten.dateien) {
    if (c.dryRun) {
      a.dateien += 1;
      continue;
    }
    if ((await loeschen(nachId.get(id)?.speicherPfad ?? null, zeile.id)) === "fehler") {
      a.fehler += 1;
      continue;
    }
    a.dateien += 1;
    dateiIds.push(id);
  }

  // c) Waisen. Bekannt ist, worauf eine Zeile zeigt (Stand VOR a und b —
  //    was dort liegen blieb, raeumt der naechste Lauf als Waise ab).
  let waisen = 0;
  const bekannt = new Set(zeile.dateien.flatMap((d) => (d.speicherPfad ? [d.speicherPfad] : [])));
  const inNachforderung = await nachforderungsWaisen({
    nachforderungId: zeile.id,
    bekanntePfade: bekannt,
    jetzt: c.jetzt,
    minAlterMs: WAISEN_MIN_ALTER_MS,
  });
  for (const pfad of inNachforderung) {
    if (!c.dryRun && (await nachforderungsDateiLoeschen(pfad, zeile.id)) === "fehler") {
      a.fehler += 1;
      continue;
    }
    waisen += 1;
  }
  // Im Vorgangsordner: nur `<dateiId>.<ext>` mit einer Datei-ID DIESER
  // Nachforderung, auf die keine Zielzeile des Vorgangs zeigt — alle Schreiber
  // dort sind HR-Aktionen unter derselben Sperre, deshalb ohne Altersgrenze.
  const imVorgang = await vorgangsWaisen({
    vorgangId: n.vorgangId,
    dateiIds: new Set(zeile.dateien.map((d) => d.id)),
    dokumentPfade: new Set(),
  });
  const verwendet =
    imVorgang.length > 0 ? await n.baustein.zielPfadeVerwendet(n.vorgangId, imVorgang) : new Set<string>();
  for (const pfad of imVorgang) {
    if (verwendet.has(pfad)) continue;
    if (!c.dryRun && (await vorgangsKopieLoeschen(pfad, n.vorgangId)) === "fehler") {
      a.fehler += 1;
      continue;
    }
    waisen += 1;
  }
  a.waisen += waisen;
  if (c.dryRun) return;

  // d) Merker und Protokoll in EINER Transaktion. Scheitert sie, sind die
  //    Dateien trotzdem weg; der naechste Lauf findet sie als „fehlte" und
  //    setzt den Merker nach.
  if (dateiIds.length > 0 || entwurfIds.length > 0 || waisen > 0) {
    await prisma.$transaction(async (tx) => {
      if (dateiIds.length > 0) {
        await tx.unterlagenDatei.updateMany({
          where: { id: { in: dateiIds }, nachforderungId: zeile.id, dateiGeloeschtAm: null },
          data: { dateiGeloeschtAm: zeitstempel(c), speicherPfad: null },
        });
      }
      await tx.auditLog.create({
        data: laufProtokoll(n, UNTERLAGEN_AUDIT.DATEIEN_GELOESCHT, {
          nachforderungId: zeile.id,
          dateiIds,
          entwurfIds,
          waisen,
        }),
      });
    });
  }
  // Auch ohne Loeschung: Nach dem Annehmen der letzten Datei bleibt der Ordner
  // leer zurueck. Ein leerer Ordner geht, ein gleichzeitiger Upload legt ihn
  // neu an (entwurfSpeichern).
  await deleteUploadedDirIfEmpty(nachforderungsWurzel(zeile.id));
}

/**
 * Ordner unter `uploads/unterlagen/` ohne Nachforderungszeile (nach einer
 * Loeschung von Hand ueber Cascade): Dateien ab 24 h, dann der leere Ordner.
 * Ohne Zeile gibt es keinen Vorgang — also weder Sperre noch Protokoll.
 * `bekannteIds` MUSS aus einer gelungenen Auflistung stammen (`laufen`).
 * Laesst sich das Verzeichnis nicht lesen, zaehlt das als Fehler; die Mails
 * sind dann schon draussen, der Bericht bleibt erhalten.
 */
async function verwaisteOrdnerAufraeumen(c: LaufKontext, bekannteIds: ReadonlySet<string>): Promise<void> {
  const a = c.bericht.aufgeraeumt;
  let ordner: string[];
  try {
    ordner = await verwaisteNachforderungsOrdner({ bekannteIds, jetzt: c.jetzt, minAlterMs: WAISEN_MIN_ALTER_MS });
  } catch (err) {
    c.bericht.errors += 1;
    console.error("[Unterlagen-Lauf] Verwaiste Ordner nicht gelesen:", fehlerKennung(err));
    return;
  }
  for (const id of ordner) {
    try {
      const dateien = await nachforderungsWaisen({
        nachforderungId: id,
        bekanntePfade: new Set(),
        jetzt: c.jetzt,
        minAlterMs: WAISEN_MIN_ALTER_MS,
      });
      for (const pfad of dateien) {
        if (!c.dryRun && (await nachforderungsDateiLoeschen(pfad, id)) === "fehler") {
          a.fehler += 1;
          continue;
        }
        a.waisen += 1;
      }
      if (!c.dryRun) await deleteUploadedDirIfEmpty(nachforderungsWurzel(id));
    } catch (err) {
      c.bericht.errors += 1;
      console.error(`[Unterlagen-Lauf] Verwaister Ordner (${id}) nicht aufgeraeumt:`, fehlerKennung(err));
    }
  }
}

// =============================================
// Je Nachforderung
// =============================================

/**
 * Eine Nachforderung: Sperre des Vorgangs → frisch lesen → planen → handeln.
 * `GESPERRT`: Die Sperre war belegt (HR-Aktion), der Lauf versucht es am Ende
 * noch einmal.
 */
async function bearbeiten(c: LaufKontext, k: Kopf): Promise<"FERTIG" | "GESPERRT"> {
  const baustein = unterlagenBaustein(k.modul);
  const vorgangId = baustein?.vorgangIdAus(k) ?? null;
  if (!baustein || !vorgangId) {
    // Eine Zeile, die kein Baustein kennt (etwa aus einer spaeteren Stufe nach
    // einem Rueckfall): nichts anfassen, aber sichtbar zaehlen.
    c.bericht.errors += 1;
    detail(c, k, "LESEN", "FEHLER");
    console.error(`[Unterlagen-Lauf] Nachforderung ${k.id} ohne bekanntes Modul uebersprungen.`);
    return "FERTIG";
  }
  if (!c.dryRun && !unterlagenSperreNehmen(baustein.modul, vorgangId)) return "GESPERRT";

  try {
    const zeile = await prisma.unterlagenNachforderung.findUnique({ where: { id: k.id }, select: LAUF_AUSWAHL });
    if (!zeile) return "FERTIG";
    // Scheitert das Klaeren, faengt die Planung haengende Links selbst ab (`abgebrochen`).
    await schritt(c, k, "ERGEBNIS", () => ergebnisseKlaeren(c, k, zeile));
    const v = zeile.status === "LAUFEND" ? await baustein.vorgangLaden(vorgangId) : null;
    const plan = laufPlanen(zeile, { heute: c.heute, jetzt: c.jetzt, vorgangEingestellt: v?.eingestellt ?? false });
    const n: Bearbeitung = { baustein, vorgangId, zeile, v, zugestelltImLauf: false };

    if (plan.zurueckziehen) await schritt(c, k, "ZURUECKZIEHEN", () => zurueckziehen(c, k, n));
    // Mails nur fuer eine laufende Nachforderung eines Vorgangs, der noch
    // bearbeitet wird (EP-3) — die Planung sagt dann ohnehin nichts anderes.
    if (v && !v.eingestellt) {
      if (plan.vollstaendigMelden) await schritt(c, k, "VOLLSTAENDIG", () => vollstaendigNachholen(c, k, n));
      const mail = plan.personenMail;
      if (mail?.art === "NACHHOLEN") await schritt(c, k, "NACHHOLEN", () => nachholen(c, k, n, mail));
      else if (mail?.art === "ERINNERUNG") await schritt(c, k, "ERINNERUNG", () => erinnern(c, k, n, mail));
      if (plan.fristMelden) await schritt(c, k, "FRIST_VERSTRICHEN", () => fristMelden(c, k, n));
    }
    await schritt(c, k, "AUFRAEUMEN", () => aufraeumen(c, n, plan.aufraeumen));
  } catch (err) {
    c.bericht.errors += 1;
    detail(c, k, "LESEN", "FEHLER");
    console.error(`[Unterlagen-Lauf] Nachforderung ${k.id} nicht gelesen:`, fehlerKennung(err));
  } finally {
    if (!c.dryRun) unterlagenSperreFreigeben(baustein.modul, vorgangId);
  }
  return "FERTIG";
}

// =============================================
// Kandidaten
// =============================================

/**
 * Wen der Lauf heute anfasst, in dieser Reihenfolge und ohne Doppel:
 * laufende nach `angefordertAm`, dann solche mit faelligen Dateien bzw.
 * Entwuerfen nach Faelligkeit, dann solche mit einem Ordner auf der Platte.
 * Dazu die IDs aller Ordner, zu denen es eine Nachforderung gibt — der Rest
 * ist verwaist.
 *
 * Laesst sich `uploads/unterlagen/` nicht lesen, ist das ein Fehler, aber kein
 * Grund, Erinnerungen und HR-Meldungen ausfallen zu lassen: Der Lauf macht mit
 * den Kandidaten aus der Datenbank weiter. `ordnerMitZeile` ist dann `null` —
 * ohne diese Liste saehe JEDER Ordner verwaist aus, das Aufraeumen verwaister
 * Ordner entfaellt fuer heute.
 */
async function kandidatenSammeln(c: LaufKontext): Promise<{ kandidaten: Kopf[]; ordnerMitZeile: Set<string> | null }> {
  const laufende = await alleSeiten((skip) =>
    prisma.unterlagenNachforderung.findMany({
      where: { status: "LAUFEND" },
      select: KOPF_AUSWAHL,
      orderBy: [{ angefordertAm: "asc" }, { id: "asc" }],
      skip,
      take: LAUF_SEITE,
    }),
  );
  const faelligeDateien = await alleSeiten((skip) =>
    prisma.unterlagenDatei.findMany({
      where: {
        status: { in: ["ZURUECKGEWIESEN", "VERWORFEN"] },
        dateiGeloeschtAm: null,
        loeschenAb: { lte: c.jetzt },
      },
      select: { nachforderungId: true },
      orderBy: [{ loeschenAb: "asc" }, { id: "asc" }],
      skip,
      take: LAUF_SEITE,
    }),
  );
  const faelligeEntwuerfe = await alleSeiten((skip) =>
    prisma.unterlagenDatei.findMany({
      where: {
        status: "ENTWURF",
        nachforderung: { frist: { lte: kalendertagAlsDatum(entwurfFaelligBisFrist(c.heute)) } },
      },
      select: { nachforderungId: true },
      orderBy: [{ nachforderung: { frist: "asc" } }, { id: "asc" }],
      skip,
      take: LAUF_SEITE,
    }),
  );
  let ordner: string[] | null;
  try {
    ordner = await nachforderungsOrdnerIds();
  } catch (err) {
    c.bericht.errors += 1;
    console.error("[Unterlagen-Lauf] Ordner der Nachforderungen nicht gelesen:", fehlerKennung(err));
    ordner = null;
  }

  const kandidaten = new Map<string, Kopf>(laufende.map((k) => [k.id, k]));
  const nachzuladen = [
    ...new Set([...faelligeDateien, ...faelligeEntwuerfe].map((d) => d.nachforderungId).concat(ordner ?? [])),
  ].filter((id) => !kandidaten.has(id));
  const geladen = new Map<string, Kopf>();
  for (let i = 0; i < nachzuladen.length; i += LAUF_SEITE) {
    const teil = await prisma.unterlagenNachforderung.findMany({
      where: { id: { in: nachzuladen.slice(i, i + LAUF_SEITE) } },
      select: KOPF_AUSWAHL,
    });
    for (const k of teil) geladen.set(k.id, k);
  }
  for (const id of nachzuladen) {
    const k = geladen.get(id);
    if (k) kandidaten.set(id, k);
  }
  const ordnerMitZeile = ordner ? new Set(ordner.filter((id) => kandidaten.has(id))) : null;
  return { kandidaten: [...kandidaten.values()], ordnerMitZeile };
}

// =============================================
// Der Lauf
// =============================================

/** Laufsperre: ein Lauf zur Zeit — im Speicher des Prozesses (ein Container). */
let laufAktiv = false;

async function laufen(jetzt: Date, dryRun: boolean): Promise<LaufBericht> {
  const heute = heuteInBerlin(jetzt);
  const c: LaufKontext = {
    jetzt,
    startMs: Date.now(),
    heute,
    dryRun,
    bericht: leererBericht(jetzt, heute, dryRun),
    fehlerInFolge: 0,
    gebremst: false,
    vorlagen: new Map(),
  };

  const { kandidaten, ordnerMitZeile } = await kandidatenSammeln(c);
  const vorgemerkt: Kopf[] = [];
  for (const k of kandidaten) {
    if ((await bearbeiten(c, k)) === "GESPERRT") vorgemerkt.push(k);
  }
  // Einmal erneut: Eine HR-Aktion haelt die Sperre nur Sekunden — ohne zweiten
  // Versuch fiele etwa die Fristtag-Erinnerung endgueltig aus.
  for (const k of vorgemerkt) {
    if ((await bearbeiten(c, k)) === "GESPERRT") {
      c.bericht.uebersprungen += 1;
      detail(c, k, "SPERRE", "UEBERSPRUNGEN");
    }
  }
  // Nur mit einer gelungenen Auflistung — sonst saehe jeder Ordner verwaist aus.
  if (ordnerMitZeile) await verwaisteOrdnerAufraeumen(c, ordnerMitZeile);
  return c.bericht;
}

/**
 * Der taegliche Lauf (Abschnitt 9). 200 auch bei Teilfehlern (`errors`), 409,
 * solange ein anderer Lauf arbeitet. Der Probelauf nimmt keine Sperre — er
 * schreibt nichts. Wirft nur, wenn schon das Lesen der Kandidaten aus der
 * Datenbank scheitert (die Route antwortet dann 500); ein Fehler beim Lesen
 * der Ordner zaehlt nur als `errors`.
 */
export async function unterlagenFristenLauf(opts: { jetzt?: Date; dryRun?: boolean } = {}): Promise<LaufAntwort> {
  const jetzt = opts.jetzt ?? new Date();
  const dryRun = opts.dryRun === true;
  if (dryRun) return { status: 200, body: await laufen(jetzt, true) };

  if (laufAktiv) return { status: 409, body: { error: LAUF_MELDUNGEN.LAEUFT_BEREITS } };
  laufAktiv = true;
  try {
    return { status: 200, body: await laufen(jetzt, false) };
  } finally {
    laufAktiv = false;
  }
}
