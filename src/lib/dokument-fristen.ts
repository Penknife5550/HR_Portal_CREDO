/**
 * Fristen-Ampel fuer befristete Nachweise (Aufenthaltstitel, Arbeitserlaubnis).
 *
 * ## Was dieses Modul ist
 *
 * Eine reine Rechnung ohne Datenbank, nach dem Vorbild von
 * `src/lib/contract-end-fristen.ts`: Die Stufe wird LIVE aus `Document.gueltigBis`
 * abgeleitet und NIRGENDS gespeichert. So kann sie nicht veralten — und Anzeige,
 * Erinnerungs-Cron und Bericht koennen gar nicht auseinanderlaufen, weil sie
 * dieselbe Funktion rufen.
 *
 * ## Warum Tage und nicht Monate
 *
 * Die Vertragsende-Ampel rechnet in Monaten, weil ein Vertragsende Monate im
 * Voraus geplant wird. Eine Verlaengerung bei der Auslaenderbehoerde wird
 * dagegen in Wochen gedacht: Termin, Unterlagen, Bearbeitung. Deshalb hier
 * Kalendertage — 90 / 42 / 14 (Entscheidung 07.09.2026), mit abnehmenden
 * Abstaenden, je naeher der Ablauf rueckt.
 *
 * ## Warum die Datumsarithmetik aus minijob-fristen.ts kommt
 *
 * Es gibt im Projekt bereits drei Fristenrechnungen (contract-end-fristen.ts in
 * Monaten auf `Date`, minijob-fristen.ts in Kalendertagen auf Zeichenketten und
 * die Amtsarzt-Logik im civil-service-Cron). Eine vierte EIGENE waere die
 * vierte Gelegenheit fuer denselben Zeitzonenfehler. Dieses Modul rechnet
 * deshalb nicht selbst, sondern nutzt `tageZwischen()` und `heuteInBerlin()` —
 * die einzige Umsetzung im Haus, in der der Fehler konstruktiv unmoeglich ist,
 * weil sie mit `YYYY-MM-DD` und ohne `Date` arbeitet.
 *
 * ## Die Zeitzonenfalle, konkret
 *
 * `gueltigBis` ist eine echte `date`-Spalte (`@db.Date`). Prisma liefert sie als
 * `Date` auf **Mitternacht UTC**. Wer daraus mit `getFullYear()/getMonth()/
 * getDate()` einen Tag baut, liest die ORTSZEIT des laufenden Prozesses —
 * westlich von Greenwich ist das der Vortag. Ein Titel, der bis zum 01.03. gilt,
 * waere dort seit dem 28.02. abgelaufen. Deshalb `ablaufKalendertag()` mit
 * UTC-Gettern, und deshalb `kalendertagAlsDatum()` fuer den Rueckweg: Wer beim
 * Speichern `new Date(jahr, monat, tag)` baut, erzeugt denselben Fehler
 * spiegelverkehrt.
 *
 * Der HEUTIGE Tag kommt umgekehrt aus `heuteInBerlin()` und nicht aus
 * `toISOString()`: Der Container laeuft in UTC, und zwischen Mitternacht und
 * 2 Uhr morgens waere der UTC-Tag der Vortag.
 */
import type { DocumentType } from "@prisma/client";
import {
  formatiere,
  heuteInBerlin,
  istKalendertag,
  tageZwischen,
  type Kalendertag,
} from "@/lib/minijob-fristen";

/**
 * Die Stufen der Ampel.
 *
 * `AUSSERHALB` heisst "Frist bekannt, aber noch weit weg" (wie bei der
 * Vertragsende-Ampel). "Gar keine Frist erfasst" ist etwas anderes und wird
 * ueberall als `null` gefuehrt — ein Dokument ohne Datum ist NICHT abgelaufen.
 */
export type AblaufKategorie =
  | "ABGELAUFEN"
  | "KRITISCH"
  | "WARNUNG"
  | "BEOBACHTEN"
  | "AUSSERHALB";

/**
 * Die Schwellen in Kalendertagen, absteigend gelesen: bis 14 Tage KRITISCH,
 * bis 42 WARNUNG, bis 90 BEOBACHTEN, darueber AUSSERHALB.
 *
 * Bewusst global und nicht je Mandant konfigurierbar — genau wie bei der
 * Vertragsende-Ampel. Eine Mandanten-Konfiguration braeuchte eine eigene
 * Oberflaeche und waere die erste Stelle, an der zwei Mandanten dieselbe
 * gesetzliche Frist verschieden sehen.
 */
