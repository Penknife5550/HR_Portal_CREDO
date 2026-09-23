/**
 * API: /api/checklisten/:id/items
 *
 * POST   – Neues Item zur Vorlage hinzufuegen
 * PATCH  – Bestehendes Item bearbeiten (erfordert itemId im Body)
 * DELETE – Item entfernen (erfordert itemId als Query-Param)
 *
 * Paket 5: Beide schreibenden Methoden pruefen den Rumpf mit
 * `checklistenPunktSchema` bzw. `checklistenPunktPatchSchema`. Die Routen
 * bleiben als API bestehen; der Editor speichert seit Paket 5 ueber
 * PUT /api/checklisten/[id] — in EINEM Schritt statt „alles loeschen, neu
 * anlegen".
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  checklistenFehlerMeldung,
  checklistenPunktPatchSchema,
  checklistenPunktSchema,
} from "@/lib/validations/abteilungsaufgaben";

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

    const roh = await request.json().catch(() => undefined);
    const geprueft = checklistenPunktSchema.safeParse(roh);
    if (!geprueft.success) {
      return NextResponse.json(
        { error: checklistenFehlerMeldung(geprueft.error) },
        { status: 400 }
      );
    }
    const punkt = geprueft.data;

    // Vorlage pruefen
    const template = await prisma.checklistTemplate.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!template) {
      return NextResponse.json(
        { error: "Checklisten-Vorlage nicht gefunden" },
        { status: 404 }
      );
    }

    // Naechsten orderIndex ermitteln, falls nicht angegeben
    let finalOrderIndex = punkt.orderIndex;
    if (finalOrderIndex === undefined) {
      const maxItem = await prisma.checklistTemplateItem.findFirst({
        where: { templateId: id },
        orderBy: { orderIndex: "desc" },
        select: { orderIndex: true },
      });
      finalOrderIndex = (maxItem?.orderIndex ?? -1) + 1;
    }

    // Ein mitgeschicktes `id` wird uebergangen — hier entsteht ein neuer Punkt.
    const item = await prisma.checklistTemplateItem.create({
      data: {
        templateId: id,
        title: punkt.title,
        category: punkt.category,
        orderIndex: finalOrderIndex,
        defaultDueDays: punkt.defaultDueDays ?? null,
        defaultAssignee: punkt.defaultAssignee ?? null,
        description: punkt.description ?? null,
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

    const roh = await request.json().catch(() => undefined);
    const itemId =
      typeof roh === "object" && roh !== null
        ? (roh as { itemId?: unknown }).itemId
        : undefined;
    if (typeof itemId !== "string" || itemId.trim().length === 0) {
      return NextResponse.json(
        { error: "itemId ist erforderlich" },
        { status: 400 }
      );
    }

    const geprueft = checklistenPunktPatchSchema.safeParse(roh);
    if (!geprueft.success) {
      return NextResponse.json(
        { error: checklistenFehlerMeldung(geprueft.error) },
        { status: 400 }
      );
    }
    const punkt = geprueft.data;

    // Item pruefen (muss zur Vorlage gehoeren)
    const existing = await prisma.checklistTemplateItem.findFirst({
      where: { id: itemId, templateId: id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Checklisten-Punkt nicht gefunden oder gehoert nicht zu dieser Vorlage" },
        { status: 404 }
      );
    }

    // Update-Daten zusammenbauen: `undefined` = nicht mitgeschickt (unveraendert),
    // `null` = ausdruecklich geleert.
    const updateData: Record<string, unknown> = {};
    if (punkt.title !== undefined) updateData.title = punkt.title;
    if (punkt.category !== undefined) updateData.category = punkt.category;
    if (punkt.orderIndex !== undefined) updateData.orderIndex = punkt.orderIndex;
    if (punkt.defaultDueDays !== undefined) updateData.defaultDueDays = punkt.defaultDueDays;
    if (punkt.defaultAssignee !== undefined) updateData.defaultAssignee = punkt.defaultAssignee;
    if (punkt.description !== undefined) updateData.description = punkt.description;

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
