/**
 * Verantwortliche Stelle (DSGVO) — pro Mandant konfigurierbar mit globalem Default.
 *
 * Wird im oeffentlichen Personalfragebogen (DSGVO-Text) und als Brief-Platzhalter
 * (zentrale Vorlagenverwaltung) verwendet. Wenn ein Mandant keine eigene
 * verantwortliche Stelle gepflegt hat, greift der globale Default.
 */

export const DEFAULT_VERANTWORTLICHE_STELLE = {
  name: "Christlicher Schulverein Minden e.V.",
  strasse: "Kingsleyallee 6",
  plz: "32425",
  ort: "Minden",
} as const;

export interface VerantwortlicheStelleInput {
  dsgvoVerantwortlicheName?: string | null;
  dsgvoVerantwortlicheStrasse?: string | null;
  dsgvoVerantwortlichePlz?: string | null;
  dsgvoVerantwortlicheOrt?: string | null;
}

export interface VerantwortlicheStelle {
  name: string;
  strasse: string;
  plz: string;
  ort: string;
}

/** Loest die effektive verantwortliche Stelle auf (Mandanten-Wert oder Default). */
export function resolveVerantwortlicheStelle(
  org?: VerantwortlicheStelleInput | null,
): VerantwortlicheStelle {
  return {
    name: org?.dsgvoVerantwortlicheName?.trim() || DEFAULT_VERANTWORTLICHE_STELLE.name,
    strasse: org?.dsgvoVerantwortlicheStrasse?.trim() || DEFAULT_VERANTWORTLICHE_STELLE.strasse,
    plz: org?.dsgvoVerantwortlichePlz?.trim() || DEFAULT_VERANTWORTLICHE_STELLE.plz,
    ort: org?.dsgvoVerantwortlicheOrt?.trim() || DEFAULT_VERANTWORTLICHE_STELLE.ort,
  };
}

/** Einzeilige Darstellung: "Name, Strasse, PLZ Ort". */
export function formatVerantwortlicheStelle(
  org?: VerantwortlicheStelleInput | null,
): string {
  const v = resolveVerantwortlicheStelle(org);
  return `${v.name}, ${v.strasse}, ${v.plz} ${v.ort}`;
}
