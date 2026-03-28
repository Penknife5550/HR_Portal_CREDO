/**
 * API: /api/offboarding/:id/checklist
 *
 * GET – Alle Checklisten-Items eines Offboardings abrufen
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// =============================================
// GET /api/offboarding/:id/checklist
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

    const items = await prisma.offboardingChecklistItem.findMany({
      where: { offboardingId: id },
      orderBy: [{ category: "asc" }, { orderIndex: "asc" }],
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Fehler beim Laden der Checkliste:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
