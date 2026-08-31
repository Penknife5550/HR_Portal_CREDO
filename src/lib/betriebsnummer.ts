/**
 * Die Betriebsnummer der Bundesagentur fuer Arbeit.
 *
 * Acht Ziffern, vergeben vom Betriebsnummern-Service der BA. Beide
 * Antragsanlagen der Minijob-Checkliste verlangen sie im Arbeitgeberteil
 * (Seiten 8 und 9, "Betriebsnummer:"). Ohne sie ist ein Antrag als Nachweis in
 * den Entgeltunterlagen wertlos — er laesst sich dem Betrieb nicht zuordnen.
 *
 * **Nicht zu verwechseln mit der `mandantNumber`.** Die ist dreistellig, kommt
 * aus LOGA und identifiziert den Mandanten im Portal. Die beiden Nummern stehen
 * in der Mandantenmaske absichtlich untereinander: Wer sie nebeneinander sieht,
 * verwechselt sie seltener als jemand, der sie auf zwei Masken verteilt findet.
 *
 * Die Regeln stehen hier und nicht in der Route, weil vier Stellen sie brauchen:
 * die Eingabemaske, die API, die Sperre vor der Antragserzeugung und der Test.
 */

/** Eine Betriebsnummer hat genau acht Stellen. */
export const BETRIEBSNUMMER_LAENGE = 8;

/**
 * Entfernt die Trennzeichen, mit denen Betriebsnummern gern notiert werden.
 *
 * Gespeichert wird immer nur die Ziffernfolge. Sonst greift die Pruefung
 * "ist gepflegt" bei "1234 5678" nicht mehr sauber, und das Leerzeichen landet
 * im gedruckten Kaestchenfeld des amtlichen Vordrucks.
 */
export function normalisiereBetriebsnummer(eingabe: string): string {
  return eingabe.replace(/[\s./-]/g, "");
}

/**
 * Genau acht Ziffern — mehr wird nicht geprueft.
 *
 * Bewusst **keine** Pruefziffernrechnung: Die Pruefziffer an der achten Stelle
 * gilt erst fuer neuere Vergaben. Eine aeltere, echte Nummer eines langjaehrigen
 * Schultraegers wuerde durchfallen — und damit ausgerechnet die Antragserzeugung
 * blockieren, die diese Pruefung schuetzen soll. Das Format pruefen wir, die
 * Richtigkeit verantwortet der BA-Bescheid.
 */
export function istGueltigeBetriebsnummer(wert: string): boolean {
  return new RegExp(`^[0-9]{${BETRIEBSNUMMER_LAENGE}}$`).test(wert);
}

export const BETRIEBSNUMMER_FORMAT_FEHLER =
  "Die Betriebsnummer besteht aus genau acht Ziffern (Bundesagentur für Arbeit).";

/**
 * Nimmt eine Roheingabe entgegen und liefert entweder den zu speichernden Wert
 * oder einen Fehlertext.
 *
 * Leer bedeutet `null`, nie Leerstring: "nicht gepflegt" soll genau eine
 * Darstellung haben, damit die Sperre ein schlichtes `if (!betriebsnummer)`
 * bleiben kann.
 */
export function pruefeBetriebsnummerEingabe(
  eingabe: unknown
): { ok: true; wert: string | null } | { ok: false; fehler: string } {
  if (eingabe === null || eingabe === undefined) return { ok: true, wert: null };
  if (typeof eingabe !== "string") {
    return { ok: false, fehler: BETRIEBSNUMMER_FORMAT_FEHLER };
  }
  const roh = eingabe.trim();
  if (roh === "") return { ok: true, wert: null };

  const wert = normalisiereBetriebsnummer(roh);
  if (!istGueltigeBetriebsnummer(wert)) {
    return { ok: false, fehler: BETRIEBSNUMMER_FORMAT_FEHLER };
  }
  return { ok: true, wert };
}

/**
 * Der Sperrtext, wenn die Nummer fehlt — an allen Sperrstellen derselbe.
 *
 * Er nennt den Mandanten und sagt, wo die Nummer hingehoert. Eine Meldung, die
 * nur "Betriebsnummer fehlt" sagt, laesst den Lesenden ratlos zurueck.
 */
export function betriebsnummerFehltText(mandantName: string): string {
  return (
    `Für den Mandanten „${mandantName}“ ist keine Betriebsnummer hinterlegt. ` +
    `Der amtliche Antrag verlangt sie im Arbeitgeberteil. ` +
    `Bitte unter Mandanten → ${mandantName} nachtragen.`
  );
}

/**
 * Der Tag im Monat, an dem die Entgeltabrechnung laeuft.
 *
 * Steht hier neben der Betriebsnummer, weil beides Mandanten-Stammdaten sind,
 * die dieselbe Maske pflegt — und weil beide fuer die Minijob-Antraege gebraucht
 * werden: die Nummer auf dem Vordruck, der Termin fuer die Meldefrist.
 *
 * Die Meldefrist ist der FRUEHERE aus naechster Entgeltabrechnung und Eingang
 * plus sechs Wochen. Ohne diesen Wert ueberwacht das Portal nur die aeussere
 * Grenze und meldet damit unter Umstaenden zu spaet.
 */
export function pruefeAbrechnungstagEingabe(
  eingabe: unknown
): { ok: true; wert: number | null } | { ok: false; fehler: string } {
  if (eingabe === null || eingabe === undefined || eingabe === "") {
    return { ok: true, wert: null };
  }
  const zahl = typeof eingabe === "number" ? eingabe : Number(String(eingabe).trim());
  if (!Number.isInteger(zahl) || zahl < 1 || zahl > 31) {
    return { ok: false, fehler: ABRECHNUNGSTAG_FORMAT_FEHLER };
  }
  return { ok: true, wert: zahl };
}

export const ABRECHNUNGSTAG_FORMAT_FEHLER =
  "Der Abrechnungstag ist eine ganze Zahl zwischen 1 und 31.";

/** Anzeigeform mit Tausenderluecken? Nein — die BA schreibt sie am Stueck. */
export function formatiereBetriebsnummer(wert: string | null | undefined): string {
  return wert && wert.trim() !== "" ? wert : "—";
}
