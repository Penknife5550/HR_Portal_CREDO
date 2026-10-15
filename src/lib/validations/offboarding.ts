import { z } from "zod";
import { RUECKGABE_KATEGORIEN } from "@/lib/constants";
import { MELDUNGEN_AUSGABEN, RUECKGABE_ZUSTAENDE } from "@/lib/ausgaben";
import {
  fuehrungskraftAenderungFelder,
  fuehrungskraftAnlageFelder,
} from "@/lib/validations/abteilungsaufgaben";

/**
 * Datum wie aus <input type="date">: genau "YYYY-MM-DD". `new Date("YYYY-MM-DD")`
 * ist UTC-Mitternacht — so rechnen Anlage (src/lib/offboarding.ts) und das
 * Verschieben der Faelligkeiten in ganzen Tagen.
 *
 * Streng, weil das Datum Fristen verschiebt:
 *   - Muster mit `$`: Ein Zeitstempel ("2027-07-31T12:00") wuerde als
 *     Ortszeit gelesen und verschoebe die Faelligkeiten um Bruchteile von
 *     Tagen; "2027-07-31junk" ergaebe ein ganz anderes Datum.
 *   - Rueckprobe: Das Datum muss als YYYY-MM-DD zurueckgelesen denselben Text
 *     ergeben. Sonst liefe "2027-02-30" still auf den 02.03. ueber, und
 *     "2027-13-45" scheiterte erst als "Invalid Date" in der Datenbank (500).
 * Die Oberflaeche schickt immer das Format des Datumsfelds.
 */
const datumFeld = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format YYYY-MM-DD erforderlich")
  .refine((v) => {
    const d = new Date(v);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Ungültiges Datum");

export const createOffboardingSchema = z.object({
  employeeFirstName: z.string().min(1, "Vorname ist erforderlich").max(100),
  employeeLastName: z.string().min(1, "Nachname ist erforderlich").max(100),
  employeeEmail: z.string().email("Ungültige E-Mail-Adresse"),
  employeePrivateEmail: z.string().email("Ungültige private E-Mail").optional().or(z.literal("")),
  organizationId: z.string().uuid("Ungültige Einrichtungs-ID"),
  exitType: z.enum([
    "KUENDIGUNG_ARBEITNEHMER",
    "KUENDIGUNG_ARBEITGEBER",
    "AUFHEBUNGSVERTRAG",
    "BEFRISTUNGSENDE",
    "RENTE_PENSION",
    "ERWERBSMINDERUNG",
    "ENTLASSUNG_BEAMTER",
    "VERSETZUNG",
    "TOD",
    "SONSTIGES",
  ]),
  lastWorkingDay: datumFeld,
  employeePersonalNr: z.string().max(50).optional(),
  // Fuehrungskraft (Paket 1b, optional): Empfaengerin der Aufgaben mit der
  // Zustaendigkeit "Führungskraft". Leer = nicht angegeben. Ob eine frei
  // eingetippte Adresse in einer freigegebenen Domain liegt, prueft die Route.
  ...fuehrungskraftAnlageFelder,
});

/**
 * Notiz im Reiter „Notizen" (/api/offboarding/:id/notes, Anlegen und
 * Bearbeiten). Getrimmt — eine Notiz nur aus Leerzeichen ist leer.
 */
export const offboardingNotizSchema = z.object({
  content: z
    .string({ required_error: "Die Notiz darf nicht leer sein.", invalid_type_error: "Die Notiz darf nicht leer sein." })
    .trim()
    .min(1, "Die Notiz darf nicht leer sein.")
    .max(5000, "Eine Notiz darf höchstens 5000 Zeichen lang sein."),
});

export const updateOffboardingSchema = z.object({
  status: z.string().optional(),
  employeeFirstName: z.string().min(1).max(100).optional(),
  employeeLastName: z.string().min(1).max(100).optional(),
  employeePrivateEmail: z.string().email("Ungueltige private E-Mail").optional().or(z.literal("")),
  employeePersonalNr: z.string().max(50).optional().or(z.literal("")),
  exitType: z.enum([
    "KUENDIGUNG_ARBEITNEHMER",
    "KUENDIGUNG_ARBEITGEBER",
    "AUFHEBUNGSVERTRAG",
    "BEFRISTUNGSENDE",
    "RENTE_PENSION",
    "ERWERBSMINDERUNG",
    "ENTLASSUNG_BEAMTER",
    "VERSETZUNG",
    "TOD",
    "SONSTIGES",
  ]).optional(),
  // Ein neuer letzter Arbeitstag verschiebt die offenen Faelligkeiten
  // (faelligkeitenVerschieben) — deshalb hier streng wie bei der Anlage.
  lastWorkingDay: datumFeld.optional(),
  exitReason: z.string().max(500).optional(),
  noticeDate: z.string().optional(),
  contractEndDate: z.string().optional(),
  noticePeriodEnd: z.string().optional(),
  exitData: z.record(z.unknown()).optional(),
  // Fuehrungskraft (Paket 1b): undefined = unveraendert, "" oder null = loeschen.
  // Vor dem .refine, sonst zaehlte ein Aufruf nur mit diesen Feldern als leer.
  ...fuehrungskraftAenderungFelder,
  // Ausstattung & Zugaenge (A4, G18): Abschluss trotz offener Rueckgaben
  // bestaetigt. Ohne ihn antwortet der COMPLETED-Zweig mit 409
  // RUECKGABEN_OFFEN, solange etwas offen ist; sonst ohne Wirkung.
  bestaetigt: z.boolean({ invalid_type_error: "bestaetigt muss wahr oder falsch sein." }).optional(),
  // `bestaetigt` allein ist keine Aenderung (wie `stand` im Katalog-PATCH):
  // Sonst liefe `{ bestaetigt: true }` mit leerem Update durch und
  // hinterliesse ein inhaltsleeres „Offboarding aktualisiert“ (A1–A3: 400).
}).refine(data => Object.keys(data).some((feld) => feld !== "bestaetigt"), "Mindestens ein Feld erforderlich");

// =============================================
// Rueckgaben (Reiter „Rückgaben“, /api/offboarding/:id/return-items)
// =============================================

/**
 * Kategorien des Prisma-Enums `ReturnCategory`. Seit A4 in src/lib/constants.ts
 * (auch die reinen Regeln der Ausgaben lesen sie); hier unveraendert
 * weitergereicht, Name und Typ bleiben.
 */
export { RUECKGABE_KATEGORIEN };

/**
 * Freitext eines Gegenstands: getrimmt, leer = null (die Spalten sind
 * nullable). `undefined` bleibt `undefined` — im PATCH heisst das "unveraendert".
 */
function optionalerText(max: number, feld: string) {
  return z
    .string({ invalid_type_error: `${feld} muss ein Text sein` })
    .trim()
    .max(max, `${feld} darf höchstens ${max} Zeichen lang sein`)
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v));
}

