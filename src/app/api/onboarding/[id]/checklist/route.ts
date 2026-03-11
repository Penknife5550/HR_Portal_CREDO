/**
 * API: /api/onboarding/:id/checklist
 *
 * GET  – Alle ChecklistItems fuer diesen Onboarding-Vorgang (gruppiert nach category)
 * POST – Neue Checklist-Items aus Template erstellen
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// =============================================
// GET /api/onboarding/:id/checklist
// =============================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth-Check
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    const { id } = await params;

    // Pruefen ob Onboarding existiert
    const onboarding = await prisma.onboardingProcess.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!onboarding) {
      return NextResponse.json(
        { error: "Vorgang nicht gefunden" },
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

// =============================================
// POST /api/onboarding/:id/checklist
// Items aus einem Template erstellen
// =============================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth-Check
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { templateId } = body;

    if (!templateId) {
      return NextResponse.json(
        { error: "templateId ist ein Pflichtfeld" },
        { status: 400 }
      );
    }

    // Pruefen ob Onboarding existiert
    const onboarding = await prisma.onboardingProcess.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!onboarding) {
      return NextResponse.json(
        { error: "Vorgang nicht gefunden" },
        { status: 404 }
      );
    }

    // Template mit Items laden
    const template = await prisma.checklistTemplate.findUnique({
      where: { id: templateId },
      include: {
        items: {
          orderBy: [{ category: "asc" }, { orderIndex: "asc" }],
        },
      },
    });
    if (!template) {
      return NextResponse.json(
        { error: "Checklisten-Vorlage nicht gefunden" },
        { status: 404 }
      );
    }

    // Template-Items als ChecklistItems fuer diesen Vorgang erstellen
    const createdItems = await Promise.all(
      template.items.map((templateItem) =>
        prisma.checklistItem.create({
          data: {
            onboardingId: id,
            templateItemId: templateItem.id,
            title: templateItem.title,
            category: templateItem.category,
            orderIndex: templateItem.orderIndex,
            assignee: templateItem.defaultAssignee,
            dueDate: templateItem.defaultDueDays
              ? new Date(
                  Date.now() + templateItem.defaultDueDays * 24 * 60 * 60 * 1000
                )
              : null,
          },
        })
      )
    );

    // Template-Zuordnung am Onboarding speichern
    await prisma.onboardingProcess.update({
      where: { id },
      data: { checklistTemplateId: templateId },
    });

    // Audit-Log
    await prisma.auditLog.create({
      data: {
        onboardingId: id,
        userId: session.userId,
        action: "CHECKLIST_CREATED",
        details: {
          templateId,
          templateName: template.name,
          itemCount: createdItems.length,
        },
      },
    });

    return NextResponse.json(
      { data: createdItems, templateName: template.name },
      { status: 201 }
    );
  } catch (error) {
    console.error("Fehler beim Erstellen der Checkliste:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
