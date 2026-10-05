/**
 * Prozess-Stand: das Datenmodell der Prozessleiste (UX-Umbau, Pilot Vertragsende)
 *
 * Rein und client-sicher: kein Prisma, kein `next/*`, keine Uhr. Ein Adapter je
 * Modul (`src/lib/prozess/<modul>.ts`) macht aus einem Vorgang einen
 * `ProzessStand`; die Prozessleiste zeichnet ihn, ohne das Modul zu kennen.
 *
 * Der Adapter liefert SCHLUESSEL von Handlungen (`aktion`), keine Knoepfe und
 * keine Handler: So bleibt er rein, und dieselbe Zeile kann spaeter Listen und
 * die Startseite fuettern. Ob eine Handlung als Knopf erscheint, entscheidet
 * die Seite (nur mit Bearbeitungsrecht).
 *
 * Bewusst nur die Zustaende, die das Pilotmodul braucht. „parallel",
 * „blockiert", „Schleife" und der Zeitachsen-Modus kommen mit dem Modul, das
 * sie braucht (docs/module/ux-ui/pilot-feinplan.md, Abschnitt 2).
 */

export type SchrittStatus = "erledigt" | "aktiv" | "kommend" | "uebersprungen";

export interface ProzessSchritt {
  key: string;
  /** Kurz, ein bis zwei Woerter: „Rückmeldung". */
  titel: string;
  status: SchrittStatus;
  /** Bei wem der Schritt liegt: „HR", „Führungskraft". */
  zustaendig?: string;
  /** Ergebnis oder Stand in einem Wort: „Übernahme", „abgelehnt", „MAV offen". */
  notiz?: string;
  /** ISO-Zeitpunkt; die Leiste formatiert ihn. */
  datum?: string;
  /** Verzweigung: der NICHT gewaehlte Weg, als Hinweis („sonst: Offboarding"). */
  sonst?: string;
  /** Ein Klick auf den Schritt oeffnet diesen Reiter. Ohne Angabe ist der Schritt kein Knopf. */
  reiter?: string;
}

export type JetztDranBei = "HR" | "FUEHRUNGSKRAFT";

/**
 * Anzeigename dessen, bei dem der naechste Schritt liegt. Die EINE Tabelle
 * dafuer: Die Prozessleiste liest sie heute, Listen und Startseite spaeter —
 * der Baustein selbst kennt keine Namen.
 */
export const BEI_NAME: Record<JetztDranBei, string> = {
  HR: "HR",
  FUEHRUNGSKRAFT: "Führungskraft",
};

export interface JetztDran<Aktion extends string = string> {
  /** Was als Naechstes geschieht, als ein Satz ohne Punkt. */
  satz: string;
  bei: JetztDranBei;
  /** Zusammenhang in einer Zeile: was schon geschehen ist, was danach kommt. */
  unterzeile?: string;
  /** Frist in einer Zeile: „Vertragsende 30.09.2026 · in 4 Tagen". */
  frist?: string;
  /** Wie dringend die Frist ist; ohne Angabe keine Hervorhebung. */
  dringlichkeit?: "critical" | "wait";
  /** Die eine Handlung. */
  aktion?: Aktion;
  /** Hoechstens eine zweite, nachrangige. */
  nebenAktion?: Aktion;
}

export interface ProzessStand<Aktion extends string = string> {
  modus: "schritte";
  schritte: ProzessSchritt[];
  /** `null`: nichts mehr zu tun (abgeschlossen, abgebrochen) oder Stand unbekannt. */
  jetztDran: JetztDran<Aktion> | null;
  ende?: "abgeschlossen" | "abgebrochen";
}

/**
 * Das Ende eines Ablaufs als Wort — die EINE Tabelle dafuer: Der Kasten der
 * Prozessleiste liest sie, `schrittKurzform` ebenfalls.
 */
export const ENDE_NAME: Record<NonNullable<ProzessStand["ende"]>, string> = {
  abgeschlossen: "Abgeschlossen",
  abgebrochen: "Abgebrochen",
};

/**
 * „Schritt 4 von 5 · Vertrag" — die Kurzform der Leiste fuer schmale
 * Bildschirme und spaeter fuer Listen. Ohne aktiven Schritt das Ende
 * („Abgeschlossen", „Abgebrochen") oder "".
 */
export function schrittKurzform(stand: ProzessStand): string {
  const index = stand.schritte.findIndex((s) => s.status === "aktiv");
  if (index >= 0) {
    return `Schritt ${index + 1} von ${stand.schritte.length} · ${stand.schritte[index].titel}`;
  }
  return stand.ende ? ENDE_NAME[stand.ende] : "";
}
