/**
 * Platzhalter-Katalog je Modul — client-sichere Single Source fuer den
 * Vorlagen-Editor (welche {variablen} bietet ein Modul an?).
 *
 * Bewusst OHNE Server-Imports (prisma etc.), damit auch Client-Komponenten ihn
 * direkt nutzen koennen. Die Keys entsprechen den vom jeweiligen Modul-Resolver
 * (src/lib/doc-template-resolvers.ts) gelieferten Platzhaltern.
 */

/**
 * Modul-Auswahl fuer die UI (Wert + Anzeige). Liegt hier statt in
 * doc-template-resolvers.ts, damit Client-Komponenten sie ohne Server-Import
 * (prisma) nutzen koennen; der Resolver re-exportiert sie.
 */
export const AVAILABLE_MODULES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "ALLGEMEIN", label: "Allgemein" },
  { value: "BEM", label: "BEM" },
  { value: "ONBOARDING", label: "Onboarding" },
  { value: "VERTRAGSVERLAENGERUNG", label: "Vertragsverlängerung" },
  { value: "OFFBOARDING", label: "Offboarding" },
  { value: "VERBEAMTUNG", label: "Verbeamtung" },
  { value: "MUTTERSCHUTZ", label: "Mutterschutz" },
  { value: "ELTERNZEIT", label: "Elternzeit" },
];

export const MODULE_VALUES = AVAILABLE_MODULES.map((m) => m.value);

/** Anzeigename eines Moduls; unbekannte Werte werden unveraendert zurueckgegeben. */
export function moduleLabel(value: string): string {
  return AVAILABLE_MODULES.find((m) => m.value === value)?.label || value;
}

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
  // Kontaktdaten der Person, die das Dokument erzeugt (angemeldeter Benutzer).
  // Bewusst mit Praefix: {name}/{email}/{telefon} sind in Onboarding und
  // Vertragsverlaengerung bereits durch die MITARBEITER-Daten belegt.
  { key: "sachbearbeiter_name", label: "Sachbearbeiter (voller Name)", example: "Dimitri Riesen", group: "Sachbearbeiter" },
  { key: "sachbearbeiter_vorname", label: "Sachbearbeiter (Vorname)", example: "Dimitri", group: "Sachbearbeiter" },
  { key: "sachbearbeiter_nachname", label: "Sachbearbeiter (Nachname)", example: "Riesen", group: "Sachbearbeiter" },
  { key: "sachbearbeiter_email", label: "Sachbearbeiter (E-Mail)", example: "dimitri@credo-gruppe.de", group: "Sachbearbeiter" },
  { key: "sachbearbeiter_telefon", label: "Sachbearbeiter (Telefon)", example: "0571 / 88 79 - 120", group: "Sachbearbeiter" },
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
 * Vertragsverlaengerungs-Platzhalter (aus ContractEndProcess + ContractRenewalData).
 * Person aus den Vorgangs-Stammdaten, Konditionen aus den vom Vorgesetzten
 * erfassten Verlaengerungsdaten.
 */
export const VERTRAGSVERLAENGERUNG_PLACEHOLDERS: PlaceholderDef[] = [
  { key: "vorname", label: "Vorname", example: "Erika", group: "Person" },
  { key: "nachname", label: "Nachname", example: "Mustermann", group: "Person" },
  { key: "name", label: "Voller Name", example: "Erika Mustermann", group: "Person" },
  { key: "personalnummer", label: "Personalnummer", group: "Person" },
  { key: "vorgangsnummer", label: "Vorgangsnummer", example: "VE-2026-GYM-001", group: "Vorgang" },
  { key: "altes_vertragsende", label: "Bisheriges Vertragsende", example: "31.08.2026", group: "Bisheriger Vertrag" },
  { key: "neuer_vertragsbeginn", label: "Neuer Vertragsbeginn", example: "01.09.2026", group: "Neuer Vertrag" },
  { key: "neues_vertragsende", label: "Neues Vertragsende (bei Befristung)", example: "31.08.2027", group: "Neuer Vertrag" },
  { key: "befristung_sachgrund", label: "Sachgrund der Befristung", group: "Neuer Vertrag" },
  { key: "wochenstunden", label: "Wochenstunden", example: "39", group: "Neuer Vertrag" },
  { key: "entgeltgruppe", label: "Entgeltgruppe", example: "E11", group: "Neuer Vertrag" },
  { key: "stufe", label: "Stufe", group: "Neuer Vertrag" },
  { key: "urlaubstage", label: "Urlaubstage pro Jahr", example: "30", group: "Neuer Vertrag" },
  { key: "probezeit_monate", label: "Probezeit (Monate)", group: "Neuer Vertrag" },
  { key: "stellenbeschreibung", label: "Stellenbeschreibung", group: "Neuer Vertrag" },
  { key: "betriebsstaette", label: "Betriebsstaette", group: "Neuer Vertrag" },
  // Person (DokuBit) — Stammdaten aus der n8n-Meldung (dokubitDaten)
  { key: "anrede", label: "Anrede", example: "Frau", group: "Person (DokuBit)" },
  { key: "titel", label: "Titel", group: "Person (DokuBit)" },
  { key: "grad", label: "Akademischer Grad", group: "Person (DokuBit)" },
  { key: "strasse", label: "Strasse", group: "Person (DokuBit)" },
  { key: "plz", label: "PLZ", group: "Person (DokuBit)" },
  { key: "ort", label: "Ort", group: "Person (DokuBit)" },
  { key: "geburtsdatum", label: "Geburtsdatum", example: "01.01.1990", group: "Person (DokuBit)" },
  { key: "geburtsort", label: "Geburtsort", group: "Person (DokuBit)" },
  { key: "geschlecht", label: "Geschlecht", group: "Person (DokuBit)" },
  { key: "qualifikation", label: "Qualifikation", group: "Person (DokuBit)" },
  // Aktueller (auslaufender) Vertrag (DokuBit)
  { key: "aktuelle_position", label: "Aktuelle Position", group: "Aktueller Vertrag (DokuBit)" },
  { key: "aktuelle_entgeltgruppe", label: "Aktuelle Entgeltgruppe", example: "E11", group: "Aktueller Vertrag (DokuBit)" },
  { key: "aktuelle_stufe", label: "Aktuelle Stufe", group: "Aktueller Vertrag (DokuBit)" },
  { key: "aktuelle_wochenstunden", label: "Aktuelle Wochenstunden", example: "25,5", group: "Aktueller Vertrag (DokuBit)" },
  { key: "tarif", label: "Tarif", example: "TV-L", group: "Aktueller Vertrag (DokuBit)" },
  { key: "vertragsart", label: "Vertragsart", group: "Aktueller Vertrag (DokuBit)" },
  { key: "beschaeftigungsgruppe", label: "Beschaeftigungsgruppe", group: "Aktueller Vertrag (DokuBit)" },
  { key: "abrechnungskreis", label: "Abrechnungskreis", group: "Aktueller Vertrag (DokuBit)" },
  { key: "mitarbeiter_status", label: "Mitarbeiter-Status", group: "Aktueller Vertrag (DokuBit)" },
  { key: "konzerneintritt", label: "Konzerneintritt", example: "01.08.2015", group: "Aktueller Vertrag (DokuBit)" },
  { key: "regelaltersgrenze", label: "Regelaltersgrenze", group: "Aktueller Vertrag (DokuBit)" },
  { key: "probezeit_von", label: "Probezeit von", group: "Aktueller Vertrag (DokuBit)" },
  { key: "probezeit_bis", label: "Probezeit bis", group: "Aktueller Vertrag (DokuBit)" },
  { key: "probezeit_dauer", label: "Probezeit-Dauer", group: "Aktueller Vertrag (DokuBit)" },
  { key: "probezeit_einheit", label: "Probezeit-Einheit", group: "Aktueller Vertrag (DokuBit)" },
  { key: "evtl_lda", label: "Evtl. letzter Arbeitstag (EVTLLDA)", group: "Aktueller Vertrag (DokuBit)" },
];

