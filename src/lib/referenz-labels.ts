/**
 * Single source of truth für die Labels der 12 Referenz-Pruefpunkte
 * (REFERENZ-Beurteilung Schritt 1 + 3).
 *
 * Diese Liste war historisch in vier Files dupliziert (PDF-Export, Verify-
 * Page, HR-Detail-Modal, Lehrkraft-Form). Hier zentralisiert.
 *
 * Reihenfolge ist relevant — sie definiert die Anzeigereihenfolge im
 * Wizard und im PDF.
 */

export interface ReferenzQuestion {
  id: string;
  /** Label mit Umlauten — für UI-Kontexte (React, HTML) */
  label: string;
  /** Optional ein Freitextfeld zusaetzlich zur Ja/Nein/Teilweise-Antwort */
  hasTextField?: boolean;
}

export const REFERENZ_QUESTIONS: ReferenzQuestion[] = [
  { id: "andachtsbesuch", label: "Regelmäßiger Andachtsbesuch" },
  { id: "vollzeit-perspektive", label: "Perspektive Vollzeit / mind. 75%" },
  { id: "belastbarkeit", label: "Belastbarkeit" },
  { id: "gutes-miteinander", label: "Gutes Miteinander (Kollegium, Schüler, Eltern)" },
  { id: "besondere-aufgaben", label: "Bereitschaft besondere Aufgaben zu übernehmen" },
  { id: "klassenleitung", label: "Klassenleitung übernommen" },
  { id: "engagement-schule", label: "Engagement für Schule sichtbar" },
  { id: "identifikation-fes", label: "Identifikation mit Grundsätzen FES Minden" },
  { id: "grundsaetze-gelebt", label: "Grundsätze der FES werden gelebt" },
  { id: "zielvereinbarungen", label: "Zielvereinbarungen vereinbart" },
  { id: "gemeindemitgliedschaft", label: "Aktive Gemeindemitgliedschaft" },
  {
    id: "mitarbeit-gemeinde",
    label: "Mitarbeit in der Gemeinde — welcher Bereich?",
    hasTextField: true,
  },
];

/**
 * Lookup-Map id → Label für Komponenten, die nur ein Mapping brauchen.
 */
export const REFERENZ_LABELS: Record<string, string> = Object.fromEntries(
  REFERENZ_QUESTIONS.map((q) => [q.id, q.label]),
);

/**
 * ASCII-Variante ohne Umlaute für den PDFKit-Export. PDFKit Helvetica
 * unterstuetzt zwar Umlaute, aber die historische PDF-Variante hat ASCII —
 * wir behalten diese für die DMS-Kompatibilitaet bei.
 */
export const REFERENZ_LABELS_ASCII: Record<string, string> = {
  andachtsbesuch: "Regelmaessiger Andachtsbesuch",
  "vollzeit-perspektive": "Perspektive Vollzeit / mind. 75%",
  belastbarkeit: "Belastbarkeit",
  "gutes-miteinander": "Gutes Miteinander (Kollegium, Schueler, Eltern)",
  "besondere-aufgaben": "Bereitschaft besondere Aufgaben zu uebernehmen",
  klassenleitung: "Klassenleitung uebernommen",
  "engagement-schule": "Engagement für Schule sichtbar",
  "identifikation-fes": "Identifikation mit Grundsaetzen FES Minden",
  "grundsaetze-gelebt": "Grundsaetze der FES werden gelebt",
  zielvereinbarungen: "Zielvereinbarungen vereinbart",
  gemeindemitgliedschaft: "Aktive Gemeindemitgliedschaft",
  "mitarbeit-gemeinde": "Mitarbeit in der Gemeinde",
};
