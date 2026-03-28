/**
 * API: /api/civil-service-application/[token]/submit
 *
 * POST - LK reicht den Antrag auf Verbeamtung final ein
 *
 * OEFFENTLICH - kein Auth erforderlich!
 * Zugang ausschliesslich ueber gueltigen Magic-Link-Token.
 *
 * Prueft alle 12 Voraussetzungen. Kriterien die von der SL/Beirat/Amtsarzt
 * abhaengen werden als "wird spaeter geprueft" markiert und blockieren
 * die Einreichung nicht.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { tokenRateLimiter, getClientIp } from "@/lib/rate-limit";

// Die 12 Voraussetzungen und welche die LK selbst pruefen kann
const SELF_CHECKABLE_CRITERIA = [
  "hasUnlimitedContract",
  "intendedLongTermStay",
  "workloadPercent",
  "activeCommunityMembership",
  "vebsSeminarCompleted",
  "statusErfueller",
  "subjectCombination",
  "foerdervereinMember",
] as const;

const EXTERNAL_CRITERIA = [
  "dienstlicheBeurteilung",    // SL prueft
  "biblischeIntegration",      // SL beurteilt
  "empfehlungSchulleitung",    // SL erteilt
  "amtsaerztlicheUntersuchung", // nach Beiratsentscheidung
] as const;

// =============================================
// POST /api/civil-service-application/[token]/submit
// =============================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    // Rate Limiting
    const clientIp = getClientIp(request);
    const rlCheck = tokenRateLimiter.check(clientIp);
    if (!rlCheck.allowed) {
      return NextResponse.json(
        { error: "Zu viele Anfragen. Bitte warten Sie." },
        { status: 429 }
      );
    }

    const { token } = await params;

    // Prozess per applicationToken laden
    const process = await prisma.civilServiceProcess.findFirst({
      where: { applicationToken: token },
      select: {
        id: true,
        displayId: true,
        status: true,
        applicationTokenExpiresAt: true,
        applicationSubmittedAt: true,
        applicationData: true,
        prerequisites: true,
      },
    });

    if (!process) {
      return NextResponse.json({ error: "Ungueltiger Link" }, { status: 404 });
    }

    if (process.applicationTokenExpiresAt && process.applicationTokenExpiresAt < new Date()) {
      return NextResponse.json({ error: "Link ist abgelaufen" }, { status: 410 });
    }

    if (process.applicationSubmittedAt) {
      return NextResponse.json(
        { error: "Dieser Antrag wurde bereits eingereicht" },
        { status: 410 }
      );
    }

    // Voraussetzungen pruefen
    const prerequisites = process.prerequisites as Record<string, unknown> | null;
    if (!prerequisites) {
      return NextResponse.json(
        { error: "Bitte fuellen Sie zuerst alle Voraussetzungen aus." },
        { status: 400 }
      );
    }

    // Pruefen ob alle selbst-pruefbaren Kriterien erfuellt sind
    const missing: string[] = [];
    const criteriaResults: Record<string, { met: boolean; value: unknown; type: string }> = {};

    for (const key of SELF_CHECKABLE_CRITERIA) {
      const value = prerequisites[key];
      let met = false;

      switch (key) {
        case "hasUnlimitedContract":
        case "intendedLongTermStay":
        case "activeCommunityMembership":
        case "vebsSeminarCompleted":
        case "statusErfueller":
        case "foerdervereinMember":
          met = value === true;
          break;
        case "workloadPercent":
          met = typeof value === "number" && value >= 75;
          break;
        case "subjectCombination":
          met = typeof value === "string" && value.trim().length > 0;
          break;
      }

      criteriaResults[key] = { met, value, type: "self" };
      if (!met) {
        missing.push(key);
      }
    }

    // Externe Kriterien als "wird spaeter geprueft" markieren
    for (const key of EXTERNAL_CRITERIA) {
      criteriaResults[key] = { met: false, value: null, type: "external" };
    }

    // Wenn selbst-pruefbare Kriterien fehlen: nicht einreichen
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: `Es fehlen noch ${missing.length} Voraussetzung(en). Bitte ueberpruefen Sie Ihre Angaben.`,
          missingCriteria: missing,
          criteriaResults,
        },
        { status: 400 }
      );
    }

    // Alles OK: Antrag einreichen
    const now = new Date();

    await prisma.civilServiceProcess.update({
      where: { id: process.id },
      data: {
        applicationSubmittedAt: now,
        // Status nur von DRAFT auf PREREQUISITES_CHECK setzen
        ...(process.status === "DRAFT"
          ? {
              status: "PREREQUISITES_CHECK",
              currentStep: 2,
            }
          : {}),
      },
    });

    // Audit-Log schreiben
    await prisma.auditLog.create({
      data: {
        action: "APPLICATION_SUBMITTED",
        processType: "CIVIL_SERVICE",
        details: {
          displayId: process.displayId,
          criteriaResults: criteriaResults as unknown as Record<string, string>,
          selfCheckableMet: SELF_CHECKABLE_CRITERIA.length,
          externalPending: EXTERNAL_CRITERIA.length,
          submittedAt: now.toISOString(),
        },
        civilServiceId: process.id,
      },
    });

    return NextResponse.json({
      data: {
        success: true,
        criteriaResults,
        selfCheckableMet: SELF_CHECKABLE_CRITERIA.length,
        externalPending: EXTERNAL_CRITERIA.length,
      },
    });
  } catch (error) {
    console.error("[API] Civil-Service Application einreichen fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
