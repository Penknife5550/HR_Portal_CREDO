/**
 * API: /api/offboarding/:id/return-items
 *
 * GET   – Alle Rueckgabe-Items auflisten
 * POST  – Neues Rueckgabe-Item hinzufuegen
 * PATCH – Rueckgabe-Item aktualisieren (itemId im Body)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

const VALID_RETURN_CATEGORIES = [
  "IT_HARDWARE",
  "SCHLUESSEL",
  "FAHRZEUG",
  "DOKUMENTE",
  "KLEIDUNG",
  "SPEICHERMEDIEN",
  "SONSTIGES",
];

// =============================================
// GET /api/offboarding/:id/return-items
// =============================================
export async function GET(
  _request: NextRequest,
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

    const { id } = await params;

    const offboarding = await prisma.offboardingProcess.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!offboarding) {
      return NextResponse.json(
        { error: "Offboarding-Vorgang nicht gefunden" },
        { status: 404 }
      );
    }

    const items = await prisma.returnItem.findMany({
      where: { offboardingId: id },
      orderBy: [{ category: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Fehler beim Laden der Rueckgabe-Items:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// POST /api/offboarding/:id/return-items
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

    const { id } = await params;
    const body = await request.json();
    const { category, itemName, serialNumber, notes } = body;

    // Validierung
    if (!category || !itemName) {
      return NextResponse.json(
        { error: "category und itemName sind Pflichtfelder" },
        { status: 400 }
      );
    }

    if (!VALID_RETURN_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: `Ungueltige Kategorie. Erlaubt: ${VALID_RETURN_CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    }

    // Pruefen ob Offboarding existiert
    const offboarding = await prisma.offboardingProcess.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!offboarding) {
      return NextResponse.json(
        { error: "Offboarding-Vorgang nicht gefunden" },
        { status: 404 }
      );
    }

    const item = await prisma.returnItem.create({
      data: {
        offboardingId: id,
        category: category as never,
        itemName,
        serialNumber: serialNumber || null,
        notes: notes || null,
      },
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error("Fehler beim Erstellen des Rueckgabe-Items:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// PATCH /api/offboarding/:id/return-items
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

    const { id } = await params;
    const body = await request.json();
    const { itemId, isReturned, condition, notes, serialNumber } = body;

    if (!itemId) {
      return NextResponse.json(
        { error: "itemId ist erforderlich" },
        { status: 400 }
      );
    }

    // Pruefen ob das Item existiert und zum Offboarding gehoert
    const existing = await prisma.returnItem.findUnique({
      where: { id: itemId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Rückgabe-Item nicht gefunden" },
        { status: 404 }
      );
    }

    if (existing.offboardingId !== id) {
      return NextResponse.json(
        { error: "Item gehoert nicht zu diesem Offboarding" },
        { status: 403 }
      );
    }

    // Update-Daten zusammenbauen
    const updateData: Record<string, unknown> = {};

    if (typeof isReturned === "boolean") {
      updateData.isReturned = isReturned;
      if (isReturned) {
        updateData.returnedAt = new Date();
        updateData.returnedToId = session.userId;
      } else {
        updateData.returnedAt = null;
        updateData.returnedToId = null;
      }
    }

    if (condition !== undefined) {
      updateData.condition = condition;
    }

    if (notes !== undefined) {
      updateData.notes = notes;
    }

    if (serialNumber !== undefined) {
      updateData.serialNumber = serialNumber;
    }

    const updated = await prisma.returnItem.update({
      where: { id: itemId },
      data: updateData,
    });

    return NextResponse.json({ item: updated });
  } catch (error) {
    console.error("Fehler beim Aktualisieren des Rueckgabe-Items:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// DELETE /api/offboarding/:id/return-items
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

    const { id } = await params;

    // itemId aus Query-Parameter oder Body lesen
    const { searchParams } = new URL(request.url);
    let itemId = searchParams.get("itemId");

    if (!itemId) {
      try {
        const body = await request.json();
        itemId = body.itemId || null;
      } catch {
        // Kein Body vorhanden
      }
    }

    if (!itemId) {
      return NextResponse.json(
        { error: "itemId ist erforderlich (als Query-Parameter oder im Body)" },
        { status: 400 }
      );
    }

    // Pruefen ob das Item existiert und zum Offboarding gehoert
    const existing = await prisma.returnItem.findUnique({
      where: { id: itemId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Rückgabe-Item nicht gefunden" },
        { status: 404 }
      );
    }

    if (existing.offboardingId !== id) {
      return NextResponse.json(
        { error: "Item gehoert nicht zu diesem Offboarding" },
        { status: 403 }
      );
    }

    await prisma.returnItem.delete({
      where: { id: itemId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Fehler beim Loeschen des Rueckgabe-Items:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
