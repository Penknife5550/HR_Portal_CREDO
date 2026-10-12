/**
 * Validierung: Ausstattung & Zugaenge (Feinplan 1.4)
 *
 *   - katalogPositionSchema           POST  /api/settings/ausstattung
 *   - katalogPositionAenderungSchema  PATCH /api/settings/ausstattung/[id]
 *   - ausblendungSchema               PUT   /api/settings/ausstattung/[id]/ausblendung
 *   - arbeitsortSchema                PATCH /api/onboarding/[id]/arbeitsort
 *
 * Zod prueft nur die FORM der Felder (Typ, Laenge, Wertlisten, Zeichen). Die
 * Felder gegeneinander prueft `positionPruefen` (src/lib/ausstattung.ts) — beim
 * Anlegen auf dem geparsten Ergebnis, beim Aendern auf dem mit der
 * gespeicherten Zeile zusammengefuehrten Stand. Dieselbe Funktion laeuft im
 * Dialog, bevor er sendet. Alle Meldungen stehen in `MELDUNGEN` dort.
 *
 * Bewusst NICHT im Schema: die Stufe-2-Felder `ausgabeKennung`,
 * `rueckgabeKategorie` und `beiAustritt` (schreibt bis A4 niemand, die
 * Momentaufnahme kopiert `null`) und `vorschlagSchluessel` (schreibt nur
 * „Vorschläge übernehmen“). Zod verwirft sie (`.strip()`), sie kommen also nie
 * im geparsten Ergebnis an — sonst faende A4 ungepruefte Werte vor, und ein
 * Vorschlagsschluessel liesse sich ueber POST/PATCH verbiegen. `isActive`
 * kennt nur das Aenderungs-Schema: Eine neue Position ist immer ausgeschaltet
 * (Regel 1).
 *
 * Freitexte werden vor der Laengenpruefung auf \n normalisiert und getrimmt
 * (Browser schicken Formularfelder mit \r\n; der Zaehler im Dialog zaehlt \n).
 * Einzeilige Texte (Bezeichnung, Optionen, Aufgabentitel, Platzhalter) duerfen
 * weder spitze Klammern noch Steuerzeichen (auch keinen Zeilenumbruch)
 * enthalten — wie OHNE_KLAMMERN_STEUERZEICHEN in validations/onboarding.ts; sie
 * werden zum Titel einer Aufgabe und stehen in Mails und Betreffzeilen. Die
 * Hinweise sind mehrzeilig und duerfen ausser Zeilenumbruch und Tabulator kein
 * Steuerzeichen enthalten (ein NUL-Zeichen liesse Postgres scheitern: 500
 * statt 400). Dasselbe gilt fuer die IDs (Einrichtung einer Position,
 * Arbeitsort): Sie laufen ungeprueft in `findUnique` — `idFeld` weist
 * Steuerzeichen, spitze Klammern und ueberlange Werte ab, bewusst ohne
 * `.uuid()` (eine unbekannte ID bleibt eine Frage des Dienstes, 400 bzw. 404).
 */

import { z } from "zod";
import { MELDUNGEN as ABTEILUNGS_MELDUNGEN } from "@/lib/abteilungsaufgaben";
import {
  ANGABE_SCHLUESSEL,
  AUSSTATTUNG_ARTEN,
  EINRICHTUNGSARTEN,
  GRENZEN,
  MELDUNGEN,
  PERSONENGRUPPEN,
  REIHENFOLGE_MAX,
  type Einrichtungsart,
  type Personengruppe,
} from "@/lib/ausstattung";
import { schluesselFeld } from "@/lib/validations/abteilungsaufgaben";

/** Keine spitzen Klammern und kein Steuerzeichen (auch kein CR/LF) — einzeilige Texte. */
const OHNE_KLAMMERN_STEUERZEICHEN = /^[^<>\p{Cc}]*$/u;

/** Steuerzeichen ausser Tabulator und Zeilenumbruch (\r ist nach dem Normalisieren weg). */
const STEUERZEICHEN_MEHRZEILIG = /[^\P{Cc}\t\n]/u;

