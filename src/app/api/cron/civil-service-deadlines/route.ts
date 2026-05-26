/**
 * API: /api/cron/civil-service-deadlines
 *
 * POST – Tägliche Fristenprüfung für Verbeamtungsvorgänge
 *
 * Wird täglich von n8n per Cron-Workflow aufgerufen.
 * Sicherheit: Authentifizierung über CRON_SECRET Bearer-Token.
 *
 * Prüft:
 * A. Amtsarzt-Gültigkeit (60/30/0 Tage)
 * B. Unterrichtsbesuch-Fristen (9/11/12/30/33 Monate)
 * C. RV-Befreiungsfrist (3 Monate nach Probezeit-Beginn)
 * D. BR-Genehmigung (8 Wochen nach Antrag)
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { triggerWebhooks } from "@/lib/webhooks";
import { formatEmployeeName } from "@/lib/format";

const MS_PER_DAY = 86400000;

/** Timing-Safe String-Vergleich (verhindert Timing-Attacken auf CRON_SECRET) */
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

type Severity = "WARNING" | "URGENT" | "OVERDUE";

interface DeadlineWarning {
  processId: string;
  displayId: string;
  employeeName: string;
  type: string;
  severity: Severity;
  message: string;
  dueDate: string;
}

/** Monate zu einem Datum addieren */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/** Wochen zu einem Datum addieren */
function addWeeks(date: Date, weeks: number): Date {
  return new Date(date.getTime() + weeks * 7 * MS_PER_DAY);
}

