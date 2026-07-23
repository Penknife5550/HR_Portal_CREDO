/**
 * Filterlogik der Vorlagenliste (Modul + Geltung).
 *
 * Bewusst als reine Funktion ausserhalb der Client-Komponente: Die Jest-Umgebung
 * des Projekts laeuft ohne Browser (testEnvironment "node"), inline in einem
 * useMemo waere die Logik nicht pruefbar. Keine Server-Importe, damit die
 * Client-Komponente sie direkt nutzen kann.
 */

/** Sammelwerte des Geltungs-Filters (neben den konkreten Mandanten-IDs). */
export const GELTUNG_ALLE = "ALLE";
export const GELTUNG_GLOBAL = "GLOBAL";
export const GELTUNG_MANDANT = "MANDANT";

/** Sammelwert des Modul-Filters. */
export const MODUL_ALLE = "ALLE";

/** Minimalform einer Vorlage — nur die Felder, nach denen gefiltert wird. */
export interface FilterbareVorlage {
  modul: string;
  organizationId: string | null;
}

export interface VorlagenFilter {
  /** Modul-Schluessel oder MODUL_ALLE. */
  modul: string;
  /** GELTUNG_ALLE | GELTUNG_GLOBAL | GELTUNG_MANDANT | konkrete Mandanten-ID. */
  geltung: string;
}

/** Ist ueberhaupt ein Filter gesetzt? (steuert Zaehler + "Zuruecksetzen") */
export function istFilterAktiv(filter: VorlagenFilter): boolean {
  return filter.modul !== MODUL_ALLE || filter.geltung !== GELTUNG_ALLE;
}

/** Prueft eine einzelne Vorlage gegen den Geltungs-Filter. */
function passtZurGeltung(vorlage: FilterbareVorlage, geltung: string): boolean {
  if (geltung === GELTUNG_ALLE) return true;
  if (geltung === GELTUNG_GLOBAL) return vorlage.organizationId === null;
  if (geltung === GELTUNG_MANDANT) return vorlage.organizationId !== null;
  // Sonst: konkrete Mandanten-ID
  return vorlage.organizationId === geltung;
}

/**
 * Filtert die Vorlagenliste. Modul und Geltung sind UND-verknuepft; die
 * Reihenfolge der Liste bleibt erhalten (der Server sortiert bereits).
 */
export function filterVorlagen<T extends FilterbareVorlage>(
  vorlagen: T[],
  filter: VorlagenFilter,
): T[] {
  return vorlagen.filter((v) => {
    if (filter.modul !== MODUL_ALLE && v.modul !== filter.modul) return false;
    return passtZurGeltung(v, filter.geltung);
  });
}
