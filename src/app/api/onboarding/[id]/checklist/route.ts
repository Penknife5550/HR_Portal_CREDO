/**
 * API: /api/onboarding/:id/checklist
 *
 * GET – Alle Checklisten-Aufgaben dieses Onboarding-Vorgangs
 *
 * Rolle PORTAL_ROLES, Mandant per canAccessProcess. Ein Vorgang eines fremden
 * Mandanten bekommt dieselbe 404 mit demselben Text wie ein unbekannter —
 * die Antwort verraet nicht, dass es ihn gibt.
 *
 * Den frueheren POST (Aufgaben aus einer Vorlage nachtraeglich anlegen) gibt es
 * nicht mehr (Entscheidung Paket 5): Keine Oberflaeche, kein n8n-Workflow und
 * kein Test riefen ihn auf, und er war fehlerhaft — er rechnete die Faelligkeit
 * ab HEUTE statt ab dem Vertragsbeginn, verlor `defaultDueDays: 0` und pruefte
 * weder Rolle noch Mandant. Die Aufgaben entstehen beim Anlegen des Vorgangs
 * (POST /api/onboarding), die Faelligkeiten setzt faelligkeitenSetzen
 * (src/lib/abteilungsaufgaben-onboarding.ts) einmalig nach der Abgabe der
 * Einstellungsmodalitaeten.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessProcess, PORTAL_ROLES } from "@/lib/permissions";
import { MELDUNGEN } from "@/lib/abteilungsaufgaben";

// =============================================
// GET /api/onboarding/:id/checklist
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

    const onboarding = await prisma.onboardingProcess.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    });
    if (!onboarding || !(await canAccessProcess(session, onboarding.organizationId))) {
      return NextResponse.json(
        { error: MELDUNGEN.ONBOARDING_VORGANG_NICHT_GEFUNDEN },
        { status: 404 }
      );
    }

    const items = await prisma.checklistItem.findMany({
      where: { onboardingId: id },
      include: {
        completedBy: {
          select: { firstName: true, lastName: true },
        },
      },
      orderBy: [{ category: "asc" }, { orderIndex: "asc" }],
    });

    return NextResponse.json({ data: items });
  } catch (error) {
    console.error("Fehler beim Laden der Checkliste:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
