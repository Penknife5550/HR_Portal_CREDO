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
 * Kalenderdatum als TT.MM.JJJJ in deutscher Zeit — fuer Mailtexte und
 * Webhook-Felder, die ein Mensch liest.
 *
 * Nimmt, was die Aufrufer tatsaechlich liefern: ein Date aus Prisma, einen
 * ISO-Zeitstempel aus einem Payload ("2026-08-31T00:00:00.000Z"), ein reines
 * Kalenderdatum ("2026-08-31") — oder einen Wert, der SCHON deutsch
 * formatiert ist ("31.12.2026", so liefert ihn etwa `anzeigeDatum` im
 * Dokumentenpaket). Genau der letzte Fall war der Fehler, der diese Funktion
 * ausgeloest hat: Der Mailer schickte jeden Wert noch einmal durch
 * `new Date(...)`. Aus "31.12.2026" wurde "Invalid Date", und "01.08.2026"
 * liest der Parser amerikanisch als 8. Januar — ein Austrittsdatum mit
 * vertauschtem Tag und Monat, das niemand bemerkt, weil es plausibel aussieht.
 * Bereits deutsch formatierte Werte werden deshalb nur noch auf zwei Stellen
 * aufgefuellt und sonst durchgereicht.
 *
 * Warum Europe/Berlin und nicht die Serverzeit: Der Container laeuft in UTC.
 * Ein Zeitpunkt kurz nach Mitternacht deutscher Zeit ("2026-08-30T22:00Z")
 * ergaebe dort den Vortag. Die Tagesdaten der Vorgaenge liegen als
 * UTC-Mitternacht in der Datenbank — die faellt in Berlin auf denselben
 * Kalendertag, beide Faelle stimmen also.
 *
 * Warum `formatToParts` statt `toLocaleDateString("de-DE")`: dieselbe
 * Begruendung wie bei formatBytes unten. Eine Laufzeit ohne vollstaendige
 * ICU-Daten faellt still auf en-US zurueck und liefert "08/31/2026". Die
 * Einzelteile (Tag, Monat, Jahr) sind davon unabhaengig; zusammengesetzt wird
 * hier selbst.
 *
 * Unlesbares oder Leeres ergibt "" — der Aufrufer entscheidet, ob er dann
 * lieber den Rohwert zeigt (der Mailer tut das) oder einen Satz weglaesst.
 */
export function formatDatumDE(wert: Date | string | null | undefined): string {
  if (wert == null) return "";

  let zeitpunkt: Date;
  if (typeof wert === "string") {
    const text = wert.trim();
    if (text === "") return "";

    const deutsch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
    if (deutsch) {
      return `${deutsch[1].padStart(2, "0")}.${deutsch[2].padStart(2, "0")}.${deutsch[3]}`;
    }

    // Reines Kalenderdatum: ohne Umweg ueber eine Uhrzeit umstellen. Es gibt
    // keine Zeitzone, in die man es sinnvoll verschieben koennte.
    const kalender = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (kalender) return `${kalender[3]}.${kalender[2]}.${kalender[1]}`;

    zeitpunkt = new Date(text);
  } else {
    zeitpunkt = wert;
  }

  if (Number.isNaN(zeitpunkt.getTime())) return "";

  const teile = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(zeitpunkt);
  const teil = (typ: Intl.DateTimeFormatPartTypes) =>
    teile.find((t) => t.type === typ)?.value ?? "";
  return `${teil("day")}.${teil("month")}.${teil("year")}`;
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
