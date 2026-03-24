/**
 * API: /api/settings/webhooks/[id]/test
 *
 * POST – Einen Test-Request an den Webhook senden
 *
 * Berechtigung: SUPER_ADMIN, HR_LEITUNG
 */

import { NextRequest, NextResponse } from "next/server";
import { testWebhook } from "@/lib/webhooks";
import { getSession } from "@/lib/auth";

const ALLOWED_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.role)) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });

    const { id } = await params;
    const result = await testWebhook(id);

    return NextResponse.json(result, { status: result.success ? 200 : 422 });
  } catch (error) {
    console.error("[API] Webhook-Test fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
