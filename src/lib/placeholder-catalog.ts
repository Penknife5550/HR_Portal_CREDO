/**
 * Platzhalter-Katalog je Modul — client-sichere Single Source fuer den
 * Vorlagen-Editor (welche {variablen} bietet ein Modul an?).
 *
 * Bewusst OHNE Server-Imports (prisma etc.), damit auch Client-Komponenten ihn
 * direkt nutzen koennen. Die Keys entsprechen den vom jeweiligen Modul-Resolver
 * (src/lib/doc-template-resolvers.ts) gelieferten Platzhaltern.
 */

export interface PlaceholderDef {
  /** Variablenname OHNE geschweifte Klammern, z.B. "vorname". */
  key: string;
  /** Deutsche Beschreibung fuer die UI. */
  label: string;
  /** Beispielwert (UI-Hilfe). */
  example?: string;
  /** Gruppierung in der UI. */
  group?: string;
  /** Sensibles Feld (wird entschluesselt + auditiert). */
  sensitive?: boolean;
}

/** Allgemeine Platzhalter (commonPlaceholders) — fuer ALLE Module verfuegbar. */
export const ALLGEMEIN_PLACEHOLDERS: PlaceholderDef[] = [
  { key: "datum", label: "Aktuelles Datum", example: "16.06.2026", group: "Allgemein" },
  { key: "jahr", label: "Aktuelles Jahr", example: "2026", group: "Allgemein" },
  { key: "mandant", label: "Einrichtung (Name)", example: "Gymnasium", group: "Mandant" },
  { key: "mandant_name", label: "Einrichtung (Name)", example: "Gymnasium", group: "Mandant" },
  { key: "mandant_kuerzel", label: "Einrichtung (Kuerzel)", example: "GYM", group: "Mandant" },
  { key: "mandant_nummer", label: "Mandantennummer", example: "712", group: "Mandant" },
  { key: "verantwortliche_stelle", label: "Verantwortliche Stelle (DSGVO)", example: "Christlicher Schulverein Minden e.V.", group: "Verantwortliche Stelle" },
  { key: "verantwortliche_strasse", label: "Strasse (verantw. Stelle)", group: "Verantwortliche Stelle" },
  { key: "verantwortliche_plz", label: "PLZ (verantw. Stelle)", group: "Verantwortliche Stelle" },
  { key: "verantwortliche_ort", label: "Ort (verantw. Stelle)", group: "Verantwortliche Stelle" },
];

/** Onboarding-spezifische Platzhalter (aus Personal-/Vorgesetzten-Daten). */
export const ONBOARDING_PLACEHOLDERS: PlaceholderDef[] = [
  { key: "anrede", label: "Anrede", example: "Frau", group: "Person" },
  { key: "titel", label: "Titel", example: "Dr.", group: "Person" },
  { key: "vorname", label: "Vorname", example: "Erika", group: "Person" },
  { key: "nachname", label: "Nachname", example: "Mustermann", group: "Person" },
  { key: "name", label: "Voller Name", example: "Erika Mustermann", group: "Person" },
  { key: "geburtsname", label: "Geburtsname", group: "Person" },
  { key: "geburtsdatum", label: "Geburtsdatum", example: "01.01.1990", group: "Person" },
  { key: "geburtsort", label: "Geburtsort", group: "Person" },
  { key: "staatsangehoerigkeit", label: "Staatsangehoerigkeit", group: "Person" },
  { key: "familienstand", label: "Familienstand", group: "Person" },
  { key: "vorgangsnummer", label: "Vorgangsnummer", example: "2026-GYM-001", group: "Vorgang" },
  { key: "strasse", label: "Strasse + Hausnummer", example: "Musterweg 1", group: "Adresse" },
  { key: "plz", label: "PLZ", example: "32425", group: "Adresse" },
  { key: "ort", label: "Ort", example: "Minden", group: "Adresse" },
  { key: "plz_ort", label: "PLZ + Ort", example: "32425 Minden", group: "Adresse" },
  { key: "telefon", label: "Telefon", group: "Adresse" },
  { key: "mobil", label: "Mobilnummer", group: "Adresse" },
  { key: "email", label: "E-Mail (dienstlich)", group: "Adresse" },
  { key: "email_privat", label: "E-Mail (privat)", group: "Adresse" },
  { key: "iban", label: "IBAN", group: "Bank", sensitive: true },
  { key: "bic", label: "BIC", group: "Bank" },
  { key: "bank", label: "Bank", group: "Bank" },
  { key: "kontoinhaber", label: "Kontoinhaber", group: "Bank" },
  { key: "sv_nummer", label: "Sozialversicherungsnummer", group: "SV & Steuer", sensitive: true },
  { key: "krankenkasse", label: "Krankenkasse", group: "SV & Steuer" },
  { key: "steuer_id", label: "Steuer-ID", group: "SV & Steuer", sensitive: true },
  { key: "steuerklasse", label: "Steuerklasse", group: "SV & Steuer" },
  { key: "religion", label: "Religion (Kirchensteuer)", group: "SV & Steuer" },
  { key: "schulabschluss", label: "Hoechster Schulabschluss", group: "Bildung" },
  { key: "berufsausbildung", label: "Hoechste Berufsausbildung", group: "Bildung" },
  { key: "eintrittsdatum", label: "Eintrittsdatum / Vertragsbeginn", example: "01.09.2026", group: "Vertrag" },
  { key: "vertragsende", label: "Vertragsende (bei Befristung)", group: "Vertrag" },
  { key: "stellenbeschreibung", label: "Stellenbeschreibung", group: "Vertrag" },
  { key: "betriebsstaette", label: "Betriebsstaette", group: "Vertrag" },
  { key: "entgeltgruppe", label: "Entgeltgruppe", example: "E11", group: "Vertrag" },
  { key: "stufe", label: "Stufe", group: "Vertrag" },
  { key: "wochenstunden", label: "Wochenstunden", example: "39", group: "Vertrag" },
  { key: "probezeit_monate", label: "Probezeit (Monate)", example: "6", group: "Vertrag" },
  { key: "urlaubstage", label: "Urlaubstage pro Jahr", example: "30", group: "Vertrag" },
];

/**
 * Verfuegbare Platzhalter je Modul. Module ohne eigenen Resolver erhalten die
 * allgemeinen Platzhalter (Fallback ALLGEMEIN-Resolver). Onboarding ergaenzt die
 * vorgangsspezifischen Felder.
 */
export const PLACEHOLDER_CATALOG: Record<string, PlaceholderDef[]> = {
  ALLGEMEIN: ALLGEMEIN_PLACEHOLDERS,
  ONBOARDING: [...ALLGEMEIN_PLACEHOLDERS, ...ONBOARDING_PLACEHOLDERS],
  OFFBOARDING: ALLGEMEIN_PLACEHOLDERS,
  VERBEAMTUNG: ALLGEMEIN_PLACEHOLDERS,
  MUTTERSCHUTZ: ALLGEMEIN_PLACEHOLDERS,
  ELTERNZEIT: ALLGEMEIN_PLACEHOLDERS,
  BEM: ALLGEMEIN_PLACEHOLDERS,
};

/** Liefert die verfuegbaren Platzhalter fuer ein Modul (Fallback: ALLGEMEIN). */
export function getPlaceholderCatalog(modul: string): PlaceholderDef[] {
  return PLACEHOLDER_CATALOG[(modul ?? "").toUpperCase()] ?? ALLGEMEIN_PLACEHOLDERS;
}