/** Hoechstzahl der Eintraege in „Sichtbar für“ (Schutz vor uebergrossen Bodys). */
const MAX_SICHTBAR_FUER = 20;

/** Hoechstlaenge einer ID: UUIDs haben 36 Zeichen, Luft fuer andere Formen (Testdaten), kein Roman. */
export const ID_MAX = 64;

/** Kein JSON-Objekt (leerer Body, Array, Zahl): deutsche Meldung statt zods englischer. */
const KEIN_OBJEKT = {
  required_error: ABTEILUNGS_MELDUNGEN.UNGUELTIGE_EINGABE,
  invalid_type_error: ABTEILUNGS_MELDUNGEN.UNGUELTIGE_EINGABE,
};

const FALSCHER_TYP = { invalid_type_error: ABTEILUNGS_MELDUNGEN.UNGUELTIGE_EINGABE };

const EINRICHTUNGSART_WERTE = Object.keys(EINRICHTUNGSARTEN) as [Einrichtungsart, ...Einrichtungsart[]];
const PERSONENGRUPPEN_WERTE = Object.keys(PERSONENGRUPPEN) as [Personengruppe, ...Personengruppe[]];

// =============================================
// Bausteine
// =============================================

/** \r\n und \r werden \n, aussen getrimmt — vor jeder Laengenpruefung. */
export function freitextNormalisieren(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim();
}

const normalisiert = (v: unknown) => (typeof v === "string" ? freitextNormalisieren(v) : v);

/** Fehlend, `null` oder leer (auch nur Leerzeichen) wird `null`, ein Text normalisiert. */
const leerAlsNull = (v: unknown) => {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return v;
  const text = freitextNormalisieren(v);
  return text === "" ? null : text;
};

/** Pflichttext in einer Zeile. */
function einzeiligerText(max: number, fehlt: string, zuLang: string) {
  return z.preprocess(
    normalisiert,
    z
      .string({ required_error: fehlt, invalid_type_error: fehlt })
      .min(1, fehlt)
      .max(max, zuLang)
      .regex(OHNE_KLAMMERN_STEUERZEICHEN, MELDUNGEN.OHNE_KLAMMERN),
  );
}

/** Freiwilliger Text in einer Zeile; leer = `null`. */
function optionalerEinzeiligerText(max: number, zuLang: string) {
  return z.preprocess(
    leerAlsNull,
    z.string(FALSCHER_TYP).max(max, zuLang).regex(OHNE_KLAMMERN_STEUERZEICHEN, MELDUNGEN.OHNE_KLAMMERN).nullable(),
  );
}

/** Freiwilliger mehrzeiliger Text; leer = `null`. */
function optionalerMehrzeiligerText(max: number, zuLang: string) {
  return z.preprocess(
    leerAlsNull,
    z
      .string(FALSCHER_TYP)
      .max(max, zuLang)
      .refine((t) => !STEUERZEICHEN_MEHRZEILIG.test(t), MELDUNGEN.STEUERZEICHEN)
      .nullable(),
  );
}

/**
 * Form einer Datensatz-ID (Einrichtung, Arbeitsort): getrimmt, nicht leer,
 * hoechstens ID_MAX Zeichen, ohne Steuerzeichen und spitze Klammern — eine
 * Meldung fuer alles. Bewusst OHNE `.uuid()`: Ob es die ID gibt, ist eine
 * Frage des Dienstes (400 bzw. 404 „Organisation nicht gefunden“), keine
 * Formatfrage. Ohne diese Form liefe ein NUL-Zeichen bis in `findUnique`, und
 * Postgres scheiterte daran (22021) — 500 statt 400. Auch fuer
 * `onboardingAnlegenSchema.arbeitsortId` (validations/onboarding.ts).
 */
export function idFeld(meldung: string) {
  return z
    .string({ required_error: meldung, invalid_type_error: meldung })
    .trim()
    .min(1, meldung)
    .max(ID_MAX, meldung)
    .regex(OHNE_KLAMMERN_STEUERZEICHEN, meldung);
}

