/**
 * Vorschau-Schalter zwischen alter und neuer Ansicht (UX-Umbau, Pilot)
 *
 * EINE Stelle für Name, Lesen und Setzen des Cookies (Entscheidung P-F1):
 *   - gespeichert im Browser, nicht am Benutzerkonto — kein Schema-Delta, die
 *     Wahl gilt je Gerät und Browser;
 *   - kein Personenbezug, ein Jahr, `SameSite=Lax`, `Path=/`;
 *   - Vorgabe ist die ALTE Ansicht: Nur der Wert „neu" schaltet um, alles
 *     andere (fehlt, leer, unbekannt, manipuliert) bleibt alt;
 *   - die Seite liest den Cookie auf dem Server und lädt genau EINE Ansicht —
 *     nichts springt nach dem Laden um.
 *
 * Rein und client-sicher. Gelesen wird auf dem Server (`cookies()` in der
 * Seite), gesetzt im Browser (`document.cookie`, danach `seiteNeuLaden`).
 *
 * Nach dem Pilot entfallen Schalter, Cookie und alte Ansicht in einem Commit
 * (Feinplan 3.8, docs/module/ux-ui/pilot-feinplan.md).
 */

export type Ansicht = "alt" | "neu";

/** Name des Cookies für die Detailseite des Vertragsendes. */
export const ANSICHT_VERTRAGSENDE_COOKIE = "ansicht-vertragsende";

/** Ein Jahr in Sekunden. */
export const ANSICHT_COOKIE_DAUER = 60 * 60 * 24 * 365;

/** Rückmeldungen zur neuen Ansicht (P-F5): `mailto:`, kein neuer Versandweg. */
export const ANSICHT_RUECKMELDUNG_ADRESSE = "personalbuchhaltung@fes-minden.de";

/** Nur „neu" schaltet um; alles andere ist die alte Ansicht. */
export function ansichtAusCookie(wert: string | null | undefined): Ansicht {
  return wert === "neu" ? "neu" : "alt";
}

/**
 * Die Zeile für `document.cookie`. „alt" löscht den Cookie (`Max-Age=0`),
 * statt einen zweiten Wert zu speichern — es gibt dann nichts, was nach dem
 * Pilot liegen bleibt. `sicher` setzt `Secure` (auf https, also auf dem Server).
 */
export function ansichtCookieZeile(ansicht: Ansicht, sicher: boolean): string {
  const teile = [
    `${ANSICHT_VERTRAGSENDE_COOKIE}=${ansicht === "neu" ? "neu" : ""}`,
    `Max-Age=${ansicht === "neu" ? ANSICHT_COOKIE_DAUER : 0}`,
    "Path=/",
    "SameSite=Lax",
  ];
  if (sicher) teile.push("Secure");
  return teile.join("; ");
}

/** `mailto:` für „Rückmeldung geben", mit Betreff. */
export function ansichtRueckmeldungLink(): string {
  return `mailto:${ANSICHT_RUECKMELDUNG_ADRESSE}?subject=${encodeURIComponent("Rückmeldung: neue Ansicht Vertragsende")}`;
}
