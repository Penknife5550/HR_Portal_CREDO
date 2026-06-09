/**
 * API: POST /api/bem/[id]/einwilligung/resend
 *
 * Versendet einen einzelnen Einwilligungs-Link je Art erneut (HR-Aktion).
 * Nur verfahrensfuehrende Rollen (canMutateBemContent). Nutzt den zentralen
 * Versand-Helfer (Magic-Link, CREDO-CI, SMTP-direkt, Nachweis + Audit).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canMutateBemContent } from "@/lib/permissions";
import { einwilligungResendSchema } from "@/lib/validations/bem";
import { sendBemEinwilligungLink } from "@/lib/bem-einladung";

function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    const { id } = await context.params;
    if (!(await canMutateBemContent(session, id))) {
      return NextResponse.json({ error: "Fall nicht gefunden" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = einwilligungResendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    const fall = await prisma.bemFall.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        displayId: true,
        organizationId: true,
        schwerbehindert: true,
        employeeFirstName: true,
        employeeLastName: true,
        employeeEmail: true,
        organization: {
          select: {
            ezTokenValidityDays: true,
            hatBetriebsrat: true,
            hatSchwerbehindertenvertretung: true,
          },
        },
      },
    });
    if (!fall) {
      return NextResponse.json({ error: "Fall nicht gefunden" }, { status: 404 });
    }

    // Nur in einwilligungs-aktiven Zustaenden versenden (kein Versand fuer
    // abgelehnte/abgebrochene/abgeschlossene/aufzubewahrende Faelle).
    if (fall.status !== "EINLADUNG_VERSENDET" && fall.status !== "EINWILLIGUNG_ERTEILT") {
      return NextResponse.json(
        { error: "In diesem Fall-Status kann kein Einwilligungs-Link versendet werden." },
        { status: 409 },
      );
    }
    // Gremien-Zulaessigkeit: BR nur bei vorhandenem BR; SBV nur bei vorhandener
    // SBV UND Schwerbehinderung.
    const art = parsed.data.art;
    if (art === "BR" && !fall.organization?.hatBetriebsrat) {
      return NextResponse.json(
        { error: "Für diesen Mandanten ist kein Betriebsrat hinterlegt." },
        { status: 400 },
      );
    }
    if (art === "SBV" && !(fall.organization?.hatSchwerbehindertenvertretung && fall.schwerbehindert)) {
      return NextResponse.json(
        { error: "SBV-Beteiligung ist hier nicht vorgesehen (keine SBV bzw. nicht schwerbehindert)." },
        { status: 400 },
      );
    }

    const recipient = parsed.data.email || fall.employeeEmail;
    if (!recipient) {
      return NextResponse.json(
        { error: "Keine Empfänger-E-Mail hinterlegt. Bitte E-Mail angeben." },
        { status: 400 },
      );
    }

    const baseUrl =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      request.nextUrl.origin;

    const result = await sendBemEinwilligungLink({
      fall: {
        id: fall.id,
        displayId: fall.displayId,
        organizationId: fall.organizationId,
        employeeFirstName: fall.employeeFirstName,
        employeeLastName: fall.employeeLastName,
      },
      art: parsed.data.art,
      recipient,
      baseUrl,
      gueltigkeitstage: fall.organization.ezTokenValidityDays || 30,
      gesendetById: session.userId,
      ipAddress: clientIp(request),
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: `E-Mail konnte nicht versendet werden: ${result.error}`, magicUrl: result.magicUrl },
        { status: 502 },
      );
    }
    return NextResponse.json({ data: { sent: true, empfaenger: recipient, art: parsed.data.art } });
  } catch (error) {
    console.error("[API] BEM Einwilligung Resend fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
