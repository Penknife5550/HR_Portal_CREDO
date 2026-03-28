/**
 * API: /api/exit-interview-templates
 *
 * GET  – Alle Exit-Interview-Templates auflisten (mit Kategorien & Fragen)
 * POST – Neues Template anlegen
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { adminHandler } from "@/lib/api-handler";
import { ExitInterviewQuestionType } from "@prisma/client";
import { createExitInterviewTemplateSchema } from "@/lib/validations/exit-interview";

const LOG_LABEL = "Exit-Interview Templates";

// =============================================
// GET /api/exit-interview-templates – Alle Templates auflisten
// =============================================
export const GET = adminHandler(async ({ session }) => {
  const templates = await prisma.exitInterviewTemplate.findMany({
    where: { isActive: true },
    include: {
      categories: {
        orderBy: { orderIndex: "asc" },
        include: {
          questions: {
            orderBy: { orderIndex: "asc" },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: templates });
}, { logLabel: LOG_LABEL });

// =============================================
// POST /api/exit-interview-templates – Neues Template anlegen
// =============================================
export const POST = adminHandler<{
  name: string;
  description?: string;
  introText?: string;
  dsgvoText?: string;
  categories: Array<{
    name: string;
    orderIndex?: number;
    questions: Array<{
      questionText: string;
      questionType: ExitInterviewQuestionType;
      isRequired?: boolean;
      orderIndex?: number;
      options?: unknown;
      roleFilter?: string;
    }>;
  }>;
}>(async ({ body }) => {
  const { name, description, introText, dsgvoText, categories } = body;

  const template = await prisma.$transaction(async (tx) => {
    const created = await tx.exitInterviewTemplate.create({
      data: {
        name: name.trim(),
        description: description || null,
        introText: introText || null,
        dsgvoText: dsgvoText || null,
        categories: {
          create: categories.map(
            (cat, catIdx) => ({
              name: cat.name,
              orderIndex: cat.orderIndex ?? catIdx,
              questions: {
                create: cat.questions.map(
                  (q, qIdx) => ({
                    questionText: q.questionText,
                    questionType: q.questionType,
                    isRequired: q.isRequired ?? true,
                    orderIndex: q.orderIndex ?? qIdx,
                    options: q.options ?? undefined,
                    roleFilter: q.roleFilter || null,
                  })
                ),
              },
            })
          ),
        },
      },
      include: {
        categories: {
          orderBy: { orderIndex: "asc" },
          include: {
            questions: {
              orderBy: { orderIndex: "asc" },
            },
          },
        },
      },
    });

    return created;
  });

  return NextResponse.json({ data: template }, { status: 201 });
}, { bodySchema: createExitInterviewTemplateSchema, logLabel: LOG_LABEL });
