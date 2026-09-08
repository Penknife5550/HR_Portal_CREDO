/**
 * Aufteilung des Gehalts auf mehrere Kostenstellen (Einstellungsmodalitaeten,
 * Schritt 4).
 *
 * EINE Datei fuer Maske und Route — bewusst. Die Maske sperrt den
 * Weiter-Knopf, solange die Summe nicht stimmt, die Route weist denselben Fall
 * beim Absenden ab. Zwei Rechenwege fuer dieselbe Regel wuerden frueher oder
 * spaeter auseinanderlaufen, und zwar an der unangenehmsten Stelle: Die Maske
 * laesst durch, was die Route ablehnt (oder umgekehrt).
 *
 * ============================================================================
 * WARUM IN GANZEN HUNDERTSTELN GERECHNET WIRD (bitte lesen, bevor jemand hier
 * "vereinfacht")
 * ============================================================================
 *
 * Die naheliegende Pruefung waere
 *
 *     zeilen.reduce((s, z) => s + z.anteil, 0) === 100
 *
 * und sie ist falsch. Nachgerechnet (node, IEEE-754 double):
 *
 *     5 + 63.01 + 31.99  ===  99.99999999999999   // nicht 100
 *     0.02 + 69.85 + 30.13 === 99.99999999999999
 *     0.01 + 71.79 + 28.2  === 100.00000000000001
 *
 * Der Vergleich wiese also voellig korrekte Aufteilungen ab. Auf ganze
 * Hundertstel gerechnet ist 500 + 6301 + 3199 = 10000, punktgenau und ohne
 * Sonderfall.
 *
 * ACHTUNG, falls jemand das mit dem Schulbuch-Beispiel nachpruefen will:
 * 33,33 + 33,33 + 33,34 ist in JavaScript **exakt** 100 — das haeufig zitierte
 * 100.00000000000001 stimmt fuer genau diese Zahlen nicht. Wer daraufhin
 * schliesst, das Problem gebe es nicht, hat die falsche Stichprobe gezogen:
 * Unter allen Dreier-Aufteilungen mit zwei Nachkommastellen weicht ein
 * spuerbarer Teil ab, und welche es trifft, sieht man den Zahlen nicht an.
 * Die Abweichung geht dabei ausschliesslich in die abweisende Richtung — eine
 * Aufteilung, der ein ganzes Hundertstel fehlt, liegt um Groessenordnungen
 * weiter von 100 entfernt (1e-2) als der Darstellungsfehler (1e-14) und kann
 * nie zufaellig als 100 durchgehen. Der Schaden ist also nicht die
 * Falschbuchung, sondern die Person, die eine richtige Eingabe nicht absenden
 * kann und nicht erfaehrt, warum.
 *
 * KEINE TOLERANZ ("plus/minus 0,01 ist schon in Ordnung"): Damit ginge
 * 33,33 dreimal durch, und 0,01 Prozent des Gehalts haetten keine
 * Kostenstelle. Das faellt niemandem auf — genau das macht es gefaehrlich.
 * Eine Toleranz verschiebt einen sichtbaren Fehler in eine unsichtbare
 * Falschbuchung. Der Preis der harten Regel ist ein Klick, und den nimmt der
 * Knopf "Rest der letzten Zeile zuschlagen" in der Maske ab; die letzte Zeile
 * traegt den Rundungsrest, wie es in der Kostenrechnung ohnehin ueblich ist.
 *
 * ZWEI NACHKOMMASTELLEN genuegen: Ein Hundertstel Prozent sind bei 3.000 Euro
 * Monatsgehalt 30 Cent. Feiner aufzuteilen hat keine Entsprechung in der
 * Lohnbuchhaltung, macht aber jede Summenpruefung fehleranfaellig.
 *
 * NULL ZEILEN BLEIBEN GUELTIG (Entscheidung des Nutzers): Die Kostenstelle ist
 * heute ein optionales Feld. Eine Pflicht daraus zu machen, blockierte jeden
 * Vorgang, in dem die vorgesetzte Person die Kostenstelle noch nicht kennt.
 * Sobald aber EINE Zeile existiert, muss die Summe exakt 100 ergeben.
 */

import { z } from "zod";

/**
 * Obergrenze der Zeilen.
 *
 * Fachlich sind zwei bis drei Kostenstellen der Regelfall; zwanzig ist
 * grosszuegig und verhindert zugleich, dass ein manipulierter Aufruf beliebig
 * viele Zeilen anlegt. Die Maske importiert diese Konstante, statt die 20 ein
 * zweites Mal hinzuschreiben — sonst wuerde ein spaeteres Anheben an einer der
 * beiden Stellen vergessen.
 */
export const MAX_KOSTENSTELLEN_ZEILEN = 20;

/** Laenge der Bezeichnung — wie beim abgeloesten Einzelfeld `kostenstelle`. */
export const MAX_KOSTENSTELLE_LAENGE = 100;

/** Prozent, in ganzen Hundertsteln. Die Zielsumme jeder Aufteilung. */
export const VOLLE_HUNDERT_HUNDERTSTEL = 10_000;

