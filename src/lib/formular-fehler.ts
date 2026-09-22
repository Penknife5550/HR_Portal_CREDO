/**
 * Aus einer Fehlerantwort der Formular-Routen einen brauchbaren deutschen Satz
 * machen.
 *
 * WARUM es diese Datei gibt: Beide Formular-Server antworten bei einer
 * fehlgeschlagenen Validierung mit
 *
 *   { error: "Validierungsfehler", details: parsed.error.issues }
 *
 * (src/app/api/fragebogen/[token]/route.ts, src/app/api/modalitaeten/[token]/route.ts).
 * Die Clients zeigten bisher nur `error` an und warfen `details` weg. Die
 * Person am Bildschirm las also das Wort „Validierungsfehler" — ohne Feld, ohne
 * Grund. Genau deshalb liess sich der aus dem Betrieb gemeldete Fehler
 * monatelang nicht eingrenzen: Die Antwort enthielt die Diagnose die ganze
 * Zeit, sie wurde nur nie gelesen.
 *
 * Zwei Uebersetzungen passieren hier:
 *
 * 1. **Feld.** Die Zod-issues tragen einen `path` (z.B. ["taxAllowance"] oder
 *    ["beschaeftigungsAngaben", 0, "beginn"]). Daraus wird eine Bezeichnung,
 *    die die Person im Formular wiedererkennt.
 * 2. **Grund.** Die Zod-Standardmeldungen sind ENGLISCH („Expected number,
 *    received nan"). Englisches Zod-Kauderwelsch in einem deutschen Formular
 *    hilft niemandem, deshalb werden die haeufigen Faelle uebersetzt und alles
 *    Unbekannte neutral ausgegeben.
 *
 * Eigene, deutsche Meldungen aus den Schemata (z.B. „Das Ende darf nicht vor
 * dem Beginn liegen.") werden dagegen unveraendert durchgereicht — sie sind
 * genauer als jede Ableitung aus dem Fehlercode.
 */

/** Was angezeigt wird, wenn die Antwort nichts Verwertbares enthaelt. */
export const STANDARD_FEHLERMELDUNG =
  "Die Angaben konnten nicht gespeichert werden. Bitte prüfen Sie Ihre " +
  "Eingaben und versuchen Sie es erneut.";

/** So viele Felder werden einzeln benannt, der Rest wird gezaehlt. */
const MAX_GENANNTE_FELDER = 3;

/**
 * Technischer Feldname → deutsche Bezeichnung.
 *
 * Enthaelt die Felder BEIDER Formulare (Personalfragebogen und
 * Einstellungsmodalitaeten) samt der Felder in den wiederholbaren Zeilen
 * (`children`, `beschaeftigungsAngaben`). Ein hier nicht eingetragenes Feld
 * faellt auf den technischen Namen zurueck — unschoen, aber immer noch
 * unendlich viel besser als „Validierungsfehler".
 */
