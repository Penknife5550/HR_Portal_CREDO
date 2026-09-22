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
 * testbar (src/__tests__/lib/abteilungsaufgaben.test.ts). Paket 5 (Onboarding)
 * nutzt sie unveraendert — deshalb spricht hier nichts von "Offboarding",
 * "Austritt" oder "letzter Arbeitstag". Der Datenbankteil steht in
 * src/lib/abteilungsaufgaben-dienst.ts und abteilungsaufgaben-uebergaenge.ts.
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
 *     spaetesten offenen Faelligkeit.
 *   - Kommentare der Abteilung gehen in HTML-Mails nur maskiert hinaus.
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
  | "VORGANG_ABGESCHLOSSEN";

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
const GRUENDE_OHNE_PROBLEM: ReadonlySet<Grund> = new Set(["BEREITS_INFORMIERT", "ALLES_ERLEDIGT"]);

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
 */
export function istLinkAbteilung(schluessel: string | null | undefined): boolean {
  return !!schluessel && schluessel.trim() !== "" && !istPortalZustaendig(schluessel);
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
 * Der Knopf "Erinnern" fragt diese Funktion NICHT: Er ist eine ausdrueckliche
 * HR-Aktion und nimmt `stufeBerechnen(...).level ?? "INFO"`.
 */
export function erinnerungsStufe(
  link: LinkErinnerungsStand,
  offene: ReadonlyArray<{ dueDate: Date | string | null }>,
  jetzt: Date,
): ErinnerungsEntscheidung {
  if (!alsDatum(link.sentAt)) return { erinnern: false, warum: "NICHT_INFORMIERT", stufe: null };
  if (link.allTasksComplete || offene.length === 0) {
    return { erinnern: false, warum: "ALLES_ERLEDIGT", stufe: null };
  }
  const stufe = stufeBerechnen(offene, jetzt);
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
}

/**
 * Aufgabenliste fuer die Mail, frueheste Faelligkeit zuerst (ohne Faelligkeit
 * zuletzt, sonst Reihenfolge wie uebergeben).
 *
 *   aufgabenliste       Klartext, eine Zeile je Aufgabe: "- Titel – fällig TT.MM.JJJJ"
 *   aufgabenliste_html  <ul>…</ul>, Titel maskiert (renderTemplate maskiert nichts)
 *   anzahl_aufgaben     Anzahl
 *   naechste_faelligkeit TT.MM.JJJJ der fruehesten Faelligkeit, sonst ""
 */
export function aufgabenlisteMailFelder(aufgaben: ReadonlyArray<AufgabeFuerListe>): {
  aufgabenliste: string;
  aufgabenliste_html: string;
  anzahl_aufgaben: number;
  naechste_faelligkeit: string;
} {
  const sortiert = aufgaben
    .map((a, i) => ({ a, i, d: alsDatum(a.dueDate) }))
    .sort((x, y) => {
      if (x.d && y.d) return x.d.getTime() - y.d.getTime() || x.i - y.i;
      if (x.d) return -1;
      if (y.d) return 1;
      return x.i - y.i;
    });

  const zeilen: string[] = [];
  const punkte: string[] = [];
  for (const { a, d } of sortiert) {
    const titel = a.title.replace(/\s+/g, " ").trim();
    const faellig = d ? ` – fällig ${formatDatumDE(d)}` : "";
    zeilen.push(`- ${titel}${faellig}`);
    punkte.push(`<li style="margin:0 0 4px;">${escapeHtml(titel)}${faellig}</li>`);
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

export type AbteilungsAktion = "informieren" | "erneut-senden" | "erinnern" | "link-erneuern";

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
};

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
    let meldung: string;
    const e = versendet[0];
    if (aktion === "informieren") {
      const n = versendet.length;
      meldung = `${n} ${n === 1 ? "Abteilung" : "Abteilungen"} informiert: ${namensListe(versendet)}.`;
    } else if (aktion === "link-erneuern") {
      meldung = `Neuer Link an ${e.departmentName} gesendet (${e.email}). Der bisherige Link ist ungültig.`;
    } else if (e.neuerLink) {
      meldung = `E-Mail mit neuem Link an ${e.departmentName} (neue Adresse ${e.email}) gesendet. Der bisherige Link ist ungültig.`;
    } else if (aktion === "erinnern") {
      meldung = `Erinnerung an ${e.departmentName} gesendet.`;
    } else {
      meldung = `E-Mail an ${e.departmentName} erneut gesendet. Der Link ist unverändert.`;
    }
    if (probleme.length > 0) {
      hinweise.unshift(
        `Nicht informiert: ${probleme
          .map((p) => `${p.departmentName} (${grundText(p.grund ?? "MAIL_NICHT_VERSENDET", p.detail)})`)
          .join(", ")}.`,
      );
    }
    return { meldung, hinweis: hinweise.length > 0 ? hinweise.join(" ") : null };
  }

  // Nichts versendet
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
}