export const ABLAUF_SCHWELLEN_TAGE = {
  KRITISCH: 14,
  WARNUNG: 42,
  BEOBACHTEN: 90,
} as const;

/**
 * Dokumenttypen, die ueberhaupt eine Gueltigkeitsfrist tragen.
 *
 * Eine Liste und keine Eigenschaft am Typ: Der Erinnerungs-Cron, die
 * Upload-Pruefung ("Datum nur bei diesen beiden verlangen") und die Anzeige
 * muessen sich einig sein, welche Papiere ablaufen. PKV_NACHWEIS steht
 * ABSICHTLICH nicht hier — eine private Krankenversicherung laeuft nicht an
 * einem Stichtag ab, sie besteht oder besteht nicht.
 */
export const FRISTPFLICHTIGE_DOKUMENTTYPEN: readonly DocumentType[] = [
  "AUFENTHALTSTITEL",
  "ARBEITSERLAUBNIS",
] as DocumentType[];

/** Traegt dieser Dokumenttyp eine Gueltigkeitsfrist? */
export function istFristpflichtig(typ: string | null | undefined): boolean {
  if (!typ) return false;
  return (FRISTPFLICHTIGE_DOKUMENTTYPEN as readonly string[]).includes(typ);
}

/**
 * Der Kalendertag eines gespeicherten Ablaufdatums — die Systemgrenze dieses
 * Moduls. Alles, was aus der Datenbank oder ueber JSON hereinkommt, muss hier
 * hindurch.
 *
 * Akzeptiert: `Date` (aus Prisma, Mitternacht UTC), `"YYYY-MM-DD"` und einen
 * ISO-Zeitstempel (`JSON.stringify` einer solchen Spalte) — bei letzterem
 * zaehlt der UTC-Tag, was fuer eine `date`-Spalte genau richtig ist.
 *
 * Unlesbares gibt `null` zurueck und wirft nicht: Ein kaputter Wert in einem
 * einzelnen Dokument darf weder die Dokumentenliste noch den naechtlichen Cron
 * anhalten. Er fuehrt dazu, dass die Ampel fuer dieses Dokument schweigt — das
 * faellt in der Oberflaeche auf ("Frist fehlt"), ein Absturz waere teurer.
 */
export function ablaufKalendertag(
  gueltigBis: Date | string | null | undefined
): Kalendertag | null {
  if (gueltigBis === null || gueltigBis === undefined) return null;

  if (gueltigBis instanceof Date) {
    if (Number.isNaN(gueltigBis.getTime())) return null;
    // UTC-Getter, NICHT getFullYear()/getMonth()/getDate(): siehe Kopfkommentar.
    const jahr = String(gueltigBis.getUTCFullYear()).padStart(4, "0");
    const monat = String(gueltigBis.getUTCMonth() + 1).padStart(2, "0");
    const tag = String(gueltigBis.getUTCDate()).padStart(2, "0");
    const kandidat = `${jahr}-${monat}-${tag}`;
    return istKalendertag(kandidat) ? kandidat : null;
  }

  if (typeof gueltigBis !== "string") return null;
  const kandidat = gueltigBis.slice(0, 10);
  return istKalendertag(kandidat) ? kandidat : null;
}

/**
 * Der Rueckweg: aus einem Kalendertag den Wert fuer die `@db.Date`-Spalte.
 *
 * `new Date("2027-03-01T00:00:00.000Z")` und ausdruecklich NICHT
 * `new Date(2027, 2, 1)` — letzteres steht auf Mitternacht ORTSZEIT und landet
 * oestlich von Greenwich als 28.02. in der Spalte. Postgres schneidet bei einer
 * `date`-Spalte die Uhrzeit ab, der verlorene Tag kaeme nie zurueck.
 */
export function kalendertagAlsDatum(tag: Kalendertag): Date {
  if (!istKalendertag(tag)) throw new Error(`Kein gültiges Datum: ${tag}`);
  return new Date(`${tag}T00:00:00.000Z`);
}