export const FELD_BEZEICHNUNGEN: Record<string, string> = {
  // --- Personalfragebogen: Person ---
  salutation: "Anrede",
  title: "Titel",
  firstName: "Vorname",
  lastName: "Nachname",
  birthName: "Geburtsname",
  birthDate: "Geburtsdatum",
  birthPlace: "Geburtsort",
  birthCountry: "Geburtsland",
  nationality: "Staatsangehörigkeit",
  maritalStatus: "Familienstand",
  severelyDisabled: "Schwerbehinderung",
  disabilityDegree: "Grad der Behinderung",

  // --- Personalfragebogen: Anschrift und Erreichbarkeit ---
  street: "Straße",
  houseNumber: "Hausnummer",
  zipCode: "Postleitzahl",
  city: "Ort",
  country: "Land",
  phone: "Telefon",
  mobile: "Mobiltelefon",
  emailPrivate: "Private E-Mail-Adresse",

  // --- Personalfragebogen: Bankverbindung ---
  iban: "IBAN",
  bic: "BIC",
  bankName: "Name der Bank",
  accountHolder: "Kontoinhaber",

  // --- Personalfragebogen: Sozialversicherung und Steuer ---
  socialSecurityNumber: "Rentenversicherungsnummer",
  healthInsuranceName: "Krankenkasse",
  healthInsuranceType: "Art der Krankenversicherung",
  parentStatus: "Elterneigenschaft",
  taxId: "Steuer-Identifikationsnummer",
  taxClass: "Steuerklasse",
  taxAllowance: "Steuerfreibetrag",
  childAllowance: "Kinderfreibetrag",
  religion: "Konfession",

  // --- Personalfragebogen: Ausbildung ---
  highestSchoolDegree: "Höchster Schulabschluss",
  highestProfessionalDegree: "Höchster Berufsabschluss",

  // --- Personalfragebogen: Beamtenverhaeltnis ---
  isBeamter: "Beamtenverhältnis",
  besoldungsgruppe: "Besoldungsgruppe",
  laufbahngruppe: "Laufbahngruppe",
  dienstzeitBeginn: "Beginn der Dienstzeit",
  amtsbezeichnung: "Amtsbezeichnung",
  verfassungstreuePruefung: "Prüfung der Verfassungstreue",

  // --- Personalfragebogen: weitere Beschaeftigung / Minijob ---
  hasOtherEmployment: "Weitere Beschäftigung vorhanden",
  otherEmployerName: "Anderer Arbeitgeber",
  otherWeeklyHours: "Wochenstunden beim anderen Arbeitgeber",
  employerType: "Art des Arbeitgebers",
  hasMinijob: "Minijob",
  minijobRvBefreiung: "Befreiung von der Rentenversicherung",
  bornAfter1971: "Geburt nach dem 31.12.1970",
  masernschutzProvided: "Masernschutznachweis",
  beschaeftigungsStatus: "Status bei Beschäftigungsbeginn",
  beschaeftigungsStatusSonstige: "Status bei Beschäftigungsbeginn (Sonstiges)",
  alsArbeitsuchendGemeldet: "Meldung als arbeitsuchend",
  agenturFuerArbeit: "Agentur für Arbeit",
  mitLeistungsbezug: "Leistungsbezug",
  vorbeschaeftigungenVorhanden: "Vorbeschäftigungen vorhanden",
  auslandsbeschaeftigungVorhanden: "Beschäftigung im Ausland vorhanden",
  summeUeberGeringfuegigkeitsgrenze: "Summe über der Geringfügigkeitsgrenze",
  rvEntscheidung: "Entscheidung zur Rentenversicherung",
  rvMerkblattGelesen: "Merkblatt zur Rentenversicherung gelesen",
  rvBindungBestaetigt: "Bestätigung der Bindungswirkung",

  // --- Personalfragebogen: Absenden ---
  dsgvoAccepted: "Einwilligung zum Datenschutz",
  erklaerungAccepted: "Erklärung des Arbeitnehmers",
  erklaerungOrt: "Ort der Erklärung",
  erklaerungVersion: "Fassung der Erklärung",

  // --- Personalfragebogen: wiederholbare Zeilen ---
  children: "Kind",
  beschaeftigungsAngaben: "Weitere Beschäftigung",
  kategorie: "Kategorie",
  beginn: "Beginn",
  ende: "Ende",
  art: "Art der Beschäftigung",
  entgeltUeberGrenze: "Entgelt über der Geringfügigkeitsgrenze",
  arbeitstage: "Arbeitstage",
  beiArbeitsagentur: "Meldung bei der Arbeitsagentur",
  arbeitgeberName: "Arbeitgeber",
  arbeitgeberAdresse: "Adresse des Arbeitgebers",

  // --- Einstellungsmodalitaeten: Stelle und Vertrag ---
  betriebsstaette: "Betriebsstätte",
  // ZENTRALE QUELLE fuer den Begriff „Stellenbezeichnung" (seit 09/2026).
  // Formular-Label und Zusammenfassung der Modalitaeten, Pflichtmeldung,
  // HR-Ansicht, PDF-Personalakte, Registry des Vertragsdaten-Formulars
  // (Vertragsende) und der Variablenkatalog der Brief-Vorlagen lesen ihn von
  // hier — so kann der Begriff nicht wieder an einzelnen Stellen
  // auseinanderlaufen. Die Datei hat keine Importe und ist damit client-sicher.
  //
  // Der Schluessel heisst BEWUSST weiter `stellenbeschreibung`: So heissen
  // Datenbankspalte, JSON-Export, Mandanten-Konfiguration und der Word-
  // Platzhalter {stellenbeschreibung}. Eine Umbenennung der Spalte rollte
  // `prisma db push --accept-data-loss` als DROP + ADD aus und loeschte alle
  // Stellenangaben. Fachlich ist das Feld ein Titel („Lehrkraft fuer
  // Mathematik und Physik"), keine Beschreibung — daher nur der UI-Begriff.
  stellenbeschreibung: "Stellenbezeichnung",
  vertragsbeginn: "Vertragsbeginn",
  befristet: "Befristung",
  befristungsart: "Art der Befristung",
  vertragsende: "Vertragsende",
  befristungZweck: "Zweck der Befristung",
  vertragsendeVoraussichtlich: "Voraussichtliches Vertragsende",
  befristungSachgrund: "Sachgrund der Befristung",

  // --- Einstellungsmodalitaeten: Arbeitszeit ---
  vollzeit: "Vollzeit",
  wochenstunden: "Wochenstunden",
  tageProWoche: "Arbeitstage pro Woche",
  hauptarbeitgeberId: "Hauptarbeitgeber",
  hauptarbeitgeberStunden: "Wochenstunden beim Hauptarbeitgeber",
  nebenarbeitgeberId: "Nebenarbeitgeber",
  nebenarbeitgeberStunden: "Wochenstunden beim Nebenarbeitgeber",
  svPflichtig: "Sozialversicherungspflicht",
  minijob: "Minijob",
  ehrenamt: "Ehrenamt",
  kostenstelle: "Kostenstelle",
  kostenstelleAnteil: "Anteil der Kostenstelle",
  // Die Aufteilung auf mehrere Kostenstellen. `bezeichnung` und `anteil` sind
  // die Feldnamen INNERHALB einer Zeile — ohne sie stuende im Fehlertext
  // "Kostenstellen-Aufteilung, Eintrag 2, anteil", also der rohe Zod-Pfad.
  kostenstellen: "Kostenstellen-Aufteilung",
  kostenstellenBemerkung: "Bemerkung zur Kostenstellen-Aufteilung",
  bezeichnung: "Kostenstelle",
  anteil: "Anteil in Prozent",
  probezeit: "Probezeit",
  probezeitMonate: "Probezeit in Monaten",

  // --- Einstellungsmodalitaeten: Verguetung ---
  verguetungsmodell: "Vergütungsmodell",
  entgeltgruppe: "Entgeltgruppe",
  stufe: "Stufe",
  festgehalt: "Festgehalt",
  stundenlohn: "Stundenlohn",
  bemerkungVerguetung: "Bemerkung zur Vergütung",
  jahressonderzahlung: "Jahressonderzahlung",
  sonderzahlungProzent: "Jahressonderzahlung in Prozent",
  sachbezuege: "Sachbezüge",
  sachbezuegeBetrag: "Betrag der Sachbezüge",
  zulage: "Zulage",
  zulageBetrag: "Betrag der Zulage",

  // --- Einstellungsmodalitaeten: Sonstiges ---
  urlaubstageProJahr: "Urlaubstage pro Jahr",
  masernschutzErforderlich: "Masernschutz erforderlich",
  masernschutzVorArbeitsbeginn: "Masernschutz vor Arbeitsbeginn",
  zeiterfassung: "Zeiterfassung",
  zusatzvereinbarungen: "Zusatzvereinbarungen",

  // --- beide Formulare ---
  currentStep: "Formularschritt",
};

