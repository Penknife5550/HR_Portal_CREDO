/**
 * Reihenfolge einer Liste aendern (rein, client-sicher).
 *
 * Verschiebt das Element an Position `von` an die Position `nach`; alle
 * dazwischen ruecken um eins auf. `nach` ist die Position, die das Element
 * DANACH hat — beim Ziehen also die Zeile, auf der losgelassen wurde.
 *
 * Ungueltige oder gleiche Positionen aendern nichts. Es kommt immer eine neue
 * Liste zurueck (React-Zustand).
 */
export function listeVerschieben<T>(liste: readonly T[], von: number, nach: number): T[] {
  const kopie = [...liste];
  const gueltig = (i: number) => Number.isInteger(i) && i >= 0 && i < kopie.length;
  if (!gueltig(von) || !gueltig(nach) || von === nach) return kopie;
  const [element] = kopie.splice(von, 1);
  kopie.splice(nach, 0, element);
  return kopie;
}
