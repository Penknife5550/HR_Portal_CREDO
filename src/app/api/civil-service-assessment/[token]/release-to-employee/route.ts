/**
 * API: /api/civil-service-assessment/[token]/release-to-employee
 *
 * POST — HR gibt eine eingereichte Beurteilung zur Bekanntgabe an die Lehrkraft frei.
 *
 * Path-Parameter ist der **SL-Magic-Link-Token** (nicht die Assessment-ID),
 * damit der Pfad mit den anderen [token]-Routen konsistent bleibt. Auth bleibt
 * trotzdem HR (SUPER_ADMIN, HR_LEITUNG) — der Token wird hier nur als Lookup-Key
 * verwendet, nicht als Berechtigung.
 *
 * Erzeugt einen separaten Magic-Link-Token (employeeAckToken, 30 Tage gueltig),
 * setzt releasedToEmployeeAt, schreibt einen Audit-Log-Eintrag und feuert
 * den Webhook psi-assessment-released. Der Token ist getrennt vom SL-Token,
 * sodass die Berechtigungs-Raeume sauber getrennt bleiben.
 *
 * Auth: SUPER_ADMIN, HR_LEITUNG
 *
 * Vorbedingungen:
 * - Beurteilung muss submitted sein (submittedAt != null)
 * - Beurteilung darf nicht bereits quittiert sein
 *
 * Rechtsgrundlage: § 92 Abs. 1 LBG NRW
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { randomUUID } from "crypto";
import { triggerWebhooks } from "@/lib/webhooks";
import { formatEmployeeName } from "@/lib/format";
import { getBaseUrl } from "@/lib/url";

const ALLOWED_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];
const ACK_TOKEN_VALID_DAYS = 30;

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

    // Beurteilung laden inkl. Process + Organization fuer Webhook
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

    // Vorbedingungen
    if (!assessment.submittedAt) {
      return NextResponse.json(
        {
          error:
            "Diese Beurteilung wurde noch nicht von der Schulleitung eingereicht.",
        },
        { status: 400 },
      );
    }

    if (assessment.acknowledgedByEmployeeAt) {
      return NextResponse.json(
        {
          error: "Diese Beurteilung wurde von der Lehrkraft bereits quittiert.",
        },
        { status: 400 },
      );
    }

    // Wenn schon released → vorhandenen Token nochmal versenden, neuen Token nur
    // generieren, falls keiner existiert oder abgelaufen ist
    const now = new Date();
    const existingToken = assessment.employeeAckToken;
    const existingExpiry = assessment.employeeAckExpiresAt;
    const tokenIsExpired = !existingExpiry || existingExpiry < now;

    let employeeAckToken: string;
    let employeeAckExpiresAt: Date;
    if (!existingToken || tokenIsExpired) {
      employeeAckToken = randomUUID();
      employeeAckExpiresAt = new Date(
        now.getTime() + ACK_TOKEN_VALID_DAYS * 24 * 60 * 60 * 1000,
      );
    } else {
      employeeAckToken = existingToken;
      employeeAckExpiresAt = existingExpiry as Date;
    }

    await prisma.civilServiceAssessment.update({
      where: { id: assessment.id },
      data: {
        employeeAckToken,
        employeeAckExpiresAt,
        releasedToEmployeeAt: assessment.releasedToEmployeeAt ?? now,
      },
    });

    const ackLink = `${getBaseUrl()}/civil-service-acknowledgement/${employeeAckToken}`;

    // Audit-Log
    await prisma.auditLog
      .create({
        data: {
          userId: session.userId,
          civilServiceId: assessment.process.id,
          processType: "CIVIL_SERVICE",
          action: "ASSESSMENT_RELEASED_TO_EMPLOYEE",
          details: {
            assessmentId: assessment.id,
            assessmentNumber: assessment.assessmentNumber,
            assessmentType: assessment.assessmentType,
            employeeEmail: assessment.process.employeeEmail,
            tokenExpiresAt: employeeAckExpiresAt.toISOString(),
            isResend: Boolean(assessment.releasedToEmployeeAt),
          },
        },
      })
      .catch((err) =>
        console.error(
          "[ASSESSMENT_RELEASED] Audit-Log-Fehler:",
          err instanceof Error ? err.message : err,
        ),
      );

    // Webhook fire-and-forget
    triggerWebhooks("psi-assessment-released", {
      civilServiceId: assessment.process.id,
      assessmentId: assessment.id,
      displayId: assessment.process.displayId,
      employeeName: formatEmployeeName(assessment.process),
      employeeEmail: assessment.process.employeeEmail,
      organization: assessment.process.organization.name,
      mandantNumber: assessment.process.organization.mandantNumber,
      assessmentNumber: assessment.assessmentNumber,
      assessmentType: assessment.assessmentType,
      ackLink,
      tokenExpiresAt: employeeAckExpiresAt.toISOString(),
    }).catch((err) =>
      console.error(
        "[psi-assessment-released] Webhook-Fehler:",
        err instanceof Error ? err.message : err,
      ),
    );

    return NextResponse.json({
      data: {
        success: true,
        ackLink,
        tokenExpiresAt: employeeAckExpiresAt.toISOString(),
      },
    });
  } catch (error) {
    console.error(
      "[API] Bekanntgabe-Freigabe fehlgeschlagen:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 },
    );
  }
}
