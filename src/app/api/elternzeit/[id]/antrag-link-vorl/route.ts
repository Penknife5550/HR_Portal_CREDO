/**
 * API: /api/elternzeit/[id]/antrag-link-vorl
 *
 * POST – Magic Link Token 1 generieren (vorläufiger Antrag).
 *        Token gueltig 30 Tage, Single-Use (antragTokenVorlUsedAt).
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { HR_EDIT_ROLES, canAccessProcess } from "@/lib/permissions";
import { generateAntragLinkSchema } from "@/lib/validations/elternzeit";
import { triggerWebhooks } from "@/lib/webhooks";
import { syncElternzeitFristen } from "@/lib/elternzeit-fristen";
import { hashToken } from "@/lib/token-hash";

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
    const parsed = generateAntragLinkSchema.safeParse(body);
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
        organizationId: true,
        antragVorlAm: true,
        antragTokenVorlUsedAt: true,
        employeeFirstName: true,
        employeeLastName: true,
      },
    });

    if (!ez) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    // IDOR-Schutz: Mandant-Scope pruefen
    if (!(await canAccessProcess(session, ez.organizationId))) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (ez.antragVorlAm || ez.antragTokenVorlUsedAt) {
      return NextResponse.json(
        { error: "Der vorläufige Antrag wurde bereits eingereicht" },
        { status: 400 },
      );
    }

    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      null;

    // Token (UUID, 30 Tage gueltig). Klartext nur in der Magic-URL,
    // in der DB liegt nur der SHA-256-Hash (siehe lib/token-hash.ts).
    const token = randomUUID();
    const tokenHash = hashToken(token);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await prisma.elternzeitProzess.update({
      where: { id },
      data: {
        antragTokenVorl: tokenHash,
        antragTokenVorlExpiry: expiresAt,
        status: "ANTRAG_VORL_VERSANDT",
      },
    });

    await prisma.auditLog.create({
      data: {
        elternzeitId: id,
        userId: session.userId,
        processType: "ELTERNZEIT",
        action: "ANTRAG_LINK_VORL_GENERATED",
        details: {
          recipientEmail: parsed.data.recipientEmail,
          recipientName: parsed.data.recipientName || null,
          expiresAt: expiresAt.toISOString(),
        },
        ipAddress,
      },
    });

    await syncElternzeitFristen(id).catch((err) =>
      console.error(
        `[syncElternzeitFristen] Fehler nach antrag-link-vorl ${id}:`,
        err instanceof Error ? err.message : err,
      ),
    );

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const magicUrl = `${baseUrl}/elternzeit-antrag/${token}`;

    triggerWebhooks("elternzeit-antrag-link-versandt", {
      elternzeitId: id,
      displayId: ez.displayId,
      antragTyp: "vorläufig",
      recipientEmail: parsed.data.recipientEmail,
      recipientName:
        parsed.data.recipientName || `${ez.employeeFirstName} ${ez.employeeLastName}`,
      magicUrl,
      expiresAt: expiresAt.toISOString(),
    }).catch((err) =>
      console.error(
        "[elternzeit-antrag-link-versandt] Webhook-Fehler:",
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
    console.error("[API] antrag-link-vorl POST fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
