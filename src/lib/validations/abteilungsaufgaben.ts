/**
 * Validierung: Abteilungsaufgaben (Paket 1b, erweitert in Paket 5)
 *
 *   - abteilungsAktionSchema        POST  /api/offboarding/[id]/department-links
 *                                   POST  /api/onboarding/[id]/abteilungen (Paket 5, dieselbe Form)
 *   - aufgabeLinkPatchSchema        PATCH /api/offboarding-tasks/[token]/[itemId]  (oeffentlich)
 *                                   PATCH /api/onboarding-tasks/[token]/[itemId]   (oeffentlich, Paket 5)
 *   - portalAufgabePatchSchema      PATCH /api/offboarding/[id]/checklist/[itemId]
 *   - onboardingPortalAufgabePatchSchema  PATCH /api/onboarding/[id]/checklist/[itemId] (Paket 5)
 *   - abteilungConfigSchema         POST  /api/settings/departments
 *   - abteilungConfigUpdateSchema   PATCH /api/settings/departments/[id]
 *   - fuehrungskraftAnlageFelder    POST  /api/offboarding (in createOffboardingSchema einmischen)
 *   - fuehrungskraftAenderungFelder PATCH /api/offboarding/[id] (in updateOffboardingSchema einmischen)
 *   - checklistenPunktSchema,
 *     checklistenVorlageSchema,
 *     checklistenFehlerMeldung      Checklisten-Vorlagen (/api/checklisten…, Paket 5)
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

// =============================================
// PATCH /api/onboarding/[id]/checklist/[itemId] (Portal, Paket 5)
// =============================================

/** Datum als YYYY-MM-DD mit Rueckprobe (kein 31.02.). */
const TAGESDATUM = /^\d{4}-\d{2}-\d{2}$/;
function tagesdatumGueltig(text: string): boolean {
  if (!TAGESDATUM.test(text)) return false;
  const d = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

/**
 * Aenderung einer Onboarding-Aufgabe im Portal.
 *
 *   isCompleted  boolean, optional
 *   notes        interne HR-Notiz, hoechstens 2000 Zeichen; "" oder null = loeschen
 *   assignee     Schluessel (ABTEILUNGS_SCHLUESSEL_MUSTER) oder null = keine
 *                Zustaendigkeit; "" = null. Ob er BEKANNT ist, prueft der Dienst.
 *                (Feldname wie die Spalte ChecklistItem.assignee.)
 *   dueDate      "YYYY-MM-DD" oder null = ohne Faelligkeit
 *
 * Mindestens ein Feld. Unbekannte Felder wirft zod weg (frueher schrieb die
 * Route den rohen Body ins Protokoll und jeden String in `assignee`).
 */
export const onboardingPortalAufgabePatchSchema = z
  .object(
    {
      isCompleted: z.boolean({ invalid_type_error: "isCompleted muss wahr oder falsch sein." }).optional(),
      notes: z
        .string({ invalid_type_error: "Die Notiz muss ein Text sein." })
        .max(2000, "Die Notiz darf höchstens 2000 Zeichen lang sein.")
        .nullable()
        .optional(),
      assignee: z
        .preprocess(
          (v) => (typeof v === "string" && v.trim() === "" ? null : v),
          z
            .string({ invalid_type_error: MELDUNG_SCHLUESSEL })
            .trim()
            .regex(ABTEILUNGS_SCHLUESSEL_MUSTER, MELDUNG_SCHLUESSEL)
            .nullable(),
        )
        .optional(),
      dueDate: z
        .preprocess(
          (v) => (typeof v === "string" && v.trim() === "" ? null : v),
          z
            .string({ invalid_type_error: "Datum im Format YYYY-MM-DD erforderlich." })
            .trim()
            .refine(tagesdatumGueltig, "Datum im Format YYYY-MM-DD erforderlich.")
            .nullable(),
        )
        .optional(),
    },
    KEIN_OBJEKT,
  )
  .refine(
    (d) =>
      d.isCompleted !== undefined || d.notes !== undefined || d.assignee !== undefined || d.dueDate !== undefined,
    { message: "Mindestens ein Feld erforderlich." },
  );

export type OnboardingPortalAufgabePatchInput = z.infer<typeof onboardingPortalAufgabePatchSchema>;

// =============================================
// Checklisten-Vorlagen (/api/checklisten…, Paket 5)
// =============================================

/** Hoechstlaenge des Hinweises fuer die zustaendige Stelle. */
export const CHECKLISTEN_HINWEIS_MAX = 500;

/** Fragebogentypen (Enum QuestionnaireType) — hier als Liste, ohne @prisma/client im Browser. */
export const FRAGEBOGEN_TYPEN = ["STANDARD", "BEAMTE", "ERZIEHER", "MINIJOB", "EHRENAMT"] as const;

/** Unbekannte Zustaendigkeit im Vorlagen-Editor (Freitext-Altwert). */
export function meldungVorlagenZustaendigkeit(wert: string): string {
  return `Die Zuständigkeit „${wert}“ ist unbekannt – bitte in der Auswahl zuordnen.`;
}

/**
 * Ein Punkt einer Checklisten-Vorlage.
 *
 *   id               vorhandener Punkt (beim Ersetzen: bleibt erhalten, damit
 *                    ChecklistItem.templateItemId laufender Vorgaenge gueltig
 *                    bleibt); fehlt = neuer Punkt
 *   title            1–200 Zeichen
 *   category         1–100 Zeichen
 *   orderIndex       ganze Zahl >= 0, optional (sonst Position in der Liste)
 *   defaultDueDays   ganze Zahl −365…365 oder null (relativ zum Vertragsbeginn
 *                    bzw. letzten Arbeitstag)
 *   defaultAssignee  Schluessel (ABTEILUNGS_SCHLUESSEL_MUSTER) oder null;
 *                    "" = null. Ein Freitext-Altwert („Werkstatt") wird
 *                    abgewiesen — die Oberflaeche zeigt ihn als „Unbekannt: …
 *                    (bitte zuordnen)", gespeichert wird erst nach Zuordnung.
 *   description      Hinweis fuer die zustaendige Stelle, hoechstens 500
 *                    Zeichen; "" / nur Leerzeichen = null
 */
export const checklistenPunktSchema = z.object(
  {
    id: z.string({ invalid_type_error: "Ungültige Punkt-ID." }).trim().min(1).max(100).optional(),
    title: z
      .string({ required_error: "Titel ist ein Pflichtfeld.", invalid_type_error: "Titel ist ein Pflichtfeld." })
      .trim()
      .min(1, "Titel ist ein Pflichtfeld.")
      .max(200, "Der Titel darf höchstens 200 Zeichen lang sein."),
    category: z
      .string({ required_error: "Kategorie ist ein Pflichtfeld.", invalid_type_error: "Kategorie ist ein Pflichtfeld." })
      .trim()
      .min(1, "Kategorie ist ein Pflichtfeld.")
      .max(100, "Die Kategorie darf höchstens 100 Zeichen lang sein."),
    orderIndex: z
      .number({ invalid_type_error: "Die Reihenfolge muss eine Zahl sein." })
      .int("Die Reihenfolge muss eine ganze Zahl sein.")
      .min(0, "Die Reihenfolge darf nicht negativ sein.")
      .optional(),
    defaultDueDays: z
      .number({ invalid_type_error: "Die Fälligkeit muss eine Zahl (Tage) sein." })
      .int("Die Fälligkeit muss eine ganze Zahl (Tage) sein.")
      .min(-365, "Die Fälligkeit darf höchstens 365 Tage vorher liegen.")
      .max(365, "Die Fälligkeit darf höchstens 365 Tage danach liegen.")
      .nullable()
      .optional(),
    defaultAssignee: z
      .preprocess(
        (v) => (typeof v === "string" && v.trim() === "" ? null : v),
        z
          .string({ invalid_type_error: "Die Zuständigkeit muss ein Text sein." })
          .trim()
          .superRefine((wert, ctx) => {
            if (!ABTEILUNGS_SCHLUESSEL_MUSTER.test(wert)) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: meldungVorlagenZustaendigkeit(wert) });
            }
          })
          .nullable(),
      )
      .optional(),
    description: z
      .preprocess(
        (v) => (typeof v === "string" && v.trim() === "" ? null : v),
        z
          .string({ invalid_type_error: "Der Hinweis muss ein Text sein." })
          .trim()
          .max(CHECKLISTEN_HINWEIS_MAX, `Der Hinweis darf höchstens ${CHECKLISTEN_HINWEIS_MAX} Zeichen lang sein.`)
          .nullable(),
      )
      .optional(),
  },
  KEIN_OBJEKT,
);

