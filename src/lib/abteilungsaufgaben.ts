/**
 * CREDO HR-Portal – Abteilungsaufgaben: die reinen Regeln
 *
 * Worum es geht: Checklisten-Aufgaben mit einer zustaendigen Abteilung (IT,
 * Verwaltung, Facility, Buchhaltung, DSB, eigene Schluessel) oder der
 * Fuehrungskraft gehen per Link an diese Stelle. Sie hakt ohne Anmeldung ab und
 * kann HR einen Kommentar hinterlassen. HR sieht je Abteilung den Stand und
 * kann erinnern, erneut senden oder den Link erneuern (Paket 1b, Offboarding).
 *
 * Diese Datei enthaelt NUR Regeln: keine Datenbank, keine Node-Module, keine
 * Uhr (jede Funktion bekommt `jetzt`). Sie ist damit im Browser nutzbar (die
 * Karte im Portal zeigt dieselben Texte wie der Server) und ohne Datenbank
 * testbar (src/__tests__/lib/abteilungsaufgaben.test.ts). Seit Paket 5 gilt
 * sie fuer Offboarding UND Onboarding; was je Modul verschieden ist (Texte,
 * Zusatzfelder, Faelligkeit ab Vertragsbeginn, Sperre ohne Modalitaeten),
 * steht im Abschnitt "Module" und ist ausdruecklich nach Modul benannt. Der
 * Datenbankteil steht in src/lib/abteilungsaufgaben-dienst.ts,
 * abteilungsaufgaben-uebergaenge.ts und (Onboarding)
 * abteilungsaufgaben-onboarding.ts.
 *
 * Die Regeln in einem Satz je Thema:
 *   - Empfaenger: VORGESETZTER geht IMMER an die Fuehrungskraft des Vorgangs,
 *     alle anderen an die aktive Adresse aus Einstellungen → Abteilungen, die
 *     der Einrichtung vor der zentralen. HR und MITARBEITER nie.
 *   - Ein verschickter Link bleibt gueltig. Einen neuen Token gibt es nur ueber
 *     ausdrueckliche HR-Aktionen (Erneut senden/Erinnern nach Adressaenderung,
 *     Link erneuern) — nie still im taeglichen Lauf.
 *   - Nachweis nur bei echtem Versand (SENT oder an einen Webhook uebergeben).
 *   - Erinnerungen nur an informierte Abteilungen mit offenen Aufgaben, ab dem
 *     letzten Versand gezaehlt, und nicht laenger als 30 Tage nach der
 *     spaetesten offenen Faelligkeit. Die erste Erinnerung mit einer eilenden
 *     Ausstattungsaufgabe ist hoechstens WARNING (eiltDeckeln, Onboarding).
 *   - Kommentare der Abteilung gehen in HTML-Mails nur maskiert hinaus.
 *   - Nachtrag (nur Onboarding, Ausstattung & Zugaenge, Regel 10): Was HR
 *     nach der Information einer Stelle aendert, erfaehrt sie mit „Nachtrag
 *     senden“ (gleicher Link) oder mit der naechsten Zuweisungsmail (F7).
 *   - Waechter (nur Onboarding, Regel 15): Ist eine Stelle nicht informiert
 *     oder ein Nachtrag offen und die frueheste offene Faelligkeit weniger als
 *     7 Tage entfernt, wird ihre Zeile rot (`waechterHinweis`).
 *   - Absage (nur Onboarding, E-A20): Nach EXPIRED kann HR die schon
 *     informierten Stellen per Knopf benachrichtigen — einmal je Stelle, an die
 *     Adresse, die informiert wurde, ohne Link, mit den schon erledigten
 *     Aufgaben (`absageStand`, `erledigteListeMailFelder`).
 */

import {
  LINK_ABTEILUNGEN,
  PORTAL_ZUSTAENDIGE,
  RESERVIERTE_ABTEILUNGSSCHLUESSEL,
  DEPARTMENT_KEYS,
  abteilungLabel,
} from "@/lib/constants";
import { escapeHtml } from "@/lib/email-layout";
import { formatDatumDE } from "@/lib/format";
import { vorgesetzteAbgesendet } from "@/lib/onboarding-spuren";

// =============================================
// Konstanten
// =============================================

const MS_PRO_TAG = 86_400_000;
const MS_PRO_MINUTE = 60_000;

/** Ein Link gilt mindestens so lange ab dem Versand. */
export const GUELTIG_MIN_TAGE = 90;
/** … und mindestens so lange ueber die spaeteste Faelligkeit hinaus. */
export const NACH_FAELLIGKEIT_TAGE = 30;
/** Keine Erinnerung mehr, wenn die spaeteste offene Faelligkeit laenger zurueckliegt. */
export const ERINNERUNG_MAX_UEBERFAELLIG_TAGE = 30;
/** "Erinnern" und "Erneut senden" sind je Link so lange nach dem letzten Versand gesperrt. */
export const SPERRZEIT_MINUTEN = 10;
/** Hoechstlaenge des Kommentars der Abteilung. */
export const KOMMENTAR_MAX = 1000;
/** Hoechstlaenge eines gespeicherten Versandgrunds (lastSendDetail). */
export const DETAIL_MAX = 300;
/** INFO-Erinnerung, wenn eine Aufgabe in so vielen Tagen faellig wird. */
export const VORLAUF_TAGE = 3;
/**
 * Regel 15 (Ausstattung & Zugaenge): Der Waechter faerbt die Zeile einer
 * Stelle rot, wenn die frueheste offene Faelligkeit weniger als so viele
 * Berliner Kalendertage entfernt ist (oder schon vorbei). Steht hier und nicht
 * in ausstattung.ts, weil diese Datei von dort nichts importiert; ausstattung.ts
 * reicht den Wert weiter.
 */
export const WAECHTER_TAGE = 7;
/** So viele Titel nennt die Zeile „Nach der Information geändert: …“ einzeln, der Rest steht als Anzahl. */
export const NACHTRAG_TITEL_MAX = 4;

/** Schluessel der Fuehrungskraft (geht nie an DepartmentConfig). */
export const FUEHRUNGSKRAFT_SCHLUESSEL = DEPARTMENT_KEYS.VORGESETZTER;

/**
 * Form eines Abteilungsschluessels: Grossbuchstabe, dann 1–29 Grossbuchstaben,
 * Ziffern oder Unterstriche. "IT", "DSB", "EMPFANG_2".
 */
export const ABTEILUNGS_SCHLUESSEL_MUSTER = /^[A-Z][A-Z0-9_]{1,29}$/;

/**
 * Text, mit dem der Mailer ein SKIPPED wegen deaktivierter Vorlage begruendet
 * (src/lib/mailer.ts, sendEventEmail). Die WEBHOOK-Regel unten haengt an genau
 * diesem Wortlaut; ein Test prueft, dass mailer.ts ihn weiter verwendet.
 */
export const VORLAGE_DEAKTIVIERT_DETAIL = "E-Mail-Vorlage ist deaktiviert";

// =============================================
// Meldungen (eine Quelle fuer Server und Oberflaeche)
// =============================================

export const MELDUNGEN = {
  // Oeffentliche Link-Seite
  LINK_UNGUELTIG: "Ungültiger Link",
  LINK_ABGELAUFEN: "Dieser Link ist abgelaufen.",
  VORGANG_ABGEBROCHEN: "Dieser Vorgang wurde abgebrochen. Bitte keine weiteren Schritte unternehmen.",
  VORGANG_ABGESCHLOSSEN_NUR_LESEN:
    "Dieser Vorgang ist abgeschlossen. Änderungen sind nicht mehr möglich.",
  ZU_VIELE_ANFRAGEN: "Zu viele Anfragen. Bitte warten Sie einen Moment.",
  AUFGABE_NICHT_GEFUNDEN: "Aufgabe nicht gefunden",
  /**
   * Ausstattung & Zugaenge (R9, E-A21, 409): Die Personalabteilung hat die
   * Aufgabe gestrichen — abhaken und wieder oeffnen geht nicht mehr, ein
   * Kommentar schon. Link-Seite (Sie) und Portal-PATCH.
   */
  AUFGABE_ENTFAELLT:
    "Diese Aufgabe entfällt – die Personalabteilung hat sie gestrichen. Sie lässt sich nicht mehr abhaken oder wieder öffnen.",
  UNGUELTIGE_EINGABE: "Ungültige Eingabe",
  // HR im Portal
  VORGANG_NICHT_GEFUNDEN: "Offboarding-Vorgang nicht gefunden",
  EINTRAG_NICHT_GEFUNDEN: "Checklisten-Eintrag nicht gefunden",
  VERSAND_LAEUFT: "Der Versand läuft bereits.",
  HR_VORGANG_ABGESCHLOSSEN:
    "Der Vorgang ist abgeschlossen. Abteilungen können nicht mehr informiert werden.",
  HR_VORGANG_ABGEBROCHEN:
    "Der Vorgang wurde abgebrochen. Abteilungen können nicht mehr informiert werden.",
  CHECKLISTE_ABGEBROCHEN:
    "Der Vorgang wurde abgebrochen. Die Checkliste kann nicht mehr geändert werden.",
  PORTAL_ZUSTAENDIG:
    "Diese Zuständigkeit arbeitet im Portal und bekommt keinen Link.",
  KEINE_ABTEILUNGSAUFGABEN:
    "In dieser Checkliste ist keine Aufgabe einer Abteilung zugeordnet.",
  NIEMAND_OFFEN: "Es gibt keine Abteilung, die noch informiert werden muss.",
  FUEHRUNGSKRAFT_NICHT_FREIGEGEBEN:
    "Die Adresse der Führungskraft liegt in keiner freigegebenen Domain (Einstellungen → SMTP → Erlaubte Empfänger-Domains). Bitte eine dienstliche Adresse eintragen.",
  // ---- Paket 5: Onboarding ----
  /** 404 im Onboarding — derselbe Text wie in GET/PATCH /api/onboarding/[id]. */
  ONBOARDING_VORGANG_NICHT_GEFUNDEN: "Vorgang nicht gefunden",
  /** Oeffentliche Seite, Onboarding EXPIRED (410). */
  VORGANG_NICHT_MEHR_AKTIV: "Dieser Vorgang ist nicht mehr aktiv. Bitte keine weiteren Schritte unternehmen.",
  /** HR-Aktion im Onboarding mit Status EXPIRED (409). */
  HR_VORGANG_ABGELAUFEN:
    "Der Vorgang ist abgelaufen. Abteilungen können nicht mehr informiert werden.",
  /** Portal-PATCH im Onboarding mit Status EXPIRED (409; Notiz geht). */
  CHECKLISTE_ABGELAUFEN:
    "Der Vorgang ist abgelaufen. Die Checkliste kann nicht mehr geändert werden.",
  /** Sperre ohne eingereichte Einstellungsmodalitaeten (409, Karte, Stepper). */
  MODALITAETEN_FEHLEN:
    "Die Einstellungsmodalitäten sind noch nicht eingereicht. Erst mit ihnen steht der Vertragsbeginn fest, nach dem sich die Fälligkeiten richten. Danach lassen sich die Abteilungen informieren.",
  /** Modalitaeten eingereicht, aber ohne Vertragsbeginn (Altfall, 409). */
  VERTRAGSBEGINN_FEHLT:
    "Der Vertragsbeginn fehlt. Die Fälligkeiten der Aufgaben richten sich nach dem Vertragsbeginn aus den Einstellungsmodalitäten.",
  /** Oeffentliche Onboarding-Seite, solange kein Name bekannt ist. */
  NAME_FOLGT: "Name folgt",
  // ---- Paket A3: Absage an die Stellen (E-A20, nur Onboarding) ----
  /** Aktion `absage` an einem Vorgang, der nicht EXPIRED ist (409, grund NICHT_ABGESAGT). */
  ABSAGE_NUR_ABGELAUFEN:
    "Eine Absage an die Stellen ist erst möglich, wenn der Vorgang als abgelaufen markiert ist.",
  /** Absage, aber keine Stelle hat je eine Aufgaben-E-Mail bekommen (409). */
  ABSAGE_NIEMAND_INFORMIERT: "Keine Stelle war informiert – eine Absage ist nicht nötig.",
  /** Zweiter Klick: Jede informierte Stelle hat die Absage schon (409). */
  ABSAGE_BEREITS_GESENDET: "Die Absage ist bereits an alle informierten Stellen gegangen.",
} as const;

/**
 * Antwort der Dienstfunktionen an die Routen: Status und JSON-Body, den die
 * Route unveraendert als `NextResponse.json(body, { status })` ausgibt.
 */
