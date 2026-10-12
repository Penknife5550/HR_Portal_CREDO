/**
 * CREDO HR-Portal – Ausstattung & Zugaenge: die reinen Regeln
 *
 * Worum es geht: Ein Katalog (Einstellungen → Ausstattung & Zugaenge) legt
 * fest, was zum Arbeitsbeginn bereitstehen kann – Dienst-iPad, Schluessel,
 * Zugaenge. Die Fuehrungskraft waehlt im Modalitaeten-Formular, HR ergaenzt
 * nach der Abgabe, und aus jeder Wahl wird eine Checklisten-Aufgabe der
 * zustaendigen Stelle (bei Auswahl-Positionen je Option eine). Plan:
 * docs/module/onboarding/ausstattung-zugaenge-plan.html, Feinplan:
 * docs/module/onboarding/ausstattung-feinplan.md (Abschnitt 1.3).
 *
 * Diese Datei enthaelt NUR Regeln: keine Datenbank, keinen Prisma-Import, keine
 * Uhr (Funktionen bekommen `jetzt`). Sie ist damit im Browser nutzbar und ohne
 * Datenbank testbar. Die Typen der Wertlisten stehen hier als Zeichenketten;
 * src/__tests__/lib/ausstattung-schema.test.ts haelt sie gegen die Kommentare
 * in prisma/schema.prisma und gegen die Enums des generierten Clients.
 *
 * Stand S5: Konstanten und Typen, dazu die Katalogregeln (positionPruefen,
 * positionGiltAm, positionenFuer, formularGruppen, adressLuecken,
 * aehnlicheVorlagenpunkte, aufgabenTitel), die Vorschlaege fuer den
 * Anfangsbestand, die Meldungen des Katalogs, die Rechnungen der
 * Katalogseite (Feldliste und Aenderungen fuer PATCH und Protokoll, Stellen,
 * Warnung „außerhalb der Freigabeliste“, Antworttypen der Einstellungsrouten)
 * und ihre Anzeige (katalogZeilen, katalogHinweise, vorschlaegeVorschau —
 * Reiter src/components/ausstattung/katalog-tab.tsx rechnet nichts selbst),
 * dazu die Regeln des Arbeitsorts am Vorgang (arbeitsortSpeicherwert,
 * arbeitsortSperrGrund; Server src/lib/onboarding-arbeitsort.ts).
 * Die Funktionen fuer Aufgaben, Faelligkeit, Nachtrag und Uebersicht kommen mit
 * den folgenden Schritten. Den Server-Teil des Katalogs (Laden, Schreiben,
 * Protokoll, Ausschnitt je Vorgang) traegt src/lib/ausstattung-katalog.ts.
 *
 * Importrichtung: Diese Datei nutzt die reinen Regeln aus abteilungsaufgaben.ts
 * (Empfaenger, Reihenfolge der Stellen, Schluesselform). abteilungsaufgaben.ts
 * importiert deshalb NICHTS von hier — sonst entstuende ein Kreis, und eine
 * Konstante, die beim Laden des Moduls gelesen wird, waere `undefined`.
 */

import {
  DEPARTMENT_KEYS,
  LINK_ABTEILUNGEN,
  RESERVIERTE_ABTEILUNGSSCHLUESSEL,
  abteilungLabel,
} from "@/lib/constants";
import {
  ABTEILUNGS_SCHLUESSEL_MUSTER,
  abteilungsReihenfolge,
  empfaengerAufloesen,
  istFuehrungskraft,
  istLinkAbteilung,
  type AbteilungsKonfig,
  type VorlagenPunkt,
} from "@/lib/abteilungsaufgaben";

// =============================================
// Wertlisten (Zustaende sind Zeichenketten, keine Enums)
// =============================================

/** Art einer Katalogposition (Schema: AusstattungsPosition.art, OnboardingAusstattung.art). */
export const AUSSTATTUNG_ARTEN = ["JA_NEIN", "AUSWAHL", "ANGABE"] as const;
export type AusstattungsArt = (typeof AUSSTATTUNG_ARTEN)[number];

/** Wer eine Zeile eines Vorgangs angelegt hat (OnboardingAusstattung.quelle). */
export const AUSSTATTUNG_QUELLEN = ["FUEHRUNGSKRAFT", "HR"] as const;
export type AusstattungsQuelle = (typeof AUSSTATTUNG_QUELLEN)[number];

/**
 * Herkunft einer Bemerkung (OnboardingAusstattung.bemerkungQuelle, Regel 8).
 * Dieselben Werte traegt OnboardingStellenHinweis.quelle: Ein Hinweis der
 * Fuehrungskraft, den HR aendert, wird "BEIDE"; einen neuen legt HR als "HR" an.
 */
export const BEMERKUNG_QUELLEN = ["FUEHRUNGSKRAFT", "HR", "BEIDE"] as const;
export type BemerkungQuelle = (typeof BEMERKUNG_QUELLEN)[number];

/** Eintraege der Nachtragsliste je Stelle (OnboardingAusstattungAenderung.art, Regel 10). */
export const AENDERUNGS_ARTEN = ["NEU", "GEAENDERT", "ENTFAELLT"] as const;
export type AenderungsArt = (typeof AENDERUNGS_ARTEN)[number];

/**
 * Herkunft einer Checklisten-Aufgabe (ChecklistItem.herkunft, F3). `null` heisst
 * „aus der Checklisten-Vorlage“ und steht deshalb nicht in der Liste.
 */
export const AUFGABEN_HERKUNFT = ["AUSSTATTUNG", "HINWEIS"] as const;
export type AufgabenHerkunft = (typeof AUFGABEN_HERKUNFT)[number];

/**
 * Stufe 2 (A4): was beim Austritt mit dem Ausgegebenen geschieht. A1 bis A3
 * legen nur die Spalte an; geschrieben wird sie erst mit A4.
 */
export const BEI_AUSTRITT = ["RUECKGABE", "SPERREN", "NICHTS"] as const;
export type BeiAustritt = (typeof BEI_AUSTRITT)[number];

// =============================================
// Grenzen und feste Werte
// =============================================

/** Kategorie der Ausstattungsaufgaben in der Checkliste (Regel 6). */
export const AUSSTATTUNG_KATEGORIE = "Ausstattung & Zugänge";

/**
 * Laengen- und Mengengrenzen. Client (Zeichenzaehler) und Server (Zod) lesen
 * dieselben Zahlen. `faelligTage` ist der Betrag: erlaubt sind −365 bis +365
 * Tage relativ zum Vertragsbeginn.
 */
export const GRENZEN = {
  bezeichnung: 120,
  hinweisFuehrungskraft: 300,
  hinweisStelle: 500,
  option: 80,
  optionen: 40,
  bemerkungPlatzhalter: 120,
  aufgabeTitel: 120,
  bemerkung: 500,
  angabe: 300,
  hinweis: 1000,
  freieBezeichnung: 120,
  wahlJeVorgang: 200,
  hinweiseJeVorgang: 30,
  faelligTage: 365,
} as const;

/**
 * Stellen, fuer die es keine Katalogposition gibt (Regel 11): Die
 * Fuehrungskraft fuellt das Formular selbst aus, die Person bekommt nie einen
 * Link. HR ist erlaubt (Aufgabe im Portal, ohne Link).
 */
export const NICHT_ERLAUBTE_STELLEN = ["MITARBEITER", "VORGESETZTER"] as const;
export type NichtErlaubteStelle = (typeof NICHT_ERLAUBTE_STELLEN)[number];

/**
 * Personengruppen = QuestionnaireType des Vorgangs (E-A4: die fuenf Gruppen
 * reichen). Leere Liste an der Position = alle.
 */
export type Personengruppe = "STANDARD" | "BEAMTE" | "ERZIEHER" | "MINIJOB" | "EHRENAMT";
export const PERSONENGRUPPEN: Readonly<Record<Personengruppe, string>> = {
  STANDARD: "Angestellte",
  BEAMTE: "Beamte",
  ERZIEHER: "Kita-Personal",
  MINIJOB: "Minijob",
  EHRENAMT: "Ehrenamt",
};

/**
 * Einrichtungsarten = OrganizationType. Nur zentrale Positionen schraenken
 * darauf ein; leere Liste = alle. Gefiltert wird nach der Art des Arbeitsorts
 * (E-A10), nicht der Einrichtung des Vorgangs.
 */
export type Einrichtungsart =
  | "GYMNASIUM"
  | "GESAMTSCHULE"
  | "GRUNDSCHULE"
  | "BERUFSKOLLEG"
  | "KITA"
  | "VERWALTUNG"
  | "GMBH"
  | "VEREIN";
export const EINRICHTUNGSARTEN: Readonly<Record<Einrichtungsart, string>> = {
  GYMNASIUM: "Gymnasium",
  GESAMTSCHULE: "Gesamtschule",
  GRUNDSCHULE: "Grundschule",
  BERUFSKOLLEG: "Berufskolleg",
  KITA: "Kita",
  VERWALTUNG: "Verwaltung",
  GMBH: "GmbH",
  VEREIN: "Verein",
};

// =============================================
// Angaben (Art "ANGABE", E-A13)
// =============================================

/**
 * Die feste Liste der Angaben. Positionen der Art "ANGABE" gibt es NUR mit
 * einem dieser Schluessel – sonst wuerde der Katalog ein Kanal fuer beliebige
 * Fragen an die Fuehrungskraft, deren Antworten an Stellen gehen. Eine
 * Erweiterung ist eine Code-Aenderung; nach dem Gespraech mit dem DSB (A0) die
 * Liste bestaetigen und das Fach Religion einmal ansprechen.
 */
export const ANGABE_SCHLUESSEL = ["UNTERRICHTSFAECHER", "DURCHWAHL", "ARBEITSPLATZ_RAUM"] as const;
export type AngabeSchluessel = (typeof ANGABE_SCHLUESSEL)[number];

export interface AngabeDefinition {
  /** Beschriftung im Formular; zugleich `bezeichnung` der Position. */
  label: string;
  platzhalter: string;
  /** Satz unter dem Feld, `null` = keiner. */
  hilfe: string | null;
  /** Hoechstlaenge der Eingabe, nie ueber GRENZEN.angabe. */
  max: number;
}

export const ANGABEN_KATALOG: Readonly<Record<AngabeSchluessel, AngabeDefinition>> = {
  UNTERRICHTSFAECHER: {
    label: "Unterrichtsfächer",
    platzhalter: "z. B. Chemie, Sport",
    hilfe: "Hilft bei der Zuordnung von Fachräumen.",
    max: 200,
  },
  DURCHWAHL: {
    label: "Gewünschte Durchwahl",
    platzhalter: "z. B. 214",
    hilfe: null,
    max: 30,
  },
  ARBEITSPLATZ_RAUM: {
    label: "Raum des Arbeitsplatzes",
    platzhalter: "z. B. Lehrerzimmer, Büro 2.14",
    hilfe: null,
    max: 100,
  },
};

// =============================================
// Texte, Fristen, Reihenfolge
// =============================================

/**
 * Steht unter jedem Bemerkungs- und Hinweisfeld, im Formular der
 * Fuehrungskraft wie im Bearbeiten-Dialog von HR (Plan, Abschnitt 10).
 * Technisch verhindern laesst es sich nicht; HR sichtet vor dem Versand.
 */
export const BEMERKUNG_HINWEIS =
  "Keine Angaben zu Gesundheit, Schwangerschaft, Behinderung oder Religion und keine Bewertungen der Person. Schreiben Sie, was gebraucht wird, nicht warum.";

/** Bemerkungen, Angaben und Hinweise werden so lange nach Abschluss oder Abbruch geleert (E-A22). */
export const FREITEXT_AUFBEWAHRUNG_MONATE = 6;

/** Aufgabe zu einem ausgefuellten Hinweis an eine Stelle (E-A14). */
export const HINWEIS_AUFGABE_TITEL = "Hinweis der Führungskraft beachten";

/**
 * Beschreibung dieser Aufgabe. Bewusst ortsneutral: Erinnerung und Sammelmail
 * tragen den Hinweis selbst nicht, ein „siehe oben“ liefe dort ins Leere.
 */
