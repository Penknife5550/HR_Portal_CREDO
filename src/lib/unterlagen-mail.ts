/**
 * CREDO HR-Portal – Payload-Bausteine der Mails „Unterlagen nachfordern“ (Paket 4)
 *
 * Fuenf Ereignisse, zwei Empfaengerkreise (Feinplanung Abschnitt 8):
 *
 *   an die Person  unterlagen-angefordert, unterlagen-erinnerung,
 *                  unterlage-zurueckgewiesen. Sie tragen den persoenlichen
 *                  Upload-Link und gehen deshalb DIREKT ueber sendEventEmail
 *                  (mit overrideTo = Adresse der Nachforderung), nie ueber
 *                  triggerWebhooks: Der Dispatcher reichte die Payload samt Link
 *                  an jeden Webhook weiter, und der Link ist ein Zugang zur
 *                  Personalakte. Zweite begruendete Ausnahme neben dem
 *                  Dokumentenpaket (EVENTS_OHNE_WEBHOOK in ereignis-liste.ts).
 *   an HR          unterlagen-vollstaendig, unterlagen-frist-verstrichen. Ueber
 *                  triggerWebhooks, An = anfordernde HR-Person, Cc = HR-Postfach
 *                  (Katalog-Default). Ohne Link, ohne Adresse der Person, ohne
 *                  Namen von Unterlagen — deshalb duerfen sie an Webhooks.
 *
 * Diese Datei baut nur die Payloads; wer wann sendet, entscheidet der Dienst.
 * Sie ist rein: kein Prisma, keine Uhr (`heute` kommt als Kalendertag), kein
 * getBaseUrl (Upload-Link und Portal-Link kommen fertig vom Aufrufer). Die
 * Eingaben haben bewusst eine eigene, enge Schnittstelle — der Dienst bildet
 * seine Zeilen darauf ab, die Mails haengen nicht am Datenmodell.
 *
 * Regeln, die hier gelten:
 *
 *   - Jede Variable einer Vorlage steht in JEDER Payload ihres Ereignisses,
 *     notfalls als "". renderTemplate laesst unbekannte Platzhalter woertlich
 *     stehen (src/lib/mailer.ts) — ein fehlendes Feld stuende als „{{…}}“ im
 *     Postfach.
 *   - Merker sind Zeichenketten "ja"/"": renderTemplate kennt nur „nicht leer“,
 *     String(false) waere nicht leer und der Block bliebe stehen.
 *   - Freitexte von HR (Bezeichnung, Hinweis, Nachricht, Begruendung) gibt es
 *     zweimal: roh fuer Betreff und Textteil, fertig maskiert fuer das HTML
 *     (`…_html` bzw. die HTML-Liste). Die Rohfelder stehen zusaetzlich in
 *     FREITEXT_VARIABLEN des Mailers, falls ein Admin sie doch ins HTML setzt.
 *   - Sensible Unterlagen (Masernschutz, SB-Ausweis, Fuehrungszeugnis,
 *     Aufenthaltstitel, Arbeitserlaubnis) nennt eine Mail nie beim Namen
 *     (Entscheidung E-2): Mails an Freemail-Postfaecher liest der Anbieter
 *     mit, und der Aufenthaltsstatus verraet die Herkunft. In der Liste steht
 *     dann nur „Eine vertrauliche Unterlage – …“, bei einer Zurueckweisung
 *     bleiben Name und Begruendung leer; beides zeigt nur die Upload-Seite.
 *   - `mitarbeiter_name` ist nie leer und nie eine Adresse: Ein leerer Wert
 *     fiele in extractVariables auf `payload.email` zurueck.
 *   - Kein `expiresAt`/`tokenExpiresAt`: {{ablaufdatum}} bleibt leer. Die Mail
 *     nennt EIN Datum, die Frist; das Linkende nur, wenn die Frist schon
 *     verstrichen ist (EP-16).
 */

import { alsHtmlAbsaetze, escapeHtml } from "@/lib/email-layout";
import {
  berlinerKalendertag,
  formatKalendertag,
  formatKalendertagLang,
  tageZwischen,
  type Kalendertag,
} from "@/lib/kalendertag";
import { MITARBEITER_NEUTRAL } from "@/lib/onboarding-spuren";

