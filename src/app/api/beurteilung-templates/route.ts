/**
 * API: /api/beurteilung-templates
 *
 * GET  – Alle Beurteilungs-Vorlagen auflisten
 *        Query-Param `organizationId` filtert auf einen Mandanten (oder "global"
 *        für die globalen Vorlagen mit organizationId == null).
 * POST – Neue Vorlage anlegen (mit Kategorien + Kriterien in einer Transaktion).
 *
 * Auth: SUPER_ADMIN, HR_LEITUNG
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { createBeurteilungTemplateSchema } from "@/lib/validations/beurteilung";

const ALLOWED_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];

// =============================================
// GET /api/beurteilung-templates
// =============================================
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");
    const includeInactive = searchParams.get("includeInactive") === "true";

    const where: Record<string, unknown> = {};
    if (!includeInactive) where.isActive = true;
    if (organizationId === "global") {
      where.organizationId = null;
    } else if (organizationId) {
      where.organizationId = organizationId;
    }

    const templates = await prisma.beurteilungTemplate.findMany({
      where,
      include: {
        organization: { select: { id: true, name: true, mandantNumber: true } },
        categories: {
          orderBy: { orderIndex: "asc" },
          include: {
            criteria: { orderBy: { orderIndex: "asc" } },
          },
        },
        _count: { select: { categories: true } },
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ data: templates });
  } catch (error) {
    console.error("Fehler beim Laden der Beurteilungs-Vorlagen:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 },
    );
  }
}

// =============================================
// POST /api/beurteilung-templates
// =============================================
export async function POST(request: NextRequest) {
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

    const body = await request.json().catch(() => null);
    const parsed = createBeurteilungTemplateSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const {
      name,
      description,
      scaleType,
      scaleLabels,
      organizationId,
      isActive,
      isDefault,
      categories,
    } = parsed.data;

    // organizationId validieren (falls gesetzt, muss er existieren)
    if (organizationId) {
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true },
      });
      if (!org) {
        return NextResponse.json(
          { error: "Mandant nicht gefunden" },
          { status: 400 },
        );
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      // Wenn isDefault gesetzt: alle anderen im selben Scope auf false
      if (isDefault) {
        await tx.beurteilungTemplate.updateMany({
          where: { organizationId: organizationId ?? null, isDefault: true },
          data: { isDefault: false },
        });
      }

      const tmpl = await tx.beurteilungTemplate.create({
        data: {
          name,
          description: description ?? null,
          scaleType,
          scaleLabels,
          organizationId: organizationId ?? null,
          isActive: isActive ?? true,
          isDefault: isDefault ?? false,
          version: 1,
          categories: {
            create: categories.map((cat, ci) => ({
              name: cat.name,
              description: cat.description ?? null,
              weight: cat.weight ?? 1.0,
              orderIndex: cat.orderIndex ?? ci,
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
            })),
          },
        },
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

      return tmpl;
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("Fehler beim Erstellen der Beurteilungs-Vorlage:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 },
    );
  }
}
