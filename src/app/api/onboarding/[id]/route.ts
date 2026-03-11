/**
 * API: /api/onboarding/:id
 *
 * GET   – Einzelnen Vorgang mit allen Daten abrufen
 * PATCH – Status aendern
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// =============================================
// GET /api/onboarding/:id
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

    const onboarding = await prisma.onboardingProcess.findUnique({
      where: { id },
      include: {
        organization: true,
        personalData: { include: { children: true } },
        supervisorData: true,
        documents: true,
        checklistItems: {
          include: {
            completedBy: {
              select: { firstName: true, lastName: true },
            },
          },
          orderBy: [{ category: "asc" }, { orderIndex: "asc" }],
        },
        invitedBy: {
          select: { firstName: true, lastName: true, email: true },
        },
        reviewedBy: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
    });

    if (!onboarding) {
      return NextResponse.json(
        { error: "Vorgang nicht gefunden" },
        { status: 404 }
      );
    }

    return NextResponse.json(onboarding);
  } catch (error) {
    console.error("Fehler beim Laden des Vorgangs:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// PATCH /api/onboarding/:id – Status aendern
// =============================================
export async function PATCH(
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
    const { status } = body;
    const reviewedById = session.userId;

    // Status-Validierung: Nur gueltige Status-Werte erlauben
    const VALID_STATUSES = [
      "INVITED", "IN_PROGRESS", "SUBMITTED", "SUPERVISOR_PENDING",
      "SUPERVISOR_SUBMITTED", "REVIEWED", "COMPLETED", "EXPIRED",
    ];
    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: "Ungueltiger Status-Wert" },
        { status: 400 }
      );
    }

    // Vorgang pruefen
    const existing = await prisma.onboardingProcess.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Vorgang nicht gefunden" },
        { status: 404 }
      );
    }

    // Update-Daten zusammenbauen
    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (status === "REVIEWED") {
      updateData.reviewedAt = new Date();
      if (reviewedById) updateData.reviewedById = reviewedById;
    }
    if (status === "COMPLETED") {
      updateData.completedAt = new Date();
    }

    const updated = await prisma.onboardingProcess.update({
      where: { id },
      data: updateData,
      include: { organization: true },
    });

    // Audit-Log
    await prisma.auditLog.create({
      data: {
        onboardingId: id,
        userId: reviewedById || null,
        action: "STATUS_CHANGED",
        details: {
          from: existing.status,
          to: status,
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Fehler beim Aktualisieren des Vorgangs:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
