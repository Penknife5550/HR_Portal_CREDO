/**
 * Mailtext im Versandprotokoll (10/2026) — rein, ohne Datenbank, client-sicher.
 *
 * Das Protokoll (`EmailLog`) kannte bisher nur Betreff, Adressen und Status.
 * Neu steht dazu der Text, wie er hinausging — aber NIE mit einem persoenlichen
 * Zugangslink: Ein Link in der Mail an die Person oeffnet Fragebogen,
 * Unterlagen-Upload oder die Aufgabenliste einer Abteilung; er laege sonst
 * 90 Tage lesbar fuer jeden mit Zugriff auf das Protokoll in der Datenbank
 * (Regel aus Paket 4: Token nie im Klartext, HR sieht einen Link nie).
 *
 * Regeln:
 *  - **Fail-closed.** Auf der Portal-Adresse bleibt nur, was in
 *    `PORTAL_PFADE_ERLAUBT` steht (Seiten hinter der Anmeldung). Alles andere
 *    ersetzt der Platzhalter — auch eine kuenftig neu gebaute Seite mit Token,
 *    an die heute niemand denkt. Es gibt bewusst keine Liste „verbotener“
 *    Pfade, die beim naechsten neuen Link veraltet.
 *  - **Zweite Sicherung.** Auf jeder Domain ersetzt das Token-Muster (UUID,
 *    lange Zeichenfolge, `token=`) eine Adresse; ist die Portal-Adresse nicht
 *    bekannt (APP_URL fehlt), gilt jede Domain als Portal.
 *  - **Am fertigen HTML, nicht an den Variablen.** Ein Abgleich nach
 *    Variablennamen (`{{link}}`, `{{magicUrl}}` …) verlore beim naechsten
 *    umbenannten Platzhalter still. Das erzeugte HTML wird nach Adressen
 *    durchsucht: im `href` wird die Adresse zu `#`, im Text zum Platzhalter.
 *  - **BEM nie.** Fallnummer und Fristart stehen im Text; die Faelle sind eine
 *    versiegelte Akte. Ereignisse ausserhalb des Katalogs: im Zweifel nicht.
 */

import { getEventDefinition } from "@/lib/events";

/** Steht anstelle jedes ersetzten Links — im HTML-Text und in der Textansicht. */
export const PLATZHALTER_LINK = "[Persönlicher Link – aus Sicherheitsgründen nicht gespeichert]";

/** Obergrenze je Text. Die Standardvorlagen liegen bei etwa 5 KB. */
export const MAX_TEXT_ZEICHEN = 100_000;

/**
 * Pfade auf der Portal-Adresse, die in der Kopie stehen bleiben: Seiten hinter
 * der Anmeldung (`portalLink` der HR-Mails) und das Logo. Ein Pfad gilt ganz
 * oder als Anfang eines Pfades (`/vorgaenge` und `/vorgaenge/onboarding/…`,
 * nicht `/vorgaenge-x`).
 */
export const PORTAL_PFADE_ERLAUBT: readonly string[] = ["/vorgaenge", "/einstellungen", "/login", "/credo_logo.png"];

/** Namen von Abfrageparametern, die einen Zugang tragen. */
const TOKEN_PARAMETER = /^(token|t|key|code|sig|signature|auth|access_token)$/i;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_LANG = /^[0-9a-f]{16,}$/i;
const ZEICHENFOLGE = /^[A-Za-z0-9_-]{20,}$/;

// ---------------------------------------------
// Ob ein Ereignis einen Text bekommt
// ---------------------------------------------

/**
 * Darf der Text dieses Ereignisses gespeichert werden? BEM nie (Praefix UND
 * Gruppe — ein neues BEM-Ereignis ist so von selbst ausgenommen), ein Ereignis
 * ausserhalb des Katalogs im Zweifel nicht.
 */
export function textSpeichernErlaubt(event: string): boolean {
  if (event.startsWith("bem-")) return false;
  const definition = getEventDefinition(event);
  if (!definition) return false;
  return definition.group !== "BEM";
}

// ---------------------------------------------
// Adressen ersetzen
// ---------------------------------------------

/** Host (mit Port) der Portal-Adresse in Kleinbuchstaben; `null`, wenn nicht ermittelbar. */
function portalHostAus(appUrl: string): string | null {
  const roh = appUrl.trim();
  if (!roh) return null;
  try {
    return new URL(roh).host.toLowerCase() || null;
  } catch {
    return null;
  }
}

function pfadErlaubt(pfad: string): boolean {
  if (pfad === "/" || pfad === "") return true;
  return PORTAL_PFADE_ERLAUBT.some((erlaubt) => pfad === erlaubt || pfad.startsWith(`${erlaubt}/`));
}

