/**
 * axe-Lauf fuer Komponententests (jsdom).
 *
 * `axeVerstoesse(container)` liefert je Verstoss eine Zeile mit Regel, Hilfe
 * und den betroffenen Knoten (Selektor und Markup) — ein leeres Feld heisst
 * „nichts gefunden":
 *
 *   expect(await axeVerstoesse(container)).toEqual([]);
 *
 * Warum ein eigener Helfer und nicht `toHaveNoViolations()` aus jest-axe: Der
 * Matcher liesse sich je Datei mit `expect.extend(...)` einbinden — technisch
 * geht das ohne Setup-Datei. Seine Typen kommen aber aus `@types/jest-axe`,
 * das den Matcher GLOBAL deklariert: Er tippte sich dann in jeder der 180
 * Testdateien fehlerfrei und wuerfe ueberall dort zur Laufzeit, wo niemand
 * `expect.extend` gerufen hat. Dazu zieht das Typ-Paket ein zweites, altes
 * axe-core (3.5.6) nach. Der Helfer braucht beides nicht; die Typen des einen
 * genutzten Aufrufs stehen in `jest-axe.d.ts` daneben.
 *
 * Farbkontraste prueft axe in jsdom NICHT (kein Layout); die rechnet
 * `src/__tests__/lib/ui-kontrast.test.ts`.
 */
import { axe } from "jest-axe";

export async function axeVerstoesse(container: Element): Promise<string[]> {
  const ergebnis = await axe(container);
  return ergebnis.violations.map((v) => {
    const knoten = v.nodes.map((n) => `${n.target.join(" ")} → ${n.html}`).join(" | ");
    return `${v.id}: ${v.help} [${knoten}]`;
  });
}
