/**
 * API: /api/vorlagen/:id/preview
 *
 * GET – Vorschau-Daten fuer den Personalfragebogen
 *       Liefert ein Mock-OnboardingData-Objekt ohne echten Vorgang
 *
 * Berechtigung: SUPER_ADMIN, HR_LEITUNG
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!["SUPER_ADMIN", "HR_LEITUNG"].includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id } = await params;

    const template = await prisma.formTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return NextResponse.json({ error: "Vorlage nicht gefunden" }, { status: 404 });
    }

    // Mock-Daten fuer die Vorschau (kein echter Onboarding-Vorgang noetig)
    return NextResponse.json({
      onboardingId: "preview",
      email: "vorschau@credo-gruppe.de",
      organization: {
        name: "CREDO Vorschau",
        mandantNumber: "000",
        type: "VERWALTUNG",
      },
      questionnaireType: template.questionnaireType,
      status: "IN_PROGRESS",
      stepsConfig: template.stepsConfig,
      templateVersion: template.version,
      templateName: template.name,
      personalData: null,
      isPreview: true,
    });
  } catch (error) {
    console.error("[API] Vorschau-Daten laden fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