/**
 * Verbleibende Kalendertage bis zum Ablauf; negativ, wenn er vorbei ist.
 *
 * `0` heisst: Der Nachweis laeuft HEUTE ab und gilt heute noch. Erst ab `-1`
 * ist er abgelaufen. Der Unterschied ist keine Feinheit — am Ablauftag darf
 * gearbeitet werden, am Tag danach nicht.
 *
 * `null` heisst: kein Datum erfasst. Nicht "abgelaufen", nicht "0".
 */
export function tageBisAblauf(
  gueltigBis: Date | string | null | undefined,
  jetzt: Date = new Date()
): number | null {
  const ablauf = ablaufKalendertag(gueltigBis);
  if (!ablauf) return null;
  return tageZwischen(heuteInBerlin(jetzt), ablauf);
}

/**
 * Die Ampelstufe zu einem Ablaufdatum, oder `null`, wenn keines erfasst ist.
 *
 * Ohne Datum gibt es KEINE Stufe. Ein `"ABGELAUFEN"` als Ruecklinie waere
 * bequem (die Oberflaeche braeuchte keinen Sonderfall), wuerde aber jedes
 * Dokument ohne Frist zu einem Alarm machen — und den echten Alarm im
 * Rauschen begraben.
 */
export function getAblaufKategorie(
  gueltigBis: Date | string | null | undefined,
  jetzt: Date = new Date()
): AblaufKategorie | null {
  const tage = tageBisAblauf(gueltigBis, jetzt);
  if (tage === null) return null;
  if (tage < 0) return "ABGELAUFEN";
  if (tage <= ABLAUF_SCHWELLEN_TAGE.KRITISCH) return "KRITISCH";
  if (tage <= ABLAUF_SCHWELLEN_TAGE.WARNUNG) return "WARNUNG";
  if (tage <= ABLAUF_SCHWELLEN_TAGE.BEOBACHTEN) return "BEOBACHTEN";
  return "AUSSERHALB";
}

/** Ist die Frist ueberschritten? Ohne Datum: nein. */
export function istAbgelaufen(
  gueltigBis: Date | string | null | undefined,
  jetzt: Date = new Date()
): boolean {
  return getAblaufKategorie(gueltigBis, jetzt) === "ABGELAUFEN";
}

/** UI-Metadaten je Stufe (CREDO-CI: rot / gelb / blau / grau). */
export const ABLAUF_KATEGORIE_META: Record<
  AblaufKategorie,
  { label: string; color: string; bg: string }
> = {
  // Dunkler als KRITISCH, damit "abgelaufen" und "laeuft bald ab" auf einer
  // Karte auseinanderzuhalten sind — bei zwei gleich roten Abzeichen sieht
  // niemand mehr, welches das echte Problem ist.
  ABGELAUFEN: { label: "Abgelaufen", color: "#7a0c12", bg: "#f7c9c9" },
  KRITISCH: { label: "Kritisch", color: "#b3121a", bg: "#fde3e3" },
  WARNUNG: { label: "Warnung", color: "#8a6d00", bg: "#fff3c9" },
  BEOBACHTEN: { label: "Beobachten", color: "#0a7ca6", bg: "#e0f3fb" },
  AUSSERHALB: { label: "Gültig", color: "#777777", bg: "#ececec" },
};

/**
 * Wie oft je Stufe erinnert wird, in Tagen — abnehmende Abstaende, je naeher
 * der Ablauf rueckt (Entscheidung 07.09.2026).
 *
 * `null` bei AUSSERHALB: Drei Monate vor Ablauf gibt es nichts zu tun; eine
 * Mail dazu wuerde nur lehren, diese Mails zu ignorieren.
 *
 * Der Cron muss ZUSAETZLICH bei jedem STUFENWECHSEL erinnern, sonst gilt nach
 * dem Sprung von BEOBACHTEN auf KRITISCH noch bis zu 30 Tage lang das alte,
 * traege Intervall — genau in der Zeit, in der es eilig wird. Dafuer steht
 * `Document.ablaufErinnertStufe` neben `ablaufErinnertAm`.
 */
export const ABLAUF_ERINNERUNG_INTERVALL_TAGE: Record<AblaufKategorie, number | null> = {
  ABGELAUFEN: 3,
  KRITISCH: 3,
  WARNUNG: 14,
  BEOBACHTEN: 30,
  AUSSERHALB: null,
};

