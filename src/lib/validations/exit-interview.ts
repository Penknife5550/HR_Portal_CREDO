import { z } from "zod";

export const createExitInterviewTemplateSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich").max(200),
  description: z.string().max(1000).optional(),
  introText: z.string().max(5000).optional(),
  dsgvoText: z.string().max(5000).optional(),
  categories: z.array(z.object({
    name: z.string().min(1, "Kategoriename ist erforderlich"),
    orderIndex: z.number().int().min(0).optional(),
    questions: z.array(z.object({
      questionText: z.string().min(1, "Fragetext ist erforderlich").max(1000),
      questionType: z.enum(["RATING_5_STAR", "FREE_TEXT", "MULTIPLE_CHOICE", "SINGLE_CHOICE", "ENPS"]),
      isRequired: z.boolean().optional(),
      orderIndex: z.number().int().min(0).optional(),
      options: z.unknown().optional(),
      roleFilter: z.string().optional(),
    })).min(1, "Mindestens eine Frage pro Kategorie"),
  })).min(1, "Mindestens eine Kategorie"),
});
