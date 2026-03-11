/**
 * API: /api/onboarding/:id/notes
 *
 * GET  – Alle Notizen eines Onboarding-Vorgangs laden
 * POST – Neue Notiz erstellen
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// =============================================
// GET /api/onboarding/:id/notes
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

    const notes = await prisma.onboardingNote.findMany({
      where: { onboardingId: id },
      include: {
        createdBy: {
          select: { firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: notes });
  } catch (error) {
    console.error("Fehler beim Laden der Notizen:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// POST /api/onboarding/:id/notes – Neue Notiz erstellen
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
    const { content } = body;

    // Validierung
    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json(
        { error: "content ist ein Pflichtfeld" },
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

    // Notiz erstellen
    const note = await prisma.onboardingNote.create({
      data: {
        onboardingId: id,
        content: content.trim(),
        createdById: session.userId,
      },
      include: {
        createdBy: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    // Audit-Log
    await prisma.auditLog.create({
      data: {
        onboardingId: id,
        userId: session.userId,
        action: "NOTE_CREATED",
        details: {
          noteId: note.id,
          contentPreview: content.trim().substring(0, 100),
        },
      },
    });

    return NextResponse.json({ data: note }, { status: 201 });
  } catch (error) {
    console.error("Fehler beim Erstellen der Notiz:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
