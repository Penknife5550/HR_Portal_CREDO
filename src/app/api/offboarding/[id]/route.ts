/**
 * API: /api/offboarding/:id
 *
 * GET   – Einzelnen Offboarding-Vorgang mit allen Details abrufen
 * PATCH – Vorgang aktualisieren (Status, Termine etc.)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { decrypt, encrypt } from "@/lib/encryption";
import { triggerWebhooks } from "@/lib/webhooks";
import { updateOffboardingSchema } from "@/lib/validations/offboarding";

// Gueltige Status-Uebergaenge
const VALID_TRANSITIONS: Record<string, string[]> = {
  INITIATED: ["NOTICE_PERIOD", "CANCELLED"],
  NOTICE_PERIOD: ["HANDOVER_PHASE", "CANCELLED"],
  HANDOVER_PHASE: ["FINAL_SETTLEMENT", "CANCELLED"],
  FINAL_SETTLEMENT: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

// =============================================
// GET /api/offboarding/:id
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

    const offboarding = await prisma.offboardingProcess.findUnique({
      where: { id },
      include: {
        organization: true,
        exitData: true,
        checklistItems: {
          orderBy: [{ category: "asc" }, { orderIndex: "asc" }],
        },
        returnItems: true,
        documents: true,
        notes: {
          include: {
            createdBy: {
              select: { firstName: true, lastName: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        departmentLinks: true,
        auditLogs: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!offboarding) {
      return NextResponse.json(
        { error: "Vorgang nicht gefunden" },
        { status: 404 }
      );
    }

    // Sensible Felder entschluesseln
    if (offboarding.exitData?.severancePay) {
      offboarding.exitData.severancePay = decrypt(
        offboarding.exitData.severancePay
      );
    }

    return NextResponse.json(offboarding);
  } catch (error) {
    console.error("Fehler beim Laden des Offboarding-Vorgangs:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// PATCH /api/offboarding/:id – Vorgang aktualisieren
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

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = updateOffboardingSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const {
      status,
      exitType,
      lastWorkingDay,
      exitReason,
      contractEndDate,
      noticePeriodEnd,
      noticeDate,
      exitData: exitDataFromBody,
    } = parsed.data;

    // Use parsed exitData but also keep original body reference for exitData processing
    const bodyExitData = exitDataFromBody;

    // Vorgang pruefen
    const existing = await prisma.offboardingProcess.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Vorgang nicht gefunden" },
        { status: 404 }
      );
    }

    // Status-Uebergang validieren
    if (status) {
      const allowedTransitions = VALID_TRANSITIONS[existing.status];
      if (!allowedTransitions) {
        return NextResponse.json(
          {
            error: `Status "${existing.status}" kann nicht geändert werden`,
          },
          { status: 400 }
        );
      }
      if (!allowedTransitions.includes(status)) {
        return NextResponse.json(
          {
            error: `Ungültiger Status-Übergang: "${existing.status}" -> "${status}". Erlaubt: ${allowedTransitions.join(", ") || "keine"}`,
          },
          { status: 400 }
        );
      }
    }

    // Update-Daten zusammenbauen
    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (exitType) updateData.exitType = exitType;
    if (lastWorkingDay) updateData.lastWorkingDay = new Date(lastWorkingDay);
    if (exitReason !== undefined) updateData.exitReason = exitReason;
    if (contractEndDate)
      updateData.contractEndDate = new Date(contractEndDate);
    if (noticePeriodEnd)
      updateData.noticePeriodEnd = new Date(noticePeriodEnd);
    if (noticeDate) updateData.noticeDate = new Date(noticeDate);

    // Bei COMPLETED: completedAt setzen
    if (status === "COMPLETED") {
      updateData.completedAt = new Date();
    }

    // ExitData upsert (erstellen wenn nicht vorhanden)
    if (bodyExitData && typeof bodyExitData === "object") {
      const exitFields: Record<string, unknown> = {};
      const allowedExitFields: Record<string, string> = {
        remainingVacationDays: "float",
        vacationPayout: "float",
        overtimeHours: "float",
        overtimePayout: "float",
        severancePay: "string",
        certificateType: "string",
        certificateStatus: "string",
        svDeregistrationDone: "boolean",
        svDeregistrationDate: "date",
        employmentCertDone: "boolean",
        employmentCertDate: "date",
        nonCompeteClause: "boolean",
        knowledgeTransferPlan: "boolean",
        successorName: "string",
        handoverDocComplete: "boolean",
        employmentType: "string",
        tarifvertrag: "string",
        entgeltgruppe: "string",
        isBefristet: "boolean",
      };

      for (const [key, type] of Object.entries(allowedExitFields)) {
        const value = bodyExitData[key];
        if (value === undefined) continue;

        switch (type) {
          case "float":
            if (value !== null && typeof value === "number") {
              exitFields[key] = value;
            } else if (value === null) {
              exitFields[key] = null;
            }
            break;
          case "boolean":
            if (typeof value === "boolean") {
              exitFields[key] = value;
            }
            break;
          case "date":
            if (value !== null && value !== "") {
              exitFields[key] = new Date(value as string | number);
            } else if (value === null) {
              exitFields[key] = null;
            }
            break;
          case "string":
            if (value !== null) {
              exitFields[key] = String(value);
            } else {
              exitFields[key] = null;
            }
            break;
        }
      }

      // Abfindungsbetrag verschluesseln
      if (exitFields.severancePay && typeof exitFields.severancePay === "string") {
        exitFields.severancePay = encrypt(exitFields.severancePay as string);
      }

      if (Object.keys(exitFields).length > 0) {
        await prisma.offboardingExitData.upsert({
          where: { offboardingId: id },
          create: {
            offboardingId: id,
            ...exitFields,
          },
          update: exitFields,
        });
      }
    }

    const updated = await prisma.offboardingProcess.update({
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
    if (exitType) auditDetails.exitType = exitType;
    if (lastWorkingDay) auditDetails.lastWorkingDay = lastWorkingDay;
    if (exitReason !== undefined) auditDetails.exitReason = exitReason;
    if (contractEndDate) auditDetails.contractEndDate = contractEndDate;
    if (noticePeriodEnd) auditDetails.noticePeriodEnd = noticePeriodEnd;
    if (noticeDate) auditDetails.noticeDate = noticeDate;

    await prisma.auditLog.create({
      data: {
        offboardingId: id,
        userId: session.userId,
        processType: "OFFBOARDING",
        action: status ? "STATUS_CHANGED" : "OFFBOARDING_UPDATED",
        details: auditDetails as Record<string, string>,
      },
    });

    // Webhook bei COMPLETED
    if (status === "COMPLETED") {
      await triggerWebhooks("offboarding-completed", {
        offboardingId: updated.id,
        displayId: updated.displayId,
        employeeEmail: updated.employeeEmail,
        employeeName: `${updated.employeeFirstName} ${updated.employeeLastName}`,
        organization: updated.organization.name,
        mandantNumber: updated.organization.mandantNumber,
        completedAt: updated.completedAt?.toISOString(),
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Fehler beim Aktualisieren des Offboarding-Vorgangs:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
