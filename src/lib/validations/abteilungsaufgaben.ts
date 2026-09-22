/**
 * Validierung: Abteilungsaufgaben (Paket 1b)
 *
 *   - abteilungsAktionSchema        POST  /api/offboarding/[id]/department-links
 *   - aufgabeLinkPatchSchema        PATCH /api/offboarding-tasks/[token]/[itemId]  (oeffentlich)
 *   - portalAufgabePatchSchema      PATCH /api/offboarding/[id]/checklist/[itemId]
 *   - abteilungConfigSchema         POST  /api/settings/departments
 *   - abteilungConfigUpdateSchema   PATCH /api/settings/departments/[id]
 *   - fuehrungskraftAnlageFelder    POST  /api/offboarding (in createOffboardingSchema einmischen)
 *   - fuehrungskraftAenderungFelder PATCH /api/offboarding/[id] (in updateOffboardingSchema einmischen)
 *
 * Alle Meldungen deutsch; die Routen geben `error.errors[0].message` als
 * `{ error }` mit 400 zurueck (Muster der uebrigen Routen).
 */

import { z } from "zod";
import { RESERVIERTE_ABTEILUNGSSCHLUESSEL, PORTAL_ZUSTAENDIGE } from "@/lib/constants";
import { ABTEILUNGS_SCHLUESSEL_MUSTER, KOMMENTAR_MAX, MELDUNGEN } from "@/lib/abteilungsaufgaben";

/** RFC 5321: Eine Adresse ist hoechstens 254 Zeichen lang. */
const MAX_EMAIL_LAENGE = 254;

/**
 * Keine spitzen Klammern und keine Steuerzeichen (auch CR/LF) — dieselbe Regel
 * wie fuer Namen in validations/onboarding.ts. Abteilungs- und
 * Fuehrungskraft-Namen landen in Mails, im HTML-Teil ohne Maskierung.
 */
const OHNE_KLAMMERN_STEUERZEICHEN = /^[^<>\p{Cc}]*$/u;

/**
 * Kein JSON-Objekt (leerer oder kaputter Body, den die Route als `undefined`
 * weiterreicht, oder ein Array): deutsche Meldung statt zods "Required" bzw.
 * "Expected object, received array" — die oeffentliche Seite zeigt `error` an.
 */
const KEIN_OBJEKT = {
  required_error: MELDUNGEN.UNGUELTIGE_EINGABE,
  invalid_type_error: MELDUNGEN.UNGUELTIGE_EINGABE,
};

/** `null` und leere bzw. nur aus Leerzeichen bestehende Texte gelten als „nicht angegeben". */
const leerAlsFehlend = (v: unknown) =>
  v === null || (typeof v === "string" && v.trim() === "") ? undefined : v;

const MELDUNG_SCHLUESSEL =
  "Der Schlüssel darf nur Großbuchstaben, Ziffern und _ enthalten (2–30 Zeichen, beginnend mit einem Buchstaben).";

/** Begruendung je reserviertem Schluessel (Einstellungen → Abteilungen). */
const RESERVIERT_BEGRUENDUNG: Record<string, string> = {
  VORGESETZTER: "Aufgaben für Vorgesetzte gehen an die Führungskraft des Vorgangs.",
  HR: "Die Personalabteilung arbeitet im Portal und bekommt keinen Link.",
  MITARBEITER: "Mitarbeitende arbeiten im Portal und bekommen keinen Link.",
};

export function meldungReservierterSchluessel(schluessel: string): string {
  return `Der Schlüssel „${schluessel}“ ist reserviert: ${RESERVIERT_BEGRUENDUNG[schluessel] ?? "Er kann nicht angelegt werden."}`;
}

const schluesselFeld = z
  .string({ required_error: "Bitte einen Schlüssel angeben.", invalid_type_error: "Bitte einen Schlüssel angeben." })
  .trim()
  .min(1, "Bitte einen Schlüssel angeben.")
  .regex(ABTEILUNGS_SCHLUESSEL_MUSTER, MELDUNG_SCHLUESSEL);

// =============================================
// POST /api/offboarding/[id]/department-links
// =============================================

/** Schluessel einer Abteilung, die einen Link bekommen kann (nicht HR/MITARBEITER). */
const linkSchluesselFeld = schluesselFeld.refine(
  (k) => !(PORTAL_ZUSTAENDIGE as readonly string[]).includes(k),
  MELDUNGEN.PORTAL_ZUSTAENDIG,
);