export interface AblaufAmpel {
  /** `null`, wenn kein Ablaufdatum erfasst ist. */
  kategorie: AblaufKategorie | null;
  /** Verbleibende Tage; negativ nach Ablauf, `null` ohne Datum. */
  tage: number | null;
  /** Fertiger deutscher Satz fuer Abzeichen und Warnbalken. */
  text: string;
}

/**
 * Stufe, Tage und fertiger Text in einem Aufruf — damit jede Oberflaeche
 * denselben Wortlaut zeigt. Vorbild: `fristampel()` in minijob-fristen.ts.
 */
export function ablaufAmpel(
  gueltigBis: Date | string | null | undefined,
  jetzt: Date = new Date()
): AblaufAmpel {
  const ablauf = ablaufKalendertag(gueltigBis);
  if (!ablauf) {
    return { kategorie: null, tage: null, text: "Keine Frist erfasst" };
  }

  const tage = tageZwischen(heuteInBerlin(jetzt), ablauf);
  const kategorie = getAblaufKategorie(gueltigBis, jetzt);
  const datum = formatiere(ablauf);

  if (tage < 0) {
    const seit = Math.abs(tage);
    return {
      kategorie,
      tage,
      text: `Abgelaufen seit ${seit} ${seit === 1 ? "Tag" : "Tagen"} (${datum})`,
    };
  }
  if (tage === 0) {
    // Heute noch gueltig — der Wortlaut muss das hergeben, sonst schickt
    // jemand eine Person nach Hause, die arbeiten darf.
    return { kategorie, tage, text: `Läuft heute ab (${datum})` };
  }
  return {
    kategorie,
    tage,
    text: `Läuft in ${tage} ${tage === 1 ? "Tag" : "Tagen"} ab (${datum})`,
  };
}

/**
 * Der massgebliche Befund je NACHWEISART (nicht je Dokument).
 *
 * Warum gruppiert: `Document` kennt keine Eindeutigkeit je Typ, und ein
 * nachgereichter Nachweis ERSETZT den alten nicht — wer seinen Aufenthaltstitel
 * verlaengert und den neuen hochlaedt, hat danach zwei Aufenthaltstitel im
 * Vorgang. Ein Warnbalken ueber alle Dokumente schriee dann fuer immer
 * "abgelaufen", obwohl ein gueltiges Papier vorliegt.
 *
 * Massgeblich ist deshalb das Dokument mit dem SPAETESTEN Ablauf — dieselbe
 * Regel, nach der der Erinnerungs-Cron seine Kandidaten auswaehlt
 * (`src/app/api/cron/dokument-ablauf/route.ts`). Die einzelne Dokumentenzeile
 * zeigt weiterhin ihren eigenen Zustand: Dass das alte Papier abgelaufen ist,
 * stimmt ja.
 *
 * Liegt hier und nicht in der Detailseite, weil die Regel eine Rechnung ist und
 * keine Darstellung — und weil sie sich nur hier ohne gerenderte Seite pruefen
 * laesst.
 *
 * **Unbefristet (Paket 4, Z1).** Liegt fuer eine Art ein Dokument mit
 * `unbefristet = true` vor (etwa die Niederlassungserlaubnis nach einem
 * abgelaufenen Titel), ist die Art erledigt: Die Lage heisst
 * `{ typ, ampel: null, unbefristet: true }` und verdraengt JEDES datierte
 * Dokument dieser Art, auch ein abgelaufenes. Ohne das Kennzeichen bliebe der
 * alte, befristete Titel massgeblich — ein Dokument ohne Datum verdraengt ja
 * nie eines mit Datum —, und Warnbalken wie Erinnerungen liefen bis zu 180 Tage
 * weiter. Ohne Kennzeichen ist alles wie bisher; die Lage traegt das Feld dann
 * gar nicht.
 */
export interface NachweisLage {
  typ: string;
  /** `null` = fuer diese Art ist kein Ablaufdatum erfasst ODER sie ist unbefristet. */
  ampel: AblaufAmpel | null;
  /** Nur bei einem ausdruecklich unbefristeten Dokument dieser Art gesetzt. */
  unbefristet?: true;
}

