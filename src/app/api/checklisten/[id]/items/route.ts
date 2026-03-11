/**
 * API: /api/checklisten/:id/items
 *
 * POST   – Neues Item zur Vorlage hinzufuegen
 * PATCH  – Bestehendes Item bearbeiten (erfordert itemId im Body)
 * DELETE – Item entfernen (erfordert itemId als Query-Param)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// =============================================
// POST /api/checklisten/:id/items – Neues Item hinzufuegen
// =============================================
export async function POST(
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

    // Rollencheck
    if (session.role !== "SUPER_ADMIN" && session.role !== "HR_LEITUNG") {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { title, category, orderIndex, defaultDueDays, defaultAssignee } = body;

    // Vorlage pruefen
    const template = await prisma.checklistTemplate.findUnique({
      where: { id },
    });
    if (!template) {
      return NextResponse.json(
        { error: "Checklisten-Vorlage nicht gefunden" },
        { status: 404 }
      );
    }

    // Validierung
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json(
        { error: "Titel ist ein Pflichtfeld" },
        { status: 400 }
      );
    }
    if (!category || typeof category !== "string" || category.trim().length === 0) {
      return NextResponse.json(
        { error: "Kategorie ist ein Pflichtfeld" },
        { status: 400 }
      );
    }

    // Naechsten orderIndex ermitteln, falls nicht angegeben
    let finalOrderIndex = orderIndex;
    if (finalOrderIndex === undefined || finalOrderIndex === null) {
      const maxItem = await prisma.checklistTemplateItem.findFirst({
        where: { templateId: id },
        orderBy: { orderIndex: "desc" },
        select: { orderIndex: true },
      });
      finalOrderIndex = (maxItem?.orderIndex ?? -1) + 1;
    }

    const item = await prisma.checklistTemplateItem.create({
      data: {
        templateId: id,
        title: title.trim(),
        category: category.trim(),
        orderIndex: finalOrderIndex,
        defaultDueDays: defaultDueDays ?? null,
        defaultAssignee: defaultAssignee?.trim() || null,
      },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error("Fehler beim Hinzufuegen des Checklisten-Punktes:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// PATCH /api/checklisten/:id/items – Item bearbeiten
// =============================================
export async function PATCH(
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

    // Rollencheck
    if (session.role !== "SUPER_ADMIN" && session.role !== "HR_LEITUNG") {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { itemId, title, category, orderIndex, defaultDueDays, defaultAssignee } = body;

    if (!itemId) {
      return NextResponse.json(
        { error: "itemId ist erforderlich" },
        { status: 400 }
      );
    }

    // Item pruefen (muss zur Vorlage gehoeren)
    const existing = await prisma.checklistTemplateItem.findFirst({
      where: { id: itemId, templateId: id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Checklisten-Punkt nicht gefunden oder gehoert nicht zu dieser Vorlage" },
        { status: 404 }
      );
    }

    // Update-Daten zusammenbauen
    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title.trim();
    if (category !== undefined) updateData.category = category.trim();
    if (orderIndex !== undefined) updateData.orderIndex = orderIndex;
    if (defaultDueDays !== undefined) updateData.defaultDueDays = defaultDueDays;
    if (defaultAssignee !== undefined) updateData.defaultAssignee = defaultAssignee?.trim() || null;

    const updated = await prisma.checklistTemplateItem.update({
      where: { id: itemId },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Fehler beim Bearbeiten des Checklisten-Punktes:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// DELETE /api/checklisten/:id/items – Item entfernen
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

    // Rollencheck
    if (session.role !== "SUPER_ADMIN" && session.role !== "HR_LEITUNG") {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get("itemId");

    if (!itemId) {
      return NextResponse.json(
        { error: "itemId ist als Query-Parameter erforderlich" },
        { status: 400 }
      );
    }

    // Item pruefen (muss zur Vorlage gehoeren)
    const existing = await prisma.checklistTemplateItem.findFirst({
      where: { id: itemId, templateId: id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Checklisten-Punkt nicht gefunden oder gehoert nicht zu dieser Vorlage" },
        { status: 404 }
      );
    }

    await prisma.checklistTemplateItem.delete({
      where: { id: itemId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Fehler beim Entfernen des Checklisten-Punktes:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
