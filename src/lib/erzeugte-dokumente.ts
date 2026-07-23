/**
 * Erzeugte Dokumente je Vorgang — Regeln ohne Server-Bezug.
 *
 * Bewusst OHNE Prisma-Import, damit die Client-Komponente im Dokumente-Hub die
 * Aufbewahrungsfrist direkt nutzen kann (analog zu placeholder-catalog.ts).
 * Die Vorgangs-Aufloesung steht in erzeugte-dokumente-vorgang.ts.
 */

/** Aufbewahrungsfrist erzeugter Dokumente in Monaten. */
export const AUFBEWAHRUNG_MONATE = 12;

/**
 * Module, fuer die die Anzeige gebaut ist.
 *
 * BEM fehlt bewusst: Die versiegelte Akte (§ 167 SGB IX) hat einen eigenen,
 * zugriffsgeschuetzten Weg. Ein generischer Endpunkt darf sie nicht umgehen —
 * die Erzeugungsroute lehnt BEM aus demselben Grund ab.
 */
export const UNTERSTUETZTE_MODULE = ["ONBOARDING", "VERTRAGSVERLAENGERUNG"] as const;

/** Ist die Anzeige fuer dieses Modul vorgesehen? */
export function istModulUnterstuetzt(modul: string): boolean {
  return (UNTERSTUETZTE_MODULE as readonly string[]).includes(modul);
}

/**
 * Stichtag, vor dem erzeugte Dokumente entfernt werden duerfen.
 * Kalendarisch gerechnet, nicht in Tagen — sonst driftet die Frist ueber die
 * unterschiedlich langen Monate.
 */
export function aufbewahrungsGrenze(jetzt: Date): Date {
  const grenze = new Date(jetzt);
  grenze.setMonth(grenze.getMonth() - AUFBEWAHRUNG_MONATE);
  return grenze;
}
