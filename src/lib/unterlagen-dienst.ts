/**
 * CREDO HR-Portal – Unterlagen nachfordern: HR-Dienst (Paket 4, nur Server)
 *
 * Teil 1 (Schritt 4): die Uebersicht fuer die Vorgangsansicht und die fuenf
 * Aktionen auf eine Nachforderung — anfordern, ergaenzen, Frist aendern, Link
 * erneut senden, zurueckziehen —, dazu die Mails an die Person
 * (`personenMailSenden`) und an HR (`hrMeldungSenden`, `hrVollstaendigMelden`).
 * Die Entscheidungen ueber einzelne Positionen (annehmen, zurueckweisen,
 * entfaellt, Annahme zuruecknehmen) und das Oeffnen von Dateien ergaenzt
 * Schritt 6 in derselben Form (`UnterlagenDienstAntwort`, gleiche Sperren).
 *
 * Wer ruft was:
 *   POST /api/onboarding/[id]/unterlagen   → unterlagenAktionAusfuehren (Konsole: fehlerKennung)
 *   GET  /api/onboarding/[id]              → unterlagenUebersichtLaden
 *   Upload-Seite, „Übermitteln" (Schritt 5) → hrVollstaendigMelden (nach der Antwort)
 *   Taeglicher Lauf (Schritt 7)            → personenMailSenden samt unterlagenLinkUrl
 *                                            (die Payload baut der Aufrufer),
 *                                            hrMeldungSenden (Merker per `merker`),
 *                                            hrVollstaendigMelden,
 *                                            unterlagenSperreNehmen/-Freigeben
 *
 * Die Regeln (Feinplanung docs/module/onboarding/paket4-feinplanung.md):
 *
 *   1. **Pruefreihenfolge** jeder Aktion: 403 (nicht HR_EDIT_ROLES) → 404
 *      (Vorgang unbekannt ODER fremder Mandant, derselbe Text) → 409 (Sperre
 *      je Vorgang belegt) → fachliche Pruefung (400/409) → Vorlage → eine
 *      Transaktion → Mail NACH dem Commit. Kinder haengen am Vorgang: eine
 *      Nachforderung wird nur mit `bereichWhere(vorgangId)` gesucht, eine
 *      fremde ergibt dieselbe 404 wie eine unbekannte (Abschnitt 6).
 *   2. **Sperren in fester Reihenfolge:** Vorgang → Nachforderung → Position →
 *      Datei (3.1). Wer der Person eine Mail schickt, sperrt zuerst den Vorgang
 *      (`vorgangSperren`, bei EXPIRED 0 Treffer → 409), dann die Nachforderung
 *      (bedingtes `updateMany … status LAUFEND`; beim Anfordern gibt es noch
 *      keine), und ERST DANN zaehlt er die Mail-Bremse und schreibt.
 *      Zurueckziehen sperrt nur die Nachforderung — es bleibt auch bei EXPIRED
 *      erlaubt (EP-3) und verschickt nichts.
 *   3. **Mails an die Person** gehen NUR ueber `sendEventEmail` mit
 *      `overrideTo` = Adresse des Links, NIE ueber `triggerWebhooks`: Der
 *      Dispatcher reichte die Payload samt Upload-Link an jede frei
 *      konfigurierte Webhook-URL weiter, und der Link ist ein Zugang zur
 *      Personalakte (8.1, zweite begruendete Ausnahme neben dem
 *      Dokumentenpaket). `overrideTo` verwirft auch An, CC und BCC der Vorlage.
 *      Die HR-Mails laufen ueber `triggerWebhooks` — ihre Payload traegt weder
 *      Link noch Adresse der Person noch Namen von Unterlagen.
 *   4. **Link vor dem Versand:** Die Link-Zeile (nur `hashToken`, Klartext nur
 *      in URL und Mail) entsteht in der Transaktion der Aktion mit
 *      `mailStatus AUSSTEHEND`; danach traegt sie das Ergebnis. SENT →
 *      `gesendetAm`/`messageId`, FAILED holt der Lauf nach, SKIPPED nie (8.4).
 *   5. **Entwerten** (5.1): bei Adresswechsel sofort, in derselben Transaktion
 *      wie der neue Link (ADRESSE → 404); mit „frühere Links sperren" erst NACH
 *      SENT (GESPERRT → 410). Nie bei FAILED oder SKIPPED — ein SMTP-Timeout
 *      meldet FAILED auch bei angenommener Mail.
 *   6. **Mail-Bremse** (5.2): hoechstens 6 Mails je Stunde und 20 je Tag an die
 *      Person, gezaehlt aus `UnterlagenLink` (von HR angelegt, `erstelltVonId`
 *      gesetzt) — das uebersteht einen Neustart. Darueber 429 mit
 *      `Retry-After`, auch beim Anfordern (Tabelle 6.1). Gezaehlt wird ueber
 *      ALLE Nachforderungen des Vorgangs, nicht nur ueber die laufende: Sonst
 *      begaenne jedes „Zurückziehen" + „Anfordern" mit leerem Kontingent — die
 *      Vervielfachung, die 5.2 schon fuer einen Schluessel je Link ausschliesst.
 *      Solange eine Nachforderung laeuft, ist das dieselbe Zahl wie „je
 *      Nachforderung". „Link erneut senden" zusaetzlich 10 Minuten nach der
 *      letzten zugestellten ERNEUT-Mail.
 *   7. **Statuscodes (EP-11):** Anfordern, Ergaenzen und Frist aendern
 *      antworten 2xx, sobald der Zustand gespeichert ist; das Ergebnis der Mail
 *      steht in `mail`, bei FAILED/SKIPPED mit `warnung`. Nur „erneut senden"
 *      antwortet 201/502/409, weil die Mail dort die Hauptsache ist.
 *   8. **N2:** Ist die Mail versendet, laesst sich ihr Ergebnis aber nicht
 *      speichern, wird es einmal wiederholt; scheitert auch das, bleibt die
 *      Antwort 2xx mit der Warnung „versendet, bitte nicht erneut senden" —
 *      nie 500 oder 502. Dasselbe gilt fuer „frühere Links sperren" nach SENT:
 *      Der einzige Weg dorthin waere eine weitere Mail.
 *   9. **Protokoll** im selben Commit wie die Aenderung, `details` nur mit IDs,
 *      Katalogschluesseln, Fristen und Laengen (Abschnitt 11). Die Konsole
 *      bekommt nur ein Praefix, IDs und `error.code ?? error.name`.
 *  10. **Prozesslokale Sperre** `laufendeUnterlagenAktionen` je `MODUL:vorgangId`
 *      fuer HR-Aktionen UND den taeglichen Lauf. Sie traegt nur bei EINEM
 *      Container; die Datenbank sichert die Zustaende trotzdem ueber die
 *      Zeilensperren, den Unique-Index `laufendSchluessel` und die Bremse aus
 *      der Datenbank.
 */

import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { VORLAGE_DEAKTIVIERT_DETAIL } from "@/lib/abteilungsaufgaben";
import { prisma } from "@/lib/db";
import { ladeErlaubteDomains } from "@/lib/empfaenger-allowlist";
import { empfaengerFreigegeben } from "@/lib/empfaenger-freigabe";
import { betreffMitVerschachteltenMarkern, getEventDefinition, verboteneBetreffVariablen } from "@/lib/events";
import { ablaufKalendertag, heuteInBerlin, kalendertagAlsDatum, type Kalendertag } from "@/lib/kalendertag";
import { resolveEventTemplate, sendEventEmail, type EventEmailResult } from "@/lib/mailer";
import { canAccessProcess, HR_EDIT_ROLES, type SessionPayload } from "@/lib/permissions";
import { hashToken } from "@/lib/token-hash";
import {
  BREMSEN,
  MAIL_DETAIL_MAX,
  MELDUNGEN,
  UNTERLAGEN_AUDIT,
  aktionsTexte,
  eingabePruefen,
  erneutSendenSperreBis,
  erneutSendenStatus,
  fristPruefen,
  laufendSchluessel,
  linkGueltigBisFuer,
  linkLebt,
  loeschenAbBerechnen,
  nachforderungLinkende,
  nachforderungUebergang,
  uebersichtBauen,
  vollstaendigMerker,
  wartetAufPerson,
  type AnfordernAntwort,
  type AuswahlEintrag,
  type EmpfaengerVorschlag,
  type ErneutSendenAntwort,
  type LinkAnlass,
  type NachforderungEingabe,
  type NachforderungsAktionAntwort,
  type UnterlagenFehlerAntwort,
  type UnterlagenMailErgebnis,
  type UnterlagenModul,
  type UnterlagenUebersicht,
} from "@/lib/unterlagen";
import { entwuerfeLoeschen } from "@/lib/unterlagen-dateien";
import {
  aufforderungMailFelder,
  UNTERLAGEN_EVENTS,
  vollstaendigMailFelder,
  type UnterlagenAufforderungAnlass,
  type UnterlagenMailPayload,
  type UnterlagenMailPosition,
  type UnterlagenMailVorgang,
} from "@/lib/unterlagen-mail";
import { getBaseUrl } from "@/lib/url";
import { gleicheAdresse } from "@/lib/validations/onboarding";
import type { PositionEingabeDaten, UnterlagenAktionInput } from "@/lib/validations/unterlagen";
import { triggerWebhooks } from "@/lib/webhooks";
import {
  onboardingBaustein,
  onboardingVorgangAusAnsicht,
  type OnboardingUnterlagenQuelle,
} from "@/lib/unterlagen-onboarding";

// =============================================
// Typen: Antwort und Modul-Baustein
// =============================================

/**
 * Antwort jeder Dienstfunktion — die Route gibt sie 1:1 aus (Status, Body,
 * Kopfzeilen). Jeder Body wird an seiner Entstehungsstelle per `satisfies` an
 * den Vertrag in unterlagen.ts gebunden (`AnfordernAntwort`,
 * `NachforderungsAktionAntwort`, `ErneutSendenAntwort`,
 * `UnterlagenFehlerAntwort`) — danach lesen Karte und Dialoge.
 */
export interface UnterlagenDienstAntwort {
  status: number;
  body: Record<string, unknown>;
  /** Nur bei 429: `Retry-After` in Sekunden. */
  headers?: Record<string, string>;
}

/**
 * Die Spalten, ueber die eine Nachforderung an ihrem Vorgang haengt — genau
 * EINE ist gesetzt, passend zu `modul` (3.1). Stufe 2 ergaenzt hier
 * offboardingId, civilServiceId, …; Typen und Auswahl ziehen von selbst mit.
 */
const BEZUG_AUSWAHL = { onboardingId: true } as const satisfies Prisma.UnterlagenNachforderungSelect;
type BezugSpalte = keyof typeof BEZUG_AUSWAHL;
/** Beim Anlegen: genau eine Bezugsspalte (Stufe 2: eine Union). */
export type NachforderungsBezug = { [K in BezugSpalte]: Record<K, string> }[BezugSpalte];
/** Gelesen: alle Bezugsspalten, nullbar. */
export type NachforderungsBezugZeile = Partial<Record<BezugSpalte, string | null>>;

