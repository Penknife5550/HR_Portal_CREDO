/**
 * API: /api/onboarding/:id
 *
 * GET   – Einzelnen Vorgang mit allen Daten abrufen
 * PATCH – Status aendern
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { decrypt } from "@/lib/encryption";
import { canAccessProcess, PORTAL_ROLES, HR_EDIT_ROLES } from "@/lib/permissions";

// =============================================
// GET /api/onboarding/:id
// =============================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth + Rollen-Check
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
        notes: {
          include: {
            createdBy: {
              select: { firstName: true, lastName: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        invitedBy: {
          select: { firstName: true, lastName: true, email: true },
        },
        reviewedBy: {
          select: { firstName: true, lastName: true, email: true },
        },
        _count: {
          select: { notes: true },
        },
      },
    });

    if (!onboarding) {
      return NextResponse.json(
        { error: "Vorgang nicht gefunden" },
        { status: 404 }
      );
    }

    // Org-Zugriffspruefung
    if (!(await canAccessProcess(session, onboarding.organizationId))) {
      return NextResponse.json({ error: "Keine Berechtigung für diesen Vorgang" }, { status: 403 });
    }

    // Tokens BLEIBEN enthalten: Diese Detail-Ansicht ist auth- + org-geschuetzt
    // (canAccessProcess) und HR benoetigt die Tokens, um die teilbaren Magic-Links
    // (Fragebogen-/Modalitaeten-Link) anzuzeigen und zu versenden. Ohne sie wuerde
    // die UI ".../fragebogen/undefined" bauen.
    const safeOnboarding = { ...onboarding };

    // Sensible Felder entschluesseln (IBAN, SV-Nummer, Steuer-ID)
    if (safeOnboarding.personalData) {
      const pd = safeOnboarding.personalData;
      safeOnboarding.personalData = {
        ...pd,
        iban: pd.iban ? decrypt(pd.iban) : pd.iban,
        socialSecurityNumber: pd.socialSecurityNumber ? decrypt(pd.socialSecurityNumber) : pd.socialSecurityNumber,
        taxId: pd.taxId ? decrypt(pd.taxId) : pd.taxId,
      };
    }

    return NextResponse.json(safeOnboarding);
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
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }
    if (!HR_EDIT_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
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
        { error: "Ungültiger Status-Wert" },
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
