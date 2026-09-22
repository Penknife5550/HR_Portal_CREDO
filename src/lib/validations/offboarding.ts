import { z } from "zod";
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
}).refine(data => Object.keys(data).length > 0, "Mindestens ein Feld erforderlich");