/** Der Vorgang, wie der Dienst ihn braucht — modulneutral. Der Baustein reichert ihn an. */
export interface UnterlagenVorgang {
  modul: UnterlagenModul;
  id: string;
  organizationId: string;
  displayId: string | null;
  status: string;
  /** `Organization.name` */
  einrichtung: string;
  vorname: string | null;
  nachname: string | null;
  /** Die Adresse im Vorgang — immer erlaubt (`empfaengerFreigegeben`), erster Vorschlag. */
  email: string;
  /** Wird der Vorgang nicht mehr bearbeitet (Onboarding: EXPIRED)? Sperrt jede Mail an die Person (EP-3). */
  eingestellt: boolean;
}

/**
 * Die Schnittstelle je Vorgangsart (Abschnitt 7). Stufe 1 kennt nur
 * ONBOARDING (src/lib/unterlagen-onboarding.ts); Stufe 2 fuegt je Modul einen
 * Baustein hinzu, ohne den Dienst umzubauen. Methoden-Schreibweise mit Absicht:
 * So passt ein Baustein mit angereichertem Vorgang (`V`) in das Register.
 */
export interface UnterlagenModulBaustein<V extends UnterlagenVorgang = UnterlagenVorgang> {
  modul: UnterlagenModul;
  /** Laedt den Vorgang mit eigenem, schmalem `select`; null, wenn es ihn nicht gibt. */
  vorgangLaden(id: string): Promise<V | null>;
  /** Darf fuer diesen Vorgang (jetzt) eine Nachforderung angelegt werden? Sonst der Grund im Klartext. */
  verfuegbar(v: V): { ok: true } | { ok: false; grund: string };
  /** Zeilensperre des Vorgangs bis zum Commit; false, wenn er eingestellt ist oder fehlt. */
  vorgangSperren(tx: Prisma.TransactionClient, id: string): Promise<boolean>;
  /** Adressvorschlaege im Dialog, die Adresse im Vorgang zuerst. */
  empfaengerVorschlaege(v: V): EmpfaengerVorschlag[];
  /** Die waehlbaren Katalogarten samt „sensibel", „erlaubt", Schriftform und Ablaufdatum. */
  auswahl(v: V): AuswahlEintrag[];
  /** Stufe 2 (Mutterschutz): false = keine Vorgangsnummer und keine Unterlagennamen in Mails. */
  mitDetails(v: V): boolean;
  /** Filter auf die Nachforderungen DIESES Vorgangs (`linkBereichWhere`-Muster). */
  bereichWhere(id: string): Prisma.UnterlagenNachforderungWhereInput;
  /** Die Spalten des Kopfes beim Anlegen — `nachforderungAnlegen` ist ihr einziger Schreiber. */
  kopfDaten(id: string): { modul: UnterlagenModul } & NachforderungsBezug;
  /** Die Vorgangs-ID einer geladenen Nachforderung (genau eines der Felder ist gesetzt). */
  vorgangIdAus(bezug: NachforderungsBezugZeile): string | null;
  /** Bezug des Protokolleintrags. */
  audit(id: string): { processType: string; fk: Record<string, string> };
  /** Pfad der Vorgangsansicht im Portal (HR-Mails). */
  portalPfad(id: string): string;
  /** Basis der HR-Routen dieses Moduls (Datei-URLs der Karte). */
  apiBasis(id: string): string;
}

const BAUSTEINE: Readonly<Record<UnterlagenModul, UnterlagenModulBaustein>> = {
  ONBOARDING: onboardingBaustein,
};

// =============================================
// Kleine Helfer
// =============================================

const MS_PRO_MINUTE = 60_000;
const MS_PRO_STUNDE = 60 * MS_PRO_MINUTE;
const MS_PRO_TAG = 24 * MS_PRO_STUNDE;

/**
 * Bricht eine Transaktion ab und liefert die Antwort dafuer. Eigene Klasse,
 * weil nur eine Ausnahme die Transaktion zurueckrollt.
 */
class UnterlagenAbbruch extends Error {
  constructor(readonly antwort: UnterlagenDienstAntwort) {
    super("UnterlagenAbbruch");
    this.name = "UnterlagenAbbruch";
  }
}

function fehler(
  status: number,
  text: string,
  grund?: string,
  extra: Pick<UnterlagenFehlerAntwort, "typ" | "hinweis" | "sperreBis"> = {},
): UnterlagenDienstAntwort {
  return { status, body: { error: text, ...(grund ? { grund } : {}), ...extra } satisfies UnterlagenFehlerAntwort };
}

/**
 * Fuer die Konsole: nur `code ?? name`, nie die Meldung (sie kann Adressen
 * oder Pfade tragen, Abschnitt 11). Auch die Routen des Pakets loggen damit.
 */
export function fehlerKennung(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const { code, name } = err as { code?: unknown; name?: unknown };
    if (code !== undefined && code !== null) return String(code);
    if (typeof name === "string") return name;
  }
  return "unbekannt";
}

/** P2002 auf einem bestimmten Unique-Index (nur ueber den Code, wie api/onboarding/route.ts). */
function eindeutigkeitVerletzt(err: unknown, feld: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  const { code, meta } = err as { code?: unknown; meta?: { target?: unknown } };
  if (code !== "P2002") return false;
  const ziel = meta?.target;
  if (Array.isArray(ziel)) return ziel.includes(feld);
  return typeof ziel === "string" && ziel.includes(feld);
}

function kuerzen(text: string | null | undefined): string | null {
  const t = (text ?? "").trim();
  return t ? t.slice(0, MAIL_DETAIL_MAX) : null;
}

function kalendertagVon(wert: Date | string): Kalendertag {
  const tag = ablaufKalendertag(wert);
  if (!tag) throw new Error("Unlesbares Datum");
  return tag;
}

function name(u: { firstName: string; lastName: string } | null | undefined): string | null {
  return u ? `${u.firstName} ${u.lastName}`.trim() || null : null;
}

/**
 * `${APP_URL}/unterlagen/<token>` — der persoenliche Link, nur in URL und Mail
 * (5.1). Exportiert fuer den taeglichen Lauf: `personenMailSenden` bekommt die
 * fertige Payload, der Aufrufer baut den Link hinein.
 */
export function unterlagenLinkUrl(token: string): string {
  return `${getBaseUrl()}/unterlagen/${token}`;
}

// =============================================
// Prozesslokale Sperre je Vorgang (Abschnitt 7)
// =============================================

/**
 * Laufende Aktionen je Vorgang, Schluessel "MODUL:vorgangId". BEWUSST
 * prozesslokal (ein Container), wie `laufendeAbteilungsVersendungen`: Die
 * Datenbank sichert die Zustaende ohnehin, die Sperre verhindert zwei Mails
 * aus einem Doppelklick und einen Lauf, der zwischen die Aktion von HR faehrt.
 */
const laufendeUnterlagenAktionen = new Set<string>();

/** Sperre nehmen — `false`, wenn fuer den Vorgang schon eine Aktion oder der Lauf laeuft. */
export function unterlagenSperreNehmen(modul: UnterlagenModul, vorgangId: string): boolean {
  const schluessel = `${modul}:${vorgangId}`;
  if (laufendeUnterlagenAktionen.has(schluessel)) return false;
  laufendeUnterlagenAktionen.add(schluessel);
  return true;
}

export function unterlagenSperreFreigeben(modul: UnterlagenModul, vorgangId: string): void {
  laufendeUnterlagenAktionen.delete(`${modul}:${vorgangId}`);
}

// =============================================
// Vorpruefungen: Empfaenger, Vorlage, Mail-Bremse
// =============================================

/**
 * Freigabe und Bestaetigung einer Empfaengeradresse (Abschnitt 6.1, SI-K5).
 *
 * Die Adresse im Vorgang ist immer erlaubt. Eine abweichende muss in der
 * Freigabeliste stehen (leere Liste = keine Einschraenkung) UND ausdruecklich
 * bestaetigt sein (`adresseBestaetigt`) — sonst 409, bevor irgendetwas
 * geschrieben wird. Verglichen wird ohne Gross-/Kleinschreibung.
 */
async function empfaengerPruefen(
  empfaenger: string,
  vorgangsAdresse: string,
  adresseBestaetigt: boolean | undefined,
): Promise<{ ok: true; adresse: string; abweichend: boolean } | { ok: false; antwort: UnterlagenDienstAntwort }> {
  const adresse = empfaenger.trim();
  if (gleicheAdresse(adresse, vorgangsAdresse)) return { ok: true, adresse, abweichend: false };
  const domains = await ladeErlaubteDomains();
  if (!empfaengerFreigegeben({ empfaenger: adresse, empfaengerVorgang: vorgangsAdresse, domains })) {
    return {
      ok: false,
      antwort: fehler(409, MELDUNGEN.EMPFAENGER_NICHT_FREIGEGEBEN, "EMPFAENGER_NICHT_FREIGEGEBEN"),
    };
  }
  if (adresseBestaetigt !== true) {
    return { ok: false, antwort: fehler(409, MELDUNGEN.ADRESSE_NICHT_BESTAETIGT, "ADRESSE_NICHT_BESTAETIGT") };
  }
  return { ok: true, adresse, abweichend: true };
}

/** Die drei Ereignisse mit persoenlichem Upload-Link — nur `sendEventEmail`, nie `triggerWebhooks`. */
export type UnterlagenPersonenEvent =
  | typeof UNTERLAGEN_EVENTS.ANGEFORDERT
  | typeof UNTERLAGEN_EVENTS.ERINNERUNG
  | typeof UNTERLAGEN_EVENTS.ZURUECKGEWIESEN;

/** Die beiden HR-Mails — ueber `triggerWebhooks`, ohne Link, Adresse und Unterlagennamen. */
export type UnterlagenHrEvent = typeof UNTERLAGEN_EVENTS.VOLLSTAENDIG | typeof UNTERLAGEN_EVENTS.FRIST_VERSTRICHEN;

/**
 * Taugt die gespeicherte Vorlage einer Mail an die Person? Geprueft VOR jeder
 * Anlage (409 ohne jede Aenderung), weil eine gespeicherte Vorlage den
 * Standardtext vollstaendig verdraengt:
 *
 *   - deaktiviert: `sendEventEmail` meldete SKIPPED, und SKIPPED holt der Lauf
 *     nie nach — die Nachforderung liefe, ohne dass die Person je davon erfuehre;
 *   - ohne `{{link}}` im HTML-Teil: Die Mail kaeme an, die Person koennte aber
 *     nichts hochladen;
 *   - ein gesperrter Platzhalter im Betreff (`betreffOhne`, etwa `{{link}}`):
 *     Der Betreff steht 90 Tage im Versandprotokoll. Der Editor weist so einen
 *     Betreff schon ab; hier faellt auch eine am Editor vorbei gespeicherte Zeile auf.
 */
