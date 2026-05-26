/**
 * Pflicht-Dokumente fuer den Personalfragebogen (Task P9).
 *
 * Welche Dokumente verpflichtend sind, ist pro Formular-Vorlage konfigurierbar
 * (FormTemplate.requiredDocuments). Dieser Helper liefert die Anzeige-Labels und
 * berechnet fehlende Pflicht-Dokumente — gemeinsam genutzt von Client (Hinweis +
 * Submit-Sperre) und Server (harte Durchsetzung beim Absenden).
 */
import type { DocumentType } from "@prisma/client";

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  ARBEITSVERTRAG: "Arbeitsvertrag",
  FUEHRUNGSZEUGNIS: "Führungszeugnis",
  KK_BESCHEINIGUNG: "Mitgliedsbescheinigung Krankenkasse",
  GEBURTSURKUNDE_EIGEN: "Kopie Ihrer Geburtsurkunde",
  GEBURTSURKUNDE_KIND: "Geburtsurkunde(n) der Kinder",
  SV_AUSWEIS: "Sozialversicherungsausweis",
  ZEUGNIS: "Zeugnis / Qualifikationsnachweis",
  ABSCHLUSSZEUGNIS: "Abschlusszeugnis",
  MASERNSCHUTZ: "Masernschutz-Nachweis",
  INFEKTIONSSCHUTZ: "Infektionsschutz-Belehrung",
  RV_BEFREIUNG: "Antrag RV-Befreiung (Minijob)",
  SB_AUSWEIS: "Schwerbehindertenausweis",
  VL_VERTRAG: "VL-Vertrag (Vermögenswirksame Leistungen)",
  BAV_VERTRAG: "bAV-Vertrag (Altersvorsorge)",
  SONSTIGES: "Sonstiges Dokument",
};

/** Alle waehlbaren Dokumenttypen fuer die Vorlagen-Konfiguration. */
export const SELECTABLE_DOCUMENT_TYPES: DocumentType[] = [
  "GEBURTSURKUNDE_EIGEN",
  "GEBURTSURKUNDE_KIND",
  "MASERNSCHUTZ",
  "SV_AUSWEIS",
  "KK_BESCHEINIGUNG",
  "FUEHRUNGSZEUGNIS",
  "INFEKTIONSSCHUTZ",
  "ABSCHLUSSZEUGNIS",
  "ZEUGNIS",
  "SB_AUSWEIS",
  "RV_BEFREIUNG",
  "VL_VERTRAG",
  "BAV_VERTRAG",
  "ARBEITSVERTRAG",
  "SONSTIGES",
] as DocumentType[];

export function documentTypeLabel(t: string): string {
  return DOCUMENT_TYPE_LABELS[t] ?? t;
}

/**
 * Ermittelt die fehlenden Pflicht-Dokumente.
 * GEBURTSURKUNDE_KIND wird nur verlangt, wenn der Mitarbeiter Kinder hat.
 */
export function computeMissingRequiredDocuments(opts: {
  required: readonly string[];
  uploadedTypes: readonly string[];
  hasChildren: boolean;
}): string[] {
  const uploaded = new Set(opts.uploadedTypes);
  return opts.required.filter((t) => {
    if (t === "GEBURTSURKUNDE_KIND" && !opts.hasChildren) return false;
    return !uploaded.has(t);
  });
}
