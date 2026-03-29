import { z } from "zod";

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
  lastWorkingDay: z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Datum im Format YYYY-MM-DD erforderlich"),
  employeePersonalNr: z.string().max(50).optional(),
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
  lastWorkingDay: z.string().optional(),
  exitReason: z.string().max(500).optional(),
  noticeDate: z.string().optional(),
  contractEndDate: z.string().optional(),
  noticePeriodEnd: z.string().optional(),
  exitData: z.record(z.unknown()).optional(),
}).refine(data => Object.keys(data).length > 0, "Mindestens ein Feld erforderlich");