async function personenVorlagePruefen(event: UnterlagenPersonenEvent): Promise<UnterlagenDienstAntwort | null> {
  const name = getEventDefinition(event)?.name ?? event;
  const vorlage = await resolveEventTemplate(event);
  if (!vorlage) {
    return fehler(
      409,
      `Für die E-Mail „${name}“ ist keine Vorlage hinterlegt. Ohne sie erhält die Person keinen Link.`,
      "VORLAGE_FEHLT",
    );
  }
  if (!vorlage.isActive) {
    return fehler(
      409,
      `Die E-Mail-Vorlage „${name}“ ist deaktiviert. Ohne sie erhält die Person keinen Link – bitte aktivieren Sie sie unter Einstellungen → E-Mail-Vorlagen.`,
      "VORLAGE_DEAKTIVIERT",
    );
  }
  if (!vorlage.bodyHtml.includes("{{link}}")) {
    return fehler(
      409,
      `Die E-Mail-Vorlage „${name}“ enthält den Platzhalter {{link}} nicht. Die Person bekäme keinen Link zum Hochladen – bitte ergänzen Sie ihn unter Einstellungen → E-Mail-Vorlagen.`,
      "VORLAGE_OHNE_LINK",
    );
  }
  if (
    verboteneBetreffVariablen(event, vorlage.subject).length > 0 ||
    betreffMitVerschachteltenMarkern(event, vorlage.subject)
  ) {
    return fehler(
      409,
      `Der Betreff der E-Mail-Vorlage „${name}“ enthält einen gesperrten Platzhalter (etwa {{link}}). Der Betreff steht 90 Tage im Versandprotokoll – bitte korrigieren Sie ihn unter Einstellungen → E-Mail-Vorlagen.`,
      "VORLAGE_BETREFF",
    );
  }
  return null;
}

/**
 * Mail-Bremse (5.2): hoechstens 6 Mails je Stunde und 20 je Tag an die Person
 * (gleitende Fenster), gezaehlt aus den Link-Zeilen, die HR angelegt hat — und
 * zwar ueber ALLE Nachforderungen des Vorgangs (Regel 6 im Dateikopf): Sonst
 * fuehrte „Zurückziehen" + „Anfordern" im Wechsel an der Bremse vorbei, und das
 * 429 beim Anfordern (Tabelle 6.1) waere unerreichbar.
 *
 * Aufzurufen IN der Transaktion NACH der Sperre des Vorgangs — erst sperren,
 * dann zaehlen, sonst zaehlten zwei gleichzeitige Aktionen denselben Stand.
 * Jede Aktion mit Mail an die Person nimmt diese Sperre zuerst.
 *
 * `Retry-After`: bis die aelteste Mail aus dem Fenster faellt, die unter der
 * Grenze noch stoert.
 */
async function mailBremsePruefen(
  tx: Prisma.TransactionClient,
  bereich: Prisma.UnterlagenNachforderungWhereInput,
  jetzt: Date,
): Promise<UnterlagenDienstAntwort | null> {
  const t = jetzt.getTime();
  const links = await tx.unterlagenLink.findMany({
    where: { nachforderung: bereich, erstelltVonId: { not: null }, createdAt: { gte: new Date(t - MS_PRO_TAG) } },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const tag = links.map((l) => l.createdAt.getTime());
  const stunde = tag.filter((z) => z >= t - MS_PRO_STUNDE);
  let frei: number | null = null;
  if (stunde.length >= BREMSEN.MAILS_JE_STUNDE) {
    frei = stunde[stunde.length - BREMSEN.MAILS_JE_STUNDE] + MS_PRO_STUNDE;
  }
  if (tag.length >= BREMSEN.MAILS_JE_TAG) {
    frei = Math.max(frei ?? 0, tag[tag.length - BREMSEN.MAILS_JE_TAG] + MS_PRO_TAG);
  }
  if (frei === null) return null;
  const sekunden = Math.max(1, Math.ceil((frei - t) / 1000));
  return {
    status: 429,
    body: { error: MELDUNGEN.MAIL_BREMSE, grund: "MAIL_BREMSE" } satisfies UnterlagenFehlerAntwort,
    headers: { "Retry-After": String(sekunden) },
  };
}

// =============================================
// Link und Mails
// =============================================

/**
 * Legt die Link-Zeile einer Mail an die Person an — IN der Transaktion der
 * Aktion, VOR dem Versand, mit `mailStatus AUSSTEHEND`. Gespeichert wird nur
 * der Hash; der Klartext geht an den Aufrufer und von dort nur in die Mail.
 * `gueltigBis` = Frist + 14 (5.1).
 */
async function linkAnlegen(
  tx: Prisma.TransactionClient,
  opts: {
    nachforderungId: string;
    anlass: LinkAnlass;
    empfaenger: string;
    frist: Kalendertag;
    erstelltVonId: string | null;
    positionId?: string | null;
    jetzt: Date;
  },
): Promise<{ linkId: string; token: string }> {
  const token = randomUUID();
  const link = await tx.unterlagenLink.create({
    data: {
      nachforderungId: opts.nachforderungId,
      tokenHash: hashToken(token),
      gueltigBis: kalendertagAlsDatum(linkGueltigBisFuer(opts.frist)),
      anlass: opts.anlass,
      positionId: opts.positionId ?? null,
      empfaenger: opts.empfaenger,
      erstelltVonId: opts.erstelltVonId,
      createdAt: opts.jetzt,
    },
    select: { id: true },
  });
  return { linkId: link.id, token };
}

/**
 * Schreibt das Ergebnis einer Mail an die Link-Zeile (8.4) — bedingt auf
 * AUSSTEHEND, damit nichts ein spaeteres Ergebnis ueberschreibt. Scheitert die
 * Datenbank, wird EINMAL wiederholt (N2).
 *
 * @returns false, wenn auch der zweite Versuch scheiterte
 */
async function linkErgebnisSpeichern(
  linkId: string,
  ergebnis: Pick<EventEmailResult, "status" | "detail" | "messageId">,
  jetzt: Date,
): Promise<boolean> {
  const data: Prisma.UnterlagenLinkUpdateManyMutationInput = {
    mailStatus: ergebnis.status,
    mailDetail: ergebnis.status === "SENT" ? null : kuerzen(ergebnis.detail),
    messageId: ergebnis.status === "SENT" ? (ergebnis.messageId ?? null) : null,
    ...(ergebnis.status === "SENT" ? { gesendetAm: jetzt } : {}),
  };
  for (let versuch = 1; versuch <= 2; versuch++) {
    try {
      await prisma.unterlagenLink.updateMany({ where: { id: linkId, mailStatus: "AUSSTEHEND" }, data });
      return true;
    } catch (err) {
      console.error(`[Unterlagen] Ergebnis der Mail (Link ${linkId}) nicht gespeichert, Versuch ${versuch}:`, fehlerKennung(err));
    }
  }
  return false;
}

/**
 * Eine Mail an die Person, NACH dem Commit, der die Link-Zeile angelegt hat.
 *
 * Bewusst `sendEventEmail` DIREKT und NIE `triggerWebhooks` (Regel 3 im
 * Dateikopf): Die Payload traegt den persoenlichen Upload-Link. `overrideTo`
 * ist die Adresse des Links — die Vorlage kann den Empfaenger nicht umlenken,
 * auch nicht per CC oder BCC.
 *
 * Wirft nie. Scheitert schon die Vorbereitung (Datenbank), ging nichts hinaus:
 * Der Link steht auf FAILED, der Lauf holt nach. Ist die Mail versendet und
 * nur das Speichern scheitert, meldet das Ergebnis `nachweisFehlt` (N2).
 */
export async function personenMailSenden(opts: {
  event: UnterlagenPersonenEvent;
  linkId: string;
  jetzt: Date;
  vorbereiten: () => Promise<{ empfaenger: string; payload: UnterlagenMailPayload }>;
}): Promise<UnterlagenMailErgebnis> {
  let vorbereitet: { empfaenger: string; payload: UnterlagenMailPayload };
  try {
    vorbereitet = await opts.vorbereiten();
  } catch (err) {
    console.error(`[Unterlagen] Mail ${opts.event} (Link ${opts.linkId}) nicht vorbereitet:`, fehlerKennung(err));
    const detail = "Die E-Mail konnte nicht vorbereitet werden.";
    await linkErgebnisSpeichern(opts.linkId, { status: "FAILED", detail }, opts.jetzt);
    return { status: "FAILED", detail };
  }

  const ergebnis = await sendEventEmail(opts.event, vorbereitet.payload, { overrideTo: vorbereitet.empfaenger });
  const gespeichert = await linkErgebnisSpeichern(opts.linkId, ergebnis, opts.jetzt);
  return {
    status: ergebnis.status,
    detail: ergebnis.status === "SENT" ? null : kuerzen(ergebnis.detail),
    ...(ergebnis.status === "SENT" && !gespeichert ? { nachweisFehlt: true } : {}),
  };
}

/** Was eine Mail an die Person von der Nachforderung liest. */
const MAIL_AUSWAHL = {
  id: true,
  frist: true,
  nachricht: true,
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
    },
  },
} satisfies Prisma.UnterlagenNachforderungSelect;

function mailVorgang(
  baustein: UnterlagenModulBaustein,
  v: UnterlagenVorgang,
  nachforderungId: string,
  frist: Kalendertag,
): UnterlagenMailVorgang {
  return {
    nachforderungId,
    modul: baustein.modul,
    refId: v.id,
    displayId: v.displayId,
    einrichtung: v.einrichtung,
    vorname: v.vorname,
    nachname: v.nachname,
    frist,
    mitDetails: baustein.mitDetails(v),
  };
}

function mailPosition(
  p: { id: string; bezeichnung: string; hinweis: string | null; sensibel: boolean; originalErforderlich: boolean; status: string; einreichungen: number },
  neu: ReadonlySet<string>,
): UnterlagenMailPosition {
  return {
    bezeichnung: p.bezeichnung,
    hinweis: p.hinweis,
    sensibel: p.sensibel,
    originalErforderlich: p.originalErforderlich,
    status: p.status,
    neu: neu.has(p.id),
    einreichungen: p.einreichungen,
  };
}

/**
 * `unterlagen-angefordert` (Anfordern, Ergaenzen, Frist aendern, erneut
 * senden). Die Payload wird aus dem GESPEICHERTEN Stand gebaut — nach dem
 * Commit frisch gelesen, damit die Mail sagt, was wirklich gilt.
 */
async function aufforderungSenden(
  ctx: AktionsKontext,
  opts: { nachforderungId: string; linkId: string; token: string; anlass: UnterlagenAufforderungAnlass; neu?: ReadonlySet<string> },
): Promise<UnterlagenMailErgebnis> {
  return personenMailSenden({
    event: UNTERLAGEN_EVENTS.ANGEFORDERT,
    linkId: opts.linkId,
    jetzt: ctx.jetzt,
    vorbereiten: async () => {
      const [stand, link] = await Promise.all([
        prisma.unterlagenNachforderung.findUnique({ where: { id: opts.nachforderungId }, select: MAIL_AUSWAHL }),
        prisma.unterlagenLink.findUnique({ where: { id: opts.linkId }, select: { empfaenger: true, gueltigBis: true } }),
      ]);
      if (!stand || !link) throw new Error("Nachforderung oder Link fehlt");
      const frist = kalendertagVon(stand.frist);
      return {
        empfaenger: link.empfaenger,
        payload: aufforderungMailFelder({
          vorgang: mailVorgang(ctx.baustein, ctx.v, stand.id, frist),
          positionen: stand.positionen.map((p) => mailPosition(p, opts.neu ?? new Set())),
          empfaenger: link.empfaenger,
          link: unterlagenLinkUrl(opts.token),
          linkGueltigBis: kalendertagVon(link.gueltigBis),
          heute: ctx.heute,
          nachricht: stand.nachricht,
          anlass: opts.anlass,
        }),
      };
    },
  });
}

// =============================================
// HR-Mails (vollstaendig, Frist verstrichen)
// =============================================

