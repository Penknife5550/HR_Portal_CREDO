/**
 * Tests: `nach1970GeborenAnzeige` — was Vorgangsansicht und Personalakte-PDF zu
 * "Nach dem 31.12.1970 geboren" zeigen.
 *
 * Warum es diese Funktion und diese Datei gibt: `bornAfter1971` ist eine
 * Spalte, aber keine Antwort — es ist eine Ableitung aus `birthDate`, und sie
 * wird genau einmal geschrieben, beim Verlassen von Schritt 9 des Fragebogens.
 * Die Schrittleiste macht den Sprung zurueck zu Schritt 1 zum bequemen
 * Regelweg: Wer dort einen Zahlendreher im Geburtsjahr korrigiert und Schritt 9
 * nicht noch einmal betritt, laesst den eingefrorenen Wert stehen. In der Akte
 * steht danach ein "Ja" neben einem Geburtsjahr von 1965 — oder, spiegelverkehrt,
 * das stille "Nein" fuer eine nach 1970 geborene Person, dessen Beseitigung der
 * Anlass des ganzen Umbaus war.
 *
 * Eigene Datei und nicht masernschutz.test.ts: Dort geht es um die Regel
 * (wer ist pflichtig), hier um die Frage, welcher von zwei widersprechenden
 * Werten beim LESEN gewinnt.
 */
import { nach1970GeborenAnzeige } from "@/lib/masernschutz";

describe("Anzeige 'Nach dem 31.12.1970 geboren'", () => {
  it("richtet sich nach dem Geburtsdatum, nicht nach der gespeicherten Spalte", () => {
    // Der gemeldete Fall: 1990 vertippt, in Schritt 9 als "Ja" eingefroren,
    // danach auf 1965 korrigiert. Die Spalte sagt "Ja", die Wahrheit "Nein".
    expect(nach1970GeborenAnzeige("1965-04-12", true)).toBe(false);
    // Und spiegelverkehrt — hier waere die Spalte das stille "Nein".
    expect(nach1970GeborenAnzeige("1990-04-12", false)).toBe(true);
  });

  it("bestaetigt die Spalte, wo beide dasselbe sagen", () => {
    expect(nach1970GeborenAnzeige("1990-04-12", true)).toBe(true);
    expect(nach1970GeborenAnzeige("1965-04-12", false)).toBe(false);
  });

  it("liest die Grenze wie das Gesetz: der Jahrgang 1971 ist erfasst", () => {
    expect(nach1970GeborenAnzeige("1971-01-01", null)).toBe(true);
    expect(nach1970GeborenAnzeige("1970-12-31", null)).toBe(false);
  });

  it("kommt mit den Formen zurecht, in denen das Datum tatsaechlich ankommt", () => {
    // Browser: "JJJJ-MM-TT" aus dem Datumsfeld. Server: `Date` aus Prisma.
    // PDF-Export: der ISO-Zeitstempel aus toISOString().
    expect(nach1970GeborenAnzeige(new Date("1990-04-12T00:00:00.000Z"), null)).toBe(true);
    expect(nach1970GeborenAnzeige("1990-04-12T00:00:00.000Z", null)).toBe(true);
    expect(nach1970GeborenAnzeige(new Date("1965-04-12T00:00:00.000Z"), null)).toBe(false);
  });

  it("faellt ohne brauchbares Geburtsdatum auf die gespeicherte Angabe zurueck", () => {
    // Dann gibt die Rechnung nichts her, und die frueher gegebene Antwort ist
    // immer noch besser als eine leere Zeile.
    expect(nach1970GeborenAnzeige(null, true)).toBe(true);
    expect(nach1970GeborenAnzeige("", false)).toBe(false);
    expect(nach1970GeborenAnzeige("morgen", true)).toBe(true);
    expect(nach1970GeborenAnzeige(new Date("Unsinn"), false)).toBe(false);
  });

  it("sagt 'unbekannt', wenn weder Datum noch Spalte etwas hergeben", () => {
    // `null` heisst unbekannt und nicht "Nein" — die Unterscheidung ist der
    // ganze Grund fuer den Rueckgabetyp.
    expect(nach1970GeborenAnzeige(null, null)).toBeNull();
    expect(nach1970GeborenAnzeige(undefined, undefined)).toBeNull();
  });
});