export async function POST(request: NextRequest) {
  // ── Auth-Check ──
  const authHeader = request.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET nicht konfiguriert" },
      { status: 500 }
    );
  }

  const expected = `Bearer ${cronSecret}`;
  if (!timingSafeCompare(authHeader, expected)) {
    return NextResponse.json(
      { error: "Nicht autorisiert" },
      { status: 401 }
    );
  }

  const now = new Date();
  const warnings: DeadlineWarning[] = [];
  let processed = 0;

  try {
    // ══════════════════════════════════════════
    // A. Amtsarzt-Gültigkeit
    // ══════════════════════════════════════════
    const amtsarztDocs = await prisma.civilServiceDocument.findMany({
      where: {
        documentType: { in: ["AMTSARZT_PROBE", "AMTSARZT_LEBENSZEIT"] },
        status: "UPLOADED",
        expiresAt: { not: null },
      },
      include: {
        process: {
          select: {
            id: true,
            displayId: true,
            employeeFirstName: true,
            employeeLastName: true,
          },
        },
      },
    });

    for (const doc of amtsarztDocs) {
      processed++;
      const expiresAt = doc.expiresAt!;
      const employeeName = formatEmployeeName(doc.process);
      const daysUntilExpiry = (expiresAt.getTime() - now.getTime()) / MS_PER_DAY;

      if (daysUntilExpiry < 0) {
        // Abgelaufen → Status auf EXPIRED setzen
        await prisma.civilServiceDocument.update({
          where: { id: doc.id },
          data: { status: "EXPIRED" },
        });
        warnings.push({
          processId: doc.process.id,
          displayId: doc.process.displayId,
          employeeName,
          type: "AMTSARZT_EXPIRED",
          severity: "OVERDUE",
          message: `Amtsarzt-Attest (${doc.documentType}) ist abgelaufen seit ${Math.abs(Math.floor(daysUntilExpiry))} Tagen.`,
          dueDate: expiresAt.toISOString(),
        });
      } else if (daysUntilExpiry < 30) {
        warnings.push({
          processId: doc.process.id,
          displayId: doc.process.displayId,
          employeeName,
          type: "AMTSARZT_EXPIRING",
          severity: "URGENT",
          message: `Amtsarzt-Attest (${doc.documentType}) läuft in ${Math.floor(daysUntilExpiry)} Tagen ab.`,
          dueDate: expiresAt.toISOString(),
        });
      } else if (daysUntilExpiry < 60) {
        warnings.push({
          processId: doc.process.id,
          displayId: doc.process.displayId,
          employeeName,
          type: "AMTSARZT_EXPIRING",
          severity: "WARNING",
          message: `Amtsarzt-Attest (${doc.documentType}) läuft in ${Math.floor(daysUntilExpiry)} Tagen ab.`,
          dueDate: expiresAt.toISOString(),
        });
      }
    }

    // ══════════════════════════════════════════
    // B. Unterrichtsbesuch-Fristen
    // ══════════════════════════════════════════
    const probationProcesses = await prisma.civilServiceProcess.findMany({
      where: {
        status: "PROBATION",
        probationStartDate: { not: null },
      },
      include: {
        assessments: {
          select: {
            assessmentNumber: true,
            submittedAt: true,
          },
        },
      },
    });

    for (const proc of probationProcesses) {
      processed++;
      const startDate = proc.probationStartDate!;
      const employeeName = formatEmployeeName(proc);

      // 2. Beurteilung (T+9 bis T+12)
      const hasSecondAssessment = proc.assessments.some(
        (a) => a.assessmentNumber === 2 && a.submittedAt !== null
      );

      if (!hasSecondAssessment) {
        const t12 = addMonths(startDate, 12);
        const t11 = addMonths(startDate, 11);
        const t9 = addMonths(startDate, 9);

        if (now >= t12) {
          warnings.push({
            processId: proc.id,
            displayId: proc.displayId,
            employeeName,
            type: "ASSESSMENT_2_MISSING",
            severity: "OVERDUE",
            message: "2. Beurteilung überfällig (T+12 Monate überschritten).",
            dueDate: t12.toISOString(),
          });
        } else if (now >= t11) {
          warnings.push({
            processId: proc.id,
            displayId: proc.displayId,
            employeeName,
            type: "ASSESSMENT_2_MISSING",
            severity: "URGENT",
            message: "2. Beurteilung dringend fällig (T+11 Monate erreicht).",
            dueDate: t12.toISOString(),
          });
        } else if (now >= t9) {
          warnings.push({
            processId: proc.id,
            displayId: proc.displayId,
            employeeName,
            type: "ASSESSMENT_2_MISSING",
            severity: "WARNING",
            message: "2. Beurteilung steht an (T+9 Monate erreicht).",
            dueDate: t12.toISOString(),
          });
        }
      }

      // 3. Beurteilung (T+30 bis T+33)
      const hasThirdAssessment = proc.assessments.some(
        (a) => a.assessmentNumber === 3 && a.submittedAt !== null
      );

      if (!hasThirdAssessment) {
        const t33 = addMonths(startDate, 33);
        const t30 = addMonths(startDate, 30);

        if (now >= t33) {
          warnings.push({
            processId: proc.id,
            displayId: proc.displayId,
            employeeName,
            type: "ASSESSMENT_3_MISSING",
            severity: "URGENT",
            message: "3. Beurteilung dringend fällig (T+33 Monate erreicht).",
            dueDate: t33.toISOString(),
          });
        } else if (now >= t30) {
          warnings.push({
            processId: proc.id,
            displayId: proc.displayId,
            employeeName,
            type: "ASSESSMENT_3_MISSING",
            severity: "WARNING",
            message: "3. Beurteilung steht an (T+30 Monate erreicht).",
            dueDate: t33.toISOString(),
          });
        }
      }
    }

    // ══════════════════════════════════════════
    // C. RV-Befreiungsfrist (3 Monate nach Probezeitbeginn)
    // ══════════════════════════════════════════
    const rvProcesses = await prisma.civilServiceProcess.findMany({
      where: {
        probationStartDate: { not: null },
        status: { notIn: ["COMPLETED", "REJECTED", "CANCELLED", "DRAFT"] },
      },
      include: {
        documents: {
          where: {
            documentType: "RV_BEFREIUNGSANTRAG",
            status: "UPLOADED",
          },
          select: { id: true },
        },
      },
    });

    for (const proc of rvProcesses) {
      const startDate = proc.probationStartDate!;
      const deadline = addMonths(startDate, 3);

      if (now > deadline && proc.documents.length === 0) {
        processed++;
        const employeeName = formatEmployeeName(proc);
        warnings.push({
          processId: proc.id,
          displayId: proc.displayId,
          employeeName,
          type: "RV_BEFREIUNG_MISSING",
          severity: "OVERDUE",
          message: `RV-Befreiungsantrag überfällig. Frist war ${deadline.toLocaleDateString("de-DE")}.`,
          dueDate: deadline.toISOString(),
        });
      }
    }

    // ══════════════════════════════════════════
    // D. BR-Genehmigung (8 Wochen nach Antrag)
    // ══════════════════════════════════════════
    const brAntraege = await prisma.civilServiceDocument.findMany({
      where: {
        documentType: "BR_ANTRAG_PROBE",
        status: "UPLOADED",
        uploadedAt: { not: null },
      },
      include: {
        process: {
          select: {
            id: true,
            displayId: true,
            employeeFirstName: true,
            employeeLastName: true,
            documents: {
              where: {
                documentType: "BR_GENEHMIGUNG_PROBE",
                status: { in: ["UPLOADED", "APPROVED"] },
              },
              select: { id: true },
            },
          },
        },
      },
    });

    for (const antrag of brAntraege) {
      // Prüfen ob bereits eine BR_GENEHMIGUNG_PROBE vorhanden ist
      if (antrag.process.documents.length > 0) continue;

      const sentDate = antrag.uploadedAt!;
      const deadline = addWeeks(sentDate, 8);

      if (now > deadline) {
        processed++;
        const employeeName = formatEmployeeName(antrag.process);
        warnings.push({
          processId: antrag.process.id,
          displayId: antrag.process.displayId,
          employeeName,
          type: "BR_GENEHMIGUNG_MISSING",
          severity: "OVERDUE",
          message: `BR-Genehmigung überfällig. BR-Antrag eingereicht am ${sentDate.toLocaleDateString("de-DE")}, 8-Wochen-Frist abgelaufen.`,
          dueDate: deadline.toISOString(),
        });
      }
    }

    // ══════════════════════════════════════════
    // Checklist-Items: isOverdue aktualisieren
    // ══════════════════════════════════════════
    await prisma.civilServiceChecklistItem.updateMany({
      where: {
        isCompleted: false,
        dueDate: { lt: now },
        isOverdue: false,
      },
      data: { isOverdue: true },
    });

    // ══════════════════════════════════════════
    // Webhook: Sammelmail an HR (eine Mail pro Lauf)
    // ══════════════════════════════════════════
    if (warnings.length > 0) {
      // Severities in einem einzigen Pass aggregieren (statt 3x .filter().length)
      const bySeverity = warnings.reduce(
        (acc, w) => {
          acc[w.severity] += 1;
          return acc;
        },
        { OVERDUE: 0, URGENT: 0, WARNING: 0 } as Record<Severity, number>
      );
      // Höchste Severity bestimmen (für Banner-Farbe in der Mail)
      const topSeverity: Severity =
        bySeverity.OVERDUE > 0
          ? "OVERDUE"
          : bySeverity.URGENT > 0
            ? "URGENT"
            : "WARNING";

      const MAX_WARNINGS_PER_MAIL = 50;
      const includedWarnings = warnings.slice(0, MAX_WARNINGS_PER_MAIL);
      const omittedCount = Math.max(0, warnings.length - MAX_WARNINGS_PER_MAIL);

      // Fire-and-forget: triggerWebhooks wirft nie, blockiert Cron-Response nicht.
      triggerWebhooks("psi-deadline-warning", {
        timestamp: now.toISOString(),
        totalWarnings: warnings.length,
        shownWarnings: includedWarnings.length,
        truncated: omittedCount > 0,
        omittedCount,
        bySeverity,
        topSeverity,
        warnings: includedWarnings,
      }).catch((err) =>
        console.error("[psi-deadline-warning] Webhook-Fehler:", err instanceof Error ? err.message : err)
      );
    }

    return NextResponse.json({
      warnings,
      processed,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("[Civil-Service-Deadlines] Schwerer Fehler:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
