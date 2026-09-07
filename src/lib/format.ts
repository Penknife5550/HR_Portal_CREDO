/**
 * Format-Helper für das CREDO HR-Portal
 *
 * Zentrale Stelle für wiederkehrende String-Formatierungen, die bisher
 * inline an mehreren Stellen gebaut wurden.
 */

/**
 * Baut den Anzeigenamen eines Mitarbeiters/einer Mitarbeiterin aus Vor- und Nachname.
 * Wird in Webhook-Payloads, Mail-Subjects und Audit-Logs konsistent verwendet.
 */
export function formatEmployeeName(person: {
  employeeFirstName: string;
  employeeLastName: string;
}): string {
  return `${person.employeeFirstName} ${person.employeeLastName}`.trim();
}

/**
 * Dateigroesse als B / KB / MB — deutsch lokalisiert.
 *
 * Diese Funktion ist die gemeinsame Heimat fuer acht ueber die Oberflaeche
 * verstreute Kopien, die in zwei Fassungen existierten: `formatBytes` rundete
 * KB auf ganze Zahlen, `formatFileSize` auf eine Nachkommastelle. Beide waren
 * ausserdem englisch formatiert ("1.5 MB"). Statt eine der beiden Fassungen zum
 * Sieger zu erklaeren, werden hier beide korrigiert:
 *
 * - Unter 1024 Bytes die rohe Zahl ("512 B") — kleiner geht es nicht.
 * - Im KB-Bereich ganze Zahlen ("768 KB"). Eine Nachkommastelle unterhalb eines
 *   Megabyte ist Rauschen: ob eine Datei 512,3 oder 512,4 KB gross ist, aendert
 *   an keiner Entscheidung im Portal etwas.
 * - Ab einem Megabyte eine Nachkommastelle mit KOMMA ("1,5 MB"). Hier traegt die
 *   Stelle Information (1,2 MB gegen 14,8 MB an der 15-MB-Paketgrenze), und in
 *   einer deutschen Oberflaeche trennt der Punkt Tausender — "1.5 MB" liest sich
 *   dort als "eintausendfuenfhundert".
 *
 * WARUM `toFixed().replace()` und nicht `toLocaleString("de-DE")`:
 * Erstens haengt `toLocaleString` davon ab, welche ICU-Daten die Laufzeit
 * mitbringt; eine Node-Variante ohne vollstaendige Daten faellt still auf en-US
 * zurueck und liefert wieder "1.5 MB" — eine Regression, die niemand bemerkt,
 * weil nichts fehlschlaegt. Zweitens setzt de-DE ab vier Stellen den
 * Tausenderpunkt, und genau der waere hier fatal: `formatBytes(1024 * 1024 - 1)`
 * wuerde zu "1.024 KB" und damit ausgerechnet zu der Zeichenfolge, die wir mit
 * dem Komma vermeiden wollen. Der bewusste Austausch des einen Trennzeichens
 * ist deterministisch und tut genau das, was er soll.
 *
 * `null`/`undefined` liefern den Gedankenstrich, 0 dagegen "0 B": eine leere
 * Datei ist ein Befund (kaputter Upload) und keine fehlende Angabe. Die
 * bisherige BEM-Fassung fing 0 ueber `if (!bytes)` mit ab und zeigte dort den
 * Gedankenstrich — das war ihr einziger Verhaltensunterschied und wird hier
 * bewusst aufgegeben.
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