// =============================================
// Ereignisse
// =============================================

/** Die fuenf Ereignisse der Nachforderung (== EmailTemplate.event). */
export const UNTERLAGEN_EVENTS = {
  ANGEFORDERT: "unterlagen-angefordert",
  ERINNERUNG: "unterlagen-erinnerung",
  ZURUECKGEWIESEN: "unterlage-zurueckgewiesen",
  VOLLSTAENDIG: "unterlagen-vollstaendig",
  FRIST_VERSTRICHEN: "unterlagen-frist-verstrichen",
} as const;

/**
 * Die drei Ereignisse mit persoenlichem Upload-Link. Sie duerfen NIE ueber
 * triggerWebhooks laufen (Kopfkommentar); ereignis-liste.test.ts haelt sie
 * gegen EVENTS_OHNE_WEBHOOK.
 */
export const UNTERLAGEN_PERSONEN_EVENTS: readonly string[] = [
  UNTERLAGEN_EVENTS.ANGEFORDERT,
  UNTERLAGEN_EVENTS.ERINNERUNG,
  UNTERLAGEN_EVENTS.ZURUECKGEWIESEN,
];

// =============================================
// Texte
// =============================================

/** So erscheint eine sensible Unterlage in jeder Mail (E-2). */
export const VERTRAULICHE_UNTERLAGE = "Eine vertrauliche Unterlage";
export const VERTRAULICHE_UNTERLAGE_ZUSATZ = "Einzelheiten sehen Sie nach dem Öffnen des Links";

/** Zusatz hinter Unterlagen, die im Original abzugeben sind (Schriftform, E-4). */
export const ORIGINAL_ZUSATZ = "bitte zusätzlich das unterschriebene Original abgeben";

/** Anzeigename der Vorgangsart je Modul (Stufe 2 ergaenzt hier). */
const VORGANGSARTEN: Readonly<Record<string, string>> = {
  ONBOARDING: "Onboarding",
};

// =============================================
// Eingaben
// =============================================

/**
 * Eine Position, wie die Mails sie brauchen. `status` ist bewusst eine
 * Zeichenkette (so steht er in der Datenbank); gewertet werden ANGEFORDERT,
 * EINGEREICHT, ANGENOMMEN, ZURUECKGEWIESEN und ENTFAELLT.
 */
export interface UnterlagenMailPosition {
  bezeichnung: string;
  hinweis: string | null;
  /** Kopie beim Anlegen (E-1): steuert die neutrale Nennung (E-2). */
  sensibel: boolean;
  /** Schriftform: Zusatz „bitte zusätzlich das unterschriebene Original abgeben“. */
  originalErforderlich: boolean;
  status: string;
  /** Beim Ergaenzen neu hinzugekommen: traegt „(neu)“. Nur fuer die Ergaenzungsmail setzen. */
  neu: boolean;
  /** Anzahl der Uebermittlungen (1 = erste Einreichung). */
  einreichungen?: number;
}

/** Der Vorgang und die Nachforderung, soweit die Mails sie brauchen. */
export interface UnterlagenMailVorgang {
  nachforderungId: string;
  /** "ONBOARDING" (Stufe 1) */
  modul: string;
  /** Id des Vorgangs */
  refId: string;
  displayId: string | null;
  einrichtung: string;
  /** Vor- und Nachname der Person; leer bzw. null, solange unbekannt. */
  vorname: string | null;
  nachname: string | null;
  /** Frist der Nachforderung, Kalendertag in deutscher Zeit */
  frist: Kalendertag;
  /**
   * false = keine Vorgangsnummer in allen fuenf Mails, keine Namen von
   * Unterlagen in den Mails an die Person (Stufe 2, Mutterschutz). In Stufe 1
   * immer true.
   */
  mitDetails: boolean;
}

