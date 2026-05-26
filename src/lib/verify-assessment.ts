/**
 * Shared loader für die oeffentliche Verify-/Audit-Page (Phase 6).
 *
 * Wird sowohl von der SSR-Page (`/verify/civil-service-assessment/[token]/page.tsx`)
 * als auch von der API-Route (`/api/verify/civil-service-assessment/[token]`)
 * genutzt — gleiche Datenform, gleiche Audit-Logik.
 */

import { prisma } from "@/lib/db";

export interface VerifyAssessmentData {
  process: {
    displayId: string;
    employeeFirstName: string;
    employeeLastName: string;
    employeePersonalNr: string | null;
    organizationName: string;
    mandantNumber: string;
  };
  assessment: {
    id: string;
    assessmentNumber: number;
    assessmentType: string;
    verifyToken: string | null;
    scheduledDate: string | null;
    announcedAt: string | null;
    fach: string | null;
    klasse: string | null;
    vertrauenslehrkraft: string | null;
    unbiasedConfirmed: boolean | null;
    unbiasedConfirmedAt: string | null;
    scaleType: string | null;
    templateSnapshot: unknown;
    ratingsData: Record<string, number> | null;
    meetsRequirementsManual: boolean | null;
    overallReasoning: string | null;
    overallGrade: number | null;
    referenceData: Record<string, string> | null;
    gemeindeReferenz: string | null;
    postReviewAt: string | null;
    postReviewNotes: string | null;
    beurteilungsgespraechAt: string | null;
    beurteilungsgespraechNotes: string | null;
    releasedToEmployeeAt: string | null;
    acknowledgedByEmployeeAt: string | null;
    rebuttalText: string | null;
    rebuttalAt: string | null;
    archivedAt: string | null;
    submittedAt: string | null;
    recipientEmail: string;
    recipientName: string | null;
  };
  auditLog: Array<{
    id: string;
    action: string;
    createdAt: string;
    actorName: string | null;
  }>;
}

const RELEVANT_AUDIT_ACTIONS = [
  "ASSESSMENT_REQUESTED",
  "ASSESSMENT_SUBMITTED",
  "ASSESSMENT_RELEASED_TO_EMPLOYEE",
  "ASSESSMENT_ACKNOWLEDGED",
  "ASSESSMENT_REBUTTAL_FILED",
  "ASSESSMENT_ARCHIVED",
];

/**
 * Laedt die Daten und protokolliert den Aufruf.
 *
 * @param verifyToken UUID aus der URL
 * @param ipAddress Client-IP fuers Audit-Log
 * @returns null, wenn der Token unbekannt ist
 */