export interface DienstAntwort {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Warnung, wenn eine Mail hinausging, ihr Ergebnis aber nicht gespeichert
 * werden konnte (Datenbankfehler nach dem Versand). Die Karte zeigt die
 * Abteilung dann weiter als nicht informiert — ein zweiter Klick schickte
 * dieselbe Mail noch einmal.
 */
export function meldungNachweisFehlt(namen: ReadonlyArray<string>): string {
  const wer = namen.join(", ");
  return `Achtung: Die E-Mail an ${wer} ist versendet, das Ergebnis konnte aber nicht gespeichert werden. Die Übersicht zeigt den Versand deshalb nicht – bitte nicht erneut senden.`;
}

/** Unbekannte Zustaendigkeit (Portal-PATCH der Checkliste). */
export function meldungUnbekannteZustaendigkeit(schluessel: string): string {
  return `Unbekannte Zuständigkeit „${schluessel}“. Bitte eine Abteilung aus Einstellungen → Abteilungen wählen.`;
}

// =============================================
// Gruende (warum eine Abteilung nicht angeschrieben wurde)
// =============================================

export type Grund =
  | "KEINE_ADRESSE"
  | "ABTEILUNG_INAKTIV"
  | "KEINE_FUEHRUNGSKRAFT"
  | "ALLES_ERLEDIGT"
  | "BEREITS_INFORMIERT"
  | "NICHT_INFORMIERT"
  | "MAIL_NICHT_VERSENDET"
  | "MAIL_FEHLGESCHLAGEN"
  | "ADRESSE_GEAENDERT"
  | "SPERRZEIT"
  | "VORGANG_ABGESCHLOSSEN"
  /** Ausstattung & Zugaenge: Aufgabe von HR gestrichen (409 beim Abhaken, Link und Portal). */
  | "AUFGABE_ENTFAELLT"
  /** Ausstattung & Zugaenge (Regel 10): „Nachtrag senden“, aber die Aenderungsliste ist leer. */
  | "KEIN_NACHTRAG"
  /** Absage (E-A20): Diese Stelle hat die Absage schon bekommen (F13, `abgesagtAm`). */
  | "BEREITS_ABGESAGT";

export const GRUND_TEXTE: Record<Grund, string> = {
  KEINE_ADRESSE: "keine aktive Adresse hinterlegt (Einstellungen → Abteilungen)",
  ABTEILUNG_INAKTIV: "Abteilung ist deaktiviert (Einstellungen → Abteilungen)",
  KEINE_FUEHRUNGSKRAFT: "keine Führungskraft hinterlegt – bitte im Tab Übersicht eintragen",
  ALLES_ERLEDIGT: "alle Aufgaben sind erledigt",
  BEREITS_INFORMIERT: "bereits informiert",
  NICHT_INFORMIERT: "noch nicht informiert",
  MAIL_NICHT_VERSENDET: "nicht versendet",
  MAIL_FEHLGESCHLAGEN: "Versand fehlgeschlagen",
  ADRESSE_GEAENDERT: "Adresse geändert, bitte Link erneuern",
  SPERRZEIT: `vor weniger als ${SPERRZEIT_MINUTEN} Minuten bereits angeschrieben – bitte kurz warten`,
  VORGANG_ABGESCHLOSSEN: "Vorgang ist abgeschlossen",
  AUFGABE_ENTFAELLT: "Aufgabe entfällt (von der Personalabteilung gestrichen)",
  KEIN_NACHTRAG: "seit der letzten E-Mail nichts geändert – kein Nachtrag nötig",
  BEREITS_ABGESAGT: "Absage bereits gesendet",
};

/**
 * Lesbarer Grund. Bei den beiden Mailgruenden haengt das Detail aus dem
 * Mailer an ("Versand fehlgeschlagen: SMTP-Server nicht erreichbar").
 */
export function grundText(grund: Grund, detail?: string | null): string {
  const basis = GRUND_TEXTE[grund];
  if ((grund === "MAIL_NICHT_VERSENDET" || grund === "MAIL_FEHLGESCHLAGEN") && detail) {
    return `${basis}: ${detail}`;
  }
  return basis;
}

/** Gruende, die kein Problem sind — sie tauchen in "Nicht informiert: …" nicht auf. */
const GRUENDE_OHNE_PROBLEM: ReadonlySet<Grund> = new Set([
  "BEREITS_INFORMIERT",
  "ALLES_ERLEDIGT",
  "KEIN_NACHTRAG",
  "BEREITS_ABGESAGT",
]);

// =============================================
// Hilfen
// =============================================

function alsDatum(wert: Date | string | null | undefined): Date | null {
  if (wert == null) return null;
  const d = wert instanceof Date ? wert : new Date(wert);
  return Number.isNaN(d.getTime()) ? null : d;
}

function spaeteres(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

function kuerzen(text: string, max = DETAIL_MAX): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Gleiche Adresse — ohne Gross/Klein und ohne Leerzeichen am Rand. */
export function adresseGleich(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

// =============================================
// Zustaendigkeiten
// =============================================

/** Arbeitet im Portal (HR, MITARBEITER) — bekommt nie einen Link. */
export function istPortalZustaendig(schluessel: string | null | undefined): boolean {
  return !!schluessel && (PORTAL_ZUSTAENDIGE as readonly string[]).includes(schluessel);
}

/**
 * Bekommt die Aufgaben per Link: jede Zustaendigkeit ausser HR/MITARBEITER —
 * also die festen Link-Abteilungen, die Fuehrungskraft UND eigene Schluessel.
 * Eine Aufgabe ohne Zustaendigkeit gehoert niemandem.
 *
 * Seit Paket 5 nur ein Wert in SCHLUESSELFORM (ABTEILUNGS_SCHLUESSEL_MUSTER):
 * Ein Freitext wie „Werkstatt" oder „Kantine", den die Migration
 * ONBOARDING_ABTEILUNGSAUFGABEN_V1 keinem Schluessel zuordnen konnte, ist keine
 * Abteilung, an die ein Link ginge — er erscheint als unbekannte Zustaendigkeit
 * (`unbekannteZustaendigkeiten` in abteilungsZeilenBauen), nicht als Zeile
 * „keine aktive Adresse". Im Offboarding stehen ohnehin nur Schluessel.
 */
export function istLinkAbteilung(schluessel: string | null | undefined): boolean {
  return (
    !!schluessel &&
    abteilungsSchluesselGueltig(schluessel) &&
    !istPortalZustaendig(schluessel)
  );
}

export function istFuehrungskraft(schluessel: string | null | undefined): boolean {
  return schluessel === FUEHRUNGSKRAFT_SCHLUESSEL;
}

/** Form ok (Muster oben)? Sagt nichts darueber, ob der Schluessel bekannt ist. */
export function abteilungsSchluesselGueltig(schluessel: string): boolean {
  return ABTEILUNGS_SCHLUESSEL_MUSTER.test(schluessel);
}

/**
 * Bekannt = fester Schluessel (DEPARTMENT_KEYS) oder unter Einstellungen →
 * Abteilungen angelegt (auch deaktiviert).
 */
export function abteilungsSchluesselBekannt(
  schluessel: string,
  konfigSchluessel: ReadonlyArray<string>,
): boolean {
  return (
    (Object.values(DEPARTMENT_KEYS) as string[]).includes(schluessel) ||
    konfigSchluessel.includes(schluessel)
  );
}

/**
 * Reihenfolge der Zeilen auf der Karte: feste Link-Abteilungen, dann eigene
 * Schluessel alphabetisch, die Fuehrungskraft zuletzt.
 */
export function abteilungsReihenfolge(schluessel: Iterable<string>): string[] {
  const alle = [...new Set(schluessel)].filter(istLinkAbteilung);
  const fest = (LINK_ABTEILUNGEN as readonly string[]).filter((k) => alle.includes(k));
  const eigene = alle
    .filter((k) => !(LINK_ABTEILUNGEN as readonly string[]).includes(k) && !istFuehrungskraft(k))
    .sort();
  const fuehrung = alle.filter(istFuehrungskraft);
  return [...fest, ...eigene, ...fuehrung];
}

// =============================================
// Zustaendigkeit aus Freitext (Paket 5, Onboarding)
// =============================================

/** Kleinbuchstaben, Umlaute ausgeschrieben, alles ausser a–z/0–9 als Leerzeichen. */
function zustaendigkeitNormalisieren(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Freitext-Zustaendigkeit → Schluessel. Bis Paket 5 trugen die Onboarding-
 * Vorlagen Freitext („Verwaltung", „Vorgesetzter"); die Migration
 * ONBOARDING_ABTEILUNGSAUFGABEN_V1 stellt ihn damit um, die Anlage eines
 * Vorgangs (POST /api/onboarding) normalisiert ebenso.
 *
 *   leer                                          → null
 *   Schluesselform (IT, HR, DSB, EMPFANG_2 …)     → bleibt, wie er ist
 *   HR…, Personal…                                → HR
 *   IT… (erstes Wort), EDV…                       → IT
 *   Verw…, …sekretariat…                          → VERWALTUNG
 *   Vorgesetzt…, …führungskraft…, …leitung (Wort) → VORGESETZTER
 *   Facility…, …hausmeister…, …haustechnik…       → FACILITY
 *   …buchhaltung…                                 → BUCHHALTUNG
 *   Datenschutz…, DSB                             → DSB
 *   Mitarbeit…, Beschäftigt…                      → MITARBEITER
 *   sonst                                         → null (unbekannt: bleibt
 *                                                   stehen und wird gemeldet)
 *
 * Die Anzeigenamen aus DEPARTMENT_LABELS bilden sich auf ihren Schluessel ab.
 * Eine JS-Kopie steht in prisma/seed-check.js (abteilungAusZustaendigkeitJs);
 * src/__tests__/lib/onboarding-abteilungsaufgaben-migration.test.ts haelt beide
 * zusammen — wer hier aendert, aendert dort mit.
 */
export function abteilungAusZustaendigkeit(text: string | null | undefined): string | null {
  const roh = (text ?? "").trim();
  if (!roh) return null;
  if (ABTEILUNGS_SCHLUESSEL_MUSTER.test(roh)) return roh;

  const n = zustaendigkeitNormalisieren(roh);
  if (!n) return null;
  const woerter = n.split(" ");
  const erstes = woerter[0];

  if (erstes === "hr" || n.startsWith("personal")) return DEPARTMENT_KEYS.HR;
  if (erstes === "it" || n.startsWith("edv")) return DEPARTMENT_KEYS.IT;
  if (n.startsWith("verw") || n.includes("sekretariat")) return DEPARTMENT_KEYS.VERWALTUNG;
  if (
    n.startsWith("vorgesetzt") ||
    n.includes("fuehrungskraft") ||
    woerter.some((w) => w.endsWith("leitung"))
  ) {
    return DEPARTMENT_KEYS.VORGESETZTER;
  }
  if (n.startsWith("facility") || n.includes("hausmeister") || n.includes("haustechnik")) {
    return DEPARTMENT_KEYS.FACILITY;
  }
  if (n.includes("buchhaltung")) return DEPARTMENT_KEYS.BUCHHALTUNG;
  if (n.startsWith("datenschutz") || erstes === "dsb") return DEPARTMENT_KEYS.DSB;
  if (n.startsWith("mitarbeit") || n.startsWith("beschaeftigt")) return DEPARTMENT_KEYS.MITARBEITER;
  return null;
}

/**
 * Offboarding-Vorlage? Die Checklisten-Vorlagen beider Module liegen in
 * derselben Tabelle; unterschieden werden sie seit jeher am Namen
 * („Offboarding: …", checklisten-content.tsx und src/lib/offboarding.ts).
 * Dieselbe Regel steht als JS in prisma/seed-check.js.
 */
export function istOffboardingVorlagenName(name: string | null | undefined): boolean {
  return (name ?? "").trim().startsWith("Offboarding:");
}

// =============================================
// Empfaenger
// =============================================

export interface AbteilungsKonfig {
  departmentKey: string;
  departmentName: string;
  email: string;
  organizationId: string | null;
  isActive: boolean;
}

export interface FuehrungskraftDaten {
  email: string | null;
  name: string | null;
}

/** Woher die wirksame Fuehrungskraft stammt (fuehrungskraftErmitteln im Dienst). */
export type FuehrungskraftQuelle = "VORGANG" | "ZEUGNIS" | "VERTRAGSENDE";

/**
 * Wirksame Fuehrungskraft eines Vorgangs samt Quelle — so liefert sie
 * GET /api/offboarding/[id] (`fuehrungskraft`). Steht hier und nicht im
 * Dienst, damit die Oberflaeche den Typ ohne Umweg ueber eine Server-Datei
 * bekommt.
 */
export interface Fuehrungskraft extends FuehrungskraftDaten {
  quelle: FuehrungskraftQuelle | null;
}

export type Empfaenger =
  | {
      ok: true;
      email: string;
      /** Anzeigename fuer Link, Mail ({{abteilung}}) und Karte. */
      departmentName: string;
      quelle: "EINRICHTUNG" | "ZENTRAL" | "FUEHRUNGSKRAFT";
    }
  | {
      ok: false;
      grund: "KEINE_ADRESSE" | "ABTEILUNG_INAKTIV" | "KEINE_FUEHRUNGSKRAFT";
      departmentName: string;
    };

/**
 * Wer bekommt die Aufgaben dieses Schluessels?
 *
 *   - VORGESETZTER: die Fuehrungskraft des Vorgangs. Ein DepartmentConfig-
 *     Eintrag VORGESETZTER wird bewusst ignoriert.
 *   - sonst: aktiver Eintrag der Einrichtung vor aktivem zentralen Eintrag.
 *     Gibt es nur deaktivierte, heisst der Grund ABTEILUNG_INAKTIV, gibt es gar
 *     keinen, KEINE_ADRESSE.
 *   - HR/MITARBEITER: nie ok (KEINE_ADRESSE). Aufrufer filtern vorher mit
 *     istLinkAbteilung; die Antwort ist nur das Sicherheitsnetz.
 */
export function empfaengerAufloesen(opts: {
  departmentKey: string;
  organizationId: string;
  konfigs: ReadonlyArray<AbteilungsKonfig>;
  fuehrungskraft: FuehrungskraftDaten | null;
}): Empfaenger {
  const { departmentKey: key } = opts;
  const label = abteilungLabel(key);

  if (istFuehrungskraft(key)) {
    const email = opts.fuehrungskraft?.email?.trim() ?? "";
    return email
      ? { ok: true, email, departmentName: label, quelle: "FUEHRUNGSKRAFT" }
      : { ok: false, grund: "KEINE_FUEHRUNGSKRAFT", departmentName: label };
  }
  if (!istLinkAbteilung(key)) {
    return { ok: false, grund: "KEINE_ADRESSE", departmentName: label };
  }

  const passend = opts.konfigs.filter((k) => k.departmentKey === key);
  const einrichtung = passend.find((k) => k.isActive && k.organizationId === opts.organizationId);
  if (einrichtung) {
    return {
      ok: true,
      email: einrichtung.email.trim(),
      departmentName: einrichtung.departmentName || label,
      quelle: "EINRICHTUNG",
    };
  }
  const zentral = passend.find((k) => k.isActive && k.organizationId === null);
  if (zentral) {
    return {
      ok: true,
      email: zentral.email.trim(),
      departmentName: zentral.departmentName || label,
      quelle: "ZENTRAL",
    };
  }
  const inaktiv = passend.find(
    (k) => !k.isActive && (k.organizationId === opts.organizationId || k.organizationId === null),
  );
  if (inaktiv) {
    return { ok: false, grund: "ABTEILUNG_INAKTIV", departmentName: inaktiv.departmentName || label };
  }
  return { ok: false, grund: "KEINE_ADRESSE", departmentName: label };
}

// =============================================
// Versandentscheidung ("Abteilungen informieren")
// =============================================

export type VersandEntscheidung = { senden: true } | { senden: false; grund: Grund };

/**
 * Soll "Abteilungen informieren" diese Abteilung anschreiben?
 *
 * Reihenfolge: nichts offen → ALLES_ERLEDIGT; schon erfolgreich informiert
 * (sentAt) → BEREITS_INFORMIERT; kein Empfaenger → dessen Grund; sonst ja.
 * Ein Link mit FAILED/SKIPPED hat sentAt null und wird deshalb erneut versucht.
 */
export function versandEntscheidung(opts: {
  offeneAufgaben: number;
  link: { sentAt: Date | string | null } | null;
  empfaenger: Empfaenger;
}): VersandEntscheidung {
  if (opts.offeneAufgaben <= 0) return { senden: false, grund: "ALLES_ERLEDIGT" };
  if (opts.link?.sentAt) return { senden: false, grund: "BEREITS_INFORMIERT" };
  if (!opts.empfaenger.ok) return { senden: false, grund: opts.empfaenger.grund };
  return { senden: true };
}

// =============================================
// Gueltigkeit
// =============================================

/**
 * Gueltig bis = max(jetzt + 90 Tage, spaeteste Faelligkeit + 30 Tage).
 * Uebergeben werden die Faelligkeiten der OFFENEN Aufgaben dieser Abteilung;
 * ohne Faelligkeiten gilt jetzt + 90 Tage.
 */
export function gueltigBis(
  jetzt: Date,
  faelligkeiten: ReadonlyArray<Date | string | null | undefined>,
): Date {
  let bis = jetzt.getTime() + GUELTIG_MIN_TAGE * MS_PRO_TAG;
  for (const f of faelligkeiten) {
    const d = alsDatum(f);
    if (d) bis = Math.max(bis, d.getTime() + NACH_FAELLIGKEIT_TAGE * MS_PRO_TAG);
  }
  return new Date(bis);
}

/** Muss der Link (mit GLEICHEM Token) verlaengert werden? */
export function verlaengerungNoetig(expiresAt: Date | string, neuBis: Date): boolean {
  const d = alsDatum(expiresAt);
  return !d || d.getTime() < neuBis.getTime();
}

/** Faelligkeit um dieselbe Spanne verschieben, um die sich der Bezugstag verschoben hat. */
export function faelligkeitVerschoben(faellig: Date, altBezug: Date, neuBezug: Date): Date {
  return new Date(faellig.getTime() + (neuBezug.getTime() - altBezug.getTime()));
}

const BERLIN_KALENDERTAG = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Faelligkeit = Bezugstag + `tage` Kalendertage, als UTC-Mitternacht (so liegen
 * alle Tagesdaten in der Datenbank, vgl. offboarding.ts: lastWorkingDay +
 * defaultDueDays). Im Onboarding ist der Bezugstag der Vertragsbeginn aus den
 * EINGEREICHTEN Modalitaeten.
 *
 * Der Bezugstag wird als Kalendertag in deutscher Zeit gelesen — das ist der
 * Tag, den formatDatumDE anzeigt. Fuer die ueblichen Werte (UTC-Mitternacht,
 * `new Date("2026-10-01")`) ist das derselbe Tag; ein Wert wie
 * 2026-09-30T22:00Z (deutsche Mitternacht) wird so nicht zum 30.09.
 *
 * `null`, wenn Bezugstag oder Tage fehlen: Punkte ohne Tagesangabe bleiben
 * ohne Faelligkeit (keine kuenstlichen Fristen, keine Erinnerung). 0 bleibt 0.
 */
export function faelligkeitAus(
  bezug: Date | string | null | undefined,
  tage: number | null | undefined,
): Date | null {
  const d = alsDatum(bezug);
  if (!d || tage == null || !Number.isFinite(tage)) return null;
  const teile = Object.fromEntries(BERLIN_KALENDERTAG.formatToParts(d).map((t) => [t.type, t.value]));
  return new Date(
    Date.UTC(Number(teile.year), Number(teile.month) - 1, Number(teile.day) + Math.trunc(tage)),
  );
}

// =============================================
// Sperrzeit (Erinnern / Erneut senden)
// =============================================

/**
 * Bis wann ist "Erinnern"/"Erneut senden" fuer diesen Link gesperrt?
 * Bezug ist der letzte erfolgreiche Versand oder die letzte Erinnerung.
 * `null` = nicht gesperrt.
 */
export function sperrzeitBis(
  link: { lastSentAt?: Date | string | null; lastReminderAt?: Date | string | null },
  jetzt: Date,
): Date | null {
  const letzte = spaeteres(alsDatum(link.lastSentAt), alsDatum(link.lastReminderAt));
  if (!letzte) return null;
  const bis = new Date(letzte.getTime() + SPERRZEIT_MINUTEN * MS_PRO_MINUTE);
  return bis.getTime() > jetzt.getTime() ? bis : null;
}

// =============================================
// Erinnerungsstufen
// =============================================

export type ErinnerungsStufe = "INFO" | "WARNING" | "ESCALATION";

/** Mindestabstand zwischen zwei Erinnerungen je Stufe (Tage). */
export const STUFEN_ABSTAND_TAGE: Record<ErinnerungsStufe, number> = {
  INFO: 3,
  WARNING: 2,
  ESCALATION: 5,
};

export interface StufenBerechnung {
  level: ErinnerungsStufe | null;
  offeneAufgaben: number;
  /** Aufgaben, deren Faelligkeit mindestens einen vollen Tag zurueckliegt. */
  overdueItems: number;
  /** Nicht ueberfaellig und in den naechsten 3 Tagen (oder heute) faellig. */
  upcomingItems: number;
  /** Ganze Tage der aeltesten Ueberfaelligkeit (0, wenn nichts ueberfaellig). */
  tageUeberfaellig: number;
  /** Spaeteste Faelligkeit unter den offenen Aufgaben (null ohne Faelligkeiten). */
  spaetesteFaelligkeit: Date | null;
}

/**
 * Stufe aus den OFFENEN Aufgaben einer Abteilung.
 *
 * Ueberfaellig ist eine Aufgabe ab einem vollen Tag nach ihrer Faelligkeit
 * (Faelligkeiten liegen als Tagesbeginn UTC in der Datenbank, siehe
 * offboarding.ts). Stufen: >= 3 Tage ueberfaellig ESCALATION, >= 1 Tag
 * WARNING, sonst INFO, wenn etwas in den naechsten 3 Tagen faellig wird.
 * Aufgaben ohne Faelligkeit zaehlen nur als "offen".
 */
export function stufeBerechnen(
  offene: ReadonlyArray<{ dueDate: Date | string | null }>,
  jetzt: Date,
): StufenBerechnung {
  let overdueItems = 0;
  let upcomingItems = 0;
  let tageUeberfaellig = 0;
  let spaeteste: Date | null = null;
  const vorlaufBis = jetzt.getTime() + VORLAUF_TAGE * MS_PRO_TAG;

  for (const aufgabe of offene) {
    const faellig = alsDatum(aufgabe.dueDate);
    if (!faellig) continue;
    spaeteste = spaeteres(spaeteste, faellig);
    const tage = Math.floor((jetzt.getTime() - faellig.getTime()) / MS_PRO_TAG);
    if (tage >= 1) {
      overdueItems++;
      tageUeberfaellig = Math.max(tageUeberfaellig, tage);
    } else if (faellig.getTime() <= vorlaufBis) {
      upcomingItems++;
    }
  }

  let level: ErinnerungsStufe | null = null;
  if (tageUeberfaellig >= 3) level = "ESCALATION";
  else if (tageUeberfaellig >= 1) level = "WARNING";
  else if (upcomingItems > 0) level = "INFO";

  return {
    level,
    offeneAufgaben: offene.length,
    overdueItems,
    upcomingItems,
    tageUeberfaellig,
    spaetesteFaelligkeit: spaeteste,
  };
}

export interface LinkErinnerungsStand {
  sentAt: Date | string | null;
  lastSentAt?: Date | string | null;
  lastReminderAt: Date | string | null;
  allTasksComplete: boolean;
  /**
   * Zahl der bisherigen Erinnerungen an diesen Link (Spalte `reminderCount`).
   * Nur fuer `eiltDeckeln` — fehlt er, wird nie gedeckelt.
   */
  reminderCount?: number | null;
}

/**
 * Regel 14 (Ausstattung & Zugaenge, Paket A3): Eine kurzfristige Einstellung
 * soll mit der ersten Erinnerung nicht gleich eskalieren. Ist das die ERSTE
 * Erinnerung an den Link (`reminderCount === 0`) und ist unter den offenen
 * Aufgaben eine, die „eilt“ (ihre Frist wurde beim Anlegen oder beim Versand
 * auf heute angehoben), wird ESCALATION zu WARNING. Alles andere bleibt: INFO
 * und WARNING unveraendert, ab der zweiten Erinnerung die volle Stufe, ohne
 * eilende Aufgabe (Vorlagenaufgaben, Offboarding) nie gedeckelt.
 *
 * Genutzt in `erinnerungsStufe` (taeglicher Lauf) und beim Knopf „Erinnern“.
 */
export function eiltDeckeln(
  stufe: ErinnerungsStufe | null,
  offene: ReadonlyArray<{ eilt?: boolean | null }>,
  reminderCount: number | null | undefined,
): ErinnerungsStufe | null {
  if (stufe !== "ESCALATION" || reminderCount !== 0) return stufe;
  return offene.some((a) => a.eilt === true) ? "WARNING" : stufe;
}

/** Bezugspunkt der Abstaende: max(lastSentAt ?? sentAt, lastReminderAt). */
export function erinnerungsBezug(link: LinkErinnerungsStand): Date | null {
  const versand = alsDatum(link.lastSentAt) ?? alsDatum(link.sentAt);
  return spaeteres(versand, alsDatum(link.lastReminderAt));
}

export type ErinnerungsEntscheidung =
  | { erinnern: true; stufe: StufenBerechnung & { level: ErinnerungsStufe } }
  | {
      erinnern: false;
      warum: "NICHT_INFORMIERT" | "ALLES_ERLEDIGT" | "ENDE" | "KEINE_STUFE" | "ZU_FRUEH";
      stufe: StufenBerechnung | null;
    };

/**
 * Soll der taegliche Lauf diese Abteilung heute erinnern?
 *
 *   - nie informiert (sentAt null)            → nein (NICHT_INFORMIERT)
 *   - nichts offen                            → nein (ALLES_ERLEDIGT)
 *   - spaeteste offene Faelligkeit > 30 Tage  → nein (ENDE)
 *   - keine Stufe                             → nein (KEINE_STUFE)
 *   - letzter Versand/Erinnerung zu kurz her  → nein (ZU_FRUEH)
 *
 * Die Stufe geht durch `eiltDeckeln` (Regel 14): erste Erinnerung mit einer
 * eilenden Aufgabe hoechstens WARNING — samt deren Abstand (2 statt 5 Tage).
 *
 * Der Knopf "Erinnern" fragt diese Funktion NICHT: Er ist eine ausdrueckliche
 * HR-Aktion und nimmt `eiltDeckeln(stufeBerechnen(...).level, …) ?? "INFO"`.
 */
export function erinnerungsStufe(
  link: LinkErinnerungsStand,
  offene: ReadonlyArray<{ dueDate: Date | string | null; eilt?: boolean | null }>,
  jetzt: Date,
): ErinnerungsEntscheidung {
  if (!alsDatum(link.sentAt)) return { erinnern: false, warum: "NICHT_INFORMIERT", stufe: null };
  if (link.allTasksComplete || offene.length === 0) {
    return { erinnern: false, warum: "ALLES_ERLEDIGT", stufe: null };
  }
  const berechnet = stufeBerechnen(offene, jetzt);
  const stufe: StufenBerechnung = {
    ...berechnet,
    level: eiltDeckeln(berechnet.level, offene, link.reminderCount),
  };
  if (
    stufe.spaetesteFaelligkeit &&
    jetzt.getTime() - stufe.spaetesteFaelligkeit.getTime() >
      ERINNERUNG_MAX_UEBERFAELLIG_TAGE * MS_PRO_TAG
  ) {
    return { erinnern: false, warum: "ENDE", stufe };
  }
  if (!stufe.level) return { erinnern: false, warum: "KEINE_STUFE", stufe };
  const bezug = erinnerungsBezug(link);
  if (bezug && jetzt.getTime() - bezug.getTime() < STUFEN_ABSTAND_TAGE[stufe.level] * MS_PRO_TAG) {
    return { erinnern: false, warum: "ZU_FRUEH", stufe };
  }
  return { erinnern: true, stufe: { ...stufe, level: stufe.level } };
}

/**
 * Felder der Erinnerungsmail. renderTemplate kennt nur {{#x}} bei nicht
 * leerem Wert — keine Verneinung, keinen Vergleich. Deshalb eigene Merker je
 * Stufe ('ja' oder ''), statt `level` in der Vorlage zu vergleichen.
 * Die englischen Felder (level, overdueItems, …) bleiben fuer Webhooks.
 */
export function stufenMailFelder(
  stufe: StufenBerechnung,
  level: ErinnerungsStufe,
): Record<string, string | number> {
  const ueberfaellig = stufe.overdueItems > 0;
  return {
    level,
    overdueItems: stufe.overdueItems,
    upcomingItems: stufe.upcomingItems,
    totalOpenItems: stufe.offeneAufgaben,
    offene_aufgaben: stufe.offeneAufgaben,
    maxOverdueDays: stufe.tageUeberfaellig,
    ueberfaellige_aufgaben: ueberfaellig ? String(stufe.overdueItems) : "",
    tage_ueberfaellig: ueberfaellig ? String(stufe.tageUeberfaellig) : "",
    ist_ueberfaellig: ueberfaellig ? "ja" : "",
    ist_info: level === "INFO" ? "ja" : "",
    ist_warnung: level === "WARNING" ? "ja" : "",
    ist_eskalation: level === "ESCALATION" ? "ja" : "",
  };
}

// =============================================
// Mailfelder: Aufgabenliste und Kommentar
// =============================================

export interface AufgabeFuerListe {
  title: string;
  dueDate: Date | string | null;
  /**
   * Hinweis fuer die zustaendige Stelle (Paket 5, aus der Vorlage kopiert).
   * Fehlt er oder ist er leer, sieht die Liste aus wie in Paket 1b.
   */
  description?: string | null;
  /**
   * Bemerkung zur Position (Ausstattung & Zugaenge, Regel 8) mit ihrer
   * Beschriftung nach Herkunft („Bemerkung der Führungskraft“ …, aus
   * `bemerkungLabel`). Steht als eigene eingerueckte Zeile unter dem Hinweis.
   */
  bemerkung?: { text: string; label: string } | null;
  /** Frist auf heute angehoben (Regel 14) — „(eilt)“ hinter der Faelligkeit. */
  eilt?: boolean | null;
}

/**
 * Frueheste Faelligkeit zuerst, ohne Faelligkeit zuletzt, sonst Reihenfolge
 * wie uebergeben — dieselbe Ordnung in Mail, Dialog und Vorschau.
 */
export function nachFaelligkeitSortiert<T extends { dueDate: Date | string | null }>(
  aufgaben: ReadonlyArray<T>,
): T[] {
  return aufgaben
    .map((a, i) => ({ a, i, d: alsDatum(a.dueDate) }))
    .sort((x, y) => {
      if (x.d && y.d) return x.d.getTime() - y.d.getTime() || x.i - y.i;
      if (x.d) return -1;
      if (y.d) return 1;
      return x.i - y.i;
    })
    .map((s) => s.a);
}

/**
 * Aufgabenliste fuer die Mail, frueheste Faelligkeit zuerst (ohne Faelligkeit
 * zuletzt, sonst Reihenfolge wie uebergeben).
 *
 *   aufgabenliste       Klartext, eine Zeile je Aufgabe: "- Titel – fällig TT.MM.JJJJ",
 *                       bei angehobener Frist dahinter " (eilt)"; Hinweis und
 *                       Bemerkung („<Label>: <Text>“) stehen eingerueckt darunter
 *   aufgabenliste_html  <ul>…</ul>, Titel, Hinweis und Bemerkung maskiert (renderTemplate maskiert nichts)
 *   anzahl_aufgaben     Anzahl
 *   naechste_faelligkeit TT.MM.JJJJ der fruehesten Faelligkeit, sonst ""
 *
 * Ohne `bemerkung` und `eilt` (Vorlagenaufgaben, Offboarding) bleibt die
 * Ausgabe Byte fuer Byte wie vor Paket A3 — die Katalogbeispiele in events.ts
 * gelten unveraendert. Bemerkungen sind Freitext (≤ 500 Zeichen) und stehen
 * wie der Hinweis in EINER Zeile (Zeilenumbrueche werden Leerzeichen).
 */
export function aufgabenlisteMailFelder(aufgaben: ReadonlyArray<AufgabeFuerListe>): {
  aufgabenliste: string;
  aufgabenliste_html: string;
  anzahl_aufgaben: number;
  naechste_faelligkeit: string;
} {
  const sortiert = nachFaelligkeitSortiert(aufgaben).map((a) => ({ a, d: alsDatum(a.dueDate) }));
  const einzeilig = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
  const grau = (text: string) => `<br><span style="color:#6b7280;font-size:13px;">${escapeHtml(text)}</span>`;

  const zeilen: string[] = [];
  const punkte: string[] = [];
  for (const { a, d } of sortiert) {
    const titel = einzeilig(a.title);
    const faellig = d ? ` – fällig ${formatDatumDE(d)}${a.eilt === true ? " (eilt)" : ""}` : "";
    const hinweis = einzeilig(a.description);
    const bemerkungText = einzeilig(a.bemerkung?.text);
    const bemerkung = bemerkungText ? `${einzeilig(a.bemerkung?.label) || "Bemerkung"}: ${bemerkungText}` : "";
    const darunter = [hinweis, bemerkung].filter((t) => t !== "");
    zeilen.push(`- ${titel}${faellig}${darunter.map((t) => `\n  ${t}`).join("")}`);
    punkte.push(`<li style="margin:0 0 4px;">${escapeHtml(titel)}${faellig}${darunter.map(grau).join("")}</li>`);
  }

  const erste = sortiert.find((s) => s.d)?.d ?? null;
  return {
    aufgabenliste: zeilen.join("\n"),
    aufgabenliste_html:
      punkte.length > 0
        ? `<ul style="margin:0 0 16px;padding-left:20px;color:#374151;font-size:14px;line-height:1.6;">${punkte.join("")}</ul>`
        : "",
    anzahl_aufgaben: aufgaben.length,
    naechste_faelligkeit: erste ? formatDatumDE(erste) : "",
  };
}

/**
 * Die schon erledigten Aufgaben einer Stelle fuer die Absage (E-A20, F17):
 * Vorlagen- UND Ausstattungsaufgaben, die die Stelle erledigt hat — ein „IT-
 * Zugang einrichten“ aus der Vorlage muss genauso zurueckgebaut werden wie ein
 * gewaehlter Zugang. Entfallene Aufgaben (F2: formal erledigt, aber
 * gestrichen) gehoeren nicht dazu; das filtert der Aufrufer, hier steht nur
 * die Darstellung. Reihenfolge wie uebergeben.
 *
 *   erledigte_liste       Klartext, „- Titel“ je Zeile — ROH, nur fuer den
 *                         Textteil (der Mailer maskiert ihn im HTML-Teil
 *                         zusaetzlich, FREITEXT_VARIABLEN)
 *   erledigte_liste_html  dieselben Zeilen als fertige `<ul>` im Stil der
 *                         Aufgabenliste, maskiert
 *   anzahl_erledigt       Anzahl
 *   hat_erledigte         Merker "ja"/"" fuer {{#hat_erledigte}} (Zeichenkette:
 *                         renderTemplate kennt nur „nicht leer“)
 *
 * Nur Titel — nie Bemerkung, Hinweis oder Kommentar. Ein Titel ist einzeilig.
 */
export function erledigteListeMailFelder(aufgaben: ReadonlyArray<{ title: string }>): {
  erledigte_liste: string;
  erledigte_liste_html: string;
  anzahl_erledigt: number;
  hat_erledigte: string;
} {
  const titel = aufgaben.map((a) => a.title.replace(/\s+/g, " ").trim()).filter((t) => t !== "");
  if (titel.length === 0) {
    return { erledigte_liste: "", erledigte_liste_html: "", anzahl_erledigt: 0, hat_erledigte: "" };
  }
  return {
    erledigte_liste: titel.map((t) => `- ${t}`).join("\n"),
    erledigte_liste_html:
      '<ul style="margin:0 0 16px;padding-left:20px;color:#374151;font-size:14px;line-height:1.6;">' +
      titel.map((t) => `<li style="margin:0 0 4px;">${escapeHtml(t)}</li>`).join("") +
      "</ul>",
    anzahl_erledigt: titel.length,
    hat_erledigte: "ja",
  };
}

/**
 * Kommentar der Abteilung fuer die Mail an HR.
 *
 * `kommentar` ist BEREITS maskiert (Zeilenumbrueche als <br>) — auch eine von
 * einem Admin im Editor geaenderte HTML-Vorlage kann ihn gefahrlos einsetzen.
 * Der Rohtext heisst `kommentar_text` und gehoert NUR in den Textteil. Leerer
 * Kommentar = beide "" (der Bedingungsblock {{#kommentar}} faellt weg).
 */
export function kommentarMailFelder(text: string | null | undefined): {
  kommentar: string;
  kommentar_text: string;
} {
  const roh = (text ?? "").trim();
  if (!roh) return { kommentar: "", kommentar_text: "" };
  return {
    kommentar: escapeHtml(roh).replace(/\r\n|\r|\n/g, "<br>"),
    kommentar_text: roh,
  };
}

// =============================================
// Versandergebnis → Stand am Link
// =============================================

export type LinkVersandStatus = "SENT" | "WEBHOOK" | "FAILED" | "SKIPPED";

/** Was triggerWebhooks zurueckgibt (EventEmailResult, hier ohne Import). */
export interface MailErgebnis {
  status: "SENT" | "FAILED" | "SKIPPED";
  detail?: string;
  recipient?: string;
}

export interface LinkVersandErgebnis {
  status: LinkVersandStatus;
  /** Zaehlt als erfolgreicher Versand (sentAt/lastSentAt setzen)? */
  erfolgreich: boolean;
  /** Fuer lastSendDetail, lesbar und gekuerzt; null bei SENT. */
  detail: string | null;
  /** Tatsaechlicher Empfaenger (nur bei SENT). */
  zugestelltAn: string | null;
}

/** Mailer-Begruendungen in lesbares Deutsch; Unbekanntes bleibt, wie es ist. */
export function versandDetailLesbar(detail: string | null | undefined): string {
  const d = (detail ?? "").trim();
  if (!d) return "";
  if (d === VORLAGE_DEAKTIVIERT_DETAIL) return "Vorlage deaktiviert (Einstellungen → E-Mail-Vorlagen)";
  if (d === "Keine E-Mail-Vorlage vorhanden") return "keine E-Mail-Vorlage vorhanden";
  if (d.startsWith("Kein Empfaenger konfiguriert")) return "kein Empfänger in der E-Mail-Vorlage";
  if (d.startsWith("Empfaenger ")) return "Empfänger der E-Mail-Vorlage ergab keine gültige Adresse";
  return d;
}

/**
 * Ergebnis des Dispatchers auf den Link abbilden.
 *
 *   SENT                                   → erfolgreich
 *   SKIPPED wegen deaktivierter Vorlage,   → WEBHOOK, erfolgreich: Die Portal-
 *   aber ein aktiver Webhook fuer das        Vorlage ist bewusst aus, weil n8n
 *   Event                                    die Mail verschickt. Sonst stuende
 *                                            der Link fuer immer auf "nicht
 *                                            informiert", und jeder Klick feuerte
 *                                            den Webhook erneut (Mehrfachmails).
 *   SKIPPED sonst                          → SKIPPED, sichtbar nicht versendet
 *   FAILED oder kein Ergebnis              → FAILED
 */
export function versandStatusAusErgebnis(
  ergebnis: MailErgebnis | null | undefined,
  webhookAktiv: boolean,
): LinkVersandErgebnis {
  if (!ergebnis) {
    return {
      status: "FAILED",
      erfolgreich: false,
      detail: "Unerwarteter Fehler beim Versand",
      zugestelltAn: null,
    };
  }
  if (ergebnis.status === "SENT") {
    return { status: "SENT", erfolgreich: true, detail: null, zugestelltAn: ergebnis.recipient ?? null };
  }
  if (ergebnis.status === "SKIPPED") {
    if (webhookAktiv && (ergebnis.detail ?? "").trim() === VORLAGE_DEAKTIVIERT_DETAIL) {
      return {
        status: "WEBHOOK",
        erfolgreich: true,
        detail: "Portal-Vorlage deaktiviert – an Webhook übergeben",
        zugestelltAn: null,
      };
    }
    return {
      status: "SKIPPED",
      erfolgreich: false,
      detail: kuerzen(versandDetailLesbar(ergebnis.detail) || "nicht versendet"),
      zugestelltAn: null,
    };
  }
  return {
    status: "FAILED",
    erfolgreich: false,
    detail: kuerzen(versandDetailLesbar(ergebnis.detail) || "Versand fehlgeschlagen"),
    zugestelltAn: null,
  };
}

/**
 * Merker "zuletzt erinnert" setzen? Bei SENT, WEBHOOK und SKIPPED ja (ein
 * zweiter Versuch morgen aendert an einer deaktivierten Vorlage nichts, und
 * der Webhook feuerte sonst taeglich), bei FAILED nein (SMTP-Ausfall ist
 * voruebergehend — morgen erneut versuchen). Wie cron/reminders.
 */
export function erinnerungsMerkerSetzen(status: LinkVersandStatus): boolean {
  return status !== "FAILED";
}

// =============================================
// Versandbericht
// =============================================

/**
 * Aktionen der Karte. `nachtrag` (Ausstattung & Zugaenge, Regel 10) und
 * `absage` (E-A20, nur bei EXPIRED, ohne `departmentKey`) gibt es NUR im
 * Onboarding: Das Offboarding-Schema kennt sie nicht und antwortet mit 400
 * „Unbekannte Aktion.“ (validations/abteilungsaufgaben.ts).
 */
export type AbteilungsAktion = "informieren" | "erneut-senden" | "erinnern" | "link-erneuern" | "nachtrag" | "absage";

export interface BerichtEintrag {
  departmentKey: string;
  /** Anzeigename (Link bzw. Einstellungen bzw. Label). */
  departmentName: string;
  /** Adresse, an die geschrieben wurde bzw. geschrieben worden waere. */
  email: string | null;
  /** Nur in `versendet`. */
  status?: "SENT" | "WEBHOOK";
  /** Nur in `uebersprungen`. */
  grund?: Grund;
  detail?: string | null;
  /** Neuer Token vergeben (Link erneuern oder Adressaenderung). */
  neuerLink?: boolean;
}

export interface VersandBericht {
  aktion: AbteilungsAktion;
  versendet: BerichtEintrag[];
  uebersprungen: BerichtEintrag[];
}

/**
 * HTTP-Status zum Bericht (Hausregel Statuscodes):
 *   201 mindestens eine Mail versendet (oder an Webhook uebergeben)
 *   502 nichts versendet, und ALLE Versandversuche scheiterten am Mailserver
 *   409 sonst (fachlich nichts zu versenden) — der Bericht steht im Body
 */
export function httpStatusAusBericht(bericht: VersandBericht): 201 | 409 | 502 {
  if (bericht.versendet.length > 0) return 201;
  const versuche = bericht.uebersprungen.filter(
    (e) => e.grund === "MAIL_FEHLGESCHLAGEN" || e.grund === "MAIL_NICHT_VERSENDET",
  );
  if (versuche.length > 0 && versuche.every((e) => e.grund === "MAIL_FEHLGESCHLAGEN")) return 502;
  return 409;
}

function namensListe(eintraege: ReadonlyArray<BerichtEintrag>): string {
  return eintraege.map((e) => e.departmentName).join(", ");
}

const AKTIONS_NAMEN: Record<AbteilungsAktion, string> = {
  informieren: "Abteilungen informieren",
  "erneut-senden": "Erneut senden",
  erinnern: "Erinnern",
  "link-erneuern": "Link erneuern",
  nachtrag: "Nachtrag senden",
  absage: "Absage senden",
};

/**
 * Erfolgsmeldung zu einer Aktion, die mindestens eine Mail versendet hat. Ein
 * Zweig je Aktion (`switch` mit `never`): Eine neue Aktion faellt sonst still
 * in den Text einer anderen.
 */
function erfolgsMeldung(aktion: AbteilungsAktion, versendet: ReadonlyArray<BerichtEintrag>): string {
  const e = versendet[0];
  const mitNeuemLink = `E-Mail mit neuem Link an ${e.departmentName} (neue Adresse ${e.email}) gesendet. Der bisherige Link ist ungültig.`;
  switch (aktion) {
    case "informieren": {
      const n = versendet.length;
      return `${n} ${n === 1 ? "Abteilung" : "Abteilungen"} informiert: ${namensListe(versendet)}.`;
    }
    case "link-erneuern":
      return `Neuer Link an ${e.departmentName} gesendet (${e.email}). Der bisherige Link ist ungültig.`;
    case "erneut-senden":
      return e.neuerLink ? mitNeuemLink : `E-Mail an ${e.departmentName} erneut gesendet. Der Link ist unverändert.`;
    case "erinnern":
      return e.neuerLink ? mitNeuemLink : `Erinnerung an ${e.departmentName} gesendet.`;
    case "nachtrag":
      // Adresse seit der Information geaendert: Der Nachtrag ging als Mail mit
      // neuem Link an die neue Adresse (wie „Erneut senden“).
      return e.neuerLink
        ? `Nachtrag mit neuem Link an ${e.departmentName} (neue Adresse ${e.email}) gesendet. Der bisherige Link ist ungültig.`
        : `Nachtrag an ${e.departmentName} gesendet. Der Link ist unverändert.`;
    case "absage": {
      const n = versendet.length;
      return `Absage an ${n} ${n === 1 ? "Stelle" : "Stellen"} gesendet: ${namensListe(versendet)}.`;
    }
    default: {
      const unbekannt: never = aktion;
      return `${String(unbekannt)}: E-Mail gesendet.`;
    }
  }
}

/**
 * Deutsche Meldung zum Bericht: `meldung` (gruen bei Erfolg, rot sonst) und
 * `hinweis` (gelb, optional).
 */
export function berichtMeldung(bericht: VersandBericht): { meldung: string; hinweis: string | null } {
  const { aktion, versendet, uebersprungen } = bericht;
  const probleme = uebersprungen.filter((e) => !e.grund || !GRUENDE_OHNE_PROBLEM.has(e.grund));
  const hinweise: string[] = [];

  if (versendet.some((e) => e.status === "WEBHOOK")) {
    hinweise.push("Die Portal-Vorlage ist deaktiviert; die Nachricht wurde nur an den Webhook übergeben.");
  }

  if (versendet.length > 0) {
    const meldung = erfolgsMeldung(aktion, versendet);
    if (probleme.length > 0) {
      hinweise.unshift(
        `${aktion === "absage" ? "Absage nicht zugestellt" : "Nicht informiert"}: ${probleme
          .map((p) => `${p.departmentName} (${grundText(p.grund ?? "MAIL_NICHT_VERSENDET", p.detail)})`)
          .join(", ")}.`,
      );
    }
    return { meldung, hinweis: hinweise.length > 0 ? hinweise.join(" ") : null };
  }

  // Nichts versendet
  if (aktion === "absage") {
    // Mehrere Stellen in einem Klick (wie „informieren“): keine Stelle war
    // informiert, alle haben die Absage schon, oder die Mails scheiterten.
    if (uebersprungen.length === 0) return { meldung: MELDUNGEN.ABSAGE_NIEMAND_INFORMIERT, hinweis: null };
    if (probleme.length === 0) return { meldung: MELDUNGEN.ABSAGE_BEREITS_GESENDET, hinweis: null };
    return {
      meldung: `Absage nicht gesendet. ${probleme
        .map((p) => `${p.departmentName}: ${grundText(p.grund ?? "MAIL_NICHT_VERSENDET", p.detail)}.`)
        .join(" ")}`,
      hinweis: null,
    };
  }
  if (aktion === "informieren") {
    if (uebersprungen.length === 0) {
      return { meldung: MELDUNGEN.KEINE_ABTEILUNGSAUFGABEN, hinweis: null };
    }
    if (probleme.length === 0) return { meldung: MELDUNGEN.NIEMAND_OFFEN, hinweis: null };
    return {
      meldung: `Es wurde niemand informiert. ${probleme
        .map((p) => `${p.departmentName}: ${grundText(p.grund ?? "MAIL_NICHT_VERSENDET", p.detail)}.`)
        .join(" ")}`,
      hinweis: null,
    };
  }

  const p = uebersprungen[0];
  if (!p) return { meldung: `${AKTIONS_NAMEN[aktion]} nicht möglich.`, hinweis: null };
  if (p.neuerLink && (p.grund === "MAIL_FEHLGESCHLAGEN" || p.grund === "MAIL_NICHT_VERSENDET")) {
    return {
      meldung: `Der bisherige Link von ${p.departmentName} ist ungültig, die E-Mail mit dem neuen Link wurde aber nicht zugestellt (${grundText(p.grund, p.detail)}). Bitte „Erneut senden“ wählen.`,
      hinweis: null,
    };
  }
  return {
    meldung: `${AKTIONS_NAMEN[aktion]} nicht möglich. ${p.departmentName}: ${grundText(
      p.grund ?? "MAIL_NICHT_VERSENDET",
      p.detail,
    )}.`,
    hinweis: null,
  };
}

// =============================================
// Anzeige einer Zeile auf der HR-Karte
// =============================================

export type AnzeigeStatus =
  | "ERLEDIGT"
  | "GEOEFFNET"
  | "INFORMIERT"
  | "ABGELAUFEN"
  | "FEHLGESCHLAGEN"
  | "NICHT_VERSENDET"
  | "NICHT_INFORMIERT"
  | "UEBERSPRUNGEN"
  | "KEINE_OFFENEN";

export type AnzeigeFarbe = "gruen" | "blau" | "gelb" | "rot" | "grau";

export interface Anzeige {
  status: AnzeigeStatus;
  /** Text der Pill, z. B. "Geöffnet (3×), zuletzt 14.07.2027". */
  text: string;
  farbe: AnzeigeFarbe;
  /** Zweite Zeile, z. B. "Link gültig bis 30.10.2027 · 1 Erinnerung, zuletzt 25.07.2027". */
  zusatz: string | null;
  /** Gelber/roter Hinweis unter der Zeile (Grund, Adressaenderung, letzter Fehlversuch). */
  hinweis: string | null;
  /**
   * Farbe des Hinweises, wenn sie nicht am Status haengt — gesetzt vom
   * Waechter (Regel 15, nur Onboarding): "rot". Fehlt sie, faerbt die Karte wie
   * bisher nach dem Status (rot bei FEHLGESCHLAGEN, NICHT_VERSENDET,
   * ABGELAUFEN, sonst gelb).
   */
  hinweisTon?: "rot" | "gelb";
}

export interface LinkAnzeigeStand {
  sentAt: Date | string | null;
  lastSentAt?: Date | string | null;
  firstOpenedAt: Date | string | null;
  lastOpenedAt: Date | string | null;
  openCount: number;
  allTasksComplete: boolean;
  completedAt: Date | string | null;
  expiresAt: Date | string;
  lastReminderAt: Date | string | null;
  reminderCount: number;
  lastSendStatus?: string | null;
  lastSendDetail?: string | null;
}

function datum(wert: Date | string | null | undefined): string {
  const d = alsDatum(wert);
  return d ? formatDatumDE(d) : "";
}

/** Zweite Zeile: Gueltigkeit und Erinnerungen. */
export function linkZusatz(link: LinkAnzeigeStand): string {
  let text = `Link gültig bis ${datum(link.expiresAt)}`;
  if (link.reminderCount > 0) {
    const n = link.reminderCount;
    text += ` · ${n} ${n === 1 ? "Erinnerung" : "Erinnerungen"}`;
    const zuletzt = datum(link.lastReminderAt);
    if (zuletzt) text += `, zuletzt ${zuletzt}`;
  }
  return text;
}

/**
 * Pill, Zusatzzeile und Hinweis einer Zeile.
 *
 * Mit Link (Vorrang von oben): erledigt → nie erfolgreich informiert
 * (fehlgeschlagen / nicht versendet / noch nicht) → abgelaufen → geoeffnet →
 * informiert. Ohne Link: uebersprungen (Grund), keine offenen Aufgaben oder
 * noch nicht informiert.
 */
export function linkAnzeige(
  link: LinkAnzeigeStand | null,
  jetzt: Date,
  ohneLink?: { grund?: Grund | null; offeneAufgaben?: number },
): Anzeige {
  if (!link) {
    if (ohneLink?.grund && !GRUENDE_OHNE_PROBLEM.has(ohneLink.grund)) {
      return { status: "UEBERSPRUNGEN", text: grundText(ohneLink.grund), farbe: "gelb", zusatz: null, hinweis: null };
    }
    if ((ohneLink?.offeneAufgaben ?? 1) === 0) {
      return { status: "KEINE_OFFENEN", text: "Keine offenen Aufgaben", farbe: "grau", zusatz: null, hinweis: null };
    }
    return { status: "NICHT_INFORMIERT", text: "Noch nicht informiert", farbe: "grau", zusatz: null, hinweis: null };
  }

  const zusatz = linkZusatz(link);
  const letzterFehlversuch =
    link.lastSendStatus === "FAILED" || link.lastSendStatus === "SKIPPED"
      ? `Letzte E-Mail nicht zugestellt: ${link.lastSendDetail || "unbekannter Grund"}`
      : link.lastSendStatus === "WEBHOOK"
        ? "An Webhook übergeben (Portal-Vorlage deaktiviert)"
        : null;

  if (link.allTasksComplete) {
    const am = datum(link.completedAt);
    return { status: "ERLEDIGT", text: am ? `Erledigt am ${am}` : "Erledigt", farbe: "gruen", zusatz, hinweis: null };
  }
  if (!alsDatum(link.sentAt)) {
    if (link.lastSendStatus === "FAILED") {
      return {
        status: "FEHLGESCHLAGEN",
        text: "Versand fehlgeschlagen",
        farbe: "rot",
        zusatz,
        hinweis: link.lastSendDetail || null,
      };
    }
    if (link.lastSendStatus === "SKIPPED") {
      return {
        status: "NICHT_VERSENDET",
        text: `Nicht versendet: ${link.lastSendDetail || "unbekannter Grund"}`,
        farbe: "rot",
        zusatz,
        hinweis: null,
      };
    }
    return { status: "NICHT_INFORMIERT", text: "Noch nicht informiert", farbe: "grau", zusatz, hinweis: null };
  }
  const ablauf = alsDatum(link.expiresAt);
  if (ablauf && ablauf.getTime() < jetzt.getTime()) {
    return {
      status: "ABGELAUFEN",
      text: "Link abgelaufen",
      farbe: "rot",
      zusatz,
      hinweis: "Mit „Link erneuern…“ einen neuen Link senden.",
    };
  }
  if (alsDatum(link.firstOpenedAt)) {
    const zuletzt = datum(link.lastOpenedAt);
    return {
      status: "GEOEFFNET",
      text: `Geöffnet (${link.openCount}×)${zuletzt ? `, zuletzt ${zuletzt}` : ""}`,
      farbe: "blau",
      zusatz,
      hinweis: letzterFehlversuch,
    };
  }
  return {
    status: "INFORMIERT",
    text: `Informiert am ${datum(link.sentAt)}`,
    farbe: "gelb",
    zusatz,
    hinweis: letzterFehlversuch,
  };
}

// =============================================
// Zeilen der HR-Karte (Vorschau + Stand)
// =============================================

export interface AufgabeFuerZeile {
  assigneeDepartment: string | null;
  isCompleted: boolean;
  dueDate: Date | string | null;
  /** Fuer die Vorschau des Dialogs (Paket 5); ohne id/title keine Vorschau-Zeile. */
  id?: string;
  title?: string;
  description?: string | null;
  /**
   * Ausstattung & Zugaenge (nur Onboarding, alle optional — das Offboarding
   * setzt sie nie): Herkunft der Aufgabe (`ChecklistItem.herkunft`,
   * "AUSSTATTUNG" | "HINWEIS", null = Vorlage), ob ihre Position eine
   * Bemerkung traegt (nur das Kennzeichen, nie der Text — die Uebersicht geht
   * an alle PORTAL_ROLES, Feinplan 1.11) und ob sie entfaellt (F2: zaehlt
   * nicht in `aufgaben.gesamt`).
   */
  herkunft?: string | null;
  mitBemerkung?: boolean;
  entfaellt?: boolean;
}

/**
 * Was „Abteilungen informieren" dieser Zeile schicken wuerde — fuer den Dialog
 * vor dem Versand (beide Module). Nur bei `informierbar`, sonst null.
 */
export interface ZeilenVorschau {
  /** Offene Aufgaben in Mail-Reihenfolge (frueheste Faelligkeit zuerst). */
  aufgaben: { id: string; title: string; dueDate: string | null; description: string | null }[];
  /** Gueltigkeit, die ein neuer Link jetzt bekaeme (ISO). */
  gueltigBis: string;
  /**
   * Ausstattung & Zugaenge (Mockup 6.4): so viele der offenen Aufgaben stammen
   * aus „Ausstattung & Zugänge“ (Herkunft gesetzt), davon so viele mit
   * Bemerkung. Beide Schluessel fehlen ganz, solange keine dabei ist (immer
   * im Offboarding).
   */
  ausstattung?: number;
  mitBemerkung?: number;
}

export interface LinkFuerZeile extends LinkAnzeigeStand {
  id: string;
  departmentKey: string;
  departmentName: string;
  email: string;
  token: string;
  zugestelltAn?: string | null;
}

export interface ZeilenAktionen {
  erinnern: boolean;
  erneutSenden: boolean;
  linkKopieren: boolean;
  linkErneuern: boolean;
  /**
   * "Erinnern" waere moeglich, ist aber gerade gesperrt (Sperrzeit, siehe
   * `sperreBis`). Die Karte zeigt den Knopf dann grau statt gar nicht.
   */
  erinnernGesperrt: boolean;
  /** Wie `erinnernGesperrt`, fuer "Erneut senden". */
  erneutSendenGesperrt: boolean;
  /**
   * „Nachtrag senden“ (nur Onboarding, Regel 10): Link mit `sentAt`,
   * aufgeloester Empfaenger, Aenderungsliste nicht leer, Vorgang weder
   * gesperrt noch abgeschlossen, Sperrzeit vorbei. Offene Aufgaben sind NICHT
   * noetig — auch „nur Entfällt“ geht hinaus. Fehlt im Offboarding ganz.
   */
  nachtrag?: boolean;
  /** Wie `erneutSendenGesperrt`, fuer „Nachtrag senden“ (Sperrzeit laeuft). */
  nachtragGesperrt?: boolean;
}

export interface AbteilungsZeile {
  departmentKey: string;
  /** Anzeigename: Link, sonst aufgeloester Empfaenger, sonst Label. */
  departmentName: string;
  label: string;
  istFuehrungskraft: boolean;
  /** Name der Fuehrungskraft (nur bei VORGESETZTER). */
  fuehrungskraftName: string | null;
  /** Adresse am Link, sonst die aktuell aufgeloeste (oder null). */
  email: string | null;
  aufgaben: { gesamt: number; offen: number; naechsteFaelligkeit: string | null };
  /** Aktuelle Aufloesung des Empfaengers. */
  empfaenger: { ok: boolean; email: string | null; grund: Grund | null; grundText: string | null };
  /** Wuerde "Abteilungen informieren" diese Zeile jetzt anschreiben? */
  informierbar: boolean;
  link: null | {
    id: string;
    url: string;
    expiresAt: string;
    sentAt: string | null;
    lastSentAt: string | null;
    firstOpenedAt: string | null;
    lastOpenedAt: string | null;
    openCount: number;
    lastReminderAt: string | null;
    reminderCount: number;
    allTasksComplete: boolean;
    completedAt: string | null;
    lastSendStatus: string | null;
    lastSendDetail: string | null;
    zugestelltAn: string | null;
  };
  anzeige: Anzeige;
  aktionen: ZeilenAktionen;
  /** ISO, solange Erinnern/Erneut senden gesperrt sind. */
  sperreBis: string | null;
  /** Paket 5: Inhalt der Mail fuer den Dialog „Abteilungen informieren" (nur bei informierbar). */
  vorschau: ZeilenVorschau | null;
  /**
   * Ausstattung & Zugaenge (Regel 10, nur Onboarding): Was sich nach der
   * Information geaendert hat und noch nicht gesendet ist — Anzahl der
   * (zusammengefassten) Eintraege und die Zeile der Karte („Nach der
   * Information geändert: …“). `null` ohne offene Eintraege oder bei
   * abgeschlossenem Vorgang; fehlt im Offboarding ganz.
   */
  nachtrag?: { anzahl: number; text: string } | null;
}

// =============================================
// Nachtrag und Waechter (Ausstattung & Zugaenge, Regeln 10 und 15)
// =============================================

/**
 * Die zusammengefasste Aenderungsliste EINER Stelle (Regel 10) — Titel je Art,
 * in der Reihenfolge ihres ersten Eintrags. Gebaut wird sie in ausstattung.ts
 * (`nachtragListe`); der Typ steht hier, weil `abteilungsZeilenBauen` ihn
 * liest und diese Datei von ausstattung.ts nichts importiert.
 */
export interface NachtragListe {
  neu: readonly string[];
  geaendert: readonly string[];
  entfaellt: readonly string[];
}

/** Zahl der Eintraege einer zusammengefassten Liste (0 = nichts zu senden). */
export function nachtragAnzahl(liste: NachtragListe | null | undefined): number {
  if (!liste) return 0;
  return liste.neu.length + liste.geaendert.length + liste.entfaellt.length;
}

/**
 * Die Zeile der Karte zu einem offenen Nachtrag (Mockup 6.3):
 *
 *   „Nach der Information geändert: „Dienst-Laptop / PC bereitstellen“
 *   hinzugefügt, „Schlüssel ausgeben: Sporthalle“ entfällt. Die Stelle
 *   erfährt davon erst mit „Nachtrag senden“.“
 *
 * Hoechstens NACHTRAG_TITEL_MAX Titel, der Rest als „und N weitere“. Der
 * zweite Satz haengt an `perKnopf`: Kann HR gerade keinen Nachtrag senden
 * (etwa nach einem gescheiterten „Link erneuern“), nimmt die naechste
 * Zuweisungsmail die Eintraege mit (F7).
 */
export function nachtragZeilenText(liste: NachtragListe, perKnopf: boolean): string {
  const teile = [
    ...liste.neu.map((t) => `„${t}“ hinzugefügt`),
    ...liste.geaendert.map((t) => `„${t}“ geändert`),
    ...liste.entfaellt.map((t) => `„${t}“ entfällt`),
  ];
  const gezeigt = teile.slice(0, NACHTRAG_TITEL_MAX);
  const rest = teile.length - gezeigt.length;
  const aufzaehlung = rest > 0 ? `${gezeigt.join(", ")} und ${rest} weitere` : gezeigt.join(", ");
  const folge = perKnopf
    ? "Die Stelle erfährt davon erst mit „Nachtrag senden“."
    : "Die Stelle erfährt davon erst mit der nächsten Aufgaben-E-Mail („Erneut senden“).";
  return `Nach der Information geändert: ${aufzaehlung}. ${folge}`;
}

/**
 * Regel 15: der Waechter einer Zeile (nur Onboarding). Text, wenn ALLES
 * zutrifft, sonst `null`:
 *
 *   - Modalitaeten eingereicht (`gesperrt` falsch) und Vorgang nicht
 *     abgeschlossen,
 *   - Stelle nicht informiert (kein Link oder kein `sentAt`) ODER ein
 *     Nachtrag offen,
 *   - die frueheste Faelligkeit der OFFENEN Aufgaben liegt weniger als
 *     WAECHTER_TAGE Berliner Kalendertage entfernt (oder schon zurueck).
 *
 *   „Früheste Fälligkeit 24.01.2027 – Stelle noch nicht informiert“
 *   „Früheste Fälligkeit 24.01.2027 – Nachtrag noch nicht gesendet“
 *
 * Aufgaben ohne Faelligkeit zaehlen nicht (keine kuenstliche Frist).
 * Gerechnet in Kalendertagen: Heute 18.01. und faellig 25.01. ist genau eine
 * Woche — noch nicht rot; faellig 24.01. schon.
 */
export function waechterHinweis(opts: {
  link: { sentAt?: Date | string | null } | null;
  offene: ReadonlyArray<{ dueDate: Date | string | null }>;
  nachtragOffen: boolean;
  gesperrt: boolean;
  abgeschlossen: boolean;
  jetzt: Date;
}): string | null {
  if (opts.gesperrt || opts.abgeschlossen) return null;
  const informiert = !!alsDatum(opts.link?.sentAt);
  if (informiert && !opts.nachtragOffen) return null;
  const frueheste = opts.offene
    .map((a) => alsDatum(a.dueDate))
    .filter((d): d is Date => !!d)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const grenze = faelligkeitAus(opts.jetzt, WAECHTER_TAGE);
  if (!frueheste || !grenze || frueheste.getTime() >= grenze.getTime()) return null;
  return `Früheste Fälligkeit ${formatDatumDE(frueheste)} – ${
    informiert ? "Nachtrag noch nicht gesendet" : "Stelle noch nicht informiert"
  }`;
}

/**
 * Ausstattung & Zugaenge, Stufe 2 (A4, G14, nur Offboarding): Hinweis einer
 * Zeile, wenn nach der Information neue Aufgaben dazugekommen sind
 * (Ruecknahme- und Sperraufgaben aus „Einstellung zuordnen …“). Einen Nachtrag
 * gibt es im Offboarding nicht; „Erneut senden“ schickt die Liste mit
 * demselben Link (ausser bei neuer Adresse).
 */
export function nachInfoNeuText(anzahl: number): string {
  return `${anzahl === 1 ? "1 Aufgabe" : `${anzahl} Aufgaben`} nach der Information hinzugekommen – bitte „Erneut senden“`;
}

/** Eigenschaft ohne Prototyp-Kette (ein Schluessel wie „constructor“ traefe sonst Object.prototype). */
function eigenerEintrag<T>(tabelle: Readonly<Record<string, T>> | undefined, key: string): T | undefined {
  return tabelle && Object.prototype.hasOwnProperty.call(tabelle, key) ? tabelle[key] : undefined;
}

function iso(wert: Date | string | null | undefined): string | null {
  const d = alsDatum(wert);
  return d ? d.toISOString() : null;
}

/**
 * Zaehler der Vorschau (Mockup 6.4): offene Aufgaben aus „Ausstattung &
 * Zugänge“ (Herkunft gesetzt, auch die Hinweis-Aufgabe) und davon die mit
 * Bemerkung. Ohne solche Aufgabe ein leeres Objekt — die Schluessel fehlen
 * dann ganz (Offboarding, Vorgaenge ohne Ausstattung).
 */
function ausstattungZaehler(
  offene: ReadonlyArray<AufgabeFuerZeile>,
): Pick<ZeilenVorschau, "ausstattung" | "mitBemerkung"> {
  const aus = offene.filter((a) => a.herkunft != null && a.herkunft !== "");
  if (aus.length === 0) return {};
  return { ausstattung: aus.length, mitBemerkung: aus.filter((a) => a.mitBemerkung === true).length };
}

/**
 * Baut die Zeilen der Karte "Aufgaben für Abteilungen" — eine je Link-
 * Zustaendigkeit, die Aufgaben oder einen Link hat, auch fuer noch nicht
 * informierte und uebersprungene Abteilungen.
 *
 * `linkUrl` baut die kopierbare Adresse (Server: getBaseUrl/APP_URL), damit
 * "Link kopieren" dieselbe Adresse liefert wie die Mail.
 *
 * Paket 5:
 *   - `gesperrt` (Onboarding ohne eingereichte Modalitaeten): Die Zeilen zeigen
 *     Empfaenger und Aufgaben als Vorschau, aber nichts ist informierbar und
 *     keine Aktion ausser „Link kopieren" wird angeboten.
 *   - `vorschau` je informierbarer Zeile: die Aufgabenliste der Mail und die
 *     Gueltigkeit des Links — fuer den Dialog vor dem Versand.
 *   - `unbekannteZustaendigkeiten`: Freitexte an offenen Aufgaben, die keine
 *     Abteilung sind (istLinkAbteilung) und auch nicht HR/MITARBEITER — sie
 *     gehen nie per Link hinaus; die Karte nennt sie, statt sie zu verschweigen.
 *
 * Ausstattung & Zugaenge (Paket A3, nur Onboarding — beide Optionen fehlen im
 * Offboarding, dann bleibt jede Zeile Byte fuer Byte wie bisher):
 *   - `nachtraege` (Regel 10): je Stelle die zusammengefasste
 *     Aenderungsliste. Daraus `zeile.nachtrag` und die Aktionen `nachtrag`/
 *     `nachtragGesperrt` — gesetzt fuer JEDE Zeile, sobald die Option da ist.
 *   - `waechter` (Regel 15): `waechterHinweis` je Zeile; trifft er zu, steht
 *     sein Text vorn im Hinweis der Zeile und `anzeige.hinweisTon` ist "rot".
 *
 * Ausstattung & Zugaenge, Stufe 2 (Paket A4, G14, nur Offboarding — fehlt die
 * Option, bleibt jede Zeile Byte fuer Byte wie bisher):
 *   - `nachInfoNeu`: je Stelle die Zahl der offenen Aufgaben, die nach der
 *     Information dazukamen (`createdAt > lastSentAt ?? sentAt`, rechnet der
 *     Dienst). Ab 1, mit zugestelltem Link und bei laufendem Vorgang, steht
 *     `nachInfoNeuText` im Hinweis der Zeile — gelb, wenn es keinen anderen
 *     Hinweis gibt, sonst hinter ihm und in dessen Farbe.
 */
export function abteilungsZeilenBauen(opts: {
  aufgaben: ReadonlyArray<AufgabeFuerZeile>;
  links: ReadonlyArray<LinkFuerZeile>;
  konfigs: ReadonlyArray<AbteilungsKonfig>;
  organizationId: string;
  fuehrungskraft: FuehrungskraftDaten | null;
  vorgangAbgeschlossen: boolean;
  /** Versand grundsaetzlich gesperrt (Onboarding: Modalitaeten fehlen). */
  gesperrt?: boolean;
  linkUrl: (token: string) => string;
  jetzt: Date;
  /** Regel 15 (Onboarding): Waechter je Zeile. */
  waechter?: boolean;
  /** Regel 10 (Onboarding): offene, zusammengefasste Aenderungsliste je Stelle. */
  nachtraege?: Readonly<Record<string, NachtragListe>>;
  /** A4 (Offboarding): offene Aufgaben je Stelle, die nach der Information dazukamen. */
  nachInfoNeu?: Readonly<Record<string, number>>;
}): {
  zeilen: AbteilungsZeile[];
  informierbar: number;
  niemandInformiert: boolean;
  unbekannteZustaendigkeiten: string[];
} {
  const gesperrt = opts.gesperrt === true;
  const schluessel = abteilungsReihenfolge([
    ...opts.aufgaben.map((a) => a.assigneeDepartment ?? ""),
    ...opts.links.map((l) => l.departmentKey),
  ]);

  const zeilen = schluessel.map((key): AbteilungsZeile => {
    const eigene = opts.aufgaben.filter((a) => a.assigneeDepartment === key);
    // Entfallene (F2) sind erledigt und damit nie offen; in `gesamt` zaehlen
    // sie auch nicht — wie in checklistFortschritt (ausstattung.ts).
    const zaehlend = eigene.filter((a) => a.entfaellt !== true);
    const offene = eigene.filter((a) => !a.isCompleted);
    const naechste = offene
      .map((a) => alsDatum(a.dueDate))
      .filter((d): d is Date => !!d)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const link = opts.links.find((l) => l.departmentKey === key) ?? null;
    const empfaenger = empfaengerAufloesen({
      departmentKey: key,
      organizationId: opts.organizationId,
      konfigs: opts.konfigs,
      fuehrungskraft: opts.fuehrungskraft,
    });
    const entscheidung = versandEntscheidung({ offeneAufgaben: offene.length, link, empfaenger });
    const informierbar = !opts.vorgangAbgeschlossen && !gesperrt && entscheidung.senden;

    let anzeige = linkAnzeige(link, opts.jetzt, {
      grund: entscheidung.senden ? null : entscheidung.grund,
      offeneAufgaben: offene.length,
    });
    // Mit Link: Hinweis, wenn sich die Adresse geaendert hat oder keine mehr aufloesbar ist.
    if (link && !link.allTasksComplete) {
      if (!empfaenger.ok) {
        anzeige = { ...anzeige, hinweis: grundText(empfaenger.grund) };
      } else if (alsDatum(link.sentAt) && !adresseGleich(link.email, empfaenger.email)) {
        anzeige = {
          ...anzeige,
          hinweis: `Adresse geändert (jetzt ${empfaenger.email}). „Erneut senden“ schickt einen neuen Link an die neue Adresse; der bisherige wird ungültig.`,
        };
      }
    }

    const sperre = link ? sperrzeitBis(link, opts.jetzt) : null;
    const offen = offene.length > 0 && !(link?.allTasksComplete ?? false);
    // Eine Aktion wird nur angeboten, wenn der Server sie auch ausfuehrt
    // (einzelPruefung in abteilungsaufgaben-dienst.ts): Link vorhanden, noch
    // etwas offen und ein Empfaenger aufloesbar. Sonst versprache etwa die
    // Rueckfrage "Link erneuern" einen neuen Link, den der Server mit 409
    // ablehnt — und der alte bliebe gueltig. Fehlt der Empfaenger, nennt der
    // Hinweis der Zeile den Grund. "Link erneuern" bei erledigter Abteilung
    // schickte eine Aufforderung zu laengst erledigten Aufgaben.
    const moeglich = !!link && offen && empfaenger.ok;
    const erinnernMoeglich = moeglich && !!alsDatum(link?.sentAt);
    const stillgelegt = opts.vorgangAbgeschlossen || gesperrt;
    const aktionen: ZeilenAktionen = stillgelegt
      ? {
          erinnern: false,
          erneutSenden: false,
          linkKopieren: !!link,
          linkErneuern: false,
          erinnernGesperrt: false,
          erneutSendenGesperrt: false,
        }
      : {
          erinnern: erinnernMoeglich && !sperre,
          erneutSenden: moeglich && !sperre,
          linkKopieren: !!link,
          linkErneuern: moeglich,
          erinnernGesperrt: erinnernMoeglich && !!sperre,
          erneutSendenGesperrt: moeglich && !!sperre,
        };

    // Regel 10 (nur mit `nachtraege`): „Nachtrag senden“ braucht einen
    // zugestellten Link, einen Empfaenger und eine nicht leere Liste — offene
    // Aufgaben NICHT (auch „nur Entfällt“ geht hinaus). Dieselbe Pruefung macht
    // der Server (`nachtragPruefung` im Versandkern).
    const liste = eigenerEintrag(opts.nachtraege, key) ?? null;
    const anzahl = nachtragAnzahl(liste);
    const nachtragMoeglich = anzahl > 0 && !!link && !!alsDatum(link.sentAt) && empfaenger.ok;
    if (opts.nachtraege) {
      aktionen.nachtrag = !stillgelegt && nachtragMoeglich && !sperre;
      aktionen.nachtragGesperrt = !stillgelegt && nachtragMoeglich && !!sperre;
    }

    // Regel 15: Waechter — vorn im Hinweis, die Zeile wird rot.
    if (opts.waechter) {
      const text = waechterHinweis({
        link,
        offene,
        nachtragOffen: anzahl > 0,
        gesperrt,
        abgeschlossen: opts.vorgangAbgeschlossen,
        jetzt: opts.jetzt,
      });
      if (text) {
        anzeige = { ...anzeige, hinweis: anzeige.hinweis ? `${text} · ${anzeige.hinweis}` : text, hinweisTon: "rot" };
      }
    }

    // A4 (Offboarding): nach der Information hinzugekommene Aufgaben — kein
    // Nachtrag, sondern „Erneut senden“ mit demselben Link.
    const neuNachInfo = eigenerEintrag(opts.nachInfoNeu, key) ?? 0;
    if (neuNachInfo > 0 && link && alsDatum(link.sentAt) && !opts.vorgangAbgeschlossen) {
      const text = nachInfoNeuText(neuNachInfo);
      anzeige = anzeige.hinweis
        ? { ...anzeige, hinweis: `${anzeige.hinweis} · ${text}` }
        : { ...anzeige, hinweis: text, hinweisTon: "gelb" };
    }

    return {
      departmentKey: key,
      departmentName: link?.departmentName || empfaenger.departmentName || abteilungLabel(key),
      label: abteilungLabel(key),
      istFuehrungskraft: istFuehrungskraft(key),
      fuehrungskraftName: istFuehrungskraft(key) ? (opts.fuehrungskraft?.name?.trim() || null) : null,
      email: link?.email ?? (empfaenger.ok ? empfaenger.email : null),
      aufgaben: {
        gesamt: zaehlend.length,
        offen: offene.length,
        naechsteFaelligkeit: naechste ? naechste.toISOString() : null,
      },
      empfaenger: empfaenger.ok
        ? { ok: true, email: empfaenger.email, grund: null, grundText: null }
        : { ok: false, email: null, grund: empfaenger.grund, grundText: grundText(empfaenger.grund) },
      informierbar,
      link: link
        ? {
            id: link.id,
            url: opts.linkUrl(link.token),
            expiresAt: iso(link.expiresAt) ?? "",
            sentAt: iso(link.sentAt),
            lastSentAt: iso(link.lastSentAt),
            firstOpenedAt: iso(link.firstOpenedAt),
            lastOpenedAt: iso(link.lastOpenedAt),
            openCount: link.openCount,
            lastReminderAt: iso(link.lastReminderAt),
            reminderCount: link.reminderCount,
            allTasksComplete: link.allTasksComplete,
            completedAt: iso(link.completedAt),
            lastSendStatus: link.lastSendStatus ?? null,
            lastSendDetail: link.lastSendDetail ?? null,
            zugestelltAn: link.zugestelltAn ?? null,
          }
        : null,
      anzeige,
      aktionen,
      sperreBis: sperre ? sperre.toISOString() : null,
      vorschau: informierbar
        ? {
            aufgaben: nachFaelligkeitSortiert(offene)
              .filter((a) => !!a.id)
              .map((a) => ({
                id: a.id as string,
                title: a.title ?? "",
                dueDate: iso(a.dueDate),
                description: a.description?.trim() || null,
              })),
            gueltigBis: gueltigBis(
              opts.jetzt,
              offene.map((a) => a.dueDate),
            ).toISOString(),
            ...ausstattungZaehler(offene),
          }
        : null,
      ...(opts.nachtraege
        ? {
            nachtrag:
              liste && anzahl > 0 && !opts.vorgangAbgeschlossen
                ? { anzahl, text: nachtragZeilenText(liste, nachtragMoeglich) }
                : null,
          }
        : {}),
    };
  });

  const unbekannt = new Set<string>();
  for (const a of opts.aufgaben) {
    const wert = a.assigneeDepartment?.trim();
    if (!a.isCompleted && wert && !istLinkAbteilung(wert) && !istPortalZustaendig(wert)) {
      unbekannt.add(wert);
    }
  }

  return {
    zeilen,
    informierbar: zeilen.filter((z) => z.informierbar).length,
    niemandInformiert: !opts.links.some((l) => !!alsDatum(l.sentAt)),
    unbekannteZustaendigkeiten: [...unbekannt].sort(),
  };
}

// =============================================
// Urheber einer erledigten Aufgabe
// =============================================

export type ErledigtVon = { art: "PORTAL"; name: string } | { art: "LINK"; name: string } | null;

/**
 * Wer hat abgehakt? Aus den vorhandenen Daten abgeleitet (kein eigenes Feld):
 * completedById gesetzt = im Portal (Name aus der Benutzertabelle), sonst bei
 * einer Link-Zustaendigkeit = ueber den Link der Abteilung. Altbestand ohne
 * beides ergibt null (unbekannt).
 */
export function erledigtVonBestimmen(
  aufgabe: { isCompleted: boolean; completedById: string | null; assigneeDepartment: string | null },
  namen: { benutzer: Record<string, string>; abteilungen: Record<string, string> },
): ErledigtVon {
  if (!aufgabe.isCompleted) return null;
  if (aufgabe.completedById) {
    return { art: "PORTAL", name: namen.benutzer[aufgabe.completedById] ?? "unbekannt" };
  }
  if (istLinkAbteilung(aufgabe.assigneeDepartment)) {
    const key = aufgabe.assigneeDepartment as string;
    return { art: "LINK", name: namen.abteilungen[key] ?? abteilungLabel(key) };
  }
  return null;
}

// =============================================
// Einstellungen → Abteilungen: Verwendung und Luecken
// =============================================

/**
 * Antwortform einer Abteilung fuer /api/settings/departments[/id]: der
 * Datensatz, dazu der Anzeigename des Schluessels und das Kennzeichen
 * "reserviert" (Altzeilen HR/MITARBEITER/VORGESETZTER lassen sich nicht mehr
 * anlegen; sie bleiben sichtbar und loeschbar, werden aber nie angeschrieben).
 * Eine Stelle fuer beide Routen-Dateien — eine Route-Datei darf ausser den
 * HTTP-Methoden nichts exportieren.
 */
export function abteilungKonfigDto<T extends { departmentKey: string }>(
  zeile: T,
): T & { label: string; reserviert: boolean } {
  return {
    ...zeile,
    label: abteilungLabel(zeile.departmentKey),
    reserviert: (RESERVIERTE_ABTEILUNGSSCHLUESSEL as readonly string[]).includes(zeile.departmentKey),
  };
}

export interface VorlagenPunkt {
  templateId: string;
  templateName: string;
  defaultAssignee: string | null;
}

/**
 * Schluessel eines Vorlagenpunkts — nur, wenn er die Form eines
 * Abteilungsschluessels hat. Freitext ("Verwaltung", "Vorgesetzter" in den
 * Onboarding-Vorlagen bis Paket 5) ist keiner Abteilung zuzuordnen und wird
 * uebergangen; sonst meldete Einstellungen → Abteilungen z. B. „nutzt
 * „Vorgesetzter“ … keine aktive Adresse" im Widerspruch dazu, dass
 * Vorgesetzten-Aufgaben an die Fuehrungskraft des Vorgangs gehen.
 */
function vorlagenSchluessel(p: VorlagenPunkt): string | null {
  const key = p.defaultAssignee?.trim();
  return key && abteilungsSchluesselGueltig(key) ? key : null;
}

/** "5 Aufgaben in 3 Vorlagen" je Schluessel (nur gueltige Schluessel). */
export function verwendungZaehlen(
  punkte: ReadonlyArray<VorlagenPunkt>,
): Record<string, { aufgaben: number; vorlagen: number }> {
  const ergebnis: Record<string, { aufgaben: number; vorlagen: Set<string> }> = {};
  for (const p of punkte) {
    const key = vorlagenSchluessel(p);
    if (!key) continue;
    const eintrag = ergebnis[key] ?? { aufgaben: 0, vorlagen: new Set<string>() };
    eintrag.aufgaben++;
    eintrag.vorlagen.add(p.templateId);
    ergebnis[key] = eintrag;
  }
  return Object.fromEntries(
    Object.entries(ergebnis).map(([k, v]) => [k, { aufgaben: v.aufgaben, vorlagen: v.vorlagen.size }]),
  );
}

/**
 * Vorlagen, die eine Link-Abteilung nutzen, fuer die es KEINE aktive Adresse
 * gibt (weder zentral noch fuer eine Einrichtung). Die Fuehrungskraft zaehlt
 * nicht — sie kommt aus dem Vorgang.
 */
export function fehlendeAdressen(
  punkte: ReadonlyArray<VorlagenPunkt>,
  konfigs: ReadonlyArray<AbteilungsKonfig>,
): { vorlage: string; departmentKey: string; label: string }[] {
  const gesehen = new Set<string>();
  const ergebnis: { vorlage: string; departmentKey: string; label: string }[] = [];
  for (const p of punkte) {
    const key = vorlagenSchluessel(p);
    if (!key || !istLinkAbteilung(key) || istFuehrungskraft(key)) continue;
    if (konfigs.some((k) => k.departmentKey === key && k.isActive)) continue;
    const merker = `${p.templateId}|${key}`;
    if (gesehen.has(merker)) continue;
    gesehen.add(merker);
    ergebnis.push({ vorlage: p.templateName, departmentKey: key, label: abteilungLabel(key) });
  }
  return ergebnis;
}

// =============================================
// Module (Paket 5): Offboarding und Onboarding
// =============================================

/** Die beiden Module, deren Checklisten Aufgaben per Link verteilen. */
export type AbteilungsModul = "OFFBOARDING" | "ONBOARDING";

export interface ModulTexte {
  /** „Onboarding" / „Offboarding" — Kopf der Link-Seite, „{modulTitel}-Aufgaben: …". */
  modulTitel: string;
  /** Beschriftung der Person auf der Link-Seite. */
  personLabel: string;
  /** Beschriftung des Bezugstags auf der Link-Seite („Vertragsbeginn"). */
  bezugsdatumLabel: string;
  /** Im Satz nach „Fälligkeiten richten sich nach dem …" (Karte). */
  bezugImSatz: string;
  /** Was ALLE Empfaenger sehen (Dialog „Was die Empfänger sehen"). */
  grunddaten: string;
  /** API der Link-Seite: GET `${apiBasis}/${token}`, PATCH `${apiBasis}/${token}/${itemId}`. */
  apiBasis: string;
  /** Pfad der Link-Seite (Mail und „Link kopieren" bauen die volle Adresse auf dem Server). */
  seitenPfad: string;
}

export const MODUL_TEXTE: Record<AbteilungsModul, ModulTexte> = {
  OFFBOARDING: {
    modulTitel: "Offboarding",
    personLabel: "Mitarbeiterin / Mitarbeiter",
    bezugsdatumLabel: "Letzter Arbeitstag",
    bezugImSatz: "letzten Arbeitstag",
    grunddaten: "Name, Einrichtung, Vorgangsnummer und den letzten Arbeitstag sowie ihre eigenen Aufgaben.",
    apiBasis: "/api/offboarding-tasks",
    seitenPfad: "/offboarding-tasks",
  },
  ONBOARDING: {
    modulTitel: "Onboarding",
    personLabel: "Neue Mitarbeiterin / neuer Mitarbeiter",
    bezugsdatumLabel: "Vertragsbeginn",
    bezugImSatz: "Vertragsbeginn",
    grunddaten: "Name, Einrichtung, Vorgangsnummer und Vertragsbeginn sowie ihre eigenen Aufgaben.",
    apiBasis: "/api/onboarding-tasks",
    seitenPfad: "/onboarding-tasks",
  },
};

/**
 * Zusaetzliche Angaben, die eine Stelle im ONBOARDING sieht — in der Mail
 * (Payload-Felder gleichen Namens) und auf der Link-Seite (`zusatz`).
 * Datensparsamkeit (Plan, Tabelle „Wer sieht was"): Der Link ist ein
 * Inhaber-Token ohne Anmeldung, die Mail ein offener Kanal. Jede Stelle bekommt
 * nur, was sie fuer ihre Aufgabe braucht.
 */
export type ZusatzFeld = "stellenbezeichnung" | "betriebsstaette" | "ansprechpartner_email";

export const ZUSATZFELD_LABELS: Record<ZusatzFeld, string> = {
  stellenbezeichnung: "Stellenbezeichnung",
  betriebsstaette: "Betriebsstätte",
  ansprechpartner_email: "Adresse der Führungskraft",
};

/**
 * Je Schluessel die erlaubten Zusatzfelder. Wer hier fehlt (BUCHHALTUNG, eigene
 * Schluessel, HR, MITARBEITER), sieht nur die Grunddaten.
 * NIE — fuer niemanden: private Adresse der Person (OnboardingProcess.email),
 * Anschrift, Geburtsdatum, IBAN, SV-Nummer, Steuer-ID, Kinder, Krankenkasse,
 * Aufenthaltstitel, Masernschutz, Gehalt, Kostenstellen, interne Notizen,
 * Fortschritt anderer Abteilungen.
 */
export const ONBOARDING_ZUSATZFELDER: Readonly<Record<string, readonly ZusatzFeld[]>> = {
  IT: ["stellenbezeichnung", "betriebsstaette", "ansprechpartner_email"],
  VERWALTUNG: ["betriebsstaette", "ansprechpartner_email"],
  FACILITY: ["betriebsstaette", "ansprechpartner_email"],
  DSB: ["stellenbezeichnung"],
  VORGESETZTER: ["stellenbezeichnung", "betriebsstaette"],
};

/** Erlaubte Zusatzfelder eines Schluessels im Onboarding (unbekannt → keine). */
export function zusatzfelderFuer(departmentKey: string | null | undefined): readonly ZusatzFeld[] {
  if (!departmentKey) return [];
  return ONBOARDING_ZUSATZFELDER[departmentKey] ?? [];
}

/**
 * Die Zusatzwerte fuer EINE Stelle: nur erlaubte Felder, nur nicht leere Werte.
 * Nicht erlaubte Felder fehlen ganz (auch nicht als "") — so steht in keinem
 * Payload und keinem Webhook mehr, als die Stelle sehen darf.
 */
export function zusatzWerte(
  departmentKey: string | null | undefined,
  quelle: {
    stellenbezeichnung?: string | null;
    betriebsstaette?: string | null;
    fuehrungskraftEmail?: string | null;
  },
): Partial<Record<ZusatzFeld, string>> {
  const werte: Record<ZusatzFeld, string> = {
    stellenbezeichnung: (quelle.stellenbezeichnung ?? "").trim(),
    betriebsstaette: (quelle.betriebsstaette ?? "").trim(),
    ansprechpartner_email: (quelle.fuehrungskraftEmail ?? "").trim(),
  };
  const ergebnis: Partial<Record<ZusatzFeld, string>> = {};
  for (const feld of zusatzfelderFuer(departmentKey)) {
    if (werte[feld]) ergebnis[feld] = werte[feld];
  }
  return ergebnis;
}

export interface SichtbarkeitsHinweis {
  /** Was alle Empfaenger sehen (ein Satz). */
  alle: string;
  /** Wer zusaetzlich was sieht — nur Stellen mit Zusatzfeldern. */
  zusaetzlich: { departmentKey: string; departmentName: string; felder: string[] }[];
  /**
   * Ausstattung & Zugaenge (Mockup 6.4), nur Onboarding: was die Empfaenger
   * ausserdem zu lesen bekommen — Bemerkungen zu ihren Aufgaben, Angaben und
   * den Hinweis an die eigene Stelle (Regel 7). `null`, wenn nichts davon
   * hinausgeht; im Offboarding fehlt der Schluessel ganz.
   */
  ausstattungSatz?: string | null;
  /** Schlusssatz, im Onboarding „Keine Angaben aus dem Personalfragebogen." */
  hinweis: string | null;
}

/**
 * Was die Uebersicht ueber „Ausstattung & Zugänge“ fuer den Satz im Dialog
 * mitgibt — je Stelle die Labels der Angaben, die sie sieht (eigene und
 * freigegebene, `angabenFuer` in ausstattung.ts), und ob ein Hinweis an sie
 * geht. NIE die Werte oder der Hinweistext: Die Uebersicht geht an alle
 * PORTAL_ROLES (Feinplan 1.11). Nur Stellen mit etwas davon stehen darin.
 */
export interface AusstattungSicht {
  stellen: Record<string, { angaben: string[]; hinweis: boolean }>;
}

/** Ein Empfaenger fuer `sichtbarkeitsHinweis` — eine `AbteilungsZeile` passt. */
export interface SichtbarkeitsEmpfaenger {
  departmentKey: string;
  departmentName: string;
  /** Aus `abteilungsZeilenBauen`: Zahl der Aufgaben mit Bemerkung (Ausstattung). */
  vorschau?: Pick<ZeilenVorschau, "mitBemerkung"> | null;
}

/** „A“, „A und B“, „A, B und C“ (wie namenAufzaehlen in ausstattung.ts — diese Datei importiert von dort nichts). */
function aufzaehlen(teile: ReadonlyArray<string>): string {
  if (teile.length <= 1) return teile[0] ?? "";
  return `${teile.slice(0, -1).join(", ")} und ${teile[teile.length - 1]}`;
}

/**
 * Der Satz zu „Ausstattung & Zugänge“ unter „Was die Empfänger sehen“
 * (Mockup 6.4), nur fuer die Empfaenger DIESES Versands:
 *
 *   „Zu ihren Aufgaben: die Bemerkungen der Führungskraft bzw. der
 *   Personalabteilung. Dazu die Angaben „Unterrichtsfächer“ (IT-Abteilung,
 *   Facility Management) und der Hinweis an die eigene Stelle (IT-Abteilung).“
 *
 * Teile fehlen, wenn es sie nicht gibt; ganz ohne → `null`. Die Stellen in
 * Klammern sind die Empfaenger, die die Angabe bzw. einen Hinweis bekommen —
 * dieselbe Regel (`angabenFuer`), nach der Mail und Link-Seite zuschneiden.
 */
function ausstattungsSatz(
  empfaenger: ReadonlyArray<SichtbarkeitsEmpfaenger>,
  ausstattung: AusstattungSicht | null | undefined,
): string | null {
  const bemerkungen = empfaenger.some((e) => (e.vorschau?.mitBemerkung ?? 0) > 0);
  const stellen = ausstattung?.stellen ?? {};
  const jeAngabe = new Map<string, string[]>();
  const mitHinweis: string[] = [];
  for (const e of empfaenger) {
    const s = stellen[e.departmentKey];
    if (!s) continue;
    for (const label of s.angaben) {
      const namen = jeAngabe.get(label) ?? [];
      if (!namen.includes(e.departmentName)) namen.push(e.departmentName);
      jeAngabe.set(label, namen);
    }
    if (s.hinweis && !mitHinweis.includes(e.departmentName)) mitHinweis.push(e.departmentName);
  }

  const dazu: string[] = [];
  if (jeAngabe.size > 0) {
    dazu.push(
      `die Angaben ${aufzaehlen([...jeAngabe].map(([label, namen]) => `„${label}“ (${namen.join(", ")})`))}`,
    );
  }
  if (mitHinweis.length > 0) dazu.push(`der Hinweis an die eigene Stelle (${mitHinweis.join(", ")})`);

  const saetze = [
    bemerkungen ? "Zu ihren Aufgaben: die Bemerkungen der Führungskraft bzw. der Personalabteilung." : null,
    dazu.length > 0 ? `Dazu ${aufzaehlen(dazu)}.` : null,
  ].filter((s): s is string => !!s);
  return saetze.length > 0 ? saetze.join(" ") : null;
}

/**
 * Text fuer den Dialog „Abteilungen informieren", Abschnitt „Was die
 * Empfänger sehen" — aus derselben Tabelle, nach der Payload und Link-Seite
 * zugeschnitten werden (eine Quelle, kein zweiter Text in der Oberflaeche).
 * `ausstattung` (Onboarding, aus `AbteilungsUebersichtDaten.ausstattungSicht`)
 * ergaenzt den Satz zu „Ausstattung & Zugänge“ (`ausstattungSatz`).
 */
export function sichtbarkeitsHinweis(
  modul: AbteilungsModul,
  empfaenger: ReadonlyArray<SichtbarkeitsEmpfaenger>,
  ausstattung?: AusstattungSicht | null,
): SichtbarkeitsHinweis {
  const texte = MODUL_TEXTE[modul];
  if (modul === "OFFBOARDING") {
    return { alle: texte.grunddaten, zusaetzlich: [], hinweis: null };
  }
  const gesehen = new Set<string>();
  const zusaetzlich: SichtbarkeitsHinweis["zusaetzlich"] = [];
  const eindeutig: SichtbarkeitsEmpfaenger[] = [];
  for (const e of empfaenger) {
    if (gesehen.has(e.departmentKey)) continue;
    gesehen.add(e.departmentKey);
    eindeutig.push(e);
    const felder = zusatzfelderFuer(e.departmentKey).map((f) => ZUSATZFELD_LABELS[f]);
    if (felder.length > 0) zusaetzlich.push({ departmentKey: e.departmentKey, departmentName: e.departmentName, felder });
  }
  return {
    alle: texte.grunddaten,
    zusaetzlich,
    ausstattungSatz: ausstattungsSatz(eindeutig, ausstattung),
    hinweis: "Keine Angaben aus dem Personalfragebogen.",
  };
}

/** Warum der Versand grundsaetzlich gesperrt ist (Onboarding). */
export type SperrGrund = "MODALITAETEN_FEHLEN" | "VERTRAGSBEGINN_FEHLT";

export interface VersandSperre {
  grund: SperrGrund;
  text: string;
}

/**
 * Voraussetzung im Onboarding: Die Einstellungsmodalitaeten sind EINGEREICHT
 * (vorgesetzteAbgesendet: supervisorSubmittedAt, Altfall isComplete) und
 * enthalten einen Vertragsbeginn. Ein nur zwischengespeicherter Vertragsbeginn
 * zaehlt NICHT — er kann sich per Autosave noch aendern. Ohne Modalitaeten
 * (z. B. Ehrenamt ohne Vorgesetzten-Link) bleibt der Versand gesperrt; ein
 * Ersatzdatum gibt es nicht (Entscheidung 22.09.2026). `null` = frei.
 */
export function onboardingVersandSperre(v: {
  status: string;
  supervisorSubmittedAt?: Date | string | null;
  supervisorData?: { isComplete?: boolean | null; vertragsbeginn?: Date | string | null } | null;
}): VersandSperre | null {
  if (!vorgesetzteAbgesendet(v)) {
    return { grund: "MODALITAETEN_FEHLEN", text: MELDUNGEN.MODALITAETEN_FEHLEN };
  }
  if (!alsDatum(v.supervisorData?.vertragsbeginn)) {
    return { grund: "VERTRAGSBEGINN_FEHLT", text: MELDUNGEN.VERTRAGSBEGINN_FEHLT };
  }
  return null;
}

/**
 * Einrichtung, deren Adressen (Einstellungen → Abteilungen) die Aufgaben eines
 * Vorgangs bekommen: der Arbeitsort, sonst die Einrichtung des Vorgangs
 * (`arbeitsortId ?? organizationId`). Gilt fuer ALLE Abteilungsaufgaben des
 * Vorgangs, auch fuer die aus der Checklisten-Vorlage — sonst gaebe es zwei
 * FACILITY-Stellen, aber nur einen Link. Der Mandant (`canAccessProcess`,
 * Listenfilter, Unterlagen, Mailfeld `einrichtung`) bleibt `organizationId`.
 * Ein leerer Arbeitsort ("") zaehlt wie keiner.
 *
 *   - Onboarding (E-A10): Arbeitsort aus dem Anlegen bzw. der Karte.
 *   - Offboarding (seit A4, G12): Arbeitsort, den die Zuordnung einer
 *     Einstellung derselben Einrichtung uebernimmt, solange keine Stelle
 *     informiert ist; ohne Zuordnung `null`, also wie bisher die Einrichtung.
 */
export function empfaengerEinrichtung(v: { arbeitsortId?: string | null; organizationId: string }): string {
  return v.arbeitsortId || v.organizationId;
}

/** Der Name aus A1–A3 – dieselbe Funktion (`empfaengerEinrichtung`), fuer die bestehenden Aufrufer. */
export const onboardingEmpfaengerEinrichtung = empfaengerEinrichtung;

/** Endstatus: keine Aktion, keine Erinnerung, Link nur lesend bzw. 410. */
export const ONBOARDING_ENDSTATUS = ["COMPLETED", "EXPIRED"] as const;

// =============================================
// Absage an die Stellen (Ausstattung & Zugaenge, E-A20, nur Onboarding)
// =============================================

/** Was die Absage von einem Link braucht — eine Zeile der Link-Tabelle passt. */
export interface AbsageLinkStand {
  departmentKey: string;
  departmentName: string;
  sentAt: Date | string | null;
  lastSentAt?: Date | string | null;
  /** F13: Absage an diese Stelle schon gesendet (nur bei SENT gesetzt). */
  abgesagtAm?: Date | string | null;
}

/**
 * Hat diese Stelle je eine Aufgaben-Mail bekommen? `sentAt ?? lastSentAt`: Nach
 * einem gescheiterten „Link erneuern“ steht `sentAt` wieder auf null, die
 * Stelle hat aber eine aeltere Mail samt Aufgaben — auch sie bekommt die Absage.
 */
export function absageInformiert(link: AbsageLinkStand): boolean {
  return alsDatum(link.sentAt ?? link.lastSentAt ?? null) != null;
}

/** Bekommt diese Stelle mit dem naechsten Klick eine Absage? Informiert und noch nicht abgesagt (F13). */
export function absageOffen(link: AbsageLinkStand): boolean {
  return absageInformiert(link) && alsDatum(link.abgesagtAm ?? null) == null;
}

/**
 * F16: Empfaenger der Absage — die Adresse, die die Aufgaben TATSAECHLICH
 * bekommen hat. `link.email` allein taugt dafuer nicht: `zuweisungSenden`
 * schreibt eine neue Adresse schon VOR dem Versand (Erneut senden, Erinnern,
 * Nachtrag nach einem Adresswechsel); scheitert diese Mail, steht dort eine
 * Adresse, die nie etwas bekam. Massgeblich ist deshalb `zugestelltAn` (die
 * Empfaenger der letzten zugestellten Mail, nur bei SENT gesetzt):
 *   - steht `email` darunter, bleibt es bei ihr (weitere An-Adressen der
 *     Zuweisungsvorlage bekommen die Absage nicht ueber `{{email}}`);
 *   - sonst gehen alle zugestellten Adressen (wer die Stelle war, laesst sich
 *     nicht mehr trennen — lieber eine Adresse zu viel als die Stelle nicht);
 *   - ohne `zugestelltAn` (Bestand vor Paket 1b) `email`.
 */
export function absageEmpfaenger(link: { email: string; zugestelltAn?: string | null }): string {
  const zugestellt = (link.zugestelltAn ?? "")
    .split(/[,;]/)
    .map((a) => a.trim())
    .filter((a) => a !== "");
  if (zugestellt.length === 0) return link.email;
  const email = link.email.trim().toLowerCase();
  if (email && zugestellt.some((a) => a.toLowerCase() === email)) return link.email;
  return zugestellt.join(", ");
}

/** Stand der Absage fuer die Karte (`AbteilungsUebersichtDaten.absage`). */
export interface AbsageStand {
  /** Ein Klick auf „Stellen über die Absage informieren…“ schickt noch etwas. */
  moeglich: boolean;
  /** Anzeigenamen (wie am Link gespeichert) der Stellen, die noch keine Absage haben. */
  stellen: string[];
  /** Letzte gesendete Absage (ISO), null, solange keine hinausging. */
  gesendetAm: string | null;
}

/**
 * Stand der Absage — `null`, solange es nichts abzusagen gibt: Der Vorgang ist
 * nicht EXPIRED (die Absage gibt es nur dann, sonst 409 `NICHT_ABGESAGT`) oder
 * keine Stelle wurde je informiert. Die Karte zeigt den Block nur mit Stand,
 * im Offboarding fehlt er ganz. Stellen in der Reihenfolge der Karte
 * (`abteilungsReihenfolge`), Namen wie am Link (dort steht, wer informiert wurde).
 */
export function absageStand(v: {
  status: string;
  links: ReadonlyArray<AbsageLinkStand>;
}): AbsageStand | null {
  if (v.status !== "EXPIRED") return null;
  const informiert = v.links.filter(absageInformiert);
  if (informiert.length === 0) return null;
  const offen = informiert.filter(absageOffen);
  const reihenfolge = abteilungsReihenfolge(offen.map((l) => l.departmentKey));
  const rang = (key: string) => {
    const i = reihenfolge.indexOf(key);
    return i < 0 ? reihenfolge.length : i;
  };
  const gesendet = informiert
    .map((l) => alsDatum(l.abgesagtAm ?? null))
    .filter((d): d is Date => d != null)
    .reduce<Date | null>((spaetestes, d) => spaeteres(spaetestes, d), null);
  return {
    moeglich: offen.length > 0,
    stellen: [...offen].sort((a, b) => rang(a.departmentKey) - rang(b.departmentKey)).map((l) => l.departmentName),
    gesendetAm: gesendet ? gesendet.toISOString() : null,
  };
}

/**
 * Stand der Karte „Aufgaben für Abteilungen" — dieselbe Form in beiden Modulen
 * (`abteilungen` in GET /api/offboarding/[id], GET /api/onboarding/[id] und
 * GET /api/onboarding/[id]/abteilungen).
 */
export interface AbteilungsUebersichtDaten {
  modul: AbteilungsModul;
  zeilen: AbteilungsZeile[];
  /** So viele Zeilen wuerde „Abteilungen informieren" jetzt anschreiben. */
  informierbar: number;
  niemandInformiert: boolean;
  /** Endstatus (Offboarding COMPLETED/CANCELLED, Onboarding COMPLETED/EXPIRED). */
  vorgangAbgeschlossen: boolean;
  /** Offboarding CANCELLED bzw. Onboarding EXPIRED — waehlt den Hinweistext. */
  vorgangAbgebrochen: boolean;
  /** Bezugstag der Faelligkeiten (ISO): letzter Arbeitstag bzw. Vertragsbeginn; null, solange er fehlt. */
  bezugsdatum: string | null;
  /** Onboarding ohne eingereichte Modalitaeten; im Offboarding immer null. */
  gesperrt: VersandSperre | null;
  /** Freitext-Zustaendigkeiten offener Aufgaben, die nie per Link hinausgehen. */
  unbekannteZustaendigkeiten: string[];
  /**
   * Onboarding, Ausstattung & Zugaenge: Angaben-Labels und Hinweis-Kennzeichen
   * je Stelle fuer den Satz im Dialog (`sichtbarkeitsHinweis`). Nur geladen,
   * solange jemand informierbar ist; fehlt im Offboarding.
   */
  ausstattungSicht?: AusstattungSicht | null;
  /**
   * Onboarding, Absage an die Stellen (E-A20, `absageStand`): nur bei EXPIRED
   * und mindestens einer informierten Stelle; fehlt sonst und im Offboarding.
   */
  absage?: AbsageStand;
}

// =============================================
// Protokoll (AuditLog)
// =============================================

export const ABTEILUNGS_AUDIT = {
  INFORMIERT: "DEPARTMENT_LINKS_SENT",
  ERNEUT_GESENDET: "DEPARTMENT_LINK_RESENT",
  ERINNERT_KNOPF: "DEPARTMENT_REMINDER_SENT",
  ERINNERT_CRON: "OFFBOARDING_REMINDER_SENT",
  /** Paket 5: taeglicher Lauf im Onboarding (/api/cron/reminders, Abschnitt 3). */
  ERINNERT_CRON_ONBOARDING: "ONBOARDING_DEPARTMENT_REMINDER_SENT",
  /** Paket 5: Faelligkeiten aus Vertragsbeginn + Tagen einmal gesetzt. */
  FAELLIGKEITEN_GESETZT: "CHECKLIST_DUE_DATES_SET",
  LINK_ERNEUERT: "DEPARTMENT_LINK_RENEWED",
  /** Ausstattung & Zugaenge (Regel 10): „Nachtrag senden“ — Details nur mit Anzahlen, nie Titeln. */
  NACHTRAG_GESENDET: "DEPARTMENT_NACHTRAG_SENT",
  /** Ausstattung & Zugaenge (E-A20): Absage an die informierten Stellen — Details ohne Titel. */
  ABSAGE_GESENDET: "DEPARTMENT_ABSAGE_SENT",
  ERLEDIGT: "ABTEILUNGSAUFGABE_ERLEDIGT",
  WIEDER_GEOEFFNET: "ABTEILUNGSAUFGABE_WIEDER_GEOEFFNET",
  KOMMENTIERT: "ABTEILUNGSAUFGABE_KOMMENTIERT",
  ABTEILUNG_FERTIG: "DEPARTMENT_TASKS_COMPLETED",
  ABTEILUNG_WIEDER_OFFEN: "DEPARTMENT_TASKS_REOPENED",
  PORTAL_GEAENDERT: "CHECKLIST_ITEM_UPDATED",
  KONFIG_ANGELEGT: "DEPARTMENT_CONFIG_CREATED",
  KONFIG_GEAENDERT: "DEPARTMENT_CONFIG_UPDATED",
  KONFIG_GELOESCHT: "DEPARTMENT_CONFIG_DELETED",
} as const;

/** Anzeige im Protokoll (audit-log-content.tsx ergaenzt seine Tabelle damit). */
export const ABTEILUNGS_AUDIT_LABELS: Record<string, string> = {
  DEPARTMENT_LINKS_SENT: "Abteilungen informiert",
  DEPARTMENT_LINK_RESENT: "Abteilungs-Mail erneut gesendet",
  DEPARTMENT_REMINDER_SENT: "Abteilung erinnert",
  OFFBOARDING_REMINDER_SENT: "Abteilung automatisch erinnert",
  ONBOARDING_DEPARTMENT_REMINDER_SENT: "Abteilung automatisch erinnert",
  CHECKLIST_DUE_DATES_SET: "Fälligkeiten der Checkliste gesetzt",
  DEPARTMENT_LINK_RENEWED: "Abteilungs-Link erneuert",
  DEPARTMENT_NACHTRAG_SENT: "Nachtrag an Abteilung gesendet",
  DEPARTMENT_ABSAGE_SENT: "Absage an Abteilungen gesendet",
  ABTEILUNGSAUFGABE_ERLEDIGT: "Aufgabe per Link erledigt",
  ABTEILUNGSAUFGABE_WIEDER_GEOEFFNET: "Aufgabe per Link wieder geöffnet",
  ABTEILUNGSAUFGABE_KOMMENTIERT: "Kommentar der Abteilung",
  DEPARTMENT_TASKS_COMPLETED: "Abteilung fertig",
  DEPARTMENT_TASKS_REOPENED: "Abteilung wieder offen",
  CHECKLIST_ITEM_UPDATED: "Checkliste aktualisiert",
  DEPARTMENT_CONFIG_CREATED: "Abteilung angelegt",
  DEPARTMENT_CONFIG_UPDATED: "Abteilung geändert",
  DEPARTMENT_CONFIG_DELETED: "Abteilung gelöscht",
};
