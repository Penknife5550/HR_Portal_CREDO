/**
 * API: /api/auth/setup  (OEFFENTLICH, Setup-Link fuer externe BEM-Beauftragte, E7)
 *
 * GET  – Prueft, ob ein Setup-Token gueltig ist (fuer die Anzeige des Formulars).
 *        Leakt keine fremden Daten — der Aufrufer besitzt bereits den Token.
 * POST – Setzt das selbstgewaehlte Passwort und entwertet den Token (single-use).
 *
 * Token liegt in der DB nur als SHA-256-Hash (passwortSetupTokenHash).
 */

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/token-hash";
import { tokenRateLimiter, getClientIp } from "@/lib/rate-limit";
import { validatePasswordPolicy } from "@/lib/passwort-setup";

async function findByToken(token: string) {
  if (!token || typeof token !== "string" || token.length > 200) return null;
  const tokenHash = hashToken(token);
  const user = await prisma.user.findFirst({
    // Setup-Tokens sind ausschliesslich fuer externe BEM-Beauftragte gueltig —
    // verhindert, dass ein (versehentlich) am falschen Konto haengender Token
    // ein anderes/hoeher privilegiertes Konto uebernimmt.
    where: { passwortSetupTokenHash: tokenHash, role: "BEM_BEAUFTRAGTER" },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      isActive: true,
      passwortSetupExpiresAt: true,
    },
  });
  if (!user) return null;
  if (!user.passwortSetupExpiresAt || user.passwortSetupExpiresAt.getTime() < Date.now()) {
    return null; // abgelaufen
  }
  return user;
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (!tokenRateLimiter.check(ip).allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }
  const token = new URL(request.url).searchParams.get("token") || "";
  const user = await findByToken(token);
  if (!user) {
    return NextResponse.json({ valid: false });
  }
  return NextResponse.json({ valid: true, email: user.email });
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (!tokenRateLimiter.check(ip).allowed) {
      return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    const token: string = body?.token ?? "";
    const password: unknown = body?.password;

    const pwErrors = validatePasswordPolicy(password);
    if (pwErrors.length > 0) {
      return NextResponse.json({ error: pwErrors.join(", ") }, { status: 400 });
    }

    const user = await findByToken(token);
    if (!user) {
      return NextResponse.json(
        { error: "Der Link ist ungültig oder abgelaufen. Bitte fordern Sie einen neuen an." },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(password as string, 12);

    // Single-Use race-frei: nur setzen, solange der Token-Hash noch passt.
    const upd = await prisma.user.updateMany({
      where: { id: user.id, passwortSetupTokenHash: hashToken(token) },
      data: {
        passwordHash,
        isActive: true,
        passwortSetupTokenHash: null,
        passwortSetupExpiresAt: null,
      },
    });
    if (upd.count === 0) {
      return NextResponse.json(
        { error: "Der Link wurde bereits verwendet." },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API] Passwort-Setup fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
