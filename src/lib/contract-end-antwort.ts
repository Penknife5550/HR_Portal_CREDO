/**
 * Vertragsende: Was eine Antwort an das Portal NIE tragen darf.
 *
 * `supervisorToken` ist der Schluessel des Magic-Links, ueber den die
 * Fuehrungskraft im oeffentlichen Formular /vertrag-formular/<token> ueber die
 * Weiterbeschaeftigung entscheidet. Wer ihn kennt, gibt diese Entscheidung in
 * ihrem Namen ab — er gehoert deshalb in keine Antwort der HR-Schnittstellen,
 * auch nicht an HR selbst. Der Link geht ausschliesslich per Mail an die
 * Fuehrungskraft (Events `contract-end-supervisor-link` und
 * `contract-end-supervisor-reminder`).
 *
 * `supervisorTokenExpiresAt` bleibt in der Antwort: Das Ablaufdatum ist kein
 * Geheimnis, und die Oberflaeche braucht es.
 *
 * Jede Route unter /api/contract-end, die einen Vorgang zurueckgibt, schickt
 * ihn durch diese Funktion. Bewusst ein Entfernen VOR der Antwort statt eines
 * `select` je Abfrage: Die Routen pruefen den Token teils selbst (Erinnerung),
 * und ein neues Feld am Modell soll nicht in jeder Auswahl nachgetragen werden
 * muessen.
 *
 * Rein und ohne Importe, damit die Routen-Tests nichts dafuer mocken muessen.
 * Das Onboarding ist NICHT betroffen — dort zeigt die HR-Oberflaeche den
 * Vorgesetzten-Link bewusst an.
 */
export function ohneVorgesetztenToken<T extends { supervisorToken?: unknown }>(
  vorgang: T,
): Omit<T, "supervisorToken"> {
  const { supervisorToken: _supervisorToken, ...rest } = vorgang;
  return rest;
}
