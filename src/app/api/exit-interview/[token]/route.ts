/**
 * API: /api/exit-interview/[token]
 *
 * GET - Token validieren und Umfragedaten laden
 * PUT - Antworten speichern (Zwischenspeichern moeglich)
 *
 * OEFFENTLICH - kein Auth erforderlich!
 * Zugang ausschliesslich ueber gueltigen Magic-Link-Token.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { tokenRateLimiter, getClientIp } from "@/lib/rate-limit";

// =============================================
// GET /api/exit-interview/[token]
// =============================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    // Rate Limiting gegen Token-Enumeration
    const clientIp = getClientIp(_request);
    const rlCheck = tokenRateLimiter.check(clientIp);
    if (!rlCheck.allowed) {
      return NextResponse.json(
        { error: "Zu viele Anfragen. Bitte warten Sie." },
        { status: 429 }
      );
    }

    const { token } = await params;

    // Exit-Interview per Token laden
    const exitInterview = await prisma.exitInterview.findUnique({
      where: { token },
      include: {
        responses: true,
        offboarding: {
          select: {
            employeeFirstName: true,
            organization: {
              select: { name: true },
            },
          },
        },
      },
    });

    if (!exitInterview) {
      return NextResponse.json({ error: "Ungueltiger Link" }, { status: 404 });
    }

    if (exitInterview.tokenExpiresAt < new Date()) {
      return NextResponse.json({ error: "Link ist abgelaufen" }, { status: 410 });
    }

    if (exitInterview.status !== "INVITED" && exitInterview.status !== "IN_PROGRESS") {
      if (exitInterview.status === "SUBMITTED") {
        return NextResponse.json({ error: "Exit-Interview wurde bereits abgeschlossen" }, { status: 400 });
      }
      if (exitInterview.status === "SCHEDULED") {
        return NextResponse.json({ error: "Exit-Interview wurde noch nicht freigeschaltet" }, { status: 403 });
      }
      return NextResponse.json({ error: "Exit-Interview ist nicht verfuegbar" }, { status: 400 });
    }

    // Tracking: firstOpenedAt, lastOpenedAt, openCount
    const now = new Date();
    await prisma.exitInterview.update({
      where: { id: exitInterview.id },
      data: {
        firstOpenedAt: exitInterview.firstOpenedAt ?? now,
        lastOpenedAt: now,
        openCount: { increment: 1 },
        // Status auf IN_PROGRESS setzen, wenn noch INVITED
        ...(exitInterview.status === "INVITED" ? { status: "IN_PROGRESS" } : {}),
      },
    });

    return NextResponse.json({
      data: {
        templateSnapshot: exitInterview.templateSnapshot,
        responses: exitInterview.responses,
        employeeFirstName: exitInterview.offboarding.employeeFirstName,
        organizationName: exitInterview.offboarding.organization.name,
        dsgvoAccepted: exitInterview.dsgvoAccepted,
      },
    });
  } catch (error) {
    console.error("[API] Exit-Interview laden fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// =============================================
// PUT /api/exit-interview/[token]
// =============================================
export async function PUT(
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

    // Exit-Interview per Token laden
    const exitInterview = await prisma.exitInterview.findUnique({
      where: { token },
    });

    if (!exitInterview) {
      return NextResponse.json({ error: "Ungueltiger Link" }, { status: 404 });
    }

    if (exitInterview.tokenExpiresAt < new Date()) {
      return NextResponse.json({ error: "Link ist abgelaufen" }, { status: 410 });
    }

    if (exitInterview.status !== "INVITED" && exitInterview.status !== "IN_PROGRESS") {
      return NextResponse.json({ error: "Exit-Interview kann nicht mehr bearbeitet werden" }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Ungueltiger Request-Body" }, { status: 400 });
    }

    const { responses, dsgvoAccepted } = body as {
      responses?: Array<{
        snapshotQuestionId: string;
        ratingValue?: number | null;
        textValue?: string | null;
        choiceValues?: unknown | null;
        singleChoiceValue?: string | null;
      }>;
      dsgvoAccepted?: boolean;
    };

    // Antworten upserten
    if (responses && Array.isArray(responses)) {
      for (const resp of responses) {
        if (!resp.snapshotQuestionId) continue;

        await prisma.exitInterviewResponse.upsert({
          where: {
            exitInterviewId_snapshotQuestionId: {
              exitInterviewId: exitInterview.id,
              snapshotQuestionId: resp.snapshotQuestionId,
            },
          },
          create: {
            exitInterviewId: exitInterview.id,
            snapshotQuestionId: resp.snapshotQuestionId,
            ratingValue: resp.ratingValue ?? null,
            textValue: resp.textValue ?? null,
            choiceValues: resp.choiceValues ?? undefined,
            singleChoiceValue: resp.singleChoiceValue ?? null,
          },
          update: {
            ratingValue: resp.ratingValue ?? null,
            textValue: resp.textValue ?? null,
            choiceValues: resp.choiceValues ?? undefined,
            singleChoiceValue: resp.singleChoiceValue ?? null,
          },
        });
      }
    }

    // DSGVO-Zustimmung setzen
    const updateData: Record<string, unknown> = {};
    if (dsgvoAccepted === true && !exitInterview.dsgvoAccepted) {
      updateData.dsgvoAccepted = true;
      updateData.dsgvoAcceptedAt = new Date();
    }

    // Status auf IN_PROGRESS setzen falls noch INVITED
    if (exitInterview.status === "INVITED") {
      updateData.status = "IN_PROGRESS";
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.exitInterview.update({
        where: { id: exitInterview.id },
        data: updateData,
      });
    }

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("[API] Exit-Interview Antworten speichern fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
