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
  { key: "befristung_art", label: "Art der Befristung", example: "Zweckbefristung (Ende bei Zweckerreichung)", group: "Vertrag" },
  { key: "vertragsende", label: "Vertragsende (nur bei festem Enddatum)", example: "31.08.2027", group: "Vertrag" },
  { key: "befristung_zweck", label: "Zweckbefristung: wodurch der Vertrag endet", example: "Ende der Kostenzusage des Jugendamtes", group: "Vertrag" },
  { key: "vertragsende_voraussichtlich", label: "Voraussichtliches Ende (unverbindlich)", example: "31.08.2027", group: "Vertrag" },
  { key: "befristung_sachgrund", label: "Sachgrund der Befristung", example: "Projektbezogen", group: "Vertrag" },
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
 * Platzhalter des Offboarding-Moduls (Resolver: offboardingResolver).
 *
 * Anschrift, Anrede, Titel, Geburtsort, Position und Wochenstunden gibt es NUR
 * bei Vorgaengen, die aus einem Vertragsende entstanden sind — bei von Hand
 * angelegten Offboardings hat das Portal keine Postanschrift der Person. Leere
 * Werte setzt der Resolver bewusst nicht, dann rendert die Vorlage "___" und
 * zaehlt das Feld als fehlend.
 *
 * BEWUSST NICHT enthalten: Antworten aus dem Exit-Interview und die Freitexte
 * der Zeugnis-Bewertung. Das Exit-Interview ist eine Vertrauensbefragung; ein
 * Platzhalter daraus truege sie in ein Schreiben an genau die Person, die sie
 * im Vertrauen gegeben hat.
 */
