/**
 * API: /api/checklisten/:id
 *
 * GET    – Einzelne Vorlage mit allen Items abrufen
 * PATCH  – Vorlage bearbeiten (name, description, questionnaireType, isActive)
 * DELETE – Vorlage löschen (nur wenn nicht in Verwendung)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// =============================================
// GET /api/checklisten/:id – Einzelne Vorlage
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

    const template = await prisma.checklistTemplate.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { orderIndex: "asc" },
        },
        _count: {
          select: { items: true, onboardings: true },
        },
      },
    });

    if (!template) {
      return NextResponse.json(
        { error: "Checklisten-Vorlage nicht gefunden" },
        { status: 404 }
      );
    }

    return NextResponse.json(template);
  } catch (error) {
    console.error("Fehler beim Laden der Checklisten-Vorlage:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// PATCH /api/checklisten/:id – Vorlage bearbeiten
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
        { error: "Keine Berechtigung. Nur SUPER_ADMIN und HR_LEITUNG duerfen Checklisten bearbeiten." },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { name, description, questionnaireType, isActive } = body;

    // Vorlage pruefen
    const existing = await prisma.checklistTemplate.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Checklisten-Vorlage nicht gefunden" },
        { status: 404 }
      );
    }

    // Update-Daten zusammenbauen
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (questionnaireType !== undefined) updateData.questionnaireType = questionnaireType || null;
    if (isActive !== undefined) updateData.isActive = isActive;

    const updated = await prisma.checklistTemplate.update({
      where: { id },
      data: updateData,
      include: {
        items: {
          orderBy: { orderIndex: "asc" },
        },
        _count: {
          select: { items: true, onboardings: true },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Fehler beim Aktualisieren der Checklisten-Vorlage:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// DELETE /api/checklisten/:id – Vorlage löschen
// =============================================
export async function DELETE(
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

    // Rollencheck
    if (session.role !== "SUPER_ADMIN" && session.role !== "HR_LEITUNG") {
      return NextResponse.json(
        { error: "Keine Berechtigung. Nur SUPER_ADMIN und HR_LEITUNG dürfen Checklisten löschen." },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Pruefen ob Vorlage existiert
    const existing = await prisma.checklistTemplate.findUnique({
      where: { id },
      include: {
        _count: {
          select: { onboardings: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Checklisten-Vorlage nicht gefunden" },
        { status: 404 }
      );
    }

    // Pruefen ob Vorlage in Verwendung ist
    if (existing._count.onboardings > 0) {
      return NextResponse.json(
        {
          error: `Diese Vorlage wird von ${existing._count.onboardings} Onboarding-Vorgang/Vorgängen verwendet und kann nicht gelöscht werden.`,
        },
        { status: 409 }
      );
    }

    // Vorlage löschen (Cascade loescht auch die Template-Items)
    await prisma.checklistTemplate.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Fehler beim Löschen der Checklisten-Vorlage:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