/**
 * Grund einer nicht zugestellten HR-Mail, wie er an der Nachforderung steht
 * (`hrMeldungDetail`). Nur ein Code, NIE der Rohtext des Mailers: Eine
 * SMTP-Ablehnung nennt darin Adressen, und die Spalte bleibt so lange wie der
 * Vorgang (Abschnitt 11, E-7). Die Karte braucht nur „kein Empfänger".
 */
export const HR_MELDUNG_GRUENDE = {
  /** Weder die anfordernde HR-Kraft noch das HR-Postfach (8.1). */
  KEIN_EMPFAENGER: "KEIN_EMPFAENGER",
  VORLAGE_DEAKTIVIERT: "VORLAGE_DEAKTIVIERT",
  /** Uebersprungen aus einem anderen Grund (etwa keine Vorlage). */
  NICHT_VERSENDET: "NICHT_VERSENDET",
  VERSAND_FEHLGESCHLAGEN: "VERSAND_FEHLGESCHLAGEN",
} as const;

/**
 * Hat der Mailer eine Mail uebersprungen, weil die Vorlage keinen Empfaenger
 * ergab? Die beiden Wortlaute stehen in `sendEventEmail` (mailer.ts); ein Test
 * haelt sie gegen den Quelltext, wie `versandDetailLesbar` (abteilungsaufgaben.ts).
 */
function ohneEmpfaengerDetail(detail: string | null | undefined): boolean {
  const d = (detail ?? "").trim();
  return d.startsWith("Kein Empfaenger") || d.startsWith("Empfaenger ");
}

/** Das Ergebnis einer HR-Mail als Grundcode fuer `hrMeldungDetail` (null bei SENT). */
export function hrMeldungGrund(mail: Pick<UnterlagenMailErgebnis, "status" | "detail">): string | null {
  if (mail.status === "SENT") return null;
  if (mail.status === "FAILED") return HR_MELDUNG_GRUENDE.VERSAND_FEHLGESCHLAGEN;
  if (ohneEmpfaengerDetail(mail.detail)) return HR_MELDUNG_GRUENDE.KEIN_EMPFAENGER;
  if ((mail.detail ?? "").trim() === VORLAGE_DEAKTIVIERT_DETAIL) return HR_MELDUNG_GRUENDE.VORLAGE_DEAKTIVIERT;
  return HR_MELDUNG_GRUENDE.NICHT_VERSENDET;
}

/** Die letzte HR-Mail ging an niemanden — Hinweis der Karte (8.1). Liest die gespeicherten Spalten. */
export function hrMeldungOhneEmpfaenger(status: string | null | undefined, grund: string | null | undefined): boolean {
  return status === "SKIPPED" && grund === HR_MELDUNG_GRUENDE.KEIN_EMPFAENGER;
}

/**
 * Eine HR-Mail ueber den Dispatcher (`triggerWebhooks`, Regel 3) und ihr
 * Ergebnis an der Nachforderung (`hrMeldungStatus` und der Grundcode in
 * `hrMeldungDetail`, fuer den Hinweis der Karte), in EINER Transaktion mit
 * dem Protokolleintrag (bei SENT) und dem Merker des Aufrufers.
 *
 * `merker` (Abschnitt 9): Der taegliche Lauf setzt darueber etwa
 * `fristGemeldetFuer` — bedingt auf den gelesenen Fristwert, im selben Commit
 * wie das AuditLog. Er laeuft bei SENT und SKIPPED, nie bei FAILED: Den
 * Fehlschlag holt der naechste Lauf nach. Scheitert die Transaktion, bleibt
 * alles ungeschrieben (auch der Merker), und der Lauf versucht es erneut.
 *
 * Wirft nie; ein Dispatcher ohne Ergebnis zaehlt als FAILED.
 */
export async function hrMeldungSenden(opts: {
  event: UnterlagenHrEvent;
  nachforderungId: string;
  vorgangId: string;
  baustein: UnterlagenModulBaustein;
  payload: UnterlagenMailPayload;
  merker?: (tx: Prisma.TransactionClient, status: "SENT" | "SKIPPED") => Promise<void>;
}): Promise<UnterlagenMailErgebnis> {
  const ergebnis = await triggerWebhooks(opts.event, opts.payload);
  const mail: UnterlagenMailErgebnis = ergebnis
    ? { status: ergebnis.status, detail: ergebnis.status === "SENT" ? null : kuerzen(ergebnis.detail) }
    : { status: "FAILED", detail: "Der Versand lieferte kein Ergebnis." };
  try {
    await prisma.$transaction(async (tx) => {
      await tx.unterlagenNachforderung.updateMany({
        where: { id: opts.nachforderungId },
        data: { hrMeldungStatus: mail.status, hrMeldungDetail: hrMeldungGrund(mail) },
      });
      if (opts.merker && mail.status !== "FAILED") await opts.merker(tx, mail.status);
      if (mail.status === "SENT") {
        const a = opts.baustein.audit(opts.vorgangId);
        await tx.auditLog.create({
          data: {
            userId: null,
            processType: a.processType,
            ...a.fk,
            action: UNTERLAGEN_AUDIT.HR_GEMELDET,
            details: { nachforderungId: opts.nachforderungId, event: opts.event },
          },
        });
      }
    });
  } catch (err) {
    console.error(`[Unterlagen] Ergebnis der HR-Mail ${opts.event} (${opts.nachforderungId}) nicht gespeichert:`, fehlerKennung(err));
  }
  return mail;
}

/** Was die HR-Mails von der Nachforderung lesen. */
const HR_MAIL_AUSWAHL = {
  id: true,
  modul: true,
  ...BEZUG_AUSWAHL,
  status: true,
  frist: true,
  angefordertAm: true,
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
    },
  },
} satisfies Prisma.UnterlagenNachforderungSelect;

/**
 * „Unterlagen vollständig eingegangen" an HR — mit BEDINGTEM ANSPRUCH statt
 * Prozesssperre (Abschnitt 7), fuer `after()` nach dem Uebermitteln (Schritt
 * 5) ebenso wie fuer den Lauf (Schritt 7):
 *
 *   1. `updateMany … WHERE status LAUFEND, vollstaendigSeit = gelesen,
 *      vollstaendigGemeldetAm null → jetzt`. 0 Treffer: nichts zu tun (ein
 *      anderer hat den Anspruch, oder der Merker hat sich bewegt).
 *   2. `triggerWebhooks` (ueber `hrMeldungSenden`).
 *   3. Bei FAILED wird der Anspruch zurueckgegeben, bedingt auf den EIGENEN
 *      Zeitstempel; bei SENT und SKIPPED bleibt er.
 *
 * So geht die Mail hoechstens einmal hinaus, und eine gescheiterte holt der
 * naechste Lauf nach. Wirft nie.
 *
 * @returns das Ergebnis der Mail, oder null, wenn nichts zu melden war
 */
export async function hrVollstaendigMelden(nachforderungId: string, jetzt: Date = new Date()): Promise<UnterlagenMailErgebnis | null> {
  try {
    const n = await prisma.unterlagenNachforderung.findUnique({ where: { id: nachforderungId }, select: HR_MAIL_AUSWAHL });
    if (!n || n.status !== "LAUFEND" || !n.vollstaendigSeit || n.vollstaendigGemeldetAm) return null;
    const baustein = BAUSTEINE[n.modul as UnterlagenModul];
    const vorgangId = baustein?.vorgangIdAus(n);
    if (!baustein || !vorgangId) return null;

    const anspruch = await prisma.unterlagenNachforderung.updateMany({
      where: { id: n.id, status: "LAUFEND", vollstaendigSeit: n.vollstaendigSeit, vollstaendigGemeldetAm: null },
      data: { vollstaendigGemeldetAm: jetzt },
    });
    if (anspruch.count === 0) return null;

    let mail: UnterlagenMailErgebnis;
    try {
      const [v, smtp] = await Promise.all([
        baustein.vorgangLaden(vorgangId),
        prisma.smtpConfig.findUnique({ where: { id: "default" }, select: { replyToEmail: true } }),
      ]);
      if (!v) throw new Error("Vorgang fehlt");
      const payload = vollstaendigMailFelder({
        vorgang: mailVorgang(baustein, v, n.id, kalendertagVon(n.frist)),
        positionen: n.positionen.map((p) => mailPosition(p, new Set())),
        portalLink: `${getBaseUrl()}${baustein.portalPfad(vorgangId)}`,
        anfordernd: n.angefordertVon
          ? { email: n.angefordertVon.email, name: name(n.angefordertVon), aktiv: n.angefordertVon.isActive }
          : null,
        hrPostfach: smtp?.replyToEmail ?? null,
        angefordertAm: n.angefordertAm,
        uebermitteltAm: n.vollstaendigSeit,
      });
      mail = await hrMeldungSenden({
        event: UNTERLAGEN_EVENTS.VOLLSTAENDIG,
        nachforderungId: n.id,
        vorgangId,
        baustein,
        payload,
      });
    } catch (err) {
      console.error(`[Unterlagen] HR-Meldung „vollständig" (${n.id}) nicht vorbereitet:`, fehlerKennung(err));
      mail = { status: "FAILED", detail: "Die E-Mail konnte nicht vorbereitet werden." };
    }

    if (mail.status === "FAILED") {
      await prisma.unterlagenNachforderung.updateMany({
        where: { id: n.id, vollstaendigGemeldetAm: jetzt },
        data: { vollstaendigGemeldetAm: null },
      });
    }
    return mail;
  } catch (err) {
    console.error(`[Unterlagen] HR-Meldung „vollständig" (${nachforderungId}) fehlgeschlagen:`, fehlerKennung(err));
    return null;
  }
}

// =============================================
// Aktionen (POST /api/onboarding/[id]/unterlagen)
// =============================================

interface AktionsKontext {
  baustein: UnterlagenModulBaustein;
  v: UnterlagenVorgang;
  session: SessionPayload;
  jetzt: Date;
  heute: Kalendertag;
}

type Aktion<A extends UnterlagenAktionInput["aktion"]> = Extract<UnterlagenAktionInput, { aktion: A }>;

/** Was die Aktionen von einer Nachforderung lesen (vor und in der Transaktion). */
const AKTION_AUSWAHL = {
  id: true,
  status: true,
  frist: true,
  empfaenger: true,
  nachricht: true,
  vollstaendigSeit: true,
  vollstaendigGemeldetAm: true,
  positionen: {
    orderBy: { reihenfolge: "asc" },
    select: { id: true, reihenfolge: true, typ: true, status: true },
  },
  links: {
    select: { id: true, anlass: true, mailStatus: true, gesendetAm: true, entwertetAm: true, gueltigBis: true },
  },
} satisfies Prisma.UnterlagenNachforderungSelect;

type AktionsStand = Prisma.UnterlagenNachforderungGetPayload<{ select: typeof AKTION_AUSWAHL }>;

/** Die Nachforderung — nur, wenn sie zu DIESEM Vorgang gehoert (Abschnitt 6). */
function nachforderungLaden(
  db: Prisma.TransactionClient,
  ctx: AktionsKontext,
  id: string,
): Promise<AktionsStand | null> {
  return db.unterlagenNachforderung.findFirst({
    where: { id, ...ctx.baustein.bereichWhere(ctx.v.id) },
    select: AKTION_AUSWAHL,
  });
}

