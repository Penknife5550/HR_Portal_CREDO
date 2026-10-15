/**
 * Filterlogik der Vorlagenliste (Modul + Geltung) und die Regel, dass das
 * Modul einer System-Vorlage fest ist (`systemVorlageModulGesperrt`, fuer
 * Route und Bearbeiten-Dialog).
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

// =============================================
// System-Vorlagen: das Modul ist fest (Review A4d, G19)
// =============================================

/**
 * Text der 409 und Hinweis im Bearbeiten-Dialog — EINE Fassung fuer Route und
 * Oberflaeche.
 */
export const SYSTEM_VORLAGE_MODUL_FEST =
  "Das Modul einer System-Vorlage lässt sich nicht ändern – das Portal findet sie darüber wieder.";

/**
 * Will eine Aenderung das Modul einer System-Vorlage umstellen?
 *
 * System-Vorlagen (`isSystem`) findet der Seed-Check ueber
 * `{ isSystem, modul, originalName }` (prisma/seed-check.js) und der Loeschlauf
 * der Ausstattungsprotokolle ueber `PROTOKOLL_SYSTEM_VORLAGEN` samt Modul der
 * erzeugten Dokumente. Ein umgestelltes Modul liesse den Seed beim naechsten
 * Start eine zweite, eingeschaltete Zeile anlegen, und die erzeugten
 * Protokolle fielen erst nach 12 Monaten statt mit der letzten Ausgabe.
 * Name, Beschreibung, Aktiv-Schalter und Mandant pflegt HR weiter.
 *
 * Dasselbe Modul noch einmal zu schicken ist keine Aenderung (der Dialog
 * schickt das Feld bei System-Vorlagen gar nicht erst).
 */
export function systemVorlageModulGesperrt(
  vorlage: { isSystem?: boolean | null; modul: string },
  neuesModul: string | undefined,
): boolean {
  return vorlage.isSystem === true && neuesModul !== undefined && neuesModul !== vorlage.modul;
}
