/**
 * API: /api/vorlagen/:id
 *
 * GET   – Einzelne Vorlage abrufen
 * PATCH – Vorlage aktualisieren (nur SUPER_ADMIN / HR_LEITUNG)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// =============================================
// GET /api/vorlagen/:id
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

    const template = await prisma.formTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return NextResponse.json(
        { error: "Vorlage nicht gefunden" },
        { status: 404 }
      );
    }

    return NextResponse.json(template);
  } catch (error) {
    console.error("Fehler beim Laden der Vorlage:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// PATCH /api/vorlagen/:id – Vorlage aktualisieren
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

    // Rollencheck: Nur SUPER_ADMIN und HR_LEITUNG duerfen aendern
    if (session.role !== "SUPER_ADMIN" && session.role !== "HR_LEITUNG") {
      return NextResponse.json(
        { error: "Keine Berechtigung. Nur SUPER_ADMIN und HR_LEITUNG duerfen Vorlagen bearbeiten." },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { stepsConfig, name, description, isActive } = body;

    // Vorlage pruefen
    const existing = await prisma.formTemplate.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Vorlage nicht gefunden" },
        { status: 404 }
      );
    }

    // Update-Daten zusammenbauen
    const updateData: Record<string, unknown> = {};
    if (stepsConfig !== undefined) updateData.stepsConfig = stepsConfig;
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (isActive !== undefined) updateData.isActive = isActive;

    const updated = await prisma.formTemplate.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Fehler beim Aktualisieren der Vorlage:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
