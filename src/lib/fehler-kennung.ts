/**
 * CREDO HR-Portal – Fehlerkennung fuer die Konsole
 *
 * Eine Regel, EIN Ort: In die Konsole gehoert von einem Fehler nur
 * `code ?? name`, nie die Meldung — sie kann Adressen, Pfade oder Tokens
 * tragen (Paket 4, Feinplanung Abschnitt 11). Genutzt von den Diensten und
 * Routen von „Unterlagen nachfordern", vom taeglichen Lauf und von
 * `nachDerAntwort`. Rein, ohne Abhaengigkeiten — damit ein generischer Helfer
 * dafuer keinen Fachdienst laden muss.
 */

/** Nur `code ?? name` fuer die Konsole, nie die Meldung; sonst „unbekannt". */
export function fehlerKennung(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const { code, name } = err as { code?: unknown; name?: unknown };
    if (code !== undefined && code !== null) return String(code);
    if (typeof name === "string") return name;
  }
  return "unbekannt";
}