export const OFFBOARDING_PLACEHOLDERS: PlaceholderDef[] = [
  // Person
  { key: "vorname", label: "Vorname", example: "Erika", group: "Person" },
  { key: "nachname", label: "Nachname", example: "Mustermann", group: "Person" },
  { key: "name", label: "Voller Name", example: "Erika Mustermann", group: "Person" },
  { key: "anrede", label: "Anrede", example: "Frau", group: "Person" },
  { key: "titel", label: "Titel", example: "Dr.", group: "Person" },
  { key: "geschlecht", label: "Geschlecht (fuer Anrede-Wenn/Dann)", example: "weiblich", group: "Person" },
  { key: "personalnummer", label: "Personalnummer", example: "100234", group: "Person" },
  { key: "geburtsdatum", label: "Geburtsdatum", example: "01.01.1980", group: "Person" },
  { key: "geburtsort", label: "Geburtsort", example: "Minden", group: "Person" },
  { key: "email", label: "E-Mail (dienstlich)", example: "e.mustermann@fes-minden.de", group: "Person" },
  { key: "email_privat", label: "E-Mail (privat)", group: "Person" },
  { key: "telefon", label: "Telefon", group: "Person" },

  // Adresse
  { key: "strasse", label: "Strasse + Hausnummer", example: "Musterweg 1", group: "Adresse" },
  { key: "plz", label: "PLZ", example: "32425", group: "Adresse" },
  { key: "ort", label: "Ort", example: "Minden", group: "Adresse" },
  { key: "plz_ort", label: "PLZ + Ort", example: "32425 Minden", group: "Adresse" },

  // Vorgang
  { key: "vorgangsnummer", label: "Vorgangsnummer", example: "OFF-2026-GYM-001", group: "Vorgang" },

  // Austritt
  { key: "austrittsart", label: "Austrittsart", example: "Aufhebungsvertrag", group: "Austritt" },
  { key: "austrittsgrund", label: "Austrittsgrund (Freitext)", group: "Austritt" },
  { key: "kuendigungsdatum", label: "Datum der Kuendigung", example: "31.03.2026", group: "Austritt" },
  { key: "kuendigungsfrist_ende", label: "Ende der Kuendigungsfrist", example: "30.06.2026", group: "Austritt" },
  { key: "letzter_arbeitstag", label: "Letzter Arbeitstag", example: "30.06.2026", group: "Austritt" },
  { key: "vertragsende", label: "Vertragsende (rechtliches Ende des Arbeitsverhaeltnisses)", example: "30.06.2026", group: "Austritt" },
  { key: "eintrittsdatum", label: "Vertragsbeginn (Beschaeftigung seit)", example: "01.08.2015", group: "Austritt" },
  { key: "konzerneintritt", label: "Konzerneintritt", example: "01.08.2010", group: "Austritt" },

  // Beschaeftigung
  { key: "position", label: "Position / Taetigkeit", example: "Lehrkraft", group: "Beschaeftigung" },
  { key: "beschaeftigungsart", label: "Beschaeftigungsart", example: "ANGESTELLT", group: "Beschaeftigung" },
  { key: "tarifvertrag", label: "Tarifvertrag", example: "TV-L", group: "Beschaeftigung" },
  { key: "entgeltgruppe", label: "Entgeltgruppe", example: "E11", group: "Beschaeftigung" },
  { key: "stufe", label: "Stufe", example: "4", group: "Beschaeftigung" },
  { key: "wochenstunden", label: "Wochenstunden", example: "25,5", group: "Beschaeftigung" },
  { key: "wettbewerbsverbot", label: "Nachvertragliches Wettbewerbsverbot (Ja/Nein)", example: "Nein", group: "Beschaeftigung" },
  { key: "nachfolger", label: "Nachfolger:in (Uebergabe)", group: "Beschaeftigung" },

  // Abrechnung
  { key: "resturlaub_tage", label: "Resturlaub (Tage)", example: "12,5", group: "Abrechnung" },
  { key: "urlaubsauszahlung", label: "Urlaubsauszahlung (EUR)", example: "1.234,56", group: "Abrechnung" },
  { key: "ueberstunden", label: "Ueberstunden", example: "37,5", group: "Abrechnung" },
  { key: "ueberstundenauszahlung", label: "Ueberstundenauszahlung (EUR)", example: "890,00", group: "Abrechnung" },
  { key: "abfindung", label: "Abfindung", example: "15.000,00 EUR", group: "Abrechnung", sensitive: true },

  // Zeugnis
  { key: "zeugnisart", label: "Zeugnisart", example: "Qualifiziertes Arbeitszeugnis", group: "Zeugnis" },
  { key: "zeugnis_berufsgruppe", label: "Berufsgruppe der Zeugnis-Bewertung", example: "Lehrkraft", group: "Zeugnis" },
  { key: "zeugnis_note", label: "Gesamtnote des Zeugnisses (1-6)", example: "2", group: "Zeugnis" },
  { key: "zeugnis_note_text", label: "Gesamtnote in Worten", example: "Gut", group: "Zeugnis" },
  { key: "zeugnis_gesamtformulierung", label: "Zufriedenheitsformel fuer das Zeugnis", example: "stets zu unserer vollen Zufriedenheit", group: "Zeugnis" },
  { key: "beurteiler_name", label: "Bewertende Fuehrungskraft", example: "Thomas Schmidt", group: "Zeugnis" },

  // Rueckgaben
  { key: "rueckgaben_liste", label: "Zurueckgegebene Gegenstaende (eine Zeile je Eintrag)", example: "Laptop Dell Latitude (SN: ABC123), zurueck am 30.06.2026", group: "Rueckgaben" },
  { key: "rueckgaben_offen_liste", label: "Noch offene Rueckgaben (eine Zeile je Eintrag)", example: "Schluessel Haupteingang", group: "Rueckgaben" },
  { key: "rueckgaben_offen_anzahl", label: "Anzahl offener Rueckgaben", example: "2", group: "Rueckgaben" },
];

