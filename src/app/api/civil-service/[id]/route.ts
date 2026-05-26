/**
 * API: /api/civil-service/:id
 *
 * GET   – Einzelnen Verbeamtungsvorgang mit allen Details abrufen
 * PATCH – Vorgang aktualisieren (Status, Termine etc.)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { updateCivilServiceSchema } from "@/lib/validations/civil-service";
import { canAccessProcess, PORTAL_ROLES, HR_EDIT_ROLES } from "@/lib/permissions";
// PORTAL_ROLES wird für GET verwendet, HR_EDIT_ROLES für PATCH

// Gueltige Status-Uebergaenge
const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["PREREQUISITES_CHECK", "CANCELLED"],
  PREREQUISITES_CHECK: ["ASSESSMENT_PENDING", "CANCELLED"],
  ASSESSMENT_PENDING: ["REFERENCE_PENDING", "CANCELLED"],
  REFERENCE_PENDING: ["BOARD_PENDING", "CANCELLED"],
  BOARD_PENDING: ["ADMINISTRATION", "BOARD_POSTPONED", "REJECTED", "CANCELLED"],
  BOARD_POSTPONED: ["BOARD_PENDING", "REJECTED", "CANCELLED"],
  ADMINISTRATION: ["PROBATION", "CANCELLED"],
  PROBATION: ["LIFETIME_PENDING", "REJECTED", "CANCELLED"],
  LIFETIME_PENDING: ["COMPLETED", "REJECTED", "CANCELLED"],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};

// =============================================
// GET /api/civil-service/:id
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

    // Rollencheck: Portal-Rollen (inkl. VORGESETZTER)
    if (!PORTAL_ROLES.includes(session.role)) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const process = await prisma.civilServiceProcess.findUnique({
      where: { id },
      include: {
        organization: true,
        phases: {
          orderBy: { orderIndex: "asc" },
        },
        assessments: {
          orderBy: { assessmentNumber: "asc" },
        },
        boardDecisions: {
          orderBy: { createdAt: "desc" },
        },
        documents: {
          orderBy: { createdAt: "desc" },
        },
        checklistItems: {
          orderBy: { orderIndex: "asc" },
        },
        auditLogs: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!process) {
      return NextResponse.json(
        { error: "Vorgang nicht gefunden" },
        { status: 404 }
      );
    }

    // Org-Zugriffspruefung
    if (!(await canAccessProcess(session, process.organizationId))) {
      return NextResponse.json({ error: "Keine Berechtigung für diesen Vorgang" }, { status: 403 });
    }

    return NextResponse.json(process);
  } catch (error) {
    console.error("Fehler beim Laden des Verbeamtungsvorgangs:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// PATCH /api/civil-service/:id – Vorgang aktualisieren
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

    // Rollencheck: nur HR-Rollen duerfen editieren
    if (!HR_EDIT_ROLES.includes(session.role)) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = updateCivilServiceSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const {
      status,
      currentStep,
      targetStartDate,
      probationStartDate,
      besoldungsgruppe,
      erfahrungsstufe,
      prerequisites,
      stakeholders,
    } = parsed.data;

    // Vorgang pruefen
    const existing = await prisma.civilServiceProcess.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Vorgang nicht gefunden" },
        { status: 404 }
      );
    }

    // Status-Uebergang validieren
    // SUPER_ADMIN + HR_LEITUNG duerfen COMPLETED/CANCELLED direkt setzen (Vorgang abschliessen/abbrechen)
    const ADMIN_OVERRIDE_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];
    const isAdminOverride = ADMIN_OVERRIDE_ROLES.includes(session.role) &&
      (status === "COMPLETED" || status === "CANCELLED");

    if (status && !isAdminOverride) {
      const allowedTransitions = VALID_TRANSITIONS[existing.status];
      if (!allowedTransitions) {
        return NextResponse.json(
          {
            error: `Status "${existing.status}" kann nicht geaendert werden`,
          },
          { status: 400 }
        );
      }
      if (!allowedTransitions.includes(status)) {
        return NextResponse.json(
          {
            error: `Ungueltiger Status-Uebergang: "${existing.status}" -> "${status}". Erlaubt: ${allowedTransitions.join(", ") || "keine"}`,
          },
          { status: 400 }
        );
      }
    }

    // Update-Daten zusammenbauen
    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (currentStep !== undefined) updateData.currentStep = currentStep;
    if (targetStartDate !== undefined) {
      updateData.targetStartDate = targetStartDate
        ? new Date(targetStartDate)
        : null;
    }
    if (probationStartDate !== undefined) {
      updateData.probationStartDate = probationStartDate
        ? new Date(probationStartDate)
        : null;
      // Probezeit-Ende: +3 Jahre
      if (probationStartDate) {
        const endDate = new Date(probationStartDate);
        endDate.setFullYear(endDate.getFullYear() + 3);
        updateData.probationEndDate = endDate;
      }
    }
    if (besoldungsgruppe !== undefined) updateData.besoldungsgruppe = besoldungsgruppe;
    if (erfahrungsstufe !== undefined) updateData.erfahrungsstufe = erfahrungsstufe;
    if (prerequisites !== undefined) updateData.prerequisites = prerequisites;
    if (stakeholders !== undefined) updateData.stakeholders = stakeholders;

    // Bei COMPLETED: completedAt setzen
    if (status === "COMPLETED") {
      updateData.completedAt = new Date();
    }

    const updated = await prisma.civilServiceProcess.update({
      where: { id },
      data: updateData,
      include: { organization: true },
    });

    // Audit-Log
    const auditDetails: Record<string, unknown> = {};
    if (status) {
      auditDetails.statusFrom = existing.status;
      auditDetails.statusTo = status;
    }
    if (currentStep !== undefined) auditDetails.currentStep = currentStep;
    if (targetStartDate !== undefined) auditDetails.targetStartDate = targetStartDate;
    if (probationStartDate !== undefined) auditDetails.probationStartDate = probationStartDate;
    if (besoldungsgruppe !== undefined) auditDetails.besoldungsgruppe = besoldungsgruppe;
    if (erfahrungsstufe !== undefined) auditDetails.erfahrungsstufe = erfahrungsstufe;

    await prisma.auditLog.create({
      data: {
        civilServiceId: id,
        userId: session.userId,
        processType: "CIVIL_SERVICE",
        action: status ? "STATUS_CHANGED" : "CIVIL_SERVICE_UPDATED",
        details: auditDetails as Record<string, string>,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Fehler beim Aktualisieren des Verbeamtungsvorgangs:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
