/**
 * Schreibschutz fuer vom Abgleich verwaltete Datensaetze (Self-Service S0,
 * Vorbedingung fuer S1, Plan Abschnitt 13).
 *
 * Was der Stammabgleich aus DokuBit schreibt, pflegt nur er. Ab S1 haengen
 * Anmeldung und Zuordnung an `Employee.email` und `Employee.isActive`, und
 * `isActive` rechnet der Abgleich aus den verwalteten Vertraegen. Eine Aenderung
 * von Hand an diesen Feldern schriebe eine Person auf einen anderen Menschen um
 * („Die Adresse ist die Person") oder hielte einen Vertrag laufen, den DokuBit
 * beendet hat („Ein Zweifel verschafft nie Zugang"). Die Schreibrouten unter
 * /api/employees weisen sie deshalb mit 409 ab, eine Person mit Quelle DOKUBIT
 * legt nur der Abgleich an (400), und schreiben duerfen dort nur die HR-Rollen,
 * nicht der n8n-Schluessel (SERVICE).
 *
 * Frei bleiben der Name (Abhilfe bei EMAIL_ANDERER_NAME, Anleitung
 * s0-personalstamm-n8n.md), die privaten Angaben und die Vertragsfelder, die
 * DokuBit nicht liefert (Position, Abteilung, Vertragsart). Eine Person einer
 * anderen Quelle darf HR auf DOKUBIT umstellen (Entscheidung D1); zurueck geht
 * es nicht, sonst bliebe ihr Aktiv-Status nach dem Vertragsende stehen.
 *
 * Rein und ohne Datenbank; die Routen protokollieren jede Aenderung im
 * AuditLog (processType PERSONALSTAMM, nur Feldnamen, nie Werte).
 */

import { PERSONALSTAMM_QUELLE } from "@/lib/constants";

/** Felder einer Person mit Quelle DOKUBIT, die nur der Abgleich schreibt. */
export const VERWALTETE_PERSONENFELDER = ["email", "isActive", "importSource"] as const;

/**
 * Felder eines verwalteten Vertrags, die der Abgleich schreibt (`vertragAnlegen`,
 * `vertragsAenderung` in abgleich.ts) und die die PATCH-Route annimmt.
 * `abrechnungskreis` und `personalNumber` nimmt sie gar nicht an.
 */
export const VERWALTETE_VERTRAGSFELDER = [
  "organizationId",
  "mandantNumber",
  "startDate",
  "endDate",
  "workingHoursWeek",
  "isActive",
] as const;

/** Die Person fuehrt der Abgleich (Quelle DOKUBIT). */
export function personVerwaltet(person: { importSource: string | null }): boolean {
  return person.importSource === PERSONALSTAMM_QUELLE;
}

/** Der Vertrag stammt aus DokuBit (Vertragsschluessel gesetzt), wie `VERWALTET` in abgleich.ts. */
export function vertragVerwaltet(vertrag: { abrechnungskreis: string | null; personalNumber: string | null }): boolean {
  return vertrag.abrechnungskreis !== null && vertrag.personalNumber !== null;
}

/** Die Felder aus `felder`, die im Body stehen — auch mit null, das waere ein Leeren. */
export function gesperrteFelder(body: object, felder: readonly string[]): string[] {
  const werte = body as Record<string, unknown>;
  return felder.filter((feld) => werte[feld] !== undefined);
}

export const SCHREIBSCHUTZ_MELDUNGEN = {
  personFelder: (felder: string[]) =>
    `Diese Angaben pflegt der Abgleich aus DokuBit und lassen sich hier nicht ändern: ${felder.join(", ")}. Bitte in DokuBit korrigieren.`,
  personDeaktivieren:
    "Personen aus DokuBit legt der Abgleich still, sobald keiner ihrer Verträge mehr läuft. Bitte das Vertragsende in DokuBit eintragen.",
  personAnlegen: "Personen mit der Quelle DOKUBIT legt nur der Abgleich an.",
  vertragFelder: (felder: string[]) =>
    `Diese Angaben des Vertrags pflegt der Abgleich aus DokuBit und lassen sich hier nicht ändern: ${felder.join(", ")}. Bitte in DokuBit korrigieren.`,
  vertragLoeschen: "Verträge aus DokuBit lassen sich nicht löschen. Sie enden mit dem Vertragsende in DokuBit.",
  inzwischenGeaendert: "Die Person wurde gerade geändert. Bitte neu laden und erneut versuchen.",
} as const;