/** Sperre des Vorgangs; bei EXPIRED (auch gerade erst gesetzt) Abbruch mit 409 (EP-3). */
async function vorgangSperrenOderAbbrechen(tx: Prisma.TransactionClient, ctx: AktionsKontext): Promise<void> {
  if (!(await ctx.baustein.vorgangSperren(tx, ctx.v.id))) {
    throw new UnterlagenAbbruch(fehler(409, MELDUNGEN.HR_VORGANG_EINGESTELLT, "HR_VORGANG_EINGESTELLT"));
  }
}

/** Sperre der Nachforderung, bedingt auf LAUFEND; sonst Abbruch mit 409. */
async function nachforderungSperrenOderAbbrechen(
  tx: Prisma.TransactionClient,
  ctx: AktionsKontext,
  id: string,
): Promise<void> {
  const gesperrt = await tx.unterlagenNachforderung.updateMany({
    where: { id, ...ctx.baustein.bereichWhere(ctx.v.id), status: "LAUFEND" },
    data: { updatedAt: ctx.jetzt },
  });
  if (gesperrt.count === 0) {
    throw new UnterlagenAbbruch(fehler(409, MELDUNGEN.NICHT_LAUFEND, "NICHT_LAUFEND"));
  }
}

/** Mail-Bremse des Vorgangs (nach dessen Sperre); ueber der Grenze Abbruch mit 429. */
async function mailBremseOderAbbrechen(tx: Prisma.TransactionClient, ctx: AktionsKontext): Promise<void> {
  const bremse = await mailBremsePruefen(tx, ctx.baustein.bereichWhere(ctx.v.id), ctx.jetzt);
  if (bremse) throw new UnterlagenAbbruch(bremse);
}

function auditDaten(
  ctx: AktionsKontext,
  action: string,
  details: Record<string, unknown>,
): Prisma.AuditLogUncheckedCreateInput {
  const a = ctx.baustein.audit(ctx.v.id);
  return {
    userId: ctx.session.userId,
    processType: a.processType,
    ...a.fk,
    action,
    details: details as Prisma.InputJsonValue,
  };
}

/** Ein sensibler Katalogtyp, den der Baustein nicht erlaubt → 409 mit dem Grund im Klartext (Abschnitt 11). */
function sensibelPruefen(
  positionen: ReadonlyArray<PositionEingabeDaten>,
  auswahl: ReadonlyMap<string, AuswahlEintrag>,
): UnterlagenDienstAntwort | null {
  for (const p of positionen) {
    if (p.typ === null) continue;
    const eintrag = auswahl.get(p.typ);
    if (eintrag && !eintrag.erlaubt) {
      return fehler(409, MELDUNGEN.SENSIBEL_NICHT_ERLAUBT, "SENSIBEL_NICHT_ERLAUBT", {
        typ: p.typ,
        ...(eintrag.grund ? { hinweis: eintrag.grund } : {}),
      });
    }
  }
  return null;
}

/**
 * Die Spalten einer neuen Position. Bei einer Katalogart kommen Bezeichnung,
 * Schriftform, „sensibel" und Ablaufdatum aus der Auswahl des Bausteins — nie
 * aus dem Body. Der Hinweis kommt NUR aus dem Body: Der Dialog belegt ihn mit
 * dem Standardhinweis der Art vor (10.1); hat HR ihn dort geloescht, bleibt
 * er leer, statt still wieder aufzutauchen.
 */
function positionsDaten(
  p: PositionEingabeDaten,
  reihenfolge: number,
  auswahl: ReadonlyMap<string, AuswahlEintrag>,
  jetzt: Date,
) {
  if (p.art === "FREI") {
    return {
      reihenfolge,
      typ: null,
      bezeichnung: p.bezeichnung,
      hinweis: p.hinweis ?? null,
      originalErforderlich: p.originalErforderlich,
      sensibel: false,
      fristpflichtig: false,
      angefordertAm: jetzt,
    };
  }
  const eintrag = auswahl.get(p.typ);
  if (!eintrag) throw new Error("Katalogart fehlt in der Auswahl");
  return {
    reihenfolge,
    typ: p.typ,
    bezeichnung: eintrag.label,
    hinweis: p.hinweis ?? null,
    originalErforderlich: eintrag.originalErforderlich,
    sensibel: eintrag.sensibel,
    fristpflichtig: eintrag.fristpflichtig,
    angefordertAm: jetzt,
  };
}

/**
 * Friständerung (5.1): Nur Links, die heute noch leben (nicht entwertet,
 * Linkende nicht ueberschritten), bekommen `gueltigBis = neueFrist + 14`. Ein
 * abgelaufener Link lebt nicht wieder auf.
 */
async function lebendeLinksFortschreiben(
  tx: Prisma.TransactionClient,
  links: AktionsStand["links"],
  alteFrist: Date,
  neueFrist: Kalendertag,
  heute: Kalendertag,
): Promise<number> {
  const ids = links.filter((l) => linkLebt(l, alteFrist, heute)).map((l) => l.id);
  if (ids.length === 0) return 0;
  const r = await tx.unterlagenLink.updateMany({
    where: { id: { in: ids }, entwertetAm: null },
    data: { gueltigBis: kalendertagAlsDatum(linkGueltigBisFuer(neueFrist)) },
  });
  return r.count;
}

// ---- anfordern ----

/**
 * Legt den Kopf samt Positionen an — der EINZIGE Schreiber des Kopfes (3.1).
 * Prisma kennt keine CHECK-Constraints: Dass genau eine Bezugsspalte gesetzt
 * ist, passend zu `modul`, haengt allein daran, dass nur hier angelegt wird
 * und die Spalten aus `baustein.kopfDaten` kommen. `laufendSchluessel` macht
 * den Unique-Index zum Teilindex „hoechstens eine laufende je Vorgang".
 */
async function nachforderungAnlegen(
  tx: Prisma.TransactionClient,
  ctx: AktionsKontext,
  daten: {
    empfaenger: { adresse: string; abweichend: boolean };
    frist: Kalendertag;
    nachricht: string | null;
    positionen: ReadonlyArray<ReturnType<typeof positionsDaten>>;
  },
): Promise<{ id: string }> {
  const { baustein, v } = ctx;
  return tx.unterlagenNachforderung.create({
    data: {
      ...baustein.kopfDaten(v.id),
      status: "LAUFEND",
      laufendSchluessel: laufendSchluessel(baustein.modul, v.id),
      empfaenger: daten.empfaenger.adresse,
      empfaengerVorgang: v.email,
      empfaengerAbweichend: daten.empfaenger.abweichend,
      frist: kalendertagAlsDatum(daten.frist),
      nachricht: daten.nachricht,
      angefordertVonId: ctx.session.userId,
      angefordertAm: ctx.jetzt,
      positionen: { create: [...daten.positionen] },
    },
    select: { id: true },
  });
}

/**
 * „Anfordern und E-Mail senden": Kopf, Positionen und Link in EINER
 * Transaktion nach der Sperre des Vorgangs und der Mail-Bremse; die Mail nach
 * dem Commit. Eine zweite laufende Nachforderung verhindert der Unique-Index
 * `laufendSchluessel` (P2002 → 409), auch bei Doppelklick ueber zwei Container.
 * Die Bremse zaehlt auch die Mails frueherer, inzwischen zurueckgezogener
 * Nachforderungen (Regel 6) — sonst gaebe es hier nie ein 429.
 */
async function anfordern(ctx: AktionsKontext, e: Aktion<"anfordern">): Promise<UnterlagenDienstAntwort> {
  const { baustein, v } = ctx;
  const verfuegbar = baustein.verfuegbar(v);
  if (!verfuegbar.ok) return fehler(409, verfuegbar.grund, "NICHT_VERFUEGBAR");

  const auswahl = new Map(baustein.auswahl(v).map((a) => [a.typ, a]));
  const pruefung = eingabePruefen(
    { aktion: "anfordern", frist: e.frist, positionen: e.positionen },
    { heute: ctx.heute, katalog: [...auswahl.keys()] },
  );
  if (!pruefung.ok) return fehler(pruefung.status, pruefung.meldung, pruefung.grund);
  if (!pruefung.frist) return fehler(400, MELDUNGEN.FRIST_FEHLT, "FRIST_FEHLT");
  const frist = pruefung.frist;

  const sensibel = sensibelPruefen(e.positionen, auswahl);
  if (sensibel) return sensibel;
  const empfaenger = await empfaengerPruefen(e.empfaenger, v.email, e.adresseBestaetigt);
  if (!empfaenger.ok) return empfaenger.antwort;
  const vorlage = await personenVorlagePruefen(UNTERLAGEN_EVENTS.ANGEFORDERT);
  if (vorlage) return vorlage;

  const positionen = e.positionen.map((p, i) => positionsDaten(p, i, auswahl, ctx.jetzt));
  let ergebnis: { nachforderungId: string; linkId: string; token: string };
  try {
    ergebnis = await prisma.$transaction(async (tx) => {
      await vorgangSperrenOderAbbrechen(tx, ctx);
      await mailBremseOderAbbrechen(tx, ctx);
      const kopf = await nachforderungAnlegen(tx, ctx, {
        empfaenger,
        frist,
        nachricht: e.nachricht ?? null,
        positionen,
      });
      const link = await linkAnlegen(tx, {
        nachforderungId: kopf.id,
        anlass: "ANFORDERUNG",
        empfaenger: empfaenger.adresse,
        frist,
        erstelltVonId: ctx.session.userId,
        jetzt: ctx.jetzt,
      });
      await tx.auditLog.create({
        data: auditDaten(ctx, UNTERLAGEN_AUDIT.ANGEFORDERT, {
          nachforderungId: kopf.id,
          linkId: link.linkId,
          typen: positionen.flatMap((p) => (p.typ ? [p.typ] : [])),
          freieZeilen: positionen.filter((p) => p.typ === null).length,
          frist,
          nachrichtLaenge: e.nachricht?.length ?? 0,
          empfaengerAbweichend: empfaenger.abweichend,
          ...(empfaenger.abweichend ? { adresseBestaetigt: true } : {}),
        }),
      });
      return { nachforderungId: kopf.id, ...link };
    });
  } catch (err) {
    if (eindeutigkeitVerletzt(err, "laufendSchluessel")) {
      return fehler(409, MELDUNGEN.LAEUFT_BEREITS, "LAEUFT_BEREITS");
    }
    throw err;
  }

  const mail = await aufforderungSenden(ctx, { ...ergebnis, anlass: "ANFORDERUNG" });
  return {
    status: 201,
    body: {
      nachforderungId: ergebnis.nachforderungId,
      mail,
      ...aktionsTexte("anfordern", mail),
    } satisfies AnfordernAntwort,
  };
}

// ---- ergaenzen ----

/**
 * „Unterlagen ergänzen…": neue Positionen, eine entfallene Katalogart wird
 * wieder aktiv statt neu zu entstehen (2.2). Setzt den Merker „vollständig"
 * zurueck (2.1), schreibt bei neuer Frist die lebenden Links fort und schickt
 * EINE Mail, in der die neuen Positionen „(neu)" tragen.
 */
