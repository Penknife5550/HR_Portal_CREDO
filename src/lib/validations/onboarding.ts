/**
 * Validierung: HR-Aktionen an einem Onboarding-Vorgang
 *
 *   - onboardingAnlegenSchema POST  /api/onboarding
 *   - supervisorLinkSchema    POST  /api/onboarding/[id]/supervisor-link
 *   - statusAenderungSchema   PATCH /api/onboarding/[id]
 */

import { z } from "zod";
import { ONBOARDING_STATUS } from "@/lib/onboarding-spuren";
import { GRENZE } from "@/lib/validations/personal-data";

/** RFC 5321: Eine Adresse ist hoechstens 254 Zeichen lang. */
const MAX_EMAIL_LAENGE = 254;

/** Werte des Enums `QuestionnaireType` (prisma/schema.prisma). */
export const FRAGEBOGEN_TYPEN = ["STANDARD", "BEAMTE", "ERZIEHER", "MINIJOB", "EHRENAMT"] as const;

/** Werte des Enums `ProcessType` (prisma/schema.prisma). */
export const VORGANGSARTEN = [
  "EINSTELLUNG",
  "VERBEAMTUNG",
  "VERTRAGSAENDERUNG",
  "KUENDIGUNG",
] as const;

/**
 * Adresse der Fuehrungskraft — dieselbe Regel beim Anlegen und beim spaeteren
 * Erzeugen des Vorgesetzten-Links.
 *
 * Frueher pruefte die Route nur „Feld vorhanden" — jede Zeichenkette landete
 * als `supervisorEmail` in der Datenbank und als Empfaenger im Mailversand. Ein
 * Tippfehler fiel erst auf, wenn die Mail nicht ankam.
 */
const fuehrungskraftEmail = z
  .string({
    required_error: "Bitte geben Sie die E-Mail-Adresse der Führungskraft an.",
    invalid_type_error: "Bitte geben Sie die E-Mail-Adresse der Führungskraft an.",
  })
  .trim()
  .min(1, "Bitte geben Sie die E-Mail-Adresse der Führungskraft an.")
  .max(MAX_EMAIL_LAENGE, "Die E-Mail-Adresse ist zu lang.")
  .email("Bitte geben Sie eine gültige E-Mail-Adresse der Führungskraft an.");

/** Vorgesetzten-Link erzeugen. */
export const supervisorLinkSchema = z.object({
  supervisorEmail: fuehrungskraftEmail,
});

export type SupervisorLinkInput = z.infer<typeof supervisorLinkSchema>;

/**
 * Die Fuehrungskraft braucht eine eigene Adresse. Sonst saehe die neue Person
 * ueber den Modalitaeten-Link ihre eigenen Verguetungsangaben, bevor die
 * Fuehrungskraft sie eingetragen hat.
 *
 * Gilt an BEIDEN Stellen, die den Link erzeugen: beim Anlegen (Schema unten)
 * und in /supervisor-link (dort kennt erst die Route die Adresse der Person).
 */
export const MELDUNG_EIGENE_ADRESSE =
  "Die Führungskraft braucht eine eigene E-Mail-Adresse – nicht die der neuen Person.";