/**
 * BEM-spezifische Platzhalter (aus src/lib/bem-doc.ts).
 *
 * Bewusst NUR nicht-sensible Felder — gesundheitsbezogene Freitexte werden vom
 * BEM-Resolver nicht aufgeloest (Aktentrennung, § 167 SGB IX) und duerfen daher
 * auch hier nicht als verfuegbar angeboten werden.
 */
export const BEM_PLACEHOLDERS: PlaceholderDef[] = [
  { key: "fall_nummer", label: "Fall-Nummer", example: "BEM-2026-GYM-001", group: "Vorgang" },
  { key: "vorname", label: "Vorname", example: "Erika", group: "Person" },
  { key: "nachname", label: "Nachname", example: "Mustermann", group: "Person" },
  { key: "name", label: "Voller Name", example: "Erika Mustermann", group: "Person" },
  { key: "empfaenger", label: "Empfaenger (voller Name)", example: "Erika Mustermann", group: "Person" },
  { key: "email", label: "E-Mail", group: "Person" },
  { key: "personalnummer", label: "Personalnummer", group: "Person" },
  { key: "fehlzeiten_ab", label: "Fehlzeiten ab", example: "15.01.2026", group: "Fristen" },
  { key: "einladung_am", label: "Einladung am", example: "01.02.2026", group: "Fristen" },
  { key: "einwilligung_am", label: "Einwilligung am", example: "10.02.2026", group: "Fristen" },
  { key: "erstgespraech_am", label: "Erstgespraech am", example: "20.02.2026", group: "Fristen" },
];

/**
 * Verfuegbare Platzhalter je Modul. Module ohne eigenen Resolver erhalten die
 * allgemeinen Platzhalter (Fallback ALLGEMEIN-Resolver). Onboarding ergaenzt die
 * vorgangsspezifischen Felder.
 */
export const PLACEHOLDER_CATALOG: Record<string, PlaceholderDef[]> = {
  ALLGEMEIN: ALLGEMEIN_PLACEHOLDERS,
  ONBOARDING: [...ALLGEMEIN_PLACEHOLDERS, ...ONBOARDING_PLACEHOLDERS],
  VERTRAGSVERLAENGERUNG: [...ALLGEMEIN_PLACEHOLDERS, ...VERTRAGSVERLAENGERUNG_PLACEHOLDERS],
  OFFBOARDING: ALLGEMEIN_PLACEHOLDERS,
  VERBEAMTUNG: ALLGEMEIN_PLACEHOLDERS,
  MUTTERSCHUTZ: ALLGEMEIN_PLACEHOLDERS,
  ELTERNZEIT: ALLGEMEIN_PLACEHOLDERS,
  BEM: [...ALLGEMEIN_PLACEHOLDERS, ...BEM_PLACEHOLDERS],
};

/** Liefert die verfuegbaren Platzhalter fuer ein Modul (Fallback: ALLGEMEIN). */
export function getPlaceholderCatalog(modul: string): PlaceholderDef[] {
  return PLACEHOLDER_CATALOG[(modul ?? "").toUpperCase()] ?? ALLGEMEIN_PLACEHOLDERS;
}