/**
 * Der Prozentsatz einer Zeile in ganzen Hundertsteln.
 *
 * Das ist die einzige Stelle, an der aus einer Gleitkommazahl eine Ganzzahl
 * wird. Alles Weitere (Summe, Differenz, Meldung) rechnet ausschliesslich mit
 * Ganzzahlen — siehe Kopf der Datei.
 */
export function hundertstel(anteil: number): number {
  return Math.round(anteil * 100);
}

/** Summe aller Zeilen in ganzen Hundertsteln. */
export function summeHundertstel(zeilen: { anteil: number }[]): number {
  return zeilen.reduce((summe, zeile) => summe + hundertstel(zeile.anteil), 0);
}

/**
 * Hat der Wert mehr als zwei Nachkommastellen?
 *
 * `anteil * 100` ist nicht immer glatt: `0.07 * 100` ist 7.000000000000001 und
 * `1.005 * 100` ist 100.49999999999999. Ein Vergleich mit `%` oder
 * `Number.isInteger` schluege bei 0,07 also an, obwohl die Eingabe voellig
 * korrekt ist. Der Abstand zur naechsten Ganzzahl ist bei einer echten dritten
 * Nachkommastelle (33,335 -> 3333.5) um Groessenordnungen groesser als der
 * Darstellungsfehler (1e-14), deshalb die Schranke 1e-6 dazwischen.
 */
export function hatZuVieleNachkommastellen(anteil: number): boolean {
  if (!Number.isFinite(anteil)) return false; // faengt bereits z.number()/.max() ab
  return Math.abs(anteil * 100 - Math.round(anteil * 100)) > 1e-6;
}

/**
 * Hundertstel als deutscher Prozenttext: 9999 -> "99,99".
 *
 * Von Hand gerechnet und NICHT ueber `toLocaleString("de-DE")`: Der Text steht
 * in einer Fehlermeldung, die ein Test woertlich prueft, und
 * `toLocaleString` haengt an der ICU-Ausstattung der Laufzeit. Im
 * Produktions-Image (node:alpine) kann sie kleiner sein als auf dem
 * Entwicklungsrechner — dann stuende dort ploetzlich "99.99". Fuer die reine
 * ANZEIGE in der Maske ist `toLocaleString` weiter in Ordnung.
 */
export function prozentText(inHundertsteln: number): string {
  const negativ = inHundertsteln < 0;
  const betrag = Math.abs(Math.round(inHundertsteln));
  const ganze = Math.floor(betrag / 100);
  const rest = betrag % 100;
  return `${negativ ? "-" : ""}${ganze},${String(rest).padStart(2, "0")}`;
}

/**
 * Die Summenregel als reine Funktion: `null`, wenn alles stimmt, sonst der
 * fertige deutsche Satz.
 *
 * Bewusst hier und nicht nur im `superRefine`: Die Maske zeigt denselben Satz
 * unter der Tabelle an, waehrend getippt wird. Wuerde sie ihn selbst
 * formulieren, stuende beim Weiterklicken ein anderer Wortlaut da als davor.
 */
export function summenFehler(zeilen: { anteil: number }[]): string | null {
  // Ohne Zeilen gibt es nichts aufzuteilen — siehe Kopf der Datei.
  if (zeilen.length === 0) return null;

  const summe = summeHundertstel(zeilen);
  if (summe === VOLLE_HUNDERT_HUNDERTSTEL) return null;

  const abweichung = summe - VOLLE_HUNDERT_HUNDERTSTEL;
  const gesamt = `Die Anteile ergeben zusammen ${prozentText(summe)} %.`;
  return abweichung < 0
    ? `${gesamt} Es fehlen ${prozentText(-abweichung)} % auf 100 %.`
    : `${gesamt} Das sind ${prozentText(abweichung)} % zu viel.`;
}

/**
 * Vergleichsform einer Bezeichnung fuer die Doppelungspruefung.
 *
 * Klein geschrieben und getrimmt: "4711 " und "4711" sind dieselbe
 * Kostenstelle, und wer "Verwaltung" und "verwaltung" nebeneinander
 * eintraegt, hat sich vertippt und nicht zwei Kostenstellen gemeint. Die
 * Pruefung ist damit strenger als der Datenbankindex
 * `@@unique([supervisorDataId, bezeichnung])`, der exakt vergleicht — was
 * hier durchkommt, kann dort nicht mehr anschlagen.
 */
function vergleichsform(bezeichnung: string): string {
  return bezeichnung.trim().toLowerCase();
}

