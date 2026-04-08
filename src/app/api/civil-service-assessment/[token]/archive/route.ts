/**
 * API: /api/civil-service-assessment/[token]/archive
 *
 * POST — HR uebernimmt die Beurteilung formal in die Personalakte
 *        (Workflow-Schritt 9, COMPLETED).
 *
 * Vorbedingungen:
 *   - Beurteilung muss von der Lehrkraft quittiert sein
 *     (acknowledgedByEmployeeAt != null)
 *   - Darf nicht bereits archiviert sein
 *
 * Path-Parameter ist der **SL-Magic-Link-Token** (konsistent mit den
 * anderen [token]-Routen). Auth ist HR (SUPER_ADMIN, HR_LEITUNG) — der
 * Token wird hier nur als Lookup-Key verwendet.
 *
 * Rechtsgrundlage: BRL Nr. 14, § 92 LBG NRW
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { triggerWebhooks } from "@/lib/webhooks";
import { formatEmployeeName } from "@/lib/format";

const ALLOWED_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 },
      );
    }
    if (!ALLOWED_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { token } = await context.params;

    const assessment = await prisma.civilServiceAssessment.findUnique({
      where: { token },
      include: {
        process: {
          select: {
            id: true,
            displayId: true,
            employeeFirstName: true,
            employeeLastName: true,
            employeeEmail: true,
            organization: { select: { name: true, mandantNumber: true } },
          },
        },
      },
    });

    if (!assessment) {
      return NextResponse.json(
        { error: "Beurteilung nicht gefunden" },
        { status: 404 },
      );
    }

    if (!assessment.acknowledgedByEmployeeAt) {
      return NextResponse.json(
        {
          error:
            "Diese Beurteilung wurde noch nicht von der Lehrkraft quittiert. Aufnahme in die Personalakte erst nach Quittierung moeglich (§ 92 Abs. 1 LBG NRW).",
        },
        { status: 400 },
      );
    }

    if (assessment.archivedAt) {
      return NextResponse.json(
        { error: "Diese Beurteilung wurde bereits archiviert." },
        { status: 400 },
      );
    }

    const now = new Date();

    // Atomar gegen Doppel-Archivierung (Race Condition):
    // updateMany mit archivedAt: null garantiert, dass nur EIN paralleler
    // HR-Klick die Archivierung schreibt.
    const updateResult = await prisma.civilServiceAssessment.updateMany({
      where: { id: assessment.id, archivedAt: null },
      data: {
        archivedAt: now,
        archivedById: session.userId,
      },
    });
    if (updateResult.count === 0) {
      return NextResponse.json(
        { error: "Diese Beurteilung wurde bereits archiviert." },
        { status: 400 },
      );
    }

    // Audit-Log
    await prisma.auditLog
      .create({
        data: {
          userId: session.userId,
          civilServiceId: assessment.process.id,
          processType: "CIVIL_SERVICE",
          action: "ASSESSMENT_ARCHIVED",
          details: {
            assessmentId: assessment.id,
            assessmentNumber: assessment.assessmentNumber,
            assessmentType: assessment.assessmentType,
            archivedAt: now.toISOString(),
            hadRebuttal: Boolean(assessment.rebuttalText),
            acknowledgedAt: assessment.acknowledgedByEmployeeAt.toISOString(),
          },
        },
      })
      .catch((err) =>
        console.error(
          "[ASSESSMENT_ARCHIVED] Audit-Log-Fehler:",
          err instanceof Error ? err.message : err,
        ),
      );

    // Webhook fire-and-forget
    triggerWebhooks("psi-assessment-archived", {
      civilServiceId: assessment.process.id,
      assessmentId: assessment.id,
      displayId: assessment.process.displayId,
      employeeName: formatEmployeeName(assessment.process),
      employeeEmail: assessment.process.employeeEmail,
      organization: assessment.process.organization.name,
      mandantNumber: assessment.process.organization.mandantNumber,
      assessmentNumber: assessment.assessmentNumber,
      assessmentType: assessment.assessmentType,
      archivedAt: now.toISOString(),
      hadRebuttal: Boolean(assessment.rebuttalText),
    }).catch((err) =>
      console.error(
        "[psi-assessment-archived] Webhook-Fehler:",
        err instanceof Error ? err.message : err,
      ),
    );

    return NextResponse.json({
      data: { success: true, archivedAt: now.toISOString() },
    });
  } catch (error) {
    console.error(
      "[API] Beurteilungs-Archivierung fehlgeschlagen:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 },
    );
  }
}