interface PersonenMailEingabe {
  vorgang: UnterlagenMailVorgang;
  /** Alle Positionen; die Liste zeigt nur, was auf die Person wartet. */
  positionen: readonly UnterlagenMailPosition[];
  /** Adresse der Nachforderung (`email`); der Dienst sendet mit overrideTo dorthin. */
  empfaenger: string;
  /** Der eigene Link DIESER Mail (nie ein Token-Feld daneben). */
  link: string;
  /** `gueltigBis` des Links dieser Mail — genannt nur nach der Frist. */
  linkGueltigBis: Kalendertag;
  /** Heutiger Kalendertag in deutscher Zeit. */
  heute: Kalendertag;
  /** Nachricht von HR an die Person (max. 1000), oder null. */
  nachricht: string | null;
}

/** Wozu die Aufforderung hinausgeht (Anlass des Links). */
export type UnterlagenAufforderungAnlass = "ANFORDERUNG" | "ERGAENZUNG" | "ERNEUT" | "FRISTAENDERUNG";

export interface AufforderungMailEingabe extends PersonenMailEingabe {
  anlass: UnterlagenAufforderungAnlass;
  /** Vom taeglichen Lauf nachgeholt (die Mail davor scheiterte). */
  nachgeholt?: boolean;
}

export interface ErinnerungMailEingabe extends PersonenMailEingabe {
  /** VORAB = 7 Tage vor der Frist, FRISTTAG = am Tag der Frist */
  stufe: "VORAB" | "FRISTTAG";
  /** Die Person hat Dateien hochgeladen, aber noch nicht uebermittelt. */
  entwurfVorhanden: boolean;
}

export interface ZurueckweisungMailEingabe extends PersonenMailEingabe {
  /** Die zurueckgewiesene Position */
  position: UnterlagenMailPosition;
  /** Begruendung fuer die Person (Pflicht, max. 1000) */
  begruendung: string;
  nachgeholt?: boolean;
}

interface HrMailEingabe {
  vorgang: UnterlagenMailVorgang;
  positionen: readonly UnterlagenMailPosition[];
  /** Fertiger Link auf den Vorgang im Portal (`<APP_URL>/dashboard/<id>`) */
  portalLink: string;
  /** Wer die Nachforderung angelegt hat; null, wenn das Konto geloescht ist. */
  anfordernd: { email: string | null; name: string | null; aktiv: boolean } | null;
  /** SmtpConfig.replyToEmail (das zentrale HR-Postfach), "" oder null ohne. */
  hrPostfach: string | null;
  angefordertAm: Date;
}

export interface VollstaendigMailEingabe extends HrMailEingabe {
  /** Zeitpunkt der Uebermittlung, die die Nachforderung vollstaendig machte */
  uebermitteltAm: Date;
}

export interface FristVerstrichenMailEingabe extends HrMailEingabe {
  /** Bis wann HR den Link noch erneut senden kann (Frist + 14) */
  linkGueltigBis: Kalendertag;
  /** Keine Mail an die Person wurde je zugestellt (SENT). */
  nieZugestellt: boolean;
}

/** Payload fuer sendEventEmail bzw. triggerWebhooks. Zaehler als Zahl, sonst Text. */
export type UnterlagenMailPayload = Record<string, string | number>;

// =============================================
// Hilfen
// =============================================

const merker = (wert: boolean): string => (wert ? "ja" : "");

/** Wartet auf die Person: offen oder zurueckgewiesen (Feinplanung 2). */
function wartetAufPerson(p: UnterlagenMailPosition): boolean {
  return p.status === "ANGEFORDERT" || p.status === "ZURUECKGEWIESEN";
}

/** Vor- und Nachname getrimmt, `mitarbeiter_name` nie leer. */
function namensFelder(v: UnterlagenMailVorgang): {
  vorname: string;
  nachname: string;
  mitarbeiter_name: string;
} {
  const vorname = v.vorname?.trim() ?? "";
  const nachname = v.nachname?.trim() ?? "";
  return {
    vorname,
    nachname,
    mitarbeiter_name: [vorname, nachname].filter(Boolean).join(" ") || MITARBEITER_NEUTRAL,
  };
}

