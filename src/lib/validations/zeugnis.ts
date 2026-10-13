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
  supervisorEmail: z.string().email("Ungültige E-Mail-Adresse"),
  supervisorName: z.string().max(200).optional(),
  jobGroup: z.enum(["LEHRKRAFT", "ERZIEHER", "VERWALTUNG", "SCHULLEITUNG", "SONSTIGES"]),
});

export const saveZeugnisRatingsSchema = z.object({
  ratings: z.array(z.object({
    snapshotCriterionId: z.string().min(1, "snapshotCriterionId ist erforderlich"),
    snapshotCategoryId: z.string().min(1, "snapshotCategoryId ist erforderlich"),
    grade: z.number().int().min(1, "grade muss mindestens 1 sein").max(6, "grade darf maximal 6 sein"),
    comment: z.string().max(1000).optional().nullable(),
  })).min(1, "Mindestens eine Bewertung erforderlich"),
});

/**
 * HR-Pruefung einer eingereichten Zeugnis-Bewertung
 * (PUT /api/offboarding/:id/zeugnis-bewertung/hr-review).
 *
 * `hrOverrideGrade: null` nimmt eine Abweichung von HR zurueck; fehlt das Feld,
 * gilt dasselbe (so stand es schon vorher in der Route). `finalize: true`
 * schliesst die Bewertung ab — danach ist sie nicht mehr aenderbar.
 */
export const zeugnisHrReviewSchema = z.object({
  ratings: z
    .array(
      z.object({
        snapshotCriterionId: z.string().min(1, "Kriterium fehlt"),
        hrOverrideGrade: z
          .number({ invalid_type_error: "Die Note muss eine ganze Zahl von 1 bis 6 sein." })
          .int("Die Note muss eine ganze Zahl von 1 bis 6 sein.")
          .min(1, "Die Note muss eine ganze Zahl von 1 bis 6 sein.")
          .max(6, "Die Note muss eine ganze Zahl von 1 bis 6 sein.")
          .nullable()
          .optional(),
        hrOverrideReason: z.string().max(1000, "Die Begründung darf höchstens 1000 Zeichen lang sein.").nullable().optional(),
      })
    )
    .max(200)
    .optional(),
  hrNotes: z.string().max(5000, "Die Notiz darf höchstens 5000 Zeichen lang sein.").nullable().optional(),
  finalize: z.boolean().optional(),
});