export const HINWEIS_AUFGABE_BESCHREIBUNG = "Den Hinweis der Führungskraft finden Sie auf Ihrer Aufgabenseite.";

/** F20: Faelligkeit der Hinweis-Aufgabe relativ zum Vertragsbeginn (Vorlauf wie die uebrige Bereitstellung). */
export const HINWEIS_FAELLIG_TAGE = -7;

/** Regel 15: Der Waechter faerbt die Zeile einer Stelle rot, wenn die frueheste Faelligkeit naeher liegt. */
export const WAECHTER_TAGE = 7;

/**
 * Reihenfolge in der Checkliste: Ausstattungsaufgaben bekommen
 * `ORDER_BASIS + reihenfolge * 100 + optionIndex`, Hinweis-Aufgaben
 * `HINWEIS_ORDER_BASIS + Index der Stelle`. Alle Vorlagenpunkte haben einen
 * orderIndex ab 0 – die Kategorie steht damit im Reiter, auf der Link-Seite
 * und im PDF oben.
 */
export const ORDER_BASIS = -100000;
export const HINWEIS_ORDER_BASIS = -1000;

/**
 * Hoechster `orderIndex` einer Katalogposition. Er geht als `reihenfolge` in
 * den orderIndex der Aufgaben ein (oben); ohne Grenze laegen die Aufgaben einer
 * Position mit orderIndex 990 schon zwischen den Hinweis-Aufgaben, ab 1000
 * zwischen den Vorlagenpunkten. Bis 500 bleibt reichlich Abstand.
 */
export const REIHENFOLGE_MAX = 500;

// =============================================
// Protokoll (Feinplan 1.15)
// =============================================

/**
 * AuditLog-Codes. Katalog-Eintraege stehen mit processType "SYSTEM", die
 * uebrigen am Vorgang (onboardingId, "ONBOARDING"). `details` nur mit IDs,
 * Schluesseln, Katalogtiteln und Anzahlen – Bemerkung, Angabe und Hinweis nur
 * als Laenge, nie als Text.
 */
export const AUSSTATTUNG_AUDIT = {
  // Katalog
  POSITION_ANGELEGT: "AUSSTATTUNG_POSITION_ANGELEGT",
  POSITION_GEAENDERT: "AUSSTATTUNG_POSITION_GEAENDERT",
  POSITION_GELOESCHT: "AUSSTATTUNG_POSITION_GELOESCHT",
  AUSBLENDUNG_GEAENDERT: "AUSSTATTUNG_AUSBLENDUNG_GEAENDERT",
  VORSCHLAEGE_UEBERNOMMEN: "AUSSTATTUNG_VORSCHLAEGE_UEBERNOMMEN",
  // Vorgang
  ARBEITSORT_GEAENDERT: "ONBOARDING_ARBEITSORT_GEAENDERT",
  AUFGABEN_ANGELEGT: "AUSSTATTUNG_AUFGABEN_ANGELEGT",
  FAELLIGKEIT_ANGEHOBEN: "AUSSTATTUNG_FAELLIGKEIT_ANGEHOBEN",
  HR_HINZUGEFUEGT: "AUSSTATTUNG_HR_HINZUGEFUEGT",
  HR_GEAENDERT: "AUSSTATTUNG_HR_GEAENDERT",
  HR_GESTRICHEN: "AUSSTATTUNG_HR_GESTRICHEN",
  HINWEIS_GEAENDERT: "AUSSTATTUNG_HINWEIS_GEAENDERT",
  HINWEIS_GESEHEN: "AUSSTATTUNG_HINWEIS_GESEHEN",
  HINWEIS_UEBERNOMMEN: "AUSSTATTUNG_HINWEIS_UEBERNOMMEN",
  SAMMELMAIL_GESENDET: "AUSSTATTUNG_SAMMELMAIL_GESENDET",
  FREITEXTE_GELEERT: "AUSSTATTUNG_FREITEXTE_GELEERT",
} as const;
export type AusstattungAuditCode = (typeof AUSSTATTUNG_AUDIT)[keyof typeof AUSSTATTUNG_AUDIT];

/** Anzeige im Protokoll (audit-log-content.tsx ergaenzt seine Tabelle damit). */
export const AUSSTATTUNG_AUDIT_LABELS: Readonly<Record<AusstattungAuditCode, string>> = {
  [AUSSTATTUNG_AUDIT.POSITION_ANGELEGT]: "Ausstattungsposition angelegt",
  [AUSSTATTUNG_AUDIT.POSITION_GEAENDERT]: "Ausstattungsposition geändert",
  [AUSSTATTUNG_AUDIT.POSITION_GELOESCHT]: "Ausstattungsposition gelöscht",
  [AUSSTATTUNG_AUDIT.AUSBLENDUNG_GEAENDERT]: "Ausstattungsposition für Einrichtung ein-/ausgeblendet",
  [AUSSTATTUNG_AUDIT.VORSCHLAEGE_UEBERNOMMEN]: "Ausstattungs-Vorschläge übernommen",
  [AUSSTATTUNG_AUDIT.ARBEITSORT_GEAENDERT]: "Arbeitsort geändert",
  [AUSSTATTUNG_AUDIT.AUFGABEN_ANGELEGT]: "Ausstattungsaufgaben angelegt",
  [AUSSTATTUNG_AUDIT.FAELLIGKEIT_ANGEHOBEN]: "Fälligkeit von Ausstattungsaufgaben angehoben",
  [AUSSTATTUNG_AUDIT.HR_HINZUGEFUEGT]: "Ausstattung durch HR ergänzt",
  [AUSSTATTUNG_AUDIT.HR_GEAENDERT]: "Ausstattung durch HR geändert",
  [AUSSTATTUNG_AUDIT.HR_GESTRICHEN]: "Ausstattung durch HR gestrichen",
  [AUSSTATTUNG_AUDIT.HINWEIS_GEAENDERT]: "Hinweis an eine Stelle geändert",
  [AUSSTATTUNG_AUDIT.HINWEIS_GESEHEN]: "Hinweis der Führungskraft zur Kenntnis genommen",
  [AUSSTATTUNG_AUDIT.HINWEIS_UEBERNOMMEN]: "Hinweis der Führungskraft als Position übernommen",
  [AUSSTATTUNG_AUDIT.SAMMELMAIL_GESENDET]: "Sammelmail offene Ausstattung gesendet",
  [AUSSTATTUNG_AUDIT.FREITEXTE_GELEERT]: "Ausstattung: Freitexte geleert (Aufbewahrung)",
};

// =============================================
// Meldungen (Katalogteil; eine Quelle fuer Dialog, Zod, Dienst und Routen)
// =============================================

/** Die Labels der festen Angaben, fuer Meldungen („Unterrichtsfächer, …“). */
const ANGABEN_LABELS = ANGABE_SCHLUESSEL.map((s) => ANGABEN_KATALOG[s].label).join(", ");

export const MELDUNGEN = {
  // ---- positionPruefen und Zod (Einstellungen → Ausstattung & Zugänge) ----
  STELLE_FEHLT: "Bitte eine Stelle wählen.",
  STELLE_UNGUELTIG:
    "Die Stelle muss ein Abteilungsschlüssel sein (Großbuchstaben, Ziffern und _, 2–30 Zeichen, beginnend mit einem Buchstaben).",
  STELLE_NICHT_ERLAUBT:
    "Für die Führungskraft und für die neue Person selbst gibt es keine Positionen – die Führungskraft füllt das Formular selbst aus. Bitte eine Stelle wie IT, Verwaltung oder die Personalabteilung (HR) wählen.",
  ENTGELT_NUR_HR:
    "Positionen mit Bedeutung für Entgelt oder Vertrag (z. B. Dienstwagen, Jobticket) gehen nur an die Personalabteilung (Stelle HR).",
  ART_UNBEKANNT: "Bitte eine Art wählen: Ja/Nein, Auswahl oder Angabe.",
  BEZEICHNUNG_FEHLT: "Bitte eine Bezeichnung angeben.",
  BEZEICHNUNG_ZU_LANG: `Die Bezeichnung darf höchstens ${GRENZEN.bezeichnung} Zeichen lang sein.`,
  OPTIONEN_FEHLEN: "Eine Auswahl braucht mindestens eine Option.",
  OPTIONEN_ZU_VIELE: `Eine Auswahl darf höchstens ${GRENZEN.optionen} Optionen haben.`,
  OPTION_LEER: "Jede Option braucht einen Text (ohne Leerzeichen am Anfang oder Ende).",
  OPTION_ZU_LANG: `Eine Option darf höchstens ${GRENZEN.option} Zeichen lang sein.`,
  OPTION_DOPPELT: "Jede Option darf nur einmal vorkommen.",
  OPTIONEN_NUR_AUSWAHL: "Optionen gibt es nur bei einer Auswahl.",
  VORAUSWAHL_NICHT_IN_OPTIONEN: "Vorausgewählt werden können nur Optionen aus der Liste.",
  VORAUSWAHL_NUR_JA_NEIN:
    "„Vorausgewählt“ gibt es nur bei Ja/Nein. Bei einer Auswahl werden einzelne Optionen vorausgewählt.",
  ANGABE_UNBEKANNT: `Angaben gibt es nur aus der festen Liste: ${ANGABEN_LABELS}.`,
  ANGABE_SCHLUESSEL_NUR_ANGABE: "Ein Eintrag aus der Liste der Angaben gehört nur zur Art „Angabe“.",
  ANGABE_BEZEICHNUNG: "Eine Angabe trägt die Bezeichnung aus der festen Liste.",
  ANGABE_OHNE_AUFGABE: "Eine Angabe wird keine Aufgabe: Fälligkeit und Aufgabentitel bleiben leer.",
  ANGABE_OHNE_BEMERKUNG: "Bei einer Angabe gibt es kein Bemerkungsfeld.",
  /** Nur der Dialog: Bei einer Angabe gibt es kein Feld „Bezeichnung“ — sie kommt aus der Liste. */
  ANGABE_WAEHLEN: "Bitte eine Angabe aus der Liste wählen.",
  SICHTBAR_NUR_ANGABE: "„Sichtbar für“ gibt es nur bei einer Angabe.",
  SICHTBAR_UNGUELTIG:
    "„Sichtbar für“ nennt nur Stellen, die einen Link bekommen – nicht die Personalabteilung, die Führungskraft oder die Person selbst.",
  SICHTBAR_EIGENE_STELLE: "„Sichtbar für“ nennt nur weitere Stellen, nicht die eigene.",
  SICHTBAR_DOPPELT: "„Sichtbar für“ nennt jede Stelle nur einmal.",
  SICHTBAR_ZU_VIELE: "„Sichtbar für“ nennt zu viele Stellen.",
  EINRICHTUNGSARTEN_NUR_ZENTRAL:
    "Einrichtungsarten gibt es nur bei zentralen Positionen. Eine Position einer Einrichtung gilt ohnehin nur dort.",
  EINRICHTUNGSART_UNBEKANNT: "Unbekannte Einrichtungsart.",
  PERSONENGRUPPE_UNBEKANNT: "Unbekannte Personengruppe.",
  FAELLIG_UNGUELTIG: `Die Fälligkeit muss eine ganze Zahl von −${GRENZEN.faelligTage} bis ${GRENZEN.faelligTage} Tagen sein.`,
  HINWEIS_FUEHRUNGSKRAFT_ZU_LANG: `Der Hinweis für die Führungskraft darf höchstens ${GRENZEN.hinweisFuehrungskraft} Zeichen lang sein.`,
  HINWEIS_STELLE_ZU_LANG: `Der Hinweis für die Stelle darf höchstens ${GRENZEN.hinweisStelle} Zeichen lang sein.`,
  PLATZHALTER_ZU_LANG: `Der Platzhalter der Bemerkung darf höchstens ${GRENZEN.bemerkungPlatzhalter} Zeichen lang sein.`,
  AUFGABENTITEL_ZU_LANG: `Der Aufgabentitel darf höchstens ${GRENZEN.aufgabeTitel} Zeichen lang sein.`,
  // ---- nur Zod (Form der Felder) ----
  REIHENFOLGE_UNGUELTIG: `Die Reihenfolge muss eine ganze Zahl von 0 bis ${REIHENFOLGE_MAX} sein.`,
  OHNE_KLAMMERN:
    "Der Text darf keine spitzen Klammern (< >), keine Zeilenumbrüche und keine Steuerzeichen enthalten.",
  STEUERZEICHEN: "Der Text enthält unzulässige Steuerzeichen.",
  MINDESTENS_EIN_FELD: "Mindestens ein Feld erforderlich.",
  EINRICHTUNG_UNGUELTIG: "Ungültige Einrichtung.",
  AUSGEBLENDET_FEHLT: "Bitte angeben, ob die Position für die Einrichtung ausgeblendet wird.",
  // ---- Routen der Einstellungen (S3) und Katalogseite (S4) ----
  POSITION_NICHT_GEFUNDEN: "Position nicht gefunden",
  EINRICHTUNG_UNBEKANNT: "Unbekannte Einrichtung.",
  POSITION_VORHANDEN: "Diese Position gibt es schon.",
  IN_VERWENDUNG:
    "Die Position wurde schon in einem Vorgang gewählt und lässt sich deshalb nicht löschen. Bitte ausschalten statt löschen.",
  AUSBLENDEN_NUR_ZENTRAL:
    "Ausblenden lassen sich nur zentrale Positionen. Eine Position der Einrichtung bitte ausschalten.",
  POSITION_INZWISCHEN_GEAENDERT:
    "Die Position wurde inzwischen an anderer Stelle geändert. Bitte den neuen Stand prüfen und die Änderung erneut vornehmen.",
  /** Zod: `stand` (updatedAt beim Öffnen des Dialogs) ist kein Zeitstempel. */
  STAND_UNGUELTIG: "Ungültiger Stand der Position. Bitte die Seite neu laden.",
  VORSCHLAEGE_ALLE_VORHANDEN: "Alle Vorschläge stehen schon im Katalog. Es wurde nichts angelegt.",
  // ---- Arbeitsort am Vorgang (S5, E-A10) ----
  ARBEITSORT_UNGUELTIG: "Ungültiger Arbeitsort.",
  /** Wie beim Anlegen eines Vorgangs mit unbekannter oder fremder Einrichtung (gleicher Text, 404). */
  ORGANISATION_NICHT_GEFUNDEN: "Organisation nicht gefunden",
  ARBEITSORT_LINK_ERZEUGT:
    "Der Arbeitsort lässt sich nur ändern, solange der Link zu den Einstellungsmodalitäten noch nicht erzeugt ist.",
  ARBEITSORT_VORGANG_GEPRUEFT:
    "Der Vorgang ist geprüft, abgeschlossen oder abgelaufen – der Arbeitsort lässt sich nicht mehr ändern.",
  ARBEITSORT_UNVERAENDERT: "Der Arbeitsort ist unverändert.",
  ARBEITSORT_GESPEICHERT: "Arbeitsort gespeichert.",
} as const;

