/**
 * Kalendertage in deutscher Zeit — die neutrale Fassade fuer Fristen.
 *
 * ## Warum eine Fassade und keine dritte Rechnung
 *
 * Die Datumsarithmetik ohne Zeitzonenfehler gibt es im Haus schon zweimal:
 * `minijob-fristen.ts` rechnet mit `YYYY-MM-DD`-Zeichenketten und ohne `Date`
 * (dort ist der Fehler konstruktiv unmoeglich), `dokument-fristen.ts` bringt die
 * Systemgrenze zur `@db.Date`-Spalte mit. Beide Dateien tragen aber einen
 * fachlichen Namen — eine Nachforderung, die ihre Frist aus
 * „minijob-fristen" holt, laesst jeden Leser nach dem Minijob suchen. Diese
 * Datei gibt denselben Funktionen einen Ort ohne Fachbezug (Paket 4
 * „Unterlagen nachfordern", danach Paket 6).
 *
 * Sie rechnet deshalb NICHTS selbst nach, sondern reicht durch. Eine zweite
 * Umsetzung derselben Regeln liefe frueher oder spaeter auseinander, und dann
 * zeigt die Karte einen anderen Fristtag als die Mail. Neu ist nur die
 * Anzeige mit Wochentag (`formatKalendertagLang`), die es bisher nicht gab.
 *
 * ## Die zwei Regeln, die hier gelten
 *
 * - **Heute kommt aus `heuteInBerlin()`**, nie aus `toISOString()`. Der
 *   Container laeuft in UTC; zwischen Mitternacht und 1 bzw. 2 Uhr morgens
 *   waere der UTC-Tag der Vortag, und eine Frist liefe einen Tag zu frueh ab.
 * - **Gerechnet wird in Kalendertagen**, nie in Millisekunden. „Frist + 14"
 *   ist der vierzehnte Kalendertag danach — auch ueber die Zeitumstellung am
 *   25.10.2026 hinweg, an der ein Tag 25 Stunden hat.
 *
 * Rein und client-sicher: kein Prisma, kein `next/*`, kein `fs`.
 */
import {
  berlinerKalendertag,
  formatiere,
  heuteInBerlin,
  istKalendertag,
  tageSpaeter,
  tageZwischen,
  wochentagVon,
  type Kalendertag,
} from "@/lib/minijob-fristen";
import { ablaufKalendertag, kalendertagAlsDatum } from "@/lib/dokument-fristen";

export type { Kalendertag };

export {
  /** Der heutige Kalendertag in Europe/Berlin (`jetzt` fuer Tests und den Lauf). */
  heuteInBerlin,
  /**
   * Der Berliner Kalendertag zu einem beliebigen Zeitstempel (`DateTime` ohne
   * `@db.Date`, etwa `uebermitteltAm`). Dieselbe Funktion wie `heuteInBerlin`,
   * nur ohne den irrefuehrenden Namen.
   */
  berlinerKalendertag,
  /** Verschiebt um ganze Kalendertage (negativ = zurueck). */
  tageSpaeter,
  /** 0 = Sonntag, 1 = Montag, ... 6 = Samstag. Ohne `Date`, ohne Zeitzone. */
  wochentagVon,
  /** Ist der Wert ein echter Kalendertag `YYYY-MM-DD` (auch kein 31.02.)? */
  istKalendertag,
  /** Abstand in Kalendertagen, `b` minus `a`. */
  tageZwischen,
  /**
   * Der Kalendertag einer `@db.Date`-Spalte (Prisma liefert Mitternacht UTC)
   * oder eines `YYYY-MM-DD`/ISO-Werts aus JSON. Unlesbares ergibt `null`.
   * Der Name stammt aus `dokument-fristen.ts`; die Funktion taugt fuer jede
   * Datumsspalte, nicht nur fuer ein Ablaufdatum.
   */
  ablaufKalendertag,
  /** Der Rueckweg: ein Kalendertag als Wert fuer eine `@db.Date`-Spalte. */
  kalendertagAlsDatum,
};

/**
 * Anzeigeform `TT.MM.JJJJ` („25.09.2026"). Ein ungueltiger oder fehlender Wert
 * ergibt „—" — wie `formatiere` in `minijob-fristen.ts`, an die hier
 * durchgereicht wird.
 */
export function formatKalendertag(tag: Kalendertag | null | undefined): string {
  return formatiere(tag);
}

/**
 * Die Wochentage in der Reihenfolge von `wochentagVon` (0 = Sonntag).
 *
 * „Samstag" und nicht „Sonnabend": Das ist das Wort, das die Personen auf der
 * Upload-Seite und in der Mail lesen. `minijob-fristen.ts` sagt in seinen
 * Kommentaren Sonnabend, zeigt den Namen aber nirgends an.
 */
export const WOCHENTAGE = [
  "Sonntag",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
] as const;

/**
 * Anzeigeform mit Wochentag: „Freitag, 25.09.2026".
 *
 * **Ohne `Intl` und ohne `toLocaleDateString`.** Beide haengen an der
 * ICU-Ausstattung der Laufzeit: Ein Node ohne volle ICU-Daten (schlanke
 * Container-Images) liefert „Friday" oder gar den englischen Monat, und im
 * Browser entscheidet die Spracheinstellung der Person. Eine Frist, deren
 * Wochentag je nach Geraet anders heisst, ist eine Frist, an der jemand
 * zweifelt. Der Wochentag wird deshalb gerechnet (`wochentagVon`), nicht
 * nachgeschlagen — und nie abgeschrieben: Das Mockup nannte den 26.09.2026
 * einen Freitag, es ist ein Samstag.
 */
export function formatKalendertagLang(tag: Kalendertag | null | undefined): string {
  if (!tag || !istKalendertag(tag)) return "—";
  return `${WOCHENTAGE[wochentagVon(tag)]}, ${formatiere(tag)}`;
}