const GEGENSTAND_FEHLT = "Bitte den Gegenstand angeben";

export const rueckgabeAnlegenSchema = z.object({
  category: z.enum(RUECKGABE_KATEGORIEN, {
    errorMap: () => ({ message: "Bitte eine gültige Kategorie wählen" }),
  }),
  itemName: z
    .string({ required_error: GEGENSTAND_FEHLT, invalid_type_error: GEGENSTAND_FEHLT })
    .trim()
    .min(1, GEGENSTAND_FEHLT)
    .max(200, "Der Gegenstand darf höchstens 200 Zeichen lang sein"),
  serialNumber: optionalerText(100, "Die Seriennummer"),
  notes: optionalerText(1000, "Die Notiz"),
});

const GEGENSTAND_ID_FEHLT = "Rückgabe-Gegenstand fehlt";

/**
 * PATCH: `itemId` im Body (so wie die Route es seit jeher erwartet).
 *
 * Seit A4 (G15, G16) zusaetzlich `zustand`: einer der fuenf Rueckgabezustaende
 * oder `null` (= wieder offen). Die Altform `isReturned` bleibt gueltig
 * (`true` = ZURUECK, `false` = offen), aber nie zusammen mit `zustand` – zwei
 * Aussagen ueber dasselbe koennen sich widersprechen. Die 100 Zeichen fuer
 * `serialNumber` gelten fuer von HR erfasste Zeilen; an Zeilen mit `ausgabeId`
 * prueft der Dienst zusaetzlich `kennungSchema` (validations/ausgaben.ts, 400).
 */
export const rueckgabeAendernSchema = z
  .object({
    itemId: z
      .string({ required_error: GEGENSTAND_ID_FEHLT, invalid_type_error: GEGENSTAND_ID_FEHLT })
      .min(1, GEGENSTAND_ID_FEHLT)
      .max(100, GEGENSTAND_ID_FEHLT),
    isReturned: z.boolean({ invalid_type_error: "Rückgabe muss ja oder nein sein" }).optional(),
    zustand: z
      .enum(RUECKGABE_ZUSTAENDE, { errorMap: () => ({ message: MELDUNGEN_AUSGABEN.ZUSTAND_UNBEKANNT }) })
      .nullable()
      .optional(),
    condition: optionalerText(200, "Der Zustand"),
    notes: optionalerText(1000, "Die Notiz"),
    serialNumber: optionalerText(100, "Die Seriennummer"),
  })
  .refine((d) => d.isReturned === undefined || d.zustand === undefined, {
    message: MELDUNGEN_AUSGABEN.ZUSTAND_UND_RUECKGABE,
  });

export type RueckgabeAendernInput = z.infer<typeof rueckgabeAendernSchema>;
