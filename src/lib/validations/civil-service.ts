/**
 * Verbeamtung (PSI) – Zod-Validierungsschemas
 */

import { z } from "zod";

export const createCivilServiceSchema = z.object({
  employeeFirstName: z.string().min(1, "Vorname ist erforderlich").max(100),
  employeeLastName: z.string().min(1, "Nachname ist erforderlich").max(100),
  employeeEmail: z.string().email("Ungueltige E-Mail-Adresse"),
  employeePersonalNr: z.string().max(50).optional(),
  organizationId: z.string().uuid("Ungueltige Einrichtungs-ID"),
  targetStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Datum im Format YYYY-MM-DD erforderlich").optional(),
  employeeId: z.string().uuid("Ungueltige Mitarbeiter-ID").optional(),
});

export const updateCivilServiceSchema = z.object({
  status: z.string().optional(),
  currentStep: z.number().int().min(1).max(11).optional(),
  targetStartDate: z.string().optional().nullable(),
  probationStartDate: z.string().optional().nullable(),
  besoldungsgruppe: z.string().max(10).optional().nullable(),
  erfahrungsstufe: z.number().int().min(1).max(12).optional().nullable(),
  prerequisites: z.record(z.unknown()).optional().nullable(),
}).refine(data => Object.keys(data).length > 0, "Mindestens ein Feld erforderlich");

export const updatePhaseSchema = z.object({
  phaseKey: z.string().min(1, "Phase ist erforderlich"),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "BLOCKED", "SKIPPED"], {
    errorMap: () => ({ message: "Ungueltiger Phasen-Status" }),
  }),
  blockedReason: z.string().max(500).optional().nullable(),
});

export const createBoardDecisionSchema = z.object({
  decisionType: z.enum(["PROBE", "LIFETIME"], {
    errorMap: () => ({ message: "Entscheidungstyp muss PROBE oder LIFETIME sein" }),
  }),
  result: z.enum(["POSITIVE", "NEGATIVE", "POSTPONED"], {
    errorMap: () => ({ message: "Ergebnis muss POSITIVE, NEGATIVE oder POSTPONED sein" }),
  }),
  decisionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Datum im Format YYYY-MM-DD erforderlich"),
  notes: z.string().max(2000).optional(),
});
