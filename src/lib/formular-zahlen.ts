/**
 * Zahlenfelder in react-hook-form — Ersatz fuer `{ valueAsNumber: true }`
 *
 * ============================================================================
 * WARUM ES DIESE DATEI GIBT (bitte lesen, bevor jemand hier "aufraeumt")
 * ============================================================================
 *
 * Aus dem Betrieb gemeldet: Beschaeftigte und Vorgesetzte kommen in den
 * Formularen nicht weiter. Mal erscheint ein nichtssagendes
 * "Validierungsfehler", mal passiert beim Klick auf "Weiter" ueberhaupt nichts.
 * Der Ausloeser ist voellig alltaeglich: eine Zahl eintippen und wieder
 * loeschen.
 *
 * Die Ursache ist mechanisch und liegt in genau einer Zeile:
 *
 *     register("urlaubstageProJahr", { valueAsNumber: true })
 *
 * `valueAsNumber` reicht `event.target.valueAsNumber` durch. Fuer ein GELEERTES
 * `<input type="number">` ist das laut HTML-Spezifikation **NaN** — nicht "",
 * nicht null, nicht undefined. Was danach passiert, ist eine Kette, in der
 * jedes einzelne Glied fuer sich korrekt arbeitet:
 *
 *   1. Der Formularzustand haelt NaN.
 *   2. Zod prueft `z.number().min(0).max(50).nullable()`. NaN ist zwar
 *      `typeof "number"`, aber `z.number()` lehnt NaN ausdruecklich ab, und
 *      `.nullable()` hilft nicht — NaN ist eben nicht null.
 *   3. `handleSubmit` ruft `onSubmit` deshalb **nie** auf. Kein Request, kein
 *      Schrittwechsel, kein Toast.
 *   4. Unter den meisten dieser Felder wird gar kein Fehltext gerendert.
 *
 * Ergebnis: Der Knopf ist gedrueckt, und sichtbar passiert NICHTS. Kein
 * Mensch am Bildschirm kann daraus schliessen, dass ein Feld schuld ist, das
 * er absichtlich leer gelassen hat.
 *
 * Deshalb liefert der Helfer hier bei leerer oder unbrauchbarer Eingabe
 * **null** statt NaN. null ist genau das, was beide nachgelagerten Schichten
 * erwarten:
 *   - die Zod-Schemas (`src/lib/validations/supervisor-data.ts`,
 *     `personal-data.ts`) sind durchgehend `.nullable()`, und
 *   - die Prisma-Spalten sind durchgehend `Int?` / `Float?`.
 *
 * ============================================================================
 * NICHT ZURUECKBAUEN
 * ============================================================================
 *
 * `{ valueAsNumber: true }` sieht kuerzer und "eingebauter" aus als
 * `{ ...zahlenFeld }`. Wer es aus diesem Grund zurueckholt, holt den oben
 * beschriebenen Fehler mit zurueck — und zwar unsichtbar, denn nichts schlaegt
 * fehl, nichts wird geloggt, kein Test einer anderen Datei wird rot. Der
 * Fehler zeigt sich erst wieder in einem Anruf aus dem Sekretariat.
 *
 * Zwei Randbedingungen von react-hook-form, die man kennen muss:
 *
 *   - `setValueAs` wird IGNORIERT, sobald am selben `register()` auch
 *     `valueAsNumber` oder `valueAsDate` steht. Beides zusammen ist also kein
 *     "doppelt haelt besser", sondern schaltet diesen Helfer stillschweigend ab.
 *   - `setValueAs` greift NUR fuer Werte, die aus dem Eingabefeld kommen. Auf
 *     `defaultValues` und `reset(...)` wirkt es nicht. Wer Serverdaten in das
 *     Formular laedt, muss sie selbst normalisieren — dafuer ist
 *     `zahlOderNull` einzeln exportiert.
 *
 * ============================================================================
 * WARUM 0 UEBERLEBEN MUSS
 * ============================================================================
 *
 * Wer "0" eintraegt, meint 0 und nicht "keine Angabe". 0 Tage Probezeit,
 * 0 Prozent Grad der Behinderung, 0 EUR Zulage sind Aussagen. Ein Helfer, der
 * 0 zu null macht, waere ein neuer Fehler an derselben Stelle — nur einer, der
 * still falsche Daten speichert statt still zu blockieren. Das ist schlimmer.
 *
 * Genau diese Falle steht bereits im Bestand, in den von Hand gebauten
 * `defaultValues`:
 *
 *     disabilityDegree: (data.disabilityDegree as number) || null
 *
 * `0 || null` ist null. Ein gespeicherter Grad von 0 verschwindet also beim
 * naechsten Laden des Formulars. `zahlOderNull` macht diesen Fehler nicht und
 * ist der vorgesehene Ersatz fuer solche Ausdruecke.
 *
 * ============================================================================
 * WARUM ES HIER KEIN "ganzzahlFeld" GIBT (bewusste Entscheidung)
 * ============================================================================
 *
 * Naheliegend waere eine zweite Variante fuer Felder, die eine ganze Zahl
 * verlangen: Urlaubstage, Probezeit-Monate, Tage pro Woche, Grad der
 * Behinderung. Die Faktenlage spricht sogar dafuer, dass dort etwas fehlt:
 * In `prisma/schema.prisma` sind diese Spalten `Int?`, in den zugehoerigen
 * Zod-Schemas (`supervisor-data.ts`, `personal-data.ts`) fehlt aber das
 * `.int()`. Eine 25,5 kaeme also durch die Validierung und erst bei Prisma zu
 * Fall — als 500er beim Speichern.
 *
 * Trotzdem gehoert die Loesung NICHT in diese Datei, denn eine Umrechnung im
 * `setValueAs` haette nur drei moegliche Ausgaenge, und alle drei sind
 * schlechter als das Problem:
 *
 *   - **Runden** (25,5 -> 26): aendert eine vertragliche Zahl hinter dem
 *     Ruecken des Nutzers, waehrend im Feld weiter "25,5" steht — `setValueAs`
 *     schreibt nicht in das DOM zurueck. Eine still von 6,5 auf 7 Monate
 *     verlaengerte Probezeit ist ein Datenschaden, kein Komfort.
 *   - **Verwerfen** (25,5 -> null): loescht die Eingabe lautlos; im Feld steht
 *     sie noch, gespeichert wird nichts.
 *   - **NaN zurueckgeben**, damit Zod meckert: das ist woertlich der Fehler,
 *     den diese Datei beseitigt.
 *
 * Die Anforderung "ganze Zahl" ist eine Regel ueber den Wert und gehoert
 * deshalb dorthin, wo Regeln eine sichtbare, wahre Meldung erzeugen: in das
 * Zod-Schema. Wer die Int-Felder haerten will, ergaenzt dort `.int()` — zum
 * Beispiel `z.number().int().min(0).max(50).nullable()` mit eigener
 * Fehlermeldung — und sorgt dafuer, dass der Fehltext unter dem Feld auch
 * gerendert wird. Eine zweite Fassung hier, die sich fuer jede Eingabe genau
 * wie `zahlenFeld` verhaelt, waere nur ein zweiter Name fuer dieselbe Sache.
 */

