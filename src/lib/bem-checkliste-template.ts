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
  "Zweck und Freiwilligkeit des BEM erlaeutert",
  "Datenschutz und Schweigepflicht erklaert",
  "Aktuelle gesundheitliche Situation besprochen (soweit gewuenscht)",
  "Belastungen / Probleme am Arbeitsplatz erfasst",
  "Wuensche und Vorschlaege der/des Beschaeftigten aufgenommen",
  "Moegliche Massnahmen (technisch/organisatorisch/personenbezogen) identifiziert",
  "Hinzuziehung Betriebsarzt / Reha-Traeger / Integrationsamt geprueft",
  "Naechste Schritte und Folgetermin vereinbart",
];

const FOLGEGESPRAECH: string[] = [
  "Umsetzung der vereinbarten Massnahmen geprueft",
  "Wirksamkeit der Massnahmen bewertet",
  "Gesundheitliche Entwicklung besprochen (soweit gewuenscht)",
  "Anpassung bestehender oder neue Massnahmen vereinbart",
  "Weiteres Vorgehen / Folgetermin oder Abschluss festgelegt",
];

const GEDAECHTNISPROTOKOLL: string[] = [
  "Datum, Ort und Dauer des Gespraechs erfasst",
  "Teilnehmende dokumentiert",
  "Wesentliche Gespraechsinhalte festgehalten",
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
