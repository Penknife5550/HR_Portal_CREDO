/**
 * API: /api/elternzeit/[id]/antrag-link-endg
 *
 * POST – Magic Link Token 2 generieren (endgueltiger Antrag).
 *        Token gueltig nach Mandanten-Konfiguration (default 30 Tage),
 *        Single-Use (antragTokenEndgUsedAt).
 *
 * Voraussetzung: Vorgang ist mindestens VORLAEUFIG_GENEHMIGT.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { HR_EDIT_ROLES, canAccessProcess } from "@/lib/permissions";
import { generateAntragLinkEndgSchema } from "@/lib/validations/elternzeit";
import { triggerWebhooks } from "@/lib/webhooks";
import { syncElternzeitFristen } from "@/lib/elternzeit-fristen";
import { hashToken } from "@/lib/token-hash";

const ALLOWED_STATUSES = [
  "VORLAEUFIG_GENEHMIGT",
  "ANTRAG_ENDG_VERSANDT",
] as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!HR_EDIT_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = generateAntragLinkEndgSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    const ez = await prisma.elternzeitProzess.findUnique({
      where: { id },
      select: {
        id: true,
        displayId: true,
        status: true,
        organizationId: true,
        antragEndgAm: true,
        antragTokenEndgUsedAt: true,
        employeeFirstName: true,
        employeeLastName: true,
        organization: { select: { ezTokenValidityDays: true } },
      },
    });

    if (!ez) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (!(await canAccessProcess(session, ez.organizationId))) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (!ALLOWED_STATUSES.includes(ez.status as (typeof ALLOWED_STATUSES)[number])) {
      return NextResponse.json(
        {
          error:
            "Endgueltiger Antrag erst nach vorlaeufiger Genehmigung moeglich",
        },
        { status: 409 },
      );
    }
    if (ez.antragEndgAm || ez.antragTokenEndgUsedAt) {
      return NextResponse.json(
        { error: "Der endgueltige Antrag wurde bereits eingereicht" },
        { status: 400 },
      );
    }

    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      null;

    const validityDays = ez.organization?.ezTokenValidityDays ?? 30;
    const token = randomUUID();
    const tokenHash = hashToken(token);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + validityDays);

    await prisma.elternzeitProzess.update({
      where: { id },
      data: {
        antragTokenEndg: tokenHash,
        antragTokenEndgExpiry: expiresAt,
        status: "ANTRAG_ENDG_VERSANDT",
      },
    });

    await prisma.auditLog.create({
      data: {
        elternzeitId: id,
        userId: session.userId,
        processType: "ELTERNZEIT",
        action: "ANTRAG_LINK_ENDG_GENERATED",
        details: {
          recipientEmail: parsed.data.recipientEmail,
          recipientName: parsed.data.recipientName || null,
          expiresAt: expiresAt.toISOString(),
          validityDays,
        },
        ipAddress,
      },
    });

    await syncElternzeitFristen(id).catch((err) =>
      console.error(
        `[syncElternzeitFristen] Fehler nach antrag-link-endg ${id}:`,
        err instanceof Error ? err.message : err,
      ),
    );

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const magicUrl = `${baseUrl}/elternzeit-antrag-endg/${token}`;

    triggerWebhooks("elternzeit-antrag-link-versandt", {
      elternzeitId: id,
      displayId: ez.displayId,
      antragTyp: "endgueltig",
      recipientEmail: parsed.data.recipientEmail,
      recipientName:
        parsed.data.recipientName ||
        `${ez.employeeFirstName} ${ez.employeeLastName}`,
      magicUrl,
      expiresAt: expiresAt.toISOString(),
    }).catch((err) =>
      console.error(
        "[elternzeit-antrag-link-endg] Webhook-Fehler:",
        err instanceof Error ? err.message : err,
      ),
    );

    return NextResponse.json({
      data: {
        token,
        magicUrl,
        expiresAt: expiresAt.toISOString(),
        recipientEmail: parsed.data.recipientEmail,
        recipientName:
          parsed.data.recipientName ||
          `${ez.employeeFirstName} ${ez.employeeLastName}`,
      },
    });
  } catch (error) {
    console.error("[API] antrag-link-endg POST fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
