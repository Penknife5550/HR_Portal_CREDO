/**
 * API: /api/settings/departments/[id]
 *
 * PATCH  - Abteilung aktualisieren
 * DELETE - Abteilung entfernen
 *
 * Berechtigung: SUPER_ADMIN, HR_LEITUNG
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

const ADMIN_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];

// Einfache E-Mail-Validierung
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// =============================================
// PATCH /api/settings/departments/[id]
// =============================================
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    if (!ADMIN_ROLES.includes(session.role)) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });

    const { id } = await params;
    const body = await request.json();
    const { email, departmentName, isActive } = body;

    // Pruefen ob Abteilung existiert
    const existing = await prisma.departmentConfig.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Abteilung nicht gefunden" }, { status: 404 });

    // Validierung
    if (email !== undefined && !isValidEmail(email.trim())) {
      return NextResponse.json({ error: "E-Mail-Adresse ist nicht gueltig" }, { status: 400 });
    }

    const updated = await prisma.departmentConfig.update({
      where: { id },
      data: {
        ...(email !== undefined && { email: email.trim() }),
        ...(departmentName !== undefined && { departmentName: departmentName.trim() }),
        ...(isActive !== undefined && { isActive }),
      },
      include: {
        organization: true,
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("[API] Abteilung aktualisieren fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// =============================================
// DELETE /api/settings/departments/[id]
// =============================================
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    if (!ADMIN_ROLES.includes(session.role)) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });

    const { id } = await params;

    const existing = await prisma.departmentConfig.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Abteilung nicht gefunden" }, { status: 404 });

    await prisma.departmentConfig.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] Abteilung loeschen fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
