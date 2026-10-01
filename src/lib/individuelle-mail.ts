/**
 * Individuelle E-Mail aus einem Vorgang (Paket 3) — die reinen Regeln.
 *
 * Client-sicher: keine Importe von Prisma, fs oder dem Mailer. Die Karte, der
 * Dialog, der Server-Dienst (individuelle-mail-dienst.ts) und die Tests lesen
 * dieselben Grenzen, Texte und Pruefungen — zwei Fassungen derselben Regel
 * gingen beim naechsten Aendern auseinander.
 *
 * Was die Funktion ist: Eine freie Nachricht mit eigenem Betreff und eigenen
 * Anhaengen (PDF, JPG, PNG, WebP) an die Person eines Vorgangs — unabhaengig
 * vom Dokumentenpaket. Ein Anschreiben, das „der unterschriebene Vertrag
 * anbei“ sagt, darf das Starterpaket nicht als „versendet“ markieren; deshalb
 * eigener Knopf, eigener Dialog, eigener Server-Weg und eigener Nachweis
 * (Modell IndividuelleMail).
 */

import { formatZeitpunktDE } from "@/lib/format";

/** Ereignis im Katalog (events.ts) und Vorlage (default-email-templates.ts). */
export const INDIVIDUELLE_MAIL_EVENT = "individuelle-mail";

/**
 * Die Module mit Karte und Dialog — dieselben vier wie beim Dokumentenpaket.
 * Elternzeit und Mutterschutz bewusst nicht (Entscheidung 21.09.2026), ebenso
 * keine Mail ohne Vorgang.
 */
export const INDIVIDUELLE_MAIL_MODULE = ["ONBOARDING", "OFFBOARDING", "VERBEAMTUNG", "VERTRAGSVERLAENGERUNG"] as const;
export type IndividuelleMailModul = (typeof INDIVIDUELLE_MAIL_MODULE)[number];

export function istIndividuelleMailModul(wert: unknown): wert is IndividuelleMailModul {
  return typeof wert === "string" && (INDIVIDUELLE_MAIL_MODULE as readonly string[]).includes(wert);
}

// =============================================
// Grenzen
// =============================================

export const MAX_ANHAENGE = 10;

/**
 * Alle Anhaenge zusammen, in Rohbytes.
 *
 * 9 MB und nicht 15 wie beim Dokumentenpaket: Die Dateien kommen hier vom
 * Browser herein, und fuer Portal-Routen klont Next.js den Body in der
 * Middleware und schneidet ihn bei 10 MiB still ab. Die Grenze allgemein
 * anzuheben, traefe auch die oeffentlichen Formulare. Base64 macht aus 9 MB
 * rund 12 MB Nachricht — das nimmt jeder uebliche Posteingang an.
 */
export const MAX_ANHAENGE_BYTES = 9 * 1024 * 1024;

/** Obergrenze der ganzen Anfrage: Anhaenge plus Formularfelder und Trenner. */
export const MAX_ANFRAGE_BYTES = MAX_ANHAENGE_BYTES + 256 * 1024;

export const MAX_BETREFF_ZEICHEN = 200;
export const MAX_NACHRICHT_ZEICHEN = 5000;

/** Endungen fuer die Vorpruefung im Browser. Entscheidend ist die Pruefung der Bytes auf dem Server. */
export const ERLAUBTE_ENDUNGEN = [".pdf", ".jpg", ".jpeg", ".png", ".webp"] as const;

/** Fuer `<input accept>`. */
export const ACCEPT_ATTRIBUT = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";

// =============================================
// Texte
// =============================================