export async function loadVerifyAssessment(
  verifyToken: string,
  ipAddress: string,
): Promise<VerifyAssessmentData | null> {
  if (!verifyToken || verifyToken.length < 16 || verifyToken.length > 64) {
    return null;
  }

  const assessment = await prisma.civilServiceAssessment.findUnique({
    where: { verifyToken },
    include: {
      process: {
        include: {
          organization: {
            select: { name: true, mandantNumber: true },
          },
        },
      },
    },
  });

  if (!assessment) {
    try {
      await prisma.auditLog.create({
        data: {
          processType: "CIVIL_SERVICE",
          action: "VERIFY_PAGE_NOT_FOUND",
          ipAddress,
          details: { verifyTokenPrefix: verifyToken.slice(0, 8) },
        },
      });
    } catch {
      // Audit-Log darf den Request niemals blockieren
    }
    return null;
  }

  // Audit-Trail dieser Beurteilung
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      civilServiceId: assessment.processId,
      action: { in: RELEVANT_AUDIT_ACTIONS },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      action: true,
      details: true,
      createdAt: true,
      user: {
        select: { firstName: true, lastName: true },
      },
    },
  });

  // Auf assessmentId-Ebene filtern, falls im Detail vorhanden
  const filteredAudit = auditLogs.filter((log) => {
    if (!log.details || typeof log.details !== "object") return true;
    const details = log.details as Record<string, unknown>;
    if (!details.assessmentId) return true;
    return details.assessmentId === assessment.id;
  });

  // Erfolgreichen Aufruf protokollieren
  try {
    await prisma.auditLog.create({
      data: {
        civilServiceId: assessment.processId,
        processType: "CIVIL_SERVICE",
        action: "VERIFY_PAGE_VIEWED",
        ipAddress,
        details: {
          assessmentId: assessment.id,
          assessmentNumber: assessment.assessmentNumber,
          assessmentType: assessment.assessmentType,
        },
      },
    });
  } catch {
    // never block
  }

  return {
    process: {
      displayId: assessment.process.displayId,
      employeeFirstName: assessment.process.employeeFirstName,
      employeeLastName: assessment.process.employeeLastName,
      employeePersonalNr: assessment.process.employeePersonalNr,
      organizationName: assessment.process.organization.name,
      mandantNumber: assessment.process.organization.mandantNumber,
    },
    assessment: {
      id: assessment.id,
      assessmentNumber: assessment.assessmentNumber,
      assessmentType: assessment.assessmentType,
      verifyToken: assessment.verifyToken,
      scheduledDate: assessment.scheduledDate?.toISOString() ?? null,
      announcedAt: assessment.announcedAt?.toISOString() ?? null,
      fach: assessment.fach,
      klasse: assessment.klasse,
      vertrauenslehrkraft: assessment.vertrauenslehrkraft,
      unbiasedConfirmed: assessment.unbiasedConfirmed,
      unbiasedConfirmedAt:
        assessment.unbiasedConfirmedAt?.toISOString() ?? null,
      scaleType: assessment.scaleType,
      templateSnapshot: assessment.templateSnapshot,
      ratingsData: assessment.ratingsData as Record<string, number> | null,
      meetsRequirementsManual: assessment.meetsRequirementsManual,
      overallReasoning: assessment.overallReasoning,
      overallGrade: assessment.overallGrade,
      referenceData: assessment.referenceData as Record<string, string> | null,
      gemeindeReferenz: assessment.gemeindeReferenz,
      postReviewAt: assessment.postReviewAt?.toISOString() ?? null,
      postReviewNotes: assessment.postReviewNotes,
      beurteilungsgespraechAt:
        assessment.beurteilungsgespraechAt?.toISOString() ?? null,
      beurteilungsgespraechNotes: assessment.beurteilungsgespraechNotes,
      releasedToEmployeeAt:
        assessment.releasedToEmployeeAt?.toISOString() ?? null,
      acknowledgedByEmployeeAt:
        assessment.acknowledgedByEmployeeAt?.toISOString() ?? null,
      rebuttalText: assessment.rebuttalText,
      rebuttalAt: assessment.rebuttalAt?.toISOString() ?? null,
      archivedAt: assessment.archivedAt?.toISOString() ?? null,
      submittedAt: assessment.submittedAt?.toISOString() ?? null,
      recipientEmail: assessment.recipientEmail,
      recipientName: assessment.recipientName,
    },
    auditLog: filteredAudit.map((log) => ({
      id: log.id,
      action: log.action,
      createdAt: log.createdAt.toISOString(),
      actorName: log.user
        ? `${log.user.firstName} ${log.user.lastName}`.trim()
        : null,
    })),
  };
}

/**
 * Erzeugt aus dem verifyToken (UUID) einen 8-stelligen menschenlesbaren
 * Code im Format `CRD-XXXX-YYYY` für Telefonate / Aktenvermerke.
 */
export function buildVerifyHash(verifyToken: string | null | undefined): string | null {
  if (!verifyToken) return null;
  const clean = verifyToken.replace(/-/g, "");
  return `CRD-${clean.slice(0, 4).toUpperCase()}-${clean.slice(4, 8).toUpperCase()}`;
}

/**
 * Action -> deutsches Label für das Audit-Log auf der Verify-Page.
 */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  ASSESSMENT_REQUESTED: "Angefordert durch HR",
  ASSESSMENT_SUBMITTED: "Eingereicht durch Schulleitung",
  ASSESSMENT_RELEASED_TO_EMPLOYEE: "Bekanntgabe-Link an Lehrkraft erstellt",
  ASSESSMENT_ACKNOWLEDGED: "Quittiert durch Lehrkraft",
  ASSESSMENT_REBUTTAL_FILED: "Gegenäußerung durch Lehrkraft",
  ASSESSMENT_ARCHIVED: "In Personalakte aufgenommen",
  VERIFY_PAGE_VIEWED: "Audit-Page aufgerufen",
};
