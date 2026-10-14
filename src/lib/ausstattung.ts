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
 * Stand S9: Konstanten und Typen, dazu die Katalogregeln (positionPruefen,
 * positionGiltAm, positionenFuer, formularGruppen, adressLuecken,
 * aehnlicheVorlagenpunkte, aufgabenTitel), die Vorschlaege fuer den
 * Anfangsbestand (seit 14.10.2026 der Standardkatalog mit Standardwerten;
 * einen leeren Katalog fuellt die Migration AUSSTATTUNG_STANDARDKATALOG_V1
 * in prisma/seed-check.js), die Meldungen des Katalogs, die Rechnungen der
 * Katalogseite (Feldliste und Aenderungen fuer PATCH und Protokoll, Stellen,
 * Warnung „außerhalb der Freigabeliste“, Antworttypen der Einstellungsrouten)
 * und ihre Anzeige (katalogZeilen, katalogHinweise, vorschlaegeVorschau —
 * Reiter src/components/ausstattung/katalog-tab.tsx rechnet nichts selbst),
 * dazu die Regeln des Arbeitsorts am Vorgang (arbeitsortSpeicherwert,
 * arbeitsortSperrGrund; Server src/lib/onboarding-arbeitsort.ts) und das
 * Formular der Fuehrungskraft (momentaufnahme, bemerkungQuelleNach,
 * wahlPruefen, fuehrungskraftSicht; Server src/lib/ausstattung-dienst.ts) samt
 * seinem Formularschritt (formularStartStand, formularEingabe,
 * formularKurzform, sichtNachSpeichern; Oberflaeche
 * src/components/ausstattung/ausstattung-schritt.tsx und
 * ausstattung-zusammenfassung.tsx). Dazu seit S10 die Sicht von HR (Stand der
 * Karte `ausstattungsZustand`, `ausstattungsGruppen`,
 * `ausstattungsUebersichtBauen` — erste Fassung ohne Aufgaben und Aktionen —,
 * die Herkunftstexte `bemerkungLabel`/`hinweisLabel` und die Kurzform der
 * HR-Mail `ausstattungKurz`; Server src/lib/ausstattung-dienst.ts, Karte
 * src/components/ausstattung/modalitaeten-ausstattung-karte.tsx, PDF
 * src/lib/pdf-export-onboarding.ts). Seit S12 die Aufgaben je Option und ihre
 * Faelligkeit (`sollAufgaben`, `hinweisSollAufgabe`,
 * `fehlendeAusstattungsAufgaben`, `ausstattungsFaelligkeit`,
 * `anzuhebendeAufgaben`, `vorlaufWarnung`; angelegt werden sie in
 * src/lib/ausstattung-aufgaben.ts, nachgeholt im Onboarding-Adapter). Seit
 * S13 Angaben und Hinweis fuer die Mail an die Stelle (`angabenFuer`,
 * `angabenMailFelder`; geladen in src/lib/ausstattung-daten.ts, verschickt im
 * Versandkern). Seit S14 der Fortschritt ohne entfallene Aufgaben
 * (`checklistFortschritt`, F2 — Link-Seite, spaeter Portal, Stepper und PDF)
 * und die Zeile des Dialogs „Abteilungen informieren“
 * (`ausstattungVorschauSatz`). Seit S15 die HR-Karte: Aufgabenstand,
 * Aktionen, Vorlauf-Warnung und waehlbare Stellen in
 * `ausstattungsUebersichtBauen`, Regel 9 (`aenderungPruefen`,
 * `hinweisAenderungPruefen`) und die Eintraege der Aenderungsliste
 * (`aenderungsEintraege`, Regel 10; Server src/lib/ausstattung-dienst.ts).
 * Seit S16 die Anzeige im Portal (`aufgabenStandText`, `optionsZeilen`,
 * `bemerkungJeAufgabe`; Karte src/components/ausstattung/ausstattung-karte.tsx,
 * Dialoge ausstattung-dialoge.tsx, Zusatz am Checklistenpunkt
 * aufgabe-zusatz.tsx). Seit S17 der Nachtrag (`nachtragListe`,
 * `nachtragMailFelder`, Regel 10; gelesen in src/lib/ausstattung-daten.ts,
 * gesendet im Versandkern); der Waechter (Regel 15) steht rein in
 * abteilungsaufgaben.ts. Seit S18 die Sammelmail an HR am Werktag vor
 * Dienstbeginn (`letzterWerktagVor`, `sammelmailFaellig`,
 * `sammelmailListenFelder`, E-A18; Lauf src/lib/ausstattung-lauf.ts). Seit
 * S19 die Rueckfrage beim Abschluss mit offener Ausstattung
 * (`abschlussOffeneAufgaben`, `abschlussOffenMeldung`, E-A19; Route PATCH
 * /api/onboarding/[id], Dialog src/components/ausstattung/abschluss-dialog.tsx);
 * die Absage an die Stellen (E-A20) steht rein in abteilungsaufgaben.ts. Seit
 * S20 die Loeschfrist der Freitexte (`freitextGrenze`, E-A22; geleert im Lauf
 * „Aufbewahrung erzeugter Dokumente“ ueber src/lib/ausstattung-lauf.ts) und
 * der Brief-Platzhalter `{ausstattung_liste}` (`ausstattungListe`, E-A25;
 * Resolver in src/lib/doc-template-resolvers.ts). Seit S23 (Paket A4) sind
 * die Katalogfelder `beiAustritt`, `rueckgabeKategorie` und `ausgabeKennung`
 * pflegbar (`ausgabeFelderPruefen` in `positionPruefen`, Positivliste
 * `KATALOG_FELDER`, Anzeige `beiAustrittText`); die Vorgaben dafuer und alle
 * uebrigen A4-Regeln stehen in src/lib/ausgaben.ts. Den Server-Teil des
 * Katalogs (Laden, Schreiben, Protokoll, Ausschnitt je Vorgang) traegt
 * src/lib/ausstattung-katalog.ts.
 *
 * Importrichtung: Diese Datei nutzt die reinen Regeln aus abteilungsaufgaben.ts
 * (Empfaenger, Reihenfolge der Stellen, Schluesselform). abteilungsaufgaben.ts
 * importiert deshalb NICHTS von hier — sonst entstuende ein Kreis, und eine
 * Konstante, die beim Laden des Moduls gelesen wird, waere `undefined`.
 * Ausserdem nur Dateien ohne eigene Importe: onboarding-spuren.ts (ob die
 * Modalitaeten eingereicht sind — dieselbe Regel wie ueberall), format.ts
 * (Datum in deutscher Zeit), seit S13 email-layout.ts (`escapeHtml` fuer die
 * Angaben im HTML-Teil der Mail) und seit S20 minijob-fristen.ts (Berliner
 * Kalendertag, Monate mit Monatsende) samt vorgangsjahr.ts (Beginn eines
 * Berliner Tages; importiert selbst nur minijob-fristen.ts) — keine eigene
 * Zeitzonenrechnung fuer die Loeschfrist.
 */

import {
  DEPARTMENT_KEYS,
  LINK_ABTEILUNGEN,
  RESERVIERTE_ABTEILUNGSSCHLUESSEL,
  RETURN_CATEGORY_LABELS,
  RUECKGABE_KATEGORIEN,
  abteilungLabel,
} from "@/lib/constants";
import {
  ABTEILUNGS_SCHLUESSEL_MUSTER,
  WAECHTER_TAGE as WAECHTER_TAGE_ABTEILUNGEN,
  abteilungsReihenfolge,
  empfaengerAufloesen,
  faelligkeitAus,
  istFuehrungskraft,
  istLinkAbteilung,
  type AbteilungsKonfig,
  type NachtragListe,
  type VorlagenPunkt,
} from "@/lib/abteilungsaufgaben";
import { escapeHtml } from "@/lib/email-layout";
import { formatDatumDE } from "@/lib/format";
import { heuteInBerlin, monateSpaeter } from "@/lib/minijob-fristen";
import { vorgesetzteAbgesendet } from "@/lib/onboarding-spuren";
import { beginnDesBerlinerTages } from "@/lib/vorgangsjahr";
// A4 (G1): aus ausgaben.ts NUR Typen — ausgaben.ts liest Werte von hier, ein
// Wert-Import ergaebe einen Kreis (Test „Reinheit der Datei“ in ausgaben.test.ts).
import type { AusgabenAufgabeAnzeige, ProtokollAnzeige } from "@/lib/ausgaben";

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
 * Stufe 2 (A4): was beim Austritt mit dem Ausgegebenen geschieht. Seit S23
 * pflegbar (Positionsdialog, „Rückgabe-Vorgaben übernehmen …“). Leer heisst
 * „nicht festgelegt“ und bietet wie NICHTS keine Uebergabe an (G4, G27); nur
 * eine leere Position bekommt die Vorgaben (`rueckgabeVorgabenPlan`).
 */
export const BEI_AUSTRITT = ["RUECKGABE", "SPERREN", "NICHTS"] as const;
export type BeiAustritt = (typeof BEI_AUSTRITT)[number];

/** Anzeige im Positionsdialog und in der Kartenansicht („Beim Austritt: Zurückgeben“). */
export const BEI_AUSTRITT_NAMEN: Readonly<Record<BeiAustritt, string>> = {
  RUECKGABE: "Zurückgeben",
  SPERREN: "Sperren",
  NICHTS: "Nichts",
};

/**
 * Die waehlbaren Rueckgabekategorien (A4) mit Anzeigenamen, in der Reihenfolge
 * von RUECKGABE_KATEGORIEN — fuer die Auswahl im Positionsdialog und in
 * „Position hinzufügen…“ der Karte (eine Quelle: constants.ts).
 */
export const RUECKGABE_KATEGORIE_AUSWAHL: ReadonlyArray<{ wert: string; name: string }> = RUECKGABE_KATEGORIEN.map(
  (wert) => ({ wert, name: RETURN_CATEGORY_LABELS[wert] ?? wert }),
);

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
  /** Beschriftung der Kennung („Inventarnummer“, A4); `AUSGABE_GRENZEN.kennungLabel` liest dieselbe Zahl. */
  ausgabeKennung: 40,
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

/**
 * Regel 15: Der Waechter faerbt die Zeile einer Stelle rot, wenn die frueheste
 * Faelligkeit naeher liegt. Die Regel selbst (`waechterHinweis`) steht rein in
 * abteilungsaufgaben.ts — dort auch der Wert; hier nur weitergereicht, damit
 * es keine zweite Zahl gibt.
 */
export const WAECHTER_TAGE = WAECHTER_TAGE_ABTEILUNGEN;

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
  /** A4 (G27): IDs, Vorschlagsschluessel, Anzahl — nie Werte von Hand. */
  RUECKGABE_VORGABEN_UEBERNOMMEN: "AUSSTATTUNG_RUECKGABE_VORGABEN_UEBERNOMMEN",
  /**
   * Einmalige Migration AUSSTATTUNG_STANDARDKATALOG_V1 (prisma/seed-check.js,
   * ohne `userId`): IDs, Vorschlagsschluessel, Stelle, `isActive`, Anzahlen.
   * Der Wert steht dort als JS-Kopie (ausstattung-standardkatalog.test.ts).
   */
  STANDARDKATALOG_ANGELEGT: "AUSSTATTUNG_STANDARDKATALOG_ANGELEGT",
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
  [AUSSTATTUNG_AUDIT.RUECKGABE_VORGABEN_UEBERNOMMEN]: "Rückgabe-Vorgaben in den Katalog übernommen",
  [AUSSTATTUNG_AUDIT.STANDARDKATALOG_ANGELEGT]: "Standardkatalog Ausstattung & Zugänge angelegt",
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
  // ---- „Beim Austritt“ (A4, G8; `ausgabeFelderPruefen`) ----
  AUSTRITT_NICHT_BEI_ANGABE:
    "Eine Angabe wird nicht ausgegeben: „Beim Austritt“, Rückgabekategorie und Kennung bleiben leer.",
  BEI_AUSTRITT_UNBEKANNT: "Bitte bei „Beim Austritt“ Zurückgeben, Sperren oder Nichts wählen.",
  RUECKGABEKATEGORIE_FEHLT: "Bei „Zurückgeben“ bitte eine Rückgabekategorie wählen.",
  RUECKGABEKATEGORIE_UNBEKANNT: "Unbekannte Rückgabekategorie.",
  RUECKGABEKATEGORIE_NUR_RUECKGABE: "Eine Rückgabekategorie gibt es nur bei „Zurückgeben“.",
  KENNUNG_NUR_AUSGABE: "„Kennung abfragen“ gibt es nur bei „Zurückgeben“ oder „Sperren“.",
  KENNUNG_LABEL_ZU_LANG: `Die Beschriftung der Kennung darf höchstens ${GRENZEN.ausgabeKennung} Zeichen lang sein.`,
  /**
   * G27: steht bei der Feldgruppe „Beim Austritt“ im Positionsdialog und in der
   * Rueckfrage von „Rückgabe-Vorgaben übernehmen …“ — wer RUECKGABE oder
   * SPERREN setzt, schaltet A4 fuer diese Position ein.
   */
  AUSGABE_EINSCHALTEN_HINWEIS:
    "Danach bieten Link-Seite und Karte Übergaben an. Erst nach der Beteiligung der MAV und der Bestätigung der Löschfristen durch den DSB.",
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
  // ---- Formular der Führungskraft (S8; öffentliche Link-Seite, daher „Sie“) ----
  /** PUT mit `ausstattung`/`hinweise`, obwohl der Vorgang den Merker `mitAusstattung` nicht traegt (Regel 2). */
  AUSSTATTUNG_NICHT_VORGESEHEN: "Ausstattung ist für dieses Formular nicht vorgesehen.",
  // Zod (Form der Felder)
  WAHL_POSITION_UNGUELTIG: "Ungültige Position. Bitte laden Sie die Seite neu.",
  WAHL_GEWAEHLT_UNGUELTIG: "Ungültige Auswahl. Bitte laden Sie die Seite neu.",
  WAHL_ZU_VIELE: `Es lassen sich höchstens ${GRENZEN.wahlJeVorgang} Positionen übermitteln.`,
  HINWEISE_ZU_VIELE: `Es lassen sich höchstens ${GRENZEN.hinweiseJeVorgang} Hinweise übermitteln.`,
  BEMERKUNG_ZU_LANG: `Die Bemerkung darf höchstens ${GRENZEN.bemerkung} Zeichen lang sein.`,
  ANGABE_ZU_LANG: `Die Angabe darf höchstens ${GRENZEN.angabe} Zeichen lang sein.`,
  ANGABE_EINZEILIG: "Die Angabe darf keinen Zeilenumbruch und keine Steuerzeichen enthalten.",
  HINWEIS_ZU_LANG: `Der Hinweis darf höchstens ${GRENZEN.hinweis} Zeichen lang sein.`,
  // wahlPruefen (Inhalt gegen den Katalogausschnitt dieses Vorgangs, Regel 4)
  WAHL_POSITION_UNBEKANNT:
    "Eine gewählte Position gehört nicht (mehr) zu diesem Formular. Bitte laden Sie die Seite neu.",
  WAHL_POSITION_DOPPELT: "Eine Position wurde mehrfach übermittelt. Bitte laden Sie die Seite neu.",
  WAHL_OPTION_UNBEKANNT:
    "Eine gewählte Option gehört nicht (mehr) zu dieser Position. Bitte laden Sie die Seite neu.",
  WAHL_NICHT_GEWAEHLT: "Eine Position wurde ohne Auswahl übermittelt. Bitte laden Sie die Seite neu.",
  WAHL_ANGABE_FEHLT: "Eine Angabe wurde ohne Inhalt übermittelt. Bitte laden Sie die Seite neu.",
  WAHL_PASST_NICHT: "Die übermittelte Auswahl passt nicht zur Art der Position. Bitte laden Sie die Seite neu.",
  WAHL_OHNE_BEMERKUNG: "Zu dieser Position gibt es kein Bemerkungsfeld. Bitte laden Sie die Seite neu.",
  HINWEIS_STELLE_UNBEKANNT:
    "Ein Hinweis richtet sich an eine Stelle, die dieses Formular nicht anbietet. Bitte laden Sie die Seite neu.",
  HINWEIS_DOPPELT: "Für jede Stelle gibt es nur ein Hinweisfeld. Bitte laden Sie die Seite neu.",
  // ---- HR liest mit (S10): Sätze der Übersicht (Feinplan 1.6, Zustandsregel) ----
  UEBERSICHT_ABGESCHLOSSEN: "Der Vorgang ist abgeschlossen – nur noch lesbar.",
  UEBERSICHT_ENTWURF_MIT_SCHRITT: "Ohne Einstellungsmodalitäten kann nichts an die Stellen gehen.",
  UEBERSICHT_ENTWURF_OHNE_SCHRITT:
    "Das Formular der Führungskraft enthält diesen Schritt nicht. Nach der Abgabe kann die Personalabteilung Positionen ergänzen.",
  /** Leer, solange die Führungskraft den Schritt hat, aber noch nichts gespeichert ist. */
  UEBERSICHT_NOCH_NICHTS: "Die Führungskraft hat noch nichts ausgewählt.",
  /** Leer nach der Abgabe, obwohl das Formular den Schritt zeigte. */
  UEBERSICHT_NICHTS_ANGEFORDERT: "Die Führungskraft hat keine Ausstattung angefordert.",
  UEBERSICHT_LEER: "Keine Positionen und keine Hinweise an Stellen.",
  // ---- Aufgaben und Fälligkeit (S12, Regel 14) ----
  /** Warnung der Karte, wenn der Vertragsbeginn näher liegt als der Vorlauf einer Position (`vorlaufWarnung`). */
  VORLAUF_WARNUNG: "bis Dienstbeginn voraussichtlich nicht verfügbar – Übergangslösung klären",
  // ---- HR-Karte (S15; Portal, deshalb ohne Anrede) ----
  /** 409 VORGANG_ABGESCHLOSSEN (Regel 13), Status COMPLETED. */
  KARTE_ABGESCHLOSSEN: "Der Vorgang ist abgeschlossen – die Ausstattung lässt sich nicht mehr ändern.",
  /** 409 VORGANG_ABGESCHLOSSEN (Regel 13), Status EXPIRED. */
  KARTE_ABGELAUFEN: "Der Vorgang ist abgelaufen – die Ausstattung lässt sich nicht mehr ändern.",
  /** 409 MODALITAETEN_FEHLEN (E-A11): Bis zur Abgabe gehört die Auswahl der Führungskraft. */
  KARTE_MODALITAETEN_FEHLEN:
    "Die Einstellungsmodalitäten sind noch nicht eingereicht. Bis zur Abgabe gehört die Auswahl der Führungskraft; danach kann die Personalabteilung ergänzen und ändern.",
  /** 409 VERSAND_LAEUFT (F6): Die Karte nimmt dieselbe Sperre wie „Abteilungen informieren“. */
  KARTE_VERSAND_LAEUFT:
    "Gerade läuft ein Versand an die Stellen oder eine andere Änderung. Bitte in einem Moment erneut versuchen.",
  /** 409 AUFGABE_ERLEDIGT (Regel 9) — zugleich der Sperrgrund der Karte. */
  AUFGABE_ERLEDIGT:
    "Mindestens eine Aufgabe dazu ist schon erledigt. Streichen, Abwählen und Umhängen gehen erst, wenn sie wieder geöffnet ist (Checkliste oder Aufgabenseite der Stelle).",
  /** 409 GESTRICHEN: Eine gestrichene Position wird nicht mehr bearbeitet. */
  POSITION_GESTRICHEN:
    "Die Position ist gestrichen. Eine Position aus dem Katalog lässt sich über „Position hinzufügen…“ wieder aufnehmen.",
  /** 409 OHNE_OFFENE_AUFGABE: Fälligkeit nur an einer offenen Aufgabe. */
  OHNE_OFFENE_AUFGABE: "Dazu gibt es keine offene Aufgabe – die Fälligkeit lässt sich nicht ändern.",
  /**
   * 409 AUSGABE_VORHANDEN (A4, G5): An einer Aufgabe der Position haengt eine
   * aktive Ausgabe (AUSGEGEBEN, VERBLEIBT) — Abwaehlen, Streichen und
   * Stellenwechsel nehmen ihr sonst den Bezug. `MELDUNGEN_AUSGABEN` in
   * ausgaben.ts liest denselben Text (eine Quelle).
   */
  AUSGABE_VORHANDEN: "Für diese Position ist eine Ausgabe vermerkt – erst die Ausgabe entfernen oder zurücknehmen.",
  /** 409 BEREITS_VORHANDEN: Die Position steht schon in diesem Vorgang. */
  POSITION_BEREITS_GEWAEHLT: "Diese Position ist schon gewählt. Bitte sie bearbeiten statt erneut hinzufügen.",
  /** 400: Die Position gehört nicht zum Katalogausschnitt dieses Vorgangs. */
  POSITION_NICHT_IM_KATALOG:
    "Die Position gehört nicht (mehr) zum Katalog dieses Vorgangs. Bitte die Seite neu laden.",
  HINWEIS_NICHT_GEFUNDEN: "Hinweis nicht gefunden",
  /** 400: Felder, die zur Art der Position nicht passen. */
  KARTE_PASST_NICHT_ZUR_ART: "Die Änderung passt nicht zur Art der Position.",
  KARTE_AUSWAHL_LEER: "Bitte mindestens eine Option wählen – sonst die Position streichen.",
  KARTE_ANGABE_LEER: "Bitte die Angabe ausfüllen – sonst die Position streichen.",
  KARTE_OPTION_UNBEKANNT: "Eine Option gehört nicht zu dieser Position. Bitte die Seite neu laden.",
  KARTE_POSITION_ODER_FREI: "Bitte eine Position aus dem Katalog wählen oder eine freie Position beschreiben.",
  KARTE_HINWEIS_ODER_FAELLIG: "Bitte einen Hinweis oder eine Fälligkeit angeben.",
  KARTE_DATUM_UNGUELTIG: "Datum im Format JJJJ-MM-TT erforderlich.",
  KARTE_FREI_ZU_LANG: `Die Bezeichnung einer freien Position darf höchstens ${GRENZEN.freieBezeichnung} Zeichen lang sein.`,
  KARTE_ID_UNGUELTIG: "Ungültige Position. Bitte die Seite neu laden.",
  // Erfolg (`meldung` der Antwort)
  KARTE_HINZUGEFUEGT: "Position ergänzt.",
  KARTE_WIEDER_AUFGENOMMEN: "Position wieder aufgenommen.",
  KARTE_GEAENDERT: "Änderung gespeichert.",
  KARTE_GESTRICHEN: "Position gestrichen – sie entfällt für die Stelle.",
  KARTE_ENTFERNT: "Position entfernt.",
  KARTE_HINWEIS_GESPEICHERT: "Hinweis gespeichert.",
  KARTE_HINWEIS_ENTFERNT: "Hinweis entfernt.",
  KARTE_HINWEIS_GESEHEN: "Hinweis als zur Kenntnis genommen markiert.",
  KARTE_HINWEIS_UEBERNOMMEN: "Hinweis als Position übernommen.",
  KARTE_UNVERAENDERT: "Keine Änderung.",
  /** Hängt an die Erfolgsmeldung, wenn eine schon informierte Stelle Einträge in der Änderungsliste bekam (Regel 10). */
  KARTE_NACHTRAG_FOLGT: "Die informierte Stelle erfährt davon erst mit „Nachtrag senden“.",
  // ---- Portal-PATCH der Checkliste (S15; Regel 9, Regel 16) ----
  /** 403: Aufgaben mit Herkunft (Ausstattung, Hinweis) ändert im Portal nur HR — nie SERVICE, Einrichtungsleitung oder Führungskraft. */
  PORTAL_NUR_HR: "Ausstattungsaufgaben bearbeitet nur die Personalabteilung.",
  /** 409: Zuständigkeit und Fälligkeit einer Ausstattungs- oder Hinweis-Aufgabe ändert nur die Karte. */
  PORTAL_IN_DER_KARTE: "Zuständigkeit und Fälligkeit in der Karte ‚Ausstattung & Zugänge‘ ändern.",
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
  /**
   * A4 (G8): was beim Austritt geschieht — BEI_AUSTRITT oder leer (nicht
   * festgelegt). Optional, weil Vorschlaege und aeltere Testdaten das Feld
   * nicht tragen; fehlend heisst leer. Nie bei einer Angabe.
   */
  beiAustritt?: string | null;
  /** Nur bei RUECKGABE, dort Pflicht: ein Wert aus RUECKGABE_KATEGORIEN. */
  rueckgabeKategorie?: string | null;
  /** Beschriftung der Kennung („Inventarnummer“), nur bei RUECKGABE oder SPERREN, hoechstens GRENZEN.ausgabeKennung. */
  ausgabeKennung?: string | null;
}