/** Eine Zeile der Aufteilung. */
export const kostenstellenZeileSchema = z.object({
  bezeichnung: z
    .string({
      required_error: "Bitte die Kostenstelle angeben.",
      invalid_type_error: "Bitte die Kostenstelle angeben.",
    })
    .trim()
    .min(1, "Bitte die Kostenstelle angeben.")
    .max(
      MAX_KOSTENSTELLE_LAENGE,
      `Bitte höchstens ${MAX_KOSTENSTELLE_LAENGE} Zeichen.`
    ),
  // `invalid_type_error` faengt auch das leere Zahlenfeld ab: `zahlOderNull`
  // macht daraus null, und null ist fuer Zod ein Typfehler, kein
  // Bereichsfehler. Ohne eigene Meldung stuende dort Zods englisches
  // "Expected number, received null".
  anteil: z
    .number({
      required_error: "Bitte einen Prozentsatz eingeben.",
      invalid_type_error: "Bitte einen Prozentsatz eingeben.",
    })
    .min(0, "Der Anteil kann nicht negativ sein.")
    .max(100, "Der Anteil kann höchstens 100 Prozent betragen."),
});

export type KostenstellenZeileEingabe = z.infer<typeof kostenstellenZeileSchema>;

/**
 * Die gesamte Aufteilung eines Vorgangs.
 *
 * Reihenfolge der Pruefungen: Zod parst zuerst jede Zeile. Faellt dabei eine
 * Zeile ganz durch (fehlender Prozentsatz, leere Bezeichnung), laeuft das
 * `superRefine` gar nicht erst an — die Person soll nicht neben
 * "Bitte einen Prozentsatz eingeben." zusaetzlich lesen muessen, dass die
 * Summe nicht 100 ergibt. Das ist Zod-Verhalten und kein Zufall: Eine
 * abgebrochene Element-Pruefung setzt das Array auf "aborted".
 */
export const kostenstellenListeSchema = z
  .array(kostenstellenZeileSchema)
  .max(
    MAX_KOSTENSTELLEN_ZEILEN,
    `Es sind höchstens ${MAX_KOSTENSTELLEN_ZEILEN} Kostenstellen möglich.`
  )
  .superRefine((zeilen, ctx) => {
    // Ueber der Obergrenze steht die Meldung schon da. Eine zweite ueber die
    // Summe waere nur Rauschen — zuerst sind Zeilen zu entfernen.
    if (zeilen.length > MAX_KOSTENSTELLEN_ZEILEN) return;

    let sauber = true;

    zeilen.forEach((zeile, index) => {
      if (hatZuVieleNachkommastellen(zeile.anteil)) {
        sauber = false;
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "anteil"],
          message: "Bitte höchstens zwei Nachkommastellen angeben.",
        });
      }
    });

    const gesehen = new Map<string, number>();
    zeilen.forEach((zeile, index) => {
      const schluessel = vergleichsform(zeile.bezeichnung);
      // Eine leere Bezeichnung hat ihre eigene Meldung ("Bitte die
      // Kostenstelle angeben.") aus dem Zeilenschema. Ohne diesen Ausstieg
      // stuende bei zwei frisch angelegten Leerzeilen zusaetzlich
      // "Die Kostenstelle „“ ist bereits in Zeile 1 eingetragen." da — und
      // darunter noch die Summenmeldung, obwohl schlicht nichts eingetippt
      // ist. `sauber = false` unterdrueckt deshalb auch die Summe: Erst
      // ausfuellen, dann rechnen.
      if (schluessel === "") {
        sauber = false;
        return;
      }
      const zuerst = gesehen.get(schluessel);
      if (zuerst === undefined) {
        gesehen.set(schluessel, index);
        return;
      }
      sauber = false;
      // Die Meldung haengt an der SPAETEREN Zeile: Die erste Nennung ist die
      // gewollte, die zweite ist der Vertipper, der weg muss.
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, "bezeichnung"],
        message: `Die Kostenstelle „${zeile.bezeichnung}“ ist bereits in Zeile ${zuerst + 1} eingetragen.`,
      });
    });

    // Erst wenn die Zeilen fuer sich stimmen, ist die Summe eine sinnvolle
    // Aussage. Bei einer doppelten Zeile oder einer dritten Nachkommastelle
    // waere eine zusaetzliche Summenmeldung nur verwirrend.
    if (!sauber) return;

    const fehler = summenFehler(zeilen);
    if (fehler) {
      // Ohne `path` haengt die Meldung an der Liste selbst. Genau das ist
      // gewollt: Die Summe gehoert keiner einzelnen Zeile, und die Fehlerbox
      // beschriftet den Pfad `kostenstellen` als "Kostenstellen-Aufteilung".
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: fehler });
    }
  });

export type KostenstellenListeEingabe = z.infer<typeof kostenstellenListeSchema>;

/**
 * Bringt eine geprüfte Zeile in die Form, die Prisma erwartet.
 *
 * `bezeichnung` ist durch das Schema bereits getrimmt; der zweite Trimm hier
 * kostet nichts und macht die Funktion unabhaengig davon, ob der Aufrufer
 * wirklich das Ergebnis von `parse` uebergibt.
 */
export function zuDatensatz(
  zeile: KostenstellenZeileEingabe,
  supervisorDataId: string,
  orderIndex: number
) {
  return {
    supervisorDataId,
    orderIndex,
    bezeichnung: zeile.bezeichnung.trim(),
    anteil: zeile.anteil,
  };
}
