/**
 * Zeitplaner — wann ist ein Lauf faellig?
 *
 * Rein, ohne Uhr (jede Funktion bekommt `jetzt`), client-sicher. Gerechnet
 * wird in deutscher Zeit: Der Container laeuft in UTC, die Uhrzeit eines
 * Laufs meint aber „08:00 in Minden“ — im Sommer wie im Winter.
 *
 * Regeln:
 *  - Faellig ist ein aktiver Lauf, sobald die Uhrzeit heute erreicht ist und
 *    der Zeitplan fuer heute noch nicht erledigt ist (`tagErledigt < heute`).
 *    War der Container um 08:00 aus, laeuft der Lauf nach dem Start noch am
 *    selben Tag. Ausgefallene VORtage werden nicht einzeln nachgeholt — alle
 *    Laeufe arbeiten zustandsbasiert, der naechste holt Faelliges ohnehin nach.
 *  - Sommerzeit: Eine Uhrzeit, die es am Umstellungstag nicht gibt (02:30 im
 *    Maerz), gilt ab 03:00 als erreicht; eine doppelte (02:30 im Oktober)
 *    laeuft nur einmal, weil der Tag danach erledigt ist.
 *  - `nurWerktags`: Montag bis Freitag. Feiertage bleiben aussen vor.
 */

import { heuteInBerlin, tageSpaeter, wochentagVon, type Kalendertag } from "@/lib/kalendertag";

export interface ZeitplanStand {
  aktiv: boolean;
  uhrzeit: string;
  nurWerktags: boolean;
  /** Berliner Kalendertag, fuer den der Zeitplan erledigt ist. */
  tagErledigt: string | null;
}

export interface BerlinerZeit {
  tag: Kalendertag;
  /** Minuten seit Mitternacht (deutsche Zeit). */
  minuten: number;
  /** "HH:MM" */
  uhrzeit: string;
}

const UHRZEIT_MUSTER = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function uhrzeitGueltig(wert: unknown): wert is string {
  return typeof wert === "string" && UHRZEIT_MUSTER.test(wert);
}

/** "08:15" → 495. Ungueltige Werte → null. */
export function uhrzeitMinuten(wert: string): number | null {
  const m = UHRZEIT_MUSTER.exec(wert);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function berlinerZeit(jetzt: Date): BerlinerZeit {
  const teile = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(jetzt);
  const stunde = Number(teile.find((t) => t.type === "hour")?.value ?? "0");
  const minute = Number(teile.find((t) => t.type === "minute")?.value ?? "0");
  return {
    tag: heuteInBerlin(jetzt),
    minuten: stunde * 60 + minute,
    uhrzeit: `${String(stunde).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

/** Darf der Lauf an diesem Tag laufen? */
export function tagErlaubt(tag: Kalendertag, nurWerktags: boolean): boolean {
  if (!nurWerktags) return true;
  const w = wochentagVon(tag); // 0 = Sonntag … 6 = Samstag
  return w >= 1 && w <= 5;
}

/** Ist der Lauf jetzt (im Takt des Zeitplaners) zu starten? */
export function laufFaellig(stand: ZeitplanStand, jetzt: Date): boolean {
  if (!stand.aktiv) return false;
  const soll = uhrzeitMinuten(stand.uhrzeit);
  if (soll === null) return false;
  const zeit = berlinerZeit(jetzt);
  if (!tagErlaubt(zeit.tag, stand.nurWerktags)) return false;
  if (zeit.minuten < soll) return false;
  return stand.tagErledigt === null || stand.tagErledigt < zeit.tag;
}

/**
 * Wann laeuft der Lauf als Naechstes? `null`, wenn er aus ist. Ist er heute
 * faellig, aber noch nicht gelaufen, ist „heute“ die Antwort (der naechste Takt
 * startet ihn).
 */
export function naechsterLauf(stand: ZeitplanStand, jetzt: Date): { tag: Kalendertag; uhrzeit: string } | null {
  if (!stand.aktiv || uhrzeitMinuten(stand.uhrzeit) === null) return null;
  const heute = berlinerZeit(jetzt).tag;
  const heuteOffen = stand.tagErledigt === null || stand.tagErledigt < heute;
  let tag = heuteOffen ? heute : tageSpaeter(heute, 1);
  for (let i = 0; i < 8 && !tagErlaubt(tag, stand.nurWerktags); i++) tag = tageSpaeter(tag, 1);
  return { tag, uhrzeit: stand.uhrzeit };
}

/**
 * Beim Einschalten oder beim Verschieben der Uhrzeit: Liegt die (neue) Uhrzeit
 * heute schon zurueck, gilt der heutige Tag als erledigt — der erste Lauf kommt
 * dann morgen zur eingestellten Zeit, nicht ueberraschend eine Minute nach dem
 * Speichern. Wer ihn sofort will, nimmt „Jetzt ausführen“. Liegt sie noch vor
 * uns, gilt mindestens gestern als erledigt: Der Lauf kommt heute, und der
 * Waechter meldet fuer die Zeit davor keinen Ausfall. Ein heute schon
 * gelaufener Lauf laeuft heute nicht noch einmal.
 */
export function tagErledigtNachAenderung(
  neu: Pick<ZeitplanStand, "uhrzeit" | "tagErledigt">,
  jetzt: Date,
): string {
  const soll = uhrzeitMinuten(neu.uhrzeit);
  const zeit = berlinerZeit(jetzt);
  const mindestens = soll !== null && zeit.minuten >= soll ? zeit.tag : tageSpaeter(zeit.tag, -1);
  return neu.tagErledigt !== null && neu.tagErledigt > mindestens ? neu.tagErledigt : mindestens;
}

/**
 * Waechter: Ist ein Lauf ausgeblieben? Der letzte Termin, an dem er haette
 * laufen muessen (heute, falls die Uhrzeit plus Karenz vorbei ist, sonst der
 * letzte erlaubte Tag davor), ist nicht erledigt. Deckt den ganz stehenden
 * Zeitplaner ab (dann bewegt sich `tagErledigt` gar nicht mehr).
 */
export function laufAusgeblieben(stand: ZeitplanStand, jetzt: Date, karenzMinuten = 60): boolean {
  if (!stand.aktiv) return false;
  const soll = uhrzeitMinuten(stand.uhrzeit);
  if (soll === null) return false;
  const zeit = berlinerZeit(jetzt);
  let termin: Kalendertag = zeit.minuten >= soll + karenzMinuten ? zeit.tag : tageSpaeter(zeit.tag, -1);
  for (let i = 0; i < 8 && !tagErlaubt(termin, stand.nurWerktags); i++) termin = tageSpaeter(termin, -1);
  return stand.tagErledigt === null || stand.tagErledigt < termin;
}