/** Liste; fehlend oder `null` = leer. */
function liste<T extends z.ZodTypeAny>(element: T, max: number, zuViele: string) {
  return z.preprocess(
    (v) => (v === undefined || v === null ? [] : v),
    z.array(element, FALSCHER_TYP).max(max, zuViele),
  );
}

/** Liste ohne Doppelte (Reihenfolge des ersten Auftretens). */
function ohneDoppelte<T>(werte: T[]): T[] {
  return [...new Set(werte)];
}

const einrichtungsartFeld = z.enum(EINRICHTUNGSART_WERTE, {
  errorMap: () => ({ message: MELDUNGEN.EINRICHTUNGSART_UNBEKANNT }),
});

const personengruppeFeld = z.enum(PERSONENGRUPPEN_WERTE, {
  errorMap: () => ({ message: MELDUNGEN.PERSONENGRUPPE_UNBEKANNT }),
});

const optionFeld = einzeiligerText(GRENZEN.option, MELDUNGEN.OPTION_LEER, MELDUNGEN.OPTION_ZU_LANG);

// =============================================
// Katalogposition (Einstellungen → Ausstattung & Zugänge)
// =============================================

/**
 * Die Felder einer Position aus Feinplan 1.2 — ohne A4-Felder,
 * `vorschlagSchluessel` und `isActive` (siehe Kopf).
 *
 *   departmentKey       Abteilungsschluessel (schluesselFeld); ob er erlaubt ist, prueft positionPruefen
 *   organizationId      leer/null = zentral; Form `idFeld`; ob es die Einrichtung gibt, prueft der Dienst (400)
 *   einrichtungsarten   OrganizationType-Werte, Doppelte fallen weg
 *   art                 JA_NEIN | AUSWAHL | ANGABE
 *   angabeSchluessel    nur ANGABE: Schluessel aus ANGABEN_KATALOG; leer = null
 *   bezeichnung         1–120 Zeichen, einzeilig
 *   hinweisFuehrungskraft, hinweisStelle   freiwillig, mehrzeilig, ≤ 300 bzw. ≤ 500
 *   optionen            je 1–80 Zeichen, einzeilig, hoechstens 40
 *   vorausgewaehlt      Standard false
 *   vorausgewaehlteOptionen  Teilmenge der Optionen (positionPruefen)
 *   bemerkungAnbieten   Standard: ja, bei ANGABE nein
 *   bemerkungPlatzhalter, aufgabeTitel     freiwillig, einzeilig, ≤ 120
 *   defaultDueDays      ganze Zahl −365…365 oder null
 *   personengruppen     QuestionnaireType-Werte, Doppelte fallen weg
 *   sichtbarFuer        Abteilungsschluessel, Doppelte fallen weg
 *   entgeltrelevant     Standard false
 *   orderIndex          ganze Zahl 0…REIHENFOLGE_MAX, Standard 0
 */