async function ergaenzen(ctx: AktionsKontext, e: Aktion<"ergaenzen">): Promise<UnterlagenDienstAntwort> {
  const { baustein, v } = ctx;
  const stand = await nachforderungLaden(prisma, ctx, e.nachforderungId);
  if (!stand) return fehler(404, MELDUNGEN.NACHFORDERUNG_NICHT_GEFUNDEN);
  const uebergang = nachforderungUebergang("ERGAENZEN", { status: stand.status, vorgangEingestellt: v.eingestellt });
  if (!uebergang.erlaubt) return fehler(409, uebergang.meldung, uebergang.grund);

  const auswahl = new Map(baustein.auswahl(v).map((a) => [a.typ, a]));
  const pruefen = (bestehend: AktionsStand["positionen"], bisherigeFrist: Kalendertag) =>
    eingabePruefen(
      { aktion: "ergaenzen", frist: e.frist, positionen: e.positionen },
      { heute: ctx.heute, katalog: [...auswahl.keys()], bestehend, bisherigeFrist },
    );
  const vorab = pruefen(stand.positionen, kalendertagVon(stand.frist));
  if (!vorab.ok) return fehler(vorab.status, vorab.meldung, vorab.grund);
  const sensibel = sensibelPruefen(e.positionen, auswahl);
  if (sensibel) return sensibel;
  const vorlage = await personenVorlagePruefen(UNTERLAGEN_EVENTS.ANGEFORDERT);
  if (vorlage) return vorlage;

  const ergebnis = await prisma.$transaction(async (tx) => {
    await vorgangSperrenOderAbbrechen(tx, ctx);
    await nachforderungSperrenOderAbbrechen(tx, ctx, stand.id);
    await mailBremseOderAbbrechen(tx, ctx);

    // Unter der Sperre frisch lesen und dieselbe Pruefung wiederholen: Zwischen
    // dem Lesen oben und hier kann eine Art hinzugekommen sein.
    const frisch = await nachforderungLaden(tx, ctx, stand.id);
    if (!frisch) throw new UnterlagenAbbruch(fehler(404, MELDUNGEN.NACHFORDERUNG_NICHT_GEFUNDEN));
    const bisherigeFrist = kalendertagVon(frisch.frist);
    const pruefung = pruefen(frisch.positionen, bisherigeFrist);
    if (!pruefung.ok) throw new UnterlagenAbbruch(fehler(pruefung.status, pruefung.meldung, pruefung.grund));
    const frist = pruefung.frist ?? bisherigeFrist;

    const merker = vollstaendigMerker("ERGAENZT", {
      vollstaendigSeit: frisch.vollstaendigSeit,
      vollstaendigGemeldetAm: frisch.vollstaendigGemeldetAm,
      positionenNachher: frisch.positionen,
      jetzt: ctx.jetzt,
    });
    await tx.unterlagenNachforderung.updateMany({
      where: { id: frisch.id, status: "LAUFEND" },
      data: {
        ...(frist !== bisherigeFrist ? { frist: kalendertagAlsDatum(frist) } : {}),
        ...(e.nachricht !== undefined ? { nachricht: e.nachricht } : {}),
        vollstaendigSeit: merker.vollstaendigSeit,
        vollstaendigGemeldetAm: merker.vollstaendigGemeldetAm,
      },
    });
    const fortgeschrieben =
      frist !== bisherigeFrist
        ? await lebendeLinksFortschreiben(tx, frisch.links, frisch.frist, frist, ctx.heute)
        : 0;

    const neu = new Set<string>();
    const reaktiviert: string[] = [];
    let reihenfolge = frisch.positionen.reduce((max, p) => Math.max(max, p.reihenfolge), -1) + 1;
    for (const p of e.positionen) {
      const vorhanden = p.typ === null ? undefined : frisch.positionen.find((b) => b.typ === p.typ);
      if (vorhanden) {
        // ENTFAELLT → ANGEFORDERT (die Pruefung oben laesst nur entfallene zu).
        // Bedingt: Hat sich die Zeile seit dem Lesen bewegt, 409 statt Ueberschreiben.
        // Die Zeile wird wieder aktiv wie neu angefordert (2.2): Angaben der
        // verworfenen Runde — Uebermittlung, „Gültig bis" der Person, letzte
        // Zurueckweisung — gehen mit, sonst zeigten Karte und Upload-Seite sie
        // als aktuell. Die Begruendung bleibt als Kopie an den Dateizeilen
        // (Nachweis, P:1463); `einreichungen` zaehlt ueber alle Runden weiter.
        const r = await tx.unterlagenPosition.updateMany({
          where: { id: vorhanden.id, nachforderungId: frisch.id, status: "ENTFAELLT" },
          data: {
            status: "ANGEFORDERT",
            angefordertAm: ctx.jetzt,
            uebermitteltAm: null,
            gueltigBisAngabe: null,
            begruendung: null,
            entschiedenAm: null,
            entschiedenVonId: null,
            entfaelltNotiz: null,
            hinweis: p.hinweis ?? null,
          },
        });
        if (r.count !== 1) {
          throw new UnterlagenAbbruch(fehler(409, MELDUNGEN.BEREITS_ANGEFORDERT, "BEREITS_ANGEFORDERT"));
        }
        neu.add(vorhanden.id);
        reaktiviert.push(vorhanden.typ as string);
        continue;
      }
      const angelegt = await tx.unterlagenPosition.create({
        data: { ...positionsDaten(p, reihenfolge, auswahl, ctx.jetzt), nachforderungId: frisch.id },
        select: { id: true },
      });
      reihenfolge += 1;
      neu.add(angelegt.id);
    }

    const link = await linkAnlegen(tx, {
      nachforderungId: frisch.id,
      anlass: "ERGAENZUNG",
      empfaenger: frisch.empfaenger,
      frist,
      erstelltVonId: ctx.session.userId,
      jetzt: ctx.jetzt,
    });
    await tx.auditLog.create({
      data: auditDaten(ctx, UNTERLAGEN_AUDIT.ERGAENZT, {
        nachforderungId: frisch.id,
        linkId: link.linkId,
        typen: e.positionen.flatMap((p) => (p.typ && !reaktiviert.includes(p.typ) ? [p.typ] : [])),
        reaktiviert,
        freieZeilen: e.positionen.filter((p) => p.typ === null).length,
        ...(frist !== bisherigeFrist ? { fristVorher: bisherigeFrist, fristNachher: frist, linksFortgeschrieben: fortgeschrieben } : {}),
        ...(e.nachricht !== undefined ? { nachrichtLaenge: e.nachricht.length } : {}),
      }),
    });
    return { nachforderungId: frisch.id, neu, ...link };
  });

  const mail = await aufforderungSenden(ctx, { ...ergebnis, anlass: "ERGAENZUNG" });
  return {
    status: 200,
    body: {
      nachforderungId: ergebnis.nachforderungId,
      mail,
      ...aktionsTexte("ergaenzen", mail),
    } satisfies NachforderungsAktionAntwort,
  };
}

// ---- frist-aendern ----

/** 409, wenn sich die Frist nicht aendert — der Weg fuer „noch einmal senden" ist „Link erneut senden". */
const FRIST_UNVERAENDERT =
  "Die Frist ist unverändert. Um der Person den Link noch einmal zu schicken, nutzen Sie „Link erneut senden“.";

/**
 * „Frist ändern…": schreibt die lebenden Links fort (5.1) und schickt eine
 * Mail mit neuem Link — nur, wenn noch etwas auf die Person wartet. Der
 * Merker „vollständig" bleibt (2.1); Erinnerung und „Frist verstrichen"
 * beginnen ueber den neuen Fristwert von selbst einen neuen Zyklus.
 */
async function fristAendern(ctx: AktionsKontext, e: Aktion<"frist-aendern">): Promise<UnterlagenDienstAntwort> {
  const { v } = ctx;
  const stand = await nachforderungLaden(prisma, ctx, e.nachforderungId);
  if (!stand) return fehler(404, MELDUNGEN.NACHFORDERUNG_NICHT_GEFUNDEN);
  const uebergang = nachforderungUebergang("FRIST_AENDERN", { status: stand.status, vorgangEingestellt: v.eingestellt });
  if (!uebergang.erlaubt) return fehler(409, uebergang.meldung, uebergang.grund);
  const pruefung = fristPruefen(e.frist, ctx.heute);
  if (!pruefung.ok) return fehler(400, pruefung.meldung, pruefung.grund);
  const neueFrist = pruefung.tag;
  if (neueFrist === kalendertagVon(stand.frist)) return fehler(409, FRIST_UNVERAENDERT, "FRIST_UNVERAENDERT");
  if (stand.positionen.some((p) => wartetAufPerson(p.status))) {
    const vorlage = await personenVorlagePruefen(UNTERLAGEN_EVENTS.ANGEFORDERT);
    if (vorlage) return vorlage;
  }

  const ergebnis = await prisma.$transaction(async (tx) => {
    await vorgangSperrenOderAbbrechen(tx, ctx);
    await nachforderungSperrenOderAbbrechen(tx, ctx, stand.id);
    const frisch = await nachforderungLaden(tx, ctx, stand.id);
    if (!frisch) throw new UnterlagenAbbruch(fehler(404, MELDUNGEN.NACHFORDERUNG_NICHT_GEFUNDEN));
    const bisherigeFrist = kalendertagVon(frisch.frist);
    if (neueFrist === bisherigeFrist) {
      throw new UnterlagenAbbruch(fehler(409, FRIST_UNVERAENDERT, "FRIST_UNVERAENDERT"));
    }
    const wartet = frisch.positionen.some((p) => wartetAufPerson(p.status));
    if (wartet) await mailBremseOderAbbrechen(tx, ctx);

    await tx.unterlagenNachforderung.updateMany({
      where: { id: frisch.id, status: "LAUFEND" },
      data: { frist: kalendertagAlsDatum(neueFrist) },
    });
    const fortgeschrieben = await lebendeLinksFortschreiben(tx, frisch.links, frisch.frist, neueFrist, ctx.heute);
    const link = wartet
      ? await linkAnlegen(tx, {
          nachforderungId: frisch.id,
          anlass: "FRISTAENDERUNG",
          empfaenger: frisch.empfaenger,
          frist: neueFrist,
          erstelltVonId: ctx.session.userId,
          jetzt: ctx.jetzt,
        })
      : null;
    await tx.auditLog.create({
      data: auditDaten(ctx, UNTERLAGEN_AUDIT.FRIST_GEAENDERT, {
        nachforderungId: frisch.id,
        fristVorher: bisherigeFrist,
        fristNachher: neueFrist,
        linksFortgeschrieben: fortgeschrieben,
        linkId: link?.linkId ?? null,
      }),
    });
    return { nachforderungId: frisch.id, link };
  });

  if (!ergebnis.link) {
    return {
      status: 200,
      body: {
        nachforderungId: ergebnis.nachforderungId,
        mail: null,
        meldung: `${aktionsTexte("frist-aendern", null).meldung} ${MELDUNGEN.NICHTS_OFFEN}`,
      } satisfies NachforderungsAktionAntwort,
    };
  }
  const mail = await aufforderungSenden(ctx, {
    nachforderungId: ergebnis.nachforderungId,
    ...ergebnis.link,
    anlass: "FRISTAENDERUNG",
  });
  return {
    status: 200,
    body: {
      nachforderungId: ergebnis.nachforderungId,
      mail,
      ...aktionsTexte("frist-aendern", mail),
    } satisfies NachforderungsAktionAntwort,
  };
}

// ---- erneut-senden ----