/**
 * Platzhalter des Verbeamtungs-Moduls (Resolver: verbeamtungResolver).
 *
 * BEWUSST NICHT enthalten: der Gesamtschnitt der Beurteilungen. Der
 * Schema-Kommentar sagt dazu woertlich "KEIN Gesamturteil" — die Zahl in einem
 * Schreiben an die Bezirksregierung waere fachlich falsch. Das Gesamturteil ist
 * das manuell gesetzte Feld nach BRL Nr. 7.5.
 *
 * Die br_*- und gf_*-Platzhalter lesen Mandanten-Stammdaten, die heute bei
 * KEINEM der 16 Mandanten gepflegt sind (Stand 02.09.2026) und in der
 * Oberflaeche unter "Elternzeit-Konfiguration" liegen, obwohl das Datenmodell
 * sie fuer die Verbeamtung vorsieht. Sie bleiben also vorerst leer — sichtbar
 * als "___", nicht als stille Luecke.
 */
export const VERBEAMTUNG_PLACEHOLDERS: PlaceholderDef[] = [
  // Vorgang
  { key: "vorgangsnummer", label: "Vorgangsnummer", example: "PSI-2026-GYM-001", group: "Vorgang" },
  { key: "verbeamtungsart", label: "Art der Uebernahme", example: "PSI auf Probe", group: "Vorgang" },
  { key: "vorgang_status", label: "Status des Vorgangs", example: "Verwaltung", group: "Vorgang" },
  { key: "antrag_eingereicht_am", label: "Antrag eingereicht am", example: "14.03.2026", group: "Vorgang" },

  // Person
  { key: "vorname", label: "Vorname", example: "Erika", group: "Person" },
  { key: "nachname", label: "Nachname", example: "Mustermann", group: "Person" },
  { key: "name", label: "Voller Name", example: "Erika Mustermann", group: "Person" },
  { key: "email", label: "E-Mail (dienstlich)", group: "Person" },
  { key: "personalnummer", label: "Personalnummer", group: "Person" },
  { key: "geburtsdatum", label: "Geburtsdatum", example: "01.01.1990", group: "Person" },
  { key: "telefon", label: "Telefon", group: "Person" },
  { key: "email_privat", label: "E-Mail (privat)", group: "Person" },

  // Dienstverhaeltnis
  { key: "geplanter_beginn", label: "Geplanter Beginn des Dienstverhaeltnisses", example: "01.08.2026", group: "Dienstverhaeltnis" },
  { key: "probezeit_beginn", label: "Beginn der Probezeit", example: "01.08.2026", group: "Dienstverhaeltnis" },
  { key: "probezeit_ende", label: "Ende der Probezeit", example: "31.07.2029", group: "Dienstverhaeltnis" },
  { key: "abgeschlossen_am", label: "Vorgang abgeschlossen am", group: "Dienstverhaeltnis" },
  { key: "besoldungsgruppe", label: "Besoldungsgruppe", example: "A13", group: "Dienstverhaeltnis" },
  { key: "erfahrungsstufe", label: "Erfahrungsstufe", example: "5", group: "Dienstverhaeltnis" },

  // Antrag der Lehrkraft
  { key: "faecher", label: "Faecherkombination", example: "Deutsch, Mathematik", group: "Antrag der Lehrkraft" },
  { key: "stellenumfang_prozent", label: "Stellenumfang in Prozent (Angabe der Lehrkraft)", example: "100", group: "Antrag der Lehrkraft" },
  { key: "gemeinde", label: "Gemeinde und Dienstbereich", example: "FeG Minden, Jugendarbeit", group: "Antrag der Lehrkraft" },
  { key: "vebs_seminar_am", label: "VEBS-Grundlagenseminar besucht am", example: "12.10.2025", group: "Antrag der Lehrkraft" },
  { key: "antrag_erklaerung", label: "Erklaerung der Lehrkraft zum Antrag", group: "Antrag der Lehrkraft" },

  // Beteiligte
  { key: "schulleitung_name", label: "Schulleitung (Name)", group: "Beteiligte" },
  { key: "schulleitung_email", label: "Schulleitung (E-Mail)", group: "Beteiligte" },
  { key: "amtsarzt_email", label: "Amtsaerztlicher Dienst (E-Mail)", group: "Beteiligte" },
  { key: "beirat_email", label: "Beirat (E-Mail)", group: "Beteiligte" },

  // Bezirksregierung
  { key: "br_kontakt", label: "Bezirksregierung Detmold — Ansprechpartner / Dezernat", example: "Dezernat 41", group: "Bezirksregierung" },
  { key: "br_email", label: "Bezirksregierung Detmold — E-Mail", group: "Bezirksregierung" },
  { key: "br_telefon", label: "Bezirksregierung Detmold — Telefon", example: "+49 5231 71-0", group: "Bezirksregierung" },
  { key: "br_aktenzeichen_prefix", label: "Bezirksregierung Detmold — Aktenzeichen-Prefix", group: "Bezirksregierung" },

  // Unterschrift
  { key: "gf_name", label: "Geschaeftsfuehrung (Name, Unterschrift)", group: "Unterschrift" },
  { key: "gf_funktion", label: "Geschaeftsfuehrung (Funktionsbezeichnung)", example: "Geschaeftsfuehrer", group: "Unterschrift" },

  // Beurteilungen
  { key: "beurteilung_1_am", label: "1. Dienstliche Beurteilung eingereicht am", example: "20.02.2026", group: "Beurteilungen" },
  { key: "beurteilung_1_ergebnis", label: "1. Dienstliche Beurteilung — Gesamturteil", example: "Anforderungen erfuellt", group: "Beurteilungen" },
  { key: "beurteilung_2_am", label: "2. Dienstliche Beurteilung eingereicht am", group: "Beurteilungen" },
  { key: "beurteilung_2_ergebnis", label: "2. Dienstliche Beurteilung — Gesamturteil", group: "Beurteilungen" },
  { key: "beurteilung_3_am", label: "3. Dienstliche Beurteilung eingereicht am", group: "Beurteilungen" },
  { key: "beurteilung_3_ergebnis", label: "3. Dienstliche Beurteilung — Gesamturteil", group: "Beurteilungen" },
  { key: "referenz_1_am", label: "1. Schriftliche Referenz eingereicht am", group: "Beurteilungen" },
  { key: "referenz_2_am", label: "2. Schriftliche Referenz eingereicht am", group: "Beurteilungen" },

  // Beirat
  { key: "beirat_entscheidung", label: "Entscheidung des Beirats", example: "Zustimmung", group: "Beirat" },
  { key: "beirat_entscheidung_am", label: "Entscheidung des Beirats am", example: "05.05.2026", group: "Beirat" },
  { key: "beirat_entscheidung_art", label: "Entscheidung des Beirats — betrifft", example: "PSI auf Probe", group: "Beirat" },
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
  OFFBOARDING: [...ALLGEMEIN_PLACEHOLDERS, ...OFFBOARDING_PLACEHOLDERS],
  VERBEAMTUNG: [...ALLGEMEIN_PLACEHOLDERS, ...VERBEAMTUNG_PLACEHOLDERS],
  MUTTERSCHUTZ: ALLGEMEIN_PLACEHOLDERS,
  ELTERNZEIT: ALLGEMEIN_PLACEHOLDERS,
  BEM: [...ALLGEMEIN_PLACEHOLDERS, ...BEM_PLACEHOLDERS],
};

