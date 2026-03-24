/**
 * API: /api/settings/smtp/test
 *
 * POST – Test-E-Mail versenden um SMTP-Verbindung zu pruefen
 *
 * Berechtigung: SUPER_ADMIN, HR_LEITUNG
 * Body: { testEmail: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { testSmtpConnection } from "@/lib/mailer";
import { getSession } from "@/lib/auth";
import { isValidEmail } from "@/lib/constants";

const ALLOWED_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.role)) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });

    const body = await request.json();
    const { testEmail } = body;

    if (!testEmail || !isValidEmail(testEmail)) {
      return NextResponse.json(
        { error: "Bitte eine gueltige Test-E-Mail-Adresse angeben" },
        { status: 400 }
      );
    }

    const result = await testSmtpConnection(testEmail);
    return NextResponse.json(result, { status: result.success ? 200 : 422 });
  } catch (error) {
    console.error("[API] SMTP-Test fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
