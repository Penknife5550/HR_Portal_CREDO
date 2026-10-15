/**
 * Mailtext im Versandprotokoll (10/2026) — rein, ohne Datenbank, client-sicher.
 *
 * Das Protokoll (`EmailLog`) kannte bisher nur Betreff, Adressen und Status.
 * Neu steht dazu der Text, wie er hinausging — aber NIE mit einem persoenlichen
 * Zugangslink: Ein Link in der Mail an die Person oeffnet Fragebogen,
 * Unterlagen-Upload oder die Aufgabenliste einer Abteilung; er laege sonst
 * 90 Tage lesbar fuer jeden mit Zugriff auf das Protokoll in der Datenbank.
 * (Die Tokens selbst liegen weiter in den Vorgangszeilen und sind HR dort
 * sichtbar — hier geht es nur darum, sie nicht ein zweites Mal im Protokoll
 * abzulegen. Nur die Links der Unterlagen-Nachforderung liegen sonst als Hash.)
 *
 * Regeln:
 *  - **Fail-closed.** Auf der Portal-Adresse bleibt nur, was in
 *    `PORTAL_PFADE_ERLAUBT` steht (Seiten hinter der Anmeldung). Alles andere
 *    ersetzt der Platzhalter — auch eine kuenftig neu gebaute Seite mit Token,
 *    an die heute niemand denkt. Es gibt bewusst keine Liste „verbotener“
 *    Pfade, die beim naechsten neuen Link veraltet.
 *  - **Zweite Sicherung.** Jede Adresse auf einer FREMDEN Domain ersetzt das
 *    Token-Muster (UUID, lange Hex-/Zeichenfolge in Pfad, Abfrage oder
 *    Fragment, `token=`). Ist die Portal-Adresse nicht lesbar (APP_URL fehlt
 *    oder ist kaputt), gilt jede Domain als Portal — dann bleiben nur die
 *    erlaubten Pfade.
 *  - **Netz fuer Kennungen.** Zuletzt wird jede UUID und jede lange Hex-Folge
 *    AUSSERHALB einer behaltenen Adresse entfernt, egal in welcher Form der
 *    Link verpackt war (Entitaeten, Backslashes, Satzzeichen).
 *  - **Am fertigen HTML, nicht an den Variablen.** Ein Abgleich nach
 *    Variablennamen (`{{link}}`, `{{magicUrl}}` …) verlore beim naechsten
 *    umbenannten Platzhalter still. Das erzeugte HTML wird nach Adressen
 *    durchsucht: im `href` wird die Adresse zu `#`, im Text zum Platzhalter.
 *  - **Die Ansicht ist eine Positivliste** (`htmlFuerAnsicht`): Ein einziger
 *    Durchgang baut das Dokument aus erlaubten Tags und Attributen neu auf;
 *    nichts wird „entfernt“, was ein zweiter Durchgang wieder zusammensetzen
 *    koennte.
 *  - **BEM nie.** Fallnummer und Fristart stehen im Text; die Faelle sind eine
 *    versiegelte Akte. Ereignisse ausserhalb des Katalogs: im Zweifel nicht.
 */

import { getEventDefinition } from "@/lib/events";

/** Steht anstelle jedes ersetzten Links — im HTML-Text und in der Textansicht. */
export const PLATZHALTER_LINK = "[Persönlicher Link – aus Sicherheitsgründen nicht gespeichert]";

/** Steht anstelle einer Kennung (UUID, lange Hex-Folge) ausserhalb eines behaltenen Links. */
export const PLATZHALTER_KENNUNG = "[Kennung entfernt]";

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

/** Kennungen im Fliesstext (Netz): UUID und Hex-Folgen ab 32 Zeichen. */
const UUID_IM_TEXT = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const HEX_IM_TEXT = /\b[0-9a-f]{32,}\b/gi;

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
// Entitaeten
// ---------------------------------------------

const ENTITAETEN: Record<string, string> = {
  nbsp: " ",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  amp: "&",
  colon: ":",
  sol: "/",
  period: ".",
  num: "#",
};

function zeichen(codepunkt: number): string {
  try {
    return String.fromCodePoint(codepunkt);
  } catch {
    return "";
  }
}

