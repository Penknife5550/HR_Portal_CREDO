/**
 * API: /api/offboarding/:id/notes
 *
 * GET  – Alle Notizen eines Offboarding-Vorgangs laden
 * POST – Neue Notiz erstellen
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// =============================================
// GET /api/offboarding/:id/notes
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
        { error: "Vorgang nicht gefunden" },
        { status: 404 }
      );
    }

    const notes = await prisma.offboardingNote.findMany({
      where: { offboardingId: id },
      include: {
        createdBy: {
          select: { firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: notes });
  } catch (error) {
    console.error("Fehler beim Laden der Offboarding-Notizen:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// POST /api/offboarding/:id/notes – Neue Notiz erstellen
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
    const { content } = body;

    // Validierung
    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json(
        { error: "content ist ein Pflichtfeld" },
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
        { error: "Vorgang nicht gefunden" },
        { status: 404 }
      );
    }

    // Notiz erstellen
    const note = await prisma.offboardingNote.create({
      data: {
        offboardingId: id,
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
        offboardingId: id,
        userId: session.userId,
        processType: "OFFBOARDING",
        action: "NOTE_CREATED",
        details: {
          noteId: note.id,
          contentPreview: content.trim().substring(0, 100),
        },
      },
    });

    return NextResponse.json({ data: note }, { status: 201 });
  } catch (error) {
    console.error("Fehler beim Erstellen der Offboarding-Notiz:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
