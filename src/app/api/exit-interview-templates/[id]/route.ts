/**
 * API: /api/exit-interview-templates/[id]
 *
 * GET    – Einzelnes Template mit Kategorien & Fragen laden
 * PUT    – Template aktualisieren (Kategorien/Fragen werden neu erstellt)
 * DELETE – Template deaktivieren (Soft Delete)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ExitInterviewQuestionType } from "@prisma/client";

const ALLOWED_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];

type RouteContext = { params: Promise<{ id: string }> };

// =============================================
// GET /api/exit-interview-templates/[id]
// =============================================
export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }
    if (!ALLOWED_ROLES.includes(session.role)) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    const template = await prisma.exitInterviewTemplate.findUnique({
      where: { id },
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

    if (!template) {
      return NextResponse.json(
        { error: "Template nicht gefunden" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: template });
  } catch (error) {
    console.error("Fehler beim Laden des Exit-Interview-Templates:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// PUT /api/exit-interview-templates/[id]
// =============================================
export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }
    if (!ALLOWED_ROLES.includes(session.role)) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const body = await request.json();
    const { name, description, introText, dsgvoText, categories } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Name ist ein Pflichtfeld" },
        { status: 400 }
      );
    }

    if (!categories || !Array.isArray(categories) || categories.length === 0) {
      return NextResponse.json(
        { error: "Mindestens eine Kategorie mit Fragen ist erforderlich" },
        { status: 400 }
      );
    }

    // Validierung: Jede Kategorie braucht mindestens eine Frage
    for (const cat of categories) {
      if (!cat.name || typeof cat.name !== "string") {
        return NextResponse.json(
          { error: "Jede Kategorie benoetigt einen Namen" },
          { status: 400 }
        );
      }
      if (!cat.questions || !Array.isArray(cat.questions) || cat.questions.length === 0) {
        return NextResponse.json(
          { error: `Kategorie "${cat.name}" benoetigt mindestens eine Frage` },
          { status: 400 }
        );
      }
    }

    // Pruefen ob Template existiert
    const existing = await prisma.exitInterviewTemplate.findUnique({
      where: { id },
      select: { id: true, isActive: true, version: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Template nicht gefunden" },
        { status: 404 }
      );
    }

    if (!existing.isActive) {
      return NextResponse.json(
        { error: "Template ist deaktiviert und kann nicht bearbeitet werden" },
        { status: 400 }
      );
    }

    const template = await prisma.$transaction(async (tx) => {
      // Alte Kategorien loeschen (Cascade loescht auch Fragen)
      await tx.exitInterviewTemplateCategory.deleteMany({
        where: { templateId: id },
      });

      // Template aktualisieren mit neuen Kategorien/Fragen
      const updated = await tx.exitInterviewTemplate.update({
        where: { id },
        data: {
          name: name.trim(),
          description: description || null,
          introText: introText || null,
          dsgvoText: dsgvoText || null,
          version: existing.version + 1,
          categories: {
            create: categories.map(
              (cat: { name: string; orderIndex?: number; questions: Array<{ questionText: string; questionType: ExitInterviewQuestionType; isRequired?: boolean; orderIndex?: number; options?: unknown; roleFilter?: string }> }, catIdx: number) => ({
                name: cat.name,
                orderIndex: cat.orderIndex ?? catIdx,
                questions: {
                  create: cat.questions.map(
                    (q: { questionText: string; questionType: ExitInterviewQuestionType; isRequired?: boolean; orderIndex?: number; options?: unknown; roleFilter?: string }, qIdx: number) => ({
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

      return updated;
    });

    return NextResponse.json({ data: template });
  } catch (error) {
    console.error("Fehler beim Aktualisieren des Exit-Interview-Templates:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// DELETE /api/exit-interview-templates/[id]
// =============================================
export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }
    if (!ALLOWED_ROLES.includes(session.role)) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    const existing = await prisma.exitInterviewTemplate.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Template nicht gefunden" },
        { status: 404 }
      );
    }

    if (!existing.isActive) {
      return NextResponse.json(
        { error: "Template ist bereits deaktiviert" },
        { status: 400 }
      );
    }

    await prisma.exitInterviewTemplate.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("Fehler beim Loeschen des Exit-Interview-Templates:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