/**
 * Erlaubte Schreibweise einer Zahl — geprueft, NACHDEM ein Dezimalkomma durch
 * einen Punkt ersetzt wurde.
 *
 * Erlaubt: "50", "0.5", ".5", "5.", "-2", "+3", "1e5", "2.5E-3"
 * Abgelehnt: "abc", "0x10", "Infinity", "1.5.5", "1 2", "12px"
 *
 * WARUM ueberhaupt ein Muster und nicht blosses `Number(...)`:
 * `Number()` ist grosszuegiger, als man denkt. `Number("0x10")` ist 16 und
 * `Number("Infinity")` ist Infinity. Infinity ist der gefaehrliche Fall: Es ist
 * `typeof "number"` und kein NaN, kommt also durch `z.number()` hindurch. Ein
 * Feld ohne Obergrenze — etwa `taxAllowance: z.number().min(0).nullable()` —
 * wuerde Infinity bis zu Prisma durchreichen, wo es erst beim Schreiben in eine
 * Float-Spalte umfaellt. Das Muster (zusammen mit der Endpruefung auf
 * `Number.isFinite`) schneidet diese Sonderformen ab, bevor sie Schaden
 * anrichten.
 */
const ZAHL_MUSTER = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

/**
 * Wandelt einen Formularwert in `number | null`.
 *
 * Regeln:
 *   - `null`, `undefined`, leerer String, reiner Leerraum  -> `null`
 *   - unbrauchbarer Text ("abc")                           -> `null`
 *   - `NaN` oder `Infinity` (auch als fertige Zahl)        -> `null`
 *   - alles andere als String oder Zahl (z.B. `true`, {})  -> `null`
 *   - "0" -> `0`  (eine Angabe, keine Luecke — siehe Kopf der Datei)
 *   - Dezimal**komma** wird als Dezimaltrennzeichen gelesen: "0,5" -> `0.5`
 *
 * ZUM KOMMA: In einer deutschen Oberflaeche tippt man es. Ein Feld mit
 * `step={0.5}` oder `step={0.01}` (Wochenstunden, Betraege in EUR) laedt
 * foermlich dazu ein. Chrome mit deutschem Gebietsschema akzeptiert das Komma
 * in `<input type="number">` sogar und normalisiert es selbst auf einen Punkt —
 * andere Browser liefern dann aber einen leeren `value`. Der Helfer nimmt
 * beides an, damit das Verhalten nicht vom Browser des Nutzers abhaengt.
 *
 * KEINE Tausenderpunkte: "1.234,56" wird zu `null`, nicht zu 1234,56. Der
 * Grund ist Eindeutigkeit — "1.500" allein laesst sich nicht entscheiden
 * (1,5 oder 1500?), und eine Regel, die nur die volle deutsche Schreibweise
 * kennt, waere genau dort inkonsistent. Deshalb gilt hier durchgaengig: EIN
 * Trennzeichen, und das ist das Dezimaltrennzeichen. `<input type="number">`
 * liefert ohnehin nie eine Gruppierung.
 *
 * ZU "1e5" -> `100000` (bewusst angenommen): Die Exponentialschreibweise ist
 * laut HTML-Spezifikation eine gueltige Eingabe fuer `<input type="number">`,
 * und `valueAsNumber` haette hier ebenfalls 100000 geliefert. Dieser Helfer
 * ersetzt `valueAsNumber` — er darf nicht STRENGER werden als die Plattform
 * fuer Eingaben, die die Plattform selbst gueltig nennt. Sonst tauschen wir
 * eine stille Blockade gegen eine andere. Unsinnige Groessenordnungen faengt
 * das `.max(...)` der Zod-Schemas ab, und zwar mit einer Meldung.
 */
