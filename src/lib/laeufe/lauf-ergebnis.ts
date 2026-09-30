/**
 * Gemeinsame Form der taeglichen Laeufe (src/lib/laeufe/*).
 *
 * Jeder Lauf ist eine Funktion, die Zeitplaner (src/lib/zeitplaner/) und die
 * Cron-Route gleichermassen aufrufen. Sie liefert Statuscode und Antwortkoerper
 * — die Route gibt beides 1:1 aus, der Zeitplaner wertet den Koerper fuer
 * Protokoll und Bericht aus. Der Koerper traegt dieselben Felder wie vorher die
 * Antwort der Route (Abwaertskompatibilitaet fuer Handaufrufe per curl).
 */

export interface LaufOptionen {
  /** Zeitpunkt des Laufs; Standard: jetzt. Fuer Tests. */
  jetzt?: Date;
  /** Probelauf: planen, aber nichts senden, schreiben oder loeschen (nur wo der Lauf es kann). */
  dryRun?: boolean;
}

export interface LaufErgebnis {
  status: number;
  body: object;
}

export const LAUF_FEHLER_BODY = { error: "Interner Serverfehler" } as const;

/**
 * Baut ein `LaufErgebnis` mit derselben Signatur wie `NextResponse.json` —
 * so blieb beim Herausloesen der Laeufe aus den Routen jede Antwortzeile gleich.
 */
export function laufAntwort(body: object, init?: { status?: number }): LaufErgebnis {
  return { status: init?.status ?? 200, body };
}