function entitaetenAufloesen(text: string): string {
  return text
    .replace(/&#x([0-9a-f]{1,6});?/gi, (_t, hex: string) => zeichen(parseInt(hex, 16)))
    .replace(/&#(\d{1,7});?/g, (_t, dez: string) => zeichen(parseInt(dez, 10)))
    .replace(/&([a-z]+);/gi, (treffer, name: string) => ENTITAETEN[name.toLowerCase()] ?? treffer);
}

// ---------------------------------------------
// Adressen ersetzen
// ---------------------------------------------

/**
 * Host (mit Port) der Portal-Adresse in Kleinbuchstaben; `null`, wenn sie sich
 * nicht sicher ermitteln laesst. Die Eingabe wird nachsichtig gelesen — eine
 * APP_URL ohne Schema, mit Anfuehrungszeichen oder Leerraum ist ein
 * Konfigurationsfehler, der den Schutz nicht aufheben darf.
 */
function portalHostAus(appUrl: string): string | null {
  let roh = appUrl.trim().replace(/^["'`]+|["'`]+$/g, "").trim();
  if (!roh) return null;
  if (roh.startsWith("//")) roh = `https:${roh}`;
  else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(roh)) roh = `https://${roh}`;
  try {
    const host = new URL(roh).host.toLowerCase();
    // Ein Host ohne Punkt ist nur localhost (ggf. mit Port) glaubwuerdig — „https“
    // aus einem Tippfehler wie „https//hr…“ ist es nicht.
    if (!host.includes(".") && !/^localhost(:\d+)?$/.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

function pfadErlaubt(pfad: string): boolean {
  if (pfad === "/" || pfad === "") return true;
  return PORTAL_PFADE_ERLAUBT.some((erlaubt) => pfad === erlaubt || pfad.startsWith(`${erlaubt}/`));
}

function segmentTokenartig(segment: string): boolean {
  if (UUID.test(segment) || HEX_LANG.test(segment)) return true;
  return ZEICHENFOLGE.test(segment) && /\d/.test(segment) && /[A-Za-z]/.test(segment);
}

/** Ein Teil (Pfadsegment oder Abfragewert) — auch die durch . ~ + getrennten Stuecke. */
function teilTokenartig(teil: string): boolean {
  let segment = teil;
  try {
    segment = decodeURIComponent(teil);
  } catch {
    // ungueltige Prozent-Kodierung: das rohe Stueck pruefen
  }
  if (segmentTokenartig(segment)) return true;
  return segment.split(/[.~+]/).some((stueck) => stueck !== segment && segmentTokenartig(stueck));
}

function pfadTokenartig(pfad: string): boolean {
  return pfad.split("/").some((segment) => segment !== "" && teilTokenartig(segment));
}

/** Ein Abfragewert oder Fragment: an allem, was kein Zeichen einer Kennung ist, in Stuecke geteilt. */
function wertTokenartig(wert: string): boolean {
  return wert.split(/[^A-Za-z0-9_.~+%-]+/).some((stueck) => stueck !== "" && teilTokenartig(stueck));
}

/**
 * Bleibt diese Adresse in der Kopie stehen?
 *
 * `portalHost === null` heisst: Die Portal-Adresse ist unbekannt — dann gilt
 * jede Domain als Portal, und es bleiben nur die erlaubten Pfade.
 *
 * Der Text ist HTML-maskiert (`&amp;`): `URLSearchParams` liest „&amp;token=“
 * als Parameter „amp;token“ — der Name wird davor bereinigt.
 */
function adresseBleibt(roh: string, portalHost: string | null): boolean {
  let url: URL;
  try {
    url = new URL(roh.replace(/\\/g, "/"));
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.username || url.password) return false;

  for (const [name, wert] of url.searchParams) {
    if (TOKEN_PARAMETER.test(name.replace(/^amp;/i, "")) || wertTokenartig(wert)) return false;
  }
  if (url.hash) {
    if (/(^#|[?&;])(?:amp;)?(?:access_)?(?:token|key|code|sig|auth)=/i.test(url.hash)) return false;
    if (wertTokenartig(url.hash.slice(1))) return false;
  }

  const pfad = url.pathname.replace(/\/{2,}/g, "/");
  const imPortal = portalHost === null || url.host.toLowerCase() === portalHost;
  if (imPortal) return pfadErlaubt(pfad);
  return !pfadTokenartig(pfad);
}

/** Adressen mit Schema im Text und in Attributen; Schraegstrich oder Backslash. */
const ADRESSE_MUSTER = /https?:[\\/]{2}[^\s"'<>]+/gi;
/** Ab hier gehoert der Rest nicht mehr zur Adresse: Entitaet eines Trennzeichens oder Zeichen ausserhalb von ASCII. */
const ENDE_MUSTER = /&(?:quot|apos|gt|lt|nbsp|#0*(?:34|39|60|62|160)|#x0*(?:22|27|3c|3e|a0));|[^\x21-\x7e]/i;
/** Satzzeichen, die zum Satz gehoeren und nicht zur Adresse. */
const SATZ_ENDE = /[.,;:!?)\]]+$/;
const HREF_MUSTER = /(\bhref\s*=\s*)(["'])(.*?)\2/gi;
/** Adresse ohne Schema, wenn die Portal-Adresse unbekannt ist: Host mit Punkt, dann „/“. */
const OHNE_SCHEMA_ALLGEMEIN = /(?<![\w@.-])(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d{1,5})?\/[^\s"'<>]*/gi;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function kennungenEntfernen(text: string): string {
  return text.replace(UUID_IM_TEXT, PLATZHALTER_KENNUNG).replace(HEX_IM_TEXT, PLATZHALTER_KENNUNG);
}

/**
 * Ersetzt alle persoenlichen Adressen in einem fertig erzeugten HTML-Text.
 * Rein; `appUrl` ist die Portal-Adresse (APP_URL), leer oder kaputt = unbekannt.
 */
export function linksErsetzen(html: string, appUrl: string): string {
  const portalHost = portalHostAus(appUrl);

  // 1. href-Attribute: eine ersetzte Adresse wird zu „#“ (der Knopf bleibt,
  //    fuehrt aber nirgends hin), nicht zum Platzhaltertext im Attribut. Der
  //    Wert wird vor dem Entscheiden von Entitaeten befreit („&#104;ttps://…“).
  let text = html.replace(HREF_MUSTER, (treffer: string, vor: string, quote: string, wert: string) => {
    const w = entitaetenAufloesen(wert).trim();
    if (w === "#" || w === "") return treffer;
    let adresse = w;
    if (w.startsWith("//")) adresse = `https:${w}`;
    else if (w.startsWith("/") || w.startsWith("\\")) adresse = `https://portal.invalid${w.replace(/\\/g, "/")}`;
    if (!/^https?:[\\/]{2}/i.test(adresse)) return treffer;
    const host = adresse.startsWith("https://portal.invalid") ? "portal.invalid" : portalHost;
    return adresseBleibt(adresse, host) ? treffer : `${vor}${quote}#${quote}`;
  });

  // 2. Adressen mit Schema im Text und in sonstigen Attributen.
  text = text.replace(ADRESSE_MUSTER, (treffer: string) => {
    const schnitt = ENDE_MUSTER.exec(treffer);
    const kopf = schnitt ? treffer.slice(0, schnitt.index) : treffer;
    const rest = schnitt ? treffer.slice(schnitt.index) : "";
    const ende = SATZ_ENDE.exec(kopf)?.[0] ?? "";
    const adresse = ende ? kopf.slice(0, -ende.length) : kopf;
    if (adresseBleibt(adresse, portalHost)) return kopf + kennungenEntfernen(rest);
    return PLATZHALTER_LINK + ende + kennungenEntfernen(rest);
  });

  // 3. Adressen OHNE Schema („hr.fes-credo.de/fragebogen/…“). Heute baut sie
  //    keine Vorlage; ein Admin kann sie in einen Text tippen. Mit bekannter
  //    Portal-Adresse sucht der Durchgang genau sie, sonst jede „host.tld/…“.
  const ohneSchema = portalHost
    ? new RegExp(`(?<![\\w@.-])${escapeRegExp(portalHost)}(?:/[^\\s"'<>]*)`, "gi")
    : OHNE_SCHEMA_ALLGEMEIN;
  text = text.replace(ohneSchema, (treffer: string) => {
    const ende = SATZ_ENDE.exec(treffer)?.[0] ?? "";
    const adresse = ende ? treffer.slice(0, -ende.length) : treffer;
    return adresseBleibt(`https://${adresse}`, portalHost) ? treffer : `${PLATZHALTER_LINK}${ende}`;
  });

  // 4. Netz: Kennungen ausserhalb der behaltenen Adressen. Die Adressen selbst
  //    (Teile mit ungerader Nummer) bleiben, wie sie sind — eine Vorgangs-ID im
  //    Pfad von /vorgaenge/onboarding/<uuid> ist keine Kennung eines Zugangs.
  return text
    .split(/(https?:[\\/]{2}[^\s"'<>]+)/gi)
    .map((teil, index) => (index % 2 === 1 ? teil : kennungenEntfernen(teil)))
    .join("");
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

/** Die Ansicht „Nur Text“: aus dem gespeicherten HTML abgeleitet, nicht doppelt gespeichert. */
export function textAusHtml(html: string): string {
  // Adressen behaltener Links hinter den Linktext schreiben — in der Ansicht
  // sind Links nicht klickbar, die Adresse soll trotzdem lesbar sein.
  const mitAdressen = html.replace(
    /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]{0,2000}?)<\/a\s*>/gi,
    (_treffer, doppelt: string | undefined, einfach: string | undefined, inhalt: string) => {
      const adresse = entitaetenAufloesen((doppelt ?? einfach ?? "").trim());
      if (!/^https?:\/\//i.test(adresse)) return inhalt;
      const sichtbar = entitaetenAufloesen(inhalt.replace(/<[^>]*>/g, ""));
      if (sichtbar.includes(adresse) || sichtbar.includes(adresse.replace(/^https?:\/\//i, ""))) return inhalt;
      return `${inhalt} (${adresse})`;
    },
  );

  const ohneTags = mitAdressen
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

/** Tags der Ansicht (Gestaltung, Tabellen, Listen); alles andere faellt weg, sein Inhalt bleibt. */
const ERLAUBTE_TAGS = new Set([
  "a", "abbr", "address", "article", "aside", "b", "blockquote", "br", "caption", "center", "code", "col",
  "colgroup", "dd", "div", "dl", "dt", "em", "figcaption", "figure", "font", "footer", "h1", "h2", "h3", "h4",
  "h5", "h6", "header", "hr", "i", "img", "li", "main", "nav", "ol", "p", "pre", "s", "section", "small", "span",
  "strike", "strong", "sub", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
]);
const OHNE_ENDE = new Set(["br", "hr", "img", "col"]);
/** Tags, deren Inhalt mit entfernt wird (ausfuehrbar, eingebettet oder kein Text). */
const MIT_INHALT_VERWERFEN = new Set([
  "script", "style", "iframe", "object", "embed", "noscript", "template", "svg", "math", "head", "title",
  "textarea", "select", "applet", "frameset", "frame", "noframes", "xmp", "plaintext", "audio", "video",
  "canvas", "map", "button", "form",
]);
const ERLAUBTE_ATTRIBUTE = new Set([
  "style", "align", "valign", "width", "height", "bgcolor", "colspan", "rowspan", "cellpadding", "cellspacing",
  "border", "color", "size", "face", "alt", "title", "lang", "dir", "role",
]);

function attributWert(wert: string): string {
  return wert
    .replace(/&(?![a-zA-Z0-9#]+;)/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function textStueck(text: string): string {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Ein style-Attribut ohne nachladende oder ausfuehrbare Anteile; sonst `null`. */
function styleSauber(wert: string): string | null {
  const w = wert.trim();
  if (!w) return null;
  if (/[<>\\]|url\s*\(|expression\s*\(|@import|javascript:|vbscript:|behavior\s*:|-moz-binding/i.test(w)) return null;
  return w;
}

function attributeLesen(roh: string): Array<[string, string]> {
  const gefunden: Array<[string, string]> = [];
  const muster = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let treffer: RegExpExecArray | null;
  while ((treffer = muster.exec(roh)) !== null) {
    gefunden.push([treffer[1].toLowerCase(), treffer[2] ?? treffer[3] ?? treffer[4] ?? ""]);
  }
  return gefunden;
}

/** Ein Bild bleibt nur als eingebettetes Bild oder als das Logo der Mail. */
function bildErlaubt(wert: string): boolean {
  const w = entitaetenAufloesen(wert).trim();
  if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(w)) return w.length < 150_000;
  try {
    const url = new URL(w);
    return (url.protocol === "https:" || url.protocol === "http:") && url.pathname === "/credo_logo.png";
  } catch {
    return false;
  }
}

/**
 * Das HTML fuer den Rahmen der Ansicht (`<iframe sandbox="" srcDoc>`).
 *
 * Ein einziger Durchgang ueber den Text baut das Dokument NEU auf: Es gibt nur
 * Tags der Positivliste, nur Attribute der Positivliste, und jedes `<` im Text
 * wird maskiert. Was das Eingabe-HTML an Verschachtelung, fehlenden
 * Leerzeichen oder Anfuehrungszeichen versucht, aendert an der Ausgabe nichts:
 * Sie entsteht aus dem, was erkannt wurde, nicht aus dem Rest.
 *
 *  - Skripte, Rahmen, Formulare, eingebettete Inhalte, Kopf und Titel fallen
 *    mit ihrem Inhalt weg; unbekannte Tags fallen weg, ihr Text bleibt.
 *  - `href` gibt es nie; die Adresse eines behaltenen Links steht als Text
 *    hinter dem Linktext.
 *  - Das Dokument bekommt immer eine eigene CSP (`default-src 'none'`).
 *
 * Die Sandbox des Rahmens und die geerbte Portal-CSP bleiben die ersten
 * Schichten; das hier ist die dritte.
 */
export function htmlFuerAnsicht(html: string): string {
  const aus: string[] = [];
  const anker: Array<{ adresse: string | null; start: number }> = [];
  let koerperStil: string | null = null;
  const n = html.length;
  let i = 0;

  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      aus.push(textStueck(html.slice(i)));
      break;
    }
    if (lt > i) aus.push(textStueck(html.slice(i, lt)));

    // Kommentar: bis „-->“; ohne Ende faellt der Rest weg.
    if (html.startsWith("<!--", lt)) {
      const ende = html.indexOf("-->", lt + 4);
      if (ende === -1) break;
      i = ende + 3;
      continue;
    }
    // <!DOCTYPE …>, <![CDATA[ …, <? … >
    const folge = html.charAt(lt + 1);
    if (folge === "!" || folge === "?") {
      const ende = html.indexOf(">", lt);
      if (ende === -1) break;
      i = ende + 1;
      continue;
    }

    const kopf = /^<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)/.exec(html.slice(lt, lt + 80));
    if (!kopf) {
      aus.push("&lt;");
      i = lt + 1;
      continue;
    }

    // Ende des Tags suchen; Anfuehrungszeichen schuetzen ein „>“ im Wert.
    let j = lt + kopf[0].length;
    let zu = -1;
    while (j < n) {
      const c = html.charAt(j);
      if (c === '"' || c === "'") {
        const q = html.indexOf(c, j + 1);
        if (q === -1) {
          j = n;
          break;
        }
        j = q + 1;
        continue;
      }
      if (c === ">") {
        zu = j;
        break;
      }
      if (c === "<") break;
      j++;
    }
    if (zu === -1) {
      if (j >= n) break; // nie geschlossen: der Rest faellt weg
      // „<“ mitten im Tag: der Anfang ist Text, dort beginnt ein neues Tag
      aus.push(textStueck(html.slice(lt, j)));
      i = j;
      continue;
    }

    const schliessend = kopf[1] === "/";
    const name = kopf[2].toLowerCase();
    const attributRoh = html.slice(lt + kopf[0].length, zu);
    i = zu + 1;

    if (!schliessend && MIT_INHALT_VERWERFEN.has(name)) {
      const ende = new RegExp(`</${name}[\\s/>]`, "gi");
      ende.lastIndex = i;
      const treffer = ende.exec(html);
      if (!treffer) break;
      const zu2 = html.indexOf(">", treffer.index);
      if (zu2 === -1) break;
      i = zu2 + 1;
      continue;
    }

    if (name === "body" && !schliessend) {
      const stil = attributeLesen(attributRoh).find(([schluessel]) => schluessel === "style");
      koerperStil = stil ? styleSauber(entitaetenAufloesen(stil[1])) : null;
      continue;
    }

    if (!ERLAUBTE_TAGS.has(name)) continue; // Tag weg, Inhalt bleibt

    if (schliessend) {
      if (OHNE_ENDE.has(name)) continue;
      aus.push(`</${name}>`);
      if (name === "a") {
        const offen = anker.pop();
        if (offen?.adresse) {
          const sichtbar = entitaetenAufloesen(aus.slice(offen.start).join("").replace(/<[^>]*>/g, ""));
          const ohneSchema = offen.adresse.replace(/^https?:\/\//i, "");
          if (!sichtbar.includes(offen.adresse) && !sichtbar.includes(ohneSchema)) {
            aus.push(` <span style="font-size:0.85em;color:#6b7280">(${attributWert(offen.adresse)})</span>`);
          }
        }
      }
      continue;
    }

    const attribute: string[] = [];
    let adresse: string | null = null;
    let bildQuelle: string | null = null;
    for (const [schluessel, wert] of attributeLesen(attributRoh)) {
      if (name === "a" && schluessel === "href") {
        const roh = entitaetenAufloesen(wert).trim();
        adresse = /^https?:\/\//i.test(roh) ? roh : null;
        continue;
      }
      if (name === "img" && schluessel === "src") {
        if (bildErlaubt(wert)) bildQuelle = entitaetenAufloesen(wert).trim();
        continue;
      }
      if (!ERLAUBTE_ATTRIBUTE.has(schluessel)) continue;
      if (schluessel === "style") {
        const stil = styleSauber(entitaetenAufloesen(wert));
        if (stil) attribute.push(`style="${attributWert(stil)}"`);
        continue;
      }
      attribute.push(`${schluessel}="${attributWert(wert)}"`);
    }

    if (name === "img") {
      if (!bildQuelle) continue; // ein Bild ohne erlaubte Quelle zeigt nichts
      attribute.unshift(`src="${attributWert(bildQuelle)}"`);
    }
    if (name === "a") anker.push({ adresse, start: aus.length });

    aus.push(`<${name}${attribute.length ? ` ${attribute.join(" ")}` : ""}>`);
  }

  const inhalt = aus.join("");
  const huelle = koerperStil ? `<div style="${attributWert(koerperStil)}">${inhalt}</div>` : inhalt;
  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${ANSICHT_CSP}">` +
    `</head><body style="margin:0">${huelle}</body></html>`
  );
}

// ---------------------------------------------
// Meldungen — der Server liefert die fertigen Saetze, die Oberflaeche rechnet nichts
// ---------------------------------------------

export const MAIL_TEXT_MELDUNGEN = {
  nichtErzeugt: "Kein Text: Die Mail wurde nicht erzeugt.",
  nichtErzeugtFehler: "Kein Text: Die Mail wurde nicht erzeugt (Fehler vor dem Versand).",
  bem: "Aus Datenschutzgründen wird der Text von BEM-Mails nicht gespeichert.",
  test: "Test-Versand: Der Text wird nicht gespeichert.",
  nichtGespeichert:
    "Kein Text gespeichert: Die Mail ging vor Einführung der Textspeicherung hinaus, oder der Text konnte nicht gespeichert werden.",
  nichtZugestelltTitel: "Nicht zugestellt",
  nichtZugestellt: "Diese Mail wurde nicht zugestellt. Angezeigt ist der Text, der hinausgehen sollte.",
  zugangslinksTitel: "Persönliche Links sind ersetzt",
  zugangslinks:
    "Die Mail enthielt den echten Link, hier steht ein Platzhalter. Links sind in dieser Ansicht nicht klickbar.",
  gekuerzt: "Der Text wurde bei 100.000 Zeichen gekürzt.",
  nichtGefunden: "Zu dieser Mail ist kein Text gespeichert.",
  ladefehler: "Der Text konnte nicht geladen werden.",
} as const;

/** Wurde in diesem gespeicherten Text ein Link ersetzt? Dann gilt der Hinweis „Persönliche Links sind ersetzt“. */
export function linkWurdeErsetzt(bodyHtml: string): boolean {
  return bodyHtml.includes(PLATZHALTER_LINK) || bodyHtml.includes(PLATZHALTER_KENNUNG) || /href\s*=\s*["']#["']/i.test(bodyHtml);
}

/**
 * Warum es zu einer Protokollzeile keinen Text gibt — `null`, wenn es einen gibt.
 * Reihenfolge: das Ereignis (BEM) und der Test-Versand erklaeren sich selbst,
 * SKIPPED hatte nie einen Text, eine FAILED-Zeile ohne Betreff entstand vor dem
 * Erzeugen der Mail; alles andere ist ein Altfall oder ein Speicherfehler.
 */
export function textHinweis(zeile: {
  event: string;
  status: string;
  isTest?: boolean;
  hatText: boolean;
  /** Die Zeile traegt keinen Betreff — die Mail wurde gar nicht erst erzeugt. */
  ohneBetreff?: boolean;
}): string | null {
  if (zeile.hatText) return null;
  if (zeile.event.startsWith("bem-") || getEventDefinition(zeile.event)?.group === "BEM") {
    return MAIL_TEXT_MELDUNGEN.bem;
  }
  if (zeile.isTest) return MAIL_TEXT_MELDUNGEN.test;
  if (zeile.status === "SKIPPED") return MAIL_TEXT_MELDUNGEN.nichtErzeugt;
  if (zeile.status === "FAILED" && zeile.ohneBetreff) return MAIL_TEXT_MELDUNGEN.nichtErzeugtFehler;
  return MAIL_TEXT_MELDUNGEN.nichtGespeichert;
}