// =============================================
// Typen des Katalogs
// =============================================

/**
 * Die Felder einer Katalogposition, die `positionPruefen` gegeneinander prueft.
 * So liefert sie `katalogPositionSchema` (Anlegen), so baut sie der Dialog vor
 * dem Senden, und so ergibt sie sich beim Aendern aus gespeicherter Zeile plus
 * Aenderung. Werte sind Zeichenketten (Zustaende sind keine Enums), damit auch
 * eine Zeile aus der Datenbank ohne Umweg hineinpasst.
 */
export interface PositionEntwurf {
  departmentKey: string;
  /** null = zentral (alle Einrichtungen). */
  organizationId: string | null;
  /** OrganizationType-Werte; nur zentral; leer = alle. */
  einrichtungsarten: readonly string[];
  art: string;
  /** Nur ANGABE: Schluessel aus ANGABEN_KATALOG. */
  angabeSchluessel: string | null;
  bezeichnung: string;
  hinweisFuehrungskraft: string | null;
  hinweisStelle: string | null;
  /** Nur AUSWAHL: 1..40. */
  optionen: readonly string[];
  /** Nur JA_NEIN. */
  vorausgewaehlt: boolean;
  /** Nur AUSWAHL, Teilmenge von `optionen` (F8). */
  vorausgewaehlteOptionen: readonly string[];
  bemerkungAnbieten: boolean;
  bemerkungPlatzhalter: string | null;
  aufgabeTitel: string | null;
  /** Tage relativ zum Vertragsbeginn; bei ANGABE immer null. */
  defaultDueDays: number | null;
  /** QuestionnaireType-Werte; leer = alle. */
  personengruppen: readonly string[];
  /** Nur ANGABE: weitere Stellen, die die Angabe sehen. */
  sichtbarFuer: readonly string[];
  /** F10: dann nur Stelle HR. */
  entgeltrelevant: boolean;
}

/** Eine gespeicherte Katalogposition (Zeile von AusstattungsPosition). */
export interface KatalogPosition extends PositionEntwurf {
  id: string;
  isActive: boolean;
  orderIndex: number;
  vorschlagSchluessel?: string | null;
  ausgabeKennung?: string | null;
  rueckgabeKategorie?: string | null;
  beiAustritt?: string | null;
}

/** Eine Einrichtung blendet eine zentrale Position fuer sich aus (AusstattungsAusblendung). */
export interface Ausblendung {
  positionId: string;
  organizationId: string;
}

/** Wo die Person arbeitet – danach richtet sich, welche Positionen gelten (E-A10). */
export interface Arbeitsort {
  /**
   * Wirksamer Arbeitsort: `arbeitsortId ?? organizationId` des Vorgangs
   * (`onboardingEmpfaengerEinrichtung` in abteilungsaufgaben.ts).
   */
  arbeitsortId: string;
  /** OrganizationType des Arbeitsorts; null = unbekannt (dann gelten nur Positionen ohne Einschraenkung). */
  einrichtungsart: string | null;
}

/** Was `positionenFuer` ueber den Vorgang wissen muss. */
export interface KatalogKontext extends Arbeitsort {
  /** QuestionnaireType des Vorgangs (Personengruppe). */
  questionnaireType: string;
  /** ProcessType des Vorgangs; Ausstattung gibt es nur bei EINSTELLUNG. */
  processType: string;
  ausblendungen: ReadonlyArray<Ausblendung>;
  /**
   * Hat die Stelle am Arbeitsort eine aktive Adresse? Der Aufrufer fragt
   * `empfaengerAufloesen` mit der Einrichtung des Arbeitsorts. Fuer HR wird
   * nie gefragt (Aufgabe im Portal, ohne Link).
   */
  adresseVorhanden: (departmentKey: string) => boolean;
}

/** Eine Position, wie die Fuehrungskraft sie im Formular sieht (Regel 7: ohne interne Felder). */
export interface FormularPosition {
  id: string;
  departmentKey: string;
  art: string;
  bezeichnung: string;
  hinweisFuehrungskraft: string | null;
  /** Nur AUSWAHL, sonst leer. */
  optionen: string[];
  /** Nur JA_NEIN. */
  vorausgewaehlt: boolean;
  /** Nur AUSWAHL. */
  vorausgewaehlteOptionen: string[];
  /** Bei ANGABE immer false. */
  bemerkungAnbieten: boolean;
  bemerkungPlatzhalter: string | null;
  /** Nur ANGABE: Feld aus ANGABEN_KATALOG und wer die Angabe ausser der eigenen Stelle sieht. */
  angabe: {
    platzhalter: string;
    hilfe: string | null;
    max: number;
    sichtbarFuer: { departmentKey: string; stelleName: string }[];
  } | null;
}

/** Die Positionen einer Stelle im Formular („Diese Angaben erhält die IT.“). */
export interface FormularGruppe {
  departmentKey: string;
  stelleName: string;
  positionen: FormularPosition[];
}

/** Eine Einrichtung fuer die Warnungen der Katalogseite. */
export interface KatalogEinrichtung {
  id: string;
  name: string;
  /** OrganizationType. */
  type: string | null;
  /** Inaktive Einrichtungen bekommen keine Warnung. */
  isActive?: boolean;
}

/** Position × Einrichtung, an der die Position gilt, deren Stelle dort keine Adresse hat (Regel 11). */
export interface Luecke {
  positionId: string;
  bezeichnung: string;
  departmentKey: string;
  /** Anzeigename der Stelle (Eintrag aus den Einstellungen, sonst Label des Schluessels). */
  stelleName: string;
  organizationId: string;
  einrichtung: string;
  grund: "KEINE_ADRESSE" | "ABTEILUNG_INAKTIV";
  /** Fertiger Satz fuer die Katalogseite. */
  text: string;
}

/** Punkt einer Checklisten-Vorlage, wie `aehnlicheVorlagenpunkte` ihn liest. */
export interface KatalogVorlagenpunkt extends VorlagenPunkt {
  id?: string;
  title: string;
}

/** Vorlagenpunkt derselben Stelle, der nach einer Katalogposition klingt (doppelte Aufgabe droht). */
export interface Treffer {
  positionId: string;
  bezeichnung: string;
  departmentKey: string;
  templateId: string;
  templateName: string;
  punktId: string | null;
  punktTitel: string;
  /** Das Wort, das in beiden vorkommt (kleingeschrieben). */
  wort: string;
  /** Fertiger Satz fuer die Katalogseite. */
  text: string;
}

// =============================================
// Kleine Hilfen und Typpruefungen
// =============================================

export function istAusstattungsArt(art: string | null | undefined): art is AusstattungsArt {
  return !!art && (AUSSTATTUNG_ARTEN as readonly string[]).includes(art);
}

export function istAngabeSchluessel(schluessel: string | null | undefined): schluessel is AngabeSchluessel {
  return !!schluessel && (ANGABE_SCHLUESSEL as readonly string[]).includes(schluessel);
}

/** Regel 11: MITARBEITER und VORGESETZTER bekommen keine Positionen. */
export function istNichtErlaubteStelle(departmentKey: string | null | undefined): boolean {
  return !!departmentKey && (NICHT_ERLAUBTE_STELLEN as readonly string[]).includes(departmentKey);
}

function leer(text: string | null | undefined): boolean {
  return !text || text.trim() === "";
}

/** Eigener Schluessel eines Objekts (nicht aus dem Prototyp: „constructor“ ist keine Personengruppe). */
function hatEigenen(objekt: object, schluessel: string): boolean {
  return Object.prototype.hasOwnProperty.call(objekt, schluessel);
}

function laenger(text: string | null | undefined, max: number): boolean {
  return !!text && text.trim().length > max;
}

/**
 * Reihenfolge der Stellen: wie die Zeilen der Abteilungskarte
 * (`abteilungsReihenfolge`: feste Link-Stellen, eigene alphabetisch), dahinter
 * HR und alles, was keinen Link bekommt.
 */
function stellenRang(schluessel: Iterable<string>): Map<string, number> {
  const alle = [...new Set(schluessel)];
  const reihe = abteilungsReihenfolge(alle);
  const rest = alle.filter((k) => !reihe.includes(k)).sort();
  return new Map([...reihe, ...rest].map((k, i) => [k, i]));
}

/**
 * Nach Stelle, dann orderIndex, dann Bezeichnung (deutsch sortiert). Dieselbe
 * Reihenfolge fuer das Formular (`positionenFuer`) und die Katalogseite
 * (GET /api/settings/ausstattung).
 */
export function nachStelleSortiert<T extends Pick<KatalogPosition, "departmentKey" | "orderIndex" | "bezeichnung">>(
  liste: ReadonlyArray<T>,
): T[] {
  const rang = stellenRang(liste.map((p) => p.departmentKey));
  return [...liste].sort(
    (a, b) =>
      (rang.get(a.departmentKey) ?? 0) - (rang.get(b.departmentKey) ?? 0) ||
      a.orderIndex - b.orderIndex ||
      a.bezeichnung.localeCompare(b.bezeichnung, "de"),
  );
}

// =============================================
// Katalogregeln (Feinplan 1.3, Schritt S2)
// =============================================

