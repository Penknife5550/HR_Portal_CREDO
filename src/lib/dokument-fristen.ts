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
