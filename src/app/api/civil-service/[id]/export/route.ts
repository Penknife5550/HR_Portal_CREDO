/**
 * API: /api/civil-service/:id/export
 *
 * GET – PDF-Export eines Verbeamtungsvorgangs
 *
 * Query-Parameter:
 *   type: "gesamtakte" | "antrag" | "beurteilung" | "referenz" | "checkliste"
 *   nr:   Nummer der Beurteilung/Referenz (1, 2, 3) — nur bei type=beurteilung|referenz
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { createRateLimiter } from "@/lib/rate-limit";
import { generateExportPDF, type ExportContext, type ExportType } from "@/lib/pdf-export";

const exportLimiter = createRateLimiter("civil-service-export", { maxRequests: 10, windowMs: 60_000 });

const VALID_TYPES = ["gesamtakte", "antrag", "beurteilung", "referenz", "checkliste"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const allowedRoles = ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER"];
    if (!allowedRoles.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    // Rate Limiting: 10 Exports pro Minute pro User
    const rl = exportLimiter.check(session.userId);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Zu viele Exports. Bitte warten." }, { status: 429 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "gesamtakte";
    const nr = parseInt(searchParams.get("nr") || "1");

    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Ungueltiger Typ. Erlaubt: ${VALID_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    // Vorgang mit allen Daten laden
    const process = await prisma.civilServiceProcess.findUnique({
      where: { id },
      include: {
        organization: true,
        assessments: {
          orderBy: { assessmentNumber: "asc" },
        },
        checklistItems: {
          orderBy: { orderIndex: "asc" },
        },
      },
    });

    if (!process) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }

    // Audit-Trail für alle Beurteilungen vorab laden (Phase 6)
    const ASSESSMENT_AUDIT_ACTIONS = [
      "ASSESSMENT_REQUESTED",
      "ASSESSMENT_SUBMITTED",
      "ASSESSMENT_RELEASED_TO_EMPLOYEE",
      "ASSESSMENT_ACKNOWLEDGED",
      "ASSESSMENT_REBUTTAL_FILED",
      "ASSESSMENT_ARCHIVED",
    ];
    const allAuditLogs = await prisma.auditLog.findMany({
      where: {
        civilServiceId: id,
        action: { in: ASSESSMENT_AUDIT_ACTIONS },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        action: true,
        details: true,
        createdAt: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
    function auditTrailFor(assessmentId: string) {
      return allAuditLogs
        .filter((log) => {
          if (!log.details || typeof log.details !== "object") return true;
          const d = log.details as Record<string, unknown>;
          if (!d.assessmentId) return true;
          return d.assessmentId === assessmentId;
        })
        .map((log) => ({
          action: log.action,
          createdAt: log.createdAt.toISOString(),
          actorName: log.user
            ? `${log.user.firstName} ${log.user.lastName}`.trim()
            : null,
        }));
    }

    // ExportContext zusammenbauen
    const ctx: ExportContext = {
      firstName: process.employeeFirstName,
      lastName: process.employeeLastName,
      email: process.employeeEmail,
      personalNr: process.employeePersonalNr,
      organizationName: process.organization.name,
      mandantNumber: process.organization.mandantNumber,
      displayId: process.displayId,
      status: process.status,
      currentStep: process.currentStep,
      createdAt: process.createdAt.toISOString(),
      targetStartDate: process.targetStartDate?.toISOString() || null,
      prerequisites: process.prerequisites as ExportContext["prerequisites"],
      applicationData: process.applicationData as ExportContext["applicationData"],
      applicationSubmittedAt: process.applicationSubmittedAt?.toISOString() || null,
      stakeholders: process.stakeholders as ExportContext["stakeholders"],
      assessments: process.assessments.map((a) => ({
        assessmentNumber: a.assessmentNumber,
        assessmentType: a.assessmentType,
        status: a.submittedAt ? "SUBMITTED" : "PENDING",
        recipientEmail: a.recipientEmail,
        recipientName: a.recipientName,
        overallGrade: a.overallGrade ? Number(a.overallGrade) : null,
        meetsRequirements: a.meetsRequirements,
        meetsRequirementsManual: a.meetsRequirementsManual,
        overallReasoning: a.overallReasoning,
        ratingsData: a.ratingsData as Record<string, number> | null,
        referenceData: a.referenceData as Record<string, string> | null,
        gemeindeReferenz: a.gemeindeReferenz,
        templateSnapshot: a.templateSnapshot as ExportContext["assessments"][0]["templateSnapshot"],
        submittedAt: a.submittedAt?.toISOString() || null,

        // Phase 3-5 Workflow-Felder
        scheduledDate: a.scheduledDate?.toISOString() ?? null,
        fach: a.fach,
        klasse: a.klasse,
        vertrauenslehrkraft: a.vertrauenslehrkraft,
        unbiasedConfirmed: a.unbiasedConfirmed,
        unbiasedConfirmedAt: a.unbiasedConfirmedAt?.toISOString() ?? null,
        postReviewAt: a.postReviewAt?.toISOString() ?? null,
        postReviewNotes: a.postReviewNotes,
        beurteilungsgespraechAt: a.beurteilungsgespraechAt?.toISOString() ?? null,
        beurteilungsgespraechNotes: a.beurteilungsgespraechNotes,
        releasedToEmployeeAt: a.releasedToEmployeeAt?.toISOString() ?? null,
        acknowledgedByEmployeeAt: a.acknowledgedByEmployeeAt?.toISOString() ?? null,
        acknowledgedByEmployeeIp: a.acknowledgedByEmployeeIp,
        rebuttalText: a.rebuttalText,
        rebuttalAt: a.rebuttalAt?.toISOString() ?? null,
        archivedAt: a.archivedAt?.toISOString() ?? null,

        // Phase 6 — Verifikation
        verifyToken: a.verifyToken,
        auditTrail: auditTrailFor(a.id),
      })),
      checklistItems: process.checklistItems.map((c) => ({
        step: c.step,
        phase: c.phase,
        category: c.category,
        title: c.title,
        assignee: c.assignee,
        isGatekeeper: c.isGatekeeper,
        isCompleted: c.isCompleted,
        completedAt: c.completedAt?.toISOString() || null,
        notes: c.notes,
        dueDate: c.dueDate?.toISOString() || null,
      })),
    };

    // Pruefen ob angefordertes Assessment existiert
    if (type === "beurteilung") {
      const exists = ctx.assessments.find((a) => a.assessmentType === "BEURTEILUNG" && a.assessmentNumber === nr);
      if (!exists) return NextResponse.json({ error: `Beurteilung Nr. ${nr} nicht gefunden` }, { status: 404 });
    }
    if (type === "referenz") {
      const exists = ctx.assessments.find((a) => a.assessmentType === "REFERENZ" && a.assessmentNumber === nr);
      if (!exists) return NextResponse.json({ error: `Referenz Nr. ${nr} nicht gefunden` }, { status: 404 });
    }

    // PDF generieren
    const pdfBuffer = await generateExportPDF(ctx, type as ExportType, nr);

    // Dateiname
    const dateStr = new Date().toISOString().slice(0, 10);
    const typeName = type === "gesamtakte" ? "Gesamtakte"
      : type === "antrag" ? "Antrag"
      : type === "beurteilung" ? `Beurteilung_${nr}`
      : type === "referenz" ? `Referenz_${nr}`
      : "Checkliste";
    const rawFileName = `${process.displayId}_${typeName}_${dateStr}.pdf`;
    const fileName = rawFileName.replace(/["\n\r]/g, "").replace(/[^\w\-.]/g, "_");

    // Audit-Log
    await prisma.auditLog.create({
      data: {
        civilServiceId: id,
        userId: session.userId,
        processType: "CIVIL_SERVICE",
        action: "DOCUMENT_EXPORTED",
        details: { type, nr: nr.toString(), fileName },
      },
    });

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("Fehler beim PDF-Export:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