/** Optionen einer Auswahl: 1..40, getrimmt, eindeutig (ohne Gross/Klein), Vorauswahl daraus. */
function optionenPruefen(optionen: readonly string[], vorausgewaehlt: readonly string[]): string | null {
  if (optionen.length === 0) return MELDUNGEN.OPTIONEN_FEHLEN;
  if (optionen.length > GRENZEN.optionen) return MELDUNGEN.OPTIONEN_ZU_VIELE;
  const gesehen = new Set<string>();
  for (const option of optionen) {
    if (!option || option !== option.trim()) return MELDUNGEN.OPTION_LEER;
    if (option.length > GRENZEN.option) return MELDUNGEN.OPTION_ZU_LANG;
    const schluessel = option.toLocaleLowerCase("de");
    if (gesehen.has(schluessel)) return MELDUNGEN.OPTION_DOPPELT;
    gesehen.add(schluessel);
  }
  if (vorausgewaehlt.some((v) => !optionen.includes(v))) return MELDUNGEN.VORAUSWAHL_NICHT_IN_OPTIONEN;
  return null;
}

/**
 * Prueft die Felder einer Katalogposition gegeneinander. Dialog und Server
 * rufen dieselbe Funktion (der Server beim Anlegen auf dem geparsten Body, beim
 * Aendern auf dem zusammengefuehrten Stand). Liefert die erste Meldung oder
 * `null`.
 *
 *   - Stelle: Schluesselform, nie MITARBEITER/VORGESETZTER (Regel 11);
 *     `entgeltrelevant` verlangt HR (E-A24, F10).
 *   - AUSWAHL: 1..40 eindeutige, getrimmte Optionen; `vorausgewaehlteOptionen`
 *     ist eine Teilmenge davon. Optionen gibt es nur bei AUSWAHL,
 *     `vorausgewaehlt` nur bei JA_NEIN.
 *   - ANGABE: Schluessel aus ANGABEN_KATALOG (E-A13), Bezeichnung = dessen
 *     Label; keine Faelligkeit, kein Aufgabentitel, kein Bemerkungsfeld (eine
 *     Angabe wird keine Aufgabe). `sichtbarFuer` nur hier, nur Link-Stellen,
 *     ohne die eigene.
 *   - `einrichtungsarten` nur bei zentralen Positionen; Werte, Personengruppen,
 *     Faelligkeit (±365) und Laengen nach GRENZEN.
 *
 * Zeichen (spitze Klammern, Steuerzeichen) prueft Zod, nicht diese Funktion.
 */
export function positionPruefen(p: PositionEntwurf): string | null {
  const stelle = (p.departmentKey ?? "").trim();
  if (!stelle) return MELDUNGEN.STELLE_FEHLT;
  if (istNichtErlaubteStelle(stelle)) return MELDUNGEN.STELLE_NICHT_ERLAUBT;
  if (!ABTEILUNGS_SCHLUESSEL_MUSTER.test(stelle)) return MELDUNGEN.STELLE_UNGUELTIG;
  if (!istAusstattungsArt(p.art)) return MELDUNGEN.ART_UNBEKANNT;

  const bezeichnung = (p.bezeichnung ?? "").trim();
  if (!bezeichnung) return MELDUNGEN.BEZEICHNUNG_FEHLT;
  if (bezeichnung.length > GRENZEN.bezeichnung) return MELDUNGEN.BEZEICHNUNG_ZU_LANG;
  if (p.entgeltrelevant && stelle !== DEPARTMENT_KEYS.HR) return MELDUNGEN.ENTGELT_NUR_HR;

  // ---- Art ----
  if (p.art === "AUSWAHL") {
    const fehler = optionenPruefen(p.optionen, p.vorausgewaehlteOptionen);
    if (fehler) return fehler;
  } else if (p.optionen.length > 0 || p.vorausgewaehlteOptionen.length > 0) {
    return MELDUNGEN.OPTIONEN_NUR_AUSWAHL;
  }
  if (p.art !== "JA_NEIN" && p.vorausgewaehlt) return MELDUNGEN.VORAUSWAHL_NUR_JA_NEIN;

  if (p.art === "ANGABE") {
    if (!istAngabeSchluessel(p.angabeSchluessel)) return MELDUNGEN.ANGABE_UNBEKANNT;
    if (bezeichnung !== ANGABEN_KATALOG[p.angabeSchluessel].label) return MELDUNGEN.ANGABE_BEZEICHNUNG;
    if (p.defaultDueDays != null || !leer(p.aufgabeTitel)) return MELDUNGEN.ANGABE_OHNE_AUFGABE;
    if (p.bemerkungAnbieten || !leer(p.bemerkungPlatzhalter)) return MELDUNGEN.ANGABE_OHNE_BEMERKUNG;
  } else {
    if (!leer(p.angabeSchluessel)) return MELDUNGEN.ANGABE_SCHLUESSEL_NUR_ANGABE;
    if (p.sichtbarFuer.length > 0) return MELDUNGEN.SICHTBAR_NUR_ANGABE;
  }

  // ---- Sichtbar fuer (gibt es nach dem Block oben nur bei ANGABE) ----
  const sichtbar = new Set<string>();
  for (const roh of p.sichtbarFuer) {
    const key = roh.trim();
    if (!istLinkAbteilung(key) || istFuehrungskraft(key)) return MELDUNGEN.SICHTBAR_UNGUELTIG;
    if (key === stelle) return MELDUNGEN.SICHTBAR_EIGENE_STELLE;
    if (sichtbar.has(key)) return MELDUNGEN.SICHTBAR_DOPPELT;
    sichtbar.add(key);
  }

  // ---- Gilt fuer ----
  if (p.einrichtungsarten.length > 0 && !leer(p.organizationId)) return MELDUNGEN.EINRICHTUNGSARTEN_NUR_ZENTRAL;
  if (p.einrichtungsarten.some((a) => !hatEigenen(EINRICHTUNGSARTEN, a))) {
    return MELDUNGEN.EINRICHTUNGSART_UNBEKANNT;
  }
  if (p.personengruppen.some((g) => !hatEigenen(PERSONENGRUPPEN, g))) return MELDUNGEN.PERSONENGRUPPE_UNBEKANNT;

  // ---- Faelligkeit und Laengen ----
  if (
    p.defaultDueDays != null &&
    (!Number.isInteger(p.defaultDueDays) || Math.abs(p.defaultDueDays) > GRENZEN.faelligTage)
  ) {
    return MELDUNGEN.FAELLIG_UNGUELTIG;
  }
  if (laenger(p.hinweisFuehrungskraft, GRENZEN.hinweisFuehrungskraft)) return MELDUNGEN.HINWEIS_FUEHRUNGSKRAFT_ZU_LANG;
  if (laenger(p.hinweisStelle, GRENZEN.hinweisStelle)) return MELDUNGEN.HINWEIS_STELLE_ZU_LANG;
  if (laenger(p.bemerkungPlatzhalter, GRENZEN.bemerkungPlatzhalter)) return MELDUNGEN.PLATZHALTER_ZU_LANG;
  if (laenger(p.aufgabeTitel, GRENZEN.aufgabeTitel)) return MELDUNGEN.AUFGABENTITEL_ZU_LANG;
  return null;
}

/**
 * Gilt die Position am Arbeitsort? Eine Position einer Einrichtung gilt nur
 * dort; eine zentrale ueberall, wo die Einrichtungsart passt (leer = alle) und
 * der Arbeitsort sie nicht ausgeblendet hat (Plan, Abschnitt 5). Ob sie aktiv
 * ist, prueft der Aufrufer.
 */
export function positionGiltAm(
  p: Pick<KatalogPosition, "id" | "organizationId" | "einrichtungsarten">,
  ort: Arbeitsort,
  ausblendungen: ReadonlyArray<Ausblendung>,
): boolean {
  if (p.organizationId) return p.organizationId === ort.arbeitsortId;
  if (p.einrichtungsarten.length > 0 && !(ort.einrichtungsart && p.einrichtungsarten.includes(ort.einrichtungsart))) {
    return false;
  }
  return !ausblendungen.some((a) => a.positionId === p.id && a.organizationId === ort.arbeitsortId);
}

/**
 * Die Positionen, die der Vorgang anbietet (Regel 1): aktiv, am Arbeitsort
 * gueltig, nur bei EINSTELLUNG, Personengruppe passt (leer = alle), und die
 * Stelle ist HR oder hat am Arbeitsort eine aktive Adresse – sonst ginge die
 * Aufgabe ins Leere. Was nie gelten darf (Stelle MITARBEITER/VORGESETZTER,
 * unbekannte Art, Angabe ausserhalb der festen Liste), faellt auch dann weg,
 * wenn es an der Pruefung vorbei in der Datenbank steht.
 *
 * Sortiert nach Stelle (`abteilungsReihenfolge`, HR dahinter), dann
 * `orderIndex`, dann Bezeichnung. Leer heisst: kein Schritt im Formular.
 */
export function positionenFuer<T extends KatalogPosition>(katalog: ReadonlyArray<T>, ctx: KatalogKontext): T[] {
  if (ctx.processType !== "EINSTELLUNG") return [];
  const passend = katalog.filter(
    (p) =>
      p.isActive &&
      istAusstattungsArt(p.art) &&
      !istNichtErlaubteStelle(p.departmentKey) &&
      (p.art !== "ANGABE" || istAngabeSchluessel(p.angabeSchluessel)) &&
      positionGiltAm(p, ctx, ctx.ausblendungen) &&
      (p.personengruppen.length === 0 || p.personengruppen.includes(ctx.questionnaireType)) &&
      (p.departmentKey === DEPARTMENT_KEYS.HR || ctx.adresseVorhanden(p.departmentKey)),
  );
  return nachStelleSortiert(passend);
}

/**
 * Die Katalogsicht der Fuehrungskraft, gruppiert nach Stelle in der Reihenfolge
 * der Eingabe (`positionenFuer` sortiert schon). Der Modalitaeten-Link ist ein
 * Inhaber-Token ohne Anmeldung: Hinaus geht nur, was das Formular braucht –
 * `hinweisStelle`, `ausgabeKennung`, `entgeltrelevant`, `vorschlagSchluessel`
 * und die uebrigen internen Felder (Faelligkeit, Aufgabentitel, Geltung, A4)
 * fehlen ganz (Regel 7). Felder, die zur Art nicht passen, kommen leer.
 *
 * `stellenNamen`: Anzeigename je Schluessel (Einstellungen → Abteilungen am
 * Arbeitsort); fehlt einer, gilt das Label des Schluessels.
 */
export function formularGruppen(
  positionen: ReadonlyArray<KatalogPosition>,
  stellenNamen: Readonly<Record<string, string>>,
): FormularGruppe[] {
  const name = (key: string) => (hatEigenen(stellenNamen, key) && stellenNamen[key]) || abteilungLabel(key);
  const gruppen = new Map<string, FormularGruppe>();
  for (const p of positionen) {
    let gruppe = gruppen.get(p.departmentKey);
    if (!gruppe) {
      gruppe = { departmentKey: p.departmentKey, stelleName: name(p.departmentKey), positionen: [] };
      gruppen.set(p.departmentKey, gruppe);
    }
    const auswahl = p.art === "AUSWAHL";
    const angabe =
      p.art === "ANGABE" && istAngabeSchluessel(p.angabeSchluessel) ? ANGABEN_KATALOG[p.angabeSchluessel] : null;
    const bemerkung = p.art !== "ANGABE" && p.bemerkungAnbieten;
    gruppe.positionen.push({
      id: p.id,
      departmentKey: p.departmentKey,
      art: p.art,
      bezeichnung: p.bezeichnung,
      hinweisFuehrungskraft: leer(p.hinweisFuehrungskraft) ? null : p.hinweisFuehrungskraft,
      optionen: auswahl ? [...p.optionen] : [],
      vorausgewaehlt: p.art === "JA_NEIN" && p.vorausgewaehlt,
      vorausgewaehlteOptionen: auswahl ? p.vorausgewaehlteOptionen.filter((o) => p.optionen.includes(o)) : [],
      bemerkungAnbieten: bemerkung,
      bemerkungPlatzhalter: bemerkung && !leer(p.bemerkungPlatzhalter) ? p.bemerkungPlatzhalter : null,
      angabe: angabe
        ? {
            platzhalter: angabe.platzhalter,
            hilfe: angabe.hilfe,
            max: angabe.max,
            sichtbarFuer: p.sichtbarFuer.map((key) => ({ departmentKey: key, stelleName: name(key) })),
          }
        : null,
    });
  }
  return [...gruppen.values()];
}