export const MELDUNGEN = {
  typNichtErlaubt: "Dateityp nicht erlaubt, bitte als PDF speichern.",
  pdfUnvollstaendig: "Das PDF ist unvollständig gespeichert. Bitte neu speichern oder erneut scannen.",
  leer: "Die Datei ist leer.",
  zuVieleAnhaenge: `Höchstens ${MAX_ANHAENGE} Anhänge.`,
  zuGross: `Die Anhänge sind zusammen größer als ${MAX_ANHAENGE_BYTES / 1024 / 1024} MB.`,
  betreffFehlt: "Bitte einen Betreff eingeben.",
  nachrichtFehlt: "Bitte eine Nachricht eingeben.",
  betreffZuLang: `Der Betreff darf höchstens ${MAX_BETREFF_ZEICHEN} Zeichen haben.`,
  nachrichtZuLang: `Die Nachricht darf höchstens ${MAX_NACHRICHT_ZEICHEN} Zeichen haben.`,
  adresseUngueltig: "Bitte eine gültige E-Mail-Adresse eingeben.",
  adresseNichtFreigegeben:
    "An diese Adresse darf nicht versendet werden: Sie weicht von der Adresse im Vorgang ab, und ihre Domain ist nicht freigegeben.",
  nichtGefunden: "Der Vorgang wurde nicht gefunden.",
  versandLaeuft: "Diese E-Mail wird gerade versendet. Bitte das Ergebnis abwarten.",
  vorlageAus:
    "Die E-Mail wurde nicht versendet: Die Vorlage „Individuelle E-Mail aus einem Vorgang“ ist ausgeschaltet oder hat keinen Empfänger. Bitte die Administration fragen.",
  versandFehlgeschlagen: "Die E-Mail konnte nicht versendet werden.",
  nachweisFehlt:
    "Die E-Mail wurde versendet, der Nachweis konnte aber nicht gespeichert werden. Bitte NICHT erneut senden und die Administration informieren.",
  schonVersendet: "Diese E-Mail wurde bereits versendet.",
  hinweisUnverschluesselt:
    "Die E-Mail geht unverschlüsselt hinaus. Bankverbindung, Sozialversicherungsnummer oder Gesundheitsdaten nur versenden, wenn es nicht anders geht.",
  hinweisSignatur: "Unter Ihren Text setzt das Portal Ihren Namen und die Einrichtung.",
  hinweisKopie: "Eine Kopie der Anhänge bleibt 12 Monate im Vorgang.",
} as const;

// =============================================
// Protokoll (AuditLog)
// =============================================

/**
 * Codes im AuditLog. `details` tragen nur IDs, Dateinamen, Groessen und
 * Pruefsummen, die Empfaengeradresse und die LAENGE der Nachricht — nie den
 * Text selbst (der ist nach 12 Monaten geloescht, das Protokoll nicht).
 */
export const INDIVIDUELLE_MAIL_AUDIT = {
  VERSENDET: "INDIVIDUELLE_MAIL_SENT",
  NACHWEIS_FEHLGESCHLAGEN: "INDIVIDUELLE_MAIL_NACHWEIS_FEHLGESCHLAGEN",
  ANHANG_GEOEFFNET: "INDIVIDUELLE_MAIL_ANHANG_GEOEFFNET",
} as const;

export const INDIVIDUELLE_MAIL_AUDIT_LABELS: Readonly<Record<string, string>> = {
  [INDIVIDUELLE_MAIL_AUDIT.VERSENDET]: "Individuelle E-Mail versendet",
  [INDIVIDUELLE_MAIL_AUDIT.NACHWEIS_FEHLGESCHLAGEN]: "Individuelle E-Mail versendet, Nachweis fehlgeschlagen",
  [INDIVIDUELLE_MAIL_AUDIT.ANHANG_GEOEFFNET]: "Anhang einer individuellen E-Mail geöffnet",
};

// =============================================
// Fehlerbilder und Statuscodes
// =============================================

export type IndividuelleMailFehler =
  | "MODUL_NICHT_UNTERSTUETZT"
  | "VORGANG_NICHT_GEFUNDEN"
  | "EINGABE_UNGUELTIG"
  | "EMPFAENGER_NICHT_ERLAUBT"
  | "DATEI_UNGUELTIG"
  | "DATEITYP"
  | "ZU_GROSS"
  | "VERSAND_LAEUFT"
  | "VORLAGE_AUS"
  | "VERSAND";

/**
 * 404 fuer unbekannt UND fremden Mandanten (gleicher Text, der Code verraet
 * nichts), 409 fachlich nicht moeglich, 413 zu gross, 415 Dateityp, 502 der
 * Mailserver hat abgelehnt.
 */
export function statusFuerMailFehler(fehler: IndividuelleMailFehler): number {
  switch (fehler) {
    case "VORGANG_NICHT_GEFUNDEN":
      return 404;
    case "MODUL_NICHT_UNTERSTUETZT":
    case "EINGABE_UNGUELTIG":
    case "DATEI_UNGUELTIG":
      return 400;
    case "DATEITYP":
      return 415;
    case "ZU_GROSS":
      return 413;
    case "VERSAND":
      return 502;
    case "EMPFAENGER_NICHT_ERLAUBT":
    case "VERSAND_LAEUFT":
    case "VORLAGE_AUS":
      return 409;
  }
}

// =============================================
// Vorpruefung im Dialog
// =============================================

/** Hat der Name eine der erlaubten Endungen? (nur Vorpruefung, der Server liest die Bytes) */
export function endungErlaubt(dateiname: string): boolean {
  const klein = dateiname.trim().toLowerCase();
  return ERLAUBTE_ENDUNGEN.some((e) => klein.endsWith(e));
}

/** Fehlertext einer gewaehlten Datei im Dialog, sonst null. */
export function dateiVorpruefen(datei: { name: string; size: number }): string | null {
  if (datei.size === 0) return MELDUNGEN.leer;
  if (!endungErlaubt(datei.name)) return MELDUNGEN.typNichtErlaubt;
  return null;
}

