/**
 * API: /api/exit-interview/[token]/submit
 *
 * POST - Exit-Interview endgültig einreichen
 *
 * OEFFENTLICH - kein Auth erforderlich!
 * Zugang ausschliesslich über gueltigen Magic-Link-Token.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { tokenRateLimiter, getClientIp } from "@/lib/rate-limit";

// =============================================
// POST /api/exit-interview/[token]/submit
// =============================================
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    // Rate Limiting
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
    });

    if (!exitInterview) {
      return NextResponse.json({ error: "Ungültiger Link" }, { status: 404 });
    }

    if (exitInterview.tokenExpiresAt < new Date()) {
      return NextResponse.json({ error: "Link ist abgelaufen" }, { status: 410 });
    }

    if (exitInterview.status === "SUBMITTED") {
      return NextResponse.json({ error: "Exit-Interview wurde bereits eingereicht" }, { status: 400 });
    }

    if (exitInterview.status !== "IN_PROGRESS" && exitInterview.status !== "INVITED") {
      return NextResponse.json({ error: "Exit-Interview kann nicht eingereicht werden" }, { status: 400 });
    }

    // DSGVO-Zustimmung pruefen
    if (!exitInterview.dsgvoAccepted) {
      return NextResponse.json(
        { error: "Die DSGVO-Einwilligung muss vor dem Einreichen erteilt werden" },
        { status: 400 }
      );
    }

    // Status auf SUBMITTED setzen
    await prisma.exitInterview.update({
      where: { id: exitInterview.id },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
      },
    });

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("[API] Exit-Interview einreichen fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