/** Ein Zod-issue, so wie es als JSON ueber die Leitung kommt. */
export type Befund = {
  code?: unknown;
  path?: unknown;
  message?: unknown;
  expected?: unknown;
  received?: unknown;
  type?: unknown;
  minimum?: unknown;
  maximum?: unknown;
  validation?: unknown;
};

/**
 * Beginnt die Meldung so, wie Zod auf Englisch meldet?
 *
 * Der Test laeuft ueber die ANFAENGE der englischen Standardmeldungen statt
 * ueber vollstaendige Muster: Die Standardmeldungen sind Vorlagen mit
 * eingesetzten Werten („String must contain at most 100 character(s)"), und
 * eine eigene deutsche Meldung faengt nie mit „Required", „Expected",
 * „Invalid", „String must" und so weiter an. Was hier nicht greift, gilt als
 * eigene Meldung und wird woertlich angezeigt.
 */
function istZodStandardmeldung(meldung: string): boolean {
  return /^(Required$|Expected |Invalid|String must |Number must |Array must |Date must |Unrecognized key|Intersection results)/.test(
    meldung,
  );
}

/** Deutsche Bezeichnung eines einzelnen Pfad-Abschnitts. */
function bezeichneAbschnitt(abschnitt: string | number): string {
  // Ein Zahlen-Abschnitt ist der Index einer wiederholbaren Zeile. Menschen
  // zaehlen ab eins, Zod ab null.
  if (typeof abschnitt === "number" && Number.isInteger(abschnitt)) {
    return `Eintrag ${abschnitt + 1}`;
  }
  const text = String(abschnitt);
  if (/^\d+$/.test(text)) return `Eintrag ${Number(text) + 1}`;
  return FELD_BEZEICHNUNGEN[text] ?? text;
}