/**
 * Was alle fuenf Mails tragen.
 *
 * `vorgang_zusatz` (" 2026-GYM-014" oder "") und `vorgang_kurz`
 * ("Vorgang 2026-GYM-014" oder "Vorgang") gibt es, weil `displayId` nullbar
 * ist: „Vorgang {{vorgangsnummer}} – …“ ergaebe sonst doppelte Leerzeichen im
 * Betreff.
 *
 * Ohne Details (Stufe 2, Mutterschutz) fehlt die Nummer in ALLEN fuenf Mails,
 * auch in denen an HR (Feinplanung 8.2, „Gemeinsam“): Das Praefix verraet das
 * Modul („MS-…“), und der HR-Betreff steht 90 Tage im Versandprotokoll, die
 * Payload geht zudem an Webhooks. HR findet den Vorgang ueber den Portal-Link.
 */
function gemeinsameFelder(v: UnterlagenMailVorgang): UnterlagenMailPayload {
  const nummer = v.mitDetails ? (v.displayId?.trim() ?? "") : "";
  return {
    nachforderungId: v.nachforderungId,
    modul: v.modul,
    refId: v.refId,
    ...(v.modul === "ONBOARDING" ? { onboardingId: v.refId } : {}),
    vorgangsart: VORGANGSARTEN[v.modul] ?? v.modul,
    displayId: nummer,
    einrichtung: v.einrichtung,
    organization: v.einrichtung,
    frist: formatKalendertag(v.frist),
    frist_lang: formatKalendertagLang(v.frist),
    mit_details: merker(v.mitDetails),
    ohne_details: merker(!v.mitDetails),
    vorgang_zusatz: nummer ? ` ${nummer}` : "",
    vorgang_kurz: nummer ? `Vorgang ${nummer}` : "Vorgang",
  };
}

/** Kalendertag eines Zeitstempels als TT.MM.JJJJ in deutscher Zeit. */
function tagAusZeitpunkt(zeitpunkt: Date): string {
  return Number.isNaN(zeitpunkt.getTime()) ? "" : formatKalendertag(berlinerKalendertag(zeitpunkt));
}

// =============================================
// Liste der Unterlagen (Mails an die Person)
// =============================================

const LISTE_STIL = "margin:0 0 16px;padding-left:20px;color:#374151;font-size:14px;line-height:1.6;";
const ZEILE_STIL = "margin:0 0 6px;";
const HINWEIS_STIL = "color:#6b7280;font-size:13px;";

/**
 * Alle Positionen, die auf die Person warten — als Klartext fuer den
 * Textteil und als fertig maskierte HTML-Liste.
 *
 *   - Name, dazu „ (neu)“ nach dem Ergaenzen und „ – bitte zusätzlich das
 *     unterschriebene Original abgeben“ bei Schriftform; der Hinweis von HR
 *     steht eingerueckt bzw. grau darunter.
 *   - Sensible Positionen nur als „Eine vertrauliche Unterlage – Einzelheiten
 *     sehen Sie nach dem Öffnen des Links“, ohne Hinweis (der verriete die Art).
 *   - Ohne Details (Stufe 2) bleiben beide Listen leer und
 *     `original_erforderlich` ebenso: Der Satz dazu verweist auf die Liste.
 *
 * `anzahl_unterlagen` zaehlt die wartenden Positionen, auch ohne Details.
 */
