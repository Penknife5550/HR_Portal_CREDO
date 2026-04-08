/**
 * API: /api/beurteilung-templates/[id]
 *
 * GET    – Einzelne Vorlage mit Kategorien + Kriterien
 * PUT    – Vorlage aktualisieren (Replace-Strategie für Kategorien/Kriterien, Version inkrementiert)
 * DELETE – Soft-Delete (isActive: false), wenn keine Assessments referenzieren —
 *          sonst 409.
 *
 * Auth: SUPER_ADMIN, HR_LEITUNG
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { updateBeurteilungTemplateSchema } from "@/lib/validations/beurteilung";

const ALLOWED_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];

type RouteContext = { params: Promise<{ id: string }> };

// =============================================
// GET /api/beurteilung-templates/[id]
// =============================================
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 },
      );
    }
    if (!ALLOWED_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id } = await context.params;

    const template = await prisma.beurteilungTemplate.findUnique({
      where: { id },
      include: {
        organization: {
          select: { id: true, name: true, mandantNumber: true },
        },
        categories: {
          orderBy: { orderIndex: "asc" },
          include: { criteria: { orderBy: { orderIndex: "asc" } } },
        },
      },
    });

    if (!template) {
      return NextResponse.json(
        { error: "Vorlage nicht gefunden" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: template });
  } catch (error) {
    console.error("Fehler beim Laden der Beurteilungs-Vorlage:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 },
    );
  }
}

// =============================================
// PUT /api/beurteilung-templates/[id]
// =============================================
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 },
      );
    }
    if (!ALLOWED_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id } = await context.params;

    const existing = await prisma.beurteilungTemplate.findUnique({
      where: { id },
      select: { id: true, isActive: true, organizationId: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Vorlage nicht gefunden" },
        { status: 404 },
      );
    }
    if (!existing.isActive) {
      return NextResponse.json(
        { error: "Deaktivierte Vorlagen können nicht bearbeitet werden" },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = updateBeurteilungTemplateSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const {
      name,
      description,
      scaleType,
      scaleLabels,
      isActive,
      isDefault,
      categories,
    } = parsed.data;

    const updated = await prisma.$transaction(async (tx) => {
      // Wenn isDefault gesetzt wird: bestehende Defaults im selben Scope abräumen
      if (isDefault) {
        await tx.beurteilungTemplate.updateMany({
          where: {
            organizationId: existing.organizationId,
            isDefault: true,
            id: { not: id },
          },
          data: { isDefault: false },
        });
      }

      // Kategorien komplett ersetzen (Cascade löscht Kriterien automatisch)
      await tx.beurteilungTemplateCategory.deleteMany({
        where: { templateId: id },
      });

      await tx.beurteilungTemplate.update({
        where: { id },
        data: {
          name,
          description: description ?? null,
          scaleType,
          scaleLabels,
          isActive: isActive ?? true,
          isDefault: isDefault ?? false,
          version: { increment: 1 },
        },
      });

      for (const cat of categories) {
        await tx.beurteilungTemplateCategory.create({
          data: {
            templateId: id,
            name: cat.name,
            description: cat.description ?? null,
            weight: cat.weight ?? 1.0,
            orderIndex: cat.orderIndex ?? 0,
            isMandatory: cat.isMandatory ?? false,
            legalReference: cat.legalReference ?? null,
            criteria: {
              create: cat.criteria.map((crit, cri) => ({
                name: crit.name,
                description: crit.description ?? null,
                weight: crit.weight ?? 1.0,
                orderIndex: crit.orderIndex ?? cri,
              })),
            },
          },
        });
      }

      return tx.beurteilungTemplate.findUnique({
        where: { id },
        include: {
          organization: {
            select: { id: true, name: true, mandantNumber: true },
          },
          categories: {
            orderBy: { orderIndex: "asc" },
            include: { criteria: { orderBy: { orderIndex: "asc" } } },
          },
        },
      });
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("Fehler beim Aktualisieren der Beurteilungs-Vorlage:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 },
    );
  }
}

// =============================================
// DELETE /api/beurteilung-templates/[id]
// Soft-Delete mit In-Use-Schutz (409 wenn referenziert)
// =============================================
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 },
      );
    }
    if (!ALLOWED_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id } = await context.params;

    const existing = await prisma.beurteilungTemplate.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Vorlage nicht gefunden" },
        { status: 404 },
      );
    }
    if (!existing.isActive) {
      return NextResponse.json(
        { error: "Vorlage ist bereits deaktiviert" },
        { status: 400 },
      );
    }

    // In-Use-Check: Wird die Vorlage von einer Beurteilung referenziert?
    const inUse = await prisma.civilServiceAssessment.count({
      where: { templateId: id },
    });
    if (inUse > 0) {
      return NextResponse.json(
        {
          error: `Vorlage wird von ${inUse} Beurteilung(en) verwendet und kann nicht gelöscht werden. Sie wurde nicht deaktiviert.`,
        },
        { status: 409 },
      );
    }

    const updated = await prisma.beurteilungTemplate.update({
      where: { id },
      data: { isActive: false, isDefault: false },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("Fehler beim Deaktivieren der Beurteilungs-Vorlage:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 },
    );
  }
}