/**
 * Aus dem Pfad eine lesbare Feldbezeichnung bauen.
 *
 * ["taxAllowance"]                          → "Steuerfreibetrag"
 * ["beschaeftigungsAngaben", 0, "beginn"]   → "Weitere Beschäftigung, Eintrag 1, Beginn"
 * []                                        → "" (dann steht nur der Grund da)
 */
export function feldBezeichnung(pfad: unknown): string {
  if (!Array.isArray(pfad)) return "";
  return pfad
    .filter(
      (abschnitt): abschnitt is string | number =>
        typeof abschnitt === "string" || typeof abschnitt === "number",
    )
    .map(bezeichneAbschnitt)
    .join(", ");
}

/** Zahl fuer die Ausgabe: 100 statt 100.0, aber 12.5 bleibt 12,5. */
function zahl(wert: unknown): string {
  if (typeof wert === "number" && Number.isFinite(wert)) {
    return String(wert).replace(".", ",");
  }
  return String(wert);
}

/**
 * Der Grund eines einzelnen Befundes, auf Deutsch.
 *
 * Eigene Meldungen aus dem Schema gewinnen. Erst danach wird aus Code, Typ und
 * Grenzwert eine Erklaerung abgeleitet.
 */
export function fehlerGrund(befund: Befund): string {
  const meldung =
    typeof befund.message === "string" ? befund.message.trim() : "";
  if (meldung && !istZodStandardmeldung(meldung)) return meldung;

  const code = typeof befund.code === "string" ? befund.code : "";
  const empfangen =
    typeof befund.received === "string" ? befund.received : "";
  const erwartet = typeof befund.expected === "string" ? befund.expected : "";
  const typ = typeof befund.type === "string" ? befund.type : "";

  switch (code) {
    case "invalid_type": {
      // DAS ist der aus dem Betrieb gemeldete Fehler: `valueAsNumber` macht aus
      // einem geleerten Zahlenfeld NaN — nicht "" und nicht null. Deshalb steht
      // hier kein „ungueltige Eingabe", sondern der Hinweis, was das Feld
      // vertraegt.
      if (empfangen === "nan") {
        return "Hier wird eine Zahl erwartet. Bitte geben Sie eine Zahl ein oder lassen Sie das Feld ganz leer.";
      }
      if (empfangen === "undefined" || empfangen === "null") {
        return "Bitte füllen Sie dieses Feld aus.";
      }
      if (erwartet === "number") return "Bitte geben Sie eine Zahl ein.";
      if (erwartet === "integer") {
        return "Bitte geben Sie eine ganze Zahl ohne Nachkommastellen ein.";
      }
      if (erwartet === "string") return "Bitte geben Sie einen Text ein.";
      if (erwartet === "boolean") return "Bitte treffen Sie eine Auswahl.";
      if (erwartet === "date") return "Bitte geben Sie ein gültiges Datum ein.";
      return "Bitte prüfen Sie die Eingabe.";
    }

    case "invalid_enum_value":
    case "invalid_union_discriminator":
      return "Bitte wählen Sie einen der angebotenen Werte.";

    case "invalid_literal":
      return "Diese Bestätigung ist erforderlich.";

    case "invalid_date":
      return "Bitte geben Sie ein gültiges Datum ein.";

    case "invalid_string": {
      const pruefung =
        typeof befund.validation === "string" ? befund.validation : "";
      if (pruefung === "email") {
        return "Bitte geben Sie eine gültige E-Mail-Adresse ein.";
      }
      if (pruefung === "url") return "Bitte geben Sie eine gültige Adresse ein.";
      return "Bitte prüfen Sie die Eingabe.";
    }

    case "too_big": {
      if (typ === "string") {
        return `Der Text ist zu lang. Bitte kürzen Sie ihn auf höchstens ${zahl(befund.maximum)} Zeichen.`;
      }
      if (typ === "array") {
        return `Es sind höchstens ${zahl(befund.maximum)} Einträge möglich.`;
      }
      if (typ === "date") {
        return "Das Datum liegt zu weit in der Zukunft.";
      }
      return `Der Wert ist zu groß. Zulässig sind höchstens ${zahl(befund.maximum)}.`;
    }

    case "too_small": {
      if (typ === "string") {
        // min(1) auf einem Textfeld heisst in diesen Schemata schlicht
        // „Pflichtangabe" — die Zeichenzahl zu nennen waere hier nur Ballast.
        if (befund.minimum === 1) return "Bitte füllen Sie dieses Feld aus.";
        return `Der Text ist zu kurz. Bitte geben Sie mindestens ${zahl(befund.minimum)} Zeichen ein.`;
      }
      if (typ === "array") {
        if (befund.minimum === 1) return "Bitte legen Sie mindestens einen Eintrag an.";
        return `Bitte legen Sie mindestens ${zahl(befund.minimum)} Einträge an.`;
      }
      if (typ === "date") {
        return "Das Datum liegt zu weit in der Vergangenheit.";
      }
      return `Der Wert ist zu klein. Zulässig sind mindestens ${zahl(befund.minimum)}.`;
    }

    case "unrecognized_keys":
      return "Es wurden unbekannte Angaben übermittelt. Bitte laden Sie die Seite neu.";

    default:
      // Alles Unbekannte neutral — lieber ein blasser deutscher Satz als eine
      // englische Zod-Meldung, mit der niemand am Bildschirm etwas anfangen kann.
      return "Bitte prüfen Sie die Eingabe.";
  }
}