/**
 * Warnung der Katalogseite (Regel 11): aktive Position × aktive Einrichtung, an
 * der sie gilt, deren Stelle dort keine aktive Adresse hat
 * (`empfaengerAufloesen`: Eintrag der Einrichtung vor dem zentralen). Dort
 * fehlt die Position im Formular. HR braucht keine Adresse.
 *
 * Die Positionen tragen ihre Ausblendungen mit (`ausblendungen`, wie
 * GET /api/settings/ausstattung sie laedt).
 */
export function adressLuecken(
  positionen: ReadonlyArray<KatalogPosition & { ausblendungen?: ReadonlyArray<{ organizationId: string }> }>,
  einrichtungen: ReadonlyArray<KatalogEinrichtung>,
  konfigs: ReadonlyArray<AbteilungsKonfig>,
): Luecke[] {
  const luecken: Luecke[] = [];
  for (const p of positionen) {
    if (!p.isActive || !istLinkAbteilung(p.departmentKey) || istFuehrungskraft(p.departmentKey)) continue;
    const ausblendungen = (p.ausblendungen ?? []).map((a) => ({ positionId: p.id, organizationId: a.organizationId }));
    for (const e of einrichtungen) {
      if (e.isActive === false) continue;
      if (!positionGiltAm(p, { arbeitsortId: e.id, einrichtungsart: e.type }, ausblendungen)) continue;
      const empfaenger = empfaengerAufloesen({
        departmentKey: p.departmentKey,
        organizationId: e.id,
        konfigs,
        fuehrungskraft: null,
      });
      if (empfaenger.ok) continue;
      const grund = empfaenger.grund === "ABTEILUNG_INAKTIV" ? "ABTEILUNG_INAKTIV" : "KEINE_ADRESSE";
      const stelleName = empfaenger.departmentName;
      luecken.push({
        positionId: p.id,
        bezeichnung: p.bezeichnung,
        departmentKey: p.departmentKey,
        stelleName,
        organizationId: e.id,
        einrichtung: e.name,
        grund,
        text:
          grund === "ABTEILUNG_INAKTIV"
            ? `${e.name}: ${stelleName} ist deaktiviert – „${p.bezeichnung}“ fehlt dort im Formular.`
            : `${e.name}: keine aktive Adresse für ${stelleName} – „${p.bezeichnung}“ fehlt dort im Formular.`,
      });
    }
  }
  return luecken;
}

/** Ab so vielen Zeichen zaehlt ein Wort beim Vergleich mit Vorlagenpunkten („mit“, „PC“ nicht). */
export const AEHNLICH_MIN_ZEICHEN = 4;

/** Woerter eines Textes, kleingeschrieben, ab AEHNLICH_MIN_ZEICHEN Zeichen. */
function vergleichsWoerter(text: string): string[] {
  return text
    .toLocaleLowerCase("de")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= AEHNLICH_MIN_ZEICHEN);
}

/** Beugungsendungen: „Schlüssels“, „Laptops“, „Spinde“ sind dasselbe Wort. */
const BEUGUNGS_ENDUNGEN: ReadonlyArray<string> = ["s", "es", "e", "en", "n", "er", "ern", "ns"];

/**
 * Anfaenge von Ableitungen: Geht ein Titelwort nach dem Wort so weiter, ist es
 * ein anderes Wort und kein Ding derselben Art — „dienstliche“ aus „Dienst“,
 * „telefonisch“, „telefonieren“, „fachlich“.
 */
const ABLEITUNGS_ANFAENGE: ReadonlyArray<string> = ["lich", "isch", "ier", "haft", "bar", "sam", "los", "ig"];

/**
 * Passt das Wort einer Position zu EINEM Wort eines Vorlagentitels? Verglichen
 * wird Wort fuer Wort, nicht als Teilzeichenkette des ganzen Titels (sonst
 * traefe „Dienst-Laptop/PC“ ueber „dienst“ den Punkt „Benutzerkonto und
 * dienstliche E-Mail-Adresse anlegen“). Es passt:
 *   - dasselbe Wort, auch gebeugt („Schlüssels“);
 *   - ein zusammengesetztes Wort, das das Wort enthaelt, wenn der Rest davor
 *     und dahinter selbst ein Wort sein kann (mindestens AEHNLICH_MIN_ZEICHEN
 *     Zeichen): „Schulportalzugang“ ↔ „Schulportal“, „Postfach“ ↔ „Fach“,
 *     „Generalschlüssel“ ↔ „Schlüssel“.
 * Nicht: Ableitungen („dienstlich“, „telefonisch“) und kurze Reste
 * („Dienstag“, „entschlüsseln“).
 */
function wortPasst(titelWort: string, wort: string): boolean {
  for (let i = titelWort.indexOf(wort); i >= 0; i = titelWort.indexOf(wort, i + 1)) {
    const davor = titelWort.slice(0, i);
    const danach = titelWort.slice(i + wort.length);
    if (davor !== "" && davor.length < AEHNLICH_MIN_ZEICHEN) continue;
    if (danach === "" || BEUGUNGS_ENDUNGEN.includes(danach)) return true;
    if (danach.length >= AEHNLICH_MIN_ZEICHEN && !ABLEITUNGS_ANFAENGE.some((a) => danach.startsWith(a))) return true;
  }
  return false;
}

/**
 * Warnung der Katalogseite (Mockup 6.3, Plan: „Doppelte Aufgaben vermeiden“):
 * Vorlagenpunkte derselben Stelle (`defaultAssignee`), deren Titel ein Wort
 * mit mindestens 4 Zeichen aus Bezeichnung oder Option der Position enthaelt
 * (ohne Gross/Klein, Wort fuer Wort nach `wortPasst`; „Schlüssel
 * bereitlegen“ ↔ Position „Schlüssel“). Je Position und Vorlagenpunkt ein
 * Treffer. Angaben werden keine Aufgabe und bleiben deshalb aussen vor. Welche
 * Vorlagen zaehlen (aktive des Onboardings), waehlt der Aufrufer.
 */
export function aehnlicheVorlagenpunkte(
  positionen: ReadonlyArray<KatalogPosition>,
  vorlagenpunkte: ReadonlyArray<KatalogVorlagenpunkt>,
): Treffer[] {
  const treffer: Treffer[] = [];
  for (const p of positionen) {
    if (p.art === "ANGABE") continue;
    const woerter = [...new Set([p.bezeichnung, ...p.optionen].flatMap(vergleichsWoerter))];
    if (woerter.length === 0) continue;
    for (const v of vorlagenpunkte) {
      if ((v.defaultAssignee ?? "").trim() !== p.departmentKey) continue;
      const titelWoerter = vergleichsWoerter(v.title);
      const wort = woerter.find((w) => titelWoerter.some((t) => wortPasst(t, w)));
      if (!wort) continue;
      treffer.push({
        positionId: p.id,
        bezeichnung: p.bezeichnung,
        departmentKey: p.departmentKey,
        templateId: v.templateId,
        templateName: v.templateName,
        punktId: v.id ?? null,
        punktTitel: v.title,
        wort,
        text: `Vorlage „${v.templateName}“: „${v.title}“ klingt nach „${p.bezeichnung}“. Bitte den Vorlagenpunkt streichen oder umformulieren, sonst bekommt die Stelle zwei Aufgaben.`,
      });
    }
  }
  return treffer;
}

/**
 * Titel einer Ausstattungsaufgabe (Regel 4, Regel 17): `aufgabeTitel` bzw.
 * „<Bezeichnung> bereitstellen“, bei AUSWAHL mit „: <Option>“ dahinter
 * („Schlüssel ausgeben: Haupteingang“). Nur aus Katalogwerten, nie aus
 * Freitext – der Titel steht im Betreff von onboarding-task-completed.
 * `option` ist "" fuer die ganze Position.
 */
export function aufgabenTitel(
  zeile: { art: string; bezeichnung: string; aufgabeTitel?: string | null },
  option: string,
): string {
  const basis = (zeile.aufgabeTitel ?? "").trim() || `${zeile.bezeichnung.trim()} bereitstellen`;
  const opt = option.trim();
  return zeile.art === "AUSWAHL" && opt ? `${basis}: ${opt}` : basis;
}

// =============================================
// Vorschlaege fuer den Anfangsbestand (Plan, Abschnitt 5; E-A39)
// =============================================

/** Ein Vorschlag: eine vollstaendige Position mit festem Schluessel (F11). */
export interface Vorschlag extends PositionEntwurf {
  /** Fester Schluessel; `vorschlagSchluessel @unique` macht „Vorschläge übernehmen“ wiederholbar. */
  vorschlagSchluessel: string;
  orderIndex: number;
  einrichtungsarten: string[];
  optionen: string[];
  vorausgewaehlteOptionen: string[];
  personengruppen: string[];
  sichtbarFuer: string[];
  /**
   * Hinweis an die Verwaltung, die den Katalog pflegt — nur in der Vorschau
   * von „Vorschläge übernehmen“, nie in der Position (kein Katalogfeld; die
   * Fuehrungskraft liest nur `hinweisFuehrungskraft`).
   */
  pflegeHinweis?: string;
}

type VorschlagTeil = Pick<Vorschlag, "vorschlagSchluessel" | "departmentKey" | "art" | "bezeichnung"> &
  Partial<Omit<Vorschlag, "orderIndex">>;

/** Alle Felder mit ihrem Leerwert; jede Liste neu, damit kein Vorschlag eine fremde teilt. */
function vorschlag(teil: VorschlagTeil): Omit<Vorschlag, "orderIndex"> {
  return {
    organizationId: null,
    einrichtungsarten: [],
    angabeSchluessel: null,
    hinweisFuehrungskraft: null,
    hinweisStelle: null,
    optionen: [],
    vorausgewaehlt: false,
    vorausgewaehlteOptionen: [],
    bemerkungAnbieten: teil.art !== "ANGABE",
    bemerkungPlatzhalter: null,
    aufgabeTitel: null,
    defaultDueDays: null,
    personengruppen: [],
    sichtbarFuer: [],
    entgeltrelevant: false,
    ...teil,
  };
}

function angabeVorschlag(
  vorschlagSchluessel: string,
  departmentKey: string,
  angabeSchluessel: AngabeSchluessel,
  sichtbarFuer: string[] = [],
): Omit<Vorschlag, "orderIndex"> {
  return vorschlag({
    vorschlagSchluessel,
    departmentKey,
    art: "ANGABE",
    angabeSchluessel,
    bezeichnung: ANGABEN_KATALOG[angabeSchluessel].label,
    sichtbarFuer,
  });
}

/**
 * „Vorschläge übernehmen“ (Einstellungen → Ausstattung & Zugänge): alle zentral,
 * ohne Faelligkeit und – wie jede neue Position – ausgeschaltet (Regel 1). Die
 * Verwaltung schaltet ein, was passt, und traegt Fristen und die Raeume ihrer
 * Einrichtung selbst ein. Der Seed legt keinen Katalog an.
 */