/** Warum „E-Mail senden“ gesperrt ist — oder null, wenn alles passt. */
export function sendenGesperrtGrund(stand: {
  empfaenger: string;
  empfaengerErlaubt: boolean;
  betreff: string;
  nachricht: string;
  dateien: { size: number; fehler: string | null }[];
}): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(stand.empfaenger.trim())) return MELDUNGEN.adresseUngueltig;
  if (!stand.empfaengerErlaubt) return MELDUNGEN.adresseNichtFreigegeben;
  if (!stand.betreff.trim()) return MELDUNGEN.betreffFehlt;
  if (stand.betreff.trim().length > MAX_BETREFF_ZEICHEN) return MELDUNGEN.betreffZuLang;
  if (!stand.nachricht.trim()) return MELDUNGEN.nachrichtFehlt;
  if (stand.nachricht.length > MAX_NACHRICHT_ZEICHEN) return MELDUNGEN.nachrichtZuLang;
  if (stand.dateien.length > MAX_ANHAENGE) return MELDUNGEN.zuVieleAnhaenge;
  const kaputt = stand.dateien.find((d) => d.fehler);
  if (kaputt) return kaputt.fehler;
  if (stand.dateien.reduce((s, d) => s + d.size, 0) > MAX_ANHAENGE_BYTES) return MELDUNGEN.zuGross;
  return null;
}

// =============================================
// Antworten (GET-Uebersicht, POST-Ergebnis) — Server und Client
// =============================================

export interface IndividuelleMailAdresse {
  adresse: string;
  /** z.B. „Adresse aus dem Vorgang“, „private Adresse“, „dienstliche Adresse“ */
  bezeichnung: string;
}

export interface IndividuelleMailAnhangZeile {
  id: string;
  dateiname: string;
  groesse: number;
  sha256: string;
  /** Datei noch da (innerhalb der Aufbewahrung)? Dann ist sie zu oeffnen. */
  verfuegbar: boolean;
}

export interface IndividuelleMailVerlaufZeile {
  id: string;
  /** ISO-Zeitpunkt */
  gesendetAm: string;
  empfaenger: string;
  empfaengerAbweichend: boolean;
  betreff: string;
  gesendetVon: string | null;
  anhaenge: IndividuelleMailAnhangZeile[];
  /** Nach 12 Monaten: Text und Dateien geloescht, der Nachweis bleibt. */
  inhaltGeloescht: boolean;
}

/** GET /api/individuelle-mail?modul=&refId= */
export interface IndividuelleMailUebersicht {
  vorgang: {
    name: string;
    displayId: string | null;
    einrichtung: string;
    adressen: IndividuelleMailAdresse[];
  };
  /** Freigabeliste fuer abweichende Adressen (leer = keine Einschraenkung). */
  erlaubteDomains: string[];
  /** Antworten gehen hierhin (SmtpConfig.replyToEmail), leer = kein Reply-To. */
  antwortAn: string;
  verlauf: IndividuelleMailVerlaufZeile[];
}

/** POST /api/individuelle-mail, Erfolg */
export interface IndividuelleMailVersandAntwort {
  mailId: string | null;
  empfaenger: string;
  betreff: string;
  anhaenge: IndividuelleMailAnhangZeile[];
  warnungen: string[];
  /** Die Kennung war schon versendet: nichts erneut geschickt, Ergebnis des ersten Versands. */
  wiederholt: boolean;
}

// =============================================
// Anzeige
// =============================================

export function anhangZahlText(anzahl: number): string {
  if (anzahl === 0) return "ohne Anhang";
  return anzahl === 1 ? "1 Anhang" : `${anzahl} Anhänge`;
}

/** Kurzstand der Karte: „Zuletzt am … an … – „Betreff“ · 2 Anhänge“ bzw. „Noch keine E-Mail“. */
export function kurzstand(verlauf: IndividuelleMailVerlaufZeile[]): string {
  const letzte = verlauf[0];
  if (!letzte) return "Noch keine individuelle E-Mail versendet";
  const mehr = verlauf.length > 1 ? ` (insgesamt ${verlauf.length})` : "";
  return `Zuletzt am ${formatZeitpunktDE(letzte.gesendetAm)} an ${letzte.empfaenger} – „${letzte.betreff}“ · ${anhangZahlText(
    letzte.anhaenge.length,
  )}${mehr}`;
}

export { formatZeitpunktDE as individuelleMailZeitpunkt };

/** Pruefsumme gekuerzt fuer die Anzeige: „a3f9…c21e“. */
export function pruefsummeKurz(sha256: string): string {
  return sha256.length > 8 ? `${sha256.slice(0, 4)}…${sha256.slice(-4)}` : sha256;
}