/**
 * Warnung, wenn „frühere Links sperren" nach dem Versand auch im zweiten
 * Versuch nicht gespeichert werden konnte. KEINE Aufforderung zu einem neuen
 * Versuch: Der einzige Weg dorthin waere „Link erneut senden" — also eine
 * weitere Mail mit weiterem Link (N2).
 */
const SPERREN_NICHT_GESPEICHERT =
  "Die E-Mail ist versendet. Die früheren Links ließen sich aber nicht sperren und bleiben gültig – bitte nicht erneut senden.";

/**
 * „frühere Links sperren" NACH SENT: alle aelteren, noch nicht entwerteten
 * Links als GESPERRT (410). Scheitert die Datenbank, wird EINMAL wiederholt,
 * wie beim Ergebnis der Mail (N2).
 *
 * @returns false, wenn auch der zweite Versuch scheiterte
 */
async function fruehereLinksSperren(nachforderungId: string, neuerLinkId: string, jetzt: Date): Promise<boolean> {
  for (let versuch = 1; versuch <= 2; versuch++) {
    try {
      await prisma.unterlagenLink.updateMany({
        where: { nachforderungId, id: { not: neuerLinkId }, entwertetAm: null },
        data: { entwertetAm: jetzt, entwertetGrund: "GESPERRT" },
      });
      return true;
    } catch (err) {
      console.error(`[Unterlagen] Frühere Links (${nachforderungId}) nicht gesperrt, Versuch ${versuch}:`, fehlerKennung(err));
    }
  }
  return false;
}

/**
 * „Link erneut senden": ein neuer Link, dieselbe Aufforderung (EP-16). Nach
 * der Frist bis zum Linkende erlaubt — die Mail traegt dann `frist_verstrichen`
 * —, danach 409 „Bitte zuerst die Frist ändern".
 *
 * Neue Adresse: Freigabe und Bestaetigung VOR dem Schreiben; Adresse, Adresse
 * des Vorgangs und „abweichend" neu setzen; alle aelteren Links in DERSELBEN
 * Transaktion als ADRESSE entwerten (404 — wer die Mail an eine falsche
 * Adresse bekam, erfaehrt nichts). „frühere Links sperren" entwertet erst
 * NACH SENT (GESPERRT, 410).
 *
 * Antwort 201 (SENT), 502 (FAILED), 409 (SKIPPED) — die Mail ist hier die
 * Aktion selbst (CL:244). Gespeicherte Aenderungen (neue Adresse, neuer Link)
 * bleiben in jedem Fall; FAILED holt der Lauf nach.
 */
async function erneutSenden(ctx: AktionsKontext, e: Aktion<"erneut-senden">): Promise<UnterlagenDienstAntwort> {
  const { v } = ctx;
  const stand = await nachforderungLaden(prisma, ctx, e.nachforderungId);
  if (!stand) return fehler(404, MELDUNGEN.NACHFORDERUNG_NICHT_GEFUNDEN);
  const uebergang = nachforderungUebergang("ERNEUT_SENDEN", { status: stand.status, vorgangEingestellt: v.eingestellt });
  if (!uebergang.erlaubt) return fehler(409, uebergang.meldung, uebergang.grund);
  if (!stand.positionen.some((p) => wartetAufPerson(p.status))) return fehler(409, MELDUNGEN.NICHTS_OFFEN, "NICHTS_OFFEN");
  const linkende = nachforderungLinkende(stand.frist);
  if (!linkende || ctx.heute > linkende) return fehler(409, MELDUNGEN.ZUERST_FRIST_AENDERN, "ZUERST_FRIST_AENDERN");

  // Adresse: ohne Angabe die bisherige. Eine NEUE wird geprueft wie beim Anlegen —
  // gegen die AKTUELLE Adresse des Vorgangs.
  const neueAdresse = e.empfaenger !== undefined && !gleicheAdresse(e.empfaenger, stand.empfaenger);
  let empfaenger = { adresse: stand.empfaenger, abweichend: false };
  if (neueAdresse) {
    const pruefung = await empfaengerPruefen(e.empfaenger as string, v.email, e.adresseBestaetigt);
    if (!pruefung.ok) return pruefung.antwort;
    empfaenger = { adresse: pruefung.adresse, abweichend: pruefung.abweichend };
  }
  const vorlage = await personenVorlagePruefen(UNTERLAGEN_EVENTS.ANGEFORDERT);
  if (vorlage) return vorlage;

  const ergebnis = await prisma.$transaction(async (tx) => {
    await vorgangSperrenOderAbbrechen(tx, ctx);
    await nachforderungSperrenOderAbbrechen(tx, ctx, stand.id);
    const frisch = await nachforderungLaden(tx, ctx, stand.id);
    if (!frisch) throw new UnterlagenAbbruch(fehler(404, MELDUNGEN.NACHFORDERUNG_NICHT_GEFUNDEN));
    if (!frisch.positionen.some((p) => wartetAufPerson(p.status))) {
      throw new UnterlagenAbbruch(fehler(409, MELDUNGEN.NICHTS_OFFEN, "NICHTS_OFFEN"));
    }
    const sperreBis = erneutSendenSperreBis(frisch.links, ctx.jetzt);
    if (sperreBis) {
      throw new UnterlagenAbbruch(fehler(409, MELDUNGEN.SPERRZEIT, "SPERRZEIT", { sperreBis: sperreBis.toISOString() }));
    }
    await mailBremseOderAbbrechen(tx, ctx);

    let entwertet = 0;
    if (neueAdresse) {
      await tx.unterlagenNachforderung.updateMany({
        where: { id: frisch.id, status: "LAUFEND" },
        data: { empfaenger: empfaenger.adresse, empfaengerVorgang: v.email, empfaengerAbweichend: empfaenger.abweichend },
      });
      // Sofort und VOR dem neuen Link: Die alte Adresse darf nichts mehr erreichen.
      const r = await tx.unterlagenLink.updateMany({
        where: { nachforderungId: frisch.id, entwertetAm: null },
        data: { entwertetAm: ctx.jetzt, entwertetGrund: "ADRESSE" },
      });
      entwertet = r.count;
    }
    const link = await linkAnlegen(tx, {
      nachforderungId: frisch.id,
      anlass: "ERNEUT",
      empfaenger: empfaenger.adresse,
      frist: kalendertagVon(frisch.frist),
      erstelltVonId: ctx.session.userId,
      jetzt: ctx.jetzt,
    });
    await tx.auditLog.create({
      data: auditDaten(ctx, UNTERLAGEN_AUDIT.LINK_ERNEUT_GESENDET, {
        nachforderungId: frisch.id,
        linkId: link.linkId,
        adresseGeaendert: neueAdresse,
        linksEntwertet: entwertet,
        fruehereSperren: e.fruehereSperren === true,
        ...(neueAdresse && empfaenger.abweichend ? { empfaengerAbweichend: true, adresseBestaetigt: true } : {}),
      }),
    });
    return { nachforderungId: frisch.id, ...link };
  });

  const mail = await aufforderungSenden(ctx, { ...ergebnis, anlass: "ERNEUT" });

  // „frühere Links sperren" erst NACH SENT (5.1) — nie bei FAILED/SKIPPED:
  // Wer keinen neuen Link bekam, braucht den alten.
  let fruehereGesperrt = false;
  let sperrWarnung: string | null = null;
  if (e.fruehereSperren === true && mail.status === "SENT") {
    fruehereGesperrt = await fruehereLinksSperren(ergebnis.nachforderungId, ergebnis.linkId, ctx.jetzt);
    if (!fruehereGesperrt) sperrWarnung = SPERREN_NICHT_GESPEICHERT;
  }

  const status = erneutSendenStatus(mail);
  const texte = aktionsTexte("erneut-senden", mail);
  const warnung = [texte.warnung, sperrWarnung].filter(Boolean).join(" ") || undefined;
  return {
    status,
    body: {
      nachforderungId: ergebnis.nachforderungId,
      mail,
      meldung: texte.meldung,
      ...(warnung ? { warnung } : {}),
      ...(status >= 400 ? { error: texte.meldung } : {}),
      adresseGeaendert: neueAdresse,
      fruehereGesperrt,
    } satisfies ErneutSendenAntwort,
  };
}

// ---- zurueckziehen ----

/**
 * „Zurückziehen…" (Endzustand, EP-9): keine Mail. Entwuerfe verschwinden
 * sofort — Zeile in der Transaktion, Datei nach dem Commit —, eingereichte
 * Dateien werden VERWORFEN und nach 30 Tagen geloescht (EP-8). Positionen
 * bleiben stehen, wie sie sind (2.2); der Merker „vollständig" wird geleert.
 * Auch bei einem eingestellten Vorgang erlaubt — deshalb ohne Sperre des
 * Vorgangs.
 */
async function zurueckziehen(ctx: AktionsKontext, e: Aktion<"zurueckziehen">): Promise<UnterlagenDienstAntwort> {
  const stand = await nachforderungLaden(prisma, ctx, e.nachforderungId);
  if (!stand) return fehler(404, MELDUNGEN.NACHFORDERUNG_NICHT_GEFUNDEN);
  const uebergang = nachforderungUebergang("ZURUECKZIEHEN", { status: stand.status, vorgangEingestellt: ctx.v.eingestellt });
  if (!uebergang.erlaubt) return fehler(409, uebergang.meldung, uebergang.grund);

  const ergebnis = await prisma.$transaction(async (tx) => {
    // Sperre UND Zustandswechsel in einem bedingten Schreiben: Nur wer die
    // Nachforderung noch LAUFEND vorfindet, zieht sie zurueck.
    const merker = vollstaendigMerker("ZURUECKGEZOGEN", {
      vollstaendigSeit: null,
      vollstaendigGemeldetAm: null,
      positionenNachher: [],
      jetzt: ctx.jetzt,
    });
    const r = await tx.unterlagenNachforderung.updateMany({
      where: { id: stand.id, ...ctx.baustein.bereichWhere(ctx.v.id), status: "LAUFEND" },
      data: {
        status: "ZURUECKGEZOGEN",
        laufendSchluessel: null,
        zurueckgezogenAm: ctx.jetzt,
        zurueckgezogenVonId: ctx.session.userId,
        vollstaendigSeit: merker.vollstaendigSeit,
        vollstaendigGemeldetAm: merker.vollstaendigGemeldetAm,
      },
    });
    if (r.count === 0) throw new UnterlagenAbbruch(fehler(409, MELDUNGEN.NICHT_LAUFEND, "NICHT_LAUFEND"));

    const entwuerfe = await tx.unterlagenDatei.findMany({
      where: { nachforderungId: stand.id, status: "ENTWURF" },
      select: { id: true, speicherPfad: true },
    });
    const geloescht = entwuerfe.length
      ? await tx.unterlagenDatei.deleteMany({
          where: { id: { in: entwuerfe.map((d) => d.id) }, nachforderungId: stand.id, status: "ENTWURF" },
        })
      : { count: 0 };
    const verworfen = await tx.unterlagenDatei.updateMany({
      where: { nachforderungId: stand.id, status: "EINGEREICHT" },
      data: { status: "VERWORFEN", entschiedenAm: ctx.jetzt, loeschenAb: loeschenAbBerechnen(ctx.jetzt) },
    });
    await tx.auditLog.create({
      data: auditDaten(ctx, UNTERLAGEN_AUDIT.ZURUECKGEZOGEN, {
        nachforderungId: stand.id,
        entwuerfeGeloescht: geloescht.count,
        dateienVerworfen: verworfen.count,
      }),
    });
    return { pfade: entwuerfe.map((d) => d.speicherPfad) };
  });

  // Nach dem Commit: Die Zeilen sind weg, die Dateien folgen. Was liegen
  // bleibt, findet der Lauf als Waise.
  const bilanz = await entwuerfeLoeschen(stand.id, ergebnis.pfade);
  if (bilanz.fehler > 0) {
    console.error(`[Unterlagen] ${bilanz.fehler} Entwurfsdatei(en) von ${stand.id} nicht geloescht (der Lauf raeumt nach).`);
  }
  return {
    status: 200,
    body: {
      nachforderungId: stand.id,
      mail: null,
      ...aktionsTexte("zurueckziehen", null),
    } satisfies NachforderungsAktionAntwort,
  };
}