function iso(wert: Date | string | null | undefined): string | null {
  const d = alsDatum(wert);
  return d ? d.toISOString() : null;
}

/**
 * Baut die Zeilen der Karte "Aufgaben für Abteilungen" — eine je Link-
 * Zustaendigkeit, die Aufgaben oder einen Link hat, auch fuer noch nicht
 * informierte und uebersprungene Abteilungen.
 *
 * `linkUrl` baut die kopierbare Adresse (Server: getBaseUrl/APP_URL), damit
 * "Link kopieren" dieselbe Adresse liefert wie die Mail.
 */
export function abteilungsZeilenBauen(opts: {
  aufgaben: ReadonlyArray<AufgabeFuerZeile>;
  links: ReadonlyArray<LinkFuerZeile>;
  konfigs: ReadonlyArray<AbteilungsKonfig>;
  organizationId: string;
  fuehrungskraft: FuehrungskraftDaten | null;
  vorgangAbgeschlossen: boolean;
  linkUrl: (token: string) => string;
  jetzt: Date;
}): { zeilen: AbteilungsZeile[]; informierbar: number; niemandInformiert: boolean } {
  const schluessel = abteilungsReihenfolge([
    ...opts.aufgaben.map((a) => a.assigneeDepartment ?? ""),
    ...opts.links.map((l) => l.departmentKey),
  ]);

  const zeilen = schluessel.map((key): AbteilungsZeile => {
    const eigene = opts.aufgaben.filter((a) => a.assigneeDepartment === key);
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
    const informierbar = !opts.vorgangAbgeschlossen && entscheidung.senden;

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
    const aktionen: ZeilenAktionen = opts.vorgangAbgeschlossen
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

    return {
      departmentKey: key,
      departmentName: link?.departmentName || empfaenger.departmentName || abteilungLabel(key),
      label: abteilungLabel(key),
      istFuehrungskraft: istFuehrungskraft(key),
      fuehrungskraftName: istFuehrungskraft(key) ? (opts.fuehrungskraft?.name?.trim() || null) : null,
      email: link?.email ?? (empfaenger.ok ? empfaenger.email : null),
      aufgaben: {
        gesamt: eigene.length,
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
    };
  });

  return {
    zeilen,
    informierbar: zeilen.filter((z) => z.informierbar).length,
    niemandInformiert: !opts.links.some((l) => !!alsDatum(l.sentAt)),
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
// Protokoll (AuditLog)
// =============================================

export const ABTEILUNGS_AUDIT = {
  INFORMIERT: "DEPARTMENT_LINKS_SENT",
  ERNEUT_GESENDET: "DEPARTMENT_LINK_RESENT",
  ERINNERT_KNOPF: "DEPARTMENT_REMINDER_SENT",
  ERINNERT_CRON: "OFFBOARDING_REMINDER_SENT",
  LINK_ERNEUERT: "DEPARTMENT_LINK_RENEWED",
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
  DEPARTMENT_LINK_RENEWED: "Abteilungs-Link erneuert",
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
