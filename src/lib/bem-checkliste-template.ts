/**
 * BEM — Pflicht-Checklisten je Gespraechstyp (§ 167 SGB IX).
 *
 * Abgeleitet aus den CREDO-Word-Vorlagen (Erstgespraech / Folgegespraech /
 * Gedaechtnisprotokoll). Wird bei Anlage eines Gespraechs als Json in
 * BemGespraech.checkliste vorbefuellt (alle unerledigt) und kann im Gespraechs-
 * Modal abgehakt werden.
 *
 * Hinweis: Inhalte sind ein praxisnaher Default und koennen 1:1 an die finalen
 * CREDO-Vorlagen angeglichen werden (Dateien in BEM/, lokal/gitignored).
 */

import type { BemGespraechTyp } from "@prisma/client";

export interface BemChecklistItem {
  titel: string;
  erledigt: boolean;
}

const ERSTGESPRAECH: string[] = [
  "Einwilligung zum BEM liegt vor und ist dokumentiert",
  "Zweck und Freiwilligkeit des BEM erläutert",
  "Datenschutz und Schweigepflicht erklärt",
  "Aktuelle gesundheitliche Situation besprochen (soweit gewünscht)",
  "Belastungen / Probleme am Arbeitsplatz erfasst",
  "Wünsche und Vorschläge der/des Beschäftigten aufgenommen",
  "Mögliche Maßnahmen (technisch/organisatorisch/personenbezogen) identifiziert",
  "Hinzuziehung Betriebsarzt / Reha-Träger / Integrationsamt geprüft",
  "Nächste Schritte und Folgetermin vereinbart",
];

const FOLGEGESPRAECH: string[] = [
  "Umsetzung der vereinbarten Maßnahmen geprüft",
  "Wirksamkeit der Maßnahmen bewertet",
  "Gesundheitliche Entwicklung besprochen (soweit gewünscht)",
  "Anpassung bestehender oder neue Maßnahmen vereinbart",
  "Weiteres Vorgehen / Folgetermin oder Abschluss festgelegt",
];

const GEDAECHTNISPROTOKOLL: string[] = [
  "Datum, Ort und Dauer des Gesprächs erfasst",
  "Teilnehmende dokumentiert",
  "Wesentliche Gesprächsinhalte festgehalten",
  "Getroffene Vereinbarungen notiert",
];

const TEMPLATES: Record<BemGespraechTyp, string[]> = {
  ERSTGESPRAECH,
  FOLGEGESPRAECH,
  GEDAECHTNISPROTOKOLL,
};

/** Liefert die Pflicht-Checkliste fuer einen Gespraechstyp (alle unerledigt). */
export function getBemCheckliste(typ: BemGespraechTyp): BemChecklistItem[] {
  return (TEMPLATES[typ] ?? []).map((titel) => ({ titel, erledigt: false }));
}
