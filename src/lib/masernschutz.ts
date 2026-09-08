/**
 * Masernschutz — wer den Nachweis erbringen muss, und woraus sich das ergibt.
 *
 * Zwei Voraussetzungen muessen ZUSAMMEN erfuellt sein (IfSG § 20 Abs. 8):
 *   1. Taetigkeit in einer Gemeinschaftseinrichtung (Schule, Kita),
 *   2. Geburt nach dem 31.12.1970.
 *
 * Beide stehen hier an EINER Stelle. Vorher lebte die Liste der
 * Gemeinschaftseinrichtungen allein in `step9-masern.tsx` und steuerte dort nur
 * die Farbe eines Hinweiskastens, waehrend das Geburtsjahr als eigener Haken
 * abgefragt wurde — zwei Wahrheiten zu einer Tatsache. Genau daran ist der
 * gemeldete Fall gescheitert: In Schritt 1 stand ein Geburtsjahr, der Haken in
 * Schritt 9 blieb leer, und die Uebersicht zeigte "Nein".
 *
 * Das Modul ist bewusst frei von Prisma- und React-Bezuegen: Fragebogen
 * (Browser), Dokumentenpflicht und Serverpruefung muessen dieselbe Funktion mit
 * denselben Eingaben aufrufen, sonst zeigt die Maske einen freigegebenen Knopf
 * und der Server antwortet mit einem Fehler.
 */

/**
 * Ab diesem Geburtsjahr ist der Nachweis zu erbringen.
 *
 * Das Gesetz sagt "nach dem 31.12.1970 geboren". Wer im Jahr 1971 geboren ist,
 * ist also erfasst — die Grenze lautet `>= 1971`, nicht `> 1971`.
 *
 * NICHT "AUFRAEUMEN": Das Datenbankfeld heisst `bornAfter1971` und ist damit um
 * ein Jahr daneben benannt. Der Name bleibt trotzdem stehen. Es gibt keinen
 * Migrationsordner (siehe CLAUDE.md); der Entrypoint rollt jede Schemaaenderung
 * mit `prisma db push --accept-data-loss` aus, und eine Umbenennung heisst dort
 * woertlich "alte Spalte loeschen, neue anlegen". Der Preis fuer den richtigen
 * Namen waeren alle bisher gegebenen Antworten. Falsch ist der Name, nicht der
 * Inhalt — deshalb werden die LABELS geradegezogen und die Spalte nicht.
 */
export const NACHWEIS_AB_GEBURTSJAHR = 1971;

/**
 * Die Einrichtungstypen, fuer die IfSG § 20 Abs. 8 traegt.
 *
 * VERWALTUNG, GMBH und VEREIN (siehe `OrganizationType` in schema.prisma)
 * fehlen hier mit Absicht: Fuer sie gibt es keine Rechtsgrundlage, einen
 * Masernschutznachweis zu VERLANGEN, und ein Gesundheitsdatum ohne
 * Rechtsgrundlage einzufordern ist ein Verstoss gegen Art. 9 DSGVO. Gefragt
 * werden darf dort weiterhin — die Angabe ist dann freiwillig.
 */
export const GEMEINSCHAFTSEINRICHTUNGEN = [
  "GYMNASIUM",
  "GESAMTSCHULE",
  "GRUNDSCHULE",
  "BERUFSKOLLEG",
  "KITA",
] as const;

export function istGemeinschaftseinrichtung(
  organisationstyp: string | null | undefined
): boolean {
  if (!organisationstyp) return false;
  return (GEMEINSCHAFTSEINRICHTUNGEN as readonly string[]).includes(
    organisationstyp
  );
}

/**
 * Das Geburtsjahr aus dem, was gerade zur Hand ist — `null`, wenn es sich nicht
 * zweifelsfrei bestimmen laesst.
 *
 * Die Eingabe ist absichtlich `unknown`-tolerant: Im Browser kommt der Wert aus
 * `formData` (ein `Record<string, unknown>`, Datum als "JJJJ-MM-TT" aus einem
 * `<input type="date">` oder "" fuer "noch nichts eingetragen"), auf dem Server
 * als `Date` aus Prisma. Ein unerwarteter Typ darf hier NICHT abstuerzen — die
 * Maske wuerde sonst weiss bleiben, statt eine Angabe offen zu lassen.
 *
 * `getUTCFullYear` und nicht `getFullYear`: Ein Datum ohne Uhrzeit wird als
 * Mitternacht UTC gelesen (`new Date("1971-01-01")`). Auf einem Server westlich
 * von Greenwich liefert die Ortszeit dafuer den 31.12.1970 — und damit ausgerechnet
 * an der Jahresgrenze die falsche Antwort.
 */
export function geburtsjahr(geburtsdatum: unknown): number | null {
  if (!geburtsdatum) return null;

  if (geburtsdatum instanceof Date) {
    const jahr = geburtsdatum.getUTCFullYear();
    return Number.isNaN(jahr) ? null : jahr;
  }

  if (typeof geburtsdatum !== "string") return null;

  // Nur das ISO-Format, das Formular und API tatsaechlich fuehren (auch als
  // Praefix eines vollen Zeitstempels). Alles andere wird bewusst NICHT
  // geraten: `new Date("03.05.2001")` liest je nach Laufzeit den 3. Mai oder
  // den 5. Maerz — und ein falsch geratenes Jahr entscheidet hier ueber eine
  // Nachweispflicht.
  const treffer = /^(\d{4})-\d{2}-\d{2}/.exec(geburtsdatum.trim());
  if (!treffer) return null;

  const jahr = Number(treffer[1]);
  return jahr > 0 ? jahr : null;
}

/**
 * Ist die Person nach dem 31.12.1970 geboren?
 *
 * `null` heisst "unbekannt", nicht "nein". Diese Unterscheidung ist der ganze
 * Grund fuer den Rueckgabetyp: In der Personalakte sieht ein stilles "Nein"
 * genauso aus wie eine beantwortete Frage, und niemand kann die beiden noch
 * auseinanderhalten.
 */
export function istNach1970Geboren(geburtsdatum: unknown): boolean | null {
  const jahr = geburtsjahr(geburtsdatum);
  if (jahr === null) return null;
  return jahr >= NACHWEIS_AB_GEBURTSJAHR;
}

/**
 * Muss dieser Vorgang einen Masernschutznachweis erbringen?
 *
 * Ohne Geburtsdatum: NEIN. Niemals "im Zweifel Pflicht" — ein Vorgang ohne
 * Geburtsdatum wuerde sonst an einer Pflicht haengenbleiben, deren Grundlage die
 * Person nie zu Gesicht bekommen hat.
 *
 * Ohne Gemeinschaftseinrichtung ebenfalls NEIN, siehe
 * `GEMEINSCHAFTSEINRICHTUNGEN`.
 */
export function masernschutzPflichtig(opts: {
  geburtsdatum: unknown;
  organisationstyp: string | null | undefined;
}): boolean {
  if (!istGemeinschaftseinrichtung(opts.organisationstyp)) return false;
  return istNach1970Geboren(opts.geburtsdatum) === true;
}