export function nachweisLagen(
  dokumente: readonly {
    type: string;
    gueltigBis: Date | string | null;
    unbefristet?: boolean | null;
  }[],
  jetzt: Date = new Date()
): NachweisLage[] {
  const proTyp = new Map<string, AblaufAmpel | null>();
  const unbefristet = new Set<string>();

  for (const doc of dokumente) {
    if (!istFristpflichtig(doc.type)) continue;
    if (doc.unbefristet === true) {
      unbefristet.add(doc.type);
      // Nur, um die Reihenfolge der Arten zu halten — das Ergebnis setzt die
      // Lage unten ohnehin auf „unbefristet".
      if (!proTyp.has(doc.type)) proTyp.set(doc.type, null);
      continue;
    }
    const ampel = ablaufAmpel(doc.gueltigBis, jetzt);

    if (!proTyp.has(doc.type)) {
      proTyp.set(doc.type, ampel.kategorie ? ampel : null);
      continue;
    }
    // Ein Dokument ohne Datum verdraengt nie eines mit Datum: Es beweist
    // nichts, kann aber auch nichts widerlegen.
    if (!ampel.kategorie) continue;
    const bisher = proTyp.get(doc.type) ?? null;
    if (!bisher || (bisher.tage ?? 0) < (ampel.tage ?? 0)) {
      proTyp.set(doc.type, ampel);
    }
  }

  return Array.from(proTyp, ([typ, ampel]): NachweisLage =>
    unbefristet.has(typ) ? { typ, ampel: null, unbefristet: true } : { typ, ampel }
  );
}

/**
 * Die Lagen, die einen VORGANGSWEITEN Warnbalken rechtfertigen: abgelaufen
 * oder kritisch (14 Tage).
 *
 * Ausdruecklich NICHT dabei: "kein Ablaufdatum erfasst". Bei der
 * Niederlassungserlaubnis ist ein Aufenthaltstitel ohne Ablaufdatum der
 * Regelfall und kein Versaeumnis (Entscheidung 07.09.2026: ein Datum wird
 * deshalb beim Hochladen nicht erzwungen). Stuende dieser Fall im Balken, truege
 * der Vorgang dieser Personen auf JEDEM Reiter dauerhaft einen gelben Kasten,
 * den niemand abstellen kann. Genau davor warnt der Kommentar an
 * `nachweisLagen`: Ein Balken, den niemand abstellen kann, wird nach zwei Wochen
 * ignoriert — und dann auch der echte, hier der bussgeldbewehrte abgelaufene
 * Titel. Ein ausdruecklich unbefristetes Dokument (Z1) steht ebenfalls nie im
 * Balken: Seine Lage traegt `ampel: null`.
 *
 * Verloren geht die Auskunft dadurch nicht: Die fehlende Frist steht weiterhin
 * an der Dokumentenzeile selbst ("Frist fehlt"), also an der Stelle, an der man
 * sie auch nachtragen kann.
 *
 * BEOBACHTEN (90 Tage) und WARNUNG (42) bleiben ebenfalls draussen — ein Balken,
 * der drei Monate lang steht, ist Tapete.
 */
export function dringendeNachweisLagen(
  dokumente: readonly {
    type: string;
    gueltigBis: Date | string | null;
    unbefristet?: boolean | null;
  }[],
  jetzt: Date = new Date()
): NachweisLage[] {
  return nachweisLagen(dokumente, jetzt).filter(
    (l) => l.ampel?.kategorie === "ABGELAUFEN" || l.ampel?.kategorie === "KRITISCH"
  );
}

// =============================================
// Pruefung eines eingegebenen Ablaufdatums
// =============================================

/**
 * Wie weit darf ein Ablaufdatum in der Zukunft liegen?
 *
 * Kein Aufenthaltstitel wird auf 20 Jahre befristet — ein unbefristeter (die
 * Niederlassungserlaubnis) traegt gar kein Ablaufdatum. Was darueber liegt, ist
 * ein Tippfehler: 2206 statt 2026, oder 20226 in einem Feld ohne Maske. Der
 * faellt niemandem auf, weil das Dokument danach vollstaendig AUSSIEHT — nur
 * die Ampel schweigt fuer immer. Ein Tippfehler in die andere Richtung faellt
 * dagegen sofort auf, weil das Dokument dann als abgelaufen angezeigt wird.
 */
export const MAX_GUELTIG_BIS_TAGE = 20 * 366;

