import { z } from "zod";

export const createZeugnisTemplateSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich").max(200),
  jobGroup: z.enum(["LEHRKRAFT", "ERZIEHER", "VERWALTUNG", "SCHULLEITUNG", "SONSTIGES"]),
  description: z.string().max(1000).optional(),
  categories: z.array(z.object({
    name: z.string().min(1, "Kategoriename ist erforderlich"),
    description: z.string().optional(),
    weight: z.number().positive().optional(),
    orderIndex: z.number().int().min(0).optional(),
    criteria: z.array(z.object({
      name: z.string().min(1, "Kriteriumsname ist erforderlich"),
      description: z.string().optional(),
      weight: z.number().positive().optional(),
      orderIndex: z.number().int().min(0).optional(),
    })).optional(),
  })).min(1, "Mindestens eine Kategorie"),
  formulierungen: z.array(z.object({
    criterionKey: z.string().min(1),
    grade: z.number().int().min(1).max(6),
    formulation: z.string().min(1),
  })).optional(),
});

export const createZeugnisBewertungSchema = z.object({
  supervisorEmail: z.string().email("Ungueltige E-Mail-Adresse"),
  supervisorName: z.string().max(200).optional(),
  jobGroup: z.enum(["LEHRKRAFT", "ERZIEHER", "VERWALTUNG", "SCHULLEITUNG", "SONSTIGES"]),
});

export const saveZeugnisRatingsSchema = z.object({
  ratings: z.array(z.object({
    snapshotCriterionId: z.string().min(1, "snapshotCriterionId ist erforderlich"),
    snapshotCategoryId: z.string().min(1, "snapshotCategoryId ist erforderlich"),
    grade: z.number().int().min(1, "grade muss mindestens 1 sein").max(6, "grade darf maximal 6 sein"),
    comment: z.string().max(1000).optional(),
  })).min(1, "Mindestens eine Bewertung erforderlich"),
});