export const VORSCHLAEGE: ReadonlyArray<Readonly<Vorschlag>> = [
  // ---- IT ----
  vorschlag({ vorschlagSchluessel: "IT_LAPTOP", departmentKey: "IT", art: "JA_NEIN", bezeichnung: "Dienst-Laptop/PC" }),
  vorschlag({
    vorschlagSchluessel: "IT_IPAD",
    departmentKey: "IT",
    art: "JA_NEIN",
    bezeichnung: "Dienst-iPad (Lernmittel)",
  }),
  vorschlag({
    vorschlagSchluessel: "IT_TELEFON",
    departmentKey: "IT",
    art: "JA_NEIN",
    bezeichnung: "Telefon mit Durchwahl",
  }),
  vorschlag({
    vorschlagSchluessel: "IT_BYOD",
    departmentKey: "IT",
    art: "JA_NEIN",
    bezeichnung: "Private Endgeräte (BYOD) freischalten",
    // Sonst hiesse die Aufgabe „… freischalten bereitstellen“.
    aufgabeTitel: "Private Endgeräte (BYOD) freischalten",
  }),
  vorschlag({
    vorschlagSchluessel: "IT_ZUGAENGE",
    departmentKey: "IT",
    art: "AUSWAHL",
    bezeichnung: "Zugänge",
    optionen: ["Dienst-E-Mail", "Schulportal", "WebUntis", "Schulverwaltung", "Drucker-PIN"],
    vorausgewaehlteOptionen: ["Dienst-E-Mail"],
    aufgabeTitel: "Zugang einrichten",
    // E-A28: Zugaenge erst nach der Verpflichtung auf Vertraulichkeit.
    hinweisStelle: "Erst nach Verpflichtung auf Vertraulichkeit freischalten.",
  }),
  angabeVorschlag("IT_DURCHWAHL", "IT", "DURCHWAHL"),
  // ---- Gebaeudewirtschaft ----
  vorschlag({
    vorschlagSchluessel: "FACILITY_TRANSPONDER",
    departmentKey: "FACILITY",
    art: "JA_NEIN",
    bezeichnung: "Transponder/Chip",
  }),
  vorschlag({ vorschlagSchluessel: "FACILITY_PARKPLATZ", departmentKey: "FACILITY", art: "JA_NEIN", bezeichnung: "Parkplatz" }),
  vorschlag({ vorschlagSchluessel: "FACILITY_SPIND", departmentKey: "FACILITY", art: "JA_NEIN", bezeichnung: "Spind" }),
  vorschlag({
    vorschlagSchluessel: "FACILITY_SCHLUESSEL",
    departmentKey: "FACILITY",
    art: "AUSWAHL",
    bezeichnung: "Schlüssel",
    optionen: ["Haupteingang", "Lehrerzimmer"],
    aufgabeTitel: "Schlüssel ausgeben",
    // Steht im Formular unter der Position — richtet sich deshalb an die Fuehrungskraft.
    hinweisFuehrungskraft: "Weitere Räume bitte in der Bemerkung nennen.",
    // Die Pflegeanweisung gehoert in die Vorschau, nicht ins Formular.
    pflegeHinweis: "Räume einer Einrichtung bitte als eigene Position dieser Einrichtung anlegen.",
  }),
  angabeVorschlag("FACILITY_UNTERRICHTSFAECHER", "FACILITY", "UNTERRICHTSFAECHER", ["IT"]),
  // ---- Verwaltung / Sekretariat ----
  vorschlag({
    vorschlagSchluessel: "VERWALTUNG_FACH",
    departmentKey: "VERWALTUNG",
    art: "JA_NEIN",
    bezeichnung: "Fach im Lehrerzimmer",
  }),
  vorschlag({
    vorschlagSchluessel: "VERWALTUNG_KOPIERKARTE",
    departmentKey: "VERWALTUNG",
    art: "JA_NEIN",
    bezeichnung: "Kopierkarte",
  }),
  vorschlag({
    vorschlagSchluessel: "VERWALTUNG_TUERSCHILD",
    departmentKey: "VERWALTUNG",
    art: "JA_NEIN",
    bezeichnung: "Türschild",
  }),
  vorschlag({
    vorschlagSchluessel: "VERWALTUNG_DIENSTAUSWEIS",
    departmentKey: "VERWALTUNG",
    art: "JA_NEIN",
    bezeichnung: "Dienstausweis",
  }),
].map((v, i) => ({ ...v, orderIndex: i * 10 }));

// =============================================
// Katalogseite: Felder, Aenderungen, Stellen, Warnungen (Feinplan S3)
// =============================================

/**
 * Die Felder einer Katalogposition, die Anlegen, Aendern und Protokoll kennen —
 * die Positivliste der Einstellungsrouten. Bewusst NICHT dabei: die Stufe-2-
 * Felder (`ausgabeKennung`, `rueckgabeKategorie`, `beiAustritt`) und
 * `vorschlagSchluessel` (schreibt nur „Vorschläge übernehmen“), dazu ID und
 * Zeitstempel. Deckt sich mit den Feldern von `katalogPositionSchema` plus
 * `isActive` (ausstattung-validierung.test.ts haelt das).
 */
export const KATALOG_FELDER = [
  "departmentKey",
  "organizationId",
  "einrichtungsarten",
  "art",
  "angabeSchluessel",
  "bezeichnung",
  "hinweisFuehrungskraft",
  "hinweisStelle",
  "optionen",
  "vorausgewaehlt",
  "vorausgewaehlteOptionen",
  "bemerkungAnbieten",
  "bemerkungPlatzhalter",
  "aufgabeTitel",
  "defaultDueDays",
  "personengruppen",
  "sichtbarFuer",
  "entgeltrelevant",
  "orderIndex",
  "isActive",
] as const satisfies ReadonlyArray<keyof KatalogPosition>;

export type KatalogFeld = (typeof KATALOG_FELDER)[number];
export type KatalogWerte = Pick<KatalogPosition, KatalogFeld>;
export type KatalogWert = KatalogWerte[KatalogFeld];

/**
 * Ein Feld vorher und nachher (Protokoll `AUSSTATTUNG_POSITION_GEAENDERT`,
 * Regel 18). Ein Typ-Alias, kein Interface: So passt die Aenderungsliste ohne
 * Umwandlung in die JSON-Spalte `details`.
 */
export type FeldAenderung = {
  von: KatalogWert;
  nach: KatalogWert;
};

function gleicherWert(a: KatalogWert | undefined, b: KatalogWert | undefined): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const x = (a ?? []) as readonly string[];
    const y = (b ?? []) as readonly string[];
    return x.length === y.length && x.every((wert, i) => wert === y[i]);
  }
  return (a ?? null) === (b ?? null);
}

/**
 * Nur die Felder der Positivliste, Listen kopiert — fuer das Protokoll beim
 * Anlegen und Loeschen (`nachher` bzw. `vorher`) und als Grundlage der
 * Schreibdaten. Eine Zeile aus der Datenbank traegt mehr (ID, Zeitstempel,
 * Stufe-2-Felder); die bleiben draussen.
 */
export function katalogWerte(p: KatalogWerte): KatalogWerte {
  return {
    departmentKey: p.departmentKey,
    organizationId: p.organizationId,
    einrichtungsarten: [...p.einrichtungsarten],
    art: p.art,
    angabeSchluessel: p.angabeSchluessel,
    bezeichnung: p.bezeichnung,
    hinweisFuehrungskraft: p.hinweisFuehrungskraft,
    hinweisStelle: p.hinweisStelle,
    optionen: [...p.optionen],
    vorausgewaehlt: p.vorausgewaehlt,
    vorausgewaehlteOptionen: [...p.vorausgewaehlteOptionen],
    bemerkungAnbieten: p.bemerkungAnbieten,
    bemerkungPlatzhalter: p.bemerkungPlatzhalter,
    aufgabeTitel: p.aufgabeTitel,
    defaultDueDays: p.defaultDueDays,
    personengruppen: [...p.personengruppen],
    sichtbarFuer: [...p.sichtbarFuer],
    entgeltrelevant: p.entgeltrelevant,
    orderIndex: p.orderIndex,
    isActive: p.isActive,
  };
}

/**
 * Was ein PATCH wirklich aendert: je Feld der Positivliste, das in der
 * Aenderung steht (`undefined` = unveraendert) und vom gespeicherten Wert
 * abweicht. Listen zaehlen mit ihrer Reihenfolge (die Optionen erscheinen in
 * dieser Reihenfolge im Formular). Leere `daten` heisst: nichts schreiben,
 * nichts protokollieren. Felder ausserhalb der Liste werden uebergangen.
 */
export function katalogAenderungen(
  bisher: KatalogWerte,
  aenderung: Partial<KatalogWerte>,
): { daten: Partial<KatalogWerte>; aenderungen: Partial<Record<KatalogFeld, FeldAenderung>> } {
  const daten: Partial<Record<KatalogFeld, KatalogWert>> = {};
  const aenderungen: Partial<Record<KatalogFeld, FeldAenderung>> = {};
  for (const feld of KATALOG_FELDER) {
    const neu = aenderung[feld];
    if (neu === undefined || gleicherWert(bisher[feld], neu)) continue;
    daten[feld] = neu;
    aenderungen[feld] = { von: bisher[feld], nach: neu };
  }
  return { daten: daten as Partial<KatalogWerte>, aenderungen };
}

/** Eine Stelle zur Auswahl auf der Katalogseite (Dialog und Filter). */
export interface KatalogStelle {
  key: string;
  name: string;
}

/**
 * Anzeigename einer Stelle auf der Katalogseite: der zentrale Eintrag unter
 * Einstellungen → Abteilungen, sonst der erste einer Einrichtung (nach Namen),
 * sonst das Label des Schluessels. Reservierte Schluessel (HR) behalten ihr
 * Label — eine Altzeile dort bekommt nie Post und benennt nichts.
 */
function katalogStellenName(key: string, konfigs: ReadonlyArray<AbteilungsKonfig>): string {
  if ((RESERVIERTE_ABTEILUNGSSCHLUESSEL as readonly string[]).includes(key)) return abteilungLabel(key);
  const eigene = konfigs.filter((k) => k.departmentKey === key && k.departmentName.trim() !== "");
  const zentral = eigene.find((k) => k.organizationId === null);
  const einrichtung = [...eigene].sort((a, b) => a.departmentName.localeCompare(b.departmentName, "de"))[0];
  return (zentral ?? einrichtung)?.departmentName.trim() || abteilungLabel(key);
}

/**
 * Die Stellen, die eine Katalogposition bekommen kann: die festen
 * Link-Abteilungen und HR (Aufgabe im Portal), die unter Einstellungen →
 * Abteilungen angelegten eigenen Schluessel und jeder Schluessel, den eine
 * Position schon traegt (damit eine Altposition im Filter nicht fehlt). Nie
 * MITARBEITER oder VORGESETZTER (Regel 11). Reihenfolge wie die Zeilen der
 * Abteilungskarte, HR dahinter.
 */
export function katalogStellen(
  konfigs: ReadonlyArray<AbteilungsKonfig>,
  positionen: ReadonlyArray<{ departmentKey: string }>,
): KatalogStelle[] {
  const schluessel = new Set<string>([...LINK_ABTEILUNGEN, DEPARTMENT_KEYS.HR]);
  for (const k of konfigs) if (ABTEILUNGS_SCHLUESSEL_MUSTER.test(k.departmentKey)) schluessel.add(k.departmentKey);
  for (const p of positionen) if (ABTEILUNGS_SCHLUESSEL_MUSTER.test(p.departmentKey)) schluessel.add(p.departmentKey);
  for (const k of NICHT_ERLAUBTE_STELLEN) schluessel.delete(k);
  const rang = stellenRang(schluessel);
  return [...schluessel]
    .sort((a, b) => (rang.get(a) ?? 0) - (rang.get(b) ?? 0))
    .map((key) => ({ key, name: katalogStellenName(key, konfigs) }));
}

/** Adresse einer Stelle, deren Domain nicht auf der Freigabeliste steht (E-A27: nur warnen). */
export interface FreigabeWarnung {
  departmentKey: string;
  stelleName: string;
  email: string;
  /** null = zentraler Eintrag. */
  organizationId: string | null;
  /** Name der Einrichtung, null beim zentralen Eintrag. */
  einrichtung: string | null;
  /** Fertiger Satz fuer die Katalogseite. */
  text: string;
}

/**
 * Warnung der Katalogseite (E-A27): aktive Eintraege unter Einstellungen →
 * Abteilungen fuer eine Stelle, die eine Katalogposition traegt (ein- oder
 * ausgeschaltet), deren Adresse nicht auf der Freigabeliste steht. Gesperrt
 * wird nichts — Aufgaben gehen trotzdem dorthin. Die Fuehrungskraft und HR
 * haben keinen Eintrag; Eintraege inaktiver Einrichtungen bekommen keine
 * Warnung (wie bei den Adresslücken).
 *
 * `freigegeben` ist die Regel der Freigabeliste (`empfaengerFreigegeben` mit
 * den gepflegten Domains); der Aufrufer bindet sie, damit diese Datei die
 * Liste nicht laden muss. Leere Liste = alles freigegeben = keine Warnung.
 */
