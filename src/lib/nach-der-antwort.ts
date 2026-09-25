/**
 * Arbeit NACH der Antwort — eine duenne Huelle um `after()` aus next/server.
 *
 * Wofuer: Eine oeffentliche Route soll der Person sofort antworten und erst
 * danach etwas erledigen, das Zeit kostet und ihr nichts nuetzt — etwa die
 * HR-Meldung „Unterlagen vollständig eingegangen" nach dem Übermitteln
 * (Paket 4, Feinplanung Abschnitt 7 und 6.1). Eine SMTP-Verbindung kann bis zu
 * 40 Sekunden brauchen; so lange soll die Upload-Seite nicht warten.
 *
 * Zwei Regeln:
 *
 * 1. **Ausserhalb eines Request-Scopes wirft `after()`** („`after` was called
 *    outside a request scope", node_modules/next/dist/server/after/after.js).
 *    Das passiert in Tests, die den Handler direkt aufrufen, und in jedem
 *    Aufruf ausserhalb einer Route. Dann laeuft die Aufgabe als
 *    Fire-and-forget weiter, statt verloren zu gehen.
 * 2. **Fehler der Aufgabe werden nur geloggt** — mit Praefix und Fehlercode,
 *    nie mit der Meldung (sie kann Adressen oder Pfade tragen). Eine Aufgabe
 *    nach der Antwort kann die Antwort nicht mehr aendern; ein unbehandelter
 *    Fehler waere nur ein Absturzrisiko.
 *
 * Wer eine Aufgabe hier einreicht, sorgt selbst dafuer, dass ein Ausfall
 * (Prozess stirbt nach der Antwort) nachgeholt wird — bei der HR-Meldung ist
 * das der bedingte Anspruch plus der taegliche Lauf.
 */

import { after } from "next/server";

/** Nur `code ?? name` fuer die Konsole, nie die Meldung. */
function kennung(fehler: unknown): string {
  if (typeof fehler === "object" && fehler !== null) {
    const { code, name } = fehler as { code?: unknown; name?: unknown };
    if (code !== undefined && code !== null) return String(code);
    if (typeof name === "string") return name;
  }
  return "unbekannt";
}

/**
 * Fuehrt `aufgabe` nach dem Senden der Antwort aus. Wirft nie.
 *
 * @param bezeichnung Praefix fuer das Log, etwa „Unterlagen: HR-Meldung"
 */
export function nachDerAntwort(aufgabe: () => Promise<unknown>, bezeichnung = "Nach der Antwort"): void {
  const sicher = async (): Promise<void> => {
    try {
      await aufgabe();
    } catch (fehler) {
      console.error(`[${bezeichnung}] fehlgeschlagen:`, kennung(fehler));
    }
  };
  try {
    after(sicher);
  } catch {
    void sicher();
  }
}