const katalogPositionFelder = {
  departmentKey: schluesselFeld,
  organizationId: z.preprocess(leerAlsNull, idFeld(MELDUNGEN.EINRICHTUNG_UNGUELTIG).nullable()),
  einrichtungsarten: liste(einrichtungsartFeld, EINRICHTUNGSART_WERTE.length * 2, MELDUNGEN.EINRICHTUNGSART_UNBEKANNT).transform(
    ohneDoppelte,
  ),
  art: z.enum(AUSSTATTUNG_ARTEN, { errorMap: () => ({ message: MELDUNGEN.ART_UNBEKANNT }) }),
  angabeSchluessel: z.preprocess(
    leerAlsNull,
    z.enum(ANGABE_SCHLUESSEL, { errorMap: () => ({ message: MELDUNGEN.ANGABE_UNBEKANNT }) }).nullable(),
  ),
  bezeichnung: einzeiligerText(GRENZEN.bezeichnung, MELDUNGEN.BEZEICHNUNG_FEHLT, MELDUNGEN.BEZEICHNUNG_ZU_LANG),
  hinweisFuehrungskraft: optionalerMehrzeiligerText(
    GRENZEN.hinweisFuehrungskraft,
    MELDUNGEN.HINWEIS_FUEHRUNGSKRAFT_ZU_LANG,
  ),
  hinweisStelle: optionalerMehrzeiligerText(GRENZEN.hinweisStelle, MELDUNGEN.HINWEIS_STELLE_ZU_LANG),
  optionen: liste(optionFeld, GRENZEN.optionen, MELDUNGEN.OPTIONEN_ZU_VIELE),
  vorausgewaehlt: z.boolean(FALSCHER_TYP).default(false),
  vorausgewaehlteOptionen: liste(optionFeld, GRENZEN.optionen, MELDUNGEN.OPTIONEN_ZU_VIELE).transform(ohneDoppelte),
  bemerkungAnbieten: z.boolean(FALSCHER_TYP).optional(),
  bemerkungPlatzhalter: optionalerEinzeiligerText(GRENZEN.bemerkungPlatzhalter, MELDUNGEN.PLATZHALTER_ZU_LANG),
  aufgabeTitel: optionalerEinzeiligerText(GRENZEN.aufgabeTitel, MELDUNGEN.AUFGABENTITEL_ZU_LANG),
  defaultDueDays: z.preprocess(
    (v) => (v === undefined || v === null || v === "" ? null : v),
    z
      .number({ invalid_type_error: MELDUNGEN.FAELLIG_UNGUELTIG })
      .int(MELDUNGEN.FAELLIG_UNGUELTIG)
      .min(-GRENZEN.faelligTage, MELDUNGEN.FAELLIG_UNGUELTIG)
      .max(GRENZEN.faelligTage, MELDUNGEN.FAELLIG_UNGUELTIG)
      .nullable(),
  ),
  personengruppen: liste(
    personengruppeFeld,
    PERSONENGRUPPEN_WERTE.length * 2,
    MELDUNGEN.PERSONENGRUPPE_UNBEKANNT,
  ).transform(ohneDoppelte),
  sichtbarFuer: liste(schluesselFeld, MAX_SICHTBAR_FUER, MELDUNGEN.SICHTBAR_ZU_VIELE).transform(ohneDoppelte),
  entgeltrelevant: z.boolean(FALSCHER_TYP).default(false),
  orderIndex: z
    .number({ invalid_type_error: MELDUNGEN.REIHENFOLGE_UNGUELTIG })
    .int(MELDUNGEN.REIHENFOLGE_UNGUELTIG)
    .min(0, MELDUNGEN.REIHENFOLGE_UNGUELTIG)
    .max(REIHENFOLGE_MAX, MELDUNGEN.REIHENFOLGE_UNGUELTIG)
    .default(0),
};

const katalogPositionBasis = z.object(katalogPositionFelder, KEIN_OBJEKT).strip();

/**
 * Neue Position (POST). Das Ergebnis ist ein vollstaendiger `PositionEntwurf`
 * (plus `orderIndex`): Fehlende Felder bekommen ihren Leerwert, ein fehlendes
 * `bemerkungAnbieten` heisst „ja“, bei einer Angabe „nein“ (sie hat kein
 * Bemerkungsfeld). `isActive` gibt es hier nicht — die Position ist aus.
 */
export const katalogPositionSchema = katalogPositionBasis.transform((p) => ({
  ...p,
  bemerkungAnbieten: p.bemerkungAnbieten ?? p.art !== "ANGABE",
}));

export type KatalogPositionInput = z.infer<typeof katalogPositionSchema>;

