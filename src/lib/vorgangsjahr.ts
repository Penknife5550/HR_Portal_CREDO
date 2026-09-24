/**
 * Das Jahr einer Vorgangsnummer ({Jahr}-{Kuerzel}-{laufende Nummer}) — in
 * deutscher Zeit, nicht in der Zeit des Containers.
 *
 * ## Warum ueberhaupt
 *
 * Der Container laeuft in UTC. `new Date().getFullYear()` und
 * `new Date(jahr, 0, 1)` rechnen dort in UTC: Ein Vorgang, der am 1. Januar
 * zwischen 00:00 und 01:00 Uhr deutscher Zeit angelegt wird, bekaeme noch die
 * Nummer des ALTEN Jahres — und wuerde beim Zaehlen des neuen Jahres
 * mitgezaehlt, weil der Zaehlbereich eine Stunde zu spaet beginnt. Die
 * laufende Nummer des neuen Jahres startete dann bei 2 statt bei 1.
 *
 * ## Keine eigene Zeitzonenrechnung
 *
 * Welcher Kalendertag in Berlin gerade ist, weiss im Haus genau eine Funktion:
 * `berlinerKalendertag` (src/lib/minijob-fristen.ts, ueber `Intl`). Diese Datei
 * rechnet keine Verschiebung selbst aus, sondern fragt dort nach — auch fuer
 * den Rueckweg vom Kalendertag zum UTC-Zeitpunkt (`beginnDesBerlinerTages`).
 * So bleibt die Antwort richtig, falls sich die Sommerzeitregel einmal aendert.
 */
import { berlinerKalendertag, type Kalendertag } from "@/lib/minijob-fristen";

const MS_PRO_STUNDE = 3_600_000;

/**
 * Der UTC-Zeitpunkt, an dem in Berlin der Kalendertag `tag` beginnt
 * (00:00 Uhr Ortszeit).
 *
 * Berlin liegt eine (MEZ) oder zwei (MESZ) Stunden vor UTC; der Tag beginnt
 * also um 23:00 oder 22:00 Uhr UTC des Vortages. Welcher der beiden Kandidaten
 * es ist, entscheidet `berlinerKalendertag`: Der Anfang ist der Zeitpunkt, der
 * schon zu `tag` gehoert, waehrend die Millisekunde davor noch nicht dazu
 * gehoert.
 */
export function beginnDesBerlinerTages(tag: Kalendertag): Date {
  const utcMitternacht = Date.parse(`${tag}T00:00:00.000Z`);
  if (Number.isNaN(utcMitternacht)) {
    throw new Error(`Kein gültiges Datum: ${tag}`);
  }
  for (const stunden of [1, 2]) {
    const kandidat = new Date(utcMitternacht - stunden * MS_PRO_STUNDE);
    const davor = new Date(kandidat.getTime() - 1);
    if (berlinerKalendertag(kandidat) === tag && berlinerKalendertag(davor) !== tag) {
      return kandidat;
    }
  }
  // Nur erreichbar, wenn Europe/Berlin nicht mehr UTC+1/+2 waere.
  throw new Error(`Tagesbeginn in Berlin für ${tag} nicht bestimmbar`);
}

export interface Vorgangsjahr {
  /** Kalenderjahr in Berlin — die Jahreszahl der Vorgangsnummer. */
  jahr: number;
  /** 1. Januar 00:00 Uhr Berlin, als UTC-Zeitpunkt (einschliesslich). */
  von: Date;
  /** Naechster 1. Januar 00:00 Uhr Berlin, als UTC-Zeitpunkt (ausschliesslich). */
  bis: Date;
}

/**
 * Jahr und Zaehlbereich fuer die laufende Nummer: `createdAt >= von` und
 * `createdAt < bis`.
 *
 * Beispiel Silvester: 31.12.2026, 23:30 Uhr UTC ist in Berlin bereits der
 * 01.01.2027, 00:30 Uhr — Jahr 2027, Bereich ab 31.12.2026 23:00 UTC.
 */
export function vorgangsjahrInBerlin(jetzt: Date = new Date()): Vorgangsjahr {
  const jahr = Number(berlinerKalendertag(jetzt).slice(0, 4));
  const vierstellig = (j: number) => String(j).padStart(4, "0");
  return {
    jahr,
    von: beginnDesBerlinerTages(`${vierstellig(jahr)}-01-01`),
    bis: beginnDesBerlinerTages(`${vierstellig(jahr + 1)}-01-01`),
  };
}
