/**
 * API: /api/checklisten
 *
 * GET  – Alle Checklisten-Vorlagen auflisten (inkl. Items-Count, questionnaireType)
 * POST – Neue Vorlage erstellen (nur SUPER_ADMIN / HR_LEITUNG)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// =============================================
// GET /api/checklisten – Alle Vorlagen auflisten
// =============================================
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    const templates = await prisma.checklistTemplate.findMany({
      include: {
        items: {
          orderBy: { orderIndex: "asc" },
        },
        _count: {
          select: { items: true, onboardings: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: templates });
  } catch (error) {
    console.error("Fehler beim Laden der Checklisten-Vorlagen:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// POST /api/checklisten – Neue Vorlage erstellen
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

    // Rollencheck: Nur SUPER_ADMIN und HR_LEITUNG
    if (session.role !== "SUPER_ADMIN" && session.role !== "HR_LEITUNG") {
      return NextResponse.json(
        { error: "Keine Berechtigung. Nur SUPER_ADMIN und HR_LEITUNG duerfen Checklisten erstellen." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, description, questionnaireType, items } = body;

    // Validierung
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Name ist ein Pflichtfeld" },
        { status: 400 }
      );
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Mindestens ein Checklisten-Punkt ist erforderlich" },
        { status: 400 }
      );
    }

    // Vorlage + Items in einer Transaktion erstellen
    const template = await prisma.$transaction(async (tx) => {
      const created = await tx.checklistTemplate.create({
        data: {
          name: name.trim(),
          description: description?.trim() || null,
          questionnaireType: questionnaireType || null,
          items: {
            create: items.map((item: {
              title: string;
              category: string;
              orderIndex?: number;
              defaultDueDays?: number | null;
              defaultAssignee?: string | null;
            }, index: number) => ({
              title: item.title.trim(),
              category: item.category.trim(),
              orderIndex: item.orderIndex ?? index,
              defaultDueDays: item.defaultDueDays ?? null,
              defaultAssignee: item.defaultAssignee?.trim() || null,
            })),
          },
        },
        include: {
          items: {
            orderBy: { orderIndex: "asc" },
          },
          _count: {
            select: { items: true, onboardings: true },
          },
        },
      });

      return created;
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error("Fehler beim Erstellen der Checklisten-Vorlage:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
