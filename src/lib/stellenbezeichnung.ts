/**
 * Stellenbezeichnung — Obergrenze und Einzeilen-Umwandlung.
 *
 * Gilt fuer BEIDE Formulare, in denen eine Fuehrungskraft die Stelle angibt:
 * die Einstellungsmodalitaeten (Onboarding, /modalitaeten/[token]) und das
 * Vertragsdaten-Formular der Verlaengerung (/vertrag-formular/[token]).
 * Entscheidung vom 21.09.2026: ueberall derselbe Begriff, ein EINZEILIGES Feld,
 * hoechstens 200 Zeichen. Der Begriff selbst steht zentral in
 * `FELD_BEZEICHNUNGEN.stellenbeschreibung` (src/lib/formular-fehler.ts).
 *
 * Bewusst ohne Importe (weder zod noch prisma): Die Datei wird von beiden
 * Client-Seiten und von den Pruefschemata gelesen.
 */

/**
 * Hoechstlaenge der Stellenbezeichnung in Zeichen.
 *
 * Frueher 2000 — das Feld war ein dreizeiliges Textfeld, und der Kommentar
 * dazu rechnete damit, dass jemand eine ganze Stellenausschreibung
 * hineinkopiert. Eine Bezeichnung ist aber ein Titel; laengere Regelungen
 * gehoeren in die „Zusatzvereinbarungen". 200 Zeichen reichen auch fuer
 * lange Titel („Lehrkraft Sek. I/II fuer Mathematik und Physik mit
 * Koordinationsaufgaben …") mit reichlich Luft.
 *
 * Die Route der Modalitaeten (`src/app/api/modalitaeten/[token]/route.ts`)
 * traegt denselben Wert als Literal `.max(200)` — ihr Grenztest liest die Zahl
 * aus dem Quelltext (`supervisor-grenzen.test.ts`) und wird rot, sobald eine
 * Seite allein wandert.
 */
export const STELLENBEZEICHNUNG_MAX_LAENGE = 200;

/**
 * Macht aus einem (Bestands-)Wert einen einzeiligen Text: Jeder Zeilenumbruch
 * wird zu „, ".
 *
 * WARUM das Pflicht ist und nicht Kosmetik: Ein `<input type="text">` entfernt
 * Zeilenumbrueche STILL aus seinem Wert (Wertbereinigung nach HTML-Standard).
 * Ein Bestandstext „Lehrkraft\nMathematik" aus der Zeit des mehrzeiligen
 * Feldes stuende sonst als „LehrkraftMathematik" in der Maske — und ginge beim
 * naechsten Speichern genau so in den Arbeitsvertrag.
 *
 * Werte ohne Zeilenumbruch bleiben unveraendert (auch Leerraum am Rand) —
 * die Funktion soll nur das reparieren, was das Eingabefeld zerstoeren wuerde.
 * Leerzeilen und Leerraum um den Umbruch fallen weg, damit aus „A\n\nB " kein
 * „A, , B" wird. Kuerzen tut sie NICHT: Ein Bestandswert ueber der Grenze
 * bleibt sichtbar zu lang und wird von der Pruefung rot gemeldet — still
 * abgeschnittene Vertragsangaben waeren schlimmer.
 */
export function alsEinzeiligeStellenbezeichnung(wert: unknown): string {
  if (typeof wert !== "string") return "";
  if (!/[\r\n]/.test(wert)) return wert;
  return wert
    .split(/\r\n|\r|\n/)
    .map((zeile) => zeile.trim())
    .filter((zeile) => zeile !== "")
    .join(", ");
}
