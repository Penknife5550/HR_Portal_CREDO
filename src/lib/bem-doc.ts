/**
 * BEM-Platzhalter-Resolver fuer die Vorlagenbibliothek (E5).
 *
 * Liefert NUR nicht-sensible Platzhalter (Name, Mandant, Daten, Fall-Nummer)
 * fuer die CREDO-BEM-Vorlagen (Einladung, Datenschutzvereinbarung, Protokolle).
 * Gesundheitsbezogene Freitexte werden hier BEWUSST NICHT aufgeloest — sie
 * gehoeren nicht automatisiert in generierte Schriftstuecke (Aktentrennung).
 *
 * Wird ausschliesslich vom zugriffsgeschuetzten BEM-Generierungs-Endpunkt
 * genutzt (canAccessBemContent), NICHT ueber den generischen E0-Endpunkt.
 */

import { prisma } from "@/lib/db";
import { commonPlaceholders } from "@/lib/doc-template-resolvers";

function deDate(d: Date | null): string | undefined {
  if (!d) return undefined;
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export interface BemResolveResult {
  data: Record<string, unknown>;
  organizationId: string | null;
  organizationName: string | null;
  mandantNumber: string | null;
  empfaenger: string;
}

/**
 * Sammelt die (nicht-sensiblen) Platzhalterwerte fuer einen BEM-Fall.
 * Leere/optionale Werte werden NICHT gesetzt, damit fehlende Felder als
 * "___" markiert + gemeldet werden (statt unsichtbarer Luecke).
 */
export async function resolveBemPlaceholders(
  bemFallId: string,
): Promise<BemResolveResult | null> {
  const fall = await prisma.bemFall.findUnique({
    where: { id: bemFallId },
    select: {
      displayId: true,
      organizationId: true,
      employeeFirstName: true,
      employeeLastName: true,
      employeeEmail: true,
      employeePersonalNr: true,
      anlassFehlzeitenAb: true,
      einladungAm: true,
      datenschutzAm: true,
      erstgespraechAm: true,
      organization: { select: { name: true, mandantNumber: true } },
    },
  });
  if (!fall) return null;

  const common = await commonPlaceholders(fall.organizationId);
  const name = `${fall.employeeFirstName} ${fall.employeeLastName}`.trim();

  const data: Record<string, unknown> = {
    ...common,
    fall_nummer: fall.displayId,
    vorname: fall.employeeFirstName,
    nachname: fall.employeeLastName,
    name,
    empfaenger: name,
  };
  // Optionale Werte nur setzen, wenn vorhanden.
  if (fall.employeeEmail) data.email = fall.employeeEmail;
  if (fall.employeePersonalNr) data.personalnummer = fall.employeePersonalNr;
  const fehlzeiten = deDate(fall.anlassFehlzeitenAb);
  if (fehlzeiten) data.fehlzeiten_ab = fehlzeiten;
  const einladung = deDate(fall.einladungAm);
  if (einladung) data.einladung_am = einladung;
  const einwilligung = deDate(fall.datenschutzAm);
  if (einwilligung) data.einwilligung_am = einwilligung;
  const erst = deDate(fall.erstgespraechAm);
  if (erst) data.erstgespraech_am = erst;

  return {
    data,
    organizationId: fall.organizationId,
    organizationName: fall.organization?.name ?? null,
    mandantNumber: fall.organization?.mandantNumber ?? null,
    empfaenger: name,
  };
}
