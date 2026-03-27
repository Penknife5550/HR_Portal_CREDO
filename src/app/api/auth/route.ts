/**
 * API: /api/auth
 *
 * GET    – Session-Refresh (erneuert Cookie bei gültiger Session)
 * POST   – HR-Login (E-Mail + Passwort)
 * DELETE  – Logout
 */

import { NextRequest, NextResponse } from "next/server";
import {
  authenticateUser,
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
  getSession,
} from "@/lib/auth";
import {
  loginRateLimiter,
  loginEmailRateLimiter,
  getClientIp,
} from "@/lib/rate-limit";

// GET /api/auth – Session-Refresh (erneuert Cookie wenn Session gültig)
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }
    // Neuen Token erstellen und Cookie erneuern
    const token = createSessionToken(session);
    await setSessionCookie(token);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// POST /api/auth – Login
export async function POST(request: NextRequest) {
  try {
    // Rate Limiting per IP
    const clientIp = getClientIp(request);
    const ipCheck = loginRateLimiter.check(clientIp);
    if (!ipCheck.allowed) {
      return NextResponse.json(
        { error: "Zu viele Anmeldeversuche. Bitte warten Sie einen Moment." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((ipCheck.retryAfterMs || 60000) / 1000)),
          },
        }
      );
    }

    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "E-Mail und Passwort sind Pflichtfelder" },
        { status: 400 }
      );
    }

    // HashDoS-Schutz: Laengenbegrenzung vor bcrypt-Verarbeitung
    if (typeof password !== "string" || password.length > 256) {
      return NextResponse.json(
        { error: "Ungueltige Anmeldedaten" },
        { status: 400 }
      );
    }
    if (typeof email !== "string" || email.length > 254) {
      return NextResponse.json(
        { error: "Ungueltige Anmeldedaten" },
        { status: 400 }
      );
    }

    // Rate Limiting per E-Mail (schuetzt gegen Brute-Force auf einzelnen Account)
    const normalizedEmail = String(email).trim().toLowerCase();
    const emailCheck = loginEmailRateLimiter.check(normalizedEmail);
    if (!emailCheck.allowed) {
      return NextResponse.json(
        { error: "Zu viele Anmeldeversuche fuer dieses Konto. Bitte warten Sie." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((emailCheck.retryAfterMs || 60000) / 1000)),
          },
        }
      );
    }

    const session = await authenticateUser(normalizedEmail, password);
    if (!session) {
      return NextResponse.json(
        { error: "Ungueltige Anmeldedaten" },
        { status: 401 }
      );
    }

    const token = createSessionToken(session);
    await setSessionCookie(token);

    return NextResponse.json({
      user: {
        email: session.email,
        firstName: session.firstName,
        lastName: session.lastName,
        role: session.role,
      },
    });
  } catch (error) {
    console.error("Login-Fehler:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// DELETE /api/auth – Logout
export async function DELETE() {
  await clearSessionCookie();
  return NextResponse.json({ success: true });
}