export function freigabeWarnungen(
  positionen: ReadonlyArray<{ departmentKey: string }>,
  konfigs: ReadonlyArray<AbteilungsKonfig>,
  einrichtungen: ReadonlyArray<KatalogEinrichtung>,
  freigegeben: (email: string) => boolean,
): FreigabeWarnung[] {
  const stellen = new Set(
    positionen.map((p) => p.departmentKey).filter((k) => istLinkAbteilung(k) && !istFuehrungskraft(k)),
  );
  const orte = new Map(einrichtungen.map((e) => [e.id, e]));
  const warnungen: FreigabeWarnung[] = [];
  for (const k of konfigs) {
    if (!k.isActive || !stellen.has(k.departmentKey)) continue;
    const ort = k.organizationId ? orte.get(k.organizationId) : null;
    if (k.organizationId && (!ort || ort.isActive === false)) continue;
    const email = k.email.trim();
    if (freigegeben(email)) continue;
    const stelleName = k.departmentName.trim() || abteilungLabel(k.departmentKey);
    const einrichtung = ort?.name ?? null;
    warnungen.push({
      departmentKey: k.departmentKey,
      stelleName,
      email,
      organizationId: k.organizationId,
      einrichtung,
      text: `${stelleName} (${einrichtung ?? "zentral"}): Die Adresse ${email} steht nicht auf der Freigabeliste. Aufgaben gehen trotzdem dorthin – bitte Adresse oder Freigabeliste prüfen.`,
    });
  }
  const rang = stellenRang(warnungen.map((w) => w.departmentKey));
  return warnungen.sort(
    (a, b) =>
      (rang.get(a.departmentKey) ?? 0) - (rang.get(b.departmentKey) ?? 0) ||
      Number(a.organizationId !== null) - Number(b.organizationId !== null) ||
      (a.einrichtung ?? "").localeCompare(b.einrichtung ?? "", "de"),
  );
}

/** Rueckmeldung von „Vorschläge übernehmen“ (fertiger Satz fuer die Katalogseite). */
export function vorschlaegeMeldung(angelegt: number, vorhanden: number): string {
  if (angelegt <= 0) return MELDUNGEN.VORSCHLAEGE_ALLE_VORHANDEN;
  const wieviele = angelegt === 1 ? "1 Vorschlag übernommen" : `${angelegt} Vorschläge übernommen`;
  const schon =
    vorhanden <= 0 ? "" : vorhanden === 1 ? " 1 stand schon im Katalog." : ` ${vorhanden} standen schon im Katalog.`;
  return `${wieviele} – ausgeschaltet. Bitte prüfen, Fälligkeiten eintragen und einschalten, was passt.${schon}`;
}

/** Eine Position, wie GET /api/settings/ausstattung sie liefert. */
export interface KatalogEintrag extends KatalogPosition {
  /** Einrichtungen, die diese (zentrale) Position fuer sich ausgeblendet haben. */
  ausblendungen: { organizationId: string }[];
  /** Zeilen in Vorgaengen, die die Position gewaehlt haben. Dann laesst sie sich nur ausschalten. */
  verwendung: number;
  /**
   * `updatedAt` als ISO-Zeitstempel: der Stand, den der Dialog „Bearbeiten“
   * beim Speichern als `stand` mitschickt (409, wenn inzwischen jemand anderes
   * gespeichert hat). Optional, weil Testdaten und aeltere Antworten ihn nicht
   * tragen — dann gibt es keine Sperre gegen fremde Aenderungen.
   */
  updatedAt?: string;
}

/** Die Warnungen der Katalogseite (Regel 11, Mockup 6.3, E-A27). */
export interface KatalogWarnungen {
  adressLuecken: Luecke[];
  aehnlicheVorlagenpunkte: Treffer[];
  ausserhalbFreigabe: FreigabeWarnung[];
}

/** Antwort von GET /api/settings/ausstattung (`data`). */
export interface KatalogUebersicht {
  positionen: KatalogEintrag[];
  einrichtungen: KatalogEinrichtung[];
  stellen: KatalogStelle[];
  warnungen: KatalogWarnungen;
}

// =============================================
// Katalogseite: Zeilen, Filter, Hinweise (Feinplan S4)
// =============================================
//
// Der Reiter „Ausstattung & Zugänge“ (src/components/ausstattung/katalog-tab.tsx)
// filtert im Browser und rechnet nichts selbst: Spalten, kleine Zeile,
// Status, Warnungen je Zeile und ueber der Liste kommen fertig von hier.

/** Anzeige der Art (Spalte „Art“ der Katalogseite, Auswahl im Dialog). */
export const ART_NAMEN: Readonly<Record<AusstattungsArt, string>> = {
  JA_NEIN: "Ja/Nein",
  AUSWAHL: "Auswahl",
  ANGABE: "Angabe",
};

/** Filter der Katalogseite; "" = alle. */
export interface KatalogFilter {
  /** Schluessel der Stelle. */
  stelle: string;
  /**
   * Einrichtung: ihre eigenen Positionen und die zentralen, deren
   * Einrichtungsart dort passt (auch die dort ausgeblendeten — sie stehen mit
   * „Ausgeblendet hier“ in der Liste, damit man sie wieder einblenden kann).
   */
  einrichtungId: string;
}

/** Eine Warnung als fertiger Satz. „rot“ = fehlt im Formular, „gelb“ = nur ein Hinweis. */
export interface KatalogWarnung {
  ton: "rot" | "gelb";
  text: string;
}

export type KatalogZeilenStatus = "AKTIV" | "AUS" | "AUSGEBLENDET";

/** Eine Zeile der Liste auf der Katalogseite. */
export interface KatalogZeile {
  id: string;
  bezeichnung: string;
  art: string;
  /** „Ja/Nein“, „Auswahl“, „Angabe“. */
  artName: string;
  departmentKey: string;
  stelleName: string;
  zentral: boolean;
  /** „Zentral“ bzw. Name der Einrichtung. */
  giltFuer: string;
  /** „−5“, „0“, „+3“; „—“ ohne Fälligkeit und bei einer Angabe. */
  faellig: string;
  isActive: boolean;
  status: KatalogZeilenStatus;
  statusText: string;
  /** Kleine Zeile unter der Bezeichnung, je Eintrag ein Teil. */
  details: string[];
  /** Adresslücken und ähnliche Vorlagenpunkte dieser Position. */
  warnungen: KatalogWarnung[];
  /**
   * Nur mit Einrichtungsfilter und bei einer zentralen Position: Ist sie dort
   * ausgeblendet? `null` = es gibt nichts aus- oder einzublenden.
   */
  ausgeblendetHier: boolean | null;
  /** Vorgaenge, die die Position gewaehlt haben (dann nur ausschalten, nicht loeschen). */
  verwendung: number;
}

/**
 * Faelligkeit relativ zum Vertragsbeginn: „−5“ (mit echtem Minuszeichen),
 * „0“, „+3“. Ohne Faelligkeit und bei einer Angabe (wird keine Aufgabe) „—“.
 */
export function faelligText(tage: number | null | undefined, art?: string): string {
  if (art === "ANGABE" || tage === null || tage === undefined) return "—";
  if (tage === 0) return "0";
  return tage < 0 ? `−${Math.abs(tage)}` : `+${tage}`;
}

/** „A, B, C“ bzw. „A, B, C und 2 weitere“. */
function aufzaehlung(namen: ReadonlyArray<string>, max: number): string {
  if (namen.length <= max) return namen.join(", ");
  return `${namen.slice(0, max).join(", ")} und ${namen.length - max} weitere`;
}

function mitAnzahl(n: number, eins: string, viele: string): string {
  return `${n} ${n === 1 ? eins : viele}`;
}

/** Anzeigename aus einer Wertliste (EINRICHTUNGSARTEN, PERSONENGRUPPEN), sonst der Wert selbst. */
function wertName(tabelle: object, wert: string): string {
  return hatEigenen(tabelle, wert) ? (tabelle as Record<string, string>)[wert] : wert;
}

/** Die Einrichtung des Filters, sofern es sie gibt (eine unbekannte filtert nicht). */
function filterOrt(
  daten: Pick<KatalogUebersicht, "einrichtungen">,
  filter: KatalogFilter,
): KatalogEinrichtung | undefined {
  return filter.einrichtungId ? daten.einrichtungen.find((e) => e.id === filter.einrichtungId) : undefined;
}

/**
 * Steht die Position im Filter? Stelle passt, und mit Einrichtung: eigene
 * Position dieser Einrichtung oder zentrale mit passender Einrichtungsart —
 * eine Ausblendung zaehlt dabei nicht (die Zeile steht mit „Ausgeblendet hier“).
 */
function imFilter(p: KatalogEintrag, filter: KatalogFilter, ort: KatalogEinrichtung | undefined): boolean {
  if (filter.stelle && p.departmentKey !== filter.stelle) return false;
  if (!ort) return true;
  return positionGiltAm(p, { arbeitsortId: ort.id, einrichtungsart: ort.type }, []);
}

function zeilenDetails(
  p: KatalogEintrag,
  ort: KatalogEinrichtung | undefined,
  ausgeblendetHier: boolean | null,
  orte: ReadonlyMap<string, string>,
  stelleName: (key: string) => string,
): string[] {
  const d: string[] = [];
  if (p.art === "JA_NEIN" && p.vorausgewaehlt) d.push("vorausgewählt");
  if (p.art === "AUSWAHL") {
    if (p.optionen.length > 0) {
      d.push(`${mitAnzahl(p.optionen.length, "Option", "Optionen")}: ${aufzaehlung(p.optionen, 6)}`);
    }
    if (p.vorausgewaehlteOptionen.length > 0) {
      d.push(`${p.vorausgewaehlteOptionen.map((o) => `„${o}“`).join(", ")} vorausgewählt`);
    }
  }
  if (p.art === "ANGABE" && p.sichtbarFuer.length > 0) {
    d.push(`sehen auch: ${p.sichtbarFuer.map(stelleName).join(", ")}`);
  }
  if (p.art !== "ANGABE") {
    if (!leer(p.aufgabeTitel)) d.push(`Aufgabe: „${p.aufgabeTitel}“`);
    if (!p.bemerkungAnbieten) d.push("ohne Bemerkung");
    else if (!leer(p.bemerkungPlatzhalter)) d.push(`Bemerkung: „${p.bemerkungPlatzhalter}“`);
  }
  if (p.einrichtungsarten.length > 0) {
    d.push(`nur ${p.einrichtungsarten.map((a) => wertName(EINRICHTUNGSARTEN, a)).join(", ")}`);
  }
  if (p.personengruppen.length > 0) {
    d.push(`nur ${p.personengruppen.map((g) => wertName(PERSONENGRUPPEN, g)).join(", ")}`);
  }
  if (p.entgeltrelevant) d.push("entgeltrelevant");
  if (ort && ausgeblendetHier) {
    d.push(`für ${ort.name} ausgeblendet`);
  } else if (!ort && !p.organizationId && p.ausblendungen.length > 0) {
    const namen = p.ausblendungen.map((a) => orte.get(a.organizationId) ?? "unbekannte Einrichtung");
    d.push(`ausgeblendet für ${aufzaehlung(namen, 3)}`);
  }
  if (p.verwendung > 0) d.push(`in ${mitAnzahl(p.verwendung, "Vorgang", "Vorgängen")} gewählt`);
  return d;
}

/**
 * Die Stelle heisst in den Warnungen wie in der Spalte „Stelle“ (Name aus den
 * Einstellungen) — nicht wie in `Luecke.stelleName`, das am Ort ohne Eintrag
 * nur das Label des Schluessels kennt.
 */