/** Eine gespeicherte Katalogposition (Zeile von AusstattungsPosition). */
export interface KatalogPosition extends PositionEntwurf {
  id: string;
  isActive: boolean;
  orderIndex: number;
  vorschlagSchluessel?: string | null;
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
  /**
   * Nur in `fuehrungskraftSicht`: Die Position steht nicht mehr im Katalog
   * dieses Vorgangs (ausgeschaltet, ausgeblendet, Stelle ohne Adresse) oder
   * nicht mehr in dieser Form (`imKatalogGeaendert`), wohl aber in der schon
   * gespeicherten Wahl der Fuehrungskraft — gebaut aus der Momentaufnahme,
   * damit sie die Wahl sieht und abwaehlen kann (Regel 4).
   */
  nichtMehrImKatalog?: boolean;
  /**
   * Nur zusammen mit `nichtMehrImKatalog`: Der Katalog fuehrt die Position
   * noch, aber seit dem Speichern mit anderer Art, Stelle oder Bezeichnung.
   * Gezeigt (und abgegeben) wird die gespeicherte Form; die geaenderte steht
   * erst zur Wahl, wenn diese entfernt ist und das Formular neu geladen wird.
   */
  imKatalogGeaendert?: boolean;
  /**
   * Nur in `fuehrungskraftSicht`, nur bei Auswahl-Positionen: die Optionen in
   * `optionen`, die allein aus der gespeicherten Wahl stammen (der Katalog
   * kennt sie nicht mehr). Bei einer Position `nichtMehrImKatalog` sind es
   * alle. Waehlt die Fuehrungskraft eine davon ab und speichert, bietet der
   * Server sie nicht mehr an (`sichtNachSpeichern`).
   */
  optionenNichtMehrImKatalog?: string[];
  /**
   * Nur in `fuehrungskraftSicht`: Das Bemerkungsfeld steht nur noch, weil
   * schon eine Bemerkung gespeichert ist — der Katalog bietet keins mehr an.
   * Ohne Bemerkung gespeichert, faellt es weg (`sichtNachSpeichern`).
   */
  bemerkungNurGespeichert?: boolean;
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

/** Ein Wert aus BEI_AUSTRITT? */
export function istBeiAustritt(wert: string | null | undefined): wert is BeiAustritt {
  return !!wert && (BEI_AUSTRITT as readonly string[]).includes(wert);
}

/**
 * Die A4-Felder einer Position gegeneinander (G8) — dieselbe Regel fuer die
 * Katalogposition (`positionPruefen`) und die freie Position von HR in der
 * Karte (Zod `freiePositionSchema`, Dialog „Position hinzufügen…“):
 *
 *   - Angabe: alle drei leer (sie wird keine Aufgabe, also nie ausgegeben).
 *   - `beiAustritt` aus BEI_AUSTRITT oder leer („nicht festgelegt“).
 *   - RUECKGABE verlangt eine `rueckgabeKategorie` aus RUECKGABE_KATEGORIEN;
 *     sonst bleibt sie leer.
 *   - `ausgabeKennung` (Beschriftung, hoechstens GRENZEN.ausgabeKennung) nur
 *     bei RUECKGABE oder SPERREN.
 *
 * Leer heisst `null`, `undefined` oder nur Leerzeichen. Zeichen prueft Zod.
 */
export function ausgabeFelderPruefen(p: {
  art: string;
  beiAustritt?: string | null;
  rueckgabeKategorie?: string | null;
  ausgabeKennung?: string | null;
}): string | null {
  const beiAustritt = leer(p.beiAustritt) ? null : (p.beiAustritt as string);
  const kategorie = leer(p.rueckgabeKategorie) ? null : (p.rueckgabeKategorie as string);
  const kennung = leer(p.ausgabeKennung) ? null : (p.ausgabeKennung as string);
  if (p.art === "ANGABE") {
    return beiAustritt !== null || kategorie !== null || kennung !== null ? MELDUNGEN.AUSTRITT_NICHT_BEI_ANGABE : null;
  }
  if (beiAustritt !== null && !istBeiAustritt(beiAustritt)) return MELDUNGEN.BEI_AUSTRITT_UNBEKANNT;
  if (beiAustritt === "RUECKGABE") {
    if (kategorie === null) return MELDUNGEN.RUECKGABEKATEGORIE_FEHLT;
    if (!(RUECKGABE_KATEGORIEN as readonly string[]).includes(kategorie)) return MELDUNGEN.RUECKGABEKATEGORIE_UNBEKANNT;
  } else if (kategorie !== null) {
    return MELDUNGEN.RUECKGABEKATEGORIE_NUR_RUECKGABE;
  }
  if (kennung !== null) {
    if (beiAustritt !== "RUECKGABE" && beiAustritt !== "SPERREN") return MELDUNGEN.KENNUNG_NUR_AUSGABE;
    if (laenger(kennung, GRENZEN.ausgabeKennung)) return MELDUNGEN.KENNUNG_LABEL_ZU_LANG;
  }
  return null;
}

/**
 * Kurzform der A4-Felder fuer Katalogseite und Dialoge: „zurückgeben
 * (IT-Hardware), Kennung „Inventarnummer““, „sperren“, „nichts“ — `null`,
 * solange nichts festgelegt ist. Nur Katalogwerte, nie Freitext einer Person.
 */
export function beiAustrittText(p: {
  beiAustritt?: string | null;
  rueckgabeKategorie?: string | null;
  ausgabeKennung?: string | null;
}): string | null {
  if (!istBeiAustritt(p.beiAustritt)) return null;
  let text = BEI_AUSTRITT_NAMEN[p.beiAustritt].toLocaleLowerCase("de");
  const kategorie = p.rueckgabeKategorie?.trim();
  if (p.beiAustritt === "RUECKGABE" && kategorie) {
    text += ` (${hatEigenen(RETURN_CATEGORY_LABELS, kategorie) ? RETURN_CATEGORY_LABELS[kategorie] : kategorie})`;
  }
  const kennung = p.ausgabeKennung?.trim();
  if (p.beiAustritt !== "NICHTS" && kennung) text += `, Kennung „${kennung}“`;
  return text;
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
 *   - „Beim Austritt“ (A4, G8): `ausgabeFelderPruefen` — bei einer Angabe
 *     alles leer, RUECKGABE mit Rueckgabekategorie, Kennung nur bei
 *     RUECKGABE/SPERREN.
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

  // ---- Beim Austritt (A4, G8) ----
  const austritt = ausgabeFelderPruefen(p);
  if (austritt) return austritt;

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
 * Vorlagen zaehlen (aktive des Onboardings), waehlt der Aufrufer. Gilt die
 * Position nur fuer einige Einrichtungsarten, nennt der Text sie und raet zum
 * Umformulieren statt zum Streichen (Standardkatalog, 14.10.2026). Nur gleiche
 * Stelle: Paare ueber zwei Stellen (Schluessel-Punkte der Verwaltung in den
 * Seed-Vorlagen ↔ Schluessel-Positionen der Gebaeudewirtschaft) meldet die
 * Seite nicht — die stehen als Handgriff im Feinplan, Abschnitt 8.
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
    // Vorlagen gelten fuer alle Einrichtungen. Deckt die Position nur einige ab
    // („Fach im Lehrerzimmer“ nur Schulen), fehlte ein gestrichener Punkt den
    // uebrigen — dann raet der Text zum Umformulieren statt zum Streichen.
    const nur = p.einrichtungsarten.map((a) => wertName(EINRICHTUNGSARTEN, a)).join(", ");
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
        text: nur
          ? `Vorlage „${v.templateName}“: „${v.title}“ klingt nach „${p.bezeichnung}“ (gilt nur für ${nur}). Dort bekommt die Stelle zwei Aufgaben – den Vorlagenpunkt bitte umformulieren statt streichen, sonst fehlt er den übrigen Einrichtungen.`
          : `Vorlage „${v.templateName}“: „${v.title}“ klingt nach „${p.bezeichnung}“. Bitte den Vorlagenpunkt streichen oder umformulieren, sonst bekommt die Stelle zwei Aufgaben.`,
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
// Formular der Fuehrungskraft: Momentaufnahme, Pruefung, Sicht (Feinplan S8)
// =============================================
//
// Der Modalitaeten-Link ist ein Inhaber-Token ohne Anmeldung. Was die
// Fuehrungskraft waehlt, prueft der Server deshalb gegen den Katalogausschnitt
// GENAU DIESES Vorgangs (Regel 4) — plus ihre eigene, schon gespeicherte Wahl:
// Eine Position, die die Verwaltung inzwischen ausgeschaltet hat, bleibt
// waehlbar, solange sie in der eigenen Wahl steht (Momentaufnahme), ebenso eine
// Option, die der Katalog nicht mehr kennt. Hat die Verwaltung an einer schon
// gewaehlten Position geaendert, was die Fuehrungskraft sieht (Art, Stelle,
// Bezeichnung), gilt die eigene Zeile genauso: Formular, Zusammenfassung und
// HR-Ansicht zeigen dann dieselbe gespeicherte Momentaufnahme — das Absenden
// frischt sie nicht auf. Sicht (GET) und Pruefung (PUT) bauen das Angebot aus
// derselben Funktion, damit das Formular nie etwas zeigt, das der Server
// danach abweist.

/** Hinweis im Formular (E-A26): Nach dem Absenden aendert nur noch die Personalabteilung. */
export const AENDERUNGEN_NACH_ABGABE_HINWEIS =
  "Änderungen nach dem Absenden teilen Sie bitte der Personalabteilung mit.";

/**
 * Die Momentaufnahme einer Position im Vorgang (Regel 4): Was mit der Wahl in
 * `OnboardingAusstattung` kopiert wird, damit spaetere Katalogaenderungen
 * keinen laufenden Vorgang veraendern.
 */
export interface AusstattungsMomentaufnahme {
  positionId: string | null;
  departmentKey: string;
  art: string;
  angabeSchluessel: string | null;
  bezeichnung: string;
  /** Grundtitel der Aufgabe (ohne Option); bei einer Angabe leer — sie wird keine Aufgabe. */
  aufgabeTitel: string;
  hinweisStelle: string | null;
  relativeDueDays: number | null;
  sichtbarFuer: string[];
  ausgabeKennung: string | null;
  rueckgabeKategorie: string | null;
  beiAustritt: string | null;
  /** orderIndex der Position beim Speichern. */
  reihenfolge: number;
}

/**
 * Momentaufnahme aus einer Katalogposition. Der Aufgabentitel wird als
 * Grundtitel gespeichert (`aufgabenTitel` ohne Option, also auch der Standard
 * „<Bezeichnung> bereitstellen“), damit eine spaetere Aenderung am Katalog den
 * Titel einer Aufgabe nicht mehr verschiebt. Eine Angabe wird keine Aufgabe:
 * ohne Titel, ohne Faelligkeit. Die A4-Felder (`ausgabeKennung`,
 * `rueckgabeKategorie`, `beiAustritt`) kommen wie sie sind, fehlend als `null`
 * — sie entscheiden spaeter, ob die Stelle eine Uebergabe vermerken kann (G4).
 */
export function momentaufnahme(p: KatalogPosition): AusstattungsMomentaufnahme {
  const angabe = p.art === "ANGABE";
  return {
    positionId: p.id,
    departmentKey: p.departmentKey,
    art: p.art,
    angabeSchluessel: angabe ? p.angabeSchluessel : null,
    bezeichnung: p.bezeichnung,
    aufgabeTitel: angabe ? "" : aufgabenTitel(p, ""),
    hinweisStelle: leer(p.hinweisStelle) ? null : p.hinweisStelle,
    relativeDueDays: angabe ? null : p.defaultDueDays,
    sichtbarFuer: angabe ? [...p.sichtbarFuer] : [],
    ausgabeKennung: p.ausgabeKennung ?? null,
    rueckgabeKategorie: p.rueckgabeKategorie ?? null,
    beiAustritt: p.beiAustritt ?? null,
    reihenfolge: p.orderIndex,
  };
}

/**
 * Herkunft einer Bemerkung nach dem Schreiben (Regel 8). Nur aufrufen, wenn
 * ein nicht leerer Text gesetzt oder geaendert wird — ein geleertes Feld hat
 * keine Herkunft (`null`), ein unveraenderter Text behaelt seine.
 *
 *   - Die Fuehrungskraft schreibt: FUEHRUNGSKRAFT. Sie ersetzt ihre Zeilen
 *     ganz, und vor ihrer Abgabe schreibt HR nicht (E-A11).
 *   - HR aendert einen Text der Fuehrungskraft (FUEHRUNGSKRAFT oder BEIDE): BEIDE.
 *   - HR schreibt einen neuen Text oder aendert seinen eigenen: HR.
 *
 * Dieselbe Regel gilt fuer `OnboardingStellenHinweis.quelle` (Feinplan 1.10).
 */
export function bemerkungQuelleNach(
  alt: string | null | undefined,
  schreiber: AusstattungsQuelle,
): BemerkungQuelle {
  if (schreiber === "FUEHRUNGSKRAFT") return "FUEHRUNGSKRAFT";
  return alt === "FUEHRUNGSKRAFT" || alt === "BEIDE" ? "BEIDE" : "HR";
}

/**
 * Eine Wahl, wie der Modalitaeten-PUT sie annimmt (`modalitaetenAusstattungSchema`)
 * und die Sicht sie zurueckgibt: Ja/Nein mit `gewaehlt: true`, Auswahl mit den
 * gewaehlten Optionen, Angabe mit Text. Nicht Gewaehltes kommt gar nicht vor.
 */
export interface AusstattungsWahlEingabe {
  positionId: string;
  gewaehlt?: true;
  auswahl?: string[];
  angabe?: string;
  bemerkung?: string;
}

/** „Weitere Hinweise an …“ je Stelle; ein leerer Text heisst „kein Hinweis“. */
export interface StellenHinweisEingabe {
  departmentKey: string;
  hinweis: string;
}

/**
 * Was der PUT zur Ausstattung mitschickt. Ein fehlendes Feld laesst den
 * gespeicherten Stand stehen, ein leeres Array leert ihn (wie bei den
 * Kostenstellen: „dazu sage ich nichts“ ist nicht „keine mehr“).
 */
export interface FuehrungskraftEingabe {
  ausstattung?: ReadonlyArray<AusstattungsWahlEingabe>;
  hinweise?: ReadonlyArray<StellenHinweisEingabe>;
}

/** Eine schon gespeicherte eigene Zeile der Fuehrungskraft (`OnboardingAusstattung`, quelle FUEHRUNGSKRAFT). */
export interface BestehendeWahl extends AusstattungsMomentaufnahme {
  auswahl: readonly string[];
  angabe: string | null;
  bemerkung: string | null;
  gestrichenAm?: Date | string | null;
}

/** Die eigene, schon gespeicherte Wahl der Fuehrungskraft: Zeilen und Hinweise (nur quelle FUEHRUNGSKRAFT). */
export interface BestehendeFuehrungskraftWahl {
  zeilen: ReadonlyArray<BestehendeWahl>;
  hinweise: ReadonlyArray<{ departmentKey: string; text: string }>;
}

/** Eine gepruefte Zeile: Momentaufnahme plus Wahl, fertig zum Anlegen. */
export interface GepruefteWahl extends AusstattungsMomentaufnahme {
  positionId: string;
  auswahl: string[];
  angabe: string | null;
  bemerkung: string | null;
}

export type WahlPruefung =
  | {
      ok: true;
      /** `undefined`: Der Aufruf sagt zu den Positionen nichts — nichts ersetzen. */
      zeilen?: GepruefteWahl[];
      /** `undefined`: nichts ersetzen. Leere Hinweise fallen weg (sie werden keine Zeile). */
      hinweise?: { departmentKey: string; text: string }[];
    }
  | { ok: false; fehler: string };

/** Was eine Position der Fuehrungskraft anbietet — Katalog oder eigene Momentaufnahme. */
interface Angebot {
  basis: AusstattungsMomentaufnahme;
  /**
   * Die Katalogposition, wenn das Angebot aus dem Katalog kommt; `null`, wenn
   * es nur noch aus der eigenen Wahl kommt (nicht mehr im Ausschnitt oder dort
   * in anderer Form, `imKatalogGeaendert`).
   */
  position: KatalogPosition | null;
  /** Die Position, wie der Ausschnitt sie heute fuehrt — auch, wenn das Angebot aus der eigenen Zeile kommt. */
  imAusschnitt: KatalogPosition | null;
  bestehend: BestehendeWahl | null;
  /** AUSWAHL: Optionen des Katalogs, dahinter die der eigenen Wahl, die der Katalog nicht mehr kennt. */
  optionen: string[];
  bemerkungErlaubt: boolean;
}

/**
 * Weicht die gespeicherte Momentaufnahme einer eigenen Zeile in dem ab, was
 * die Fuehrungskraft von der Position sieht — Art, Stelle, Bezeichnung oder
 * das Feld einer Angabe? Dann hat die Verwaltung die Position nach dem
 * Speichern geaendert. Gespeichert (und mit dem Absenden abgegeben) ist die
 * alte Form; das Angebot kommt deshalb aus der Zeile, nicht aus dem Katalog —
 * sonst zeigten Formular und Zusammenfassung die neue Form, HR-Karte, PDF und
 * spaeter die Aufgaben aber die alte. Was sie nicht sieht (Hinweis fuer die
 * Stelle, Faelligkeit, Aufgabentitel, „sichtbar für“, Optionen), frischt
 * weiter jedes Speichern aus dem Katalog auf.
 */
function imKatalogGeaendert(zeile: BestehendeWahl, basis: AusstattungsMomentaufnahme): boolean {
  return (
    zeile.art !== basis.art ||
    zeile.departmentKey !== basis.departmentKey ||
    zeile.bezeichnung !== basis.bezeichnung ||
    (zeile.angabeSchluessel ?? null) !== basis.angabeSchluessel
  );
}

/**
 * Das Angebot an die Fuehrungskraft — EINE Rechnung fuer Sicht und Pruefung:
 *
 *   - jede Position des Ausschnitts (Momentaufnahme aus dem Katalog); eine
 *     Option aus der eigenen Wahl, die der Katalog nicht mehr kennt, bleibt
 *     waehlbar; ein Bemerkungsfeld gibt es, wenn der Katalog es anbietet oder
 *     schon eine Bemerkung gespeichert ist (sonst stuende sie unsichtbar da);
 *   - jede eigene, nicht gestrichene Zeile, deren Position nicht mehr im
 *     Ausschnitt steht ODER dort in anderer Form (`imKatalogGeaendert`):
 *     Momentaufnahme aus der Zeile, Optionen = ihre Wahl. Ein Bemerkungsfeld
 *     nach derselben Regel — wo der Ausschnitt fuer diese Position eins
 *     anbietet oder schon eine Bemerkung gespeichert ist; fuehrt er die
 *     Position gar nicht mehr, also nur mit gespeicherter Bemerkung. Sonst
 *     entstuende ein Freitextfeld, das die Verwaltung bewusst nicht wollte
 *     (Datensparsamkeit, S8).
 *     Solange die Zeile so besteht, bietet das Formular die neue Form nicht an
 *     (eine Position je Vorgang); nach dem Abwaehlen steht sie beim naechsten
 *     Oeffnen zur Wahl;
 *   - die Stellen: die der Positionen und die der eigenen, nicht leeren
 *     Hinweise (so bleibt ein Hinweis an eine Stelle, deren Positionen der
 *     Katalog nicht mehr anbietet, sichtbar und loeschbar) — in der Reihenfolge
 *     der Abteilungskarte. Nie MITARBEITER oder VORGESETZTER.
 */
function fuehrungskraftAngebot(
  positionen: ReadonlyArray<KatalogPosition>,
  bestehend: BestehendeFuehrungskraftWahl,
): { angebote: Map<string, Angebot>; stellen: string[] } {
  const eigene = new Map<string, BestehendeWahl>();
  for (const z of bestehend.zeilen) {
    if (z.positionId && !z.gestrichenAm) eigene.set(z.positionId, z);
  }
  const imAusschnitt = new Map(positionen.map((p) => [p.id, p]));
  const angebote = new Map<string, Angebot>();
  for (const p of positionen) {
    const zeile = eigene.get(p.id) ?? null;
    const basis = momentaufnahme(p);
    // In anderer Form gespeichert: Das Angebot kommt aus der Zeile (Schleife unten,
    // dieselben Bedingungen — sonst fiele die Position ganz weg).
    if (zeile && istAusstattungsArt(zeile.art) && !istNichtErlaubteStelle(zeile.departmentKey) && imKatalogGeaendert(zeile, basis)) {
      continue;
    }
    const optionen = p.art === "AUSWAHL" ? [...p.optionen] : [];
    if (p.art === "AUSWAHL" && zeile) {
      for (const o of zeile.auswahl) if (!optionen.includes(o)) optionen.push(o);
    }
    angebote.set(p.id, {
      basis,
      position: p,
      imAusschnitt: p,
      bestehend: zeile,
      optionen,
      bemerkungErlaubt: p.art !== "ANGABE" && (p.bemerkungAnbieten || !leer(zeile?.bemerkung)),
    });
  }
  for (const [positionId, zeile] of eigene) {
    if (angebote.has(positionId) || !istAusstattungsArt(zeile.art) || istNichtErlaubteStelle(zeile.departmentKey)) {
      continue;
    }
    const katalog = imAusschnitt.get(positionId) ?? null;
    angebote.set(positionId, {
      basis: {
        positionId,
        departmentKey: zeile.departmentKey,
        art: zeile.art,
        angabeSchluessel: zeile.angabeSchluessel,
        bezeichnung: zeile.bezeichnung,
        aufgabeTitel: zeile.aufgabeTitel,
        hinweisStelle: zeile.hinweisStelle,
        relativeDueDays: zeile.relativeDueDays,
        sichtbarFuer: [...zeile.sichtbarFuer],
        ausgabeKennung: zeile.ausgabeKennung,
        rueckgabeKategorie: zeile.rueckgabeKategorie,
        beiAustritt: zeile.beiAustritt,
        reihenfolge: zeile.reihenfolge,
      },
      position: null,
      imAusschnitt: katalog,
      bestehend: zeile,
      optionen: zeile.art === "AUSWAHL" ? [...zeile.auswahl] : [],
      bemerkungErlaubt: zeile.art !== "ANGABE" && (!!katalog?.bemerkungAnbieten || !leer(zeile.bemerkung)),
    });
  }
  const schluessel = [
    ...[...angebote.values()].map((a) => a.basis.departmentKey),
    ...bestehend.hinweise.filter((h) => !leer(h.text)).map((h) => h.departmentKey),
  ].filter((k) => !istNichtErlaubteStelle(k));
  const rang = stellenRang(schluessel);
  const stellen = [...new Set(schluessel)].sort((a, b) => (rang.get(a) ?? 0) - (rang.get(b) ?? 0));
  return { angebote, stellen };
}

/** Nicht leerer Text (getrimmt) oder `null`. */
function textOderNull(text: string | null | undefined): string | null {
  const t = (text ?? "").trim();
  return t === "" ? null : t;
}

/**
 * Prueft die Wahl aus dem Modalitaeten-PUT gegen das Angebot dieses Vorgangs
 * (Regel 4) und liefert die Zeilen samt Momentaufnahme zum Anlegen.
 *
 *   - Jede Position stammt aus dem Ausschnitt ODER aus der eigenen Wahl
 *     (Momentaufnahme, wenn sie inzwischen ausgeschaltet oder in Art, Stelle
 *     bzw. Bezeichnung geaendert ist); sonst 400. Jede Position hoechstens
 *     einmal.
 *   - Ja/Nein nur mit `gewaehlt: true`; Auswahl nur mit mindestens einer
 *     Option, jede aus dem Katalog bzw. aus der eigenen Wahl (Doppelte fallen
 *     weg, Reihenfolge wie im Katalog); Angabe nur mit Text, hoechstens so lang
 *     wie ihr Eintrag in ANGABEN_KATALOG, ohne Bemerkung. Felder, die zur Art
 *     nicht passen, sind ein Fehler — nie still verworfen.
 *   - Eine Bemerkung nur, wo das Formular ein Feld zeigt: wo der Katalog es
 *     fuer diese Position anbietet oder schon eine Bemerkung gespeichert ist.
 *   - Hinweise nur fuer Stellen des Angebots, je Stelle einer; ein leerer Text
 *     ist „kein Hinweis“ und wird keine Zeile.
 *
 * Die Momentaufnahme kommt aus dem Katalog, solange die Position im Ausschnitt
 * steht und die eigene Zeile dort in derselben Form gespeichert ist (vor der
 * Abgabe ist nichts verschickt, der neueste Stand gilt fuer alles, was die
 * Fuehrungskraft nicht sieht), sonst aus der eigenen Zeile.
 */
export function wahlPruefen(
  eingabe: FuehrungskraftEingabe,
  ausschnitt: ReadonlyArray<KatalogPosition>,
  bestehend: BestehendeFuehrungskraftWahl,
): WahlPruefung {
  const { angebote, stellen } = fuehrungskraftAngebot(ausschnitt, bestehend);

  let zeilen: GepruefteWahl[] | undefined;
  if (eingabe.ausstattung !== undefined) {
    zeilen = [];
    const gesehen = new Set<string>();
    for (const w of eingabe.ausstattung) {
      const angebot = angebote.get(w.positionId);
      if (!angebot) return { ok: false, fehler: MELDUNGEN.WAHL_POSITION_UNBEKANNT };
      if (gesehen.has(w.positionId)) return { ok: false, fehler: MELDUNGEN.WAHL_POSITION_DOPPELT };
      gesehen.add(w.positionId);

      const art = angebot.basis.art;
      const auswahl = [...new Set(w.auswahl ?? [])];
      const angabe = textOderNull(w.angabe);
      const bemerkung = textOderNull(w.bemerkung);
      if (bemerkung && !angebot.bemerkungErlaubt) return { ok: false, fehler: MELDUNGEN.WAHL_OHNE_BEMERKUNG };

      if (art === "JA_NEIN") {
        if (auswahl.length > 0 || angabe) return { ok: false, fehler: MELDUNGEN.WAHL_PASST_NICHT };
        if (w.gewaehlt !== true) return { ok: false, fehler: MELDUNGEN.WAHL_NICHT_GEWAEHLT };
      } else if (art === "AUSWAHL") {
        if (w.gewaehlt !== undefined || angabe) return { ok: false, fehler: MELDUNGEN.WAHL_PASST_NICHT };
        if (auswahl.length === 0) return { ok: false, fehler: MELDUNGEN.WAHL_NICHT_GEWAEHLT };
        if (auswahl.some((o) => !angebot.optionen.includes(o))) {
          return { ok: false, fehler: MELDUNGEN.WAHL_OPTION_UNBEKANNT };
        }
        auswahl.sort((a, b) => angebot.optionen.indexOf(a) - angebot.optionen.indexOf(b));
      } else if (art === "ANGABE") {
        if (w.gewaehlt !== undefined || auswahl.length > 0) return { ok: false, fehler: MELDUNGEN.WAHL_PASST_NICHT };
        if (!angabe) return { ok: false, fehler: MELDUNGEN.WAHL_ANGABE_FEHLT };
        const definition = istAngabeSchluessel(angebot.basis.angabeSchluessel)
          ? ANGABEN_KATALOG[angebot.basis.angabeSchluessel]
          : null;
        const max = definition?.max ?? GRENZEN.angabe;
        if (angabe.length > max) {
          return {
            ok: false,
            fehler: `Die Angabe „${definition?.label ?? angebot.basis.bezeichnung}“ darf höchstens ${max} Zeichen lang sein.`,
          };
        }
      } else {
        return { ok: false, fehler: MELDUNGEN.WAHL_POSITION_UNBEKANNT };
      }

      zeilen.push({
        ...angebot.basis,
        positionId: w.positionId,
        sichtbarFuer: [...angebot.basis.sichtbarFuer],
        auswahl: art === "AUSWAHL" ? auswahl : [],
        angabe: art === "ANGABE" ? angabe : null,
        bemerkung,
      });
    }
  }

  let hinweise: { departmentKey: string; text: string }[] | undefined;
  if (eingabe.hinweise !== undefined) {
    hinweise = [];
    const gesehen = new Set<string>();
    for (const h of eingabe.hinweise) {
      const key = h.departmentKey.trim();
      if (!stellen.includes(key)) return { ok: false, fehler: MELDUNGEN.HINWEIS_STELLE_UNBEKANNT };
      if (gesehen.has(key)) return { ok: false, fehler: MELDUNGEN.HINWEIS_DOPPELT };
      gesehen.add(key);
      const text = textOderNull(h.hinweis);
      if (text) hinweise.push({ departmentKey: key, text });
    }
  }

  return { ok: true, zeilen, hinweise };
}

/**
 * Was das Formular der Fuehrungskraft zum Schritt „Ausstattung & Zugänge“
 * bekommt (GET /api/modalitaeten/[token], Feld `ausstattung`). Ohne interne
 * Felder (Regel 7: kein `hinweisStelle`, keine Faelligkeit, keine A4-Felder)
 * und ohne alles, was HR ergaenzt hat.
 */
export interface FuehrungskraftSicht {
  /** Positionen je Stelle; dazu Stellen, an die nur noch ein eigener Hinweis geht (ohne Positionen). */
  gruppen: FormularGruppe[];
  /** Die eigene gespeicherte Wahl, in der Form des PUT. */
  wahl: AusstattungsWahlEingabe[];
  /** Die eigenen gespeicherten Hinweise (nur nicht leere). */
  hinweise: StellenHinweisEingabe[];
  /**
   * Vorauswahl des Katalogs anwenden? Nur, solange die Fuehrungskraft den
   * Schritt nie gespeichert hat (`ausstattungGespeichertAm == null`, F9) —
   * sonst hiesse „alles abgewaehlt“ beim naechsten Oeffnen wieder „vorausgewaehlt“.
   */
  vorausgewaehltAnwenden: boolean;
  /** Steht unter jedem Bemerkungs- und Hinweisfeld. */
  bemerkungHinweis: string;
  /** E-A26: Aenderungen nach dem Absenden gehen an die Personalabteilung. */
  aenderungenHinweis: string;
}

/**
 * Baut die Sicht der Fuehrungskraft aus dem Katalogausschnitt des Vorgangs und
 * ihrer eigenen Wahl (nur quelle FUEHRUNGSKRAFT — was HR ergaenzt, sieht sie
 * nie). Dasselbe Angebot wie `wahlPruefen`: Eine eigene Wahl, die der Katalog
 * nicht mehr anbietet, steht mit `nichtMehrImKatalog` in ihrer Gruppe; ebenso
 * eine, deren Position die Verwaltung seit dem Speichern in Art, Stelle oder
 * Bezeichnung geaendert hat — in der gespeicherten Form und unter der
 * gespeicherten Stelle, die neue Form fehlt dann. Eine Option, die der Katalog
 * nicht mehr kennt, steht hinter den uebrigen.
 *
 * `wahl` ist damit genau der gespeicherte Stand: Die Zusammenfassung vor dem
 * Absenden (`formularKurzform`) zeigt, was abgegeben wird und was HR in Karte
 * und PDF sieht — auch, wenn die Fuehrungskraft den Schritt seit der
 * Katalogaenderung nicht mehr gespeichert hat.
 */
export function fuehrungskraftSicht(opts: {
  positionen: ReadonlyArray<KatalogPosition>;
  stellenNamen: Readonly<Record<string, string>>;
  bestehend: BestehendeFuehrungskraftWahl;
  ausstattungGespeichert: boolean;
}): FuehrungskraftSicht {
  const { angebote, stellen } = fuehrungskraftAngebot(opts.positionen, opts.bestehend);
  const name = (key: string) => (hatEigenen(opts.stellenNamen, key) && opts.stellenNamen[key]) || abteilungLabel(key);
  const ausKatalog = new Map(formularGruppen(opts.positionen, opts.stellenNamen).map((g) => [g.departmentKey, g]));

  const gruppen: FormularGruppe[] = stellen.map((key) => {
    const gruppe = ausKatalog.get(key);
    const positionen: FormularPosition[] = [];
    for (const fp of gruppe?.positionen ?? []) {
      const angebot = angebote.get(fp.id);
      // In anderer Form gespeichert: Die Position steht unten aus der eigenen Zeile.
      if (!angebot?.position) continue;
      // `fp.optionen` sind die des Katalogs; was das Angebot darueber hinaus
      // kennt, stammt nur aus der eigenen Wahl. Ebenso das Bemerkungsfeld, das
      // nur wegen einer gespeicherten Bemerkung steht.
      const nurGewaehlt = fp.art === "AUSWAHL" ? angebot.optionen.filter((o) => !fp.optionen.includes(o)) : [];
      positionen.push({
        ...fp,
        optionen: fp.art === "AUSWAHL" ? [...angebot.optionen] : fp.optionen,
        bemerkungAnbieten: angebot.bemerkungErlaubt,
        ...(nurGewaehlt.length > 0 ? { optionenNichtMehrImKatalog: nurGewaehlt } : {}),
        ...(angebot.bemerkungErlaubt && !fp.bemerkungAnbieten ? { bemerkungNurGespeichert: true } : {}),
      });
    }
    const nurNochEigene = [...angebote.values()]
      .filter((a) => !a.position && a.basis.departmentKey === key)
      .sort((a, b) => a.basis.reihenfolge - b.basis.reihenfolge || a.basis.bezeichnung.localeCompare(b.basis.bezeichnung, "de"));
    for (const a of nurNochEigene) {
      const angabe =
        a.basis.art === "ANGABE" && istAngabeSchluessel(a.basis.angabeSchluessel)
          ? ANGABEN_KATALOG[a.basis.angabeSchluessel]
          : null;
      // Bietet der Ausschnitt fuer diese Position noch ein Bemerkungsfeld an,
      // gilt es samt Platzhalter; sonst steht es nur wegen einer gespeicherten
      // Bemerkung und faellt mit ihr weg (`sichtNachSpeichern`).
      const katalogFeld = a.bemerkungErlaubt && !!a.imAusschnitt?.bemerkungAnbieten;
      positionen.push({
        id: a.basis.positionId ?? "",
        departmentKey: key,
        art: a.basis.art,
        bezeichnung: a.basis.bezeichnung,
        hinweisFuehrungskraft: null,
        optionen: a.basis.art === "AUSWAHL" ? [...a.optionen] : [],
        vorausgewaehlt: false,
        vorausgewaehlteOptionen: [],
        bemerkungAnbieten: a.bemerkungErlaubt,
        bemerkungPlatzhalter: katalogFeld ? (a.imAusschnitt?.bemerkungPlatzhalter ?? null) : null,
        ...(a.bemerkungErlaubt && !katalogFeld ? { bemerkungNurGespeichert: true } : {}),
        angabe: angabe
          ? {
              platzhalter: angabe.platzhalter,
              hilfe: angabe.hilfe,
              max: angabe.max,
              sichtbarFuer: a.basis.sichtbarFuer.map((k) => ({ departmentKey: k, stelleName: name(k) })),
            }
          : null,
        nichtMehrImKatalog: true,
        ...(a.imAusschnitt ? { imKatalogGeaendert: true } : {}),
        ...(a.basis.art === "AUSWAHL" && a.optionen.length > 0 ? { optionenNichtMehrImKatalog: [...a.optionen] } : {}),
      });
    }
    return { departmentKey: key, stelleName: gruppe?.stelleName ?? name(key), positionen };
  });

  // Die gespeicherte Wahl, Zeile fuer Zeile: Eine Zeile, deren Art der Katalog
  // geaendert hat, steht oben aus der eigenen Momentaufnahme — `basis.art` ist
  // dann ihre eigene. Nur eine Zeile mit unbekannter Art faellt weg.
  const wahl: AusstattungsWahlEingabe[] = [];
  for (const gruppe of gruppen) {
    for (const fp of gruppe.positionen) {
      const angebot = angebote.get(fp.id);
      const zeile = angebot?.bestehend;
      if (!angebot || !zeile || zeile.art !== angebot.basis.art) continue;
      const bemerkung = angebot.bemerkungErlaubt ? textOderNull(zeile.bemerkung) : null;
      const mitBemerkung = bemerkung ? { bemerkung } : {};
      if (zeile.art === "JA_NEIN") {
        wahl.push({ positionId: fp.id, gewaehlt: true, ...mitBemerkung });
      } else if (zeile.art === "AUSWAHL") {
        const auswahl = zeile.auswahl.filter((o) => angebot.optionen.includes(o));
        if (auswahl.length > 0) wahl.push({ positionId: fp.id, auswahl, ...mitBemerkung });
      } else if (zeile.art === "ANGABE") {
        const angabe = textOderNull(zeile.angabe);
        if (angabe) wahl.push({ positionId: fp.id, angabe });
      }
    }
  }

  const hinweise: StellenHinweisEingabe[] = [];
  for (const key of stellen) {
    const h = opts.bestehend.hinweise.find((x) => x.departmentKey === key);
    const text = textOderNull(h?.text);
    if (text) hinweise.push({ departmentKey: key, hinweis: text });
  }

  return {
    gruppen,
    wahl,
    hinweise,
    vorausgewaehltAnwenden: !opts.ausstattungGespeichert,
    bemerkungHinweis: BEMERKUNG_HINWEIS,
    aenderungenHinweis: AENDERUNGEN_NACH_ABGABE_HINWEIS,
  };
}

// =============================================
// Formularschritt der Fuehrungskraft (S9): Zustand, Body, Kurzform
// =============================================
//
// Die Oberflaeche (src/components/ausstattung/ausstattung-schritt.tsx und
// ausstattung-zusammenfassung.tsx) rechnet nichts selbst: Startzustand, Body
// des PUT, Kurzform der Zusammenfassung und der Stand nach dem Speichern stehen
// hier. Der Body hat genau die Form, die `wahlPruefen` annimmt (Gegenprobe im
// Test) — nicht Gewaehltes fehlt ganz, eine Bemerkung nur, wo das Formular ein
// Feld zeigt, Hinweise nur nicht leer.

/**
 * Was im Formular zu einer Position eingestellt ist. Auch eine abgewaehlte
 * Position behaelt ihre Bemerkung, solange die Seite steht: Ab- und wieder
 * Anhaken verliert nichts. Gesendet wird sie nur mit der Wahl (`formularEingabe`).
 */
export interface FormularPositionStand {
  /** Nur Ja/Nein. */
  gewaehlt: boolean;
  /** Nur Auswahl; der Body ordnet sie nach den Optionen der Position. */
  auswahl: string[];
  /** Nur Angabe. */
  angabe: string;
  bemerkung: string;
}

/** Der Zustand des Schritts „Ausstattung & Zugänge“ im Formular. */
export interface FormularStand {
  /** Je Positions-ID. */
  positionen: Record<string, FormularPositionStand>;
  /** Je Stelle der Text von „Weitere Hinweise an …“. */
  hinweise: Record<string, string>;
}

/** Der Stand einer Position — eine Position ohne Eintrag ist nicht gewaehlt. */
export function formularPositionStand(stand: FormularStand, positionId: string): FormularPositionStand {
  return hatEigenen(stand.positionen, positionId)
    ? stand.positionen[positionId]
    : { gewaehlt: false, auswahl: [], angabe: "", bemerkung: "" };
}

/** Der Text von „Weitere Hinweise an …“ einer Stelle ("" = keiner). */
export function formularHinweis(stand: FormularStand, departmentKey: string): string {
  return hatEigenen(stand.hinweise, departmentKey) ? stand.hinweise[departmentKey] : "";
}

/**
 * Startzustand des Schritts: die gespeicherte eigene Wahl. Die Vorauswahl des
 * Katalogs (`vorausgewaehlt`, `vorausgewaehlteOptionen`) gilt nur, solange der
 * Schritt nie gespeichert wurde (`vorausgewaehltAnwenden`, F9) — sonst hiesse
 * „alles abgewaehlt“ beim naechsten Oeffnen wieder „vorausgewaehlt“.
 */
export function formularStartStand(sicht: FuehrungskraftSicht): FormularStand {
  const wahl = new Map(sicht.wahl.map((w) => [w.positionId, w]));
  const positionen: Record<string, FormularPositionStand> = {};
  for (const gruppe of sicht.gruppen) {
    for (const p of gruppe.positionen) {
      const w = wahl.get(p.id);
      if (w) {
        positionen[p.id] = {
          gewaehlt: w.gewaehlt === true,
          auswahl: [...(w.auswahl ?? [])],
          angabe: w.angabe ?? "",
          bemerkung: w.bemerkung ?? "",
        };
      } else {
        const vorauswahl = sicht.vorausgewaehltAnwenden;
        positionen[p.id] = {
          gewaehlt: vorauswahl && p.art === "JA_NEIN" && p.vorausgewaehlt,
          auswahl: vorauswahl && p.art === "AUSWAHL" ? [...p.vorausgewaehlteOptionen] : [],
          angabe: "",
          bemerkung: "",
        };
      }
    }
  }
  const hinweise: Record<string, string> = {};
  for (const h of sicht.hinweise) hinweise[h.departmentKey] = h.hinweis;
  return { positionen, hinweise };
}

/**
 * Der Body des PUT beim „Weiter“ (`{ ausstattung, hinweise }`, R3: immer, auch
 * leer — „Weiter“ ist in diesem Schritt nie gesperrt):
 *
 *   - Ja/Nein nur angehakt, als `{ positionId, gewaehlt: true }`;
 *   - Auswahl nur mit mindestens einer Option, in der Reihenfolge der Position;
 *   - Angabe nur mit Text (getrimmt), nie mit Bemerkung;
 *   - eine Bemerkung nur, wo das Formular ein Feld zeigt (`bemerkungAnbieten`)
 *     und sie nicht leer ist;
 *   - Hinweise nur nicht leer, je Stelle der Sicht.
 *
 * Beide Listen sind immer gesetzt: Ein leeres Array leert den gespeicherten
 * Stand (alles abgewaehlt), so wie die Fuehrungskraft es auf dem Schirm hat.
 */
export function formularEingabe(
  sicht: FuehrungskraftSicht,
  stand: FormularStand,
): { ausstattung: AusstattungsWahlEingabe[]; hinweise: StellenHinweisEingabe[] } {
  const ausstattung: AusstattungsWahlEingabe[] = [];
  for (const gruppe of sicht.gruppen) {
    for (const p of gruppe.positionen) {
      const s = formularPositionStand(stand, p.id);
      const bemerkung = p.bemerkungAnbieten ? s.bemerkung.trim() : "";
      const mitBemerkung = bemerkung ? { bemerkung } : {};
      if (p.art === "JA_NEIN") {
        if (s.gewaehlt) ausstattung.push({ positionId: p.id, gewaehlt: true, ...mitBemerkung });
      } else if (p.art === "AUSWAHL") {
        const auswahl = p.optionen.filter((o) => s.auswahl.includes(o));
        if (auswahl.length > 0) ausstattung.push({ positionId: p.id, auswahl, ...mitBemerkung });
      } else if (p.art === "ANGABE") {
        const angabe = s.angabe.trim();
        if (angabe) ausstattung.push({ positionId: p.id, angabe });
      }
    }
  }
  const hinweise: StellenHinweisEingabe[] = [];
  for (const gruppe of sicht.gruppen) {
    const text = formularHinweis(stand, gruppe.departmentKey).trim();
    if (text) hinweise.push({ departmentKey: gruppe.departmentKey, hinweis: text });
  }
  return { ausstattung, hinweise };
}

/** Teil der Kurzform fuer eine Stelle, an die ein Hinweis geht (sein Text steht im Schritt davor). */
export const KURZFORM_HINWEIS = "Weitere Hinweise";

/** Die Zusammenfassung des Schritts (Mockup 6.2). */
export interface FormularKurzform {
  /** Je Stelle mit Wahl oder Hinweis eine Zeile, in der Reihenfolge des Formulars. */
  stellen: { departmentKey: string; stelleName: string; text: string }[];
  /** Zahl der Bemerkungen — ihr Text steht im Schritt davor. */
  bemerkungen: number;
}

/**
 * Kurzform je Stelle fuer die Zusammenfassung vor dem Absenden, aus der
 * gespeicherten Wahl (`sicht.wahl` — nach dem „Weiter“ fortgeschrieben ueber
 * `sichtNachSpeichern`): Ja/Nein mit Bezeichnung, Auswahl als „Schlüssel (4)“,
 * Angabe als „Unterrichtsfächer: Chemie, Sport“, dazu „Weitere Hinweise“, wenn
 * ein Hinweis an die Stelle geht. Bemerkungen nur gezaehlt. Bezeichnung, Art
 * und Stelle stammen aus der Sicht — fuer eine seit dem Speichern geaenderte
 * Position also aus der gespeicherten Momentaufnahme (`fuehrungskraftSicht`):
 * Die Zusammenfassung zeigt, was abgegeben wird.
 */
export function formularKurzform(sicht: FuehrungskraftSicht): FormularKurzform {
  const wahl = new Map(sicht.wahl.map((w) => [w.positionId, w]));
  const mitHinweis = new Set(sicht.hinweise.filter((h) => !leer(h.hinweis)).map((h) => h.departmentKey));
  const stellen: FormularKurzform["stellen"] = [];
  let bemerkungen = 0;
  for (const gruppe of sicht.gruppen) {
    const teile: string[] = [];
    for (const p of gruppe.positionen) {
      const w = wahl.get(p.id);
      if (!w) continue;
      const vorher = teile.length;
      const optionen = w.auswahl?.length ?? 0;
      const angabeText = (w.angabe ?? "").trim();
      if (p.art === "JA_NEIN" && w.gewaehlt === true) teile.push(p.bezeichnung);
      else if (p.art === "AUSWAHL" && optionen > 0) teile.push(`${p.bezeichnung} (${optionen})`);
      else if (p.art === "ANGABE" && angabeText) teile.push(`${p.bezeichnung}: ${angabeText}`);
      if (teile.length > vorher && !leer(w.bemerkung)) bemerkungen += 1;
    }
    if (mitHinweis.has(gruppe.departmentKey)) teile.push(KURZFORM_HINWEIS);
    if (teile.length > 0) {
      stellen.push({ departmentKey: gruppe.departmentKey, stelleName: gruppe.stelleName, text: teile.join(" · ") });
    }
  }
  return { stellen, bemerkungen };
}

/**
 * Die Sicht nach einem erfolgreichen „Weiter“ fortschreiben, ohne sie neu zu
 * laden: Die gespeicherte Wahl ist jetzt der gesendete Body, und die Vorauswahl
 * gilt nicht mehr (F9). Dazu faellt weg, was der Server ab jetzt nicht mehr
 * anbietet (`fuehrungskraftAngebot`), damit ein „Zurück“ nichts zeigt, das der
 * naechste PUT abweist:
 *
 *   - eine Position `nichtMehrImKatalog`, die nicht mehr gewaehlt ist (auch
 *     eine `imKatalogGeaendert` — ihre geaenderte Form liefert erst der
 *     naechste GET, die Sicht hier kennt sie nicht);
 *   - eine Option, die nur aus der alten Wahl stammte und nicht mehr gewaehlt ist;
 *   - ein Bemerkungsfeld, das nur wegen einer gespeicherten Bemerkung stand,
 *     wenn keine mehr gespeichert ist;
 *   - eine Stelle ohne Position, deren Hinweis geleert wurde.
 *
 * Ein fehlendes Feld der Eingabe laesst den Stand dazu unveraendert (wie im PUT).
 */
export function sichtNachSpeichern(sicht: FuehrungskraftSicht, eingabe: FuehrungskraftEingabe): FuehrungskraftSicht {
  if (eingabe.ausstattung === undefined && eingabe.hinweise === undefined) return sicht;

  const wahlListe: AusstattungsWahlEingabe[] = eingabe.ausstattung
    ? eingabe.ausstattung.map((w) => ({ ...w, ...(w.auswahl ? { auswahl: [...w.auswahl] } : {}) }))
    : sicht.wahl;
  const hinweisListe: StellenHinweisEingabe[] = eingabe.hinweise
    ? eingabe.hinweise
        .filter((h) => !leer(h.hinweis))
        .map((h) => ({ departmentKey: h.departmentKey, hinweis: h.hinweis.trim() }))
    : sicht.hinweise;
  const wahl = new Map(wahlListe.map((w) => [w.positionId, w]));
  const hinweisStellen = new Set(hinweisListe.map((h) => h.departmentKey));

  const gruppen: FormularGruppe[] = [];
  for (const gruppe of sicht.gruppen) {
    const positionen: FormularPosition[] = [];
    for (const p of gruppe.positionen) {
      if (!eingabe.ausstattung) {
        positionen.push(p);
        continue;
      }
      const w = wahl.get(p.id);
      if (p.nichtMehrImKatalog && !w) continue;
      const { optionenNichtMehrImKatalog: alteOptionen, bemerkungNurGespeichert, ...rest } = p;
      const neu: FormularPosition = rest;
      if (alteOptionen) {
        const bleiben = alteOptionen.filter((o) => w?.auswahl?.includes(o) ?? false);
        neu.optionen = p.optionen.filter((o) => !alteOptionen.includes(o) || bleiben.includes(o));
        if (bleiben.length > 0) neu.optionenNichtMehrImKatalog = bleiben;
      }
      if (bemerkungNurGespeichert) {
        if (leer(w?.bemerkung)) neu.bemerkungAnbieten = false;
        else neu.bemerkungNurGespeichert = true;
      }
      positionen.push(neu);
    }
    if (positionen.length > 0 || hinweisStellen.has(gruppe.departmentKey)) gruppen.push({ ...gruppe, positionen });
  }

  return { ...sicht, gruppen, wahl: wahlListe, hinweise: hinweisListe, vorausgewaehltAnwenden: false };
}

// =============================================
// HR liest mit (S10): Kurzform der HR-Mail, Zustand und Uebersicht der Karte
// =============================================
//
// Was die Fuehrungskraft gewaehlt hat, sieht HR an drei Stellen: in der Mail
// `supervisor-completed` nur gezaehlt (`ausstattungKurz`, ohne Bemerkungen),
// im Reiter „Vorgesetzter“ als fuenfte Karte und im PDF der Modalitaeten
// (beide aus `ausstattungsGruppen`, nur lesend). Die Karte im Reiter
// Checkliste (S15/S16) baut auf derselben Uebersicht auf und bekommt dort
// Aufgabenstand und Aktionen.

/** Endstatus des Vorgangs: Die Ausstattung ist nur noch lesbar (Regel 13). REVIEWED laeuft noch. */
export const AUSSTATTUNG_ENDSTATUS = ["COMPLETED", "EXPIRED"] as const;

/** „A“, „A und B“, „A, B und C“. */
export function namenAufzaehlen(namen: ReadonlyArray<string>): string {
  if (namen.length <= 1) return namen[0] ?? "";
  return `${namen.slice(0, -1).join(", ")} und ${namen[namen.length - 1]}`;
}

/**
 * Die Kurzform fuer die HR-Mail `supervisor-completed` (`{{ausstattung_kurz}}`,
 * Plan Abschnitt 9): „6 Positionen für 3 Stellen“. Gezaehlt werden die nicht
 * gestrichenen Ja/Nein- und Auswahl-Zeilen (eine je Position, nicht je
 * Option); die Stellen kommen aus diesen Zeilen und aus den nicht leeren
 * Hinweisen. Angaben zaehlen nicht (sie werden keine Aufgabe). Nur Hinweise:
 * „Hinweise an 2 Stellen“. Nichts gewaehlt: "" (der Block in der Vorlage
 * entfaellt). Nie ein Bemerkungs- oder Hinweistext — die Mail geht an ein
 * HR-Postfach mit Webhook-Weg.
 */
export function ausstattungKurz(
  zeilen: ReadonlyArray<{ art: string; departmentKey: string; gestrichenAm?: Date | string | null }>,
  hinweise: ReadonlyArray<{ departmentKey: string; text: string | null }>,
): string {
  const positionen = zeilen.filter((z) => !z.gestrichenAm && (z.art === "JA_NEIN" || z.art === "AUSWAHL"));
  const stellen = new Set([
    ...positionen.map((z) => z.departmentKey),
    ...hinweise.filter((h) => !leer(h.text)).map((h) => h.departmentKey),
  ]);
  if (stellen.size === 0) return "";
  const fuer = mitAnzahl(stellen.size, "Stelle", "Stellen");
  if (positionen.length === 0) return `${stellen.size === 1 ? "Hinweis" : "Hinweise"} an ${fuer}`;
  return `${mitAnzahl(positionen.length, "Position", "Positionen")} für ${fuer}`;
}

function herkunftText(wort: string, quelle: string | null | undefined): string {
  if (quelle === "HR") return `${wort} der Personalabteilung`;
  if (quelle === "BEIDE") return `${wort} der Führungskraft, ergänzt durch die Personalabteilung`;
  return `${wort} der Führungskraft`;
}

/**
 * Beschriftung einer Bemerkung nach ihrer Herkunft (Regel 8): „Bemerkung der
 * Führungskraft“, „… der Personalabteilung“, „… der Führungskraft, ergänzt
 * durch die Personalabteilung“. Ohne bekannte Herkunft die der Fuehrungskraft.
 */
export function bemerkungLabel(quelle: string | null | undefined): string {
  return herkunftText("Bemerkung", quelle);
}

/** Dasselbe fuer „Weitere Hinweise an …“ (`OnboardingStellenHinweis.quelle`). */
export function hinweisLabel(quelle: string | null | undefined): string {
  return herkunftText("Hinweis", quelle);
}

export type AusstattungsZustand = "ENTWURF" | "BEARBEITBAR" | "NUR_LESEN";

/** Was die Zustandsregel ueber den Vorgang wissen muss (Prisma-Zeile oder JSON der Detailroute). */
export interface UebersichtVorgangStand {
  status: string;
  supervisorSubmittedAt?: Date | string | null;
  supervisorData?: {
    isComplete?: boolean | null;
    mitAusstattung?: boolean | null;
    /** Seit S15: Bezug der Vorlauf-Warnung (Regel 14); gilt nur mit eingereichten Modalitaeten. */
    vertragsbeginn?: Date | string | null;
  } | null;
}

/**
 * Die Zustandsregel der Karte (Feinplan 1.6) — EINE Stelle fuer Karte und
 * Server:
 *
 *   - NUR_LESEN: Status COMPLETED oder EXPIRED (Satz „… nur noch lesbar.“)
 *     oder die Rolle darf nicht bearbeiten (kein Satz).
 *   - ENTWURF: Modalitaeten nicht eingereicht (`vorgesetzteAbgesendet`). Der
 *     Satz haengt am Merker: mit Schritt „Ohne Einstellungsmodalitäten …“,
 *     sonst „Das Formular der Führungskraft enthält diesen Schritt nicht …“.
 *   - BEARBEITBAR: eingereicht, Status nicht final, Rolle darf bearbeiten —
 *     UNABHAENGIG von `mitAusstattung`. Der Merker steuert nur das Formular
 *     der Fuehrungskraft (Regel 2), nie die Karte: Nach der Abgabe ergaenzt HR
 *     auch Vorgaenge ohne den Schritt (Bestand, falscher Fragebogentyp).
 */
export function ausstattungsZustand(
  v: UebersichtVorgangStand,
  darfBearbeiten: boolean,
): { zustand: AusstattungsZustand; satz: string | null } {
  if ((AUSSTATTUNG_ENDSTATUS as readonly string[]).includes(v.status)) {
    return { zustand: "NUR_LESEN", satz: MELDUNGEN.UEBERSICHT_ABGESCHLOSSEN };
  }
  if (!darfBearbeiten) return { zustand: "NUR_LESEN", satz: null };
  if (!vorgesetzteAbgesendet(v)) {
    return {
      zustand: "ENTWURF",
      satz:
        v.supervisorData?.mitAusstattung === true
          ? MELDUNGEN.UEBERSICHT_ENTWURF_MIT_SCHRITT
          : MELDUNGEN.UEBERSICHT_ENTWURF_OHNE_SCHRITT,
    };
  }
  return { zustand: "BEARBEITBAR", satz: null };
}

/** Eine Zeile von `OnboardingAusstattung`, wie Uebersicht und PDF sie lesen. */
export interface UebersichtZeileDaten {
  id: string;
  positionId: string | null;
  departmentKey: string;
  art: string;
  angabeSchluessel: string | null;
  bezeichnung: string;
  sichtbarFuer: readonly string[];
  reihenfolge: number;
  auswahl: readonly string[];
  angabe: string | null;
  bemerkung: string | null;
  bemerkungQuelle: string | null;
  quelle: string;
  erfasstVonId?: string | null;
  gestrichenAm?: Date | string | null;
  createdAt?: Date | string | null;
  /** Seit S15: Faelligkeit der Momentaufnahme (Tage zum Vertragsbeginn) — nur fuer die Vorlauf-Warnung, nie in der Antwort. */
  relativeDueDays?: number | null;
}

/**
 * Eine Ausstattungs- oder Hinweis-Aufgabe (`ChecklistItem` mit `herkunft`),
 * wie die Karte sie liest (seit S15). Ein Haken ueber den Link setzt
 * `completedById` nicht — die Karte braucht ihn auch nicht.
 */
export interface UebersichtAufgabeDaten {
  id: string;
  title: string;
  isCompleted: boolean;
  completedAt?: Date | string | null;
  dueDate?: Date | string | null;
  eilt?: boolean | null;
  entfaelltAm?: Date | string | null;
}

/** Verknuepfung Zeile/Option → Aufgabe (`OnboardingAusstattungAufgabe`). */
export interface UebersichtVerknuepfung {
  ausstattungId: string;
  option: string;
  checklistItemId: string;
}

/** Ein „Weitere Hinweise an …“ (`OnboardingStellenHinweis`), wie Uebersicht und PDF ihn lesen. */
export interface UebersichtHinweisDaten {
  departmentKey: string;
  text: string;
  quelle: string;
  checklistItemId?: string | null;
  gesehenAm?: Date | string | null;
}

/** Wer eine Zeile ergaenzt hat (HR-Konto, `erfasstVonId`). */
export interface Erfasser {
  firstName: string | null;
  lastName: string | null;
}

/** Zustand einer Ausstattungs- oder Hinweis-Aufgabe (F2: „entfällt“ ist erledigt, zaehlt aber nie als erledigt). */
export type AufgabenStatus = "offen" | "erledigt" | "entfaellt";

/**
 * Stand einer Aufgabe zu einer Zeile (je Option eine; seit S15 in der
 * Uebersicht, im PDF leer).
 *
 * Seit S24 (A4, G7) die Ausgaben der Aufgabe (`AusgabenAufgabeAnzeige` aus
 * ausgaben.ts: `ausgabeMoeglich`, `ausgaben`, Hinweis, „Vermerken“, Art,
 * Beschriftung, Schluessel) — nur an Aufgaben, deren Zeile beim Austritt
 * zurueckkommt oder gesperrt wird, und nur in der Sicht von HR. Fehlen die
 * Felder, gibt es dort keine Uebergabe (deshalb optional).
 */
export interface AusstattungsAufgabeStand extends Partial<AusgabenAufgabeAnzeige> {
  /** "" = ganze Position, sonst die Option. */
  option: string;
  checklistItemId: string;
  titel: string;
  status: AufgabenStatus;
  /** Faelligkeit als ISO-Zeitpunkt (Mitternacht UTC des Berliner Kalendertags). */
  faelligAm: string | null;
  eilt: boolean;
  /** Nur bei „erledigt“ (nie bei „entfällt“). */
  erledigtAm: string | null;
}

/** Eine Zeile der Uebersicht (Karte im Reiter „Vorgesetzter“, spaeter Reiter Checkliste). */
export interface AusstattungsZeile {
  id: string;
  positionId: string | null;
  art: string;
  bezeichnung: string;
  quelle: AusstattungsQuelle;
  /** Nur bei quelle HR: „ergänzt von HR (A. Peters), 19.01.2027“. */
  erfasst: string | null;
  /** Nur Auswahl: die gewaehlten Optionen in der gespeicherten Reihenfolge. */
  auswahl: string[];
  /**
   * Nur Auswahl: was der Dialog „Bearbeiten“ zur Wahl anbietet — die Optionen
   * des Katalogs (solange die Position im Katalog dieses Vorgangs steht),
   * dahinter die gewaehlten und die einer frueheren Aufgabe (F23: wieder
   * anwaehlen oeffnet sie wieder). Der Server prueft dieselbe Liste.
   */
  optionen: string[];
  bemerkung: { text: string; label: string } | null;
  /**
   * Nur Angabe mit Inhalt. `sichtbarFuer`: Anzeigenamen ALLER Stellen, die die
   * Angabe sehen — die eigene zuerst, dann die freigegebenen (Mockup 6.3:
   * „sehen Facility Management und IT-Abteilung“).
   */
  angabe: { label: string; wert: string; sichtbarFuer: string[] } | null;
  gestrichen: boolean;
  /** Die Position steht im Katalog dieses Vorgangs nicht mehr (ausgeschaltet, ausgeblendet, ohne Adresse). */
  nichtMehrImKatalog: boolean;
  /**
   * Regel 14 (`vorlaufWarnung`): nur in der Uebersicht von HR, nur im Zustand
   * BEARBEITBAR, solange eine Aufgabe offen ist (oder noch keine angelegt);
   * im PDF und in `ausstattungsGruppen` `null`.
   */
  vorlaufWarnung: string | null;
  /** Die Aufgaben der Zeile (je Option eine, auch entfallene); im PDF und in `ausstattungsGruppen` leer. */
  aufgaben: AusstattungsAufgabeStand[];
  /**
   * Was HR an der Zeile tun darf (nur im Zustand BEARBEITBAR, sonst alles aus):
   * `aendern` (Dialog „Bearbeiten“), `streichen`, dazu der Satz, warum etwas
   * gesperrt ist (Regel 9: erledigte Aufgabe; gestrichene Position). Der Server
   * prueft dieselbe Regel (`aenderungPruefen`).
   */
  aktionen: { aendern: boolean; streichen: boolean; sperrGrund: string | null };
}

export interface AusstattungsHinweis {
  text: string;
  /** „Hinweis der Führungskraft“ usw. (`hinweisLabel`). */
  quelleLabel: string;
  /** HR hat ihn zur Kenntnis genommen (`gesehenAm`). */
  gesehen: boolean;
  checklistItemId: string | null;
  /** Stand der Aufgabe „Hinweis der Führungskraft beachten“ (seit S15; ohne Aufgabe `null`). */
  status: AufgabenStatus | null;
  faelligAm: string | null;
  eilt: boolean;
  /** Text und Faelligkeit aendern (`hinweisAenderungPruefen`); nur im Zustand BEARBEITBAR. */
  aktionen: { aendern: boolean; sperrGrund: string | null };
}

export interface AusstattungsGruppe {
  departmentKey: string;
  stelleName: string;
  /** Die Stelle hat am Arbeitsort keine aktive Adresse (HR nie). */
  adresseFehlt: boolean;
  zeilen: AusstattungsZeile[];
  hinweis: AusstattungsHinweis | null;
}

/** Eine Katalogposition, die HR noch ergaenzen kann (nur im Zustand BEARBEITBAR). */
export interface AusstattungsHinzufuegbar {
  positionId: string;
  bezeichnung: string;
  art: string;
  departmentKey: string;
  optionen: string[];
}

/**
 * Eine Stelle, die HR fuer eine freie Position, einen Hinweis oder einen
 * Stellenwechsel waehlen kann (seit S15, nur im Zustand BEARBEITBAR): die
 * festen Stellen, die unter Einstellungen → Abteilungen angelegten und die
 * Personalabteilung — nie MITARBEITER oder VORGESETZTER (Regel 11).
 */
export interface AusstattungsStelle {
  departmentKey: string;
  /** Anzeigename am Arbeitsort (wie in den Gruppen). */
  name: string;
  /** Am Arbeitsort keine aktive Adresse (HR nie). */
  adresseFehlt: boolean;
}

/**
 * Die Uebersicht fuer HR (Feinplan 1.6), fertig fuer die Karte — sie rechnet
 * nichts selbst. Seit S10: Gruppen, Zeilen, Hinweise, Angaben, Zustand und
 * Saetze; seit S15 dazu Aufgabenstand, Aktionen, Vorlauf-Warnungen, die
 * waehlbaren Optionen und Stellen.
 */
export interface AusstattungsUebersicht {
  zustand: AusstattungsZustand;
  /** Satz der Zustandsregel (1.6), z. B. „Ohne Einstellungsmodalitäten kann nichts an die Stellen gehen.“ */
  satz: string | null;
  /** „Angefordert von der Führungskraft mit den Einstellungsmodalitäten (14.01.2027).“ — nur mit eingereichter Wahl. */
  einleitung: string | null;
  /** Satz, wenn es keine Gruppe gibt (sonst `null`). */
  leer: string | null;
  /** `supervisorSubmittedAt` als ISO-Zeitpunkt. */
  angefordertAm: string | null;
  /** Merker des Formulars (Regel 2) — nur zur Anzeige, der Zustand haengt nicht daran. */
  mitAusstattung: boolean;
  gruppen: AusstattungsGruppe[];
  /** Katalogpositionen, die HR ergaenzen kann; leer ausser im Zustand BEARBEITBAR. */
  hinzufuegbar: AusstattungsHinzufuegbar[];
  /** Waehlbare Stellen (freie Position, Hinweis, Stellenwechsel); leer ausser im Zustand BEARBEITBAR. */
  stellen: AusstattungsStelle[];
  /** Rolle in HR_EDIT_ROLES. */
  darfBearbeiten: boolean;
  /**
   * A4 (G7): Ausgaben vermerken, korrigieren, tauschen, zuruecknehmen und
   * entfernen — mit HR_EDIT_ROLES, UNABHAENGIG vom Zustand der Karte (auch
   * NUR_LESEN bei COMPLETED und EXPIRED). Optional fuer Altbestand der Tests.
   */
  ausgabenBearbeitbar?: boolean;
  /**
   * A4 (G19): „Unterschriebenes Übergabeprotokoll: fehlt / hochgeladen am …“,
   * sobald der Vorgang aktive Ausgaben mit RUECKGABE hat; sonst `null`.
   */
  protokoll?: ProtokollAnzeige | null;
}

function alsIso(wert: Date | string | null | undefined): string | null {
  if (!wert) return null;
  return wert instanceof Date ? wert.toISOString() : wert;
}

/** „A. Peters“; ohne Nachnamen der Vorname, ohne beides "". */
function kurzName(e: Erfasser | undefined): string {
  const vor = (e?.firstName ?? "").trim();
  const nach = (e?.lastName ?? "").trim();
  if (vor && nach) return `${vor.charAt(0)}. ${nach}`;
  return nach || vor;
}

/**
 * Die Gruppen je Stelle — fuer die Karte (ueber `ausstattungsUebersichtBauen`)
 * und fuer das PDF der Modalitaeten, damit beide dieselben Zeilen in derselben
 * Reihenfolge mit denselben Beschriftungen zeigen.
 *
 *   - Stellen in der Reihenfolge der Abteilungskarte, HR dahinter; eine Gruppe
 *     je Stelle mit Zeilen oder nicht leerem Hinweis.
 *   - Zeilen nach `reihenfolge` (orderIndex der Position beim Speichern), dann
 *     Bezeichnung. Gestrichene bleiben mit `gestrichen` stehen.
 *   - Bemerkung nur bei Ja/Nein und Auswahl, mit Beschriftung nach Herkunft;
 *     Angabe nur mit Inhalt, Label aus ANGABEN_KATALOG.
 *   - „nicht mehr im Katalog“ nur, wenn der Aufrufer den Katalog dieses
 *     Vorgangs kennt (`imKatalog`), sonst nie.
 */
export function ausstattungsGruppen(opts: {
  zeilen: ReadonlyArray<UebersichtZeileDaten>;
  hinweise: ReadonlyArray<UebersichtHinweisDaten>;
  stelleName: (departmentKey: string) => string;
  adresseFehlt?: (departmentKey: string) => boolean;
  /** IDs der Positionen, die der Katalog dem Vorgang heute anbietet; `null`/fehlend = unbekannt. */
  imKatalog?: ReadonlySet<string> | null;
  erfasser?: Readonly<Record<string, Erfasser>>;
}): AusstattungsGruppe[] {
  const hinweise = opts.hinweise.filter((h) => !leer(h.text) && !istNichtErlaubteStelle(h.departmentKey));
  const zeilen = opts.zeilen.filter((z) => !istNichtErlaubteStelle(z.departmentKey));
  const schluessel = [...zeilen.map((z) => z.departmentKey), ...hinweise.map((h) => h.departmentKey)];
  const rang = stellenRang(schluessel);
  const stellen = [...new Set(schluessel)].sort((a, b) => (rang.get(a) ?? 0) - (rang.get(b) ?? 0));

  return stellen.map((key) => {
    const eigene = zeilen
      .filter((z) => z.departmentKey === key)
      .sort((a, b) => a.reihenfolge - b.reihenfolge || a.bezeichnung.localeCompare(b.bezeichnung, "de"));
    const h = hinweise.find((x) => x.departmentKey === key);
    return {
      departmentKey: key,
      stelleName: opts.stelleName(key),
      adresseFehlt: key !== DEPARTMENT_KEYS.HR && (opts.adresseFehlt?.(key) ?? false),
      zeilen: eigene.map((z): AusstattungsZeile => {
        const quelle: AusstattungsQuelle = z.quelle === "HR" ? "HR" : "FUEHRUNGSKRAFT";
        const bemerkung = z.art === "ANGABE" ? null : textOderNull(z.bemerkung);
        const wert = z.art === "ANGABE" ? textOderNull(z.angabe) : null;
        const definition = istAngabeSchluessel(z.angabeSchluessel) ? ANGABEN_KATALOG[z.angabeSchluessel] : null;
        const datum = formatDatumDE(z.createdAt);
        const wer = kurzName(z.erfasstVonId ? opts.erfasser?.[z.erfasstVonId] : undefined);
        return {
          id: z.id,
          positionId: z.positionId,
          art: z.art,
          bezeichnung: z.bezeichnung,
          quelle,
          erfasst:
            quelle === "HR" ? `ergänzt von HR${wer ? ` (${wer})` : ""}${datum ? `, ${datum}` : ""}` : null,
          auswahl: z.art === "AUSWAHL" ? [...z.auswahl] : [],
          optionen: z.art === "AUSWAHL" ? [...z.auswahl] : [],
          bemerkung: bemerkung ? { text: bemerkung, label: bemerkungLabel(z.bemerkungQuelle ?? z.quelle) } : null,
          angabe: wert
            ? {
                label: definition?.label ?? z.bezeichnung,
                wert,
                sichtbarFuer: [key, ...z.sichtbarFuer.filter((k) => k !== key)].map((k) => opts.stelleName(k)),
              }
            : null,
          gestrichen: z.gestrichenAm != null,
          nichtMehrImKatalog: !!z.positionId && !!opts.imKatalog && !opts.imKatalog.has(z.positionId),
          vorlaufWarnung: null,
          aufgaben: [],
          aktionen: { aendern: false, streichen: false, sperrGrund: null },
        };
      }),
      hinweis: h
        ? {
            text: h.text.trim(),
            quelleLabel: hinweisLabel(h.quelle),
            gesehen: h.gesehenAm != null,
            checklistItemId: h.checklistItemId ?? null,
            status: null,
            faelligAm: null,
            eilt: false,
            aktionen: { aendern: false, sperrGrund: null },
          }
        : null,
    };
  });
}

/**
 * Baut die Uebersicht fuer HR (Feinplan 1.6): Zustand und Satz nach
 * `ausstattungsZustand`, Gruppen nach `ausstattungsGruppen` mit Stellen-Namen
 * und Adresse am wirksamen Arbeitsort (`empfaengerAufloesen`, dieselbe Regel
 * wie der Versand), dazu `hinzufuegbar` (nur BEARBEITBAR): der
 * Katalogausschnitt dieses Vorgangs ohne die schon gewaehlten, nicht
 * gestrichenen Positionen.
 *
 * Seit S15 (Karte im Reiter Checkliste) zusaetzlich, wenn der Aufrufer
 * Aufgaben und Verknuepfungen mitgibt:
 *   - je Zeile ihre Aufgaben (Option, Titel, offen/erledigt/entfällt,
 *     Faelligkeit, „Eilt“), die waehlbaren Optionen einer Auswahl und — nur
 *     BEARBEITBAR — die Aktionen nach Regel 9 (`aenderungPruefen`) und die
 *     Vorlauf-Warnung (Regel 14, `vorlaufWarnung` mit `jetzt`);
 *   - je Hinweis der Stand seiner Aufgabe samt Aktion (`hinweisAenderungPruefen`);
 *   - die waehlbaren Stellen (`stellen`, nur BEARBEITBAR).
 *
 * `katalog` ist der Ausschnitt (`katalogAusschnittLaden`); `null` heisst
 * „nicht geladen“ — dann ist nichts hinzufuegbar und keine Zeile „nicht mehr
 * im Katalog“. Ohne `jetzt` gibt es keine Vorlauf-Warnung (die Datei kennt
 * keine Uhr).
 *
 * Seit S24 (A4): `ausgabenJeAufgabe` (gebaut von `ausgabenAnzeigeBauen` in
 * ausgaben.ts — diese Datei liest von dort nur Typen) haengt die Ausgaben an
 * die Aufgaben; eine aktive Ausgabe sperrt Streichen, Abwaehlen und
 * Stellenwechsel (G5, `aenderungPruefen`). `ausgabenBearbeitbar` folgt dem
 * Bearbeitungsrecht, nicht dem Zustand (G7); `protokoll` reicht durch (G19).
 */
export function ausstattungsUebersichtBauen(opts: {
  vorgang: UebersichtVorgangStand;
  darfBearbeiten: boolean;
  zeilen: ReadonlyArray<UebersichtZeileDaten>;
  hinweise: ReadonlyArray<UebersichtHinweisDaten>;
  /** Wirksamer Arbeitsort (`onboardingEmpfaengerEinrichtung`). */
  arbeitsortId: string;
  konfigs: ReadonlyArray<AbteilungsKonfig>;
  katalog: ReadonlyArray<KatalogPosition> | null;
  erfasser?: Readonly<Record<string, Erfasser>>;
  /** Seit S15: Ausstattungs- und Hinweis-Aufgaben des Vorgangs (`ChecklistItem` mit `herkunft`). */
  aufgaben?: ReadonlyArray<UebersichtAufgabeDaten>;
  /** Seit S15: Verknuepfungen der Zeilen mit ihren Aufgaben. */
  verknuepfungen?: ReadonlyArray<UebersichtVerknuepfung>;
  /** Seit S15: Zeitpunkt fuer die Vorlauf-Warnung. */
  jetzt?: Date;
  /** Seit S24 (A4): Ausgaben je Ausstattungsaufgabe (Schluessel `checklistItemId`); fehlt = ohne Ausgabe-Felder. */
  ausgabenJeAufgabe?: Readonly<Record<string, AusgabenAufgabeAnzeige>>;
  /** Seit S24 (A4, G19): Zeile zum unterschriebenen Uebergabeprotokoll; fehlt = `null`. */
  protokoll?: ProtokollAnzeige | null;
}): AusstattungsUebersicht {
  const { zustand, satz } = ausstattungsZustand(opts.vorgang, opts.darfBearbeiten);
  const eingereicht = vorgesetzteAbgesendet(opts.vorgang);
  const mitAusstattung = opts.vorgang.supervisorData?.mitAusstattung === true;

  const empfaenger = (key: string) =>
    empfaengerAufloesen({ departmentKey: key, organizationId: opts.arbeitsortId, konfigs: opts.konfigs, fuehrungskraft: null });
  const stelleName = (key: string) => (key === DEPARTMENT_KEYS.HR ? abteilungLabel(key) : empfaenger(key).departmentName);
  const adresseFehlt = (key: string) => key !== DEPARTMENT_KEYS.HR && !empfaenger(key).ok;
  const gruppen = karteAnreichern(
    ausstattungsGruppen({
      zeilen: opts.zeilen,
      hinweise: opts.hinweise,
      stelleName,
      adresseFehlt,
      imKatalog: opts.katalog ? new Set(opts.katalog.map((p) => p.id)) : null,
      erfasser: opts.erfasser,
    }),
    {
      bearbeitbar: zustand === "BEARBEITBAR",
      zeilen: opts.zeilen,
      katalog: opts.katalog,
      aufgaben: opts.aufgaben ?? [],
      verknuepfungen: opts.verknuepfungen ?? [],
      vertragsbeginn: eingereicht ? (opts.vorgang.supervisorData?.vertragsbeginn ?? null) : null,
      jetzt: opts.jetzt ?? null,
      ausgabenJeAufgabe: opts.ausgabenJeAufgabe ?? null,
    },
  );
  const stellen: AusstattungsStelle[] =
    zustand === "BEARBEITBAR"
      ? waehlbareStellen(opts.konfigs).map((key) => ({ departmentKey: key, name: stelleName(key), adresseFehlt: adresseFehlt(key) }))
      : [];

  const gewaehlt = new Set(
    opts.zeilen.filter((z) => z.positionId && !z.gestrichenAm).map((z) => z.positionId as string),
  );
  const hinzufuegbar: AusstattungsHinzufuegbar[] =
    zustand === "BEARBEITBAR" && opts.katalog
      ? opts.katalog
          .filter((p) => !gewaehlt.has(p.id))
          .map((p) => ({
            positionId: p.id,
            bezeichnung: p.bezeichnung,
            art: p.art,
            departmentKey: p.departmentKey,
            optionen: p.art === "AUSWAHL" ? [...p.optionen] : [],
          }))
      : [];

  const angefordertAm = alsIso(opts.vorgang.supervisorSubmittedAt);
  const vonFuehrungskraft =
    opts.zeilen.some((z) => z.quelle === "FUEHRUNGSKRAFT") ||
    opts.hinweise.some((h) => h.quelle !== "HR" && !leer(h.text));
  const datum = formatDatumDE(angefordertAm);
  const einleitung =
    eingereicht && vonFuehrungskraft
      ? `Angefordert von der Führungskraft mit den Einstellungsmodalitäten${datum ? ` (${datum})` : ""}.`
      : null;

  let leerSatz: string | null = null;
  if (gruppen.length === 0) {
    if (zustand === "ENTWURF") leerSatz = mitAusstattung ? MELDUNGEN.UEBERSICHT_NOCH_NICHTS : null;
    else leerSatz = eingereicht && mitAusstattung ? MELDUNGEN.UEBERSICHT_NICHTS_ANGEFORDERT : MELDUNGEN.UEBERSICHT_LEER;
  }

  return {
    zustand,
    satz,
    einleitung,
    leer: leerSatz,
    angefordertAm,
    mitAusstattung,
    gruppen,
    hinzufuegbar,
    stellen,
    darfBearbeiten: opts.darfBearbeiten,
    ausgabenBearbeitbar: opts.darfBearbeiten,
    protokoll: opts.protokoll ?? null,
  };
}

/**
 * Die Stellen, die HR in der Karte waehlen kann: die festen Schluessel und
 * die unter Einstellungen → Abteilungen angelegten (gueltige Form), ohne
 * MITARBEITER und VORGESETZTER (Regel 11) — in der Reihenfolge der
 * Abteilungskarte, die Personalabteilung dahinter. Dieselbe Menge prueft der
 * Server (`abteilungsSchluesselBekannt` + `NICHT_ERLAUBTE_STELLEN`).
 */
export function waehlbareStellen(konfigs: ReadonlyArray<{ departmentKey: string }>): string[] {
  const schluessel = [
    ...(Object.values(DEPARTMENT_KEYS) as string[]),
    ...konfigs.map((k) => k.departmentKey).filter((k) => ABTEILUNGS_SCHLUESSEL_MUSTER.test(k)),
  ].filter((k) => !istNichtErlaubteStelle(k));
  const rang = stellenRang(schluessel);
  return [...new Set(schluessel)].sort((a, b) => (rang.get(a) ?? 0) - (rang.get(b) ?? 0));
}

/** Status einer Aufgabe (F2): entfallen vor erledigt — eine entfallene ist zugleich `isCompleted`. */
export function aufgabenStatus(a: { isCompleted: boolean; entfaelltAm?: Date | string | null }): AufgabenStatus {
  if (a.entfaelltAm != null) return "entfaellt";
  return a.isCompleted ? "erledigt" : "offen";
}

/**
 * Die Aufgaben einer Zeile, Option fuer Option: die gewaehlten in ihrer
 * Reihenfolge, dahinter die uebrigen (entfallene). Seit S24 (A4) je Aufgabe
 * die Ausgaben aus `ausgabenJeAufgabe`, wenn sie dort steht.
 */
function zeilenAufgaben(
  zeile: Pick<UebersichtZeileDaten, "auswahl">,
  verknuepfungen: ReadonlyArray<UebersichtVerknuepfung>,
  aufgabeZu: ReadonlyMap<string, UebersichtAufgabeDaten>,
  ausgabenJeAufgabe: Readonly<Record<string, AusgabenAufgabeAnzeige>> | null = null,
): AusstattungsAufgabeStand[] {
  const rang = (option: string) => {
    const i = zeile.auswahl.indexOf(option);
    return i < 0 ? zeile.auswahl.length : i;
  };
  return verknuepfungen
    .flatMap((v) => {
      const a = aufgabeZu.get(v.checklistItemId);
      if (!a) return [];
      const status = aufgabenStatus(a);
      const ausgaben =
        ausgabenJeAufgabe && Object.prototype.hasOwnProperty.call(ausgabenJeAufgabe, a.id)
          ? ausgabenJeAufgabe[a.id]
          : null;
      return [
        {
          option: v.option,
          checklistItemId: a.id,
          titel: a.title,
          status,
          faelligAm: alsIso(a.dueDate),
          eilt: a.eilt === true,
          erledigtAm: status === "erledigt" ? alsIso(a.completedAt) : null,
          ...(ausgaben ?? {}),
        },
      ];
    })
    .sort((x, y) => rang(x.option) - rang(y.option) || x.option.localeCompare(y.option, "de"));
}

/**
 * Die Aufgaben einer Zeile der Karte so, wie `aenderungPruefen` sie liest:
 * `mitAusgabe` = an der Aufgabe steht ein aktives Stueck (`ausgaben[].aktiv`,
 * AUSGEGEBEN oder VERBLEIBT; A4, G5) – auch an einer noch OFFENEN Aufgabe
 * (G4: vermerkt wird getrennt vom Abhaken). Eine Abbildung fuer die Aktionen
 * der Zeile (`zeilenAktionen`) und den Dialog „Bearbeiten…“
 * (`bearbeitenGrund`), damit beide dieselbe Pruefung rechnen wie der Server.
 */
export function pruefbareAufgaben(
  aufgaben: ReadonlyArray<{ option: string; status: AufgabenStatus; ausgaben?: ReadonlyArray<{ aktiv: boolean }> }>,
): Array<{ option: string; status: AufgabenStatus; mitAusgabe: boolean }> {
  return aufgaben.map((a) => ({
    option: a.option,
    status: a.status,
    mitAusgabe: (a.ausgaben ?? []).some((s) => s.aktiv),
  }));
}

/**
 * Aktionen einer Zeile nach Regel 9 — dieselbe Pruefung wie der Server
 * (`aenderungPruefen`). Seit S24 (A4, G5) sperrt auch eine aktive Ausgabe an
 * einer Aufgabe (`ausgaben[].aktiv`) Streichen und Stellenwechsel; der
 * Sperrgrund nennt dann sie.
 */
function zeilenAktionen(
  zeile: { art: string; gestrichen: boolean },
  aufgaben: ReadonlyArray<{ option: string; status: AufgabenStatus; ausgaben?: ReadonlyArray<{ aktiv: boolean }> }>,
): AusstattungsZeile["aktionen"] {
  if (zeile.gestrichen) return { aendern: false, streichen: false, sperrGrund: MELDUNGEN.POSITION_GESTRICHEN };
  const stand = { art: zeile.art, gestrichenAm: null };
  const pruefbar = pruefbareAufgaben(aufgaben);
  const streichGrund = aenderungPruefen(stand, pruefbar, { streichen: true });
  const streichen = streichGrund === null;
  // Eine Auswahl laesst sich immer ergaenzen, eine Angabe hat keine Aufgabe —
  // beides ist immer „Bearbeiten“; ein Ja/Nein nur, solange Bemerkung oder Stelle aenderbar sind.
  const aendern =
    zeile.art !== "JA_NEIN" ||
    aenderungPruefen(stand, pruefbar, { bemerkung: true }) === null ||
    aenderungPruefen(stand, pruefbar, { stelle: true }) === null;
  return {
    aendern,
    streichen,
    sperrGrund: streichen && aendern ? null : aenderungsGrundText(streichGrund ?? "AUFGABE_ERLEDIGT"),
  };
}

/**
 * S15: Aufgabenstand, Optionen, Aktionen und Vorlauf-Warnung in die Gruppen
 * eintragen (neue Objekte). Ohne Aufgaben und ohne BEARBEITBAR bleiben
 * Aktionen und Warnungen aus.
 */
function karteAnreichern(
  gruppen: AusstattungsGruppe[],
  k: {
    bearbeitbar: boolean;
    zeilen: ReadonlyArray<UebersichtZeileDaten>;
    katalog: ReadonlyArray<KatalogPosition> | null;
    aufgaben: ReadonlyArray<UebersichtAufgabeDaten>;
    verknuepfungen: ReadonlyArray<UebersichtVerknuepfung>;
    vertragsbeginn: Date | string | null;
    jetzt: Date | null;
    /** Seit S24 (A4): Ausgaben je Aufgabe (`ausgabenAnzeigeBauen`); `null` = ohne. */
    ausgabenJeAufgabe?: Readonly<Record<string, AusgabenAufgabeAnzeige>> | null;
  },
): AusstattungsGruppe[] {
  const aufgabeZu = new Map(k.aufgaben.map((a) => [a.id, a]));
  const datenZu = new Map(k.zeilen.map((z) => [z.id, z]));
  const katalogZu = new Map((k.katalog ?? []).map((p) => [p.id, p]));
  const verknuepftZu = new Map<string, UebersichtVerknuepfung[]>();
  for (const v of k.verknuepfungen) verknuepftZu.set(v.ausstattungId, [...(verknuepftZu.get(v.ausstattungId) ?? []), v]);

  return gruppen.map((g) => ({
    ...g,
    zeilen: g.zeilen.map((z) => {
      const daten = datenZu.get(z.id);
      const aufgaben = daten
        ? zeilenAufgaben(daten, verknuepftZu.get(z.id) ?? [], aufgabeZu, k.ausgabenJeAufgabe ?? null)
        : [];
      const katalog = z.positionId ? katalogZu.get(z.positionId) : undefined;
      const optionen =
        z.art === "AUSWAHL"
          ? [
              ...new Set([
                ...(katalog?.art === "AUSWAHL" ? katalog.optionen : []),
                ...z.auswahl,
                ...aufgaben.map((a) => a.option).filter((o) => o !== ""),
              ]),
            ]
          : [];
      const offen = aufgaben.length === 0 || aufgaben.some((a) => a.status === "offen");
      const vorlauf =
        k.bearbeitbar && k.jetzt && !z.gestrichen && z.art !== "ANGABE" && offen
          ? vorlaufWarnung(daten?.relativeDueDays, k.vertragsbeginn, k.jetzt)
          : null;
      return {
        ...z,
        optionen,
        aufgaben,
        vorlaufWarnung: vorlauf,
        aktionen: k.bearbeitbar ? zeilenAktionen(z, aufgaben) : z.aktionen,
      };
    }),
    hinweis: g.hinweis ? hinweisAnreichern(g.hinweis, k.bearbeitbar, aufgabeZu) : null,
  }));
}

function hinweisAnreichern(
  h: AusstattungsHinweis,
  bearbeitbar: boolean,
  aufgabeZu: ReadonlyMap<string, UebersichtAufgabeDaten>,
): AusstattungsHinweis {
  const a = h.checklistItemId ? aufgabeZu.get(h.checklistItemId) : undefined;
  const status = a ? aufgabenStatus(a) : null;
  const grund = bearbeitbar ? hinweisAenderungPruefen({ text: h.text }, status ? { status } : null, { text: true }) : null;
  return {
    ...h,
    status,
    faelligAm: alsIso(a?.dueDate),
    eilt: a?.eilt === true,
    aktionen: bearbeitbar
      ? { aendern: grund === null, sperrGrund: grund ? aenderungsGrundText(grund) : null }
      : h.aktionen,
  };
}

// =============================================
// HR-Karte: Aendern, Streichen, Aenderungsliste (S15; Regel 9, Regel 10, F2, F23)
// =============================================
//
// Nach der Abgabe der Modalitaeten bearbeitet HR die Ausstattung in der Karte
// „Ausstattung & Zugänge“ (Reiter Checkliste). Die Regeln, WANN etwas geht
// (Regel 9: keine erledigte Aufgabe streichen, abwaehlen oder umhaengen) und
// WAS die informierte Stelle davon erfaehrt (Regel 10: Eintraege NEU,
// GEAENDERT, ENTFAELLT in der Aenderungsliste), stehen hier rein; Server
// src/lib/ausstattung-dienst.ts (`ausstattungAktionAusfuehren`), Schreiben in
// fremder Transaktion src/lib/ausstattung-aufgaben.ts.

/**
 * Warum eine Aenderung abgewiesen wird (409, `grund` der Antwort). Seit S24
 * (A4, G5) auch AUSGABE_VORHANDEN: An der Aufgabe haengt eine aktive Ausgabe.
 */
export type AenderungsGrund = "AUFGABE_ERLEDIGT" | "GESTRICHEN" | "OHNE_OFFENE_AUFGABE" | "AUSGABE_VORHANDEN";

/** Text zu einem `AenderungsGrund` (Antwort des Servers und Sperrgrund der Karte). */
export function aenderungsGrundText(grund: AenderungsGrund): string {
  switch (grund) {
    case "AUFGABE_ERLEDIGT":
      return MELDUNGEN.AUFGABE_ERLEDIGT;
    case "GESTRICHEN":
      return MELDUNGEN.POSITION_GESTRICHEN;
    case "OHNE_OFFENE_AUFGABE":
      return MELDUNGEN.OHNE_OFFENE_AUFGABE;
    case "AUSGABE_VORHANDEN":
      return MELDUNGEN.AUSGABE_VORHANDEN;
    default: {
      const unbekannt: never = grund;
      return String(unbekannt);
    }
  }
}

/**
 * Was HR an einer Zeile aendern will (aus der Aktion `aendern` bzw.
 * `streichen` abgeleitet). Fehlende Felder heissen „unveraendert“.
 */
export interface AenderungsWunsch {
  /** Optionen, die wegfallen (Auswahl). */
  abwaehlen?: ReadonlyArray<string>;
  /** Optionen, die dazukommen — auch eine frueher abgewaehlte (F23). */
  hinzu?: ReadonlyArray<string>;
  bemerkung?: boolean;
  angabe?: boolean;
  /** Stellenwechsel. */
  stelle?: boolean;
  /** Die ganze Position streichen. */
  streichen?: boolean;
  /** Faelligkeit der Aufgaben dieser Optionen ("" = ganze Position). */
  faelligkeiten?: ReadonlyArray<string>;
}

/**
 * Regel 9, fuer Auswahl-Positionen ausgelegt (E-A12): Darf HR die Zeile so
 * aendern? `null` = ja, sonst der Grund (409).
 *
 *   - Eine gestrichene Zeile wird nicht mehr bearbeitet (GESTRICHEN); wieder
 *     aufgenommen wird sie ueber „Position hinzufügen…“.
 *   - Streichen und Stellenwechsel nur, wenn KEINE Aufgabe erledigt ist.
 *   - Eine Option mit erledigter Aufgabe laesst sich nicht abwaehlen.
 *   - Bemerkung aendern nur, wenn mindestens eine Aufgabe offen ist oder die
 *     Zeile keine (nicht entfallene) Aufgabe hat — eine Angabe, eine
 *     Position vor dem Anlegen ihrer Aufgaben.
 *   - Eine Angabe hat keine Aufgabe: aendern geht immer.
 *   - Optionen hinzufuegen geht immer (auch eine frueher abgewaehlte, F23).
 *   - Faelligkeit nur an einer offenen Aufgabe: erledigt → AUFGABE_ERLEDIGT,
 *     sonst (entfallen, noch keine) → OHNE_OFFENE_AUFGABE.
 *   - Seit S24 (A4, G5): Haengt an einer Aufgabe eine aktive Ausgabe
 *     (`mitAusgabe`: AUSGEGEBEN oder VERBLEIBT), lassen sich weder die ganze
 *     Position streichen noch ihre Stelle wechseln noch die Option dieser
 *     Aufgabe abwaehlen → AUSGABE_VORHANDEN (nach AUFGABE_ERLEDIGT geprueft:
 *     ist beides der Fall, nennt die Antwort die erledigte Aufgabe). Vor der
 *     Information der Stelle loeschte „Streichen“ die Aufgabe, und die Ausgabe
 *     verloere ihren Bezug.
 *
 * Entfallene Aufgaben zaehlen nie als erledigt.
 */
export function aenderungPruefen(
  zeile: { art: string; gestrichenAm?: Date | string | null },
  aufgaben: ReadonlyArray<{ option: string; status: AufgabenStatus; mitAusgabe?: boolean }>,
  aenderung: AenderungsWunsch,
): AenderungsGrund | null {
  if (zeile.gestrichenAm != null) return "GESTRICHEN";
  const erledigt = aufgaben.some((a) => a.status === "erledigt");
  if ((aenderung.streichen || aenderung.stelle) && erledigt) return "AUFGABE_ERLEDIGT";
  for (const option of aenderung.abwaehlen ?? []) {
    if (aufgaben.some((a) => a.option === option && a.status === "erledigt")) return "AUFGABE_ERLEDIGT";
  }
  const mitAusgabe = aufgaben.some((a) => a.mitAusgabe === true);
  if ((aenderung.streichen || aenderung.stelle) && mitAusgabe) return "AUSGABE_VORHANDEN";
  for (const option of aenderung.abwaehlen ?? []) {
    if (aufgaben.some((a) => a.option === option && a.mitAusgabe === true)) return "AUSGABE_VORHANDEN";
  }
  if (aenderung.bemerkung) {
    const zaehlend = aufgaben.filter((a) => a.status !== "entfaellt");
    if (zaehlend.length > 0 && !zaehlend.some((a) => a.status === "offen")) return "AUFGABE_ERLEDIGT";
  }
  for (const option of aenderung.faelligkeiten ?? []) {
    const status = aufgaben.find((a) => a.option === option)?.status;
    if (status === "erledigt") return "AUFGABE_ERLEDIGT";
    if (status !== "offen") return "OHNE_OFFENE_AUFGABE";
  }
  return null;
}

/**
 * Regel 9 auf Hinweise uebertragen (Feinplan 1.10, „Hinweis-Aufgabe“):
 *
 *   - Ein neuer Hinweis (keine Zeile oder Text "") geht immer.
 *   - Text aendern oder entfernen nur, solange die Hinweis-Aufgabe offen ist
 *     oder es keine gibt; ist sie erledigt, AUFGABE_ERLEDIGT.
 *   - Faelligkeit nur an einer offenen Aufgabe (erledigt → AUFGABE_ERLEDIGT,
 *     keine oder entfallen → OHNE_OFFENE_AUFGABE).
 */
export function hinweisAenderungPruefen(
  hinweis: { text: string | null } | null,
  aufgabe: { status: AufgabenStatus } | null,
  aenderung: { text?: boolean; dueDate?: boolean },
): AenderungsGrund | null {
  if (aenderung.text && hinweis && !leer(hinweis.text) && aufgabe?.status === "erledigt") return "AUFGABE_ERLEDIGT";
  if (aenderung.dueDate) {
    if (aufgabe?.status === "erledigt") return "AUFGABE_ERLEDIGT";
    if (aufgabe?.status !== "offen") return "OHNE_OFFENE_AUFGABE";
  }
  return null;
}

/**
 * Der Inhalt einer Zeile bzw. eines Hinweises, wie ihn die Aenderungsliste
 * vergleicht (Regel 10). Nur Inhaltsfelder: Titel der Aufgaben (also Auswahl
 * und Stelle), Bemerkung, Angabe, Hinweis — nie Faelligkeit, Verknuepfung
 * oder Ausgabevermerk.
 */
export interface AenderungsStand {
  departmentKey: string;
  /** Weitere Stellen, die den Inhalt sehen (nur Angaben: „sichtbar für“). */
  sichtbarFuer?: ReadonlyArray<string>;
  /** Die Aufgaben (Option → Titel); leer bei einer Angabe. */
  aufgaben: ReadonlyArray<{ option: string; titel: string }>;
  /** Titel ohne eigene Aufgabe (Angabe: ihr Label). */
  titel: string;
  bemerkung?: string | null;
  angabe?: string | null;
  hinweis?: string | null;
}

/** Ein Eintrag der Aenderungsliste (`OnboardingAusstattungAenderung`, ohne Zeitstempel). */
export interface AenderungsEintrag {
  departmentKey: string;
  art: AenderungsArt;
  /** Nur Katalog- bzw. Aufgabentitel, nie Freitext. */
  titel: string;
}

/**
 * Der Inhalt einer Zeile fuer `aenderungsEintraege` — `null` fuer eine
 * gestrichene Zeile und eine Angabe ohne Wert (beides ist „nicht da“). Die
 * Titel kommen aus `sollAufgaben` (Momentaufnahme), wie die der Aufgaben.
 */
export function zeilenAenderungsStand(
  z: SollAufgabenZeile & {
    angabeSchluessel?: string | null;
    bemerkung?: string | null;
    angabe?: string | null;
    sichtbarFuer?: ReadonlyArray<string> | null;
  },
): AenderungsStand | null {
  if (z.gestrichenAm != null || istNichtErlaubteStelle(z.departmentKey)) return null;
  if (z.art === "ANGABE") {
    if (leer(z.angabe)) return null;
    return {
      departmentKey: z.departmentKey,
      sichtbarFuer: [...(z.sichtbarFuer ?? [])],
      aufgaben: [],
      titel: istAngabeSchluessel(z.angabeSchluessel) ? ANGABEN_KATALOG[z.angabeSchluessel].label : z.bezeichnung,
      angabe: (z.angabe ?? "").trim(),
    };
  }
  return {
    departmentKey: z.departmentKey,
    aufgaben: sollAufgaben(z).map((a) => ({ option: a.option, titel: a.titel })),
    titel: z.bezeichnung,
    bemerkung: textOderNull(z.bemerkung),
  };
}

/** Der Inhalt eines Hinweises fuer `aenderungsEintraege` — `null` ohne Text (entfernt oder geleert). */
export function hinweisAenderungsStand(departmentKey: string, text: string | null | undefined): AenderungsStand | null {
  if (leer(text) || istNichtErlaubteStelle(departmentKey)) return null;
  return {
    departmentKey,
    aufgaben: [{ option: "", titel: HINWEIS_AUFGABE_TITEL }],
    titel: HINWEIS_AUFGABE_TITEL,
    hinweis: (text ?? "").trim(),
  };
}

/**
 * Regel 10: die Eintraege der Aenderungsliste zu EINER Aenderung — nur fuer
 * Stellen in `informiert` (Link mit `sentAt ?? lastSentAt`); eine Stelle, die
 * noch nichts bekommen hat, erfaehrt alles mit der ersten Mail.
 *
 *   - Aufgabe (Option) nur vorher → ENTFAELLT, nur nachher → NEU.
 *   - Bemerkung, Angabe oder Hinweis geaendert → GEAENDERT fuer jede Aufgabe,
 *     die es vorher und nachher gibt (bei Angaben: das Label).
 *   - Stellenwechsel: ENTFAELLT fuer die alte, NEU fuer die neue Stelle.
 *   - Angaben gehen an die eigene Stelle UND die Stellen unter „sichtbar für“.
 *
 * Eine reine Faelligkeitsaenderung ist kein Inhalt und ergibt nichts. Doppelte
 * gegen noch nicht gesendete Eintraege gleicht `aenderungenSchreibenIn` ab.
 */
export function aenderungsEintraege(
  vorher: AenderungsStand | null,
  nachher: AenderungsStand | null,
  informiert: ReadonlySet<string>,
): AenderungsEintrag[] {
  const stellenVon = (s: AenderungsStand | null): string[] =>
    s ? [...new Set([s.departmentKey, ...(s.sichtbarFuer ?? [])])].filter((k) => !istNichtErlaubteStelle(k)) : [];
  const titelVon = (s: AenderungsStand) => (s.aufgaben.length > 0 ? s.aufgaben : [{ option: "\u0000", titel: s.titel }]);
  const anders = (a: string | null | undefined, b: string | null | undefined) => (textOderNull(a) ?? "") !== (textOderNull(b) ?? "");
  const inhaltGeaendert =
    !!vorher &&
    !!nachher &&
    (anders(vorher.bemerkung, nachher.bemerkung) ||
      anders(vorher.angabe, nachher.angabe) ||
      anders(vorher.hinweis, nachher.hinweis));

  const eintraege: AenderungsEintrag[] = [];
  for (const key of [...new Set([...stellenVon(vorher), ...stellenVon(nachher)])]) {
    if (!informiert.has(key)) continue;
    const v = vorher && stellenVon(vorher).includes(key) ? titelVon(vorher) : [];
    const n = nachher && stellenVon(nachher).includes(key) ? titelVon(nachher) : [];
    for (const a of v) {
      if (!n.some((b) => b.option === a.option)) eintraege.push({ departmentKey: key, art: "ENTFAELLT", titel: a.titel });
    }
    for (const b of n) {
      if (!v.some((a) => a.option === b.option)) eintraege.push({ departmentKey: key, art: "NEU", titel: b.titel });
    }
    if (inhaltGeaendert) {
      for (const b of n) {
        if (v.some((a) => a.option === b.option)) eintraege.push({ departmentKey: key, art: "GEAENDERT", titel: b.titel });
      }
    }
  }
  return eintraege;
}

// =============================================
// Nachtrag senden (S17; Regel 10, F7)
// =============================================
//
// Die Aenderungsliste (`OnboardingAusstattungAenderung`) haelt jede Aenderung
// nach der Information einer Stelle als Eintrag NEU, GEAENDERT oder ENTFAELLT
// fest — auch Folgen, die sich aufheben (`aenderungenSchreibenIn` laesst sie
// bewusst stehen). Was die Stelle davon erfaehrt, rechnet `nachtragListe`
// beim Senden zusammen; `nachtragMailFelder` macht daraus die Mailfelder.
// Gesendet wird mit „Nachtrag senden“ (gleicher Link) und mit JEDER anderen
// Zuweisungsmail an die Stelle (F7); bei SENT werden genau die gelesenen
// Eintraege als gesendet markiert (Versandkern, abteilungsaufgaben-dienst.ts).

/** Ein noch nicht gesendeter Eintrag der Aenderungsliste EINER Stelle. */
export interface NachtragEintrag {
  art: string;
  /** Nur Katalog- bzw. Aufgabentitel, nie Freitext. */
  titel: string;
  erfasstAm?: Date | string | null;
}

/** Keine Aenderung. */
export const LEERER_NACHTRAG: Readonly<NachtragListe> = Object.freeze({ neu: [], geaendert: [], entfaellt: [] });

/** Ein Titel, wie Aenderungsliste und Anhebung (F22) ihn vergleichen: Leerraum zusammengezogen. */
function titelSchluessel(titel: string): string {
  return titel.replace(/\s+/g, " ").trim();
}

/** Eintraege in der Reihenfolge der Erfassung (`erfasstAm`, bei Gleichstand wie uebergeben). */
function nachErfassung<T extends NachtragEintrag>(eintraege: ReadonlyArray<T>): T[] {
  const zeit = (e: NachtragEintrag) => {
    const d = e.erfasstAm == null ? null : e.erfasstAm instanceof Date ? e.erfasstAm : new Date(e.erfasstAm);
    return d && !Number.isNaN(d.getTime()) ? d.getTime() : 0;
  };
  return eintraege
    .map((e, i) => ({ e, i }))
    .sort((a, b) => zeit(a.e) - zeit(b.e) || a.i - b.i)
    .map((x) => x.e);
}

/**
 * F22: die Titel, deren LETZTER noch nicht gesendeter Eintrag EINER Stelle NEU
 * ist — diese Aufgaben bekommt die Stelle mit der naechsten Zuweisungsmail zum
 * ersten Mal (wieder): nach einem Stellenwechsel zu ihr oder nach der
 * Wiederaufnahme (F23). Die Aufgabe selbst ist dann aelter als der letzte
 * Versand an die Stelle; `anzuhebendeAufgaben` hebt sie trotzdem an. Titel
 * normalisiert wie in `nachtragListe`, leere fallen weg.
 */
export function neuGemeldeteTitel(eintraege: ReadonlyArray<NachtragEintrag>): Set<string> {
  const letzte = new Map<string, string>();
  for (const e of nachErfassung(eintraege)) {
    const titel = titelSchluessel(e.titel);
    if (titel) letzte.set(titel, e.art);
  }
  return new Set([...letzte].filter(([, art]) => art === "NEU").map(([titel]) => titel));
}

export type { NachtragListe };

/**
 * Regel 10: die Eintraege EINER Stelle zusammenfassen, je Titel in der
 * Reihenfolge der Erfassung (`erfasstAm`, bei Gleichstand wie uebergeben).
 * Entscheidend sind nur der erste und der letzte Eintrag eines Titels:
 *
 *   - Beginnt die Folge mit NEU, kannte die Stelle den Titel noch nicht;
 *     sonst (GEAENDERT, ENTFAELLT) kannte sie ihn.
 *   - Endet sie mit ENTFAELLT, ist er weg; sonst ist er da.
 *
 *   kannte nicht, jetzt da    → NEU          (NEU, NEU+GEAENDERT)
 *   kannte nicht, jetzt weg   → nichts       (NEU+ENTFAELLT)
 *   kannte, jetzt weg         → ENTFAELLT    (ENTFAELLT, GEAENDERT+ENTFAELLT)
 *   kannte, jetzt da          → GEAENDERT    (GEAENDERT, ENTFAELLT+NEU: wieder
 *                                             aufgenommen, die Stelle soll
 *                                             noch einmal hinsehen)
 *
 * Unbekannte Arten zaehlen wie GEAENDERT. Titel ohne Text fallen weg.
 */
export function nachtragListe(eintraege: ReadonlyArray<NachtragEintrag>): NachtragListe {
  const jeTitel = new Map<string, { erste: string; letzte: string }>();
  for (const e of nachErfassung(eintraege)) {
    const titel = titelSchluessel(e.titel);
    if (!titel) continue;
    const stand = jeTitel.get(titel);
    if (stand) stand.letzte = e.art;
    else jeTitel.set(titel, { erste: e.art, letzte: e.art });
  }

  const liste = { neu: [] as string[], geaendert: [] as string[], entfaellt: [] as string[] };
  for (const [titel, { erste, letzte }] of jeTitel) {
    const kannte = erste !== "NEU";
    const da = letzte !== "ENTFAELLT";
    if (!kannte && da) liste.neu.push(titel);
    else if (kannte && !da) liste.entfaellt.push(titel);
    else if (kannte && da) liste.geaendert.push(titel);
  }
  return liste;
}

/** Beschriftung je Art in Mail und Text („Neu: …“). */
const NACHTRAG_ART_TEXT = { neu: "Neu", geaendert: "Geändert", entfaellt: "Entfällt" } as const;

/**
 * Mailfelder des Nachtrags (Zuweisungsmail an die Stelle):
 *
 *   nachtrag             Merker "ja" bzw. "" (fuer {{#nachtrag}}…{{/nachtrag}};
 *                        renderTemplate kennt nur „nicht leer“)
 *   nachtrag_liste       Klartext, eine flache Zeile je Titel: „Neu: …“,
 *                        „Geändert: …“, „Entfällt: …“ — ROH, nur fuer den
 *                        Textteil (der Mailer maskiert es im HTML trotzdem,
 *                        FREITEXT_VARIABLEN)
 *   nachtrag_liste_html  dieselben Zeilen als fertige, maskierte HTML-Liste
 *
 * Bewusst keine Bloecke je Art: renderTemplate loest nur eine Ebene auf, ein
 * {{#neu}} im {{#nachtrag}} bliebe woertlich in der Mail stehen. Ohne
 * Eintraege sind alle drei "".
 */
export function nachtragMailFelder(liste: Readonly<NachtragListe>): {
  nachtrag: string;
  nachtrag_liste: string;
  nachtrag_liste_html: string;
} {
  const zeilen = (["neu", "geaendert", "entfaellt"] as const).flatMap((art) =>
    liste[art].map((titel) => ({ art: NACHTRAG_ART_TEXT[art], titel: titel.replace(/\s+/g, " ").trim() })),
  );
  if (zeilen.length === 0) return { nachtrag: "", nachtrag_liste: "", nachtrag_liste_html: "" };
  return {
    nachtrag: "ja",
    nachtrag_liste: zeilen.map((z) => `${z.art}: ${z.titel}`).join("\n"),
    nachtrag_liste_html:
      `<ul style="margin:0;padding-left:20px;color:#374151;font-size:14px;line-height:1.6;">` +
      zeilen.map((z) => `<li style="margin:0 0 4px;"><strong>${z.art}:</strong> ${escapeHtml(z.titel)}</li>`).join("") +
      `</ul>`,
  };
}

// =============================================
// Karte und Checkliste im Portal (S16; Mockup 6.3)
// =============================================
//
// Die Karte „Ausstattung & Zugänge“ im Reiter Checkliste
// (src/components/ausstattung/ausstattung-karte.tsx) und der Zusatz unter
// einem Checklistenpunkt (aufgabe-zusatz.tsx) rechnen nichts selbst: Was sie
// ueber die Uebersicht hinaus brauchen — der Stand einer Aufgabe als Text,
// die Optionszeilen einer Auswahl, die Bemerkung je Aufgabe —, steht hier.

/**
 * Der Stand einer Aufgabe als kurzer Text (Karte, Mockup 6.3):
 * „offen · fällig 27.01.2027“ bzw. „offen“ ohne Faelligkeit,
 * „erledigt 20.01.2027“ bzw. „erledigt“, „entfällt“. Datum in deutscher Zeit.
 */
export function aufgabenStandText(a: {
  status: AufgabenStatus;
  faelligAm?: Date | string | null;
  erledigtAm?: Date | string | null;
}): string {
  if (a.status === "entfaellt") return "entfällt";
  if (a.status === "erledigt") {
    const am = formatDatumDE(a.erledigtAm);
    return am ? `erledigt ${am}` : "erledigt";
  }
  const faellig = formatDatumDE(a.faelligAm);
  return faellig ? `offen · fällig ${faellig}` : "offen";
}

/** Eine Zeile unter einer Auswahl-Position der Karte: die Option und ihre Aufgabe (`null` = noch keine). */
export interface OptionsZeile {
  option: string;
  aufgabe: AusstattungsAufgabeStand | null;
}

/**
 * Die Optionen einer Auswahl-Zeile, je Option eine Zeile mit eigenem Stand
 * (Mockup 6.3, E-A12): erst die gewaehlten in ihrer gespeicherten
 * Reihenfolge — mit ihrer Aufgabe, solange das Nachholen sie noch nicht
 * angelegt hat ohne —, dahinter die Aufgaben frueher gewaehlter Optionen
 * (entfallen bzw. erledigt und abgewaehlt). Ja/Nein und Angabe: leer.
 */
export function optionsZeilen(z: Pick<AusstattungsZeile, "art" | "auswahl" | "aufgaben">): OptionsZeile[] {
  if (z.art !== "AUSWAHL") return [];
  const zu = new Map(z.aufgaben.map((a) => [a.option, a]));
  const gewaehlt = z.auswahl.map((option) => ({ option, aufgabe: zu.get(option) ?? null }));
  const frueher = z.aufgaben
    .filter((a) => a.option !== "" && !z.auswahl.includes(a.option))
    .map((a) => ({ option: a.option, aufgabe: a }));
  return [...gewaehlt, ...frueher];
}

/**
 * Die Bemerkung je Aufgabe (`checklistItemId` → Text und Beschriftung nach
 * Herkunft, Regel 8) — fuer den Zusatz unter einem Checklistenpunkt. Die
 * Bemerkung gehoert zur Position; jede ihrer Aufgaben zeigt sie. Quelle ist
 * die Uebersicht, die nur HR_EDIT_ROLES bekommen (Regel 16) — ohne sie ein
 * leeres Objekt, die Checkliste zeigt dann keine Bemerkung.
 */
export function bemerkungJeAufgabe(
  u: Pick<AusstattungsUebersicht, "gruppen"> | null | undefined,
): Record<string, { text: string; label: string }> {
  const ergebnis: Record<string, { text: string; label: string }> = {};
  for (const g of u?.gruppen ?? []) {
    for (const z of g.zeilen) {
      if (!z.bemerkung || leer(z.bemerkung.text)) continue;
      for (const a of z.aufgaben) ergebnis[a.checklistItemId] = { text: z.bemerkung.text, label: z.bemerkung.label };
    }
  }
  return ergebnis;
}

// =============================================
// Aufgaben je Option, Faelligkeit, „Eilt“ (S12; Regel 6, Regel 14, E-A12, F22)
// =============================================
//
// Aus der Wahl werden nach der Abgabe der Modalitaeten Checklisten-Aufgaben
// der zustaendigen Stelle — bei einer Auswahl je gewaehlter Option eine
// (E-A12), zu jedem ausgefuellten Hinweis an eine Stelle eine Aufgabe
// „Hinweis der Führungskraft beachten“ (E-A14). Was fehlt, rechnet
// `fehlendeAusstattungsAufgaben` gegen die vorhandenen Verknuepfungen; das
// Anlegen selbst (Sperren, Schreiben, Aenderungsliste) steht in
// src/lib/ausstattung-aufgaben.ts, das Nachholen im Onboarding-Adapter
// (`onboardingAusstattungNachholenIn`). Die Titel stammen nur aus dem Katalog
// (Momentaufnahme der Zeile), nie aus Freitext — sie stehen im Betreff von
// onboarding-task-completed.
//
// Faelligkeit (Regel 14): Vertragsbeginn + Tage, aber nie vor dem heutigen
// Berliner Kalendertag; liegt die Frist schon zurueck, gilt heute und die
// Aufgabe „eilt“. Das gilt beim Anlegen (`ausstattungsFaelligkeit`) und noch
// einmal beim Versand an die Stelle (F22, `anzuhebendeAufgaben`).

/** Was `sollAufgaben` von einer Zeile (`OnboardingAusstattung`) braucht. */
export interface SollAufgabenZeile {
  departmentKey: string;
  art: string;
  bezeichnung: string;
  /** Grundtitel der Momentaufnahme (ohne Option); leer = „<Bezeichnung> bereitstellen“. */
  aufgabeTitel?: string | null;
  /** Hinweis fuer die Stelle aus dem Katalog — wird `ChecklistItem.description`, nie eine Bemerkung. */
  hinweisStelle?: string | null;
  relativeDueDays?: number | null;
  /** orderIndex der Position beim Speichern. */
  reihenfolge: number;
  auswahl: readonly string[];
  gestrichenAm?: Date | string | null;
}

/** Eine Aufgabe, die zu einer Zeile (bzw. einem Hinweis) gehoert. */
export interface SollAufgabe {
  /** "" = ganze Position (Ja/Nein, Hinweis); sonst die gewaehlte Option. */
  option: string;
  titel: string;
  /** Negativ: Ausstattungsaufgaben stehen vor den Hinweis-Aufgaben und vor allen Vorlagenpunkten. */
  orderIndex: number;
  relativeDueDays: number | null;
  description: string | null;
}

/**
 * Die Aufgaben einer Zeile (E-A12):
 *
 *   - Ja/Nein: genau eine, `option ""`.
 *   - Auswahl: eine je gewaehlter Option, in der gespeicherten Reihenfolge
 *     (Doppelte und leere Optionen fallen weg — die Verknuepfung
 *     `(ausstattungId, option)` ist Primaerschluessel).
 *   - Angabe und gestrichene Zeilen: keine.
 *   - Eine Stelle aus NICHT_ERLAUBTE_STELLEN bekommt keine (Regel 11; die
 *     Pruefungen davor lassen sie gar nicht erst entstehen).
 *
 * `orderIndex = ORDER_BASIS + reihenfolge * 100 + Index der Option`,
 * `description` = Hinweis fuer die Stelle aus dem Katalog.
 */
export function sollAufgaben(zeile: SollAufgabenZeile): SollAufgabe[] {
  if (zeile.gestrichenAm != null || istNichtErlaubteStelle(zeile.departmentKey)) return [];
  if (zeile.art !== "JA_NEIN" && zeile.art !== "AUSWAHL") return [];
  const optionen =
    zeile.art === "AUSWAHL" ? [...new Set(zeile.auswahl.map((o) => o.trim()).filter((o) => o !== ""))] : [""];
  return optionen.map((option, index) => ({
    option,
    titel: aufgabenTitel(zeile, option),
    orderIndex: ORDER_BASIS + zeile.reihenfolge * 100 + index,
    relativeDueDays: zeile.relativeDueDays ?? null,
    description: textOderNull(zeile.hinweisStelle),
  }));
}

/**
 * Die Aufgabe zu einem Hinweis an eine Stelle (E-A14, F20): Titel
 * HINWEIS_AUFGABE_TITEL, ortsneutrale Beschreibung, Faelligkeit
 * HINWEIS_FAELLIG_TAGE vor dem Vertragsbeginn, `orderIndex` =
 * HINWEIS_ORDER_BASIS + Index der Stelle (Reihenfolge der Abteilungskarte
 * ueber `stellen`, die Stellen aller Hinweise des Vorgangs).
 */
export function hinweisSollAufgabe(departmentKey: string, stellen: Iterable<string>): SollAufgabe {
  const rang = stellenRang([...stellen, departmentKey]);
  return {
    option: "",
    titel: HINWEIS_AUFGABE_TITEL,
    orderIndex: HINWEIS_ORDER_BASIS + (rang.get(departmentKey) ?? 0),
    relativeDueDays: HINWEIS_FAELLIG_TAGE,
    description: HINWEIS_AUFGABE_BESCHREIBUNG,
  };
}

/** Der Stand eines Vorgangs, gegen den das Nachholen rechnet (`ausstattungsStandLaden`). */
export interface AusstattungsStand {
  zeilen: ReadonlyArray<SollAufgabenZeile & { id: string }>;
  /** Vorhandene Verknuepfungen Zeile/Option → Aufgabe (auch entfallene). */
  verknuepfungen: ReadonlyArray<{ ausstattungId: string; option: string }>;
  hinweise: ReadonlyArray<{
    departmentKey: string;
    text: string | null;
    checklistItemId: string | null;
    inhaltGeleertAm?: Date | string | null;
  }>;
}

/** Eine Aufgabe, die angelegt werden muss — mit Herkunft und Stelle. */
export type FehlendeAufgabe = SollAufgabe & { departmentKey: string } & (
    | { herkunft: "AUSSTATTUNG"; ausstattungId: string }
    | { herkunft: "HINWEIS"; ausstattungId: null }
  );

/**
 * Was dem Vorgang an Aufgaben fehlt (Regel 6): je Zeile `sollAufgaben` ohne
 * die Optionen, zu denen es schon eine Verknuepfung gibt — auch eine
 * entfallene Aufgabe zaehlt als vorhanden (sie wird wieder geoeffnet, nie
 * doppelt angelegt, F23) —, dazu je Hinweis ohne Aufgabe eine
 * Hinweis-Aufgabe. Ein Hinweis mit leerem Text (entfernt oder geleert) und
 * einer an eine nicht erlaubte Stelle erzeugen keine. Reihenfolge: Zeilen wie
 * gespeichert, dann die Hinweise in der Reihenfolge der Abteilungskarte.
 */
export function fehlendeAusstattungsAufgaben(stand: AusstattungsStand): FehlendeAufgabe[] {
  const vorhanden = new Set(stand.verknuepfungen.map((v) => `${v.ausstattungId}\u0000${v.option}`));
  const fehlend: FehlendeAufgabe[] = [];
  for (const zeile of stand.zeilen) {
    for (const soll of sollAufgaben(zeile)) {
      if (vorhanden.has(`${zeile.id}\u0000${soll.option}`)) continue;
      fehlend.push({ ...soll, departmentKey: zeile.departmentKey, herkunft: "AUSSTATTUNG", ausstattungId: zeile.id });
    }
  }
  const hinweise = stand.hinweise.filter(
    (h) => !leer(h.text) && h.inhaltGeleertAm == null && !istNichtErlaubteStelle(h.departmentKey),
  );
  const stellen = hinweise.map((h) => h.departmentKey);
  const rang = stellenRang(stellen);
  for (const h of [...hinweise].sort((a, b) => (rang.get(a.departmentKey) ?? 0) - (rang.get(b.departmentKey) ?? 0))) {
    if (h.checklistItemId != null) continue;
    fehlend.push({
      ...hinweisSollAufgabe(h.departmentKey, stellen),
      departmentKey: h.departmentKey,
      herkunft: "HINWEIS",
      ausstattungId: null,
    });
  }
  return fehlend;
}

/** Millisekunden eines Zeitpunkts; `null` fuer fehlende oder unlesbare Werte. */
function zeitwert(wert: Date | string | null | undefined): number | null {
  if (wert == null || wert === "") return null;
  const t = (wert instanceof Date ? wert : new Date(wert)).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Faelligkeit einer Ausstattungs- oder Hinweis-Aufgabe beim Anlegen
 * (Regel 14): `max(Vertragsbeginn + tage, heute)` in Berliner Kalendertagen
 * (`faelligkeitAus`, Mitternacht UTC des Kalendertags wie bei allen
 * Faelligkeiten der Checkliste). `eilt`, wenn die regulaere Frist vor heute
 * laege und deshalb auf heute angehoben ist. Ohne Vertragsbeginn oder ohne
 * Tagesangabe `null` — die Aufgabe bleibt ohne Faelligkeit (null heisst nicht 0).
 */
export function ausstattungsFaelligkeit(
  beginn: Date | string | null | undefined,
  tage: number | null | undefined,
  jetzt: Date,
): { dueDate: Date; eilt: boolean } | null {
  const regulaer = faelligkeitAus(beginn, tage);
  const heute = faelligkeitAus(jetzt, 0);
  if (!regulaer || !heute) return null;
  return regulaer.getTime() < heute.getTime() ? { dueDate: heute, eilt: true } : { dueDate: regulaer, eilt: false };
}

/**
 * F22: Welche Aufgaben einer Stelle vor einer Zuweisungsmail (Informieren,
 * Erneut senden, Link erneuern, Nachtrag — nie „Erinnern“) auf heute
 * angehoben werden. Nur offene, nicht entfallene Aufgaben, die die Stelle
 * noch mit keiner Mail bekommen hat, und deren Faelligkeit vor dem heutigen
 * Berliner Kalendertag liegt. „Noch nicht bekommen“ heisst: ohne Versand
 * jede; sonst `createdAt` nach `letzterVersand` ODER ihr Titel steht in
 * `neuGemeldet` (`neuGemeldeteTitel` der offenen Aenderungsliste DIESER
 * Stelle) — eine per Stellenwechsel zugezogene oder nach F23 wieder
 * aufgenommene Aufgabe ist aelter als der letzte Versand, die Stelle bekommt
 * sie trotzdem erst jetzt. Ohne Faelligkeit bleibt eine Aufgabe ohne. Eine
 * schon zugestellte Aufgabe behaelt ihre Frist — sonst setzte „Erneut senden“
 * eine ueberfaellige Aufgabe still auf „heute“ zurueck. Der Aufrufer reicht
 * nur Ausstattungs- und Hinweis-Aufgaben herein (Vorlagenaufgaben werden nie
 * angehoben).
 */
export function anzuhebendeAufgaben(
  aufgaben: ReadonlyArray<{
    id: string;
    dueDate: Date | string | null;
    createdAt: Date | string;
    isCompleted: boolean;
    entfaelltAm?: Date | string | null;
    /** Titel der Aufgabe — nur fuer den Abgleich mit `neuGemeldet`. */
    title?: string | null;
  }>,
  letzterVersand: Date | string | null,
  jetzt: Date,
  neuGemeldet: ReadonlySet<string> = new Set(),
): string[] {
  const heute = faelligkeitAus(jetzt, 0)?.getTime();
  if (heute == null) return [];
  const versand = zeitwert(letzterVersand);
  return aufgaben
    .filter((a) => {
      if (a.isCompleted || a.entfaelltAm != null) return false;
      const faellig = zeitwert(a.dueDate);
      if (faellig == null || faellig >= heute) return false;
      if (versand == null) return true;
      const angelegt = zeitwert(a.createdAt);
      if (angelegt != null && angelegt > versand) return true;
      return a.title != null && neuGemeldet.has(titelSchluessel(a.title));
    })
    .map((a) => a.id);
}

/**
 * Warnung der Karte vor dem Versand (Regel 14): Liegt der Vertragsbeginn
 * naeher als der Vorlauf einer Position (Tage VOR dem Beginn), ist die Frist
 * heute schon verstrichen — „bis Dienstbeginn voraussichtlich nicht verfügbar
 * – Übergangslösung klären“. Ohne Vorlauf (keine Tagesangabe oder eine Frist
 * am bzw. nach dem Beginn) und ohne Vertragsbeginn keine Warnung.
 */
export function vorlaufWarnung(
  tage: number | null | undefined,
  beginn: Date | string | null | undefined,
  jetzt: Date,
): string | null {
  if (tage == null || !Number.isFinite(tage) || tage >= 0) return null;
  const regulaer = faelligkeitAus(beginn, tage);
  const heute = faelligkeitAus(jetzt, 0);
  if (!regulaer || !heute) return null;
  return regulaer.getTime() < heute.getTime() ? MELDUNGEN.VORLAUF_WARNUNG : null;
}

// =============================================
// Sammelmail an HR am Werktag vor Dienstbeginn (S18; E-A18)
// =============================================
//
// Der Lauf „Onboarding-Erinnerungen“ (Abschnitt 4, src/lib/ausstattung-lauf.ts)
// schickt dem HR-Postfach je Vorgang EINE Mail mit allen noch offenen
// Ausstattungs- und Hinweis-Aufgaben — nur Titel und Stelle, nie Bemerkung,
// Angabe oder Hinweistext. Gerechnet wird in Berliner Kalendertagen
// (`faelligkeitAus`, Mitternacht UTC des Kalendertags), Werktage sind Mo–Fr.
// Feiertage kennt die Rechnung nicht (Feinplan, Abschnitt 5, Frage 1): Das
// Fenster reicht deshalb bis EINSCHLIESSLICH Dienstbeginn — ein Feiertag oder
// ein ausgefallener Lauf verschiebt die Mail nur, verhindert sie nicht.

/** Ereignis der Sammelmail (Katalog src/lib/events.ts, ohne Webhook: EVENTS_OHNE_WEBHOOK). */
export const SAMMELMAIL_EVENT = "onboarding-ausstattung-offen";

/** Sonntag und Samstag (`getUTCDay` eines Kalendertags in Mitternacht UTC). */
const WOCHENENDE = new Set([0, 6]);

/**
 * Der letzte Werktag (Mo–Fr) VOR dem Berliner Kalendertag von `datum`, als
 * Mitternacht UTC dieses Tages: Montag → Freitag, Dienstag → Montag, Samstag
 * und Sonntag → Freitag. Feiertage zaehlen als Werktag. Ein unlesbares Datum
 * ergibt ein ungueltiges `Date` (`getTime()` ist NaN).
 */
export function letzterWerktagVor(datum: Date | string): Date {
  const tag = faelligkeitAus(datum, -1);
  if (!tag) return new Date(Number.NaN);
  while (WOCHENENDE.has(tag.getUTCDay())) tag.setUTCDate(tag.getUTCDate() - 1);
  return tag;
}

/**
 * Ist heute der Tag der Sammelmail? Fällig, wenn
 * `letzterWerktagVor(beginn) <= heute <= beginn` (Berliner Kalendertage). Ohne
 * Vertragsbeginn nie. Beispiel: Dienstbeginn Montag → fällig Freitag,
 * Samstag, Sonntag und Montag (der Merker am Vorgang sorgt dafuer, dass sie
 * nur einmal hinausgeht).
 */
export function sammelmailFaellig(vertragsbeginn: Date | string | null | undefined, jetzt: Date): boolean {
  const beginn = faelligkeitAus(vertragsbeginn, 0);
  const heute = faelligkeitAus(jetzt, 0);
  if (!beginn || !heute) return false;
  const ab = letzterWerktagVor(beginn).getTime();
  return Number.isFinite(ab) && ab <= heute.getTime() && heute.getTime() <= beginn.getTime();
}

/**
 * Anzeigename einer Stelle wie in der Karte: am wirksamen Arbeitsort
 * (`empfaengerAufloesen`, Eintrag der Einrichtung vor dem zentralen), HR als
 * „Personalabteilung“, sonst `abteilungLabel` — nie der Rohschluessel einer
 * bekannten Stelle. Ohne Schluessel "". Sammelmail (E-A18) und Rueckfrage beim
 * Abschluss (E-A19) nennen die Stelle so.
 */
export function stelleAmArbeitsort(
  key: string | null | undefined,
  arbeitsortId: string,
  konfigs: ReadonlyArray<AbteilungsKonfig>,
): string {
  if (!key) return "";
  if (key === DEPARTMENT_KEYS.HR) return abteilungLabel(key);
  return empfaengerAufloesen({ departmentKey: key, organizationId: arbeitsortId, konfigs, fuehrungskraft: null })
    .departmentName;
}

/** Titel einer Aufgabe in EINER Zeile (Zeilenumbrueche werden Leerzeichen). */
function einzeiligerTitel(titel: string): string {
  return titel.replace(/\s*(\r\n|\r|\n)\s*/g, " ").trim();
}

/** Eine offene Ausstattungs- oder Hinweis-Aufgabe, soweit die Sammelmail sie liest. */
export interface SammelmailAufgabe {
  title: string;
  /** Zustaendige Stelle (Schluessel). */
  assignee: string | null;
}

/**
 * Die Liste der Sammelmail („Titel – Stelle“ je Zeile, keine Bemerkungen):
 *
 *   anzahl_offen       Zahl der Zeilen
 *   offene_liste       Klartext, eine Zeile je Aufgabe — ROH, nur fuer den
 *                      Textteil (der Mailer maskiert ihn im HTML-Teil
 *                      zusaetzlich, FREITEXT_VARIABLEN)
 *   offene_liste_html  dieselben Zeilen als fertige `<ul>` im Stil der
 *                      Aufgabenliste, maskiert
 *
 * Name der Stelle wie in der Karte: am wirksamen Arbeitsort
 * (`empfaengerAufloesen`, Eintrag der Einrichtung vor dem zentralen), HR als
 * „Personalabteilung“, sonst `abteilungLabel` — nie der Rohschluessel einer
 * bekannten Stelle. Ein Titel ist einzeilig (Zeilenumbrueche werden Leerzeichen).
 * Ohne Aufgabe beide Listen "".
 */
export function sammelmailListenFelder(opts: {
  aufgaben: ReadonlyArray<SammelmailAufgabe>;
  /** Wirksamer Arbeitsort (`onboardingEmpfaengerEinrichtung`). */
  arbeitsortId: string;
  konfigs: ReadonlyArray<AbteilungsKonfig>;
}): { anzahl_offen: number; offene_liste: string; offene_liste_html: string } {
  const zeilen = opts.aufgaben.map((a) => {
    const titel = einzeiligerTitel(a.title);
    const stelle = stelleAmArbeitsort(a.assignee, opts.arbeitsortId, opts.konfigs);
    return stelle ? `${titel} – ${stelle}` : titel;
  });
  if (zeilen.length === 0) return { anzahl_offen: 0, offene_liste: "", offene_liste_html: "" };
  return {
    anzahl_offen: zeilen.length,
    offene_liste: zeilen.map((z) => `- ${z}`).join("\n"),
    offene_liste_html:
      '<ul style="margin:0 0 16px;padding-left:20px;color:#374151;font-size:14px;line-height:1.6;">' +
      zeilen.map((z) => `<li style="margin:0 0 4px;">${escapeHtml(z)}</li>`).join("") +
      "</ul>",
  };
}

// =============================================
// Abschluss mit offener Ausstattung (S19; E-A19)
// =============================================
//
// „Vorgang abschließen“ friert die Aufgaben ein: Nach COMPLETED ist der Link
// der Stelle nur noch lesbar, abhaken geht nicht mehr. Sind noch Ausstattungs-
// oder Hinweis-Aufgaben offen (entfallene zaehlen nicht — sie sind
// `isCompleted`, F2), schliesst PATCH /api/onboarding/[id] deshalb nur mit
// `bestaetigt: true` ab; sonst 409 `{ error, grund: "AUSSTATTUNG_OFFEN", offen }`.
// Gezaehlt wird in der Transaktion NACH dem bedingten Statuswechsel (der den
// Vorgang zuerst sperrt). Die Rueckfrage zeigt die Liste
// (src/components/ausstattung/abschluss-dialog.tsx). Offene Aufgaben aus der
// Checklisten-Vorlage blockieren den Abschluss weiterhin nicht.

/** `grund` der 409 beim Abschluss mit offener Ausstattung. */
export const ABSCHLUSS_AUSSTATTUNG_OFFEN = "AUSSTATTUNG_OFFEN";

/** Eine offene Aufgabe in der Rueckfrage beim Abschluss: Titel und Stelle (wie in der Karte). */
export interface AbschlussOffeneAufgabe {
  titel: string;
  stelle: string;
}

/**
 * Die offenen Ausstattungs- und Hinweis-Aufgaben fuer die 409 beim Abschluss —
 * Titel einzeilig, Stelle wie in Karte und Sammelmail (`stelleAmArbeitsort`).
 * Nie Bemerkung, Angabe oder Hinweistext; Reihenfolge wie uebergeben.
 */
export function abschlussOffeneAufgaben(opts: {
  aufgaben: ReadonlyArray<SammelmailAufgabe>;
  /** Wirksamer Arbeitsort (`onboardingEmpfaengerEinrichtung`). */
  arbeitsortId: string;
  konfigs: ReadonlyArray<AbteilungsKonfig>;
}): AbschlussOffeneAufgabe[] {
  return opts.aufgaben.map((a) => ({
    titel: einzeiligerTitel(a.title),
    stelle: stelleAmArbeitsort(a.assignee, opts.arbeitsortId, opts.konfigs),
  }));
}

/** Text der 409 beim Abschluss: wie viele offen sind und was der Abschluss mit ihnen macht. */
export function abschlussOffenMeldung(anzahl: number): string {
  const was = anzahl === 1 ? "ist noch 1 Aufgabe" : `sind noch ${anzahl} Aufgaben`;
  return `Aus „Ausstattung & Zugänge“ ${was} offen. Nach dem Abschluss können die Stellen sie nicht mehr abhaken – abschließen nur mit Bestätigung.`;
}

// =============================================
// Mail an die Stelle: Angaben und Hinweis (S13; Regel 7)
// =============================================
//
// Was eine Stelle ausser ihren Aufgaben erfaehrt: die Angaben (Art „Angabe“,
// nur aus ANGABEN_KATALOG — E-A13), die ihr selbst gehoeren oder fuer sie
// freigegeben sind (`sichtbarFuer`), und der Hinweis der Fuehrungskraft an
// genau diese Stelle. Beides steht im Infokasten der Zuweisungsmail
// (`{{#angaben_html}}`) und — ab S14 — im Block „Nur für …“ der Link-Seite.
// Erinnerung und Sammelmail tragen es bewusst nicht. Bemerkungen gehoeren
// dagegen zur Aufgabe (Aufgabenliste, `aufgabenlisteMailFelder`).
//
// Datenschutz: Angaben und Hinweis sind Freitext. Im Klartext stehen sie roh
// (der Mailer maskiert `angaben` im HTML-Teil zusaetzlich, FREITEXT_VARIABLEN),
// im HTML-Teil baut `angabenMailFelder` fertige, maskierte Zeilen. Nie im
// Betreff (`betreffOhne` der Onboarding-Abteilungsereignisse).

/** Beschriftung des Hinweises im Infokasten — wie der Titel seiner Aufgabe („Hinweis der Führungskraft beachten“). */
export const HINWEIS_ANGABE_LABEL = "Hinweis der Führungskraft";

/** Eine Zeile von `OnboardingAusstattung`, soweit `angabenFuer` sie liest. */
export interface AngabenZeile {
  departmentKey: string;
  art: string;
  angabeSchluessel?: string | null;
  bezeichnung: string;
  angabe?: string | null;
  sichtbarFuer?: readonly string[] | null;
  reihenfolge?: number | null;
  gestrichenAm?: Date | string | null;
  inhaltGeleertAm?: Date | string | null;
}

/** Ein Hinweis an eine Stelle (`OnboardingStellenHinweis`), soweit `angabenFuer` ihn liest. */
export interface AngabenHinweis {
  departmentKey: string;
  text: string | null;
  inhaltGeleertAm?: Date | string | null;
}

/** Was eine Stelle zu lesen bekommt. */
export interface AngabenFuerStelle {
  angaben: { label: string; wert: string }[];
  hinweis: string | null;
}

/** Ohne Angaben und ohne Hinweis. */
export const KEINE_ANGABEN: Readonly<AngabenFuerStelle> = Object.freeze({ angaben: [], hinweis: null });

/**
 * Angaben und Hinweis fuer EINE Stelle (Regel 7):
 *
 *   - Angaben: Zeilen der Art ANGABE, die der Stelle gehoeren oder deren
 *     `sichtbarFuer` sie nennt — nicht gestrichen, nicht geleert (E-A22), mit
 *     Inhalt. Label aus ANGABEN_KATALOG (sonst die Bezeichnung der
 *     Momentaufnahme). Die eigenen zuerst, dann die freigegebenen, je nach
 *     `reihenfolge` und Bezeichnung.
 *   - Hinweis: nur der an genau diese Stelle, getrimmt; leer oder geleert →
 *     `null`.
 */
export function angabenFuer(
  departmentKey: string,
  zeilen: ReadonlyArray<AngabenZeile>,
  hinweise: ReadonlyArray<AngabenHinweis>,
): AngabenFuerStelle {
  const sichtbar = zeilen
    .filter(
      (z) =>
        z.art === "ANGABE" &&
        z.gestrichenAm == null &&
        z.inhaltGeleertAm == null &&
        !leer(z.angabe) &&
        (z.departmentKey === departmentKey || (z.sichtbarFuer ?? []).includes(departmentKey)),
    )
    .sort(
      (a, b) =>
        Number(b.departmentKey === departmentKey) - Number(a.departmentKey === departmentKey) ||
        (a.reihenfolge ?? 0) - (b.reihenfolge ?? 0) ||
        a.bezeichnung.localeCompare(b.bezeichnung, "de"),
    );
  const hinweis = hinweise.find(
    (h) => h.departmentKey === departmentKey && h.inhaltGeleertAm == null && !leer(h.text),
  );
  return {
    angaben: sichtbar.map((z) => ({
      label: istAngabeSchluessel(z.angabeSchluessel) ? ANGABEN_KATALOG[z.angabeSchluessel].label : z.bezeichnung,
      wert: (z.angabe ?? "").trim(),
    })),
    hinweis: hinweis ? (hinweis.text ?? "").trim() : null,
  };
}

/**
 * Mailfelder der Angaben (Zuweisungsmail an die Stelle):
 *
 *   angaben       Klartext, eine Zeile je Angabe („Unterrichtsfächer: Chemie,
 *                 Sport“), der Hinweis als letzte Zeile (mehrzeilig
 *                 eingerueckt) — ROH, nur fuer den Textteil
 *   angaben_html  dieselben Zeilen als fertige Tabellenzeilen im Stil des
 *                 Infokastens (`<tr><td …>Label / Wert</td></tr>`), Label und
 *                 Wert mit escapeHtml, Zeilenumbrueche als <br>
 *
 * Beide "", wenn es nichts gibt — der Block `{{#angaben_html}}` entfaellt.
 */
export function angabenMailFelder(a: Readonly<AngabenFuerStelle>): { angaben: string; angaben_html: string } {
  const zeilen = [
    ...a.angaben.map((x) => ({ label: x.label, wert: x.wert.trim() })),
    ...(a.hinweis && a.hinweis.trim() ? [{ label: HINWEIS_ANGABE_LABEL, wert: a.hinweis.trim() }] : []),
  ].filter((z) => z.wert !== "");
  if (zeilen.length === 0) return { angaben: "", angaben_html: "" };
  const umbruch = /\r\n|\r|\n/g;
  return {
    angaben: zeilen.map((z) => `${z.label}: ${z.wert.replace(umbruch, "\n  ")}`).join("\n"),
    angaben_html: zeilen
      .map(
        (z) =>
          `<tr><td style="padding:0 16px 16px;">` +
          `<p style="margin:0 0 4px;color:#6b7280;font-size:12px;">${escapeHtml(z.label)}</p>` +
          `<p style="margin:0;color:#374151;font-size:14px;">${escapeHtml(z.wert).replace(umbruch, "<br>")}</p>` +
          `</td></tr>`,
      )
      .join(""),
  };
}

// =============================================
// Fortschritt ohne Entfallene, Vorschau im Dialog (S14; F2, Mockups 6.4 und 6.5)
// =============================================
//
// Eine von HR gestrichene Aufgabe bleibt als Zeile stehen, „entfällt“ und gilt
// als erledigt (`isCompleted`, F2) — damit sie keine Erinnerung ausloest und
// keinen Link offen haelt. Gezaehlt wird sie trotzdem NIRGENDS: weder im
// Zaehler noch im Nenner. Sonst stuende „6/6 erledigt“, obwohl zwei davon
// gestrichen sind, und Link-Seite, Kopfzeile, Balken und Reiter zeigten
// verschiedene Zahlen. Deshalb gibt es genau EINE Rechnung.

/** Fortschritt einer Checkliste (bzw. der Aufgaben einer Stelle). */
export interface ChecklistFortschritt {
  /** Aufgaben ohne die entfallenen. */
  gesamt: number;
  /** Davon erledigt (entfallene nie). */
  erledigt: number;
  /** Ganze Prozent; ohne zaehlende Aufgabe 0. */
  prozent: number;
  /** Alles erledigt — nur, wenn es mindestens eine zaehlende Aufgabe gibt. */
  alleErledigt: boolean;
}

/**
 * Der Fortschritt OHNE entfallene Aufgaben (F2) — die einzige Rechnung fuer
 * Link-Seite, Portal, Stepper, PDF und `progress` des Portal-PATCH. Entfallen
 * ist eine Aufgabe mit `entfaelltAm` (Datenbankzeile) oder `entfaellt: true`
 * (Antwort der Link-Seite). Nur entfallene Aufgaben: `gesamt 0`,
 * `alleErledigt false` — eine Stelle, deren Aufgaben alle gestrichen sind,
 * hat nichts „erledigt“.
 */
export function checklistFortschritt(
  items: ReadonlyArray<{ isCompleted: boolean; entfaelltAm?: Date | string | null; entfaellt?: boolean }>,
): ChecklistFortschritt {
  const zaehlend = items.filter((i) => i.entfaelltAm == null && i.entfaellt !== true);
  const gesamt = zaehlend.length;
  const erledigt = zaehlend.filter((i) => i.isCompleted).length;
  return {
    gesamt,
    erledigt,
    prozent: gesamt > 0 ? Math.round((erledigt / gesamt) * 100) : 0,
    alleErledigt: gesamt > 0 && erledigt === gesamt,
  };
}

/**
 * Die Zeile unter einer Stelle im Dialog „Abteilungen informieren“
 * (Mockup 6.4): „davon 5 aus „Ausstattung & Zugänge“, 2 mit Bemerkung“.
 * Gezaehlt sind die offenen Aufgaben, die die Mail tragen wird
 * (`ZeilenVorschau.ausstattung`/`mitBemerkung` aus `abteilungsZeilenBauen`),
 * nicht nur die drei sichtbaren. Ohne Ausstattungsaufgabe `null` — die Zeile
 * entfaellt.
 */
export function ausstattungVorschauSatz(
  vorschau: { ausstattung?: number | null; mitBemerkung?: number | null } | null | undefined,
): string | null {
  const anzahl = vorschau?.ausstattung ?? 0;
  if (anzahl <= 0) return null;
  const bemerkung = vorschau?.mitBemerkung ?? 0;
  return `davon ${anzahl} aus „${AUSSTATTUNG_KATEGORIE}“${bemerkung > 0 ? `, ${bemerkung} mit Bemerkung` : ""}`;
}

// =============================================
// Standardkatalog: Vorschlaege fuer den Anfangsbestand (Plan, Abschnitt 5;
// E-A39; Feinplan „Standardkatalog (14.10.2026)“)
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
  /**
   * Eingeschaltet im Standardkatalog? Liest NUR die einmalige Migration
   * `AUSSTATTUNG_STANDARDKATALOG_V1` (prisma/seed-check.js, als JS-Kopie), die
   * einen LEEREN Katalog mit allen Vorschlaegen fuellt. Kein Katalog- und kein
   * Datenbankfeld: „Vorschläge übernehmen“ legt trotzdem alles aus (Regel 1),
   * und `katalogWerte` laesst das Feld fallen.
   */
  standardAktiv: boolean;
}

type VorschlagTeil = Pick<Vorschlag, "vorschlagSchluessel" | "departmentKey" | "art" | "bezeichnung" | "standardAktiv"> &
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

function angabeVorschlag(teil: {
  vorschlagSchluessel: string;
  departmentKey: string;
  angabeSchluessel: AngabeSchluessel;
  standardAktiv: boolean;
  sichtbarFuer?: string[];
  einrichtungsarten?: string[];
}): Omit<Vorschlag, "orderIndex"> {
  return vorschlag({
    ...teil,
    art: "ANGABE",
    bezeichnung: ANGABEN_KATALOG[teil.angabeSchluessel].label,
    sichtbarFuer: [...(teil.sichtbarFuer ?? [])],
    einrichtungsarten: [...(teil.einrichtungsarten ?? [])],
  });
}

/** Einrichtungsarten der Schulen (Schluessel, Lehrerzimmer, Schulverwaltung, iPad). */
const SCHULEN: ReadonlyArray<Einrichtungsart> = ["GYMNASIUM", "GESAMTSCHULE", "GRUNDSCHULE", "BERUFSKOLLEG"];
/** Einrichtungsarten mit Bueros statt Klassenraeumen (Verwaltung, Gesellschaften, Vereine). */
const BUEROS: ReadonlyArray<Einrichtungsart> = ["VERWALTUNG", "GMBH", "VEREIN"];
/**
 * Personengruppen mit eigenem Arbeitsplatz (Rechner, Telefon). Minijob und
 * Ehrenamt sehen diese Positionen nicht (Entscheidung 14.10.2026).
 */
const MIT_ARBEITSPLATZ: ReadonlyArray<Personengruppe> = ["STANDARD", "BEAMTE", "ERZIEHER"];

/** Hinweis an die Gebaeudewirtschaft an jeder Schluessel-Position. */
const SCHLUESSEL_HINWEIS_STELLE = "Schlüssel gegen Unterschrift ausgeben und die Schlüsselnummer notieren.";
/** Hinweis an die Fuehrungskraft unter den Schluesseln von Kita und Buero (der Raum steht in der Angabe). */
const SCHLUESSEL_WEITERE_RAEUME = "Weitere Räume bitte in der Bemerkung nennen.";
/** E-A28: Zugaenge erst nach der Verpflichtung auf Vertraulichkeit. */
const ZUGANG_HINWEIS_STELLE = "Erst nach Verpflichtung auf Vertraulichkeit freischalten.";

/**
 * Der Standardkatalog — die EINZIGE Quelle fuer zwei Wege:
 *
 *   - „Vorschläge übernehmen“ (Einstellungen → Ausstattung & Zugänge) legt
 *     fehlende Vorschlaege mit diesen Standardwerten an (Vorauswahl,
 *     Faelligkeit, Hinweise, Einrichtungsarten), aber wie jede neue Position
 *     AUSGESCHALTET (Regel 1). Die Verwaltung prueft und schaltet ein.
 *   - Die einmalige Migration `AUSSTATTUNG_STANDARDKATALOG_V1`
 *     (prisma/seed-check.js) fuellt einen LEEREN Katalog nach dem Deploy mit
 *     allen Vorschlaegen und schaltet die mit `standardAktiv` ein (Wunsch des
 *     Projektverantwortlichen nach der Zustimmung von DSB und MAV am
 *     14.10.2026: Schluessel, Telefon, E-Mail, Rechner gehoeren zu jeder
 *     Einstellung). Im Container gibt es kein tsx — dort steht eine JS-Kopie,
 *     die ausstattung-standardkatalog.test.ts Feld fuer Feld gegen diese
 *     Liste haelt. Wer hier etwas aendert, aendert die Kopie mit.
 *
 * Alle zentral. Faelligkeiten in Tagen relativ zum Vertragsbeginn (Zugaenge
 * eine Woche vorher, Geraete fuenf Tage, Schluessel, Fach und Tuerschild drei).
 * Zugang, Schluessel und die uebrigen Positionen gelten fuer alle
 * Personengruppen (Wunsch: „jeder“); nur Rechner und Telefon sind auf
 * Angestellte, Beamte und Kita-Personal beschraenkt (`MIT_ARBEITSPLATZ`,
 * Entscheidung 14.10.2026) — Minijob und Ehrenamt sehen sie gar nicht. Die
 * Fuehrungskraft waehlt ab, HR kann die Gruppen im Betrieb aendern.
 * Bewusst OHNE A4-Werte (G27): Die Vorgaben fuer „Beim Austritt“ stehen
 * getrennt als RUECKGABE_VORGABEN in ausgaben.ts und kommen nur ueber
 * „Rückgabe-Vorgaben übernehmen …“ an die Positionen — vorher muessen aktive
 * Offboarding-Webhooks auf dem Server geprueft sein (Regel 29).
 *
 * Drei Schluessel-Positionen fuer FACILITY (Schulen, Kita, Bueros) statt einer:
 * Die Raeume unterscheiden sich, und je Arbeitsort gilt genau eine (disjunkte
 * Einrichtungsarten). Was nicht zum Standard gehoert (BYOD, Transponder,
 * Parkplatz, Spind, Kopierkarte, Dienstausweis, Durchwahl als Angabe), steht
 * ausgeschaltet bereit.
 */
export const VORSCHLAEGE: ReadonlyArray<Readonly<Vorschlag>> = [
  // ---- IT ----
  vorschlag({
    vorschlagSchluessel: "IT_ZUGAENGE",
    departmentKey: "IT",
    art: "AUSWAHL",
    bezeichnung: "Zugänge",
    optionen: ["Benutzerkonto und Dienst-E-Mail", "Drucker-PIN", "WLAN"],
    vorausgewaehlteOptionen: ["Benutzerkonto und Dienst-E-Mail"],
    aufgabeTitel: "Zugang einrichten",
    defaultDueDays: -7,
    hinweisStelle: ZUGANG_HINWEIS_STELLE,
    standardAktiv: true,
  }),
  vorschlag({
    vorschlagSchluessel: "IT_ZUGAENGE_SCHULE",
    departmentKey: "IT",
    art: "AUSWAHL",
    bezeichnung: "Schulische Zugänge",
    einrichtungsarten: [...SCHULEN],
    optionen: ["Schulverwaltung", "WebUntis", "Schulportal"],
    aufgabeTitel: "Zugang einrichten",
    defaultDueDays: -7,
    hinweisStelle: ZUGANG_HINWEIS_STELLE,
    standardAktiv: true,
  }),
  vorschlag({
    vorschlagSchluessel: "IT_LAPTOP",
    departmentKey: "IT",
    art: "JA_NEIN",
    // „Endgerät“ steht mit Absicht im Namen: Nur so erkennt `aehnlicheVorlagenpunkte`
    // (Wort fuer Wort) den Vorlagenpunkt „Arbeitsplatz/Endgerät einrichten,
    // Zugangsdaten übergeben“ der IT und warnt vor der doppelten Aufgabe.
    bezeichnung: "Dienstrechner/Endgerät (Laptop/PC)",
    vorausgewaehlt: true,
    personengruppen: [...MIT_ARBEITSPLATZ],
    defaultDueDays: -5,
    bemerkungPlatzhalter: "z. B. Laptop statt PC, zweiter Bildschirm",
    hinweisStelle: "Gerät mit Standardsoftware einrichten und am ersten Arbeitstag übergeben.",
    standardAktiv: true,
  }),
  vorschlag({
    vorschlagSchluessel: "IT_TELEFON",
    departmentKey: "IT",
    art: "JA_NEIN",
    bezeichnung: "Telefon mit Durchwahl",
    vorausgewaehlt: true,
    personengruppen: [...MIT_ARBEITSPLATZ],
    defaultDueDays: -5,
    bemerkungPlatzhalter: "z. B. gewünschte Durchwahl",
    hinweisStelle: "Durchwahl einrichten und dem Sekretariat für die Telefonliste mitteilen.",
    standardAktiv: true,
  }),
  vorschlag({
    vorschlagSchluessel: "IT_IPAD",
    departmentKey: "IT",
    art: "JA_NEIN",
    bezeichnung: "Dienst-iPad (Lernmittel)",
    einrichtungsarten: [...SCHULEN],
    defaultDueDays: -5,
    standardAktiv: true,
  }),
  vorschlag({
    vorschlagSchluessel: "IT_MOBIL",
    departmentKey: "IT",
    art: "JA_NEIN",
    bezeichnung: "Diensthandy",
    defaultDueDays: -5,
    standardAktiv: true,
  }),
  vorschlag({
    vorschlagSchluessel: "IT_BYOD",
    departmentKey: "IT",
    art: "JA_NEIN",
    bezeichnung: "Private Endgeräte (BYOD) freischalten",
    // Sonst hiesse die Aufgabe „… freischalten bereitstellen“.
    aufgabeTitel: "Private Endgeräte (BYOD) freischalten",
    standardAktiv: false,
  }),
  // Die Durchwahl fragt der Standard ueber den Platzhalter der Telefon-Position
  // ab; die Angabe bleibt fuer Einrichtungen, die sie getrennt sehen wollen.
  angabeVorschlag({
    vorschlagSchluessel: "IT_DURCHWAHL",
    departmentKey: "IT",
    angabeSchluessel: "DURCHWAHL",
    standardAktiv: false,
  }),
  // ---- Gebaeudewirtschaft ----
  vorschlag({
    vorschlagSchluessel: "FACILITY_SCHLUESSEL",
    departmentKey: "FACILITY",
    art: "AUSWAHL",
    bezeichnung: "Schlüssel",
    einrichtungsarten: [...SCHULEN],
    optionen: ["Haupteingang", "Lehrerzimmer", "Klassenraum", "Fachraum", "Sporthalle"],
    vorausgewaehlteOptionen: ["Haupteingang", "Lehrerzimmer"],
    aufgabeTitel: "Schlüssel ausgeben",
    defaultDueDays: -3,
    // Steht im Formular unter der Position — richtet sich deshalb an die Fuehrungskraft.
    hinweisFuehrungskraft: "Welche Klassen- und Fachräume? Bitte in der Bemerkung nennen.",
    bemerkungPlatzhalter: "z. B. Raum 2.14, Chemieraum",
    hinweisStelle: SCHLUESSEL_HINWEIS_STELLE,
    // Die Pflegeanweisung gehoert in die Vorschau, nicht ins Formular.
    pflegeHinweis: "Räume einer Einrichtung bitte als eigene Position dieser Einrichtung anlegen.",
    standardAktiv: true,
  }),
  vorschlag({
    vorschlagSchluessel: "FACILITY_SCHLUESSEL_KITA",
    departmentKey: "FACILITY",
    art: "AUSWAHL",
    bezeichnung: "Schlüssel",
    einrichtungsarten: ["KITA"],
    optionen: ["Haupteingang", "Gruppenraum", "Personalraum"],
    vorausgewaehlteOptionen: ["Haupteingang", "Gruppenraum"],
    aufgabeTitel: "Schlüssel ausgeben",
    defaultDueDays: -3,
    // Den Raum selbst (Gruppenraum, Büro) fragt die Angabe „Raum des
    // Arbeitsplatzes“ darunter ab, die auch IT und Sekretariat sehen — die
    // Bemerkung bleibt fuer weitere Raeume, sonst fragte das Formular zweimal.
    hinweisFuehrungskraft: SCHLUESSEL_WEITERE_RAEUME,
    hinweisStelle: SCHLUESSEL_HINWEIS_STELLE,
    standardAktiv: true,
  }),
  vorschlag({
    vorschlagSchluessel: "FACILITY_SCHLUESSEL_BUERO",
    departmentKey: "FACILITY",
    art: "AUSWAHL",
    bezeichnung: "Schlüssel",
    einrichtungsarten: [...BUEROS],
    optionen: ["Haupteingang", "Büro"],
    vorausgewaehlteOptionen: ["Haupteingang", "Büro"],
    aufgabeTitel: "Schlüssel ausgeben",
    defaultDueDays: -3,
    hinweisFuehrungskraft: SCHLUESSEL_WEITERE_RAEUME,
    bemerkungPlatzhalter: "z. B. Archiv, Lager",
    hinweisStelle: SCHLUESSEL_HINWEIS_STELLE,
    standardAktiv: true,
  }),
  angabeVorschlag({
    vorschlagSchluessel: "FACILITY_UNTERRICHTSFAECHER",
    departmentKey: "FACILITY",
    angabeSchluessel: "UNTERRICHTSFAECHER",
    sichtbarFuer: ["IT"],
    einrichtungsarten: [...SCHULEN],
    standardAktiv: true,
  }),
  angabeVorschlag({
    vorschlagSchluessel: "FACILITY_ARBEITSPLATZ",
    departmentKey: "FACILITY",
    angabeSchluessel: "ARBEITSPLATZ_RAUM",
    // IT richtet Rechner und Telefon am Platz ein, das Sekretariat fuehrt Telefonliste und Tuerschild.
    sichtbarFuer: ["IT", "VERWALTUNG"],
    standardAktiv: true,
  }),
  vorschlag({
    vorschlagSchluessel: "FACILITY_TRANSPONDER",
    departmentKey: "FACILITY",
    art: "JA_NEIN",
    bezeichnung: "Transponder/Chip",
    standardAktiv: false,
  }),
  vorschlag({
    vorschlagSchluessel: "FACILITY_PARKPLATZ",
    departmentKey: "FACILITY",
    art: "JA_NEIN",
    bezeichnung: "Parkplatz",
    standardAktiv: false,
  }),
  vorschlag({
    vorschlagSchluessel: "FACILITY_SPIND",
    departmentKey: "FACILITY",
    art: "JA_NEIN",
    bezeichnung: "Spind",
    standardAktiv: false,
  }),
  // ---- Verwaltung / Sekretariat ----
  vorschlag({
    vorschlagSchluessel: "VERWALTUNG_FACH",
    departmentKey: "VERWALTUNG",
    art: "JA_NEIN",
    bezeichnung: "Fach im Lehrerzimmer",
    einrichtungsarten: [...SCHULEN],
    vorausgewaehlt: true,
    defaultDueDays: -3,
    standardAktiv: true,
  }),
  vorschlag({
    vorschlagSchluessel: "VERWALTUNG_TUERSCHILD",
    departmentKey: "VERWALTUNG",
    art: "JA_NEIN",
    bezeichnung: "Türschild",
    defaultDueDays: -3,
    standardAktiv: true,
  }),
  vorschlag({
    vorschlagSchluessel: "VERWALTUNG_KOPIERKARTE",
    departmentKey: "VERWALTUNG",
    art: "JA_NEIN",
    bezeichnung: "Kopierkarte",
    standardAktiv: false,
  }),
  vorschlag({
    vorschlagSchluessel: "VERWALTUNG_DIENSTAUSWEIS",
    departmentKey: "VERWALTUNG",
    art: "JA_NEIN",
    bezeichnung: "Dienstausweis",
    standardAktiv: false,
  }),
].map((v, i) => ({ ...v, orderIndex: i * 10 }));

// =============================================
// Katalogseite: Felder, Aenderungen, Stellen, Warnungen (Feinplan S3)
// =============================================

/**
 * Die Felder einer Katalogposition, die Anlegen, Aendern und Protokoll kennen —
 * die Positivliste der Einstellungsrouten. Seit S23 (A4, G8) gehoeren die
 * Felder „Beim Austritt“ (`beiAustritt`, `rueckgabeKategorie`,
 * `ausgabeKennung`) dazu: Wer sie im Positionsdialog setzt, schaltet A4 fuer
 * die Position ein (G27). Bewusst NICHT dabei: `vorschlagSchluessel` (schreibt
 * nur „Vorschläge übernehmen“), dazu ID und Zeitstempel. Deckt sich mit den
 * Feldern von `katalogPositionSchema` plus `isActive`
 * (ausstattung-validierung.test.ts haelt das).
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
  "beiAustritt",
  "rueckgabeKategorie",
  "ausgabeKennung",
  "orderIndex",
  "isActive",
] as const satisfies ReadonlyArray<keyof KatalogPosition>;

export type KatalogFeld = (typeof KATALOG_FELDER)[number];
export type KatalogWerte = Pick<KatalogPosition, KatalogFeld>;
/** Ein Wert der Positivliste; ein fehlendes A4-Feld zaehlt als `null`. */
export type KatalogWert = Exclude<KatalogWerte[KatalogFeld], undefined>;

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
 * `vorschlagSchluessel`); das bleibt draussen. Ein fehlendes A4-Feld (etwa
 * an einem Vorschlag) wird `null` — so steht es immer in Protokoll und
 * Schreibdaten.
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
    beiAustritt: p.beiAustritt ?? null,
    rueckgabeKategorie: p.rueckgabeKategorie ?? null,
    ausgabeKennung: p.ausgabeKennung ?? null,
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
    aenderungen[feld] = { von: bisher[feld] ?? null, nach: neu };
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

/**
 * Rueckmeldung von „Vorschläge übernehmen“ (fertiger Satz fuer die
 * Katalogseite). Die Vorschlaege tragen seit dem Standardkatalog (14.10.2026)
 * Vorauswahl und Faelligkeit — zu pruefen bleibt, ob sie fuer die Einrichtungen
 * passen; eingeschaltet wird von Hand (Regel 1).
 */
export function vorschlaegeMeldung(angelegt: number, vorhanden: number): string {
  if (angelegt <= 0) return MELDUNGEN.VORSCHLAEGE_ALLE_VORHANDEN;
  const wieviele = angelegt === 1 ? "1 Vorschlag übernommen" : `${angelegt} Vorschläge übernommen`;
  const schon =
    vorhanden <= 0 ? "" : vorhanden === 1 ? " 1 stand schon im Katalog." : ` ${vorhanden} standen schon im Katalog.`;
  return `${wieviele} – ausgeschaltet, mit Standardwerten. Bitte Vorauswahl und Fälligkeiten prüfen und einschalten, was passt.${schon}`;
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
    // A4 (S23): nur, wenn festgelegt — „nicht festgelegt“ ist der Normalfall vor dem Einschalten.
    const austritt = beiAustrittText(p);
    if (austritt) d.push(`beim Austritt: ${austritt}`);
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
    /**
     * Einschraenkung auf Einrichtungsarten („nur Kita“), sonst null — sonst
     * stuenden die drei Schluessel-Positionen gleichlautend untereinander. Bei
     * einem Eintrag, der schon im Katalog steht, die GESPEICHERTEN Arten (der
     * Aufruf aendert ihn nicht; ein Altbestand ohne Einschraenkung gilt ueberall).
     */
    gilt: string | null;
  }[];
}