export type ChecklistenPunktInput = z.infer<typeof checklistenPunktSchema>;

/**
 * Derselbe Punkt, aber fuer PATCH /api/checklisten/[id]/items: Jedes Feld ist
 * freiwillig, die Regeln der mitgeschickten Felder gelten unveraendert.
 *
 * Steht hier statt in der Route, weil Zod-Schemata laut Hausregel in
 * `src/lib/validations/` gehoeren — und weil ein `.partial()` an der
 * Aufrufstelle leicht aus dem Blick geraet, wenn jemand das Grundschema
 * erweitert. Bewusst NICHT `.strict()`: Die Route bekommt neben den Feldern
 * auch `itemId` mitgeschickt; die soll sie verwerfen, nicht mit 400 abweisen.
 */
export const checklistenPunktPatchSchema = checklistenPunktSchema.partial();

export type ChecklistenPunktPatchInput = z.infer<typeof checklistenPunktPatchSchema>;

/**
 * Eine ganze Vorlage — POST /api/checklisten (neu) und PUT
 * /api/checklisten/[id] (Metadaten + alle Punkte in EINER Transaktion ersetzen).
 * Punkt-IDs duerfen nicht doppelt vorkommen.
 */
export const checklistenVorlageSchema = z
  .object(
    {
      name: z
        .string({ required_error: "Name ist ein Pflichtfeld.", invalid_type_error: "Name ist ein Pflichtfeld." })
        .trim()
        .min(1, "Name ist ein Pflichtfeld.")
        .max(200, "Der Name darf höchstens 200 Zeichen lang sein."),
      description: z
        .preprocess(
          (v) => (typeof v === "string" && v.trim() === "" ? null : v),
          z
            .string({ invalid_type_error: "Die Beschreibung muss ein Text sein." })
            .trim()
            .max(1000, "Die Beschreibung darf höchstens 1000 Zeichen lang sein.")
            .nullable(),
        )
        .optional(),
      questionnaireType: z
        .preprocess(
          (v) => (v === "" ? null : v),
          z.enum(FRAGEBOGEN_TYPEN, { errorMap: () => ({ message: "Unbekannter Fragebogentyp." }) }).nullable(),
        )
        .optional(),
      isActive: z.boolean({ invalid_type_error: "isActive muss wahr oder falsch sein." }).optional(),
      items: z
        .array(checklistenPunktSchema, {
          required_error: "Mindestens ein Checklisten-Punkt ist erforderlich.",
          invalid_type_error: "Mindestens ein Checklisten-Punkt ist erforderlich.",
        })
        .min(1, "Mindestens ein Checklisten-Punkt ist erforderlich.")
        .max(300, "Eine Vorlage darf höchstens 300 Punkte haben."),
    },
    KEIN_OBJEKT,
  )
  .superRefine((v, ctx) => {
    const ids = v.items.map((p) => p.id).filter((id): id is string => !!id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["items"], message: "Ein Punkt ist doppelt enthalten." });
    }
  });

export type ChecklistenVorlageInput = z.infer<typeof checklistenVorlageSchema>;

/**
 * Erste Meldung eines gescheiterten Checklisten-Schemas, bei Punkten mit
 * „Punkt n: " davor (n ab 1), damit HR im Editor weiss, welcher gemeint ist.
 */
export function checklistenFehlerMeldung(fehler: z.ZodError): string {
  const erster = fehler.errors[0];
  if (!erster) return MELDUNGEN.UNGUELTIGE_EINGABE;
  const [feld, index] = erster.path;
  if (feld === "items" && typeof index === "number") return `Punkt ${index + 1}: ${erster.message}`;
  return erster.message;
}