/**
 * POST /api/onboarding/[id]/unterlagen — die fuenf Aktionen auf eine
 * Nachforderung. Die Route hat Sitzung und Body (Zod) schon geprueft; hier
 * steht alles Weitere, und die Antwort geht 1:1 zurueck.
 *
 *   403 { error }                          nicht HR_EDIT_ROLES
 *   404 { error: "Vorgang nicht gefunden" }  unbekannt ODER fremder Mandant
 *   404 { error: "Nachforderung nicht gefunden" }  unbekannt ODER zu einem anderen Vorgang
 *   409 { error, grund }                   Sperre belegt, fachlich nicht moeglich, Vorlage untauglich
 *   429 { error, grund } + Retry-After     Mail-Bremse
 *   anfordern 201 · ergaenzen/frist-aendern/zurueckziehen 200 · erneut-senden 201/502/409
 */
export async function unterlagenAktionAusfuehren(opts: {
  modul: UnterlagenModul;
  vorgangId: string;
  eingabe: UnterlagenAktionInput;
  session: SessionPayload;
  jetzt?: Date;
}): Promise<UnterlagenDienstAntwort> {
  const jetzt = opts.jetzt ?? new Date();
  if (!HR_EDIT_ROLES.includes(opts.session.role)) return fehler(403, MELDUNGEN.KEINE_BERECHTIGUNG);

  const baustein = BAUSTEINE[opts.modul];
  const v = await baustein.vorgangLaden(opts.vorgangId);
  if (!v || !(await canAccessProcess(opts.session, v.organizationId))) {
    return fehler(404, MELDUNGEN.VORGANG_NICHT_GEFUNDEN);
  }

  if (!unterlagenSperreNehmen(baustein.modul, v.id)) return fehler(409, MELDUNGEN.AKTION_LAEUFT, "AKTION_LAEUFT");
  const ctx: AktionsKontext = { baustein, v, session: opts.session, jetzt, heute: heuteInBerlin(jetzt) };
  try {
    const e = opts.eingabe;
    switch (e.aktion) {
      case "anfordern":
        return await anfordern(ctx, e);
      case "ergaenzen":
        return await ergaenzen(ctx, e);
      case "frist-aendern":
        return await fristAendern(ctx, e);
      case "erneut-senden":
        return await erneutSenden(ctx, e);
      case "zurueckziehen":
        return await zurueckziehen(ctx, e);
    }
  } catch (err) {
    if (err instanceof UnterlagenAbbruch) return err.antwort;
    // Dieselbe Art zweimal in einer Nachforderung (Unique nachforderungId+typ):
    // Die Pruefung davor laesst das nicht zu — gewinnt trotzdem ein zweiter
    // Container den Wettlauf, ist das 409 und kein 500.
    if (eindeutigkeitVerletzt(err, "typ")) return fehler(409, MELDUNGEN.BEREITS_ANGEFORDERT, "BEREITS_ANGEFORDERT");
    throw err;
  } finally {
    // Genau eine Freigabestelle — kein Rueckgabepfad darf die Sperre stehen lassen.
    unterlagenSperreFreigeben(baustein.modul, v.id);
  }
}

// =============================================
// Uebersicht (GET /api/onboarding/[id], Feld `unterlagen`)
// =============================================

/**
 * Was die Uebersicht liest — genau die Felder von `NachforderungEingabe`.
 * ALLE Dateien, auch Entwuerfe: `uebersichtBauen` zeigt HR nur uebermittelte,
 * der Lauf-Waechter braucht die uebrigen. Keine Adresse je Link, kein Hash.
 */
const UEBERSICHT_AUSWAHL = {
  id: true,
  modul: true,
  status: true,
  empfaenger: true,
  empfaengerAbweichend: true,
  frist: true,
  nachricht: true,
  angefordertAm: true,
  angefordertVon: { select: { firstName: true, lastName: true } },
  erinnertFuerFrist: true,
  erinnertStufe: true,
  erledigtAm: true,
  zurueckgezogenAm: true,
  hrMeldungStatus: true,
  hrMeldungDetail: true,
  positionen: {
    orderBy: { reihenfolge: "asc" },
    select: {
      id: true,
      reihenfolge: true,
      typ: true,
      bezeichnung: true,
      hinweis: true,
      originalErforderlich: true,
      sensibel: true,
      fristpflichtig: true,
      status: true,
      einreichungen: true,
      gueltigBisAngabe: true,
      angefordertAm: true,
      uebermitteltAm: true,
      begruendung: true,
      entfaelltNotiz: true,
      entschiedenAm: true,
      entschiedenVon: { select: { firstName: true, lastName: true } },
      dateien: {
        orderBy: { hochgeladenAm: "asc" },
        select: {
          id: true,
          status: true,
          anzeigeName: true,
          mimeType: true,
          groesse: true,
          pdfHinweise: true,
          einreichungNr: true,
          uebermitteltAm: true,
          entschiedenAm: true,
          speicherPfad: true,
          uebernahmeZiel: true,
          uebernommenId: true,
          uebernommenAm: true,
          loeschenAb: true,
          dateiGeloeschtAm: true,
        },
      },
    },
  },
  links: {
    orderBy: { createdAt: "asc" },
    select: {
      anlass: true,
      mailStatus: true,
      mailDetail: true,
      gesendetAm: true,
      nachholVersuche: true,
      erstelltVonId: true,
      createdAt: true,
    },
  },
} satisfies Prisma.UnterlagenNachforderungSelect;

type UebersichtZeile = Prisma.UnterlagenNachforderungGetPayload<{ select: typeof UEBERSICHT_AUSWAHL }>;

/** Bildet eine Zeile auf die enge Eingabe von `uebersichtBauen` ab (rein). */
function nachforderungEingabe(z: UebersichtZeile): NachforderungEingabe {
  return {
    id: z.id,
    modul: z.modul,
    status: z.status,
    empfaenger: z.empfaenger,
    empfaengerAbweichend: z.empfaengerAbweichend,
    frist: z.frist,
    nachricht: z.nachricht,
    angefordertAm: z.angefordertAm,
    angefordertVonName: name(z.angefordertVon),
    erinnertFuerFrist: z.erinnertFuerFrist,
    erinnertStufe: z.erinnertStufe,
    erledigtAm: z.erledigtAm,
    zurueckgezogenAm: z.zurueckgezogenAm,
    hrMeldungOhneEmpfaenger: hrMeldungOhneEmpfaenger(z.hrMeldungStatus, z.hrMeldungDetail),
    positionen: z.positionen.map((p) => ({
      id: p.id,
      reihenfolge: p.reihenfolge,
      typ: p.typ,
      bezeichnung: p.bezeichnung,
      hinweis: p.hinweis,
      originalErforderlich: p.originalErforderlich,
      sensibel: p.sensibel,
      fristpflichtig: p.fristpflichtig,
      status: p.status,
      einreichungen: p.einreichungen,
      gueltigBisAngabe: p.gueltigBisAngabe,
      angefordertAm: p.angefordertAm,
      uebermitteltAm: p.uebermitteltAm,
      begruendung: p.begruendung,
      entfaelltNotiz: p.entfaelltNotiz,
      entschiedenAm: p.entschiedenAm,
      entschiedenVonName: name(p.entschiedenVon),
      dateien: p.dateien,
    })),
    links: z.links,
  };
}

/**
 * Die Uebersicht eines Vorgangs fuer die Karte, den Kasten „Offene
 * Nachweise", die Reiter-Pille und die Mini-Karte — modulneutral, aus dem
 * schon gebauten Vorgang des Bausteins. Liest nur, entschluesselt nichts.
 * Datei-URLs, Dateinamen, Aktionen und die Daten der Dialoge (Auswahl,
 * Adressvorschlaege, Freigabeliste) nur mit HR_EDIT_ROLES — das setzt
 * `uebersichtBauen` durch.
 */
async function uebersichtLaden<V extends UnterlagenVorgang>(
  baustein: UnterlagenModulBaustein<V>,
  v: V,
  darfAktionen: boolean,
  jetzt: Date,
): Promise<UnterlagenUebersicht> {
  const zeilen = await prisma.unterlagenNachforderung.findMany({
    where: baustein.bereichWhere(v.id),
    select: UEBERSICHT_AUSWAHL,
    orderBy: { angefordertAm: "desc" },
  });
  const dialog = darfAktionen
    ? {
        auswahl: baustein.auswahl(v),
        empfaenger: {
          vorgang: v.email,
          vorschlaege: baustein.empfaengerVorschlaege(v),
          erlaubteDomains: await ladeErlaubteDomains(),
        },
      }
    : null;
  return uebersichtBauen({
    modul: baustein.modul,
    nachforderungen: zeilen.map(nachforderungEingabe),
    verfuegbar: baustein.verfuegbar(v),
    vorgangEingestellt: v.eingestellt,
    darfAktionen,
    dateiUrl: (dateiId) => `${baustein.apiBasis(v.id)}/dateien/${dateiId}`,
    dialog,
    jetzt,
  });
}

/**
 * Fuer `GET /api/onboarding/[id]`: `{ unterlagen }` zum Spreizen neben der
 * Abteilungsuebersicht —
 * `...(await unterlagenUebersichtLaden(onboarding, session, { requiredDocuments }))`.
 *
 * Nimmt die Zeile, die die Route ohnehin geladen hat (die noch
 * verschluesselte, nie die entschluesselte Kopie), und deren Pflichtliste —
 * Vorgang und Formularvorlage werden so nicht ein zweites Mal gelesen. Die
 * Adresse der Personalakte laedt der Baustein nur mit Bearbeitungsrecht nach
 * (zweiter Adressvorschlag im Dialog). Rolle (PORTAL_ROLES) und Mandant prueft
 * die Route vorher. Stufe 2 legt je Modul einen solchen Einstieg an, wie die
 * Abteilungsaufgaben (`onboardingAbteilungsUebersichtLaden`).
 */
export async function unterlagenUebersichtLaden(
  onboarding: OnboardingUnterlagenQuelle & { employeeId: string | null },
  session: SessionPayload,
  opts: { requiredDocuments: readonly string[]; jetzt?: Date },
): Promise<{ unterlagen: UnterlagenUebersicht }> {
  const darfAktionen = HR_EDIT_ROLES.includes(session.role);
  const v = await onboardingVorgangAusAnsicht(onboarding, opts.requiredDocuments, darfAktionen);
  return { unterlagen: await uebersichtLaden(onboardingBaustein, v, darfAktionen, opts.jetzt ?? new Date()) };
}
