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
 *    `PORTAL_PFADE_ERLAUBT` steht (Seiten hinter der Anmeldung) UND einen
 *    erwarteten Aufbau hat: hoechstens eine Vorgangs-ID im Pfad, nirgends eine
 *    zweite Adresse, kein Token als Parametername oder Hostlabel. Alles andere
 *    ersetzt der Platzhalter — auch eine kuenftig neu gebaute Seite mit Token.
 *    Es gibt bewusst keine Liste „verbotener“ Pfade, die beim naechsten neuen
 *    Link veraltet.
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
 *    linearer Durchgang baut das Dokument aus erlaubten Tags und Attributen
 *    neu auf; nichts wird „entfernt“, was ein zweiter Durchgang wieder
 *    zusammensetzen koennte. Dieselbe Zerlegung (`lies`) liefert den Text der
 *    Ansicht „Nur Text“ — beide laufen bei JEDEM Oeffnen im Server, darum
 *    gibt es hier keine verschachtelten Quantoren: Die Laufzeit ist linear in
 *    der Laenge (hoechstens `MAX_TEXT_ZEICHEN`).
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

/** Hoechstens so viele Pfadsegmente hat eine behaltene Portal-Adresse (/vorgaenge/<modul>/<id>/…). */
const PORTAL_PFAD_MAX_SEGMENTE = 4;

/** Namen von Abfrageparametern, die einen Zugang tragen. */
const TOKEN_PARAMETER = /^(token|t|key|code|sig|signature|auth|access_token)$/i;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_LANG = /^[0-9a-f]{16,}$/i;
const ZEICHENFOLGE = /^[A-Za-z0-9_-]{20,}$/;
const WORTARTIG = /^(?:[A-Za-z]+|\d{1,4})$/;

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

/**
 * Benannte Entitaeten, die in Adressen und Attributen vorkommen koennen. Die
 * vollstaendige HTML-Tabelle hat ueber 2000 Eintraege; hier stehen die
 * Trennzeichen und Satzzeichen, mit denen sich ein Link „verpacken“ laesst.
 * Unbekannte Namen bleiben stehen — eine Ausgabe, die sie weiterreicht, muss
 * das `&` maskieren (siehe `attributWert`).
 */