/**
 * Was „Vorschläge übernehmen“ anlegen wuerde, nach Stelle gruppiert, mit
 * Markierung, was schon im Katalog steht (`vorschlagSchluessel` einer
 * Position — auch wenn sie inzwischen geaendert ist; geloeschte legt der
 * Aufruf wieder an). `fehlen` = so viele legt der Aufruf an; 0 = nichts zu tun.
 */
export function vorschlaegeVorschau(
  positionen: ReadonlyArray<{ vorschlagSchluessel?: string | null; einrichtungsarten?: ReadonlyArray<string> }>,
  stellen: ReadonlyArray<KatalogStelle>,
): { gruppen: VorschlagGruppe[]; fehlen: number } {
  // Gespeicherte Einrichtungsarten je Vorschlagsschluessel (vorschlagSchluessel ist @unique).
  const gespeichert = new Map<string, ReadonlyArray<string>>();
  for (const p of positionen) {
    if (p.vorschlagSchluessel) gespeichert.set(p.vorschlagSchluessel, p.einrichtungsarten ?? []);
  }
  const vorhanden = new Set(gespeichert.keys());
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
    const arten = da ? (gespeichert.get(v.vorschlagSchluessel) ?? []) : v.einrichtungsarten;
    gruppe.eintraege.push({
      vorschlagSchluessel: v.vorschlagSchluessel,
      bezeichnung: v.bezeichnung,
      artName: istAusstattungsArt(v.art) ? ART_NAMEN[v.art] : v.art,
      vorhanden: da,
      hinweis: v.pflegeHinweis ?? null,
      gilt: arten.length > 0 ? `nur ${arten.map((a) => wertName(EINRICHTUNGSARTEN, a)).join(", ")}` : null,
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

// =============================================
// Loeschfrist der Freitexte (S20; E-A22)
// =============================================
//
// Onboarding-Vorgaenge werden nie geloescht. Bemerkungen, Angaben und
// Hinweise sind aber Freitext der Fuehrungskraft bzw. von HR und gehoeren
// nicht dauerhaft in die Datenbank: Der Lauf „Aufbewahrung erzeugter
// Dokumente“ leert sie FREITEXT_AUFBEWAHRUNG_MONATE nach Abschluss
// (`completedAt`) oder Abbruch (`expiredAt`, F12) — die Zeilen bleiben als
// Nachweis stehen (`inhaltGeleertAm`, src/lib/ausstattung-lauf.ts). Die Frist
// bestaetigt der DSB (A0).

/**
 * Stichtag der Loeschfrist: Beginn des Berliner Kalendertags, der
 * FREITEXT_AUFBEWAHRUNG_MONATE vor dem heutigen liegt. Was davor
 * abgeschlossen bzw. abgebrochen wurde (`< grenze`), wird geleert.
 *
 * Kalendarisch, nicht in Tagen: Monate mit Monatsende gekappt (31.08. →
 * 28.02., im Schaltjahr 29.02.; `monateSpaeter`). Der Tag ist der Berliner
 * Kalendertag von `jetzt` (der Container laeuft in UTC — am 01.09. um 0:30 Uhr
 * deutscher Zeit ist es dort noch der 31.08.), die Grenze dessen Mitternacht
 * in deutscher Zeit (`beginnDesBerlinerTages`). So bleibt jeder Freitext
 * mindestens sechs volle Monate stehen, und ein Lauf am selben Tag rechnet
 * immer dieselbe Grenze.
 */
export function freitextGrenze(jetzt: Date): Date {
  return beginnDesBerlinerTages(monateSpaeter(heuteInBerlin(jetzt), -FREITEXT_AUFBEWAHRUNG_MONATE));
}

// =============================================
// Brief-Platzhalter {ausstattung_liste} (S20; E-A25)
// =============================================
//
// Die neue Person erfaehrt vor Dienstbeginn, was fuer sie bereitsteht — ueber
// eine Brief-Vorlage („Was Sie am ersten Tag erhalten“), die HR selbst unter
// Brief-Vorlagen anlegt und im Dokumentenpaket verschickt; keine neue Mail.
// Der Platzhalter nennt nur Katalogtitel und gewaehlte Optionen: NIE
// Bemerkungen, Angaben oder Hinweise (Freitext, Regel 16) und nie Erstzugaenge
// (Passwoerter gehen nie ueber das Portal).

/** Eine Zeile von `OnboardingAusstattung`, soweit `ausstattungListe` sie liest. */
export interface BriefListenZeile {
  departmentKey: string;
  art: string;
  bezeichnung: string;
  auswahl: ReadonlyArray<string>;
  reihenfolge: number;
  gestrichenAm?: Date | string | null;
}

/**
 * Der Wert von `{ausstattung_liste}`: je gewaehlter, nicht gestrichener
 * Position eine Zeile — „Bezeichnung“ (Ja/Nein) bzw. „Bezeichnung: Option,
 * Option“ (Auswahl, in der gewaehlten Reihenfolge). Angaben fehlen (sie sind
 * Freitext fuer die Stellen), eine Auswahl ohne Option ebenso. Reihenfolge wie
 * im Formular: nach Stelle, dann Katalogreihenfolge, dann Bezeichnung.
 * Zeilenumbrueche im Titel werden zu Leerzeichen (eine Zeile je Position —
 * die Brief-Vorlage setzt die Umbrueche, `linebreaks: true`). Nichts gewaehlt:
 * "" (der Resolver setzt den Platzhalter dann nicht).
 */
export function ausstattungListe(zeilen: ReadonlyArray<BriefListenZeile>): string {
  const eintraege = zeilen.flatMap((z) => {
    if (z.gestrichenAm != null || leer(z.bezeichnung)) return [];
    const bezeichnung = einzeiligerTitel(z.bezeichnung);
    if (z.art === "JA_NEIN") return [{ ...z, text: bezeichnung }];
    if (z.art !== "AUSWAHL") return [];
    const optionen = [...new Set(z.auswahl.map(einzeiligerTitel).filter((o) => o !== ""))];
    return optionen.length > 0 ? [{ ...z, text: `${bezeichnung}: ${optionen.join(", ")}` }] : [];
  });
  return nachStelleSortiert(eintraege.map((e) => ({ ...e, orderIndex: e.reihenfolge })))
    .map((e) => e.text)
    .join("\n");
}