/**
 * Aktion der Versandroute.
 *
 * Leerer Body (oder `{}`) heisst "informieren". Der alte Aufruf
 * `{ action: "remind", departmentKey }` bleibt gueltig und heisst "erinnern".
 * Die Vorverarbeitung macht aus beidem die neue Form `{ aktion, departmentKey }`.
 */
export const abteilungsAktionSchema = z.preprocess(
  (roh) => {
    if (roh === undefined || roh === null) return { aktion: "informieren" };
    if (typeof roh !== "object" || Array.isArray(roh)) return roh;
    const r = roh as Record<string, unknown>;
    if (r.aktion === undefined && r.action === "remind") {
      return { aktion: "erinnern", departmentKey: r.departmentKey };
    }
    if (r.aktion === undefined && r.action === undefined) {
      return { ...r, aktion: "informieren" };
    }
    return r;
  },
  z.discriminatedUnion(
    "aktion",
    [
      z.object({ aktion: z.literal("informieren") }),
      z.object({ aktion: z.literal("erneut-senden"), departmentKey: linkSchluesselFeld }),
      z.object({ aktion: z.literal("erinnern"), departmentKey: linkSchluesselFeld }),
      z.object({ aktion: z.literal("link-erneuern"), departmentKey: linkSchluesselFeld }),
    ],
    { errorMap: () => ({ message: "Unbekannte Aktion." }) },
  ),
);

export type AbteilungsAktionInput = z.infer<typeof abteilungsAktionSchema>;

// =============================================
// PATCH /api/offboarding-tasks/[token]/[itemId] (oeffentlich)
// =============================================

/**
 * Abhaken und/oder kommentieren ueber den Link der Abteilung.
 *
 *   isCompleted  boolean, optional
 *   comment      getrimmt, hoechstens 1000 Zeichen; undefined oder null =
 *                unveraendert, "" = loeschen
 *
 * Mindestens eins von beidem muss eine Aenderung tragen. `notes` (die interne
 * HR-Notiz) nimmt das Schema gar nicht erst an — zod wirft unbekannte Felder weg.
 */
export const aufgabeLinkPatchSchema = z
  .object(
    {
      isCompleted: z.boolean({ invalid_type_error: "isCompleted muss wahr oder falsch sein." }).optional(),
      comment: z
        .string({ invalid_type_error: "Der Kommentar muss ein Text sein." })
        .trim()
        .max(KOMMENTAR_MAX, `Der Kommentar darf höchstens ${KOMMENTAR_MAX} Zeichen lang sein.`)
        .nullable()
        .optional(),
    },
    KEIN_OBJEKT,
  )
  .refine((d) => d.isCompleted !== undefined || (d.comment !== undefined && d.comment !== null), {
    message: "Bitte Status oder Kommentar angeben.",
  });

export type AufgabeLinkPatchInput = z.infer<typeof aufgabeLinkPatchSchema>;

// =============================================
// PATCH /api/offboarding/[id]/checklist/[itemId] (Portal)
// =============================================

/**
 * Aenderung einer Checklisten-Aufgabe im Portal.
 *
 *   isCompleted         boolean, optional
 *   notes               interne HR-Notiz, hoechstens 2000 Zeichen; "" oder null = loeschen
 *   assigneeDepartment  Schluessel (Form wie oben) oder null = keine Zustaendigkeit.
 *                       Ob der Schluessel BEKANNT ist, prueft der Dienst
 *                       (Konstanten + Einstellungen → Abteilungen).
 */
export const portalAufgabePatchSchema = z
  .object(
    {
      isCompleted: z.boolean({ invalid_type_error: "isCompleted muss wahr oder falsch sein." }).optional(),
      notes: z
        .string({ invalid_type_error: "Die Notiz muss ein Text sein." })
        .max(2000, "Die Notiz darf höchstens 2000 Zeichen lang sein.")
        .nullable()
        .optional(),
      assigneeDepartment: z
        .preprocess(
          (v) => (typeof v === "string" && v.trim() === "" ? null : v),
          z
            .string({ invalid_type_error: MELDUNG_SCHLUESSEL })
            .trim()
            .regex(ABTEILUNGS_SCHLUESSEL_MUSTER, MELDUNG_SCHLUESSEL)
            .nullable(),
        )
        .optional(),
    },
    KEIN_OBJEKT,
  )
  .refine(
    (d) => d.isCompleted !== undefined || d.notes !== undefined || d.assigneeDepartment !== undefined,
    { message: "Mindestens ein Feld erforderlich." },
  );

export type PortalAufgabePatchInput = z.infer<typeof portalAufgabePatchSchema>;

// =============================================
// Einstellungen → Abteilungen
// =============================================