export function zahlOderNull(wert: unknown): number | null {
  // Fertige Zahlen kommen vor: aus `defaultValues`, aus `reset(...)` mit
  // Serverdaten und aus Feldern, die frueher mit `valueAsNumber` registriert
  // waren. Ein hier ankommendes NaN wird geheilt statt weitergereicht.
  if (typeof wert === "number") {
    return Number.isFinite(wert) ? wert : null;
  }

  // Alles, was weder Zahl noch String ist (boolean, Objekt, Array, Symbol),
  // ist keine Zahleneingabe. Bewusst NICHT ueber `Number()` schicken:
  // `Number(true)` waere 1 und `Number([])` waere 0 — beides frei erfundene
  // Werte, und 0 ist in diesen Formularen eine echte Aussage.
  if (typeof wert !== "string") {
    return null;
  }

  const bereinigt = wert.trim().replace(/,/g, ".");
  if (bereinigt === "") return null;
  if (!ZAHL_MUSTER.test(bereinigt)) return null;

  const zahl = Number(bereinigt);
  return Number.isFinite(zahl) ? zahl : null;
}

/**
 * Der Ersatz fuer `{ valueAsNumber: true }` in `register()`.
 *
 *     // vorher — leert der Nutzer das Feld, verpufft "Weiter" wortlos:
 *     <input type="number" {...register("urlaubstageProJahr", { valueAsNumber: true })} />
 *
 *     // nachher — leeres Feld wird zu null, und null ist gueltig:
 *     <input type="number" {...register("urlaubstageProJahr", zahlenFeld)} />
 *
 * Zusaetzliche Optionen lassen sich dazumischen:
 *
 *     <input type="number" {...register("wochenstunden", { ...zahlenFeld, required: true })} />
 *
 * `valueAsNumber` darf dabei NICHT wieder auftauchen — react-hook-form
 * bevorzugt es und ignoriert `setValueAs` dann stillschweigend.
 */
export const zahlenFeld: { setValueAs: (wert: unknown) => number | null } = {
  setValueAs: zahlOderNull,
};