const ENTITAETEN: Record<string, string> = {
  nbsp: " ",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  amp: "&",
  colon: ":",
  sol: "/",
  bsol: "\\",
  period: ".",
  num: "#",
  lpar: "(",
  rpar: ")",
  quest: "?",
  equals: "=",
  percnt: "%",
  excl: "!",
  commat: "@",
  semi: ";",
  comma: ",",
  plus: "+",
  dollar: "$",
  ast: "*",
  lowbar: "_",
  hyphen: "-",
  dash: "-",
  lsqb: "[",
  rsqb: "]",
  lbrack: "[",
  rbrack: "]",
  lcub: "{",
  rcub: "}",
  tab: "\t",
  newline: "\n",
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

/**
 * Sieht dieses Stueck wie ein Token aus? UUID und Hex ab 16 immer; eine
 * Zeichenfolge ab 20 mit Ziffer UND Buchstabe, ausser sie besteht aus Woertern
 * und kurzen Zahlen (ein Slug wie „Datenschutzerklaerung-Bewerber-2024“).
 */
function segmentTokenartig(segment: string): boolean {
  if (UUID.test(segment) || HEX_LANG.test(segment)) return true;
  if (!ZEICHENFOLGE.test(segment) || !/\d/.test(segment) || !/[A-Za-z]/.test(segment)) return false;
  return !segment.split(/[-_]/).every((teil) => teil === "" || WORTARTIG.test(teil));
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

/** Eine zweite Adresse im Pfad (auch prozentkodiert) oder ein Backslash — nie Teil einer erwarteten Portal-Adresse. */
function enthaeltFremdadresse(segment: string): boolean {
  let s = segment;
  try {
    s = decodeURIComponent(segment);
  } catch {
    // roh pruefen
  }
  return /:\/\/|:\/|\\/.test(s) || /:%2f/i.test(segment);
}

/**
 * Hat der Pfad einer Portal-Adresse den erwarteten Aufbau? Hoechstens
 * `PORTAL_PFAD_MAX_SEGMENTE`; kein Segment mit einer zweiten Adresse; ein
 * tokenartiges Segment nur als Vorgangs-ID direkt hinter `/vorgaenge/<modul>`.
 */
function portalPfadAufbauOk(pfad: string): boolean {
  const segmente = pfad.split("/").filter((s) => s !== "");
  if (segmente.length > PORTAL_PFAD_MAX_SEGMENTE) return false;
  for (let k = 0; k < segmente.length; k++) {
    const segment = segmente[k];
    if (enthaeltFremdadresse(segment)) return false;
    const vorgangsId = k === 2 && segmente[0] === "vorgaenge" && UUID.test(segment);
    if (!vorgangsId && teilTokenartig(segment)) return false;
  }
  return true;
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
  // Ein Token als Label des Hostnamens („<uuid>.example.org“).
  if (url.hostname.split(".").some((label) => segmentTokenartig(label))) return false;

  for (const [name, wert] of url.searchParams) {
    const sauber = name.replace(/^amp;/i, "");
    if (TOKEN_PARAMETER.test(sauber) || teilTokenartig(sauber) || wertTokenartig(wert)) return false;
  }
  if (url.hash) {
    if (/(^#|[?&;])(?:amp;)?(?:access_)?(?:token|key|code|sig|auth)=/i.test(url.hash)) return false;
    if (wertTokenartig(url.hash.slice(1))) return false;
  }

  const pfad = url.pathname.replace(/\/{2,}/g, "/");
  const imPortal = portalHost === null || url.host.toLowerCase() === portalHost;
  if (imPortal) return pfadErlaubt(pfad) && portalPfadAufbauOk(pfad);
  return !pfadTokenartig(pfad);
}

/** Adressen mit Schema im Text und in Attributen; Schraegstrich oder Backslash. */
const ADRESSE_MUSTER = /https?:[\\/]{2}[^\s"'<>]+/gi;
/** Ab hier gehoert der Rest nicht mehr zur Adresse: Entitaet eines Trennzeichens oder Zeichen ausserhalb von ASCII. */
const ENDE_MUSTER = /&(?:quot|apos|gt|lt|nbsp|#0*(?:34|39|60|62|160)|#x0*(?:22|27|3c|3e|a0));|[^\x21-\x7e]/i;
const HREF_MUSTER = /(\bhref\s*=\s*)(["'])(.*?)\2/gi;
/** Adresse ohne Schema, wenn die Portal-Adresse unbekannt ist: Host mit Punkt, dann „/“. */
const OHNE_SCHEMA_ALLGEMEIN = /(?<![\w@.-])(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d{1,5})?\/[^\s"'<>]*/gi;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Haengt Satzzeichen vom Ende ab, die zum Satz gehoeren — ohne Regex (kein `$`-Anker, linear). */
function satzEndeAbtrennen(text: string): { kopf: string; ende: string } {
  let schnitt = text.length;
  while (schnitt > 0 && ".,;:!?)]".includes(text.charAt(schnitt - 1))) schnitt--;
  return { kopf: text.slice(0, schnitt), ende: text.slice(schnitt) };
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

  // 2. Adressen mit Schema im Text und in sonstigen Attributen. Entschieden
  //    wird ueber die von Entitaeten befreite Fassung („&sol;“ ist ein „/“).
  text = text.replace(ADRESSE_MUSTER, (treffer: string) => {
    const schnitt = ENDE_MUSTER.exec(treffer);
    const bis = schnitt ? treffer.slice(0, schnitt.index) : treffer;
    const rest = schnitt ? treffer.slice(schnitt.index) : "";
    const { kopf, ende } = satzEndeAbtrennen(bis);
    if (adresseBleibt(entitaetenAufloesen(kopf), portalHost)) return kopf + ende + kennungenEntfernen(rest);
    return PLATZHALTER_LINK + ende + kennungenEntfernen(rest);
  });

  // 3. Adressen OHNE Schema („hr.fes-credo.de/fragebogen/…“). Heute baut sie
  //    keine Vorlage; ein Admin kann sie in einen Text tippen. Mit bekannter
  //    Portal-Adresse sucht der Durchgang genau sie, sonst jede „host.tld/…“.
  const ohneSchema = portalHost
    ? new RegExp(`(?<![\\w@.-])${escapeRegExp(portalHost)}(?:/[^\\s"'<>]*)`, "gi")
    : OHNE_SCHEMA_ALLGEMEIN;
  text = text.replace(ohneSchema, (treffer: string) => {
    const { kopf, ende } = satzEndeAbtrennen(treffer);
    return adresseBleibt(`https://${entitaetenAufloesen(kopf)}`, portalHost) ? treffer : `${PLATZHALTER_LINK}${ende}`;
  });

  // 4. Netz: Kennungen ausserhalb der behaltenen Adressen. Die Adressen selbst
  //    (Teile mit ungerader Nummer) bleiben, wie sie sind — ihren Aufbau hat
  //    `adresseBleibt` schon geprueft; eine Vorgangs-ID im Pfad von
  //    /vorgaenge/onboarding/<uuid> ist keine Kennung eines Zugangs.
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

/** NUL und lose Surrogate lehnt die Datenbank ab (UTF-8): vorher bereinigen, sonst bliebe die Mail ohne Text. */
function speicherbar(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "�");
}

/**
 * Die Kopie fuer das Protokoll aus dem HTML, das hinausging: Adressen ersetzen,
 * DANACH kuerzen (sonst bliebe vom Ende einer Adresse ein Rest zurueck) und
 * zuletzt fuer die Datenbank bereinigen (die Kuerzung kann ein Surrogatpaar
 * zerschneiden).
 */
export function textFuerProtokoll(html: string, appUrl: string): MailTextKopie {
  const ersetzt = linksErsetzen(html, appUrl);
  if (ersetzt.length <= MAX_TEXT_ZEICHEN) return { bodyHtml: speicherbar(ersetzt), gekuerzt: false };
  return { bodyHtml: speicherbar(ersetzt.slice(0, MAX_TEXT_ZEICHEN)), gekuerzt: true };
}

// ---------------------------------------------
// Zerlegung (gemeinsam fuer Ansicht und „Nur Text“) — linear, ohne Regex-Durchgaenge
// ---------------------------------------------

type Roh = { art: "text"; text: string } | { art: "tag"; name: string; schliessend: boolean; attribute: string };

/** Elemente, deren Inhalt bis zum Schluss-Tag Rohtext ist — ohne Schluss-Tag faellt der Rest weg (wie im Browser). */
const NUR_ROHTEXT = new Set(["script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes", "noscript", "plaintext"]);
/** Eingebettete Inhalte: mit Schluss-Tag faellt ihr Inhalt weg, ohne bleibt nur das Tag weg. */
const BEI_ENDE_VERWERFEN = new Set(["object", "embed", "applet", "template", "svg", "math"]);

function kommentarEnde(html: string, ab: number): number {
  const a = html.indexOf("-->", ab);
  const b = html.indexOf("--!>", ab);
  if (a === -1 && b === -1) return -1;
  if (a === -1) return b + 4;
  if (b === -1) return a + 3;
  return a < b ? a + 3 : b + 4;
}

/**
 * Zerlegt HTML in Text und Tags — in EINEM Durchgang, ohne Zurueckgehen.
 * Kommentare, Doctype, Verarbeitungsanweisungen und der Inhalt ausfuehrbarer
 * Elemente erscheinen nicht. Ein „<“, das kein Tag beginnt, ist Text.
 */
function lies(html: string): Roh[] {
  const aus: Roh[] = [];
  const n = html.length;
  let i = 0;

  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      aus.push({ art: "text", text: html.slice(i) });
      break;
    }
    if (lt > i) aus.push({ art: "text", text: html.slice(i, lt) });

    if (html.startsWith("<!--", lt)) {
      // „<!-->“ und „<!--->“ sind leere Kommentare
      if (html.startsWith("<!-->", lt)) {
        i = lt + 5;
        continue;
      }
      if (html.startsWith("<!--->", lt)) {
        i = lt + 6;
        continue;
      }
      const ende = kommentarEnde(html, lt + 4);
      if (ende === -1) break;
      i = ende;
      continue;
    }
    const folge = html.charAt(lt + 1);
    if (folge === "!" || folge === "?") {
      const ende = html.indexOf(">", lt);
      if (ende === -1) break;
      i = ende + 1;
      continue;
    }

    const kopf = /^<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)/.exec(html.slice(lt, lt + 80));
    if (!kopf) {
      aus.push({ art: "text", text: "<" });
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
      aus.push({ art: "text", text: html.slice(lt, j) });
      i = j;
      continue;
    }

    const schliessend = kopf[1] === "/";
    const name = kopf[2].toLowerCase();
    const attribute = html.slice(lt + kopf[0].length, zu);
    i = zu + 1;

    const selbstschliessend = !schliessend && attribute.trimEnd().endsWith("/");
    const inhaltVerwerfen = !schliessend && !selbstschliessend && (NUR_ROHTEXT.has(name) || BEI_ENDE_VERWERFEN.has(name));
    if (inhaltVerwerfen) {
      const ende = new RegExp(`</${name}[\\s/>]`, "gi");
      ende.lastIndex = i;
      const treffer = ende.exec(html);
      if (!treffer) {
        if (NUR_ROHTEXT.has(name)) break; // Rohtext ohne Ende reicht bis zum Schluss
        continue; // eingebetteter Inhalt ohne Ende: nur das Tag selbst entfaellt
      }
      const zu2 = html.indexOf(">", treffer.index);
      if (zu2 === -1) break;
      i = zu2 + 1;
      continue;
    }
    if (NUR_ROHTEXT.has(name) || BEI_ENDE_VERWERFEN.has(name)) continue; // schliessend oder selbstschliessend

    aus.push({ art: "tag", name, schliessend, attribute });
  }
  return aus;
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

/** Die Adresse eines Links, wie ein Browser sie lesen wuerde; `null`, wenn es keine http(s)-Adresse ist. */
function ankerAdresse(attribute: string): string | null {
  const href = attributeLesen(attribute).find(([schluessel]) => schluessel === "href");
  if (!href) return null;
  const roh = entitaetenAufloesen(href[1]).trim();
  return /^https?:\/\//i.test(roh) ? roh : null;
}

/** Wie viele offene Links hoechstens ihren sichtbaren Text mitfuehren (Laufzeit: Texte mal offene Links). */
const MAX_OFFENE_ANKER = 20;

interface OffenerAnker {
  adresse: string | null;
  /** Der bisher sichtbare Text, nur so weit, wie ein Vergleich mit der Adresse ihn braucht. */
  sichtbar: string;
}

function adresseSchonSichtbar(anker: OffenerAnker): boolean {
  if (!anker.adresse) return true;
  const ohneSchema = anker.adresse.replace(/^https?:\/\//i, "");
  return anker.sichtbar.includes(anker.adresse) || anker.sichtbar.includes(ohneSchema);
}

function sichtbarAnhaengen(offene: OffenerAnker[], text: string): void {
  for (const anker of offene) {
    if (!anker.adresse) continue;
    const frei = anker.adresse.length + 50 - anker.sichtbar.length;
    if (frei > 0) anker.sichtbar += text.slice(0, frei);
  }
}

// ---------------------------------------------
// Anzeige: „Nur Text“
// ---------------------------------------------

/** Die Ansicht „Nur Text“: aus dem gespeicherten HTML abgeleitet, nicht doppelt gespeichert. */
export function textAusHtml(html: string): string {
  const aus: string[] = [];
  const offene: OffenerAnker[] = [];

  for (const stueck of lies(html)) {
    if (stueck.art === "text") {
      const text = entitaetenAufloesen(stueck.text);
      aus.push(text);
      sichtbarAnhaengen(offene, text);
      continue;
    }
    const { name, schliessend } = stueck;
    if (name === "br") aus.push("\n");
    else if (name === "li") aus.push(schliessend ? "\n" : "- ");
    else if (schliessend && /^(?:p|h[1-6]|ul|ol|table|section|blockquote)$/.test(name)) aus.push("\n\n");
    else if (schliessend && (name === "div" || name === "tr")) aus.push("\n");
    else if (schliessend && (name === "td" || name === "th")) aus.push(" ");
    else if (name === "a") {
      if (!schliessend) {
        const adresse = offene.length < MAX_OFFENE_ANKER ? ankerAdresse(stueck.attribute) : null;
        offene.push({ adresse, sichtbar: "" });
      } else {
        const anker = offene.pop();
        // In der Ansicht sind Links nicht klickbar: die Adresse steht hinter dem Linktext.
        if (anker?.adresse && !adresseSchonSichtbar(anker)) aus.push(` (${anker.adresse})`);
      }
    }
  }

  return aus
    .join("")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((zeile) => zeile.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------
// Anzeige: „Ansicht“
// ---------------------------------------------

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
const ERLAUBTE_ATTRIBUTE = new Set([
  "style", "align", "valign", "width", "height", "bgcolor", "colspan", "rowspan", "cellpadding", "cellspacing",
  "border", "color", "size", "face", "alt", "title", "lang", "dir", "role",
]);
/** Funktionen, die ein style-Wert aufrufen darf. `url`, `image-set`, `var`, `src`, `attr` … sind es nie. */
const ERLAUBTE_CSS_FUNKTIONEN = new Set(["rgb", "rgba", "hsl", "hsla", "calc", "min", "max", "clamp"]);

/**
 * Der Wert eines Attributs, wie er im Dokument steht. Der Wert ist schon EINMAL
 * von Entitaeten befreit (so liest ihn ein Browser) und wurde in dieser Form
 * geprueft; jedes `&` wird hier maskiert, damit der Browser ihn kein zweites
 * Mal dekodiert und aus „u&#114;l(“ ein „url(“ macht.
 */
function attributWert(wert: string): string {
  return wert
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function textStueck(text: string): string {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Ein style-Wert ohne nachladende oder ausfuehrbare Anteile; sonst `null`. Eingabe: einmal dekodiert. */
function styleSauber(wert: string): string | null {
  const w = wert.trim();
  if (!w) return null;
  if (/[<>\\]|\/\*|expression|@import|javascript:|vbscript:|behavior\s*:|-moz-binding/i.test(w)) return null;
  const aufrufe = w.matchAll(/([a-z][a-z0-9-]*)\s*\(/gi);
  for (const aufruf of aufrufe) {
    if (!ERLAUBTE_CSS_FUNKTIONEN.has(aufruf[1].toLowerCase())) return null;
  }
  return w;
}

/**
 * Ein Bild bleibt nur als eingebettetes Bild oder als das Logo der Mail — das
 * Logo nur von der Portal-Adresse (`appUrl`) oder als „/credo_logo.png“.
 */
function bildErlaubt(wert: string, portalHost: string | null): boolean {
  const w = wert.trim();
  if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(w)) return w.length < 150_000;
  if (w === "/credo_logo.png") return true;
  if (!portalHost) return false;
  try {
    const url = new URL(w);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.host.toLowerCase() === portalHost &&
      url.pathname === "/credo_logo.png" &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

/**
 * Das HTML fuer den Rahmen der Ansicht (`<iframe sandbox="" srcDoc>`).
 *
 * Ein einziger linearer Durchgang (`lies`) baut das Dokument NEU auf: Es gibt
 * nur Tags der Positivliste, nur Attribute der Positivliste, und jedes `<` im
 * Text wird maskiert. Was das Eingabe-HTML an Verschachtelung, fehlenden
 * Leerzeichen oder Anfuehrungszeichen versucht, aendert an der Ausgabe nichts:
 * Sie entsteht aus dem, was erkannt wurde, nicht aus dem Rest.
 *
 *  - Skripte, Rahmen, Formulare-Inhalte und eingebettete Inhalte fallen mit
 *    ihrem Inhalt weg; unbekannte Tags fallen weg, ihr Text bleibt.
 *  - `href` gibt es nie; die Adresse eines Links steht als Text hinter dem
 *    Linktext (wie in „Nur Text“).
 *  - Attributwerte werden einmal dekodiert, in dieser Form geprueft und mit
 *    maskiertem `&` ausgegeben.
 *  - Das Dokument bekommt immer eine eigene CSP (`default-src 'none'`).
 *
 * `appUrl` ist die Portal-Adresse: Nur von dort bleibt das Logo ein Bild.
 * Die Sandbox des Rahmens und die geerbte Portal-CSP bleiben die ersten
 * Schichten; das hier ist die dritte.
 */
export function htmlFuerAnsicht(html: string, appUrl = ""): string {
  const portalHost = portalHostAus(appUrl);
  const aus: string[] = [];
  const offene: OffenerAnker[] = [];
  let koerperStil: string | null = null;

  for (const stueck of lies(html)) {
    if (stueck.art === "text") {
      aus.push(textStueck(stueck.text));
      sichtbarAnhaengen(offene, entitaetenAufloesen(stueck.text));
      continue;
    }
    const { name, schliessend, attribute } = stueck;

    if (name === "body" && !schliessend) {
      const stil = attributeLesen(attribute).find(([schluessel]) => schluessel === "style");
      koerperStil = stil ? styleSauber(entitaetenAufloesen(stil[1])) : null;
      continue;
    }
    if (!ERLAUBTE_TAGS.has(name)) continue; // Tag weg, Inhalt bleibt

    if (schliessend) {
      if (OHNE_ENDE.has(name)) continue;
      aus.push(`</${name}>`);
      if (name === "a") {
        const anker = offene.pop();
        if (anker?.adresse && !adresseSchonSichtbar(anker)) {
          aus.push(` <span style="font-size:0.85em;color:#6b7280">(${attributWert(anker.adresse)})</span>`);
        }
      }
      continue;
    }

    const attribute2: string[] = [];
    let bildQuelle: string | null = null;
    for (const [schluessel, wert] of attributeLesen(attribute)) {
      const echt = entitaetenAufloesen(wert);
      if (name === "img" && schluessel === "src") {
        if (bildErlaubt(echt, portalHost)) bildQuelle = echt.trim();
        continue;
      }
      if (!ERLAUBTE_ATTRIBUTE.has(schluessel)) continue;
      if (schluessel === "style") {
        const stil = styleSauber(echt);
        if (stil) attribute2.push(`style="${attributWert(stil)}"`);
        continue;
      }
      attribute2.push(`${schluessel}="${attributWert(echt)}"`);
    }

    if (name === "img") {
      if (!bildQuelle) continue; // ein Bild ohne erlaubte Quelle zeigt nichts
      attribute2.unshift(`src="${attributWert(bildQuelle)}"`);
    }
    if (name === "a") {
      const adresse = offene.length < MAX_OFFENE_ANKER ? ankerAdresse(attribute) : null;
      offene.push({ adresse, sichtbar: "" });
    }

    aus.push(`<${name}${attribute2.length ? ` ${attribute2.join(" ")}` : ""}>`);
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
