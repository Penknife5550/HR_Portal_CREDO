/**
 * API: /api/elternzeit/[id]/leiter-link
 *
 * POST – Magic Link an die Einrichtungsleitung versenden, um den
 *        Elternzeit-Antrag zu bestaetigen / abzulehnen (Phase-2-Workflow).
 *
 * Voraussetzung: ANTRAG_VORL_EINGEREICHT (Mitarbeiter hat Antrag eingereicht).
 * Mandanten-Default für Empfaenger wird vorgeschlagen.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { HR_EDIT_ROLES, canAccessProcess } from "@/lib/permissions";
import { triggerWebhooks } from "@/lib/webhooks";
import { hashToken } from "@/lib/token-hash";

const schema = z.object({
  recipientEmail: z.string().email(),
  recipientName: z.string().max(200).optional(),
});

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
    const parsed = schema.safeParse(body);
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
        leiterTokenEndgUsedAt: true,
        leiterGenehmigungAm: true,
        employeeFirstName: true,
        employeeLastName: true,
        organization: { select: { ezTokenValidityDays: true, name: true } },
      },
    });

    if (!ez) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (!(await canAccessProcess(session, ez.organizationId))) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (ez.status !== "ANTRAG_VORL_EINGEREICHT") {
      return NextResponse.json(
        {
          error:
            "Leitungs-Genehmigung erst nach Antragseingang moeglich",
        },
        { status: 409 },
      );
    }
    if (ez.leiterTokenEndgUsedAt || ez.leiterGenehmigungAm) {
      return NextResponse.json(
        { error: "Leitungs-Genehmigung wurde bereits abgegeben" },
        { status: 400 },
      );
    }

    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      null;

    const validityDays = ez.organization?.ezTokenValidityDays ?? 14;
    const token = randomUUID();
    const tokenHash = hashToken(token);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + validityDays);

    await prisma.elternzeitProzess.update({
      where: { id },
      data: {
        leiterTokenEndg: tokenHash,
        leiterTokenEndgExpiry: expiresAt,
        einrichtungsleiterEmail: parsed.data.recipientEmail,
        einrichtungsleiterName: parsed.data.recipientName || null,
      },
    });

    await prisma.auditLog.create({
      data: {
        elternzeitId: id,
        userId: session.userId,
        processType: "ELTERNZEIT",
        action: "LEITER_LINK_GENERATED",
        details: {
          recipientEmail: parsed.data.recipientEmail,
          recipientName: parsed.data.recipientName || null,
          expiresAt: expiresAt.toISOString(),
        },
        ipAddress,
      },
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const magicUrl = `${baseUrl}/elternzeit-leiter/${token}`;

    triggerWebhooks("elternzeit-leiter-link-versandt", {
      elternzeitId: id,
      displayId: ez.displayId,
      recipientEmail: parsed.data.recipientEmail,
      recipientName:
        parsed.data.recipientName ||
        `${ez.employeeFirstName} ${ez.employeeLastName}`,
      organizationName: ez.organization.name,
      magicUrl,
      expiresAt: expiresAt.toISOString(),
    }).catch((err) =>
      console.error(
        "[elternzeit-leiter-link-versandt] Webhook-Fehler:",
        err instanceof Error ? err.message : err,
      ),
    );

    return NextResponse.json({
      data: { token, magicUrl, expiresAt: expiresAt.toISOString() },
    });
  } catch (error) {
    console.error("[API] leiter-link POST fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