/** Liefert die verfuegbaren Platzhalter fuer ein Modul (Fallback: ALLGEMEIN). */
export function getPlaceholderCatalog(modul: string): PlaceholderDef[] {
  return PLACEHOLDER_CATALOG[(modul ?? "").toUpperCase()] ?? ALLGEMEIN_PLACEHOLDERS;
}

// =============================================
// Sensible Platzhalter — Grundlage der Bestaetigungspflicht beim Paketversand
// =============================================

/** Ein sensibles Feld, das eine Vorlage tatsaechlich verwendet. */
export interface SensiblesFeld {
  /** Platzhaltername ohne Klammern, z.B. "iban". */
  key: string;
  /** Deutsche Beschreibung fuer die Bestaetigung im Dialog. */
  label: string;
}

/**
 * Alle als `sensitive` markierten Platzhalter des gesamten Katalogs, nach Key.
 *
 * BEWUSST modul-uebergreifend und nicht je Modul: Eine Vorlage traegt ihr
 * eigenes Modul (oft ALLGEMEIN), gefuellt wird sie aber vom Resolver des
 * **Vorgangs**. Eine ALLGEMEIN-Vorlage mit {iban} bekommt in einem
 * Onboarding-Paket die echte IBAN — eine Pruefung gegen den ALLGEMEIN-Katalog
 * wuerde sie fuer harmlos halten und ohne Bestaetigung verschicken.
 *
 * Die Reihenfolge folgt dem Katalog, nicht der Vorlage: Der Nachweis soll bei
 * gleicher Vorlage immer dieselbe Liste zeigen.
 */
