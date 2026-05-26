/**
 * API: /api/offboarding/:id/notes/:noteId
 *
 * PATCH  – Notiz bearbeiten
 * DELETE – Notiz löschen
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// =============================================
// PATCH /api/offboarding/:id/notes/:noteId – Notiz bearbeiten
// =============================================
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    const { id, noteId } = await params;
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

    // Notiz pruefen (muss zum Offboarding gehoeren)
    const existingNote = await prisma.offboardingNote.findUnique({
      where: { id: noteId },
    });
    if (!existingNote || existingNote.offboardingId !== id) {
      return NextResponse.json(
        { error: "Notiz nicht gefunden" },
        { status: 404 }
      );
    }

    // Nur der Ersteller darf die Notiz bearbeiten
    if (existingNote.createdById !== session.userId) {
      return NextResponse.json(
        { error: "Nur der Ersteller kann diese Notiz bearbeiten" },
        { status: 403 }
      );
    }

    const updated = await prisma.offboardingNote.update({
      where: { id: noteId },
      data: { content: content.trim() },
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
        action: "NOTE_UPDATED",
        details: {
          noteId,
          contentPreview: content.trim().substring(0, 100),
        },
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("Fehler beim Bearbeiten der Offboarding-Notiz:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// DELETE /api/offboarding/:id/notes/:noteId – Notiz löschen
// =============================================
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    const { id, noteId } = await params;

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

    // Notiz pruefen (muss zum Offboarding gehoeren)
    const existingNote = await prisma.offboardingNote.findUnique({
      where: { id: noteId },
    });
    if (!existingNote || existingNote.offboardingId !== id) {
      return NextResponse.json(
        { error: "Notiz nicht gefunden" },
        { status: 404 }
      );
    }

    // Nur der Ersteller darf die Notiz löschen
    if (existingNote.createdById !== session.userId) {
      return NextResponse.json(
        { error: "Nur der Ersteller kann diese Notiz löschen" },
        { status: 403 }
      );
    }

    await prisma.offboardingNote.delete({
      where: { id: noteId },
    });

    // Audit-Log
    await prisma.auditLog.create({
      data: {
        offboardingId: id,
        userId: session.userId,
        processType: "OFFBOARDING",
        action: "NOTE_DELETED",
        details: {
          noteId,
          contentPreview: existingNote.content.substring(0, 100),
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Fehler beim Löschen der Offboarding-Notiz:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