export function unterlagenlisteMailFelder(
  positionen: readonly UnterlagenMailPosition[],
  mitDetails: boolean,
): {
  unterlagenliste: string;
  unterlagenliste_html: string;
  anzahl_unterlagen: number;
  original_erforderlich: string;
} {
  const wartend = positionen.filter(wartetAufPerson);
  if (!mitDetails || wartend.length === 0) {
    return {
      unterlagenliste: "",
      unterlagenliste_html: "",
      anzahl_unterlagen: wartend.length,
      original_erforderlich: "",
    };
  }

  const text: string[] = [];
  const html: string[] = [];
  for (const p of wartend) {
    const neu = p.neu ? " (neu)" : "";
    if (p.sensibel) {
      const zeile = `${VERTRAULICHE_UNTERLAGE}${neu} – ${VERTRAULICHE_UNTERLAGE_ZUSATZ}`;
      text.push(`- ${zeile}`);
      html.push(`<li style="${ZEILE_STIL}">${escapeHtml(zeile)}</li>`);
      continue;
    }
    const original = p.originalErforderlich ? ` – ${ORIGINAL_ZUSATZ}` : "";
    const hinweis = p.hinweis?.trim() ?? "";
    text.push(
      `- ${p.bezeichnung.trim()}${neu}${original}` +
        (hinweis ? `\n  ${hinweis.replace(/\r\n?|\n/g, "\n  ")}` : ""),
    );
    html.push(
      `<li style="${ZEILE_STIL}"><strong>${escapeHtml(p.bezeichnung.trim())}</strong>${neu}${escapeHtml(original)}` +
        (hinweis ? `<br><span style="${HINWEIS_STIL}">${alsHtmlAbsaetze(hinweis)}</span>` : "") +
        "</li>",
    );
  }

  return {
    unterlagenliste: text.join("\n"),
    unterlagenliste_html: `<ul style="${LISTE_STIL}">${html.join("")}</ul>`,
    anzahl_unterlagen: wartend.length,
    original_erforderlich: merker(wartend.some((p) => !p.sensibel && p.originalErforderlich)),
  };
}

// =============================================
// Mails an die Person
// =============================================

/** Was alle drei Mails an die Person tragen. */
function personenFelder(e: PersonenMailEingabe): UnterlagenMailPayload {
  const v = e.vorgang;
  const nachricht = e.nachricht?.trim() ?? "";
  // EP-16: Nach der Frist nennt die Mail, bis wann der Link noch traegt —
  // vorher nie, sonst laese die Person zwei Daten und haelt das spaetere fuer
  // die Frist.
  const verstrichen = tageZwischen(v.frist, e.heute) > 0;
  return {
    ...gemeinsameFelder(v),
    ...unterlagenlisteMailFelder(e.positionen, v.mitDetails),
    email: e.empfaenger,
    link: e.link,
    ...namensFelder(v),
    nachricht,
    nachricht_html: nachricht ? alsHtmlAbsaetze(nachricht) : "",
    frist_verstrichen: merker(verstrichen),
    link_gueltig_bis: verstrichen ? formatKalendertag(e.linkGueltigBis) : "",
  };
}

/**
 * unterlagen-angefordert: Anfordern, Ergaenzen, Frist aendern, Link erneut
 * senden und das Nachholen durch den Lauf. Genau EIN Anlass-Merker ist "ja" —
 * beim Nachholen nur `ist_nachgeholt`, der urspruengliche Anlass nicht.
 */
export function aufforderungMailFelder(e: AufforderungMailEingabe): UnterlagenMailPayload {
  const nachgeholt = Boolean(e.nachgeholt);
  const anlass = (wert: UnterlagenAufforderungAnlass) => merker(!nachgeholt && e.anlass === wert);
  return {
    ...personenFelder(e),
    ist_erstmalig: anlass("ANFORDERUNG"),
    ist_ergaenzung: anlass("ERGAENZUNG"),
    ist_erneut: anlass("ERNEUT"),
    ist_fristaenderung: anlass("FRISTAENDERUNG"),
    ist_nachgeholt: merker(nachgeholt),
  };
}

/** unterlagen-erinnerung: der Lauf, 7 Tage vor der Frist und am Fristtag. */
export function erinnerungMailFelder(e: ErinnerungMailEingabe): UnterlagenMailPayload {
  return {
    ...personenFelder(e),
    ist_vorab: merker(e.stufe === "VORAB"),
    ist_fristtag: merker(e.stufe === "FRISTTAG"),
    entwurf_vorhanden: merker(e.entwurfVorhanden),
  };
}

/**
 * unterlage-zurueckgewiesen: genau eine Mail je Zurueckweisung.
 *
 * Name und Begruendung nur bei einer nicht sensiblen Position und mit
 * Details. Sonst bleiben `unterlage`, `begruendung` und `begruendung_html`
 * leer — beides steht dann nur auf der Upload-Seite (E-2).
 */