const SENSIBLE_FELDER: readonly SensiblesFeld[] = (() => {
  const gesehen = new Map<string, SensiblesFeld>();
  for (const defs of Object.values(PLACEHOLDER_CATALOG)) {
    for (const def of defs) {
      if (def.sensitive && !gesehen.has(def.key)) {
        gesehen.set(def.key, { key: def.key, label: def.label });
      }
    }
  }
  return Array.from(gesehen.values());
})();

/** Keys aller sensiblen Platzhalter (klein geschrieben) — fuer schnelle Pruefungen. */
export const SENSIBLE_PLATZHALTER_KEYS: ReadonlySet<string> = new Set(
  SENSIBLE_FELDER.map((f) => f.key.toLowerCase()),
);

/**
 * Bringt einen Platzhalternamen auf die Form des Katalogs.
 *
 * Der Extraktor legt die Namen so ab, wie sie in der .docx stehen — inklusive
 * Grossschreibung. Wir vergleichen deshalb ohne Ruecksicht auf Gross- und
 * Kleinschreibung und entfernen vorsichtshalber Klammern und Punkt-Notation.
 */
function normalisiere(name: string): string {
  return name
    .trim()
    .replace(/^\{+|\}+$/g, "")
    .trim()
    .split(".")[0]
    .toLowerCase();
}

/**
 * Welche sensiblen Felder verwendet diese Vorlage?
 *
 * Rein rechnerisch: kein Datenbankzugriff, keine Entschluesselung. Beantwortet
 * allein aus den extrahierten Platzhaltern der Vorlage, ob beim Versand eine
 * ausdrueckliche Bestaetigung noetig ist (Entscheidung vom 02.09.2026: sensible
 * Vorlagen duerfen per E-Mail gehen, aber nur mit Bestaetigung je Versand).
 *
 * Im Zweifel wird gemeldet, nicht verschwiegen: Schreibt jemand `{IBAN}` statt
 * `{iban}`, fuellt der Resolver das Feld zwar nicht, die Bestaetigung wird aber
 * trotzdem verlangt. Ein Klick zu viel ist folgenlos, eine ungefragt
 * verschickte Steuer-ID nicht.
 *
 * @param platzhalter Rohwert aus `DocumentTemplate.platzhalter` (Json) — alles,
 *   was kein String ist, wird stillschweigend uebergangen.
 */
export function sensiblePlatzhalter(platzhalter: unknown): SensiblesFeld[] {
  if (!Array.isArray(platzhalter)) return [];

  const verwendet = new Set<string>();
  for (const roh of platzhalter) {
    if (typeof roh !== "string") continue;
    const key = normalisiere(roh);
    if (key) verwendet.add(key);
  }

  return SENSIBLE_FELDER.filter((f) => verwendet.has(f.key.toLowerCase()));
}

/** Kurzform: Braucht diese Vorlage beim Versand eine Bestaetigung? */
export function brauchtBestaetigung(platzhalter: unknown): boolean {
  return sensiblePlatzhalter(platzhalter).length > 0;
}
