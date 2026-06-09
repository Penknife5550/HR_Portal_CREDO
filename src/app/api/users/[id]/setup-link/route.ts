/**
 * API: POST /api/users/[id]/setup-link
 *
 * Erzeugt fuer eine:n externe:n BEM-Beauftragte:n (Rolle BEM_BEAUFTRAGTER) einen
 * neuen Passwort-Setup-Link und versendet ihn per E-Mail. Nur SUPER_ADMIN /
 * HR_LEITUNG. Ein evtl. vorhandener alter Token wird ueberschrieben (entwertet).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  generateSetupToken,
  buildSetupEmail,
} from "@/lib/passwort-setup";
import { sendEmailDetailed } from "@/lib/mailer";
import { tokenRateLimiter, getClientIp } from "@/lib/rate-limit";

const ALLOWED_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!ALLOWED_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }
    // Rate-Limit gegen Mail-Spam / Token-Churn (pro IP + pro Ziel-Konto).
    const ip = getClientIp(request);
    if (!tokenRateLimiter.check(`setup-resend:${ip}`).allowed) {
      return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
    }
    if (!process.env.APP_URL) {
      return NextResponse.json(
        { error: "APP_URL ist nicht konfiguriert (fuer den Setup-Link erforderlich)" },
        { status: 400 },
      );
    }

    const { id } = await context.params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Benutzer nicht gefunden" }, { status: 404 });
    }
    if (user.role !== "BEM_BEAUFTRAGTER") {
      return NextResponse.json(
        { error: "Setup-Links gibt es nur für externe BEM-Beauftragte." },
        { status: 400 },
      );
    }

    const setup = generateSetupToken();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwortSetupTokenHash: setup.tokenHash,
        passwortSetupExpiresAt: setup.expiresAt,
      },
    });

    const mail = buildSetupEmail({
      firstName: user.firstName,
      lastName: user.lastName,
      token: setup.token,
    });
    const res = await sendEmailDetailed({
      to: user.email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    if (!res.ok) {
      console.error("[API] Setup-Link-Mail fehlgeschlagen:", res.error);
      return NextResponse.json(
        { error: "Der Setup-Link konnte nicht versendet werden (SMTP)." },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API] Setup-Link POST fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
