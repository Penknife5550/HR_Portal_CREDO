/**
 * Laedt eine Adresse des Portals mit einem VOLLEN Seitenaufruf — kein Wechsel
 * im Client.
 *
 * Gebraucht beim An- und Abmelden: Der Kopf haengt im Portal-Layout, und ein
 * Layout, das der Router sich gemerkt hat, zeichnet Next.js nicht neu. Nach
 * einem Wechsel des Kontos stuenden sonst Name, Rolle und Punkte des alten da.
 *
 * Eine eigene Funktion, damit Tests sie ersetzen koennen (jsdom laesst
 * `window.location` nicht umdefinieren).
 */
export function seiteNeuLaden(adresse: string): void {
  window.location.assign(adresse);
}