function tokenartig(pfad: string): boolean {
  return pfad.split("/").some((teil) => {
    let segment = teil;
    try {
      segment = decodeURIComponent(teil);
    } catch {
      // ungueltige Prozent-Kodierung: das rohe Segment pruefen
    }
    if (UUID.test(segment) || HEX_LANG.test(segment)) return true;
    return ZEICHENFOLGE.test(segment) && /\d/.test(segment) && /[A-Za-z]/.test(segment);
  });
}

/**
 * Bleibt diese Adresse in der Kopie stehen?
 *
 * `portalHost === null` heisst: Die Portal-Adresse ist unbekannt — dann gilt
 * jede Domain als Portal, und es bleiben nur die erlaubten Pfade.
 */
function adresseBleibt(roh: string, portalHost: string | null): boolean {
  let url: URL;
  try {
    url = new URL(roh);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.username || url.password) return false;
  for (const name of url.searchParams.keys()) {
    if (TOKEN_PARAMETER.test(name)) return false;
  }
  const imPortal = portalHost === null || url.host.toLowerCase() === portalHost;
  if (imPortal) return pfadErlaubt(url.pathname);
  return !tokenartig(url.pathname);
}

/** Adressen mit Schema im Text und in Attributen. Endet an Leerraum, Anfuehrungszeichen und Klammern der Tags. */
const ADRESSE_MUSTER = /https?:\/\/[^\s"'<>]+/gi;
/** Satzzeichen, die zum Satz gehoeren und nicht zur Adresse. */
const SATZ_ENDE = /[.,;:!?)\]]+$/;
const HREF_MUSTER = /(\bhref\s*=\s*)(["'])(.*?)\2/gi;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Ersetzt alle persoenlichen Adressen in einem fertig erzeugten HTML-Text.
 * Rein; `appUrl` ist die Portal-Adresse (APP_URL), leer = unbekannt.
 */
export function linksErsetzen(html: string, appUrl: string): string {
  const portalHost = portalHostAus(appUrl);

  // 1. href-Attribute: eine ersetzte Adresse wird zu „#“ (der Knopf bleibt,
  //    fuehrt aber nirgends hin), nicht zum Platzhaltertext im Attribut.
  let text = html.replace(HREF_MUSTER, (treffer: string, vor: string, quote: string, wert: string) => {
    const w = wert.trim();
    const mitSchema = w.startsWith("//") ? `https:${w}` : w;
    if (!/^https?:\/\//i.test(mitSchema)) return treffer;
    return adresseBleibt(mitSchema, portalHost) ? treffer : `${vor}${quote}#${quote}`;
  });

  // 2. Adressen mit Schema im Text und in sonstigen Attributen.
  text = text.replace(ADRESSE_MUSTER, (treffer: string) => {
    const ende = SATZ_ENDE.exec(treffer)?.[0] ?? "";
    const adresse = ende ? treffer.slice(0, -ende.length) : treffer;
    return adresseBleibt(adresse, portalHost) ? treffer : `${PLATZHALTER_LINK}${ende}`;
  });

  // 3. Adressen OHNE Schema, die auf das Portal zeigen („hr.fes-credo.de/…“).
  //    Heute baut sie keine Vorlage; ein Admin kann sie in einen Text tippen.
  if (portalHost) {
    const ohneSchema = new RegExp(`(?<![\\w@.-])${escapeRegExp(portalHost)}(?:/[^\\s"'<>]*)`, "gi");
    text = text.replace(ohneSchema, (treffer: string) => {
      const ende = SATZ_ENDE.exec(treffer)?.[0] ?? "";
      const adresse = ende ? treffer.slice(0, -ende.length) : treffer;
      return adresseBleibt(`https://${adresse}`, portalHost) ? treffer : `${PLATZHALTER_LINK}${ende}`;
    });
  }

  return text;
}

export interface MailTextKopie {
  bodyHtml: string;
  /** Der Text wurde bei `MAX_TEXT_ZEICHEN` abgeschnitten. */
  gekuerzt: boolean;
}

/**
 * Die Kopie fuer das Protokoll aus dem HTML, das hinausging: Adressen ersetzen,
 * DANACH kuerzen (sonst bliebe vom Ende einer Adresse ein Rest zurueck).
 */
export function textFuerProtokoll(html: string, appUrl: string): MailTextKopie {
  const ersetzt = linksErsetzen(html, appUrl);
  if (ersetzt.length <= MAX_TEXT_ZEICHEN) return { bodyHtml: ersetzt, gekuerzt: false };
  return { bodyHtml: ersetzt.slice(0, MAX_TEXT_ZEICHEN), gekuerzt: true };
}

// ---------------------------------------------
// Anzeige
// ---------------------------------------------

const ENTITAETEN: Record<string, string> = {
  nbsp: " ",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  amp: "&",
};

function entitaetenAufloesen(text: string): string {
  return text
    .replace(/&#x([0-9a-f]{1,6});/gi, (_t, hex: string) => zeichen(parseInt(hex, 16)))
    .replace(/&#(\d{1,7});/g, (_t, dez: string) => zeichen(parseInt(dez, 10)))
    .replace(/&([a-z]+);/gi, (treffer, name: string) => ENTITAETEN[name.toLowerCase()] ?? treffer);
}

function zeichen(codepunkt: number): string {
  try {
    return String.fromCodePoint(codepunkt);
  } catch {
    return "";
  }
}

/** Die Ansicht „Nur Text“: aus dem gespeicherten HTML abgeleitet, nicht doppelt gespeichert. */
export function textAusHtml(html: string): string {
  const ohneTags = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(head|style|script|title)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    // Absaetze und Bloecke trennt eine Leerzeile, Zeilen einer Tabelle und
    // Listenpunkte ein Zeilenumbruch; mehr als eine Leerzeile wird unten
    // zusammengezogen.
    .replace(/<\/(p|h[1-6]|ul|ol|table|section|blockquote)\s*>/gi, "\n\n")
    .replace(/<\/(div|tr)\s*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<\/li\s*>/gi, "\n")
    .replace(/<\/t[dh]\s*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/<[^>]*$/, "");

  return entitaetenAufloesen(ohneTags)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((zeile) => zeile.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** CSP im Dokument der Ansicht: nichts laden ausser Bildern, nichts ausfuehren. */
const ANSICHT_CSP = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'";

/**
 * Das HTML fuer den Rahmen der Ansicht (`<iframe sandbox="" srcDoc>`): ohne
 * Skripte und eingebettete Inhalte, ohne klickbare Adressen, mit eigener CSP.
 * Tiefenverteidigung — die Sandbox sperrt Skripte ohnehin.
 */
export function htmlFuerAnsicht(html: string): string {
  const bereinigt = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|iframe|object|embed|form)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?(script|iframe|object|embed|form|base|link|meta)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\shref\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  const kopf = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${ANSICHT_CSP}"><base target="_blank">`;
  return /<head\b[^>]*>/i.test(bereinigt)
    ? bereinigt.replace(/<head\b[^>]*>/i, (m) => `${m}${kopf}`)
    : `<!DOCTYPE html><html><head>${kopf}</head><body>${bereinigt}</body></html>`;
}

// ---------------------------------------------
// Meldungen — der Server liefert die fertigen Saetze, die Oberflaeche rechnet nichts
// ---------------------------------------------

export const MAIL_TEXT_MELDUNGEN = {
  nichtErzeugt: "Kein Text: Die Mail wurde nicht erzeugt.",
  bem: "Aus Datenschutzgründen wird der Text von BEM-Mails nicht gespeichert.",
  test: "Test-Versand: Der Text wird nicht gespeichert.",
  nichtGespeichert:
    "Kein Text gespeichert: Die Mail ging vor Einführung der Textspeicherung hinaus, oder der Text konnte nicht gespeichert werden.",
  nichtZugestellt: "Diese Mail wurde nicht zugestellt. Angezeigt ist der Text, der hinausgehen sollte.",
  zugangslinks:
    "Persönliche Links sind in dieser Kopie durch einen Platzhalter ersetzt. Die Mail an die Empfängerin oder den Empfänger enthielt den echten Link. Links in dieser Ansicht sind nicht klickbar.",
  gekuerzt: "Der Text wurde bei 100.000 Zeichen gekürzt.",
  nichtGefunden: "Zu dieser Mail ist kein Text gespeichert.",
  ladefehler: "Der Text konnte nicht geladen werden.",
} as const;

/**
 * Warum es zu einer Protokollzeile keinen Text gibt — `null`, wenn es einen gibt.
 * Reihenfolge: das Ereignis (BEM) und der Test-Versand erklaeren sich selbst,
 * SKIPPED hatte nie einen Text, alles andere ist ein Altfall oder ein
 * Speicherfehler.
 */
export function textHinweis(zeile: { event: string; status: string; isTest?: boolean; hatText: boolean }): string | null {
  if (zeile.hatText) return null;
  if (!textSpeichernErlaubt(zeile.event) && (zeile.event.startsWith("bem-") || getEventDefinition(zeile.event)?.group === "BEM")) {
    return MAIL_TEXT_MELDUNGEN.bem;
  }
  if (zeile.isTest) return MAIL_TEXT_MELDUNGEN.test;
  if (zeile.status === "SKIPPED") return MAIL_TEXT_MELDUNGEN.nichtErzeugt;
  return MAIL_TEXT_MELDUNGEN.nichtGespeichert;
}