const abteilungsNameFeld = z
  .string({ required_error: "Bitte einen Anzeigenamen angeben.", invalid_type_error: "Bitte einen Anzeigenamen angeben." })
  .trim()
  .min(1, "Bitte einen Anzeigenamen angeben.")
  .max(100, "Der Anzeigename darf höchstens 100 Zeichen lang sein.")
  .regex(OHNE_KLAMMERN_STEUERZEICHEN, "Der Anzeigename darf keine spitzen Klammern (< >) oder Steuerzeichen enthalten.");

const abteilungsEmailFeld = z
  .string({ required_error: "Bitte eine E-Mail-Adresse angeben.", invalid_type_error: "Bitte eine E-Mail-Adresse angeben." })
  .trim()
  .min(1, "Bitte eine E-Mail-Adresse angeben.")
  .max(MAX_EMAIL_LAENGE, "Die E-Mail-Adresse ist zu lang.")
  .email("Die E-Mail-Adresse ist nicht gültig.");

/**
 * Neue Abteilung. `organizationId` leer/null = zentral (alle Einrichtungen).
 * Ob die Einrichtung existiert und ob es den Eintrag schon gibt (409), prueft
 * die Route.
 */
export const abteilungConfigSchema = z.object(
  {
    departmentKey: schluesselFeld.superRefine((k, ctx) => {
      if ((RESERVIERTE_ABTEILUNGSSCHLUESSEL as readonly string[]).includes(k)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: meldungReservierterSchluessel(k) });
      }
    }),
    departmentName: abteilungsNameFeld,
    email: abteilungsEmailFeld,
    organizationId: z.preprocess(
      leerAlsFehlend,
      z.string({ invalid_type_error: "Ungültige Einrichtung." }).trim().min(1).nullable().optional(),
    ),
  },
  KEIN_OBJEKT,
);

export type AbteilungConfigInput = z.infer<typeof abteilungConfigSchema>;

/**
 * Abteilung aendern. Schluessel und Einrichtung sind nicht aenderbar (dafuer
 * loeschen und neu anlegen) — unbekannte Felder wirft zod weg.
 */
export const abteilungConfigUpdateSchema = z
  .object(
    {
      departmentName: abteilungsNameFeld.optional(),
      email: abteilungsEmailFeld.optional(),
      isActive: z.boolean({ invalid_type_error: "isActive muss wahr oder falsch sein." }).optional(),
    },
    KEIN_OBJEKT,
  )
  .refine(
    (d) => d.departmentName !== undefined || d.email !== undefined || d.isActive !== undefined,
    { message: "Mindestens ein Feld erforderlich." },
  );

export type AbteilungConfigUpdateInput = z.infer<typeof abteilungConfigUpdateSchema>;

// =============================================
// Fuehrungskraft im Offboarding
// =============================================

const fuehrungskraftEmail = z
  .string({ invalid_type_error: "Bitte eine gültige E-Mail-Adresse der Führungskraft angeben." })
  .trim()
  .max(MAX_EMAIL_LAENGE, "Die E-Mail-Adresse ist zu lang.")
  .email("Bitte eine gültige E-Mail-Adresse der Führungskraft angeben.");

const fuehrungskraftName = z
  .string({ invalid_type_error: "Der Name der Führungskraft muss ein Text sein." })
  .trim()
  .max(200, "Der Name der Führungskraft darf höchstens 200 Zeichen lang sein.")
  .regex(
    OHNE_KLAMMERN_STEUERZEICHEN,
    "Der Name der Führungskraft darf keine spitzen Klammern (< >) oder Steuerzeichen enthalten.",
  );

/**
 * Anlage ("Neuer Austritt"): beide optional; leer oder null = nicht angegeben
 * (Ergebnis `undefined`). Zum Einmischen: `createOffboardingSchema.extend(fuehrungskraftAnlageFelder)`
 * bzw. `z.object({ ...alt, ...fuehrungskraftAnlageFelder })`.
 */
export const fuehrungskraftAnlageFelder = {
  supervisorEmail: z.preprocess(leerAlsFehlend, fuehrungskraftEmail.optional()),
  supervisorName: z.preprocess(leerAlsFehlend, fuehrungskraftName.optional()),
};

/**
 * Aenderung (Tab Übersicht): undefined = unveraendert, null oder "" = loeschen
 * (Ergebnis `null`), sonst der getrimmte Wert.
 */
export const fuehrungskraftAenderungFelder = {
  supervisorEmail: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    fuehrungskraftEmail.nullable().optional(),
  ),
  supervisorName: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    fuehrungskraftName.nullable().optional(),
  ),
};