export function zurueckweisungMailFelder(e: ZurueckweisungMailEingabe): UnterlagenMailPayload {
  const zeigen = e.vorgang.mitDetails && !e.position.sensibel;
  const begruendung = zeigen ? e.begruendung.trim() : "";
  return {
    ...personenFelder(e),
    unterlage: zeigen ? e.position.bezeichnung.trim() : "",
    begruendung,
    begruendung_html: begruendung ? alsHtmlAbsaetze(begruendung) : "",
    einreichung_nr: e.position.einreichungen ?? 1,
    ist_nachgeholt: merker(Boolean(e.nachgeholt)),
  };
}

// =============================================
// Mails an HR
// =============================================

/**
 * An und Cc der HR-Mails.
 *
 *   - An ist die anfordernde Person, solange ihr Konto aktiv ist und eine
 *     Adresse hat — auch wenn eine andere HR-Kraft ergaenzt hat.
 *   - Ist es inaktiv oder geloescht, geht die Mail an das HR-Postfach.
 *   - Cc ist das HR-Postfach; stimmt es mit An ueberein, wird es "": Der
 *     Mailer entdoppelt nur innerhalb eines Feldes.
 *   - Sind beide leer, meldet der Mailer SKIPPED („Kein Empfaenger …“).
 */
export function hrEmpfaengerFelder(
  anfordernd: HrMailEingabe["anfordernd"],
  hrPostfach: string | null,
): { anfordernde_email: string; hr_postfach: string } {
  const postfach = hrPostfach?.trim() ?? "";
  const eigene = anfordernd?.aktiv ? (anfordernd.email?.trim() ?? "") : "";
  const an = eigene || postfach;
  return {
    anfordernde_email: an,
    hr_postfach: postfach && postfach.toLowerCase() !== an.toLowerCase() ? postfach : "",
  };
}

/**
 * Was beide HR-Mails tragen. NIE darin: `email` (und die anderen Felder, aus
 * denen extractVariables {{email}} macht), der Link der Person, die Namen von
 * Unterlagen. Die Zaehler genuegen, um zu handeln; welche Unterlagen es sind,
 * zeigt das Portal.
 */
function hrFelder(e: HrMailEingabe): UnterlagenMailPayload {
  const aktiv = e.positionen.filter((p) => p.status !== "ENTFAELLT");
  return {
    ...gemeinsameFelder(e.vorgang),
    anzahl_unterlagen: aktiv.length,
    ...hrEmpfaengerFelder(e.anfordernd, e.hrPostfach),
    angefordert_von: e.anfordernd?.name?.trim() ?? "",
    angefordert_am: tagAusZeitpunkt(e.angefordertAm),
    mitarbeiter_name: namensFelder(e.vorgang).mitarbeiter_name,
    portalLink: e.portalLink,
    anzahl_zu_pruefen: aktiv.filter((p) => p.status === "EINGEREICHT").length,
    anzahl_angenommen: aktiv.filter((p) => p.status === "ANGENOMMEN").length,
    anzahl_offen: aktiv.filter(wartetAufPerson).length,
  };
}

/**
 * unterlagen-vollstaendig: nichts wartet mehr auf die Person, mindestens eine
 * Unterlage ist zu pruefen. `erneut_eingereicht` ist "ja", sobald eine der zu
 * pruefenden Unterlagen nach einer Zurueckweisung erneut kam.
 */
export function vollstaendigMailFelder(e: VollstaendigMailEingabe): UnterlagenMailPayload {
  return {
    ...hrFelder(e),
    uebermittelt_am: tagAusZeitpunkt(e.uebermitteltAm),
    erneut_eingereicht: merker(
      e.positionen.some((p) => p.status === "EINGEREICHT" && (p.einreichungen ?? 1) > 1),
    ),
  };
}

/** unterlagen-frist-verstrichen: der Lauf, einmal je Fristwert. */
export function fristVerstrichenMailFelder(e: FristVerstrichenMailEingabe): UnterlagenMailPayload {
  return {
    ...hrFelder(e),
    link_gueltig_bis: formatKalendertag(e.linkGueltigBis),
    nie_zugestellt: merker(e.nieZugestellt),
  };
}