export type FristPruefung =
  | { ok: true; gueltigBis: Date | null }
  | { ok: false; fehler: string };

/**
 * Prueft ein eingegebenes Ablaufdatum — die EINE Regel fuer alle Schreibwege.
 *
 * Drei Wege schreiben heute `Document.gueltigBis`: der Upload und das
 * Nachtragen ueber den Magic Link (`/api/fragebogen/[token]/documents`) und die
 * Korrektur durch HR (`/api/onboarding/[id]/documents/[docId]`). Sie stand
 * urspruenglich nur in der ersten Route; die zweite haette sie nachbauen
 * muessen, und zwei Fassungen einer Datumsregel laufen frueher oder spaeter
 * auseinander — dann nimmt der eine Weg an, was der andere abweist.
 *
 * Beim Upload gilt zusaetzlich eine Reihenfolge: Diese Pruefung laeuft, BEVOR
 * die Datei auf die Platte geht. Wer erst schreibt und dann prueft, laesst bei
 * jedem 400 eine verwaiste Datei im Upload-Ordner zurueck, auf die keine
 * Datenbankzeile mehr zeigt.
 *
 * Drei Antworten sind moeglich:
 *
 * - **Kein Datum** (`""`): angenommen, `gueltigBis` bleibt `null`. Der Upload
 *   darf daran nicht scheitern — der Scan ist das Wichtige, und ein Formular,
 *   das die Datei wegen eines fehlenden Nebenfeldes zurueckweist, bekommt
 *   irgendein Datum eingetippt. Sichtbar bleibt es trotzdem: Die Maske
 *   kennzeichnet solche Nachweise als „Frist fehlt", und die Ampel schweigt
 *   (ohne Datum gibt es KEINE Stufe, siehe `getAblaufKategorie`).
 * - **Datum an einem Typ, der keine Frist traegt**: Fehler. Es stillschweigend
 *   zu verwerfen waere schlimmer — jemand hat es getippt und saehe es nie
 *   wieder.
 * - **Unlesbares oder unmoegliches Datum**: Fehler.
 *
 * **Ein Datum in der VERGANGENHEIT wird angenommen** (bewusst). Ein
 * abgelaufener Titel ist eine Tatsache, die HR sehen muss; die Ampel zeigt sie
 * dann als ABGELAUFEN an. Wer die Wahrheit mit einem Fehler zurueckweist,
 * erzieht zum Erfinden eines passenden Datums — und dann steht in der Akte eine
 * Angabe mit Rechtsfolge, die niemand mehr anzweifelt.
 */
export function pruefeGueltigBis(
  roh: unknown,
  documentType: string,
  jetzt: Date = new Date()
): FristPruefung {
  // `unknown` und nicht `string`: Aus `formData.get()` kann auch eine Datei
  // kommen, aus `request.json()` jede beliebige Form. Ein `.trim()` darauf
  // waere ein TypeError — und der faende sich am Ende als 500 wieder, wo ein
  // klares "kein Datum" richtig ist.
  const wert = typeof roh === "string" ? roh.trim() : "";
  if (!wert) return { ok: true, gueltigBis: null };

  if (!istFristpflichtig(documentType)) {
    return {
      ok: false,
      fehler:
        "Ein Ablaufdatum wird nur beim Aufenthaltstitel und bei der " +
        "Arbeitserlaubnis erfasst.",
    };
  }

  // Nur "JJJJ-MM-TT" — genau das, was <input type="date"> liefert. Alles andere
  // wird NICHT geraten: `new Date("03.05.2027")` liest je nach Laufzeit den
  // 3. Mai oder den 5. Maerz, und hier entscheidet der Tag ueber eine Warnung
  // mit Rechtsfolge.
  if (!istKalendertag(wert)) {
    return {
      ok: false,
      fehler: "Bitte geben Sie das Ablaufdatum als Datum an (Tag, Monat, Jahr).",
    };
  }

  const tage = tageBisAblauf(wert, jetzt);
  if (tage !== null && tage > MAX_GUELTIG_BIS_TAGE) {
    return {
      ok: false,
      fehler:
        "Das Ablaufdatum liegt mehr als 20 Jahre in der Zukunft. Bitte " +
        "prüfen Sie die Jahreszahl.",
    };
  }

  return { ok: true, gueltigBis: kalendertagAlsDatum(wert) };
}