/** Gleiche Adresse — ohne Gross/Klein und ohne Leerzeichen am Rand. */
export function gleicheAdresse(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** `null` und leere bzw. nur aus Leerzeichen bestehende Texte gelten als „nicht angegeben". */
const leerAlsFehlend = (v: unknown) =>
  v === null || (typeof v === "string" && v.trim() === "") ? undefined : v;

/**
 * Namen landen in zwei Mails — im HTML-Teil maskiert sie der Mailer, in Betreff
 * und Textteil stehen sie roh. Spitze Klammern und Steuerzeichen (auch CR/LF)
 * haben in einem Namen nichts verloren.
 */
const OHNE_KLAMMERN_STEUERZEICHEN = /^[^<>\p{Cc}]*$/u;

const MELDUNG_EMAIL = "Bitte geben Sie die E-Mail-Adresse der neuen Person an.";
const MELDUNG_EINRICHTUNG = "Bitte wählen Sie eine Einrichtung aus.";

const namensFeld = (feld: "firstName" | "lastName", wort: "Vorname" | "Nachname") =>
  z.preprocess(
    leerAlsFehlend,
    z
      .string({ invalid_type_error: `Der ${wort} muss ein Text sein.` })
      .trim()
      .max(GRENZE[feld].max, GRENZE[feld].msg)
      .regex(
        OHNE_KLAMMERN_STEUERZEICHEN,
        `Der ${wort} darf keine spitzen Klammern (< >) oder Steuerzeichen enthalten.`,
      )
      .optional(),
  );

/**
 * Neuen Onboarding-Vorgang anlegen (Dialog „Neuer Vorgang").
 *
 * Vor- und Nachname sowie die Adresse der Fuehrungskraft sind optional; leer
 * oder nur Leerzeichen heisst „nicht angegeben" (die Route setzt dann nichts).
 * Getrimmt wird hier, weil die Leser mit `||` auf den Namen am Vorgang
 * zurueckfallen — ein Name aus Leerzeichen blockierte diesen Rueckfall.
 *
 * `organizationId` bewusst ohne `.uuid()`: Eine unbekannte ID ist ein 404
 * (so erwarten es auch die Handskripte test-runner.mjs / test-api.ps1), keine
 * Formatfrage.
 *
 * Ein ungueltiger `processType` ist seitdem ein 400. Frueher fiel die Route
 * still auf EINSTELLUNG zurueck, und ein falscher `questionnaireType` endete
 * als Prisma-Ausnahme in einer 500.
 */
export const onboardingAnlegenSchema = z
  .object({
    email: z
      .string({ required_error: MELDUNG_EMAIL, invalid_type_error: MELDUNG_EMAIL })
      .trim()
      .min(1, MELDUNG_EMAIL)
      .max(MAX_EMAIL_LAENGE, "Die E-Mail-Adresse ist zu lang.")
      .email("Bitte geben Sie eine gültige E-Mail-Adresse der neuen Person an."),
    organizationId: z
      .string({ required_error: MELDUNG_EINRICHTUNG, invalid_type_error: MELDUNG_EINRICHTUNG })
      .trim()
      .min(1, MELDUNG_EINRICHTUNG),
    processType: z.preprocess(
      leerAlsFehlend,
      z
        .enum(VORGANGSARTEN, { errorMap: () => ({ message: "Ungültige Vorgangsart." }) })
        .default("EINSTELLUNG"),
    ),
    questionnaireType: z.preprocess(
      leerAlsFehlend,
      z
        .enum(FRAGEBOGEN_TYPEN, { errorMap: () => ({ message: "Ungültiger Fragebogentyp." }) })
        .default("STANDARD"),
    ),
    firstName: namensFeld("firstName", "Vorname"),
    lastName: namensFeld("lastName", "Nachname"),
    supervisorEmail: z.preprocess(leerAlsFehlend, fuehrungskraftEmail.optional()),
  })
  .refine((d) => !d.supervisorEmail || !gleicheAdresse(d.supervisorEmail, d.email), {
    message: MELDUNG_EIGENE_ADRESSE,
    path: ["supervisorEmail"],
  });

export type OnboardingAnlegenInput = z.infer<typeof onboardingAnlegenSchema>;

/**
 * Statusaenderung durch HR.
 *
 * Das Schema laesst alle acht Enum-Werte durch; welche davon HR tatsaechlich
 * setzen darf (nur REVIEWED, COMPLETED, EXPIRED) und aus welchem Stand, prueft
 * die Route — dort gibt es fuer die abgeleiteten Status eine eigene,
 * erklaerende Meldung statt „ungültig".
 */
export const statusAenderungSchema = z.object({
  status: z.enum(ONBOARDING_STATUS, {
    errorMap: () => ({ message: "Ungültiger Status-Wert" }),
  }),
});

export type StatusAenderungInput = z.infer<typeof statusAenderungSchema>;