function zeilenWarnungen(
  p: KatalogEintrag,
  warnungen: KatalogWarnungen,
  ort: KatalogEinrichtung | undefined,
  stelleName: (key: string) => string,
): KatalogWarnung[] {
  const liste: KatalogWarnung[] = [];
  const luecken = warnungen.adressLuecken.filter(
    (l) => l.positionId === p.id && (!ort || l.organizationId === ort.id),
  );
  const name = stelleName(p.departmentKey);
  if (luecken.length === 1) {
    liste.push({
      ton: "rot",
      text: `Fehlt in ${luecken[0].einrichtung} im Formular: ${name} hat dort keine aktive Adresse.`,
    });
  } else if (luecken.length > 1) {
    const orte = aufzaehlung(
      luecken.map((l) => l.einrichtung),
      5,
    );
    liste.push({
      ton: "rot",
      text: `Fehlt an ${luecken.length} Einrichtungen im Formular, weil ${name} dort keine aktive Adresse hat: ${orte}.`,
    });
  }
  for (const t of warnungen.aehnlicheVorlagenpunkte) {
    if (t.positionId === p.id) liste.push({ ton: "gelb", text: t.text });
  }
  return liste;
}

/**
 * Die Zeilen der Katalogseite in der Reihenfolge der Antwort (nach Stelle,
 * Reihenfolge, Bezeichnung), gefiltert nach Stelle und Einrichtung.
 *
 * Status: „Aktiv“ bzw. „Aus“; mit Einrichtungsfilter heisst eine dort
 * ausgeblendete zentrale Position „Ausgeblendet hier“ (ausgeschaltet: „Aus,
 * hier ausgeblendet“). Warnungen je Zeile: die Adresslücken der Position (mit
 * Einrichtungsfilter nur dort, sonst ab zwei Einrichtungen zusammengefasst)
 * und ähnliche Vorlagenpunkte.
 */
export function katalogZeilen(daten: KatalogUebersicht, filter: KatalogFilter): KatalogZeile[] {
  const ort = filterOrt(daten, filter);
  const orte = new Map(daten.einrichtungen.map((e) => [e.id, e.name]));
  const stellen = new Map(daten.stellen.map((s) => [s.key, s.name]));
  const stelleName = (key: string) => stellen.get(key) ?? abteilungLabel(key);

  return daten.positionen
    .filter((p) => imFilter(p, filter, ort))
    .map((p) => {
      const zentral = !p.organizationId;
      const ausgeblendetHier = ort && zentral ? p.ausblendungen.some((a) => a.organizationId === ort.id) : null;
      const status: KatalogZeilenStatus = ausgeblendetHier ? "AUSGEBLENDET" : p.isActive ? "AKTIV" : "AUS";
      let statusText = p.isActive ? "Aktiv" : "Aus";
      if (status === "AUSGEBLENDET") statusText = p.isActive ? "Ausgeblendet hier" : "Aus, hier ausgeblendet";
      return {
        id: p.id,
        bezeichnung: p.bezeichnung,
        art: p.art,
        artName: istAusstattungsArt(p.art) ? ART_NAMEN[p.art] : p.art,
        departmentKey: p.departmentKey,
        stelleName: stelleName(p.departmentKey),
        zentral,
        giltFuer: zentral ? "Zentral" : (orte.get(p.organizationId ?? "") ?? "Unbekannte Einrichtung"),
        faellig: faelligText(p.defaultDueDays, p.art),
        isActive: p.isActive,
        status,
        statusText,
        details: zeilenDetails(p, ort, ausgeblendetHier, orte, stelleName),
        warnungen: zeilenWarnungen(p, daten.warnungen, ort, stelleName),
        ausgeblendetHier,
        verwendung: p.verwendung,
      };
    });
}

/**
 * Die Warnungen UEBER der Liste, passend zum Filter: zuerst rot die
 * Adresslücken, je Stelle zusammengefasst (welche Einrichtungen, wie viele
 * Positionen); dann gelb die Zahl der ähnlichen Vorlagenpunkte (Einzelheiten
 * stehen in den Zeilen) und die Adressen ausserhalb der Freigabeliste (mit
 * Einrichtungsfilter die zentralen und die der Einrichtung).
 */
export function katalogHinweise(daten: KatalogUebersicht, filter: KatalogFilter): KatalogWarnung[] {
  const ort = filterOrt(daten, filter);
  const sichtbar = new Set(daten.positionen.filter((p) => imFilter(p, filter, ort)).map((p) => p.id));
  const stellen = new Map(daten.stellen.map((s) => [s.key, s.name]));
  const hinweise: KatalogWarnung[] = [];

  // ---- Adresslücken je Stelle (Name wie in der Spalte „Stelle“) ----
  const jeStelle = new Map<string, { stelleName: string; positionen: Set<string>; einrichtungen: string[] }>();
  for (const l of daten.warnungen.adressLuecken) {
    if (!sichtbar.has(l.positionId) || (ort && l.organizationId !== ort.id)) continue;
    let gruppe = jeStelle.get(l.departmentKey);
    if (!gruppe) {
      gruppe = { stelleName: stellen.get(l.departmentKey) ?? l.stelleName, positionen: new Set(), einrichtungen: [] };
      jeStelle.set(l.departmentKey, gruppe);
    }
    gruppe.positionen.add(l.positionId);
    if (!gruppe.einrichtungen.includes(l.einrichtung)) gruppe.einrichtungen.push(l.einrichtung);
  }
  for (const g of jeStelle.values()) {
    const n = g.positionen.size;
    const fehlen = n === 1 ? "1 Position fehlt" : `${n} Positionen fehlen`;
    hinweise.push({
      ton: "rot",
      text: `Keine aktive Adresse für ${g.stelleName} in ${aufzaehlung(g.einrichtungen, 5)}: ${fehlen} dort im Formular. Bitte unter „Abteilungen“ eine Adresse eintragen oder aktivieren.`,
    });
  }

  // ---- Aehnliche Vorlagenpunkte (Einzelheiten in den Zeilen) ----
  const treffer = daten.warnungen.aehnlicheVorlagenpunkte.filter((t) => sichtbar.has(t.positionId)).length;
  if (treffer > 0) {
    const klingen =
      treffer === 1 ? "1 Punkt einer Checklisten-Vorlage klingt" : `${treffer} Punkte von Checklisten-Vorlagen klingen`;
    hinweise.push({
      ton: "gelb",
      text: `${klingen} nach einer Position dieses Katalogs – die Stelle bekäme zwei Aufgaben. Die Zeilen nennen Vorlage und Punkt.`,
    });
  }

  // ---- Adressen ausserhalb der Freigabeliste (E-A27: nur warnen) ----
  for (const f of daten.warnungen.ausserhalbFreigabe) {
    if (filter.stelle && f.departmentKey !== filter.stelle) continue;
    if (ort && f.organizationId !== null && f.organizationId !== ort.id) continue;
    hinweise.push({ ton: "gelb", text: f.text });
  }
  return hinweise;
}

/** Die Vorschlaege einer Stelle im Dialog „Vorschläge übernehmen“. */
export interface VorschlagGruppe {
  departmentKey: string;
  stelleName: string;
  eintraege: {
    vorschlagSchluessel: string;
    bezeichnung: string;
    artName: string;
    vorhanden: boolean;
    /** Hinweis fuer die Pflege des Katalogs (`Vorschlag.pflegeHinweis`), sonst null. */
    hinweis: string | null;
  }[];
}

/**
 * Was „Vorschläge übernehmen“ anlegen wuerde, nach Stelle gruppiert, mit
 * Markierung, was schon im Katalog steht (`vorschlagSchluessel` einer
 * Position — auch wenn sie inzwischen geaendert ist; geloeschte legt der
 * Aufruf wieder an). `fehlen` = so viele legt der Aufruf an; 0 = nichts zu tun.
 */
export function vorschlaegeVorschau(
  positionen: ReadonlyArray<{ vorschlagSchluessel?: string | null }>,
  stellen: ReadonlyArray<KatalogStelle>,
): { gruppen: VorschlagGruppe[]; fehlen: number } {
  const vorhanden = new Set(positionen.map((p) => p.vorschlagSchluessel).filter((s): s is string => !!s));
  const namen = new Map(stellen.map((s) => [s.key, s.name]));
  const gruppen = new Map<string, VorschlagGruppe>();
  let fehlen = 0;
  for (const v of VORSCHLAEGE) {
    let gruppe = gruppen.get(v.departmentKey);
    if (!gruppe) {
      gruppe = {
        departmentKey: v.departmentKey,
        stelleName: namen.get(v.departmentKey) ?? abteilungLabel(v.departmentKey),
        eintraege: [],
      };
      gruppen.set(v.departmentKey, gruppe);
    }
    const da = vorhanden.has(v.vorschlagSchluessel);
    if (!da) fehlen += 1;
    gruppe.eintraege.push({
      vorschlagSchluessel: v.vorschlagSchluessel,
      bezeichnung: v.bezeichnung,
      artName: istAusstattungsArt(v.art) ? ART_NAMEN[v.art] : v.art,
      vorhanden: da,
      hinweis: v.pflegeHinweis ?? null,
    });
  }
  return { gruppen: [...gruppen.values()], fehlen };
}

// =============================================
// Arbeitsort am Vorgang (E-A10, Feinplan 1.8, Schritt S5)
// =============================================
//
// Der Arbeitsort ist die Einrichtung, an der die Person arbeitet, wenn das
// nicht der Arbeitgeber ist (OGS-Kraft des Foerdervereins an einer
// Grundschule, Hausmeister der Objekt Service GmbH). Er bestimmt, an wen die
// Abteilungsaufgaben des Vorgangs gehen (Vorlagen- UND Ausstattungsaufgaben,
// `onboardingEmpfaengerEinrichtung` in abteilungsaufgaben.ts) und welchen
// Katalog die Fuehrungskraft sieht. Der Mandant bleibt `organizationId`:
// Jede Zugriffspruefung (`canAccessProcess`), die Unterlagen und die Listen
// haengen weiter am Arbeitgeber.
//
// Gespeichert wird `null`, solange der Arbeitsort die Einrichtung ist — so
// heisst „wie Einrichtung“ auch nach einem Wechsel der Einrichtung noch
// dasselbe, und zwei Schreibweisen fuer denselben Stand gibt es nicht.

/**
 * Was am Vorgang als `arbeitsortId` gespeichert wird: `null`, wenn kein
 * Arbeitsort gewaehlt ist (auch leer bzw. nur Leerzeichen) oder er gleich der
 * Einrichtung des Vorgangs ist, sonst die (getrimmte) ID. Dieselbe Regel beim
 * Anlegen (POST /api/onboarding) und beim Aendern (PATCH …/arbeitsort).
 */
export function arbeitsortSpeicherwert(organizationId: string, gewaehlt: string | null | undefined): string | null {
  const id = gewaehlt?.trim() ?? "";
  if (id === "" || id === organizationId) return null;
  return id;
}

/**
 * Warum sich der Arbeitsort nicht mehr aendern laesst — `null`, solange er
 * sich aendern laesst (E-A10: bis der Modalitaeten-Link erzeugt ist). Ab dem
 * Link sieht die Fuehrungskraft den Katalog des Arbeitsorts; ein spaeterer
 * Wechsel liesse ihre Wahl an einem anderen Ort stehen. Ein HR-Status
 * (geprueft, abgeschlossen, abgelaufen) sperrt ebenfalls und geht vor.
 *
 * `hrStatus` gibt der Aufrufer (`istHrStatus` aus onboarding-spuren.ts) —
 * diese Datei importiert nur abteilungsaufgaben.ts und constants.ts. Dieselbe
 * Pruefung im Server (`arbeitsortAendern`, dort zusaetzlich als bedingtes
 * UPDATE) und in der Karte „Person“ (Knopf „Ändern…“ nur ohne Grund).
 */
export function arbeitsortSperrGrund(v: { linkErzeugt: boolean; hrStatus: boolean }): string | null {
  if (v.hrStatus) return MELDUNGEN.ARBEITSORT_VORGANG_GEPRUEFT;
  if (v.linkErzeugt) return MELDUNGEN.ARBEITSORT_LINK_ERZEUGT;
  return null;
}
