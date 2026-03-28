/**
 * API: /api/zeugnis-templates/[id]
 *
 * GET    – Einzelnes Template mit vollstaendigem Baum (Kategorien → Kriterien + Formulierungen)
 * PUT    – Template aktualisieren (Kategorien/Kriterien/Formulierungen komplett ersetzen, Version erhoehen)
 * DELETE – Soft Delete (isActive=false)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

const ALLOWED_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];
const VALID_JOB_GROUPS = ["LEHRKRAFT", "ERZIEHER", "VERWALTUNG", "SCHULLEITUNG", "SONSTIGES"];

// =============================================
// GET /api/zeugnis-templates/[id] – Einzelnes Template
// =============================================
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const { id } = await params;

    const template = await prisma.zeugnisBewertungTemplate.findUnique({
      where: { id },
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

    if (!template) {
      return NextResponse.json(
        { error: "Template nicht gefunden" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: template });
  } catch (error) {
    console.error("Fehler beim Laden des Zeugnis-Templates:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// PUT /api/zeugnis-templates/[id] – Template aktualisieren
// =============================================
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const { id } = await params;
    const body = await request.json();
    const { name, jobGroup, description, categories, formulierungen } = body;

    // Template existiert?
    const existing = await prisma.zeugnisBewertungTemplate.findUnique({
      where: { id },
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

    // Validierung
    if (name !== undefined && !name) {
      return NextResponse.json(
        { error: "Name darf nicht leer sein" },
        { status: 400 }
      );
    }

    if (jobGroup !== undefined && !VALID_JOB_GROUPS.includes(jobGroup)) {
      return NextResponse.json(
        { error: `Ungueltige jobGroup. Erlaubt: ${VALID_JOB_GROUPS.join(", ")}` },
        { status: 400 }
      );
    }

    if (categories !== undefined) {
      if (!Array.isArray(categories) || categories.length === 0) {
        return NextResponse.json(
          { error: "Mindestens eine Kategorie ist erforderlich" },
          { status: 400 }
        );
      }
      for (const cat of categories) {
        if (!cat.name) {
          return NextResponse.json(
            { error: "Jede Kategorie muss einen Namen haben" },
            { status: 400 }
          );
        }
        if (cat.criteria && Array.isArray(cat.criteria)) {
          for (const crit of cat.criteria) {
            if (!crit.name) {
              return NextResponse.json(
                { error: "Jedes Kriterium muss einen Namen haben" },
                { status: 400 }
              );
            }
          }
        }
      }
    }

    if (formulierungen !== undefined && Array.isArray(formulierungen)) {
      for (const f of formulierungen) {
        if (!f.criterionKey || f.grade == null || !f.formulation) {
          return NextResponse.json(
            { error: "Jede Formulierung muss criterionKey, grade und formulation enthalten" },
            { status: 400 }
          );
        }
      }
    }

    // Alles in einer Transaktion aktualisieren
    const template = await prisma.$transaction(async (tx) => {
      // Template-Stammdaten aktualisieren + Version erhoehen
      await tx.zeugnisBewertungTemplate.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(jobGroup !== undefined && { jobGroup }),
          ...(description !== undefined && { description: description || null }),
          version: { increment: 1 },
        },
      });

      // Kategorien und Kriterien komplett ersetzen (Cascade loescht Kriterien automatisch)
      if (categories !== undefined) {
        await tx.zeugnisBewertungTemplateCategory.deleteMany({
          where: { templateId: id },
        });

        for (const cat of categories) {
          const createdCat = await tx.zeugnisBewertungTemplateCategory.create({
            data: {
              templateId: id,
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
      }

      // Formulierungen komplett ersetzen
      if (formulierungen !== undefined) {
        await tx.zeugnisFormulierung.deleteMany({
          where: { templateId: id },
        });

        if (Array.isArray(formulierungen) && formulierungen.length > 0) {
          await tx.zeugnisFormulierung.createMany({
            data: formulierungen.map((f: { criterionKey: string; grade: number; formulation: string }) => ({
              templateId: id,
              criterionKey: f.criterionKey,
              grade: f.grade,
              formulation: f.formulation,
            })),
          });
        }
      }

      // Aktualisiertes Template zurueckladen
      return tx.zeugnisBewertungTemplate.findUnique({
        where: { id },
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

    return NextResponse.json({ data: template });
  } catch (error) {
    console.error("Fehler beim Aktualisieren des Zeugnis-Templates:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// DELETE /api/zeugnis-templates/[id] – Soft Delete
// =============================================
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const { id } = await params;

    const existing = await prisma.zeugnisBewertungTemplate.findUnique({
      where: { id },
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

    const template = await prisma.zeugnisBewertungTemplate.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ data: template });
  } catch (error) {
    console.error("Fehler beim Deaktivieren des Zeugnis-Templates:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