/** Die Befunde aus dem Antwortkoerper holen (Array oder ZodError-artig). */
function befundeAus(antwort: Record<string, unknown>): Befund[] {
  const details = antwort.details;
  if (Array.isArray(details)) return details as Befund[];
  // Falls jemand einmal den ganzen ZodError statt `error.issues` durchreicht.
  if (details && typeof details === "object") {
    const issues = (details as { issues?: unknown }).issues;
    if (Array.isArray(issues)) return issues as Befund[];
  }
  return [];
}

/**
 * Aus dem geparsten Antwortkoerper einen anzeigbaren deutschen Satz machen.
 *
 * Reihenfolge: Zod-Befunde (die nennen das Feld) → mitgelieferter Fehlertext →
 * Standardsatz.
 */
export function fehlerMeldung(antwort: unknown): string {
  // Manche Aufrufer haben statt JSON nur den Text der Antwort.
  if (typeof antwort === "string") {
    return antwort.trim() || STANDARD_FEHLERMELDUNG;
  }
  if (!antwort || typeof antwort !== "object") return STANDARD_FEHLERMELDUNG;

  const koerper = antwort as Record<string, unknown>;

  const saetze: string[] = [];
  for (const befund of befundeAus(koerper)) {
    if (!befund || typeof befund !== "object") continue;
    const feld = feldBezeichnung(befund.path);
    const grund = fehlerGrund(befund);
    const satz = feld ? `${feld}: ${grund}` : grund;
    // Zwei Befunde zum selben Feld (etwa aus einer Vereinigung) ergaeben sonst
    // denselben Satz zweimal.
    if (!saetze.includes(satz)) saetze.push(satz);
  }

  if (saetze.length > 0) {
    const genannt = saetze.slice(0, MAX_GENANNTE_FELDER);
    const rest = saetze.length - genannt.length;
    if (rest === 0) return genannt.join(" ");
    return `${genannt.join(" ")} Und ${rest} weitere ${rest === 1 ? "Angabe" : "Angaben"}.`;
  }

  // Kein `details` — also ein anderer Fehler. Den vorhandenen Text
  // durchreichen, der ist in diesen Routen bereits deutsch formuliert
  // (z.B. „Fragebogen wurde bereits eingereicht.").
  for (const schluessel of ["error", "message"] as const) {
    const wert = koerper[schluessel];
    if (typeof wert === "string" && wert.trim()) return wert.trim();
  }

  return STANDARD_FEHLERMELDUNG;
}
