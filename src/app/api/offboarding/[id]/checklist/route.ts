/**
 * API: /api/offboarding/:id/checklist
 *
 * GET – Alle Checklisten-Items eines Offboardings abrufen
 *
 * Rolle PORTAL_ROLES, Mandant per canAccessProcess. Ein Vorgang eines fremden
 * Mandanten bekommt dieselbe 404 mit demselben Text wie ein unbekannter —
 * die Antwort verraet nicht, dass es ihn gibt.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessProcess, PORTAL_ROLES } from "@/lib/permissions";
import { MELDUNGEN } from "@/lib/abteilungsaufgaben";

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
    if (!PORTAL_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id } = await params;

    const offboarding = await prisma.offboardingProcess.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    });

    if (!offboarding || !(await canAccessProcess(session, offboarding.organizationId))) {
      return NextResponse.json(
        { error: MELDUNGEN.VORGANG_NICHT_GEFUNDEN },
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
