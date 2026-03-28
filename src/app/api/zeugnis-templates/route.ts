/**
 * API: /api/zeugnis-templates
 *
 * GET  – Alle Bewertungs-Templates auflisten (mit Kategorien, Kriterien, Formulierungen)
 * POST – Neues Bewertungs-Template anlegen
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { createZeugnisTemplateSchema } from "@/lib/validations/zeugnis";

const ALLOWED_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];
const VALID_JOB_GROUPS = ["LEHRKRAFT", "ERZIEHER", "VERWALTUNG", "SCHULLEITUNG", "SONSTIGES"];

// =============================================
// GET /api/zeugnis-templates – Alle Templates auflisten
// =============================================
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const jobGroup = searchParams.get("jobGroup");
    const includeInactive = searchParams.get("includeInactive") === "true";

    const where: Record<string, unknown> = {};
    if (!includeInactive) where.isActive = true;
    if (jobGroup && VALID_JOB_GROUPS.includes(jobGroup)) {
      where.jobGroup = jobGroup;
    }

    const templates = await prisma.zeugnisBewertungTemplate.findMany({
      where,
      include: {
        categories: {
          orderBy: { orderIndex: "asc" },
          include: {
            criteria: {
              orderBy: { orderIndex: "asc" },
            },
          },
        },
        formulierungen: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: templates });
  } catch (error) {
    console.error("Fehler beim Laden der Zeugnis-Templates:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// POST /api/zeugnis-templates – Neues Template anlegen
// =============================================
export async function POST(request: NextRequest) {
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

    const body = await request.json().catch(() => null);
    const parsed = createZeugnisTemplateSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const { name, jobGroup, description, categories, formulierungen } = parsed.data;

    // Alles in einer Transaktion erstellen
    const template = await prisma.$transaction(async (tx) => {
      const created = await tx.zeugnisBewertungTemplate.create({
        data: {
          name,
          jobGroup,
          description: description || null,
        },
      });

      // Kategorien mit Kriterien erstellen
      for (const cat of categories) {
        const createdCat = await tx.zeugnisBewertungTemplateCategory.create({
          data: {
            templateId: created.id,
            name: cat.name,
            description: cat.description || null,
            weight: cat.weight ?? 1.0,
            orderIndex: cat.orderIndex ?? 0,
          },
        });

        if (cat.criteria && Array.isArray(cat.criteria)) {
          await tx.zeugnisBewertungTemplateCriterion.createMany({
            data: cat.criteria.map((crit: { name: string; description?: string; weight?: number; orderIndex?: number }) => ({
              categoryId: createdCat.id,
              name: crit.name,
              description: crit.description || null,
              weight: crit.weight ?? 1.0,
              orderIndex: crit.orderIndex ?? 0,
            })),
          });
        }
      }

      // Formulierungen erstellen
      if (formulierungen && Array.isArray(formulierungen) && formulierungen.length > 0) {
        await tx.zeugnisFormulierung.createMany({
          data: formulierungen.map((f: { criterionKey: string; grade: number; formulation: string }) => ({
            templateId: created.id,
            criterionKey: f.criterionKey,
            grade: f.grade,
            formulation: f.formulation,
          })),
        });
      }

      // Vollstaendiges Template zurueckladen
      return tx.zeugnisBewertungTemplate.findUnique({
        where: { id: created.id },
        include: {
          categories: {
            orderBy: { orderIndex: "asc" },
            include: {
              criteria: {
                orderBy: { orderIndex: "asc" },
              },
            },
          },
          formulierungen: true,
        },
      });
    });

    return NextResponse.json({ data: template }, { status: 201 });
  } catch (error) {
    console.error("Fehler beim Erstellen des Zeugnis-Templates:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