/**
 * Aenderung einer Position (PATCH): jedes Feld freiwillig, dazu `isActive`
 * (Ein-/Ausschalten). `undefined` = unveraendert; Leerwerte (`""`, `null`)
 * leeren ein freiwilliges Feld. Standardwerte gelten hier NICHT — ein
 * fehlendes Feld bleibt fehlend. Mindestens ein Feld; A4-Felder und
 * `vorschlagSchluessel` allein zaehlen nicht, sie fallen vorher weg.
 *
 * `stand` ist kein Feld der Position, sondern ihr `updatedAt`, wie der Dialog
 * „Bearbeiten“ ihn beim Oeffnen geladen hat (ISO-Zeitstempel). Der Dialog
 * schickt immer das ganze Formular; weicht `stand` vom gespeicherten Wert ab,
 * hat inzwischen jemand anderes gespeichert, und der Dienst antwortet 409,
 * statt dessen Aenderung mit dem alten Formular still zurueckzudrehen. Ohne
 * `stand` (Ein-/Ausschalten in der Zeile, nur ein Feld) gilt nur die Sperre
 * innerhalb der Anfrage. `stand` allein ist keine Aenderung.
 */
export const katalogPositionAenderungSchema = katalogPositionBasis
  .extend({
    isActive: z.boolean(FALSCHER_TYP),
    stand: z
      .string({ invalid_type_error: MELDUNGEN.STAND_UNGUELTIG })
      .datetime({ message: MELDUNGEN.STAND_UNGUELTIG }),
  })
  .partial()
  .strip()
  .refine((d) => Object.entries(d).some(([feld, v]) => feld !== "stand" && v !== undefined), {
    message: MELDUNGEN.MINDESTENS_EIN_FELD,
  });

export type KatalogPositionAenderungInput = z.infer<typeof katalogPositionAenderungSchema>;

// =============================================
// Ausblendung einer zentralen Position fuer eine Einrichtung
// =============================================

/**
 * PUT …/ausblendung: `ausgeblendet: true` legt die Ausblendung an, `false`
 * nimmt sie weg (idempotent). Ob die Position zentral ist und ob es die
 * Einrichtung gibt, prueft der Dienst.
 */
export const ausblendungSchema = z
  .object(
    {
      organizationId: z
        .string({ required_error: MELDUNGEN.EINRICHTUNG_UNGUELTIG, invalid_type_error: MELDUNGEN.EINRICHTUNG_UNGUELTIG })
        .trim()
        .uuid(MELDUNGEN.EINRICHTUNG_UNGUELTIG),
      ausgeblendet: z.boolean({
        required_error: MELDUNGEN.AUSGEBLENDET_FEHLT,
        invalid_type_error: MELDUNGEN.AUSGEBLENDET_FEHLT,
      }),
    },
    KEIN_OBJEKT,
  )
  .strip();

export type AusblendungInput = z.infer<typeof ausblendungSchema>;

// =============================================
// Arbeitsort am Vorgang (PATCH /api/onboarding/[id]/arbeitsort, E-A10)
// =============================================

/**
 * `arbeitsortId`: die Einrichtung, an der die Person arbeitet, oder `null` =
 * „wie Einrichtung“ (ein leerer Text gilt ebenso). Das Feld ist Pflicht — ein
 * leerer Body darf den Arbeitsort nicht still zuruecksetzen.
 *
 * Bewusst OHNE `.uuid()`, wie `organizationId` beim Anlegen
 * (validations/onboarding.ts): Eine unbekannte ID ist ein 404 „Organisation
 * nicht gefunden“, keine Formatfrage. Ob es die Einrichtung gibt und ob die
 * Sitzung sie sehen darf, prueft der Dienst (`arbeitsortAendern`). Die Form
 * (`idFeld`: Laenge, keine Steuerzeichen) prueft schon Zod — ein NUL-Zeichen
 * endete sonst als 500 in Postgres.
 */
export const arbeitsortSchema = z
  .object(
    {
      arbeitsortId: z.preprocess(
        (v) => (typeof v === "string" && v.trim() === "" ? null : v),
        idFeld(MELDUNGEN.ARBEITSORT_UNGUELTIG).nullable(),
      ),
    },
    KEIN_OBJEKT,
  )
  .strip();

export type ArbeitsortInput = z.infer<typeof arbeitsortSchema>;
